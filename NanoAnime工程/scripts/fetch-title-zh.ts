// 批量脚本：把番剧的中文名（和中文简介）从 Bangumi 补下来，存进 data/title-zh.json。
//
// ─────────────────────────────────────────────────────────────
// 用法（代理必开，见下）：
//
//   NODE_USE_ENV_PROXY=1 HTTPS_PROXY=http://127.0.0.1:7897 \
//     npm run fetch-title-zh -- --scope=top2000
//
// 参数：
//   --scope=season|top2000|catalog   跑哪些番。
//                                season（默认）= **本季全量**（形式过滤后的整季，
//                                 2026-10-06 M7 起；此前只取人气前 20），约 100 部、2 分钟
//                                top2000       = AniList 按人气排序前 2000 部
//                                catalog       = **全库**（2026-10-09 全年代扩容加）：
//                                  先跑 `npm run build-catalog` 生成全库快照
//                                  （data/.catalog-snapshot.json，约 2 万条），
//                                  本脚本逐条去 Bangumi 配中文名。6 并发约 40 分钟。
//   --limit=N                    只跑前 N 部（调试用；配合 --skip 可切片抽检）
//   --skip=N                     跳过前 N 部（切片抽检用：
//                                --skip=5000 --limit=200 抽待处理清单的第 5000~5199 部）
//   --force                      重跑已经在表里的条目（默认**跳过**它们）
//   --delay=MS                   每个并发 worker 两条请求之间停多久，默认 500
// ─────────────────────────────────────────────────────────────
//
// ⚠️ 跑之前必须先开代理，并且要通过环境变量告诉 Node 走代理——
//    Node 自带的 fetch 默认**不读**代理设置（实测裸跑会一直连不上直到超时）。
//
// 为什么要拆成"离线抓 + 存文件"而不是实时请求：Bangumi 在用户本机被墙，线上更是访问不了。
// 中文名这种几乎不变的数据，抓一次存下来就够了。
//
// 本脚本不是每次构建都跑。番剧表更新后想重新对齐，再跑一次即可。
//
// ─────────────────────────────────────────────────────────────
// ⚠️ 2026-10-09 从串行改**并发池**（6 个 worker 抢任务）：
//    同样走代理——curl 单条 0.3 秒，而 Node 走 NODE_USE_ENV_PROXY 的**串行**请求
//    被拖到 5 秒+/条。全库 2 万部按串行要跑一整天，6 并发实测每条 0.3~0.6 秒
//    （慢的是 Node 的代理路径，不是 Bangumi）。两个细节：
//    · `nextIndex++` 在单线程里是原子的，两个 worker 不会抢到同一条；
//    · checkpoint 的写盘用"进入即清零"——同一时刻最多一个 worker 在写盘。
//    ⚠️ 别再往上加并发数：Bangumi 没有明文限额，但也别拿它做压力测试。
//
// 除了中文名，本脚本还会给每条补一个 **AniList 人气值**（搜索排序用，
// 见 lib/local-match-rank.ts）。catalog 范围的人气值直接来自全库快照（不再多发请求）；
// season / top2000 范围的没有，收工时按批查一次补上。
//
// ⚠️ 这个脚本**只增不减**：表里已有的条目**永远不会被删掉**。
//
// 这条很要紧。反例：先跑了 top2000 攒下 1800 条，然后又跑一次默认的 season——
// 如果脚本是"用这一轮的结果覆盖整个文件"，那 1800 条当场全没。
// 所以做法是：读出现有文件当底子，只往里加，最后按键排序写回。
// ─────────────────────────────────────────────────────────────

import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  fetchAnimePopularityByIds,
  fetchPopularAnime,
  fetchSeasonAnime,
  getCurrentSeason,
} from "../lib/anilist.ts";
import { matchSubject, searchBangumi } from "../lib/bangumi.ts";
import type { Anime } from "../types/anime.ts";
import type { BangumiIndex } from "../types/bangumi.ts";

/**
 * 每个并发 worker 两条请求之间停多久。
 * 总速率 ≈ 并发数 ÷（间隔 + 单条耗时），6 × 500ms 实测约每秒 9 条（fetch-ratings 同款）。
 */
