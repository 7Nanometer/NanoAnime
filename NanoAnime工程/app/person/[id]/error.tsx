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
      <h1 className="text-xl font-semibold">这个人物没能打开</h1>

      <p className="text-sm leading-relaxed text-muted-foreground">
        没能从 AniList 取到数据。多半是网络超时——国内访问海外数据源偶尔会这样，
        等一会儿重试通常就好了。
      </p>

      <div className="mt-2 flex flex-wrap items-center justify-center gap-3">
        <button
          type="button"
          onClick={() => retry()}
          className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-opacity hover:opacity-90"
        >
          重试
        </button>
        <Link
          href="/"
          className="rounded-md border border-border px-4 py-2 text-sm text-muted-foreground transition-colors hover:bg-muted"
        >
          返回本季新番
        </Link>
      </div>

      {error.digest ? (
        <p className="mt-4 text-xs text-muted-foreground/60">错误编号 {error.digest}</p>
      ) : null}
    </main>
  );
}
