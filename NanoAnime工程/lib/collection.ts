// 追番记录的本地存储层。
//
// ⚠️ 这是全项目**唯一**直接碰浏览器存储的地方。
// 页面组件一律通过 components/useCollection.ts 间接使用，不许自己去调 localStorage——
// 下阶段换成云端的 Supabase 时，只要把这个文件重写一遍，页面一行都不用改。

import type { Anime, CollectionEntry } from "@/types/anime";

/** 存储键。带 v1 是为了将来结构变了能认出旧数据、做一次迁移 */
export const COLLECTION_STORAGE_KEY = "nanoanime.collection.v1";

/** 写进 localStorage 的完整结构。外面包一层 version，方便以后升级 */
interface StoredCollection {
  version: 1;
  entries: CollectionEntry[];
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
 * 校验一条记录是不是长得对。
 * 存进去的 JSON 是用户能随手改的（开发者工具里改一下就行），所以读出来必须验，
 * 不能假设它一定是我们写进去的样子。验不过的直接丢，不让坏数据把页面搞崩。
 */
function isValidEntry(value: unknown): value is CollectionEntry {
  if (typeof value !== "object" || value === null) {
    return false;
  }
  const entry = value as Partial<CollectionEntry>;
  return (
    typeof entry.animeId === "number" &&
    Number.isInteger(entry.animeId) &&
    entry.animeId > 0 &&
    typeof entry.progress === "number" &&
    Number.isInteger(entry.progress) &&
    entry.progress >= 0 &&
    typeof entry.addedAt === "number" &&
    typeof entry.anime === "object" &&
    entry.anime !== null
  );
}

/**
 * 读出全部追番记录。
 * 任何异常（存储用不了、JSON 被改坏）都退化成空列表——绝不把页面带崩。
 */
export function readCollection(): CollectionEntry[] {
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
    return parsed.entries.filter(isValidEntry);
  } catch {
    return [];
  }
}

/**
 * 写回全部记录，并把写入后的列表原样返回。
 *
 * 写失败（存储写满 / 被禁用）时**不抛异常**：内存里的状态照常返回，
 * 用户这一次会话仍然能用，只是关掉浏览器会丢——`isStorageAvailable()` 会告诉界面去提示。
 */
function writeCollection(entries: CollectionEntry[]): CollectionEntry[] {
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

/**
 * 加入追番。新加的排在最前面。
 *
 * 已经在追的再调一次**不会重置进度**，只会把快照刷成最新——
 * 否则用户从详情页手滑点一下，看到第几集就被清零了。
 */
export function addToCollection(anime: Anime, now: number = Date.now()): CollectionEntry[] {
  const entries = readCollection();

  if (entries.some((entry) => entry.animeId === anime.id)) {
    return writeCollection(
      entries.map((entry) =>
        entry.animeId === anime.id ? { ...entry, anime: toSnapshot(anime) } : entry,
      ),
    );
  }

  const created: CollectionEntry = {
    animeId: anime.id,
    progress: 0,
    addedAt: now,
    anime: toSnapshot(anime),
  };

  return writeCollection([created, ...entries]);
}

/** 取消追番。**观看进度会一并消失**（界面要先跟用户确认） */
export function removeFromCollection(animeId: number): CollectionEntry[] {
  return writeCollection(readCollection().filter((entry) => entry.animeId !== animeId));
}

/**
 * 设置看到第几集。
 * 「打第 N 集」就是传 N；「取消第 N 集」由界面传 N-1。
 * 负数和小数一律夹到合法范围，不往上抛。
 */
export function setProgress(animeId: number, progress: number): CollectionEntry[] {
  const safe = Math.max(0, Math.floor(progress));
  return writeCollection(
    readCollection().map((entry) =>
      entry.animeId === animeId ? { ...entry, progress: safe } : entry,
    ),
  );
}

/** 这部番在不在追番列表里 */
export function isFollowing(entries: CollectionEntry[], animeId: number): boolean {
  return entries.some((entry) => entry.animeId === animeId);
}
