// 批量脚本：把番剧的中文名（和中文简介）从 Bangumi 补下来，存进 data/title-zh.json。
//
// ─────────────────────────────────────────────────────────────
// 用法：
//
//   NODE_USE_ENV_PROXY=1 HTTPS_PROXY=http://127.0.0.1:7897 \
//     npm run fetch-title-zh -- --scope=top2000
//
// 参数：
//   --scope=season|top2000|all   跑哪些番。
//                                season（默认）= 本季 20 部，和以前一样
//                                top2000       = AniList 按人气排序前 2000 部
//                                all           = 全部（⚠️ 两万部以上，按 1 秒/部要跑 6 小时+）
//   --limit=N                    只跑前 N 部（调试用，免得每次都等 40 分钟）
//   --force                      重跑已经在表里的条目（默认**跳过**它们）
//   --delay=MS                   每部之间停多久，默认 1000
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
  fetchPopularAnime,
  fetchSeasonAnime,
  getCurrentSeason,
} from "../lib/anilist.ts";
import { matchSubject, searchBangumi } from "../lib/bangumi.ts";
import type { Anime } from "../types/anime.ts";
import type { BangumiIndex } from "../types/bangumi.ts";

/** 每部之间停一下。2000 次连打和 18 次不是一回事，放慢一倍更稳 */
const DEFAULT_DELAY_MS = 1000;

/** AniList 每页最多 50 条（接口上限） */
const ANILIST_PAGE_SIZE = 50;

/** AniList 翻页之间也停一下：它限流 30~90 次/分钟，40 次翻页不能一口气打完 */
const ANILIST_PAGE_DELAY_MS = 700;

/** 本季模式取多少部（保持原样） */
const SEASON_COUNT = 20;

/** top2000 模式取多少部 */
const TOP2000_COUNT = 2000;

/**
 * 每处理这么多部就存一次盘。
 *
 * ⚠️ 长跑必须的：一次跑 40 分钟，要是最后才写文件，中途断了/崩了/被限流，
 * 前面几十分钟全白跑。每 50 部落一次盘，最坏只丢 50 部的进度。
 */
const CHECKPOINT_EVERY = 50;

/** 输出文件。用脚本自身的位置推算，这样从哪个目录跑都一样 */
const OUTPUT_PATH = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
  "data",
  "title-zh.json",
);

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

// ═══════════════════════════════════════════════════════════════════════
// 参数
// ═══════════════════════════════════════════════════════════════════════

type Scope = "season" | "top2000" | "all";

interface Options {
  scope: Scope;
  limit: number | null;
  force: boolean;
  delayMs: number;
}

