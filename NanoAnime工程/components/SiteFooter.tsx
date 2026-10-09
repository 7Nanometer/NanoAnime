import Link from "next/link";

import { SITE_CONTAINER } from "@/lib/layout";

/**
 * 全站页脚。
 *
 * 数据来源声明是**合规项**，`docs/产品方案.md` 的合规清单里写明了做法：
 * 「元数据来源标注（AniList / Bangumi），**只在页脚以小字呈现，不做成跳转链接**」。
 *
 * ⚠️ 所以这里的 AniList / Bangumi 是**纯文字，不是链接**——把来源做成可点的外链，
 * 等于在自己的站上给第三方做导流入口，和这条合规要求相悖。别顺手加 `<a>`。
 *
 * 视觉层级（M6 立、2026-10-09 重排时保留）：
 *   ① 最主要的一句 —— 合规声明，最亮、最大（品牌区里）
 *   ② 来源与版权 —— 次级
 *   ③ 数据存储承诺 —— 再次级，用一道细分隔线单独隔开
 *
 * 2026-10-07 深空星夜：顶部原来那条实色 border-t 换成**星辉渐变线**
 * （中段亮、两端隐没）——页脚站在"地平线"上，是星空的收尾。
 *
 * 2026-10-09 电影化改版重排：原来三行小字齐刷刷堆在左侧、右半边全空。
 * 现在左侧是"品牌区"（星标 + 站名 + 合规声明），右侧是两列站内导航
 * （探索 / 我的）——页脚从"免责声明区"变成真正的"出口"。
 * ⚠️ 站内导航只加站内链接；跨站链接一根都不加（同上面合规那一条）。
 */
export function SiteFooter() {
  return (
    <footer className="mt-20">
      {/* 星辉分隔线。纯装饰，读屏软件跳过 */}
      <div
        aria-hidden
        className="h-px bg-linear-to-r from-transparent via-brand/30 to-transparent"
      />

      <div className={`${SITE_CONTAINER} py-10`}>
        <div className="flex flex-col gap-10 sm:flex-row sm:items-start sm:justify-between">
          {/* 品牌区：星标沿用顶栏的呼吸动画（.star-logo），页脚与顶栏呼应 */}
          <div className="flex max-w-sm flex-col gap-2.5">
            <p className="flex items-center gap-2 text-sm font-semibold tracking-tight">
              <span aria-hidden className="star-logo size-2 shrink-0 rounded-full bg-brand-strong" />
              NanoAnime 番鉴
            </p>
            <p className="text-[13px] leading-relaxed text-muted-foreground">
              本站不提供在线播放，只做正版平台的跳转指引。观看请支持正版。
            </p>
          </div>

          {/* 站内导航两列。链接色用 muted-soft（算过对比度的实色），悬停转正文色 */}
          <nav aria-label="页脚导航" className="flex gap-12 text-xs sm:gap-16">
            <div className="flex flex-col gap-2.5">
              <p className="font-medium text-muted-foreground">探索</p>
              <Link href="/" className="text-muted-soft transition-colors duration-150 hover:text-foreground">
                首页
              </Link>
              <Link href="/updates" className="text-muted-soft transition-colors duration-150 hover:text-foreground">
                最近更新
              </Link>
              <Link href="/browse" className="text-muted-soft transition-colors duration-150 hover:text-foreground">
                全部番剧
              </Link>
              <Link href="/calendar" className="text-muted-soft transition-colors duration-150 hover:text-foreground">
                追番周表
              </Link>
            </div>
            <div className="flex flex-col gap-2.5">
              <p className="font-medium text-muted-foreground">我的</p>
              <Link href="/search" className="text-muted-soft transition-colors duration-150 hover:text-foreground">
                搜索
              </Link>
              <Link href="/my" className="text-muted-soft transition-colors duration-150 hover:text-foreground">
                我的追番
              </Link>
              <Link href="/account" className="text-muted-soft transition-colors duration-150 hover:text-foreground">
                个人中心
              </Link>
            </div>
          </nav>
        </div>

        <div className="mt-10 flex flex-col gap-3 text-xs leading-relaxed">
          <p className="text-muted-foreground/80">
            元数据来源：AniList、Bangumi。番剧信息与图片版权归原作者及原平台所有。
          </p>
          {/*
            ⚠️ 这句是**承诺**，不是功能说明 —— 写之前先确认它成立。
            ⚠️ 它随功能变化改过多轮（史：①「保存在你的浏览器里，不会上传」→ ②「仅你可见」
            → ③「公开可见」——第③版是 M5-2-1 的，**从未上线就整体撤回**，见 docs/进度.md）。
            「仅你可见」是可兑现的：数据库靠行级安全策略（RLS）保证每行只能被本人读写，
            已用两个账号交叉实测（A 写的记录，B 读 0 行、改 0 行、删 0 行）。
            改动前先看 docs/进度.md 第 59、87 条。
          */}
          <p className="border-t border-border pt-3 text-muted-foreground/80">
            未登录时只存在本机；登录后会同步到你的账号，仅你可见。
          </p>
        </div>
      </div>
    </footer>
  );
}
