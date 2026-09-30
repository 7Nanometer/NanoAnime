import Image from "next/image";
import Link from "next/link";

import {
  getAiringStatus,
  getMetaLine,
  getPrimaryTitle,
  getSecondaryTitle,
  getYearLabel,
} from "@/lib/anime-display";
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
 * @param showYear 第三行显示首播年份而不是更新状态。搜索结果跨年份，需要靠年份区分续作；
 *                 首页不传，行为与 M0 完全一致
 */
export function AnimeCard({ anime, showYear = false }: { anime: Anime; showYear?: boolean }) {
  const title = getPrimaryTitle(anime);
  const cover = anime.coverImage.extraLarge;
  const meta = getMetaLine(anime);

  return (
    <Link
      href={`/anime/${anime.id}`}
      className="group flex flex-col gap-2 rounded-lg outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      {/* 容器自带底色：封面没加载完时显示的是主题灰或封面主色，而不是一块白 */}
      <div
        className="relative aspect-[2/3] w-full overflow-hidden rounded-lg bg-muted"
        style={anime.coverImage.color ? { backgroundColor: anime.coverImage.color } : undefined}
      >
        {cover ? (
          <Image
            src={cover}
            alt={title}
            fill
            // 告诉浏览器不同屏幕下图片的实际显示宽度，避免下载过大的图
            sizes="(max-width: 640px) 50vw, (max-width: 768px) 33vw, (max-width: 1024px) 25vw, 20vw"
            // 鼠标移上去时封面轻微放大，提示这张卡片可以点
            className="object-cover transition-transform duration-200 group-hover:scale-105"
          />
        ) : (
          // 兜底：极少数作品没有封面，用主色块 + 标题顶上，不留空白
          <span className="absolute inset-0 flex items-center justify-center p-2 text-center text-xs text-muted-foreground">
            {title}
          </span>
        )}
      </div>

      <div className="flex flex-col gap-0.5">
        <h2 className="text-sm leading-snug font-medium">{title}</h2>
        <p className="text-xs leading-snug text-muted-foreground">{getSecondaryTitle(anime)}</p>
        <p className="text-xs text-muted-foreground">
          {showYear ? getYearLabel(anime) : getAiringStatus(anime)}
        </p>
        {meta ? <p className="text-xs text-muted-foreground/70">{meta}</p> : null}
      </div>
    </Link>
  );
}
