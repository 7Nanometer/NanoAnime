// 追番记录的存储层 —— **本地优先 + 登录后同步到云端**。
//
// ⚠️ 这是全项目**唯一**直接碰浏览器存储的地方。
// 页面组件一律通过 components/useCollection.ts 间接使用，不许自己去调 localStorage。
//
// ─────────────────────────────────────────────────────────────
// 三条原则（改这个文件前先读一遍）
//
// 1. **本地优先**。没登录、没配 Supabase、网络不通 —— 全都和以前一模一样，
//    纯读写本地，一个网络请求都不发。登录从来不是使用它的前提。
//
// 2. **合并只增不减**。本地和云端取并集，任何一侧有的记录都不会因为合并消失。
//    用户最怕的就是"我的记录呢" —— 这条是底线。
//
// 3. **同步失败不碰本地**。拉取成功之前绝不写本地；推失败也不回滚。
//    失败时本地数据一条不少，界面负责如实说明（见 components/MyCollection.tsx）。
// ─────────────────────────────────────────────────────────────

import type { Anime, CollectionEntry } from "@/types/anime";
import { createClient } from "@/lib/supabase/client";
import { withSupabaseTimeout } from "@/lib/supabase/timeout";
import {
  filterOwnRows,
  mergeSyncEntries,
  remoteRowToSyncEntry,
  shouldLocalPush,
  syncEntryToRemoteRow,
  type SyncEntry,
} from "@/lib/collection-merge";

/** 存储键。带 v1 是为了将来结构变了能认出旧数据、做一次迁移 */
export const COLLECTION_STORAGE_KEY = "nanoanime.collection.v1";

/**
 * 真正写进 localStorage 的一条记录 = 对外那条 + 一个更新时间。
 *
 * ⚠️ 为什么 `updatedAt` 不放进 `types/anime.ts` 的 `CollectionEntry`：
 * 那个类型是给页面组件看的，它们一个字段都用不上"更新时间"；
 * 加进去等于让所有消费者陪着一个内部细节改类型。
 * 这里用「多一个字段」的办法——`StoredEntry` 是 `CollectionEntry` 的子类型，
 * 读出去给谁都照样能用，页面一行都不用改。
 */
interface StoredEntry extends CollectionEntry {
  /**
   * **用户真正改动这条记录**的时刻（Unix 毫秒）。
   * 和 `addedAt` 不是一回事：加进去之后改进度，`addedAt` 不动、这个动。
   * 云端合并时比大小的就是它。
   */
  updatedAt: number;
}

/** 写进 localStorage 的完整结构。外面包一层 version，方便以后升级 */
interface StoredCollection {
  version: 1;
  entries: StoredEntry[];
}

/**
 * 拿到浏览器的本地存储。
 *
 * 两种情况会拿不到，都必须挡住：
 * - 服务端渲染时压根没有 `window`
 * - 浏览器隐私模式下，**光是访问 `localStorage` 这个属性就会抛异常**（不是返回 null）
 */
function getStorage(): Storage | null {
  try {
    if (typeof window === "undefined") {
      return null;
    }
    return window.localStorage;
  } catch {
    return null;
  }
}

/**
 * 本地存储到底能不能用。
 * 隐私模式、被浏览器策略禁用、存储写满时会返回 false——界面据此给用户一句人话，
 * 而不是让"追番记不住"变成一个说不清原因的怪现象。
 */
export function isStorageAvailable(): boolean {
  const storage = getStorage();
  if (!storage) {
    return false;
  }
  try {
    // 光能拿到 localStorage 不算数，真写一次才知道——所以探一下
    const probe = "__nanoanime_probe__";
    storage.setItem(probe, "1");
    storage.removeItem(probe);
    return true;
  } catch {
    return false;
  }
}

/**
 * 只挑 Anime 需要的字段存下来。
 *
 * 为什么必须挑：`addToCollection()` 收到的是详情页那个完整的 `AnimeDetail`，
 * 里面还带着英文简介、制作公司、类型、剧集列表。全存进去的话，
 * 本地存储会被撑大好几倍，而 `/my` 一个字段都用不上。
 */
