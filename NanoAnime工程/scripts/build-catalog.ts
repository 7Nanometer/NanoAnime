// 全库清点脚本（2026-10-09）。
// 把 AniList 上**全部非成人动画条目**扫一遍，产出两份文件：
//
//   · data/.catalog-snapshot.json —— 全部条目的 id/标题/年份/人气/国家（中间产物，**不进 git**），
//     喂给 `npm run fetch-title-zh -- --scope=catalog` 当目标列表。
//   · data/catalog-counts.json —— 总条目数 + 分年计数（**进 git**）。浏览页的
//     「共 N 部」数字改从它来——AniList 自带的 total 会撒谎（实测同一查询翻不同页
//     报不同数；1960 年前只有百来部也报 5000），一个数都不能信。
//
// ─────────────────────────────────────────────────────────────
// 用法：
//
//   node scripts/build-catalog.ts            # 断点续跑：有快照就从上次的断点接着扫
//   node scripts/build-catalog.ts --force    # 忽略已有快照，重头扫
//
// ⚠️ 不需要代理：AniList 本机直连可通（被墙的是 Bangumi，不是它）。
//    千万别顺手开 NODE_USE_ENV_PROXY——Node 走代理会慢十倍（见 fetch-ratings 的教训）。
// ─────────────────────────────────────────────────────────────
//
// ⚠️⚠️ 为什么要"ID 区间扫描"而不是普通翻页（本脚本存在的原因）：
//
//   AniList 对任何查询都有**硬上限**——offset + perPage 不许超过 5000。
//   实测 perPage=28 翻到第 179 页直接 HTTP 400：
//     "Page depth exceeds maximum allowed for API requests (5000 entries)"
//   （宪法第 14 条记过的"total 不可信"是同一个上限的另一副面孔。）
//
//   全库两万多条，一路翻页翻到 5000 就撞墙——这是"站里老番翻不到底"的根。
//
//   绕法：AniList 支持 `id_in: [id, id, ...]` 过滤器。把 id 空间切成
//   5000 个 id 一段（实测最大动画 id 218025 → 44 段），**每段单独翻页**。
//   一段里实际动画只有 ~450 条（id 空间是全类型共用的，漫画等占了多数），
//   离 5000 上限远得很。段与段之间用 id 区间硬隔开，不重不漏。
//
// ⚠️ 翻页停止条件：**这一页不满 50 条**就是段尾（不再是"空页"——段内排序
//   稳定（sort: ID），不满页即到底）。整段没有超过 100 页的可能（防呆另设）。
// ─────────────────────────────────────────────────────────────

import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ANILIST_ENDPOINT = "https://graphql.anilist.co";

/** id 段大小。5000 个 id 一段：实测这种 id_in 请求 ~1 秒内返回，服务端没有怨言 */
const CHUNK_SIZE = 5000;

/** 每页条数。50 实测可用（不是被截断的 25） */
const PER_PAGE = 50;

/**
 * 请求之间的停顿（毫秒）。
 * AniList 限流 **30 次/分钟**（响应头 x-ratelimit-limit）。首版按 2000ms 贴线跑，
 * 实测扫到第 30 段左右撞上一串连着的 429（重试全灭、脚本被带走）——
 * **贴线就是踩线**。改成 2500ms（≈24/分）留出余量。
 */
const REQUEST_DELAY_MS = 2500;

/** 撞 429 / 网络抖动时的重试次数 */
const MAX_RETRIES = 6;

/** 撞 429 后等多久再试。AniList 的限流窗以分钟计，10 秒太短（实测连吃 5 个 429） */
const RATE_LIMIT_WAIT_MS = 15_000;

/** 单段翻页的防呆上限（一段 5000 个 id 理论上最多 ~500 条动画 = 10 页） */
const MAX_PAGES_PER_CHUNK = 100;

/** 输出目录 = 脚本自身旁边的 ../data */
const DATA_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "data");
const SNAPSHOT_PATH = path.join(DATA_DIR, ".catalog-snapshot.json");
const COUNTS_PATH = path.join(DATA_DIR, "catalog-counts.json");

/**
 * 快照里的一行。**列的顺序是契约**——fetch-title-zh 的 --scope=catalog 按这个顺序读。
 * 用数组而不是对象是为了压体积（两万行 × 七个字段）。
 */
const COLUMNS = ["id", "native", "romaji", "english", "year", "popularity", "country"] as const;
type Row = [
  number,
  string | null,
  string | null,
  string | null,
  number | null,
  number | null,
  string | null,
];

interface MediaNode {
  id: number;
  title: { native: string | null; romaji: string | null; english: string | null };
  startDate: { year: number | null } | null;
  popularity: number | null;
  countryOfOrigin: string | null;
}

