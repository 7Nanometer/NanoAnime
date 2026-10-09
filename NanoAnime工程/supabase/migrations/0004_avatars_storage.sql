-- NanoAnime番鉴 · 头像云存储（Storage 桶 + 安全策略）
--
-- 用法（和 0001~0003 同一套流程）：打开 Supabase 后台 → 左侧 SQL Editor →
-- New query → 把本文件整段粘进去 → Run。
-- 跑完自检：到左侧 Storage 页面，应能看到一个叫 avatars 的桶。
--
-- ⚠️ 本文件**刻意写成可重复跑**（幂等）：桶用 on conflict 更新、策略先 drop 再建。
--    这是 0003 的教训换来的规矩——「跑了当成功」不行，而且整段失败会**静默回滚**；
--    写成幂等之后，重跑一遍永远安全，跑没跑成功也有明确的自检点。
--
-- 它做两件事：
--   1. 建一个「公开读」的存储桶 avatars —— 头像要显示在页面上，用公开 URL 读取；
--      「谁能写」由下面的策略锁死。
--   2. 四条策略：登录用户只能对**以自己账号编号命名的文件夹**里的文件读 / 传 / 换 / 删。
--
-- ⚠️ 为什么文件路径必须按「用户id / 文件名」组织：
--    桶是所有用户共用的，策略靠**文件夹的第一层名字**判断"这是谁的文件"。
--    客户端的上传路径（lib/avatar.ts）与这里必须一致，改一处就要同步另一处。

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'avatars',
  'avatars',
  true,                                     -- 公开桶：头像 URL 不带签名也能看
  2097152,                                  -- 单文件上限 2MB（前端上传前还会先压一道）
  array['image/png', 'image/jpeg', 'image/webp']
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

-- ---------------------------------------------------------------------------
-- 安全策略：只认「自己文件夹」里的读 / 增 / 改 / 删
-- ---------------------------------------------------------------------------
-- ⚠️ 为什么"读"也要建策略（2026-10-09 实机验证换来的教训）：
--    页面**显示**头像确实不需要它（公开桶走 /object/public/ 路径就能看）。
--    但**覆盖上传**和**删除**在数据库底层要先"找到并看见"已存在的文件行——
--    没有 select 策略时，这两类操作会直接被拒（网页上报"没有权限"）。
--    这与 Supabase 官方文档一致：覆盖上传(upsert)需要 select + insert + update；
--    删除需要 select + delete。所以四条缺一不可。

drop policy if exists "本人可查看自己的头像" on storage.objects;
create policy "本人可查看自己的头像" on storage.objects
  for select to authenticated
  using (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

drop policy if exists "本人可上传自己的头像" on storage.objects;
create policy "本人可上传自己的头像" on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

drop policy if exists "本人可覆盖自己的头像" on storage.objects;
create policy "本人可覆盖自己的头像" on storage.objects
  for update to authenticated
  using (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

drop policy if exists "本人可删除自己的头像" on storage.objects;
create policy "本人可删除自己的头像" on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

-- 跑完自检（可选）：把下面两句分别单独跑——
--   应各返回一行 avatars | t | 2097152
-- select id, public, file_size_limit from storage.buckets where id = 'avatars';
--   应返回四行策略名（本人可查看 / 上传 / 覆盖 / 删除自己的头像）
-- select policyname from pg_policies
--   where schemaname = 'storage' and tablename = 'objects'
--     and policyname like '本人可%自己的头像';
