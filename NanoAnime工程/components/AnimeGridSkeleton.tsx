import { ANIME_GRID_CLASS } from "@/lib/anime-constants";

/**
 * 封面墙的骨架屏。
 *
 * ⚠️ 为什么必须做成骨架而不是保留原来的「正在加载本季新番…」一行灰字：
 *
 * 用 shadcn / UI 通用规范里那条准则说就是——**内容加载用骨架（Skeleton），
 * 不要用转圈或纯文字提示**。原因有三条，本站三条都占：
 *   1. 原来那行字只有一行高（约 28px），而真实内容是一整墙 2:3 的封面（几千像素高）。
 *      数据一到，页面高度瞬间从 28px 撑成一面墙 —— **这就是 CLS（布局偏移）**，
 *      用户刚把手指伸向"追番周表"入口，目标已经被推走了。
 *      骨架屏提前把高度占住（默认铺 20 张，够填满首屏），数据到了原地替换，页面纹丝不动。
 *   2. 骨架屏直接告诉用户"这里会出现一排封面"，而不是一句"正在加载"让他猜要等什么。
 *   3. 深色界面里纯文字加载态最容易让人以为"页面坏了"——一屏全黑加一行小字，
 *      和错误页几乎分不出来。
 *
 * 尺寸、圆角、栅格列数与 AnimeCard 严格对齐（同一套 gap / 断点），
 * 否则替换的瞬间会有一像素级的跳动，等于白做。
 */
export function AnimeGridSkeleton({ count = 20 }: { count?: number }) {
  return (
    <div
      // aria-busy + aria-live 让读屏软件知道"这儿在加载"，而不是念出一堆空 div
      role="status"
      aria-busy="true"
      aria-label="正在加载番剧列表"
    >
      {/* 标题占位。宽度固定成一个典型标题的宽度，别占满整行——占满会显得很假 */}
      <div className="mb-6 h-7 w-64 animate-pulse rounded-md bg-surface" />

      <div className={ANIME_GRID_CLASS}>
        {Array.from({ length: count }, (_, index) => (
          <div key={index} className="flex flex-col gap-2.5">
            {/* 封面占位：2:3，和 AnimeCard 的封面容器同比例同圆角 */}
            <div className="aspect-[2/3] w-full animate-pulse rounded-xl bg-surface" />
            <div className="flex flex-col gap-1.5 px-0.5">
              {/* 两行标题占位。min-h 与 AnimeCard 里标题的 min-h-[2.6em] 对齐 */}
              <div className="min-h-[2.6em] space-y-1.5">
                <div className="h-3.5 w-full animate-pulse rounded bg-surface" />
                <div className="h-3.5 w-2/3 animate-pulse rounded bg-surface" />
              </div>
              <div className="h-3 w-1/2 animate-pulse rounded bg-surface" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
