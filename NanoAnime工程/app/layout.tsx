import type { Metadata } from "next";
import "./globals.css";
import { Geist } from "next/font/google";
import { OfflineBanner } from "@/components/OfflineBanner";
import { ServiceWorkerRegister } from "@/components/ServiceWorkerRegister";
import { SiteFooter } from "@/components/SiteFooter";
import { SiteHeader } from "@/components/SiteHeader";
import { cn } from "@/lib/utils";
import { Providers } from "./providers";

const geist = Geist({subsets:['latin'],variable:'--font-sans'});

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

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="zh-CN" className={cn("font-sans", geist.variable)}>
      <body className="flex min-h-screen flex-col">
        {/* 断网提示条。放在最顶上——它要压过顶栏，让用户第一眼就看到 */}
        <OfflineBanner />
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
