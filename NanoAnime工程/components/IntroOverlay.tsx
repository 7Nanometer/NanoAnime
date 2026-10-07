"use client";

import { useEffect, useRef } from "react";

import { deviceTier, sampleGlyph, waitGlyphFont, type Particle } from "@/lib/intro";

/**
 * 入场动画「星尘聚字」（2026-10-07）。
 *
 * 打开网站时的开场：黑场 → 星尘从四面八方汇聚成「番鉴」→ 星芒一闪 →
 * 星尘如萤火散开 → 覆盖层化开、网站浮现。总长约 2.85 秒。
 * 样式在 globals.css 的「入场动画」一节；采样的数据层在 lib/intro.ts。
 *
 * ─────────────────────────────────────────────────────────────
 * 六条必须守住的纪律：
 *
 * 1. **「要不要播」由 `html` 上的 `intro-playing` 类决定**——那个类由
 *    layout.tsx 里一段**先于页面首帧执行**的内联脚本添加。要播的用户：
 *    黑场从第一帧就在（不存在"先闪一下网页"）；不播的用户（本标签页
 *    已播过 / 无 JS / 减弱动效）：这层 `display: none`，连渲染都不发生。
 *    ⚠️ 不能用 next/script 的 beforeInteractive——它要等 JS 包下载完才执行，
 *    比首次绘制还晚，防闪意义为零（已从 Next 源码核实）。
 * 2. **时间锚点是 `window.__introT0`**（内联脚本记的"HTML 开始解析"时刻），
 *    不是组件挂载时刻——组件挂载可能晚几百毫秒，用挂载时刻会让动画整体拖后。
 * 3. **减弱动态效果直接跳过**（内联脚本已判过一道，组件里再判一道）。
 * 4. **任意输入即跳过**（点击 / 按键）：给着急的人留门，也是慢设备用户的逃生口。
 * 5. **一切资源都在卸载时清干净**：取消 rAF、画布背板归零、摘掉两个类——
 *    动画只活 3 秒，不留任何常驻开销。
 * 6. **StrictMode 安全**：dev 下 effect 会"跑-清-再跑"，所以启动闸门必须在
 *    清理时复位；任何一次清理漏取消 rAF 都会让两轮动画叠着跑。
 * ─────────────────────────────────────────────────────────────
 *
 * 技术选型（为什么是 Canvas 粒子）：几百个独立运动的点用 DOM 做必卡；
 * Canvas 每帧只做"1 次拖尾 stroke + 4 次光点 fill"（按颜色分组合批），
 * 700 个粒子毫无压力。字形不是"写上去的"而是**采样出来的**——
 * 采样到什么字形（含后备字体），聚出来就是什么字形。
 */

/** 时间线（秒，以 __introT0 为 0）。总长 2.85 ≤ 用户要求的 3 秒 */
const TL = {
  /** 星尘开始汇聚（前面 0.45 秒是"黑场 + 底星浮现"） */
  converge: 0.45,
  /** 字形成型 */
  formed: 1.5,
  /** 星芒一闪 */
  flash: 1.72,
  /** 开始散开 */
  scatter: 1.98,
  /** 覆盖层开始化开 */
  leave: 2.42,
  /** 彻底结束（卸载） */
  end: 2.9,
} as const;

/** 超过这个时刻组件才挂载（说明 JS 来晚了）就不再播，直接跳收尾 */
const LATE_LIMIT = 2.3;

/** 光点的四个颜色档：白为主，淡紫、紫、淡蓝点缀（星辉 + 动漫霓虹） */
const COLORS = [
  "rgba(255,255,255,0.95)",
  "rgba(233,228,255,0.92)",
  "rgba(205,194,255,0.9)",
  "rgba(186,205,255,0.85)",
] as const;

/**
 * StrictMode 启动闸门（模块级——dev 下 effect 会跑两次）。
 * 清理时复位：允许"清-再跑"的正常重挂载，只拦"没清就再来"的意外双启动。
 */
let running = false;

type IntroWindow = Window & { __introT0?: number };

export function IntroOverlay() {
  // ⚠️ 刻意**不用 React 状态**控制显示/卸载：
  //   · 显示与否完全由 <html> 上的类决定（CSS 的事，见 globals.css）；
  //   · 收尾由 CSS 的淡出 + 这里释放画布完成——DOM 留在原地（display:none
  //     下不占任何资源），不存在"卸载时机"这种需要防错的中间状态。
  // 这也是为什么组件无条件渲染：没标记的访客看到的是 display:none 的空壳，
  // 零开销；有标记的访客在首帧就看到黑场（黑场由 CSS 从第一帧接管，
  // 不依赖本组件何时挂载——挂载只影响星尘何时开始飞）。
  return (
    <div className="intro-overlay" aria-hidden>
      <IntroScene />
    </div>
  );
}

