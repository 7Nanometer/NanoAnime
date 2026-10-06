"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";

import { createClient } from "@/lib/supabase/client";

/**
 * 注册 / 登录表单。
 *
 * ⚠️ 按需求**只做邮箱 + 密码**，不用魔法链接、不用邮箱验证码、不发确认邮件
 * （Supabase 免费版邮件限流 2 封/小时，且国内基本收不到）。
 *
 * ⚠️ 还要求把 Supabase 后台的「Confirm email」关掉 —— 否则注册完不会直接登录，
 * 而是停在「请去邮箱点确认链接」，那就跟需求相反了。见 migration 文件旁边的说明。
 *
 * 登录成功后调 `router.refresh()` 而不是 `router.push()`：
 * 当前就在 /login 上，需要的是让那个**服务端组件重新渲染**一遍
 * （它才会用新 cookie 去读用户、显示「已登录：…」）。
 * push 到同一个地址不会触发重新渲染，会看起来像「点了没反应」。
 */
type Mode = "signIn" | "signUp";

export function AuthForm() {
  const router = useRouter();
  const [mode, setMode] = useState<Mode>("signIn");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [errorText, setErrorText] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const isSignUp = mode === "signUp";

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setErrorText(null);

    // 本地先做最基础的把关，省一次白跑的请求。
    // 真正的强度校验在 Supabase 那边（默认最少 6 位）
    if (password.length < 6) {
      setErrorText("密码至少 6 位。");
      return;
    }

    setIsSubmitting(true);

    try {
      const supabase = createClient();

      if (isSignUp) {
        const { data, error } = await supabase.auth.signUp({ email, password });

        if (error) {
          setErrorText(translateAuthError(error.message, true));
          return;
        }

        // ⚠️ 这里有个坑：Supabase 后台的「Confirm email」如果开着，
        // **注册不会报错**，但返回的数据里 session 是空的 —— 用户得先去邮箱点
        // 确认链接才能登录。不处理的话，界面看起来像「点了没反应」。
        // 本项目按需求不用邮件那一套，所以这里如实告诉用户卡在哪、怎么修。
        if (!data.session) {
          setErrorText(
            "账号已创建，但 Supabase 要求先确认邮箱才能登录。请到 Supabase 后台把「Confirm email」关掉（见 README）。",
          );
          return;
        }
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email, password });

        if (error) {
          setErrorText(translateAuthError(error.message, false));
          return;
        }
      }

      // 注册/登录成功，让服务端重新渲染这个页面
      router.refresh();
    } catch (error) {
      // 走到这儿基本是环境变量没配（createClient 会抛）
      setErrorText(error instanceof Error ? error.message : "出错了，请稍后再试。");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div>
      {/* 两个标签页切换注册/登录。用按钮而不是链接——切换不换地址，只换表单 */}
      <div className="mb-6 flex gap-1 rounded-xl border border-border bg-surface p-1">
        {(
          [
            { value: "signIn", label: "登录" },
            { value: "signUp", label: "注册" },
          ] as const
        ).map((tab) => (
          <button
            key={tab.value}
            type="button"
            onClick={() => {
              setMode(tab.value);
              setErrorText(null);
            }}
            aria-pressed={mode === tab.value}
            className={
              "flex-1 cursor-pointer rounded-lg px-3 py-1.5 text-sm transition-all duration-150 " +
              (mode === tab.value
                ? "bg-surface-elevated font-medium text-foreground shadow-sm ring-1 ring-border"
                : "text-muted-foreground hover:text-foreground")
            }
          >
            {tab.label}
          </button>
        ))}
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label htmlFor="email" className="mb-1.5 block text-sm font-medium">
            邮箱
          </label>
          <input
            id="email"
            type="email"
            required
            autoComplete="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            className="w-full rounded-lg border border-input bg-surface px-3.5 py-2.5 text-sm outline-none transition-colors duration-150 placeholder:text-muted-foreground/60 focus-visible:border-brand/60 focus-visible:bg-surface-elevated focus-visible:ring-2 focus-visible:ring-ring"
            placeholder="you@example.com"
          />
        </div>

        <div>
          <label htmlFor="password" className="mb-1.5 block text-sm font-medium">
            密码
          </label>
          <input
            id="password"
            type="password"
            required
            // 注册时提示新密码，登录时提示已有密码——浏览器的密码管理器靠这个区分
            autoComplete={isSignUp ? "new-password" : "current-password"}
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            className="w-full rounded-lg border border-input bg-surface px-3.5 py-2.5 text-sm outline-none transition-colors duration-150 placeholder:text-muted-foreground/60 focus-visible:border-brand/60 focus-visible:bg-surface-elevated focus-visible:ring-2 focus-visible:ring-ring"
            placeholder={isSignUp ? "至少 6 位" : ""}
          />
        </div>

        {errorText ? (
          // role="alert"：让读屏软件立刻念出来
          // ⚠️ 错误信息带一个底色块，而不是原来的一行红字——深色底上孤立的一行红字
          // 很容易被当成普通正文扫过去
          <p
            role="alert"
            className="rounded-lg border border-destructive/25 bg-destructive/10 px-3 py-2 text-sm leading-relaxed text-destructive"
          >
            {errorText}
          </p>
        ) : null}

        <button
          type="submit"
          disabled={isSubmitting}
          className="w-full cursor-pointer rounded-lg bg-primary px-3 py-2.5 text-sm font-medium text-primary-foreground transition-all duration-150 hover:brightness-110 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background focus-visible:outline-none active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-50"
        >
          {isSubmitting ? "处理中…" : isSignUp ? "注册并登录" : "登录"}
        </button>
      </form>
    </div>
  );
}

/**
 * 把 Supabase 报的英文错翻成中文人话。
 *
 * 为什么值得写这个：用户看到「Invalid login credentials」多半会以为是网站坏了，
 * 而它其实只是「邮箱或密码不对」。这种翻译不写，用户就会来问「为什么我登不上」。
 * 匹配不上的一律原样透出——**不要瞎猜**，猜错了用户会更糊涂。
 */
function translateAuthError(message: string, isSignUp: boolean): string {
  const text = message.toLowerCase();

  if (text.includes("invalid login credentials")) {
    return "邮箱或密码不对。";
  }
  if (text.includes("email not confirmed")) {
    return "这个邮箱还没确认。请到 Supabase 后台把「Confirm email」关掉（见 README 的说明）。";
  }
  if (text.includes("user already registered")) {
    return "这个邮箱已经注册过了，直接登录就行。";
  }
  if (text.includes("password should be at least")) {
    return "密码太短了，至少 6 位。";
  }
  if (text.includes("unable to validate email") || text.includes("invalid email")) {
    return "邮箱格式不对。";
  }
  if (text.includes("rate limit") || text.includes("too many")) {
    return "操作太频繁了，等一会儿再试。";
  }

  return isSignUp ? `注册失败：${message}` : `登录失败：${message}`;
}
