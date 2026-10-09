"use client";

import { useEffect, useRef, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { CircleUser, Heart, LogOut, User } from "lucide-react";

import { useSignOut } from "@/components/useSignOut";
import { createClient } from "@/lib/supabase/client";

/**
 * 顶栏最右边那块账号入口（2026-10-09 从「一个链接」扩充成「头像 + 下拉菜单」）。
 *
 *   · 没登录 → 还是原来的「登录」链接（点进 /login）。
 *   · 登录了 → 头像 + 昵称；点开是下拉：个人中心 / 我的追番 / 退出登录。
 *
 * ─────────────────────────────────────────────────────────────
 * ⚠️ **它必须是客户端组件，这是硬性约束，不是随手写的。**
 *
 * Next 的规矩：**在 layout 或页面里读 cookie，会把该路由变成动态渲染。**
 * 顶栏挂在 layout 上，一旦它去服务端读 cookie（也就是读登录状态），
 * **全站每一个页面**都会跟着变成「每次访问现场生成」——
 * 首页 / 搜索 / 我的三个页面会失去静态预渲染，而上一轮做的 PWA 离线缓存
 * 靠的正是「这些页面是构建时生成好的」。
 *
 * 所以分工是：
 *   - 顶栏（全站可见）→ 在**浏览器**里读登录状态，页面保持静态
 *   - /login、/account → 在**服务端**读用户，用来证明「服务端能读到当前用户」
 * 两边各司其职，互不冲突。
 * ─────────────────────────────────────────────────────────────
 *
 * ⚠️ 下拉菜单用的是「披露式」（disclosure）而不是 ARIA menu 角色：
 * 按钮 aria-expanded 控制一块普通内容区的显示，里面就是普通链接。
 * 这个做法不需要手写方向键导航（menu 角色必须补齐一套键盘交互，
 * 做一半比不做更难用）；Tab 键天然可用、Esc 关闭、点外面关闭。
 *
 * ⚠️ 窄屏（小于 sm）触发按钮只显示头像：320px 宽的屏幕上，
 * 「番鉴」+ 六个导航入口 + 头像文字会溢出。验收时要在 320px 下实测一遍。
 *
 * ⚠️ 昵称/头像从 user_metadata 里读（个人中心里改的）。改完不用刷新页面：
 * 订阅的 onAuthStateChange 会收到 USER_UPDATED 事件、这里跟着更新。
 */

/** 从 Supabase 的 user 对象里抽出我们要显示的三样东西 */
function toAccount(
  user: { email?: string | null; user_metadata?: Record<string, unknown> } | null | undefined,
): { name: string; email: string | null; avatarUrl: string | null } | null {
  if (!user) {
    return null;
  }
  const meta = user.user_metadata ?? {};
  const displayName =
    typeof meta.display_name === "string" && meta.display_name.trim()
      ? meta.display_name.trim()
      : null;
  const avatarUrl =
    typeof meta.avatar_url === "string" && meta.avatar_url ? meta.avatar_url : null;
  const email = user.email ?? null;

  return {
    // 没起过昵称就用邮箱 @ 前面那截——和没头像时用首字母一样，总有东西可显示
    name: displayName ?? email?.split("@")[0] ?? "番友",
    email,
    avatarUrl,
  };
}

/** 头像圆片：有图用图，没图用「名字第一个字 + 品牌渐变底」。两处共用（触发按钮 / 菜单头部） */
function AvatarBubble({
  name,
  avatarUrl,
  size,
}: {
  name: string;
  avatarUrl: string | null;
  size: "sm" | "md";
}) {
  const sizeClass = size === "sm" ? "size-7 text-xs" : "size-9 text-sm";

  if (avatarUrl) {
    return (
      <Image
        src={avatarUrl}
        alt=""
        width={size === "sm" ? 28 : 36}
        height={size === "sm" ? 28 : 36}
        className={`${sizeClass} shrink-0 rounded-full object-cover ring-1 ring-border`}
      />
    );
  }

  return (
    <span
      aria-hidden
      className={`${sizeClass} flex shrink-0 items-center justify-center rounded-full bg-linear-to-br from-brand-strong to-primary font-semibold text-primary-foreground`}
    >
      {/* Array.from 按码点取首字，中文/emoji 不会被劈成半个 */}
      {Array.from(name)[0] ?? "番"}
    </span>
  );
}

export function AuthStatus() {
  const [account, setAccount] = useState<ReturnType<typeof toAccount>>(null);
  const [open, setOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const { signOut, isPending: isSigningOut } = useSignOut();

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
        setAccount(toAccount(data.user));
      }
    });

    // 再订阅后续变化。
    // ⚠️ 为什么不能只读一次：登录/退出/改昵称头像都发生在别的组件里，
    // 这个组件不知道。订阅之后，不管谁改了，顶栏都会立刻跟上
    // （User 对象的 user_metadata 跟着 USER_UPDATED 事件一起到）。
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      if (isMounted) {
        setAccount(toAccount(session?.user));
      }
    });

    return () => {
      isMounted = false;
      subscription.unsubscribe();
    };
  }, []);

  // 打开期间：点菜单外面 / 按 Esc 就关（Esc 还要把焦点还给触发按钮）
  useEffect(() => {
    if (!open) {
      return;
    }
    function handlePointerDown(event: PointerEvent) {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    }
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setOpen(false);
        triggerRef.current?.focus();
      }
    }
    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [open]);

  // 没登录：还是原来的「登录」链接
  if (!account) {
    return (
      <Link
        href="/login"
        className="flex shrink-0 items-center gap-1.5 rounded-md px-2 py-1.5 text-sm text-muted-foreground transition-colors duration-150 hover:bg-surface hover:text-foreground"
      >
        <User aria-hidden className="size-4 shrink-0" />
        <span className="hidden sm:inline">登录</span>
        {/* 窄屏：图标本身不带文字，给读屏软件补一个名字 */}
        <span className="sr-only sm:hidden">登录</span>
      </Link>
    );
  }

  const menuItemClass =
    "flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm text-foreground/90 transition-colors duration-150 hover:bg-brand/10 hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none";

  return (
    <div ref={menuRef} className="relative shrink-0">
      <button
        ref={triggerRef}
        type="button"
        aria-haspopup="true"
        aria-expanded={open}
        aria-controls="account-menu"
        onClick={() => setOpen((value) => !value)}
        className="flex cursor-pointer items-center gap-1.5 rounded-md px-1.5 py-1 transition-colors duration-150 hover:bg-surface focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
      >
        <AvatarBubble name={account.name} avatarUrl={account.avatarUrl} size="sm" />
        {/* 昵称可能很长，truncate 截断，绝不能让它把顶栏撑破 */}
        <span className="hidden max-w-[7rem] truncate text-sm text-muted-foreground sm:inline">
          {account.name}
        </span>
      </button>

      {open ? (
        <div
          id="account-menu"
          className="absolute right-0 z-50 mt-2 w-56 rounded-xl border border-border bg-surface-elevated p-1.5 shadow-2xl shadow-black/50"
        >
          {/* 菜单头部：谁登录了 —— 头像 + 昵称 + 邮箱 */}
          <div className="flex items-center gap-2.5 px-3 py-2.5">
            <AvatarBubble name={account.name} avatarUrl={account.avatarUrl} size="md" />
            <div className="min-w-0">
              <p className="truncate text-sm font-medium">{account.name}</p>
              {account.email ? (
                <p className="truncate text-xs text-muted-foreground">{account.email}</p>
              ) : null}
            </div>
          </div>

          <div className="my-1 border-t border-border" />

          <Link href="/account" role="menuitem" className={menuItemClass} onClick={() => setOpen(false)}>
            <CircleUser aria-hidden className="size-4 shrink-0" />
            个人中心
          </Link>
          <Link href="/my" role="menuitem" className={menuItemClass} onClick={() => setOpen(false)}>
            <Heart aria-hidden className="size-4 shrink-0" />
            我的追番
          </Link>

          <div className="my-1 border-t border-border" />

          <button
            type="button"
            role="menuitem"
            disabled={isSigningOut}
            onClick={() => {
              setOpen(false);
              void signOut();
            }}
            className="flex w-full cursor-pointer items-center gap-2.5 rounded-lg px-3 py-2 text-sm text-destructive transition-colors duration-150 hover:bg-destructive/10 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-50"
          >
            <LogOut aria-hidden className="size-4 shrink-0" />
            {isSigningOut ? "退出中…" : "退出登录"}
          </button>
        </div>
      ) : null}
    </div>
  );
}
