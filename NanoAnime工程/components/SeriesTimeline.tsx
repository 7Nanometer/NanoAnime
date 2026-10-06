"use client";

import Link from "next/link";
import { useState } from "react";

import { getSeriesTag, getShortFormatLabel, UNKNOWN_TITLE } from "@/lib/anime-display";
import type { SeriesEntry } from "@/types/anime";

/**
 * 默认显示几部，超过就出「展开全部」按钮。
 *
 * ⚠️ 这个数是**串完整个系列之后**才知道的，不能拿「直接相连的关系数」来判断：
 * 实测进击的巨人直接相连过滤后只有 8 条，串完是 16 部。用前者会漏掉折叠。
 */
const INITIAL_COUNT = 12;

/**
 * 系列年表。
 *
 * 这是全项目**第一个带交互的展示组件**（其余展示组件都是纯静态的服务端组件）。
 * 之所以要交互：超过 12 部时默认只画 12 行。
 *
 * 不做「折叠」而是「截断 + 展开」：`useState(false)` 的初值让**服务端渲染出来的就是 12 行**，
 * 没跑 JS 也看得到内容，JS 只负责把剩下的放出来。
 */
export function SeriesTimeline({
  entries,
  currentId,
  partial,
}: {
  entries: SeriesEntry[];
  /** 当前这一部的 id，用来打「当前」标记 */
  currentId: number;
  /** 有没有没抓到的作品。true 时要在下面如实说明，不能让用户以为看到的就是全部 */
  partial: boolean;
}) {
  const [expanded, setExpanded] = useState(false);

  const collapsible = entries.length > INITIAL_COUNT;
  const visible = collapsible && !expanded ? entries.slice(0, INITIAL_COUNT) : entries;

  return (
    <div className="flex flex-col gap-2">
      <ol className="divide-y divide-border overflow-hidden rounded-xl border border-border bg-surface/50">
        {visible.map((entry) => {
          const tag = getSeriesTag(entry.relationType);
          const isCurrent = entry.id === currentId;

          const row = (
            <>
              <span className="w-10 shrink-0 text-xs tabular-nums text-muted-foreground">
                {entry.year ?? "—"}
              </span>
              <span className="w-12 shrink-0 text-xs text-muted-foreground">
                {getShortFormatLabel(entry.format)}
              </span>
              <span className="min-w-0 flex-1 truncate">{entry.titleNative ?? UNKNOWN_TITLE}</span>
              {tag ? (
                <span className="shrink-0 rounded bg-surface-elevated px-1.5 py-0.5 text-[10px] leading-none text-muted-foreground">
                  {tag}
                </span>
              ) : null}
              {isCurrent ? (
                <span className="shrink-0 rounded bg-primary px-1.5 py-0.5 text-[10px] leading-none font-medium text-primary-foreground">
                  当前
                </span>
              ) : null}
            </>
          );

          return (
            <li key={entry.id}>
              {isCurrent ? (
                // 当前这一部不做成链接：点了等于刷新自己，没有意义。
                // 底色用品牌淡色而不是中性灰——"当前"是个状态，要一眼看到
                <div className="flex items-baseline gap-3 bg-brand-tint px-3.5 py-2.5 text-sm">
                  {row}
                </div>
              ) : (
                <Link
                  href={`/anime/${entry.id}`}
                  className="flex items-baseline gap-3 px-3.5 py-2.5 text-sm transition-colors duration-150 hover:bg-brand-tint focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
                >
                  {row}
                </Link>
              )}
            </li>
          );
        })}
      </ol>

      {collapsible && !expanded ? (
        // 用 <button>（不是 div）：键盘 Tab 能聚焦、Enter/空格能触发，白拿的无障碍
        <button
          type="button"
          onClick={() => setExpanded(true)}
          className="cursor-pointer self-start rounded-lg border border-border px-3.5 py-1.5 text-sm transition-colors duration-150 hover:border-border-strong hover:bg-surface focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
        >
          {/*
            ⚠️ 抓没抓全，按钮文案必须跟着变：
            partial 时写「展开全部 N 部」会和下面的降级小字「没抓全」**自相矛盾**。
            实测样本：Fate/Zero 要 10 轮 > 上限 8 轮，就是这一档。
          */}
          {partial ? `展开已抓到的 ${entries.length} 部` : `展开全部 ${entries.length} 部`}
        </button>
      ) : null}

      {partial ? (
        <p className="text-xs leading-relaxed text-muted-foreground">
          这个系列还有关联作品暂时没能取到，上面列出的可能不是全部。
        </p>
      ) : null}
    </div>
  );
}
