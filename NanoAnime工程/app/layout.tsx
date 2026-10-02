import type { Metadata } from "next";
import "./globals.css";
import { Geist } from "next/font/google";
import { SiteHeader } from "@/components/SiteHeader";
import { cn } from "@/lib/utils";
import { Providers } from "./providers";

const geist = Geist({subsets:['latin'],variable:'--font-sans'});

export const metadata: Metadata = {
  title: "NanoAnime番鉴",
  description: "中国动漫爱好者的追番与考据社区。不提供在线播放，只跳转正版平台。",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="zh-CN" className={cn("font-sans", geist.variable)}>
      <body>
        {/* 全站顶栏。挂在 Providers 外面——它不依赖 TanStack Query，层次更清楚 */}
        <SiteHeader />
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
