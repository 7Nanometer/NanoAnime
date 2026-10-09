import Link from "next/link";

import {
  buildBrowseHref,
  FORMAT_OPTIONS,
  getYearOptions,
  SORT_OPTIONS,
  STATUS_OPTIONS,
  TAG_OPTIONS,
  type BrowseOption,
  type BrowseParams,
} from "@/lib/browse";
import { cn } from "@/lib/utils";

/**
 * 「全部番剧」的筛选区（服务端组件，2026-10-09）。
 *
 * 每个胶囊就是一个 <Link>——筛选状态全部在网址里（见 lib/browse.ts 的头注释），
 * 点一下就是一次路由导航，服务端重新查询并渲染。没有客户端状态、
 * 没有 useEffect，首屏直出。
 *
 * ⚠️ 选中态用 bg-primary + text-primary-foreground——和全站主按钮（"去哪看"）
 * 同一对颜色，对比度已过全站扫描。不要为这里另造一对颜色。
 *
 * 每个链接带 aria-current="true" 表示"当前选中的筛选项"（读屏软件可感知——
 * 光靠紫色底，色觉障碍用户分不出选没选中）。
 */
export function BrowseFilters({ current }: { current: BrowseParams }) {
  return (
    <div className="flex flex-col gap-3 rounded-xl border border-border bg-surface/50 p-4">
      <FilterRow
        label="形式"
        options={FORMAT_OPTIONS}
        currentValue={current.format}
        hrefFor={(value) => buildBrowseHref(current, { format: value })}
      />
      <FilterRow
        label="状态"
        options={STATUS_OPTIONS}
        currentValue={current.status}
        hrefFor={(value) => buildBrowseHref(current, { status: value })}
      />
      <FilterRow
        label="年份"
        options={getYearOptions()}
        currentValue={current.year}
        hrefFor={(value) => buildBrowseHref(current, { year: value })}
      />
      <FilterRow
        label="标签"
        options={TAG_OPTIONS}
        currentValue={current.tag}
        hrefFor={(value) => buildBrowseHref(current, { tag: value })}
      />
      <FilterRow
        label="排序"
        options={SORT_OPTIONS}
        currentValue={current.sort}
        hrefFor={(value) => buildBrowseHref(current, { sort: value })}
      />

      {/*
        「评分」排序的口径说明（2026-10-09 全站评分改 Bangumi 后加）：
        数据源自带的排序只能按 AniList 打分，没法按 Bangumi 分排——为了保住
        "按分排序"的能力，这个排序下卡片显示的是同口径的 AniList 分。
        不说明的话，用户会发现"分数怎么突然变成 85 了"，以为站里有两套评分。
      */}
      {current.sort === "score" ? (
        <p className="text-xs leading-relaxed text-muted-foreground">
          「评分」排序按数据源的 0~100 分排列，卡片同步显示同一口径的分数；
          站内其他位置的评分均为 Bangumi 的 10 分制评分。
        </p>
      ) : null}
    </div>
  );
}

/** 一行筛选：左侧维度名 + 右侧一排胶囊 */
function FilterRow({
  label,
  options,
  currentValue,
  hrefFor,
}: {
  label: string;
  options: BrowseOption[];
  currentValue: string;
  hrefFor: (value: string) => string;
}) {
  return (
    <div className="flex gap-3">
      {/* w-10 让五个维度名纵向对齐（中文两个字刚好放得下） */}
      <span className="w-10 shrink-0 pt-1.5 text-xs leading-4 text-muted-foreground">
        {label}
      </span>
      <div className="flex flex-1 flex-wrap gap-1.5">
        {options.map((option) => {
          const active = option.value === currentValue;

          return (
            <Link
              key={option.value || "all"}
              href={hrefFor(option.value)}
              aria-current={active ? "true" : undefined}
              className={cn(
                "rounded-full border px-3 py-1 text-sm leading-5 transition-colors duration-150",
                "focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none",
                active
                  ? "border-primary bg-primary font-medium text-primary-foreground"
                  : "border-border bg-surface text-muted-foreground hover:border-brand/50 hover:text-foreground",
              )}
            >
              {option.label}
            </Link>
          );
        })}
      </div>
    </div>
  );
}
