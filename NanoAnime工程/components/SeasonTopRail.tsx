"use client";

import { useMemo, useRef } from "react";

import { AnimeCard } from "@/components/AnimeCard";
import { useSeasonAnime } from "@/components/useSeasonAnime";
import { HERO_COUNT, HOME_WALL_COUNT } from "@/lib/anime-constants";

/**
 * 首页「本季遗珠」横滑轨（2026-10-09 电影化改版新增）。
 *
 * 为什么要有它：首页原来是"周表一行 + 两面卡片墙"的纯竖排节奏，从头到尾
 * 一个拍子。这一条**横滑轨**插在两面墙之间——换了一种浏览方式（滑动查看），
 * 也换了一种内容口径（评分而非人气），是版面节奏里那个"变化音"。
 *
 * 为什么叫「遗珠」、候选为什么从 HERO_COUNT + HOME_WALL_COUNT 起截：
 * 首页有一条老规矩——**同一部番不在首页出现两次**（焦点位 7 部 + 新番墙 14 部，
 * 口径见 lib/anime-constants.ts）。如果榜单直接从全季取前 10，高分番大概率
 * 同时出现在焦点位/新番墙上，同一张封面一屏出现两次。与其放宽那条规矩，
 * 不如把它变成榜单的立意：**给"还没上过焦点位和新番墙的作品"一个展位**——
 * 这正是"遗珠"两个字要表达的事。副标题如实写明口径，不制造"全季 Top10"的假象。
 *
 * ⚠️ 资格线为什么是「已上榜」（bangumiRank > 0）而不是"分数 > 某值"（2026-10-09 实测）：
 *    首次上线时按原始分数排，榜首出现 **10.0 / 10.0 / 8.5** 这种数字——查证全是
 *    **没有排名的新条目**（Bangumi 的排行需要足量打分人数；刚开分只有几个人投票时
 *    分数会冲到极端值，是"假高分"，不是口碑）。所以资格线改成**上过 Bangumi 榜**
 *    ——上榜本身就意味着"打分人数够、分数可信"。副标题写"已上榜作品"，
 *    宁可阵容不如假分好看，也不摆虚假的高分（项目铁律：数字不撒谎）。
 *
 * 数据走 useSeasonAnime（与焦点位/新番墙共享同一份请求与缓存，不多打接口）。
 * 评分口径是全站唯一的 Bangumi（bangumiRating，0~100）。
 *
 * ⚠️ 错误态**不在这里显示**：同一份查询的失败由下面两面墙的 ErrorHint 负责，
 * 这里再摆一份同样的话只会重复（与 HeroSpotlight 对错误态的处理一致）。
 */

/** 少于这么多条就不渲染整条轨——两条三张的"榜"看起来像出错了 */
const RAIL_MIN_ITEMS = 4;

/** 最多展示几名。8 是实测定的：本季"已上榜且未上首页"的池子里，第 9 名起分数掉到 6 以下 */
const RAIL_MAX_ITEMS = 8;

