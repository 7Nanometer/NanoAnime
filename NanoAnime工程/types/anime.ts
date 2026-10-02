// 番剧相关的类型定义。字段名与 AniList 返回的保持一致，避免来回转换时出错。

/**
 * 季度。AniList 的划分是写死的，与月份一一对应：
 * WINTER = 1~3 月，SPRING = 4~6 月，SUMMER = 7~9 月，FALL = 10~12 月。
 */
export type MediaSeason = "WINTER" | "SPRING" | "SUMMER" | "FALL";

/** 播出状态 */
export type MediaStatus =
  | "FINISHED" // 已完结
  | "RELEASING" // 正在播
  | "NOT_YET_RELEASED" // 还没开播
  | "CANCELLED" // 已取消
  | "HIATUS"; // 停更中

/** 作品类型 */
export type MediaFormat =
  | "TV"
  | "TV_SHORT"
  | "MOVIE" // 剧场版
  | "SPECIAL"
  | "OVA"
  | "ONA" // 网络动画
  | "MUSIC";

/** 某一季的标识，例如「2026 年秋」 */
export interface SeasonRef {
  season: MediaSeason;
  seasonYear: number;
}

/**
 * AniList 的日期结构。未定档时整个为 null；
 * 年份定了但月/日没定时，只有 year 有值。展示层必须能处理这三种残缺程度。
 */
export interface DateParts {
  year: number | null;
  month: number | null;
  day: number | null;
}

/**
 * 一部番剧。AniList 上「没填」的字段会返回 null（不是缺字段），
 * 所以除了 id 之外全部允许为 null——卡片渲染时必须做兜底。
 */
export interface Anime {
  id: number;
  title: {
    native: string | null; // 日文原名
    english: string | null; // 英文名
    romaji: string | null; // 罗马音名
    /**
     * 中文名。AniList 没有这个字段，是 M1 从 Bangumi 一次性补齐后加进来的。
     * 取数时会在 lib/anilist.ts 里先填成 null（与 AniList「没填的字段返回 null」的习惯一致），
     * 再由 lib/bangumi-index.ts 的 attachChineseTitles() 换成真实中文名；
     * 没能配对上的作品，这里会一直是 null——展示层据此退回日文原名，不做任何猜测。
     */
    zh: string | null;
  };
  coverImage: {
    extraLarge: string | null; // 封面大图（图床 s4.anilist.co）
    large: string | null;
    color: string | null; // 封面主色，可当加载占位背景
  };
  episodes: number | null; // 总集数
  averageScore: number | null; // 评分，0~100
  /**
   * 首播日期。用途：M1 拿它跟 Bangumi 的放送开始年份比对（同一部番的新旧季度靠这个区分），
   * M1-1 详情页也要显示它。
   */
  startDate: DateParts | null;
  status: MediaStatus;
  format: MediaFormat;
  /** 下一集的播出信息；已完结或未定档时为 null */
  nextAiringEpisode: {
    episode: number; // 下一集是第几集
    airingAt: number; // 播出时间，Unix 时间戳（单位：秒）
  } | null;
}

/** 一季的番剧列表，附带这是哪一季 */
export interface SeasonAnimeResult extends SeasonRef {
  anime: Anime[];
}

/**
 * 搜索结果。
 * 放在这里而不是 lib/search.ts，是为了让客户端组件能用 `import type` 拿到它——
 * 那样不会把服务端模块（AniList 访问层、本地对照表）连带打进浏览器包里。
 */
export interface SearchResult {
  /** 实际用于搜索的关键词（已 trim） */
  keyword: string;
  anime: Anime[];
  /** 结果数撞到了上限——意味着可能还有更多，界面据此提示用户把关键词写具体点 */
  truncated: boolean;
}

/**
 * 一集。
 * ⚠️ AniList **没有逐集标题字段**。这里能拿到的标题只来自 `streamingEpisodes`
 * （Crunchyroll 的英文标题），所以大多数番的 title 是 null——展示层据此留空，不编造。
 */
export interface Episode {
  /** 第几集 */
  number: number;
  /** 播出时间，Unix 时间戳（单位：秒）。AniList 没给这一集的排期时为 null */
  airingAt: number | null;
  /** 英文集标题。绝大多数番没有，为 null */
  title: string | null;
}

/**
 * AniList 上的一部作品的外链。
 *
 * ⚠️ **拿到不等于能展示**。实测这批链接里混着两种不能直接给用户点的东西：
 * 「只有域名、没有具体页面」的空壳链接（占 39%，点进去是平台首页），
 * 以及 YouTube 的播放地址（`watch?v=`，碰红线）。
 * 展示前必须过 `lib/watch.ts` 的 `buildWatchLinks()`，那里有四道过滤。
 */
