create or replace function private.guard_consignment_change() returns trigger
language plpgsql security invoker set search_path='' as $$
begin
  if (
    (tg_op='INSERT' and new.is_consignment)
    or
    (tg_op='UPDATE' and (old.is_consignment,old.consignor_name,old.consignment_commission_percent)
      is distinct from (new.is_consignment,new.consignor_name,new.consignment_commission_percent))
  ) and not public.has_store_role(new.store_id,array['owner','manager']::public.app_role[]) then
    raise exception '只有店主或店長可以設定寄賣與拆帳比例';
  end if;
  return new;
end $$;
revoke all on function private.guard_consignment_change() from public,anon,authenticated;
