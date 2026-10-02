"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { cn } from "@/lib/utils";

/**
 * 顶栏的入口。以后加页面只在这里加一行，不用再动布局。
 * （这个文件之前的老做法是往首页标题旁边堆链接，堆到第三个就挤了。）
 */
const NAV_ITEMS = [
  { href: "/", label: "首页" },
  { href: "/calendar", label: "日历" },
  { href: "/search", label: "搜索" },
  { href: "/my", label: "我的" },
] as const;

/**
 * 判断某个入口是不是「当前所在的页面」。
 *
 * ⚠️ 首页必须**精确匹配**：如果也用前缀匹配，那任何页面都会点亮「首页」
 * （所有路径都以 "/" 开头），高亮就废了。
 * 其余入口用前缀匹配，将来拆出 `/calendar/xxx` 这种子路径时也算在这一栏里。
 */
function isActive(pathname: string, href: string): boolean {
  if (href === "/") {
    return pathname === "/";
  }
  return pathname === href || pathname.startsWith(`${href}/`);
}

/**
 * 全站顶栏导航。
 *
 * 为什么是客户端组件：高亮当前页要用 `usePathname()`，那是客户端钩子。
 * 客户端组件同样会被服务端渲染成 HTML，所以首屏不会因此变慢或闪一下。
 *
 * 为什么吸顶：日历页一周 82 集、很长，翻到底部还想换页时不用先滚回顶部。
 * 这是全站第一处 z-index——顶栏必须盖在页面内容之上，否则会被内容压住。
 *
 * ⚠️ 窄屏（小于 sm 断点）时站名只显示「番鉴」两个字：
 * 全名「NanoAnime番鉴」在 320px 的小屏上会把四个入口一起挤出屏幕。
 */
export function SiteHeader() {
  const pathname = usePathname();

  return (
    <header className="sticky top-0 z-50 border-b border-border bg-background">
      <div className="mx-auto flex max-w-7xl items-center gap-4 px-4 py-2.5">
        <Link
          href="/"
          className="shrink-0 rounded outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          {/* 两个 span 切换：宽屏显示全名，窄屏只留两个字 */}
          <span className="hidden text-base font-semibold sm:inline">NanoAnime番鉴</span>
          <span className="text-base font-semibold sm:hidden">番鉴</span>
        </Link>

        <nav aria-label="主导航" className="ml-auto">
          <ul className="flex items-center gap-1">
            {NAV_ITEMS.map((item) => {
              const active = isActive(pathname, item.href);

              return (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    // 告诉读屏软件「这就是当前所在的那一页」。全站第一次用，顺手立个规矩
                    aria-current={active ? "page" : undefined}
                    className={cn(
                      "block rounded-md px-2.5 py-1.5 text-sm transition-colors sm:px-3",
                      active
                        ? "bg-muted font-medium text-foreground"
                        : "text-muted-foreground hover:bg-muted hover:text-foreground",
                    )}
                  >
                    {item.label}
                  </Link>
                </li>
              );
            })}
          </ul>
        </nav>
      </div>
    </header>
  );
}
