import { ImageResponse } from "next/og";

import { OG_COLORS, ogFonts } from "@/lib/og";

/**
 * 手机添加到主屏时的图标（iOS 用的 apple-touch-icon）。
 *
 * 和 favicon 用同一个「番」字设计，只是尺寸不同。
 * iOS 会自己给四角加圆角，所以这里画满一整块方图就行，不用自己做圆角。
 */
export const size = { width: 180, height: 180 };
export const contentType = "image/png";

export default async function AppleIcon() {
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
          fontSize: 120,
          color: OG_COLORS.foreground,
          paddingBottom: 14,
        }}
      >
        番
      </div>
    ),
    { ...size, fonts: ogFonts() },
  );
}
