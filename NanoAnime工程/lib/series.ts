// 系列年表的取数编排：反复「抓一批 → 串图 → 看还缺谁」，直到走完或到上限。
//
// 规则本体（白名单、串图、排序）在 lib/series-graph.ts，那里是零依赖纯函数、可被 node 直接跑。
// 这里只负责**发请求**和**降级**。

import { fetchMediaRelations } from "@/lib/anilist";
import {
  buildSeriesTimeline,
  nextIdsToFetch,
  type SeriesEntry,
  type SeriesRecord,
} from "@/lib/series-graph";

/**
 * 补抓最多几轮。
 *
 * ⚠️ 这个数**不能拍脑袋定小**，实测撞过：一开始设的 4 轮，结果《进击的巨人》
 * 在界面上一直带着「没抓全」的提示——因为它**要 7 轮**才走完。
 *
 * 为什么会这么多轮：系列天然是一条**链**（S1→S2→S3→…），而每一轮只能往下走一层，
 * 所以轮数 ≈ 链长。实测：进击的巨人 7 轮（16 部）、药屋 3 轮（6 部）、
 * 钢炼 FA 2 轮（9 部）、ONE PIECE 2 轮（51 部，它是星形不是链）。
 *
 * 给 8 轮是留一档余量。代价是单个冷启动的系列最多 8 次请求——
 * 但 SeriesRelations 缓存 24 小时，同一个系列一天只付一次。
 *
 * 到上限时的表现**和抓失败完全一样**（见下面的 partial）——界面不区分这两种原因，
 * 都是一句「这次没抓全」，因为对用户来说没区别。
 */
const MAX_ROUNDS = 8;

/** 年表的取数结果 */
export interface SeriesTimelineResult {
  /** 排好序的年表。**只有当前一部时长度为 1**，调用方据此决定不显示这一块 */
  entries: SeriesEntry[];
  /**
   * true = 还有没抓到的作品。两种原因都会置 true：
   *   ① 补抓失败（网络问题、撞上 429 限额）
   *   ② 到了 MAX_ROUNDS 上限，图还没走完
   * 界面必须**如实说明**，不能让用户以为看到的就是全部。
   */
  partial: boolean;
}

/**
 * 取一部作品的系列年表。
 *
 * 第一层（当前作品 + 它的直接关系）**已经在详情查询里带回来了**——
 * 关系边上带着对面那部作品的标题、形式、年份，够画出一张表。
 * 所以即使后续补抓全部失败，年表也不是空的。
 *
 * ⚠️ 这个函数**不抛异常**。详情页的主体（简介、剧集、制作人员、声优）不该因为
 * 年表抓不到就整页报错——那是一次局部失败被放大成了全页故障。
 */
export async function fetchSeriesTimeline(root: SeriesRecord): Promise<SeriesTimelineResult> {
  const records: SeriesRecord[] = [root];
  let partial = false;

  for (let round = 0; round < MAX_ROUNDS; round++) {
    const ids = nextIdsToFetch(root.id, records);
    if (ids.length === 0) {
      break; // 图走完了
    }

    try {
      // ⚠️ 排序后再传：相同的一组 id 生成相同的请求体，Next 的服务端缓存才命得中
      const fetched = await fetchMediaRelations([...ids].sort((a, b) => a - b));
      if (fetched.length === 0) {
        partial = true;
        break;
      }
      records.push(...fetched);
    } catch {
      // 网络失败 / 429 —— 不往上抛，按「没抓全」处理
      partial = true;
      break;
    }
  }

  // 走满 MAX_ROUNDS 后如果还有没抓到的，同样是「没抓全」
  if (nextIdsToFetch(root.id, records).length > 0) {
    partial = true;
  }

  return { entries: buildSeriesTimeline(root.id, records), partial };
}
