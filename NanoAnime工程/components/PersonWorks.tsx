"use client";

import Link from "next/link";
import { useState } from "react";

import { getShortFormatLabel, UNKNOWN_TITLE } from "@/lib/anime-display";
import { appendPersonWorks } from "@/lib/person";
import { formatRolesLimited } from "@/lib/staff-roles";
import type { PersonWork } from "@/types/anime";

/** 首屏显示多少行。与搜索页结果上限一致，不再另造数字 */
const INITIAL_COUNT = 24;
/** 首屏服务端取到第几页（两个来源各 3 页）——「加载更多」从下一页接着走 */
const INITIAL_PAGES = 3;
/** 一次点击最多连拉几批（某一批可能全是重复登记，见下面 loadMore 的注释） */
const MAX_FETCH_LOOPS = 5;

/**
 * 人物页的作品列表。**这是客户端组件**，因为它要「加载更多」。
 *
 * 数据流（和年表的"截断+展开"是两种思路，这里是**先多取一点、再分批放出来**）：
 *   ① 首屏服务端取回两个来源**各 3 页**，合并排序后**整批**传进来（不是只传 24 条）——
 *      这样后面加载时不会有"第 25~N 名被跳过"的洞。为什么是 3 页：实测「一页边 ≠ 一部作品」，
 *      澤野弘之 2 页 50 条边只合并出 20 部，填不满 24 行；3 页才够（请求数不变，只是响应大一点）
 *   ② 点「加载更多」：拉下一批（1 次请求 = 2 页 × 2 来源），并入缓冲区后**把已取到的全部显示出来**。
 *      这样每点一次新露出的行数 = 这一批新合并出的作品数（实测量级 12~48 行）
 *   ③ 并入时按作品 id 去重，**已经显示的行一行不动、不重排**——
 *      跨批之间不保证全局人气序，这是分页的固有代价（已裁定接受），只要不重、不漏
 *   ④ 已经到头（done）但缓冲区还有没显示的：只放出来，**不再发请求**
 */
export function PersonWorks({
  personId,
  initialWorks,
  initialDone,
}: {
  personId: number;
  /** 首屏取回并合并好的全部作品（按人气倒序）。**不是**只传前 24 条 */
  initialWorks: PersonWork[];
  /** 首屏那 3 页是否已经取完（两个来源都没了）。true 且缓冲区显示完时，按钮就不出现了 */
  initialDone: boolean;
}) {
  const [works, setWorks] = useState(initialWorks);
  const [shown, setShown] = useState(INITIAL_COUNT);
  const [done, setDone] = useState(initialDone);
  const [nextPage, setNextPage] = useState(INITIAL_PAGES + 1);
  const [loading, setLoading] = useState(false);
  const [failed, setFailed] = useState(false);

  const visible = works.slice(0, shown);
  const hasMore = shown < works.length || !done;

  async function loadMore() {
    if (loading) {
      return;
    }

    // ① 已经到头了，只是缓冲区里还有没放出来的：直接放完，不出网
    if (done && shown < works.length) {
      setShown(works.length);
      return;
    }

    // ② 拉下一批（1 次请求 = 2 页 × 2 来源），然后显示全部已取到的
    setLoading(true);
    setFailed(false);
    try {
      let current = works;
      let page = nextPage;
      let finished = done;

      // 循环的原因：某一批可能全是**已经见过的作品**（同一作品的多条登记被页边界切开），
      // 那样这批只会加 0 行、用户看着像"点了没反应"。遇上就接着拉下一批，最多 5 次防跑飞
      for (let i = 0; i < MAX_FETCH_LOOPS; i++) {
        const response = await fetch(`/api/person/${personId}/works?page=${page}`);
        if (!response.ok) {
          throw new Error(`接口返回 HTTP ${response.status}`);
        }
        const data = (await response.json()) as { works: PersonWork[]; done: boolean };
        const merged = appendPersonWorks(current, data.works);
        const added = merged.length - current.length;
        current = merged;
        page += 2;
        finished = data.done;
        if (added > 0 || finished) {
          break;
        }
      }

      setWorks(current);
      setNextPage(page);
      setDone(finished);
      setShown(current.length);
    } catch {
      // 失败不往上抛：页面主体和已有行一动不动，只在按钮上方加一行说明
      setFailed(true);
    } finally {
      setLoading(false);
    }
  }

  // 两个来源都查不到作品。措辞**不带数字、不说「全部」**（见验收的通用纪律）
  if (works.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">AniList 上暂时查不到这个人参与的作品。</p>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      <ol className="divide-y divide-border rounded-lg border border-border">
        {visible.map((work) => {
          const roles = formatRolesLimited(work.roles);
          const dubbing =
            work.characters.length > 0 ? `配音：${work.characters.join("、")}` : null;
          const detail = [roles, dubbing].filter(Boolean).join(" ｜ ");

          return (
            <li key={work.mediaId}>
              {/* 整行都是链接：点进作品详情页（往返闭环） */}
              <Link
                href={`/anime/${work.mediaId}`}
                className="flex flex-col gap-0.5 px-3 py-2 text-sm transition-colors hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
              >
                <span className="flex items-baseline gap-3">
                  <span className="w-10 shrink-0 text-xs tabular-nums text-muted-foreground">
                    {work.year ?? "—"}
                  </span>
                  <span className="w-12 shrink-0 text-xs text-muted-foreground">
                    {getShortFormatLabel(work.format)}
                  </span>
                  <span className="min-w-0 flex-1 truncate">{work.titleNative ?? UNKNOWN_TITLE}</span>
                </span>
                {detail ? (
                  <span className="break-words text-xs text-muted-foreground">{detail}</span>
                ) : null}
              </Link>
            </li>
          );
        })}
      </ol>

      {failed ? (
        <p className="text-xs text-muted-foreground">这次没能加载出来，可以再试一次。</p>
      ) : null}

      {hasMore ? (
        <button
          type="button"
          onClick={loadMore}
          disabled={loading}
          className="self-start rounded-md border border-border px-3 py-1.5 text-sm transition-colors hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none disabled:opacity-60"
        >
          {loading ? "加载中…" : "加载更多"}
        </button>
      ) : null}
    </div>
  );
}
