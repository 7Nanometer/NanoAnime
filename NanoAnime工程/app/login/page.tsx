import type { Metadata } from "next";

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
 * 首页/日历/我的仍然是构建时生成好的静态页面。
 *
 * 为什么不能反过来、让每个页面都在服务端读用户：
 * Next 的规矩是「在 layout 或页面里读 cookie，会把该路由变成动态渲染」。
 * 顶栏挂在 layout 上，一旦它去读 cookie，**全站每一个页面**都会跟着变成动态的，
 * 首页/日历/我的三个页面会失去静态预渲染 —— 而上一轮刚做好的 PWA 离线缓存
 * 靠的就是「这三个页面是构建时生成好的」。所以顶栏的登录状态留在浏览器里读，
 * 只有这个页面在服务端读。两边各司其职。
 * ─────────────────────────────────────────────────────────────
 */
export default async function LoginPage() {
  const user = await getCurrentUser();

  return (
    <main className="mx-auto max-w-md px-4 py-12">
      <h1 className="text-2xl font-semibold">账号</h1>

      {user ? (
        // 这一行是「服务端确实读到了当前用户」的现场证据：
        // 这段 HTML 是服务器生成的，浏览器拿到的就是这串字。
        <div className="mt-6 rounded-lg border border-border p-6">
          <p className="text-lg font-medium break-all">已登录：{user.email}</p>

          <div className="mt-6">
            <SignOutButton />
          </div>
        </div>
      ) : (
        <div className="mt-6">
          <p className="mb-6 text-sm leading-relaxed text-muted-foreground">
            登录后，追番记录就能跟着账号走，换手机、换浏览器都不会丢。
            <br />
            （云端同步还在做，这一步先把账号打通。）
          </p>
          <AuthForm />
        </div>
      )}

      <p className="mt-8 text-xs leading-relaxed text-muted-foreground">
        我们只保存邮箱和密码，不索取任何其他信息。密码由 Supabase 加密保管，
        本站看不到你的密码原文。
      </p>
    </main>
  );
}
