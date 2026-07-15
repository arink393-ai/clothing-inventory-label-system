-- 舊版 migration 曾為 Data API 角色建立明確 EXECUTE grant；統一封鎖匿名呼叫。
revoke all on function public.adjust_inventory(uuid,text,integer,text) from public,anon;
revoke all on function public.complete_inventory_count(jsonb,text) from public,anon;
revoke all on function public.complete_sale(uuid) from public,anon,authenticated;
revoke all on function public.get_operations_report(uuid,timestamptz,timestamptz) from public,anon;
revoke all on function public.handle_new_user() from public,anon,authenticated;
revoke all on function public.has_store_role(uuid,public.app_role[]) from public,anon;
revoke all on function public.is_store_member(uuid) from public,anon;
revoke all on function public.update_points_settings(uuid,numeric,numeric,boolean) from public,anon;
revoke all on function public.update_staff_access(uuid,public.app_role,boolean) from public,anon;

-- 保留目前網站需要的登入者權限；各函式本身仍會核對門市角色。
grant execute on function public.adjust_inventory(uuid,text,integer,text) to authenticated;
grant execute on function public.complete_inventory_count(jsonb,text) to authenticated;
grant execute on function public.get_operations_report(uuid,timestamptz,timestamptz) to authenticated;
grant execute on function public.has_store_role(uuid,public.app_role[]) to authenticated;
grant execute on function public.is_store_member(uuid) to authenticated;
grant execute on function public.update_points_settings(uuid,numeric,numeric,boolean) to authenticated;
grant execute on function public.update_staff_access(uuid,public.app_role,boolean) to authenticated;

create index store_approval_settings_updated_by_idx on public.store_approval_settings(updated_by);
