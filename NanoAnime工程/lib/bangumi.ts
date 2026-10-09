// Bangumi（番组计划）数据访问层。
// 铁律（CLAUDE.md 第五条）：第三方请求必须走 lib/，不在页面组件里裸写 fetch。
//
// ⚠️ 这个模块**只在离线批量脚本里用**（scripts/fetch-title-zh.ts），应用运行时绝不调用它。
// 原因：Bangumi 在用户本机被墙（实测 DNS 被污染成 Facebook 的 IP、直连真实 IP 也会被重置），
// 挂代理才能访问。所以中文名是**一次性抓下来存成 data/title-zh.json**，
// 运行时读文件，不实时请求。
//
// ⚠️ 本文件只能写 `import type` 形式的别名导入（@/xxx），不能有运行时的别名导入——
// 脚本是用 `node scripts/fetch-title-zh.ts` 直接跑的，Node 不认 tsconfig 里的 @ 别名。
// 纯类型导入会被 Node 的类型剥离直接删掉，所以运行时不会去解析它。

import type { BangumiSearchResponse, BangumiSubject } from "@/types/bangumi";

const BANGUMI_SEARCH_ENDPOINT = "https://api.bgm.tv/v0/search/subjects";

/** 每次搜索取几条候选。取 10 条足够——相关度最高的几条里没有，多取也基本是噪音 */
const SEARCH_LIMIT = 10;

/**
 * Bangumi 要求在 User-Agent 里写明是谁在用它的接口，不带或写成浏览器会被拒。
 * 参考：https://github.com/bangumi/api —— "请务必在 User-Agent 中携带项目地址"
 */
const USER_AGENT = "NanoAnime/0.1 (https://github.com/7Nanometer/nanoanime)";

/** Bangumi 的条目类型：2 = 动画 */
const TYPE_ANIME = 2;

/** 请求失败时的重试次数（网络抖动不该直接让一部番配对失败） */
const MAX_RETRY = 1;

/** 单次请求的超时时间。挂了代理也偶有卡住，卡死会拖垮整轮脚本 */
const REQUEST_TIMEOUT_MS = 20_000;

/**
 * 按关键词搜 Bangumi 的动画条目。
 * @param keyword 关键词，我们固定用 AniList 的日文原名
 */
export async function searchBangumi(keyword: string): Promise<BangumiSubject[]> {
  let lastError: unknown;

  for (let attempt = 0; attempt <= MAX_RETRY; attempt++) {
    try {
      const response = await fetch(`${BANGUMI_SEARCH_ENDPOINT}?limit=${SEARCH_LIMIT}`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
          "User-Agent": USER_AGENT,
        },
        body: JSON.stringify({
          keyword,
          // 只搜动画，否则会搜到漫画、小说、音乐等同名条目
          filter: { type: [TYPE_ANIME] },
        }),
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      const json = (await response.json()) as BangumiSearchResponse;
      return json.data ?? [];
    } catch (error) {
      lastError = error;
    }
  }

  throw new Error(
    `搜索「${keyword}」失败：${lastError instanceof Error ? lastError.message : String(lastError)}`,
  );
}

/**
 * 从 Bangumi 的一批候选里，判定哪一条才是我们要的那部番。
 *
 * 判定标准是两条**同时**成立，缺一不认：
 *   1. 标题对得上（见下方 parseTitle 的说明）
 *   2. 年份相等（Bangumi 的放送开始年份 == AniList 的首播年份）
 *
 * 为什么必须卡年份：实测搜「葬送のフリーレン」，Bangumi 把 2023 年的第 1 期排在
 * 第 1 位、2026 年的第 2 期排在第 3 位——只看"第一条"会张冠李戴。
 *
 * 宁可返回 null（＝这部番没有中文名），也不猜。
 *
 * @param titles AniList 给的这部作品的全部名字（日文原名 / 罗马音 / 英文名），
 *               任意一个对得上就算数。实测有些作品 Bangumi 直接用英文名登记
 *               （如「サイバーパンク: エッジランナーズ2」在 Bangumi 叫
 *               "Cyberpunk: Edgerunners 2"），只拿日文原名比会白白漏掉。
 */
