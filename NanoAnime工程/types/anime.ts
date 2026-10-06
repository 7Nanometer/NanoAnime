// 番剧相关的类型定义。字段名与 AniList 返回的保持一致，避免来回转换时出错。

import type { SeriesEdgeInfo } from "@/lib/series-graph";

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
  /**
   * 作品题材（AniList 的英文分类，如 Action / Sci-Fi）。首页焦点位取前几个当标签，
   * 中文名由 lib/anime-display.ts 的 getGenreLabel() 翻，没收录的原样显示英文。
   *
   * ⚠️ 可选：追番记录在 localStorage 里的「快照」是旧版应用写的（那时还没有这个字段），
   * 读回来时这里是 undefined——展示层用 `?? []` 兜住。
   */
  genres?: string[];
  /**
   * 横版横幅图，首页焦点位当背景用。AniList 上不少作品没填（null）；
   * 同样可能是 undefined（老的本地快照）。
   */
  bannerImage?: string | null;
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
  /**
   * 中文简介。**只有首页焦点位那几部会带**——服务端在 season 接口里只给人气前 5 部补
   * （95 部全带会把列表接口吹大好几倍），其余场景一律 undefined。
   * 只放**中文**简介：Bangumi 上还是日文原文的条目不进这个字段（焦点位不挂日文段落）。
   */
  summary?: string | null;
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
 * 制作人员名单里的一位。
 *
 * ⚠️ **已经按 AniList 的人物 id 去过重**（实测 20/20 部都有同一人因多个职位被反复登记，
 * 青之芦苇第二季第 1 页 25 条里只有 20 个不重复的人）。
 * 去重只能按 id，不能按姓名——按姓名会把同名的不同人合并掉。
 */
export interface StaffMember {
  /** AniList 的 Staff id。人物页要用它（本轮还不链） */
  id: number;
  /** 日文写法（AniList 的 native）。中文读者大部分能认，但复制去搜搜不到 */
  nameNative: string | null;
  /** 罗马音。要搜人时用这个 */
  nameFull: string | null;
  /**
   * 职位（AniList 的原文，**可能带集数后缀**，如 `Director (eps 1-479)`）。
   * 同一人身兼多职时按首次出现的顺序全部收在这里，界面用「 / 」连起来显示。
   *
   * ⚠️ 这里存的是**原文**，不是中文——转中文（去括号 + 查映射表）在展示层做，
   * 见 `lib/staff-roles.ts` 的 `getRoleLabel()`。这样 `lib/anilist.ts` 不必引入
   * 新依赖（它要被 `node scripts/xxx.ts` 按相对路径 import，多一个别名导入就当场跑不起来）。
   * 取不到职位时是空数组——界面**不显示空串、不显示空分隔符**。
   */
  roles: string[];
}

/**
 * 声优名单里的一行。**以声优为主体**，角色名只是挂靠。
 *
 * 为什么不以角色为主体：实测角色名 **47.9% 连一个汉字都没有**（主角名常写成片假名，
 * 比如「エレン・イェーガー」），中文读者认不出；而声优名 91% 是汉字，能认。
 */
export interface CastMember {
  /** AniList 的 Staff id（声优和制作人员共用一套 id）。人物页要用它（本轮还不链） */
  id: number;
  /** 声优名的日文写法 */
  nameNative: string | null;
  /** 声优名的罗马音 */
  nameFull: string | null;
  /** 他配的角色。角色名可能是 null（实测有），也可能全是假名——所以只作小字附注 */
  characterName: string | null;
  /** 这个角色在片中的分量：MAIN（主角）/ SUPPORTING / BACKGROUND。用于排序 */
  characterRole: string;
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
  /**
   * 这部作品的关系边，**原样存着（含白名单外那些）**。
   * 要显示系列年表请走 `lib/series.ts` 的 `fetchSeriesTimeline()`——
   * 白名单过滤和串图都在那边（规则本体在 lib/series-graph.ts）。
   */
  relations: SeriesEdgeInfo[];
  /**
   * 制作人员，**前 50 条（2 页）去重后**的结果。
   * 取 2 页是实测定的：四个核心职位（音乐/系列构成/人设/美术监督）最靠后落在第 27 位，
   * 1 页（25 条）拿不到，2 页正好。
   * ⚠️ 这不等于「全部」——实测进击的巨人在 150 条时仍未到底，界面上必须如实标注。
   */
  staff: StaffMember[];
  /**
   * 声优名单，**只含「有日语声优」的角色**（实测配齐率 96.7%、主角档 100%）。
   * 没有声优的角色不进这个名单——名单是以声优为主体的，没有声优就没有主体。
   */
  cast: CastMember[];
  /**
   * 被 `cast` 排除掉的角色数（没有日语声优的）。
   * 界面**只用它决定底部说哪句话**（真·0 角色 vs 有角色但都没有声优），
   * **绝不显示这个数字**——它数的是"拿到的那些角色边"（嵌套连接的 perPage 被截断在 25），
   * 是技术上限不是业务事实（实测灵笼真实 48 个角色，按它会说成 25）。
   */
  castMissingCount: number;
}

/**
 * 系列年表里的一行。
 * 类型本体定义在 `lib/series-graph.ts`（那里是规则的唯一出处），这里转出去，
 * 好让客户端组件用一句 `import type { SeriesEntry } from "@/types/anime"` 拿到。
 */
export type { SeriesEntry } from "@/lib/series-graph";

/**
 * 人物页作品列表的一行（**已合并去重**）。
 * 类型本体定义在 `lib/person.ts`（合并/排序规则的唯一出处），这里转出去，
 * 理由同上——客户端组件只用 `import type` 就能拿到。
 */
export type { PersonWork } from "@/lib/person";

/**
 * 人物（AniList 的 Staff）本体，人物页头部用。
 *
 * ⚠️ 字段可空性来自实测（2026-10-06，20 人抽样）：
 * 头像 20/20 有、简介 15/20 有（全是英文）、职业标签 32/32 有，出生年/活跃起点部分有。
 * 展示层的规矩：**有一项显示一项，缺的不显示**（不是显示「—」）。
 */
export interface PersonDetail {
  id: number;
  /** 日文写法（中文读者大部分能认，复制去搜搜不到——界面上有专门一行说明） */
  nameNative: string | null;
  /** 罗马音（要搜人时用这个） */
  nameFull: string | null;
  /** AniList 头像（图床 s4.anilist.co）。20/20 抽样都有，但展示层仍要兜底 */
  imageLarge: string | null;
  /** 英文简介（AniList 上没有中文；已清掉 HTML/markdown 残渣）。没有时为 null，那整块不显示 */
  description: string | null;
  /** 职业标签原文（Director / Voice Actor / …）。中文转换在展示层做，见 lib/staff-roles.ts */
  occupations: string[];
  /** AniList 用户收藏数。没有时为 null */
  favourites: number | null;
  /** 出生年份（AniList 只给到年/月/日三段里的部分）。没有时为 null */
  birthYear: number | null;
  /** 从哪一年开始活跃。没有时为 null */
  yearsActiveStart: number | null;
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
