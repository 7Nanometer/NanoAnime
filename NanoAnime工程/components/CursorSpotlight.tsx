"use client";

import { useEffect } from "react";

/**
 * 指针微交互的「位置写入器」（2026-10-07 顶级打磨；2026-10-09 加入星空视差）。
 *
 * 它给两类东西写位置，**全站只有这一个 pointermove 监听器**：
 *
 *   1. **卡片封面的跟随光斑**（`.cover-spot`，样式在 globals.css）——
 *      位置由 CSS 变量 `--spot-x / --spot-y` 决定（写在当前悬停的那张卡片上）。
 *   2. **星空背景的随动视差**（2026-10-09 签名动效）——归一化坐标
 *      `--par-x / --par-y`（-1 ~ 1，页面中心为 0）写在 <html> 上；
 *      `StarfieldBackground` 的两档深度层用它做不同幅度的反向位移，
 *      鼠标划动时星云和星点有"深浅两层"的纵深感。
 *
 * ⚠️ 为什么用"全局监听 + 事件委托"，而不是每张卡片自己监听：
 * 首页一屏最多 21 张卡，如果每张卡挂一个 pointermove，就是 21 个监听器
 * 同时被高频触发。挂在 document 上只有一个，用 `closest()` 找到当前
 * 悬停的那张卡再写它自己的变量。
 *
 * ⚠️ 四条性能纪律：
 * 1. **rAF 节流**：pointermove 每秒能触发上百次；用 requestAnimationFrame
 *    把"写样式"压到每帧最多一次（只在事件里记坐标）。
 * 2. **只写 CSS 变量**：不碰布局属性——卡片光斑的重绘面积压在一张卡以内，
 *    视差只影响星空的两个合成层。
 * 3. **回调用 passive: true**：明确告诉浏览器这个监听器不会 preventDefault，
 *    滚动时不会因此产生额外延迟。
 * 4. 指针离开卡片时**不清零光斑坐标**（旧的坐标留在卡片上、透明度归零而已），
 *    少写一次样式；视差坐标则持续更新（整页范围都要跟）。
 *
 * ⚠️ 两类设备/设置下**直接不启用**（光斑和视差一起关）：
 *   · 触摸设备（`hover: none`）——没有"悬停"这回事，装了也永远不显示；
 *   · 系统开了「减弱动态效果」——随指针移动的动效对前庭敏感人群不友好，
 *     按无障碍惯例直接关掉。
 *
 * 组件本身渲染 null——它不出现在页面上，只挂一个监听器。
 */
export function CursorSpotlight() {
  useEffect(() => {
    // 触摸设备 / 无悬停能力：不启用
    if (!window.matchMedia("(hover: hover)").matches) {
      return;
    }
    // 「减弱动态效果」：不启用
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      return;
    }

    let raf = 0;
    let card: Element | null = null;
    let clientX = 0;
    let clientY = 0;

    const flush = () => {
      raf = 0;

      // 星空视差：把像素坐标归一化成 -1 ~ 1，CSS 侧乘各自的幅度
      const nx = (clientX / window.innerWidth) * 2 - 1;
      const ny = (clientY / window.innerHeight) * 2 - 1;
      const root = document.documentElement.style;
      root.setProperty("--par-x", nx.toFixed(3));
      root.setProperty("--par-y", ny.toFixed(3));

      // 卡片光斑：只写"当前悬停的那张卡"自己的坐标
      if (!card) {
        return;
      }
      const rect = card.getBoundingClientRect();
      const style = (card as HTMLElement).style;
      style.setProperty("--spot-x", `${clientX - rect.left}px`);
      style.setProperty("--spot-y", `${clientY - rect.top}px`);
    };

    const onMove = (event: PointerEvent) => {
      clientX = event.clientX;
      clientY = event.clientY;
      const target = event.target;
      // 指针不在任何卡片上时 card 为 null：视差照常跟、光斑跳过
      card = target instanceof Element ? target.closest(".cover-spot") : null;
      if (!raf) {
        raf = window.requestAnimationFrame(flush);
      }
    };

    document.addEventListener("pointermove", onMove, { passive: true });
    return () => {
      document.removeEventListener("pointermove", onMove);
      if (raf) {
        window.cancelAnimationFrame(raf);
      }
    };
  }, []);

  return null;
}
