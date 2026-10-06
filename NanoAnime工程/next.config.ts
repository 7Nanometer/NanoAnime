import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /**
   * 老地址跳转。
   *
   * `/calendar`（日历页）在 2026-10-06 M7 首页改版里并进了首页的「追番周表」区块，
   * 页面本身删掉了。但顶栏旧入口、用户收藏、搜索引擎里的老链接都还指着它——
   * 用 308（`permanent: true` 的语义）永久跳到首页的锚点：
   * 链接不失效，搜索引擎也会把老地址的权重转到新位置。
   *
   * ⚠️ 目标地址里的 `#calendar` 只在浏览器端生效（哈希不会发给服务器）。
   * 能落对位置靠的是首页服务端 HTML 里就有 id="calendar" 的区块（见 app/page.tsx），
   * 所以直接打开 /calendar 也会先跳到首页、再滚到周表。
   */
  async redirects() {
    return [{ source: "/calendar", destination: "/#calendar", permanent: true }];
  },

  /**
   * 给 service worker 文件单独设响应头。
   *
   * 为什么必须设：浏览器会把 service worker 文件本身也缓存起来。如果沿用
   * `public/` 目录的默认头（`public, max-age=0`，见 Next 官方 public-folder 文档），
   * 还算是安全的；但这里明确写成「不许缓存」，两道保险——
   * 否则以后改了 `public/sw.js`，用户可能几个月都拿不到新版，一直用着旧缓存逻辑。
   *
   * ⚠️ 官方 PWA 指南的示例里还有一条 `Content-Security-Policy: default-src 'self'`，
   * **这里故意不加**：那条策略会把 service worker 自己去抓 AniList 封面图（跨域）
   * 给拦掉，封面缓存直接失效。我们要缓存封面，所以不能加。
   *
   * 注意 `headers()` 对 `public/` 下的文件是生效的——官方 headers 文档原话是
   * "Headers are checked before the filesystem which includes pages and /public files."
   */
  async headers() {
    return [
      {
        source: "/sw.js",
        headers: [
          { key: "Content-Type", value: "application/javascript; charset=utf-8" },
          { key: "Cache-Control", value: "no-cache, no-store, must-revalidate" },
        ],
      },
    ];
  },
  images: {
    // 开发环境关掉 Next 的图片优化：它的上游抓取有 7 秒硬超时且无法配置，
    // 而 AniList 图床国内直连实测要 3~16 秒，走优化器会有一半图被掐断返回 500。
    // 关掉后浏览器直接向图床取图——慢，但不会失败。
    //
    // 生产环境保持优化开启：线上的图不是从这台机器去抓的（Vercel 的服务器在
    // 国外，抓 AniList 很快），优化器能正常出 WebP 和响应式尺寸，白名单也照常生效。
    unoptimized: process.env.NODE_ENV === "development",

    // 图片域名白名单：不在这里列出的域名，next/image 一律拒绝（返回 400）。
    // 只放行 AniList 的官方图床。M3 接 TMDB 时再加它的域名。
    remotePatterns: [
      {
        protocol: "https",
        hostname: "s4.anilist.co",
        pathname: "/**",
      },
    ],
  },
};

export default nextConfig;
