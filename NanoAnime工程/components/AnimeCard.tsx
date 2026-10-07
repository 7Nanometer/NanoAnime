import Image from "next/image";
import Link from "next/link";

import {
  getCardScheduleLabel,
  getPrimaryTitle,
  getScoreLabel,
  getYearLabel,
} from "@/lib/anime-display";
import { cn } from "@/lib/utils";
import type { Anime } from "@/types/anime";

/**
 * 封面墙上的单张卡片。**全站唯一的卡片组件**（首页新番墙、首页周表一行、
 * 高分合集、搜索结果共用）——不要再建第二套，两套卡片迟早会长歪。
 *
 * 2026-10-06 M7 视觉改版，按参考站版式重做。解剖自上而下：
 *   封面（竖版 2:3）
 *     ├ 右上角：评分药丸（星标 + 白字，深色半透明）
 *     └ 底部：一条时间信息（在播 → 「周二 23:30」下一集的播出时刻；
 *              其余 → 「已完结 / 待开播 / 停更中」）
 *   中文名（最多两行）
 *   年份（更弱的一档灰）
 *
 * 名字取中文名，没配上就是日文原名（lib/anime-display.ts 的兜底链保证不空）。
 * 整张卡片是一个链接，点进详情页 /anime/{id}。
 *
 * ─────────────────────────────────────────────────────────────
 * 三处必须守住的地方：
 *
 * 1. **时间条只报「下一集什么时候播」，绝不写「更新至第 N 集」**——
 *    后者会被读成"站内能看到第 N 集"，踩「不提供在线播放」的红线（文案由
 *    getCardScheduleLabel 统一保证，别在组件里自己拼）。
 *
 * 2. **名字固定两行高**（min-h-[2.6em]）：一行和两行的卡片混在一起时，
 *    同一行里每张卡的名字高度不一，下面的年份会参差不齐——封面墙最常见的破相。
 *
 * 3. **悬浮态用 transform 而不是改尺寸**：`group-hover:-translate-y-1` 只触发合成器，
 *    不触发重排；一屏近百张卡片同时悬浮也不会掉帧。
 *    ⚠️ 别改成 group-hover:scale-105 加在整张卡片上——封面已经在缩放了，
 *    卡片再缩放会有"双层缩放"的怪异感，而且会盖住相邻卡片。
 * ─────────────────────────────────────────────────────────────
 *
 * 图片走 Next/Image，域名白名单在 next.config.ts。开发环境那里关掉了图片优化
 * （原因见 next.config.ts 的注释），生产环境保持优化开启。
 */
