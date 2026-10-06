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
      {/* 搜索页额外打个标——万一用户没看到上面那段说明，也不会以为点进去就是作品页 */}
      {link.kind === "search" ? (
        <span className="rounded bg-surface-elevated px-1 py-0.5 text-[10px] leading-none text-muted-foreground">
          搜索
        </span>
      ) : (
        <span aria-hidden className="text-xs text-muted-foreground">
          ↗
        </span>
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
      <section>
        <h3 className="mb-2.5 text-sm font-semibold">海外平台</h3>
        {overseas.length > 0 ? (
          <ul className="flex flex-wrap gap-2">
            {overseas.map((link) => (
              <li key={link.url}>
                <LinkButton link={link} />
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-muted-foreground">暂无海外正版渠道。</p>
        )}
      </section>

      {domestic.length > 0 ? (
        <section className="border-t border-border pt-4">
          <h3 className="mb-2.5 text-sm font-semibold">国内平台</h3>
          {/* 如实说明：给的是搜索入口，不是「这部番就在这家」 */}
          <p className="mb-2.5 text-xs leading-relaxed text-muted-foreground">
            下面几个是各平台的<strong className="font-medium text-foreground">站内搜索</strong>，不是作品页。我们没有「哪部番在哪家平台」
            的数据，只能给你搜索入口，点进去还需要自己认一下。
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

      <p className="border-t border-border pt-4 text-xs text-muted-foreground">
        本站不提供在线播放，只做正版平台的跳转指引。链接均在新标签页打开。
      </p>
    </div>
  );
}
