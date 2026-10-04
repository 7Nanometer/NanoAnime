import { NextResponse, type NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";

import { readSupabaseEnv } from "@/lib/supabase/env";
import { timedFetch, withSupabaseTimeout } from "@/lib/supabase/timeout";

/**
 * 会话续期。它是「用户不会莫名其妙被登出」的唯一保障。
 *
 * ─────────────────────────────────────────────────────────────
 * ⚠️⚠️ 这个文件的名字不能改 ⚠️⚠️
 *
 * Next.js 16 **把 `middleware.ts` 改名成了 `proxy.ts`**（官方原话：
 * "Starting with Next.js 16, Middleware is now called Proxy"）。
 *
 * 如果按老习惯把这个文件叫 `middleware.ts`，Next 16 **根本不会调用它** ——
 * 而且**不报任何错**。后果是：Supabase 发的登录凭证有有效期（默认 1 小时），
 * 过期后需要在用户不知不觉中续期；没人续期，用户就会被登出，
 * 表现是「用着用着突然退出登录了」，查起来极其痛苦。
 *
 * Supabase 官方指南也专门为 Next 16 写了这一条，说得很直白：
 * "On Next.js 15 and earlier, a proxy.ts file is never called, so sessions
 *  never refresh and users get signed out. Next.js renamed this file in version 16."
 *
 * 另外：Next 16 里 Proxy **默认跑 Node.js 运行时**（不再是 Edge），
 * 而且**不允许**再写 `export const runtime = ...`（写了会直接报错）。
 * ─────────────────────────────────────────────────────────────
 *
 * 它每次请求只做一件小事：把 cookie 里的凭证拿出来看一眼，快过期就顺手换张新的、
 * 写回响应。业务逻辑一概不碰。
 */
export async function proxy(request: NextRequest) {
  const env = readSupabaseEnv();

  // ⚠️ 环境变量没配（比如线上忘了配）→ 直接放行，**绝不能让整站 500**。
  // 正确的结果是「登录功能没开」，而不是「网站打不开」。
  if (!env) {
    console.warn("[proxy] 没有 Supabase 环境变量，跳过会话续期——登录功能当前不可用。");
    return NextResponse.next({ request });
  }

  // 先造一个「原样返回」的响应，待会儿把新 cookie 挂到它身上
  let response = NextResponse.next({ request });

  // ⚠️ 这一段必须**整体套在超时里**，不能只给 fetch 挂 signal。
  // 原因见 lib/supabase/timeout.ts：Supabase 连不上时，库内部会拿指数退避
  // 一直重试到约 30 秒，而且它的重试判断不看 signal —— 光挂 signal 掐不掉。
  // 后果有多严重：这个 proxy 跑在**每一个**页面上，不封顶就等于「Supabase 一抽风，
  // 已登录用户每翻一页白屏半分钟」。
  await withSupabaseTimeout(async (signal) => {
    const supabase = createServerClient(env.url, env.anonKey, {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          // 两边都要改：
          // 1. 改 request —— 让**本次**请求的后续代码（页面组件）能读到新 cookie
          // 2. 改 response —— 让**下次**请求（浏览器）带上新 cookie
          // 只改一处的话，要么这次读不到，要么下次又拿旧的，都会出怪问题。
          for (const { name, value } of cookiesToSet) {
            request.cookies.set(name, value);
          }
          response = NextResponse.next({ request });
          for (const { name, value, options } of cookiesToSet) {
            response.cookies.set(name, value, options);
          }
        },
      },
      global: { fetch: timedFetch(signal) },
    });

    // ⚠️ 这一句**不能删**，看起来它什么也没干，其实干了两件事：
    // 1. 触发上面 setAll 的执行（续期就是在这里发生的）
    // 2. 核验凭证真伪
    // Supabase 官方文档专门标注：不要在它和 createServerClient 之间插任何代码，
    // 否则可能出现「随机登出」「JSON 解析错误」这类极难查的问题。
    return supabase.auth.getUser();
  });

  // 超时/失败时走这里：放行，不续期，也**不碰任何 cookie**。
  // 实测确认这样最安全 —— 用户的登录凭证原封不动，下一个请求照常重试，
  // 表现为「这次显示未登录，刷新即恢复」，而不是「被登出」。
  return response;
}

export const config = {
  matcher: [
    /*
     * 只让「真的需要续期的请求」走这里。排除掉静态资源，
     * 不然每张图、每个 JS 文件都要多绕一圈，白慢。
     *
     * ⚠️ 必须排除 `sw.js`：上一轮做的 service worker 离线缓存不能被它搅和。
     * 同理排除 manifest 和三种图标 —— 它们都是不涉及登录的静态文件。
     */
    "/((?!_next/static|_next/image|sw\\.js|manifest\\.webmanifest|icon|apple-icon|favicon\\.ico|.*\\.(?:png|jpg|jpeg|svg|webp|ico|txt|xml)$).*)",
  ],
};
