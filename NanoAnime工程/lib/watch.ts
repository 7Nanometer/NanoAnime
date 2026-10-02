// 「哪里能看」的数据整理层。
//
// ⚠️ 这是全项目**唯一会碰到播放的地方**，红线都收在这一个文件里：
//    只产出两种链接——「平台的作品页」和「平台的站内搜索页」，用户点了跳站外。
//    不抓播放地址、不解析、不嵌 iframe、不做播放器。
//
// 数据分两类：
//   海外——AniList 的 externalLinks（type=STREAMING）。**取到不等于能展示**，见下面的过滤规则。
//   国内——代码生成的站内搜索链接。我们没有「哪部番在哪个国内平台」的数据，只能给搜索入口。

import { getPrimaryTitle, UNKNOWN_TITLE } from "@/lib/anime-display";
import type { AnimeDetail } from "@/types/anime";

/** 一个正版观看入口 */
export interface WatchLink {
  /** 平台名，直接当文案显示，例如 "Crunchyroll" */
  site: string;
  url: string;
  /**
   * 这条链接是什么：
   * - `anime`  —— 平台上的**作品页**，点进去就是这部番
   * - `search` —— 平台的**站内搜索页**，点进去还要用户自己认一下
   * 界面上必须把两者区别开，不能让用户以为搜索结果就是作品页。
   */
  kind: "anime" | "search";
}

export interface WatchLinks {
  overseas: WatchLink[];
  domestic: WatchLink[];
}

/**
 * 整类不展示的平台。
 *
 * 为什么把 YouTube 整类丢掉：实测它的 STREAMING 链接里混着
 * `youtube.com/watch?v=...`（**这就是播放地址**）和 `playlist?list=...`（播放列表），
 * 剩下的是频道页（根本不是这部作品）。与其逐条去猜它到底是哪种，不如整类不要。
 */
const BLOCKED_SITES = new Set(["youtube"]);

/** 同上，按域名再挡一道——光靠平台名不够稳 */
const BLOCKED_HOSTNAMES = ["youtube.com", "youtu.be"];

/**
 * 播放地址的特征。
 *
 * 这是**防御性的第二道**：第一道（丢掉 YouTube）已经把实测发现的那条挡掉了，
 * 但别的平台将来也可能给出这种形状的链接，所以再加一层。
 * 命中任何一条就当播放地址丢掉。
 */
const PLAYBACK_URL_PATTERN = /\/(embed|player|watch|play)\b|(^|[?&])v=/i;

/**
 * 这条外链能不能展示成「作品页」。
 * 四个条件缺一不可，任何一条不满足都丢掉——**宁可少给，不可给错**。
 */
function isDisplayableCatalogLink(url: string, site: string): boolean {
  // 规则 1：平台在黑名单里（YouTube）
  if (BLOCKED_SITES.has(site.trim().toLowerCase())) {
    return false;
  }

  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    // 规则：连 URL 都解析不了，别猜
    return false;
  }

  // 规则 2：域名黑名单
  const hostname = parsed.hostname.toLowerCase().replace(/^www\./, "");
  if (BLOCKED_HOSTNAMES.some((blocked) => hostname === blocked || hostname.endsWith(`.${blocked}`))) {
    return false;
  }

  // 规则 3：只有域名、没有具体页面。
  // 实测这类占 39%（如 `https://www.crunchyroll.com/`），点进去是平台首页、还得自己再搜一次，
  // 界面写着「哪里能看」却给个首页，是误导
  if (parsed.pathname.replace(/\/+$/, "") === "") {
    return false;
  }

  // 规则 4：形状像播放地址
  if (PLAYBACK_URL_PATTERN.test(`${parsed.pathname}${parsed.search}`)) {
    return false;
  }

  return true;
}

/** 海外平台：从 AniList 的 externalLinks 里筛出能展示的作品页 */
function buildOverseas(detail: AnimeDetail): WatchLink[] {
  const seen = new Set<string>();
  const links: WatchLink[] = [];

  for (const link of detail.externalLinks) {
    if (link.type !== "STREAMING") {
      continue;
    }
    if (!isDisplayableCatalogLink(link.url, link.site)) {
      continue;
    }
    // 同一个平台可能给多条（不同语言/地区），按域名去重，只留第一条
    let key: string;
    try {
      key = new URL(link.url).hostname.toLowerCase().replace(/^www\./, "");
    } catch {
      continue;
    }
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    links.push({ site: link.site, url: link.url, kind: "anime" });
  }

  return links;
}

/**
 * 国内平台的站内搜索。
 *
 * ⚠️ 这四个是**搜索页，不是作品页**——`kind: "search"` 就是给界面用来如实标注的。
 * 我们没有「哪部番在哪个国内平台」的数据源，凭空指认就是编，所以只给搜索入口。
 *
 * 各平台的搜索路径实测都返回 HTTP 200（B站 甚至直接把结果烘进了 HTML，
 * 另外三个是浏览器跑完 JS 才出结果）。
 */
const CN_PLATFORMS: { site: string; build: (keyword: string) => string }[] = [
  { site: "哔哩哔哩", build: (k) => `https://search.bilibili.com/all?keyword=${k}` },
  { site: "爱奇艺", build: (k) => `https://so.iqiyi.com/so/q_${k}` },
  { site: "腾讯视频", build: (k) => `https://v.qq.com/x/search/?q=${k}` },
  { site: "优酷", build: (k) => `https://so.youku.com/search_video/q_${k}` },
];

/** 国内平台：生成站内搜索链接 */
function buildDomestic(detail: AnimeDetail): WatchLink[] {
  const title = getPrimaryTitle(detail);

  // 四个名字全空时 getPrimaryTitle 会返回「未知作品」——拿它去搜是瞎搜，不如不给。
  // 这时整块会落到「暂无正版渠道」那一条分支上。
  if (title === UNKNOWN_TITLE) {
    return [];
  }

  const keyword = encodeURIComponent(title);
  return CN_PLATFORMS.map((platform) => ({
    site: platform.site,
    url: platform.build(keyword),
    kind: "search" as const,
  }));
}

/** 组装详情页「哪里能看」要显示的全部入口 */
export function buildWatchLinks(detail: AnimeDetail): WatchLinks {
  return {
    overseas: buildOverseas(detail),
    domestic: buildDomestic(detail),
  };
}
