-- 幸せ服飾 ERP 第一版資料庫
create extension if not exists pgcrypto;

create type public.app_role as enum ('owner','manager','cashier','stock_clerk');
create type public.document_status as enum ('draft','completed','voided');
create type public.movement_type as enum ('opening','purchase','sale','sale_return','adjustment');

create table public.stores (
  id uuid primary key default gen_random_uuid(), name text not null,
  currency text not null default 'TWD', timezone text not null default 'Asia/Taipei',
  created_at timestamptz not null default now()
);
create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null default '', created_at timestamptz not null default now()
);
create table public.store_members (
  store_id uuid not null references public.stores(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  role public.app_role not null, active boolean not null default true,
  primary key(store_id,user_id)
);
create table public.categories (
  id uuid primary key default gen_random_uuid(), store_id uuid not null references public.stores(id) on delete cascade,
  name text not null, code text not null, created_at timestamptz not null default now(),
  unique(store_id,name), unique(store_id,code)
);
create table public.products (
  id uuid primary key default gen_random_uuid(), store_id uuid not null references public.stores(id) on delete cascade,
  category_id uuid references public.categories(id), sku text not null, name text not null,
  description text not null default '', active boolean not null default true,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(), unique(store_id,sku)
);
create table public.product_variants (
  id uuid primary key default gen_random_uuid(), store_id uuid not null references public.stores(id) on delete cascade,
  product_id uuid not null references public.products(id) on delete cascade, sku text not null, barcode text,
  color text not null default '', size text not null default '', price numeric(12,2) not null check(price>=0),
  cost numeric(12,2) not null default 0 check(cost>=0), reorder_point integer not null default 0 check(reorder_point>=0),
  active boolean not null default true, unique(store_id,sku), unique(store_id,barcode)
);
create table public.customers (
  id uuid primary key default gen_random_uuid(), store_id uuid not null references public.stores(id) on delete cascade,
  name text not null, phone text, email text, points integer not null default 0, created_at timestamptz not null default now()
);
create table public.suppliers (
  id uuid primary key default gen_random_uuid(), store_id uuid not null references public.stores(id) on delete cascade,
  name text not null, phone text, note text not null default '', created_at timestamptz not null default now()
);
create table public.purchases (
  id uuid primary key default gen_random_uuid(), store_id uuid not null references public.stores(id),
  document_no text not null, supplier_id uuid references public.suppliers(id), status public.document_status not null default 'draft',
  note text not null default '', completed_at timestamptz, created_by uuid not null references auth.users(id), created_at timestamptz not null default now(), unique(store_id,document_no)
);
create table public.purchase_items (
  id uuid primary key default gen_random_uuid(), purchase_id uuid not null references public.purchases(id) on delete cascade,
  variant_id uuid not null references public.product_variants(id), quantity integer not null check(quantity>0), unit_cost numeric(12,2) not null check(unit_cost>=0)
);
create table public.sales (
  id uuid primary key default gen_random_uuid(), store_id uuid not null references public.stores(id),
  document_no text not null, customer_id uuid references public.customers(id), status public.document_status not null default 'draft',
  payment_method text not null default 'cash', subtotal numeric(12,2) not null default 0, discount numeric(12,2) not null default 0,
  total numeric(12,2) not null default 0, completed_at timestamptz, created_by uuid not null references auth.users(id), created_at timestamptz not null default now(), unique(store_id,document_no)
);
create table public.sale_items (
  id uuid primary key default gen_random_uuid(), sale_id uuid not null references public.sales(id) on delete cascade,
  variant_id uuid not null references public.product_variants(id), quantity integer not null check(quantity>0),
  unit_price numeric(12,2) not null check(unit_price>=0), unit_cost numeric(12,2) not null check(unit_cost>=0)
);
create table public.stock_movements (
  id uuid primary key default gen_random_uuid(), store_id uuid not null references public.stores(id),
  variant_id uuid not null references public.product_variants(id), movement_type public.movement_type not null,
  quantity integer not null check(quantity<>0), reference_type text not null, reference_id uuid,
  note text not null default '', created_by uuid not null references auth.users(id), created_at timestamptz not null default now()
);
create index stock_movements_variant_time on public.stock_movements(store_id,variant_id,created_at desc);
create view public.inventory_balances with (security_invoker=true) as
  select store_id,variant_id,coalesce(sum(quantity),0)::integer as quantity
  from public.stock_movements group by store_id,variant_id;
create table public.audit_log (
  id bigint generated always as identity primary key, store_id uuid not null references public.stores(id),
  actor_id uuid references auth.users(id), action text not null, entity_type text not null, entity_id uuid,
  details jsonb not null default '{}', created_at timestamptz not null default now()
);

create or replace function public.is_store_member(p_store uuid) returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.store_members m where m.store_id=p_store and m.user_id=auth.uid() and m.active)
$$;
create or replace function public.has_store_role(p_store uuid,p_roles public.app_role[]) returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.store_members m where m.store_id=p_store and m.user_id=auth.uid() and m.active and m.role=any(p_roles))
$$;

alter table public.stores enable row level security; alter table public.profiles enable row level security;
alter table public.store_members enable row level security; alter table public.categories enable row level security;
alter table public.products enable row level security; alter table public.product_variants enable row level security;
alter table public.customers enable row level security; alter table public.suppliers enable row level security;
alter table public.purchases enable row level security; alter table public.purchase_items enable row level security;
alter table public.sales enable row level security; alter table public.sale_items enable row level security;
alter table public.stock_movements enable row level security; alter table public.audit_log enable row level security;