function toSnapshot(anime: Anime): Anime {
  return {
    id: anime.id,
    title: {
      native: anime.title.native,
      english: anime.title.english,
      romaji: anime.title.romaji,
      zh: anime.title.zh,
    },
    coverImage: {
      extraLarge: anime.coverImage.extraLarge,
      large: anime.coverImage.large,
      color: anime.coverImage.color,
    },
    episodes: anime.episodes,
    averageScore: anime.averageScore,
    // Bangumi 评分/排名（2026-10-09 全站评分口径）：加入收藏时若数据已带（详情页
    // 补过）就存下来；老快照没有也不会一直缺——/my 会用 id 走 /api/anime/by-ids
    // 拉最新数据（fresh ?? entry.anime），拉回来就补上了
    bangumiRating: anime.bangumiRating ?? null,
    bangumiRank: anime.bangumiRank ?? null,
    startDate: anime.startDate
      ? { year: anime.startDate.year, month: anime.startDate.month, day: anime.startDate.day }
      : null,
    status: anime.status,
    format: anime.format,
    nextAiringEpisode: anime.nextAiringEpisode
      ? {
          episode: anime.nextAiringEpisode.episode,
          airingAt: anime.nextAiringEpisode.airingAt,
        }
      : null,
  };
}

/**
 * 给「只在云端存在」的记录造一个占位快照。
 *
 * ⚠️ 为什么会有这种记录：云端表**没有**存番剧的标题、封面（那些是显示用的快照）。
 * 换一台设备登录时，能拿回来的只有"哪部番、看到第几集"。
 *
 * 这不影响显示：`MyCollection` 本来就会拿这些 id 去 `/api/anime/by-ids` 拉最新信息，
 * 拉到了就用它渲染（`fresh ?? entry.anime`），这份占位快照只是兜底。
 * 唯一的毛边是：**刚拉下来还没点进去看过的那一条，在"取消追番"的确认框里番名是空的**。
 */
function placeholderAnime(animeId: number): Anime {
  return {
    id: animeId,
    title: { native: null, english: null, romaji: null, zh: null },
    coverImage: { extraLarge: null, large: null, color: null },
    episodes: null,
    averageScore: null,
    bangumiRating: null,
    bangumiRank: null,
    startDate: null,
    status: "FINISHED",
    format: "TV",
    nextAiringEpisode: null,
  };
}

/**
 * 校验一条记录是不是长得对，并补齐 `updatedAt`。
 * 存进去的 JSON 是用户能随手改的（开发者工具里改一下就行），所以读出来必须验，
 * 不能假设它一定是我们写进去的样子。验不过的直接丢，不让坏数据把页面搞崩。
 *
 * ⚠️ 老数据没有 `updatedAt`（这个字段是加云同步时才有的）。
 * **不能因此把它们丢掉**——那等于用户一升级，追番记录全没了。
 * 所以退回用 `addedAt` 当更新时间：至少保证它比"更晚加入的"旧，排序和合并都还讲得通。
 */
function normalizeEntry(value: unknown): StoredEntry | null {
  if (typeof value !== "object" || value === null) {
    return null;
  }
  const entry = value as Partial<StoredEntry>;
  if (
    typeof entry.animeId !== "number" ||
    !Number.isInteger(entry.animeId) ||
    entry.animeId <= 0 ||
    typeof entry.progress !== "number" ||
    !Number.isInteger(entry.progress) ||
    entry.progress < 0 ||
    typeof entry.addedAt !== "number" ||
    typeof entry.anime !== "object" ||
    entry.anime === null
  ) {
    return null;
  }

  const updatedAt =
    typeof entry.updatedAt === "number" && Number.isFinite(entry.updatedAt)
      ? entry.updatedAt
      : entry.addedAt;

  return {
    animeId: entry.animeId,
    progress: entry.progress,
    addedAt: entry.addedAt,
    anime: entry.anime,
    updatedAt,
  };
}

