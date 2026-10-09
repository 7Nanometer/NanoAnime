import Link from "next/link";
import { SlidersHorizontal, X } from "lucide-react";

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
 * 「全部番剧」的筛选区（2026-10-09 建，同日"手机端重做"）。
 *
 * 每个胶囊就是一个 <Link>——筛选状态全部在网址里（见 lib/browse.ts 的头注释），
 * 点一下就是一次路由导航，服务端重新查询并渲染。**没有客户端状态、没有 useEffect、
 * 没有一行客户端 JS**，首屏直出。
 *
 * ── 手机端为什么做成"可折叠 + 已选条件胶囊行"（2026-10-09 重做）──────
 * 原版在手机上把五组胶囊全部铺开：光是"年份"一组就有 30 枚，整块筛选区长度
 * 约 8 个屏幕高——打开「全部番剧」要划很久才能见到第一个番剧，筛选器喧宾夺主。
 * 重做后手机上是：一行「筛选 (n)」按钮 + 已选条件胶囊（横滑、可单独撤除），
 * 五个胶囊组收进**原生 <details>** 里、点开才展开。
 *
 * ⚠️ 为什么用 <details> 而不是"底部抽屉"（bottom sheet）：抽屉要写客户端状态、
 * 要管滚动锁/焦点/背部点击关闭，且**没有 JS 的用户会彻底失去筛选能力**；
 * <details> 是浏览器原生的开合控件，零 JS、键盘可用、读屏可用，与项目里
 * 账号菜单选择"披露式"的取向一致（做一半的自定义弹层比不做更难用）。
 * 副作用是"筛完一项后 <details> 保持展开"——连续挑选多个条件本来就是这个场景，
 * 符合预期。
 *
 * ⚠️ 选中态用 bg-primary + text-primary-foreground——和全站主按钮（"去哪看"）
 * 同一对颜色，对比度已过全站扫描。不要为这里另造一对颜色。
 *
 * 每个链接带 aria-current="true" 表示"当前选中的筛选项"（读屏软件可感知——
 * 光靠紫色底，色觉障碍用户分不出选没选中）。
 */
export function BrowseFilters({ current }: { current: BrowseParams }) {
  // 手机版"已选条件"胶囊：只收四个筛选维度（排序不是筛选，不进胶囊行）
  const activeChips = (
    [
      { key: "format", label: labelFor(FORMAT_OPTIONS, current.format) },
      { key: "status", label: labelFor(STATUS_OPTIONS, current.status) },
      { key: "year", label: labelFor(getYearOptions(), current.year) },
      { key: "tag", label: labelFor(TAG_OPTIONS, current.tag) },
    ] as const
  ).filter((chip) => chip.label !== null);

  return (
    <>
      {/* ── 手机 / 平板（< lg）：折叠式筛选 + 已选条件胶囊 ─────────────── */}
      <section className="lg:hidden" aria-label="筛选">
        <details className="group">
          <summary
            className={cn(
              "flex cursor-pointer list-none items-center justify-between rounded-xl border border-border bg-surface/50 px-4 py-2.5",
              "text-sm font-medium transition-colors duration-150 hover:border-border-strong",
              "focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none",
              "[&::-webkit-details-marker]:hidden",
            )}
          >
            <span className="flex items-center gap-2">
              <SlidersHorizontal aria-hidden className="size-4 text-muted-foreground" />
              筛选
              {activeChips.length > 0 ? (
                <span className="rounded-full bg-brand/15 px-1.5 py-0.5 text-xs leading-none font-semibold text-brand-strong tabular-nums">
                  {activeChips.length}
                </span>
              ) : null}
            </span>
            {/* 展开/收起指示箭头。group-open 是 <details open> 的原生状态 */}
            <svg
              viewBox="0 0 24 24"
              aria-hidden
              className="size-4 text-muted-foreground transition-transform duration-200 group-open:rotate-180"
              fill="none"
              stroke="currentColor"
              strokeWidth={2.25}
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M6 9l6 6 6-6" />
            </svg>
          </summary>

          <div className="mt-3 flex flex-col gap-3 rounded-xl border border-border bg-surface/50 p-4">
            <FilterPanel current={current} />
          </div>
        </details>

        {activeChips.length > 0 ? (
          <div className="mt-3 flex items-center gap-2 overflow-x-auto pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            {activeChips.map((chip) => (
              <Link
                key={chip.key}
                href={buildBrowseHref(current, { [chip.key]: "" })}
                aria-label={`撤除筛选：${chip.label}`}
                className="inline-flex shrink-0 items-center gap-1 rounded-full border border-brand/40 bg-brand/10 px-2.5 py-1 text-xs text-brand-strong transition-colors duration-150 hover:border-brand/70 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
              >
                {chip.label}
                <X aria-hidden className="size-3" />
              </Link>
            ))}
            {activeChips.length > 1 ? (
              <Link
                href={buildBrowseHref(current, { format: "", status: "", year: "", tag: "" })}
                className="shrink-0 rounded-full border border-border px-2.5 py-1 text-xs text-muted-foreground transition-colors duration-150 hover:border-border-strong hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
              >
                清除全部
              </Link>
            ) : null}
          </div>
        ) : null}
      </section>

      {/* ── 桌面（≥ lg）：常开面板（原版式不动）──────────────────────── */}
      <div className="hidden flex-col gap-3 rounded-xl border border-border bg-surface/50 p-4 lg:flex">
        <FilterPanel current={current} />
      </div>
    </>
  );
}

/**
 * 五个胶囊组 + 「评分」排序的口径说明。手机折叠面板与桌面常开面板共用这一份——
 * 两处各写一遍迟早会长歪。
 */
function FilterPanel({ current }: { current: BrowseParams }) {
  return (
    <>
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
    </>
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

/** 在选项表里找展示名（找不到就原样返回——与全站"不硬翻"的兜底一致） */
function labelFor(options: BrowseOption[], value: string): string | null {
  if (!value) {
    return null;
  }
  return options.find((option) => option.value === value)?.label ?? value;
}
