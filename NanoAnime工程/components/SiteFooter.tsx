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
 * 视觉上分了三级信息层级（M6 视觉重构）：
 *   ① 最主要的一句 —— 合规声明，最亮、最大
 *   ② 来源与版权 —— 次级
 *   ③ 数据存储承诺 —— 再次级，用一道细分隔线单独隔开
 * 原来三行同字号同颜色堆在一起，读者分不出哪句更重要。
 */
export function SiteFooter() {
  return (
    <footer className="mt-16 border-t border-border">
      <div className={`${SITE_CONTAINER} flex flex-col gap-2 py-8 text-xs leading-relaxed`}>
        <p className="text-muted-foreground">
          本站不提供在线播放，只做正版平台的跳转指引。观看请支持正版。
        </p>
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
        <p className="mt-3 border-t border-border pt-3 text-muted-foreground/80">
          未登录时只存在本机；登录后会同步到你的账号，仅你可见。
        </p>
      </div>
    </footer>
  );
}
