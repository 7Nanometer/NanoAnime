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
        }}
      >
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
    { ...OG_SIZE, fonts: await ogFonts() },
  );
}
