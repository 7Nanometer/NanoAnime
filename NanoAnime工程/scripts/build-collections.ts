// 批量脚本：把全年代高分作品按「同系列」聚合成合集，输出 data/collections.json。
//
// ─────────────────────────────────────────────────────────────
// 用法（必须先开代理，原因同其它脚本）：
//
//   NODE_USE_ENV_PROXY=1 HTTPS_PROXY=http://127.0.0.1:7897 npm run build-collections
//   NODE_USE_ENV_PROXY=1 HTTPS_PROXY=http://127.0.0.1:7897 npm run build-collections -- --probe
//
// 参数：
//   --probe          只探测、不写 collections.json：拉池子 → 补抓池内缺的 Bangumi 分 →
//                    报国家分布 / 覆盖率 / 合集数 / 重算前后的 key 差集（2026-10-07
//                    口径修正就是用它跑的验收）。补抓会写 ratings.json 与 title-zh.json（只增不减）。
//   --pool=<路径>    从快照文件读池子，跳过 ①~④ 的出网。配合 --pool-out 使用：
//                    探测和正式重算吃同一份快照，报出的数与产物必然一致
//   --pool-out=<路径> 拉完池子后写一份快照到指定路径（放仓库外，不要提交进 git）
//   --seed=N         种子数量，默认 500（10 页 × 50；2026-10-07 按判据从 200 扩过）
//
// 前置：先跑 npm run fetch-ratings（Bangumi 分在 data/ratings.json）。
// 顺序反了也能跑，只是缺分的成员不进均分——`--probe` 会把池内缺分的补上再报数。
// ─────────────────────────────────────────────────────────────
//
// 整体怎么走（口径 = 2026-10-07 用户拍板的**修正版：只看 Bangumi + 只收日本动画**，
// 取代此前「AniList/Bangumi/AniTrendz 等权平均 + 不限国家」）：
//   ① 种子：AniList **SCORE_DESC** 全年代高分榜前 500 部（跨季度——新番的评分
//      在 AniList 上严重缺失，实测当季前 50 部只有 28 部有分，靠当季榜凑不出合集；
//      500 是 2026-10-07 首轮探测后按判据从 200 扩的）；
//   ② 串图：拿 lib/series-graph 的白名单（SEQUEL/PREQUEL/ALTERNATIVE/SUMMARY/
//      SIDE_STORY/SPIN_OFF 六种，对面必须是 ANIME）反复「explore → 抓新 id」。
//      **这一步不筛国家**——先走完整张图，再在成员上筛；
//   ③ 补数据：非种子成员用 fetchAnimeByIds 把完整字段（封面/评分/年份/国家）补齐；
//   ④ 过滤：成员**只保留 countryOfOrigin === "JP"**；判不了（null / undefined）的
//      同样排除。⚠️ **在过滤后的成员上重算连通分量**——剔掉中间节点会把一个大分量
//      拆成两个，不能沿用过滤前的图（差集报告见 --probe）；
//   ⑤ 打分：成员分 = **Bangumi 分**（data/ratings.json，10 分制 ×10 → 0~100）；
//      合集均分 = **只对有分的成员**求平均；成员全体无分的合集**整条丢弃**（不硬凑）；
//   ⑥ 代表作品 = **Bangumi 分最高**的那部（同分取 id 小）。
//      排序先 count>=2 按均分降序，不足 21 个再用 count===1 的单部按分补齐——
//      ⚠️ 已知偏差（真数据探针实测）：单部"孤独神作"的均分不会被系列里的弱作拉低，
//      会系统性赢过系列——所以才要"count>=2 优先"这条规则兜着。
//
// ⚠️ ratings.json 里历史上的 anilist / anitrendz 字段**保留不读**（将来可能回看）；
//    sources 字段固定写 ["Bangumi"]，界面副标题按它如实显示。
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
import { fetchBangumiScore, matchSubject, searchBangumi } from "../lib/bangumi.ts";
import { getPrimaryTitle } from "../lib/anime-display.ts";
import { isSeriesRelation, nextIdsToFetch } from "../lib/series-graph.ts";
import type { SeriesRecord } from "../lib/series-graph.ts";
import type { Anime } from "../types/anime.ts";
import type { BangumiIndex } from "../types/bangumi.ts";

