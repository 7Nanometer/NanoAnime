// AniList 数据访问层。
// 铁律（CLAUDE.md 第五条）：第三方请求只能走这里，页面组件里不许裸写 fetch。

import type { SeriesEdgeInfo, SeriesRecord } from "@/lib/series-graph";
import type {
  Anime,
  AnimeDetail,
  AnimeWithSchedule,
  CastMember,
  DateParts,
  Episode,
  ExternalLink,
  MediaSeason,
  SeasonAnimeResult,
  SeasonRef,
  ScheduleEntry,
  StaffMember,
} from "@/types/anime";

const ANILIST_ENDPOINT = "https://graphql.anilist.co";

/** 服务端缓存时长：1 小时。AniList 限流 30~90 次/分钟，靠缓存把外部请求压到最低 */
const CACHE_SECONDS = 60 * 60;

/**
 * 系列关系（年表补抓）的缓存时长：24 小时。
 *
 * 比详情长得多，理由是**这块数据几乎不变**——一个系列一年才多一部续作。
 * 而它偏偏是最贵的：补抓一个系列最坏要 4 次请求，撞上 AniList 的 30 次/分钟限额就降级了。
 * 缓存给长一点，等于把「同一个人反复看同一个系列」的成本压到接近 0。
 * （铁律是「缓存 ≥ 1 小时」，这里给 24 小时不违反。）
 */
const SERIES_CACHE_SECONDS = 24 * 60 * 60;

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
 * 按人气取番剧，**不限季度**。
 * 用途：批量补中文名时扩大覆盖范围（`scripts/fetch-title-zh.ts --scope=top2000`）。
 *
 * ⚠️ 翻页必须按**固定页数**来，不能靠 `pageInfo.total` —— 实测它不可信
 * （热门查询一律返回 5000 封顶，见下面 SEARCH_ANIME_QUERY 的说明）。
 */
const POPULAR_ANIME_QUERY = `
  query PopularAnime($page: Int!, $perPage: Int!) {
    Page(page: $page, perPage: $perPage) {
      media(type: ANIME, isAdult: false, sort: POPULARITY_DESC) {
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
 * 只取「id + 人气值」。
 *
 * 用途：给本地中文对照表补 `popularity`（`scripts/fetch-popularity.ts`），
 * 供搜索排序用（规则见 lib/local-match-rank.ts）。
 *
 * ⚠️ 特意**不**复用 ANIME_LIST_FIELDS：那是列表类查询共用的字段块，
 * 往里加 `popularity` 会让 `Anime` 类型和所有页面都得跟着改，
 * 而我们这里只要一个数字。字段越少，这个查询越不容易受 AniList 改接口影响。
 */
const POPULARITY_BY_IDS_QUERY = `
  query PopularityByIds($ids: [Int]) {
    Page(page: 1, perPage: 50) {
      media(id_in: $ids, type: ANIME) {
        id
        popularity
      }
    }
  }
`;

/**
 * 按 id 批量取番剧**并带上剧集排期**——`/my` 追番列表打钩用。
 *
 * 和上面那个 ANIME_BY_IDS_QUERY 的区别就是多了 `airingSchedule`：
 * 打钩要知道「这部番有哪些集」，光有 `episodes`（总集数）不够——
 * 实测 ONE PIECE 的 `episodes` 是 **null**，而 `nextAiringEpisode` 给的集号（1181）
 * 和排期最大集号（1147）**对不上**。所以「最近更新到第几集」只能从排期里取，
 * 它有真实日期，是可信的那个。
 *
 * 复用 `${ANIME_LIST_FIELDS}` 而不是另写一份字段列表——防止两处慢慢长歪
 * （这是 M1-2 把它抽出来的原因）。
 *
 * **不取 `streamingEpisodes`**：打钩只要集号，不需要英文集标题，少取点数据。
 * 另外 `airingSchedule` 单次上限被服务端压到 25 条，对长番正好是「最近 25 集」。
 */
const COLLECTION_ANIME_QUERY = `
  query CollectionAnime($ids: [Int]) {
    Page(page: 1, perPage: 50) {
      media(id_in: $ids, type: ANIME) {
        ${ANIME_LIST_FIELDS}
        airingSchedule(perPage: 50) { nodes { episode airingAt } }
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
 * - `externalLinks` **可以取**，这是「哪里能看」的数据来源：里面装的是各平台的作品页
 *   （如 `crunchyroll.com/series/xxx`、`netflix.com/title/xxx`），不是播放地址。
 *   ⚠️ 但**取到不等于能展示**——实测这批链接里混着「只有域名没有具体页面」的空壳链接
 *   和 YouTube 的 `watch?v=` 播放地址。展示前必须过 `lib/watch.ts` 的四道过滤。
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
      externalLinks { url site type }

      relations {
        edges {
          relationType(version: 2)
          node { id type title { native } format startDate { year } }
        }
      }

      staffPage1: staff(page: 1, perPage: 25, sort: [RELEVANCE]) {
        edges { role node { id name { native full } } }
      }
      staffPage2: staff(page: 2, perPage: 25, sort: [RELEVANCE]) {
        edges { role node { id name { native full } } }
      }

      characters(page: 1, perPage: 25, sort: [ROLE, RELEVANCE, ID]) {
        edges {
          role
          node { name { native full } }
          voiceActors(language: JAPANESE) { id name { native full } }
        }
      }
    }
  }
`;

/**
 * 按 id 批量取「关系 + 基本信息」，给系列年表**补抓**用（第一层已经由详情查询带回来了）。
 *
 * ⚠️ 只取 id / type 之外**不带** staff、characters —— 补抓是为了把图走完，
 * 每多带一块字段，响应就大一截，而 30 次/分钟的限额下我们可能要走好几轮。
 */
const MEDIA_RELATIONS_QUERY = `
  query MediaRelations($ids: [Int]) {
    Page(page: 1, perPage: 50) {
      media(id_in: $ids, type: ANIME) {
        id
        title { native }
        format
        startDate { year }
        relations {
          edges {
            relationType(version: 2)
            node { id type title { native } format startDate { year } }
          }
        }
      }
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
      externalLinks: ExternalLink[] | null;
      relations: {
        edges: {
          relationType: string;
          node: {
            id: number;
            type: string;
            title: { native: string | null };
            format: string | null;
            startDate: { year: number | null } | null;
          };
        }[];
      } | null;
      staffPage1: { edges: AniListStaffEdge[] } | null;
      staffPage2: { edges: AniListStaffEdge[] } | null;
      characters: { edges: AniListCharacterEdge[] } | null;
    };
  };
  errors?: { message: string }[];
}

