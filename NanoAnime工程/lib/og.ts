// 生成分享图 / 图标时的公用东西。
//
// 目前只有 `app/` 下那几个图片路由用它（分享图、favicon、主屏图标），页面组件用不上。
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

import { OG_FONT_BASE64 } from "@/lib/og-font-data";

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
 * 中文字体子集的字节。
 *
 * ⚠️ **是内联的 base64，不是从硬盘读的**，这是故意的：
 * 之前用 `readFile(join(process.cwd(), "assets", ...))` 的写法在 Vercel 上**构建直接崩了**——
 * Turbopack 处理含中文的路径时有 bug（报 `start byte index 10 is not a char boundary;
 * it is inside '工'`，「NanoAnime工程」里的「工」被从字节中间切开），
 * 而读硬盘上的文件正好把项目根目录的完整路径带进了构建产物的命名流程，一脚踩中。
 * 内联之后代码里不再有"读硬盘"这回事，那条路径就不会进构建产物了。
 * 详见 scripts/build-og-font.ts 顶部。
 */
function ogFontData(): ArrayBuffer {
  const binary = atob(OG_FONT_BASE64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes.buffer;
}

/** `ImageResponse` 的 fonts 选项，各图片路由共用 */
export function ogFonts() {
  return [
    {
      name: "NotoSansSC",
      data: ogFontData(),
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
