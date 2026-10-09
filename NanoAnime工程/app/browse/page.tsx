import type { Metadata } from "next";
import Link from "next/link";

import { AnimeCard } from "@/components/AnimeCard";
import { BrowseFilters } from "@/components/BrowseFilters";
import { BrowsePagination } from "@/components/BrowsePagination";
import { ANIME_GRID_CLASS } from "@/lib/anime-constants";
import {
  BROWSE_MAX_PAGE,
  BROWSE_PAGE_SIZE,
  fetchBrowseAnime,
  type BrowseResult,
} from "@/lib/anilist";
import { attachLocalData, buildBrowseHref, parseBrowseParams, toBrowseQuery } from "@/lib/browse";
import { getCatalogCount } from "@/lib/catalog";
import { SITE_CONTAINER } from "@/lib/layout";
import { cn } from "@/lib/utils";

export const metadata: Metadata = {
  title: "全部番剧 · NanoAnime番鉴",
  description: "按形式、状态、年份、标签自由组合筛选，浏览全部番剧。",
};

/**
 * 「全部番剧」浏览页（2026-10-09 建页；同日"全年代扩容"二次改版）。
 *
 * 分工三层，各自一个文件：
 *   · 网址参数 ↔ 筛选状态：lib/browse.ts（白名单 / 默认值 / 链接生成）
 *   · 筛选状态 → AniList 查询：lib/anilist.ts 的 fetchBrowseAnime
 *   · 本文件：读参数 → 取数 → 摆版面
 *
 * ⚠️ 全页围着数据源的两条硬规矩转（2026-10-09 二分 + 深页实测）：
 *
 *   1. **pageInfo 的 total / lastPage 会撒谎**——同一查询翻不同页报不同的总数；
 *      「1960 年前只有百来部」它也敢报 5000。所以「共 N 部」只在**我们自己数过**
 *      的范围里显示：年份维度的数字来自全库清点（lib/catalog.ts，把全库两万条
 *      逐条扫出来数的）。带形式/状态/标签的组合没数过——**不显示数字**，
 *      宁可不说，不说假话。
 *
 *   2. **翻页深度硬上限 5000 条**——offset+perPage 超过就 HTTP 400，perPage=28 时
 *      第 178 页（BROWSE_MAX_PAGE）是最后一页。第 179 页起在这里直接拦下、给一句
 *      人话（老版会把它误报成"数据源超时"，见下面"重试"分支的注释）。
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

  // 翻过数据源上限的页码：拦在取数之前，给一句人话（见文件头注释第 2 条）。
  // 筛选区照常渲染——用户正是该用它把范围缩小
  if (params.page > BROWSE_MAX_PAGE) {
    return (
      <main className={`${SITE_CONTAINER} py-8 sm:py-10`}>
        <h1 className="section-mark text-2xl font-bold tracking-tight sm:text-[28px]">
          浏览全部番剧
        </h1>
        <div className="mt-6">
          <BrowseFilters current={params} />
        </div>
        <div className="mt-7 flex flex-col items-center gap-3 rounded-xl border border-dashed border-border py-20 text-center">
          <p className="text-sm text-muted-foreground">
            页码超出了数据源的单次查询上限——最多翻到第 {BROWSE_MAX_PAGE} 页。
          </p>
          <p className="text-xs text-muted-foreground/80">
            想看更全的番剧目录，请用上面的年份、标签把范围缩小；也可以回第 1 页重新开始。
          </p>
          <Link
            href={buildBrowseHref(params, { page: 1 })}
            className="mt-1 rounded-lg border border-border bg-surface px-4 py-1.5 text-sm text-foreground transition-colors duration-150 hover:border-brand/50 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
          >
            回到第 1 页
          </Link>
        </div>
      </main>
    );
  }

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

  const anime = attachLocalData(result.anime);

  // 「共 N 部」的计数范围：只有"年份是唯一筛选维度"时才数得清（见文件头注释第 1 条）
  const countScope = params.format === "" && params.status === "" && params.tag === "";
  const count = countScope ? getCatalogCount(params.year) : null;

  // 分页参数（两种模式，见 BrowsePagination 头注释）：
  //   已知总数 → 首尾页 + 当前±2，末页截到数据源上限；
  //   未知（组合筛选）→ 上一页/下一页，"还有没有下一页"看本页满不满
  const pagesFromCount = count !== null && count > 0 ? Math.ceil(count / BROWSE_PAGE_SIZE) : null;
  const lastPage = pagesFromCount !== null ? Math.min(pagesFromCount, BROWSE_MAX_PAGE) : null;
  const sourceCapped = pagesFromCount !== null && pagesFromCount > BROWSE_MAX_PAGE;
  const hasMore = result.anime.length >= BROWSE_PAGE_SIZE;
  const atCapUnknown = lastPage === null && params.page >= BROWSE_MAX_PAGE && hasMore;

  const hasResults = anime.length > 0;

  return (
    <main className={`${SITE_CONTAINER} py-8 sm:py-10`}>
      <header className="mb-6">
        <h1 className="section-mark text-2xl font-bold tracking-tight sm:text-[28px]">
          浏览全部番剧
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          按形式 / 状态 / 年份 / 标签自由组合筛选
          {/* 数字只在数得清时显示（见文件头注释第 1 条）；0 条交给空态区解释，不在这念叨 */}
          {count !== null && count > 0 ? (
            <>
              {" · 共 "}
              <span className="tabular-nums">{count}</span> 部
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
                // 「评分」排序由数据源按 AniList 分排，卡片跟着显示同口径的分
                // （页面上配了说明文案；其余排序显示 Bangumi 分）
                scoreMode={params.sort === "score" ? "anilist" : undefined}
              />
            ))}
          </div>
          <BrowsePagination
            current={params}
            page={params.page}
            lastPage={lastPage}
            hasMore={hasMore}
            capNote={sourceCapped || atCapUnknown}
          />
        </>
      ) : (
        <div className="mt-7 flex flex-col items-center gap-3 rounded-xl border border-dashed border-border py-20 text-center">
          <p className="text-sm text-muted-foreground">
            {/* 第 1 页为空 = 这个筛选组合没结果；之后的页为空 = 页码翻过了头 */}
            {params.page === 1
              ? "没有找到符合条件的番剧。"
              : "这一页没有内容，页码可能超出了结果范围。"}
          </p>
          <p className="text-xs text-muted-foreground/80">
            {params.page === 1
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
