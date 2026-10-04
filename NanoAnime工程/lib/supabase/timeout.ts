/**
 * 给 Supabase 的调用套一个「最多等这么久」的上限。
 *
 * ─────────────────────────────────────────────────────────────
 * ⚠️ 为什么必须有这个文件（这不是"以防万一"的保险，是实测出来的必需品）
 *
 * Supabase 一旦连不上（超时、黑洞），库内部**不是失败一次就回来**，
 * 它会拿指数退避一直重试到约 30 秒：
 *
 *   `_refreshAccessToken()` 里调 `retryable(fn, 判断函数)`，
 *   判断函数是「下一次退避仍落在 AUTO_REFRESH_TICK_DURATION_MS(=30 秒) 之内就继续重试」。
 *   实测时间戳：0ms → 1701 → 2103 → 2905 → 4505 → 7706 → 14107 → 26909，共 8 次。
 *
 * **而这个重试判断只看错误的类别，不看你的 signal** ——
 * 所以「给每个 fetch 挂 AbortSignal.timeout(1.5 秒)」根本没用：
 * 每次 abort 都被它当成"可重试"再退避一次，实测照样跑满 23 秒。
 *
 * 结论：想把时间封顶，只能从**外面**封 —— 用它下面这个 `withSupabaseTimeout`。
 * ─────────────────────────────────────────────────────────────
 */

/**
 * 最多等多久。超过就当「这次没连上」，放弃这次调用。
 *
 * ⚠️ 这是**代码里的常量，不是环境变量** —— 故意如此。
 * 环境变量会引入「上线忘了配」这种失败模式（本项目已经栽过一次：fail-open）。
 * 常量没有这个问题：不存在"配没配"，代码跑起来它就是 3 秒。
 * 所以**不要**把它改成 `process.env.XXX ?? 3000`，那等于把已经拆掉的雷重新埋回去。
 *
 * 3 秒的依据：正常情况（Vercel 在海外连 Supabase）一次核验在 100~300ms 量级，
 * 3 秒有十倍余量；再长的话，用户在弱网下就要盯着白屏了。
 * 这个值想调就改这一行。
 */
export const SUPABASE_TIMEOUT_MS = 3000;

/** 把 signal 挂到 fetch 上 —— 到点时才真的能掐断在途连接 */
export function timedFetch(signal: AbortSignal): typeof fetch {
  return (input, init) => fetch(input, { ...init, signal });
}

/**
 * 跑一次 Supabase 调用，最多等 `ms` 毫秒。
 *
 * - **超时**：掐断在途连接，返回 `null`（不抛错）
 * - **出错**：同样返回 `null`（不抛错）
 *
 * ⚠️ 为什么是「赛跑」而不是只挂 AbortSignal：
 * 光挂 signal 掐不掉上面说的那个重试循环。这里用 `Promise.race` 在外面封顶，
 * 保证**到了点就一定放行**，不管库内部还在不在重试。
 *
 * ⚠️⚠️ **不要把它"简化"成给 fetch 挂 AbortSignal.timeout。**
 * 那是最容易想到的写法，也是**实测无效**的写法：1.5 秒的超时跑满 23 秒、重试 7 次。
 * 上面那组时间戳就是为拦住这次"优化"留的 —— 要动这段代码，先把它复现一遍再说。
 *
 * ⚠️ 超时之后，库内部那个重试循环还会在后台空转到约 30 秒才自己停。
 * 这是可以接受的：signal 已经 abort，每一次重试都是**瞬间失败、不产生任何网络请求**
 * （实测：掐断后仍"发生"7 次重试，但对端一次请求都没收到）。它只是占着定时器，不影响用户。
 */
export async function withSupabaseTimeout<T>(
  run: (signal: AbortSignal) => Promise<T>,
  ms: number = SUPABASE_TIMEOUT_MS,
): Promise<T | null> {
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;

  try {
    return await Promise.race([
      run(controller.signal),
      new Promise<null>((resolve) => {
        timer = setTimeout(() => {
          // 先掐断在途请求，再放行 —— 顺序反过来的话，那个连接会一直挂着不关
          controller.abort();
          resolve(null);
        }, ms);
      }),
    ]);
  } catch {
    // 超时、网络故障、库内部抛错 —— 一律当作「这次没连上」，交给调用方走降级
    return null;
  } finally {
    if (timer) clearTimeout(timer);
  }
}
