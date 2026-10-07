"use client";

import Link from "next/link";

import { AnimeCard } from "@/components/AnimeCard";
import { AnimeGridSkeleton } from "@/components/AnimeGridSkeleton";
import { useSeasonAnime } from "@/components/useSeasonAnime";
import { ANIME_GRID_CLASS, HERO_COUNT } from "@/lib/anime-constants";
import { getSeasonLabel } from "@/lib/anime-display";

/**
 * 本季新番封面墙。数据走 useSeasonAnime（与首页焦点位共用同一份请求与缓存）。
 *
 * 两种模式（2026-10-07 三期改版）：
 *   · **首页模式**（传 `limit`）：只渲染 `limit` 部，且从第 HERO_COUNT+1 部开始取
 *     ——跳过焦点位那几部，同一部番不在首页出现两次（口径见 lib/anime-constants.ts）。
 *     标题降为 h2「热门新番」，`showMore` 时右侧给「查看更多 ›」去 /updates 全量页。
 *   · **全量模式**（不传 `limit`）：整季全量，标题是页面级 h1 +「本季收录 N 部」。
 *     （/updates 全量页有自己的一页结构、不走这个组件的头部；这条路径保留给
 *     将来别的"整页列表"用。）
 *
 * 加载态用骨架屏（见 AnimeGridSkeleton 的注释）——
 * 原来那行灰字会在数据到达时把页面高度从 28px 撑到 2000px，是实打实的布局偏移。
 *
 * ⚠️ 网格列数的 class 来自 lib/anime-constants.ts 的 ANIME_GRID_CLASS——
 * 骨架屏 / 搜索页 / /updates 共用同一个值，不许在任何一处另抄一份。
 * 网格与骨架的列数只要差一档，数据到达的瞬间页面就会跳一下。
 */
export function AnimeGrid({ limit, showMore = false }: { limit?: number; showMore?: boolean }) {
  const { data, isPending, error, refetch } = useSeasonAnime();

  if (isPending) {
    // 骨架的张数跟着模式走：首页模式只显示 limit 张，骨架也铺 limit 张，
    // 数据到达时高度才不会跳（全量模式沿用默认的 20 张）
    return <AnimeGridSkeleton count={limit ?? 20} />;
  }

  // 三种异常情况都要给一句人话，不能留白屏
  if (error) {
    return <ErrorHint onRetry={() => refetch()} />;
  }

  if (data.anime.length === 0) {
    return <EmptyHint />;
  }

  // 首页模式跳过焦点位那几部（HERO_COUNT 的口径见 lib/anime-constants.ts）
  const items =
    limit === undefined ? data.anime : data.anime.slice(HERO_COUNT, HERO_COUNT + limit);

  return (
    <section>
      {/* 其它页面的入口已经挪到全站顶栏（components/SiteHeader.tsx），这里不再堆链接 */}
      <header className="mb-7 flex flex-wrap items-end justify-between gap-x-4 gap-y-2">
        <div>
          {limit === undefined ? (
            <>
              {/*
                「本季收录 N 部」——2026-10-06 M7 改版后这个数才敢写。
                原来只取第 1 页（人气前 20），写「共 N 部」会把"我们取了多少"说成
                "本季总共多少"，是假话。现在接口翻页取全（停在空页），N 就是**我们真收录到的**
                本季条数。措辞仍用「收录」不用「共」，原因有二：
                  ① 形式过滤排除了 MUSIC / SPECIAL（口径见 lib/anilist.ts 的 SEASON_FORMATS）；
                  ② AniList 上个别作品可能没标季度年份，不在这个查询里。
                判据不是"数字从哪来"，而是**这句话会不会被读成总数**（见验收文件的通用纪律）。
              */}
              <h1 className="section-mark text-2xl font-bold tracking-tight sm:text-[28px]">
                {data.seasonYear} 年{getSeasonLabel(data.season)}新番
              </h1>
              <p className="mt-2 text-sm text-muted-foreground">
                按人气排序 · 本季收录 <span className="tabular-nums">{data.anime.length}</span> 部
              </p>
            </>
          ) : (
            <>
              {/*
                ⚠️ 首页模式**不写**「本季收录 N 部」：那只在全量页成立，
                写在只显示 14 部的首页上等于把"我们显示了 14 部"说成"本季共 14 部"，是假话。
              */}
              <h2 className="section-mark text-2xl font-bold tracking-tight sm:text-[28px]">
                热门新番
              </h2>
              <p className="mt-2 text-sm text-muted-foreground">按人气排序</p>
            </>
          )}
        </div>
        {showMore ? (
          <Link
            href="/updates"
            className="group inline-flex shrink-0 items-center gap-0.5 rounded-md text-sm font-medium text-brand-strong transition-colors duration-150 hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
          >
            查看更多
            <span aria-hidden className="transition-transform duration-150 group-hover:translate-x-0.5">
              ›
            </span>
          </Link>
        ) : null}
      </header>

      <div className={ANIME_GRID_CLASS}>
        {items.map((anime, index) => (
          <AnimeCard
            key={anime.id}
            anime={anime}
            // 首屏第一行（xl 断点下正好 7 张）优先加载。
            // ⚠️ 不要给整墙都加，那样等于没有优先级，还挤掉了后面本该懒加载的图
            priority={index < 7}
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
 * 导出给 /updates 与首页周表一行（CalendarStrip）复用——同一个数据源、同一种失败，
 * 不许复制第二份。message 只换第一句（"本季新番"还是"周表"），第二句通用。
 */
export function ErrorHint({
  onRetry,
  message = "没能加载到本季新番，多半是网络超时。",
}: {
  onRetry: () => void;
  message?: string;
}) {
  return (
    <div className="flex flex-col items-center gap-4 py-20 text-center">
      <p className="text-sm leading-relaxed text-muted-foreground">
        {message}
        <br />
        过一会儿重试通常就好。
      </p>
      <button
        type="button"
        onClick={onRetry}
        className="sheen cursor-pointer rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-opacity duration-150 hover:opacity-90 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
      >
        重试
      </button>
    </div>
  );
}

/**
 * 收录列表为空时的提示。给出下一步去处，不留死路。
 *
 * 导出给 /updates 与 CalendarStrip 复用。两段文案都可换：
 *   · title 换"空的是什么"（这一季没收录 / 这一周没排期）；
 *   · note 换去处建议——默认那句指向「上面的周表」，只在首页成立。
 */
export function EmptyHint({
  title = "这一季还没有收录到作品。",
  note = "可以先看看上面的「追番周表」，本周有哪些番在播。",
}: {
  title?: string;
  note?: string;
}) {
  return (
    <div className="flex flex-col items-center gap-3 py-20 text-center">
      <p className="text-sm text-muted-foreground">{title}</p>
      <p className="text-xs text-muted-foreground/80">{note}</p>
    </div>
  );
}
