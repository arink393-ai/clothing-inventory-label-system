-- ============================================================
--  Supabase 資料安全設定（RLS）for 服飾進銷存標籤系統
--  對應同步資料表：erp_state
--
--  【為什麼要做這個】
--  App 的 anon 金鑰是放在前端、公開可見的。如果沒有開啟 RLS，
--  任何拿到「網址 + anon 金鑰」的人，都能直接讀取、竄改、刪除你的
--  全部營業資料。開啟 RLS 後，只有「用 email/密碼登入成功」的人
--  才能存取，anon 金鑰單獨無用。
--
--  【怎麼執行】
--  1. 進入你的 Supabase 專案 → 左側 SQL Editor → New query
--  2. 把整份貼上 → 按 Run
--  3. 執行成功後，到 Table Editor → erp_state，確認右上角顯示
--     「RLS enabled」即完成。
--
--  【前置：先建立登入帳號】
--  Authentication → Users → Add user，建立一個 email + 密碼，
--  這就是 App「雲端同步設定」裡要填的帳號/密碼。
-- ============================================================

-- 0) 若資料表還沒建立，先建立（已存在會自動略過）
create table if not exists public.erp_state (
  id         text primary key,
  data       jsonb,
  rev        bigint default 0,
  writer     text,
  updated_at timestamptz default now()
);

-- 1) 開啟 Row Level Security（關鍵！沒開等於門戶大開）
alter table public.erp_state enable row level security;

-- 2) 清掉可能存在的舊政策，避免重複
drop policy if exists "erp_state_authenticated_all" on public.erp_state;
drop policy if exists "erp_state_no_anon"           on public.erp_state;

-- 3) 只允許「已登入」的使用者做任何操作（讀/寫/改/刪）
--    未登入（只有 anon 金鑰）的請求一律被擋。
create policy "erp_state_authenticated_all"
  on public.erp_state
  for all
  to authenticated
  using (true)
  with check (true);

-- ⚠️ 注意：不要為 anon 角色建立任何 policy。
--    RLS 開啟後預設就是「沒有符合的 policy = 拒絕」，
--    所以未登入者自動被擋，這正是我們要的效果。

-- ============================================================
--  （進階，選用）更嚴格：只允許「特定一位使用者」存取
--  適用單店單人。把下面 <你的user-uid> 換成 Authentication →
--  Users 裡那個帳號的 UID，然後改用這條 policy 取代上面第 3 步。
-- ------------------------------------------------------------
-- drop policy if exists "erp_state_authenticated_all" on public.erp_state;
-- create policy "erp_state_owner_only"
--   on public.erp_state
--   for all
--   to authenticated
--   using ( auth.uid() = '<你的user-uid>'::uuid )
--   with check ( auth.uid() = '<你的user-uid>'::uuid );
-- ============================================================

-- （選用）App 設定頁的「雲端用量顯示」需要這個函式；沒有也不影響同步。
create or replace function public.get_db_size()
returns bigint
language sql
security definer
as $$
  select pg_database_size(current_database());
$$;
