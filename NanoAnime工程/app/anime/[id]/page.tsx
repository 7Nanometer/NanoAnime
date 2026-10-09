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
  getBangumiScoreLabel,
  getFormatLabel,
  getGenreLabel,
  getPrimaryTitle,
  getSecondaryTitle,
  getStatusLabel,
  getStudioNames,
} from "@/lib/anime-display";
import { getBangumiSummary, getTitleZh, withBangumiRating } from "@/lib/bangumi-index";
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

/** 取详情并补上本地数据（中文名 + Bangumi 评分/排名） */
async function loadDetail(id: number): Promise<AnimeDetail | null> {
  const detail = await fetchAnimeDetail(id);
  if (!detail) {
    return null;
  }
  return withBangumiRating({ ...detail, title: { ...detail.title, zh: getTitleZh(detail.id) } });
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
  // 全站评分的唯一口径是 Bangumi（2026-10-09），AniList 分不再上界面
  const score = getBangumiScoreLabel(detail.bangumiRating);

  // 系列年表。第一层（自己 + 直接关系）已经在详情查询里带回来了，
  // 这里只负责把图走完——最多再发 4 次请求，失败就降级（不抛异常）
  const timeline = await fetchSeriesTimeline({
    id: detail.id,
    titleNative: detail.title.native,
    format: detail.format,
    year: detail.startDate?.year ?? null,
    relations: detail.relations,
  });

  // 信息栏。**每一项都必须有值**，缺数据的显示「—」，不留空。
  // ⚠️ 2026-10-09 改版：原来这里是右栏里一个竖版小盒子（挤在标题旁边、宽度受限），
  // 现在改成页头下方**通栏的数据带**——值可以有更长的行宽，右栏也腾出来给
  // 类型标签和操作按钮。原「类型」一行撤掉了：类型已经做成中文标签直接显示，
  // 同一件事不写两遍（英文原文的 join 也就没有存在意义了）。
  const infoRows: { label: string; value: string }[] = [
    { label: "制作公司", value: getStudioNames(detail) },
    { label: "播出时间", value: formatDateRange(detail.startDate, detail.endDate) },
    { label: "总集数", value: detail.episodes === null ? "—" : `${detail.episodes} 集` },
    { label: "单集时长", value: detail.duration === null ? "—" : `${detail.duration} 分钟` },
    { label: "状态", value: getStatusLabel(detail.status) },
    // 排名来自本地 Bangumi 表（2026-10-09）；没配对上 / 没上榜给破折号（信息栏纪律：不留空）
    { label: "Bangumi 排名", value: detail.bangumiRank != null ? `#${detail.bangumiRank}` : "—" },
  ];

  return (
    <main className="relative mx-auto max-w-4xl px-4 py-8 sm:py-10">
      {/*
        封面氛围背景（backdrop glow）。
        ⚠️ 这是本页最关键的视觉手法，也是唯一的"动态取色"：
        把封面图放大几十倍、重度模糊、压到很低的不透明度，铺在页面顶部。
        效果是整页的氛围色**自动跟着这部番的主色调走**——进《葬送的芙莉莲》是冷青，
        进《咒术回战》是深紫。这让每个详情页有各自的气质，而不是所有番长一个样。
        `aria-hidden` + `pointer-events-none` 必须都有：它是纯装饰，不该被读屏软件念到、
        也不该挡住上面任何一次点击。
        ⚠️ 封面取不到（cover 为 null）时整块不渲染——拿不到图就没有氛围色可言。
      */}
      {cover ? (
        <div
          aria-hidden
          className="pointer-events-none absolute inset-x-0 top-0 -z-10 h-[460px] overflow-hidden"
        >
          <Image
            src={cover}
            alt=""
            fill
            sizes="(max-width: 896px) 100vw, 896px"
            // 这张图用户"看不见细节"，只是取它的颜色，所以不参与首屏关键资源竞争
            loading="lazy"
            className="scale-125 object-cover object-top opacity-30 blur-3xl saturate-150"
          />
          {/* 渐隐到底色。不做这一步，模糊图会在中间出现一条生硬的横切线 */}
          <div className="absolute inset-0 bg-linear-to-b from-transparent via-background/60 to-background" />
        </div>
      ) : null}

      {/*
        专属氛围色（2026-10-09 电影化改版）：把封面主色（AniList 的 coverImage.color）
        在页头右侧打成一团大光斑——每部番的详情页自带一个专属色调。
        与上面那层"模糊封面"的分工：模糊图给"质地"，这团色光给"色相"；
        两者都压得很克制（装饰层，亮度受页面文字对比度约束）。
        ⚠️ 3d 是十六进制透明度（约 24%）。上调前先复测页头文字的对比度。
      */}
      {detail.coverImage.color ? (
        <div
          aria-hidden
          className="pointer-events-none absolute inset-x-0 top-0 -z-10 h-[460px]"
          style={{
            background: `radial-gradient(640px at 78% -10%, ${detail.coverImage.color}3d, transparent 72%)`,
          }}
        />
      ) : null}

      {/* 顶部：大封面 + 名字 + 评分 */}
      <div className="flex flex-col gap-6 sm:flex-row">
        <div
          className="relative aspect-[2/3] w-40 shrink-0 self-start overflow-hidden rounded-xl bg-surface shadow-2xl shadow-black/40 ring-1 ring-border sm:w-56"
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
          {/*
            标题升到 36px + 紫晕（2026-10-09 电影化改版）：详情页的 h1 是
            这个页面的"焦点位主标题"，规格向首页焦点位靠拢。
          */}
          <h1 className="text-glow-brand text-3xl leading-tight font-bold tracking-tight sm:text-4xl">
            {primary}
          </h1>
          {/* 副标题和主标题相同时不重复渲染（没配到中文名又没有英文名时会这样） */}
          {secondary !== primary ? (
            <p className="-mt-1 text-sm text-muted-foreground">{secondary}</p>
          ) : null}

          {/*
            元信息行。
            原来是三个平铺的 `·` 分隔短句，扫过去分不出重点。
            改成「评分单独做成徽章 + 其余用分隔点」——评分是这个页面上用户最想先看到的一个数。
          */}
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1.5 text-sm text-muted-foreground">
            {score !== "—" ? (
              <span className="inline-flex items-center gap-1 rounded-md border border-brand/30 bg-brand-tint px-2 py-0.5 text-xs font-semibold tabular-nums text-brand-strong">
                <svg viewBox="0 0 24 24" aria-hidden className="size-3 fill-current">
                  <path d="M12 2l2.9 6.3 6.9.8-5.1 4.7 1.4 6.8L12 17.2 5.9 20.6l1.4-6.8L2.2 9.1l6.9-.8z" />
                </svg>
                {/* 标注来源：10 分制的数字不标会被当成站内自造的分（2026-10-09 全站改 Bangumi） */}
                Bangumi {score}
              </span>
            ) : null}
            <span>{getFormatLabel(detail.format)}</span>
            {/*
              ⚠️ 分隔点不要用叠透明度的灰——原来是 text-muted-foreground/40，
              全量实测只有 2.17:1（本项目唯一一条过不了 AA 的文字，2026-10-07
              深空星夜改版的对比度审计扫出来的）。项目在 M6 就立过这条规矩：
              **文字的"弱"要用算过对比度的实色表达，不用透明度**——透明度让
              颜色随底色漂移、没法在 token 层一次算清（AnimeCard 那边同理，
              见 --muted-soft 的定义注释）。muted-soft 就是那套实色里最弱的一档。
            */}
            <span aria-hidden className="text-muted-soft">
              ·
            </span>
            <span>{getAiringStatus(detail)}</span>
          </div>

          {/* 类型标签（2026-10-09 改版）：中文显示（没收录映射的原样英文），
              最多 6 枚——AniList 个别作品题材很多，全排会把这个区域撑散 */}
          {detail.genres.length > 0 ? (
            <ul className="flex flex-wrap gap-1.5">
              {detail.genres.slice(0, 6).map((genre) => (
                <li
                  key={genre}
                  className="rounded-full border border-border bg-surface/60 px-2.5 py-1 text-xs text-muted-foreground"
                >
                  {getGenreLabel(genre)}
                </li>
              ))}
            </ul>
          ) : null}

          {/* 操作行：追番（客户端组件）+ 「哪里能看」锚点跳转。
              锚点用原生 <a>：同页跳转不需要路由，交给浏览器最稳 */}
          <div className="mt-1 flex flex-wrap items-center gap-3">
            <FollowButton anime={detail} />
            <a
              href="#watch"
              className="inline-flex items-center rounded-lg border border-border bg-surface/40 px-4 py-2.5 text-sm font-medium text-foreground transition-colors duration-150 hover:border-border-strong hover:bg-surface-elevated/60 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
            >
              哪里能看
            </a>
          </div>
        </div>
      </div>

      {/*
        数据带（2026-10-09 改版，从右栏小盒子搬出来）：通栏 grid，
        手机 2 列 → sm 3 列 → lg 6 列一行排开。标签用 muted-soft（最小号一档），
        值用正文色——层级靠颜色分，不靠字号差。
      */}
      <dl className="mt-8 grid grid-cols-2 gap-x-6 gap-y-4 rounded-xl border border-border bg-surface/40 p-4 text-sm sm:grid-cols-3 lg:grid-cols-6">
        {infoRows.map((row) => (
          <div key={row.label} className="flex min-w-0 flex-col gap-1">
            <dt className="text-xs text-muted-soft">{row.label}</dt>
            <dd className="min-w-0">{row.value}</dd>
          </div>
        ))}
      </dl>

      {/* 简介：优先用 Bangumi 的（离线抓进 data/title-zh.json），拿不到才退回 AniList 英文 */}
      <section className="mt-12">
        <h2 className="section-mark mb-4 text-xl font-semibold">简介</h2>
        {summary ? (
          <>
            {/* 简介直接显示，不再挂「只有日文」的提示
                （2026-10-09 用户要求删除） */}
            <p className="text-sm leading-loose whitespace-pre-line text-muted-foreground">
              {summary.text}
            </p>
          </>
        ) : detail.description ? (
          <>
            {/* 同上，退而求其次也要说清楚 */}
            <p className="mb-2 text-xs text-muted-foreground">
              Bangumi 上没有这部作品的简介，下面是 AniList 的英文原文。
            </p>
            <p className="text-sm leading-loose whitespace-pre-line text-muted-foreground">
              {detail.description}
            </p>
          </>
        ) : (
          <p className="text-sm text-muted-foreground">这部作品暂时没有简介。</p>
        )}
      </section>

      {/* 剧集列表 */}
      <section className="mt-12">
        <h2 className="section-mark mb-4 text-xl font-semibold">剧集列表</h2>
        <EpisodeList list={episodes} />
      </section>

      {/* 哪里能看。数据在 lib/watch.ts 里组装，红线都收在那个文件里——这里只显示，只跳转不播放。
          ⚠️ id="watch" 是首页焦点位「去哪看」按钮的锚点（/anime/[id]#watch），改名要一起改 */}
      <section id="watch" className="mt-12">
        <h2 className="section-mark mb-4 text-xl font-semibold">哪里能看</h2>
        <WatchLinks detail={detail} />
      </section>

      {/*
        系列年表。
        ⚠️ 只有一部作品时**整块不显示**——一行的「年表」是噪音。
        实测触发这个状态的有：千与千寻（只有 1 条 CHARACTER 关系）、
        魔法使いの夜（7 条关系但过滤后 0 条）、赛博朋克 边缘行者 2（只有 1 条 OTHER）。
      */}
      {timeline.entries.length > 1 ? (
        <section className="mt-12">
          <h2 className="section-mark mb-4 text-xl font-semibold">系列年表</h2>
          <SeriesTimeline
            entries={timeline.entries}
            currentId={detail.id}
            partial={timeline.partial}
          />
        </section>
      ) : null}

      {/* 制作人员 */}
      <section className="mt-12">
        <h2 className="section-mark mb-4 text-xl font-semibold">制作人员</h2>
        <StaffList staff={detail.staff} />
      </section>

      {/* 声优。以声优为主体，角色只作挂靠 */}
      <section className="mt-12">
        <h2 className="section-mark mb-4 text-xl font-semibold">声优</h2>
        <CastList cast={detail.cast} missingCount={detail.castMissingCount} />
      </section>
    </main>
  );
}
