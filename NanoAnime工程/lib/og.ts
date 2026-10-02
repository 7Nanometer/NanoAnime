// 生成分享图 / 图标时的公用东西。
//
// ⚠️ **这个文件只能被服务端引用**（它读了 `node:fs`）。目前只有 `app/` 下那几个
// 图片路由用它，页面组件别碰。
//
// ⚠️ 为什么要自带字体文件：`ImageResponse` 底层是 satori，中文字形它自己没有。
// **不传字体时，它会在渲染那一刻联网去 Google Fonts 抓 Noto Sans SC**——
// 这个行为**官方文档里一个字都没写**，是从编译产物源码里翻出来的。
// 而 Google Fonts 在国内同样不通，抓失败只会 `console.error`，然后把那个字画成空白。
// 结果就是分享图在关键时候变成豆腐块，而且不报错、很难查。
//
// 所以这里自带一份**裁过的子集**：只含下面会用到的 46 个字符，11 KB。
// 不联网、不依赖外站，符合宪法第五节第 6 条「运行时零外网依赖」。
//
// 🔴 **一个必须守住的约束**：这份子集只覆盖 BRAND / TAGLINE / DISCLAIMER 里出现过的字。
// **往分享图上加任何新字之前，必须先把那个字补进字体子集**（见 package.json 的 `og-font` 脚本），
// 否则 satori 会悄悄退回去联网抓 Google Fonts——国内抓不到，那个字就是空白，
// 而且它不抛错，只是画不出来。

import { readFile } from "node:fs/promises";
import { join } from "node:path";

/** 站点名称。分享图上印的就是它 */
export const BRAND = "NanoAnime番鉴";

/** 首页副标题那一句 */
export const TAGLINE = "中国动漫爱好者的追番与考据社区";

/** 合规声明，分享图上也印一行 */
export const DISCLAIMER = "不提供在线播放，只跳转正版平台";

/** 分享图标准尺寸（1200×630，宽高比 1.91:1，微信/QQ/微博都按这个裁） */
export const OG_SIZE = { width: 1200, height: 630 };

/** 分享图配色。深色底 + 白字，缩成小图也看得清 */
export const OG_COLORS = {
  background: "#0a0a0a",
  foreground: "#fafafa",
  muted: "#a1a1aa",
  accent: "#e4e4e7",
};

/**
 * 载入中文字体子集。
 *
 * 用 `process.cwd()` 拼路径是 Next 官方文档给的写法，构建时会被文件追踪带上，
 * 所以部署到 Vercel 也能读到。
 */
export async function loadOgFont(): Promise<Buffer> {
  return readFile(join(process.cwd(), "assets", "NotoSansSC-subset.ttf"));
}

/** `ImageResponse` 的 fonts 选项，各图片路由共用 */
export async function ogFonts() {
  return [
    {
      name: "NotoSansSC",
      data: await loadOgFont(),
      style: "normal" as const,
      weight: 400 as const,
    },
  ];
}

/**
 * 把一张远程图片抓下来转成 data URI。
 *
 * **为什么不直接把远程地址塞进 `<img src>`**：那样 satori 会自己去抓，
 * 抓失败就整张图渲染不出来，我们插不上手。这里自己抓、失败返回 null，
 * 调用方就能退化成不带图的纯文字卡片——**分享图不该因为外站抖动就整个挂掉**。
 */
export async function fetchImageAsDataUri(url: string): Promise<string | null> {
  try {
    const response = await fetch(url, { signal: AbortSignal.timeout(8000) });
    if (!response.ok) {
      return null;
    }
    const buffer = Buffer.from(await response.arrayBuffer());
    const mime = response.headers.get("content-type") ?? "image/jpeg";
    return `data:${mime};base64,${buffer.toString("base64")}`;
  } catch {
    return null;
  }
}
