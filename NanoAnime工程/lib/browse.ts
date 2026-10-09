// 「全部番剧」浏览页的筛选维度（2026-10-09）。
//
// 这个文件管「网址参数 ↔ 界面选项」的翻译：合法值白名单、默认值、
// 以及"点了某个选项之后该跳到哪个网址"。与 AniList 的查询拼装分开，
// 在 lib/anilist.ts 的 fetchBrowseAnime 里。
//
// ⚠️ 筛选状态全部存在网址里（?format=MOVIE&year=2024），组件不存任何状态——
// 好处：可分享、可收藏、刷新不丢、浏览器返回键能退回上一组筛选。
// 也正因为参数进了网址（用户可以随手改），**每个维度都要白名单校验**。
//
// ⚠️ 本文件目前只被服务端组件引用。**不要**在客户端组件里 import 它——
// 它带着 Bangumi 中文名索引（title-zh.json，体量不小），进客户端包就亏大了。

import { getTitleZh, withBangumiRating } from "@/lib/bangumi-index";
import type { BrowseQuery, BrowseSort } from "@/lib/anilist";
import type { Anime, MediaFormat } from "@/types/anime";

/** 一个筛选选项：value 是存进网址的值，label 是界面文字 */
export interface BrowseOption {
  value: string;
  label: string;
}

/** 形式行（value 空 = 全部） */
export const FORMAT_OPTIONS: BrowseOption[] = [
  { value: "", label: "全部" },
  { value: "TV", label: "TV 动画" },
  { value: "MOVIE", label: "剧场版" },
  { value: "TV_SHORT", label: "泡面番" },
  { value: "OVA", label: "OVA" },
  { value: "ONA", label: "网络动画" },
  { value: "OTHER", label: "其他" },
];

/**
 * 形式 value → AniList 的 format 列表。
 * 「其他」= 特别篇 + 音乐——参考图里没有这两项，但 AniList 上真实存在，
 * 总得给它们一个去处。OAD 不单列（AniList 的概念里并入 OVA）。
 */
export const FORMAT_TO_ANILIST: Record<string, MediaFormat[]> = {
  TV: ["TV"],
  MOVIE: ["MOVIE"],
  TV_SHORT: ["TV_SHORT"],
  OVA: ["OVA"],
  ONA: ["ONA"],
  OTHER: ["SPECIAL", "MUSIC"],
};

/** 状态行 */
export const STATUS_OPTIONS: BrowseOption[] = [
  { value: "", label: "全部" },
  { value: "RELEASING", label: "连载中" },
  { value: "FINISHED", label: "完结" },
];

/**
 * 年份按年列到哪一年为止（更早的归年代档）。
 *
 * 2026-10-09 全年代扩容：原来只列到 2010、更早的全部挤在一个「更早」档里——
 * 老番没有单独的年份入口，而且那一档的条目数远超数据源单次查询的 5000 上限、
 * 翻不到底。现在 2000 年起按年列，2000 年以前按年代档（见 DECADE_BUCKETS）。
 */
export const FIRST_YEAR_WITH_INDIVIDUAL_PILL = 2000;

/**
 * 年代档（2000 年以前，按十年一档）。
 *
 * ⚠️ 每一档的全库条目数必须小于**数据源单次查询的 5000 上限**，否则档内翻不到底
 * （见 lib/anilist.ts 的 BROWSE_MAX_PAGE）。定档时用全库清点（data/catalog-counts.json）
 * 核算过——2026-10-09 实测：90 年代 1874、80 年代 1316、70 年代 543、更早（≤1969）591，
 * 每一档都远小于 5000，全档可翻到底。（顺带：单年最大 2021 年也才 945 条，年份粒度全部安全。）
 */
export const DECADE_BUCKETS = [
  { value: "1990s", label: "90 年代", from: 1990, to: 1999 },
  { value: "1980s", label: "80 年代", from: 1980, to: 1989 },
  { value: "1970s", label: "70 年代", from: 1970, to: 1979 },
] as const;

/** 「更早」档的上界（含）：1970 年以前都归它 */
export const EARLIER_UNTIL = 1969;

/** 年份行（动态生成：今年 → 2000 按年；2000 年以前按年代档 + 「更早」） */
export function getYearOptions(now: Date = new Date()): BrowseOption[] {
  const options: BrowseOption[] = [{ value: "", label: "全部" }];
  for (let year = now.getFullYear(); year >= FIRST_YEAR_WITH_INDIVIDUAL_PILL; year--) {
    options.push({ value: String(year), label: String(year) });
  }
  for (const bucket of DECADE_BUCKETS) {
    options.push({ value: bucket.value, label: bucket.label });
  }
  options.push({ value: "earlier", label: "更早" });
  return options;
}

