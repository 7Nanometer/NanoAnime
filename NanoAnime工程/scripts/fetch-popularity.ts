// 批量脚本：给 data/title-zh.json 的每条记录补上 AniList 的**人气值**。
//
// 为什么要这一步：中文搜索命中本地表后要按相关度排序。相关度分两层——
// 先看匹配质量（完全相等 > 开头匹配 > 中间包含），同一档位内再看人气值高低
//（规则在 lib/local-match-rank.ts）。没有这个数字，同档位就只能"越老越靠前"。
//
// 中文名来自 Bangumi，人气值来自 AniList —— 两个数据源，分两个脚本抓。
//
// ─────────────────────────────────────────────────────────────
// 用法：
//
//   NODE_USE_ENV_PROXY=1 HTTPS_PROXY=http://127.0.0.1:7897 \
//     npm run fetch-popularity
//
// 参数：
//   --force       重新取一遍（默认**跳过已经有值的**）
//   --delay=MS    每批之间停多久，默认 800
// ─────────────────────────────────────────────────────────────
//
// ⚠️ 这个脚本**只新增 popularity 一个字段**：bangumi_id / title_zh / summary
//    **一个字都不碰**，而且**完全不问 Bangumi** —— 已经人工核对过的中文名
//    没有重新配对、被改错的风险。（这条是它和 fetch-title-zh.ts 分开写的原因）
//
// ⚠️ 跑之前要挂代理，并通过环境变量告诉 Node 走代理 —— Node 自带的 fetch
//    默认**不读**代理设置（实测裸跑会一直连不上直到超时）。
//
// 成本：1536 条约 31 批请求，1 分钟内跑完（AniList 限流 30~90 次/分钟，800ms 间隔很安全）。

import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { fetchAnimePopularityByIds } from "../lib/anilist.ts";
import type { BangumiIndex } from "../types/bangumi.ts";

/** 一批查多少个 id。50 是 AniList 单页上限，超了会静默截断 */
const BATCH_SIZE = 50;

/** 批与批之间停多久 */
const DEFAULT_DELAY_MS = 800;

const HERE = path.dirname(fileURLToPath(import.meta.url));
const OUTPUT_PATH = path.join(HERE, "..", "data", "title-zh.json");

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

interface Options {
  force: boolean;
  delayMs: number;
}

function parseArgs(argv: string[]): Options {
  const options: Options = { force: false, delayMs: DEFAULT_DELAY_MS };

  for (const arg of argv) {
    if (arg === "--force") {
      options.force = true;
    } else if (arg.startsWith("--delay=")) {
      const value = Number(arg.slice("--delay=".length));
      if (Number.isFinite(value) && value >= 0) {
        options.delayMs = value;
      }
    } else {
      console.warn(`⚠️ 不认识的参数，已忽略：${arg}`);
    }
  }

  return options;
}

// ═══════════════════════════════════════════════════════════════════════
// 读写那张表
// （和 scripts/fetch-title-zh.ts 里的同名函数一样。刻意各写各的：
//   那边 import 时会直接跑主流程，共用不了；而且写盘格式必须完全一致，
//   复制一份比抽一个共享模块更好核对）
// ═══════════════════════════════════════════════════════════════════════

/** 读现有成果。文件不存在或坏了都当空的——不能让一个坏文件把整轮搞没 */
async function readIndex(): Promise<BangumiIndex> {
  try {
    const raw = await readFile(OUTPUT_PATH, "utf8");
    const parsed = JSON.parse(raw) as BangumiIndex;
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

/** 按键排序后写盘，和 fetch-title-zh.ts 的写法保持一致，diff 才看得懂 */
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
  console.log(`参数：force=${options.force ? "是" : "否"} delay=${options.delayMs}ms\n`);

  const index = await readIndex();
  const allIds = Object.keys(index).map(Number);

  if (allIds.length === 0) {
    console.log("表是空的，没什么可补的。先跑 npm run fetch-title-zh。");
    return;
  }

  // 已经有值的跳过（--force 时全取）
  const pending = options.force
    ? allIds
    : allIds.filter((id) => typeof index[String(id)].popularity !== "number");

  console.log(`表里共 ${allIds.length} 条，本次要取 ${pending.length} 条`);
  if (pending.length === 0) {
    console.log("全都有值了，收工。（要重取加 --force）");
    return;
  }

  const startedAt = Date.now();
  let filled = 0;
  let missing = 0;
  let failedBatches = 0;
  const notFound: number[] = [];

  for (let i = 0; i < pending.length; i += BATCH_SIZE) {
    const batch = pending.slice(i, i + BATCH_SIZE);
    const batchNo = Math.floor(i / BATCH_SIZE) + 1;
    const totalBatches = Math.ceil(pending.length / BATCH_SIZE);

    try {
      const popularity = await fetchAnimePopularityByIds(batch);

      for (const id of batch) {
        const value = popularity.get(id);
        const entry = index[String(id)];
        if (typeof value === "number") {
          // 只覆盖 popularity 这一个键，别的字段原样带过去
          index[String(id)] = { ...entry, popularity: value };
          filled++;
        } else {
          // AniList 没返回这个 id（作品被合并/删除？）。写 null 而不是留空，
          // 让"表里每条都有这个键"成立；排序时 null 按 0 处理，垫底但不丢
          index[String(id)] = { ...entry, popularity: entry.popularity ?? null };
          missing++;
          notFound.push(id);
        }
      }

      // 每批写一次盘：中途断了、被限流，前面跑的都还在
      await saveIndex(index);
      console.log(
        `── 第 ${batchNo}/${totalBatches} 批：本批 ${batch.length} 条，累计取到 ${filled}，` +
          `没取到 ${missing}；用时 ${Math.round((Date.now() - startedAt) / 1000)} 秒`,
      );
    } catch (error) {
      failedBatches++;
      console.log(
        `── 第 ${batchNo}/${totalBatches} 批失败（已跳过，其余照跑）：` +
          `${error instanceof Error ? error.message : String(error)}`,
      );
    }

    if (i + BATCH_SIZE < pending.length) {
      await sleep(options.delayMs);
    }
  }

  await saveIndex(index);

  console.log(`\n本轮：取到 ${filled}，没取到 ${missing}，整批失败 ${failedBatches} 批`);
  if (notFound.length > 0) {
    console.log(`AniList 没返回的 id（已写成 null，排序时垫底）：${notFound.join(", ")}`);
  }
  console.log(`用时 ${Math.round((Date.now() - startedAt) / 1000)} 秒`);
  if (failedBatches > 0) {
    console.log("⚠️ 有整批失败的——直接重跑一次即可，已经有值的会自动跳过");
  }
  console.log(`已写入 ${OUTPUT_PATH}`);
}

await main();
