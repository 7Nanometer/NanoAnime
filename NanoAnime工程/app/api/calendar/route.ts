// 日历的服务端代理。
// 前端只请求这个地址，绝不直连 AniList（CLAUDE.md 第五条铁律）。

import { fetchCalendar } from "@/lib/calendar";

/**
 * 按当前时间取本周日历。
 *
 * ⚠️ **这里不要加 `export const dynamic = "force-dynamic"`。**
 * 看着好像该加（"今天是哪天"每次请求都得重算），但 Next 16 文档里写明它等价于
 * 把本路由里每个 fetch 都设成 `{ cache: "no-store" }`——那样 lib/anilist.ts 里
 * 那个 1 小时缓存会被整个干掉，每来一次访问就往 AniList 打 4 次请求。
 * AniList 限流 30~90 次/分钟，会直接被打挂。
 *
 * 不加也是对的：路由处理器（route handler）**默认就不缓存**，每次请求都会重新执行，
 * 所以「今天是哪一天」本来就是新鲜的；而里面那个 fetch 该缓存还是缓存。
 */
export async function GET() {
  try {
    return Response.json(await fetchCalendar());
  } catch (error) {
    const message = error instanceof Error ? error.message : "未知错误";
    // 502 = 上游（AniList）出问题了，不是我们自己的错
    return Response.json({ error: message }, { status: 502 });
  }
}
