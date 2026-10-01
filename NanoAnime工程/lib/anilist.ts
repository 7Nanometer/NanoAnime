// AniList 数据访问层。
// 铁律（CLAUDE.md 第五条）：第三方请求只能走这里，页面组件里不许裸写 fetch。

import type {
  Anime,
  AnimeDetail,
  DateParts,
  Episode,
  MediaSeason,
  SeasonAnimeResult,
  SeasonRef,
  ScheduleEntry,
} from "@/types/anime";

const ANILIST_ENDPOINT = "https://graphql.anilist.co";

/** 服务端缓存时长：1 小时。AniList 限流 30~90 次/分钟，靠缓存把外部请求压到最低 */
const CACHE_SECONDS = 60 * 60;

/** 距下一季开播不足这么多天时，就提前显示下一季（季末大家已经在看新番表了） */
const SEASON_LEAD_DAYS = 21;

/** 按 AniList 的固定顺序排列，下标 = 该季度在一年中的位置 */
const SEASONS: MediaSeason[] = ["WINTER", "SPRING", "SUMMER", "FALL"];

/**
 * 列表类查询共用的字段（本季、搜索、按 id 批量取都用这一份）。
 * 抽出来是为了防止三处字段慢慢长歪——尤其 `title` 里少了哪个名字，
 * 展示层的兜底顺序就会出偏差。
 */
const ANIME_LIST_FIELDS = `
  id
  title { native english romaji }
  coverImage { extraLarge large color }
  episodes
  averageScore
  status
  format
  startDate { year month day }
  nextAiringEpisode { episode airingAt }
`;

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
        ${ANIME_LIST_FIELDS}
      }
    }
  }
`;

/**
 * 按关键词搜索。
 * `sort: SEARCH_MATCH` 是按相关度排（不是按人气），搜索场景必须用这个。
 * ⚠️ 返回里的 `pageInfo.total` **不可信**——实测热门关键词一律返回 5000 封顶，
 * 所以本项目的搜索不做分页，只用固定条数。
 */
const SEARCH_ANIME_QUERY = `
  query SearchAnime($keyword: String!, $perPage: Int!) {
    Page(page: 1, perPage: $perPage) {
      media(search: $keyword, type: ANIME, isAdult: false, sort: SEARCH_MATCH) {
        ${ANIME_LIST_FIELDS}
      }
    }
  }
`;

/**
 * 按 id 批量取。
 * 用途：本地中文对照表里只有 id 和中文名，没有封面、年份，靠这个回头补齐。
 * ⚠️ 返回顺序**不按请求顺序**（实测请求 [195516,195539,195604] 返回 [195516,195539,195604] 之外的
 * 升序排列），调用方必须自己重排。
 */
const ANIME_BY_IDS_QUERY = `
  query AnimeByIds($ids: [Int]) {
    Page(page: 1, perPage: 50) {
      media(id_in: $ids, type: ANIME) {
        ${ANIME_LIST_FIELDS}
      }
    }
  }
`;

/**
 * 查一段时间里**全站**的播出排期——日历页用。
 *
 * ⚠️ 注意这里用的是 `Page.airingSchedules`（复数），和详情页的
 * `Media.airingSchedule`（单数）**是两个完全不同的字段**：
 * 单数是「某一部番自己的排期」，复数是「全站所有番的排期」，日历要的是后者。
 *
 * 三处实测出来的坑（都会让代码"看起来对但结果是错的"）：
 * 1. `pageInfo.total` 又是 5000 封顶，**不能用它判断翻页**
 * 2. 连 `hasNextPage` 都不能信——实测第 4 页开始就没有数据了，它一直说"还有下一页"，
 *    直到第 12 页才变 false。唯一的停止条件是「某一页返回 0 条」
 * 3. 返回的条目**不是按时间排序的**，必须自己重排（见 fetchWeekSchedule）
 */
const CALENDAR_WEEK_QUERY = `
  query CalendarWeek($page: Int!, $from: Int!, $to: Int!) {
    Page(page: $page, perPage: 50) {
      airingSchedules(airingAt_greater: $from, airingAt_lesser: $to) {
        airingAt
        episode
        media {
          ${ANIME_LIST_FIELDS}
          isAdult
        }
      }
    }
  }
