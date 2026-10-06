// 系列年表的规则：哪些关系算「同一个系列」、怎么串、怎么排。
//
// 为什么单独一个文件（同 lib/local-match-rank.ts、lib/collection-merge.ts）：
// 白名单是硬约束，**必须有实测**，而实测要跑真代码——不能另抄一份比对（那样测的是抄本）。
// 这里**零 import**，`node` 就能直接 import 它跑断言。

/**
 * 允许跟着走的关系类型。**一个都不能多。**
 *
 * ⚠️ 这是实测撞出来的，不是拍的：
 * 放开让所有关系都跟（把 CHARACTER / SOURCE / SAME_UNIVERSE 之类也算上），
 * 《进击的巨人》会串出 **136 部还没跑完**，混进《歌牌情缘》《攻壳机动队》《LoveLive》
 * ——全是无关作品，因为它们之间只有「客串」「同一世界观」这种弱关系。
 * 限定在这 6 种之后，同一个起点串出 16 部，全是进击系列，年份全对。
 *
 * 6 种对应「续作 / 前作 / 剧场版重剪 / 番外」四类：
 *   SEQUEL      续作
 *   PREQUEL     前作
 *   ALTERNATIVE 另一版本（总集篇剧场版、不同结局的重制版）
 *   SUMMARY     总集篇
 *   SIDE_STORY  外传
 *   SPIN_OFF    番外（衍生作、Q 版小剧场）
 */
export const SERIES_RELATION_TYPES = [
  "SEQUEL",
  "PREQUEL",
  "ALTERNATIVE",
  "SUMMARY",
  "SIDE_STORY",
  "SPIN_OFF",
] as const;

export type SeriesRelationType = (typeof SERIES_RELATION_TYPES)[number];

const ALLOWED: ReadonlySet<string> = new Set(SERIES_RELATION_TYPES);

/**
 * 一部作品经多条边到达时，用哪一条当它的标签。
 *
 * 固定优先级是为了**结果稳定**：同一份数据每次渲染都得到同一个标签，
 * 不随遍历顺序漂移（否则同一页刷新两次可能显示「续作」和「总集篇」）。
 */
const LABEL_PRIORITY: readonly SeriesRelationType[] = [
  "SEQUEL",
  "PREQUEL",
  "ALTERNATIVE",
  "SUMMARY",
  "SPIN_OFF",
  "SIDE_STORY",
];

/** 这条关系在不在白名单里 */
export function isSeriesRelation(type: string): type is SeriesRelationType {
  return ALLOWED.has(type);
}

/**
 * 一条边该不该跟。**两个条件缺一不可**：
 *   ① 关系类型在白名单里
 *   ② **对面那部作品是动画**（不是原作漫画、小说、短篇）
 *
 * 只写 ① 会漏掉一整类：实测《魔法使いの夜》的 `SIDE_STORY` 指向漫画、
 * `ALTERNATIVE` 指向小说——类型全在白名单里，但都不是动画。
 */
function isFollowable(
  edge: SeriesEdgeInfo,
): edge is SeriesEdgeInfo & { type: SeriesRelationType } {
  return edge.nodeType === "ANIME" && isSeriesRelation(edge.type);
}

/**
 * 一条关系边。**带上对面那部作品的基本信息**——这样年表的第一层不用再发请求就能显示。
 * （实测：进击的巨人的关系里带着每部的标题、形式、年份，够画出一张 9 行的表。）
 */
export interface SeriesEdgeInfo {
  type: string;
  id: number;
  /**
   * 对面那部作品的**种类**：ANIME / MANGA / NOVEL / ONE_SHOT…
   *
   * ⚠️ 这个字段是**必需的**，不是顺手带的。实测踩过：
   * 《魔法使いの夜》有 3 条 `SIDE_STORY` 和 1 条 `ALTERNATIVE`——**类型都在白名单里**，
   * 但对面是**漫画和小说**。只看关系类型的话，年表里会冒出「2022 MANGA 魔法使いの夜」
   * 这种行，等于把原作漫画当成了动画系列的一季。
   */
  nodeType: string;
  titleNative: string | null;
  format: string | null;
  year: number | null;
}

/** 一部**已经抓到数据**的作品（自带它的关系边） */
export interface SeriesRecord {
  id: number;
  titleNative: string | null;
  format: string | null;
  year: number | null;
  relations: SeriesEdgeInfo[];
}

/** 年表里的一行 */
export interface SeriesEntry {
  id: number;
  titleNative: string | null;
  format: string | null;
  year: number | null;
  /** 它是怎么连上「当前这一部」的。null = 就是当前这一部自己 */
  relationType: SeriesRelationType | null;
}

