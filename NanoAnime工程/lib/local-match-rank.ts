// 本地中文命中的排序规则。
//
// 为什么单独一个文件（不是"多此一举的抽象层"）：这套规则**必须有实测**，
// 而实测要跑**真代码**——不能另抄一份比对，那样测的是抄本、不是线上跑的东西。
// lib/bangumi-index.ts 里带 `@/` 别名导入（`@/data/title-zh.json`），Node 直接跑不起来；
// 这里**零 import**，`node` 就能 import 它跑真实断言。和 lib/collection-merge.ts 一个道理。

/** 一条候选。只放排序用得上的三样东西，不依赖数据文件的形状 */
export interface LocalMatchCandidate {
  /** AniList 的作品 id */
  anilistId: number;
  /** 中文名 */
  titleZh: string;
  /**
   * AniList 的人气值（多少人看过 / 想看）。
   * 旧版的 title-zh.json 里没有这个键，用 null 表示「不知道」——
   * 排的时候按 0 处理（垫底），但**绝不因此丢结果**。
   */
  popularity: number | null;
}

/** 匹配档位。数字越小越靠前 */
const TIER_EXACT = 0;
const TIER_PREFIX = 1;
const TIER_CONTAINS = 2;

/**
 * 判断一个标题属于哪一档。传进来的两个参数都必须是**已转小写**的。
 *
 * 0 完全相等 —— 用户输的就是这个名字，几乎没有比它更准的
 * 1 开头匹配 —— 「鬼灭之刃」→「鬼灭之刃 游郭篇」，用户多半在找这一串
 * 2 中间包含 —— 「巨人」命中「进击的巨人」，相关，但没前两档确定
 */
function getTier(lowerTitle: string, lowerNeedle: string): number {
  if (lowerTitle === lowerNeedle) {
    return TIER_EXACT;
  }
  if (lowerTitle.startsWith(lowerNeedle)) {
    return TIER_PREFIX;
  }
  return TIER_CONTAINS;
}

/**
 * 从候选里挑出命中关键词的，按相关度排好序，返回 AniList id。
 *
 * 匹配方式与以前**完全一致**（转小写后 `includes`），这一轮只动排序。
 *
 * 排序规则：
 *   ① 档位（完全相等 > 开头匹配 > 中间包含）
 *   ② 同档位内按人气值**从高到低**
 *   ③ 人气也一样时按 id 从大到小 —— 纯粹为了结果稳定，不随数据顺序漂移
 *
 * ⚠️ 这里**不按中文标题本身的字符排序**：中文按字符编码排出来没有意义
 * （「阿」在「波」前面纯属编码巧合），排了等于没排。
 *
 * 关键词为空（或只有空格）时返回空数组。
 */
export function rankLocalMatches(
  candidates: readonly LocalMatchCandidate[],
  keyword: string,
): number[] {
  const needle = keyword.trim().toLowerCase();
  if (!needle) {
    return [];
  }

  const matched: { anilistId: number; tier: number; popularity: number }[] = [];

  for (const candidate of candidates) {
    const lowerTitle = candidate.titleZh.toLowerCase();
    if (!lowerTitle.includes(needle)) {
      continue;
    }
    matched.push({
      anilistId: candidate.anilistId,
      tier: getTier(lowerTitle, needle),
      popularity: candidate.popularity ?? 0,
    });
  }

  matched.sort(
    (a, b) => a.tier - b.tier || b.popularity - a.popularity || b.anilistId - a.anilistId,
  );

  return matched.map((item) => item.anilistId);
}
