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
  "grid grid-cols-2 gap-x-4 gap-y-6 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-7";

/**
 * 首页焦点位轮播的条数（2026-10-07 三期改版从 5 提到 7）。
 *
 * ⚠️ **三处必须同源**：HeroSpotlight 取前 N 部轮播；`/api/anime/season` 只给前 N 部
 * 补中文简介；AnimeGrid 的首页模式从第 N+1 部开始取（跳过焦点位那几部，
 * 避免同一部在首页出现两次）。任何一处写歪都不会报错——症状是焦点位后几部
 * 突然没有简介段、或首页同一部番出现两次，都属于"看起来对但其实错了"。
 */
export const HERO_COUNT = 7;

/**
 * 首页新番墙显示多少部（2026-10-09 电影化改版引入）。
 *
 * ⚠️ **两处必须同源**：`app/page.tsx` 传给 AnimeGrid 的 limit、
 * `components/SeasonTopRail.tsx` 计算"遗珠"候选时的跳过数（HERO_COUNT + 它）。
 * 一边改、另一边没改不会报错——症状是首页出现重复封面（遗珠轨收进了墙上已有的番）。
 */
export const HOME_WALL_COUNT = 14;
