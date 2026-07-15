-- 進貨成本私有化，並提供整筆原子入庫函式。
create table public.purchase_item_costs (
  purchase_item_id uuid primary key references public.purchase_items(id) on delete cascade,
  store_id uuid not null references public.stores(id) on delete cascade,
  unit_cost numeric(12,2) not null default 0 check(unit_cost>=0)
);
insert into public.purchase_item_costs(purchase_item_id,store_id,unit_cost)
select pi.id,p.store_id,pi.unit_cost from public.purchase_items pi join public.purchases p on p.id=pi.purchase_id;
alter table public.purchase_item_costs enable row level security;
create policy "owner reads purchase costs" on public.purchase_item_costs for select using(public.has_store_role(store_id,array['owner']::public.app_role[]));
create policy "owner manages purchase costs" on public.purchase_item_costs for all using(public.has_store_role(store_id,array['owner']::public.app_role[])) with check(public.has_store_role(store_id,array['owner']::public.app_role[]));
alter table public.purchase_items drop column unit_cost;

create or replace function public.receive_purchase(p_supplier_name text,p_note text,p_items jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare v_item jsonb; v_variant uuid; v_qty integer; v_cost numeric(12,2); v_store uuid; v_expected_store uuid; v_supplier uuid; v_purchase uuid; v_purchase_item uuid; v_document text; v_lines integer:=0; v_units integer:=0;
begin
  if jsonb_typeof(p_items)<>'array' or jsonb_array_length(p_items)=0 then raise exception '進貨清單不可為空'; end if;
  for v_item in select value from jsonb_array_elements(p_items) loop
    v_variant:=(v_item->>'variant_id')::uuid; v_qty:=(v_item->>'quantity')::integer; v_cost:=coalesce(nullif(v_item->>'unit_cost','')::numeric,0);
    if v_qty<=0 then raise exception '進貨數量必須大於 0'; end if;
    if v_cost<0 then raise exception '成本不可小於 0'; end if;
    select store_id into v_store from public.product_variants where id=v_variant and active for update;
    if v_store is null then raise exception '進貨清單包含不存在或已停售的商品'; end if;
    if v_expected_store is null then v_expected_store:=v_store; end if;
    if v_store<>v_expected_store then raise exception '進貨清單不可包含其他門市商品'; end if;
  end loop;
  if not public.has_store_role(v_expected_store,array['owner','manager','stock_clerk']::public.app_role[]) then raise exception '您沒有進貨入庫權限'; end if;
  if trim(coalesce(p_supplier_name,''))<>'' then
    select id into v_supplier from public.suppliers where store_id=v_expected_store and lower(name)=lower(trim(p_supplier_name)) order by created_at limit 1;
    if v_supplier is null then insert into public.suppliers(store_id,name) values(v_expected_store,trim(p_supplier_name)) returning id into v_supplier; end if;
  end if;
  v_document:=format('PO-%s-%s',to_char(clock_timestamp(),'YYYYMMDDHH24MISS'),upper(substr(replace(gen_random_uuid()::text,'-',''),1,4)));
  insert into public.purchases(store_id,document_no,supplier_id,status,note,completed_at,created_by)
  values(v_expected_store,v_document,v_supplier,'completed',trim(coalesce(p_note,'')),now(),auth.uid()) returning id into v_purchase;
  for v_item in select value from jsonb_array_elements(p_items) loop
    v_variant:=(v_item->>'variant_id')::uuid; v_qty:=(v_item->>'quantity')::integer; v_cost:=coalesce(nullif(v_item->>'unit_cost','')::numeric,0);
    insert into public.purchase_items(purchase_id,variant_id,quantity) values(v_purchase,v_variant,v_qty) returning id into v_purchase_item;
    insert into public.purchase_item_costs(purchase_item_id,store_id,unit_cost) values(v_purchase_item,v_expected_store,v_cost);
    if v_cost>0 then insert into public.product_costs(variant_id,store_id,cost,updated_by,updated_at) values(v_variant,v_expected_store,v_cost,auth.uid(),now()) on conflict(variant_id) do update set cost=excluded.cost,updated_by=excluded.updated_by,updated_at=excluded.updated_at; end if;
    insert into public.stock_movements(store_id,variant_id,movement_type,quantity,reference_type,reference_id,note,created_by)
    values(v_expected_store,v_variant,'purchase',v_qty,'purchase',v_purchase,coalesce(nullif(trim(p_note),''),'進貨入庫'),auth.uid());
    v_lines:=v_lines+1; v_units:=v_units+v_qty;
  end loop;
  insert into public.audit_log(store_id,actor_id,action,entity_type,entity_id,details) values(v_expected_store,auth.uid(),'receive','purchase',v_purchase,jsonb_build_object('document_no',v_document,'lines',v_lines,'units',v_units));
  return jsonb_build_object('purchase_id',v_purchase,'document_no',v_document,'lines',v_lines,'units',v_units);
end $$;
revoke all on function public.receive_purchase(text,text,jsonb) from public;
grant execute on function public.receive_purchase(text,text,jsonb) to authenticated;
