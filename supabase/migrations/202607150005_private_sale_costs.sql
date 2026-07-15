-- 銷售明細成本也拆到店主專用表，避免其他角色從交易明細看到成本。
create table public.sale_item_costs (
  sale_item_id uuid primary key references public.sale_items(id) on delete cascade,
  store_id uuid not null references public.stores(id) on delete cascade,
  unit_cost numeric(12,2) not null default 0 check(unit_cost>=0)
);
insert into public.sale_item_costs(sale_item_id,store_id,unit_cost)
select si.id,s.store_id,si.unit_cost from public.sale_items si join public.sales s on s.id=si.sale_id;
alter table public.sale_item_costs enable row level security;
create policy "owner reads sale costs" on public.sale_item_costs for select using(public.has_store_role(store_id,array['owner']::public.app_role[]));
create policy "owner manages sale costs" on public.sale_item_costs for all using(public.has_store_role(store_id,array['owner']::public.app_role[])) with check(public.has_store_role(store_id,array['owner']::public.app_role[]));

create or replace function public.complete_sale(p_sale_id uuid) returns public.sales
language plpgsql security definer set search_path='' as $$
declare v_sale public.sales; v_item public.sale_items; v_stock integer; v_cost numeric(12,2);
begin
 select * into v_sale from public.sales where id=p_sale_id for update;
 if v_sale.id is null or not public.has_store_role(v_sale.store_id,array['owner','manager','cashier']::public.app_role[]) then raise exception '無權完成此銷售單'; end if;
 if v_sale.status<>'draft' then raise exception '銷售單不是草稿狀態'; end if;
 if not exists(select 1 from public.sale_items where sale_id=p_sale_id) then raise exception '銷售單沒有商品'; end if;
 for v_item in select * from public.sale_items where sale_id=p_sale_id loop
   perform 1 from public.product_variants where id=v_item.variant_id for update;
   select coalesce(cost,0) into v_cost from public.product_costs where variant_id=v_item.variant_id;
   insert into public.sale_item_costs(sale_item_id,store_id,unit_cost) values(v_item.id,v_sale.store_id,coalesce(v_cost,0))
   on conflict(sale_item_id) do update set unit_cost=excluded.unit_cost;
   select coalesce(sum(quantity),0)::integer into v_stock from public.stock_movements where store_id=v_sale.store_id and variant_id=v_item.variant_id;
   if v_stock<v_item.quantity then raise exception '庫存不足：規格 % 僅剩 % 件',v_item.variant_id,v_stock; end if;
   insert into public.stock_movements(store_id,variant_id,movement_type,quantity,reference_type,reference_id,created_by)
   values(v_sale.store_id,v_item.variant_id,'sale',-v_item.quantity,'sale',v_sale.id,auth.uid());
 end loop;
 update public.sales set status='completed',completed_at=now(),subtotal=(select coalesce(sum(quantity*unit_price),0) from public.sale_items where sale_id=p_sale_id),total=(select coalesce(sum(quantity*unit_price),0) from public.sale_items where sale_id=p_sale_id)-discount where id=p_sale_id returning * into v_sale;
 insert into public.audit_log(store_id,actor_id,action,entity_type,entity_id) values(v_sale.store_id,auth.uid(),'complete','sale',v_sale.id);
 return v_sale;
end $$;
alter table public.sale_items drop column unit_cost;
