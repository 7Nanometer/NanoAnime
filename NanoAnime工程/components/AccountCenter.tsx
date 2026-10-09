"use client";

import { useRef, useState, type ChangeEvent, type ReactNode } from "react";
import Image from "next/image";
import Link from "next/link";
import { Heart, KeyRound, LogOut, UserRound } from "lucide-react";

import { useCollection } from "@/components/useCollection";
import { useSignOut } from "@/components/useSignOut";
import { downscaleAvatar, uploadAvatar, validateAvatarFile } from "@/lib/avatar";
import { SITE_CONTAINER } from "@/lib/layout";
import { createClient } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";

/**
 * 个人中心（2026-10-09 加，参照图：B 站式账号中心的骨架、本站自己的配色）。
 *
 * 三块栏目（+ 退出登录），参照图里站里没有的业务（会员/订单/勋章/验证）一律不做：
 *   · 账户信息 —— 头像（支持上传自己的图）、昵称、邮箱（只读，暂不支持更换）
 *   · 账号安全 —— 改密码（先验当前密码，不依赖邮件）
 *   · 我的追番 —— 追番记录统计 + 去管理的入口
 *
 * ⚠️ 数据落点：头像/昵称存在 Supabase 的 user_metadata 里（auth.users 自带字段）——
 * 不新开表：个人资料目前只需要"自己看自己"，metadata 够用且天然只有本人能改。
 * 头像**图片**存在 Storage 的 avatars 桶（见 supabase/migrations/0004）。
 *
 * ⚠️ 组件是客户端的原因：所有编辑动作（传图/改昵称/改密码）都发生在浏览器端
 * （Supabase 官方设计的浏览器直连用法）；页面外壳 /account 在服务端读用户，
 * 两边分工同顶栏与 /login 的关系（见 AuthStatus 头注释）。
 */

type SectionId = "profile" | "security" | "collection";

const SECTIONS: { id: SectionId; label: string; icon: typeof UserRound }[] = [
  { id: "profile", label: "账户信息", icon: UserRound },
  { id: "security", label: "账号安全", icon: KeyRound },
  { id: "collection", label: "我的追番", icon: Heart },
];

/** 一块结果提示。成功/失败两种色调；失败用 role="alert" 让读屏软件立刻念 */
function Feedback({ tone, children }: { tone: "ok" | "err"; children: ReactNode }) {
  return (
    <p
      role={tone === "err" ? "alert" : "status"}
      className={cn(
        "rounded-lg border px-3 py-2 text-sm leading-relaxed",
        tone === "ok"
          ? "border-brand/25 bg-brand/10 text-brand"
          : "border-destructive/25 bg-destructive/10 text-destructive",
      )}
    >
      {children}
    </p>
  );
}

/** 输入框统一样式（同 AuthForm 口径） */
const INPUT_CLASS =
  "w-full rounded-lg border border-input bg-surface px-3.5 py-2.5 text-sm outline-none transition-colors duration-150 placeholder:text-muted-foreground/60 focus-visible:border-brand/60 focus-visible:bg-surface-elevated focus-visible:ring-2 focus-visible:ring-ring";

const PRIMARY_BUTTON_CLASS =
  "cursor-pointer rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-all duration-150 hover:brightness-110 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background focus-visible:outline-none active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-50";

