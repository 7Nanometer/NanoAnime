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
        className="group flex gap-2 rounded outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        {/* 缩略图用 large 不用 extraLarge：这里只有 36px 宽，大图纯属浪费流量 */}
        <div
          className="relative aspect-[2/3] w-9 shrink-0 overflow-hidden rounded bg-muted"
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
              className="object-cover"
            />
          ) : null}
        </div>

        <div className="min-w-0 flex-1">
          {/* 番剧名长短差很多，限两行，超出的省略——不然一列会被一个长名字撑歪 */}
          <p className="line-clamp-2 text-xs leading-snug font-medium group-hover:underline">
            {title}
          </p>
          <p className="mt-0.5 text-[11px] text-muted-foreground">
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
        "rounded-lg border p-3",
        // 今天那列：换色边框 + 外圈高亮 + 淡色底，三重区分，扫一眼就能找到
        day.isToday ? "border-primary bg-primary/5 ring-2 ring-primary/30" : "border-border",
      )}
    >
      <h2 className="mb-2 flex flex-wrap items-baseline gap-x-1.5 gap-y-0.5">
        <span className={cn("text-sm font-semibold", day.isToday && "text-primary")}>
          {day.weekdayLabel}
        </span>
        <span className="text-xs text-muted-foreground">{day.dateLabel}</span>
        {day.isToday ? (
          <span className="rounded bg-primary px-1.5 py-0.5 text-[10px] leading-none font-medium text-primary-foreground">
            今天
          </span>
        ) : null}
      </h2>

      {day.entries.length === 0 ? (
        // AniList 只对「有排期的番」给数据，查不到的日子如实说，不留空白
        <p className="text-xs text-muted-foreground">排期待定</p>
      ) : (
        <ol className="flex flex-col gap-2">
          {day.entries.map((entry) => (
            <EntryRow key={`${entry.anime.id}-${entry.episode}`} entry={entry} />
          ))}
        </ol>
      )}
    </section>
  );
}

/**
 * 本周日历：周一 ~ 周日 7 列。
 *
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
    return <p className="py-20 text-center text-muted-foreground">正在加载本周日历…</p>;
  }

  // 国内访问海外数据源时不时会超时（详情页已经实测撞过），所以给个「重试」而不是只写一句失败
  if (error) {
    return (
      <div className="flex flex-col items-center gap-3 py-20 text-center">
        <p className="text-sm text-muted-foreground">
          日历加载失败，可能是网络超时。过一会儿重试通常就好。
        </p>
        <button
          type="button"
          onClick={() => refetch()}
          className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-opacity hover:opacity-90"
        >
          重试
        </button>
      </div>
    );
  }

  if (data.totalCount === 0) {
    return (
      <p className="py-20 text-center text-muted-foreground">
        这一周还没查到任何播出排期。AniList 的排期数据偶尔会晚几天，稍后再来看看。
      </p>
    );
  }

  const first = data.days[0];
  const last = data.days[data.days.length - 1];

  return (
    <section>
      <div className="mb-6">
        <h1 className="text-xl font-bold">新番日历</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {first.dateLabel} ~ {last.dateLabel} · 本周共 {data.totalCount} 集
        </p>
      </div>

      {/* 手机上竖排（周一在最上）；到 md 断点才变成 7 列并排 */}
      <div className="flex flex-col gap-3 md:grid md:grid-cols-7 md:items-start">
        {data.days.map((day) => (
          <DayColumn key={day.dateKey} day={day} />
        ))}
      </div>

      <p className="mt-6 text-xs text-muted-foreground">
        时间一律为北京时间。收录 AniList 上有排期的全部作品，包含本季新番和上一季还没播完的。
      </p>
    </section>
  );
}
