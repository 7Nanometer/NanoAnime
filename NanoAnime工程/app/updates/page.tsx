"use client";

import { useMemo } from "react";

import { AnimeCard } from "@/components/AnimeCard";
import { AnimeGridSkeleton } from "@/components/AnimeGridSkeleton";
import { EmptyHint, ErrorHint } from "@/components/AnimeGrid";
import { useSeasonAnime } from "@/components/useSeasonAnime";
import { ANIME_GRID_CLASS } from "@/lib/anime-constants";
import { SITE_CONTAINER } from "@/lib/layout";

/**
 * 「最近更新」页：当季**全部**新番，按「下一集的播出时间」升序——最近要播的排最前。
 *
 * 为什么整页是客户端组件：排序取决于**此刻**（同一份数据，今天和明天排出来的顺序不一样），
 * 服务端算会被构建那一刻烤死。数据走 useSeasonAnime——和首页焦点位/新番墙
 * **共用同一个 queryKey**（["season-anime"]），同一次访问里不会多打接口。
 *
 * 排序规则（2026-10-07 拍板）：`nextAiringEpisode.airingAt` 升序；没有排期的
 * （已完结 / 未定档）一律垫底，垫底段内保持接口给的人气序。
 * ⚠️ 实现上**不取 popularity 字段**（Anime 类型里也没有，AniList 列表查询根本没请求它）：
 * 接口返回本身就是人气序，而 `Array.prototype.sort` 是稳定的——比较函数对
 * 「两者都没排期」返回 0，人气序就原样保留。
 */
export default function UpdatesPage() {
  const { data, isPending, error, refetch } = useSeasonAnime();

  const sorted = useMemo(() => {
    if (!data) {
      return [];
    }
    return [...data.anime].sort((a, b) => {
      const aAt = a.nextAiringEpisode?.airingAt ?? null;
      const bAt = b.nextAiringEpisode?.airingAt ?? null;
      if (aAt === null && bAt === null) {
        return 0; // 靠稳定排序保留人气序
      }
      if (aAt === null) {
        return 1; // 没排期的一律垫底
      }
      if (bAt === null) {
        return -1;
      }
      return aAt - bAt;
    });
  }, [data]);

  return (
    <main className={`${SITE_CONTAINER} py-8 sm:py-10`}>
      <header className="mb-7">
        <h1 className="section-mark text-2xl font-bold tracking-tight sm:text-[28px]">
          最近更新
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          当季全部新番 · 按更新时间排序
          {data ? (
            <>
              {" · "}共 <span className="tabular-nums">{sorted.length}</span> 部
            </>
          ) : null}
        </p>
      </header>

      {/* 三态。失败/空复用 AnimeGrid 的两个提示组件，不复制第二份 */}
      {isPending ? (
        <AnimeGridSkeleton />
      ) : error ? (
        <ErrorHint onRetry={() => refetch()} />
      ) : sorted.length === 0 ? (
        <EmptyHint note="可以去「周表」页看看本周有哪些番在播。" />
      ) : (
        <div className={ANIME_GRID_CLASS}>
          {sorted.map((anime, index) => (
            <AnimeCard
              key={anime.id}
              anime={anime}
              // 首屏第一行优先加载；⚠️ 不能全传 true（见 AnimeCard 的注释）
              priority={index < 7}
            />
          ))}
        </div>
      )}
    </main>
  );
}
