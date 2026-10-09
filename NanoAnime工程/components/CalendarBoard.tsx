"use client";

import { useQuery } from "@tanstack/react-query";

import { AnimeCard } from "@/components/AnimeCard";
import { getBeijingClock } from "@/lib/anime-display";
import { fetchCalendar } from "@/lib/calendar-client";
import { cn } from "@/lib/utils";
import type { CalendarDay, ScheduleEntry } from "@/types/anime";

/**
 * 追番周表页（2026-10-09 版式改版，参考用户给定的形态）。
 *
 * 结构自上而下：
 *   ① 标题——h1「追番周表」+ 本周概况
 *   ② 日期条——周一到周日，带当日集数；今天高亮；**每个都可点击跳转**到对应区块
 *   ③ 今天——大区块 + 卡片网格（区块右侧报"N 集更新"）
 *   ④ 即将更新——今天之后的每一天一行：左标签 + 横向滚动的卡片条
 *   ⑤ 本周已更新——今天之前的每一天一行（同样式；周一在最上）
 *   ⑥ 脚注
 *
 * 分组只看数据里的 `isToday`——那是服务端按**北京时间**判定的（lib/calendar.ts），
 * 客户端不自己算"今天"：两边都算的话，跨天的午夜前后会各说各话。
 *
 * 卡片全部复用全站唯一的 AnimeCard。两个版式上的小口子：
 *   · 今天区块的网格比全站封面墙（ANIME_GRID_CLASS，7 列）**少一列**——这是
 *     单区块的展示墙，卡片稍大更贴参考图的观感；
 *   · 横向滚动行里卡片定宽（父容器 li 控制），并把 sizes 传成 "144px"，
 *     别让浏览器按封面墙的 13vw 去取一张用不上的大图（一行十几张，省下来的可观）。
 *
 * 平滑滚动（日期条点击跳转）靠 `<html>` 上的 scroll-smooth；减弱动效的用户
 * 在 globals.css 的 reduced-motion 块里被强制回默认跳转。
 *
 * 版式变化史：2026-10-06（M7 A+B）它曾被并进首页；2026-10-07（三期改版）完整周表
 * 恢复成独立页 /calendar；2026-10-09 本版把"7 列一天一列"改成"今天 + 两组滚动行"。
 */

/** 今天区块的卡片网格（比 ANIME_GRID_CLASS 少一列：区块内卡片稍大） */
const TODAY_GRID_CLASS =
  "grid grid-cols-2 gap-x-4 gap-y-6 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6";

/** 横向滚动行里每张卡片的固定宽度（与 li 的 w-32/w-36 对应，喂给 Image 的 sizes） */
const ROW_CARD_SIZES = "144px";

/** 某一天区块的锚点（日期条点击跳到这里） */
function dayAnchor(day: CalendarDay): string {
  return day.isToday ? "#cal-today" : `#cal-${day.dateKey}`;
}

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

  // 今天在 7 天里的位置。isToday 由服务端保证存在（今天必落在本周 7 天内），
  // 真取不到时（理论上不会）退化成"周一当今天"，页面结构不塌
  const todayIndex = Math.max(
    0,
    data.days.findIndex((day) => day.isToday),
  );
  const today = data.days[todayIndex];
  const pastDays = data.days.slice(0, todayIndex);
  const futureDays = data.days.slice(todayIndex + 1);

  const first = data.days[0];
  const last = data.days[data.days.length - 1];

  return (
    <section>
      <header className="mb-6">
        {/* 独立页的主标题（10-07 恢复成独立页后，从降级的 h2 改回 h1） */}
        <h1 className="section-mark text-2xl font-bold tracking-tight">追番周表</h1>
        <p className="mt-2 text-sm tabular-nums text-muted-foreground">
          {first.dateLabel} ~ {last.dateLabel} · 本周共 {data.totalCount} 集
        </p>
      </header>

      <WeekdayNav days={data.days} />

      <TodaySection day={today} />

      {/* 组只在有内容时渲染（今天周一就没有「本周已更新」，周日后就没有「即将更新」） */}
      {futureDays.length > 0 ? <ScheduleGroup title="即将更新" days={futureDays} /> : null}
      {pastDays.length > 0 ? <ScheduleGroup title="本周已更新" days={pastDays} /> : null}

      <p className="mt-6 text-xs leading-relaxed text-muted-foreground">
        时间一律为北京时间。收录 AniList 上有排期的全部作品，包含本季新番和上一季还没播完的。
      </p>
    </section>
  );
}

