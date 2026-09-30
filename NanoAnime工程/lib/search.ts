// 搜索：把两个来源的结果并成一份。
//
// 为什么要两个来源（实测结论，不是拍脑袋）：
// 把本地对照表里 18 个中文名逐个喂给 AniList 的搜索接口，**命中 0/18**——
// AniList 根本没有中文索引。所以：
//   ① 中文关键词 → 只能命中本地 data/title-zh.json
//   ② 日文原名 / 英文名 / 罗马音 → 靠 AniList 搜索接口
// 少任何一个，「搜『药屋』能找到、搜『Frieren』也能找到」就做不成。

import { fetchAnimeByIds, searchAnimeByKeyword } from "@/lib/anilist";
import { findLocalMatches, getTitleZh } from "@/lib/bangumi-index";
import type { Anime, SearchResult } from "@/types/anime";

/**
 * 一次最多给多少条结果。
 * 之所以是固定条数而不是分页：AniList 的 `pageInfo.total` 实测不可信
 * （热门关键词一律返回 5000 封顶），翻页没法判断"到底还有没有下一页"。
 */
export const SEARCH_RESULT_LIMIT = 24;

/**
 * 搜番剧。两个来源合并 + 去重，本地中文命中排在前面。
 *
 * 排序理由：能用中文命中的只有本季那 18 部，用户输中文时最想找的正是它们；
 * 而 AniList 对中文的命中率是 0，所以中文命中优先不会跟 AniList 的相关度排序打架。
 */
export async function searchAnime(keyword: string): Promise<SearchResult> {
  const trimmed = keyword.trim();
  if (!trimmed) {
    return { keyword: "", anime: [], truncated: false };
  }

  const localIds = findLocalMatches(trimmed).slice(0, SEARCH_RESULT_LIMIT);
  const remote = await searchAnimeByKeyword(trimmed, SEARCH_RESULT_LIMIT);

  // 先按 id 建索引。本地命中的那些，AniList 搜索往往返回不了（中文命中率 0），
  // 得单独回头按 id 把封面、年份补齐
  const byId = new Map<number, Anime>(remote.map((item) => [item.id, item]));

  const missing = localIds.filter((id) => !byId.has(id));
  if (missing.length > 0) {
    for (const item of await fetchAnimeByIds(missing)) {
      if (!byId.has(item.id)) {
        byId.set(item.id, item);
      }
    }
  }

  // 本地中文命中的排前面（按 id 升序），AniList 的结果接在后
  const ordered: Anime[] = [];
  const seen = new Set<number>();

  for (const id of localIds) {
    const item = byId.get(id);
    if (item && !seen.has(id)) {
      ordered.push(item);
      seen.add(id);
    }
  }
  for (const item of remote) {
    if (!seen.has(item.id)) {
      ordered.push(item);
      seen.add(item.id);
    }
  }

  const anime = ordered.slice(0, SEARCH_RESULT_LIMIT).map((item) => ({
    ...item,
    // 中文名按 id 从本地表补（跟首页同一个来源、同一套规则：查不到就是 null）
    title: { ...item.title, zh: getTitleZh(item.id) },
  }));

  return {
    keyword: trimmed,
    anime,
    // 撞到上限就意味着可能还有更多——界面据此提示用户把关键词写具体点。
    // 没法用 total 判断（不可信），所以只能这样保守地提示
    truncated: anime.length >= SEARCH_RESULT_LIMIT,
  };
}