export function AccountCenter({
  userId,
  email,
  initialName,
  initialAvatarUrl,
  createdAt,
}: {
  userId: string;
  email: string;
  initialName: string;
  initialAvatarUrl: string | null;
  createdAt: string | null;
}) {
  const [active, setActive] = useState<SectionId>("profile");
  // 昵称/头像提到外层：横幅（顶部）要跟着编辑实时变
  const [name, setName] = useState(initialName);
  const [savedName, setSavedName] = useState(initialName);
  const [avatarUrl, setAvatarUrl] = useState(initialAvatarUrl);
  const { signOut, isPending: isSigningOut } = useSignOut();

  const joinLabel = formatJoinDate(createdAt);

  return (
    <main className={cn(SITE_CONTAINER, "py-8 sm:py-10")}>
      {/* 横幅：头像 + 昵称 + 邮箱（+ 加入时间） */}
      <header className="flex items-center gap-4 rounded-2xl border border-border bg-surface/60 p-5 sm:gap-5 sm:p-6">
        <AvatarPreview name={name} avatarUrl={avatarUrl} />
        <div className="min-w-0">
          <h1 className="truncate text-xl font-bold tracking-tight sm:text-2xl">{name}</h1>
          <p className="mt-1 truncate text-sm text-muted-foreground">{email}</p>
          {joinLabel ? (
            <p className="mt-0.5 text-xs text-muted-foreground">{joinLabel}</p>
          ) : null}
        </div>
      </header>

      <div className="mt-6 grid gap-6 lg:grid-cols-[200px_minmax(0,1fr)] lg:items-start">
        {/* 侧栏：窄屏折成一行可横滑的入口。
            ⚠️ min-w-0 必须带着：网格子项默认 min-width:auto，会被里面那排
            「不换行按钮」的固有宽度（约 436px）顶破整页——320px 实测溢出 132px，
            加了它才轮到 overflow-x-auto 真正开始滚动。 */}
        <aside className="min-w-0 lg:sticky lg:top-20">
          <nav aria-label="个人中心栏目" className="flex gap-1 overflow-x-auto lg:flex-col lg:gap-0.5">
            {SECTIONS.map((section) => {
              const isActive = section.id === active;
              const Icon = section.icon;
              return (
                <button
                  key={section.id}
                  type="button"
                  aria-current={isActive ? "true" : undefined}
                  onClick={() => setActive(section.id)}
                  className={cn(
                    "flex shrink-0 cursor-pointer items-center gap-2.5 rounded-lg px-3 py-2 text-sm whitespace-nowrap transition-colors duration-150 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none",
                    isActive
                      ? "bg-brand/10 font-medium text-foreground"
                      : "text-muted-foreground hover:bg-surface hover:text-foreground",
                  )}
                >
                  <Icon aria-hidden className="size-4 shrink-0" />
                  {section.label}
                </button>
              );
            })}

            <div className="mx-1 my-1 hidden border-t border-border lg:block" />

            <button
              type="button"
              onClick={() => void signOut()}
              disabled={isSigningOut}
              className="flex shrink-0 cursor-pointer items-center gap-2.5 rounded-lg px-3 py-2 text-sm whitespace-nowrap text-destructive transition-colors duration-150 hover:bg-destructive/10 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-50"
            >
              <LogOut aria-hidden className="size-4 shrink-0" />
              {isSigningOut ? "退出中…" : "退出登录"}
            </button>
          </nav>
        </aside>

        {/* 内容区 */}
        <section className="min-w-0">
          {active === "profile" ? (
            <ProfileSection
              userId={userId}
              email={email}
              name={name}
              savedName={savedName}
              avatarUrl={avatarUrl}
              onNameChange={setName}
              onNameSaved={setSavedName}
              onAvatarChange={setAvatarUrl}
            />
          ) : null}
          {active === "security" ? <SecuritySection email={email} /> : null}
          {active === "collection" ? <CollectionSection /> : null}
        </section>
      </div>
    </main>
  );
}

/** 横幅里的大头像；有图用图，没图用「首字 + 品牌渐变底」（与顶栏同一套口径） */
function AvatarPreview({ name, avatarUrl }: { name: string; avatarUrl: string | null }) {
  if (avatarUrl) {
    return (
      <Image
        src={avatarUrl}
        alt=""
        width={64}
        height={64}
        className="size-16 shrink-0 rounded-full object-cover ring-1 ring-border"
      />
    );
  }
  return (
    <span
      aria-hidden
      className="flex size-16 shrink-0 items-center justify-center rounded-full bg-linear-to-br from-brand-strong to-primary text-2xl font-semibold text-primary-foreground"
    >
      {Array.from(name)[0] ?? "番"}
    </span>
  );
}

/** "2026 年 10 月加入"。手拼而不走 toLocaleDateString——后者的输出跟运行环境有关，可能两端不一致 */
function formatJoinDate(createdAt: string | null): string | null {
  if (!createdAt) {
    return null;
  }
  const date = new Date(createdAt);
  if (Number.isNaN(date.getTime())) {
    return null;
  }
  return `${date.getFullYear()} 年 ${date.getMonth() + 1} 月加入`;
}

