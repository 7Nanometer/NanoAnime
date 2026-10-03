"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { User } from "lucide-react";

import { createClient } from "@/lib/supabase/client";

/**
 * 顶栏最右边那块：没登录显示「登录」，登录了显示邮箱。
 *
 * ─────────────────────────────────────────────────────────────
 * ⚠️ **它必须是客户端组件，这是硬性约束，不是随手写的。**
 *
 * Next 的规矩：**在 layout 或页面里读 cookie，会把该路由变成动态渲染。**
 * 顶栏挂在 layout 上，一旦它去服务端读 cookie（也就是读登录状态），
 * **全站每一个页面**都会跟着变成「每次访问现场生成」——
 * 首页 / 日历 / 我的三个页面会失去静态预渲染，而上一轮做的 PWA 离线缓存
 * 靠的正是「这三个页面是构建时生成好的」。
 *
 * 所以分工是：
 *   - 顶栏（全站可见）→ 在**浏览器**里读登录状态，页面保持静态
 *   - /login 页       → 在**服务端**读用户，用来证明「服务端能读到当前用户」
 * 两边各司其职，互不冲突。
 * ─────────────────────────────────────────────────────────────
 *
 * ⚠️ 窄屏（小于 sm）只显示一个图标：算过了，320px 宽的屏幕上，
 * 「番鉴」+ 四个两字入口 + 一个文字入口会**溢出**。宽屏才显示文字。
 * 验收时要在 320px 下实测一遍。
 */
export function AuthStatus() {
  const [email, setEmail] = useState<string | null>(null);

  useEffect(() => {
    let isMounted = true;

    let supabase;
    try {
      supabase = createClient();
    } catch {
      // 环境变量没配 → 登录功能没开。顶栏照常显示，不要因此白屏
      return;
    }

    // 先读一次当前状态（页面刚打开时）
    supabase.auth.getUser().then(({ data }) => {
      if (isMounted) {
        setEmail(data.user?.email ?? null);
      }
    });

    // 再订阅后续变化。
    // ⚠️ 为什么不能只读一次：登录/退出发生在别的组件里（AuthForm、SignOutButton），
    // 这个组件不知道。订阅之后，不管谁改了登录状态，顶栏都会立刻跟上。
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      if (isMounted) {
        setEmail(session?.user.email ?? null);
      }
    });

    return () => {
      isMounted = false;
      subscription.unsubscribe();
    };
  }, []);

  return (
    <Link
      href="/login"
      title={email ?? "登录"}
      className="flex max-w-[9rem] shrink-0 items-center gap-1.5 rounded-md px-2 py-1.5 text-sm text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
    >
      <User aria-hidden className="size-4 shrink-0" />
      {/* 邮箱可能很长，用 truncate 截断，绝不能让它把顶栏撑破 */}
      <span className="hidden truncate sm:inline">{email ?? "登录"}</span>
      {/* 窄屏：图标本身不带文字，给读屏软件补一个名字 */}
      <span className="sr-only sm:hidden">{email ?? "登录"}</span>
    </Link>
  );
}