/**
 * 种子数量：全年代高分榜前 500 部（10 页 × 50）。可用 --seed=N 覆盖。
 * ⚠️ 2026-10-07 口径修正时定稿：首轮按 200 部探测，重算后成员级 Bangumi 分
 * 覆盖率只有 50.6%（阈值 80%），按定稿判据「扩种子 200 → 500 重跑」——
 * 所以这里的默认值就是扩过之后的 500，保证以后重跑复现的是同一份数据。
 */
const SEED_COUNT = 500;

/** AniList 顶层 Page 的实测上限 */
const ANILIST_PAGE_SIZE = 50;

/** 每个出网请求之间都停这么久（限流 30 次/分钟，2 秒一条稳在 15 次/分钟） */
const REQUEST_DELAY_MS = 2000;

/** Bangumi 侧的请求间隔（补抓用）。Bangumi 没有明文限额，跑慢一点稳 */
const BANGUMI_DELAY_MS = 500;

/** 补抓时每处理这么多条就存一次盘（同 fetch-ratings 的做法） */
const BANGUMI_CHECKPOINT_EVERY = 25;

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
 * 一条合集。
 * 字段口径（2026-10-07 修正后）：成员只含日本动画；分数只来自 Bangumi；
 * representative 带上完整 Anime（含 title.zh 补好后）——运行时直接渲染，不再出网。
 */
interface Collection {
  /** 稳定标识：最小成员 id（每次重算得到同一个 key） */
  key: string;
  /** 合集名 = 代表作品的显示名（getPrimaryTitle） */
  name: string;
  /** 代表作品的年份 */
  startYear: number | null;
  /** 成员数（过滤后的日本动画成员） */
  count: number;
  /** 合集均分：成员 Bangumi 分的算术平均，**只对有分的成员求平均** */
  score: number;
  /** 有分的成员数（用来说明这个均分可不可信） */
  scoredCount: number;
  /** 这条合集实际用到的评分来源。修正后固定 ["Bangumi"] */
  sources: string[];
  /** 代表作品（Bangumi 分最高的那部，title.zh 已补好） */
  representative: Anime;
}

interface RatingEntry {
  anilist: number | null;
  bangumi: number | null;
  anitrendz: number | null;
}
type RatingsFile = Record<string, RatingEntry>;

/** 池子快照（--pool-out / --pool 用），放仓库外，只给脚本自己吃 */
interface PoolSnapshot {
  version: 1;
  fetchedAt: string;
  seedIds: number[];
  records: SeriesRecord[];
  members: Anime[];
}

interface Pool {
  seedIds: number[];
  records: Map<number, SeriesRecord>;
  members: Map<number, Anime>;
}

interface Options {
  probe: boolean;
  poolIn: string | null;
  poolOut: string | null;
  seedCount: number;
}

/** 出网计数，最后打印（验收要报总次数） */
let anilistRequests = 0;
let bangumiRequests = 0;

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

/** 按键排序后写盘，保证每次生成的 JSON 顺序一致，diff 才看得懂 */
async function saveJsonSortedByNumberKey(
  filePath: string,
  data: Record<string, unknown>,
): Promise<void> {
  const sorted: Record<string, unknown> = {};
  for (const key of Object.keys(data).sort((a, b) => Number(a) - Number(b))) {
    sorted[key] = data[key];
  }
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, `${JSON.stringify(sorted, null, 2)}\n`, "utf8");
}

function parseArgs(argv: string[]): Options {
  const options: Options = { probe: false, poolIn: null, poolOut: null, seedCount: SEED_COUNT };
  for (const arg of argv) {
    if (arg === "--probe") {
      options.probe = true;
    } else if (arg.startsWith("--pool=")) {
      options.poolIn = arg.slice("--pool=".length);
    } else if (arg.startsWith("--pool-out=")) {
      options.poolOut = arg.slice("--pool-out=".length);
    } else if (arg.startsWith("--seed=")) {
      const value = Number(arg.slice("--seed=".length));
      if (!Number.isInteger(value) || value <= 0) {
        throw new Error(`--seed 要写正整数，收到的是「${arg}」`);
      }
      options.seedCount = value;
    } else {
      throw new Error(`不认识的参数：${arg}`);
    }
  }
  return options;
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
    anilistRequests++;
    for (const record of batch) {
      records.set(record.id, record);
    }
    console.log(
      `  关系批次 ${i / ANILIST_PAGE_SIZE + 1}：请求 ${chunk.length} 个 id，返回 ${batch.length} 条`,
    );
    await sleep(REQUEST_DELAY_MS);
  }
}

