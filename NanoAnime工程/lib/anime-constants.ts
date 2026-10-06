// 跨组件共用的版式/取数口径常量。
//
// 为什么单独一个文件、而不是塞进各个组件：这些值的特征是「多处必须同源」——
// 一边改了另一边没改不会报错，只会静默出偏差（例子都写在各自的注释里）。

/**
 * 封面墙网格的列数断点。AnimeGrid / AnimeGridSkeleton / AnimeSearch / /updates 共用。
 *
 * ⚠️ 骨架屏与真实网格必须同源：两者列数不一致时，数据到达的瞬间页面会跳一下，
 * 而骨架屏存在的全部意义就是防这个跳（见 components/AnimeGridSkeleton.tsx 的注释）。
 *
 * ⚠️ 放在 lib/ 而不是 AnimeGrid.tsx 里：AnimeGridSkeleton 也要用它，
 * 而 AnimeGrid 已经 import 了 AnimeGridSkeleton——再从骨架屏反向 import AnimeGrid
 * 就成环了。
 */
export const ANIME_GRID_CLASS =
  "grid grid-cols-2 gap-x-4 gap-y-6 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5";
