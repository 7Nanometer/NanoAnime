// 本季新番的服务端代理。
// 前端只请求这个地址，绝不直连 AniList（CLAUDE.md 第五条铁律）。

import { fetchSeasonAnime } from "@/lib/anilist";
import { attachChineseTitles } from "@/lib/bangumi-index";

export async function GET() {
  try {
    const result = await fetchSeasonAnime(20);
    // 中文名是本地文件里查的，不额外发请求
    return Response.json(attachChineseTitles(result));
  } catch (error) {
    const message = error instanceof Error ? error.message : "未知错误";
    // 502 = 上游（AniList）出问题了，不是我们自己的错
    return Response.json({ error: message }, { status: 502 });
  }
}
