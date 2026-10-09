/**
 * 全站星空背景层（2026-10-07 深空星夜改版新增）。
 *
 * 三个子层、从下到上：星云（三团大光斑）→ 星点（三层平铺纹理）→ 流星（两条）。
 * 视觉全部在 app/globals.css 的「星空层」一节与文件末尾的关键帧里，
 * 这个组件只负责摆结构。
 *
 * ⚠️ 为什么是「服务端组件 + 纯 CSS」而不是 canvas / JS 星空：
 *   1. 它没有状态、没有事件、没有 JavaScript——**一个字节都不进客户端 bundle**；
 *   2. 动画全部只动 opacity / transform，跑在合成器上、不占主线程，
 *      滚动页面时不会和卡片渲染抢资源；
 *   3. 不依赖 JS 的装饰层最稳：脚本出错、离线、用户禁用 JS，星空照样在。
 *
 * ⚠️ `aria-hidden` + CSS 里的 `pointer-events: none` 缺一不可：
 *   前者让读屏软件跳过这层纯装饰；后者保证它绝不吃掉页面的任何点击
 *   （背景层吃掉点击是"整页点不动"级别的故障）。
 *
 * ⚠️ 容器是 `position: fixed`——不随滚动移动（像望远镜里固定的星空）。
 *   负 z-index 让它待在一切内容之下；顶栏半透明毛玻璃会把它隐约透出来，
 *   这是刻意的：顶栏"浮在星空上"比"盖住星空"更符合这个主题。
 *
 * ⚠️ 流星两条共用同一套样式、只差起点/角度/周期（17s / 23s），
 *   两条的相位差让"流星"出现得没有节奏感——**这是刻意的**，
 *   有节奏的流星看起来像特效，没节奏的才像夜空。
 */
export function StarfieldBackground() {
  return (
    <div aria-hidden className="starfield">
      {/*
        两档深度层（2026-10-09 签名动效·随指针视差）：
        星云和星点各自包一层，CSS 用 --par-x / --par-y（由 CursorSpotlight 写入）
        做**不同幅度的反向位移**——星云近(动得多)、星点远(动得少)，鼠标划动时
        整片星空有纵深。触摸设备和减弱动效下变量恒为 0、位移为零，等于没开。
        流星不参与视差（它们自己在飞）。
      */}
      <div className="starfield-depth-nebula">
        {/* 星云四团分居四角：星辉紫（左上）→ 深空蓝（右上）→ 深靛（右下）→ 深紫（左下）。
            ⚠️ 四个中心两两拉开是**安全性要求**，不只是构图：两团亮色若在屏幕中部
            重叠，小字对比度会破线（验算见 globals.css「星空层」约束 4）。 */}
        <div className="starfield-nebula-1" />
        <div className="starfield-nebula-2" />
        <div className="starfield-nebula-3" />
        <div className="starfield-nebula-4" />
      </div>

      <div className="starfield-depth-stars">
        {/* 星点三层：亮星疏、中星中、暗星密。平铺纹理，不是几百个 DOM 元素 */}
        <div className="starfield-stars-1" />
        <div className="starfield-stars-2" />
        <div className="starfield-stars-3" />
      </div>

      {/* 流星两条。reduced-motion 时由 CSS 整体隐藏，不在这里判断 */}
      <div className="starfield-meteor starfield-meteor-1" />
      <div className="starfield-meteor starfield-meteor-2" />

      {/*
        质感颗粒（2026-10-07 打磨）：一层极淡的噪点，压在最上面。
        它盖到星星上是有意的——让"星星 + 背景"整体统一成一层"胶片质感"，
        而不是"干净的背景上贴着锐利的星星"。4% 的浓度不影响任何可读性。
      */}
      <div className="starfield-noise" />
    </div>
  );
}
