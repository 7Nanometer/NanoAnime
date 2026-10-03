"use client";

import { useEffect } from "react";

/**
 * 把离线缓存用的 service worker 注册到浏览器。
 *
 * 它自己不显示任何东西（返回 null），纯粹是个「启动开关」。
 *
 * ─────────────────────────────────────────────────────────────
 * ⚠️ **只在生产环境注册**，这是故意的，有两个原因：
 *
 * 1. **开发时不能用**。`npm run dev` 走的是 Turbopack、`npm run build` 走的是 webpack，
 *    两个打包器产出的文件名不一样。开发环境一旦注册，浏览器会把 Turbopack 的产物缓存起来，
 *    之后改代码看不到效果、还会把调试搅乱。
 * 2. **service worker 本身要求 HTTPS**（本机的 localhost 是唯一例外），
 *    它天生就是给正式环境准备的东西。
 *
 * 代价：**本地开发时测不了离线功能**，要测必须先 `npm run build` 再 `npm start`。
 * 这是有意的取舍，不是疏忽。
 * ─────────────────────────────────────────────────────────────
 *
 * 为什么用 useEffect：注册要碰 `navigator`，那是浏览器才有的东西。
 * 服务端渲染时没有 `navigator`，直接写会报错。
 */
export function ServiceWorkerRegister() {
  useEffect(() => {
    if (process.env.NODE_ENV !== "production") {
      return;
    }
    if (!("serviceWorker" in navigator)) {
      return;
    }

    // updateViaCache: "none" —— 让浏览器每次都去服务器核对 sw.js 有没有新版，
    // 不要拿 HTTP 缓存里的旧版本。否则我们改了缓存逻辑，用户可能几个月都收不到。
    // （服务端那边由 next.config.ts 的 headers 再兜一道，两边一起才稳。）
    navigator.serviceWorker
      .register("/sw.js", { scope: "/", updateViaCache: "none" })
      .catch((error: unknown) => {
        // 注册失败不影响正常使用 —— 只是没有离线能力，不该打断用户
        console.error("service worker 注册失败：", error);
      });
  }, []);

  return null;
}
