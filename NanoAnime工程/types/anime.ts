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
 * 一部番剧。AniList 上「没填」的字段会返回 null（不是缺字段），
 * 所以除了 id 之外全部允许为 null——卡片渲染时必须做兜底。
 */
export interface Anime {
  id: number;
  title: {
    native: string | null; // 日文原名
    english: string | null; // 英文名
    romaji: string | null; // 罗马音名
  };
  coverImage: {
    extraLarge: string | null; // 封面大图（图床 s4.anilist.co）
    large: string | null;
    color: string | null; // 封面主色，可当加载占位背景
  };
  episodes: number | null; // 总集数
  averageScore: number | null; // 评分，0~100
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
