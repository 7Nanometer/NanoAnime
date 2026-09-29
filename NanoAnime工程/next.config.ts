import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  images: {
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