interface GqlResponse {
  data?: { Page?: { media?: MediaNode[] } };
  errors?: { message: string }[];
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** 毫秒 → "3分12秒"（同 fetch-title-zh 的写法） */
function formatDuration(ms: number): string {
  const totalSeconds = Math.round(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return minutes > 0 ? `${minutes}分${seconds}秒` : `${seconds}秒`;
}

/**
 * 发一个 GraphQL 请求（带 429/网络重试）。
 *
 * ⚠️ 每次重试都打一行日志——首版只在整段扫完后打一行，跑得慢时完全看不出
 * 是"在正常翻页"还是"卡在重试里"（实测首版卡了十几分钟没有输出，只能杀掉重来）。
 * 长跑脚本的可见性和速度一样重要。
 */
async function gql(query: string, variables: Record<string, unknown>): Promise<GqlResponse> {
  let lastError: unknown;
  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      const response = await fetch(ANILIST_ENDPOINT, {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify({ query, variables }),
        signal: AbortSignal.timeout(20_000),
      });
      if (response.status === 429) {
        // ⚠️ 429 也要记 lastError——不然重试耗尽后抛出的是 "undefined"（首版踩过）
        lastError = new Error("429 限流");
        console.log(`     （429 限流，等 ${RATE_LIMIT_WAIT_MS / 1000} 秒重试）`);
        await sleep(RATE_LIMIT_WAIT_MS);
        continue;
      }
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }
      const json = (await response.json()) as GqlResponse;
      if (json.errors?.length) {
        throw new Error(json.errors.map((e) => e.message).join("; "));
      }
      return json;
    } catch (error) {
      lastError = error;
      console.log(
        `     （请求失败，第 ${attempt + 1} 次重试：${error instanceof Error ? error.message : String(error)}）`,
      );
      await sleep(3000);
    }
  }
  throw new Error(
    `请求失败（重试 ${MAX_RETRIES} 次后）：${lastError instanceof Error ? lastError.message : String(lastError)}`,
  );
}

/** 扫一个 id 段（[start, end] 闭区间），返回段内全部动画 */
async function sweepChunk(start: number, end: number): Promise<MediaNode[]> {
  const ids = Array.from({ length: end - start + 1 }, (_, i) => start + i);
  const collected: MediaNode[] = [];

  const query = `
    query CatalogPage($ids: [Int], $page: Int!) {
      Page(page: $page, perPage: ${PER_PAGE}) {
        media(type: ANIME, isAdult: false, id_in: $ids, sort: ID) {
          id
          title { native romaji english }
          startDate { year }
          popularity
          countryOfOrigin
        }
      }
    }
  `;

  for (let page = 1; page <= MAX_PAGES_PER_CHUNK; page++) {
    const pageStartedAt = Date.now();
    const json = await gql(query, { ids, page });
    const media = json.data?.Page?.media ?? [];
    collected.push(...media);
    // 每页一行日志（见 gql 头注释：长跑脚本的可见性很重要）
    console.log(
      `   · 页 ${page}：+${media.length}（段累计 ${collected.length}，本页 ${((Date.now() - pageStartedAt) / 1000).toFixed(1)}s）`,
    );
    if (media.length < PER_PAGE) {
      return collected;
    }
    await sleep(REQUEST_DELAY_MS);
  }
  throw new Error(`段 ${start}~${end} 翻了 ${MAX_PAGES_PER_CHUNK} 页还没到底——段太大，把 CHUNK_SIZE 调小`);
}

