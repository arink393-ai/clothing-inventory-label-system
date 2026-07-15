-- 自動建立使用者資料，並讓第一位登入者建立自己的門市。
create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  insert into public.profiles(id, display_name)
  values(new.id, coalesce(new.raw_user_meta_data->>'display_name', split_part(new.email, '@', 1)))
  on conflict (id) do nothing;
  return new;
end $$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users
for each row execute function public.handle_new_user();

-- 補建已存在、但尚未有 profile 的 Auth 使用者。
insert into public.profiles(id, display_name)
select id, coalesce(raw_user_meta_data->>'display_name', split_part(email, '@', 1))
from auth.users
on conflict (id) do nothing;

create or replace function public.bootstrap_store(p_name text, p_display_name text)
returns uuid language plpgsql security definer set search_path = '' as $$
declare v_store uuid;
begin
  if auth.uid() is null then raise exception '請先登入'; end if;
  if trim(coalesce(p_name,'')) = '' then raise exception '請輸入門市名稱'; end if;
  if exists(select 1 from public.store_members where user_id=auth.uid() and active) then
    raise exception '此帳號已加入門市';
  end if;
  insert into public.profiles(id,display_name) values(auth.uid(),trim(coalesce(p_display_name,'')))
  on conflict(id) do update set display_name=excluded.display_name;
  insert into public.stores(name) values(trim(p_name)) returning id into v_store;
  insert into public.store_members(store_id,user_id,role) values(v_store,auth.uid(),'owner');
  insert into public.audit_log(store_id,actor_id,action,entity_type,entity_id,details)
  values(v_store,auth.uid(),'bootstrap','store',v_store,jsonb_build_object('role','owner'));
  return v_store;
end $$;
revoke all on function public.bootstrap_store(text,text) from public;
grant execute on function public.bootstrap_store(text,text) to authenticated;