create policy "own profile" on public.profiles for select using(id=auth.uid());
create policy "member stores" on public.stores for select using(public.is_store_member(id));
create policy "member list" on public.store_members for select using(public.is_store_member(store_id));
create policy "owner manages members" on public.store_members for all using(public.has_store_role(store_id,array['owner']::public.app_role[])) with check(public.has_store_role(store_id,array['owner']::public.app_role[]));
create policy "member reads categories" on public.categories for select using(public.is_store_member(store_id));
create policy "stock roles manage categories" on public.categories for all using(public.has_store_role(store_id,array['owner','manager','stock_clerk']::public.app_role[])) with check(public.has_store_role(store_id,array['owner','manager','stock_clerk']::public.app_role[]));
create policy "member reads products" on public.products for select using(public.is_store_member(store_id));
create policy "stock roles manage products" on public.products for all using(public.has_store_role(store_id,array['owner','manager','stock_clerk']::public.app_role[])) with check(public.has_store_role(store_id,array['owner','manager','stock_clerk']::public.app_role[]));
create policy "member reads variants" on public.product_variants for select using(public.is_store_member(store_id));
create policy "stock roles manage variants" on public.product_variants for all using(public.has_store_role(store_id,array['owner','manager','stock_clerk']::public.app_role[])) with check(public.has_store_role(store_id,array['owner','manager','stock_clerk']::public.app_role[]));
create policy "member reads customers" on public.customers for select using(public.is_store_member(store_id));
create policy "sales roles manage customers" on public.customers for all using(public.has_store_role(store_id,array['owner','manager','cashier']::public.app_role[])) with check(public.has_store_role(store_id,array['owner','manager','cashier']::public.app_role[]));
create policy "member reads suppliers" on public.suppliers for select using(public.is_store_member(store_id));
create policy "stock roles manage suppliers" on public.suppliers for all using(public.has_store_role(store_id,array['owner','manager','stock_clerk']::public.app_role[])) with check(public.has_store_role(store_id,array['owner','manager','stock_clerk']::public.app_role[]));
create policy "member reads purchases" on public.purchases for select using(public.is_store_member(store_id));
create policy "stock roles manage purchases" on public.purchases for all using(public.has_store_role(store_id,array['owner','manager','stock_clerk']::public.app_role[])) with check(public.has_store_role(store_id,array['owner','manager','stock_clerk']::public.app_role[]));
create policy "purchase item access" on public.purchase_items for all using(exists(select 1 from public.purchases p where p.id=purchase_id and public.has_store_role(p.store_id,array['owner','manager','stock_clerk']::public.app_role[]))) with check(exists(select 1 from public.purchases p where p.id=purchase_id and public.has_store_role(p.store_id,array['owner','manager','stock_clerk']::public.app_role[])));
create policy "member reads sales" on public.sales for select using(public.is_store_member(store_id));
create policy "sales roles manage sales" on public.sales for all using(public.has_store_role(store_id,array['owner','manager','cashier']::public.app_role[])) with check(public.has_store_role(store_id,array['owner','manager','cashier']::public.app_role[]));
create policy "sale item access" on public.sale_items for all using(exists(select 1 from public.sales s where s.id=sale_id and public.has_store_role(s.store_id,array['owner','manager','cashier']::public.app_role[]))) with check(exists(select 1 from public.sales s where s.id=sale_id and public.has_store_role(s.store_id,array['owner','manager','cashier']::public.app_role[])));
create policy "member reads movements" on public.stock_movements for select using(public.is_store_member(store_id));
create policy "stock roles adjust" on public.stock_movements for insert with check(public.has_store_role(store_id,array['owner','manager','stock_clerk']::public.app_role[]) and created_by=auth.uid());
create policy "managers read audit" on public.audit_log for select using(public.has_store_role(store_id,array['owner','manager']::public.app_role[]));

-- 銷售完成：鎖定商品規格、再次確認庫存，再同一交易扣庫存。
create or replace function public.complete_sale(p_sale_id uuid) returns public.sales
language plpgsql security definer set search_path='' as $$
declare v_sale public.sales; v_item public.sale_items; v_stock integer;
begin
 select * into v_sale from public.sales where id=p_sale_id for update;
 if v_sale.id is null or not public.has_store_role(v_sale.store_id,array['owner','manager','cashier']::public.app_role[]) then raise exception '無權完成此銷售單'; end if;
 if v_sale.status<>'draft' then raise exception '銷售單不是草稿狀態'; end if;
 if not exists(select 1 from public.sale_items where sale_id=p_sale_id) then raise exception '銷售單沒有商品'; end if;
 for v_item in select * from public.sale_items where sale_id=p_sale_id loop
   perform 1 from public.product_variants where id=v_item.variant_id for update;
   select coalesce(sum(quantity),0)::integer into v_stock from public.stock_movements where store_id=v_sale.store_id and variant_id=v_item.variant_id;
   if v_stock<v_item.quantity then raise exception '庫存不足：規格 % 僅剩 % 件',v_item.variant_id,v_stock; end if;
   insert into public.stock_movements(store_id,variant_id,movement_type,quantity,reference_type,reference_id,created_by)
   values(v_sale.store_id,v_item.variant_id,'sale',-v_item.quantity,'sale',v_sale.id,auth.uid());
 end loop;
 update public.sales set status='completed',completed_at=now(),subtotal=(select coalesce(sum(quantity*unit_price),0) from public.sale_items where sale_id=p_sale_id),total=(select coalesce(sum(quantity*unit_price),0) from public.sale_items where sale_id=p_sale_id)-discount where id=p_sale_id returning * into v_sale;
 insert into public.audit_log(store_id,actor_id,action,entity_type,entity_id) values(v_sale.store_id,auth.uid(),'complete','sale',v_sale.id);
 return v_sale;
end $$;
revoke all on function public.complete_sale(uuid) from public; grant execute on function public.complete_sale(uuid) to authenticated;
