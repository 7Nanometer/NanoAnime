import type { Metadata, Viewport } from "next";
import "./globals.css";
import { ViewTransition } from "react";
import { Noto_Sans_SC, Outfit } from "next/font/google";
import { CursorSpotlight } from "@/components/CursorSpotlight";
import { IntroOverlay } from "@/components/IntroOverlay";
import { OfflineBanner } from "@/components/OfflineBanner";
import { ServiceWorkerRegister } from "@/components/ServiceWorkerRegister";
import { SiteFooter } from "@/components/SiteFooter";
import { SiteHeader } from "@/components/SiteHeader";
import { StarfieldBackground } from "@/components/StarfieldBackground";
import { SyncConsentBanner } from "@/components/SyncConsentBanner";
import { cn } from "@/lib/utils";
import { Providers } from "./providers";

/**
 * 中文字体：Noto Sans SC。
 *
 * ⚠️ 为什么必须显式指定中文字体，而不是沿用原来只声明 latin 子集的 Geist：
 * Geist 的 `subsets: ['latin']` 里**一个汉字都没有**，中文全部退回系统字体。
 * 结果是 Windows 上显示微软雅黑、macOS 上显示苹方、安卓上显示思源——
 * 同一篇界面在三个平台上行高、字重、字面大小全都不一样。对中文站来说，
 * 中文字体才是正文真正的载体，不能交给系统随便兜底。
 *
 * `preload: false` 是刻意的：中文字体子集极大（几 MB），预加载会拖慢首屏。
 * 让它按 CSS 的 font-display: swap 走，先用系统字体渲染、字体到位后替换。
 */
const notoSansSC = Noto_Sans_SC({
  subsets: ["latin"],
  weight: ["400", "500", "700"],
  variable: "--font-sans",
  display: "swap",
  preload: false,
});

/**
 * 展示字体：Outfit（拉丁字形，用于站名、评分、年份这类数字/英文）。
 *
 * 为什么单独备一个：Outfit 的几何无衬线字形在数字上比中文字体的拉丁部分紧凑好看得多。
 * CSS 里把它排在中文之后（见下面 --font-display 的写法），
 * 于是汉字继续走 Noto Sans SC、拉丁字母和数字走 Outfit，各取所长。
 * 这是中英混排的标准做法，不需要额外做字体切分。
 */
const outfit = Outfit({
  subsets: ["latin"],
  variable: "--font-display-latin",
  display: "swap",
});

const DESCRIPTION = "中国动漫爱好者的追番与考据社区。不提供在线播放，只跳转正版平台。";

/**
 * 入场动画的「开场哨」（2026-10-07）。
 *
 * ⚠️ 必须是**同步内联**、**放在 `<body>` 的第一个子节点**：
 * 只有解析期同步执行的脚本才能保证在**首次绘制之前**把类名加好——
 * 这样要播动画的访客看到的第第一帧就是黑场，不存在"先闪一下网页、
 * 再被黑场盖住"。⚠️ **不能用 `next/script` 的 `beforeInteractive`**：
 * 它是把内容 push 进 `self.__next_s`、由客户端 bundle 稍后执行的
 * （已从 Next 源码核实），比首次绘制位还晚，防闪意义为零。
 *
 * 脚本做四件事（整段 try/catch——这段出错，页面必须照常可用）：
 *   1. 认 `?intro=1` / `?intro=0` 两个调试开关（标记在首帧就写死，
 *      dev 想反复看动画只能靠它，或在 DevTools 里清 sessionStorage）；
 *   2. 「减弱动态效果」的用户直接不播；
 *   3. 本标签页已播过（sessionStorage）就不播——刷新、站内跳转都不会重播，
 *      关掉标签页重开才会；
 *   4. 记录 `__introT0`（动画的时间锚点，让 JS 动画和 HTML 解析时刻对齐）
 *      并给 `<html>` 加 `intro-playing`。
 */
