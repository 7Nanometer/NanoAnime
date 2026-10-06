import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "没有这个页面 · NanoAnime番鉴",
};

/**
 * 全站 404 页。
 *
 * 为什么需要它：Next 默认的 404 是**一整个英文页**（`404 | This page could not be found.`），
 * 对一个全中文的产品不合适——M1-1 时用户就明确说过「Next 默认的英文 500 页不能用」，
 * 默认英文 404 是同一类问题。
 *
 * 什么时候会走到这儿：详情页碰上一个 AniList 上没有的 id（`notFound()`），
 * 或者手敲了一个不存在的地址。
 */
export default function NotFound() {
  return (
    <main className="mx-auto flex max-w-lg flex-col items-center gap-4 px-4 py-24 text-center">
      {/*
        404 用大号数字当图形元素。
        加它的理由：这个页面上没有任何内容，如果只有两行字加两个按钮，
        整页会显得像"加载失败"。一个淡化的大数字立刻让它变成"一个设计过的页面"。
        aria-hidden ——数字是装饰，读屏软件念"四零四"只会添乱，下面那句标题已经说清楚了。
      */}
      <span
        aria-hidden
        className="text-7xl leading-none font-bold tracking-tighter text-transparent [-webkit-text-stroke:1.5px_var(--border-strong)]"
      >
        404
      </span>

      <h1 className="text-xl font-semibold">没有这个页面</h1>

      <p className="text-sm leading-relaxed text-muted-foreground">
        你要找的页面不存在。可能是地址打错了，
        也可能这部作品 AniList 上没有收录。
      </p>

      <div className="mt-2 flex flex-wrap items-center justify-center gap-3">
        <Link
          href="/"
          className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-all duration-150 hover:brightness-110 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none active:scale-[0.98]"
        >
          看本季新番
        </Link>
        <Link
          href="/calendar"
          className="rounded-lg border border-border px-4 py-2 text-sm text-muted-foreground transition-colors duration-150 hover:border-border-strong hover:bg-surface hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
        >
          看本周日历
        </Link>
        <Link
          href="/search"
          className="rounded-lg border border-border px-4 py-2 text-sm text-muted-foreground transition-colors duration-150 hover:border-border-strong hover:bg-surface hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
        >
          去搜索
        </Link>
      </div>
    </main>
  );
}
