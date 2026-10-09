"use client";

import { useSignOut } from "@/components/useSignOut";

/**
 * 退出登录按钮（账号页 / 个人中心用）。
 * 流程细节都收在 useSignOut 里（2026-10-09 抽出）；这里只管长什么样。
 */
export function SignOutButton() {
  const { signOut, isPending } = useSignOut();

  return (
    <button
      type="button"
      onClick={signOut}
      disabled={isPending}
      className="cursor-pointer rounded-lg border border-border px-4 py-2 text-sm transition-colors duration-150 hover:border-destructive/40 hover:bg-destructive/10 hover:text-destructive focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-50"
    >
      {isPending ? "退出中…" : "退出登录"}
    </button>
  );
}