/** 读出全部记录（含内部的更新时间） */
function readStoredEntries(): StoredEntry[] {
  const storage = getStorage();
  if (!storage) {
    return [];
  }

  try {
    const raw = storage.getItem(COLLECTION_STORAGE_KEY);
    if (!raw) {
      return [];
    }
    const parsed = JSON.parse(raw) as Partial<StoredCollection>;
    if (!Array.isArray(parsed.entries)) {
      return [];
    }
    return parsed.entries
      .map(normalizeEntry)
      .filter((entry): entry is StoredEntry => entry !== null);
  } catch {
    return [];
  }
}

/**
 * 读出全部追番记录。
 * 任何异常（存储用不了、JSON 被改坏）都退化成空列表——绝不把页面带崩。
 */
export function readCollection(): CollectionEntry[] {
  return readStoredEntries();
}

/**
 * 写回全部记录，并把写入后的列表原样返回。
 *
 * 写失败（存储写满 / 被禁用）时**不抛异常**：内存里的状态照常返回，
 * 用户这一次会话仍然能用，只是关掉浏览器会丢——`isStorageAvailable()` 会告诉界面去提示。
 */
function writeCollection(entries: StoredEntry[]): StoredEntry[] {
  const storage = getStorage();
  if (storage) {
    try {
      const payload: StoredCollection = { version: 1, entries };
      storage.setItem(COLLECTION_STORAGE_KEY, JSON.stringify(payload));
    } catch {
      // 静默失败，见上面的说明
    }
  }
  return entries;
}

// ═══════════════════════════════════════════════════════════════════════
// 变化通知 —— 给界面层的唯一新接口
// ═══════════════════════════════════════════════════════════════════════

/**
 * ⚠️ 为什么需要它：`components/useCollection.ts` 的快照是**缓存**的，
 * 它自己只认两条刷新路径 —— 本标签页调用它自己的写方法、或别的标签页改了存储。
 * **云端拉取两条都不沾**：数据写进了 localStorage，界面却不知道。
 * 所以本地这里必须主动广播一声，界面才知道"该重读了"。
 */
const changeListeners = new Set<() => void>();

/** 订阅"记录或同步状态变了"。返回值是退订函数 */
export function subscribeCollection(listener: () => void): () => void {
  changeListeners.add(listener);
  return () => {
    changeListeners.delete(listener);
  };
}

function emitChange(): void {
  for (const listener of changeListeners) {
    listener();
  }
}

// ═══════════════════════════════════════════════════════════════════════
// 云端同步引擎
// ═══════════════════════════════════════════════════════════════════════

/**
 * 同步状态。界面据此决定要不要显示"云端同步失败"那行字。
 * - `local`   没登录 / 没配 Supabase —— 纯本地模式，这是**正常状态**，不是错误
 * - `syncing` 正在同步
 * - `synced`  上一次同步成功
 * - `error`   上一次同步失败（本地记录仍然完好，界面要如实说明）
 * - `consent` 有一笔改动等着推上云端，但用户还没确认过"首次同步"。
 *             **首次推送前必须先说明白**（见 SyncConsentBanner）：推送 = 数据离开本机。
 * - `paused`  用户明确选了"暂不同步"（横幅上的另一个按钮）。从此不推、也不再问——
 *             拉取照常（读自己的云端记录不涉及外发）；「我的追番」里有常驻入口可随时再开启。
 */
export type SyncStatus = "local" | "syncing" | "synced" | "error" | "consent" | "paused";

let syncStatus: SyncStatus = "local";

/** 给界面读的同步状态 */
export function getSyncStatus(): SyncStatus {
  return syncStatus;
}

function setSyncStatus(next: SyncStatus): void {
  if (syncStatus === next) {
    return;
  }
  syncStatus = next;
  emitChange();
}

type Client = ReturnType<typeof createClient>;

let engineStarted = false;
let client: Client | null = null;
/** 当前登录用户的 id。null = 没登录 */
let currentUserId: string | null = null;
/** 一轮同步正在跑。防止并发跑两轮互相覆盖 */
let syncInFlight = false;
/** 跑着的时候又有人要求同步 —— 记下来，当前这轮结束后补一轮（不能直接丢） */
let syncQueued = false;
let pushTimer: ReturnType<typeof setTimeout> | undefined;