/** 动画本体：挂载即开跑、卸载即清场。生命周期与 DOM 严格一致 */
function IntroScene() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const flashRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (running) {
      return;
    }
    const canvas = canvasRef.current;
    const flash = flashRef.current;
    if (!canvas || !flash) {
      return;
    }
    running = true;

    const root = document.documentElement;
    const win = window as IntroWindow;
    /** 绝对时间轴：0 = HTML 开始解析（内联脚本记的） */
    const t0 = win.__introT0 ?? performance.now();
    const nowSec = () => (performance.now() - t0) / 1000;

    const ac = new AbortController();
    const timers: number[] = [];
    let raf = 0;
    let finished = false;

    const clearTimers = () => {
      timers.forEach((id) => window.clearTimeout(id));
      timers.length = 0;
    };

    /** 按绝对时间点排一个定时器（自动扣掉"已经过去的时间"） */
    const schedule = (atSec: number, fn: () => void) => {
      const delay = Math.max(0, atSec * 1000 - (performance.now() - t0));
      timers.push(window.setTimeout(fn, delay));
    };

    /** 收尾：停循环、化开覆盖层，稍后复位类名并释放画布 */
    const finish = () => {
      if (finished) {
        return;
      }
      finished = true;
      clearTimers();
      cancelAnimationFrame(raf);
      root.classList.add("intro-leaving");
      timers.push(
        window.setTimeout(() => {
          root.classList.remove("intro-playing", "intro-leaving");
          // 释放画布背板。放在淡出结束之后——提前清会让画面"啪"地消失
          canvas.width = 0;
          canvas.height = 0;
        }, 420),
      );
    };

    const skip = () => {
      finish();
    };
    // 任意输入即跳过：点击、触摸、按键都算
    window.addEventListener("pointerdown", skip, { signal: ac.signal });
    window.addEventListener("keydown", skip, { signal: ac.signal });

    const boot = async () => {
      // JS 来晚了（组件挂载太迟）就不再播了，直接收尾
      if (nowSec() > LATE_LIMIT) {
        finish();
        return;
      }

      await waitGlyphFont(); // 等「番鉴」字形就绪（带超时，超时用系统字体照常播）
      if (finished) {
        return;
      }

      // ── 画布与坐标 ───────────────────────────────────────
      const w = window.innerWidth;
      const h = window.innerHeight;
      const tier = deviceTier();
      const dpr = Math.min(window.devicePixelRatio || 1, tier.maxDpr);
      canvas.width = Math.round(w * dpr);
      canvas.height = Math.round(h * dpr);
      // alpha:false：覆盖层是不透明的黑场，省掉整层透明合成
      const ctx = canvas.getContext("2d", { alpha: false });
      if (!ctx) {
        finish();
        return;
      }
      // ⚠️ 设过 canvas.width 之后上下文状态会重置——transform 必须在这之后设。
      // 之后所有绘制都用 CSS px 坐标，和粒子数组、采样点集同一套。
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

      // ── 采样字形 + 建粒子 ────────────────────────────────
      const ccx = w / 2;
      const ccy = h * 0.45; // 与 lib/intro.ts 里的绘制中心一致
      const targets = sampleGlyph(w, h, tier.count);
      if (targets.length === 0) {
        finish();
        return;
      }

      const flyFrom = Math.max(w, h);
      const particles: Particle[] = targets.map((t) => {
        const ang = Math.random() * Math.PI * 2;
        const dist = flyFrom * (0.55 + Math.random() * 0.7);
        const tx = ccx + t.x;
        const ty = ccy + t.y;
        const escAng = Math.atan2(ty - ccy, tx - ccx) + (Math.random() - 0.5) * 0.9;
        const escDist = 180 + Math.random() * 520;
        return {
          sx: ccx + Math.cos(ang) * dist,
          sy: ccy + Math.sin(ang) * dist,
          tx,
          ty,
          ex: tx + Math.cos(escAng) * escDist,
          ey: ty + Math.sin(escAng) * escDist,
          x: ccx + Math.cos(ang) * dist,
          y: ccy + Math.sin(ang) * dist,
          px: 0,
          py: 0,
          // 点比之前更小（0.9~1.9px）：密度上去之后，细点才不会把笔画糊在一起
          size: 0.9 + Math.random() * 1.0,
          color: Math.random() < 0.5 ? 0 : 1 + Math.floor(Math.random() * 3),
          delay: Math.random() * 0.4,
          seed: Math.random() * Math.PI * 2,
        };
      });

      // 按颜色分组：每帧只要 4 次 fill，而不是每粒子一次
      const groups = COLORS.map((color) => ({ color, list: [] as Particle[] }));
      for (const p of particles) {
        groups[p.color].list.push(p);
      }

      // 黑场期的"底星"：几十颗原地缓慢闪烁的微星，让黑场不空
      const bgStars = Array.from({ length: 46 }, () => ({
        x: Math.random() * w,
        y: Math.random() * h,
        r: 0.4 + Math.random() * 0.7,
        phase: Math.random() * Math.PI * 2,
      }));

      // ── 时间线（定时器管阶段切换，帧循环只管画）─────────
      schedule(TL.flash, () => {
        flash.classList.add("intro-flash--on");
      });
      schedule(TL.leave, finish);

      // ── 帧循环 ──────────────────────────────────────────
      const TAU = Math.PI * 2;
      // 缓动：飞入"先快后慢"、飞散"先慢后快"
      const easeOut = (v: number) => 1 - Math.pow(1 - v, 3);
      const easeIn = (v: number) => v * v;
      const clamp01 = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v);

      const frame = () => {
        if (finished) {
          return;
        }
        const t = nowSec();

        // 清屏（alpha:false 下用背景色填，与覆盖层底色一致）
        ctx.fillStyle = "#060712";
        ctx.fillRect(0, 0, w, h);

        // 底星
        for (const s of bgStars) {
          const tw = 0.3 + 0.32 * Math.sin(t * 1.7 + s.phase);
          if (tw <= 0.32) {
            continue;
          }
          ctx.globalAlpha = tw;
          ctx.fillStyle = "rgba(214,222,255,0.85)";
          ctx.beginPath();
          ctx.arc(s.x, s.y, s.r, 0, TAU);
          ctx.fill();
        }
        ctx.globalAlpha = 1;

        // 更新粒子位置（拖尾需要"上一帧位置"，所以先记 px/py 再算新坐标）
        const scattering = t >= TL.scatter;
        for (const p of particles) {
          p.px = p.x;
          p.py = p.y;
          if (!scattering) {
            const ct = clamp01((t - TL.converge - p.delay) / (TL.formed - TL.converge - 0.4));
            const e = easeOut(ct);
            p.x = p.sx + (p.tx - p.sx) * e;
            p.y = p.sy + (p.ty - p.sy) * e;
            // 就位后的微抖动——字是"活"的星尘，不是一张静止的图。
            // ⚠️ 幅度要小（0.8px）：抖动大了笔画会互相糊掉，字形立刻认不出
            if (ct >= 1) {
              p.x += Math.sin(t * 2.6 + p.seed) * 0.8;
              p.y += Math.cos(t * 2.2 + p.seed * 1.7) * 0.8;
            }
          } else {
            const st = clamp01((t - TL.scatter) / (TL.end - TL.scatter));
            const e = easeIn(st);
            p.x = p.tx + (p.ex - p.tx) * e;
            p.y = p.ty + (p.ey - p.ty) * e;
          }
        }

        // 拖尾：每颗粒子画一条"上一帧 → 这一帧"的短线，全部合并成 1 次 stroke。
        // ⚠️ 不用"半透明覆盖全屏"做拖尾：8 位色深下最暗的残留四舍五入后
        // 永远擦不掉（1×(1-α) 还是 1），动画结束会留一层洗不掉的鬼影。
        // ⚠️ 成型后拖尾要淡出（0.3 秒内到 0）：笔画就位后粒子只剩 0.8px 的
        // 微抖动，拖尾会在笔画边缘糊出一圈"毛"——字形立刻认不出。
        const trail = scattering
          ? 0.32
          : t < TL.formed
            ? 0.32
            : Math.max(0, 0.32 * (1 - (t - TL.formed) / 0.3));
        if (trail > 0.02) {
          ctx.strokeStyle = `rgba(168,188,255,${trail.toFixed(3)})`;
          ctx.lineWidth = 1;
          ctx.lineCap = "round";
          ctx.beginPath();
          for (const p of particles) {
            ctx.moveTo(p.px, p.py);
            ctx.lineTo(p.x, p.y);
          }
          ctx.stroke();
        }

        // 光点：按颜色分组、每组一次 fill（rect 比 arc 快，1~2px 下观感相同）。
        // ⚠️ 成型后光点放大到 1.45 倍：散开的细点只能"暗示"笔画，放大后
        // 相邻点互相贴住、笔画才连成线——这是"星尘凝成字"的关键一步。
        // 用 0.25 秒过渡（不突跳），散开时回到原尺寸。
        const grow = scattering ? 1 : 1 + 0.45 * easeOut(clamp01((t - TL.formed) / 0.25));
        for (const g of groups) {
          ctx.fillStyle = g.color;
          ctx.beginPath();
          for (const p of g.list) {
            const s = p.size * grow;
            ctx.rect(p.x - s / 2, p.y - s / 2, s, s);
          }
          ctx.fill();
        }

        if (t < TL.end) {
          raf = requestAnimationFrame(frame);
        }
      };
      raf = requestAnimationFrame(frame);
    };

    void boot();

    return () => {
      running = false;
      finished = true;
      ac.abort();
      cancelAnimationFrame(raf);
      clearTimers();
      // 立刻释放画布背板（比等 GC 干脆）
      canvas.width = 0;
      canvas.height = 0;
    };
  }, []);

  return (
    <>
      <canvas ref={canvasRef} className="intro-canvas" />
      <div ref={flashRef} className="intro-flash" />
    </>
  );
}
