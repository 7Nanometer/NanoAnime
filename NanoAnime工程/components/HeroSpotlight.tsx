"use client";

import { useEffect, useMemo, useState } from "react";
import Image from "next/image";
import Link from "next/link";

import { useSeasonAnime } from "@/components/useSeasonAnime";
import { HERO_COUNT } from "@/lib/anime-constants";
import {
  getFormatLabel,
  getGenreLabel,
  getMetaLine,
  getPrimaryTitle,
  getSeasonLabel,
} from "@/lib/anime-display";
import { SITE_CONTAINER } from "@/lib/layout";
import { cn } from "@/lib/utils";

/** 自动轮播间隔。7 秒比参考站略慢：简介有三行，得给人读完的时间。
 *  ⚠️ 进度条的时长也用它（内联 animationDuration）——两处必须同源，改这里就够。 */
const AUTOPLAY_MS = 7000;

/**
 * 首页焦点位：当季人气前几部（HERO_COUNT 部）的轮播。
 *
 * 2026-10-09 电影化改版（Awwwards 级打磨）。这一版把首屏从"黑底上一行字"
 * 做成一个有景深的舞台，五个改动点：
 *
 *   1. **背景大图从"几乎看不见"提到"看得见但不抢字"**：原来 opacity-40 +
 *      blur-2xl + 高遮罩，实测在 1440 上几乎全黑，等于浪费了横幅图。
 *      现在 60% + blur-3xl + saturate-150，右侧大面积透出画作的颜色和明暗；
 *      左侧仍用 from-background 的不透明渐变把**文字那半边**压回安全区
 *      （这一条是硬约束，见下）。
 *   2. **每部番的专属氛围光**：用 AniList 给的封面主色（coverImage.color）
 *      在海报侧打一团大光斑——每换一部番，这一屏的"光"跟着变，这是本站
 *      不同于任何模板的签名细节。颜色来自数据、不是新造的设计变量。
 *   3. **标题升规格**：sm 起 48px、xl 54px（上限 6rem 之内），白字 + 紫晕；
 *      没有中文简介的番（实测 7 部里有 3 部）不留空段——排版重心靠标题撑住。
 *   4. **控制条落进文档流**：原来箭头/圆点/暂停绝对定位漂在底部中间、
 *      还要按版心算安全距离（旧注释里那段 2xl 断点的推导）。现在整合成
 *      文字列下方的一条"轮播工具条"（上一个 / 圆点 / 下一个 / 暂停 / 进度），
 *      不再绝对定位，三档宽度都不会压字。
 *   5. **换片入场**：文字列与海报按 key 重挂、错峰淡入上浮（700ms），
 *      进度条随 index 重置。动效受 prefers-reduced-motion 管辖。
 *
 * ─────────────────────────────────────────────────────────────
 * 三条设计约束（都是硬要求，别顺手改掉）：
 *
 * 1. **主按钮是「去哪看」，跳详情页的「哪里能看」区块**（`/anime/[id]#watch`）。
 *    本站不提供在线播放——焦点位不出现任何"在该页看片"的交互，
 *    按钮只是把人送去那个"只列正版跳转"的区块。
 * 2. **动效受 `prefers-reduced-motion` 管辖**：系统开了「减弱动态效果」就
 *    **不自动轮播**（手动切换仍可用），不播入场动画，也不显示进度条。
 * 3. **文字那半边的底衬是不透明的 `--background` 渐变**——焦点位的背景是
 *    一张模糊大图，文字直接压图上的对比度没法保证（图明暗不可控）。
 *    左边渐变到接近实色底，白字对比度就回到 M6 验过的安全区。
 *    ⚠️ 新加的"专属氛围光"只打在**右侧海报区**（right-[-10%]），
 *    不许把光斑往文字列上挪——挪过去就要重新全量验对比度。
 * ─────────────────────────────────────────────────────────────
 *
 * WCAG 2.2.2（自动移动的内容要能暂停）：轮播带一个暂停/继续按钮 + 进度条。
 */
