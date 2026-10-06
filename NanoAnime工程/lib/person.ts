// 人物页作品列表的「合并 + 去重 + 排序」规则。
//
// 这个文件是**零依赖纯函数**（和 lib/series-graph.ts / lib/local-match-rank.ts 同一个套路）：
// 规则必须有实测，而实测要跑真代码——带 `@/` 别名的模块 Node 直接跑不起来，
// 零 import 才能被 `node` 直接 import 去断言。
//
// 两条实测得出的硬规则（M5-1-1 下半场实测，2026-10-06）：
//   ① 「一页」是**登记条数**的页，不是**作品部数**的页 —— 澤野弘之在《凸变英雄X》上有 7 条登记
//      （音乐 / 主题歌作曲 / 作词 / 编曲 / 演唱…），50 条边合并后只有 20 部作品。
//      不合并的话，同一部作品会在列表里出现 7 次。
//   ② 声优的配音作品不在 staffMedia 里 —— 梶裕貴的 staffMedia 只有 19 部（几乎全是主题歌），
//      配音作品全在 characterMedia（4 页 = 97 部）。所以两个来源都要取、然后合并。

/** 两个来源的一条登记（staff 一条边 / cast 一条边），已经抹平成同一个形状 */
export interface PersonWorkEdge {
  mediaId: number;
  /** AniList 的媒体类型。**只要 ANIME**——characterMedia 没有 type 参数，
   *  必须在这里挡掉（staffMedia 的 type: ANIME 只保证那个来源） */
  mediaType: string;
  titleNative: string | null;
  format: string | null;
  year: number | null;
  popularity: number | null;
  /** 制作职位原文（可能带集数后缀）；配音来源的边没有这个，为 null */
  role: string | null;
  /** 配音的角色名（**实测可能为 null**）；制作来源的边没有这个，为 null */
  characterName: string | null;
}

/** 合并之后、用来画一行的作品 */
export interface PersonWork {
  mediaId: number;
  titleNative: string | null;
  format: string | null;
  year: number | null;
  /** 排序依据。取不到当 0——会沉到列表尾部，不会插到前面冒充热门 */
  popularity: number;
  /** 他在这部作品里的制作职位（**原文**，中文转换在展示层做）。没参与制作时是空数组 */
  roles: string[];
  /** 他在这部作品里配的角色。没配音时是空数组 */
  characters: string[];
}

/**
 * 把两个来源的登记边合并成"一部作品一行"。
 *
 * - 按作品 id 分组；同一作品的多条边合并（职位、角色各自去重后合进同一行）
 * - 非动画的边直接丢掉
 * - 排序：**人气倒序**（用户裁定：代表作优先）；人气相同时按作品 id 倒序，
 *   保证每次渲染顺序一致（不依赖输入顺序）
 */
export function mergePersonWorks(edges: readonly PersonWorkEdge[]): PersonWork[] {
  const byId = new Map<number, PersonWork>();

  for (const edge of edges) {
    if (edge.mediaType !== "ANIME") {
      continue;
    }

    let work = byId.get(edge.mediaId);
    if (!work) {
      work = {
        mediaId: edge.mediaId,
        titleNative: edge.titleNative,
        format: edge.format,
        year: edge.year,
        popularity: edge.popularity ?? 0,
        roles: [],
        characters: [],
      };
      byId.set(edge.mediaId, work);
    }

    // 同一作品的多条边字段理论上一致；以先到的非空值为准，避免后到的 null 把已知值盖掉
    if (work.titleNative === null && edge.titleNative !== null) {
      work.titleNative = edge.titleNative;
    }
    if (work.format === null && edge.format !== null) {
      work.format = edge.format;
    }
    if (work.year === null && edge.year !== null) {
      work.year = edge.year;
    }

    const role = edge.role?.trim();
    if (role && !work.roles.includes(role)) {
      work.roles.push(role);
    }
    const character = edge.characterName?.trim();
    if (character && !work.characters.includes(character)) {
      work.characters.push(character);
    }
  }

  return [...byId.values()].sort((a, b) => b.popularity - a.popularity || b.mediaId - a.mediaId);
}

/**
 * 「加载更多」时把新一批并进已有列表：**已有作品一律跳过**（同一作品只占一行）。
 *
 * ⚠️ 跨批去重必须做：两个来源各自分页，同一部作品的多条登记可能被页边界切开
 * （实测：澤野弘之的《アルドノア・ゼロ 雨の断章》两条边分别落在第 1 页末和第 2 页首）。
 * 保留先到的那行、丢掉后来的重复，行序也不动——已经显示给用户的行不会跳位。
 */
export function appendPersonWorks(
  existing: readonly PersonWork[],
  incoming: readonly PersonWork[],
): PersonWork[] {
  const seen = new Set(existing.map((work) => work.mediaId));
  const added = incoming.filter((work) => !seen.has(work.mediaId));
  return [...existing, ...added];
}