const DEFAULT_DELAY_MS = 500;

/** 并发 worker 数（2026-10-09 加，见文件头注释） */
const CONCURRENCY = 6;

/**
 * 每处理这么多条就存一次盘。
 *
 * ⚠️ 长跑必须的：全库一轮 40 分钟，要是最后才写文件，中途断了/崩了/被限流，
 * 前面几十分钟全白跑。每 250 条落一次盘（全库约 80 次），最坏只丢 250 条的进度。
 */
const CHECKPOINT_EVERY = 250;

/** 抽样日志最多留多少行（全库两万条全打出来没人看，留前 300 行抽检） */
const SAMPLE_LOG_MAX = 300;

/** 输入：中文名对照表（用它里面的 bangumi_id） */
const TITLE_ZH_PATH = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
  "data",
  "title-zh.json",
);

/** 输入：全库快照（build-catalog 生成，--scope=catalog 用） */
const SNAPSHOT_PATH = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
  "data",
  ".catalog-snapshot.json",
);

/** 输出文件。用脚本自身的位置推算，这样从哪个目录跑都一样 */
const OUTPUT_PATH = TITLE_ZH_PATH;

// ═══════════════════════════════════════════════════════════════════════
// 参数
// ═══════════════════════════════════════════════════════════════════════

type Scope = "season" | "top2000" | "catalog";

interface Options {
  scope: Scope;
  limit: number | null;
  skip: number;
  force: boolean;
  delayMs: number;
}

function parseArgs(argv: string[]): Options {
  const options: Options = {
    scope: "season",
    limit: null,
    skip: 0,
    force: false,
    delayMs: DEFAULT_DELAY_MS,
  };

  for (const arg of argv) {
    if (arg.startsWith("--scope=")) {
      const value = arg.slice("--scope=".length);
      if (value !== "season" && value !== "top2000" && value !== "catalog") {
        throw new Error(
          `--scope 只能是 season / top2000 / catalog，收到的是「${value}」`,
        );
      }
      options.scope = value;
    } else if (arg.startsWith("--limit=")) {
      const value = Number(arg.slice("--limit=".length));
      if (!Number.isInteger(value) || value <= 0) {
        throw new Error(`--limit 要写正整数，收到的是「${arg}」`);
      }
      options.limit = value;
    } else if (arg.startsWith("--skip=")) {
      const value = Number(arg.slice("--skip=".length));
      if (!Number.isInteger(value) || value < 0) {
        throw new Error(`--skip 要写非负整数，收到的是「${arg}」`);
      }
      options.skip = value;
    } else if (arg.startsWith("--delay=")) {
      const value = Number(arg.slice("--delay=".length));
      if (!Number.isFinite(value) || value < 0) {
        throw new Error(`--delay 要写非负数（毫秒），收到的是「${arg}」`);
      }
      options.delayMs = value;
    } else if (arg === "--force") {
      options.force = true;
    } else {
      throw new Error(`不认识的参数：${arg}`);
    }
  }

  return options;
}

// ═══════════════════════════════════════════════════════════════════════
// 工具
// ═══════════════════════════════════════════════════════════════════════

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** 终端里中日文是双宽字符，用 padEnd 对齐会歪——这里只求能看，不求对齐 */
function pad(text: string, width: number): string {
  return text.length >= width ? text : text + " ".repeat(width - text.length);
}

