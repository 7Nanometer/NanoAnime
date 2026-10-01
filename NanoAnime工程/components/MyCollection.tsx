"use client";

import { useQuery } from "@tanstack/react-query";
import Image from "next/image";
import Link from "next/link";

import { EpisodeChecklist } from "@/components/EpisodeChecklist";
import { useCollection, useStorageAvailable } from "@/components/useCollection";
import { buildEpisodeRows, getPrimaryTitle, getSecondaryTitle } from "@/lib/anime-display";
import type { Anime, AnimeWithSchedule, CollectionEntry } from "@/types/anime";

/** 前端只请求自家接口，不直连 AniList（CLAUDE.md 第五条铁律） */
async function fetchByIds(ids: number[]): Promise<AnimeWithSchedule[]> {
  const response = await fetch(`/api/anime/by-ids?ids=${ids.join(",")}`);
  if (!response.ok) {
    throw new Error(`接口返回 HTTP ${response.status}`);
  }
  return (await response.json()) as AnimeWithSchedule[];
}

/** 各种提示语共用的样式 */
function Hint({ children }: { children: React.ReactNode }) {
  return (
    <p className="py-20 text-center text-sm leading-relaxed text-muted-foreground">{children}</p>
  );
}

/** 一张追番卡片 */
function CollectionCard({
  entry,
  fresh,
  isLoading,
  onRemove,
  onSetProgress,
}: {
  entry: CollectionEntry;
  /** 刚从接口拉回来的最新数据。拉不到就是 undefined，这时退回本地快照 */
  fresh: AnimeWithSchedule | undefined;
  /** 最新数据还在路上（用来区分「还没读到」和「真的没有」） */
  isLoading: boolean;
  onRemove: () => void;
  onSetProgress: (episode: number) => void;
}) {
  // 有新的用新的，没有就用加入追番时存下来的快照——这正是存快照的意义：
  // AniList 超时或断网时，卡片照样画得出来
  const anime: Anime = fresh ?? entry.anime;
  const title = getPrimaryTitle(anime);
  const subtitle = getSecondaryTitle(anime);
  const cover = anime.coverImage.extraLarge ?? anime.coverImage.large;

  // 拉不到新数据时没有排期，退化成「按总集数生成 1~N 集、日期全是 —」——照样能打钩
  const list = buildEpisodeRows(fresh ?? { episodes: entry.anime.episodes, episodeList: [] });
  const percent = list.total > 0 ? Math.min(100, (entry.progress / list.total) * 100) : 0;

  return (
    <article className="flex flex-col gap-4 rounded-lg border border-border p-4 sm:flex-row">
      <Link
        href={`/anime/${anime.id}`}
        className="relative aspect-[2/3] w-24 shrink-0 self-start overflow-hidden rounded-lg bg-muted"
        style={anime.coverImage.color ? { backgroundColor: anime.coverImage.color } : undefined}
      >
        {cover ? (
          <Image src={cover} alt={title} fill sizes="96px" className="object-cover" />
        ) : (
          <span className="absolute inset-0 flex items-center justify-center p-2 text-center text-xs text-muted-foreground">
            {title}
          </span>
        )}
      </Link>

      <div className="flex min-w-0 flex-1 flex-col gap-3">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h2 className="text-base leading-snug font-medium">
              <Link href={`/anime/${anime.id}`} className="hover:underline">
                {title}
              </Link>
            </h2>
            {subtitle !== title ? (
              <p className="text-xs text-muted-foreground">{subtitle}</p>
            ) : null}
          </div>

          <button
            type="button"
            onClick={onRemove}
            className="shrink-0 text-xs text-muted-foreground underline-offset-4 hover:underline"
          >
            取消追番
          </button>
        </div>

        <div className="flex flex-col gap-1.5">
          <p className="text-sm">
            已看 <span className="font-medium tabular-nums">{entry.progress}</span> 集
            {list.total > 0 ? (
              <span className="text-muted-foreground"> / 共 {list.total} 集</span>
            ) : null}
          </p>
          {list.total > 0 ? (
            <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
              <div
                className="h-full rounded-full bg-primary transition-all"
                style={{ width: `${percent}%` }}
              />
            </div>
          ) : null}
        </div>

        <EpisodeChecklist
          rows={list.rows}
          progress={entry.progress}
          onSetProgress={onSetProgress}
          total={list.total}
          truncated={list.truncated}
          isLoading={isLoading}
        />
      </div>
    </article>
  );
}

