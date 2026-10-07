// 批量脚本：把全年代高分作品按「同系列」聚合成合集，输出 data/collections.json。
//
// ─────────────────────────────────────────────────────────────
// 用法（必须先开代理，原因同其它脚本）：
//
//   NODE_USE_ENV_PROXY=1 HTTPS_PROXY=http://127.0.0.1:7897 npm run build-collections
//
// 前置：先跑 npm run fetch-ratings（Bangumi 分在 data/ratings.json）。
// 顺序反了也能跑，只是这条合集的均分会只算 AniList 一个来源——跑完 ratings 再重跑一次即可。
// ─────────────────────────────────────────────────────────────
//
// 整体怎么走（口径见 docs/M7-首页三期改版-提示词.md 的 D3~D7 / G1~G3）：
//   ① 种子：AniList **SCORE_DESC** 全年代高分榜前 200 部（跨季度——新番的评分
//      在 AniList 上严重缺失，实测当季前 50 部只有 28 部有分，靠当季榜凑不出合集）；
//   ② 串图：拿 lib/series-graph 的白名单（SEQUEL/PREQUEL/ALTERNATIVE/SUMMARY/
//      SIDE_STORY/SPIN_OFF 六种，对面必须是 ANIME）反复「explore → 抓新 id」；
//   ③ 补数据：非种子成员用 fetchAnimeByIds 把完整字段（封面/评分/年份）补齐；
//   ④ 聚合：连通分量 = 合集；成员综合分 = 各来源等权平均（缺分不硬凑）；
//      合集均分 = **只对有分的成员**求平均；
//   ⑤ 排序：先 count>=2 按均分降序，不足 21 个再用 count===1 的单部按分补齐；
//      ⚠️ 已知偏差（真数据探针实测）：单部"孤独神作"的均分不会被系列里的弱作拉低，
//      会系统性赢过系列——所以才要"count>=2 优先"这条规则兜着。
//
// ⚠️ AniList 三个实测陷阱（2026-10-06 实测，有响应头为证）：
//   ① 顶层 Page 的 perPage 上限 **50**（要 100 只回 50；嵌套连接更狠，只有 25）；
//   ② pageInfo.total 彻底不可信 → **翻页一律以「这一页返回 0 条」为终止条件**；
//   ③ 限流 30 次/分钟 → 本脚本每个请求之间 sleep 2000ms，稳在 30 以下。
//
// ⚠️ 输出文件是**重算**（不是"只增不减"——合集本来就是整体口径），
//   但同一输入必须产出同一输出：所有遍历/排序都带确定性 tie-break，见下面各处注释。
//
// ⚠️ 运行时零外网依赖（宪法铁律 6）：卡片要显示的一切（代表作品的完整 Anime 字段、
//   封面 URL、中文名、年份、均分）都直接写进 collections.json，应用只读文件。
// ─────────────────────────────────────────────────────────────

import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { fetchAnimeByIds, fetchMediaRelations, fetchPopularAnime } from "../lib/anilist.ts";
import { getPrimaryTitle } from "../lib/anime-display.ts";
import { isSeriesRelation, nextIdsToFetch } from "../lib/series-graph.ts";
import type { SeriesRecord } from "../lib/series-graph.ts";
import type { Anime } from "../types/anime.ts";
import type { BangumiIndex } from "../types/bangumi.ts";

/** 种子数量：全年代高分榜前 200 部（4 页 × 50） */
const SEED_COUNT = 200;

/** AniList 顶层 Page 的实测上限 */
const ANILIST_PAGE_SIZE = 50;

/** 每个出网请求之间都停这么久（限流 30 次/分钟，2 秒一条稳在 15 次/分钟） */
const REQUEST_DELAY_MS = 2000;

/** 串图的硬上限（防呆：上游异常时别无限转） */
const MAX_GRAPH_ROUNDS = 30;

/** 首页要显示的合集数（3 行 × 7）。脚本输出全部合集，这里只用来打印对照 */
const DISPLAY_COUNT = 21;

const dataPath = (file: string) =>
  path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "data", file);