/** ①~④：出网把池子拉全（种子 → 串图 → 补数据） */
async function fetchPool(options: Options): Promise<Pool> {
  // ── ① 种子：全年代高分榜前 N ────────────────────────────────────────
  console.log(`① 取种子：AniList 全年代高分榜前 ${options.seedCount} 部`);
  const seedAnime = new Map<number, Anime>();
  for (let page = 1; seedAnime.size < options.seedCount && page <= 10; page++) {
    const batch = await fetchPopularAnime(page, ANILIST_PAGE_SIZE, "SCORE_DESC");
    anilistRequests++;
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
    if (seedAnime.size < options.seedCount) {
      await sleep(REQUEST_DELAY_MS);
    }
  }
  const seedIds = [...seedAnime.keys()];

  // ── ② 抓种子关系边 ──────────────────────────────────────────────────
  console.log(`\n② 抓种子关系边（${seedIds.length} 部）`);
  const records = new Map<number, SeriesRecord>();
  await fetchRelationsInto(seedIds, records);

  console.log("\n③ 串图：沿白名单反复 explore 直到没有新 id（不筛国家）");
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

  // ── ④ 补全非种子成员的完整字段 ─────────────────────────────────────
  const missing = [...records.keys()]
    .filter((id) => !seedAnime.has(id))
    .sort((a, b) => a - b);
  console.log(`\n④ 补全 ${missing.length} 个非种子成员的完整字段（封面/年份/国家）`);
  const members = new Map(seedAnime);
  for (let i = 0; i < missing.length; i += ANILIST_PAGE_SIZE) {
    const chunk = missing.slice(i, i + ANILIST_PAGE_SIZE);
    const batch = await fetchAnimeByIds(chunk);
    anilistRequests++;
    for (const item of batch) {
      members.set(item.id, item);
    }
    console.log(`  批次 ${i / ANILIST_PAGE_SIZE + 1}：请求 ${chunk.length}，返回 ${batch.length}`);
    await sleep(REQUEST_DELAY_MS);
  }

  return { seedIds, records, members };
}

async function writePoolSnapshot(filePath: string, pool: Pool): Promise<void> {
  const snapshot: PoolSnapshot = {
    version: 1,
    fetchedAt: new Date().toISOString(),
    seedIds: pool.seedIds,
    records: [...pool.records.values()],
    members: [...pool.members.values()],
  };
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, `${JSON.stringify(snapshot)}\n`, "utf8");
  console.log(`\n已写池子快照 ${filePath}（${pool.records.size} 条记录）`);
}

async function readPoolSnapshot(filePath: string): Promise<Pool> {
  const snapshot = await readJsonSafe<PoolSnapshot>(filePath);
  if (!snapshot || !Array.isArray(snapshot.records)) {
    throw new Error(`读不到池子快照或格式不对：${filePath}`);
  }
  return {
    seedIds: snapshot.seedIds ?? [],
    records: new Map(snapshot.records.map((record) => [record.id, record])),
    members: new Map((snapshot.members ?? []).map((member) => [member.id, member])),
  };
}

// ═══════════════════════════════════════════════════════════════════════
// 池内补抓 Bangumi 分（--probe 专属）
// ═══════════════════════════════════════════════════════════════════════

interface BackfillStats {
  /** 需要补的日漫成员数（Bangumi 分为 null 的） */
  needed: number;
  /** 对照表里已有 bangumi_id、只补分 */
  fromIndex: number;
  /** 按标题新配对成功（顺手写进对照表） */
  newlyMatched: number;
  /** 搜了但标题+年份配不上 */
  unmatched: number;
  /** AniList 三个名字全空，没法搜 */
  keywordMissing: number;
  /** 请求失败 */
  failed: number;
  /** 补抓后拿到分 */
  scoreHit: number;
  /** 补抓后 Bangumi 上仍无分（score = 0） */
  scoreStillNull: number;
}

