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

/** 自动轮播间隔。7 秒比参考站略慢：简介有三行，得给人读完的时间 */
const AUTOPLAY_MS = 7000;

/**
 * 首页焦点位：当季人气前几部（HERO_COUNT 部）的轮播。
 *
 * 2026-10-07 三期改版：改**真全宽**——section 直接铺满视口（父级 <main> 是满宽的
 * 块级元素，不用 w-screen：那个含滚动条宽度，会出横向滚动条），内容栅格套
 * SITE_CONTAINER 与下面的区块左右对齐。圆角和描边同时撤掉了：全宽带保留圆角，
 * 屏幕四角会露出底色的缺口。**左右箭头改为 ≥2xl 才显示**，原因见箭头处的注释。
 *
 * 数据走 `useSeasonAnime`（与下面的新番墙共用同一份请求与缓存，不会多打接口）。
 *
 * ─────────────────────────────────────────────────────────────
 * 三条设计约束（都是硬要求，别顺手改掉）：
 *
 * 1. **主按钮是「去哪看」，跳详情页的「哪里能看」区块**（`/anime/[id]#watch`）。
 *    本站不提供在线播放——焦点位不出现任何"在该页看片"的交互，
 *    按钮只是把人送去那个"只列正版跳转"的区块。
 * 2. **动效受 `prefers-reduced-motion` 管辖**：系统开了「减弱动态效果」就
 *    **不自动轮播**（手动切换仍可用），也不播淡入动画。
 * 3. **文字那半边的底衬是不透明的 `--background` 渐变**——焦点位的背景是
 *    一张模糊大图，文字直接压图上的对比度没法保证（图明暗不可控）。
 *    左边渐变到接近实色底，白字对比度就回到 M6 验过的安全区。
 * ─────────────────────────────────────────────────────────────
 *
 * WCAG 2.2.2（自动移动的内容要能暂停）：轮播带一个暂停/继续按钮。
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
        className="mb-14 h-[340px] animate-pulse bg-surface sm:h-[420px]"
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
  const metaLine = [
    `${data.seasonYear} 年${getSeasonLabel(data.season)}`,
    getFormatLabel(slide.format),
    getMetaLine(slide),
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    <section
      aria-label="当季焦点"
      className="relative mb-14 overflow-hidden"
    >
      {/*
        同一次切换里把背景图和新内容一起重挂（key=slide.id）——这样任意时刻
        页面里只有当前这张的图片请求，不会一次拉 5 张横幅。
        ⚠️ 背景图 blur + 低透明度 + 左侧渐变是**同一组不可拆的兜底**：
        横幅明暗不可控，靠它们把文字那半边压到接近 --background。
      */}
      <div key={slide.id} className="animate-in fade-in duration-500 motion-reduce:animate-none">
        {banner ? (
          <Image
            src={banner}
            alt=""
            aria-hidden
            fill
            priority={current === 0}
            // 全宽带：图铺满视口。sizes 必须跟着改，否则浏览器按旧宽度取小图、宽屏发糊
            sizes="100vw"
            className="scale-110 object-cover object-top opacity-40 blur-2xl"
          />
        ) : null}
        <div
          aria-hidden
          className="absolute inset-0 bg-linear-to-r from-background via-background/90 to-background/45"
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

        {/*
          内容栅格。版心用 SITE_CONTAINER——文字列与下面区块的标题左右对齐，
          这是"真全宽但内容不散"的关键（A3 验收查的就是这个对齐）。
        */}
        <div
          className={cn(
            SITE_CONTAINER,
            "relative grid gap-6 py-8 sm:grid-cols-[1fr_auto] sm:items-center sm:py-10",
          )}
        >
          <div className="flex max-w-xl flex-col gap-3.5">
            <h2 className="line-clamp-2 text-2xl leading-tight font-bold tracking-tight sm:text-4xl">
              {title}
            </h2>

            {slide.genres && slide.genres.length > 0 ? (
              <ul className="flex flex-wrap gap-1.5">
                {slide.genres.slice(0, 4).map((genre) => (
                  <li
                    key={genre}
                    className="rounded-full border border-border bg-surface/60 px-2.5 py-0.5 text-xs text-muted-foreground"
                  >
                    {getGenreLabel(genre)}
                  </li>
                ))}
              </ul>
            ) : null}

            <p className="text-xs tabular-nums text-muted-foreground sm:text-sm">{metaLine}</p>

            {slide.summary ? (
              // 简介来自本地里的中文简介（服务端只给前 HERO_COUNT 部带上）。没有就整段不渲染，
              // 不留"暂无简介"的占位——焦点位上的空洞比少一段话更难看
              <p className="line-clamp-3 text-sm leading-relaxed text-muted-foreground">
                {slide.summary}
              </p>
            ) : null}

            <div className="pt-1">
              {/*
                主按钮「去哪看」→ 详情页的「哪里能看」区块（#watch 锚点）。
                正版跳转的全部逻辑都在那边（lib/watch.ts + WatchLinks），
                焦点位只负责把用户送过去——本按钮**不直连任何第三方**。
              */}
              <Link
                href={`/anime/${slide.id}#watch`}
                className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground transition-all duration-150 hover:brightness-110 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none active:scale-[0.98]"
              >
                去哪看
                <span aria-hidden>›</span>
              </Link>
            </div>
          </div>

          {poster ? (
            <Link
              href={`/anime/${slide.id}`}
              aria-label={`${title} · 查看详情`}
              className="group relative hidden aspect-[2/3] w-36 shrink-0 overflow-hidden rounded-xl ring-1 ring-border outline-none transition-transform duration-200 hover:-translate-y-1 focus-visible:ring-2 focus-visible:ring-ring sm:block lg:w-44"
              style={slide.coverImage.color ? { backgroundColor: slide.coverImage.color } : undefined}
            >
              <Image
                src={poster}
                alt=""
                fill
                priority={current === 0}
                sizes="176px"
                className="object-cover transition-transform duration-500 group-hover:scale-105"
              />
            </Link>
          ) : null}
        </div>
      </div>

      {slides.length > 1 ? (
        <>
          {/*
            左右箭头只在 ≥2xl（1536px）显示。
            ⚠️ 为什么：箭头压在两侧、宽 36px + 距边 12px = 右缘在 48px 处；
            而版心的左右内边距最宽才 32px（lg），也就是说**视口比版心宽出至少
            约 24px 外边距**时，箭头才落在文字列外面不压字。
            1536 是第一个满足这个条件的默认断点；更窄的宽度上用底部那对箭头
            （原本只有手机显示，现在一直显示到 2xl）。
            为什么不做成"永远显示、把文字右缩进 64px"：那样文字列在 1024~1536px
            区间会比下面的区块多缩进 32px，和版心对不齐——A3 验收查的就是这个对齐。
            （这条是 10-06 实测过 8px 压字的教训的彻底解法：把重叠的可能性去掉，
            而不是靠调内边距躲。）
          */}
          <button
            type="button"
            onClick={() => setIndex((i) => (i - 1 + slides.length) % slides.length)}
            aria-label="上一部"
            className="absolute top-1/2 left-3 hidden size-9 -translate-y-1/2 cursor-pointer items-center justify-center rounded-full bg-background/70 text-foreground ring-1 ring-border backdrop-blur transition-colors duration-150 hover:bg-background focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none 2xl:flex"
          >
            <Chevron direction="left" />
          </button>
          <button
            type="button"
            onClick={() => setIndex((i) => (i + 1) % slides.length)}
            aria-label="下一部"
            className="absolute top-1/2 right-3 hidden size-9 -translate-y-1/2 cursor-pointer items-center justify-center rounded-full bg-background/70 text-foreground ring-1 ring-border backdrop-blur transition-colors duration-150 hover:bg-background focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none 2xl:flex"
          >
            <Chevron direction="right" />
          </button>

          <div className="absolute inset-x-0 bottom-3 flex items-center justify-center gap-3">
            {/* 宽度不够放两侧箭头时的左右箭头（≥2xl 用两侧那对） */}
            <button
              type="button"
              onClick={() => setIndex((i) => (i - 1 + slides.length) % slides.length)}
              aria-label="上一部"
              className="flex size-7 cursor-pointer items-center justify-center rounded-full bg-background/70 text-foreground ring-1 ring-border 2xl:hidden"
            >
              <Chevron direction="left" />
            </button>

            <div className="flex items-center gap-1.5 rounded-full bg-background/60 px-2.5 py-1.5 backdrop-blur">
              {slides.map((item, i) => (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => setIndex(i)}
                  aria-label={`第 ${i + 1} 部：${getPrimaryTitle(item)}`}
                  aria-current={i === current ? "true" : undefined}
                  className={cn(
                    "h-2 cursor-pointer rounded-full transition-all duration-200 motion-reduce:transition-none",
                    i === current ? "w-6 bg-brand-strong" : "w-2 bg-foreground/30 hover:bg-foreground/55",
                  )}
                />
              ))}
            </div>

            <button
              type="button"
              onClick={() => setIndex((i) => (i + 1) % slides.length)}
              aria-label="下一部"
              className="flex size-7 cursor-pointer items-center justify-center rounded-full bg-background/70 text-foreground ring-1 ring-border 2xl:hidden"
            >
              <Chevron direction="right" />
            </button>

            {/*
              暂停/继续（WCAG 2.2.2：自动轮播必须能暂停）。
              ⚠️ 系统开了减弱动态效果时**不显示这个按钮**——自动轮播本来就不会走，
              再给一个"继续播放"的开关等于用界面对抗用户的系统偏好。
            */}
            {!reducedMotion ? (
              <button
                type="button"
                onClick={() => setPaused((p) => !p)}
                aria-label={paused ? "继续自动轮播" : "暂停自动轮播"}
                className="absolute right-3 flex size-7 cursor-pointer items-center justify-center rounded-full bg-background/70 text-muted-foreground ring-1 ring-border transition-colors duration-150 hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
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
            ) : null}
          </div>
        </>
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
