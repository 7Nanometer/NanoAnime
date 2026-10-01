// 按 id 批量取番剧的服务端代理（`/my` 追番列表用）。
// 前端只请求这个地址，绝不直连 AniList（CLAUDE.md 第五条铁律）。
//
// ⚠️ 这里**不要加 `export const dynamic`**：Next 16 里它等价于把本路由每个 fetch
// 都设成 `cache: "no-store"`，会把 lib/anilist.ts 里那个 1 小时缓存整个干掉。
// 路由处理器默认就不缓存，本来每次请求都会重新执行。详见 app/api/calendar/route.ts 的注释。

import { fetchAnimeWithSchedule } from "@/lib/anilist";
import { getTitleZh } from "@/lib/bangumi-index";

/** 一次最多取多少部。AniList 的 perPage 就是 50，多传也拿不回来 */
const MAX_IDS = 50;

/**
 * 把 `?ids=1,2,3` 解析成干净的 id 列表。
 *
 * ⚠️ 这个参数**完全不可信**：追番记录存在用户浏览器本地，随手就能改。
 * 所以只留正整数，其余（非数字、0、负数、小数、重复、空字符串）一律丢掉，
 * 而且截到 MAX_IDS——绝不要把用户给的字符串原样转给 AniList。
 */
function parseIds(raw: string): number[] {
  const ids = new Set<number>();

  for (const part of raw.split(",")) {
    const value = Number(part.trim());
    if (Number.isInteger(value) && value > 0) {
      ids.add(value);
    }
  }

  return [...ids].slice(0, MAX_IDS);
}

export async function GET(request: Request) {
  const raw = new URL(request.url).searchParams.get("ids") ?? "";
  const ids = parseIds(raw);

  // 一部都没追，或者参数全是垃圾——直接返回空数组，没必要去打 AniList
  if (ids.length === 0) {
    return Response.json([]);
  }

  try {
    const anime = await fetchAnimeWithSchedule(ids);
    // 中文名是本地 data/title-zh.json 里查的，不额外发请求
    return Response.json(
      anime.map((item) => ({ ...item, title: { ...item.title, zh: getTitleZh(item.id) } })),
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "未知错误";
    // 502 = 上游（AniList）出问题了，不是我们自己的错
    return Response.json({ error: message }, { status: 502 });
  }
}
