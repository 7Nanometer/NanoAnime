"use client";

import { AnimeCard } from "@/components/AnimeCard";
import { AnimeGridSkeleton } from "@/components/AnimeGridSkeleton";
import { useSeasonAnime } from "@/components/useSeasonAnime";
import { getSeasonLabel } from "@/lib/anime-display";
import { ANIME_GRID_CLASS } from "@/lib/anime-constants";

/**
 * 本季新番封面墙。数据走 useSeasonAnime（与首页焦点位共用同一份请求与缓存）。
 *
 * 加载态用骨架屏（见 AnimeGridSkeleton 的注释）——
 * 原来那行灰字会在数据到达时把页面高度从 28px 撑到 2000px，是实打实的布局偏移。
 *
 * ⚠️ 网格列数的 class 来自 `lib/anime-constants.ts` 的 ANIME_GRID_CLASS——
 * 骨架屏、搜索页和 /updates 页共用同一个值，不许在任何一处另抄一份。
 * 网格与骨架的列数只要差一档，数据到达的瞬间页面就会跳一下。
 */
export function AnimeGrid() {
  const { data, isPending, error, refetch } = useSeasonAnime();

  if (isPending) {
    return <AnimeGridSkeleton />;
  }

  // 三种异常情况都要给一句人话，不能留白屏
  if (error) {
    return <ErrorHint onRetry={() => refetch()} />;
  }

  if (data.anime.length === 0) {
    return <EmptyHint />;
  }

  return (
    <section>
      {/* 其它页面的入口已经挪到全站顶栏（components/SiteHeader.tsx），这里不再堆链接 */}
      {/*
        「本季收录 N 部」——2026-10-06 M7 改版后这个数才敢写。
        原来只取第 1 页（人气前 20），写「共 N 部」会把"我们取了多少"说成
        "本季总共多少"，是假话。现在接口翻页取全（停在空页），N 就是**我们真收录到的**
        本季条数。措辞仍用「收录」不用「共」，原因有二：
          ① 形式过滤排除了 MUSIC / SPECIAL（口径见 lib/anilist.ts 的 SEASON_FORMATS）；
          ② AniList 上个别作品可能没标季度年份，不在这个查询里。
        判据不是"数字从哪来"，而是**这句话会不会被读成总数**（见验收文件的通用纪律）。
      */}
      <header className="mb-7">
        <h1 className="section-mark text-2xl font-bold tracking-tight sm:text-[28px]">
          {data.seasonYear} 年{getSeasonLabel(data.season)}新番
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          按人气排序 · 本季收录 <span className="tabular-nums">{data.anime.length}</span> 部
        </p>
      </header>

      <div className={ANIME_GRID_CLASS}>
        {data.anime.map((anime, index) => (
          <AnimeCard
            key={anime.id}
            anime={anime}
            // 首屏前 5 张优先加载：lg 断点下正好是第一行。
            // ⚠️ 不要给整墙都加，那样等于没有优先级，还挤掉了后面本该懒加载的图
            priority={index < 5}
          />
        ))}
      </div>
    </section>
  );
}

/**
 * 加载失败。
 *
 * ⚠️ 比原来多了一个「重试」按钮。原来只写「加载失败：xxx」，用户唯一的出路是刷新整页。
 * 而这里失败的原因通常是海外数据源超时（国内访问 AniList 的老问题，详情页和追番周表
 * 早就都给了重试入口），重试的成功率其实很高——不给按钮等于让用户白等一次加载。
 *
 * 导出是给 `/updates` 页复用的——同一个数据源、同一种失败，不许复制第二份。
 */
export function ErrorHint({ onRetry }: { onRetry: () => void }) {
  return (
    <div className="flex flex-col items-center gap-4 py-20 text-center">
      <p className="text-sm leading-relaxed text-muted-foreground">
        没能加载到本季新番，多半是网络超时。
        <br />
        过一会儿重试通常就好。
      </p>
      <button
        type="button"
        onClick={onRetry}
        className="cursor-pointer rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-opacity duration-150 hover:opacity-90 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
      >
        重试
      </button>
    </div>
  );
}

/**
 * 这一季确实一部都没收录到。给出下一步去处，不留死路。
 *
 * 导出是给 `/updates` 页复用的（同 ErrorHint）。`note` 用来替换第二行的去处建议——
 * 默认那句指向「上面的周表」，只在首页成立；其它页面上要传自己那句。
 */
export function EmptyHint({
  note = "可以先看看上面的「追番周表」，本周有哪些番在播。",
}: {
  note?: string;
}) {
  return (
    <div className="flex flex-col items-center gap-3 py-20 text-center">
      <p className="text-sm text-muted-foreground">这一季还没有收录到作品。</p>
      <p className="text-xs text-muted-foreground/80">{note}</p>
    </div>
  );
}
