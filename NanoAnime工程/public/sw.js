// NanoAnime番鉴 · service worker（离线缓存）
//
// ⚠️ 这个文件在全项目里很特殊：它是**唯一一个不经过打包器的 JS 文件**。
//    它躺在 public/ 目录里，Next 原样发给浏览器，不编译、不加哈希、不改名。
//    好处：`npm run dev`（Turbopack）和 `npm run build`（webpack）对它完全是同一回事，
//    正好绕开「两个打包器行为不一致」这个已知问题。
//    代价：这里**不能用 import、不能用 npm 包、不能写 TypeScript**，
//    只能用浏览器原生的东西（self / caches / fetch / Response）。
//
// 它干的活：让「首页 / 日历 / 我的追番」在断网时也能打开。
//
// 四条铁律（改这个文件之前先读一遍）：
//   1. **页面内跳转的请求绝不缓存** —— 它和「地址栏直接打开」共用同一个网址，
//      缓存按网址存，两者会互相覆盖，结果是白屏或无限转圈。见 isRscRequest()。
//   2. **每个文件单独 try/catch** —— 任何一个抓不到（断网、超时、配额满），
//      都不能让整个安装失败，否则用户连在线时都用不了。
//   3. **只缓存状态码 200 的正常响应**。
//   4. **改了缓存逻辑必须改下面的 CACHE_VERSION** —— 不改的话，
//      老用户手里那份旧缓存永远不会被替换掉。

// 缓存版本号。改缓存策略 / 缓存内容时把它 +1，老缓存会在下次激活时被整个删掉。
const CACHE_VERSION = "v1";

// 四个缓存桶。分开存是为了能各自单独更新和清理。
const PAGES_CACHE = `nanoanime-pages-${CACHE_VERSION}`;
const STATIC_CACHE = `nanoanime-static-${CACHE_VERSION}`;
const API_CACHE = `nanoanime-api-${CACHE_VERSION}`;
const IMAGE_CACHE = `nanoanime-images-${CACHE_VERSION}`;

const CURRENT_CACHES = [PAGES_CACHE, STATIC_CACHE, API_CACHE, IMAGE_CACHE];

/**
 * 装好 service worker 就立刻能离线打开的页面。
 *
 * 为什么要「预先」存，而不是等用户打开时顺手存：
 * 页面内点链接跳转（点顶栏）**不会产生文档请求**，走的是另一条路。
 * 所以 /my 的 HTML 如果只靠运行时缓存，得等用户手动在地址栏敲过一次 /my 才会有。
 * 预存这三个，保证「装好就能离线打开」。
 *
 * 只放用户点名的三个页面。搜索页离线没有意义（搜索本身就要联网），详情页是动态生成的、
 * 每部番一份，没法预先挑。
 */
const PRECACHE_PAGES = ["/", "/calendar", "/my"];

/** 顺带预存的小文件（主屏图标、应用清单） */
const PRECACHE_ASSETS = ["/manifest.webmanifest", "/icon", "/apple-icon"];

/** 封面图缓存上限（张）。超了就按「先存先删」清理最旧的，避免吃满浏览器配额。 */
const IMAGE_CACHE_LIMIT = 120;

/** 接口请求等多久算「网络不行了」，转去用缓存。弱网时不让用户干等。 */
const API_TIMEOUT_MS = 5000;

/** 页面导航等多久算「网络不行了」。比接口略长，尽量拿最新的页面。 */
const NAVIGATION_TIMEOUT_MS = 4000;

// ---------------------------------------------------------------------------
// 安装：把三个页面和它们要用的资源先抓下来
// ---------------------------------------------------------------------------

self.addEventListener("install", (event) => {
  event.waitUntil(precacheAppShell());
});

