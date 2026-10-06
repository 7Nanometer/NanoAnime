// 客户端取数：追番周表（/api/calendar 的封装）。
//
// 从 components/CalendarBoard.tsx 里抽出来的（2026-10-07 三期改版）：
// 现在有两个消费方——完整周表页的 CalendarBoard 和首页一行的 CalendarStrip，
// 同一个 queryKey（["calendar"]）共用一份缓存，谁也别在组件里另写请求。
//
// ⚠️ 纯客户端模块：这里**不能** import lib/anilist.ts 那种服务端模块，
// 否则会把 AniList 访问层连带打进浏览器包。类型走 import type，会被整个擦掉。

import type { CalendarResult } from "@/types/anime";

/** 前端只请求自家接口，不直连 AniList（CLAUDE.md 第五条铁律） */
export async function fetchCalendar(): Promise<CalendarResult> {
  const response = await fetch("/api/calendar");
  if (!response.ok) {
    throw new Error(`接口返回 HTTP ${response.status}`);
  }
  return (await response.json()) as CalendarResult;
}
