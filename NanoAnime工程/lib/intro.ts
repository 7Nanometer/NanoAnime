/**
 * 入场动画「星尘聚字」的数据层（2026-10-07）。
 *
 * 这里只有纯函数：设备分档、等字体就绪、把「番鉴」两个字采样成粒子目标点。
 * 动画的时间线与渲染循环在 `components/IntroOverlay.tsx`。
 * 拆开的原因是采样那几十行是"一次性的重活"，跟动画编排混在一起会让两边都难读。
 *
 * ⚠️ 本文件会被客户端组件 import，不许出现任何服务端专用的东西。
 */

/** 汇聚出的文字。两个字是刻意的：粒子数固定时，字越少越清晰、越有图形感 */
export const INTRO_TEXT = "番鉴";

/**
 * 「本标签页已播过」的会话标记键。
 * 命名跟 lib/collection.ts 的 `nanoanime.collection.v1` 同一套规矩。
 */
export const INTRO_SESSION_KEY = "nanoanime.intro.v1";

/** 一个星尘粒子。起点 → 字形目标点 → 散开终点，三段都由时间线驱动 */
export type Particle = {
  /** 起点（屏幕外，四面八方） */
  sx: number;
  sy: number;
  /** 目标（字形采样点，已居中到原点） */
  tx: number;
  ty: number;
  /** 散开终点 */
  ex: number;
  ey: number;
  /** 当前坐标 */
  x: number;
  y: number;
  /** 上一帧坐标（画拖尾短线用） */
  px: number;
  py: number;
  /** 光点大小（CSS px） */
  size: number;
  /** 颜色分组索引（0~3，见 IntroOverlay 的 COLORS） */
  color: number;
  /** 出发延迟（秒）——错开层次，不是"齐步走" */
  delay: number;
  /** 微抖动相位 */
  seed: number;
};

export type DeviceTier = {
  /** 粒子数 */
  count: number;
  /** 渲染背板的 DPR 上限 */
  maxDpr: number;
};

/**
 * 设备分档。
 *
 * ⚠️ 为什么不用 `hardwareConcurrency` 单判：低端安卓普遍报 8 核（大小核架构），
 * 它区分不出低端机。真正有区分度的是 `deviceMemory`（只有 Chromium 系有，
 * 0.25/0.5/1/2/4/8 档）——拿不到就按 4 算（中档）。
 *
 * ⚠️ DPR 上限是**性能的第一杠杆**（高于粒子数）：全屏重绘的成本正比于像素量，
 * 3x 屏按 2x 渲染直接省掉 55% 的像素，而 1~2 CSS px 的光点在 2x 下已经够圆润。
 */
export function deviceTier(): DeviceTier {
  type NavigatorWithMemory = Navigator & { deviceMemory?: number };
  const nav = navigator as NavigatorWithMemory;
  const cores = navigator.hardwareConcurrency || 4;
  const mem = nav.deviceMemory ?? 4;
  if (mem <= 2 || cores <= 4) {
    return { count: 800, maxDpr: 1.5 };
  }
  if (mem <= 4) {
    return { count: 1200, maxDpr: 2 };
  }
  // ⚠️ 1800 是实测定下来的：700 个点时字形只是"两块点云"、认不出字；
  // 1300 时仍偏糊；1800 + 成型后放大光点 + 拖尾消退，笔画才清晰可读。
  // 绘制侧的代价很小（rect 分批 fill、拖尾合并成一次 stroke），
  // 真正的成本大头是全屏背板的像素量——由 maxDpr 控制，不在这里。
  return { count: 1800, maxDpr: 2 };
}

/**
 * 等「番鉴」两个字的字形就绪（带超时）。
 *
 * ⚠️⚠️ `document.fonts.load` 的第二个参数**不能省**：不传时默认只加载
 * 覆盖"一个空格"的那个切片——而 Google Fonts 给中文做的是按 unicode-range
 * 切片的可变字体，**「番」「鉴」所在的 CJK 切片一个都不会来**。
 * 结果是 Promise 欢快地 resolve 了，canvas 却静默用后备字体画字——
 * 字形不是站点字体，而且不报任何错。这是本文件里最贵的一条注释。
 *
 * 本项目的便利：首屏顶栏就渲染着「番鉴」，两个切片（各约 60KB）在页面
 * 自己加载时就被拉过了，所以这里的等待通常接近 0。超时兜底（400ms）
 * 防的是弱网/首次离线——等不到就用系统字体照常播，字体没到不能拦住开场。
 */
export async function waitGlyphFont(timeoutMs = 400): Promise<void> {
  try {
    await Promise.race([
      document.fonts.load(`700 100px "Noto Sans SC"`, INTRO_TEXT),
      new Promise((resolve) => {
        window.setTimeout(resolve, timeoutMs);
      }),
    ]);
  } catch {
    // 字体 API 不可用（老浏览器）也照常播
  }
}