function parseArgs(argv: string[]): Options {
  const options: Options = {
    scope: "season",
    limit: null,
    force: false,
    delayMs: DEFAULT_DELAY_MS,
  };

  for (const arg of argv) {
    if (arg.startsWith("--scope=")) {
      const value = arg.slice("--scope=".length);
      if (value !== "season" && value !== "top2000" && value !== "all") {
        throw new Error(
          `--scope 只能是 season / top2000 / all，收到的是「${value}」`,
        );
      }
      options.scope = value;
    } else if (arg.startsWith("--limit=")) {
      const value = Number(arg.slice("--limit=".length));
      if (!Number.isInteger(value) || value <= 0) {
        throw new Error(`--limit 要写正整数，收到的是「${arg}」`);
      }
      options.limit = value;
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
// 取要处理的番剧列表
// ═══════════════════════════════════════════════════════════════════════

async function loadTargets(options: Options): Promise<Anime[]> {
  if (options.scope === "season") {
    const { season, seasonYear } = getCurrentSeason();
    const count = options.limit ?? SEASON_COUNT;
    console.log(`范围：本季（${seasonYear} ${season}），取 ${count} 部`);
    const { anime } = await fetchSeasonAnime(count);
    if (anime.length === 0) {
      throw new Error("AniList 没返回任何番剧，先检查网络再跑");
    }
    return anime;
  }

  const want =
    options.limit ??
    (options.scope === "top2000" ? TOP2000_COUNT : Number.POSITIVE_INFINITY);

  console.log(
    `范围：AniList 按人气排序${Number.isFinite(want) ? `，取前 ${want} 部` : "（全部，会跑很久）"}`,
  );

  const collected: Anime[] = [];
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
      await sleep(ANILIST_PAGE_DELAY_MS);
    }
  }

  return collected.slice(0, want);
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

// ═══════════════════════════════════════════════════════════════════════
// 主流程
// ═══════════════════════════════════════════════════════════════════════

async function main(): Promise<void> {
  const options = parseArgs(process.argv.slice(2));
  console.log(
    `参数：scope=${options.scope} limit=${options.limit ?? "(不限)"} ` +
      `delay=${options.delayMs}ms force=${options.force ? "是" : "否"}\n`,
  );

  const targets = await loadTargets(options);

  // 先把已有的读进来当底子
  const index = await readExistingIndex();
  const existingCount = Object.keys(index).length;
  console.log(`\n表里已有 ${existingCount} 条（这一轮只增不减）`);

  const pending = options.force
    ? targets
    : targets.filter((item) => !index[String(item.id)]);
  const skipped = targets.length - pending.length;
  console.log(
    `待处理 ${pending.length} 部${skipped > 0 ? `（跳过已在表里的 ${skipped} 部）` : ""}\n`,
  );

  if (pending.length === 0) {
    console.log("没有要处理的，收工。");
    return;
  }

  const startedAt = Date.now();
  let matched = 0;
  let unmatched = 0;
  let failed = 0;
  let sinceCheckpoint = 0;
  const rows: string[] = [];

  for (let i = 0; i < pending.length; i++) {
    const item = pending[i];
    // 搜 Bangumi 的关键词：优先日文原名（Bangumi 以日文登记为主），没有才退到罗马音/英文名
    const keyword = item.title.native ?? item.title.romaji ?? item.title.english;
    // 首播年份优先用 AniList 的首播日期；未定档的作品退回"本季年份"。
    // 无论用哪个，后面都要求和 Bangumi 的放送年份**严格相等**才认，所以不算瞎猜。
    const year = item.startDate?.year ?? getCurrentSeason().seasonYear;

    let line = `${pad(String(i + 1), 4)}/${pending.length} ${pad(item.title.native ?? "(无日文原名)", 34)} ${pad(String(year), 6)}`;

    if (!keyword) {
      line += "— 跳过（AniList 三个名字全空，没法搜）";
      rows.push(line);
      continue;
    }

    try {
      const candidates = await searchBangumi(keyword);
      // 三个名字都拿去比：有些番 Bangumi 直接用英文名登记
      const hit = matchSubject(
        [item.title.native, item.title.romaji, item.title.english],
        year,
        candidates,
      );
      if (hit) {
        // summary 一并落盘：详情页的简介优先用这个中文的，拿不到才退回 AniList 的英文。
        // 空串统一写成 null，和项目里「缺数据就是 null」的习惯保持一致
        const summary = hit.summary?.trim() || null;
        index[String(item.id)] = { bangumi_id: hit.id, title_zh: hit.name_cn, summary };
        matched++;
        line += `${hit.name_cn}   [bgm ${hit.id} / ${hit.date || "无日期"} / 简介 ${summary ? summary.length + " 字" : "无"}]`;
      } else {
        unmatched++;
        line += `— 未匹配（拿到 ${candidates.length} 条候选，没有标题和年份都对得上的）`;
      }
    } catch (error) {
      failed++;
      line += `— 请求失败：${error instanceof Error ? error.message : String(error)}`;
    }

    rows.push(line);

    sinceCheckpoint++;
    if (sinceCheckpoint >= CHECKPOINT_EVERY) {
      sinceCheckpoint = 0;
      await saveIndex(index);
      const elapsed = Date.now() - startedAt;
      const done = i + 1;
      const remain = (elapsed / done) * (pending.length - done);
      console.log(
        `── 已跑 ${done}/${pending.length}，匹配 ${matched}，未匹配 ${unmatched}，失败 ${failed}；` +
          `用时 ${formatDuration(elapsed)}，预计还剩 ${formatDuration(remain)}；已存盘（表里 ${Object.keys(index).length} 条）`,
      );
    }

    if (i < pending.length - 1) {
      await sleep(options.delayMs);
    }
  }

  console.log("\n" + rows.join("\n"));

  await saveIndex(index);

  const finalCount = Object.keys(index).length;
  console.log(
    `\n本轮：匹配 ${matched}，未匹配 ${unmatched}，失败 ${failed}（共处理 ${pending.length} 部）`,
  );
  console.log(
    `表：${existingCount} 条 → ${finalCount} 条（新增 ${finalCount - existingCount}）`,
  );
  console.log(`用时 ${formatDuration(Date.now() - startedAt)}`);
  if (failed > 0) {
    console.log(`⚠️ 有 ${failed} 部请求失败——重跑一次会自动跳过已配好的，只补失败的那些`);
  }
  console.log(`已写入 ${OUTPUT_PATH}`);
}

await main();
