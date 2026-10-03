/**
 * Supabase 的两个配置值，集中从一个地方读。
 *
 * ⚠️ **这两个值都不是密钥，可以光明正大地出现在浏览器里。**
 * 这跟 AniList 那种「密钥必须藏服务端」的情况完全不同 —— Supabase 的 anon key
 * 本来就是设计成公开的：它只是一张「入场券」，能进到哪张桌子由数据库里的
 * **行级安全策略（RLS）**说了算。真正保护数据的是 RLS，不是把 key 藏起来。
 *
 * （这也是为什么本文件可以被客户端组件 import，而 CLAUDE.md 第五节那条
 *  「前端绝不直连第三方 API」在这里不适用——那条针对的是需要藏密钥、
 *  需要统一缓存的第三方数据源，比如 AniList。Supabase 是官方设计的
 *  浏览器直连用法，用户已在需求里明确说明。）
 *
 * `NEXT_PUBLIC_` 前缀的含义：Next 会把带这个前缀的环境变量**在构建时**
 * 直接烤进浏览器的 JS 里。所以：
 *   - 改了值必须**重新构建**才生效（光重启服务不够）
 *   - 部署到 Vercel 时，这两个变量要在 Vercel 后台也配一份，
 *     而且必须在**构建之前**配好
 */

export interface SupabaseEnv {
  url: string;
  anonKey: string;
}

/**
 * 读环境变量。
 *
 * 故意**不在这里抛错**，而是返回 null —— 让调用方自己决定怎么办：
 * - 顶栏、登录页：没有配置就是「登录功能没开」，页面照常能用
 * - 会话刷新（proxy.ts）：没有配置就直接放行，**绝不能让整站 500**
 *
 * 如果在这里抛错，而它又被 layout 那条链路上的东西 import 了，
 * 结果就是「忘了配环境变量 → 整个网站打不开」。这个代价太大。
 */
export function readSupabaseEnv(): SupabaseEnv | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url || !anonKey) {
    return null;
  }

  return { url, anonKey };
}

/** 给人和给日志看的一句话说明。缺配置时用 */
export const MISSING_ENV_HINT =
  "Supabase 环境变量没配：请在工程目录下建 .env.local，写入 " +
  "NEXT_PUBLIC_SUPABASE_URL 和 NEXT_PUBLIC_SUPABASE_ANON_KEY（可参考 .env.example）。" +
  "注意加了 NEXT_PUBLIC_ 前缀的变量是构建时烤进 JS 的，改完要重新构建（npm run build）才生效。";
