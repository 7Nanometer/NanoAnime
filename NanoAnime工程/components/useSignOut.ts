"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

import { createClient } from "@/lib/supabase/client";

/**
 * 退出登录（顶栏下拉菜单 / 个人中心 / 账号页三处共用，2026-10-09 抽出来）。
 *
 * 抽成钩子的原因：三处都要同一套「置 pending → signOut → refresh」流程，
 * 各写一份迟早会漂移（有的 refresh 有的不 refresh）。
 *
 * `signOut()` 会清掉 cookie 里的登录凭证；`router.refresh()` 让服务端组件
 * 重新渲染。**顶栏自己会跟上**——它的 AuthStatus 一直订阅着登录状态变化，
 * 不需要这里去通知它。
 */
export function useSignOut() {
  const router = useRouter();
  const [isPending, setIsPending] = useState(false);

  async function signOut() {
    if (isPending) {
      return;
    }
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

  return { signOut, isPending };
}
