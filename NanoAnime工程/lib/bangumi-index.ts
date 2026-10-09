// 读「Bangumi 本地表」的运行时入口：中文名（title-zh.json）+ 评分与排名（ratings.json）。
//
// 两张表都是离线脚本一次性从 Bangumi 抓下来的（scripts/fetch-title-zh.ts / fetch-ratings.ts），
// 应用运行时**只读文件，绝不实时请求 Bangumi**（原因见 lib/bangumi.ts 顶部注释）。
// 2026-10-09 起：站内所有评分的唯一口径就是 ratings.json 里的 Bangumi 分。
//
// 为什么和 lib/bangumi.ts 分成两个文件：那个文件要联网，而且要被 `node scripts/xxx.ts`
// 直接 import —— Node 不认 tsconfig 的 @ 别名，所以那边只能有纯类型导入。
// 这里反过来，要读本地 JSON，只能在 Next 里用。混在一起脚本就跑不起来了。

import rawIndex from "@/data/title-zh.json";
import rawRatings from "@/data/ratings.json";
import { rankLocalMatches, type LocalMatchCandidate } from "@/lib/local-match-rank";
import type { Anime, SeasonAnimeResult } from "@/types/anime";
import type { BangumiIndex, RatingsIndex } from "@/types/bangumi";

/**
 * JSON 导入的类型是按文件内容推断的，这里断言成我们约定的结构。
 * 文件由脚本生成，结构有 scripts/fetch-title-zh.ts 兜着。
 */
const INDEX = rawIndex as BangumiIndex;

/** 评分表（AniList id → Bangumi 评分/排名），由 scripts/fetch-ratings.ts 生成 */
const RATINGS = rawRatings as RatingsIndex;

/** 按 AniList 的 id 取中文名。没配对上的返回 null——不猜、不拿别的字段顶替 */
export function getTitleZh(anilistId: number): string | null {
  return INDEX[String(anilistId)]?.title_zh ?? null;
}

/**
 * Bangumi 简介里「原文分界」的标记。Bangumi 的简介常是这个结构：
 *
 *   中文译文……
 *   [简介原文]
 *   日文原文……
 *
 * 实测 1560 条有简介的条目里 **195 条**带这个标记（2026-10-06 核过全表）。
 * 语言判定和展示都只看**标记前的那半段**（译文位）——整段一起判会把
 * 中文简介误标成日文（见下面 isJapaneseParagraph 的注释）。
 */
const ORIGINAL_MARKER = "[简介原文]";

/**
 * 平假名占比阈值：平假名 ÷ (平假名 + 汉字) ≥ 0.2 才算日文。
 *
 * ⚠️ 这个 0.2 是拿全部 1560 条量出来的空档：中文译文段最高 **0.188**（辉夜姬物语，
 * 正文里引了日文原名），真日文段最低 **0.225**，阈值正好落在中间。
 *
 * 为什么**不能**用旧的「出现任何假名就算日文」：中文译文里夹片假名/平假名很常见
 * （人名、术语、日文原名，如「灵能百分百」的「モブ」、「银魂」的「あまんと」），
 * 旧规则把其中 **272 条中文（或中文+日文混排）简介误标成了日文**——
 * 后果是详情页在一段中文上面写「暂无中文」，说假话。
 *
 * 也不能只看片假名——恰恰是片假名最容易出现在中文译文里（人名/招式名/术语），
 * 平假名才是日文句子真正的信号（助词、词尾）。
 */
const JAPANESE_HIRAGANA_RATIO = 0.2;

/** 数一段文字里某类字符的个数 */
function countChars(text: string, pattern: RegExp): number {
  return text.match(pattern)?.length ?? 0;
}

/** 按平假名占比判断这一段是不是日文（判定规则见 JAPANESE_HIRAGANA_RATIO 的注释） */
function isJapaneseParagraph(text: string): boolean {
  const hiragana = countChars(text, /[぀-ゟ]/g);
  const han = countChars(text, /[一-鿿㐀-䶿]/g);
  if (hiragana + han === 0) {
    return false;
  }
  return hiragana / (hiragana + han) >= JAPANESE_HIRAGANA_RATIO;
}

/**
 * 把 Bangumi 的原始简介拆成「正文 + 是不是日文」。
 * 正文取 `[简介原文]` 标记前的那半段；标记前为空时退回标记后（整篇都是原文）。
 */
function splitSummary(raw: string): BangumiSummary {
  const markerAt = raw.indexOf(ORIGINAL_MARKER);
  const primary = (markerAt >= 0 ? raw.slice(0, markerAt) : raw).trim();

  if (primary === "") {
    return {
      text: raw.slice(markerAt + ORIGINAL_MARKER.length).trim(),
      isJapanese: true,
    };
  }

  return { text: primary, isJapanese: isJapaneseParagraph(primary) };
}

