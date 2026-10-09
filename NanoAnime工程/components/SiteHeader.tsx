"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { AuthStatus } from "@/components/AuthStatus";
import { SITE_CONTAINER } from "@/lib/layout";
import { cn } from "@/lib/utils";

/**
 * 顶栏的入口。以后加页面只在这里加一行，不用再动布局。
 * （这个文件之前的老做法是往首页标题旁边堆链接，堆到第三个就挤了。）
 *
 * 2026-10-07 三期改版定为五项；2026-10-09 加「全部番剧」成六项：
 *   · 「最近更新」/updates —— 当季全部新番、按下一集播出时间排序
 *   · 「全部番剧」/browse —— 按形式 / 状态 / 年份 / 标签自由组合筛选全库（本轮新增）
 *   · 「周表」/calendar —— 完整周表页。它有一段反复：10-06（A+B）曾并进首页的锚点
 *     `/#calendar`；10-07 首页只留一行 7 部，完整周表**恢复成独立页**，
 *     `/calendar` 的 308 跳转已同步删除（不删新页面会被永久重定向吃掉）。
 */
const NAV_ITEMS = [
  { href: "/", label: "首页" },
  { href: "/updates", label: "最近更新" },
  { href: "/browse", label: "全部番剧" },
  { href: "/calendar", label: "周表" },
  { href: "/search", label: "搜索" },
  { href: "/my", label: "我的" },
] as const;

/**
 * 判断某个入口是不是「当前所在的页面」。
 *
 * ⚠️ 首页必须**精确匹配**：如果也用前缀匹配，那任何页面都会点亮「首页」
 * （所有路径都以 "/" 开头），高亮就废了。
 * 其余入口用前缀匹配，将来拆出 `/search/xxx` 这种子路径时也算在这一栏里。
 *
 * 五个入口现在**都是一级页面、全部参与高亮**——「周表」在 10-06 曾是不参与
 * 高亮的首页锚点，10-07 恢复成独立页后，前缀匹配天然命中。
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
 * 为什么吸顶：页面很长（首页现在是一整季的番 + 7 列周表），翻到底部还想切走时不用先滚回顶部。
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
 * ⚠️ 窄屏（小于 sm 断点）时两处结构性降级，都是实测出来的：
 *   · 站名只显示「番鉴」两个字——全名会把入口挤出屏幕；
 *   · **导航挪到第二行**（第一行只留「番鉴 + 账号」）。10-07 加「最近更新」
 *     后 320px 实测：五个入口单行不换行需要 360px，可用只有 273px，差 87px——
 *     靠收窄内边距/字号硬塞的话余量只剩个位数像素，中文字体一换兜底就再坏；
 *     分两行后没有任何文案降级，且实高 92px 反而比"文字竖排换行"的坏状态更矮。
 *     ⚠️ 判「有没有换行」不能只看 scrollWidth==innerWidth——换行本身就会
 *     阻止横向溢出，量出来照样"通过"。要看每个入口的行盒高度（单行 ≈32px，
 *     换行 ≥52px），见验收脚本。
 *   （顶栏在手机上高约 92px，页面锚点的 scrollPaddingTop 仍是 5rem=80px，
 *     差 4px——锚点落点贴住栏底，可接受；不要再叠加 scroll-margin。）
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
      <div
        className={cn(
          SITE_CONTAINER,
          // 窄屏两行（导航用 order-last + w-full 独占一行）；sm 起还原成单行
          "flex flex-wrap items-center gap-x-3 gap-y-2 py-2.5 sm:flex-nowrap sm:gap-4",
        )}
      >
        <Link
          href="/"
          className="group flex shrink-0 items-center gap-2 rounded-md outline-none"
          aria-label="NanoAnime番鉴 · 回到首页"
        >
          {/*
            品牌标记点 = 全站最左上角的那颗星（2026-10-07 深空星夜）。
            `star-logo` 让它一明一暗地脉动（关键帧见 globals.css）；
            hover 放大走独立的 scale 属性，与呼吸动画动的 opacity / box-shadow
            互不干扰。reduced-motion 时动画整个关掉，回到静态的柔光。
            纯装饰，给读屏软件隐藏掉——站名本身已经在旁边念出来了。
          */}
          <span
            aria-hidden
            className="star-logo size-2 rounded-full bg-linear-to-br from-brand-strong to-primary shadow-[0_0_10px_var(--brand-soft)] transition-transform duration-200 group-hover:scale-125"
          />
          {/* 两个 span 切换：宽屏显示全名，窄屏只留两个字 */}
          <span className="hidden text-base font-semibold tracking-tight sm:inline">
            NanoAnime番鉴
          </span>
          <span className="text-base font-semibold tracking-tight sm:hidden">番鉴</span>
        </Link>

        <nav
          aria-label="主导航"
          className="order-last w-full sm:order-none sm:ml-auto sm:w-auto"
        >
          {/*
            ⚠️ flex-wrap + 每个入口 whitespace-nowrap（2026-10-09 加「全部番剧」后 320px 实测）：
            六个入口单行需要约 320px，而 320px 屏幕的导航行只有 288px 可用——不让整条
            导航换行的话，两个四字入口（「最近更新」「全部番剧」）会在胶囊**内部**折成
            两行竖排（行盒 65px，单行应是 40px），那是最难看的坏状态。
            让导航按项换行（两行各居中）后文字永不竖排；336px 以上的屏幕单行放得下、
            完全不受影响（sm 起恢复 nowrap）。判据与实测方法同 155 条纪律。
          */}
          <ul className="flex flex-wrap items-center justify-center gap-0 sm:flex-nowrap sm:justify-start sm:gap-1">
            {NAV_ITEMS.map((item) => {
              const active = isActive(pathname, item.href);

              return (
                <li key={item.href} className="relative">
                  <Link
                    href={item.href}
                    // 告诉读屏软件「这就是当前所在的那一页」。全站第一次用，顺手立个规矩
                    aria-current={active ? "page" : undefined}
                    className={cn(
                      // whitespace-nowrap：四字入口在窄屏绝不折成竖排（详见 nav 上的注释）
                      "block rounded-md px-2 py-1.5 text-sm whitespace-nowrap transition-colors duration-150 sm:px-3",
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
                      className="absolute inset-x-2 -bottom-px h-0.5 rounded-full bg-linear-to-r from-brand-strong to-primary sm:inset-x-3"
                    />
                  ) : null}
                </li>
              );
            })}
          </ul>
        </nav>

        {/* 账号入口。和导航之间用一道竖线隔开，视觉上区分「这是页面」和「这是账号」。
            窄屏时导航在下一行，这里用 ml-auto 把它推到第一行最右 */}
        <div className="ml-auto border-l border-border pl-2 sm:ml-0">
          <AuthStatus />
        </div>
      </div>
    </header>
  );
}
