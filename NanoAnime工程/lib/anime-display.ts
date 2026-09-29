// 展示层：把 AniList 的数据整理成卡片上要显示的文字。
// 所有「字段可能缺失」的判断都集中在这里，页面组件里就不用到处写 ?? 兜底了。

import type { Anime, MediaSeason } from "@/types/anime";

/** 一周七天。getDay() 的返回值正好就是下标（0 = 周日） */
const WEEKDAYS = ["周日", "周一", "周二", "周三", "周四", "周五", "周六"];

/** 季度缩写翻译成中文 */
const SEASON_LABELS: Record<MediaSeason, string> = {
  WINTER: "冬",
  SPRING: "春",
  SUMMER: "夏",
  FALL: "秋",
};

/** 连名字都没有时的最后兜底，保证卡片上永远不会出现空字符串 */
const UNKNOWN_TITLE = "未知作品";

/** 季度中文名，用于首页标题，例如「2026 年秋新番」 */
export function getSeasonLabel(season: MediaSeason): string {
  return SEASON_LABELS[season];
}

/** 卡片主标题：优先日文原名，依次退到罗马音、英文名 */
export function getPrimaryTitle(anime: Anime): string {
  return anime.title.native ?? anime.title.romaji ?? anime.title.english ?? UNKNOWN_TITLE;
}

/** 卡片副标题（英文名）。没有英文名时退回主标题，避免这一行空掉占位 */
export function getSecondaryTitle(anime: Anime): string {
  return anime.title.english ?? getPrimaryTitle(anime);
}

/**
 * 更新状态。
 * 有下一集排期就写「周X 第N集」；没有排期的（已完结、未开播等）按状态给一句人话，
 * 绝不返回空字符串——否则卡片上会少一行。
 */
export function getAiringStatus(anime: Anime): string {
  const next = anime.nextAiringEpisode;
  if (next) {
    const weekday = WEEKDAYS[new Date(next.airingAt * 1000).getDay()];
    return `${weekday} 第${next.episode}集`;
  }

  switch (anime.status) {
    case "RELEASING":
      return "在播 · 排期待定";
    case "FINISHED":
      return "已完结";
    case "NOT_YET_RELEASED":
      return "待开播";
    case "CANCELLED":
      return "已取消";
    case "HIATUS":
      return "停更中";
  }
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
