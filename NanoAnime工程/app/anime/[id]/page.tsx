import type { Metadata } from "next";
import Image from "next/image";
import { notFound } from "next/navigation";

import { CastList } from "@/components/CastList";
import { EpisodeList } from "@/components/EpisodeList";
import { FollowButton } from "@/components/FollowButton";
import { SeriesTimeline } from "@/components/SeriesTimeline";
import { StaffList } from "@/components/StaffList";
import { WatchLinks } from "@/components/WatchLinks";
import { fetchAnimeDetail } from "@/lib/anilist";
import { fetchSeriesTimeline } from "@/lib/series";
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
import { getBangumiSummary, getTitleZh } from "@/lib/bangumi-index";
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
  // 简介也是 M1-0 那张离线表里带的（scripts/fetch-title-zh.ts 抓的 summary），
  // 读本地文件，**不请求 Bangumi**。没配对上就是 null，退回 AniList 的英文简介
  const summary = getBangumiSummary(detail.id);

  // 系列年表。第一层（自己 + 直接关系）已经在详情查询里带回来了，
  // 这里只负责把图走完——最多再发 4 次请求，失败就降级（不抛异常）
  const timeline = await fetchSeriesTimeline({
    id: detail.id,
    titleNative: detail.title.native,
    format: detail.format,
    year: detail.startDate?.year ?? null,
    relations: detail.relations,
  });

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
      {/* 顶部：大封面 + 名字 + 评分 */}
      <div className="flex flex-col gap-6 sm:flex-row">
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

          {/* 追番按钮。它自己是个客户端组件，详情页仍然是服务端组件 */}
          <div>
            <FollowButton anime={detail} />
          </div>

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

      {/* 简介：优先用 Bangumi 的（离线抓进 data/title-zh.json），拿不到才退回 AniList 英文 */}
      <section className="mt-10">
        <h2 className="mb-3 text-lg font-medium">简介</h2>
        {summary ? (
          <>
            {/* ⚠️ 如实标注语言：Bangumi 的新条目简介填的是官方日文原文，
                要等志愿者翻译成中文。本季 17 条全是日文。不说清楚的话，
                用户会以为中文简介加载出错了 */}
            {summary.isJapanese ? (
              <p className="mb-2 text-xs text-muted-foreground">
                Bangumi 上目前只有日文简介，暂无中文。
              </p>
            ) : null}
            <p className="text-sm leading-relaxed whitespace-pre-line text-muted-foreground">
              {summary.text}
            </p>
          </>
        ) : detail.description ? (
          <>
            {/* 同上，退而求其次也要说清楚 */}
            <p className="mb-2 text-xs text-muted-foreground">
              Bangumi 上没有这部作品的简介，下面是 AniList 的英文原文。
            </p>
            <p className="text-sm leading-relaxed whitespace-pre-line text-muted-foreground">
              {detail.description}
            </p>
          </>
        ) : (
          <p className="text-sm text-muted-foreground">这部作品暂时没有简介。</p>
        )}
      </section>

      {/* 剧集列表 */}
      <section className="mt-10">
        <h2 className="mb-3 text-lg font-medium">剧集列表</h2>
        <EpisodeList list={episodes} />
      </section>

      {/* 哪里能看。数据在 lib/watch.ts 里组装，红线都收在那个文件里——这里只显示，只跳转不播放 */}
      <section className="mt-10">
        <h2 className="mb-3 text-lg font-medium">哪里能看</h2>
        <WatchLinks detail={detail} />
      </section>

      {/*
        系列年表。
        ⚠️ 只有一部作品时**整块不显示**——一行的「年表」是噪音。
        实测触发这个状态的有：千与千寻（只有 1 条 CHARACTER 关系）、
        魔法使いの夜（7 条关系但过滤后 0 条）、赛博朋克 边缘行者 2（只有 1 条 OTHER）。
      */}
      {timeline.entries.length > 1 ? (
        <section className="mt-10">
          <h2 className="mb-3 text-lg font-medium">系列年表</h2>
          <SeriesTimeline
            entries={timeline.entries}
            currentId={detail.id}
            partial={timeline.partial}
          />
        </section>
      ) : null}

      {/* 制作人员 */}
      <section className="mt-10">
        <h2 className="mb-3 text-lg font-medium">制作人员</h2>
        <StaffList staff={detail.staff} />
      </section>

      {/* 声优。以声优为主体，角色只作挂靠 */}
      <section className="mt-10">
        <h2 className="mb-3 text-lg font-medium">声优</h2>
        <CastList cast={detail.cast} missingCount={detail.castMissingCount} />
      </section>
    </main>
  );
}
