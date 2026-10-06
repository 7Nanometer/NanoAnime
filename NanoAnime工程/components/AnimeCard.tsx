import Image from "next/image";
import Link from "next/link";

import {
  getAiringStatus,
  getMetaLine,
  getPrimaryTitle,
  getScoreLabel,
  getSecondaryTitle,
  getYearLabel,
} from "@/lib/anime-display";
import { cn } from "@/lib/utils";
import type { Anime } from "@/types/anime";

/**
 * 封面墙上的单张卡片：封面 + 名字 + 第三行（更新状态，或搜索结果里的年份）
 * +（有数据时才显示的集数/评分）。
 * 名字取两行：主标题优先中文名（Bangumi 补的），没配上就是日文原名；副标题相应给日文原名或英文名。
 * 文字一律走 lib/anime-display.ts 里的取数函数，那些函数保证不返回 null / 空字符串。
 *
 * 整张卡片是一个链接，点进详情页 /anime/{id}。
 *
 * 图片走 Next/Image，域名白名单在 next.config.ts。开发环境那里关掉了图片优化
 * （原因见 next.config.ts 的注释），生产环境保持优化开启。
 *
 * ─────────────────────────────────────────────────────────────
 * 视觉处理（M6 视觉重构），三处关键改动：
 *
 * 1. **封面底部加了一层由黑到透明的渐变**，并在上面叠一个评分徽章。
 *    为什么必须加这层渐变：AniList 的封面图明暗差别极大（有纯白的、有全黑的），
 *    白底封面上的白色角标、或者黑底封面上的深色角标都会消失。
 *    先铺一层底部渐变，角标就永远有一块稳定的"衬托底"。
 *
 * 2. **名字从纯文字改成有层次的排版**：主标题提到 13.5px/中等字重，副标题降到 11px，
 *    第三行日期用更弱的透明度。原来三行字号几乎一样（14/12/12/12），
 *    一屏 20 张卡片看下来眼睛没有落点。
 *
 * 3. **悬浮态用 transform 而不是改尺寸**。`group-hover:-translate-y-1` 只触发合成器，
 *    不触发重排；一屏 20 张卡片同时悬浮也不会掉帧。
 *    ⚠️ 别改成 group-hover:scale-105 加在整张卡片上——封面已经在缩放了，
 *    卡片再缩放会有"双层缩放"的怪异感，而且会盖住相邻卡片。
 * ─────────────────────────────────────────────────────────────
 *
 * @param showYear 第三行显示首播年份而不是更新状态。搜索结果跨年份，需要靠年份区分续作；
 *                 首页不传，行为与 M0 完全一致
 */
export function AnimeCard({
  anime,
  showYear = false,
  priority = false,
}: {
  anime: Anime;
  showYear?: boolean;
  /**
   * 首屏可见的那几张传 true，让浏览器优先取图。
   * ⚠️ **不能全传 true**：一屏 20 张全标优先，等于没有优先，
   * 还会把后面本来该懒加载的图一起抢带宽。只在首屏前几张用。
   */
  priority?: boolean;
}) {
  const title = getPrimaryTitle(anime);
  const secondary = getSecondaryTitle(anime);
  const cover = anime.coverImage.extraLarge;
  const meta = getMetaLine(anime);
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
            // 告诉浏览器不同屏幕下图片的实际显示宽度，避免下载过大的图
            sizes="(max-width: 640px) 50vw, (max-width: 768px) 33vw, (max-width: 1024px) 25vw, 20vw"
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
          底部渐变衬托层。
          ⚠️ 它只在有封面时才需要——没有封面时底下是纯色块，渐变反而显脏。
          用了 to-transparent 的两段式（黑 55% → 透明），保证无论封面是亮是暗，
          底部这一带都有一块足够暗的区域。
        */}
        {cover ? (
          <div
            aria-hidden
            className="pointer-events-none absolute inset-x-0 bottom-0 h-2/5 bg-linear-to-t from-black/75 via-black/35 to-transparent"
          />
        ) : null}

        {/* 评分徽章。只在有评分时出现（getScoreLabel 拿不到会返回「—」，那种情况不显示徽章） */}
        {score !== "—" ? (
          <span
            className={cn(
              "absolute bottom-2 left-2 inline-flex items-center gap-1 rounded-md",
              "bg-black/55 px-1.5 py-0.5 backdrop-blur-sm",
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
      </div>

      <div className="flex flex-col gap-0.5 px-0.5">
        {/*
          主标题限两行。
          ⚠️ 必须给固定高度（两行的行高 × 2），否则标题一行和两行的卡片混在一起时，
          同一行里每张卡片的名字高度不一，下面的副标题会参差不齐——这是封面墙最常见的破相。
        */}
        <h2 className="line-clamp-2 min-h-[2.6em] text-[13.5px] leading-[1.3] font-medium tracking-tight">
          {title}
        </h2>
        {secondary !== title ? (
          <p className="truncate text-[11px] leading-snug text-muted-foreground">{secondary}</p>
        ) : null}
        <p className="truncate text-[11px] leading-snug text-muted-foreground">
          {showYear ? getYearLabel(anime) : getAiringStatus(anime)}
        </p>
        {meta ? (
          /*
            ⚠️ 这行用 text-muted-soft，不要改回 text-muted-foreground/60。
            11px 的暖灰叠 60% 透明度实测只有 3.60:1，过不了 AA 的 4.5:1；
            muted-soft 是算过对比度的实色（三层底色上都 ≥ 4.6:1）。
            它是全站最暗的一档文字色，到此为止——再暗就该考虑删掉这行信息了。
          */
          <p className="truncate text-[11px] leading-snug tabular-nums text-muted-soft">
            {meta}
          </p>
        ) : null}
      </div>
    </Link>
  );
}
