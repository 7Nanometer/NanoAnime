// 本季新番的服务端代理。
// 前端只请求这个地址，绝不直连 AniList（CLAUDE.md 第五条铁律）。

import { HERO_COUNT } from "@/lib/anime-constants";
import { fetchSeasonAnime } from "@/lib/anilist";
import { attachChineseTitles, getBangumiSummary } from "@/lib/bangumi-index";

export async function GET() {
  try {
    // 取本季全量（形式过滤后），翻页在 lib/anilist.ts 里做——这里不再传死数字
    const result = await fetchSeasonAnime();
    // 中文名是本地文件里查的，不额外发请求
    const withTitles = attachChineseTitles(result);

    // 只有焦点位会显示简介（口径见 lib/anime-constants.ts 的 HERO_COUNT）：
    // 95 部全挂上会把列表接口吹大好几倍，而卡片根本不显示简介。
    const anime = withTitles.anime.map((item, index) => {
      if (index >= HERO_COUNT) {
        return item;
      }
      // 简介也来自本地表（getBangumiSummary），同样不发请求。
      // 只挂**中文**简介：Bangumi 上很多新条目还是日文原文（志愿译者还没翻），
      // 那种不进这个字段——焦点位上直接铺一段日文会让人以为加载错了。
      const summary = getBangumiSummary(item.id);
      return { ...item, summary: summary && !summary.isJapanese ? summary.text : null };
    });

    return Response.json({ ...withTitles, anime });
  } catch (error) {
    const message = error instanceof Error ? error.message : "未知错误";
    // 502 = 上游（AniList）出问题了，不是我们自己的错
    return Response.json({ error: message }, { status: 502 });
  }
}
