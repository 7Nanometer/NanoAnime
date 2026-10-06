import type { Metadata } from "next";
import Image from "next/image";
import { notFound } from "next/navigation";

import { PersonNameNote } from "@/components/PersonNameNote";
import { PersonWorks } from "@/components/PersonWorks";
import { fetchPersonDetail } from "@/lib/anilist";
import { mergePersonWorks } from "@/lib/person";
import { getOccupationLabel } from "@/lib/staff-roles";

/**
 * 人物页。
 *
 * 入口只有一个：番剧详情页的「制作人员」「声优」两块点人名进来——
 * **不加顶栏导航项**（不是一级入口）。
 *
 * 和详情页一样是**服务端组件**：首屏的 1 次请求（人物本体 + 两个来源各 3 页作品）
 * 在服务器上直接发，不走 `/api/` 代理；「加载更多」才是客户端请求（走 /api/）。
 *
 * 名字显示沿用详情页的规矩：native（日文写法）当主名、罗马音当副名，
 * 底部一行小字说明（`PersonNameNote`）——**三处一致**（制作人员块 / 声优块 / 这里）。
 */

/** URL 里的 id 必须是纯数字。不是就当「没有这个人」处理，不去打 AniList */
function parseId(raw: string): number | null {
  return /^\d+$/.test(raw) ? Number(raw) : null;
}

/** 昵称兜底：AniList 上理论上不会两个名字都没有，但展示层不留空 */
const UNKNOWN_PERSON = "未知人物";

function displayName(nameNative: string | null, nameFull: string | null): string {
  return nameNative ?? nameFull ?? UNKNOWN_PERSON;
}

export async function generateMetadata(props: PageProps<"/person/[id]">): Promise<Metadata> {
  const { id } = await props.params;
  const parsed = parseId(id);
  const data = parsed === null ? null : await fetchPersonDetail(parsed);

  if (!data) {
    return { title: "人物不存在 · NanoAnime番鉴" };
  }
  const name = displayName(data.person.nameNative, data.person.nameFull);
  return { title: `${name} · NanoAnime番鉴` };
}

