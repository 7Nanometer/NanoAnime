"use client";

import { useQuery } from "@tanstack/react-query";
import Image from "next/image";
import Link from "next/link";

import { EpisodeChecklist } from "@/components/EpisodeChecklist";
import { useCollection, useStorageAvailable, useSyncStatus } from "@/components/useCollection";
import { buildEpisodeRows, getPrimaryTitle, getSecondaryTitle } from "@/lib/anime-display";
import { giveSyncConsent } from "@/lib/collection";
import { cn } from "@/lib/utils";
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

/**
 * 页面内的说明条（同步失败 / 已暂停 / 番剧信息没更新）。
 *
 * 抽出来是因为这块出现了三种文案、两套配色（警示用黄色、说明用品牌色），
 * 分散写三遍早晚会改歪一处。
 *
 * @param tone 决定配色：`warning` 用于"用户需要知道但不算错"的状态（同步暂停），
 *             `danger` 用于真的出了错（同步失败），`info` 用于中性说明
 */
function Notice({
  tone = "info",
  children,
}: {
  tone?: "info" | "warning" | "danger";
  children: React.ReactNode;
}) {
  const toneClass = {
    info: "border-border bg-surface/60 text-muted-foreground",
    warning: "border-warning/25 bg-warning/10 text-warning",
    danger: "border-destructive/25 bg-destructive/10 text-destructive",
  }[tone];

  return (
    <p className={cn("rounded-lg border px-3.5 py-2.5 text-xs leading-relaxed", toneClass)}>
      {children}
    </p>
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
  const finished = list.total > 0 && entry.progress >= list.total;

  return (
    <article className="card-hover flex flex-col gap-4 rounded-xl border border-border bg-surface/50 p-4 sm:flex-row">
      <Link
        href={`/anime/${anime.id}`}
        className="relative aspect-[2/3] w-24 shrink-0 self-start overflow-hidden rounded-lg bg-surface ring-1 ring-border"
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
              <Link
                href={`/anime/${anime.id}`}
                className="decoration-brand/50 underline-offset-4 hover:underline"
              >
                {title}
              </Link>
            </h2>
            {subtitle !== title ? (
              <p className="truncate text-xs text-muted-foreground">{subtitle}</p>
            ) : null}
          </div>

          <button
            type="button"
            onClick={onRemove}
            className="shrink-0 cursor-pointer rounded-md px-2 py-1 text-xs text-muted-foreground underline-offset-4 transition-colors duration-150 hover:bg-destructive/10 hover:text-destructive hover:underline"
          >
            取消追番
          </button>
        </div>

        <div className="flex flex-col gap-2">
          <div className="flex items-baseline justify-between gap-3 text-sm">
            <p>
              已看 <span className="font-semibold tabular-nums">{entry.progress}</span> 集
              {list.total > 0 ? (
                <span className="text-muted-foreground"> / 共 {list.total} 集</span>
              ) : null}
            </p>
            {/* 追完的给一个完成标记。不给的话，"已看 12 集 / 共 12 集" 要用户自己去比数字 */}
            {finished ? (
              <span className="rounded bg-success/15 px-1.5 py-0.5 text-[10px] leading-none font-medium text-success">
                已追完
              </span>
            ) : list.total > 0 ? (
              <span className="text-xs tabular-nums text-muted-foreground">
                {Math.round(percent)}%
              </span>
            ) : null}
          </div>

          {list.total > 0 ? (
            <div
              // 进度条给读屏软件一个可读的值，否则它只是一个没有内容的空 div
              role="progressbar"
              aria-valuenow={entry.progress}
              aria-valuemin={0}
              aria-valuemax={list.total}
              aria-label={`观看进度：共 ${list.total} 集，已看 ${entry.progress} 集`}
              className="h-1.5 w-full overflow-hidden rounded-full bg-surface-elevated"
            >
              <div
                className={cn(
                  "h-full rounded-full transition-[width] duration-300 ease-[var(--ease-out-soft)]",
                  finished
                    ? "bg-success"
                    : "bg-linear-to-r from-primary to-brand shadow-[0_0_8px_var(--brand-soft)]",
                )}
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
  // 云端同步的状态。只在两种情况下跟用户说话：失败（如实说明）、或暂停（用户选过"暂不同步"，
  // 而这里是他改主意的**常驻入口**）。其余时候一声不响
  const syncStatus = useSyncStatus();

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
      <div className="flex flex-col items-center gap-5 py-20 text-center">
        {/*
          空状态给一个图标。空白页 + 两行字是最容易让人以为"坏了"的形态，
          一个淡淡的图标立刻把它变成"这是一个还没开始的状态"。
        */}
        <span
          aria-hidden
          className="flex size-14 items-center justify-center rounded-2xl border border-border bg-surface"
        >
          <svg
            viewBox="0 0 24 24"
            className="size-6 text-muted-foreground"
            fill="none"
            stroke="currentColor"
            strokeWidth={1.75}
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M4 5h11a2 2 0 0 1 2 2v12H6a2 2 0 0 1-2-2z" />
            <path d="M17 9h1.5a1.5 1.5 0 0 1 1.5 1.5V19" />
            <path d="M8 9h5M8 13h5" />
          </svg>
        </span>
        <p className="text-sm leading-relaxed text-muted-foreground">
          还没追任何番。
          <br />
          去首页，进任意一部的详情页点「追番」，它就会出现在这里。
        </p>
        <div className="flex flex-wrap items-center justify-center gap-3">
          <Link
            href="/"
            className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-all duration-150 hover:brightness-110 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none active:scale-[0.98]"
          >
            看本季新番
          </Link>
          <Link
            href="/#calendar"
            className="rounded-lg border border-border px-4 py-2 text-sm text-muted-foreground transition-colors duration-150 hover:border-border-strong hover:bg-surface hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
          >
            看本周更新
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <p className="text-sm text-muted-foreground">
        共 <span className="tabular-nums">{entries.length}</span> 部。点集数打钩，「已看」会跟着走；
        刷新、关掉浏览器再回来都不会丢。
      </p>

      {/*
        ⚠️ 云端同步失败时必须说话，而且要说对。
        下面这些记录是**从本地读出来**的，一条都没少——合并只会变多不会变少，
        而且拉取成功之前根本不写本地。所以这里不能让人以为"数据丢了"。
      */}
      {syncStatus === "error" ? (
        <Notice tone="danger">
          云端同步失败，显示的是本地记录。你的追番一条都没少，改动会先存在本机；
          联网后会自动重试。
        </Notice>
      ) : null}

      {/*
        用户选过「暂不同步」时的常驻说明 + 重新开启的入口（不能死锁）。
        ⚠️ 放在"有记录"这条分支里是有讲究的：暂停状态只有"有东西要推"时才有意义，
        而一旦有东西要推，这块就会跟着出现——所以不存在"想再开启却找不到入口"的死角。
      */}
      {syncStatus === "paused" ? (
        <Notice tone="warning">
          云端同步已关闭（你之前选了「暂不同步」）：记录不会同步到云端，只存在本机，
          换设备看不到。{" "}
          <button
            type="button"
            onClick={giveSyncConsent}
            className="cursor-pointer font-medium underline underline-offset-4 hover:opacity-80 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
          >
            开启同步
          </button>
          ——开启后记录会同步到云端（只有你自己能看到）。
        </Notice>
      ) : null}

      {error ? (
        <Notice>
          番剧信息暂时没能更新（可能是网络超时），下面显示的是加入追番时的记录。
        </Notice>
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
              // ⚠️ 优先用 `fresh`（接口拉来的最新信息），本地快照只是兜底：
              // 「换设备登录后拉下来的」那些记录，本地存的是**空占位快照**
              // （云端表不存标题封面），只看 entry.anime 的话这里会弹出一个没有番名的确认框。
              const name = getPrimaryTitle(fresh.get(entry.animeId) ?? entry.anime);
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
