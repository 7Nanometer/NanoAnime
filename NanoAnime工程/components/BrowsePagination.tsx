import Link from "next/link";

import { BROWSE_MAX_PAGE } from "@/lib/anilist";
import { buildBrowseHref, type BrowseParams } from "@/lib/browse";
import { cn } from "@/lib/utils";

/**
 * 「全部番剧」的分页条（服务端组件，2026-10-09；同日"全年代扩容"改为双模式）。
 *
 * 数据源的 total / lastPage 会撒谎（见 app/browse/page.tsx 头注释），所以分两种模式：
 *   · **已知总数**（年份维度的全库清点）：首尾页 + 当前页 ±2 + 省略号——原样式，
 *     一键可跳第 1 页 / 最后一页；
 *   · **未知总数**（形式/状态/标签组合，没数过）：只给「上一页 / 当前页 / 下一页」——
 *     显示任何页码数字都是编的。"还有没有下一页"看**这一页是不是满的**（满 28 条
 *     就大概率还有）。
 *
 * ⚠️ 无论哪种模式，翻页深度都不越过 BROWSE_MAX_PAGE（数据源硬上限 5000 条，
 * perPage=28 时第 178 页是最后一页）——到头的链接直接不给，用户不会撞到 400。
 *
 * ⚠️ 每个链接都带 #anime-list 锚点：翻页后直接落在列表顶部，而不是回到
 * 页面最上面再让用户滚一遍筛选区。顶栏遮挡由全局的 scrollPaddingTop
 * （app/layout.tsx）统一处理，这里不要再叠 scroll-mt。
 */
export function BrowsePagination({
  current,
  page,
  lastPage,
  hasMore,
  capNote,
}: {
  current: BrowseParams;
  page: number;
  /** 已知的最后一页（来自全库清点）；null = 这个筛选组合没数过 */
  lastPage: number | null;
  /** 当前页是不是满的（28 条）——未知总数时靠它判断还有没有下一页 */
  hasMore: boolean;
  /** 是否显示"数据源单次查询上限"的说明（见文件头注释） */
  capNote: boolean;
}) {
  const hasPrev = page > 1;
  const hasNext = lastPage !== null ? page < lastPage : hasMore && page < BROWSE_MAX_PAGE;

  // 已知总数且只有一页：没有分页可言，不渲染半截工具栏
  if (lastPage !== null && lastPage <= 1) {
    return null;
  }
  // 未知总数：第 1 页且没有下一页（本页不满）时同理不渲染
  if (lastPage === null && !hasPrev && !hasNext) {
    return null;
  }

  const items = lastPage !== null ? pageItems(page, lastPage) : null;

  return (
    <>
      <nav aria-label="分页" className="mt-8 flex flex-wrap items-center justify-center gap-1.5">
        {hasPrev ? (
          <PageLink current={current} page={page - 1} label="‹ 上一页" />
        ) : (
          <span className={DISABLED_CLASS}>‹ 上一页</span>
        )}

        {items ? (
          items.map((item, index) =>
            item === "gap" ? (
              <span key={`gap-${index}`} className="px-1 text-sm text-muted-foreground">
                …
              </span>
            ) : (
              <PageLink
                key={item}
                current={current}
                page={item}
                label={String(item)}
                active={item === page}
              />
            ),
          )
        ) : (
          // 未知总数模式：当前页只做展示、不给链接（点自己没意义）。
          // ⚠️ 基础类（圆角/内边距/字号）要带全——少了它这个 span 会比两侧的
          // 按钮矮一截，分页条看起来是"断的"
          <span
            aria-current="page"
            className={cn("rounded-lg border px-3 py-1.5 text-sm", ACTIVE_CLASS)}
          >
            {page}
          </span>
        )}

        {hasNext ? (
          <PageLink current={current} page={page + 1} label="下一页 ›" />
        ) : (
          <span className={DISABLED_CLASS}>下一页 ›</span>
        )}
      </nav>

      {capNote ? (
        <p className="mt-3 text-center text-xs leading-relaxed text-muted-foreground">
          数据源规定单次查询最多 5000 条：翻页到第 {BROWSE_MAX_PAGE} 页为止。
          想看更全的目录，请用上面的年份或标签把范围缩小。
        </p>
      ) : null}
    </>
  );
}

function PageLink({
  current,
  page,
  label,
  active = false,
}: {
  current: BrowseParams;
  page: number;
  label: string;
  active?: boolean;
}) {
  return (
    <Link
      href={`${buildBrowseHref(current, { page })}#anime-list`}
      aria-current={active ? "page" : undefined}
      className={cn(
        "rounded-lg border px-3 py-1.5 text-sm transition-colors duration-150",
        "focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none",
        active ? ACTIVE_CLASS : INACTIVE_CLASS,
      )}
    >
      {label}
    </Link>
  );
}

/** 当前页（紫底）。链接态与纯展示态共用——两处样式必须是同一对颜色 */
const ACTIVE_CLASS = "border-primary bg-primary font-medium text-primary-foreground";

/** 普通可点的页码 */
const INACTIVE_CLASS =
  "border-border bg-surface text-muted-foreground hover:border-brand/50 hover:text-foreground";

/** 到头了的那一侧：不是链接，画成"按不动"的样子（禁用态不受对比度约束） */
const DISABLED_CLASS =
  "rounded-lg border border-border/50 px-3 py-1.5 text-sm text-muted-foreground/50";

/**
 * 页码序列：首尾页 + 当前页 ±2，编号不连续处插一个 "gap"（渲染成省略号）。
 * 例：当前 5 / 共 120 → [1, gap, 3, 4, 5, 6, 7, gap, 120]
 */
function pageItems(page: number, lastPage: number): (number | "gap")[] {
  const wanted = new Set<number>([1, lastPage]);
  for (let p = page - 2; p <= page + 2; p++) {
    if (p >= 1 && p <= lastPage) {
      wanted.add(p);
    }
  }

  const sorted = [...wanted].sort((a, b) => a - b);
  const items: (number | "gap")[] = [];
  let previous = 0;
  for (const p of sorted) {
    if (p - previous > 1) {
      items.push("gap");
    }
    items.push(p);
    previous = p;
  }
  return items;
}
