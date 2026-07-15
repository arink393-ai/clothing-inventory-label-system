-- 原子化庫存調整與整批盤點。
create or replace function public.adjust_inventory(
  p_variant_id uuid, p_mode text, p_quantity integer, p_note text
) returns jsonb
language plpgsql security definer set search_path='' as $$
declare v_store uuid; v_current integer; v_change integer; v_result integer;
begin
  select store_id into v_store from public.product_variants where id=p_variant_id and active for update;
  if v_store is null then raise exception '找不到可用的商品規格'; end if;
  if not public.has_store_role(v_store,array['owner','manager','stock_clerk']::public.app_role[]) then raise exception '您沒有調整庫存的權限'; end if;
  if trim(coalesce(p_note,''))='' then raise exception '請填寫調整原因'; end if;
  select coalesce(sum(quantity),0)::integer into v_current from public.stock_movements where store_id=v_store and variant_id=p_variant_id;
  if p_mode='set' then v_change:=p_quantity-v_current;
  elsif p_mode='increase' then v_change:=p_quantity;
  elsif p_mode='decrease' then v_change:=-p_quantity;
  else raise exception '不支援的調整方式'; end if;
  v_result:=v_current+v_change;
  if p_quantity<0 or v_result<0 then raise exception '庫存不可小於 0'; end if;
  if v_change<>0 then
    insert into public.stock_movements(store_id,variant_id,movement_type,quantity,reference_type,reference_id,note,created_by)
    values(v_store,p_variant_id,'adjustment',v_change,'inventory_adjustment',p_variant_id,trim(p_note),auth.uid());
    insert into public.audit_log(store_id,actor_id,action,entity_type,entity_id,details)
    values(v_store,auth.uid(),'inventory_adjust','product_variant',p_variant_id,jsonb_build_object('before',v_current,'change',v_change,'after',v_result,'note',trim(p_note)));
  end if;
  return jsonb_build_object('before',v_current,'change',v_change,'after',v_result);
end $$;
revoke all on function public.adjust_inventory(uuid,text,integer,text) from public;
grant execute on function public.adjust_inventory(uuid,text,integer,text) to authenticated;

create or replace function public.complete_inventory_count(p_items jsonb, p_note text default '掃碼盤點') returns jsonb
language plpgsql security definer set search_path='' as $$
declare v_item jsonb; v_variant uuid; v_count integer; v_store uuid; v_expected_store uuid; v_current integer; v_change integer; v_changed integer:=0; v_checked integer:=0;
begin
  if jsonb_typeof(p_items)<>'array' or jsonb_array_length(p_items)=0 then raise exception '盤點清單不可為空'; end if;
  for v_item in select value from jsonb_array_elements(p_items) loop
    v_variant:=(v_item->>'variant_id')::uuid; v_count:=(v_item->>'count')::integer;
    if v_count<0 then raise exception '盤點數量不可小於 0'; end if;
    select store_id into v_store from public.product_variants where id=v_variant and active for update;
    if v_store is null then raise exception '盤點清單包含不存在或已停售的商品'; end if;
    if v_expected_store is null then v_expected_store:=v_store; end if;
    if v_store<>v_expected_store then raise exception '盤點清單不可包含其他門市商品'; end if;
    if not public.has_store_role(v_store,array['owner','manager','stock_clerk']::public.app_role[]) then raise exception '您沒有盤點庫存的權限'; end if;
    select coalesce(sum(quantity),0)::integer into v_current from public.stock_movements where store_id=v_store and variant_id=v_variant;
    v_change:=v_count-v_current; v_checked:=v_checked+1;
    if v_change<>0 then
      insert into public.stock_movements(store_id,variant_id,movement_type,quantity,reference_type,reference_id,note,created_by)
      values(v_store,v_variant,'adjustment',v_change,'inventory_count',v_variant,format('%s：實盤 %s，系統 %s',coalesce(nullif(trim(p_note),''),'掃碼盤點'),v_count,v_current),auth.uid());
      insert into public.audit_log(store_id,actor_id,action,entity_type,entity_id,details)
      values(v_store,auth.uid(),'inventory_count','product_variant',v_variant,jsonb_build_object('before',v_current,'counted',v_count,'change',v_change));
      v_changed:=v_changed+1;
    end if;
  end loop;
  return jsonb_build_object('checked',v_checked,'changed',v_changed);
end $$;
revoke all on function public.complete_inventory_count(jsonb,text) from public;
grant execute on function public.complete_inventory_count(jsonb,text) to authenticated;
