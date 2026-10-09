// 追番周表的组装逻辑：算「本周是哪一周」→ 取这一周的全站排期 → 按天分好。
// 放在 lib/ 里而不是页面/接口里（CLAUDE.md 第六条：页面组件里不塞长逻辑）。
// 2026-10-06 M7 起它服务于首页的周表区块（原独立日历页已并入首页）。

import { fetchWeekSchedule } from "@/lib/anilist";
import { getBeijingDateKey, toBeijingTime, WEEKDAYS } from "@/lib/anime-display";
import { getTitleZh, withBangumiRating } from "@/lib/bangumi-index";
import type { CalendarDay, CalendarResult, ScheduleEntry } from "@/types/anime";

/** 中国不实行夏令时，北京时间固定是 UTC+8。与 lib/anime-display.ts 里的那份保持一致 */
const BEIJING_OFFSET_SECONDS = 8 * 60 * 60;

/** 一天有多少秒 */
const DAY_SECONDS = 24 * 60 * 60;

/** 一周有几天 */
const DAYS_PER_WEEK = 7;

/** 算好的这一周：起止时间 + 7 天的骨架 */
interface WeekRange {
  /** 周一 00:00:00（北京时间）的 Unix 时间戳，单位秒。查询窗口的起点，包含 */
  from: number;
  /** 下周一 00:00:00（北京时间）的 Unix 时间戳。查询窗口的终点，**不包含** */
  to: number;
  /** 今天的日期键，形如 "2026-10-01" */
  todayKey: string;
  /** 周一到周日共 7 天的日期信息（还没有排期数据） */
  days: Omit<CalendarDay, "entries" | "isToday">[];
}

/**
 * 取某个时间戳所在那天的**北京时间零点**（Unix 秒）。
 *
 * 做法：把时间戳换算成「北京时间的纪元秒」（+8 小时），向下取整到整天的倍数，
 * 再减回 8 小时。不能直接用本地时区的 `setHours(0,0,0,0)`——Vercel 跑在 UTC 上，
 * 那样算出来的"零点"是 UTC 零点，等于北京时间早上 8 点，整周的边界全错。
 */
function getBeijingDayStart(seconds: number): number {
  const beijingEpoch = seconds + BEIJING_OFFSET_SECONDS;
  return Math.floor(beijingEpoch / DAY_SECONDS) * DAY_SECONDS - BEIJING_OFFSET_SECONDS;
}

/**
 * 算出 `today` 所在的这一周。
 *
 * 一周的定义（中文日历习惯）：**周一 00:00 到周日 24:00，一律按北京时间**。
 * 今天是周几同样按北京时间判断——用 `toBeijingTime()` 加过偏移再读 `getUTCDay()`，
 * 拿到的就是北京时间的星期几。
 */
export function getBeijingWeek(today: Date = new Date()): WeekRange {
  const nowSeconds = Math.floor(today.getTime() / 1000);

  // 0 = 周日 … 6 = 周六。换算成「距离本周一过了几天」：周一 0 天、周日 6 天
  const weekday = toBeijingTime(nowSeconds).getUTCDay();
  const daysSinceMonday = (weekday + 6) % 7;

  const todayStart = getBeijingDayStart(nowSeconds);
  const from = todayStart - daysSinceMonday * DAY_SECONDS;

  const days = Array.from({ length: DAYS_PER_WEEK }, (_, index) => {
    const dayStart = from + index * DAY_SECONDS;
    const date = toBeijingTime(dayStart);
    // 下标 0 是周一，它对应的 getUTCDay() 是 1；周日的下标是 6，对应 0
    const weekdayIndex = (index + 1) % DAYS_PER_WEEK;

    return {
      dateKey: getBeijingDateKey(dayStart),
      weekdayLabel: WEEKDAYS[weekdayIndex],
      dateLabel: `${date.getUTCMonth() + 1}月${date.getUTCDate()}日`,
    };
  });

  return {
    from,
    to: from + DAYS_PER_WEEK * DAY_SECONDS,
    todayKey: getBeijingDateKey(nowSeconds),
    days,
  };
}

/**
 * 把排期按北京时间分到 7 天里。
 *
 * 分组的键是「北京时间哪一天」——这点很重要：日本深夜档常有 25:30 这种时刻，
 * 换算成北京时间是第二天凌晨，国内用户实际第二天早上才看得到，所以它就该落在第二天。
 *
 * 返回的天数**固定是 7 天**，没有排期的那天是空数组（由界面显示「排期待定」）。
 */
export function buildCalendar(entries: ScheduleEntry[], week: WeekRange): CalendarResult {
  const byDate = new Map<string, ScheduleEntry[]>();
  for (const entry of entries) {
    const key = getBeijingDateKey(entry.airingAt);
    const bucket = byDate.get(key);
    if (bucket) {
      bucket.push(entry);
    } else {
      byDate.set(key, [entry]);
    }
  }

  const days: CalendarDay[] = week.days.map((day) => ({
    ...day,
    isToday: day.dateKey === week.todayKey,
    // entries 已经在 fetchWeekSchedule() 里按播出时间升序排过，这里不用再排
    entries: byDate.get(day.dateKey) ?? [],
  }));

  return {
    weekStart: week.days[0].dateKey,
    weekEnd: week.days[DAYS_PER_WEEK - 1].dateKey,
    days,
    totalCount: entries.length,
  };
}

/**
 * 取本周周表。接口层面只调这一个函数。
 *
 * 中文名走本地 data/title-zh.json（`getTitleZh`）——**不发任何请求**。
 * 那张表覆盖 AniList 人气前 2000 部左右，所以周表里**冷门番显示的还是日文原名**，
 * 这是预期行为，不是 bug。
 *
 * @param now 当前时间。留着这个参数是为了能测「别的某一天」；正常调用不用传
 */
export async function fetchCalendar(now: Date = new Date()): Promise<CalendarResult> {
  const week = getBeijingWeek(now);
  const entries = await fetchWeekSchedule(week.from, week.to);

  // 补本地数据：中文名 + Bangumi 评分/排名（fetchWeekSchedule 出来的这几个字段都还是空，
  // 这里按 id 查本地表，零外网请求）
  const withZh = entries.map((entry) => ({
    ...entry,
    anime: withBangumiRating({
      ...entry.anime,
      title: { ...entry.anime.title, zh: getTitleZh(entry.anime.id) },
    }),
  }));

  return buildCalendar(withZh, week);
}