/**
 * 「我的追番」的主体。
 *
 * 两步走，这是刻意的：
 * 1. `useCollection()` 读浏览器本地 → **立刻就能画**，不等网络
 * 2. 同时去 `/api/anime/by-ids` 拉最新数据 → 拉到了就盖掉快照
 *
 * 拉失败也不崩：卡片和进度照常显示，只是番剧信息停在加入时的那份。
 * 如果只存 id 不存快照，AniList 一超时整页就只剩一个错误页——
 * 用户追的番明明记在本地，看上去却像丢了。
 */
export function MyCollection() {
  const { entries, isReady, remove, setProgress } = useCollection();
  const storageOk = useStorageAvailable();

  const ids = entries.map((entry) => entry.animeId);

  const { data, error, isPending } = useQuery({
    // ids 数组每次渲染都是新引用，但 TanStack Query 是按内容算键的，同一个列表不会重复请求
    queryKey: ["collection-anime", ids],
    queryFn: () => fetchByIds(ids),
    enabled: ids.length > 0,
  });

  const fresh = new Map((data ?? []).map((item) => [item.id, item]));

  // 先判存储：隐私模式下存储用不了，这时说「还没追任何番」是误导
  if (isReady && !storageOk) {
    return (
      <Hint>
        你的浏览器不允许本站保存本地数据（可能是隐私模式），追番没法记住。
        <br />
        换个普通窗口打开就能用了。
      </Hint>
    );
  }

  // 还没读出本地记录。这句话不能省——不然页面刚打开会闪一下「还没追任何番」
  if (!isReady) {
    return <Hint>正在读取本地记录…</Hint>;
  }

  // 一部都没追时的引导文案（手册明确要求：不要留空白页）
  if (entries.length === 0) {
    return (
      <div className="flex flex-col items-center gap-4 py-20 text-center">
        <p className="text-sm leading-relaxed text-muted-foreground">
          还没追任何番。
          <br />
          去首页或日历，进任意一部的详情页点「+ 追番」，它就会出现在这里。
        </p>
        <div className="flex flex-wrap items-center justify-center gap-3">
          <Link
            href="/"
            className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-opacity hover:opacity-90"
          >
            看本季新番
          </Link>
          <Link
            href="/calendar"
            className="rounded-md border border-border px-4 py-2 text-sm text-muted-foreground transition-colors hover:bg-muted"
          >
            看本周日历
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <p className="text-sm text-muted-foreground">
        共 {entries.length} 部。点集数打钩，「已看」会跟着走；刷新、关掉浏览器再回来都不会丢。
      </p>

      {error ? (
        <p className="text-xs text-muted-foreground">
          番剧信息暂时没能更新（可能是网络超时），下面显示的是加入追番时的记录。
        </p>
      ) : null}

      <div className="flex flex-col gap-4">
        {entries.map((entry) => (
          <CollectionCard
            key={entry.animeId}
            entry={entry}
            fresh={fresh.get(entry.animeId)}
            isLoading={isPending}
            onRemove={() => {
              // 取消追番会把观看进度一起清掉，先说清楚再动手
              const name = getPrimaryTitle(entry.anime);
              if (window.confirm(`取消追番会一并清掉「${name}」的观看进度，确定吗？`)) {
                remove(entry.animeId);
              }
            }}
            onSetProgress={(episode) => setProgress(entry.animeId, episode)}
          />
        ))}
      </div>
    </div>
  );
}