/** 制作人员的一条边。同一个人的多条边（不同职位）要去重合并，见 buildStaff() */
interface AniListStaffEdge {
  role: string;
  node: { id: number; name: { native: string | null; full: string | null } };
}

/** 角色的一条边。带该角色的日语声优（可能为空数组——实测有角色在 AniList 上没配音优） */
interface AniListCharacterEdge {
  role: string;
  node: { name: { native: string | null; full: string | null } };
  voiceActors: { id: number; name: { native: string | null; full: string | null } }[];
}

/**
 * 按 id 批量取「关系边 + 基本信息」，给系列年表补抓用。
 *
 * ⚠️ `pageInfo.total` / `hasNextPage` 实测都是坏的（同一部番不同页报出不同的总数），
 * 所以这个函数**不做翻页**——它只按传进来的 id 取一轮，翻页的循环在 lib/series.ts 里。
 *
 * ⚠️ 顶层 `Page.perPage` 上限是 50（实测可用）。注意这跟**嵌套连接**不一样：
 * `Media.staff` / `Media.characters` 的 perPage 被静默截断成 25（传 100 也只回 25）。
 *
 * @param ids 一批作品 id。**调用方应先把 id 排序**——相同的一组 id 生成相同的请求，
 *            Next 的服务端缓存才命得中
 */
export async function fetchMediaRelations(ids: number[]): Promise<SeriesRecord[]> {
  if (ids.length === 0) {
    return [];
  }

  const response = await fetch(ANILIST_ENDPOINT, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({ query: MEDIA_RELATIONS_QUERY, variables: { ids } }),
    cache: "force-cache",
    // 系列结构几乎不变（一年才多一部续作），所以这块缓存给得比详情长
    next: { revalidate: SERIES_CACHE_SECONDS },
  });

  if (!response.ok) {
    throw new Error(`AniList 系列关系请求失败：HTTP ${response.status}`);
  }

  const json = (await response.json()) as AniListRelationsResponse;

  if (json.errors?.length) {
    throw new Error(`AniList 返回错误：${json.errors.map((e) => e.message).join("; ")}`);
  }

  return (json.data?.Page?.media ?? []).map((media) => ({
    id: media.id,
    titleNative: media.title.native,
    format: media.format,
    year: media.startDate?.year ?? null,
    relations: (media.relations?.edges ?? []).map((edge) => ({
      type: edge.relationType,
      id: edge.node.id,
      nodeType: edge.node.type,
      titleNative: edge.node.title.native,
      format: edge.node.format,
      year: edge.node.startDate?.year ?? null,
    })),
  }));
}

/** 系列关系查询的返回外形。只要年表画得出来所需的最小字段 */
interface AniListRelationsResponse {
  data?: {
    Page?: {
      media?: {
        id: number;
        title: { native: string | null };
        format: string | null;
        startDate: { year: number | null } | null;
        relations: {
          edges: {
            relationType: string;
            node: {
              id: number;
              type: string;
              title: { native: string | null };
              format: string | null;
              startDate: { year: number | null } | null;
            };
          }[];
        } | null;
      }[];
    };
  };
  errors?: { message: string }[];
}