async function precacheAppShell() {
  const pagesCache = await caches.open(PAGES_CACHE);
  const staticCache = await caches.open(STATIC_CACHE);

  // 图标、应用清单：抓不到就算了，不影响安装
  await Promise.allSettled(
    PRECACHE_ASSETS.map(async (path) => {
      const response = await fetch(path, { cache: "no-cache" });
      if (isCacheable(response)) {
        await putSafely(staticCache, path, response);
      }
    }),
  );

  // 三个页面：先存 HTML，再从 HTML 里把它引用的 JS / CSS 一并抓下来。
  // 只存 HTML 不存它引用的 JS，离线打开照样是白屏 —— 页面壳有了，但页面跑不起来。
  await Promise.allSettled(
    PRECACHE_PAGES.map(async (path) => {
      const response = await fetch(path, { cache: "no-cache" });
      if (!isCacheable(response)) {
        return;
      }
      const html = await response.clone().text();
      await putSafely(pagesCache, path, response);

      const assetUrls = extractStaticAssetUrls(html);
      await Promise.allSettled(
        assetUrls.map(async (assetUrl) => {
          const assetResponse = await fetch(assetUrl);
          if (isCacheable(assetResponse)) {
            await putSafely(staticCache, assetUrl, assetResponse);
          }
        }),
      );
    }),
  );
}

/**
 * 从 HTML 文本里挖出所有 /_next/static/... 的地址。
 *
 * 为什么要这么土的办法：service worker 里没有 DOM 解析器，拿不到构建产物清单，
 * 只能对着 HTML 文本找。好在 /_next/static/ 这个前缀是 Next 固定的、不会变。
 * 挖漏了、挖多了都不会出事：漏了最多是离线时少一个文件，多了也就是多存一份。
 */
function extractStaticAssetUrls(html) {
  const found = new Set();
  const pattern = /["'(\s](\/_next\/static\/[^"'()\s\\]+)/g;
  let match;
  while ((match = pattern.exec(html)) !== null) {
    found.add(match[1]);
  }
  return [...found];
}

// ---------------------------------------------------------------------------
// 激活：清掉旧版本的缓存
// ---------------------------------------------------------------------------

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const names = await caches.keys();
      await Promise.all(
        names
          .filter((name) => name.startsWith("nanoanime-") && !CURRENT_CACHES.includes(name))
          .map((name) => caches.delete(name)),
      );

      // 立刻接管已经打开的页面，这样第一次装好不用刷新就能离线用。
      //
      // ⚠️ 这里**故意没有调用 skipWaiting()**：那会让新版本的 service worker
      // 在用户正看着页面时突然接管，页面手里的旧资源对不上新的，容易出怪问题。
      // 不调它的代价是「更新要等下次打开页面才生效」，这个代价可以接受。
      await self.clients.claim();
    })(),
  );
});

// ---------------------------------------------------------------------------
// 拦截请求：按类型分派
// ---------------------------------------------------------------------------

self.addEventListener("fetch", (event) => {
  const request = event.request;

  // 1. 只管 GET。POST 之类的一律放行，不缓存。
  if (request.method !== "GET") {
    return;
  }

  // 2. 页面内跳转（Next 叫 RSC）—— 绝不缓存，直接放行。这是本轮最大的坑，见函数注释。
  if (isRscRequest(request)) {
    return;
  }

  const url = new URL(request.url);
  const isSameOrigin = url.origin === self.location.origin;

  // 3. 图片：封面图。跨域的也拦（万一哪天开发环境直连图床）
  if (request.destination === "image") {
    event.respondWith(cacheFirst(request, IMAGE_CACHE, IMAGE_CACHE_LIMIT));
    return;
  }

  // 4. 跨域的其余请求：不碰
  if (!isSameOrigin) {
    return;
  }

  // 5. 地址栏直接打开 / 刷新页面
  if (request.mode === "navigate") {
    event.respondWith(networkFirst(request, PAGES_CACHE, NAVIGATION_TIMEOUT_MS));
    return;
  }

  // 6. 自家接口（首页那一墙、日历、我的追番的数据都从这儿来）
  if (url.pathname.startsWith("/api/")) {
    event.respondWith(networkFirst(request, API_CACHE, API_TIMEOUT_MS));
    return;
  }

  // 7. 构建产物（文件名带内容哈希，内容一变文件名就变，可以放心长期存）、图标
  if (url.pathname.startsWith("/_next/static/") || PRECACHE_ASSETS.includes(url.pathname)) {
    event.respondWith(cacheFirst(request, STATIC_CACHE, 0));
    return;
  }

  // 8. 其余放行
});