const INTRO_BOOTSTRAP = `!function(){try{
var q=location.search,force=q.indexOf("intro=1")>-1,off=q.indexOf("intro=0")>-1;
if(off)return;
if(matchMedia("(prefers-reduced-motion: reduce)").matches)return;
var seen=false;try{seen=sessionStorage.getItem("nanoanime.intro.v1")==="1"}catch(e){}
if(seen&&!force)return;
try{sessionStorage.setItem("nanoanime.intro.v1","1")}catch(e){}
window.__introT0=performance.now();
document.documentElement.classList.add("intro-playing");
}catch(e){}}();`;

/**
 * 站点自己的完整网址。
 *
 * ⚠️ 这个不能省：`metadataBase` 不设的话，og:image / canonical 这些需要完整地址的字段
 * 会生成**相对路径**，分享出去就是坏链——微信抓不到图，卡片上什么都没有。
 *
 * Vercel 会自动注入 `VERCEL_PROJECT_PRODUCTION_URL`（稳定域名）和 `VERCEL_URL`（本次部署的）。
 * 优先用前者，这样预览部署分享出去也是指到正式域名。本地开发两条都没有，退回 localhost。
 */
const SITE_URL = process.env.VERCEL_PROJECT_PRODUCTION_URL
  ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`
  : process.env.VERCEL_URL
    ? `https://${process.env.VERCEL_URL}`
    : "http://localhost:3000";

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: "NanoAnime番鉴",
  description: DESCRIPTION,
  applicationName: "NanoAnime番鉴",
  openGraph: {
    type: "website",
    // 中文站，分享到微信/QQ 时语言标对
    locale: "zh_CN",
    siteName: "NanoAnime番鉴",
    title: "NanoAnime番鉴",
    description: DESCRIPTION,
    // og:image 不在这里写——交给文件约定 app/opengraph-image.tsx 自动注入。
    // 两者同时存在时**文件约定优先**，写在这儿只会造成两处不一致
  },
  twitter: {
    // 大图卡片：分享出去是「大图 + 标题 + 描述」那种
    card: "summary_large_image",
    title: "NanoAnime番鉴",
    description: DESCRIPTION,
  },
};

/**
 * 视口相关设置。
 *
 * ⚠️ 这三个字段**必须放在 `viewport` 导出里，不能放进 `metadata`**。
 * Next 16 已经把它们从 metadata 移走了，放错地方 build 时会逐页报
 * 「Unsupported metadata themeColor is configured in metadata export」——
 * 不报错、只是警告，结果就是**设置静默失效**，移动端地址栏不会跟着变深色。
 *
 * 顺带说：`themeColor` 要和 app/globals.css 里 `--background` 的实际值一致，
 * 不然手动滚动到页面边界（iOS 上的橡皮筋效果）时会露出一条对不上的色。
 */
