// 批量脚本：给「中文名对照表」里的条目补 **Bangumi 评分**，存进 data/ratings.json。
//
// ─────────────────────────────────────────────────────────────
// 用法：
//
//   NODE_USE_ENV_PROXY=1 HTTPS_PROXY=http://127.0.0.1:7897 \
//     npm run fetch-ratings -- [--delay=MS] [--limit=N] [--force] [--refill-null]
//
// 参数：
//   --delay=MS      每条之间停多久，默认 500（Bangumi 没有明文的限额，跑慢一点稳）
//   --limit=N       只跑前 N 条（调试用）
//   --force         重跑已经在表里的条目（默认跳过它们）
//   --refill-null   只补「跑过但没拿到分」的（bangumi 为 null）——新番评分攒起来后用它
// ─────────────────────────────────────────────────────────────
//
// ⚠️ 跑之前必须先开代理，并且要通过环境变量告诉 Node 走代理——
//    Node 自带的 fetch 默认**不读**代理设置。
//
// 为什么离线抓、落文件：Bangumi 在国内被墙（线上更是访问不了），
// 而评分这种东西一天变不了几次。抓一次存下来，运行时零外网依赖（宪法铁律 6）。
//
// ─────────────────────────────────────────────────────────────
// 关于三个评分来源（2026-10-07 三期改版定稿口径 D3）：
//   · 本脚本负责 **Bangumi**（v0/subjects/{id} 的 rating.score，10 分制 ×10 → 0~100）
//   · **AniList** 的 averageScore 由 `scripts/build-collections.ts` 在取种子/补数据时
//     一并带上（那边本来就要出网，省一次全表扫描）——所以这里 anilist 一律写 null
//   · **AniTrendz** 无稳定接口：实测官网 /charts/ 返回 HTTP 403（反爬），
//     两个入口路径都是 404——接不上，字段留 null 不硬凑（不拿别处数据顶替）
//
// ⚠️ 这个脚本**只增不减**：表里已有的条目**永远不会被删掉**（同 fetch-title-zh 的纪律）。
//    「只增」的含义是跳过已存在的键，除非 --force / --refill-null。
// ─────────────────────────────────────────────────────────────

import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import type { BangumiIndex } from "../types/bangumi.ts";

/** 每条之间停一下。Bangumi 没有明文限额，取比 fetch-title-zh 更小的间隔（这里是纯 GET） */
const DEFAULT_DELAY_MS = 500;

/** 每处理这么多条就存一次盘（长跑必须的，见 fetch-title-zh 的同款注释） */
const CHECKPOINT_EVERY = 100;

/** 输入：中文名对照表（用它里面的 bangumi_id） */
const TITLE_ZH_PATH = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
  "data",
  "title-zh.json",
);

/** 输出：评分表。键是 AniList id，和 title-zh.json 同一套键 */
const OUTPUT_PATH = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
  "data",
  "ratings.json",
);

/**
 * 输出结构。三个来源各自归一 100 制；拿不到的留 null——**缺分不硬凑**
 * （不用 0 分填、不用别处均值填）。
 */
interface RatingEntry {
  /** AniList averageScore（本来就是 0~100）。本脚本不填，见文件头注释 */
  anilist: number | null;
  /** Bangumi rating.score（10 分制）× 10 → 0~100。没有评分时为 null */
  bangumi: number | null;
  /** AniTrendz。无稳定接口（403），一律 null，见文件头注释 */
  anitrendz: number | null;
}

type RatingsFile = Record<string, RatingEntry>;

interface Options {
  limit: number | null;
  force: boolean;
  refillNull: boolean;
  delayMs: number;
}