export function matchSubject(
  titles: (string | null | undefined)[],
  year: number | null,
  candidates: BangumiSubject[],
): MatchedSubject | null {
  if (year === null) {
    return null;
  }

  const targets = titles
    .filter((title): title is string => Boolean(title))
    .map(parseTitle)
    .filter((parsed): parsed is ParsedTitle => parsed !== null);

  if (targets.length === 0) {
    return null;
  }

  for (const candidate of candidates) {
    if (getStartYear(candidate.date) !== year) {
      continue;
    }
    // 条目对上了但没填中文名，对我们就没用——留空，别拿日文原名冒充
    if (!candidate.name_cn?.trim()) {
      continue;
    }

    const parsed = parseTitle(candidate.name);
    if (!parsed) {
      continue;
    }

    const hit = targets.some(
      (target) => target.base === parsed.base && target.season === parsed.season,
    );
    if (hit) {
      // 上面的 name_cn 判空已经保证了这里非空，展开一次让类型把这件事带上
      return { ...candidate, name_cn: candidate.name_cn };
    }
  }

  return null;
}

/** matchSubject 认下的条目：name_cn 保证是有内容的中文名字符串 */
export type MatchedSubject = BangumiSubject & { name_cn: string };

/** 标题拆开后的样子：基名 + 第几季 */
interface ParsedTitle {
  /** 归一化后的基名，「アオアシ 第2期」的基名是「アオアシ」 */
  base: string;
  /** 第几季。没有季数标记时为 null */
  season: number | null;
}

/**
 * 把标题拆成「基名 + 第几季」。
 *
 * 为什么要拆：同一部番的续作，AniList 和 Bangumi 的写法经常不一样。
 * 实测本季就有三对：`第2期` ↔ `2nd Season`（黑色五叶草）、`第2期` ↔ `Season 2`（青之芦苇）、
 * `第2期` ↔ `II`（转生就是剑）。这不是"两个候选选一个"，而是同一部作品的两种写法——
 * 所以做法是把两边的季数包装都剥掉，要求**基名完全相等、且季数完全相等**。
 * 基名不同、或季数不同（比如第 1 期 vs 第 2 期），一律不认。
 *
 * 季数标记只在**结尾**才认：「薬屋のひとりごと 第3期 第2クール」结尾是「第2クール」
 * （“第2部分”，不是第 2 季），不匹配任何一条规则，于是整个当基名——宁可漏配，不可错配。
 */
function parseTitle(title: string | null | undefined): ParsedTitle | null {
  if (!title) {
    return null;
  }

  const normalized = normalizeTitle(title);
  if (!normalized) {
    return null;
  }

  for (const [pattern, toSeason] of SEASON_PATTERNS) {
    const matched = pattern.exec(normalized);
    if (matched) {
      const base = matched[1];
      if (base) {
        return { base, season: toSeason(matched) };
      }
    }
  }

  return { base: normalized, season: null };
}

/**
 * 认得的季数写法。顺序有讲究：先长的后短的，否则「viii」会被「ii」抢先匹配掉。
 * 每条正则都必须以 `$` 收尾——季数标记只在标题结尾才算。
 */
const SEASON_PATTERNS: [RegExp, (m: RegExpExecArray) => number][] = [
  // 「第2期」「第2季」——AniList 最常用的写法
  [/^(.+?)第(\d+)[期季]$/, (m) => Number(m[2])],
  // 「2nd Season」「3rd Season」——Bangumi 爱用的写法，注意中间没有空格（已被去掉）
  [/^(.+?)(\d+)(?:st|nd|rd|th)season$/, (m) => Number(m[2])],
  // 「Season 2」——同上
  [/^(.+?)season(\d+)$/, (m) => Number(m[2])],
  // 「シーズン2」——同上，日文假名写法
  [/^(.+?)シーズン(\d+)$/, (m) => Number(m[2])],
  // 「II」「III」这类罗马数字。只认两字母以上的写法，单字母 I / V / X 风险太大不认
  [/^(.+?)(viii|vii|xii|iii|xi|ix|vi|iv|ii)$/, (m) => ROMAN_NUMERALS[m[2]]],
];

/** 罗马数字 → 阿拉伯数字。只列到 12，再长的季数用罗马数字写法极罕见 */
const ROMAN_NUMERALS: Record<string, number> = {
  ii: 2,
  iii: 3,
  iv: 4,
  vi: 6,
  vii: 7,
  viii: 8,
  ix: 9,
  xi: 11,
  xii: 12,
};