/**
 * 本次会话里"已经在本地删掉、但还没能从云端删掉"的番剧。
 *
 * ⚠️ 为什么必须有它：删除**必须**同步到云端，否则下次一拉取，那条记录就复活了。
 * 删成功的会立刻从集合里移除；没删成功的（当时离线）留到下一轮同步重试。
 *
 * ⚠️ 已知边界：它是**内存里的**。如果用户删完就关掉浏览器、一直没联网成功，
 * 这个"欠账"就丢了，下次同步那条记录会被拉回来。
 * 要彻底解决得在本地存"墓碑"（带时间的删除标记），本轮按决定不做。
 *
 * ⚠️⚠️ 值必须记下"这笔欠账是谁的"（用户 id），不能只记番剧 id。
 * 否则共用设备上：A 删了一部番 → A 退出 → B 登录 → 同步时这笔欠账会拿去删 **B 的**那条记录。
 * 记上归属之后，处理时只认当前用户的那几笔。
 */
const pendingDeletes = new Map<number, string>();

/** 只在浏览器里、且只建一次客户端。环境变量没配就返回 null（= 同步功能没开） */
function getClient(): Client | null {
  if (typeof window === "undefined") {
    return null;
  }
  if (client) {
    return client;
  }
  try {
    client = createClient();
    return client;
  } catch {
    // 没配 Supabase → 同步功能没开。这是正常情况，不是错误
    return null;
  }
}

/**
 * 启动同步引擎。**只在浏览器里、只启动一次**。
 *
 * 由 `components/useCollection.ts` 在模块加载时调用一次
 * （那个文件本来就有一个 `typeof window !== "undefined"` 的守卫，和它放一起）。
 * 放在那儿而不是这里，是为了不在服务端渲染时产生任何副作用。
 */
export function startSyncEngine(): void {
  if (engineStarted || typeof window === "undefined") {
    return;
  }
  engineStarted = true;

  const supabase = getClient();
  if (!supabase) {
    // 同步功能没开，永远停在 local 状态
    return;
  }

  void runSync();

  // 断网重连后自动补一次。
  // ⚠️ 没有它，"联网后会自动重试"这句话就是假的 —— 失败之后除了用户再改一次数据、
  // 或者重新加载页面，没有任何东西会再触发同步。
  window.addEventListener("online", () => {
    void runSync();
  });

  supabase.auth.onAuthStateChange((_event, session) => {
    const userId = session?.user.id ?? null;
    if (userId === currentUserId) {
      return;
    }
    currentUserId = userId;
    if (userId) {
      void runSync();
    } else {
      // 退出登录：回到纯本地模式。**本地记录一条都不动**——
      // 退出登录不该让用户觉得"我的追番没了"。
      setSyncStatus("local");
    }
  });
}

/**
 * 跑一轮同步。失败一律吞掉，绝不抛给调用方（更不会影响本地数据）。
 *
 * ⚠️ 顺序很重要：**先拉、再合并写本地、最后推**。
 * 拉取失败就直接结束，一个字都不写本地 —— 这样"同步失败"时本地数据必定完好。
 */
async function runSync(): Promise<void> {
  const supabase = getClient();
  if (!supabase) {
    return;
  }
  if (syncInFlight) {
    // ⚠️ 不能直接丢掉：这一轮跑着的时候用户改的东西就没人推上去了。
    // 记一笔，等当前这轮结束再补一轮。
    syncQueued = true;
    return;
  }

  syncInFlight = true;
  try {
    const identity = await resolveIdentity(supabase);

    if (identity.kind === "out") {
      setSyncStatus("local");
      return;
    }

    if (identity.kind === "offline") {
      // ⚠️ 这一支是关键：「有凭证、但连不上」**不能**当成"没登录"。
      // 当成没登录的话，断网时用户看到的是一屏正常页面、毫无提示，
      // 而他以为自己在同步 —— 这正好是验收要求里"断网要有一行说明"要防的情况。
      setSyncStatus("error");
      return;
    }

    currentUserId = identity.userId;
    setSyncStatus("syncing");
    const outcome = await syncOnce(supabase, identity.userId);
    // 如实报状态，界面各管各的：consent → 出横幅；paused → /my 上那行常驻说明
    setSyncStatus(
      outcome === "needs-consent" ? "consent" : outcome === "paused" ? "paused" : "synced",
    );
  } catch {
    // 拉取/写入/推送任一环节出错都到这里。
    // 本地数据完好（拉取成功前不写本地），界面负责说明。
    setSyncStatus("error");
  } finally {
    syncInFlight = false;
    if (syncQueued) {
      syncQueued = false;
      void runSync();
    }
  }
}