export function SeasonTopRail() {
  const { data, isPending } = useSeasonAnime();
  const railRef = useRef<HTMLDivElement>(null);

  const picks = useMemo(() => {
    if (!data) {
      return [];
    }
    return data.anime
      .slice(HERO_COUNT + HOME_WALL_COUNT) // 跳过焦点位与新番墙已展示的两批（见头注释）
      .filter((anime) => (anime.bangumiRank ?? 0) > 0) // 只收"已上榜"的（可信分，见头注释）
      .sort((a, b) => (b.bangumiRating ?? 0) - (a.bangumiRating ?? 0))
      .slice(0, RAIL_MAX_ITEMS);
  }, [data]);

  if (isPending) {
    return <RailSkeleton />;
  }

  if (picks.length < RAIL_MIN_ITEMS) {
    // 数据不足（开季初期大多没出分）：整条轨不渲染。
    // 不显示"暂无数据"之类的空壳——一个没内容可看的榜没有存在意义
    return null;
  }

  const scrollByDir = (dir: 1 | -1) => {
    const el = railRef.current;
    if (!el) {
      return;
    }
    // 尊重减弱动效：直接跳，不做平滑滚动
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    el.scrollBy({ left: dir * el.clientWidth * 0.8, behavior: reduced ? "auto" : "smooth" });
  };

  return (
    <section aria-label="本季遗珠">
      <header className="mb-5 flex flex-wrap items-end justify-between gap-x-4 gap-y-2">
        <div>
          <h2 className="section-mark text-2xl font-bold tracking-tight sm:text-[28px]">本季遗珠</h2>
          <p className="mt-2 text-sm text-muted-foreground">
            还没上焦点位和新番墙的 {picks.length} 部 · 取自 Bangumi 已上榜作品，按评分排序
          </p>
        </div>
        {/*
          轨的左右滚动按钮。桌面用户没有触摸板横滑的习惯，没有这对按钮
          整条轨对鼠标用户就是"看得见、摸不动"。
        */}
        <div className="flex shrink-0 items-center gap-1.5">
          <button
            type="button"
            onClick={() => scrollByDir(-1)}
            aria-label="上一批"
            className="flex size-8 cursor-pointer items-center justify-center rounded-full border border-border text-muted-foreground transition-colors duration-150 hover:border-border-strong hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
          >
            <RailChevron direction="left" />
          </button>
          <button
            type="button"
            onClick={() => scrollByDir(1)}
            aria-label="下一批"
            className="flex size-8 cursor-pointer items-center justify-center rounded-full border border-border text-muted-foreground transition-colors duration-150 hover:border-border-strong hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
          >
            <RailChevron direction="right" />
          </button>
        </div>
      </header>

      {/*
        横滑轨本体。负外边距 + 同值内边距：卡片可以贴着版心边缘滑到屏幕边，
        视觉上"溢出"出版心（获奖站横滑轨的常见处理），但内容起点仍与
        上面区块的标题左对齐。snap 让每次滑动停在卡片边界上。
      */}
      <div
        ref={railRef}
        className="-mx-4 flex snap-x snap-mandatory gap-4 overflow-x-auto scroll-px-4 px-4 pb-3 sm:-mx-6 sm:scroll-px-6 sm:px-6 lg:-mx-8 lg:scroll-px-8 lg:px-8"
      >
        {picks.map((anime, index) => (
          <div key={anime.id} className="w-32 shrink-0 snap-start sm:w-36 lg:w-40">
            <AnimeCard
              anime={anime}
              rank={index + 1}
              sizes="(min-width: 1024px) 160px, (min-width: 640px) 144px, 128px"
            />
          </div>
        ))}
      </div>
    </section>
  );
}

/** 加载态：一条轨的骨架。尺寸与真实卡片对齐（替换时不跳） */
function RailSkeleton() {
  return (
    <div role="status" aria-busy="true" aria-label="正在加载本季遗珠">
      <div className="mb-5 space-y-2">
        <div className="h-7 w-40 animate-pulse rounded-md bg-surface" />
        <div className="h-4 w-64 animate-pulse rounded bg-surface" />
      </div>
      <div className="flex gap-4 overflow-hidden pb-3">
        {Array.from({ length: 8 }, (_, index) => (
          <div key={index} className="flex w-32 shrink-0 flex-col gap-2.5 sm:w-36 lg:w-40">
            <div className="aspect-[2/3] w-full animate-pulse rounded-xl bg-surface" />
            <div className="min-h-[2.6em] space-y-1.5">
              <div className="h-3.5 w-full animate-pulse rounded bg-surface" />
              <div className="h-3.5 w-2/3 animate-pulse rounded bg-surface" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

/** 滚动按钮的箭头。样式与 HeroSpotlight 的 Chevron 同源（描边风格、size 由外层给） */
function RailChevron({ direction }: { direction: "left" | "right" }) {
  return (
    <svg
      viewBox="0 0 24 24"
      aria-hidden
      className={direction === "right" ? "size-4 rotate-180" : "size-4"}
      fill="none"
      stroke="currentColor"
      strokeWidth={2.25}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M15 18l-6-6 6-6" />
    </svg>
  );
}