/**
 * 标签行的一个选项。
 *
 * ⚠️ 每个标签要标明走 AniList 的哪个参数：
 *   · genre —— 19 个顶级分类（奇幻、恋爱、科幻……）
 *   · tag   —— 细分标签（校园、异世界、漫画改……）
 * 界面上两者混在同一行显示（都是一枚胶囊），但查询时必须分开走
 * 对应参数（见 toBrowseQuery）。
 *
 * 中文名对齐参考图（Bangumi 的说法），但**只用 AniList 真实存在的概念**：
 * 参考图的「战斗」改「动作」（Action）、「穿越」改「异世界」（Isekai）、
 * 「机战」改「机甲」（Mecha）——数据源没有的概念不硬凑。
 */
export interface BrowseTagOption extends BrowseOption {
  kind: "genre" | "tag";
}

export const TAG_OPTIONS: BrowseTagOption[] = [
  { value: "", label: "全部", kind: "genre" },
  { value: "Fantasy", label: "奇幻", kind: "genre" },
  { value: "Romance", label: "恋爱", kind: "genre" },
  { value: "Sci-Fi", label: "科幻", kind: "genre" },
  { value: "Mystery", label: "悬疑", kind: "genre" },
  { value: "Adventure", label: "冒险", kind: "genre" },
  { value: "Slice of Life", label: "日常", kind: "genre" },
  { value: "Music", label: "音乐", kind: "genre" },
  { value: "Sports", label: "运动", kind: "genre" },
  { value: "Mecha", label: "机甲", kind: "genre" },
  { value: "Comedy", label: "喜剧", kind: "genre" },
  { value: "Action", label: "动作", kind: "genre" },
  { value: "School", label: "校园", kind: "tag" },
  { value: "Isekai", label: "异世界", kind: "tag" },
  { value: "Yuri", label: "百合", kind: "tag" },
  { value: "Harem", label: "后宫", kind: "tag" },
  { value: "Shounen", label: "少年向", kind: "tag" },
  { value: "Shoujo", label: "少女向", kind: "tag" },
  { value: "Seinen", label: "青年向", kind: "tag" },
  { value: "Workplace", label: "职场", kind: "tag" },
  { value: "Cooking", label: "美食", kind: "tag" },
  { value: "Detective", label: "推理", kind: "tag" },
  { value: "Manga", label: "漫画改", kind: "tag" },
  { value: "Novel", label: "小说改", kind: "tag" },
  { value: "Original Work", label: "原创", kind: "tag" },
  { value: "Video Game", label: "游戏改", kind: "tag" },
];

/** 排序行（value 永远有值——排序不存在"全部"，默认热度） */
export const SORT_OPTIONS: BrowseOption[] = [
  { value: "popularity", label: "热度" },
  { value: "title", label: "标题" },
  { value: "score", label: "评分" },
  { value: "newest", label: "最新" },
];

/** 排序 value → AniList 的 MediaSort */
export const SORT_TO_ANILIST: Record<string, BrowseSort> = {
  popularity: "POPULARITY_DESC",
  title: "TITLE_ROMAJI",
  score: "SCORE_DESC",
  newest: "START_DATE_DESC",
};

/** 规范化之后的筛选状态。空串 = 该维度不筛 */
export interface BrowseParams {
  format: string;
  status: string;
  year: string;
  tag: string;
  sort: string;
  page: number;
}

/** 默认筛选：全部 / 全部 / 全部 / 全部 / 热度 / 第 1 页 */
export const DEFAULT_BROWSE_PARAMS: BrowseParams = {
  format: "",
  status: "",
  year: "",
  tag: "",
  sort: "popularity",
  page: 1,
};

/** URL 参数 → 规范化的筛选状态。任何非法值静默回退默认（网址是用户可改的） */
export function parseBrowseParams(
  raw: Record<string, string | string[] | undefined>,
): BrowseParams {
  const one = (value: string | string[] | undefined): string =>
    typeof value === "string" ? value : "";
  const pick = (options: BrowseOption[], value: string): string =>
    options.some((option) => option.value === value) ? value : "";

  const pageRaw = Number.parseInt(one(raw.page), 10);
  // 上限 10000 只是防呆——AniList 对超范围的 page 会自己返回空页
  const page = Number.isFinite(pageRaw) && pageRaw >= 1 ? Math.min(pageRaw, 10000) : 1;

  const sortRaw = one(raw.sort);

  return {
    format: pick(FORMAT_OPTIONS, one(raw.format)),
    status: pick(STATUS_OPTIONS, one(raw.status)),
    year: pick(getYearOptions(), one(raw.year)),
    tag: pick(TAG_OPTIONS, one(raw.tag)),
    sort: SORT_OPTIONS.some((option) => option.value === sortRaw) ? sortRaw : "popularity",
    page,
  };
}