/** 当前身份。三种情况必须分清，混在一起就会把"断网"说成"没登录" */
type Identity =
  | { kind: "out" } // 确认没登录 —— 纯本地模式，这是正常状态
  | { kind: "offline" } // 有登录凭证，但核验不了（断网/服务器不可达）
  | { kind: "in"; userId: string };

/**
 * 弄清当前是哪种身份。
 *
 * 先看**本地 cookie 里有没有凭证**（`getSession()` 只读本地，不联网）：
 *   - 没有 → 确定是没登录，`getUser()` 也会立刻返回，不会有网络请求
 *   - 有   → 再去服务器核验（`getUser()`）；核验这一步失败，就是"连不上"
 *
 * ⚠️ 不用 `getSession()` 的返回值当"已登录"的证据（它不验真伪，可以被伪造）——
 * 这里只用它回答"有没有凭证"，**身份一律以 `getUser()` 的结果为准**。
 *
 * 整体超时：超时说明有凭证要核验却连不上 → 同样算"连不上"。
 */
async function resolveIdentity(supabase: Client): Promise<Identity> {
  const result = await withSupabaseTimeout(async () => {
    const { data: sessionData } = await supabase.auth.getSession();
    if (!sessionData.session) {
      return { kind: "out" } as Identity;
    }
    const { data } = await supabase.auth.getUser();
    return data.user
      ? ({ kind: "in", userId: data.user.id } as Identity)
      : ({ kind: "offline" } as Identity);
  });

  return result ?? { kind: "offline" };
}

// ═══════════════════════════════════════════════════════════════════════
// 知情同意 —— 首次推送前必须过一次
// ═══════════════════════════════════════════════════════════════════════
//
// 一笔改动被推上去，意味着它**离开这台设备**、存进云端账号（换设备能拉回来）。
// 在数据第一次离开本机之前，先让用户知情、自己按下"开始同步"
// （界面横幅见 components/SyncConsentBanner.tsx）。
//
// 三种状态，两条路：
//   · 同意（"1"）  → 正常同步
//   · 拒绝（"0"）  → **记住这个选择**：从此不推、也不再弹横幅（不能反复打扰），
//                    但「我的追番」里留一个常驻入口可以随时改主意（不能死锁）。
//                    拒绝之后状态报 `paused`，界面必须说清"记录不会同步到云端"。
//   · 没表过态     → 有东西要推时弹横幅问一次

/** 同意标记的键前缀。**按账号分开存** —— 共用设备上 A 确认过 ≠ B 确认过（宪法第 13 条） */
const SYNC_CONSENT_KEY_PREFIX = "nanoanime.sync-consent.v1";

type SyncConsent = "granted" | "declined" | "unset";

function readSyncConsent(userId: string): SyncConsent {
  const storage = getStorage();
  if (!storage) {
    return "unset";
  }
  try {
    const value = storage.getItem(`${SYNC_CONSENT_KEY_PREFIX}.${userId}`);
    return value === "1" ? "granted" : value === "0" ? "declined" : "unset";
  } catch {
    return "unset";
  }
}

/** 记下选择（本机、按账号）。存不上就当作没表过态——下次再问，总比假装记下了强 */
function writeSyncConsent(userId: string, consent: "granted" | "declined"): void {
  const storage = getStorage();
  if (!storage) {
    return;
  }
  try {
    storage.setItem(`${SYNC_CONSENT_KEY_PREFIX}.${userId}`, consent === "granted" ? "1" : "0");
  } catch {
    // 静默：标记没写成，下次同步还会再问一遍——不算错
  }
}

