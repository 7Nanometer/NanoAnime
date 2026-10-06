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
 * 封面墙上的单张卡片。**全站唯一的卡片组件**（首页新番墙、搜索结果共用）——
 * 不要再建第二套，两套卡片迟早会长歪。
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
}: {
  anime: Anime;
  /**
   * 首屏可见的那几张传 true，让浏览器优先取图。
   * ⚠️ **不能全传 true**：一屏近百张全标优先，等于没有优先，
   * 还会把后面本来该懒加载的图一起抢带宽。只在首屏前几张用。
   */
  priority?: boolean;
}) {
  const title = getPrimaryTitle(anime);
  const cover = anime.coverImage.extraLarge;
  const score = getScoreLabel(anime.averageScore);

  return (
    <Link
      href={`/anime/${anime.id}`}
      className={cn(
        "group flex flex-col gap-2.5 rounded-xl outline-none",
        // 悬浮时整张卡片轻微上浮。负外边距补回来，上浮时不会被裁掉
        "transition-transform duration-200 ease-[var(--ease-out-soft)] hover:-translate-y-1",
      )}
    >
      {/* 容器自带底色：封面没加载完时显示的是主题灰或封面主色，而不是一块白 */}
      <div
        className={cn(
          "relative aspect-[2/3] w-full overflow-hidden rounded-xl bg-surface",
          // 细描边让封面图在深底上有明确的边界；纯图片边缘贴在深底上会"融化"
          "ring-1 ring-border transition-all duration-200",
          "group-hover:ring-2 group-hover:ring-brand/60",
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
              "absolute top-2 right-2 inline-flex items-center gap-1 rounded-full",
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
          底部时间条。和评分药丸同一个理由：自带深色衬底，不赌封面明暗
          （模糊 + 55% 黑，最亮的封面底下也有一块足够暗的区域）。
          没有封面时不渲染——底下是纯色占位块，压一条黑条反而显脏。
        */}
        {cover ? (
          <span className="absolute inset-x-0 bottom-0 block bg-black/55 px-2 py-1 text-center text-[11px] leading-none font-medium text-white backdrop-blur-sm">
            <span className="block truncate">{getCardScheduleLabel(anime)}</span>
          </span>
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
          年份行。用 text-muted-soft，不要改回 muted-foreground/60——
          11px 的暖灰叠 60% 透明度实测只有 3.60:1，过不了 AA 的 4.5:1；
          muted-soft 是算过对比度的实色（三层底色上都 ≥ 4.6:1）。
        */}
        <p className="truncate text-[11px] leading-snug tabular-nums text-muted-soft">
          {getYearLabel(anime)}
        </p>
      </div>
    </Link>
  );
}