export default async function PersonPage(props: PageProps<"/person/[id]">) {
  const { id } = await props.params;
  const parsed = parseId(id);
  const data = parsed === null ? null : await fetchPersonDetail(parsed);

  // AniList 上没有这个 id，或 id 根本不是数字 → 跳 404 页（和详情页同一套处理）
  if (!data) {
    notFound();
  }

  const { person, staffEdges, castEdges, done } = data;
  const name = displayName(person.nameNative, person.nameFull);

  // 两个来源合并成"一部作品一行"，按人气倒序。**整批**传给客户端组件——
  // 首屏只显示前 24 行，但缓冲区里留着全部，后面「显示更多」不会跳过任何一部
  const works = mergePersonWorks([...staffEdges, ...castEdges]);

  // 职业标签：映射成中文后**再去重**（实测 32 人里 19 人有多个标签，最多 3 个；
  // 两个标签映射到同一个中文时合并，比如同一个人两种写法都指"编剧"）
  const occupations = [
    ...new Set(person.occupations.map(getOccupationLabel).filter((label) => label.length > 0)),
  ];

  // 信息行：**有一项显示一项**，缺的那项不出现（不是显示「—」）；三项全缺则整行不出现
  const infoItems: string[] = [];
  if (person.birthYear !== null) {
    infoItems.push(`${person.birthYear} 年生`);
  }
  if (person.yearsActiveStart !== null) {
    infoItems.push(`${person.yearsActiveStart} 年起活跃`);
  }
  if (person.favourites !== null) {
    infoItems.push(`AniList 收藏 ${person.favourites}`);
  }

  return (
    <main className="mx-auto max-w-4xl px-4 py-8 sm:py-10">
      {/* 头部：头像 + 名字 + 职业 + 信息行 + 简介（默认折叠） */}
      <div className="flex flex-col gap-6 sm:flex-row">
        {/*
          头像改成了**方形圆角**（原来是 2:3 的竖版），和详情页封面区分开。
          ⚠️ 为什么不用圆形头像：AniList 的人物图大多是「演艺人公式照」的竖构图，
          裁成圆形会把脸以外的部分全切掉，而且头像只占 2:3 画幅的一小块，看着很小。
          方形圆角能在同样宽度下露出更多画面，视觉重量也更稳。
        */}
        <div
          className="relative aspect-square w-32 shrink-0 self-start overflow-hidden rounded-xl bg-surface ring-1 ring-border sm:w-40"
        >
          {person.imageLarge ? (
            <Image
              src={person.imageLarge}
              alt={name}
              fill
              sizes="(max-width: 640px) 128px, 160px"
              preload
              className="object-cover"
            />
          ) : (
            // 没有头像时不留裂图、不破版：灰底 + 名字首字（实测 20/20 有头像，
            // 但这是真会出现的状态，兜底不能省）
            <span className="absolute inset-0 flex items-center justify-center text-3xl font-medium text-muted-foreground">
              {name.slice(0, 1)}
            </span>
          )}
        </div>

        <div className="flex min-w-0 flex-col gap-2">
          <h1 className="text-2xl leading-tight font-bold tracking-tight">{name}</h1>
          {/* 副行是罗马音——要复制去搜人时用它（底部还有一行专门说明）。
              主副名字相同时不重复渲染 */}
          {person.nameFull && person.nameFull !== name ? (
            <p className="-mt-1 text-sm text-muted-foreground">{person.nameFull}</p>
          ) : null}

          {/*
            职业标签改成 chip 样式。
            原来是一行用「/」连起来的纯文字，和下面的信息行视觉重量几乎一样，
            分不出哪个是"这个人是谁"、哪个是"这个人的一些数字"。
          */}
          {occupations.length > 0 ? (
            <ul className="flex flex-wrap gap-1.5">
              {occupations.map((occupation) => (
                <li
                  key={occupation}
                  className="rounded-md border border-brand/25 bg-brand-tint px-2 py-0.5 text-xs font-medium text-brand-strong"
                >
                  {occupation}
                </li>
              ))}
            </ul>
          ) : null}

          {infoItems.length > 0 ? (
            <p className="text-xs tabular-nums text-muted-foreground">
              {infoItems.join(" · ")}
            </p>
          ) : null}

          {/*
            英文简介：**默认折叠**（实测简介 2000~5000 字符、全是英文，
            铺开会把页面淹掉）。AniList 没有人物中文简介，标题里如实写明来源和语言。
            `details` 原生折叠，不需要 JS——这块没有交互逻辑，不必做成客户端组件。
          */}
          {person.description ? (
            <details className="group mt-1 rounded-lg border border-border bg-surface/60">
              <summary className="cursor-pointer list-none px-3 py-2 text-sm text-muted-foreground transition-colors duration-150 hover:text-foreground [&::-webkit-details-marker]:hidden">
                <span className="inline-flex items-center gap-1.5">
                  {/* 三角标用 SVG 并跟着 open 状态旋转——原生那个 marker 在各个浏览器长得都不一样 */}
                  <svg
                    viewBox="0 0 24 24"
                    aria-hidden
                    className="size-3.5 transition-transform duration-200 group-open:rotate-90"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth={2.5}
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <path d="M9 6l6 6-6 6" />
                  </svg>
                  英文简介（来自 AniList）
                </span>
              </summary>
              <p className="border-t border-border px-3 py-3 text-sm leading-relaxed whitespace-pre-line text-muted-foreground">
                {person.description}
              </p>
            </details>
          ) : null}

          {/* 名字说明：与制作人员块 / 声优块**同一组件、同一措辞**（三处一致） */}
          <div className="mt-2">
            <PersonNameNote />
          </div>
        </div>
      </div>

      {/*
        参与作品。标题**不写数字**（「共 N 部」是禁用语——总数的来路不可靠，见通用纪律）。
        列表本身是客户端组件：它管「加载更多」
      */}
      <section className="mt-12">
        <h2 className="section-mark mb-4 text-lg font-semibold">参与作品</h2>
        <PersonWorks personId={person.id} initialWorks={works} initialDone={done} />
      </section>
    </main>
  );
}