/**
 * 用户点了横幅上的「我知道了，开始同步」：记下同意（本机、按账号），立刻重跑一轮
 * ——把刚才拦下的推送补上。
 *
 * ⚠️ 标记存本机不存云端：换一台设备会**再问一次**。这是有意的——
 * "每台设备第一次往外推送之前，先告诉用这台设备的人"正是我们要的语义。
 */
export function giveSyncConsent(): void {
  const userId = currentUserId;
  if (!userId) {
    return;
  }
  writeSyncConsent(userId, "granted");
  void runSync();
}

/**
 * 用户点了横幅上的「暂不同步」：**记住这个选择**。
 *
 * 之后的行为（三条，一条都不能少）：
 * 1. 永远不推 —— 记录只在本机，换设备看不到
 * 2. **横幅不再出现**（不反复打扰）
 * 3. 「我的追番」里有一条常驻说明 + 「开启同步」按钮（想改主意随时可以，不死锁）
 */
export function declineSyncConsent(): void {
  const userId = currentUserId;
  if (!userId) {
    return;
  }
  writeSyncConsent(userId, "declined");
  // 立刻如实报状态（不等下一轮同步）——界面据此把那行说明显示出来
  setSyncStatus("paused");
  // 再跑一轮：拉取照常（把自己的云端记录拉回来不涉及外发），推送会被上面的"declined"拦住
  void runSync();
}