/** 卡片外壳 + 标题 + 说明 */
function SectionShell({
  title,
  description,
  children,
}: {
  title: string;
  description: string;
  children: ReactNode;
}) {
  return (
    <div className="rounded-2xl border border-border bg-surface/60 p-5 sm:p-6">
      <h2 className="text-lg font-semibold">{title}</h2>
      <p className="mt-1 text-sm leading-relaxed text-muted-foreground">{description}</p>
      <div className="mt-5">{children}</div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// 账户信息
// ─────────────────────────────────────────────────────────────

function ProfileSection({
  userId,
  email,
  name,
  savedName,
  avatarUrl,
  onNameChange,
  onNameSaved,
  onAvatarChange,
}: {
  userId: string;
  email: string;
  name: string;
  savedName: string;
  avatarUrl: string | null;
  onNameChange: (value: string) => void;
  onNameSaved: (value: string) => void;
  onAvatarChange: (url: string) => void;
}) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [avatarMessage, setAvatarMessage] = useState<{ tone: "ok" | "err"; text: string } | null>(
    null,
  );
  const [isSavingName, setIsSavingName] = useState(false);
  const [nameMessage, setNameMessage] = useState<{ tone: "ok" | "err"; text: string } | null>(null);

  const nameChanged = name.trim() !== savedName;

  async function handleAvatarPick(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    // 先清掉 input 的值：不清的话"连着选同一个文件"不会触发 change
    event.target.value = "";
    if (!file) {
      return;
    }

    setAvatarMessage(null);
    const invalid = validateAvatarFile(file);
    if (invalid) {
      setAvatarMessage({ tone: "err", text: invalid });
      return;
    }

    setIsUploading(true);
    try {
      const blob = await downscaleAvatar(file);
      const { url, error } = await uploadAvatar(userId, blob);
      if (error || !url) {
        setAvatarMessage({ tone: "err", text: error ?? "上传失败，稍后再试。" });
        return;
      }

      // 图片传完了还没完——把 URL 存进账号资料，不然刷新就丢
      const supabase = createClient();
      const { error: metaError } = await supabase.auth.updateUser({
        data: { avatar_url: url },
      });
      if (metaError) {
        setAvatarMessage({ tone: "err", text: `图片传上去了，但保存到账号失败：${metaError.message}` });
        return;
      }

      onAvatarChange(url);
      setAvatarMessage({ tone: "ok", text: "头像已更新。" });
    } catch (error) {
      setAvatarMessage({
        tone: "err",
        text: error instanceof Error ? error.message : "上传出错了，稍后再试。",
      });
    } finally {
      setIsUploading(false);
    }
  }

  async function handleSaveName() {
    const trimmed = name.trim();
    setNameMessage(null);

    if (!trimmed) {
      setNameMessage({ tone: "err", text: "昵称不能为空。" });
      return;
    }
    if (Array.from(trimmed).length > 20) {
      setNameMessage({ tone: "err", text: "昵称最多 20 个字。" });
      return;
    }

    setIsSavingName(true);
    try {
      const supabase = createClient();
      const { error } = await supabase.auth.updateUser({ data: { display_name: trimmed } });
      if (error) {
        setNameMessage({ tone: "err", text: `保存失败：${error.message}` });
        return;
      }
      onNameChange(trimmed);
      onNameSaved(trimmed);
      setNameMessage({ tone: "ok", text: "昵称已保存。" });
    } catch (error) {
      setNameMessage({
        tone: "err",
        text: error instanceof Error ? error.message : "保存出错了，稍后再试。",
      });
    } finally {
      setIsSavingName(false);
    }
  }

  return (
    <SectionShell
      title="账户信息"
      description="头像和昵称会显示在顶栏的账号菜单里。邮箱是登录账号，目前不支持更换。"
    >
      <div className="space-y-6">
        {/* 头像 */}
        <div className="flex items-center gap-4">
          <AvatarPreview name={name} avatarUrl={avatarUrl} />
          <div>
            <button
              type="button"
              disabled={isUploading}
              onClick={() => fileInputRef.current?.click()}
              className="cursor-pointer rounded-lg border border-border px-4 py-2 text-sm transition-colors duration-150 hover:border-brand/50 hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-50"
            >
              {isUploading ? "上传中…" : "更换头像"}
            </button>
            <p className="mt-1.5 text-xs leading-relaxed text-muted-foreground">
              支持 PNG / JPG / WebP，不超过 2MB（大图会自动压缩后再传）。
            </p>
          </div>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/png,image/jpeg,image/webp"
            className="sr-only"
            onChange={handleAvatarPick}
          />
        </div>
        {avatarMessage ? <Feedback tone={avatarMessage.tone}>{avatarMessage.text}</Feedback> : null}

        {/* 昵称 */}
        <div>
          <label htmlFor="display-name" className="mb-1.5 block text-sm font-medium">
            昵称
          </label>
          <div className="flex gap-2">
            <input
              id="display-name"
              type="text"
              value={name}
              maxLength={20}
              onChange={(event) => onNameChange(event.target.value)}
              className={INPUT_CLASS}
              placeholder="起一个 20 字以内的昵称"
            />
            <button
              type="button"
              onClick={() => void handleSaveName()}
              disabled={isSavingName || !nameChanged}
              className={cn(PRIMARY_BUTTON_CLASS, "shrink-0")}
            >
              {isSavingName ? "保存中…" : "保存"}
            </button>
          </div>
          {nameMessage ? (
            <div className="mt-2">
              <Feedback tone={nameMessage.tone}>{nameMessage.text}</Feedback>
            </div>
          ) : null}
        </div>

        {/* 邮箱（只读） */}
        <div>
          <span className="mb-1.5 block text-sm font-medium">邮箱</span>
          <p className="rounded-lg border border-border bg-surface px-3.5 py-2.5 text-sm break-all text-muted-foreground">
            {email}
          </p>
        </div>
      </div>
    </SectionShell>
  );
}

// ─────────────────────────────────────────────────────────────
// 账号安全（改密码）
// ─────────────────────────────────────────────────────────────

function SecuritySection({ email }: { email: string }) {
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [message, setMessage] = useState<{ tone: "ok" | "err"; text: string } | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  async function handleSubmit() {
    setMessage(null);

    if (!current) {
      setMessage({ tone: "err", text: "请先填写当前密码。" });
      return;
    }
    if (next.length < 6) {
      setMessage({ tone: "err", text: "新密码至少 6 位。" });
      return;
    }
    if (next !== confirm) {
      setMessage({ tone: "err", text: "两次输入的新密码不一样，请核对。" });
      return;
    }
    if (next === current) {
      setMessage({ tone: "err", text: "新密码不能和当前密码一样。" });
      return;
    }

    setIsSaving(true);
    try {
      const supabase = createClient();

      // 第一步：拿"当前密码"重新验一次身份——这是参照图里"需要先验证当前密码"的落法，
      // 也挡住了"手机被别人拿到、开着我的登录页就能改密码"这条路
      const { error: verifyError } = await supabase.auth.signInWithPassword({
        email,
        password: current,
      });
      if (verifyError) {
        setMessage({
          tone: "err",
          text: verifyError.message.toLowerCase().includes("invalid login credentials")
            ? "当前密码不对。"
            : `验证失败：${verifyError.message}`,
        });
        return;
      }

      // 第二步：换密码。成功后其他设备上的旧凭证会在到期后要求重新登录
      const { error: updateError } = await supabase.auth.updateUser({ password: next });
      if (updateError) {
        setMessage({
          tone: "err",
          text: updateError.message.toLowerCase().includes("should be at least")
            ? "新密码太短了，至少 6 位。"
            : `修改失败：${updateError.message}`,
        });
        return;
      }

      setCurrent("");
      setNext("");
      setConfirm("");
      setMessage({ tone: "ok", text: "密码已更新。其他设备上的登录会在凭证到期后要求重新登录。" });
    } catch (error) {
      setMessage({
        tone: "err",
        text: error instanceof Error ? error.message : "出错了，稍后再试。",
      });
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <SectionShell
      title="账号安全"
      description="修改密码前需要先验证当前密码。密码由 Supabase 加密保管，本站看不到原文。"
    >
      <div className="max-w-md space-y-4">
        <div>
          <label htmlFor="current-password" className="mb-1.5 block text-sm font-medium">
            当前密码
          </label>
          <input
            id="current-password"
            type="password"
            autoComplete="current-password"
            value={current}
            onChange={(event) => setCurrent(event.target.value)}
            className={INPUT_CLASS}
          />
        </div>
        <div>
          <label htmlFor="new-password" className="mb-1.5 block text-sm font-medium">
            新密码
          </label>
          <input
            id="new-password"
            type="password"
            autoComplete="new-password"
            value={next}
            onChange={(event) => setNext(event.target.value)}
            className={INPUT_CLASS}
            placeholder="至少 6 位"
          />
        </div>
        <div>
          <label htmlFor="confirm-password" className="mb-1.5 block text-sm font-medium">
            再输一遍新密码
          </label>
          <input
            id="confirm-password"
            type="password"
            autoComplete="new-password"
            value={confirm}
            onChange={(event) => setConfirm(event.target.value)}
            className={INPUT_CLASS}
          />
        </div>

        {message ? <Feedback tone={message.tone}>{message.text}</Feedback> : null}

        <button
          type="button"
          onClick={() => void handleSubmit()}
          disabled={isSaving}
          className={PRIMARY_BUTTON_CLASS}
        >
          {isSaving ? "提交中…" : "修改密码"}
        </button>
      </div>
    </SectionShell>
  );
}

// ─────────────────────────────────────────────────────────────
// 我的追番
// ─────────────────────────────────────────────────────────────

function CollectionSection() {
  const { entries, isReady } = useCollection();

  return (
    <SectionShell
      title="我的追番"
      description="追番记录平时存在这台设备上；登录后会自动同步到账号，换手机、换浏览器都不会丢。"
    >
      <div className="flex flex-col gap-4 rounded-xl border border-border bg-surface p-5 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <span
            aria-hidden
            className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-brand/10 text-brand"
          >
            <Heart className="size-5" />
          </span>
          <div>
            <p className="text-base font-medium">
              {isReady ? `已追 ${entries.length} 部番` : "读取中…"}
            </p>
            <p className="text-xs text-muted-foreground">含观看进度、评分和备注</p>
          </div>
        </div>
        <Link
          href="/my"
          className="shrink-0 rounded-lg bg-primary px-4 py-2 text-center text-sm font-medium text-primary-foreground transition-all duration-150 hover:brightness-110 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
        >
          去管理
        </Link>
      </div>
    </SectionShell>
  );
}
