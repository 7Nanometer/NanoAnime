"use client"; // 错误边界必须是客户端组件，不能是服务端组件

import Link from "next/link";
import { useEffect } from "react";

/**
 * 人物页取数失败时的兜底界面。照 `/anime/[id]/error.tsx` 同一套做法。
 *
 * 触发场景和详情页一样：国内访问 AniList 时不时会超时；限流 429 也走这里。
 * 没有这个文件的话，用户看到的是 Next 默认的英文 500 页。
 */
export default function PersonError({
  error,
  retry,
}: {
  error: Error & { digest?: string };
  // Next 16 推荐用 retry()（不是 reset）——这里的失败本来就是"再试一次可能就好"的网络问题
  retry: () => void;
}) {
  useEffect(() => {
    console.error("人物页取数失败：", error);
  }, [error]);

  return (
    <main className="mx-auto flex max-w-lg flex-col items-center gap-4 px-4 py-24 text-center">
      {/* 失败状态给一个明确的图形标记——理由同 /anime/[id]/error.tsx 里的注释 */}
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

      <h1 className="text-xl font-semibold">这个人物没能打开</h1>

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

      {error.digest ? (
        <p className="mt-4 text-xs text-muted-soft">错误编号 {error.digest}</p>
      ) : null}
    </main>
  );
}
