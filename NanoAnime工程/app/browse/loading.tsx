import { AnimeGridSkeleton } from "@/components/AnimeGridSkeleton";
import { SITE_CONTAINER } from "@/lib/layout";

/**
 * 「全部番剧」的加载骨架（2026-10-09）。
 *
 * 点筛选胶囊 / 翻页是服务端导航——等待期间 Next 用这个文件替换页面内容。
 * 骨架必须把「标题 + 筛选区 + 网格」三段的高度都占住，否则数据到达时
 * 整页会往下跳——骨架存在的全部意义就是防这个跳（见 AnimeGridSkeleton 注释）。
 *
 * ⚠️ 网格部分直接用 AnimeGridSkeleton（showTitle 关掉、它自带 28 张卡），
 * 它和真实网格共用同一个 ANIME_GRID_CLASS，列数不会跑偏。
 */
export default function BrowseLoading() {
  return (
    <main className={`${SITE_CONTAINER} py-8 sm:py-10`}>
      {/* 标题条 + 副标题条（与真实 header 的高度近似） */}
      <div className="mb-6 space-y-2">
        <div className="h-9 w-52 animate-pulse rounded-md bg-surface" />
        <div className="h-4 w-72 animate-pulse rounded bg-surface" />
      </div>

      {/* 筛选区占位：桌面约 7 行胶囊的高度 */}
      <div className="h-64 animate-pulse rounded-xl border border-border bg-surface/50" />

      <div className="mt-7">
        <AnimeGridSkeleton count={28} showTitle={false} />
      </div>
    </main>
  );
}
