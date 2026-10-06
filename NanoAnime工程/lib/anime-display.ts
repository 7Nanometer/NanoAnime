// 展示层：把 AniList 的数据整理成卡片上要显示的文字。
// 所有「字段可能缺失」的判断都集中在这里，页面组件里就不用到处写 ?? 兜底了。

import type { SeriesRelationType } from "@/lib/series-graph";
import type { Anime, AnimeDetail, DateParts, MediaFormat, MediaSeason, MediaStatus } from "@/types/anime";

/**
 * 一周七天。下标正好是 `getUTCDay()` 的返回值（0 = 周日）。
 * 日历页要按「周一到周日」排，用 `WEEKDAYS[(i + 1) % 7]` 换算即可（见 lib/calendar.ts）。
 */
export const WEEKDAYS = ["周日", "周一", "周二", "周三", "周四", "周五", "周六"];

/** 季度缩写翻译成中文 */
const SEASON_LABELS: Record<MediaSeason, string> = {
  WINTER: "冬",
  SPRING: "春",
  SUMMER: "夏",
  FALL: "秋",
};

/**
 * 连名字都没有时的最后兜底，保证卡片上永远不会出现空字符串。
 * 导出是给 lib/watch.ts 用的：它要判断「是不是连名字都没有」，
 * 拿「未知作品」去搜索引擎搜等于瞎搜，那种情况就不该给搜索链接。
 */
export const UNKNOWN_TITLE = "未知作品";

/** 字段缺失时统一显示的破折号。绝不返回 null / 空串，界面上不会出现空洞 */
const DASH = "—";

/** 作品类型的中文名 */
const FORMAT_LABELS: Record<MediaFormat, string> = {
  TV: "TV 动画",
  TV_SHORT: "泡面番",
  MOVIE: "剧场版",
  SPECIAL: "特别篇",
  OVA: "OVA",
  ONA: "网络动画",
  MUSIC: "音乐",
};

/** 播出状态的中文名（不带排期信息的那种，详情页用） */
const STATUS_LABELS: Record<MediaStatus, string> = {
  RELEASING: "在播",
  FINISHED: "已完结",
  NOT_YET_RELEASED: "待开播",
  CANCELLED: "已取消",
  HIATUS: "停更中",
};

/**
 * 剧集列表最多列多少行。
 * 超过这个数（例：ONE PIECE 500 集）就不再逐集补齐，只列 AniList 真有排期的那部分，
 * 否则页面会渲染出几百行「—」。
 */
const EPISODE_LIST_LIMIT = 100;

/** 季度中文名，用于首页标题，例如「2026 年秋新番」 */
export function getSeasonLabel(season: MediaSeason): string {
  return SEASON_LABELS[season];
}

/**
 * 卡片主标题：优先中文名，没有中文名就退回 M0 的老规矩——
 * 日文原名 → 罗马音 → 英文名 → "未知作品"。
 *
 * 中文名由 Bangumi 补齐（见 lib/bangumi-index.ts）。**没配对上时 title.zh 是 null**，
 * 这里就自然退回日文原名，卡片不会空掉，也不会显示出错误的中文名。
 */
export function getPrimaryTitle(anime: Anime): string {
  return (
    anime.title.zh ??
    anime.title.native ??
    anime.title.romaji ??
    anime.title.english ??
    UNKNOWN_TITLE
  );
}

/**
 * 卡片副标题。分两种情况：
 * - 主标题是中文名时，副标题显示日文原名（两个名字一起看才有意义）
 * - 主标题还是日文原名时（＝这部没配上中文名），保持 M0 的规矩：显示英文名
 * 实在没有可显示的，就重复主标题，保证这一行永远不空。
 */
export function getSecondaryTitle(anime: Anime): string {
  const primary = getPrimaryTitle(anime);

  if (anime.title.zh && anime.title.native) {
    return anime.title.native;
  }

  return anime.title.english ?? primary;
}

/**
 * 更新状态。
 * 有下一集排期就写「周X 第N集」；没有排期的（已完结、未开播等）按状态给一句人话，
 * 绝不返回空字符串——否则卡片上会少一行。
 */
export function getAiringStatus(anime: Anime): string {
  const next = anime.nextAiringEpisode;
  if (next) {
    const weekday = WEEKDAYS[toBeijingTime(next.airingAt).getUTCDay()];
    return `${weekday} 第${next.episode}集`;
  }

  // 在播但查不到下一集时间时，比单说「在播」多给一句"排期待定"
  return anime.status === "RELEASING" ? "在播 · 排期待定" : getStatusLabel(anime.status);
}

