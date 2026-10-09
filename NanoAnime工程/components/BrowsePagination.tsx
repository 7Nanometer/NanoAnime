import Link from "next/link";

import { buildBrowseHref, type BrowseParams } from "@/lib/browse";
import { cn } from "@/lib/utils";

/**
 * 「全部番剧」的分页条（服务端组件，2026-10-09）。
 *
 * 页码策略：首尾页 + 当前页 ±2，中间断开的地方放省略号——
 * 不会渲染出几百个页码按钮，也永远能一键跳回第 1 页 / 最后一页。
 *
 * ⚠️ 每个链接都带 #anime-list 锚点：翻页后直接落在列表顶部，而不是回到
 * 页面最上面再让用户滚一遍筛选区。顶栏遮挡由全局的 scrollPaddingTop
 * （app/layout.tsx）统一处理，这里不要再叠 scroll-mt。
 */
export function BrowsePagination({
  current,
  page,
  lastPage,
}: {
  current: BrowseParams;
  page: number;
  lastPage: number;
}) {
  // 只有一页就没有分页可言——不渲染半截工具栏
  if (lastPage <= 1) {
    return null;
  }

  const items = pageItems(page, lastPage);

  return (
    <nav aria-label="分页" className="mt-8 flex flex-wrap items-center justify-center gap-1.5">
      {page > 1 ? (
        <PageLink current={current} page={page - 1} label="‹ 上一页" />
      ) : (
        <span className={DISABLED_CLASS}>‹ 上一页</span>
      )}

      {items.map((item, index) =>
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
      )}

      {page < lastPage ? (
        <PageLink current={current} page={page + 1} label="下一页 ›" />
      ) : (
        <span className={DISABLED_CLASS}>下一页 ›</span>
      )}
    </nav>
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
        active
          ? "border-primary bg-primary font-medium text-primary-foreground"
          : "border-border bg-surface text-muted-foreground hover:border-brand/50 hover:text-foreground",
      )}
    >
      {label}
    </Link>
  );
}

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