`;

/** 翻页硬上限。正常一周 3 页就取完了，这只是防呆，避免异常时死循环打爆接口 */
const SCHEDULE_MAX_PAGES = 10;

/**
 * 查一部番的详情。
 *
 * 几处刻意的选择：
 * - `description(asHtml: false)` 让 AniList 先把简介的 HTML 处理一道，但**它清不干净**
 *   （实测还留 `<br>` 等标签），所以下面还有一道 parseDescription 兜着。
 * - `airingSchedule` 只请求一页：单次上限被服务端压到 25 条，翻页对长番意义也不大。
 * - `streamingEpisodes` **只取 title，绝不取 url / site**——那个字段里带着 Crunchyroll
 *   的播放地址，本项目不接任何播放链接（红线）。集标题只是文本，可以用。
 */
const ANIME_DETAIL_QUERY = `
  query AnimeDetail($id: Int!) {
    Media(id: $id, type: ANIME) {
      id
      title { native english romaji }
      coverImage { extraLarge large color }
      description(asHtml: false)
      studios { nodes { name isAnimationStudio } }
      startDate { year month day }
      endDate { year month day }
      episodes
      duration
      status
      format
      averageScore
      genres
      nextAiringEpisode { episode airingAt }
      airingSchedule(perPage: 50) { nodes { episode airingAt } }
      streamingEpisodes { title }
    }
  }
