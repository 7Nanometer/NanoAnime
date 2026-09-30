// 读「中文名对照表」的运行时入口。
//
// 中文名是 scripts/fetch-title-zh.ts 一次性从 Bangumi 抓下来、存进 data/title-zh.json 的，
// 应用运行时**只读这个文件，绝不实时请求 Bangumi**（原因见 lib/bangumi.ts 顶部注释）。
//
// 为什么和 lib/bangumi.ts 分成两个文件：那个文件要联网，而且要被 `node scripts/xxx.ts`
// 直接 import —— Node 不认 tsconfig 的 @ 别名，所以那边只能有纯类型导入。
// 这里反过来，要读本地 JSON，只能在 Next 里用。混在一起脚本就跑不起来了。

import rawIndex from "@/data/title-zh.json";
import type { SeasonAnimeResult } from "@/types/anime";
import type { BangumiIndex } from "@/types/bangumi";

/**
 * JSON 导入的类型是按文件内容推断的，这里断言成我们约定的结构。
 * 文件由脚本生成，结构有 scripts/fetch-title-zh.ts 兜着。
 */
const INDEX = rawIndex as BangumiIndex;

/** 按 AniList 的 id 取中文名。没配对上的返回 null——不猜、不拿别的字段顶替 */
export function getTitleZh(anilistId: number): string | null {
  return INDEX[String(anilistId)]?.title_zh ?? null;
}

/**
 * 把中文名并进一批番剧里。
 * 配不上的作品 title.zh 保持 null，展示层会据此退回日文原名。
 */
export function attachChineseTitles(result: SeasonAnimeResult): SeasonAnimeResult {
  return {
    ...result,
    anime: result.anime.map((anime) => ({
      ...anime,
      title: { ...anime.title, zh: getTitleZh(anime.id) },
    })),
  };
}
