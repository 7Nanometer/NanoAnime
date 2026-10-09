"use client";

// 头像上传的浏览器侧工具（2026-10-09 加，个人中心用）。
//
// 流程：用户选图 → 本地校验（类型 / 大小）→ 用 canvas 压到 512px 以内 →
// 传进 Supabase Storage 的 avatars 桶（路径 = {用户id}/avatar）→ 拿公开 URL。
//
// ⚠️ 只存**一个**文件、固定文件名 avatar：换头像就是覆盖它（upsert），
// 不留一堆历史文件占空间。缓存问题用 URL 上挂 ?v=时间戳解决——
// 同一个 URL 会被浏览器/CDN 缓存住，挂了参数才是"新地址"。
//
// ⚠️ 上传路径 {userId}/avatar 与存储桶策略（supabase/migrations/0004_avatars_storage.sql）
// 是**同一条契约**：策略只放行"自己文件夹"里的写入。改这里必须同步改那边。

import { createClient } from "@/lib/supabase/client";

/** 存储桶名。⚠️ 与 0004 迁移文件必须一致 */
const BUCKET = "avatars";

/** 原图大小上限。桶那边也设了 2MB，这里先拦一道、省一次白跑的请求 */
const MAX_FILE_BYTES = 2 * 1024 * 1024;

/** 压缩后的边长上限（头像最大显示也就百来像素，512 足够清晰） */
const MAX_EDGE = 512;

export interface UploadAvatarResult {
  /** 成功时的公开 URL（带防缓存参数）；失败为 null */
  url: string | null;
  /** 失败时的中文说明；成功为 null */
  error: string | null;
}

/**
 * 选完文件先过一遍本地校验。
 * 返回 null = 通过；否则是直接给用户看的中文说明。
 */
export function validateAvatarFile(file: File): string | null {
  if (!["image/png", "image/jpeg", "image/webp"].includes(file.type)) {
    return "这个图片格式不支持，请用 PNG / JPG / WebP。";
  }
  if (file.size > MAX_FILE_BYTES) {
    return "图片太大（超过 2MB），请先换小一点的图。";
  }
  return null;
}

/**
 * 用 canvas 把图压到 MAX_EDGE 以内再上传。
 * 压不动（老浏览器没有 createImageBitmap 等）就原样返回——宁可传大一点，不能让流程断。
 */
export async function downscaleAvatar(file: File): Promise<Blob> {
  try {
    // imageOrientation: "from-image" —— 手机照片带旋转信息，不加这句会躺倒
    const bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
    const scale = Math.min(1, MAX_EDGE / Math.max(bitmap.width, bitmap.height));

    // 本来就小的图不重新编码（重编码白费一道还可能把 PNG 压出噪点）
    if (scale === 1 && file.size <= 512 * 1024) {
      bitmap.close();
      return file;
    }

    const width = Math.max(1, Math.round(bitmap.width * scale));
    const height = Math.max(1, Math.round(bitmap.height * scale));
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");
    if (!ctx) {
      bitmap.close();
      return file;
    }
    ctx.drawImage(bitmap, 0, 0, width, height);
    bitmap.close();

    // 优先 WebP（体积小、带透明通道）；老浏览器会退回 PNG——都是桶允许的格式
    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, "image/webp", 0.85),
    );
    return blob ?? file;
  } catch {
    return file;
  }
}

/** 上传头像并返回公开 URL（带防缓存参数）。失败返回中文说明 */
export async function uploadAvatar(userId: string, blob: Blob): Promise<UploadAvatarResult> {
  try {
    const supabase = createClient();
    const path = `${userId}/avatar`;

    const { error } = await supabase.storage.from(BUCKET).upload(path, blob, {
      upsert: true,
      contentType: blob.type || "image/webp",
      cacheControl: "3600",
    });

    if (error) {
      return { url: null, error: translateStorageError(error.message) };
    }

    const { data } = supabase.storage.from(BUCKET).getPublicUrl(path);
    return { url: `${data.publicUrl}?v=${Date.now()}`, error: null };
  } catch (error) {
    // 走到这儿基本是环境变量没配（createClient 会抛）
    return {
      url: null,
      error: error instanceof Error ? error.message : "上传出错了，稍后再试。",
    };
  }
}

/** 把 Supabase Storage 的英文错误翻成中文人话（同 AuthForm 的翻译策略：翻不了就原样透出） */
function translateStorageError(message: string): string {
  const text = message.toLowerCase();

  if (text.includes("bucket not found")) {
    return "云存储还没开通：请先按说明在 Supabase 后台跑 0004 迁移，再回来上传。";
  }
  if (text.includes("exceeded the maximum allowed size")) {
    return "图片超过 2MB 上限，请换小一点的图。";
  }
  if (text.includes("mime type") && text.includes("not supported")) {
    return "这个图片格式不支持，请用 PNG / JPG / WebP。";
  }
  // ⚠️ 2026-10-09：这条曾经误导过一次——当时真因是 0004 缺"读"策略，文案却让人去重新登录。
  // 现在两种可能都提：多数情况是登录过期；持续出现则是存储策略没配全。
  if (
    text.includes("row-level security") ||
    text.includes("unauthorized") ||
    text.includes("access denied")
  ) {
    return "没有权限：先刷新页面重新登录再试；若持续如此，可能是云端存储策略没配全。";
  }

  return `上传失败：${message}`;
}