function parseArgs(argv: string[]): Options {
  const options: Options = { limit: null, force: false, refillNull: false, delayMs: DEFAULT_DELAY_MS };
  for (const arg of argv) {
    if (arg.startsWith("--limit=")) {
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
    } else if (arg === "--refill-null") {
      options.refillNull = true;
    } else {
      throw new Error(`不认识的参数：${arg}`);
    }
  }
  return options;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** 毫秒 → "3分12秒" */
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

/** 按键排序后写盘，保证每次生成的 JSON 顺序一致，diff 才看得懂 */
async function saveRatings(ratings: RatingsFile): Promise<void> {
  const sorted: RatingsFile = {};
  for (const key of Object.keys(ratings).sort((a, b) => Number(a) - Number(b))) {
    sorted[key] = ratings[key];
  }
  await mkdir(path.dirname(OUTPUT_PATH), { recursive: true });
  await writeFile(OUTPUT_PATH, `${JSON.stringify(sorted, null, 2)}\n`, "utf8");
}

/**
 * 取一个 Bangumi 条目的评分。没有评分（没人打分 / rating 缺失）返回 null。
 *
 * ⚠️ v0 API 对没评分的条目 rating.score 是 **0**——0 分不是"很差"，
 * 是"还没人打分"。直接 ×10 会得到一个假的 0 分，所以这里 <= 0 一律当没分。
 */
async function fetchBangumiScore(bangumiId: number): Promise<number | null> {
  const response = await fetch(`https://api.bgm.tv/v0/subjects/${bangumiId}`, {
    headers: {
      // v0 API 建议带上 UA 表明身份（不带也能过，但这是它的规矩）
      "User-Agent": "NanoAnime/0.1 (https://nanoanime.vercel.app)",
      Accept: "application/json",
    },
  });
  if (!response.ok) {
    throw new Error(`HTTP ${response.status}`);
  }
  const json = (await response.json()) as { rating?: { score?: number } };
  const score = json.rating?.score ?? 0;
  return score > 0 ? Math.round(score * 10) : null;
}

async function main(): Promise<void> {
  const options = parseArgs(process.argv.slice(2));
  console.log(
    `参数：limit=${options.limit ?? "(不限)"} delay=${options.delayMs}ms ` +
      `force=${options.force ? "是" : "否"} refill-null=${options.refillNull ? "是" : "否"}\n`,
  );

  const index = await readJsonSafe<BangumiIndex>(TITLE_ZH_PATH);
  if (!index) {
    throw new Error(`读不到 ${TITLE_ZH_PATH}——先跑 npm run fetch-title-zh`);
  }
  const entries = Object.entries(index).filter(([, item]) => item.bangumi_id);
  console.log(`中文名表里带 bangumi_id 的条目：${entries.length}`);

  // 先把已有的读进来当底子（只增不减：已有键默认跳过）
  const ratings = (await readJsonSafe<RatingsFile>(OUTPUT_PATH)) ?? {};
  const existingCount = Object.keys(ratings).length;
  console.log(`评分表里已有 ${existingCount} 条`);

  let pending = options.force
    ? entries
    : options.refillNull
      ? entries.filter(([id]) => ratings[id] && ratings[id].bangumi === null)
      : entries.filter(([id]) => !ratings[id]);
  if (options.limit) {
    pending = pending.slice(0, options.limit);
  }
  const skipped = entries.length - pending.length;
  console.log(`待处理 ${pending.length} 条${skipped > 0 ? `（跳过 ${skipped} 条）` : ""}\n`);
  if (pending.length === 0) {
    console.log("没有要处理的，收工。");
    return;
  }

  const startedAt = Date.now();
  let hit = 0;
  let noScore = 0;
  let failed = 0;
  let sinceCheckpoint = 0;

  for (let i = 0; i < pending.length; i++) {
    const [anilistId, item] = pending[i];
    try {
      const score = await fetchBangumiScore(item.bangumi_id!);
      // anilist 一律 null（由 build-collections 在出网时带上，见文件头注释）；
      // 已有条目重跑（--force）时保留原有的 anilist 值，别把别人填的抹掉
      ratings[anilistId] = {
        anilist: ratings[anilistId]?.anilist ?? null,
        bangumi: score,
        anitrendz: null,
      };
      if (score === null) {
        noScore++;
      } else {
        hit++;
      }
    } catch (error) {
      failed++;
      // 失败的不写进表——下次重跑会自动补（这是"断点续跑"的关键）
      if (failed <= 5) {
        console.log(`   ✗ ${anilistId}（bgm ${item.bangumi_id}）：${error instanceof Error ? error.message : String(error)}`);
      }
    }

    sinceCheckpoint++;
    if (sinceCheckpoint >= CHECKPOINT_EVERY) {
      sinceCheckpoint = 0;
      await saveRatings(ratings);
      const elapsed = Date.now() - startedAt;
      const done = i + 1;
      const remain = (elapsed / done) * (pending.length - done);
      console.log(
        `── 已跑 ${done}/${pending.length}：有分 ${hit}，无分 ${noScore}，失败 ${failed}；` +
          `用时 ${formatDuration(elapsed)}，预计还剩 ${formatDuration(remain)}（已存盘）`,
      );
    }

    if (i < pending.length - 1) {
      await sleep(options.delayMs);
    }
  }

  await saveRatings(ratings);
  const finalCount = Object.keys(ratings).length;
  const withScore = Object.values(ratings).filter((entry) => entry.bangumi !== null).length;
  console.log(
    `\n本轮：有分 ${hit}，无分 ${noScore}，失败 ${failed}（共处理 ${pending.length} 条）`,
  );
  console.log(`评分表：${existingCount} 条 → ${finalCount} 条；其中有 Bangumi 分的 ${withScore} 条`);
  console.log(`用时 ${formatDuration(Date.now() - startedAt)}`);
  if (failed > 0) {
    console.log(`⚠️ 有 ${failed} 条请求失败——重跑一次会自动只补失败的`);
  }
  console.log(`已写入 ${OUTPUT_PATH}`);
}

await main();