interface Explored {
  /** 图里发现过的全部 id，**含还没抓到的** */
  discovered: Set<number>;
  /** id → 它是被哪种关系连上的 */
  relationOf: Map<number, SeriesRelationType>;
  /** id → 从边上看到的基本信息（自己还没抓到时用它兜底显示） */
  edgeInfo: Map<number, SeriesEdgeInfo>;
}

/**
 * 从 rootId 出发，沿着白名单里的关系把整张图摸一遍。
 *
 * 只展开**已经抓到的**节点：某个 id 发现但还没抓时，它的下一层要等抓到才知道。
 * 所以调用方要反复「explore → 抓 nextIdsToFetch → 再 explore」，直到不再有新 id。
 *
 * **终止性**：每个 id 进了 `discovered` 就再也不会被当成新节点展开，所以
 * 环（A→B→A —— 续作/前作**天然成环**）和自环（A→A）都不会死循环。
 * 实测必现的环：进击 S1 有 `SEQUEL→S2`，S2 有 `PREQUEL→S1`。
 */
function explore(rootId: number, records: readonly SeriesRecord[]): Explored {
  const byId = new Map<number, SeriesRecord>();
  for (const record of records) {
    byId.set(record.id, record);
  }

  const discovered = new Set<number>([rootId]);
  const relationOf = new Map<number, SeriesRelationType>();
  const edgeInfo = new Map<number, SeriesEdgeInfo>();

  // 起点自己都没抓到，就没有什么可摸的
  if (!byId.has(rootId)) {
    return { discovered, relationOf, edgeInfo };
  }

  let frontier: number[] = [rootId];

  while (frontier.length > 0) {
    const next: number[] = [];

    for (const id of frontier) {
      const record = byId.get(id);
      if (!record) {
        continue;
      }

      for (const edge of record.relations) {
        // ← 唯一的过滤点：白名单 + 必须是动画。两条都过不了的不跟、也不记
        if (!isFollowable(edge)) {
          continue;
        }

        const known = relationOf.get(edge.id);
        if (
          known === undefined ||
          LABEL_PRIORITY.indexOf(edge.type) < LABEL_PRIORITY.indexOf(known)
        ) {
          relationOf.set(edge.id, edge.type);
        }

        // 边上带的信息先存着；真抓到自己那条记录时，显示会优先用记录里的
        if (!edgeInfo.has(edge.id)) {
          edgeInfo.set(edge.id, edge);
        }

        // ← 防环 / 防重复：见过的 id 不再展开
        if (discovered.has(edge.id)) {
          continue;
        }
        discovered.add(edge.id);
        if (byId.has(edge.id)) {
          next.push(edge.id);
        }
      }
    }

    frontier = next;
  }

  return { discovered, relationOf, edgeInfo };
}

/**
 * 还没抓到的 id（外层据此决定下一批抓谁）。
 * 返回空数组 = 这张图已经走完了。
 */
export function nextIdsToFetch(
  rootId: number,
  records: readonly SeriesRecord[],
): number[] {
  const fetched = new Set(records.map((record) => record.id));
  return [...explore(rootId, records).discovered].filter((id) => !fetched.has(id));
}

/**
 * 串出整个系列，按年份升序（没有年份的排在最后）。
 *
 * ⚠️ 只有「当前这一部」时返回长度为 1 的数组——调用方据此决定**不显示年表这一块**
 * （只有一行的年表是噪音）。
 */
export function buildSeriesTimeline(
  rootId: number,
  records: readonly SeriesRecord[],
): SeriesEntry[] {
  const { discovered, relationOf, edgeInfo } = explore(rootId, records);

  const byId = new Map<number, SeriesRecord>();
  for (const record of records) {
    byId.set(record.id, record);
  }

  const entries: SeriesEntry[] = [];
  for (const id of discovered) {
    const own = byId.get(id);
    const fromEdge = edgeInfo.get(id);
    entries.push({
      id,
      // 自己抓到的数据优先；没有（还没抓到）就用上一层边上带的信息
      titleNative: own?.titleNative ?? fromEdge?.titleNative ?? null,
      format: own?.format ?? fromEdge?.format ?? null,
      year: own?.year ?? fromEdge?.year ?? null,
      relationType: id === rootId ? null : (relationOf.get(id) ?? null),
    });
  }

  entries.sort((a, b) => {
    if (a.year === null && b.year === null) {
      return a.id - b.id;
    }
    if (a.year === null) {
      return 1; // 没年份的一律沉底
    }
    if (b.year === null) {
      return -1;
    }
    return a.year - b.year || a.id - b.id;
  });

  return entries;
}