/** 日期条：周一~周日，点击跳到对应区块；今天用品牌紫高亮 */
function WeekdayNav({ days }: { days: CalendarDay[] }) {
  return (
    <nav aria-label="跳到某一天" className="mb-7">
      <ul className="flex flex-wrap gap-2">
        {days.map((day) => (
          <li key={day.dateKey}>
            <a
              href={dayAnchor(day)}
              // aria-current="date"：读屏软件把"今天"念成"当前日期"——
              // 光靠紫色底，色觉障碍用户分不出哪天是今天
              aria-current={day.isToday ? "date" : undefined}
              className={cn(
                "inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-sm transition-colors duration-150",
                "focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none",
                day.isToday
                  ? "border-primary bg-primary font-medium text-primary-foreground"
                  : "border-border bg-surface text-muted-foreground hover:border-brand/50 hover:text-foreground",
              )}
            >
              {day.weekdayLabel}
              <span
                className={cn(
                  "rounded px-1 text-xs leading-4 tabular-nums",
                  // 今天：紫色底上再垫一层深色，数字的对比度更稳
                  day.isToday ? "bg-background/25" : "bg-surface-elevated",
                )}
              >
                {day.entries.length}
              </span>
            </a>
          </li>
        ))}
      </ul>
    </nav>
  );
}

/** 今天：大区块 + 卡片网格，右侧报当日集数 */
function TodaySection({ day }: { day: CalendarDay }) {
  return (
    <section
      id="cal-today"
      className="mb-7 rounded-2xl border border-brand/30 bg-brand-tint p-4 sm:p-5"
    >
      <header className="mb-4 flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <h2 className="flex items-baseline gap-2">
          <span className="text-xl font-bold tracking-tight text-brand-strong">今天</span>
          <span className="text-sm tabular-nums text-muted-foreground">
            {day.dateLabel} · {day.weekdayLabel}
          </span>
        </h2>
        {/* 口径用「集」不用「部」：排期本身就是按集给的，同一部一天更两集时"部"会对不上 */}
        <p className="text-sm tabular-nums text-brand-strong">
          {day.entries.length > 0 ? `${day.entries.length} 集更新` : "暂无更新"}
        </p>
      </header>

      {day.entries.length === 0 ? (
        <p className="py-8 text-center text-sm text-muted-foreground">
          今天暂无更新，看看下面「即将更新」里有没有要追的。
        </p>
      ) : (
        <div className={TODAY_GRID_CLASS}>
          {day.entries.map((entry, index) => (
            <AnimeCard
              key={entryKey(entry)}
              anime={entry.anime}
              // 首屏第一行优先加载（口径同封面墙：只标前几张，不整墙标）
              priority={index < 6}
              scheduleLabel={entryLabel(day, entry)}
            />
          ))}
        </div>
      )}
    </section>
  );
}

/** 一组"每天一行"：标题（即将更新 / 本周已更新）+ 若干横向滚动行 */
function ScheduleGroup({ title, days }: { title: string; days: CalendarDay[] }) {
  return (
    <section className="mb-7">
      <h2 className="section-mark mb-4 text-xl font-bold tracking-tight">{title}</h2>
      <div className="flex flex-col gap-3">
        {days.map((day) => (
          <ScheduleDayRow key={day.dateKey} day={day} />
        ))}
      </div>
    </section>
  );
}