/**
 * 把「番鉴」画在离屏画布上逐像素采样，返回**已居中到原点**的目标点集。
 *
 * 三个关键做法：
 *
 * 1. **字号用墨迹宽度拟合，不用 advance 宽度**：`measureText().width` 是
 *    "排字盒宽度"（汉字两侧各带一点边距），比看得见的墨迹宽约 6%；用它拟合
 *    会系统性偏窄。用 `actualBoundingBoxLeft/Right` 得到的才是墨迹宽。
 *
 * 2. **垂直居中用墨迹包围盒，不用 textBaseline: "middle"**：middle 取的是
 *    字体 ascent/descent 的中点（Noto Sans CJK 约在基线上方 0.42em），而汉字
 *    墨迹的几何中心在基线上方约 0.38em——360px 字号下差约 14px，肉眼可见。
 *    这里改用 `actualBoundingBoxAscent/Descent` 把基线摆在让**墨迹中心**
 *    落在目标高度上的位置。
 *
 * 3. **采样「先细后抽」而不是"按目标数反推间隔"**：固定 3px 间隔扫一遍，
 *    再随机抽稀到目标点数——手机与桌面拿到的候选点差十几倍，但抽稀之后
 *    都等于目标数，而且字形疏密分布不会被搞坏（随机抽稀是无偏的）。
 *    抽稀还省掉了"点数不合就重画重采样"的闭环（重画要重新 getImageData，
 *    一次全屏读回要几十毫秒）。
 */
export function sampleGlyph(
  cssW: number,
  cssH: number,
  want: number,
): Array<{ x: number; y: number }> {
  const off = document.createElement("canvas");
  off.width = cssW;
  off.height = cssH;
  const ctx = off.getContext("2d", { willReadFrequently: true });
  if (!ctx) {
    return [];
  }
  const family = '"Noto Sans SC", "PingFang SC", "Microsoft YaHei", sans-serif';

  // 目标墨迹宽度：约占屏宽 40%（封顶 430px），矮窗口时用高度的比例再压一档。
  // ⚠️ 字的大小与"清晰度"是跷跷板：粒子数固定时，字越小每个笔画的点越密。
  // 实测 470px 时笔画糊、430px 时清晰——"看得出是什么字"比"字大"重要。
  const targetInk = Math.min(cssW * 0.4, 430, cssH * 0.58);

  // 第一遍：估字号（按 advance 比例起步）
  let size = 200;
  ctx.font = `700 ${size}px ${family}`;
  const probe = ctx.measureText(INTRO_TEXT);
  const probeAdvance = probe.width || 1;
  size = (size * targetInk) / probeAdvance;

  // 第二遍：按**墨迹宽度**校准（只量不画，很快）
  ctx.font = `700 ${size}px ${family}`;
  const m = ctx.measureText(INTRO_TEXT);
  const inkW = m.actualBoundingBoxLeft + m.actualBoundingBoxRight;
  if (inkW > 0) {
    size = (size * targetInk) / inkW;
  }

  // 最终绘制：墨迹中心对准画布水平的中央、上移一点（视觉中心比几何中心略高）
  const centerX = cssW / 2;
  const centerY = cssH * 0.45;
  ctx.font = `700 ${size}px ${family}`;
  ctx.textAlign = "center";
  ctx.textBaseline = "alphabetic";
  const fm = ctx.measureText(INTRO_TEXT);
  const asc = fm.actualBoundingBoxAscent || size * 0.38;
  const desc = fm.actualBoundingBoxDescent || 0;
  const baselineY = centerY + (asc - desc) / 2;
  ctx.fillStyle = "#fff";
  ctx.fillText(INTRO_TEXT, centerX, baselineY);

  // 逐像素采样（只扫字形可能出现的竖向区段，省一半扫描量）
  const data = ctx.getImageData(0, 0, cssW, cssH).data;
  const step = 3;
  const y0 = Math.max(0, Math.floor(centerY - size * 0.9));
  const y1 = Math.min(cssH, Math.ceil(centerY + size * 0.9));
  const pts: Array<{ x: number; y: number }> = [];
  for (let y = y0; y < y1; y += step) {
    const row = y * cssW;
    for (let x = 0; x < cssW; x += step) {
      if (data[(row + x) * 4 + 3] > 120) {
        // 加一点亚像素抖动，避免规整的网格感
        pts.push({ x: x + (Math.random() - 0.5), y: y + (Math.random() - 0.5) });
      }
    }
  }

  // 随机抽稀到目标数（Fisher–Yates 部分洗牌，O(n)）
  if (pts.length > want) {
    for (let i = 0; i < want; i++) {
      const j = i + Math.floor(Math.random() * (pts.length - i));
      const t = pts[i];
      pts[i] = pts[j];
      pts[j] = t;
    }
    pts.length = want;
  }
  if (pts.length === 0) {
    return [];
  }

  // 用点云自己的包围盒居中（一次性干掉 advance/墨迹偏差、基线偏差、
  // 后备字体度量差异三件事——之后"点在原点，屏幕坐标 = 屏幕中心 + 点"）
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const p of pts) {
    if (p.x < minX) minX = p.x;
    if (p.x > maxX) maxX = p.x;
    if (p.y < minY) minY = p.y;
    if (p.y > maxY) maxY = p.y;
  }
  const ox = (minX + maxX) / 2;
  const oy = (minY + maxY) / 2;
  for (const p of pts) {
    p.x -= ox;
    p.y -= oy;
  }
  return pts;
}