const TITLE_ZH_PATH = dataPath("title-zh.json");
const RATINGS_PATH = dataPath("ratings.json");
const OUTPUT_PATH = dataPath("collections.json");

/**
 * 一条合集。字段口径见提示词的 G2，这里按应用实际要用的量收窄：
 * representative 带上完整 Anime（含 title.zh 补好后）——运行时直接渲染，不再出网。
 */
interface Collection {
  /** 稳定标识：最小成员 id（每次重算得到同一个 key） */
  key: string;
  /** 合集名 = 代表作品的显示名（getPrimaryTitle） */
  name: string;
  /** 代表作品的年份 */
  startYear: number | null;
  /** 成员数 */
  count: number;
  /** 合集均分：成员综合分的算术平均，**只对有分的成员求平均** */
  score: number;
  /** 有分的成员数（用来说明这个均分可不可信） */
  scoredCount: number;
  /** 这条合集实际用到的评分来源 */
  sources: string[];
  /** 代表作品（综合分最高的那部，title.zh 已补好） */
  representative: Anime;
}

interface RatingEntry {
  anilist: number | null;
  bangumi: number | null;
  anitrendz: number | null;
}
type RatingsFile = Record<string, RatingEntry>;

/** 出网计数，最后打印（D5 验收要报总次数） */
let requestCount = 0;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function readJsonSafe<T>(filePath: string): Promise<T | null> {
  try {
    return JSON.parse(await readFile(filePath, "utf8")) as T;
  } catch {
    return null;
  }
}

/** 把一批 id 的关系边抓进 records（每 50 个一批，批次间 sleep） */
async function fetchRelationsInto(
  ids: number[],
  records: Map<number, SeriesRecord>,
): Promise<void> {
  const sorted = [...ids].sort((a, b) => a - b);
  for (let i = 0; i < sorted.length; i += ANILIST_PAGE_SIZE) {
    const chunk = sorted.slice(i, i + ANILIST_PAGE_SIZE);
    const batch = await fetchMediaRelations(chunk);
    requestCount++;
    for (const record of batch) {
      records.set(record.id, record);
    }
    console.log(
      `  关系批次 ${i / ANILIST_PAGE_SIZE + 1}：请求 ${chunk.length} 个 id，返回 ${batch.length} 条`,
    );
    await sleep(REQUEST_DELAY_MS);
  }
}

