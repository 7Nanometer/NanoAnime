"use client";

import { useEffect } from "react";

/**
 * 鼠标跟随光的「位置写入器」（2026-10-07 顶级打磨 · 鼠标微交互）。
 *
 * 卡片封面上那团跟着鼠标走的柔光（`.cover-spot`，样式在 globals.css）——
 * 它的位置由 CSS 变量 `--spot-x / --spot-y` 决定，而**这里是全站唯一
 * 给这两个变量赋值的地方**。
 *
 * ⚠️ 为什么用"全局监听 + 事件委托"，而不是每张卡片自己监听：
 * 首页一屏最多 21 张卡，如果每张卡挂一个 pointermove，就是 21 个监听器
 * 同时被高频触发。挂在 document 上只有一个，用 `closest()` 找到当前
 * 悬停的那张卡再写它自己的变量。
 *
 * ⚠️ 三条性能纪律：
 * 1. **rAF 节流**：pointermove 每秒能触发上百次；用 requestAnimationFrame
 *    把"写样式"压到每帧最多一次（只在事件里记坐标）。
 * 2. **只写 CSS 变量**：不碰布局属性，把重绘面积压到一张卡片以内。
 * 3. **回调用 passive: true**：明确告诉浏览器这个监听器不会 preventDefault，
 *    滚动时不会因此产生额外延迟。
 *
 * ⚠️ 两类设备/设置下**直接不启用**：
 *   · 触摸设备（`hover: none`）——没有"悬停"这回事，装了也永远不显示；
 *   · 系统开了「减弱动态效果」——跟随光斑属于"随指针移动的动效"，
 *     对前庭敏感人群不友好，按无障碍惯例直接关掉。
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
      if (!card) {
        return;
      }
      const rect = card.getBoundingClientRect();
      const style = (card as HTMLElement).style;
      style.setProperty("--spot-x", `${clientX - rect.left}px`);
      style.setProperty("--spot-y", `${clientY - rect.top}px`);
    };

    const onMove = (event: PointerEvent) => {
      const target = event.target;
      if (!(target instanceof Element)) {
        return;
      }
      card = target.closest(".cover-spot");
      if (!card) {
        return;
      }
      clientX = event.clientX;
      clientY = event.clientY;
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