/** 播出状态的中文名，例如「已完结」。不带排期信息，详情页的信息栏用 */
export function getStatusLabel(status: MediaStatus): string {
  return STATUS_LABELS[status];
}

/**
 * 首播年份，搜索结果卡片上用。
 * 搜索是跨年份的，同一部番的第 1 期和第 2 期名字很像，靠年份区分。
 * 没有年份时给「待定」，照旧不留空。
 */
export function getYearLabel(anime: Anime): string {
  return anime.startDate?.year ? `${anime.startDate.year} 年` : "年份待定";
}

/**
 * 集数与评分的附加信息。
 * 未开播的作品这两项常为空——只拼出存在的那部分；
 * 两个都没有时返回空字符串，调用方据此整行不渲染（而不是渲染一个空行）。
 */
export function getMetaLine(anime: Anime): string {
  const parts: string[] = [];
  if (anime.episodes !== null) {
    parts.push(`全 ${anime.episodes} 集`);
  }
  if (anime.averageScore !== null) {
    parts.push(`评分 ${anime.averageScore}`);
  }
  return parts.join(" · ");
}

/* ------------------------------------------------------------------ *
 * 以下是 M1-1 详情页用的取数函数
 * ------------------------------------------------------------------ */

/** 作品类型的中文名，例如「TV 动画」 */
export function getFormatLabel(format: MediaFormat): string {
  return FORMAT_LABELS[format];
}

/**
 * 年表里用的**短**形式标签。
 *
 * 和 getFormatLabel() 的区别：那个是详情页信息栏用的（「TV 动画」），
 * 在年表这种一行一条的窄列表里太长，会把标题挤没。
 *
 * AniList 将来加了新形式就**原样显示**，不硬翻。
 */
const SHORT_FORMAT_LABELS: Record<string, string> = {
  TV: "TV",
  TV_SHORT: "泡面番",
  MOVIE: "剧场版",
  SPECIAL: "特别篇",
  OVA: "OVA",
  ONA: "网络",
  MUSIC: "音乐",
};

/** 年表里的形式标签。取不到时给破折号，绝不留空 */
export function getShortFormatLabel(format: string | null): string {
  if (!format) {
    return DASH;
  }
  return SHORT_FORMAT_LABELS[format] ?? format;
}

/**
 * 年表里给**非正片**打的标签。
 *
 * 续作/前作不打标——它们就是正片本身，打上去每行都是标签反而看不清。
 * 只有「总集篇 / 外传 / 番外 / 另一版本」这类才需要提醒用户「这不是新的一季」。
 */
export function getSeriesTag(type: SeriesRelationType | null): string | null {
  switch (type) {
    case "ALTERNATIVE":
      return "另一版本";
    case "SUMMARY":
      return "总集篇";
    case "SIDE_STORY":
      return "外传";
    case "SPIN_OFF":
      return "番外";
    default:
      return null;
  }
}

/** 评分的显示值。AniList 是 0~100 的整数，没有评分时给破折号 */
export function getScoreLabel(score: number | null): string {
  return score === null ? DASH : String(score);
}

/** 制作公司。AniList 上很多番没填，没有就给破折号 */
export function getStudioNames(detail: AnimeDetail): string {
  return detail.studios.length > 0 ? detail.studios.join(" / ") : DASH;
}

/**
 * AniList 的日期转中文。残缺到什么精度就说到什么精度：
 * 完整给「2023年9月29日」，只有年月给「2023年9月」，只有年给「2023年」，全空给「待定」。
 */
export function formatDateParts(parts: DateParts | null): string {
  if (!parts?.year) {
    return "待定";
  }
  if (!parts.month) {
    return `${parts.year}年`;
  }
  if (!parts.day) {
    return `${parts.year}年${parts.month}月`;
  }
  return `${parts.year}年${parts.month}月${parts.day}日`;
}

/**
 * 播出时间区间，例如「2023年9月29日 ~ 2024年3月22日」。
 * 开始日期就没有时直接给「待定」；结束日期没有时只显示开始日期（不写「~ 待定」占位）。
 */
export function formatDateRange(start: DateParts | null, end: DateParts | null): string {
  if (!start?.year) {
    return "待定";
  }
  const from = formatDateParts(start);
  const to = end?.year ? formatDateParts(end) : null;
  return to && to !== from ? `${from} ~ ${to}` : from;
}

/** 剧集列表的完整结果 */
export interface EpisodeListResult {
  rows: EpisodeRow[];
  /** 是否因为集数太多而做了截断（截断时 rows 只含 AniList 有数据的集） */
  truncated: boolean;
  /** 理论上共有多少集（总集数与排期最大集号的较大者） */
  total: number;
}