async function main(): Promise<void> {
  const startedAt = Date.now();

  // ── ① 种子：全年代高分榜前 200 ─────────────────────────────────────────
  console.log(`① 取种子：AniList 全年代高分榜前 ${SEED_COUNT} 部`);
  const seedAnime = new Map<number, Anime>();
  for (let page = 1; seedAnime.size < SEED_COUNT && page <= 10; page++) {
    const batch = await fetchPopularAnime(page, ANILIST_PAGE_SIZE, "SCORE_DESC");
    requestCount++;
    if (batch.length === 0) {
      console.log(`  第 ${page} 页空了，说明已经翻到底`);
      break;
    }
    for (const item of batch) {
      if (!seedAnime.has(item.id)) {
        seedAnime.set(item.id, item);
      }
    }
    console.log(`  第 ${page} 页 +${batch.length}，累计 ${seedAnime.size}`);
    if (seedAnime.size < SEED_COUNT) {
      await sleep(REQUEST_DELAY_MS);
    }
  }
  const seedIds = [...seedAnime.keys()];

  // ── ② 串图 ────────────────────────────────────────────────────────────
  console.log(`\n② 抓种子关系边（${seedIds.length} 部）`);
  const records = new Map<number, SeriesRecord>();
  await fetchRelationsInto(seedIds, records);

  console.log("\n③ 串图：沿白名单反复 explore 直到没有新 id");
  for (let round = 1; round <= MAX_GRAPH_ROUNDS; round++) {
    const recordsArray = [...records.values()];
    const needed = new Set<number>();
    // 对每个种子分别问「还缺谁」再取并集——nextIdsToFetch 是 lib/series-graph 里
    // 经过实测的那套规则（含防环），不在这里另写一份遍历
    for (const seedId of seedIds) {
      for (const id of nextIdsToFetch(seedId, recordsArray)) {
        needed.add(id);
      }
    }
    if (needed.size === 0) {
      console.log(`  第 ${round} 轮：没有新 id，串图结束`);
      break;
    }
    console.log(`  第 ${round} 轮：需要抓 ${needed.size} 个新 id`);
    await fetchRelationsInto([...needed], records);
  }

  // ── ④ 补全非种子成员的完整字段 ─────────────────────────────────────────
  const missing = [...records.keys()]
    .filter((id) => !seedAnime.has(id))
    .sort((a, b) => a - b);
  console.log(`\n④ 补全 ${missing.length} 个非种子成员的完整字段（封面/评分/年份）`);
  const members = new Map(seedAnime);
  for (let i = 0; i < missing.length; i += ANILIST_PAGE_SIZE) {
    const chunk = missing.slice(i, i + ANILIST_PAGE_SIZE);
    const batch = await fetchAnimeByIds(chunk);
    requestCount++;
    for (const item of batch) {
      members.set(item.id, item);
    }
    console.log(`  批次 ${i / ANILIST_PAGE_SIZE + 1}：请求 ${chunk.length}，返回 ${batch.length}`);
    await sleep(REQUEST_DELAY_MS);
  }

  // ── ⑤ 读本地表（中文名 + 三来源评分）───────────────────────────────────
  const titleZh = (await readJsonSafe<BangumiIndex>(TITLE_ZH_PATH)) ?? {};
  const ratings = (await readJsonSafe<RatingsFile>(RATINGS_PATH)) ?? {};

  /**
   * 一部成员的综合分：各自归一 100 制，**只在有分来源间等权平均**；
   * 一个来源都没有 → null（缺分不硬凑）。
   */
  function scoreOf(member: Anime): { score: number | null; sources: string[] } {
    const parts: { name: string; value: number }[] = [];
    if (member.averageScore !== null) {
      parts.push({ name: "AniList", value: member.averageScore });
    }
    const rating = ratings[String(member.id)];
    if (rating?.bangumi != null) {
      parts.push({ name: "Bangumi", value: rating.bangumi });
    }
    if (rating?.anitrendz != null) {
      parts.push({ name: "AniTrendz", value: rating.anitrendz });
    }
    if (parts.length === 0) {
      return { score: null, sources: [] };
    }
    return {
      score: parts.reduce((sum, part) => sum + part.value, 0) / parts.length,
      sources: parts.map((part) => part.name),
    };
  }

  // ── ⑥ 聚合：连通分量 = 合集（并查集，以最小 id 当根，保证结果稳定）──────
  const parent = new Map<number, number>();
  for (const id of records.keys()) {
    parent.set(id, id);
  }
  function find(x: number): number {
    let root = x;
    while (parent.get(root) !== root) {
      root = parent.get(root)!;
    }
    let cursor = x;
    while (parent.get(cursor) !== root) {
      const next = parent.get(cursor)!;
      parent.set(cursor, root);
      cursor = next;
    }
    return root;
  }
  function union(a: number, b: number): void {
    const rootA = find(a);
    const rootB = find(b);
    if (rootA !== rootB) {
      // 以较小 id 当根：同一张图每次重算得到同一个 root
      parent.set(Math.max(rootA, rootB), Math.min(rootA, rootB));
    }
  }
  for (const record of records.values()) {
    for (const edge of record.relations) {
      // 白名单 + 对面必须是动画 + 这个 id 真的在池子里（防御性判断：理论上串图已经全抓了）
      if (edge.nodeType === "ANIME" && isSeriesRelation(edge.type) && parent.has(edge.id)) {
        union(record.id, edge.id);
      }
    }
  }

  const groups = new Map<number, number[]>();
  for (const id of records.keys()) {
    const root = find(id);
    const list = groups.get(root);
    if (list) {
      list.push(id);
    } else {
      groups.set(root, [id]);
    }
  }

  // ── ⑦ 组装合集 ────────────────────────────────────────────────────────
  const withZh = (anime: Anime): Anime => ({
    ...anime,
    title: { ...anime.title, zh: titleZh[String(anime.id)]?.title_zh ?? null },
  });

  const collections: Collection[] = [];
  for (const memberIds of groups.values()) {
    const scored: { id: number; anime: Anime; score: number; sources: string[] }[] = [];
    for (const id of memberIds) {
      const anime = members.get(id);
      if (!anime) {
        continue;
      }
      const { score, sources } = scoreOf(anime);
      if (score === null) {
        continue;
      }
      scored.push({ id, anime, score, sources });
    }
    // 一个成员都没分的合集没法排序、也没法显示均分——整体排除（不硬凑）
    if (scored.length === 0) {
      continue;
    }

    const collectionScore = scored.reduce((sum, m) => sum + m.score, 0) / scored.length;
    // 代表 = 综合分最高那部；同分取 id 小（确定性）
    scored.sort((a, b) => b.score - a.score || a.id - b.id);
    const representative = withZh(scored[0].anime);

    const memberIdsSorted = [...memberIds].sort((a, b) => a - b);
    const usedSources = new Set(scored.flatMap((m) => m.sources));
    collections.push({
      key: String(memberIdsSorted[0]),
      name: getPrimaryTitle(representative),
      startYear: representative.startDate?.year ?? null,
      count: memberIds.length,
      // 留一位小数：界面上取整显示，但排序按真实值——不能两条 87.4/87.2 显示都是 87 就随便排
      score: Math.round(collectionScore * 10) / 10,
      scoredCount: scored.length,
      sources: ["AniList", "Bangumi", "AniTrendz"].filter((name) => usedSources.has(name)),
      representative,
    });
  }

  // ── ⑧ 排序（口径 D5/D6：先 count>=2，不足 21 再用 count===1 补齐）──────
  // tie-break（一个都不能省，不然每次重算的顺序会漂）：均分 → count 大 → scoredCount 大 → 代表 id 小
  const byScore = (a: Collection, b: Collection): number =>
    b.score - a.score ||
    b.count - a.count ||
    b.scoredCount - a.scoredCount ||
    a.representative.id - b.representative.id;

  const seriesCollections = collections.filter((c) => c.count >= 2).sort(byScore);
  const singles = collections.filter((c) => c.count === 1).sort(byScore);
  const ordered = [...seriesCollections, ...singles];

  // ── ⑨ 打印对照与写盘 ──────────────────────────────────────────────────
  const top = ordered.slice(0, DISPLAY_COUNT);
  const sizeHistogram = new Map<number, number>();
  for (const collection of ordered) {
    sizeHistogram.set(collection.count, (sizeHistogram.get(collection.count) ?? 0) + 1);
  }
  const histogramText = [...sizeHistogram.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([size, n]) => `${size} 部×${n}`)
    .join("，");

  console.log("\n────── 统计 ──────");
  console.log(`种子 ${seedIds.length} 部｜串图后池子 ${records.size} 部｜连通分量 ${groups.size} 个`);
  console.log(`有分（进入排序）的合集 ${collections.length} 个；size 分布：${histogramText}`);
  console.log(
    `前 ${DISPLAY_COUNT} 位：count>=2 的 ${top.filter((c) => c.count >= 2).length} 个 + ` +
      `count===1 补的 ${top.filter((c) => c.count === 1).length} 个`,
  );
  console.log(`前 5 名：${top.slice(0, 5).map((c) => `${c.name}(${c.score}, ${c.count}部)`).join(" | ")}`);
  console.log(`末 5 名：${top.slice(-5).map((c) => `${c.name}(${c.score}, ${c.count}部)`).join(" | ")}`);
  console.log(`总出网次数：${requestCount}（AniList；Bangumi 分由 fetch-ratings 负责）`);

  await mkdir(path.dirname(OUTPUT_PATH), { recursive: true });
  await writeFile(OUTPUT_PATH, `${JSON.stringify(ordered, null, 2)}\n`, "utf8");
  const seconds = Math.round((Date.now() - startedAt) / 1000);
  console.log(`\n已写入 ${OUTPUT_PATH}（${ordered.length} 个合集，用时 ${seconds} 秒）`);
}

await main();
