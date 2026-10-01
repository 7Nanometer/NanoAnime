"use client";

import { useCollection } from "@/components/useCollection";
import { isFollowing } from "@/lib/collection";
import { cn } from "@/lib/utils";
import type { Anime } from "@/types/anime";

/**
 * 详情页的「追番」按钮。点一下加入、再点一下取消，**不用刷新页面**。
 *
 * 为什么必须单独做成客户端组件：详情页是服务端组件，那边加不了 `onClick`。
 * 详情页只负责把番剧数据（`anime`）递进来，剩下的读写走 lib/collection.ts。
 *
 * 说明：服务端渲染时还不知道用户追没追（记录在浏览器本地），
 * 所以首屏先按「没追」画，浏览器接管后立刻纠正——这也是 useSyncExternalStore
 * 配 getServerSnapshot 的标准行为，不会报「服务端和客户端画得不一样」。
 */
export function FollowButton({ anime }: { anime: Anime }) {
  const { entries, add, remove } = useCollection();
  const following = isFollowing(entries, anime.id);

  return (
    <button
      type="button"
      onClick={() => (following ? remove(anime.id) : add(anime))}
      aria-pressed={following}
      className={cn(
        "rounded-md px-4 py-2 text-sm font-medium transition-colors",
        following
          ? // 已追：弱化成描边按钮，避免误点；文字写清楚再点会取消
            "border border-border text-muted-foreground hover:bg-muted"
          : "bg-primary text-primary-foreground hover:opacity-90",
      )}
    >
      {following ? "✓ 已追番 · 点此取消" : "+ 追番"}
    </button>
  );
}
