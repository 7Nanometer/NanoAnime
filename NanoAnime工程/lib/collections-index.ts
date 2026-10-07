// 读「高分合集」数据文件的运行时入口（**服务端专用**）。
//
// 数据由 scripts/build-collections.ts 离线算好、落进 data/collections.json——
// 应用运行时**只读这个文件，绝不实时请求 AniList**（宪法铁律 6：运行时零外网依赖）。
// 写法照 lib/bangumi-index.ts：JSON 在构建时就被打进服务端产物，运行时零 I/O 成本。
//
// ⚠️ 它只能在服务端组件里 import（引了 @/data 的 JSON + 无 "use client"）——
// 首页是服务端组件，读好后把数据当 props 传给客户端组件渲染。

import rawCollections from "@/data/collections.json";
import type { Collection } from "@/types/anime";

/**
 * JSON 导入的类型是按文件内容推断的，这里断言成我们约定的结构。
 * 文件由脚本生成，结构由 scripts/build-collections.ts 兜着。
 */
const COLLECTIONS = rawCollections as Collection[];

/**
 * 首页显示几条：三行 × 7。
 * 脚本输出的排序已经按定稿口径排好（count>=2 在前、均分降序、不足 21 才用单部补齐），
 * 这里直接切片，**不要在前端重排**——重排会把"系列优先"这条规则丢掉。
 */
const DISPLAY_COUNT = 21;

export function getTopCollections(): Collection[] {
  return COLLECTIONS.slice(0, DISPLAY_COUNT);
}
