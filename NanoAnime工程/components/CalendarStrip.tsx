"use client";

import { useMemo } from "react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";

import { AnimeCard } from "@/components/AnimeCard";
import { EmptyHint, ErrorHint } from "@/components/AnimeGrid";
import { fetchCalendar } from "@/lib/calendar-client";
import type { ScheduleEntry } from "@/types/anime";

/**
 * 首页「追番周表」一行：今天起 7 天，每天挑一部（当天最早播的），最多 7 张卡。
 *
 * 2026-10-07 三期改版：完整周表挪去了独立页 /calendar（见 CalendarBoard），
 * 首页只留这一行；右下角「查看更多 ›」去完整页。
 *
 * 「今天 + 未来 6 天」怎么取：周表数据是**本周一到周日**这 7 天。从今天那列
 * 开始把 7 天转一圈（今天、明天……到本周末、再绕回本周前几段）——转圈之后
 * 每个位置恰好是"从今天起的第 N 个星期几"，周中打开也能凑出 7 张，
 * 不会到周三就只剩几张。每天取该天第一条（最早播的那部）；当天没有排期就跳过、
 * 由后面的天顶上；转完一圈仍不足 7 条就渲染多少算多少——不编造。
 * （每天的卡片显示的是那部番**下一集的播出时刻**，来自 AnimeCard 的
 * getCardScheduleLabel——对周更的番，那就是"下周几几点"，正是周表想说的。）
 *
 * ⚠️ 这里**不做任何时间换算**：哪条属于哪一天、"今天"是哪一列，都是服务端按
 * 北京时间算好送来的（CalendarDay.isToday）。时区换算在本项目踩过坑，
 * 客户端一律不自己算。
 */
export function CalendarStrip() {
  const { data, isPending, error, refetch } = useQuery({
    queryKey: ["calendar"],
    queryFn: fetchCalendar,
  });

  const picks = useMemo(() => {
    if (!data) {
      return [];
    }

    const todayIndex = data.days.findIndex((day) => day.isToday);
    const rotated =
      todayIndex > 0
        ? [...data.days.slice(todayIndex), ...data.days.slice(0, todayIndex)]
        : data.days;

    const picked: ScheduleEntry[] = [];
    const used = new Set<number>();
    for (const day of rotated) {
      // 取当天最早播的那部；同一部番在相邻两天都上榜时（日更的泡面番）去重，
      // 免得同一部在首页这一行里出现两次、React key 也跟着撞
      const entry = day.entries.find((item) => !used.has(item.anime.id));
      if (entry) {
        picked.push(entry);
        used.add(entry.anime.id);
      }
      if (picked.length === 7) {
        break;
      }
    }
    return picked;
  }, [data]);

  if (isPending) {
    return <StripSkeleton />;
  }

  if (error) {
    // 和 CalendarBoard 同一句话——同一个数据源、同一种失败
    return <ErrorHint onRetry={() => refetch()} message="周表加载失败，可能是网络超时。" />;
  }

  if (!data || data.totalCount === 0 || picks.length === 0) {
    return (
      <EmptyHint
        title="这一周还没查到任何播出排期。"
        note="AniList 的排期数据偶尔会晚几天，稍后再来看看。"
      />
    );
  }

  const first = data.days[0];
  const last = data.days[data.days.length - 1];
  // 今天更新的集数。按"集"数不按"部"数：排期数据本身就是按集的，
  // 说"部"遇到同一部一天更两集时数字对不上（同 CalendarBoard 的口径）
  const todayCount = data.days.find((day) => day.isToday)?.entries.length ?? 0;

  return (
    <section>
      <header className="mb-5 flex flex-wrap items-end justify-between gap-x-4 gap-y-2">
        <div>
          <h2 className="section-mark text-2xl font-bold tracking-tight sm:text-[28px]">追番周表</h2>
          {/* 副标题沿用 CalendarBoard 的文案构成，不另造一套 */}
          <p className="mt-2 text-sm tabular-nums text-muted-foreground">
            {first.dateLabel} ~ {last.dateLabel} · 本周共 {data.totalCount} 集 ·{" "}
            {todayCount > 0 ? `今天 ${todayCount} 集更新` : "今天暂无更新"}
          </p>
        </div>
        <Link
          href="/calendar"
          className="group inline-flex shrink-0 items-center gap-0.5 rounded-md text-sm font-medium text-brand-strong transition-colors duration-150 hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
        >
          查看更多
          <span aria-hidden className="transition-transform duration-150 group-hover:translate-x-0.5">
            ›
          </span>
        </Link>
      </header>

      {/*
        窄屏先退化成 2 列、sm 4 列、lg 起才是 7 列。
        ⚠️ 窄屏必须退化：320px 上按 7 列排的话每张卡只有 40px 宽，没法看
      */}
      <div className="grid grid-cols-2 gap-x-4 gap-y-6 sm:grid-cols-4 lg:grid-cols-7">
        {picks.map((entry) => (
          <AnimeCard key={entry.anime.id} anime={entry.anime} />
        ))}
      </div>
    </section>
  );
}

/**
 * 一行 7 张卡的骨架占位。列数与真实网格一致（防替换时的跳动）。
 * 单独写这一个、而不是复用 AnimeGridSkeleton：那个是给整墙用的（列数多、还带头部占位），
 * 这里只有一行。
 */
function StripSkeleton() {
  return (
    <div role="status" aria-busy="true" aria-label="正在加载追番周表">
      <div className="mb-5 space-y-2">
        <div className="h-7 w-32 animate-pulse rounded-md bg-surface" />
        <div className="h-4 w-56 animate-pulse rounded bg-surface" />
      </div>
      <div className="grid grid-cols-2 gap-x-4 gap-y-6 sm:grid-cols-4 lg:grid-cols-7">
        {Array.from({ length: 7 }, (_, index) => (
          <div key={index} className="flex flex-col gap-2.5">
            <div className="aspect-[2/3] w-full animate-pulse rounded-xl bg-surface" />
            {/* 标题占位沿用 AnimeCard 的两行固定高，形状对不上替换时会跳一下 */}
            <div className="min-h-[2.6em] space-y-1.5">
              <div className="h-3.5 w-full animate-pulse rounded bg-surface" />
              <div className="h-3.5 w-2/3 animate-pulse rounded bg-surface" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