export const viewport: Viewport = {
  // 深色界面在移动端浏览器里要一起变深：地址栏、状态栏跟着主题走。
  // ⚠️ 这个值 = globals.css 里 `--background` 的十六进制（oklch(0.132 0.026 277)）。
  // 深空星夜改版时统一过一处**既有不一致**：manifest.ts 里曾是 #0a0a0a、
  // 这里是 #0d0c13，两个值本来就对不上；现在两处都指向同一个深空色。
  themeColor: "#060712",
  // ⚠️ 这一条不能改成 `user-scalable=no` 或 `maximum-scale=1`——
  // 禁止缩放是无障碍红线（WCAG 1.4.4），低视力用户要靠放大读字
  colorScheme: "dark",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="zh-CN"
      className={cn("scroll-smooth font-sans", notoSansSC.variable, outfit.variable)}
      // 顶栏是 sticky 的，页面内锚点跳转时若不加这个偏移，被跳到的标题会被顶栏压住
      style={{ scrollPaddingTop: "5rem" }}
      // ⚠️ 下面那段内联脚本会在 hydration 之前给 <html> 加 intro-playing 类，
      // React 对比属性时会发现"多了个类"。它不会把类改回去（差异只用于 dev 打印），
      // 但控制台会报 hydration mismatch——suppressHydrationWarning 正是为
      // "内联脚本提前改动根元素"这种场景准备的（Next 官方暗色模式指南同款）。
      suppressHydrationWarning
    >
      {/*
        ⚠️ 这里写死 className="dark" 而不是靠 JS 切换。
        本站只有一个主题（深色），如果把主题挂在 JS 上，首屏会在深色底上闪一下
        系统默认的亮色，然后才变深——那个闪白比什么都破坏质感。
        写死在服务端渲染的 HTML 上，浏览器第一帧就是深的。
        对应的还有 globals.css 里的 color-scheme: dark（滚动条/表单控件）。
      */}
      <body className="dark flex min-h-screen flex-col bg-background">
        {/*
          入场动画的「开场哨」——必须是 body 的第一个子节点，且必须是
          同步内联脚本（原因见 INTRO_BOOTSTRAP 的注释）。
        */}
        <script dangerouslySetInnerHTML={{ __html: INTRO_BOOTSTRAP }} />
        {/*
          全站星空背景层（2026-10-07 深空星夜改版）。
          它接替了原来那层"双色径向渐变氛围"的职责：让大片深色底不至于变成
          一块死板的纯色、给封面墙一个有方向的背景（星云的紫 / 青蓝两团与
          旧氛围层的左上紫、右上蓝位置呼应），并在此之上叠了星点与流星。
          结构见 components/StarfieldBackground.tsx，视觉在 globals.css「星空层」。
          ⚠️ 它零客户端 JS（服务端组件 + 纯 CSS 动画）——
          固定定位、负 z、pointer-events: none 都在组件的 CSS 类里，别在这里重复加。
        */}
        <StarfieldBackground />

        {/* 断网提示条。放在最顶上——它要压过顶栏，让用户第一眼就看到 */}
        <OfflineBanner />
        {/* 知情同意横幅：有一笔改动等着推上云端、而用户还没确认过"首次同步"时出现。
            和断网条同一个位置逻辑——都是"必须第一眼看到"的全站提示 */}
        <SyncConsentBanner />
        {/* 全站顶栏。挂在 Providers 外面——它不依赖 TanStack Query，层次更清楚 */}
        <SiteHeader />
        {/* flex-1 让内容区把剩下的高度撑满，页脚才会被顶到底部，而不是浮在半空 */}
        <Providers>
          {/*
            页面切换转场（2026-10-09 签名动效，Awwwards 级打磨）：
            站内跳转时内容区做一次"旧页先走、新页慢浮现"的溶解过渡。
            ⚠️ 三个关键事实（都从 React/Next 官方文档核实过）：
              1. **不需要任何配置**——Next 16 内置的 React canary 已带
                 <ViewTransition>，2026 年的 `experimental.viewTransition`
                 开关已被官方移除（它本来就是空开关），别再加回 next.config；
              2. 它**不产生任何 DOM 节点**，只是一个"过渡边界"——包在 children
                 外面，整站零成本（不参与布局、不参与样式）；
              3. **只包内容区**：顶栏 / 星空背景 / 页脚都在边界之外，跳转时不闪——
                 只有"页面内容"这一块在溶解（这也正是要的效果）。
            视觉（时长/缓动/减弱动效兜底）在 globals.css 的「页面切换转场」一节。
          */}
          <ViewTransition default="vt-page">
            <div className="flex-1">{children}</div>
          </ViewTransition>
        </Providers>
        <SiteFooter />
        {/* 离线缓存的开机开关，不显示任何东西 */}
        <ServiceWorkerRegister />
        {/* 卡片"跟随鼠标的柔光"的位置写入器（2026-10-07 顶级打磨）。
            同样不显示任何东西——全站只挂一个监听器，见组件头注释 */}
        <CursorSpotlight />
        {/* 入场动画「星尘聚字」（2026-10-07）。放最后：它 position:fixed，
            DOM 位置不影响版式，但放后面能让前面的内容更早被解析到 */}
        <IntroOverlay />
      </body>
    </html>
  );
}