/**
 * 标题归一化：把"同一个标题的不同写法"抹平，但**尽量少抹**。
 * 只做这几件不会改变词义的事：Unicode 标准化、去掉所有空白、全角字母数字转半角、英文转小写。
 *
 * 故意**不去掉**标点符号，也不去掉长音符（`ー`）——去掉「シャドウ」和「シャドー」就撞车了。
 * 宁可漏配（留空），也不能错配。
 */
function normalizeTitle(title: string): string {
  return title
    .normalize("NFC")
    .replace(/\s+/g, "")
    .replace(/[Ａ-Ｚａ-ｚ０-９]/g, (char) =>
      String.fromCharCode(char.charCodeAt(0) - 0xfee0),
    )
    .toLowerCase();
}

/** 从 Bangumi 的 date 字段（"2023-09-29" / "2026" / null ）里取出年份 */
function getStartYear(date: string | null): number | null {
  const matched = /^(\d{4})/.exec(date?.trim() ?? "");
  return matched ? Number(matched[1]) : null;
}

// ────────────────────────────────────────────────────────────────────────────
// 评分（高分合集用）
// ────────────────────────────────────────────────────────────────────────────

/**
 * 取一个 Bangumi 条目的评分，归一成 **0~100 整数**（10 分制 ×10 后四舍五入）。
 * 没有评分（没人打分 / rating 缺失）返回 null。
 *
 * ⚠️ v0 API 对没评分的条目 `rating.score` 是 **0**——0 分不是"很差"，
 * 是"还没人打分"。直接 ×10 会得到一个假的 0 分，所以这里 <= 0 一律当没分。
 *
 * 调用方：`scripts/fetch-ratings.ts`（全表补分）与 `scripts/build-collections.ts`
 * （池内缺分作品的补抓）。放在 lib/ 是因为第三方请求必须走 lib（宪法铁律 2）。
 */
export async function fetchBangumiScore(bangumiId: number): Promise<number | null> {
  const response = await fetch(`https://api.bgm.tv/v0/subjects/${bangumiId}`, {
    headers: {
      // v0 API 建议带上 UA 表明身份（不带也能过，但这是它的规矩）
      "User-Agent": USER_AGENT,
      Accept: "application/json",
    },
    // 挂了代理也偶有卡住，卡死会拖垮整轮脚本（同 searchBangumi 的考虑）
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });
  if (!response.ok) {
    throw new Error(`HTTP ${response.status}`);
  }
  const json = (await response.json()) as { rating?: { score?: number } };
  const score = json.rating?.score ?? 0;
  return score > 0 ? Math.round(score * 10) : null;
}

/** Bangumi 条目的一次性评分 + 排名 */
export interface BangumiRatingDetail {
  /** 10 分制 ×10 → 0~100 整数；没人打分为 null */
  score: number | null;
  /** 全站排名；没上榜为 null */
  rank: number | null;
}

/**
 * 取 Bangumi 条目的**评分 + 排名**（一次请求两样都要，2026-10-09 加排名时新增）。
 *
 * 与 fetchBangumiScore 的差异只有一个：多取 `rating.rank`（排行榜名次）。
 * 两者并存是因为 build-collections 的补抓路径只需要分、而全表扫描（fetch-ratings）
 * 要一次拿全——不合并成一个函数是为了不动已经在跑的老路径。
 *
 * ⚠️ 与 score 同款的 API 怪癖：没上榜的条目 `rank` 是 **0**——0 不是"第 0 名"，
 * 是"没有名次"，所以 <= 0 一律当没有。
 */
export async function fetchBangumiRatingDetail(bangumiId: number): Promise<BangumiRatingDetail> {
  const response = await fetch(`https://api.bgm.tv/v0/subjects/${bangumiId}`, {
    headers: {
      "User-Agent": USER_AGENT,
      Accept: "application/json",
    },
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });
  if (!response.ok) {
    throw new Error(`HTTP ${response.status}`);
  }
  const json = (await response.json()) as { rating?: { score?: number; rank?: number } };
  const score = json.rating?.score ?? 0;
  const rank = json.rating?.rank ?? 0;
  return {
    score: score > 0 ? Math.round(score * 10) : null,
    rank: rank > 0 ? rank : null,
  };
}
