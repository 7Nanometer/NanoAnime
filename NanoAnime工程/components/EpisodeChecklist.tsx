"use client";

import { useEffect, useRef } from "react";

import type { EpisodeRow } from "@/lib/anime-display";
import { cn } from "@/lib/utils";

/** 超过这么多集才做成可滚动的框。短番直接全列出来，不要让用户在小框里滚 */
const SCROLL_THRESHOLD = 12;

/**
 * 一部番的剧集打钩框。
 *
 * 打钩规则（用户 2026-10-01 拍板）：**点第 N 集 = 第 1~N 集全打上**，
 * 也就是"我看到第 N 集了"。再点当前那一集就退回去。
 * 好处是连看 10 集只点 1 下，而且云端的表存的就是一个数字（progress），以后搬家不用改造。
 *
 * ⚠️ 滚动只发生在下面这个框**内部**，不会把整页顶跑——所以用 offsetTop 手算，
 * 不用 `scrollIntoView()`（那个会把页面上所有能滚的祖先都一起滚，页面会突然跳）。
 */
export function EpisodeChecklist({
  rows,
  progress,
  onSetProgress,
  total,
  truncated,
  isLoading = false,
}: {
  rows: EpisodeRow[];
  /** 看到第几集。0 = 一集都没看 */
  progress: number;
  onSetProgress: (episode: number) => void;
  /** 理论上共多少集 */
  total: number;
  /** 是否因为集数太多而只列了有排期数据的那部分 */
  truncated: boolean;
  /** 剧集数据还在路上 */
  isLoading?: boolean;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const anchorRef = useRef<HTMLLIElement>(null);
  const scrolledRef = useRef(false);

  // 定位到哪一行：优先停在用户自己看到的那一集；还没开始看就停在最近更新的那一集。
  // 手册要求「不要从第 1 集开始」——理由很实在：长番从第 1 集开始等于让用户自己翻几百行。
  const hasProgressRow = progress > 0 && rows.some((row) => row.number === progress);
  const anchorNumber = hasProgressRow ? progress : rows[rows.length - 1]?.number;

  useEffect(() => {
    // 只在第一次定位。之后用户滚到哪儿就是哪儿，别去打扰他
    if (scrolledRef.current) {
      return;
    }
    const container = containerRef.current;
    const row = anchorRef.current;
    if (!container || !row) {
      // 数据还没到（比如剧集列表是后拉回来的），等下一轮
      return;
    }
    container.scrollTop = row.offsetTop - container.clientHeight / 2 + row.clientHeight / 2;
    scrolledRef.current = true;
  }, [rows]);

  if (rows.length === 0) {
    return (
      <p className="px-3 py-2 text-xs text-muted-foreground">
        {isLoading
          ? "正在读取剧集…"
          : "暂无剧集信息——AniList 上没有这部作品的排期数据。"}
      </p>
    );
  }

  const scrollable = rows.length > SCROLL_THRESHOLD;

  return (
    <div className="flex flex-col gap-1.5">
      {truncated ? (
        <p className="px-3 text-xs text-muted-foreground">
          共 {total} 集，这里只列出 AniList 有排期数据的 {rows.length} 集。
        </p>
      ) : null}

      <div
        ref={containerRef}
        className={cn(
          "relative rounded-lg border border-border",
          // 行数少就不做滚动框，全列出来；多了才限高
          scrollable && "max-h-80 overflow-y-auto",
        )}
      >
        <ol className="flex flex-col">
          {rows.map((row) => {
            const done = row.number <= progress;
            // 点当前那一集 = 取消（退回到上一集），点别的集 = 打钩到这个为止
            const next = row.number === progress ? row.number - 1 : row.number;

            return (
              <li key={row.number} ref={row.number === anchorNumber ? anchorRef : null}>
                <button
                  type="button"
                  onClick={() => onSetProgress(next)}
                  aria-pressed={done}
                  className="flex w-full items-center gap-2.5 px-3 py-1.5 text-left text-sm transition-colors hover:bg-muted"
                >
                  <span
                    className={cn(
                      "flex size-4 shrink-0 items-center justify-center rounded border text-[10px] leading-none",
                      done
                        ? "border-primary bg-primary text-primary-foreground"
                        : "border-border",
                    )}
                  >
                    {done ? "✓" : ""}
                  </span>

                  <span
                    className={cn(
                      "w-16 shrink-0 tabular-nums",
                      done && "text-muted-foreground",
                    )}
                  >
                    第 {row.number} 集
                  </span>

                  <span className="ml-auto shrink-0 text-xs tabular-nums text-muted-foreground">
                    {row.dateLabel}
                  </span>
                </button>
              </li>
            );
          })}
        </ol>
      </div>
    </div>
  );
}
