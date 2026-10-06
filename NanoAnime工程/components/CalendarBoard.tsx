"use client";

import { useQuery } from "@tanstack/react-query";
import Image from "next/image";
import Link from "next/link";

import { getBeijingClock, getPrimaryTitle } from "@/lib/anime-display";
import { cn } from "@/lib/utils";
import type { CalendarDay, CalendarResult, ScheduleEntry } from "@/types/anime";

/** 前端只请求自家接口，不直连 AniList（CLAUDE.md 第五条铁律） */
async function fetchCalendar(): Promise<CalendarResult> {
  const response = await fetch("/api/calendar");
  if (!response.ok) {
    throw new Error(`接口返回 HTTP ${response.status}`);
  }
  return (await response.json()) as CalendarResult;
}

/** 一条排期：小封面 + 名字 + 时间/集数，整条链到详情页 */
function EntryRow({ entry }: { entry: ScheduleEntry }) {
  const title = getPrimaryTitle(entry.anime);
  const cover = entry.anime.coverImage.large ?? entry.anime.coverImage.extraLarge;

  return (
    <li>
      <Link
        href={`/anime/${entry.anime.id}`}
        className="group -mx-1 flex gap-2.5 rounded-lg px-1 py-1.5 outline-none transition-colors duration-150 hover:bg-brand-tint focus-visible:ring-2 focus-visible:ring-ring"
      >
        {/* 缩略图用 large 不用 extraLarge：这里只有 36px 宽，大图纯属浪费流量 */}
        <div
          className="relative aspect-[2/3] w-9 shrink-0 overflow-hidden rounded-md bg-surface ring-1 ring-border"
          style={
            entry.anime.coverImage.color
              ? { backgroundColor: entry.anime.coverImage.color }
              : undefined
          }
        >
          {cover ? (
            <Image
              src={cover}
              alt={title}
              fill
              sizes="36px"
              className="object-cover transition-transform duration-300 group-hover:scale-105"
            />
          ) : null}
        </div>

        <div className="min-w-0 flex-1">
          {/* 番剧名长短差很多，限两行，超出的省略——不然一列会被一个长名字撑歪 */}
          <p className="line-clamp-2 text-xs leading-snug font-medium group-hover:text-brand-strong">
            {title}
          </p>
          <p className="mt-0.5 text-[11px] tabular-nums text-muted-foreground">
            {getBeijingClock(entry.airingAt)} · 第 {entry.episode} 集
          </p>
        </div>
      </Link>
    </li>
  );
}

/** 一天一列（手机上是一段） */
function DayColumn({ day }: { day: CalendarDay }) {
  return (
    <section
      className={cn(
        "rounded-xl border p-3 transition-colors duration-150",
        // 今天那列：品牌色边框 + 外圈高亮 + 淡色底 + 一道顶部色条，四重区分。
        // ⚠️ 为什么要叠这么多层：周表 7 列全长得一样，用户扫视时的第一个任务
        // 就是"找到今天在哪"。只靠一个边框颜色太弱（一屏 82 集，注意力全在番名上），
        // 顶部色条是"从很远处也能一眼看到"的那个信号。
        day.isToday
          ? "relative border-brand/50 bg-brand-tint ring-1 ring-brand/25"
          : "border-border bg-surface/50 hover:border-border-strong",
      )}
    >
      {day.isToday ? (
        <span
          aria-hidden
          className="absolute inset-x-3 top-0 h-0.5 rounded-b-full bg-linear-to-r from-brand-strong to-primary"
        />
      ) : null}

      <h2 className="mb-2.5 flex flex-wrap items-baseline gap-x-1.5 gap-y-0.5">
        <span
          className={cn(
            "text-sm font-semibold",
            day.isToday ? "text-brand-strong" : "text-foreground",
          )}
        >
          {day.weekdayLabel}
        </span>
        <span className="text-xs tabular-nums text-muted-foreground">{day.dateLabel}</span>
        {day.isToday ? (
          <span className="rounded bg-primary px-1.5 py-0.5 text-[10px] leading-none font-medium text-primary-foreground">
            今天
          </span>
        ) : null}
      </h2>

      {day.entries.length === 0 ? (
        // AniList 只对「有排期的番」给数据，查不到的日子如实说，不留空白
        <p className="py-2 text-xs text-muted-foreground/80">排期待定</p>
      ) : (
        <ol className="flex flex-col gap-0.5">
          {day.entries.map((entry) => (
            <EntryRow key={`${entry.anime.id}-${entry.episode}`} entry={entry} />
          ))}
        </ol>
      )}
    </section>
  );
}

