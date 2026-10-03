-- NanoAnime番鉴 · 追番记录表
--
-- 用法：打开 Supabase 后台 → 左侧 SQL Editor → New query → 把本文件整段粘进去 → Run。
-- 这个文件是**唯一的表结构出处**，改了它就要在后台重新跑一遍（或者写第二个迁移文件）。
--
-- ⚠️ 这一步现在还不被应用读写 —— 追番数据仍然存在浏览器本地。
--    建它是为下一步「云端同步」打地基，顺便把安全策略（RLS）一次做对。
--
-- ⚠️ 与 docs/产品方案.md 第七节的两处出入（用户已确认）：
--    1. 文档里 user_id 指向 profile 表，番剧指向 anime 表 —— 这两张表都还不存在。
--       这里改为：user_id 直接指向 Supabase 自带的 auth.users(id)；
--       番剧只存 AniList 编号，不建外键。
--    2. 文档用 id bigserial 做主键。这里改用 (user_id, anilist_id) 复合主键：
--       天然保证「一个用户对一部番只有一条记录」，下一步同步时可以直接按这两列
--       upsert 合并、不用先查 id，还省掉一个自增序列和一个索引。
--    将来建了 anime 表，再决定要不要把 anilist_id 换成指向它的外键。

create table public.collection (
  -- 谁追的。auth.users 是 Supabase 自带的账号表。
  -- on delete cascade：账号注销时，ta 的追番记录跟着一起删，不留孤儿数据。
  user_id     uuid not null references auth.users (id) on delete cascade,

  -- 哪部番。存的是 AniList 的番剧编号（就是本地数据里的 animeId），不是自家表的主键。
  anilist_id  integer not null,

  -- 追番状态。限定成这五个值，写错一个字符数据库会当场拒绝，
  -- 而不是悄悄存进去、等到界面上显示不出来才发现。
  status      text not null default 'watching'
              check (status in ('watching', 'completed', 'planning', 'paused', 'dropped')),

  -- 看到第几集。0 = 一集没看
  progress    integer not null default 0 check (progress >= 0),

  score       numeric(3, 1) check (score >= 0 and score <= 10),
  is_favorite boolean not null default false,
  note        text,
  started_at  date,
  finished_at date,
  updated_at  timestamptz not null default now(),

  -- 复合主键：一个用户 + 一部番 = 唯一一行
  primary key (user_id, anilist_id)
);

comment on table public.collection is '用户的追番记录与观看进度。每行只能被 owner 本人读写。';

-- ---------------------------------------------------------------------------
-- 安全策略（RLS）—— 这一步是安全底线，一条都不能少
-- ---------------------------------------------------------------------------
--
-- 为什么这块是全项目最要紧的地方：
-- Supabase 的 anon key 会**明晃晃地出现在浏览器代码里**（这是它的设计，不是失误）。
-- 别人拿到那个 key，就能直接调数据库接口、绕开我们的界面。
-- **挡住他们的唯一一道墙就是下面这些策略。** 漏配 = 数据裸奔。

alter table public.collection enable row level security;

-- ⚠️ 即使策略写错了，也先把「没登录的人」挡在门外。
-- Supabase 默认会给 anon 角色发表权限，这里显式收回：没登录，连碰都不该碰。
revoke all on public.collection from anon;
grant select, insert, update, delete on public.collection to authenticated;

-- 四条策略，对应四种操作，判断条件都是同一句：这一行是不是你自己的。
-- 用 (select auth.uid()) 而不是直接写 auth.uid()：前者只算一次，
-- 后者会对每一行都重算一遍，数据一多就是几十倍的差距（Supabase 官方性能建议）。

create policy "本人可查看自己的追番"
  on public.collection for select
  using ((select auth.uid()) = user_id);

create policy "本人可添加自己的追番"
  on public.collection for insert
  with check ((select auth.uid()) = user_id);

-- 改的时候用 using 挡住「改别人的」，再用 with check 挡住「把行改成别人的」。
-- 两个都要有：只写 using 的话，用户能把自己的记录 user_id 改成别人，等于把数据送出去。
create policy "本人可修改自己的追番"
  on public.collection for update
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

create policy "本人可删除自己的追番"
  on public.collection for delete
  using ((select auth.uid()) = user_id);

-- ---------------------------------------------------------------------------
-- 自动维护 updated_at
-- ---------------------------------------------------------------------------
-- 不靠应用代码记得去更新这个字段 —— 那种「靠自觉」的做法迟早会漏。

create or replace function public.touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger collection_touch_updated_at
  before update on public.collection
  for each row
  execute function public.touch_updated_at();
