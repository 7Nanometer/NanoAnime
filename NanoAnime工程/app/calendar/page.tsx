import type { Metadata } from "next";

import { CalendarBoard } from "@/components/CalendarBoard";
import { SITE_CONTAINER } from "@/lib/layout";

export const metadata: Metadata = {
  title: "追番周表 · NanoAnime番鉴",
};

/**
 * 完整的追番周表页（2026-10-07 三期改版恢复）。
 *
 * 这个页面有一段反复：2026-10-06（M7 A+B）完整周表并进过首页，页面删除、
 * `/calendar` 308 跳 `/#calendar`；2026-10-07 首页只留一行 7 部（CalendarStrip），
 * 完整周表恢复成独立页——`next.config.ts` 里那条 308 已同步删除
 * （不删的话新页面会被永久重定向吃掉）。
 *
 * 结构是「服务端外壳 + 客户端取数」：数据走 /api/calendar，1 小时服务端缓存。
 * 标题（h1）和副标题在 CalendarBoard 里——它自带完整的头部。
 */
export default function CalendarPage() {
  return (
    <main className={`${SITE_CONTAINER} py-8 sm:py-10`}>
      <CalendarBoard />
    </main>
  );
}