/** 毫秒 → "3分12秒" 这种能直接读的写法 */
function formatDuration(ms: number): string {
  const totalSeconds = Math.round(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return minutes > 0 ? `${minutes}分${seconds}秒` : `${seconds}秒`;
}

async function readJsonSafe<T>(filePath: string): Promise<T | null> {
  try {
    return JSON.parse(await readFile(filePath, "utf8")) as T;
  } catch {
    return null;
  }
}

// ═══════════════════════════════════════════════════════════════════════
// 取要处理的番剧列表
// ═══════════════════════════════════════════════════════════════════════

/** 一个待配对的番。三种范围（季 / 前2000 / 全库）归一成这个形状 */
interface TargetItem {
  id: number;
  title: { native: string | null; romaji: string | null; english: string | null };
  /** 首播年份。null = 没有年份，Bangumi 配不了（直接跳过，宁可漏配） */
  year: number | null;
  /** AniList 人气值。catalog 快照自带；season/top2000 为 null，收工时批量补 */
  popularity: number | null;
}

/** 全库快照的结构（build-catalog 生成；列顺序是契约，错了宁可报错） */
interface CatalogSnapshot {
  generatedAt: string;
  columns: string[];
  total: number;
  rows: [number, string | null, string | null, string | null, number | null, number | null, string | null][];
}

const SNAPSHOT_COLUMNS = ["id", "native", "romaji", "english", "year", "popularity", "country"];

/** Anime（AniList 原始形状）→ TargetItem */
function fromAnime(item: Anime): TargetItem {
  return {
    id: item.id,
    title: {
      native: item.title.native ?? null,
      romaji: item.title.romaji ?? null,
      english: item.title.english ?? null,
    },
    // 首播年份优先用 AniList 的首播日期；未定档的作品退回"本季年份"。
    // 无论用哪个，后面都要求和 Bangumi 的放送年份**严格相等**才认，所以不算瞎猜。
    year: item.startDate?.year ?? getCurrentSeason().seasonYear,
    popularity: null,
  };
}

async function loadTargets(options: Options): Promise<TargetItem[]> {
  if (options.scope === "catalog") {
    const snapshot = await readJsonSafe<CatalogSnapshot>(SNAPSHOT_PATH);
    if (!snapshot || !Array.isArray(snapshot.rows)) {
      throw new Error(`读不到全库快照（${SNAPSHOT_PATH}）——先跑 npm run build-catalog`);
    }
    // 列契约校验：顺手看生成时间，半截快照（扫描中途）也认，但提醒一句
    if (JSON.stringify(snapshot.columns) !== JSON.stringify(SNAPSHOT_COLUMNS)) {
      throw new Error(
        `快照列定义和本脚本不一致——build-catalog 与 fetch-title-zh 的列契约必须同源，先对齐再用`,
      );
    }
    const targets: TargetItem[] = snapshot.rows.map(
      ([id, native, romaji, english, year, popularity]) => ({
        id,
        title: { native, romaji, english },
        year,
        popularity,
      }),
    );
    console.log(`范围：全库快照 ${targets.length} 条（生成于 ${snapshot.generatedAt}）`);
    return targets;
  }

  if (options.scope === "season") {
    // M7 起本季 = 整季全量（fetchSeasonAnime 自己翻页取到空页为止，形式过滤后）
    const { anime } = await fetchSeasonAnime();
    console.log(`范围：本季（${getCurrentSeason().seasonYear} ${getCurrentSeason().season}）全量 ${anime.length} 部`);
    if (anime.length === 0) {
      throw new Error("AniList 没返回任何番剧，先检查网络再跑");
    }
    return anime.map(fromAnime);
  }

  // top2000：AniList 按人气排序（2000 条，没到 5000 的翻页上限，安全）
  const want = 2000;
  console.log(`范围：AniList 按人气排序，取前 ${want} 部`);
  const collected: Anime[] = [];
  const ANILIST_PAGE_SIZE = 50;
  let page = 1;
  while (collected.length < want) {
    const batch = await fetchPopularAnime(page, ANILIST_PAGE_SIZE);
    if (batch.length === 0) {
      console.log(`  第 ${page} 页空了，说明已经翻到底`);
      break;
    }
    collected.push(...batch);
    console.log(`  第 ${page} 页 +${batch.length}，累计 ${collected.length}`);
    page++;
    if (collected.length < want) {
      await sleep(700);
    }
  }
  return collected.slice(0, want).map(fromAnime);
}

// ═══════════════════════════════════════════════════════════════════════
// 读写那张表
// ═══════════════════════════════════════════════════════════════════════

/** 读现有成果。文件不存在或坏了都当空的——不能让这一轮的成果被一个坏文件搞没 */
async function readExistingIndex(): Promise<BangumiIndex> {
  try {
    const raw = await readFile(OUTPUT_PATH, "utf8");
    const parsed = JSON.parse(raw) as BangumiIndex;
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

/** 按键排序后写盘，保证每次生成的 JSON 顺序一致，diff 才看得懂 */
async function saveIndex(index: BangumiIndex): Promise<void> {
  const sorted: BangumiIndex = {};
  for (const key of Object.keys(index).sort((a, b) => Number(a) - Number(b))) {
    sorted[key] = index[key];
  }
  await mkdir(path.dirname(OUTPUT_PATH), { recursive: true });
  await writeFile(OUTPUT_PATH, `${JSON.stringify(sorted, null, 2)}\n`, "utf8");
}

/** 一次查多少个 id 的人气值。50 是 AniList 单页上限 */
const POPULARITY_BATCH_SIZE = 50;

/**
 * 给表里**还没有人气值**的条目补上（season / top2000 范围的收尾工作；
 * catalog 范围的人气值来自快照，这里自然无事可做）。
 *
 * 失败只记一笔、**不中断整轮** —— 人气值只影响排序，缺了不影响中文名本身。
 */
async function fillMissingPopularity(index: BangumiIndex): Promise<void> {
  const missing = Object.keys(index).filter((key) => typeof index[key].popularity !== "number");
  if (missing.length === 0) {
    return;
  }

  let filled = 0;
  let failed = 0;

  for (let i = 0; i < missing.length; i += POPULARITY_BATCH_SIZE) {
    const batch = missing.slice(i, i + POPULARITY_BATCH_SIZE);
    try {
      const popularity = await fetchAnimePopularityByIds(batch.map(Number));
      for (const key of batch) {
        const value = popularity.get(Number(key));
        if (typeof value === "number") {
          // 只覆盖 popularity 这一个键，bangumi_id / title_zh / summary 原样带过去
          index[key] = { ...index[key], popularity: value };
          filled++;
        }
      }
    } catch {
      failed += batch.length;
    }
    if (i + POPULARITY_BATCH_SIZE < missing.length) {
      await sleep(700);
    }
  }

  const tail = failed > 0 ? `，${failed} 条没取到（可稍后单独跑 npm run fetch-popularity）` : "";
  console.log(`   └ 顺带补了 ${filled} 条人气值（排序用）${tail}`);
}

// ═══════════════════════════════════════════════════════════════════════
// 主流程
// ═══════════════════════════════════════════════════════════════════════

async function main(): Promise<void> {
  const options = parseArgs(process.argv.slice(2));
  console.log(
    `参数：scope=${options.scope} limit=${options.limit ?? "(不限)"} skip=${options.skip} ` +
      `delay=${options.delayMs}ms force=${options.force ? "是" : "否"}\n`,
  );

  const targets = await loadTargets(options);

  // 先把已有的读进来当底子
  const index = await readExistingIndex();
  const existingCount = Object.keys(index).length;

  const notInIndex = targets.filter((item) => !index[String(item.id)]);
  const skippedExisting = targets.length - notInIndex.length;
  let pending = options.force ? targets : notInIndex;
  if (options.skip > 0) {
    pending = pending.slice(options.skip);
  }
  if (options.limit) {
    pending = pending.slice(0, options.limit);
  }
  console.log(
    `\n表里已有 ${existingCount} 条（这一轮只增不减）\n` +
      `目标 ${targets.length} 部，已在表里跳过 ${skippedExisting} 部；` +
      `本轮处理 ${pending.length} 部${options.skip > 0 ? `（从第 ${options.skip + 1} 部起）` : ""}\n`,
  );

  if (pending.length === 0) {
    console.log("没有要处理的，收工。");
    return;
  }

  const startedAt = Date.now();
  let matched = 0;
  let unmatched = 0;
  let failed = 0;
  let noKeyword = 0;
  let noYear = 0;
  let done = 0;
  let sinceCheckpoint = 0;
  let nextIndex = 0;
  const sampleLines: string[] = [];

  /**
   * 并发池：CONCURRENCY 个 worker 从 pending 里抢任务（nextIndex++ 在单线程里
   * 是原子的，不会抢到同一条）。checkpoint 的写盘用"进入即清零"的写法保证
   * 同一时刻最多一个 worker 在写（见循环内注释）。
   */
  const worker = async () => {
    for (;;) {
      const i = nextIndex++;
      if (i >= pending.length) {
        return;
      }
      const item = pending[i];
      let line = `${pad(String(item.id), 8)} ${pad(item.title.native ?? "(无日文原名)", 36)} ${pad(String(item.year ?? "—"), 6)}`;

      const keyword = item.title.native ?? item.title.romaji ?? item.title.english;

      if (!keyword) {
        noKeyword++;
        line += "— 跳过（AniList 三个名字全空，没法搜）";
      } else if (item.year === null) {
        noYear++;
        line += "— 跳过（没有放送年份，Bangumi 配不了）";
      } else {
        try {
          const candidates = await searchBangumi(keyword);
          // 三个名字都拿去比：有些番 Bangumi 直接用英文名登记
          const hit = matchSubject(
            [item.title.native, item.title.romaji, item.title.english],
            item.year,
            candidates,
          );
          if (hit) {
            // summary 一并落盘：详情页的简介优先用这个中文的，拿不到才退回 AniList 的英文。
            // 空串统一写成 null，和项目里「缺数据就是 null」的习惯保持一致
            const summary = hit.summary?.trim() || null;
            // popularity：catalog 快照自带，直接落盘；season/top2000 为 null，收工时批量补
            index[String(item.id)] = {
              bangumi_id: hit.id,
              title_zh: hit.name_cn,
              summary,
              popularity: item.popularity,
            };
            matched++;
            line += `→ ${hit.name_cn}   [bgm ${hit.id} / ${hit.date || "无日期"} / 简介 ${summary ? summary.length + " 字" : "无"}]`;
          } else {
            unmatched++;
            line += `— 未匹配（拿到 ${candidates.length} 条候选，没有标题和年份都对得上的）`;
          }
        } catch (error) {
          failed++;
          line += `— 请求失败：${error instanceof Error ? error.message : String(error)}`;
        }
      }

      if (sampleLines.length < SAMPLE_LOG_MAX) {
        sampleLines.push(line);
      }

      done++;
      sinceCheckpoint++;
      if (sinceCheckpoint >= CHECKPOINT_EVERY) {
        // 先清零再 await：并发的另一个 worker 即便同时走到这里，也会从 0 重新计，
        // 不会两个 worker 同时写同一个文件
        sinceCheckpoint = 0;
        await saveIndex(index);
        const elapsed = Date.now() - startedAt;
        const remain = (elapsed / done) * (pending.length - done);
        console.log(
          `── 已跑 ${done}/${pending.length}：匹配 ${matched}，未匹配 ${unmatched}，失败 ${failed}，` +
            `跳过（无名字 ${noKeyword} / 无年份 ${noYear}）；用时 ${formatDuration(elapsed)}，` +
            `预计还剩 ${formatDuration(remain)}（已存盘，表里 ${Object.keys(index).length} 条）`,
        );
      }

      await sleep(options.delayMs);
    }
  };

  await Promise.all(
    Array.from({ length: Math.min(CONCURRENCY, pending.length) }, () => worker()),
  );

  // 收尾：season / top2000 的人气值这里按批补（catalog 已在写盘时带上了）
  await fillMissingPopularity(index);
  await saveIndex(index);

  const finalCount = Object.keys(index).length;
  console.log(`\n本轮抽样（前 ${Math.min(sampleLines.length, SAMPLE_LOG_MAX)} 行）：`);
  console.log(sampleLines.join("\n"));
  console.log(
    `\n本轮：匹配 ${matched}，未匹配 ${unmatched}，失败 ${failed}，` +
      `跳过（无名字 ${noKeyword} / 无年份 ${noYear}）（共处理 ${pending.length} 部）`,
  );
  console.log(`表：${existingCount} 条 → ${finalCount} 条（新增 ${finalCount - existingCount}）`);
  console.log(`用时 ${formatDuration(Date.now() - startedAt)}`);
  if (failed > 0) {
    console.log(`⚠️ 有 ${failed} 部请求失败——重跑同一命令会自动跳过已配好的，只补失败的那些`);
  }
  console.log(`已写入 ${OUTPUT_PATH}`);
}

await main();