/**
 * 追番周表：周一 ~ 周日 7 列。
 *
 * 2026-10-06 M7 起它挂在**首页**（id="calendar" 的区块里），不再是独立页面。
 * 数据由服务端 /api/calendar 算好——**连「今天是哪一天」也是服务端按北京时间判定的**
 * （`day.isToday`），客户端不自己算时区，两边不会打架。
 *
 * 布局：电脑上 7 列并排；手机上屏幕装不下 7 列（每列只剩几十像素），改成竖排 7 段。
 */
export function CalendarBoard() {
  const { data, isPending, error, refetch } = useQuery({
    queryKey: ["calendar"],
    queryFn: fetchCalendar,
  });

  if (isPending) {
    return <CalendarSkeleton />;
  }

  // 国内访问海外数据源时不时会超时（详情页已经实测撞过），所以给个「重试」而不是只写一句失败
  if (error) {
    return (
      <div className="flex flex-col items-center gap-4 py-20 text-center">
        <p className="text-sm leading-relaxed text-muted-foreground">
          周表加载失败，可能是网络超时。
          <br />
          过一会儿重试通常就好。
        </p>
        <button
          type="button"
          onClick={() => refetch()}
          className="cursor-pointer rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-opacity duration-150 hover:opacity-90 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
        >
          重试
        </button>
      </div>
    );
  }

  if (data.totalCount === 0) {
    return (
      <p className="rounded-xl border border-dashed border-border px-4 py-16 text-center text-sm leading-relaxed text-muted-foreground">
        这一周还没查到任何播出排期。
        <br />
        AniList 的排期数据偶尔会晚几天，稍后再来看看。
      </p>
    );
  }

  const first = data.days[0];
  const last = data.days[data.days.length - 1];

  return (
    <section>
      <header className="mb-7">
        {/* 挂首页后标题降一级（h2）——页面级的 h1 留给下面的新番墙 */}
        <h2 className="section-mark text-2xl font-bold tracking-tight">追番周表</h2>
        <p className="mt-2 text-sm tabular-nums text-muted-foreground">
          {first.dateLabel} ~ {last.dateLabel} · 本周共 {data.totalCount} 集
        </p>
      </header>

      {/* 手机上竖排（周一在最上）；到 md 断点才变成 7 列并排 */}
      <div className="flex flex-col gap-3 md:grid md:grid-cols-7 md:items-start">
        {data.days.map((day) => (
          <DayColumn key={day.dateKey} day={day} />
        ))}
      </div>

      <p className="mt-6 text-xs leading-relaxed text-muted-foreground">
        时间一律为北京时间。收录 AniList 上有排期的全部作品，包含本季新番和上一季还没播完的。
      </p>
    </section>
  );
}

/**
 * 周表加载态。
 *
 * 七天 × 若干条的骨架。
 * ⚠️ 高度不必和真实排期完全一致（每天的集数不固定，算不准），但**列数必须一致**——
 * 手机上竖排 1 列、md 以上 7 列，骨架要跟着切换，否则数据到达时列数会跳一下。
 */
function CalendarSkeleton() {
  return (
    <div role="status" aria-busy="true" aria-label="正在加载追番周表">
      <div className="mb-7 space-y-2">
        <div className="h-7 w-32 animate-pulse rounded-md bg-surface" />
        <div className="h-4 w-56 animate-pulse rounded bg-surface" />
      </div>
      <div className="flex flex-col gap-3 md:grid md:grid-cols-7 md:items-start">
        {Array.from({ length: 7 }, (_, index) => (
          <div
            key={index}
            className="flex flex-col gap-2 rounded-xl border border-border bg-surface/50 p-3"
          >
            <div className="h-4 w-16 animate-pulse rounded bg-surface-elevated" />
            {Array.from({ length: 3 }, (_, rowIndex) => (
              <div key={rowIndex} className="flex gap-2.5 py-1">
                <div className="aspect-[2/3] w-9 shrink-0 animate-pulse rounded-md bg-surface-elevated" />
                <div className="flex flex-1 flex-col gap-1.5 pt-0.5">
                  <div className="h-3 w-full animate-pulse rounded bg-surface-elevated" />
                  <div className="h-2.5 w-2/3 animate-pulse rounded bg-surface-elevated" />
                </div>
              </div>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}
