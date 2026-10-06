// 人物页「加载更多」的服务端代理。
// 前端只请求这个地址，绝不直连 AniList（CLAUDE.md 第五条铁律）。
//
// ⚠️ 同 app/api/anime/by-ids/route.ts：**不要加 `export const dynamic`**——
// 它等价于把本路由每个 fetch 设成 no-store，会把 lib/anilist.ts 里的 24 小时缓存干掉。
// 路由处理器本来就不缓存整份响应，每次请求都会重新执行（缓存落在 fetch 那一层）。

import { fetchPersonWorks } from "@/lib/anilist";
import { mergePersonWorks } from "@/lib/person";

/**
 * 把 `?page=N` 解析成干净的页码。
 *
 * ⚠️ 这个参数**完全不可信**（浏览器里随手就能改）：只接受正整数，
 * 上限给个宽松的值防跑飞（一次请求只翻两页，真正的上限在 AniList 那边）。
 * 绝不把用户给的字符串原样转给 AniList。
 */
function parsePage(raw: string | null): number | null {
  const value = Number(raw ?? "");
  return Number.isInteger(value) && value > 0 && value <= 1000 ? value : null;
}

export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const personId = Number(id);
  if (!Number.isInteger(personId) || personId <= 0) {
    return Response.json({ error: "人物 id 不合法" }, { status: 400 });
  }

  const page = parsePage(new URL(request.url).searchParams.get("page"));
  if (page === null) {
    return Response.json({ error: "页码不合法" }, { status: 400 });
  }

  try {
    const batch = await fetchPersonWorks(personId, page);
    // 合并去重在这一层做（服务端）：客户端拿到的就是"一部作品一行"
    const works = mergePersonWorks([...batch.staffEdges, ...batch.castEdges]);
    return Response.json({ works, done: batch.done });
  } catch (error) {
    const message = error instanceof Error ? error.message : "未知错误";
    // 502 = 上游（AniList）出问题了，不是我们自己的错
    return Response.json({ error: message }, { status: 502 });
  }
}
