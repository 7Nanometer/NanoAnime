import { ImageResponse } from "next/og";

import { OG_COLORS, ogFonts } from "@/lib/og";

/**
 * 浏览器标签上的小图标（favicon）。
 *
 * 只放一个「番」字——两三个字在 16×16 的标签上会糊成一团，一个字刚刚好。
 * 深底白字，和分享卡片同一套配色。
 */
export const size = { width: 512, height: 512 };
export const contentType = "image/png";

export default async function Icon() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          backgroundColor: OG_COLORS.background,
          fontSize: 340,
          color: OG_COLORS.foreground,
          // 字面本身不是居中的（下面留白多一点），往下压一点视觉上才正
          paddingBottom: 40,
        }}
      >
        番
      </div>
    ),
    { ...size, fonts: ogFonts() },
  );
}