async function main(): Promise<void> {
  const startedAt = Date.now();
  const force = process.argv.includes("--force");
  console.log("全库清点：扫 AniList 全部非成人动画条目（ID 区间扫描）\n");

  // ── 断点续跑：读上次的快照，从"已扫到的最大 id"的下一段继续 ──
  // （2026-10-09 加：首轮跑到第 30 段撞上一串 429 崩了，前面 24 分钟全白跑。
  //   每段本来就在存盘，重启时把已有快照读回来接着扫即可。）
  let rows: Row[] = [];
  const seen = new Set<number>();
  if (!force) {
    const existing = await readSnapshotSafe();
    if (existing && existing.length > 0) {
      rows = existing;
      for (const row of rows) {
        seen.add(row[0]);
      }
      console.log(`发现已有快照 ${rows.length} 条（--force 可忽略它重扫）`);
    }
  }

  // 先问最大 id（sort ID_DESC 取第一条）
  const maxJson = await gql(
    `query { Page(page: 1, perPage: 1) { media(type: ANIME, isAdult: false, sort: ID_DESC) { id } } }`,
    {},
  );
  const maxId = maxJson.data?.Page?.media?.[0]?.id;
  if (!maxId) {
    throw new Error("拿不到最大 id，检查网络后重跑");
  }
  const chunkCount = Math.ceil(maxId / CHUNK_SIZE);

  // 续跑起点：已扫最大 id 落在第 k 段 → 从第 k+1 段继续。
  // ⚠️ 只会重扫、不会跳段——多扫一段只是浪费几分钟，跳一段是永久缺数据。
  const maxSeenId = rows.length > 0 ? Math.max(...rows.map((row) => row[0])) : 0;
  const resumeFrom = maxSeenId > 0 ? Math.floor(maxSeenId / CHUNK_SIZE) + 1 : 1;
  console.log(
    `最大动画 id：${maxId}，切成 ${chunkCount} 段（每段 ${CHUNK_SIZE} 个 id）；` +
      (resumeFrom > 1 ? `从第 ${resumeFrom} 段继续\n` : `从头开始\n`),
  );

  let chunkIndex = resumeFrom - 1;
  for (let start = (resumeFrom - 1) * CHUNK_SIZE + 1; start <= maxId; start += CHUNK_SIZE) {
    const end = Math.min(start + CHUNK_SIZE - 1, maxId);
    chunkIndex++;

    let chunk: MediaNode[];
    try {
      chunk = await sweepChunk(start, end);
    } catch (error) {
      // 某段失败：先存盘保住断点，再抛出——重跑本脚本会从这一段继续
      await saveSnapshot(rows);
      console.log(
        `\n⚠️ 段 ${chunkIndex} 失败，已保存进度（${rows.length} 条）。重跑会自动从本段继续。`,
      );
      throw error;
    }

    for (const node of chunk) {
      if (seen.has(node.id)) {
        continue; // 续跑重扫段的去重（同一段可能被扫两遍，见 resumeFrom 注释）
      }
      seen.add(node.id);
      rows.push([
        node.id,
        node.title?.native ?? null,
        node.title?.romaji ?? null,
        node.title?.english ?? null,
        node.startDate?.year ?? null,
        node.popularity ?? null,
        node.countryOfOrigin ?? null,
      ]);
    }

    // 每段存一次盘（中途挂了不白跑——重跑从断点续）
    await saveSnapshot(rows);

    const elapsed = Date.now() - startedAt;
    const remain = (elapsed / Math.max(1, chunkIndex - resumeFrom + 1)) * (chunkCount - chunkIndex);
    console.log(
      `── 段 ${chunkIndex}/${chunkCount}（id ${start}~${end}）：本段 ${chunk.length} 条，` +
        `累计 ${rows.length} 条；用时 ${formatDuration(elapsed)}，预计还剩 ${formatDuration(remain)}`,
    );

    await sleep(REQUEST_DELAY_MS);
  }

  await saveSnapshot(rows);
  await saveCounts(rows);

  console.log(`\n清点完成：共 ${rows.length} 条非成人动画条目`);
  console.log(`快照：${SNAPSHOT_PATH}`);
  console.log(`计数：${COUNTS_PATH}`);
  console.log(`用时 ${formatDuration(Date.now() - startedAt)}`);

  // 粗略体检：全库应该在一万五以上（2026-10-09 实测 ~2 万）。
  // 远低于这个数说明扫描有漏，别把脏数据往下游传。
  if (rows.length < 12_000) {
    console.log(`⚠️ 总条目数只有 ${rows.length}——偏少，先别跑下游脚本，检查扫描逻辑`);
  }
}

/** 读已有快照（断点续跑用）。不存在或坏了都当没有——不能让一个坏文件拦住重跑 */
async function readSnapshotSafe(): Promise<Row[] | null> {
  try {
    const raw = await readFile(SNAPSHOT_PATH, "utf8");
    const parsed = JSON.parse(raw) as { rows?: Row[] };
    return Array.isArray(parsed.rows) ? parsed.rows : null;
  } catch {
    return null;
  }
}

/** 存快照（列契约见 COLUMNS 注释） */
async function saveSnapshot(rows: Row[]): Promise<void> {
  await mkdir(DATA_DIR, { recursive: true });
  const payload = {
    generatedAt: new Date().toISOString().slice(0, 10),
    columns: COLUMNS,
    total: rows.length,
    rows,
  };
  // 快照是中间产物、不给人读——紧凑存，省一半体积
  await writeFile(SNAPSHOT_PATH, JSON.stringify(payload), "utf8");
}

/** 汇总计数并写 counts 文件（进 git，浏览页要读） */
async function saveCounts(rows: Row[]): Promise<void> {
  const byYear: Record<string, number> = {};
  let undated = 0;

  for (const row of rows) {
    const year = row[4];
    if (year === null) {
      undated++;
      continue;
    }
    const key = String(year);
    byYear[key] = (byYear[key] ?? 0) + 1;
  }

  const sortedByYear: Record<string, number> = {};
  for (const key of Object.keys(byYear).sort((a, b) => Number(a) - Number(b))) {
    sortedByYear[key] = byYear[key];
  }

  const payload = {
    generatedAt: new Date().toISOString().slice(0, 10),
    total: rows.length,
    undated,
    byYear: sortedByYear,
  };
  await writeFile(COUNTS_PATH, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
}

await main();
