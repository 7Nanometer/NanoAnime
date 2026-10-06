"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

import { createClient } from "@/lib/supabase/client";

/**
 * 退出登录。
 *
 * `signOut()` 会把 cookie 里的登录凭证清掉，然后 `router.refresh()` 让
 * 服务端组件重新渲染 —— 页面随即变回未登录的样子。
 *
 * 放在服务端组件（/login 页）里当子组件用：服务端组件不能挂 onClick，
 * 所以「能点」的那部分必须是客户端组件。
 */
export function SignOutButton() {
  const router = useRouter();
  const [isPending, setIsPending] = useState(false);

  async function handleSignOut() {
    setIsPending(true);
    try {
      const supabase = createClient();
      await supabase.auth.signOut();
      router.refresh();
    } catch (error) {
      console.error("退出失败：", error);
    } finally {
      setIsPending(false);
    }
  }

  return (
    <button
      type="button"
      onClick={handleSignOut}
      disabled={isPending}
      className="cursor-pointer rounded-lg border border-border px-4 py-2 text-sm transition-colors duration-150 hover:border-destructive/40 hover:bg-destructive/10 hover:text-destructive focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-50"
    >
      {isPending ? "退出中…" : "退出登录"}
    </button>
  );
}