/** AniList 的返回外形。出错的字段叫 errors，成功的数据在 data.Page.media */
interface AniListResponse {
  data?: { Page?: { media?: Anime[] } };
  errors?: { message: string }[];
}

/** 带排期的批量查询返回外形。media 里比 Anime 多一个 airingSchedule */
interface AniListWithScheduleResponse {
  data?: {
    Page?: {
      media?: (Anime & {
        airingSchedule: { nodes: { episode: number; airingAt: number }[] } | null;
      })[];
    };
  };
  errors?: { message: string }[];
}

/** 只查人气值时的返回外形。比 Anime 窄得多——只有 id 和人气值两个字段 */
interface AniListPopularityResponse {
  data?: {
    Page?: {
      media?: {
        id: number;
        /** 多少人看过 / 想看。AniList 上冷门作品可能很小，但不会是 null */
        popularity: number;
      }[];
    };
  };
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
 * 按人气从高到低取**一页**番剧（不限季度）。
 *
 * ⚠️ 这个函数是给**离线批量脚本**用的，应用运行时不用它。所以刻意**不加**
 * `cache: "force-cache"` 和 `next: { revalidate }` —— 那两个是给 Next 运行时用的，
 * 脚本里是 Node 直接跑，加了没有任何意义，反而让人误以为这里有缓存。
 *
 * @param page 第几页，从 1 开始
 * @param perPage 每页多少部（AniList 的上限是 50）
 */
export async function fetchPopularAnime(
  page: number,
  perPage: number,
): Promise<Anime[]> {
  const response = await fetch(ANILIST_ENDPOINT, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({
      query: POPULAR_ANIME_QUERY,
      variables: { page, perPage },
    }),
  });

  if (!response.ok) {
    throw new Error(`AniList 请求失败：HTTP ${response.status}`);
  }

  const json = (await response.json()) as AniListResponse;

  if (json.errors?.length) {
    throw new Error(`AniList 返回错误：${json.errors.map((e) => e.message).join("; ")}`);
  }

  return withEmptyZh(json.data?.Page?.media ?? []);
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
 * 按 id 批量取**人气值**，返回「id → 人气值」的对照表。
 *
 * 用途：给本地中文对照表补排序用的 `popularity` 字段（`scripts/fetch-popularity.ts`）。
 * 这个函数是给**离线批量脚本**用的，应用运行时不用它，所以和 `fetchPopularAnime` 一样
 * 刻意不加 `cache` / `next.revalidate`（那两个是给 Next 运行时用的）。
 *
 * ⚠️ 一次最多 50 个 id —— AniList 的单页上限，超了会静默截断。
 * 查不到的 id 不会出现在返回的 Map 里（调用方据此判断"没取到"，不要当成 0）。
 *
 * @param ids 一批作品 id
 */
export async function fetchAnimePopularityByIds(ids: number[]): Promise<Map<number, number>> {
  if (ids.length === 0) {
    return new Map();
  }

  const response = await fetch(ANILIST_ENDPOINT, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({ query: POPULARITY_BY_IDS_QUERY, variables: { ids } }),
  });

  if (!response.ok) {
    throw new Error(`AniList 取人气值失败：HTTP ${response.status}`);
  }

  const json = (await response.json()) as AniListPopularityResponse;

  if (json.errors?.length) {
    throw new Error(`AniList 返回错误：${json.errors.map((e) => e.message).join("; ")}`);
  }

  const result = new Map<number, number>();
  for (const item of json.data?.Page?.media ?? []) {
    result.set(item.id, item.popularity);
  }
  return result;
}

/**
 * 按 id 批量取番剧，**并带上剧集排期**——`/my` 追番列表用。
 *
 * 一次请求拿全部，不要在调用方循环单查（AniList 限流 30~90 次/分钟）。
 *
 * ⚠️ 和 `fetchAnimeByIds` 一样，返回顺序**不保证**跟传入的 ids 一致，
 * 调用方要自己按需要的顺序重排。
 */