`;

/**
 * 详情查询的返回外形。
 * 注意 title 里**没有 zh**——中文名是本地补的，AniList 根本不返回这个字段。
 * id 不存在时 AniList 返回 HTTP 404，且 data.Media 为 null。
 */
interface AnimeDetailResponse {
  data?: {
    Media?: {
      id: number;
      title: { native: string | null; english: string | null; romaji: string | null };
      coverImage: Anime["coverImage"];
      description: string | null;
      studios: { nodes: { name: string; isAnimationStudio: boolean }[] } | null;
      startDate: DateParts | null;
      endDate: DateParts | null;
      episodes: number | null;
      duration: number | null;
      status: Anime["status"];
      format: Anime["format"];
      averageScore: number | null;
      genres: string[] | null;
      nextAiringEpisode: Anime["nextAiringEpisode"];
      airingSchedule: { nodes: { episode: number; airingAt: number }[] } | null;
      streamingEpisodes: { title: string | null }[] | null;
    };
  };
  errors?: { message: string }[];
}

/** AniList 的返回外形。出错的字段叫 errors，成功的数据在 data.Page.media */
interface AniListResponse {
  data?: { Page?: { media?: Anime[] } };
  errors?: { message: string }[];
}

/** 日历查询的返回外形。数据在 data.Page.airingSchedules，不是 media */
interface AniListScheduleResponse {
  data?: {
    Page?: {
      airingSchedules?: {
        airingAt: number;
        episode: number;
        /** 比 Anime 多一个 isAdult，用来剔掉限制级 */
        media: Anime & { isAdult: boolean };
      }[];
    };
  };
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

  return {
    season,
    seasonYear,
    anime: withEmptyZh(json.data?.Page?.media ?? []),
  };
}

/**
 * AniList 不返回中文名，统一先把 `title.zh` 填空成 null，
 * 保证类型声明与运行时数据一致。真正的值由 lib/bangumi-index.ts 的
 * getTitleZh() / attachChineseTitles() 按 id 补上。
 */
function withEmptyZh(items: Anime[]): Anime[] {
  return items.map((item) => ({ ...item, title: { ...item.title, zh: null } }));
}

/**
 * 按关键词搜番剧。
 * @param keyword 关键词，中文 / 日文原名 / 英文名 / 罗马音都可以（中文走不通，见 lib/search.ts）
 * @param perPage 取多少条
 */
export async function searchAnimeByKeyword(keyword: string, perPage: number): Promise<Anime[]> {
  const response = await fetch(ANILIST_ENDPOINT, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({
      query: SEARCH_ANIME_QUERY,
      variables: { keyword, perPage },
    }),
    cache: "force-cache",
    next: { revalidate: CACHE_SECONDS },
  });

  if (!response.ok) {
    throw new Error(`AniList 搜索失败：HTTP ${response.status}`);
  }

  const json = (await response.json()) as AniListResponse;

  if (json.errors?.length) {
    throw new Error(`AniList 返回错误：${json.errors.map((e) => e.message).join("; ")}`);
  }

  return withEmptyZh(json.data?.Page?.media ?? []);
}

/**
 * 按 id 批量取番剧，用于给本地中文对照表命中的条目补齐封面、年份。
 *
 * ⚠️ 返回顺序不保证跟传入的 ids 一致，调用方要自己按需要的顺序重排。
 */
export async function fetchAnimeByIds(ids: number[]): Promise<Anime[]> {
  if (ids.length === 0) {
    return [];
  }

  const response = await fetch(ANILIST_ENDPOINT, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({ query: ANIME_BY_IDS_QUERY, variables: { ids } }),
    cache: "force-cache",
    next: { revalidate: CACHE_SECONDS },
  });

  if (!response.ok) {
    throw new Error(`AniList 按 id 取数失败：HTTP ${response.status}`);
  }

  const json = (await response.json()) as AniListResponse;

  if (json.errors?.length) {
    throw new Error(`AniList 返回错误：${json.errors.map((e) => e.message).join("; ")}`);
  }

  return withEmptyZh(json.data?.Page?.media ?? []);
}

/**
 * 取 [from, to) 这段时间里全站的播出排期，按播出时间升序返回。
 *
 * 翻页靠「某一页返回 0 条就停」——不能用 pageInfo.total（5000 封顶），
 * 也不能用 hasNextPage（实测空页之后还在说 true）。详见 CALENDAR_WEEK_QUERY 的注释。
 *
 * @param from 起始时间，Unix 时间戳（秒），包含
 * @param to   结束时间，Unix 时间戳（秒），不包含
 */
export async function fetchWeekSchedule(from: number, to: number): Promise<ScheduleEntry[]> {
  const entries: ScheduleEntry[] = [];

  for (let page = 1; page <= SCHEDULE_MAX_PAGES; page++) {
    const response = await fetch(ANILIST_ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({
        query: CALENDAR_WEEK_QUERY,
        variables: { page, from, to },
      }),
      // 同首页：Next 16 的 fetch 默认不缓存，要显式开启（见 fetchSeasonAnime 的注释）
      cache: "force-cache",
      next: { revalidate: CACHE_SECONDS },
    });

    if (!response.ok) {
      throw new Error(`AniList 排期请求失败：HTTP ${response.status}`);
    }

    const json = (await response.json()) as AniListScheduleResponse;

    if (json.errors?.length) {
      throw new Error(`AniList 返回错误：${json.errors.map((e) => e.message).join("; ")}`);
    }

    const nodes = json.data?.Page?.airingSchedules ?? [];

    // 空页 = 取完了。这是唯一的停止条件（原因见上面的注释）
    if (nodes.length === 0) {
      break;
    }

    for (const node of nodes) {
      // isAdult 只用来过滤，不属于 Anime，拆出来别混进返回值
      const { isAdult, ...anime } = node.media;
      if (isAdult) {
        continue;
      }
      entries.push({
        anime: { ...anime, title: { ...anime.title, zh: null } },
        episode: node.episode,
        airingAt: node.airingAt,
      });
    }
  }

  // AniList 返回的顺序是乱的（实测），必须自己按时间排，否则每天列里顺序随机
  return entries.sort((a, b) => a.airingAt - b.airingAt);
}

/**
 * 取一部番的详情，供详情页使用。
 *
 * @returns 查得到就返回详情；AniList 上不存在这个 id 时返回 **null**（由页面转成 404）。
 *          网络或服务出错则抛异常——「没有这部番」和「请求失败」是两回事，不能混。
 */
export async function fetchAnimeDetail(id: number): Promise<AnimeDetail | null> {
  const response = await fetch(ANILIST_ENDPOINT, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({ query: ANIME_DETAIL_QUERY, variables: { id } }),
    // 同首页：Next 16 的 fetch 默认不缓存，要显式开启（见 fetchSeasonAnime 的注释）
    cache: "force-cache",
    next: { revalidate: CACHE_SECONDS },
  });

  // AniList 用 404 表示「没有这个 id」，这不是故障，是正常结果
  if (response.status === 404) {
    return null;
  }
  if (!response.ok) {
    throw new Error(`AniList 请求失败：HTTP ${response.status}`);
  }

  const json = (await response.json()) as AnimeDetailResponse;

  if (json.errors?.length) {
    throw new Error(`AniList 返回错误：${json.errors.map((e) => e.message).join("; ")}`);
  }

  const media = json.data?.Media;
  if (!media) {
    return null;
  }

  return {
    id: media.id,
    // 同首页：AniList 没有中文字段，先填 null，由调用方用 getTitleZh() 补
    title: { ...media.title, zh: null },
    coverImage: media.coverImage,
    description: parseDescription(media.description),
    studios: (media.studios?.nodes ?? [])
      .filter((node) => node.isAnimationStudio)
      .map((node) => node.name),
    startDate: media.startDate,
    endDate: media.endDate,
    episodes: media.episodes,
    duration: media.duration,
    status: media.status,
    format: media.format,
    averageScore: media.averageScore,
    genres: media.genres ?? [],
    nextAiringEpisode: media.nextAiringEpisode,
    episodeList: buildEpisodeList(
      media.airingSchedule?.nodes ?? [],
      media.streamingEpisodes ?? [],
    ),
  };
}

/**
 * 清掉简介里的 HTML。
 *
 * 查询里虽然写了 `asHtml: false`，但**实测 AniList 并没有清干净**：
 * 葬送のフリーレン剩 `<br><br>`、薬屋のひとりごと 剩 20 处标签、海贼王剩 22 处。
 * 所以这里再兜一道。
 *
 * 注意顺序：`&amp;` 必须最后解，否则 `&amp;lt;` 会被先解成 `<`。
 */
function parseDescription(raw: string | null): string | null {
  if (!raw) {
    return null;
  }

  const text = raw
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>/gi, "\n")
    .replace(/<[^>]*>/g, "")
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;|&apos;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&")
    .replace(/\n{3,}/g, "\n\n")
    .trim();

  return text || null;
}

/**
 * 把 AniList 给的两份数据并成一份剧集列表，按集号升序。
 *
 * - `airingSchedule`：有「第几集 + 播出时间」，但**不一定完整**——实测已完结的番会缺开头几集
 *   （葬送のフリーレン 28 集只给了第 5~28 集），长番只给最近 25 集。
 * - `streamingEpisodes`：有英文标题（来自 Crunchyroll），但只有上了它家的番才有，且同样不全。
 *
 * 缺的集这里**不补**——「列出第 1~N 集、缺的填 —」是展示层 `buildEpisodeRows()` 的规则，
 * 跟抓数据是两码事。
 */
function buildEpisodeList(
  schedule: { episode: number; airingAt: number }[],
  streaming: { title: string | null }[],
): Episode[] {
  const titles = new Map<number, string>();
  for (const item of streaming) {
    // 标题形如 "Episode 1 - The Journey's End"。解析不出集号就丢弃——不猜。
    // 前缀剥掉，界面上已经写了「第 N 集」，再重复一遍没意义。
    const matched = /^Episode\s+(\d+)\s*[-–—:]?\s*(.*)$/i.exec(item.title?.trim() ?? "");
    if (!matched) {
      continue;
    }
    const title = matched[2].trim();
    if (title) {
      titles.set(Number(matched[1]), title);
    }
  }

  const merged = new Map<number, Episode>();
  for (const node of schedule) {
    merged.set(node.episode, {
      number: node.episode,
      airingAt: node.airingAt,
      title: titles.get(node.episode) ?? null,
    });
  }
  // 有标题却没排期的集也留下——标题本身是有效信息，不该因为没日期就丢掉
  for (const [number, title] of titles) {
    if (!merged.has(number)) {
      merged.set(number, { number, airingAt: null, title });
    }
  }

  return [...merged.values()].sort((a, b) => a.number - b.number);
}
