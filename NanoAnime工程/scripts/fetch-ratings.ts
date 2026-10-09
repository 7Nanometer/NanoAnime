// 批量脚本：给「中文名对照表」里的条目补 **Bangumi 评分**，存进 data/ratings.json。
//
// ─────────────────────────────────────────────────────────────
// 用法：
//
//   NODE_USE_ENV_PROXY=1 HTTPS_PROXY=http://127.0.0.1:7897 \
//     npm run fetch-ratings -- [--delay=MS] [--limit=N] [--force] [--refill-null] [--refill-rank]
//
// 参数：
//   --delay=MS      每条之间停多久，默认 500（Bangumi 没有明文的限额，跑慢一点稳）
//   --limit=N       只跑前 N 条（调试用）
//   --force         重跑已经在表里的条目（默认跳过它们）
//   --refill-null   只补「跑过但没拿到分」的（bangumi 为 null）——新番评分攒起来后用它
//   --refill-rank   只补「还没抓过排名」的（rank 为空）——2026-10-09 全站改 Bangumi 评分、
//                   详情页要显示排名时，用它给老数据补 rank 键
// ─────────────────────────────────────────────────────────────
//
// ⚠️ 跑之前必须先开代理，并且要通过环境变量告诉 Node 走代理——
//    Node 自带的 fetch 默认**不读**代理设置。
//
// 为什么离线抓、落文件：Bangumi 在国内被墙（线上更是访问不了），
// 而评分这种东西一天变不了几次。抓一次存下来，运行时零外网依赖（宪法铁律 6）。
//
// ─────────────────────────────────────────────────────────────
// 关于三个评分来源（2026-10-07 三期口径修正后：
// **高分合集只看 Bangumi**，anilist / anitrendz 字段保留为历史数据、不再被排序读取）：
//   · 本脚本负责 **Bangumi**（v0/subjects/{id} 的 rating.score，10 分制 ×10 → 0~100）
//   · **AniList** 的 averageScore 由 `scripts/build-collections.ts` 在取种子/补数据时
//     一并带上（那边本来就要出网，省一次全表扫描）——所以这里 anilist 一律写 null
//   · **AniTrendz** 无稳定接口：实测官网 /charts/ 返回 HTTP 403（反爬），
//     两个入口路径都是 404——接不上，字段留 null 不硬凑（不拿别处数据顶替）
//
// ⚠️ 本脚本只处理**中文名对照表里已有的条目**。高分合集池内「对照表里没有」的作品，
//    由 `scripts/build-collections.ts --probe` 先按标题配对补进对照表、顺手补上评分
//    （补抓的条目一样落在本文件维护的 ratings.json 里，bangumi 字段照常填）。
//
// ⚠️ 这个脚本**只增不减**：表里已有的条目**永远不会被删掉**（同 fetch-title-zh 的纪律）。
//    「只增」的含义是跳过已存在的键，除非 --force / --refill-null。
// ─────────────────────────────────────────────────────────────

import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { fetchBangumiRatingDetail } from "../lib/bangumi.ts";
import type { BangumiIndex, RatingsIndex } from "../types/bangumi.ts";

/**
 * 每个并发 worker 两条请求之间停多久。
 * 总速率 ≈ 并发数 ÷（间隔 + 单条耗时），见主循环顶部的大注释。
 */
const DEFAULT_DELAY_MS = 500;

/**
 * 并发 worker 数（2026-10-09 加）。
 *
 * ⚠️ 为什么从串行改成并发：实测同样走代理——curl 单条 0.3 秒，而 Node 走
 * NODE_USE_ENV_PROXY 的**串行**请求被拖到 5 秒+/条（1909 条要跑 3 小时）；
 * 8 并发实测全部 0.3~0.57 秒返回、后续请求也无惩罚——**慢的是 Node 的代理
 * 路径，不是 Bangumi**。6 是留余量的选择（稳态约每秒 6 条，全表约 6 分钟）。
 * ⚠️ 别再往上加：Bangumi 没有明文限额，但也别拿它做压力测试。
 */
const CONCURRENCY = 6;

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
 * 输出结构 = types/bangumi.ts 的 RatingsIndex（键是 AniList id）。
 * 三个来源各自归一 100 制；拿不到的留 null——**缺分不硬凑**
 * （不用 0 分填、不用别处均值填）。rank 是 2026-10-09 加的第二项数据。
 */

