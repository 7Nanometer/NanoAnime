import type { MetadataRoute } from "next";

/**
 * PWA manifest（放到 `app/manifest.ts` 是 Next 的约定，会自动出成 `/manifest.webmanifest`）。
 *
 * 有了它，手机上「添加到主屏」才会被当成一个 App 打开（`display: standalone` 去掉浏览器地址栏），
 * 而不是普通书签。图标就用 app/icon.tsx 和 app/apple-icon.tsx 生成的那两个。
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "NanoAnime番鉴",
    // 主屏名字太长会被系统截断，宪法第一条就写明退为「番鉴」
    short_name: "番鉴",
    description: "中国动漫爱好者的追番与考据社区。不提供在线播放，只跳转正版平台。",
    start_url: "/",
    display: "standalone",
    lang: "zh-CN",
    // 和顶栏/分享图同一套配色，启动时不会闪一下白
    background_color: "#0a0a0a",
    theme_color: "#0a0a0a",
    icons: [
      { src: "/icon", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/apple-icon", sizes: "180x180", type: "image/png" },
    ],
  };
}
