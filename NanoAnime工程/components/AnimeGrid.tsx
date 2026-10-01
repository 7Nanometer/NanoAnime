"use client";

import { useQuery } from "@tanstack/react-query";
import Link from "next/link";

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
      <div className="mb-6 flex flex-wrap items-baseline justify-between gap-2">
        <h1 className="text-xl font-bold">
          {data.seasonYear} 年{getSeasonLabel(data.season)}新番 · 共 {data.anime.length} 部
        </h1>
        {/* 两个页面的入口。没有它们 /calendar 和 /search 只能靠手敲网址到达 */}
        <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1">
          <Link
            href="/calendar"
            className="text-sm text-muted-foreground underline-offset-4 hover:underline"
          >
            本周日历 →
          </Link>
          <Link
            href="/search"
            className="text-sm text-muted-foreground underline-offset-4 hover:underline"
          >
            搜索其他番剧 →
          </Link>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-x-4 gap-y-6 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
        {data.anime.map((anime) => (
          <AnimeCard key={anime.id} anime={anime} />
        ))}
      </div>
    </section>
  );
}