interface Options {
  limit: number | null;
  force: boolean;
  refillNull: boolean;
  refillRank: boolean;
  delayMs: number;
}

function parseArgs(argv: string[]): Options {
  const options: Options = {
    limit: null,
    force: false,
    refillNull: false,
    refillRank: false,
    delayMs: DEFAULT_DELAY_MS,
  };
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
    } else if (arg === "--refill-rank") {
      options.refillRank = true;
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
async function saveRatings(ratings: RatingsIndex): Promise<void> {
  const sorted: RatingsIndex = {};
  for (const key of Object.keys(ratings).sort((a, b) => Number(a) - Number(b))) {
    sorted[key] = ratings[key];
  }
  await mkdir(path.dirname(OUTPUT_PATH), { recursive: true });
  await writeFile(OUTPUT_PATH, `${JSON.stringify(sorted, null, 2)}\n`, "utf8");
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
  const ratings = (await readJsonSafe<RatingsIndex>(OUTPUT_PATH)) ?? {};
  const existingCount = Object.keys(ratings).length;
  console.log(`评分表里已有 ${existingCount} 条`);

  let pending = options.force
    ? entries
    : options.refillRank
      ? entries.filter(([id]) => ratings[id] && ratings[id].rank == null)
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
  let done = 0;
  let sinceCheckpoint = 0;
  let nextIndex = 0;

  /**
   * 并发池：CONCURRENCY 个 worker 从 pending 里抢任务（nextIndex++ 在单线程里
   * 是原子的，不会抢到同一条）。checkpoint 的写盘用"进入即清零"的写法保证
   * 同一时刻最多一个 worker 在写（见循环内注释）。
   */
  const worker = async () => {
    for (;;) {
      const index = nextIndex++;
      if (index >= pending.length) {
        return;
      }
      const [anilistId, item] = pending[index];

      try {
        const detail = await fetchBangumiRatingDetail(item.bangumi_id!);
        // anilist 一律 null（由 build-collections 在出网时带上，见文件头注释）；
        // 已有条目重跑（--force / --refill-rank）时保留原有的 anilist 值，别把别人填的抹掉
        ratings[anilistId] = {
          anilist: ratings[anilistId]?.anilist ?? null,
          bangumi: detail.score,
          rank: detail.rank,
          anitrendz: null,
        };
        if (detail.score === null) {
          noScore++;
        } else {
          hit++;
        }
      } catch (error) {
        failed++;
        // 失败的不写进表——下次重跑会自动补（这是"断点续跑"的关键）
        if (failed <= 5) {
          console.log(
            `   ✗ ${anilistId}（bgm ${item.bangumi_id}）：${error instanceof Error ? error.message : String(error)}`,
          );
        }
      }

      done++;
      sinceCheckpoint++;
      if (sinceCheckpoint >= CHECKPOINT_EVERY) {
        // 先清零再 await：并发的另一个 worker 即便同时走到这里，也会从 0 重新计，
        // 不会两个 worker 同时写同一个文件
        sinceCheckpoint = 0;
        await saveRatings(ratings);
        const elapsed = Date.now() - startedAt;
        const remain = (elapsed / done) * (pending.length - done);
        console.log(
          `── 已跑 ${done}/${pending.length}：有分 ${hit}，无分 ${noScore}，失败 ${failed}；` +
            `用时 ${formatDuration(elapsed)}，预计还剩 ${formatDuration(remain)}（已存盘）`,
        );
      }

      await sleep(options.delayMs);
    }
  };

  await Promise.all(
    Array.from({ length: Math.min(CONCURRENCY, pending.length) }, () => worker()),
  );

  await saveRatings(ratings);
  const finalCount = Object.keys(ratings).length;
  const withScore = Object.values(ratings).filter((entry) => entry.bangumi !== null).length;
  const withRank = Object.values(ratings).filter((entry) => entry.rank != null).length;
  console.log(
    `\n本轮：有分 ${hit}，无分 ${noScore}，失败 ${failed}（共处理 ${pending.length} 条）`,
  );
  console.log(
    `评分表：${existingCount} 条 → ${finalCount} 条；其中有 Bangumi 分的 ${withScore} 条、带排名的 ${withRank} 条`,
  );
  console.log(`用时 ${formatDuration(Date.now() - startedAt)}`);
  if (failed > 0) {
    console.log(`⚠️ 有 ${failed} 条请求失败——重跑一次会自动只补失败的`);
  }
  console.log(`已写入 ${OUTPUT_PATH}`);
}

await main();