/** 简介 + 它的语言 */
export interface BangumiSummary {
  text: string;
  /**
   * true = 这段正文是**日文原文**。
   *
   * ⚠️ 为什么会有日文：Bangumi 的新条目刚建立时，简介里填的是官方日文原文，
   * 要等志愿者后来翻译成中文。实测全表 1560 条里有 255 条如此。
   * 界面必须如实标注这一点，不能让用户以为中文简介加载错了。
   */
  isJapanese: boolean;
}

/**
 * 按 AniList 的 id 取简介。没配对上、或 Bangumi 上没填简介的返回 null。
 *
 * 详情页的简介优先用这个，拿不到才退回 AniList 的英文简介。
 * 注意旧版的 title-zh.json 里没有 summary 这个键，所以这里用 `?.` 兜着。
 *
 * 返回的 text 只含**标记前的主段**——`[简介原文]` 后面的日文原文不再细给
 * （2026-10-06 M7 定的：详情页此前会把两段连在一起显示，还会在中文上面
 * 挂「只有日文简介」的标注，是同一批文案失效问题）。
 */
export function getBangumiSummary(anilistId: number): BangumiSummary | null {
  const raw = INDEX[String(anilistId)]?.summary?.trim();
  if (!raw) {
    return null;
  }
  return splitSummary(raw);
}

/**
 * 拿中文关键词在本地对照表里找，返回命中的 AniList id，**已按相关度排好序**。
 *
 * 这是搜索功能**唯一**的中文入口：实测把本地 18 个中文名逐个喂给 AniList 的搜索接口，
 * 命中 0/18——AniList 根本没有中文索引。所以中文关键词只能靠这张表。
 *
 * 排序规则见 lib/local-match-rank.ts：先看匹配质量（完全相等 > 开头匹配 > 中间包含），
 * 同一档位内按 AniList 人气值从高到低。
 *
 * ⚠️ 这里**不能**沿用「文件里的顺序」：JSON 的数字键会被 JS 按从小到大枚举，
 * 那就等于「id 越小（越老）越靠前」。表只有 18 条时看不出来；扩到 1536 条后，
 * 搜「之」这种宽泛词（命中 155 部）取前 24 条，拿到的是**最老的 24 部**而不是最相关的。
 *
 * 关键词为空时返回空数组。
 */
export function findLocalMatches(keyword: string): number[] {
  const candidates: LocalMatchCandidate[] = Object.entries(INDEX).map(([anilistId, entry]) => ({
    anilistId: Number(anilistId),
    titleZh: entry.title_zh,
    // 旧版文件没有这个键 → undefined，交给 ?? 归一成 null（= 垫底，但不丢结果）
    popularity: entry.popularity ?? null,
  }));

  return rankLocalMatches(candidates, keyword);
}

/**
 * 把中文名并进一批番剧里。
 * 配不上的作品 title.zh 保持 null，展示层会据此退回日文原名。
 */
export function attachChineseTitles(result: SeasonAnimeResult): SeasonAnimeResult {
  return {
    ...result,
    anime: result.anime.map((anime) => ({
      ...anime,
      title: { ...anime.title, zh: getTitleZh(anime.id) },
    })),
  };
}

/** 按 AniList 的 id 取 Bangumi 评分（0~100 整数）。没配对上 / 没分为 null */
export function getBangumiRating(anilistId: number): number | null {
  return RATINGS[String(anilistId)]?.bangumi ?? null;
}

/**
 * 按 AniList 的 id 取 Bangumi 全站排名（动画榜名次）。
 * 没配对上 / 没上榜 / 旧数据还没抓过（rank 键不存在）一律 null。
 */
export function getBangumiRank(anilistId: number): number | null {
  return RATINGS[String(anilistId)]?.rank ?? null;
}

/**
 * 给一部番补上 Bangumi 评分与排名（纯函数，返回新对象）。
 * 全站评分口径统一走它——展示层只见 `anime.bangumiRating`，不再碰 averageScore。
 * ⚠️ 泛型是为了 AnimeDetail 这类扩展类型传入后不丢类型。
 */
export function withBangumiRating<T extends Anime>(anime: T): T {
  return {
    ...anime,
    bangumiRating: getBangumiRating(anime.id),
    bangumiRank: getBangumiRank(anime.id),
  };
}

/** 给一批番补评分（本季列表这样的批量场景） */
export function attachBangumiRatings<T extends { anime: Anime[] }>(result: T): T {
  return { ...result, anime: result.anime.map((item) => withBangumiRating(item)) };
}