/**
 * 判断这是不是「页面内跳转」的请求。
 *
 * ⚠️ 为什么这一类**绝对不能缓存**（本轮最大的技术坑）：
 *
 * Next 的 App Router 会对**同一个网址**返回两种完全不同的东西：
 *   - 在地址栏直接打开 / 按刷新   → 完整 HTML 网页
 *   - 在页面里点链接跳过去        → 一份叫 RSC 的「数据 + 界面描述」，不是网页
 *
 * 而缓存是按**网址**当钥匙的。不区分这两者的话，后存的会把先存的覆盖掉 ——
 * 结果就是「刷新出来一片白」或者「一直转圈」。
 *
 * 这是业界已知的坑：Next 自己 2025 年修过一个同类型的缓存投毒漏洞（CVE-2025-49005）。
 * 社区对 service worker 的统一建议就是：这类请求一律不缓存。
 *
 * 代价：离线时点顶栏切换页面可能失败，得刷新一下。刷新走的是「导航请求」，能开。
 */
function isRscRequest(request) {
  if (request.headers.get("RSC") === "1") {
    return true;
  }
  // 预取也算（用户还没点，Next 提前去拿的）
  if (request.headers.get("Next-Router-Prefetch")) {
    return true;
  }
  const accept = request.headers.get("Accept");
  if (accept && accept.includes("text/x-component")) {
    return true;
  }
  try {
    if (new URL(request.url).searchParams.has("_rsc")) {
      return true;
    }
  } catch {
    // 网址解析不了就按「不是」处理，放行总比误判安全
  }
  return false;
}

// ---------------------------------------------------------------------------
// 两种缓存策略
// ---------------------------------------------------------------------------

/**
 * 先用网络，网络不行了再用缓存。给「内容会变、但断了网也得看」的东西用。
 * 联网时永远拿最新的；只有断网或太慢时才回落到上次存的那份。
 */
async function networkFirst(request, cacheName, timeoutMs) {
  const cache = await caches.open(cacheName);

  try {
    const response = await fetchWithTimeout(request, timeoutMs);
    if (isCacheable(response)) {
      await putSafely(cache, request, response.clone());
    }
    void reportFetchSource(false);
    return response;
  } catch {
    const cached = await cache.match(request);
    if (cached) {
      void reportFetchSource(true);
      return cached;
    }

    // 页面从来没打开过、缓存里没有 —— 给一个说人话的兜底页，
    // 而不是把浏览器自带的白屏报错页甩给用户。
    if (request.mode === "navigate") {
      return offlineFallbackResponse();
    }

    // 接口没缓存：抛出去，让页面自己的错误处理去管
    throw new Error("离线且没有缓存");
  }
}

/**
 * 先用缓存，没有再去网络。给「内容几乎不变」的东西用（带哈希的 JS、封面图）。
 * 第二次打开会明显快，因为文件根本不走网络。
 */
async function cacheFirst(request, cacheName, limit) {
  const cache = await caches.open(cacheName);

  const cached = await cache.match(request);
  if (cached) {
    return cached;
  }

  const response = await fetch(request);
  if (isCacheable(response)) {
    await putSafely(cache, request, response.clone());
    if (limit > 0) {
      await trimCache(cache, limit);
    }
  }
  return response;
}

// ---------------------------------------------------------------------------
// 告诉页面：你刚才看到的内容，是从网上现拿的，还是从缓存里翻出来的
// ---------------------------------------------------------------------------

/**
 * 页面顶部那条「当前处于离线状态」的提示，靠的就是这个。
 *
 * ⚠️ 为什么不直接用浏览器给的 `navigator.onLine`：
 * 它只回答「网卡连没连上网络」，不回答「能不能连到我们的服务器」。
 * 实际最常见的故障恰恰是后者 —— 网络信号很差、或者服务器暂时连不上，
 * 这时 `navigator.onLine` 仍然是 true，提示条永远不会出现，
 * 用户看着一份过时的数据却不知道为什么。
 *
 * **真正可靠的信号在 service worker 手里**：只有它知道这次请求到底走没走通。
 * 所以由它把结果告诉页面。
 *
 * `lastReportedFromCache` 用来去重：状态没变就不重复发消息。
 * （service worker 被浏览器回收后这个变量会重置成 null，下次多发一条，无所谓。）
 */
let lastReportedFromCache = null;

async function reportFetchSource(fromCache) {
  if (lastReportedFromCache === fromCache) {
    return;
  }
  lastReportedFromCache = fromCache;

  try {
    const clientList = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
    for (const client of clientList) {
      client.postMessage({ type: "nanoanime:fetch-source", fromCache });
    }
  } catch {
    // 通知失败不影响页面本身
  }
}

