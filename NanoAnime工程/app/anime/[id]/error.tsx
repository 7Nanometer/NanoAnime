"use client"; // 错误边界必须是客户端组件，不能是服务端组件

import Link from "next/link";
import { useEffect } from "react";

/**
 * 详情页取数失败时的兜底界面。
 *
 * 为什么需要它：详情页的数据是在服务端从 AniList 取的，而国内访问海外数据源
 * 时不时会超时（实测过 `Connect Timeout Error ... timeout: 10000ms`）。
 * 没有这个文件的话，用户看到的是 Next 默认的英文 500 页——对一个中文产品不合适。
 *
 * Next.js 会把这个文件包成一个「错误边界」（React Error Boundary）：
 * 它包着同目录的 page.tsx，页面渲染时抛的任何异常都会被它接住，显示下面的界面，
 * 而不是整站崩掉。
 */
export default function AnimeDetailError({
  error,
  retry,
}: {
  error: Error & { digest?: string };
  // retry() 会重新取数并重渲染整个页面。Next 16 推荐用它（而不是 reset）——
  // 因为这里的失败本来就是"再试一次可能就好"的网络问题
  retry: () => void;
}) {
  useEffect(() => {
    // 服务端组件抛错时，浏览器这边只会拿到一句笼统的话，
    // 真正的原因要拿 digest 去服务端日志里对。这里先打一份方便排查
    console.error("详情页取数失败：", error);
  }, [error]);

  return (
    <main className="mx-auto flex max-w-lg flex-col items-center gap-4 px-4 py-24 text-center">
      {/*
        失败状态给一个明确的图形标记，而不是一行黑字。
        深色界面上"一屏黑 + 几行灰字"和空白页几乎分不出，用户第一反应是"是不是我网断了"。
        一个警示图标能立刻把"这是一次可恢复的错误"传达出去（图标是装饰，aria-hidden）。
      */}
      <span
        aria-hidden
        className="flex size-14 items-center justify-center rounded-2xl border border-destructive/25 bg-destructive/10"
      >
        <svg
          viewBox="0 0 24 24"
          className="size-6 text-destructive"
          fill="none"
          stroke="currentColor"
          strokeWidth={1.75}
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
          <path d="M12 9v4M12 17h.01" />
        </svg>
      </span>

      <h1 className="text-xl font-semibold">这部作品没能打开</h1>

      <p className="text-sm leading-relaxed text-muted-foreground">
        没能从 AniList 取到数据。多半是网络超时——国内访问海外数据源偶尔会这样，
        等一会儿重试通常就好了。
      </p>

      <div className="mt-2 flex flex-wrap items-center justify-center gap-3">
        <button
          type="button"
          onClick={() => retry()}
          className="cursor-pointer rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-all duration-150 hover:brightness-110 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none active:scale-[0.98]"
        >
          重试
        </button>
        <Link
          href="/"
          className="rounded-lg border border-border px-4 py-2 text-sm text-muted-foreground transition-colors duration-150 hover:border-border-strong hover:bg-surface hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
        >
          返回本季新番
        </Link>
      </div>

      {/* 报错编号：报问题时把这串给出来，就能在服务端日志里定位到具体是哪个错 */}
      {error.digest ? (
        <p className="mt-4 text-xs text-muted-soft">错误编号 {error.digest}</p>
      ) : null}
    </main>
  );
}
