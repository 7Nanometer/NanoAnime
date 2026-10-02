// 一次性批量脚本：把本季新番的中文名从 Bangumi 补下来，存进 data/title-zh.json。
//
// ⚠️ 跑之前必须先开代理，并且要通过环境变量告诉 Node 走代理——
//    Node 自带的 fetch 默认**不读**代理设置（实测裸跑会一直连不上直到超时）。
//    正确跑法：
//      NODE_USE_ENV_PROXY=1 HTTPS_PROXY=http://127.0.0.1:7897 npm run fetch-title-zh
//    （端口换成你自己代理的端口）
//
// 为什么要拆成"离线抓 + 存文件"而不是实时请求：Bangumi 在用户本机被墙，线上更是访问不了。
// 中文名这种几乎不变的数据，抓一次存下来就够了。
//
// 本脚本是**一次性**的，不是每次构建都跑。番剧表更新后想重新对齐，再跑一次即可。

import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { fetchSeasonAnime, getCurrentSeason } from "../lib/anilist.ts";
import { matchSubject, searchBangumi } from "../lib/bangumi.ts";
import type { BangumiIndex } from "../types/bangumi.ts";

/** 每部之间停一下，别把 Bangumi 的接口打急眼了 */
const DELAY_MS = 500;

/** 输出文件。用脚本自身的位置推算，这样从哪个目录跑都一样 */
const OUTPUT_PATH = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
  "data",
  "title-zh.json",
);

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** 终端里中日文是双宽字符，用 padEnd 对齐会歪——这里只求能看，不求对齐 */
function pad(text: string, width: number): string {
  return text.length >= width ? text : text + " ".repeat(width - text.length);
}

async function main(): Promise<void> {
  const { season, seasonYear } = getCurrentSeason();
  console.log(`本季：${seasonYear} ${season}`);

  const { anime } = await fetchSeasonAnime(20);
  if (anime.length === 0) {
    throw new Error("AniList 没返回任何番剧，先检查网络再跑");
  }
  console.log(`拿到 ${anime.length} 部，开始逐部搜 Bangumi……\n`);

  const index: BangumiIndex = {};
  let failed = 0;

  const rows: string[] = [];

  for (let i = 0; i < anime.length; i++) {
    const item = anime[i];
    // 搜 Bangumi 的关键词：优先日文原名（Bangumi 以日文登记为主），没有才退到罗马音/英文名
    const keyword = item.title.native ?? item.title.romaji ?? item.title.english;
    // 首播年份优先用 AniList 的首播日期；未定档的作品退回"本季年份"。
    // 无论用哪个，后面都要求和 Bangumi 的放送年份**严格相等**才认，所以不算瞎猜。
    const year = item.startDate?.year ?? seasonYear;

    let line = `${pad(String(i + 1), 3)} ${pad(item.title.native ?? "(无日文原名)", 34)} ${pad(String(year), 6)}`;

    if (!keyword) {
      line += "— 跳过（AniList 三个名字全空，没法搜）";
      rows.push(line);
      continue;
    }

    try {
      const candidates = await searchBangumi(keyword);
      // 三个名字都拿去比：有些番 Bangumi 直接用英文名登记
      const hit = matchSubject([item.title.native, item.title.romaji, item.title.english], year, candidates);
      if (hit) {
        // summary 一并落盘：详情页的简介优先用这个中文的，拿不到才退回 AniList 的英文。
        // 空串统一写成 null，和项目里「缺数据就是 null」的习惯保持一致
        const summary = hit.summary?.trim() || null;
        index[String(item.id)] = { bangumi_id: hit.id, title_zh: hit.name_cn, summary };
        line += `${hit.name_cn}   [bgm ${hit.id} / ${hit.date || "无日期"} / 简介 ${summary ? summary.length + " 字" : "无"}]`;
      } else {
        line += `— 未匹配（拿到 ${candidates.length} 条候选，没有标题和年份都对得上的）`;
      }
    } catch (error) {
      failed++;
      line += `— 请求失败：${error instanceof Error ? error.message : String(error)}`;
    }

    rows.push(line);
    if (i < anime.length - 1) {
      await sleep(DELAY_MS);
    }
  }

  console.log(rows.join("\n"));

  // 按键排序，保证每次生成的 JSON 顺序一致，diff 才看得懂
  const sorted: BangumiIndex = {};
  for (const key of Object.keys(index).sort((a, b) => Number(a) - Number(b))) {
    sorted[key] = index[key];
  }

  await mkdir(path.dirname(OUTPUT_PATH), { recursive: true });
  await writeFile(OUTPUT_PATH, `${JSON.stringify(sorted, null, 2)}\n`, "utf8");

  const matched = Object.keys(sorted).length;
  console.log(`\n匹配 ${matched}/${anime.length}${failed > 0 ? `（另有 ${failed} 部请求失败，可重跑）` : ""}`);
  console.log(`已写入 ${OUTPUT_PATH}`);
}

await main();
