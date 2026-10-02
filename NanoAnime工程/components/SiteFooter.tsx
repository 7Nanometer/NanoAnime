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
        <p className="mt-1">追番与观看进度保存在你自己的浏览器里，不会上传。</p>
      </div>
    </footer>
  );
}
