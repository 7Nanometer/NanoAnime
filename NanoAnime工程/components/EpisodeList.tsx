import type { EpisodeListResult } from "@/lib/anime-display";

/**
 * 剧集列表。每行：第 N 集 + 标题（没有就留空）+ 播出日期（没有就「—」）。
 *
 * 规则见 lib/anime-display.ts 的 buildEpisodeRows()：
 * 以总集数为准列全，AniList 没给数据的那集日期如实显示「—」，不编造。
 *
 * 2026-10-09 电影化改版：≥lg 时排成**双栏**。原来 26 集会拉成一条又窄又长的
 * 单栏（只用了版心一半的宽度，页面被拉得极长）；双栏后同样内容缩一半高度。
 * ⚠️ 双栏下 divide-y 不能用（它只连纵向邻居、网格里会错位）——每行改成
 * 自带的底边框，最后一行（双栏时是最后两行）由 [&:last-child] / nth-last-child 收掉。
 */
export function EpisodeList({ list }: { list: EpisodeListResult }) {
  if (list.rows.length === 0) {
    return (
      <p className="rounded-xl border border-dashed border-border px-4 py-6 text-center text-sm text-muted-foreground">
        暂无剧集信息——AniList 上没有这部作品的排期数据。
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      {list.truncated ? (
        <p className="text-xs text-muted-foreground">
          共 {list.total} 集，此处只列出 AniList 有排期数据的 {list.rows.length} 集。
        </p>
      ) : null}

      <ol className="grid overflow-hidden rounded-xl border border-border bg-surface/50 lg:grid-cols-2 lg:gap-x-8">
        {list.rows.map((row) => (
          <li
            key={row.number}
            className="flex items-baseline gap-3 border-b border-border/70 px-3.5 py-2.5 text-sm transition-colors duration-150 last:border-b-0 hover:bg-brand-tint lg:[&:nth-last-child(-n+2)]:border-b-0"
          >
            <span className="w-14 shrink-0 text-xs tabular-nums text-muted-foreground">
              第 {row.number} 集
            </span>
            {/* 大多数番没有集标题（AniList 只对上了 Crunchyroll 的番才有），留空即可 */}
            <span className="min-w-0 flex-1 truncate">{row.title ?? ""}</span>
            <span className="shrink-0 text-xs tabular-nums text-muted-foreground">
              {row.dateLabel}
            </span>
          </li>
        ))}
      </ol>
    </div>
  );
}
