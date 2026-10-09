import type { Metadata } from "next";
import Link from "next/link";

import { AccountCenter } from "@/components/AccountCenter";
import { getCurrentUser } from "@/lib/supabase/server";

export const metadata: Metadata = {
  title: "个人中心 · NanoAnime番鉴",
};

/**
 * 个人中心（2026-10-09 加）。页面结构：服务端外壳 + AccountCenter（客户端）。
 *
 * ⚠️ 服务端外壳的取舍与 /login 同源（见那个文件的头注释）：它 `await` 读用户，
 * 所以这个路由是**动态渲染**的——这是刻意的，全站只有 /login 和 /account
 * 两个页面在服务端读登录状态，其余页面（首页/搜索/我的）保持静态预渲染，
 * 那正是 PWA 离线缓存依赖的前提。
 *
 * ⚠️ 未登录**不做跳转**（宪法第 11 条：登录不是使用的前置条件）——
 * 显示一张说明卡 + 去登录的入口。硬跳转还会在"登录页自身也读用户"的
 * 结构下制造往返循环的风险。
 */
export default async function AccountPage() {
  const user = await getCurrentUser();

  if (!user) {
    return (
      <main className="mx-auto max-w-md px-4 py-12 sm:py-16">
        <div className="rounded-2xl border border-border bg-surface/60 p-6 text-center">
          <h1 className="text-xl font-bold tracking-tight">个人中心</h1>
          <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
            登录后，这里会显示你的头像和昵称，也可以修改密码。
            <br />
            追番记录会跟着账号走，换设备不丢。
          </p>
          <Link
            href="/login"
            className="mt-6 inline-block rounded-lg bg-primary px-5 py-2.5 text-sm font-medium text-primary-foreground transition-all duration-150 hover:brightness-110 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
          >
            去登录
          </Link>
        </div>
      </main>
    );
  }

  const meta = (user.user_metadata ?? {}) as { display_name?: unknown; avatar_url?: unknown };
  const displayName =
    typeof meta.display_name === "string" && meta.display_name.trim()
      ? meta.display_name.trim()
      : null;
  const avatarUrl = typeof meta.avatar_url === "string" && meta.avatar_url ? meta.avatar_url : null;

  return (
    <AccountCenter
      userId={user.id}
      email={user.email ?? ""}
      initialName={displayName ?? user.email?.split("@")[0] ?? "番友"}
      initialAvatarUrl={avatarUrl}
      createdAt={user.created_at ?? null}
    />
  );
}
