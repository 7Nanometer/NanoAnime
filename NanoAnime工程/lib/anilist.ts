// AniList 数据访问层。
// 铁律（CLAUDE.md 第五条）：第三方请求只能走这里，页面组件里不许裸写 fetch。

import type { Anime, MediaSeason, SeasonAnimeResult, SeasonRef } from "@/types/anime";

const ANILIST_ENDPOINT = "https://graphql.anilist.co";

/** 服务端缓存时长：1 小时。AniList 限流 30~90 次/分钟，靠缓存把外部请求压到最低 */
const CACHE_SECONDS = 60 * 60;

/** 距下一季开播不足这么多天时，就提前显示下一季（季末大家已经在看新番表了） */
const SEASON_LEAD_DAYS = 21;

/** 按 AniList 的固定顺序排列，下标 = 该季度在一年中的位置 */
const SEASONS: MediaSeason[] = ["WINTER", "SPRING", "SUMMER", "FALL"];

/**
 * 查询某一季的番剧。
 * 注意：AniList 没有「星期几」字段，播出星期只能从 nextAiringEpisode.airingAt
 * 这个时间戳自己换算——这是本查询里最容易记错的一点。
 */
const SEASON_ANIME_QUERY = `
  query SeasonAnime($season: MediaSeason!, $seasonYear: Int!, $page: Int!, $perPage: Int!) {
    Page(page: $page, perPage: $perPage) {
      media(
        type: ANIME
        season: $season
        seasonYear: $seasonYear
        isAdult: false
        sort: POPULARITY_DESC
      ) {
        id
        title { native english romaji }
        coverImage { extraLarge large color }
        episodes
        averageScore
        status
        format
        nextAiringEpisode { episode airingAt }
      }
    }
  }
`;

/** AniList 的返回外形。出错的字段叫 errors，成功的数据在 data.Page.media */
interface AniListResponse {
  data?: { Page?: { media?: Anime[] } };
  errors?: { message: string }[];
}

/**
 * 按日期算出「现在该显示哪一季」。
 *
 * 规则：先取日期所在的自然季度；如果距离下一季开播不到 SEASON_LEAD_DAYS 天，
 * 就提前返回下一季——因为季末时本季大多已完结，用户想看的是即将开播的新番。
 *
 * 例：9 月 29 日属于 SUMMER，但距 FALL 开播只剩 2 天 → 返回 FALL。
 */
export function getCurrentSeason(today: Date = new Date()): SeasonRef {
  const index = Math.floor(today.getMonth() / 3); // 0=冬 1=春 2=夏 3=秋
  const year = today.getFullYear();

  // 下一季的第一天。月份写成 3/6/9/12 时 Date 会自动进位到次年，无需特判
  const nextSeasonStart = new Date(year, index * 3 + 3, 1);
  const daysUntilNext = Math.ceil(
    (nextSeasonStart.getTime() - today.getTime()) / (24 * 60 * 60 * 1000),
  );

  if (daysUntilNext <= SEASON_LEAD_DAYS) {
    // 跨年：秋天（index 3）的下一季是明年冬天
    return index === 3
      ? { season: "WINTER", seasonYear: year + 1 }
      : { season: SEASONS[index + 1], seasonYear: year };
  }

  return { season: SEASONS[index], seasonYear: year };
}

/**
 * 取本季新番，按人气从高到低。
 * @param perPage 取多少部
 */
export async function fetchSeasonAnime(perPage = 20): Promise<SeasonAnimeResult> {
  const { season, seasonYear } = getCurrentSeason();

  const response = await fetch(ANILIST_ENDPOINT, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({
      query: SEASON_ANIME_QUERY,
      variables: { season, seasonYear, page: 1, perPage },
    }),
    // Next.js 16 的 fetch 默认不缓存，必须显式开启。
    // cache: "force-cache" 让 POST 请求也能进服务端缓存（官方文档明确支持 POST），
    // revalidate 再把缓存寿命卡在 1 小时。
    // 注意：这两个选项不能和 cache: "no-store" 混用，否则会双双失效。
    cache: "force-cache",
    next: { revalidate: CACHE_SECONDS },
  });

  if (!response.ok) {
    throw new Error(`AniList 请求失败：HTTP ${response.status}`);
  }

  const json = (await response.json()) as AniListResponse;

  if (json.errors?.length) {
    throw new Error(`AniList 返回错误：${json.errors.map((e) => e.message).join("; ")}`);
  }

  return { season, seasonYear, anime: json.data?.Page?.media ?? [] };
}