/** 剧集列表里的一行 */
export interface EpisodeRow {
  /** 第几集 */
  number: number;
  /** 播出日期，形如「2023年10月6日」；AniList 没给这一集的排期时是「—」 */
  dateLabel: string;
  /** 英文集标题。绝大多数番没有，为 null——界面留空即可，不要填占位文字 */
  title: string | null;
}

/**
 * 生成剧集列表要显示的全部行。
 *
 * 规则（用户 2026-09-30 拍板）：**以总集数为准列全，没数据的那集日期填「—」**。
 * 不编造任何日期——AniList 实测对已完结的番可能缺开头几集（葬送のフリーレン就缺第 1~4 集），
 * 那几行的日期就老老实实显示「—」。
 *
 * 例外：集数超过 EPISODE_LIST_LIMIT 的（ONE PIECE 500 集），只列有排期数据的那几集，
 * 并回传 `truncated: true`，由界面写明"只列出了有数据的部分"。
 */
export function buildEpisodeRows(
  source: Pick<AnimeDetail, "episodes" | "episodeList">,
): EpisodeListResult {
  const byNumber = new Map(source.episodeList.map((episode) => [episode.number, episode]));

  // 集数上限取「总集数」与「排期里最大的集号」的较大者：
  // 未开播的番总集数常为 null，得靠排期推出来
  const maxScheduled = source.episodeList.reduce((max, item) => Math.max(max, item.number), 0);
  const total = Math.max(source.episodes ?? 0, maxScheduled);

  if (total === 0) {
    return { rows: [], truncated: false, total: 0 };
  }

  const truncated = total > EPISODE_LIST_LIMIT;
  const rows: EpisodeRow[] = [];

  for (let number = 1; number <= total; number++) {
    const episode = byNumber.get(number);
    // 超长番：没有排期的集直接跳过，否则会渲染出几百行破折号
    if (truncated && !episode) {
      continue;
    }
    rows.push({
      number,
      dateLabel: episode?.airingAt ? formatAiringAt(episode.airingAt) : DASH,
      title: episode?.title ?? null,
    });
  }

  return { rows, truncated, total };
}

/** 中国不实行夏令时，北京时间固定是 UTC+8，直接加偏移量即可，不需要 Intl */
const BEIJING_OFFSET_MS = 8 * 60 * 60 * 1000;

/**
 * 把 Unix 时间戳（秒）换算成**北京时间**。
 * 之后要用 getUTCFullYear / getUTCMonth / getUTCDate / getUTCDay 去读——
 * 加了偏移再用 UTC 取值，得到的就是北京时间的墙上时间。
 *
 * ⚠️ 为什么不能直接用 `new Date(ts * 1000).getFullYear()`：那取决于**运行环境**的时区。
 * 本地开发是 UTC+8 没问题，但 Vercel 的服务器跑在 UTC——深夜播出的番会整体差一天
 * （10 月 2 日 01:00 JST 在 UTC 下会显示成 10 月 1 日）。这个产品面向国内用户，
 * 一律按北京时间显示。
 */
export function toBeijingTime(airingAt: number): Date {
  return new Date(airingAt * 1000 + BEIJING_OFFSET_MS);
}

/** Unix 时间戳（秒）→「2023年10月6日」（北京时间） */
function formatAiringAt(airingAt: number): string {
  const date = toBeijingTime(airingAt);
  return `${date.getUTCFullYear()}年${date.getUTCMonth() + 1}月${date.getUTCDate()}日`;
}

/** 补足两位，例：7 → "07" */
function pad2(value: number): string {
  return String(value).padStart(2, "0");
}

/**
 * Unix 时间戳（秒）→ 北京时间的日期键，形如 `"2026-10-01"`。
 * 日历页用它把排期分到每一天，也用它判断「是不是今天」。
 * 为什么不用 `toISOString()` 直接切：那样得到的是 UTC 日期，深夜播出的番会差一天。
 */
export function getBeijingDateKey(airingAt: number): string {
  const date = toBeijingTime(airingAt);
  return `${date.getUTCFullYear()}-${pad2(date.getUTCMonth() + 1)}-${pad2(date.getUTCDate())}`;
}

/** Unix 时间戳（秒）→ 北京时间的时刻，形如 `"23:30"` */
export function getBeijingClock(airingAt: number): string {
  const date = toBeijingTime(airingAt);
  return `${pad2(date.getUTCHours())}:${pad2(date.getUTCMinutes())}`;
}
