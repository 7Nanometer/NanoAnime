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
 * 判断一段文字是不是日文。
 *
 * 用假名判定：简体中文正文里基本不会出现平假名/片假名，而日文必然有。
 * 实测印证过这条判据——本季新番 17 条简介**全部**命中假名（都是日文原文），
 * 而老番（葬送的芙莉莲、进击的巨人、鬼灭之刃…）6 条全是 0 个假名（都是中文）。
 */
function hasKana(text: string): boolean {
  return /[぀-ゟ゠-ヿ]/.test(text);
}

/** 简介 + 它的语言 */
export interface BangumiSummary {
  text: string;
  /**
   * true = 这条是**日文原文**。
   *
   * ⚠️ 为什么会有日文：Bangumi 的新条目刚建立时，简介里填的是官方日文原文，
   * 要等志愿者后来翻译成中文。**本季 17 条全是日文**（老番才是中文）。
   * 界面必须如实标注这一点，不能让用户以为中文简介加载错了。
   */
  isJapanese: boolean;
}

/**
 * 按 AniList 的 id 取简介。没配对上、或 Bangumi 上没填简介的返回 null。
 *
 * 详情页的简介优先用这个，拿不到才退回 AniList 的英文简介。
 * 注意旧版的 title-zh.json 里没有 summary 这个键，所以这里用 `?.` 兜着。
 */
export function getBangumiSummary(anilistId: number): BangumiSummary | null {
  const text = INDEX[String(anilistId)]?.summary?.trim();
  if (!text) {
    return null;
  }
  return { text, isJapanese: hasKana(text) };
}

/**
 * 拿中文关键词在本地对照表里找，返回命中的 AniList id。
 *
 * 这是搜索功能**唯一**的中文入口：实测把本地 18 个中文名逐个喂给 AniList 的搜索接口，
 * 命中 0/18——AniList 根本没有中文索引。所以中文关键词只能靠这张表。
 *
 * 返回顺序沿用文件里的顺序（数字键的对象会按升序枚举，正好就是 id 升序）。
 * 关键词为空时返回空数组。
 */
export function findLocalMatches(keyword: string): number[] {
  const needle = keyword.trim().toLowerCase();
  if (!needle) {
    return [];
  }

  return Object.entries(INDEX)
    .filter(([, entry]) => entry.title_zh.toLowerCase().includes(needle))
    .map(([anilistId]) => Number(anilistId));
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