export interface ExternalLink {
  url: string;
  /** 平台名，例如 "Crunchyroll"，可直接当文案显示 */
  site: string;
  /** AniList 给的链接类型：STREAMING（观看）/ SOCIAL / INFO */
  type: string;
}

/**
 * 番剧详情（详情页用）。
 * 继承 Anime，这样 lib/anime-display.ts 里现成的 getPrimaryTitle / getAiringStatus
 * 等函数能直接复用，不必为详情页再写一套。
 */
export interface AnimeDetail extends Anime {
  /** 简介。已经在 lib/anilist.ts 里清掉了 HTML，没有简介时为 null */
  description: string | null;
  /** 只保留「动画制作公司」（AniList 的 isAnimationStudio 为 true 的那些） */
  studios: string[];
  endDate: DateParts | null;
  /** 单集时长，单位分钟 */
  duration: number | null;
  genres: string[];
  /** 剧集列表，按集号升序。**只包含 AniList 真有数据的那几集**，缺的由展示层补「—」 */
  episodeList: Episode[];
  /**
   * 作品的外链，**原样存着，不代表每条都能展示**。
   * 要显示「哪里能看」请走 `lib/watch.ts` 的 `buildWatchLinks()`，那里会筛掉空壳链接和播放地址。
   */
  externalLinks: ExternalLink[];
}

/**
 * 排期里的一条：某部番的某一集，在某个时刻播出。
 * 日历页的一格就是一条这个。由 lib/anilist.ts 的 fetchWeekSchedule() 产出。
 */
export interface ScheduleEntry {
  anime: Anime;
  /** 第几集 */
  episode: number;
  /** 播出时间，Unix 时间戳（单位：秒） */
  airingAt: number;
}

/** 日历里的一天 */
export interface CalendarDay {
  /** 北京时间的日期，形如 `"2026-10-01"`。同时也是把排期分到每一天用的键 */
  dateKey: string;
  /** 星期几，形如「周四」 */
  weekdayLabel: string;
  /** 月日，形如「10月1日」 */
  dateLabel: string;
  /** 是不是今天。**由服务端按北京时间判定**，客户端直接照用，不自己算 */
  isToday: boolean;
  /** 这天播出的全部剧集，按播出时间升序 */
  entries: ScheduleEntry[];
}

/**
 * 一周的日历。
 * 放在 types/ 而不是 lib/calendar.ts，是因为客户端组件要用 `import type` 拿它——
 * 那样不会把服务端模块（AniList 访问层、本地对照表）连带打进浏览器包里。
 */
export interface CalendarResult {
  /** 周一，形如 `"2026-09-28"` */
  weekStart: string;
  /** 周日，形如 `"2026-10-04"` */
  weekEnd: string;
  /** 周一到周日共 7 天，顺序固定（中文日历习惯，周一在最前） */
  days: CalendarDay[];
  /** 这一周一共多少集 */
  totalCount: number;
}

/**
 * 番剧 + 它的剧集排期。
 * 用途：`/my` 追番列表要一次拿到多部番的剧集数据（打钩用）。
 * 和 AnimeDetail 的区别：详情页要的是全量（简介、制作公司、类型…），
 * 这里只要画打钩列表所需的最小集合。
 */
export interface AnimeWithSchedule extends Anime {
  /** 剧集列表，按集号升序。**只包含 AniList 真有排期数据的那几集**，缺的由展示层补 */
  episodeList: Episode[];
}

/**
 * 一条本地追番记录。读写都在 lib/collection.ts 里，页面不许直接碰 localStorage。
 *
 * 字段刻意跟 `docs/产品方案.md` 里云端的 `collection` 表对齐——
 * 那边存的就是 (anime_id, progress, added_at)，这边一一对应，
 * 以后换 Supabase 时不用改造数据结构。
 */
export interface CollectionEntry {
  /** AniList 的番剧 id */
  animeId: number;
  /** 看到第几集。0 = 一集都没看。「打第 N 集」就是把它设成 N */
  progress: number;
  /** 加入追番的时间（Unix 毫秒） */
  addedAt: number;
  /**
   * 加入那一刻的番剧信息快照，**只用于显示，不是权威数据**。
   * 存它是为了 `/my` 能秒出，而且 AniList 超时或断网时列表照样在——
   * 否则「我追了哪些番」明明记在本地，却会看起来像丢了。
   * 拉到新数据后会被盖掉。
   */
  anime: Anime;
}
