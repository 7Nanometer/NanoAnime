import { ImageResponse } from "next/og";

import { fetchAnimeDetail } from "@/lib/anilist";
import {
  BRAND,
  DISCLAIMER,
  OG_COLORS,
  OG_SIZE,
  TAGLINE,
  fetchImageAsDataUri,
  ogFonts,
} from "@/lib/og";

/**
 * 详情页的分享卡片：左边这部番的封面，右边站名。
 *
 * 为什么做成横版拼图，而不是直接拿封面当 og:image：
 * AniList 封面实测是 **460×652 的竖版**，而 og:image 的标准是 **1200×630 的横版**。
 * 直接塞竖图的话，微信/QQ 会把它裁成小方图或者加一圈白边，很难看。
 *
 * ⚠️ **不在图上印番名**。番名是不确定的字（可能是任何汉字），没法预先裁进字体子集；
 * 全量中文字体 10.5 MB，为这一个用处不值得。番名交给 `og:title`——
 * 微信/QQ 本来就会把标题当文字渲染在卡片上，不会丢。
 */

export const alt = `${BRAND} —— ${TAGLINE}`;
export const size = OG_SIZE;
export const contentType = "image/png";

export default async function Image({ params }: { params: Promise<{ id: string }> }) {
  // Next 16 里 params 是 Promise，必须 await（动态路由的 opengraph-image 同样如此）
  const { id } = await params;
  const parsed = /^\d+$/.test(id) ? Number(id) : null;

  // 取详情和抓封面**任何一步失败都不能让整张图挂掉**——
  // 分享图渲染不出来，微信那边就只剩一条光秃秃的链接
  const detail =
    parsed === null ? null : await fetchAnimeDetail(parsed).catch(() => null);
  const coverUrl = detail?.coverImage.extraLarge ?? detail?.coverImage.large ?? null;
  const coverData = coverUrl ? await fetchImageAsDataUri(coverUrl) : null;

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          backgroundColor: OG_COLORS.background,
          padding: "0 80px",
        }}
      >
        {coverData ? (
          // eslint-disable-next-line @next/next/no-img-element -- satori 不认 next/image，这里必须用原生 img
          <img
            src={coverData}
            alt=""
            width={280}
            height={420}
            style={{ objectFit: "cover", borderRadius: 16 }}
          />
        ) : null}

        <div
          style={{
            display: "flex",
            flexDirection: "column",
            marginLeft: coverData ? 64 : 0,
          }}
        >
          <div style={{ fontSize: 72, color: OG_COLORS.foreground }}>{BRAND}</div>
          <div style={{ fontSize: 30, color: OG_COLORS.muted, marginTop: 22 }}>{TAGLINE}</div>
          <div style={{ fontSize: 24, color: OG_COLORS.muted, marginTop: 40 }}>{DISCLAIMER}</div>
        </div>
      </div>
    ),
    { ...OG_SIZE, fonts: ogFonts() },
  );
}
