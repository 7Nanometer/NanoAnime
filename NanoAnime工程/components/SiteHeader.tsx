"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { AuthStatus } from "@/components/AuthStatus";
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
 * ─────────────────────────────────────────────────────────────
 * 视觉上做了三件事（M6 视觉重构）：
 *
 * 1. **半透明 + 毛玻璃**。原来是 `bg-background` 实色块，滚动时像一条硬边的白条
 *    压住内容。改成 72% 不透明 + `backdrop-blur` 之后，内容从底下"透"过去，
 *    顶栏和内容的关系从"覆盖"变成"浮起"，这是深色界面里更贵的做法。
 *    ⚠️ 必须带 `supports-[backdrop-filter]:` 前置：老浏览器不支持 backdrop-filter 时，
 *    72% 半透明会让底下的文字透上来看不清。不支持时退回合透明度更高的实色。
 *
 * 2. **活跃项用品牌色**，而不是原来的灰底高亮。深色界面里灰底高亮几乎看不出来
 *    （灰底和深底本身就接近），必须换成一个有彩度的信号。
 *    同时加一条**底部短横线**——只靠颜色区分，色觉障碍用户分不出当前是哪一页；
 *    色彩 + 形状双通道，才是不依赖颜色的表达。
 *
 * 3. **站名带一个品牌色标记点**。纯文字站名在深色顶栏里没有视觉落点，
 *    加一个 8px 的渐变圆点当"logo"，成本极低，但整条顶栏立刻有了重心。
 * ─────────────────────────────────────────────────────────────
 *
 * ⚠️ 窄屏（小于 sm 断点）时站名只显示「番鉴」两个字：
 * 全名「NanoAnime番鉴」在 320px 的小屏上会把四个入口一起挤出屏幕。
 */
export function SiteHeader() {
  const pathname = usePathname();

  return (
    <header
      className={cn(
        "sticky top-0 z-50 border-b border-border",
        // 半透明底 + 毛玻璃。支持 backdrop-filter 时用半透明，不支持时加深底色兜底
        "bg-background/80 backdrop-blur-xl backdrop-saturate-150",
        "supports-[not(backdrop-filter:blur(0))]:bg-background",
      )}
    >
      <div className="mx-auto flex max-w-7xl items-center gap-3 px-4 py-2.5 sm:gap-4">
        <Link
          href="/"
          className="group flex shrink-0 items-center gap-2 rounded-md outline-none"
          aria-label="NanoAnime番鉴 · 回到首页"
        >
          {/* 品牌标记点。纯装饰，给读屏软件隐藏掉——站名本身已经在旁边念出来了 */}
          <span
            aria-hidden
            className="size-2 rounded-full bg-linear-to-br from-brand-strong to-primary shadow-[0_0_10px_var(--brand-soft)] transition-transform duration-200 group-hover:scale-125"
          />
          {/* 两个 span 切换：宽屏显示全名，窄屏只留两个字 */}
          <span className="hidden text-base font-semibold tracking-tight sm:inline">
            NanoAnime番鉴
          </span>
          <span className="text-base font-semibold tracking-tight sm:hidden">番鉴</span>
        </Link>

        <nav aria-label="主导航" className="ml-auto">
          <ul className="flex items-center gap-0.5 sm:gap-1">
            {NAV_ITEMS.map((item) => {
              const active = isActive(pathname, item.href);

              return (
                <li key={item.href} className="relative">
                  <Link
                    href={item.href}
                    // 告诉读屏软件「这就是当前所在的那一页」。全站第一次用，顺手立个规矩
                    aria-current={active ? "page" : undefined}
                    className={cn(
                      "block rounded-md px-2.5 py-1.5 text-sm transition-colors duration-150 sm:px-3",
                      active
                        ? "font-medium text-foreground"
                        : "text-muted-foreground hover:bg-surface hover:text-foreground",
                    )}
                  >
                    {item.label}
                  </Link>
                  {/*
                    活跃项底部的短横线。**不能只靠颜色表达当前页**——
                    色觉障碍用户分不出紫色和灰色。色彩（文字提亮）+ 形状（横线）
                    两个通道同时给，才是不依赖颜色的表达。
                  */}
                  {active ? (
                    <span
                      aria-hidden
                      className="absolute inset-x-2.5 -bottom-px h-0.5 rounded-full bg-linear-to-r from-brand-strong to-primary sm:inset-x-3"
                    />
                  ) : null}
                </li>
              );
            })}
          </ul>
        </nav>

        {/* 账号入口。和导航之间用一道竖线隔开，视觉上区分「这是页面」和「这是账号」 */}
        <div className="border-l border-border pl-2">
          <AuthStatus />
        </div>
      </div>
    </header>
  );
}