/** 一轮同步的实体：拉 → 合并 → 写本地 → 推（推之前要看"同意"状态） */
async function syncOnce(
  supabase: Client,
  userId: string,
): Promise<"ok" | "needs-consent" | "paused"> {
  // ── 1. 先处理"欠账"：把之前没能删掉的云端记录删掉 ──
  // 放在拉取之前：不先把它们删掉的话，下面一拉取就把它们拉回来了。
  // ⚠️ 只处理**属于当前用户**的那几笔（见 pendingDeletes 的说明）
  const myPendingDeletes = [...pendingDeletes.entries()]
    .filter(([, ownerId]) => ownerId === userId)
    .map(([animeId]) => animeId);

  if (myPendingDeletes.length > 0) {
    const done = await withSupabaseTimeout(async (signal) => {
      const { error } = await supabase
        .from("collection")
        .delete()
        .eq("user_id", userId)
        .in("anilist_id", myPendingDeletes)
        .abortSignal(signal);
      return error ? null : myPendingDeletes;
    });
    if (done) {
      for (const id of done) {
        if (pendingDeletes.get(id) === userId) {
          pendingDeletes.delete(id);
        }
      }
    }
  }
  const myPendingDeleteSet = new Set(myPendingDeletes);

  // ── 2. 拉云端 ──
  // ⚠️ 列名**显式列出**，不用 `select("*")`：只取用得上的列（note 这类将来可能装
  //    私密内容的列尤其不该"顺手全取"），接口形态也更稳定。
  //    多取了一个 user_id —— 给下面 filterOwnRows 那道兜底锁用。
  const rows = await withSupabaseTimeout(async (signal) => {
    const { data, error } = await supabase
      .from("collection")
      .select("user_id, anilist_id, progress, added_at, client_updated_at")
      .eq("user_id", userId)
      .abortSignal(signal);
    if (error) {
      throw new Error(error.message);
    }
    return data;
  });

  if (!rows) {
    // 超时或被掐断 —— 当作本轮失败，**本地一个字都不写**
    throw new Error("拉取云端记录超时");
  }

  // ⚠️ 第二道锁：拉回来的每一行再验一次归属（见 filterOwnRows 的说明）。
  // 查询里那句 .eq 是第一道；两道都在，防的是"将来某次改动手滑改坏其中一道"。
  const remoteEntries = filterOwnRows(rows, userId).map(remoteRowToSyncEntry);
  const remoteById = new Map(remoteEntries.map((entry) => [entry.animeId, entry]));

  // ── 3. 合并 ──
  const localEntries = readStoredEntries();
  const localSync: SyncEntry[] = localEntries.map((entry) => ({
    animeId: entry.animeId,
    progress: entry.progress,
    addedAt: entry.addedAt,
    updatedAt: entry.updatedAt,
  }));

  // 本次欠账里的番剧，本地已经删了，云端那份要被无视掉（上面删失败时兜底）
  const remoteForMerge = remoteEntries.filter(
    (entry) => !myPendingDeleteSet.has(entry.animeId),
  );

  const merged = mergeSyncEntries(localSync, remoteForMerge);

  // ── 4. 写回本地（**一条都不少**：并集只会变多） ──
  const localById = new Map(localEntries.map((entry) => [entry.animeId, entry]));
  const nextStored: StoredEntry[] = merged.map((entry) => ({
    animeId: entry.animeId,
    progress: entry.progress,
    addedAt: entry.addedAt,
    updatedAt: entry.updatedAt,
    // 本地有就用本地的快照（带标题封面）；只在云端的用占位（界面会去拉真实信息）
    anime: localById.get(entry.animeId)?.anime ?? placeholderAnime(entry.animeId),
  }));

  // ⚠️ 必须**按 id 比对**，不能按下标比：合并结果会重新排序（新加的排前面），
  // 而本地存储里是"加入顺序"——按下标比会因为顺序不同而误判成"变了"，
  // 于是每同步一次就白写一遍本地、还惊动别的标签页。
  const beforeById = new Map(localEntries.map((entry) => [entry.animeId, entry]));
  const changed =
    nextStored.length !== localEntries.length ||
    nextStored.some((entry) => {
      const before = beforeById.get(entry.animeId);
      return (
        !before ||
        before.progress !== entry.progress ||
        before.addedAt !== entry.addedAt ||
        before.updatedAt !== entry.updatedAt
      );
    });

  if (changed) {
    writeCollection(nextStored);
    emitChange();
  }

  // ── 5. 推回云端 ──
  // 只推"比云端新"的那些，不是把整份重推一遍 ——
  // 否则每打一个钩都会把所有行的时间戳顶一遍。
  const toPush = merged.filter((entry) =>
    shouldLocalPush(entry, remoteById.get(entry.animeId)),
  );

  // 🔑 推送 = 数据离开本机（第一次之前要先说明白，见上面的"知情同意"）。
  // 所以推之前先看用户表过态没有：
  const consent = readSyncConsent(userId);

  if (consent === "declined") {
    // 用户明确选了"暂不同步"：永远不推、之后也不再问（横幅不会再出现）。
    // 拉取照常（上面几步已经做完）——读自己的云端记录不涉及外发，跟"推"是两回事。
    return "paused";
  }

  if (toPush.length === 0) {
    // 没有要推的东西，就不打扰用户（没表态也先不弹横幅——等真有东西要上传再说）
    return "ok";
  }

  if (consent === "unset") {
    // 第一次要往外推送：停下来问一次（横幅）。上面"拉取 + 合并 + 写本地"都做完了，
    // 本地记录一条不少，只是暂时不上云。
    return "needs-consent";
  }

  const payload = toPush.map((entry) => ({
    user_id: userId,
    ...syncEntryToRemoteRow(entry),
  }));

  await withSupabaseTimeout(async (signal) => {
    const { error } = await supabase
      .from("collection")
      .upsert(payload, { onConflict: "user_id,anilist_id" })
      .abortSignal(signal);
    if (error) {
      throw new Error(error.message);
    }
    return true;
  });

  return "ok";
}

/**
 * 本地改动之后，稍等一下再推。
 *
 * 防抖的意义：连续打几个钩不该发几次请求。
 * 也顺手避开了"用户快速点几下，几次请求乱序回来互相覆盖"。
 */
function schedulePush(): void {
  if (typeof window === "undefined") {
    return;
  }
  if (pushTimer) {
    clearTimeout(pushTimer);
  }
  pushTimer = setTimeout(() => {
    pushTimer = undefined;
    void runSync();
  }, 800);
}

