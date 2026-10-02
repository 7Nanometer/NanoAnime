// 重新生成分享图/图标用的中文字体子集。
//
//   用法：npm run og-font
//
// 产物是 `lib/og-font-data.ts` —— 一个把字体以 base64 内联进来的 TS 文件。
//
// ⚠️ 为什么要内联成 base64，而不是放个 .ttf 让代码去读：
// Vercel 上构建时 Turbopack 崩了，报
//   `start byte index 10 is not a char boundary; it is inside '工'`
// ——"NanoAnime工程"这个目录名里的「工」被从字节中间切开。
// 根因是 Turbopack 在处理**含非 ASCII 字符的路径**时有 bug，而
// `readFile(join(process.cwd(), "assets", ...))` 恰好把项目根目录的完整路径
// 带进了构建产物的命名流程，正好踩中。
//
// 内联之后代码里不再有"读硬盘上的字体"这回事，那条路径就不会进构建产物了。
// 顺带还少一个部署时的文件依赖。
//
// 为什么分享图上的字必须自带字体：ImageResponse 底层是 satori，中文字形它自己没有；
// 不传字体时它会在渲染那一刻**联网去 Google Fonts 抓**（这个行为官方文档一字未提），
// 抓失败只 console.error 然后把字画成空白。Google Fonts 国内同样不通。
//
// ⚠️ 跑之前要能访问 fonts.gstatic.com。本机在国内需要开代理：
//      NODE_USE_ENV_PROXY=1 HTTPS_PROXY=http://127.0.0.1:7897 npm run og-font
//
// ⚠️ 需要本机装了 Python 和 fonttools（`python -m pip install fonttools`）。
//    这只是生成时用一次，不进 package.json 的依赖。

import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

/**
 * 🔴 **分享图和图标上会用到的全部文字，一个字都不能漏。**
 * 加新字 = 改这里 + 重跑本脚本，两步都要做。
 */
const CHARACTERS = [
  "NanoAnime番鉴", // 站名
  "中国动漫爱好者的追番与考据社区", // 副标题
  "不提供在线播放，只跳转正版平台", // 合规声明
].join("");

/** Noto Sans SC（SIL Open Font License，允许再分发）。Google Fonts 的直链 */
const FONT_URL =
  "https://fonts.gstatic.com/s/notosanssc/v41/k3kCo84MPvpLmixcA63oeAL7Iqp5IZJF9bmaG9_FnYw.ttf";

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const OUTPUT_TS = path.join(ROOT, "lib", "og-font-data.ts");
const SUBSET_TTF = path.join(tmpdir(), "NotoSansSC-subset.ttf");
const FULL_TTF = path.join(tmpdir(), "NotoSansSC-full.ttf");

async function main(): Promise<void> {
  console.log(`要用到的字（去重后 ${new Set(CHARACTERS).size} 个）：${CHARACTERS}`);

  // 完整字体有 10.5 MB，没必要每次重下，缓存到系统临时目录
  if (existsSync(FULL_TTF)) {
    console.log(`用上次下好的完整字体：${FULL_TTF}`);
  } else {
    console.log("下载 Noto Sans SC（约 10 MB）……");
    const response = await fetch(FONT_URL, { signal: AbortSignal.timeout(180_000) });
    if (!response.ok) {
      throw new Error(`下载失败：HTTP ${response.status}。国内需要开代理，见脚本顶部注释`);
    }
    await writeFile(FULL_TTF, Buffer.from(await response.arrayBuffer()));
  }

  console.log("裁剪子集……");
  execFileSync(
    "python",
    [
      "-m",
      "fontTools.subset",
      FULL_TTF,
      `--text=${CHARACTERS}`,
      `--output-file=${SUBSET_TTF}`,
      "--layout-features=",
      "--no-hinting",
      "--desubroutinize",
    ],
    { stdio: "inherit" },
  );

  const base64 = (await readFile(SUBSET_TTF)).toString("base64");

  const content = `// ⚠️ 这个文件由 \`npm run og-font\` 自动生成，**不要手改**。
// 要改分享图上的字，请改 scripts/build-og-font.ts 里的 CHARACTERS 再重跑那个命令。
//
// 里面是 Noto Sans SC 的一份子集（SIL Open Font License 1.1，允许再分发，
// 许可证全文见 assets/NotoSansSC-LICENSE.txt），以 base64 内联。
//
// 为什么内联而不是放个 .ttf 去读：Turbopack 处理含中文的路径时会崩
// （"NanoAnime工程" 里的「工」被从字节中间切开），而读硬盘上的文件会把
// 项目根目录的完整路径带进构建产物的命名流程。详见 scripts/build-og-font.ts 顶部。

/** 字体子集，base64 编码的 TTF。覆盖 ${new Set(CHARACTERS).size} 个字符，解码后约 ${(
    base64.length * 0.75 /
    1024
  ).toFixed(1)} KB */
export const OG_FONT_BASE64 =
  "${base64}";
`;

  await mkdir(path.dirname(OUTPUT_TS), { recursive: true });
  await writeFile(OUTPUT_TS, content, "utf8");

  console.log(`\n已生成 ${OUTPUT_TS}（${(content.length / 1024).toFixed(1)} KB）`);
  console.log("记得把 lib/ 下的改动一起提交。");
}

await main();
