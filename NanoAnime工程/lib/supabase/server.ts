import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";

import { MISSING_ENV_HINT, readSupabaseEnv } from "@/lib/supabase/env";
import { timedFetch, withSupabaseTimeout } from "@/lib/supabase/timeout";

/**
 * 服务端用的 Supabase 客户端 —— 「服务端能读到当前用户」就是靠它。
 *
 * ⚠️ 只能在**服务端**用（服务端组件、路由处理器）。
 *
 * ─────────────────────────────────────────────────────────────
 * ⚠️ 为什么 `setAll` 里要包一层 try/catch（这不是糊弄，是官方标准写法）：
 *
 * Next 的规矩是：**服务端组件里不能写 cookie**，写了会直接抛错。
 * 但 `createServerClient` 在「会话过期、需要续期」时**必然**要去写 cookie ——
 * 服务端组件和这个诉求天生冲突。
 *
 * 官方的解法是把「写」这条路让给 proxy.ts（那个文件能写）：
 * 这里写失败就吞掉，续期交给 proxy 去做。官方的原话是
 * "If this is called from a Server Component, it will throw an error...
 *  you can ignore it if you have middleware refreshing user sessions."
 * （Next 16 里「middleware」已经改名叫 proxy，见工程根目录的 proxy.ts）
 * ─────────────────────────────────────────────────────────────
 */
export async function createClient(signal?: AbortSignal) {
  const env = readSupabaseEnv();

  if (!env) {
    throw new Error(MISSING_ENV_HINT);
  }

  // ⚠️ Next 16 的 cookies() 是**异步**的，必须 await。
  // 这是个大坑：不 await 拿到的是一个 Promise，`.getAll()` 会直接报「不是函数」。
  const cookieStore = await cookies();

  return createServerClient(env.url, env.anonKey, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          for (const { name, value, options } of cookiesToSet) {
            cookieStore.set(name, value, options);
          }
        } catch {
          // 服务端组件里写 cookie 会抛错 —— 正常现象，交给 proxy.ts 去续期。
          // 这里**不能改成 throw**，否则页面会直接崩。
        }
      },
    },
    // 传了 signal 才能被掐断。不传就是原来的行为（无限等）
    ...(signal ? { global: { fetch: timedFetch(signal) } } : {}),
  });
}

/**
 * 取当前登录用户，没登录就返回 null。
 *
 * ⚠️ 为什么用 `getUser()` 而不是 `getSession()`：
 * `getSession()` 只是把 cookie 里的内容读出来解码，**不校验真伪** ——
 * cookie 是可以被伪造的，拿它当「已登录」的证据等于没设防。
 * `getUser()` 会拿着凭证去 Supabase 核验一次，回来的一定是真的。
 * 官方文档专门警告过这一点：「绝不要信任 getSession() 的返回值」。
 *
 * 代价是每次多一次网络往返，所以只在真正需要「确认身份」的地方调用。
 */
export async function getCurrentUser() {
  // ⚠️ 这里也必须**整体**套超时，不能只给 proxy 加。
  // 否则 proxy 3 秒放行了，页面自己这一句又干等 30 秒 —— 用户看到的还是白屏。
  // 详见 lib/supabase/timeout.ts。
  const user = await withSupabaseTimeout(async (signal) => {
    const supabase = await createClient(signal);
    const {
      data: { user },
    } = await supabase.auth.getUser();
    return user;
  });

  // 超时、环境变量没配、Supabase 连不上……一律当作「没登录」处理。
  // 页面该显示未登录状态，而不是崩掉，更不该干等。
  return user ?? null;
}
