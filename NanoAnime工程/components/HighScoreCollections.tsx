"use client";

import { AnimeCard } from "@/components/AnimeCard";
import { ANIME_GRID_CLASS } from "@/lib/anime-constants";
import type { Collection } from "@/types/anime";

/**
 * 首页「高分合集」：全年代高分作品按「同一系列」聚合后的合集墙（三行 × 7）。
 * 2026-10-07 口径修正起：**只收日本动画、评分只看 Bangumi**（此前是三个来源
 * 等权平均、不限国家）——副标题如实标注这两件事。
 *
 * 数据通路：**服务端读文件**（lib/collections-index.ts 读 data/collections.json，
 * 首页是服务端组件）→ 当 props 传进来。所以这里**没有加载态和失败态**——
 * 数据在服务端渲染的那一刻就在手上（文件由 scripts/build-collections.ts 生成，
 * 缺了/坏了属于构建期问题，构建会当场报出来）；剩下的只有"空"这一种状态。
 * 为什么还标 "use client"：和其它首页区块保持一致，数据一律经 props 进来；
 * 它本身是纯渲染、没有交互，服务端渲染照样出完整 HTML。
 *
 * 卡片是合集**代表作品**（系列里 Bangumi 分最高那部）+ collection 模式：
 * 药丸显示合集均分、封面底部是「共 N 部」徽标、名字下面是「年份 · 评分」。
 */
export function HighScoreCollections({ collections }: { collections: Collection[] }) {
  if (collections.length === 0) {
    return (
      <section>
        <h2 className="section-mark mb-3 text-2xl font-bold tracking-tight">高分合集</h2>
        <p className="rounded-xl border border-dashed border-border px-4 py-16 text-center text-sm text-muted-foreground">
          高分合集数据还没生成，先看看上面的新番吧。
        </p>
      </section>
    );
  }

  // 副标题里的「评分来源」**按实际用到的那几个写，不虚报**：
  // 这是全部 21 条用到的来源取并集（2026-10-07 口径修正后只有「Bangumi」）；
  // ⚠️ 只有一个来源时不许写「综合」，也绝不写「全网综合」。
  const used = new Set(collections.flatMap((collection) => collection.sources));
  const sourceText = ["AniList", "Bangumi", "AniTrendz"]
    .filter((name) => used.has(name))
    .join(" · ");

  return (
    <section>
      <header className="mb-7">
        <h2 className="section-mark text-2xl font-bold tracking-tight sm:text-[28px]">高分合集</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          {/* 「日本动画」不是装饰：合集只收日漫，不写就是让用户以为国产/欧美也在里面 */}
          全年代日本动画 · 同系列多部组合，按合集均分排序
          {sourceText ? <> · 评分来源：{sourceText}</> : null}
        </p>
      </header>

      <div className={ANIME_GRID_CLASS}>
        {collections.map((collection) => (
          <AnimeCard
            key={collection.key}
            anime={collection.representative}
            collection={{ count: collection.count, score: collection.score }}
          />
        ))}
      </div>
    </section>
  );
}