/**
 * 从当前筛选状态生成新链接（每个筛选胶囊 / 翻页按钮的 Link 都用它）。
 *
 * ⚠️ 换筛选或排序时**自动回到第 1 页**：人在第 5 页把形式改成"剧场版"，
 * 结果集整个换了、没有"第 5 页"可言——不重置的话用户会看到一片空白，
 * 还以为没有结果。翻页时显式传 page，跳过这个重置。
 *
 * 默认值不写进网址（"/browse" 而不是 "/browse?sort=popularity&page=1"）。
 */
export function buildBrowseHref(current: BrowseParams, patch: Partial<BrowseParams>): string {
  const next: BrowseParams = { ...current, ...patch };
  if (patch.page === undefined) {
    next.page = 1;
  }

  const query = new URLSearchParams();
  if (next.format) query.set("format", next.format);
  if (next.status) query.set("status", next.status);
  if (next.year) query.set("year", next.year);
  if (next.tag) query.set("tag", next.tag);
  if (next.sort !== "popularity") query.set("sort", next.sort);
  if (next.page > 1) query.set("page", String(next.page));

  const text = query.toString();
  return text ? `/browse?${text}` : "/browse";
}

/**
 * 年份 value → startDate 的日期区间（FuzzyDateInt，形如 20241231）。
 *
 * ⚠️ 边界都用"另一年的端点"表达（2024 年 = 大于 20231231 且小于 20250101），
 * 这样不用纠结 FuzzyDateInt 的比较到底带不带等号——端点本身都落在
 * 目标年之外，怎么比都进退不了目标年。
 */
export function toYearRange(year: string): { greater: number | null; lesser: number | null } {
  if (year === "earlier") {
    // 「更早」= 1970 年之前（严格小于 19700101，即 ≤ 1969 年）。
    //
    // ⚠️ 下界写 1、不写 null：AniList 的日期筛选把**没填日期的条目当 0 处理**——
    // 只给 lesser 一个条件时，未定档的作品（0 < 19700101）会全部混进来。
    // 2026-10-09 实测踩到：「更早」第一屏全是"待开播"的新番（孤独摇滚 2 期……）。
    // greater: 1 把 0 挡在界外，又不会伤到任何真实日期（现存最早是 1907 年）。
    return { greater: 1, lesser: (EARLIER_UNTIL + 1) * 10000 + 101 };
  }
  const bucket = DECADE_BUCKETS.find((item) => item.value === year);
  if (bucket) {
    // 年代档是闭区间 [from, to]，用同一套"另一年的端点"表达
    return { greater: (bucket.from - 1) * 10000 + 1231, lesser: (bucket.to + 1) * 10000 + 101 };
  }
  const value = Number.parseInt(year, 10);
  if (!Number.isFinite(value)) {
    return { greater: null, lesser: null };
  }
  return { greater: (value - 1) * 10000 + 1231, lesser: (value + 1) * 10000 + 101 };
}

/** 规范化筛选状态 → AniList 的查询参数（lib/anilist.ts 的 fetchBrowseAnime 的输入） */
export function toBrowseQuery(params: BrowseParams): BrowseQuery {
  const tagOption = TAG_OPTIONS.find((option) => option.value !== "" && option.value === params.tag);
  const range = toYearRange(params.year);

  return {
    formatIn: FORMAT_TO_ANILIST[params.format] ?? null,
    // 状态在 parseBrowseParams 里已经过白名单，这里再收窄一次类型（string → MediaStatus）
    status:
      params.status === "RELEASING" || params.status === "FINISHED" ? params.status : null,
    dateGreater: range.greater,
    dateLesser: range.lesser,
    tagValue: tagOption?.value ?? null,
    tagKind: tagOption?.kind ?? "genre",
    sort: SORT_TO_ANILIST[params.sort] ?? "POPULARITY_DESC",
    page: params.page,
  };
}

/**
 * 逐条补本地表里的数据：中文名 + Bangumi 评分/排名。
 * （中文名那部分与 lib/bangumi-index.ts 的 attachChineseTitles 同一口径；
 * 那个接 SeasonAnimeResult 形状、这里是 Anime[]，所以各自实现。）
 * 配不上的字段保持 null——展示层会据此降级（退回日文原名 / 不显示评分）。
 */
export function attachLocalData(anime: Anime[]): Anime[] {
  return anime.map((item) =>
    withBangumiRating({
      ...item,
      title: { ...item.title, zh: getTitleZh(item.id) },
    }),
  );
}