export function AnimeCard({
  anime,
  priority = false,
  collection,
}: {
  anime: Anime;
  /**
   * 首屏可见的那几张传 true，让浏览器优先取图。
   * ⚠️ **不能全传 true**：一屏近百张全标优先，等于没有优先，
   * 还会把后面本来该懒加载的图一起抢带宽。只在首屏前几张用。
   */
  priority?: boolean;
  /**
   * 合集模式（2026-10-07 三期改版「高分合集」用）。有值时：
   *   ① 右上角评分药丸显示**合集均分**（不是这部作品自己的 AniList 分）；
   *   ② 封面底部不显示时间条，改显示「共 N 部」徽标——
   *      ⚠️ **仅 count >= 2 显示**：单部补齐的"合集"没有"共 N 部"这回事；
   *   ③ 名字下方那行从「年份」换成「{年份} · 评分 {合集均分}」。
   *
   * 传入的 anime 是合集**代表作品**（系列里 Bangumi 分最高的那部，脚本选好的）。
   */
  collection?: { count: number; score: number };
}) {
  const title = getPrimaryTitle(anime);
  const cover = anime.coverImage.extraLarge;
  // 合集模式显示合集均分（取整；排序按真实值、显示取整，见 build-collections 的注释）
  const score = collection ? String(Math.round(collection.score)) : getScoreLabel(anime.averageScore);

  return (
    <Link
      href={`/anime/${anime.id}`}
      className={cn(
        // reveal：滚动到视口时"浮现"（2026-10-07 深空星夜）。
        // ⚠️ 动的是 transform + opacity，而 hover 上浮走的是独立的 translate 属性
        // （Tailwind v4 的编译结果），两者叠加、互不覆盖——入场动画不会吃掉悬停上浮。
        // 不支持滚动驱动动画的浏览器直接看到完整内容（见 globals.css 的 @supports）。
        "group reveal flex flex-col gap-2.5 rounded-xl outline-none",
        // 悬浮时整张卡片轻微上浮。负外边距补回来，上浮时不会被裁掉
        "transition-transform duration-200 ease-[var(--ease-out-soft)] hover:-translate-y-1",
      )}
    >
      {/* 容器自带底色：封面没加载完时显示的是主题灰或封面主色，而不是一块白 */}
      <div
        className={cn(
          "relative aspect-[2/3] w-full overflow-hidden rounded-xl bg-surface",
          // 玻璃掠射光（顶部发丝亮线）+ 跟随鼠标的柔光斑（2026-10-07 顶级打磨）。
          // ⚠️ 这两个类的样式在 globals.css——卡片本身**不含任何 JS**：
          //    光斑位置由全局唯一的 CursorSpotlight 用事件委托统一写入
          //    （每个卡片自己挂 mousemove 会让一屏 21 张卡 = 21 个监听器）。
          "cover-gloss cover-spot",
          // 细描边让封面图在深底上有明确的边界；纯图片边缘贴在深底上会"融化"
          "ring-1 ring-border transition-all duration-200",
          "group-hover:ring-2 group-hover:ring-brand/60",
          // 星辉光晕（2026-10-07 深空星夜）：悬停时封面四周亮起一圈柔紫光。
          // 基础态必须是"同形状的全透明阴影"（而不是不写）——box-shadow 从
          // none 到具体值没法插值，过渡会变成硬切。
          // ⚠️ 用 box-shadow 而不是伪元素：封面容器是 overflow-hidden，
          // 伪元素的光晕画在容器内部、会被自己裁掉；box-shadow 画在盒子外面，不受裁剪。
          "shadow-[0_0_0_0_transparent] group-hover:shadow-[0_0_28px_-6px_var(--brand-soft)]",
        )}
        style={anime.coverImage.color ? { backgroundColor: anime.coverImage.color } : undefined}
      >
        {cover ? (
          <Image
            src={cover}
            alt={title}
            fill
            // 告诉浏览器不同屏幕下图片的实际显示宽度，避免下载过大的图。
            // ⚠️ 分档必须跟着网格的列数断点走（见 lib/anime-constants.ts 的 ANIME_GRID_CLASS）：
            // 10-07 加 xl 七列档之后末尾从 20vw 收紧到 13vw，否则宽屏按 20vw 取图、封面发糊
            sizes="(max-width: 640px) 50vw, (max-width: 768px) 33vw, (max-width: 1024px) 25vw, (max-width: 1280px) 20vw, 13vw"
            priority={priority}
            // 鼠标移上去时封面轻微放大，提示这张卡片可以点
            className="object-cover transition-transform duration-500 ease-[var(--ease-out-soft)] group-hover:scale-105"
          />
        ) : (
          // 兜底：极少数作品没有封面，用主色块 + 标题顶上，不留空白
          <span className="absolute inset-0 flex items-center justify-center p-2 text-center text-xs text-muted-foreground">
            {title}
          </span>
        )}

        {/*
          评分药丸（右上角）。
          深色半透明底是必须的：封面图明暗差别极大（有纯白的、有全黑的），
          白字直接压在图上，遇到浅色封面就没了。药丸自带一层稳定衬底，
          不依赖封面的明暗。只在有评分时出现（getScoreLabel 拿不到会返回「—」）。
        */}
        {score !== "—" ? (
          <span
            className={cn(
              // z-[2]：压在"跟随光斑"（伪元素 z-1）之上——光斑扫过时文字依旧清晰
              "absolute top-2 right-2 z-[2] inline-flex items-center gap-1 rounded-full",
              "bg-black/60 px-2 py-0.5 backdrop-blur-sm",
              "text-[11px] leading-none font-semibold text-white tabular-nums",
            )}
          >
            {/* 五角星用内联 SVG 而不是 emoji——emoji 在不同系统上长得完全不一样，不能当图标用 */}
            <svg viewBox="0 0 24 24" aria-hidden className="size-3 fill-brand-strong">
              <path d="M12 2l2.9 6.3 6.9.8-5.1 4.7 1.4 6.8L12 17.2 5.9 20.6l1.4-6.8L2.2 9.1l6.9-.8z" />
            </svg>
            {score}
          </span>
        ) : null}

        {/*
          封面底部一条信息。和评分药丸同一个理由：自带深色衬底，不赌封面明暗
          （模糊 + 55% 黑，最亮的封面底下也有一块足够暗的区域）。
          没有封面时不渲染——底下是纯色占位块，压一条黑条反而显脏。
          · 普通卡片 → 时间条（「周二 23:30」下一集的播出时刻）；
          · 合集卡片 → 「共 N 部」徽标（仅 count >= 2；单部补齐的合集什么都不显示）。
        */}
        {cover ? (
          collection ? (
            collection.count >= 2 ? (
              <span className="absolute inset-x-0 bottom-0 z-[2] block bg-black/55 px-2 py-1 text-center text-[11px] leading-none font-medium text-white backdrop-blur-sm">
                <span className="inline-flex items-center gap-1">
                  {/* 「合集」图标：上下两层的堆叠图形。内联 SVG，理由同五角星 */}
                  <svg
                    viewBox="0 0 24 24"
                    aria-hidden
                    className="size-3 fill-none stroke-current"
                    strokeWidth={2}
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <path d="M12 3 3 8l9 5 9-5-9-5Z" />
                    <path d="m3 14 9 5 9-5" />
                  </svg>
                  共 {collection.count} 部
                </span>
              </span>
            ) : null
          ) : (
            <span className="absolute inset-x-0 bottom-0 z-[2] block bg-black/55 px-2 py-1 text-center text-[11px] leading-none font-medium text-white backdrop-blur-sm">
              <span className="block truncate">{getCardScheduleLabel(anime)}</span>
            </span>
          )
        ) : null}
      </div>

      <div className="flex flex-col gap-0.5 px-0.5">
        {/*
          主标题限两行、固定高度。
          ⚠️ 必须给固定高度（两行的行高 × 2），否则标题一行和两行的卡片混在一起时，
          同一行里每张卡片的名字高度不一，下面的年份会参差不齐——这是封面墙最常见的破相。
        */}
        <h2 className="line-clamp-2 min-h-[2.6em] text-[13.5px] leading-[1.3] font-medium tracking-tight">
          {title}
        </h2>
        {/*
          年份行。
          · 普通卡片 → 「2026 年」（getYearLabel）；
          · 合集卡片 → 「2017 · 评分 86」（参考站的「年份 · 播放量」格式，
            播放量换成评分——⚠️ 绝不写"N.N 万播放"）。
          用 text-muted-soft，不要改回 muted-foreground/60——
          11px 的暖灰叠 60% 透明度实测只有 3.60:1，过不了 AA 的 4.5:1；
          muted-soft 是算过对比度的实色（三层底色上都 ≥ 4.6:1）。
        */}
        <p className="truncate text-[11px] leading-snug tabular-nums text-muted-soft">
          {collection
            ? `${anime.startDate?.year ?? "年份待定"} · 评分 ${Math.round(collection.score)}`
            : getYearLabel(anime)}
        </p>
      </div>
    </Link>
  );
}