export function HeroSpotlight() {
  const { data, isPending, error } = useSeasonAnime();

  const slides = useMemo(() => data?.anime.slice(0, HERO_COUNT) ?? [], [data]);
  const [index, setIndex] = useState(0);
  const [paused, setPaused] = useState(false);
  const [reducedMotion, setReducedMotion] = useState(false);

  // 系统级「减弱动态效果」偏好。matchMedia 要监听 change——用户在系统设置里
  // 改了这个开关时，页面不刷新也应该跟着停/走
  useEffect(() => {
    const query = window.matchMedia("(prefers-reduced-motion: reduce)");
    const update = () => setReducedMotion(query.matches);
    update();
    query.addEventListener("change", update);
    return () => query.removeEventListener("change", update);
  }, []);

  const autoplay = !paused && !reducedMotion && slides.length > 1;
  const current = slides.length > 0 ? index % slides.length : 0;

  // 自动轮播。⚠️ deps 里带 index：每次切完片重新计时，保证每张都看满 7 秒
  // （用 interval 且不带 index 的话，手动翻页会马上又被翻走）
  useEffect(() => {
    if (!autoplay) {
      return;
    }
    const timer = window.setTimeout(() => {
      setIndex((i) => (i + 1) % slides.length);
    }, AUTOPLAY_MS);
    return () => window.clearTimeout(timer);
  }, [autoplay, slides.length, index]);

  if (isPending) {
    // 骨架占位。高度对齐真实焦点位，避免数据到达时页面跳一下（CLS）。
    // ⚠️ 和真身一样是全宽条带（无圆角）——形状对不上时，替换的瞬间会跳
    return (
      <div
        role="status"
        aria-busy="true"
        aria-label="正在加载焦点推荐"
        className="mb-14 h-[420px] animate-pulse bg-surface sm:h-[500px]"
      />
    );
  }

  if (error || slides.length === 0) {
    // 加载失败 / 本季一部都没有：**不渲染焦点位**。
    // 下面的新番墙用的是同一份数据（同一个 queryKey），那边有完整的错误说明 + 重试按钮——
    // 同一个失败在这里再摆一套只会重复；空季节同理，由新番墙的空态负责说明。
    return null;
  }

  const slide = slides[current];
  const title = getPrimaryTitle(slide);
  const banner = slide.bannerImage ?? slide.coverImage.extraLarge;
  const poster = slide.coverImage.extraLarge ?? slide.coverImage.large;
  // 这部番的专属氛围色（AniList 的封面主色，如 #e4a128）。可能为 null——那就不打光斑
  const accent = slide.coverImage.color;
  const metaLine = [
    `${data.seasonYear} 年${getSeasonLabel(data.season)}`,
    getFormatLabel(slide.format),
    getMetaLine(slide),
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    <section aria-label="当季焦点" className="relative mb-14 overflow-hidden">
      {/*
        背景层。key=slide.id 让换片时整组重挂——这样任意时刻页面里只有
        当前这张的图片请求，不会一次拉 7 张横幅。
        ⚠️ 背景层刻意**不加入场动画**：换片瞬间它的透明度若从 0 开始，
        遮罩也跟着没了，会闪出一帧"无遮罩"的底图；文字的入场在上层的 keyed
        容器里单独做，背景保持常驻。
      */}
      <div key={`bg-${slide.id}`} className="absolute inset-0">
        {banner ? (
          <Image
            src={banner}
            alt=""
            aria-hidden
            fill
            priority={current === 0}
            // 全宽带：图铺满视口。sizes 必须跟着改，否则浏览器按旧宽度取小图、宽屏发糊
            sizes="100vw"
            className="scale-110 object-cover object-top opacity-60 blur-3xl saturate-150"
          />
        ) : null}

        {/*
          专属氛围光：这团光用封面主色画在**右侧海报区**（-top-1/4 撑满高度、
          右边出血），每换一部番整屏的"光色"跟着变。
          ⚠️ 只许打在右侧——文字列那一半必须留给不透明遮罩（见下方约束 3）。
          30 是十六进制透明度（约 19%）：光斑是装饰层，亮度上限受对比度约束。
        */}
        {accent ? (
          <div
            aria-hidden
            className="absolute -top-1/4 right-[-12%] h-[140%] w-[72%]"
            style={{
              background: `radial-gradient(closest-side, ${accent}30, transparent 74%)`,
            }}
          />
        ) : null}

        <div
          aria-hidden
          className="absolute inset-0 bg-linear-to-r from-background via-background/85 to-background/25"
        />
        {/* 底边融进页面：不让焦点位在页面中间切出一条硬边 */}
        <div
          aria-hidden
          className="absolute inset-x-0 bottom-0 h-36 bg-linear-to-t from-background to-transparent"
        />

        {/*
          焦点位上的星点（2026-10-07 深空星夜）。
          复用全站星点纹理的第一层（最亮的星），压在渐变遮罩**之上**、内容之下——
          焦点位这一大块是全页最显眼的区域，它若没有星空感，会显得"这一块是
          另一套设计"。外层再套一个 50% 透明度的壳把整体压淡：星点在这里只是
          点缀（主角是番剧横幅），⚠️ 不能直接给星点层加 opacity-* 工具类——
          那会与它自己的"呼吸"动画抢同一个 opacity 属性。
        */}
        <div aria-hidden className="pointer-events-none absolute inset-0 opacity-50">
          <div className="starfield-stars-1" />
        </div>
      </div>

      {/*
        内容栅格。版心用 SITE_CONTAINER——文字列与下面区块的标题左右对齐，
        这是"真全宽但内容不散"的关键（A3 验收查的就是这个对齐）。
      */}
      <div
        className={cn(
          SITE_CONTAINER,
          "relative grid gap-8 py-12 sm:py-14 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-center lg:gap-14",
        )}
      >
        {/*
          文字列。key=slide.id 重挂 → 每次换片文字淡入上浮（700ms）。
          ⚠️ 动效只碰 opacity/transform，reduced-motion 用 motion-reduce:animate-none
          整段关掉（tw-animate-css 的 animate-in 系列）。
        */}
        <div
          key={`txt-${slide.id}`}
          className="flex max-w-2xl animate-in flex-col gap-4 fade-in slide-in-from-bottom-2 duration-700 ease-[var(--ease-out-soft)] motion-reduce:animate-none"
        >
          <h2 className="line-clamp-2 text-3xl leading-[1.15] font-bold tracking-tight text-glow-brand sm:text-5xl xl:text-[3.4rem]">
            {title}
          </h2>

          {slide.genres && slide.genres.length > 0 ? (
            <ul className="flex flex-wrap gap-1.5">
              {slide.genres.slice(0, 4).map((genre) => (
                <li
                  key={genre}
                  className="rounded-full border border-border bg-surface/60 px-2.5 py-1 text-xs text-muted-foreground"
                >
                  {getGenreLabel(genre)}
                </li>
              ))}
            </ul>
          ) : null}

          <p className="text-sm tabular-nums text-muted-foreground">{metaLine}</p>

          {slide.summary ? (
            // 简介来自本地里的中文简介（服务端只给前 HERO_COUNT 部带上）。没有就整段不渲染，
            // 不留"暂无简介"的占位——焦点位上的空洞比少一段话更难看
            // （实测本季 7 部里 3 部没有中文简介，这个分支每天都会被走到）
            <p className="line-clamp-3 text-sm leading-relaxed text-muted-foreground sm:text-[15px]">
              {slide.summary}
            </p>
          ) : null}

          <div className="flex flex-wrap items-center gap-3 pt-1.5">
            {/*
              主按钮「去哪看」→ 详情页的「哪里能看」区块（#watch 锚点）。
              正版跳转的全部逻辑都在那边（lib/watch.ts + WatchLinks），
              焦点位只负责把用户送过去——本按钮**不直连任何第三方**。
            */}
            <Link
              href={`/anime/${slide.id}#watch`}
              className="sheen inline-flex items-center gap-1.5 rounded-lg bg-primary px-6 py-3 text-sm font-semibold text-primary-foreground transition-all duration-150 hover:brightness-110 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none active:scale-[0.98]"
            >
              去哪看
              <span aria-hidden>›</span>
            </Link>
            <Link
              href={`/anime/${slide.id}`}
              className="inline-flex items-center rounded-lg border border-border bg-surface/40 px-5 py-3 text-sm font-medium text-foreground transition-colors duration-150 hover:border-border-strong hover:bg-surface-elevated/60 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
            >
              查看详情
            </Link>
          </div>
        </div>

        {poster ? (
          <Link
            key={`poster-${slide.id}`}
            href={`/anime/${slide.id}`}
            aria-label={`${title} · 查看详情`}
            className="group relative hidden shrink-0 animate-in fade-in slide-in-from-bottom-2 duration-700 delay-100 ease-[var(--ease-out-soft)] motion-reduce:animate-none sm:block"
          >
            {/* 氛围光晕：用同一个封面主色在海报背后再点一层，海报像"被自己的光照亮"。
                它是装饰光斑（radial/blur），不是投影——深度感由下面那圈大偏移柔影负责 */}
            {accent ? (
              <span
                aria-hidden
                className="absolute -inset-5 rounded-[2rem] opacity-60 blur-2xl"
                style={{ backgroundColor: `${accent}40` }}
              />
            ) : null}
            <span
              className="relative block aspect-[2/3] w-44 overflow-hidden rounded-2xl ring-1 ring-border-strong shadow-[0_30px_80px_-24px_rgba(0,0,0,0.85)] transition-transform duration-300 ease-[var(--ease-out-soft)] group-hover:-translate-y-1.5 lg:w-52 xl:w-60"
              style={accent ? { backgroundColor: accent } : undefined}
            >
              <Image
                src={poster}
                alt=""
                fill
                priority={current === 0}
                sizes="(min-width: 1280px) 240px, (min-width: 1024px) 208px, 176px"
                className="object-cover transition-transform duration-500 ease-[var(--ease-out-soft)] group-hover:scale-105"
              />
            </span>
          </Link>
        ) : null}
      </div>

      {/*
        轮播工具条：走文档流、贴在内容下方（2026-10-09 改版）。
        原来箭头/圆点/暂停绝对定位漂在底部，还要按版心宽度推导"箭头何时会压字"
        （旧版为此把两侧箭头限制在 ≥2xl）。整合成一条工具条后不再有重叠可能。
      */}
      {slides.length > 1 ? (
        <div className={cn(SITE_CONTAINER, "relative")}>
          <div className="-mt-4 flex items-center pb-8 sm:pb-9">
            <div className="inline-flex items-center gap-2.5 rounded-full bg-background/70 px-3.5 py-2 ring-1 ring-border backdrop-blur">
              <button
                type="button"
                onClick={() => setIndex((i) => (i - 1 + slides.length) % slides.length)}
                aria-label="上一部"
                className="flex size-7 cursor-pointer items-center justify-center rounded-full text-muted-foreground transition-colors duration-150 hover:bg-surface-elevated hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
              >
                <Chevron direction="left" />
              </button>

              <div className="flex items-center gap-1.5 px-0.5">
                {slides.map((item, i) => (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => setIndex(i)}
                    aria-label={`第 ${i + 1} 部：${getPrimaryTitle(item)}`}
                    aria-current={i === current ? "true" : undefined}
                    className={cn(
                      "h-2 cursor-pointer rounded-full transition-all duration-200 motion-reduce:transition-none",
                      i === current
                        ? "w-6 bg-brand-strong"
                        : "w-2 bg-foreground/30 hover:bg-foreground/55",
                    )}
                  />
                ))}
              </div>

              <button
                type="button"
                onClick={() => setIndex((i) => (i + 1) % slides.length)}
                aria-label="下一部"
                className="flex size-7 cursor-pointer items-center justify-center rounded-full text-muted-foreground transition-colors duration-150 hover:bg-surface-elevated hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
              >
                <Chevron direction="right" />
              </button>

              {/*
                暂停/继续（WCAG 2.2.2：自动轮播必须能暂停）+ 自动播放进度条。
                ⚠️ 系统开了减弱动态效果时**这一组都不显示**——自动轮播本来就不会走，
                再给一个"继续播放"的开关等于用界面对抗用户的系统偏好。
              */}
              {!reducedMotion ? (
                <>
                  <span aria-hidden className="h-4 w-px bg-border" />
                  <button
                    type="button"
                    onClick={() => setPaused((p) => !p)}
                    aria-label={paused ? "继续自动轮播" : "暂停自动轮播"}
                    className="flex size-7 cursor-pointer items-center justify-center rounded-full text-muted-foreground transition-colors duration-150 hover:bg-surface-elevated hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
                  >
                    {paused ? (
                      <svg viewBox="0 0 24 24" aria-hidden className="size-3.5 fill-current">
                        <path d="M8 5v14l11-7z" />
                      </svg>
                    ) : (
                      <svg viewBox="0 0 24 24" aria-hidden className="size-3.5 fill-current">
                        <path d="M7 5h4v14H7zM13 5h4v14h-4z" />
                      </svg>
                    )}
                  </button>
                  {/*
                    进度条：key=current 让每换一片从 0 重新走；时长 = AUTOPLAY_MS（内联注入，
                    避免两处各写一个 7000）。暂停时 animation-play-state: paused 冻在中途。
                    ⚠️ 只在 ≥sm 显示：320~390px 上工具条宽度本来就紧（实测 320 只剩约 40px 余量）。
                  */}
                  <span
                    aria-hidden
                    className="hidden h-1 w-20 overflow-hidden rounded-full bg-foreground/15 sm:block"
                  >
                    <span
                      key={current}
                      className={cn(
                        "hero-progress block h-full w-full rounded-full bg-brand-strong",
                        paused && "hero-progress--paused",
                      )}
                      style={{ animationDuration: `${AUTOPLAY_MS}ms` }}
                    />
                  </span>
                </>
              ) : null}
            </div>
          </div>
        </div>
      ) : null}
    </section>
  );
}

/** 轮播的左右箭头图标。size 由外层控制 */
function Chevron({ direction }: { direction: "left" | "right" }) {
  return (
    <svg
      viewBox="0 0 24 24"
      aria-hidden
      className={cn("size-5", direction === "right" && "rotate-180")}
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
