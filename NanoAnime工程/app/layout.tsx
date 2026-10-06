import type { Metadata, Viewport } from "next";
import "./globals.css";
import { Noto_Sans_SC, Outfit } from "next/font/google";
import { OfflineBanner } from "@/components/OfflineBanner";
import { ServiceWorkerRegister } from "@/components/ServiceWorkerRegister";
import { SiteFooter } from "@/components/SiteFooter";
import { SiteHeader } from "@/components/SiteHeader";
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
  // 深色界面在移动端浏览器里要一起变深：地址栏、状态栏跟着主题走
  themeColor: "#0d0c13",
  // ⚠️ 这一条不能改成 `user-scalable=no` 或 `maximum-scale=1`——
  // 禁止缩放是无障碍红线（WCAG 1.4.4），低视力用户要靠放大读字
  colorScheme: "dark",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="zh-CN"
      className={cn("font-sans", notoSansSC.variable, outfit.variable)}
      // 顶栏是 sticky 的，页面内锚点跳转时若不加这个偏移，被跳到的标题会被顶栏压住
      style={{ scrollPaddingTop: "5rem" }}
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
          全站背景氛围层。
          一层极淡的双色径向渐变（左上偏紫、右下偏蓝），**固定在视口上不随滚动移动**。
          作用不是"好看"，是让大片深色底不至于变成一块死板的纯色，
          同时给封面墙的封面提供一个有方向的背景，图片的彩色不会衬在死黑上显得割裂。
          ⚠️ fixed + -z-10 + pointer-events-none 三个都不能少：
          不加 fixed 滚动时会跟着走、露出边缘；不加负 z 会盖住内容；
          不加 pointer-events-none 会吃掉整页的点击。
        */}
        <div
          aria-hidden
          className="pointer-events-none fixed inset-0 -z-10 bg-[radial-gradient(120%_80%_at_12%_-10%,var(--brand-tint)_0%,transparent_55%),radial-gradient(100%_65%_at_92%_4%,oklch(0.62_0.15_250/_8%)_0%,transparent_60%)]"
        />

        {/* 断网提示条。放在最顶上——它要压过顶栏，让用户第一眼就看到 */}
        <OfflineBanner />
        {/* 知情同意横幅：有一笔改动等着推上云端、而用户还没确认过"首次同步"时出现。
            和断网条同一个位置逻辑——都是"必须第一眼看到"的全站提示 */}
        <SyncConsentBanner />
        {/* 全站顶栏。挂在 Providers 外面——它不依赖 TanStack Query，层次更清楚 */}
        <SiteHeader />
        {/* flex-1 让内容区把剩下的高度撑满，页脚才会被顶到底部，而不是浮在半空 */}
        <Providers>
          <div className="flex-1">{children}</div>
        </Providers>
        <SiteFooter />
        {/* 离线缓存的开机开关，不显示任何东西 */}
        <ServiceWorkerRegister />
      </body>
    </html>
  );
}
