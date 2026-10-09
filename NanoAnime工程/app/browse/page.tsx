import type { Metadata } from "next";
import Link from "next/link";

import { AnimeCard } from "@/components/AnimeCard";
import { BrowseFilters } from "@/components/BrowseFilters";
import { BrowsePagination } from "@/components/BrowsePagination";
import { ANIME_GRID_CLASS } from "@/lib/anime-constants";
import { fetchBrowseAnime, type BrowseResult } from "@/lib/anilist";
import { attachZh, buildBrowseHref, parseBrowseParams, toBrowseQuery } from "@/lib/browse";
import { SITE_CONTAINER } from "@/lib/layout";
import { cn } from "@/lib/utils";

export const metadata: Metadata = {
  title: "全部番剧 · NanoAnime番鉴",
  description: "按形式、状态、年份、标签自由组合筛选，浏览全部番剧。",
};

/**
 * 「全部番剧」浏览页（2026-10-09）。
 *
 * 分工三层，各自一个文件：
 *   · 网址参数 ↔ 筛选状态：lib/browse.ts（白名单 / 默认值 / 链接生成）
 *   · 筛选状态 → AniList 查询：lib/anilist.ts 的 fetchBrowseAnime
 *   · 本文件：读参数 → 取数 → 摆版面
 *
 * ⚠️ 「共 N 部」的数字来自 AniList 的 pageInfo.total，实测有 **5000 封顶**——
 * 所以数字达到 5000 时显示「5000+」而不是「5000」。这是本项目对待数字的
 * 老纪律（同「本季收录 N 部」）：宁可说"至少这么多"，不能把一个截断值
 * 装成总数。
 *
 * 取数失败不抛给错误边界：AniList 偶发超时/限流是全站常态，这里兜住、
 * 给一句人话 + 一个「重试」（整页链接——用 <a> 而不是 <Link>，要它真正
 * 重新发一次请求，而不是吃客户端路由的缓存）。
 */
export default async function BrowsePage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = parseBrowseParams(await searchParams);

  let result: BrowseResult;
  try {
    result = await fetchBrowseAnime(toBrowseQuery(params));
  } catch {
    return (
      <main className={`${SITE_CONTAINER} py-8 sm:py-10`}>
        <h1 className="section-mark text-2xl font-bold tracking-tight sm:text-[28px]">
          浏览全部番剧
        </h1>
        <div className="mt-8 flex flex-col items-center gap-4 rounded-xl border border-border bg-surface/50 py-16 text-center">
          <p className="text-sm leading-relaxed text-muted-foreground">
            没能加载到番剧列表，多半是数据源超时。
            <br />
            过一会儿重试通常就好。
          </p>
          <a
            href={buildBrowseHref(params, { page: params.page })}
            className="sheen rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-opacity duration-150 hover:opacity-90 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
          >
            重试
          </a>
        </div>
      </main>
    );
  }

  const anime = attachZh(result.anime);
  // ⚠️ 5000 封顶的处理：达到封顶值时显示 "5000+"（见文件头注释）
  const totalLabel = result.total >= 5000 ? "5000+" : String(result.total);
  const hasResults = anime.length > 0;

  return (
    <main className={`${SITE_CONTAINER} py-8 sm:py-10`}>
      <header className="mb-6">
        <h1 className="section-mark text-2xl font-bold tracking-tight sm:text-[28px]">
          浏览全部番剧
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          按形式 / 状态 / 年份 / 标签自由组合筛选
          {/* 结果为 0 时不报「共 0 部」——空态区已有完整说明，不重复念叨 */}
          {result.total > 0 ? (
            <>
              {" · 共 "}
              <span className="tabular-nums">{totalLabel}</span> 部
            </>
          ) : null}
        </p>
      </header>

      <BrowseFilters current={params} />

      {hasResults ? (
        <>
          {/*
            ⚠️ scroll-mt-10 只补窄屏：320px 超窄屏下顶栏会折成约 121px 高
            （导航两行），比全局 scrollPaddingTop(5rem=80px) 多出约 41px——
            不补的话翻页落点会被顶栏遮掉第一行卡片的上沿。sm 以上顶栏回到
            约 57px，scroll-mt 归零、维持全局值。
          */}
          <div id="anime-list" className={cn(ANIME_GRID_CLASS, "mt-7 scroll-mt-10 sm:scroll-mt-0")}>
            {anime.map((item, index) => (
              <AnimeCard
                key={item.id}
                anime={item}
                // 首屏第一行（xl 断点下正好 7 张）优先加载——同 AnimeGrid 的口径
                priority={index < 7}
              />
            ))}
          </div>
          <BrowsePagination current={params} page={params.page} lastPage={result.lastPage} />
        </>
      ) : (
        <div className="mt-7 flex flex-col items-center gap-3 rounded-xl border border-dashed border-border py-20 text-center">
          <p className="text-sm text-muted-foreground">
            {result.total === 0
              ? "没有找到符合条件的番剧。"
              : "这一页没有内容，页码可能超出了结果范围。"}
          </p>
          <p className="text-xs text-muted-foreground/80">
            {result.total === 0
              ? "换一组筛选组合试试，或者点上面的「全部」重新开始。"
              : "点下面的链接回到第 1 页。"}
          </p>
          {params.page > 1 ? (
            <Link
              href={buildBrowseHref(params, { page: 1 })}
              className="mt-1 rounded-lg border border-border bg-surface px-4 py-1.5 text-sm text-foreground transition-colors duration-150 hover:border-brand/50 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
            >
              回到第 1 页
            </Link>
          ) : null}
        </div>
      )}
    </main>
  );
}
