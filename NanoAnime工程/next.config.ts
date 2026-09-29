import type { NextConfig } from "next";

const nextConfig: NextConfig = {
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
