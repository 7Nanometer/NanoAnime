"use client";

import { useSyncExternalStore } from "react";

import {
  addToCollection,
  COLLECTION_STORAGE_KEY,
  isStorageAvailable,
  readCollection,
  removeFromCollection,
  setProgress,
} from "@/lib/collection";
import type { Anime, CollectionEntry } from "@/types/anime";

/**
 * 把 lib/collection.ts（纯本地读写）接到 React 上。
 *
 * 为什么用 `useSyncExternalStore`：它正是 React 官方为「订阅一个 React 之外的数据源」
 * 准备的钩子，自带服务端快照处理——服务端渲染时用 getServerSnapshot，
 * 不会出现「服务端画的和浏览器画的不一样」的报错。
 *
 * ⚠️ 一个必须守住的细节：`getSnapshot()` 每次必须返回**同一个对象引用**。
 * 它每次渲染都会被调用，如果每次都新建一个对象，React 会认为数据一直在变，
 * 直接进入无限重渲染。所以下面缓存了一份，只在真正写入时才换新引用。
 */

/** 一次给全：记录本身 + 有没有读出来。两者必须一起变，不能各变各的 */
interface CollectionSnapshot {
  entries: CollectionEntry[];
  /**
   * 浏览器这边的记录读出来了没有。
   * ⚠️ 服务端渲染时读不到 localStorage，`entries` 只能是空的——
   * 所以「还没追任何番」这句话必须等 isReady 才能说，
   * 否则页面刚打开会闪一下"你什么都没追"，看着像数据丢了。
   */
  isReady: boolean;
}

/** 缓存的快照。只有读取一次之后、或写入之后，才会换新引用 */
let snapshot: CollectionSnapshot = { entries: [], isReady: false };

/** 服务端渲染（以及浏览器接管前的那一帧）用这个。引用固定，内容也固定 */
const SERVER_SNAPSHOT: CollectionSnapshot = { entries: [], isReady: false };

/** 订阅名单。谁用了 useCollection，谁就在这里面 */
const listeners = new Set<() => void>();

function emit(): void {
  for (const listener of listeners) {
    listener();
  }
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** 给 useSyncExternalStore 用：第一次调用时把本地记录读出来，之后一直返回缓存的引用 */
function getSnapshot(): CollectionSnapshot {
  if (!snapshot.isReady) {
    snapshot = { entries: readCollection(), isReady: true };
  }
  return snapshot;
}

function getServerSnapshot(): CollectionSnapshot {
  return SERVER_SNAPSHOT;
}

/** 本地存储能不能用。跟上面同一个套路，值是个布尔，比较安全 */
let storageProbed = false;
let storageOk = true;
function getStorageSnapshot(): boolean {
  if (!storageProbed) {
    storageOk = isStorageAvailable();
    storageProbed = true;
  }
  return storageOk;
}
function getServerStorageSnapshot(): boolean {
  // 服务端先当能用，免得第一帧就闪一下「存储用不了」的警告
  return true;
}

// 别的标签页改了存储时，这边跟着同步——否则两个标签页会各看各的
if (typeof window !== "undefined") {
  window.addEventListener("storage", (event) => {
    // key 为 null 表示整份存储被清空
    if (event.key === COLLECTION_STORAGE_KEY || event.key === null) {
      snapshot = { entries: readCollection(), isReady: true };
      storageProbed = false;
      emit();
    }
  });
}

/** 写完统一走这里：换缓存 → 通知所有订阅者重渲染 */
function mutate(next: CollectionEntry[]): void {
  snapshot = { entries: next, isReady: true };
  emit();
}

/**
 * 读取追番记录 + 三个写操作。
 * 写操作点了就立刻生效，不用刷新页面，也不用等接口。
 */
export function useCollection(): {
  entries: CollectionEntry[];
  isReady: boolean;
  add: (anime: Anime) => void;
  remove: (animeId: number) => void;
  setProgress: (animeId: number, progress: number) => void;
} {
  const { entries, isReady } = useSyncExternalStore(
    subscribe,
    getSnapshot,
    getServerSnapshot,
  );

  return {
    entries,
    isReady,
    add: (anime) => mutate(addToCollection(anime)),
    remove: (animeId) => mutate(removeFromCollection(animeId)),
    setProgress: (animeId, progress) => mutate(setProgress(animeId, progress)),
  };
}

/** 本地存储能不能用。隐私模式下为 false，界面据此提示用户 */
export function useStorageAvailable(): boolean {
  return useSyncExternalStore(subscribe, getStorageSnapshot, getServerStorageSnapshot);
}
