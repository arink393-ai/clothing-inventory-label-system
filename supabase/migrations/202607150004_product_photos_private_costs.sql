-- 商品照片使用私人 Storage；成本拆到只有店主可讀的資料表。
alter table public.products add column image_path text;

create table public.product_costs (
  variant_id uuid primary key references public.product_variants(id) on delete cascade,
  store_id uuid not null references public.stores(id) on delete cascade,
  cost numeric(12,2) not null default 0 check(cost>=0),
  updated_by uuid references auth.users(id), updated_at timestamptz not null default now()
);
insert into public.product_costs(variant_id,store_id,cost)
select id,store_id,cost from public.product_variants;
alter table public.product_costs enable row level security;
create policy "owner reads costs" on public.product_costs for select using(public.has_store_role(store_id,array['owner']::public.app_role[]));
create policy "owner manages costs" on public.product_costs for all using(public.has_store_role(store_id,array['owner']::public.app_role[])) with check(public.has_store_role(store_id,array['owner']::public.app_role[]));

alter table public.sale_items alter column unit_cost set default 0;
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
   update public.sale_items set unit_cost=coalesce(v_cost,0) where id=v_item.id;
   select coalesce(sum(quantity),0)::integer into v_stock from public.stock_movements where store_id=v_sale.store_id and variant_id=v_item.variant_id;
   if v_stock<v_item.quantity then raise exception '庫存不足：規格 % 僅剩 % 件',v_item.variant_id,v_stock; end if;
   insert into public.stock_movements(store_id,variant_id,movement_type,quantity,reference_type,reference_id,created_by)
   values(v_sale.store_id,v_item.variant_id,'sale',-v_item.quantity,'sale',v_sale.id,auth.uid());
 end loop;
 update public.sales set status='completed',completed_at=now(),subtotal=(select coalesce(sum(quantity*unit_price),0) from public.sale_items where sale_id=p_sale_id),total=(select coalesce(sum(quantity*unit_price),0) from public.sale_items where sale_id=p_sale_id)-discount where id=p_sale_id returning * into v_sale;
 insert into public.audit_log(store_id,actor_id,action,entity_type,entity_id) values(v_sale.store_id,auth.uid(),'complete','sale',v_sale.id);
 return v_sale;
end $$;
alter table public.product_variants drop column cost;

insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values('product-images','product-images',false,5242880,array['image/jpeg','image/png','image/webp','image/heic'])
on conflict(id) do update set public=false,file_size_limit=excluded.file_size_limit,allowed_mime_types=excluded.allowed_mime_types;
create policy "members view product images" on storage.objects for select to authenticated
using(bucket_id='product-images' and public.is_store_member(((storage.foldername(name))[1])::uuid));
create policy "stock roles upload product images" on storage.objects for insert to authenticated
with check(bucket_id='product-images' and public.has_store_role(((storage.foldername(name))[1])::uuid,array['owner','manager','stock_clerk']::public.app_role[]));
create policy "stock roles update product images" on storage.objects for update to authenticated
using(bucket_id='product-images' and public.has_store_role(((storage.foldername(name))[1])::uuid,array['owner','manager','stock_clerk']::public.app_role[]));
create policy "stock roles delete product images" on storage.objects for delete to authenticated
using(bucket_id='product-images' and public.has_store_role(((storage.foldername(name))[1])::uuid,array['owner','manager','stock_clerk']::public.app_role[]));
