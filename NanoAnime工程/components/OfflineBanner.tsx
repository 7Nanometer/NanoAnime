"use client";

import { useEffect, useState, useSyncExternalStore } from "react";

/**
 * 断网 / 弱网时在页面顶部显示一条提示。
 *
 * 为什么要它：加了离线缓存之后，断网打开页面**照样有内容**——但内容是上次联网时的，
 * 可能已经过时（比如某部番更新到第 8 集了，页面上还写着第 7 集）。
 * 不告诉用户的话，他会以为是网站出了 bug。说清楚了，「离线也能用」才是一个功能。
 *
 * ─────────────────────────────────────────────────────────────
 * 两个信号，任意一个成立就显示：
 *
 * ① 浏览器说自己断网了（`navigator.onLine`）——设备彻底没网时。
 * ② **service worker 说这次的内容是从缓存里翻出来的** —— 这个更常用。
 *
 * ⚠️ 为什么必须有第 ② 个：`navigator.onLine` 只回答「网卡连没连上网络」，
 * 不回答「能不能连到我们的服务器」。最常见的故障是后者——信号很差、或者服务器
 * 一时连不上——这时 `navigator.onLine` 还是 true，光靠它就永远不显示提示条，
 * 用户看着一份过时的数据却不知道为什么。
 * 只有 service worker 知道这次请求到底走没走通，所以信号由它给（见 public/sw.js）。
 * ─────────────────────────────────────────────────────────────
 */

/** 和 service worker 约定好的消息格式 */
interface FetchSourceMessage {
  type?: string;
  fromCache?: boolean;
}

const MESSAGE_TYPE = "nanoanime:fetch-source";
const STATUS_REQUEST = "nanoanime:status-request";

/**
 * 订阅浏览器的「联网 / 断网」事件。
 *
 * ⚠️ 返回值必须是**取消订阅的函数**，React 靠它来收尾。
 * 两个事件都要听：只听 `offline` 的话，网恢复了提示条永远不消失。
 */
function subscribe(onChange: () => void) {
  window.addEventListener("online", onChange);
  window.addEventListener("offline", onChange);
  return () => {
    window.removeEventListener("online", onChange);
    window.removeEventListener("offline", onChange);
  };
}

/**
 * 当前是不是断网。
 *
 * ⚠️ 必须返回**稳定的值**，不能每次调用都新建对象——否则 React 会以为数据一直在变，
 * 无限重渲染（这个坑项目里踩过）。这里返回布尔值，按值比较，安全。
 */
function getSnapshot() {
  return !navigator.onLine;
}

/**
 * 服务端渲染时拿不到联网状态，一律当成「在线」——
 * 也就是服务端渲染出来的 HTML 里没有这条提示，浏览器接管后再按实际情况决定要不要显示。
 */
function getServerSnapshot() {
  return false;
}

export function OfflineBanner() {
  const isDeviceOffline = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
  const [isServingFromCache, setIsServingFromCache] = useState(false);

  useEffect(() => {
    const serviceWorker = navigator.serviceWorker;
    if (!serviceWorker) {
      return;
    }

    const onMessage = (event: MessageEvent) => {
      const data = event.data as FetchSourceMessage | null;
      if (data?.type === MESSAGE_TYPE) {
        setIsServingFromCache(data.fromCache === true);
      }
    };
    serviceWorker.addEventListener("message", onMessage);

    // 页面刚打开时主动问一次。因为「页面本身就是从缓存里端出来」的那一次，
    // service worker 发通知时这个组件的代码还没跑起来，消息没人接就丢了。
    serviceWorker.controller?.postMessage({ type: STATUS_REQUEST });

    return () => {
      serviceWorker.removeEventListener("message", onMessage);
    };
  }, []);

  if (!isDeviceOffline && !isServingFromCache) {
    return null;
  }

  return (
    <div
      // role="status" 让屏幕阅读器也能念出来，不只靠肉眼看
      role="status"
      className="border-b border-warning/25 bg-warning/12 px-4 py-2 text-center text-xs text-warning"
    >
      当前处于离线状态，显示的是缓存内容，可能不是最新的
    </div>
  );
}
