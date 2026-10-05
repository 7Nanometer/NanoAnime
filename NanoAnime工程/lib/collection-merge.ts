/**
 * 追番记录的「本地 ↔ 云端」合并规则。
 *
 * ─────────────────────────────────────────────────────────────
 * ⚠️ 这个文件是**故意写成纯函数、且一个 import 都没有**的。
 *
 * 原因只有一个：**合并规则必须能被真的跑起来测**，不能只靠读代码确认。
 * 不 import 任何东西、不碰存储、不碰网络、不碰浏览器，Node 就能直接
 * `import` 它跑（实测 Node 24 自带 TypeScript 剥离，无需编译、无需装依赖）。
 *
 * 所以：**别往这个文件里加 import**（`import type` 也会带来路径解析问题）。
 * 数据形状就在这里定义，需要用到它们的 `lib/collection.ts` 反过来 import 这里。
 *
 * ⚠️ 合并规则是**全项目唯一权威定义**，写在这里，别在别处再实现一遍。
 * ─────────────────────────────────────────────────────────────
 */

/**
 * 一条可以在本地和云端之间搬运的记录。
 *
 * 只放**两边都说得清**的字段。番剧的标题、封面这些显示信息不在这里 ——
 * 它们是「快照」，只存在本地（详见 lib/collection.ts 的说明）。
 */
export interface SyncEntry {
  /** AniList 的番剧编号 */
  animeId: number;
  /** 看到第几集。0 = 一集没看 */
  progress: number;
  /** 加入追番的时刻（Unix 毫秒） */
  addedAt: number;
  /**
   * **用户真正改动这条记录**的时刻（Unix 毫秒）。
   *
   * ⚠️ 它和 `addedAt` 是两回事：加进去之后改进度，`addedAt` 不动、这个动。
   * 合并时比大小的就是它。
   *
   * ⚠️ 它对应的云端列是 `client_updated_at`，**不是** `updated_at`。
   * 后者会被数据库触发器刷成"服务器当前时间"，比不出新旧（详见 0002 迁移文件的注释）。
   */
  updatedAt: number;
}

/**
 * 云端 `collection` 表里的一行 —— 只列出同步用得上的列。
 *
 * 时间列在数据库里是 `timestamptz`，通过接口拿到的是 ISO 字符串。
 */
export interface RemoteRow {
  anilist_id: number;
  progress: number;
  added_at: string | null;
  client_updated_at: string;
}

/** 写回云端时要给的列（不含 user_id —— 那个由调用方按当前登录用户填） */
export interface RemoteRowPayload {
  anilist_id: number;
  progress: number;
  added_at: string;
  client_updated_at: string;
}

/** ISO 字符串 → Unix 毫秒。解析不出来就返回备用值，绝不抛错 */
function parseTime(value: string | null | undefined, fallback: number): number {
  if (!value) {
    return fallback;
  }
  const ms = Date.parse(value);
  return Number.isFinite(ms) ? ms : fallback;
}

/**
 * 云端的一行 → 可合并的记录。
 *
 * `added_at` 理论上不会缺（迁移里补过），但真缺了也不能算成 0 ——
 * 那会让这条记录排到列表最底下、看着像丢了。退而用「最后改动时间」兜底。
 */
export function remoteRowToSyncEntry(row: RemoteRow): SyncEntry {
  const updatedAt = parseTime(row.client_updated_at, 0);
  return {
    animeId: row.anilist_id,
    progress: row.progress,
    addedAt: parseTime(row.added_at, updatedAt),
    updatedAt,
  };
}

/** 可合并的记录 → 写回云端的列 */
export function syncEntryToRemoteRow(entry: SyncEntry): RemoteRowPayload {
  return {
    anilist_id: entry.animeId,
    progress: entry.progress,
    added_at: new Date(entry.addedAt).toISOString(),
    client_updated_at: new Date(entry.updatedAt).toISOString(),
  };
}

/**
 * 合并本地与云端的记录 —— **取并集，同一条以更新时间晚的为准**。
 *
 * 三条规矩：
 * 1. **任何一侧有的都不丢**。本地 5 部 + 云端 3 部（互不相交）= 8 部。
 *    这是最要紧的一条：合并**永远不会让记录变少**，用户不会看到"数据丢了"。
 * 2. 同一个 animeId 两侧都有 → `updatedAt` 大的赢。
 * 3. **平手时本地赢**。必须定一个方向，否则两边来回推、永远收敛不了
 *    （你推给我、我推给你，界面不停跳）。定成本地赢是为了让结果稳定。
 *
 * 返回的顺序按「加入时间倒序」，也就是新加的排前面 —— 和本地列表本来的顺序一致。
 * 同一时刻加入的按 animeId 排，保证结果每次都一样（不依赖 Map 的插入顺序）。
 *
 * ⚠️ 不修改入参：返回的都是新对象。调用方传进来的数组不会被就地改动。
 */
export function mergeSyncEntries(
  local: SyncEntry[],
  remote: SyncEntry[],
): SyncEntry[] {
  const byAnimeId = new Map<number, SyncEntry>();

  // 先铺云端。后面本地覆盖它，所以"平手"天然归本地赢
  for (const entry of remote) {
    byAnimeId.set(entry.animeId, { ...entry });
  }

  for (const entry of local) {
    const fromCloud = byAnimeId.get(entry.animeId);
    // >= 而不是 >：相等时本地赢，见上面第 3 条
    if (!fromCloud || entry.updatedAt >= fromCloud.updatedAt) {
      byAnimeId.set(entry.animeId, { ...entry });
    }
  }

  return [...byAnimeId.values()].sort(
    (a, b) => b.addedAt - a.addedAt || a.animeId - b.animeId,
  );
}

/**
 * 这一条本地记录该不该推上云端。
 *
 * 用于「本地改了之后只推改动的那几条」，避免每打一个钩就把整份列表重推一遍。
 * 云端没有这条 → 该推；云端有但本地的更新时间更晚 → 该推。
 */
export function shouldLocalPush(
  local: SyncEntry,
  remote: SyncEntry | undefined,
): boolean {
  return !remote || local.updatedAt > remote.updatedAt;
}
