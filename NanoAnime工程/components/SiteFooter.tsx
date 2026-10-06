/**
 * 全站页脚。
 *
 * 数据来源声明是**合规项**，`docs/产品方案.md` 的合规清单里写明了做法：
 * 「元数据来源标注（AniList / Bangumi），**只在页脚以小字呈现，不做成跳转链接**」。
 *
 * ⚠️ 所以这里的 AniList / Bangumi 是**纯文字，不是链接**——把来源做成可点的外链，
 * 等于在自己的站上给第三方做导流入口，和这条合规要求相悖。别顺手加 `<a>`。
 */
export function SiteFooter() {
  return (
    <footer className="mt-16 border-t border-border">
      <div className="mx-auto max-w-7xl px-4 py-8 text-xs leading-relaxed text-muted-foreground">
        <p>本站不提供在线播放，只做正版平台的跳转指引。观看请支持正版。</p>
        <p className="mt-1">
          元数据来源：AniList、Bangumi。番剧信息与图片版权归原作者及原平台所有。
        </p>
        {/*
          ⚠️ 这句是**承诺**，不是功能说明 —— 写之前先确认它成立。
          原来写的是「保存在你自己的浏览器里，不会上传」，那是云同步做出来之前的实情；
          同步上线后它就不成立了，而它出现在**全站每一页**，等于对着所有人说假话。
          「仅你可见」是可兑现的：数据库那边靠行级安全策略（RLS）保证每行只能被本人读写，
          已用两个账号交叉实测过（A 写的记录，B 读 0 行、改 0 行、删 0 行）。
          改动前先看 docs/进度.md 第 59 条。
        */}
        <p className="mt-1">
          未登录时只存在本机；登录后会同步到你的账号，仅你可见。
        </p>
      </div>
    </footer>
  );
}
