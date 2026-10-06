"use client";

import { useQuery } from "@tanstack/react-query";

import { AnimeCard } from "@/components/AnimeCard";
import { getSeasonLabel } from "@/lib/anime-display";
import type { SeasonAnimeResult } from "@/types/anime";

/** 前端只请求自家接口，不直连 AniList（CLAUDE.md 第五条铁律） */
async function fetchSeasonAnime(): Promise<SeasonAnimeResult> {
  const response = await fetch("/api/anime/season");
  if (!response.ok) {
    throw new Error(`接口返回 HTTP ${response.status}`);
  }
  return (await response.json()) as SeasonAnimeResult;
}

/** 本季新番封面墙。数据用 TanStack Query 取，缓存策略在 app/providers.tsx 里统一设 */
export function AnimeGrid() {
  const { data, isPending, error } = useQuery({
    queryKey: ["season-anime"],
    queryFn: fetchSeasonAnime,
  });

  if (isPending) {
    return <p className="py-20 text-center text-muted-foreground">正在加载本季新番…</p>;
  }

  // 三种异常情况都要给一句人话，不能留白屏
  if (error) {
    return (
      <p className="py-20 text-center text-muted-foreground">
        加载失败：{error instanceof Error ? error.message : "未知错误"}
      </p>
    );
  }

  if (data.anime.length === 0) {
    return <p className="py-20 text-center text-muted-foreground">这一季还没有收录到作品。</p>;
  }

  return (
    <section>
      {/* 其它页面的入口已经挪到全站顶栏（components/SiteHeader.tsx），这里不再堆链接 */}
      {/*
        ⚠️ 这里**不能写「共 N 部」**。这个数不是"本季一共多少部"——每季实际有 50+ 部，
        我们只主动取了**人气最高的前 N 部**（查询里的 sort: POPULARITY_DESC）。
        写「共」会把"我们取了多少"说成"本季总共多少"，是一句假话。
        判据不是"数字从哪来"，而是**这句话会不会被读成总数**（见验收文件的通用纪律）。
      */}
      <h1 className="mb-6 text-xl font-bold">
        {data.seasonYear} 年{getSeasonLabel(data.season)}新番 · 人气前 {data.anime.length}
      </h1>
      <div className="grid grid-cols-2 gap-x-4 gap-y-6 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
        {data.anime.map((anime) => (
          <AnimeCard key={anime.id} anime={anime} />
        ))}
      </div>
    </section>
  );
}
