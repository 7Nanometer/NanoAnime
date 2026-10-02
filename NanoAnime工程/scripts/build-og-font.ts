// 重新生成分享图/图标用的中文字体子集。
//
//   用法：npm run og-font
//
// 为什么需要这个脚本：分享图上的字必须由**自带的字体文件**渲染。
// 如果某个字不在字体子集里，satori 会偷偷联网去 Google Fonts 抓——国内抓不到，
// 那个字就变成空白，而且不报错。所以「往分享图上加新字」这件事必须走这个脚本。
//
// ⚠️ 跑之前要能访问 fonts.gstatic.com。本机在国内需要开代理：
//      NODE_USE_ENV_PROXY=1 HTTPS_PROXY=http://127.0.0.1:7897 npm run og-font
//    （和 scripts/fetch-title-zh.ts 是同一个原因）
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
 * 🔴 **分享图上会用到的全部文字，一个字都不能漏。**
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
const OUTPUT = path.join(ROOT, "assets", "NotoSansSC-subset.ttf");
const DOWNLOAD_CACHE = path.join(tmpdir(), "NotoSansSC-full.ttf");

async function main(): Promise<void> {
  console.log(`要用到的字（去重后 ${new Set(CHARACTERS).size} 个）：${CHARACTERS}`);

  // 完整字体有 10.5 MB，没必要每次重下，缓存到系统临时目录
  if (existsSync(DOWNLOAD_CACHE)) {
    console.log(`用上次下好的完整字体：${DOWNLOAD_CACHE}`);
  } else {
    console.log("下载 Noto Sans SC（约 10 MB）……");
    const response = await fetch(FONT_URL, { signal: AbortSignal.timeout(180_000) });
    if (!response.ok) {
      throw new Error(`下载失败：HTTP ${response.status}。国内需要开代理，见脚本顶部注释`);
    }
    await writeFile(DOWNLOAD_CACHE, Buffer.from(await response.arrayBuffer()));
  }

  await mkdir(path.dirname(OUTPUT), { recursive: true });

  execFileSync(
    "python",
    [
      "-m",
      "fontTools.subset",
      DOWNLOAD_CACHE,
      `--text=${CHARACTERS}`,
      `--output-file=${OUTPUT}`,
      "--layout-features=",
      "--no-hinting",
      "--desubroutinize",
    ],
    { stdio: "inherit" },
  );

  const size = (await readFile(OUTPUT)).byteLength;
  console.log(`\n已生成 ${OUTPUT}（${(size / 1024).toFixed(1)} KB）`);
  console.log("记得把 assets/ 下的改动一起提交。");
}

await main();
