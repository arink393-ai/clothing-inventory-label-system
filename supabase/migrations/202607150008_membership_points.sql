-- 會員點數：預設每消費 100 元累積 1 點，1 點折抵 1 元。
alter table public.stores add column points_spend_amount numeric(12,2) not null default 100 check(points_spend_amount>0);
alter table public.stores add column point_value numeric(12,2) not null default 1 check(point_value>0);
alter table public.stores add column points_enabled boolean not null default true;
alter table public.sales add column points_earned integer not null default 0 check(points_earned>=0);
alter table public.sales add column points_redeemed integer not null default 0 check(points_redeemed>=0);
alter table public.sales add column points_discount numeric(12,2) not null default 0 check(points_discount>=0);
create unique index customers_store_phone_unique on public.customers(store_id,phone) where phone is not null and trim(phone)<>'';

create table public.customer_points_ledger (
  id uuid primary key default gen_random_uuid(), store_id uuid not null references public.stores(id) on delete cascade,
  customer_id uuid not null references public.customers(id) on delete cascade, sale_id uuid references public.sales(id) on delete set null,
  points integer not null check(points<>0), balance_after integer not null check(balance_after>=0),
  entry_type text not null check(entry_type in ('earn','redeem','adjustment')), note text not null default '',
  created_by uuid not null references auth.users(id), created_at timestamptz not null default now()
);
create index customer_points_history on public.customer_points_ledger(customer_id,created_at desc);
alter table public.customer_points_ledger enable row level security;
create policy "sales roles read point ledger" on public.customer_points_ledger for select using(public.has_store_role(store_id,array['owner','manager','cashier']::public.app_role[]));

drop policy if exists "sales roles manage customers" on public.customers;
create policy "sales roles create customers" on public.customers for insert with check(public.has_store_role(store_id,array['owner','manager','cashier']::public.app_role[]));
create policy "sales roles update customers" on public.customers for update using(public.has_store_role(store_id,array['owner','manager','cashier']::public.app_role[])) with check(public.has_store_role(store_id,array['owner','manager','cashier']::public.app_role[]));
create policy "managers delete customers" on public.customers for delete using(public.has_store_role(store_id,array['owner','manager']::public.app_role[]));
revoke insert,update on public.customers from authenticated;
grant insert(store_id,name,phone,email) on public.customers to authenticated;
grant update(name,phone,email) on public.customers to authenticated;

create or replace function public.adjust_customer_points(p_customer_id uuid,p_delta integer,p_note text) returns jsonb
language plpgsql security definer set search_path='' as $$
declare v_store uuid; v_before integer; v_after integer;
begin
  select store_id,points into v_store,v_before from public.customers where id=p_customer_id for update;
  if v_store is null then raise exception '找不到會員'; end if;
  if not public.has_store_role(v_store,array['owner','manager']::public.app_role[]) then raise exception '只有店主或店長可以人工調整點數'; end if;
  if p_delta=0 then raise exception '調整點數不可為 0'; end if;
  if trim(coalesce(p_note,''))='' then raise exception '請填寫調整原因'; end if;
  v_after:=v_before+p_delta; if v_after<0 then raise exception '會員點數不可小於 0'; end if;
  update public.customers set points=v_after where id=p_customer_id;
  insert into public.customer_points_ledger(store_id,customer_id,points,balance_after,entry_type,note,created_by)
  values(v_store,p_customer_id,p_delta,v_after,'adjustment',trim(p_note),auth.uid());
  return jsonb_build_object('before',v_before,'after',v_after,'change',p_delta);
end $$;
revoke all on function public.adjust_customer_points(uuid,integer,text) from public;
grant execute on function public.adjust_customer_points(uuid,integer,text) to authenticated;

create or replace function public.update_points_settings(p_store_id uuid,p_spend_amount numeric,p_point_value numeric,p_enabled boolean) returns void
language plpgsql security definer set search_path='' as $$
begin
 if not public.has_store_role(p_store_id,array['owner']::public.app_role[]) then raise exception '只有店主可以修改點數規則'; end if;
 if p_spend_amount<=0 or p_point_value<=0 then raise exception '點數門檻與折抵金額必須大於 0'; end if;
 update public.stores set points_spend_amount=p_spend_amount,point_value=p_point_value,points_enabled=p_enabled where id=p_store_id;
end $$;
revoke all on function public.update_points_settings(uuid,numeric,numeric,boolean) from public;
grant execute on function public.update_points_settings(uuid,numeric,numeric,boolean) to authenticated;