/**
 * 给「日漫成员里没有 Bangumi 分」的作品补分。
 *
 * 两条路（都只增不减，绝不覆盖已有值）：
 *   ① 对照表里已有 bangumi_id → 直接补分（新番评分会随时间攒出来，重跑有用）；
 *   ② 对照表里没有 → 用 searchBangumi + matchSubject 按「日文原名 + 年份严格相等」配对
 *      （同 scripts/fetch-title-zh.ts 的那套），配上了才写对照表 + 补分。
 *      ⚠️ 配不上就留空——宁缺不猜（lib/bangumi.ts 的既定纪律）。
 *
 * 不许用 AniList 分兜底、不许用 0 分填缺（那样就不是"只看 Bangumi"了）。
 */
async function backfillBangumiScores(
  pool: Pool,
  ratings: RatingsFile,
  titleZh: BangumiIndex,
): Promise<BackfillStats> {
  const jpIds = new Set(
    [...pool.records.values()]
      .filter((record) => record.countryOfOrigin === "JP")
      .map((record) => record.id),
  );
  const need = [...jpIds]
    .filter((id) => ratings[String(id)]?.bangumi == null)
    .sort((a, b) => a - b);

  const stats: BackfillStats = {
    needed: need.length,
    fromIndex: 0,
    newlyMatched: 0,
    unmatched: 0,
    keywordMissing: 0,
    failed: 0,
    scoreHit: 0,
    scoreStillNull: 0,
  };
  console.log(`\n⑤ 池内补抓：日漫成员里缺 Bangumi 分的 ${need.length} 部，开始逐条补`);
  if (need.length === 0) {
    return stats;
  }

  let sinceCheckpoint = 0;

  for (let i = 0; i < need.length; i++) {
    const id = need[i];
    const anime = pool.members.get(id);
    if (!anime) {
      // 理论上不会发生（所有池内 id 都有成员数据）；真发生了就当失败记一笔
      stats.failed++;
      continue;
    }

    let bangumiId = titleZh[String(id)]?.bangumi_id ?? null;

    if (bangumiId != null) {
      stats.fromIndex++;
    } else {
      const keyword = anime.title.native ?? anime.title.romaji ?? anime.title.english;
      if (!keyword) {
        stats.keywordMissing++;
        continue;
      }
      const year = anime.startDate?.year ?? null;
      try {
        const candidates = await searchBangumi(keyword);
        bangumiRequests++;
        await sleep(BANGUMI_DELAY_MS);
        // year 为 null 时 matchSubject 直接返回 null——宁缺不猜，这里不用特判
        const hit = matchSubject(
          [anime.title.native, anime.title.romaji, anime.title.english],
          year,
          candidates,
        );
        if (!hit) {
          stats.unmatched++;
          continue;
        }
        titleZh[String(id)] = {
          bangumi_id: hit.id,
          title_zh: hit.name_cn,
          summary: hit.summary?.trim() || null,
          popularity: null,
        };
        bangumiId = hit.id;
        stats.newlyMatched++;
        console.log(`   + 新配对 ${id} → bgm ${hit.id}「${hit.name_cn}」`);
      } catch (error) {
        stats.failed++;
        console.log(
          `   ✗ 搜「${keyword}」失败：${error instanceof Error ? error.message : String(error)}`,
        );
        await sleep(BANGUMI_DELAY_MS);
        continue;
      }
    }

    try {
      const score = await fetchBangumiScore(bangumiId);
      bangumiRequests++;
      ratings[String(id)] = {
        // 历史字段原样保留，别把别人填的抹掉
        anilist: ratings[String(id)]?.anilist ?? null,
        bangumi: score,
        anitrendz: ratings[String(id)]?.anitrendz ?? null,
      };
      if (score == null) {
        stats.scoreStillNull++;
      } else {
        stats.scoreHit++;
      }
    } catch (error) {
      stats.failed++;
      console.log(
        `   ✗ 取分 bgm ${bangumiId} 失败：${error instanceof Error ? error.message : String(error)}`,
      );
    }
    await sleep(BANGUMI_DELAY_MS);

    sinceCheckpoint++;
    if (sinceCheckpoint >= BANGUMI_CHECKPOINT_EVERY) {
      sinceCheckpoint = 0;
      await saveJsonSortedByNumberKey(RATINGS_PATH, ratings);
      await saveJsonSortedByNumberKey(TITLE_ZH_PATH, titleZh);
      console.log(`   ── 已处理 ${i + 1}/${need.length}（已存盘）`);
    }
  }

  await saveJsonSortedByNumberKey(RATINGS_PATH, ratings);
  await saveJsonSortedByNumberKey(TITLE_ZH_PATH, titleZh);
  return stats;
}

