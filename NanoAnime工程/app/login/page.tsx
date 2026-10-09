import type { Metadata } from "next";
import Link from "next/link";

import { AuthForm } from "@/components/AuthForm";
import { SignOutButton } from "@/components/SignOutButton";
import { getCurrentUser } from "@/lib/supabase/server";

export const metadata: Metadata = {
  title: "账号 · NanoAnime番鉴",
};

/**
 * 账号页。注册、登录、退出都在这里。
 *
 * ─────────────────────────────────────────────────────────────
 * ⚠️ 这个页面是**服务端组件**，而且它 `await` 读了当前用户 —— 这正是本轮
 * 要证明的那件事：「登录后服务端能读到当前用户」。
 *
 * 它是**动态渲染**的（每次访问现场生成），这跟首页那几个页面不一样 ——
 * 首页/搜索/我的仍然是构建时生成好的静态页面。
 *
 * 为什么不能反过来、让每个页面都在服务端读用户：
 * Next 的规矩是「在 layout 或页面里读 cookie，会把该路由变成动态渲染」。
 * 顶栏挂在 layout 上，一旦它去读 cookie，**全站每一个页面**都会跟着变成动态的，
 * 首页/搜索/我的三个页面会失去静态预渲染 —— 而上一轮刚做好的 PWA 离线缓存
 * 靠的就是「这些页面是构建时生成好的」。所以顶栏的登录状态留在浏览器里读，
 * 只有这个页面在服务端读。两边各司其职。
 * ─────────────────────────────────────────────────────────────
 */
export default async function LoginPage() {
  const user = await getCurrentUser();

  return (
    <main className="mx-auto max-w-md px-4 py-12 sm:py-16">
      <header className="mb-7 text-center">
        {/* 品牌标记点，和顶栏那个同源——让"这是一张表单"和"这是站内"连起来 */}
        <span
          aria-hidden
          className="mx-auto mb-4 flex size-11 items-center justify-center rounded-2xl bg-linear-to-br from-brand-strong to-primary shadow-[0_0_24px_var(--brand-soft)]"
        >
          <svg
            viewBox="0 0 24 24"
            className="size-5 text-primary-foreground"
            fill="none"
            stroke="currentColor"
            strokeWidth={2}
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
            <circle cx="12" cy="7" r="4" />
          </svg>
        </span>
        <h1 className="text-2xl font-bold tracking-tight">账号</h1>
      </header>

      {user ? (
        // 这一行是「服务端确实读到了当前用户」的现场证据：
        // 这段 HTML 是服务器生成的，浏览器拿到的就是这串字。
        <div className="rounded-2xl border border-border bg-surface/60 p-6">
          <p className="text-xs text-muted-foreground">已登录</p>
          <p className="mt-1 text-base font-medium break-all">{user.email}</p>

          <div className="mt-6 flex flex-wrap items-center gap-3">
            {/* 顶栏头像菜单也能进，这里给一条明路——从账号页登完的人顺着往下走 */}
            <Link
              href="/account"
              className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-all duration-150 hover:brightness-110 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
            >
              进入个人中心
            </Link>
            <SignOutButton />
          </div>
        </div>
      ) : (
        <div>
          <p className="mb-6 text-sm leading-relaxed text-muted-foreground">
            登录后，追番记录就能跟着账号走，换手机、换浏览器都不会丢。
            <br />
            （已开通：未登录时记录只在本机，登录后自动同步。本地已有的会合并上去，不会覆盖。）
          </p>
          <AuthForm />
        </div>
      )}

      <p className="mt-8 border-t border-border pt-5 text-xs leading-relaxed text-muted-foreground">
        我们只保存邮箱和密码，不索取任何其他信息。密码由 Supabase 加密保管，
        本站看不到你的密码原文。
      </p>
    </main>
  );
}