// ═══════════════════════════════════════════════════════════════════════
// 对外的读写接口（签名和以前完全一样，只是多了后台同步）
// ═══════════════════════════════════════════════════════════════════════

/**
 * 加入追番。新加的排在最前面。
 *
 * 已经在追的再调一次**不会重置进度**，只会把快照刷成最新——
 * 否则用户从详情页手滑点一下，看到第几集就被清零了。
 *
 * ⚠️ 刷快照**不动 `updatedAt`**：那只是把显示信息更新一下，不是用户的改动，
 * 不该在别的设备上赢过人家真实的进度修改。
 */
export function addToCollection(anime: Anime, now: number = Date.now()): CollectionEntry[] {
  const entries = readStoredEntries();

  // 重新加回来 → 撤销之前那笔"待删除"
  pendingDeletes.delete(anime.id);

  if (entries.some((entry) => entry.animeId === anime.id)) {
    const next = writeCollection(
      entries.map((entry) =>
        entry.animeId === anime.id ? { ...entry, anime: toSnapshot(anime) } : entry,
      ),
    );
    schedulePush();
    return next;
  }

  const created: StoredEntry = {
    animeId: anime.id,
    progress: 0,
    addedAt: now,
    updatedAt: now,
    anime: toSnapshot(anime),
  };

  const next = writeCollection([created, ...entries]);
  schedulePush();
  return next;
}

/**
 * 取消追番。**观看进度会一并消失**（界面要先跟用户确认）。
 *
 * ⚠️ 本地删了还不够，**云端那条也必须删**——否则下次一拉取就复活了。
 */
export function removeFromCollection(animeId: number): CollectionEntry[] {
  const next = writeCollection(
    readStoredEntries().filter((entry) => entry.animeId !== animeId),
  );

  // ⚠️ 只有知道"是谁在删"时才记这笔欠账 —— 记不上归属的欠账会被拿去删别人的数据。
  // 认不出用户（没登录 / 引擎还没跑起来）时不记：那种情况下也没有云端记录会被拉回来。
  if (currentUserId) {
    pendingDeletes.set(animeId, currentUserId);
  }
  void deleteRemoteEntry(animeId);

  return next;
}

/** 把一条删除同步到云端。失败就留在 `pendingDeletes` 里等下一轮 */
async function deleteRemoteEntry(animeId: number): Promise<void> {
  const supabase = getClient();
  if (!supabase) {
    return;
  }
  try {
    const user = await withSupabaseTimeout(async () => {
      const { data } = await supabase.auth.getUser();
      return data.user;
    });
    if (!user) {
      return; // 没登录：没有云端记录要删
    }
    const ok = await withSupabaseTimeout(async (signal) => {
      const { error } = await supabase
        .from("collection")
        .delete()
        .eq("user_id", user.id)
        .eq("anilist_id", animeId)
        .abortSignal(signal);
      return !error;
    });
    // 只销掉"属于这个用户"的那笔欠账，别顺手销掉别人名下的
    if (ok && pendingDeletes.get(animeId) === user.id) {
      pendingDeletes.delete(animeId);
    }
  } catch {
    // 留着，下一轮同步重试
  }
}

/**
 * 设置看到第几集。
 * 「打第 N 集」就是传 N；「取消第 N 集」由界面传 N-1。
 * 负数和小数一律夹到合法范围，不往上抛。
 *
 * ⚠️ 这是用户真正的改动，所以要盖新的 `updatedAt` —— 合并时靠它赢过旧数据。
 */
export function setProgress(animeId: number, progress: number): CollectionEntry[] {
  const safe = Math.max(0, Math.floor(progress));
  const now = Date.now();
  const next = writeCollection(
    readStoredEntries().map((entry) =>
      entry.animeId === animeId ? { ...entry, progress: safe, updatedAt: now } : entry,
    ),
  );
  schedulePush();
  return next;
}

/** 这部番在不在追番列表里 */
export function isFollowing(entries: CollectionEntry[], animeId: number): boolean {
  return entries.some((entry) => entry.animeId === animeId);
}