/** 一行 = 一天的排期：左标签（星期 + 日期 + 集数）+ 横向滚动的卡片条 */
function ScheduleDayRow({ day }: { day: CalendarDay }) {
  return (
    <section
      id={`cal-${day.dateKey}`}
      className="rounded-xl border border-border bg-surface/50 p-3 sm:p-4"
    >
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:gap-4">
        {/* 桌面：左栏竖排（参考图形态）；窄屏：横排小标题 */}
        <h3 className="flex shrink-0 items-baseline gap-2 sm:w-28 sm:flex-col sm:items-start sm:gap-0.5">
          <span className="text-lg leading-tight font-bold tracking-tight">
            {day.weekdayLabel}
          </span>
          <span className="text-[11px] leading-snug tabular-nums text-muted-foreground">
            {day.dateLabel} · {day.entries.length} 集
          </span>
        </h3>

        {day.entries.length === 0 ? (
          // AniList 只对「有排期的番」给数据（未来的日子常常还没公布），如实说
          <p className="flex-1 py-6 text-center text-xs text-muted-foreground/80">
            这一天暂无排期
          </p>
        ) : (
          /*
            横向滚动条。
            ⚠️ -mb-2 + pb-2 这对：pb-2 给滚动条留出位置，-mb-2 把容器底部收回去——
            不加的话滚动条会顶在卡片下方、每行的视觉底边参差不齐。
          */
          <ul className="-mb-2 flex flex-1 gap-3 overflow-x-auto pb-2">
            {day.entries.map((entry) => (
              <li key={entryKey(entry)} className="w-32 shrink-0 sm:w-36">
                <AnimeCard
                  anime={entry.anime}
                  sizes={ROW_CARD_SIZES}
                  scheduleLabel={entryLabel(day, entry)}
                />
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}

/** 同一天同一部番理论上只会有一条排期，带上集数防止极端情况下 key 撞车 */
function entryKey(entry: ScheduleEntry): string {
  return `${entry.anime.id}-${entry.episode}`;
}

/**
 * 卡片底条文案：**这一集**的播出时刻（如「周五 16:00」）。
 * ⚠️ 必须传，不能用 AnimeCard 的默认口径（"下一集什么时候播"）——在"已经过去的
 * 日子"那些行里，下一集往往漂到了下周的另一天，卡片会顶着"周日 10:00"出现在
 * 周二那一行里，把人看糊涂（2026-10-09 实测抓到）。口径与所在位置必须一致。
 */
function entryLabel(day: CalendarDay, entry: ScheduleEntry): string {
  return `${day.weekdayLabel} ${getBeijingClock(entry.airingAt)}`;
}

/**
 * 周表加载态。
 *
 * 结构要跟新版式对齐：日期条（一排胶囊）+ 今天区块（网格）+ 两组滚动行。
 * ⚠️ 高度不必和真实排期完全一致（每天的集数不固定，算不准），但**结构段数必须一致**——
 * 骨架和真实内容差得越多，数据到达时页面跳得越狠。
 */
function CalendarSkeleton() {
  return (
    <div role="status" aria-busy="true" aria-label="正在加载追番周表">
      <div className="mb-6 space-y-2">
        <div className="h-8 w-32 animate-pulse rounded-md bg-surface" />
        <div className="h-4 w-56 animate-pulse rounded bg-surface" />
      </div>

      {/* 日期条 */}
      <div className="mb-7 flex flex-wrap gap-2">
        {Array.from({ length: 7 }, (_, index) => (
          <div key={index} className="h-9 w-20 animate-pulse rounded-full bg-surface" />
        ))}
      </div>

      {/* 今天区块 */}
      <div className="mb-7 rounded-2xl border border-border bg-surface/50 p-4">
        <div className="mb-4 h-6 w-44 animate-pulse rounded bg-surface-elevated" />
        <div className={TODAY_GRID_CLASS}>
          {Array.from({ length: 6 }, (_, index) => (
            <div key={index} className="flex flex-col gap-2.5">
              <div className="aspect-[2/3] w-full animate-pulse rounded-xl bg-surface-elevated" />
              <div className="h-3.5 w-full animate-pulse rounded bg-surface-elevated" />
            </div>
          ))}
        </div>
      </div>

      {/* 两组滚动行（各一行示意） */}
      {[0, 1].map((group) => (
        <div key={group} className="mb-7">
          <div className="mb-4 h-6 w-28 animate-pulse rounded bg-surface" />
          <div className="flex gap-3 overflow-hidden">
            {Array.from({ length: 6 }, (_, index) => (
              <div key={index} className="flex w-36 shrink-0 flex-col gap-2.5">
                <div className="aspect-[2/3] w-full animate-pulse rounded-xl bg-surface-elevated" />
                <div className="h-3.5 w-full animate-pulse rounded bg-surface-elevated" />
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
