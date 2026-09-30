import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";

import { EpisodeList } from "@/components/EpisodeList";
import { fetchAnimeDetail } from "@/lib/anilist";
import {
  buildEpisodeRows,
  formatDateRange,
  getAiringStatus,
  getFormatLabel,
  getPrimaryTitle,
  getScoreLabel,
  getSecondaryTitle,
  getStatusLabel,
  getStudioNames,
} from "@/lib/anime-display";
import { getTitleZh } from "@/lib/bangumi-index";
import type { AnimeDetail } from "@/types/anime";

/**
 * 番剧详情页。
 *
 * 这是**服务端组件**：数据在服务器上直接取，不走 `/api/` 代理。
 * 铁律说的是「前端绝不直连第三方 API」——这儿压根不在前端跑，所以不冲突；
 * 而且省一次往返、不用做加载态、搜索引擎也抓得到。
 *
 * 中文名读本地 data/title-zh.json（M1-0 离线补齐的），**不请求 Bangumi**。
 */

/** URL 里的 id 必须是纯数字。不是就直接当「没有这部番」处理，不去打 AniList */
function parseId(raw: string): number | null {
  return /^\d+$/.test(raw) ? Number(raw) : null;
}

/** 取详情并补上中文名 */
async function loadDetail(id: number): Promise<AnimeDetail | null> {
  const detail = await fetchAnimeDetail(id);
  if (!detail) {
    return null;
  }
  return { ...detail, title: { ...detail.title, zh: getTitleZh(detail.id) } };
}

export async function generateMetadata(props: PageProps<"/anime/[id]">): Promise<Metadata> {
  const { id } = await props.params;
  const parsed = parseId(id);
  const detail = parsed === null ? null : await loadDetail(parsed);

  if (!detail) {
    return { title: "作品不存在 · NanoAnime番鉴" };
  }
  return { title: `${getPrimaryTitle(detail)} · NanoAnime番鉴` };
}

export default async function AnimeDetailPage(props: PageProps<"/anime/[id]">) {
  const { id } = await props.params;
  const parsed = parseId(id);
  const detail = parsed === null ? null : await loadDetail(parsed);

  // AniList 上没有这个 id，或 id 根本不是数字 → 跳 404 页
  if (!detail) {
    notFound();
  }

  const primary = getPrimaryTitle(detail);
  const secondary = getSecondaryTitle(detail);
  const cover = detail.coverImage.extraLarge;
  const episodes = buildEpisodeRows(detail);

  // 信息栏。**每一项都必须有值**，缺数据的显示「—」，不留空
  const infoRows: { label: string; value: string }[] = [
    { label: "制作公司", value: getStudioNames(detail) },
    { label: "播出时间", value: formatDateRange(detail.startDate, detail.endDate) },
    { label: "总集数", value: detail.episodes === null ? "—" : `${detail.episodes} 集` },
    { label: "单集时长", value: detail.duration === null ? "—" : `${detail.duration} 分钟` },
    { label: "类型", value: detail.genres.length > 0 ? detail.genres.join(" / ") : "—" },
    { label: "状态", value: getStatusLabel(detail.status) },
  ];

  return (
    <main className="mx-auto max-w-4xl px-4 py-8">
      <Link
        href="/"
        className="text-sm text-muted-foreground underline-offset-4 hover:underline"
      >
        ← 返回本季新番
      </Link>

      {/* 顶部：大封面 + 名字 + 评分 */}
      <div className="mt-6 flex flex-col gap-6 sm:flex-row">
        <div
          className="relative aspect-[2/3] w-40 shrink-0 self-start overflow-hidden rounded-lg bg-muted sm:w-56"
          style={
            detail.coverImage.color ? { backgroundColor: detail.coverImage.color } : undefined
          }
        >
          {cover ? (
            <Image
              src={cover}
              alt={primary}
              fill
              sizes="(max-width: 640px) 160px, 224px"
              // 详情页的封面是首屏主角，让它优先加载
              preload
              className="object-cover"
            />
          ) : (
            <span className="absolute inset-0 flex items-center justify-center p-3 text-center text-xs text-muted-foreground">
              {primary}
            </span>
          )}
        </div>

        <div className="flex min-w-0 flex-col gap-3">
          <h1 className="text-2xl leading-tight font-semibold">{primary}</h1>
          {/* 副标题和主标题相同时不重复渲染（没配到中文名又没有英文名时会这样） */}
          {secondary !== primary ? (
            <p className="text-sm text-muted-foreground">{secondary}</p>
          ) : null}
          <p className="text-sm text-muted-foreground">
            评分 {getScoreLabel(detail.averageScore)} · {getFormatLabel(detail.format)} ·{" "}
            {getAiringStatus(detail)}
          </p>

          <dl className="mt-1 grid gap-x-4 gap-y-1.5 text-sm sm:grid-cols-[auto_1fr]">
            {infoRows.map((row) => (
              <div key={row.label} className="contents">
                <dt className="text-muted-foreground">{row.label}</dt>
                <dd className="min-w-0">{row.value}</dd>
              </div>
            ))}
          </dl>
        </div>
      </div>

      {/* 简介：AniList 只提供英文。等 M3 接 TMDB 时再换中文 */}
      <section className="mt-10">
        <h2 className="mb-3 text-lg font-medium">简介</h2>
        {detail.description ? (
          <p className="text-sm leading-relaxed whitespace-pre-line text-muted-foreground">
            {detail.description}
          </p>
        ) : (
          <p className="text-sm text-muted-foreground">AniList 上没有这部作品的简介。</p>
        )}
      </section>

      {/* 剧集列表 */}
      <section className="mt-10">
        <h2 className="mb-3 text-lg font-medium">剧集列表</h2>
        <EpisodeList list={episodes} />
      </section>

      {/* 哪里能看——M3 才接真实数据。这里如实写明，不要放任何播放链接 */}
      <section className="mt-10">
        <h2 className="mb-3 text-lg font-medium">哪里能看</h2>
        <div className="rounded-lg border border-dashed border-border p-4 text-sm text-muted-foreground">
          <p>正版观看渠道正在接入中，M3 上线。</p>
          <p className="mt-1 text-xs">
            本站不提供在线播放，只做正版平台的跳转指引。
          </p>
        </div>
      </section>
    </main>
  );
}
