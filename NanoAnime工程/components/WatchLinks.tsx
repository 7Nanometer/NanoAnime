import { buildWatchLinks, type WatchLink } from "@/lib/watch";
import type { AnimeDetail } from "@/types/anime";

/**
 * 一个观看入口按钮。
 *
 * ⚠️ `rel="noopener noreferrer"` **不能省**：这是全项目第一次往站外开新标签页。
 * 没有 noopener 的话，对方页面能通过 `window.opener` 反过来操作我们这一页。
 */
function LinkButton({ link }: { link: WatchLink }) {
  return (
    <a
      href={link.url}
      target="_blank"
      rel="noopener noreferrer"
      className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-surface px-3 py-1.5 text-sm transition-all duration-150 hover:border-brand/50 hover:bg-surface-elevated focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none active:scale-[0.98]"
    >
      {link.site}
      {/* 两种链接的"身份标"（2026-10-09 做得更醒目）：搜索入口用品牌紫、作品页用中性灰。
          紫色的那个是在提醒"点进去还要自己搜一下"，别把两种链接当成一回事。 */}
      {link.kind === "search" ? (
        <span className="rounded-full border border-brand/40 bg-brand/10 px-1.5 py-0.5 text-[10px] font-medium leading-none text-brand">
          站内搜索
        </span>
      ) : (
        <>
          <span className="rounded-full border border-border bg-surface-elevated px-1.5 py-0.5 text-[10px] leading-none text-muted-foreground">
            作品页
          </span>
          <span aria-hidden className="text-xs text-muted-foreground">
            ↗
          </span>
        </>
      )}
    </a>
  );
}

/**
 * 详情页的「哪里能看」。
 *
 * 数据在 `lib/watch.ts` 里组装——**红线都收在那个文件里**，这里只负责显示。
 * 这里只跳转、不播放：不抓播放地址、不解析、不嵌 iframe、不做播放器。
 */
export function WatchLinks({ detail }: { detail: AnimeDetail }) {
  const { overseas, domestic } = buildWatchLinks(detail);

  // 两个区都空：连番名都取不到，搜索链接也生成不出来。这是唯一该写「暂无正版渠道」的情况
  if (overseas.length === 0 && domestic.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-border p-4 text-sm text-muted-foreground">
        <p>暂无正版渠道。</p>
        <p className="mt-1 text-xs">本站不提供在线播放，只做正版平台的跳转指引。</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-5 rounded-xl border border-border bg-surface/50 p-4">
      {/* 国内正版在前（2026-10-09 调序）：本站访客以国内用户为主，
          最可能用到的入口放最上面。 */}
      {domestic.length > 0 ? (
        <section>
          <h3 className="mb-2.5 text-sm font-semibold">国内正版</h3>
          {/* 如实说明：给的是搜索入口，不是「这部番就在这家」 */}
          <p className="mb-2.5 text-xs leading-relaxed text-muted-foreground">
            跳的是哔哩哔哩的<strong className="font-medium text-foreground">站内搜索</strong>
            ，不是这部番的作品页——点进去搜番名、自己认一下哪条是这部番。本站没有「哪部番在哪个平台」的数据，所以只给搜索入口。
          </p>
          <ul className="flex flex-wrap gap-2">
            {domestic.map((link) => (
              <li key={link.url}>
                <LinkButton link={link} />
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <section className={domestic.length > 0 ? "border-t border-border pt-4" : ""}>
        <h3 className="mb-2.5 text-sm font-semibold">海外正版</h3>
        {overseas.length > 0 ? (
          <>
            {/* 海外链接是作品页（AniList 的 STREAMING 数据筛出来的），点进去就是这部番；
                顺手把"打不开多半是地区限制"说清楚，省得用户以为是坏链 */}
            <p className="mb-2.5 text-xs leading-relaxed text-muted-foreground">
              下面都是各平台的<strong className="font-medium text-foreground">作品页</strong>
              ，点进去直接是这部番（打不开通常是地区限制）。
            </p>
            <ul className="flex flex-wrap gap-2">
              {overseas.map((link) => (
                <li key={link.url}>
                  <LinkButton link={link} />
                </li>
              ))}
            </ul>
          </>
        ) : (
          <p className="text-sm text-muted-foreground">暂无海外正版渠道。</p>
        )}
      </section>

      <p className="border-t border-border pt-4 text-xs text-muted-foreground">
        本站不提供在线播放，只做正版平台的跳转指引。链接均在新标签页打开。
      </p>
    </div>
  );
}