// ═══════════════════════════════════════════════════════════════════════
// 聚合（连通分量 → 合集）
// ═══════════════════════════════════════════════════════════════════════

/**
 * 并查集求连通分量（以最小 id 当根，保证同一张图每次重算得到同一个 key）。
 * jpOnly = true 时只有 countryOfOrigin === "JP" 的记录进图——
 * **剔掉中间节点可能把一个大分量拆开，所以必须在过滤后的成员上重算，不能沿用旧图。**
 */
function findGroups(records: readonly SeriesRecord[], jpOnly: boolean): Map<number, number[]> {
  const parent = new Map<number, number>();
  for (const record of records) {
    if (!jpOnly || record.countryOfOrigin === "JP") {
      parent.set(record.id, record.id);
    }
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

  for (const record of records) {
    // 过滤后的记录才有 parent；不在这张图里的记录整条跳过
    if (!parent.has(record.id)) {
      continue;
    }
    for (const edge of record.relations) {
      // 白名单 + 对面必须是动画 + 对面也在这张图里（jpOnly 时这一条同时挡住了非日漫）
      if (edge.nodeType === "ANIME" && isSeriesRelation(edge.type) && parent.has(edge.id)) {
        union(record.id, edge.id);
      }
    }
  }

  const groups = new Map<number, number[]>();
  for (const id of parent.keys()) {
    const root = find(id);
    const list = groups.get(root);
    if (list) {
      list.push(id);
    } else {
      groups.set(root, [id]);
    }
  }
  return groups;
}

interface Assembled {
  collections: Collection[];
  /** 分量总数（含被丢的） */
  groupCount: number;
  /** 因「全体成员无 Bangumi 分」被整条丢弃的合集数 */
  droppedAllUnscored: number;
}

/**
 * 分组 → 合集。成员的分数只读 Bangumi（ratings.json 的 bangumi 字段）；
 * 代表作品 = Bangumi 分最高那部（同分取 id 小）。
 */
function assemble(
  groups: Map<number, number[]>,
  members: Map<number, Anime>,
  ratings: RatingsFile,
  titleZh: BangumiIndex,
): Assembled {
  const withZh = (anime: Anime): Anime => ({
    ...anime,
    title: { ...anime.title, zh: titleZh[String(anime.id)]?.title_zh ?? null },
  });

  const collections: Collection[] = [];
  let droppedAllUnscored = 0;

  for (const memberIds of groups.values()) {
    const scored: { id: number; anime: Anime; score: number }[] = [];
    for (const id of memberIds) {
      const anime = members.get(id);
      if (!anime) {
        continue;
      }
      const score = ratings[String(id)]?.bangumi ?? null;
      if (score === null) {
        continue;
      }
      scored.push({ id, anime, score });
    }
    // 一个成员都没分的合集没法排序、也没法显示均分——整条丢弃（不硬凑）
    if (scored.length === 0) {
      droppedAllUnscored++;
      continue;
    }

    const collectionScore = scored.reduce((sum, member) => sum + member.score, 0) / scored.length;
    // 代表 = Bangumi 分最高那部；同分取 id 小（确定性）
    scored.sort((a, b) => b.score - a.score || a.id - b.id);
    const representative = withZh(scored[0].anime);

    const memberIdsSorted = [...memberIds].sort((a, b) => a - b);
    collections.push({
      key: String(memberIdsSorted[0]),
      name: getPrimaryTitle(representative),
      startYear: representative.startDate?.year ?? null,
      count: memberIds.length,
      // 留一位小数：界面上取整显示，但排序按真实值——不能两条 87.4/87.2 显示都是 87 就随便排
      score: Math.round(collectionScore * 10) / 10,
      scoredCount: scored.length,
      // 修正后只有一个来源，固定写死；界面副标题按它如实显示
      sources: ["Bangumi"],
      representative,
    });
  }

  return { collections, groupCount: groups.size, droppedAllUnscored };
}

/**
 * 排序（口径不变）：先 count>=2，不足 21 再用 count===1 补齐。
 * tie-break（一个都不能省，不然每次重算的顺序会漂）：均分 → count 大 → scoredCount 大 → 代表 id 小
 */
function sortCollections(collections: readonly Collection[]): Collection[] {
  const byScore = (a: Collection, b: Collection): number =>
    b.score - a.score ||
    b.count - a.count ||
    b.scoredCount - a.scoredCount ||
    a.representative.id - b.representative.id;

  const seriesCollections = collections.filter((c) => c.count >= 2).sort(byScore);
  const singles = collections.filter((c) => c.count === 1).sort(byScore);
  return [...seriesCollections, ...singles];
}

// ═══════════════════════════════════════════════════════════════════════
// --probe：只报数，不写 collections.json
// ═══════════════════════════════════════════════════════════════════════

/** 打印两组 count>=2 集合的 key 差集：哪些消失、哪些变小、哪些变大、哪些新出现 */
function reportDiff(label: string, before: Collection[], after: Collection[]): void {
  const b = new Map(before.filter((c) => c.count >= 2).map((c) => [c.key, c]));
  const a = new Map(after.filter((c) => c.count >= 2).map((c) => [c.key, c]));

  const disappeared = [...b.keys()].filter((key) => !a.has(key));
  const appeared = [...a.keys()].filter((key) => !b.has(key));
  const shrank = [...b.keys()].filter(
    (key) => a.has(key) && a.get(key)!.count < b.get(key)!.count,
  );
  const grew = [...b.keys()].filter((key) => a.has(key) && a.get(key)!.count > b.get(key)!.count);

  console.log(`\n── count>=2 合集的 key 差集（${label}）──`);
  const line = (list: string[], describe: (key: string) => string) =>
    list.length === 0 ? "（无）" : list.map(describe).join("；");
  console.log(
    `   消失 ${disappeared.length}：` +
      line(disappeared, (key) => `${b.get(key)!.name}(key ${key}, 旧 ${b.get(key)!.count} 部)`),
  );
  console.log(
    `   变小 ${shrank.length}：` +
      line(
        shrank,
        (key) => `${a.get(key)!.name}(key ${key}, ${b.get(key)!.count} → ${a.get(key)!.count} 部)`,
      ),
  );
  console.log(
    `   变大 ${grew.length}：` +
      line(
        grew,
        (key) => `${a.get(key)!.name}(key ${key}, ${b.get(key)!.count} → ${a.get(key)!.count} 部)`,
      ),
  );
  console.log(
    `   新出现（多因分量被拆开）${appeared.length}：` +
      line(appeared, (key) => `${a.get(key)!.name}(key ${key}, ${a.get(key)!.count} 部)`),
  );
}

async function runProbe(
  pool: Pool,
  ratings: RatingsFile,
  titleZh: BangumiIndex,
  seedCount: number,
): Promise<void> {
  const recordsArray = [...pool.records.values()];

  // ── 国家分布（技术字段原样打印）────────────────────────────────────
  const distribution = new Map<string, number>();
  for (const record of recordsArray) {
    const key =
      record.countryOfOrigin === undefined
        ? "undefined（没有这个字段）"
        : record.countryOfOrigin === null
          ? "null（AniList 没填）"
          : record.countryOfOrigin;
    distribution.set(key, (distribution.get(key) ?? 0) + 1);
  }
  const distSorted = [...distribution.entries()].sort((a, b) => b[1] - a[1]);
  console.log(`\n【探测 ①】池子 ${recordsArray.length} 部，countryOfOrigin 取值分布（原样打印）：`);
  for (const [value, count] of distSorted) {
    console.log(`   ${value}：${count} 部`);
  }

  const jpRecords = recordsArray.filter((record) => record.countryOfOrigin === "JP");
  const undetermined = recordsArray.filter((record) => record.countryOfOrigin == null).length;
  const excluded = recordsArray.length - jpRecords.length;
  const excludedDist = new Map<string, number>();
  for (const record of recordsArray) {
    if (record.countryOfOrigin === "JP") {
      continue;
    }
    const key = record.countryOfOrigin == null ? "判不了（null/undefined）" : record.countryOfOrigin;
    excludedDist.set(key, (excludedDist.get(key) ?? 0) + 1);
  }
  console.log(
    `\n【探测 ②】过滤后日漫 ${jpRecords.length} 部；判不了（null/undefined）${undetermined} 部；` +
      `被排除 ${excluded} 部，被排除的取值分布：`,
  );
  for (const [value, count] of [...excludedDist.entries()].sort((a, b) => b[1] - a[1])) {
    console.log(`   ${value}：${count} 部`);
  }

  // ── 补抓 + 覆盖率 ─────────────────────────────────────────────────
  const beforeScored = jpRecords.filter((r) => ratings[String(r.id)]?.bangumi != null).length;
  const stats = await backfillBangumiScores(pool, ratings, titleZh);
  const afterScored = jpRecords.filter((r) => ratings[String(r.id)]?.bangumi != null).length;

  console.log(`\n【探测 ③】Bangumi 分覆盖（只算日漫成员）：`);
  console.log(`   补抓前：${beforeScored}/${jpRecords.length} = ${((beforeScored / jpRecords.length) * 100).toFixed(1)}%`);
  console.log(
    `   补抓：需补 ${stats.needed} 部 → 对照表已有 id 补分 ${stats.fromIndex} 部；` +
      `按标题新配对 ${stats.newlyMatched} 部（已写进对照表）；` +
      `未匹配 ${stats.unmatched}；无可用标题 ${stats.keywordMissing}；请求失败 ${stats.failed}`,
  );
  console.log(
    `   补抓结果：补到分 ${stats.scoreHit} 部；Bangumi 上仍无分 ${stats.scoreStillNull} 部`,
  );
  const coverage = (afterScored / jpRecords.length) * 100;
  console.log(`   补抓后：${afterScored}/${jpRecords.length} = ${coverage.toFixed(1)}%`);

  // ── 按新口径重算（内存里，不写盘）─────────────────────────────────
  const newSide = assemble(findGroups(recordsArray, true), pool.members, ratings, titleZh);
  const ordered = sortCollections(newSide.collections);
  const seriesCount = newSide.collections.filter((c) => c.count >= 2).length;
  const singleCount = newSide.collections.filter((c) => c.count === 1).length;
  const top = ordered.slice(0, DISPLAY_COUNT);
  const topSeries = top.filter((c) => c.count >= 2).length;
  const topSingles = top.filter((c) => c.count === 1).length;

  console.log(`\n【探测 ④】重算后（日漫 + 只看 Bangumi）：`);
  console.log(
    `   连通分量 ${newSide.groupCount} 个；有分的合集 ${newSide.collections.length} 个` +
      `（count>=2 的 ${seriesCount} 个；count===1 的 ${singleCount} 个）；` +
      `因全体成员无分被整条丢弃 ${newSide.droppedAllUnscored} 个`,
  );
  console.log(
    `   前 ${DISPLAY_COUNT} 位：count>=2 的 ${topSeries} 个 + count===1 补的 ${topSingles} 个`,
  );
  console.log(
    `   前 5：${top.slice(0, 5).map((c) => `${c.name}(${c.score}, ${c.count}部)`).join(" | ")}`,
  );
  console.log(
    `   末 5：${top.slice(-5).map((c) => `${c.name}(${c.score}, ${c.count}部)`).join(" | ")}`,
  );

  // ── 差集 ①：对上线中的 collections.json（真实"改之前 → 改之后"）──
  const committed = await readJsonSafe<Collection[]>(OUTPUT_PATH);
  if (committed) {
    reportDiff("对上线中的 collections.json（含打分口径变化）", committed, newSide.collections);
  }

  // ── 差集 ②：只隔离"剔除非日漫成员"这一步（两边同为只看 Bangumi）──
  const unfiltered = assemble(findGroups(recordsArray, false), pool.members, ratings, titleZh);
  reportDiff("只剔除日本之外成员这一步（两边同为只看 Bangumi）", unfiltered.collections, newSide.collections);

  // ── 判据（用户定的走法，照抄输出）─────────────────────────────────
  console.log(`\n【判据】覆盖率 ${coverage.toFixed(1)}%（阈值 ≥80%）、count>=2 合集 ${seriesCount} 个（阈值 ≥30）；种子 ${seedCount} 部`);
  if (coverage >= 80 && seriesCount >= 30) {
    console.log("→ 两项都达标：按走法保留现有种子，直接重算写盘即可。");
  } else {
    console.log("→ 有项目不达标：按走法应扩种子到 500 重跑一轮再报数。");
  }
}

// ═══════════════════════════════════════════════════════════════════════
// 主流程
// ═══════════════════════════════════════════════════════════════════════

async function main(): Promise<void> {
  const startedAt = Date.now();
  const options = parseArgs(process.argv.slice(2));
  console.log(
    `参数：probe=${options.probe ? "是" : "否"} pool=${options.poolIn ?? "(无，出网拉)"} ` +
      `pool-out=${options.poolOut ?? "(不写)"} seed=${options.seedCount}\n`,
  );

  // ── 池子：出网拉，或从快照读 ─────────────────────────────────────────
  let pool: Pool;
  if (options.poolIn) {
    pool = await readPoolSnapshot(options.poolIn);
    console.log(`①~④ 跳过出网，从快照读池子：${pool.records.size} 部（快照：${options.poolIn}）\n`);
  } else {
    pool = await fetchPool(options);
    if (options.poolOut) {
      await writePoolSnapshot(options.poolOut, pool);
    }
  }

  // ── 读本地表（中文名 + Bangumi 分）──────────────────────────────────
  const titleZh = (await readJsonSafe<BangumiIndex>(TITLE_ZH_PATH)) ?? {};
  const ratings = (await readJsonSafe<RatingsFile>(RATINGS_PATH)) ?? {};

  if (options.probe) {
    await runProbe(pool, ratings, titleZh, options.seedCount);
    const seconds = Math.round((Date.now() - startedAt) / 1000);
    console.log(
      `\n（probe 结束，未写 collections.json；用时 ${seconds} 秒；` +
        `AniList 出网 ${anilistRequests} 次、Bangumi 出网 ${bangumiRequests} 次）`,
    );
    return;
  }

  // ── 正常重算：过滤国家 → 分组 → 打分 → 排序 → 写盘 ──────────────────
  const recordsArray = [...pool.records.values()];
  const jpRecords = recordsArray.filter((record) => record.countryOfOrigin === "JP");
  const missingScores = jpRecords.filter((r) => ratings[String(r.id)]?.bangumi == null).length;
  if (missingScores > 0) {
    console.log(
      `⚠️ 日漫成员里有 ${missingScores} 部没有 Bangumi 分——先跑 --probe 会按标题补抓，覆盖率更好\n`,
    );
  }

  const side = assemble(findGroups(recordsArray, true), pool.members, ratings, titleZh);
  const ordered = sortCollections(side.collections);

  // ── 打印对照与写盘 ──────────────────────────────────────────────────
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
  console.log(`种子 ${pool.seedIds.length} 部｜串图后池子 ${recordsArray.length} 部（其中日漫 ${jpRecords.length} 部）`);
  const scoredCount = jpRecords.filter((r) => ratings[String(r.id)]?.bangumi != null).length;
  console.log(
    `日漫成员 Bangumi 分覆盖：${scoredCount}/${jpRecords.length} = ${((scoredCount / jpRecords.length) * 100).toFixed(1)}%`,
  );
  console.log(
    `连通分量 ${side.groupCount} 个；有分的合集 ${ordered.length} 个；因全体成员无分丢弃 ${side.droppedAllUnscored} 个；size 分布：${histogramText}`,
  );
  console.log(
    `前 ${DISPLAY_COUNT} 位：count>=2 的 ${top.filter((c) => c.count >= 2).length} 个 + ` +
      `count===1 补的 ${top.filter((c) => c.count === 1).length} 个`,
  );
  console.log(`前 5 名：${top.slice(0, 5).map((c) => `${c.name}(${c.score}, ${c.count}部)`).join(" | ")}`);
  console.log(`末 5 名：${top.slice(-5).map((c) => `${c.name}(${c.score}, ${c.count}部)`).join(" | ")}`);
  console.log(`总出网次数：AniList ${anilistRequests}，Bangumi ${bangumiRequests}`);

  await mkdir(path.dirname(OUTPUT_PATH), { recursive: true });
  await writeFile(OUTPUT_PATH, `${JSON.stringify(ordered, null, 2)}\n`, "utf8");
  const seconds = Math.round((Date.now() - startedAt) / 1000);
  console.log(`\n已写入 ${OUTPUT_PATH}（${ordered.length} 个合集，用时 ${seconds} 秒）`);
}

await main();