/**
 * 页面刚打开时会来问一次「现在是什么状态」。
 *
 * 为什么需要这个：页面是靠 service worker 从缓存里端出来的那一刻，
 * 它的 JS 还没来得及运行，上面那条通知发出去也没人接 —— 消息就丢了。
 * 所以页面加载完之后主动来问一次。
 */
self.addEventListener("message", (event) => {
  if (event.data && event.data.type === "nanoanime:status-request") {
    event.source?.postMessage({
      type: "nanoanime:fetch-source",
      fromCache: lastReportedFromCache === true,
    });
  }
});

// ---------------------------------------------------------------------------
// 小工具
// ---------------------------------------------------------------------------

/** 带超时的 fetch。超时了当失败处理，交给调用方回落到缓存。 */
function fetchWithTimeout(request, timeoutMs) {
  if (!timeoutMs) {
    return fetch(request);
  }
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("请求超时")), timeoutMs);
    fetch(request).then(
      (response) => {
        clearTimeout(timer);
        resolve(response);
      },
      (error) => {
        clearTimeout(timer);
        reject(error);
      },
    );
  });
}

/**
 * 这份响应能不能存？
 * 只存正常拿到的 200。301/302 跳转、304、206 分段、404/500 一律不存。
 * 跨域图片拿不到状态码（浏览器把它标成 opaque，状态码显示 0），只能信它。
 */
function isCacheable(response) {
  if (response.type === "opaque") {
    return true;
  }
  return response.status === 200;
}

/** 存缓存。存不进去就当没发生（配额满、响应类型不允许等），不能让页面因此挂掉。 */
async function putSafely(cache, requestOrUrl, response) {
  try {
    await cache.put(requestOrUrl, response);
  } catch {
    // 故意吞掉：缓存是「锦上添花」，不该因为它失败而影响页面
  }
}

/** 缓存条目超过上限时，按「先存先删」清掉最旧的。 */
async function trimCache(cache, limit) {
  try {
    const keys = await cache.keys();
    if (keys.length <= limit) {
      return;
    }
    const excess = keys.length - limit;
    for (let i = 0; i < excess; i += 1) {
      await cache.delete(keys[i]);
    }
  } catch {
    // 清理失败不影响使用
  }
}

/**
 * 离线兜底页：用户打开了某个没缓存过的页面，且此刻没网。
 *
 * 为什么要有它：浏览器自带的白屏报错页又丑又是英文的，用户会以为网站挂了。
 * 这里给一个说人话的页面，并把他能去的页面列出来。
 * 样式全部内联（用不了外部 CSS），配色跟站点一致。
 */
function offlineFallbackResponse() {
  const html = `<!doctype html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>离线 · NanoAnime番鉴</title>
</head>
<body style="margin:0;min-height:100vh;display:flex;align-items:center;justify-content:center;background:#0a0a0a;color:#fafafa;font-family:system-ui,-apple-system,'PingFang SC','Microsoft YaHei',sans-serif;">
<div style="max-width:26rem;padding:2rem;text-align:center;">
<p style="font-size:1.5rem;font-weight:700;margin:0 0 0.75rem;">当前处于离线状态</p>
<p style="color:#a1a1aa;line-height:1.7;margin:0 0 1.5rem;">这个页面还没有缓存过，现在又没有网络，所以打不开。<br>下面这几个页面是可以离线打开的：</p>
<p style="margin:0;display:flex;gap:0.75rem;justify-content:center;flex-wrap:wrap;">
<a href="/" style="color:#fafafa;border:1px solid #3f3f46;border-radius:0.5rem;padding:0.5rem 1rem;text-decoration:none;">首页</a>
<a href="/calendar" style="color:#fafafa;border:1px solid #3f3f46;border-radius:0.5rem;padding:0.5rem 1rem;text-decoration:none;">日历</a>
<a href="/my" style="color:#fafafa;border:1px solid #3f3f46;border-radius:0.5rem;padding:0.5rem 1rem;text-decoration:none;">我的追番</a>
</p>
</div>
</body>
</html>`;

  return new Response(html, {
    status: 200,
    headers: { "Content-Type": "text/html; charset=utf-8" },
  });
}
