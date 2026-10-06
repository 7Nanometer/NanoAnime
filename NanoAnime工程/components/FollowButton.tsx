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
 *
 * ─────────────────────────────────────────────────────────────
 * 视觉上这是全站**唯一一个主动作按钮**（primary action），所以：
 * · 未追：实心品牌紫 + 一层同色柔光（box-shadow），让它在深底上"发光"，一眼就是主按钮
 * · 已追：退成描边 + 一个勾选图标。**必须明显更弱**，不然用户分不清当前是哪个状态，
 *   也容易误点第二次（第二次点下去是取消追番，是有代价的操作）
 * · 加了 `active:scale-[0.97]` —— 按下去的物理反馈。深色界面里按钮没有按压缩放时，
 *   点击的"确定性"会明显变差
 * ─────────────────────────────────────────────────────────────
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
        "inline-flex cursor-pointer items-center gap-1.5 rounded-lg px-4 py-2 text-sm font-medium",
        "transition-all duration-150 ease-[var(--ease-out-soft)] active:scale-[0.97]",
        "focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background focus-visible:outline-none",
        following
          ? "border border-border text-muted-foreground hover:border-border-strong hover:bg-surface hover:text-foreground"
          : "bg-primary text-primary-foreground shadow-[0_0_20px_var(--brand-soft)] hover:brightness-110",
      )}
    >
      {/*
        图标用内联 SVG 而不是 ✓ 字符。
        理由：字符在不同平台的字重、基线、大小都不一样（Windows 上那个 ✓ 会偏小偏上），
        而 SVG 是确定的。
      */}
      <svg viewBox="0 0 24 24" aria-hidden className="size-4" fill="none" strokeWidth={2.5}>
        <path
          d={following ? "M20 6L9 17l-5-5" : "M12 5v14M5 12h14"}
          stroke="currentColor"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
      {following ? "已追番 · 点此取消" : "追番"}
    </button>
  );
}
