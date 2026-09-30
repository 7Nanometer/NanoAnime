"use client";

import { useQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";

import { AnimeCard } from "@/components/AnimeCard";
import type { SearchResult } from "@/types/anime";

/** 输入停下来多久才真正发请求。敲字过程中不发，避免每敲一个字母打一次接口 */
const DEBOUNCE_MS = 300;

/** 前端只请求自家接口，不直连 AniList（CLAUDE.md 第五条铁律） */
async function fetchSearch(keyword: string): Promise<SearchResult> {
  const response = await fetch(`/api/search?q=${encodeURIComponent(keyword)}`);
  if (!response.ok) {
    throw new Error(`接口返回 HTTP ${response.status}`);
  }
  return (await response.json()) as SearchResult;
}

/** 各种提示语共用的样式 */
function Hint({ children }: { children: React.ReactNode }) {
  return <p className="py-16 text-center text-sm text-muted-foreground">{children}</p>;
}

/**
 * 搜索框 + 结果网格。
 *
 * 中文能搜到，靠的是本地 data/title-zh.json（AniList 没有中文索引，实测中文命中率 0）；
 * 日文原名 / 英文名靠 AniList。两边由服务端 /api/search 合并去重。
 */
export function AnimeSearch() {
  const [input, setInput] = useState("");
  const [keyword, setKeyword] = useState("");

  // 防抖：输入停下来 DEBOUNCE_MS 之后才把关键词交出去
  useEffect(() => {
    const timer = setTimeout(() => setKeyword(input.trim()), DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [input]);

  const { data, isPending, error } = useQuery({
    queryKey: ["search", keyword],
    queryFn: () => fetchSearch(keyword),
    // 关键词为空就不发请求
    enabled: keyword.length > 0,
  });

  const trimmedInput = input.trim();

  // 五种状态，**每一种都给人话**，不留白屏
  let body: React.ReactNode;
  if (trimmedInput.length === 0) {
    body = <Hint>输入番剧名开始搜索——中文、日文原名、英文名都可以。</Hint>;
  } else if (error) {
    body = <Hint>搜索失败，可能是网络超时。稍后再试。</Hint>;
  } else if (isPending || keyword.length === 0) {
    body = <Hint>搜索中…</Hint>;
  } else if (data && data.anime.length === 0) {
    body = (
      <Hint>
        没找到「{keyword}」。中文搜索目前只覆盖本季新番，可试试日文原名或英文名。
      </Hint>
    );
  } else if (data) {
    body = (
      <>
        <p className="text-sm text-muted-foreground">找到 {data.anime.length} 部</p>
        <div className="grid grid-cols-2 gap-x-4 gap-y-6 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
          {data.anime.map((anime) => (
            // 搜索结果跨年份，所以显示年份而不是更新状态——续作靠它区分
            <AnimeCard key={anime.id} anime={anime} showYear />
          ))}
        </div>
        {data.truncated ? (
          <p className="text-xs text-muted-foreground">
            只显示前 {data.anime.length} 条，可用更具体的关键词缩小范围。
          </p>
        ) : null}
      </>
    );
  } else {
    body = <Hint>搜索中…</Hint>;
  }

  return (
    <div className="flex flex-col gap-6">
      <input
        type="search"
        value={input}
        onChange={(event) => setInput(event.target.value)}
        placeholder="例如：药屋、薬屋、Frieren"
        aria-label="搜索番剧"
        className="w-full rounded-lg border border-border bg-background px-4 py-2.5 text-sm outline-none placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-ring"
      />
      {body}
    </div>
  );
}
