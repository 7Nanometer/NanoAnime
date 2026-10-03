import { createBrowserClient } from "@supabase/ssr";

import { MISSING_ENV_HINT, readSupabaseEnv } from "@/lib/supabase/env";

/**
 * 浏览器里用的 Supabase 客户端。
 *
 * ⚠️ 只能在**客户端组件**里调（文件顶部没有 "use client" 是故意的 ——
 * 这个文件本身不渲染任何东西，是纯工具函数；但一旦它在服务端被调用就会报错）。
 * 服务端要用 `lib/supabase/server.ts` 那个。
 *
 * 它和 `@supabase/ssr` 的 `createBrowserClient` 的分工：
 * 登录成功后，**会话（登录凭证）会被写进浏览器的 cookie**，而不是只存在内存里。
 * 这正是「服务端也能读到当前用户」的关键一步 —— 服务端读的就是这两个 cookie。
 * （如果直接用 supabase-js 的原版 createClient，凭证只存 localStorage，
 *   服务端根本看不见，那就永远做不到「服务端渲染出当前用户」。）
 *
 * 不用单例缓存：Supabase 官方示例就是这么写的，这个客户端本身开销很小，
 * 而且它要跟着 cookie 状态走，缓存住反而可能拿到过期的会话。
 */
export function createClient() {
  const env = readSupabaseEnv();

  if (!env) {
    throw new Error(MISSING_ENV_HINT);
  }

  // 两个参数都不传 cookie 适配器：在浏览器环境里，@supabase/ssr 会自己
  // 回落到 document.cookie 去读写（这是它设计好的默认行为）。
  return createBrowserClient(env.url, env.anonKey);
}