export async function fetchAnimeWithSchedule(ids: number[]): Promise<AnimeWithSchedule[]> {
  if (ids.length === 0) {
    return [];
  }

  const response = await fetch(ANILIST_ENDPOINT, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({ query: COLLECTION_ANIME_QUERY, variables: { ids } }),
    // 同首页：Next 16 的 fetch 默认不缓存，要显式开启（见 fetchSeasonAnime 的注释）
    cache: "force-cache",
    next: { revalidate: CACHE_SECONDS },
  });

  if (!response.ok) {
    throw new Error(`AniList 按 id 取数失败：HTTP ${response.status}`);
  }

  const json = (await response.json()) as AniListWithScheduleResponse;

  if (json.errors?.length) {
    throw new Error(`AniList 返回错误：${json.errors.map((e) => e.message).join("; ")}`);
  }

  return (json.data?.Page?.media ?? []).map((media) => ({
    ...media,
    // AniList 不返回中文名，先填空（同 withEmptyZh 的做法），由调用方用 getTitleZh() 补
    title: { ...media.title, zh: null },
    // 这里不需要集标题（打钩只要集号），所以 title 一律 null——不编造
    episodeList: (media.airingSchedule?.nodes ?? [])
      .map((node) => ({ number: node.episode, airingAt: node.airingAt, title: null }))
      .sort((a, b) => a.number - b.number),
  }));
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
    // 原样存着，**筛不筛是展示层的事**（见 lib/watch.ts）。这里不做任何取舍，
    // 免得以后想放宽规则还得回头改查询
    externalLinks: media.externalLinks ?? [],
    // 关系边也**原样存着**（含白名单外的）。白名单和串图在 lib/series.ts，
    // 规则本体在 lib/series-graph.ts —— 这里不做筛选，免得以后放宽规则又要回头改查询
    relations: (media.relations?.edges ?? []).map(
      (edge): SeriesEdgeInfo => ({
        type: edge.relationType,
        id: edge.node.id,
        // 对面是动画还是漫画/小说 —— 年表只跟动画（见 lib/series-graph.ts 的 isFollowable）
        nodeType: edge.node.type,
        titleNative: edge.node.title.native,
        format: edge.node.format,
        year: edge.node.startDate?.year ?? null,
      }),
    ),
    staff: buildStaff(media.staffPage1?.edges ?? [], media.staffPage2?.edges ?? []),
    ...buildCast(media.characters?.edges ?? []),
  };
}

/**
 * 把两页 staff 合成一份**去重**的名单。
 *
 * ⚠️ 去重是硬约束，实测撞出来的：20/20 部都有同一人因多个职位被反复登记
 * （青之芦苇第二季第 1 页 25 条里只有 20 个不重复的人；进击的巨人的制片人一人占 3 条）。
 *
 * ⚠️ **只能按 AniList 的人物 id 去重，不能按姓名**——按姓名会把同名的不同人合并掉。
 * 反例：钢炼 FA 的 50 条里一个重复都没有，按姓名去重仍然能过；
 * 但换个有同名者的番就会静默丢人，且查不出来。
 *
 * 合并后的位置取**这个人第一次出现的位置**（AniList 按相关度排序，先出现 = 更要紧）。
 */
function buildStaff(...pages: AniListStaffEdge[][]): StaffMember[] {
  const order: number[] = [];
  const byId = new Map<number, StaffMember>();

  for (const edges of pages) {
    for (const edge of edges) {
      const existing = byId.get(edge.node.id);
      if (existing) {
        // 同一个人的第二个职位：合进同一行，不另起一行
        if (!existing.roles.includes(edge.role)) {
          existing.roles.push(edge.role);
        }
        continue;
      }
      byId.set(edge.node.id, {
        id: edge.node.id,
        nameNative: edge.node.name.native,
        nameFull: edge.node.name.full,
        roles: edge.role ? [edge.role] : [],
      });
      order.push(edge.node.id);
    }
  }

  return order.map((id) => byId.get(id)!);
}

/**
 * 把角色边转成**以声优为主体**的名单。
 *
 * - 没有日语声优的角色**不进名单**，只把数量数出来——**但界面只拿它决定说哪句话，
 *   不显示数字**：这个数来自被截断的数据（嵌套连接 perPage 上限 25），
 *   说出去会说错（实测灵笼 48 个角色会被数成 25）。实测：千与千寻 16 个角色里 4 个没有声优。
 * - 同一个声优配了多个角色时只留第一条（名单是「声优名单」，一个人占一行）。
 */
function buildCast(edges: AniListCharacterEdge[]): {
  cast: CastMember[];
  castMissingCount: number;
} {
  const seenVoiceActors = new Set<number>();
  const cast: CastMember[] = [];
  let castMissingCount = 0;

  for (const edge of edges) {
    const voiceActor = edge.voiceActors[0];
    if (!voiceActor) {
      castMissingCount++;
      continue;
    }
    if (seenVoiceActors.has(voiceActor.id)) {
      continue;
    }
    seenVoiceActors.add(voiceActor.id);
    cast.push({
      id: voiceActor.id,
      nameNative: voiceActor.name.native,
      nameFull: voiceActor.name.full,
      // 角色名实测可能是 null，也可能整串是假名——所以只作小字附注，读不出也不影响主体
      characterName: edge.node.name.native ?? edge.node.name.full,
      characterRole: edge.role,
    });
  }

  return { cast, castMissingCount };
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
