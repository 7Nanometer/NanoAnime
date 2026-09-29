import Image from "next/image";

import {
  getAiringStatus,
  getMetaLine,
  getPrimaryTitle,
  getSecondaryTitle,
} from "@/lib/anime-display";
import type { Anime } from "@/types/anime";

/**
 * 封面墙上的单张卡片：封面 + 日文原名 + 英文名 + 更新状态（+ 有数据时才显示的集数/评分）。
 * 文字一律走 lib/anime-display.ts 里的取数函数，那些函数保证不返回 null / 空字符串。
 *
 * 图片走 Next/Image，域名白名单在 next.config.ts。开发环境那里关掉了图片优化
 * （原因见 next.config.ts 的注释），生产环境保持优化开启。
 */
export function AnimeCard({ anime }: { anime: Anime }) {
  const title = getPrimaryTitle(anime);
  const cover = anime.coverImage.extraLarge;
  const meta = getMetaLine(anime);

  return (
    <article className="flex flex-col gap-2">
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
            className="object-cover"
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
        <p className="text-xs text-muted-foreground">{getAiringStatus(anime)}</p>
        {meta ? <p className="text-xs text-muted-foreground/70">{meta}</p> : null}
      </div>
    </article>
  );
}
