import { ImageResponse } from "next/og";

import { BRAND, DISCLAIMER, OG_COLORS, OG_SIZE, TAGLINE, ogFonts } from "@/lib/og";

/**
 * 全站分享卡片。
 *
 * 为什么需要它：首页的数据全是浏览器跑完 JS 才拉的，**服务器渲染出来的正文只有 36 个字符**
 * （已实测）。也就是说别人把链接分享到微信/QQ 时，抓取器爬到的基本是空白——
 * 这张图加上 layout 里的 og 标签，是分享卡片唯一的信息来源。
 *
 * 详情页另有一张带封面的（app/anime/[id]/opengraph-image.tsx）。
 */

// 分享出去时图片的替代文字（读屏软件用）
export const alt = `${BRAND} —— ${TAGLINE}`;
export const size = OG_SIZE;
export const contentType = "image/png";

/**
 * 分享卡右半边的星点装饰（2026-10-07 深空星夜）。
 * 格式：[上, 左, 直径(px), 不透明度]。全部落在右半区，避开左侧的文字
 * （1200×630 画布，文字最长的一行 TAGLINE 约到 x≈620）。
 *
 * ⚠️ 只加"装饰元素"，**一个字都不能加**——分享图上的文字受字体子集红线约束
 * （新字不进 scripts/build-og-font.ts 的字符表就会渲染成空白，且不报错）。
 */
const OG_STARS: Array<[number, number, number, number]> = [
  [78, 846, 6, 0.95],
  [136, 1058, 4, 0.7],
  [104, 962, 3, 0.55],
  [218, 1102, 5, 0.85],
  [188, 762, 3, 0.5],
  [316, 918, 4, 0.65],
  [288, 1064, 3, 0.55],
  [408, 872, 5, 0.8],
  [452, 1088, 3, 0.5],
  [512, 962, 4, 0.68],
  [366, 1136, 2, 0.45],
  [236, 986, 2, 0.5],
];

export default async function Image() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          backgroundColor: OG_COLORS.background,
          padding: "80px",
          // 星点是绝对定位的子元素，需要一个定位上下文
          position: "relative",
        }}
      >
        {/* 星点装饰。satori 支持绝对定位的圆点 div，不需要图片资源 */}
        {OG_STARS.map(([top, left, size, opacity], i) => (
          <div
            key={i}
            style={{
              position: "absolute",
              top,
              left,
              width: size,
              height: size,
              borderRadius: 9999,
              backgroundColor: OG_COLORS.star,
              opacity,
            }}
          />
        ))}

        <div style={{ display: "flex", flexDirection: "column" }}>
          <div style={{ fontSize: 92, color: OG_COLORS.foreground }}>{BRAND}</div>
          <div style={{ fontSize: 36, color: OG_COLORS.muted, marginTop: 28 }}>{TAGLINE}</div>
        </div>

        <div style={{ display: "flex", flexDirection: "column" }}>
          <div
            style={{
              width: 120,
              height: 4,
              backgroundColor: OG_COLORS.accent,
              marginBottom: 32,
            }}
          />
          <div style={{ fontSize: 28, color: OG_COLORS.muted }}>{DISCLAIMER}</div>
        </div>
      </div>
    ),
    // size 里的 width / height 直接复用给 ImageResponse，免得两处对不上
    { ...OG_SIZE, fonts: ogFonts() },
  );
}
