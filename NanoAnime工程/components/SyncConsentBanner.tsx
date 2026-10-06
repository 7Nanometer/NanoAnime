"use client";

import { useSyncStatus } from "@/components/useCollection";
import { declineSyncConsent, giveSyncConsent } from "@/lib/collection";

/**
 * 「开始同步前先说明白」的横幅 —— 只在**有一笔改动等着推上云端、而用户还没表过态**时出现
 * （同步状态变成 `consent` 的那一刻，见 lib/collection.ts 的 syncOnce）。
 *
 * 它说明的是"同步意味着什么"：记录会**离开这台设备**、存到云端账号里
 * （换设备登录能拉回来；只有你自己能看到——数据库行级策略保证，已两账号交叉实测）。
 * 为什么不静默同步：在数据第一次离开本机之前，先让用户知情、自己按下"开始"。
 *
 * 两个按钮都是**认真的选择**（不是"关闭提示"）：
 * · 「开始同步」 → 推上去（存到云端账号）
 * · 「暂不同步」 → 记住：从此不推、**横幅不再出现**（不反复打扰）；
 *    「我的追番」里留一条常驻说明 + 「开启同步」按钮，想改主意随时可以（不死锁）
 * 两种选择都按账号分开存（共用设备上 A 选过 ≠ B 选过，宪法第 13 条）。
 */
export function SyncConsentBanner() {
  const status = useSyncStatus();

  if (status !== "consent") {
    return null;
  }

  return (
    <div
      // role="status" 让屏幕阅读器也能念出来，和 OfflineBanner 同一套做法
      role="status"
      // 品牌色底：这条横幅要的是"用户在做一个需要知情的决定"，用品牌色比灰色更像个邀请。
      // 透明度 10% + 左侧一道实色竖线，既醒目又不至于盖过底下的内容
      className="border-b border-border bg-brand-tint px-4 py-3"
    >
      <div className="mx-auto flex max-w-7xl flex-col gap-2 border-l-2 border-brand pl-3 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-xs leading-relaxed text-muted-foreground">
          开始同步前请先了解：同步后你的追番记录会<strong className="font-medium text-foreground">存到云端账号里</strong>
          ——换设备登录能拉回来，只有你自己能看到。选「暂不同步」的话，新的改动只存在本机
          （换设备看不到），之后随时可以在「我的追番」里再开启。
        </p>
        <div className="flex shrink-0 gap-2 self-start sm:self-auto">
          <button
            type="button"
            onClick={declineSyncConsent}
            className="cursor-pointer rounded-md border border-border px-3 py-1.5 text-xs text-muted-foreground transition-colors duration-150 hover:bg-surface hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
          >
            暂不同步
          </button>
          <button
            type="button"
            onClick={giveSyncConsent}
            className="cursor-pointer rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground transition-opacity duration-150 hover:opacity-90 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
          >
            我知道了，开始同步
          </button>
        </div>
      </div>
    </div>
  );
}