create or replace function public.complete_sale(p_sale_id uuid) returns public.sales
language plpgsql security definer set search_path='' as $$
declare v_sale public.sales; v_item public.sale_items; v_stock integer; v_cost numeric(12,2); v_spend numeric(12,2); v_value numeric(12,2); v_enabled boolean; v_customer_points integer:=0; v_point_discount numeric(12,2):=0; v_subtotal numeric(12,2); v_total numeric(12,2); v_earned integer:=0; v_balance integer;
begin
 select * into v_sale from public.sales where id=p_sale_id for update;
 if v_sale.id is null or not public.has_store_role(v_sale.store_id,array['owner','manager','cashier']::public.app_role[]) then raise exception '無權完成此銷售單'; end if;
 if v_sale.status<>'draft' then raise exception '銷售單不是草稿狀態'; end if;
 if not exists(select 1 from public.sale_items where sale_id=p_sale_id) then raise exception '銷售單沒有商品'; end if;
 select points_spend_amount,point_value,points_enabled into v_spend,v_value,v_enabled from public.stores where id=v_sale.store_id;
 if v_sale.customer_id is not null then
   select points into v_customer_points from public.customers where id=v_sale.customer_id and store_id=v_sale.store_id for update;
   if not found then raise exception '找不到這位門市會員'; end if;
 elsif v_sale.points_redeemed>0 then raise exception '折抵點數前請先選擇會員'; end if;
 if not v_enabled and v_sale.points_redeemed>0 then raise exception '門市目前未啟用點數折抵'; end if;
 if v_sale.points_redeemed>v_customer_points then raise exception '會員點數不足'; end if;
 v_point_discount:=case when v_enabled then v_sale.points_redeemed*v_value else 0 end;
 for v_item in select * from public.sale_items where sale_id=p_sale_id loop
   perform 1 from public.product_variants where id=v_item.variant_id for update;
   select coalesce(cost,0) into v_cost from public.product_costs where variant_id=v_item.variant_id;
   insert into public.sale_item_costs(sale_item_id,store_id,unit_cost) values(v_item.id,v_sale.store_id,coalesce(v_cost,0)) on conflict(sale_item_id) do update set unit_cost=excluded.unit_cost;
   select coalesce(sum(quantity),0)::integer into v_stock from public.stock_movements where store_id=v_sale.store_id and variant_id=v_item.variant_id;
   if v_stock<v_item.quantity then raise exception '庫存不足：規格 % 僅剩 % 件',v_item.variant_id,v_stock; end if;
   insert into public.stock_movements(store_id,variant_id,movement_type,quantity,reference_type,reference_id,created_by) values(v_sale.store_id,v_item.variant_id,'sale',-v_item.quantity,'sale',v_sale.id,auth.uid());
 end loop;
 select coalesce(sum(quantity*unit_price),0) into v_subtotal from public.sale_items where sale_id=p_sale_id;
 if v_sale.discount+v_point_discount>v_subtotal then raise exception '折扣與點數折抵不可超過商品小計'; end if;
 v_total:=v_subtotal-v_sale.discount-v_point_discount;
 if v_enabled and v_sale.customer_id is not null then v_earned:=floor(v_total/v_spend); end if;
 update public.sales set status='completed',completed_at=now(),subtotal=v_subtotal,total=v_total,points_discount=v_point_discount,points_earned=v_earned where id=p_sale_id returning * into v_sale;
 if v_sale.customer_id is not null then
   v_balance:=v_customer_points;
   if v_sale.points_redeemed>0 then v_balance:=v_balance-v_sale.points_redeemed; insert into public.customer_points_ledger(store_id,customer_id,sale_id,points,balance_after,entry_type,note,created_by) values(v_sale.store_id,v_sale.customer_id,v_sale.id,-v_sale.points_redeemed,v_balance,'redeem','銷售折抵',auth.uid()); end if;
   if v_earned>0 then v_balance:=v_balance+v_earned; insert into public.customer_points_ledger(store_id,customer_id,sale_id,points,balance_after,entry_type,note,created_by) values(v_sale.store_id,v_sale.customer_id,v_sale.id,v_earned,v_balance,'earn','消費累積',auth.uid()); end if;
   update public.customers set points=v_balance where id=v_sale.customer_id;
 end if;
 insert into public.audit_log(store_id,actor_id,action,entity_type,entity_id,details) values(v_sale.store_id,auth.uid(),'complete','sale',v_sale.id,jsonb_build_object('points_earned',v_earned,'points_redeemed',v_sale.points_redeemed));
 return v_sale;
end $$;
