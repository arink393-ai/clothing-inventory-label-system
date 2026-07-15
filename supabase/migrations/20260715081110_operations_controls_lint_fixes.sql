-- 修正 security definer 空 search_path 下的 extension 函式解析，並移除退貨 wrapper
-- 的預設參數，避免與既有四參數原子退貨函式產生 overload 歧義。

create or replace function private.approval_method(p_store uuid,p_role public.app_role,p_pin text)
returns text language plpgsql security definer set search_path='' as $$
declare v_hash text;
begin
  if p_role in ('owner','manager') then return 'manager_role'; end if;
  select manager_pin_hash into v_hash from public.store_approval_settings where store_id=p_store;
  if v_hash is null then raise exception '此操作需要店長核准，請先由店主設定店長 PIN'; end if;
  if trim(coalesce(p_pin,''))='' or extensions.crypt(trim(p_pin),v_hash)<>v_hash then raise exception '店長 PIN 不正確'; end if;
  return 'manager_pin';
end $$;
revoke all on function private.approval_method(uuid,public.app_role,text) from public,anon,authenticated;

create or replace function public.update_approval_settings(
  p_store_id uuid,p_discount_threshold numeric,p_return_threshold numeric,p_manager_pin text default null
) returns jsonb language plpgsql security definer set search_path='' as $$
declare v_has_pin boolean;
begin
  if not public.has_store_role(p_store_id,array['owner']::public.app_role[]) then raise exception '只有店主可以修改核准規則'; end if;
  if p_discount_threshold not between 0 and 100 then raise exception '折扣核准比例必須介於 0～100'; end if;
  if p_return_threshold<0 then raise exception '大額退貨門檻不可小於 0'; end if;
  select manager_pin_hash is not null into v_has_pin from public.store_approval_settings where store_id=p_store_id;
  if trim(coalesce(p_manager_pin,''))<>'' and trim(p_manager_pin)!~'^[0-9]{4,8}$' then raise exception '店長 PIN 必須為 4～8 位數字'; end if;
  if not coalesce(v_has_pin,false) and trim(coalesce(p_manager_pin,''))='' then raise exception '第一次設定時請輸入 4～8 位店長 PIN'; end if;
  insert into public.store_approval_settings(store_id,discount_threshold_percent,return_threshold_amount,manager_pin_hash,updated_by,updated_at)
  values(p_store_id,p_discount_threshold,p_return_threshold,
    case when trim(coalesce(p_manager_pin,''))<>'' then extensions.crypt(trim(p_manager_pin),extensions.gen_salt('bf')) else null end,
    auth.uid(),now())
  on conflict(store_id) do update set
    discount_threshold_percent=excluded.discount_threshold_percent,
    return_threshold_amount=excluded.return_threshold_amount,
    manager_pin_hash=case when excluded.manager_pin_hash is null then public.store_approval_settings.manager_pin_hash else excluded.manager_pin_hash end,
    updated_by=auth.uid(),updated_at=now();
  insert into public.audit_log(store_id,actor_id,action,entity_type,entity_id,details)
  values(p_store_id,auth.uid(),'update_approval_settings','store',p_store_id,
    jsonb_build_object('discount_threshold_percent',p_discount_threshold,'return_threshold_amount',p_return_threshold,'pin_changed',trim(coalesce(p_manager_pin,''))<>''));
  return public.get_approval_settings(p_store_id);
end $$;
revoke all on function public.update_approval_settings(uuid,numeric,numeric,text) from public,anon,authenticated;
grant execute on function public.update_approval_settings(uuid,numeric,numeric,text) to authenticated;

drop function public.complete_sale_return(uuid,text,text,jsonb,text);

create function public.complete_sale_return(
  p_sale_id uuid,p_refund_method text,p_reason text,p_items jsonb,p_manager_pin text
) returns jsonb language plpgsql security definer set search_path='' as $$
declare v_store uuid; v_role public.app_role; v_threshold numeric; v_result jsonb; v_amount numeric; v_method text:=null;
begin
  select s.store_id,m.role into v_store,v_role from public.sales s
  join public.store_members m on m.store_id=s.store_id and m.user_id=auth.uid() and m.active where s.id=p_sale_id;
  if v_store is null or v_role not in ('owner','manager','cashier') then raise exception '您沒有辦理退貨的權限'; end if;
  v_result:=public.complete_sale_return(p_sale_id,p_refund_method,p_reason,p_items);
  v_amount:=coalesce((v_result->>'refund_amount')::numeric,0);
  select coalesce(return_threshold_amount,3000) into v_threshold from public.store_approval_settings where store_id=v_store;
  v_threshold:=coalesce(v_threshold,3000);
  if v_amount>=v_threshold then v_method:=private.approval_method(v_store,v_role,p_manager_pin); end if;
  update public.sale_returns set approval_required=v_amount>=v_threshold,approval_method=v_method where id=(v_result->>'return_id')::uuid;
  if v_amount>=v_threshold then
    insert into public.audit_log(store_id,actor_id,action,entity_type,entity_id,details)
    values(v_store,auth.uid(),'approve_large_return','sale_return',(v_result->>'return_id')::uuid,
      jsonb_build_object('refund_amount',v_amount,'threshold',v_threshold,'approval_method',v_method));
  end if;
  return v_result||jsonb_build_object('approval_required',v_amount>=v_threshold,'approval_method',v_method);
end $$;
revoke all on function public.complete_sale_return(uuid,text,text,jsonb) from public,anon,authenticated;
revoke all on function public.complete_sale_return(uuid,text,text,jsonb,text) from public,anon,authenticated;
grant execute on function public.complete_sale_return(uuid,text,text,jsonb,text) to authenticated;
