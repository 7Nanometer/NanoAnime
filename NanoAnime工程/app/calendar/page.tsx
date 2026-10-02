import type { Metadata } from "next";

import { CalendarBoard } from "@/components/CalendarBoard";

export const metadata: Metadata = {
  title: "日历 · NanoAnime番鉴",
};

/**
 * 日历页。
 *
 * 和服务端渲染的详情页不同，这里是**服务端外壳 + 客户端取数**——和首页（AnimeGrid）
 * 同一个形状。原因是这一页的内容取决于「今天是哪一天」：
 * 如果在服务端组件里直接 `new Date()`，Next 会在 build 时就把页面烤成静态 HTML，
 * 「今天」会永远停在构建那一天。交给每次请求都重新执行的路由接口去算，才不出错。
 *
 * 也**不能**用 `export const dynamic = "force-dynamic"` 来解——那会把 lib/anilist.ts
 * 里的 1 小时缓存一并干掉，详见 app/api/calendar/route.ts 的注释。
 */
export default function CalendarPage() {
  return (
    <main className="mx-auto max-w-7xl px-4 py-8">
      <CalendarBoard />
    </main>
  );
}
