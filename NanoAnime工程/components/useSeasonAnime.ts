"use client";

import { useQuery } from "@tanstack/react-query";

import type { SeasonAnimeResult } from "@/types/anime";

/** 前端只请求自家接口，不直连 AniList（CLAUDE.md 第五条铁律） */
async function fetchSeasonAnime(): Promise<SeasonAnimeResult> {
  const response = await fetch("/api/anime/season");
  if (!response.ok) {
    throw new Error(`接口返回 HTTP ${response.status}`);
  }
  return (await response.json()) as SeasonAnimeResult;
}

/**
 * 当季新番数据（本季全量，含焦点位前几部的中文简介）。
 *
 * **首页的焦点位和新番墙共用这一个钩子**——两处 queryKey 相同，TanStack 会把
 * 同时发起的请求合并成一次，并且共享同一份缓存。别在任一组件里另写 queryKey，
 * 那样首页会白打两次接口。
 *
 * 缓存策略（staleTime 等）在 app/providers.tsx 里统一设。
 */
export function useSeasonAnime() {
  return useQuery({
    queryKey: ["season-anime"],
    queryFn: fetchSeasonAnime,
  });
}
