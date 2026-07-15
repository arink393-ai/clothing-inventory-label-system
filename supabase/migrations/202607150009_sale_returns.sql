-- 依原銷貨單辦理單項／部分退貨，退款、回庫與會員點數在同一交易完成。
create table public.sale_returns (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references public.stores(id) on delete cascade,
  sale_id uuid not null references public.sales(id),
  document_no text not null,
  refund_method text not null check (refund_method in ('original','cash','card','transfer')),
  refund_amount numeric(12,2) not null default 0 check (refund_amount >= 0),
  reason text not null,
  points_restored integer not null default 0 check (points_restored >= 0),
  points_reversed integer not null default 0 check (points_reversed >= 0),
  completed_at timestamptz not null default now(),
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  unique(store_id,document_no)
);

create table public.sale_return_items (
  id uuid primary key default gen_random_uuid(),
  return_id uuid not null references public.sale_returns(id) on delete cascade,
  sale_item_id uuid not null references public.sale_items(id),
  variant_id uuid not null references public.product_variants(id),
  quantity integer not null check (quantity > 0),
  gross_amount numeric(12,2) not null check (gross_amount >= 0),
  refund_amount numeric(12,2) not null check (refund_amount >= 0)
);

create index sale_returns_sale_time on public.sale_returns(sale_id,completed_at desc);
create index sale_return_items_sale_item on public.sale_return_items(sale_item_id);

alter table public.sale_returns enable row level security;
alter table public.sale_return_items enable row level security;

create policy "members read sale returns" on public.sale_returns for select
using(public.is_store_member(store_id));

create policy "members read sale return items" on public.sale_return_items for select
using(exists(
  select 1 from public.sale_returns r
  where r.id=return_id and public.is_store_member(r.store_id)
));

revoke insert,update,delete on public.sale_returns from authenticated,anon;
revoke insert,update,delete on public.sale_return_items from authenticated,anon;
grant select on public.sale_returns to authenticated;
grant select on public.sale_return_items to authenticated;

create or replace function public.complete_sale_return(
  p_sale_id uuid,
  p_refund_method text,
  p_reason text,
  p_items jsonb
) returns jsonb
language plpgsql security definer set search_path='' as $$
declare
  v_sale public.sales;
  v_item jsonb;
  v_sale_item public.sale_items;
  v_return uuid;
  v_document text;
  v_sale_item_id uuid;
  v_qty integer;
  v_returned integer;
  v_ratio numeric;
  v_line_gross numeric(12,2);
  v_line_refund numeric(12,2);
  v_refund numeric(12,2):=0;
  v_gross numeric(12,2):=0;
  v_previous_refund numeric(12,2):=0;
  v_previous_gross numeric(12,2):=0;
  v_previous_restored integer:=0;
  v_previous_reversed integer:=0;
  v_target_restored integer:=0;
  v_target_reversed integer:=0;
  v_points_restored integer:=0;
  v_points_requested integer:=0;
  v_points_reversed integer:=0;
  v_customer_points integer:=0;
  v_spend numeric(12,2);
  v_seen uuid[]:=array[]::uuid[];
  v_lines integer:=0;
  v_units integer:=0;
begin
  select * into v_sale from public.sales where id=p_sale_id for update;
  if v_sale.id is null or v_sale.status<>'completed' then raise exception '找不到可退貨的已完成銷貨單'; end if;
  if not public.has_store_role(v_sale.store_id,array['owner','manager','cashier']::public.app_role[]) then raise exception '您沒有辦理退貨的權限'; end if;
  if p_refund_method not in ('original','cash','card','transfer') then raise exception '退款方式不正確'; end if;
  if char_length(trim(coalesce(p_reason,'')))<2 then raise exception '請填寫退貨原因'; end if;
  if jsonb_typeof(p_items)<>'array' or jsonb_array_length(p_items)=0 then raise exception '請至少選擇一項退貨商品'; end if;

  select coalesce(sum(refund_amount),0),coalesce(sum(points_restored),0)::integer,coalesce(sum(points_reversed),0)::integer
  into v_previous_refund,v_previous_restored,v_previous_reversed
  from public.sale_returns where sale_id=v_sale.id;

  select coalesce(sum(ri.gross_amount),0) into v_previous_gross
  from public.sale_return_items ri join public.sale_returns r on r.id=ri.return_id
  where r.sale_id=v_sale.id;

  v_ratio:=case when v_sale.subtotal>0 then v_sale.total/v_sale.subtotal else 0 end;
  v_document:=format('RT-%s-%s',to_char(clock_timestamp(),'YYYYMMDDHH24MISS'),upper(substr(replace(gen_random_uuid()::text,'-',''),1,4)));
  insert into public.sale_returns(store_id,sale_id,document_no,refund_method,reason,created_by)
  values(v_sale.store_id,v_sale.id,v_document,p_refund_method,trim(p_reason),auth.uid()) returning id into v_return;

  for v_item in select value from jsonb_array_elements(p_items) loop
    v_sale_item_id:=(v_item->>'sale_item_id')::uuid;
    v_qty:=(v_item->>'quantity')::integer;
    if v_sale_item_id=any(v_seen) then raise exception '退貨清單包含重複商品'; end if;
    v_seen:=array_append(v_seen,v_sale_item_id);
    if v_qty<=0 then raise exception '退貨數量必須大於 0'; end if;
    select * into v_sale_item from public.sale_items where id=v_sale_item_id and sale_id=v_sale.id for update;
    if v_sale_item.id is null then raise exception '退貨清單包含不屬於原銷貨單的商品'; end if;
    select coalesce(sum(quantity),0)::integer into v_returned from public.sale_return_items where sale_item_id=v_sale_item.id;
    if v_returned+v_qty>v_sale_item.quantity then raise exception '退貨數量超過原購買數量'; end if;
    v_line_gross:=round(v_sale_item.unit_price*v_qty,2);
    v_line_refund:=least(round(v_line_gross*v_ratio,2),greatest(v_sale.total-v_previous_refund-v_refund,0));
    insert into public.sale_return_items(return_id,sale_item_id,variant_id,quantity,gross_amount,refund_amount)
    values(v_return,v_sale_item.id,v_sale_item.variant_id,v_qty,v_line_gross,v_line_refund);
    insert into public.stock_movements(store_id,variant_id,movement_type,quantity,reference_type,reference_id,note,created_by)
    values(v_sale.store_id,v_sale_item.variant_id,'sale_return',v_qty,'sale_return',v_return,trim(p_reason),auth.uid());
    v_gross:=v_gross+v_line_gross;
    v_refund:=v_refund+v_line_refund;
    v_lines:=v_lines+1;
    v_units:=v_units+v_qty;
  end loop;

  if v_sale.customer_id is not null then
    select points_spend_amount into v_spend from public.stores where id=v_sale.store_id;
    if v_sale.subtotal>0 and v_sale.points_redeemed>0 then
      v_target_restored:=floor(v_sale.points_redeemed*least(1,(v_previous_gross+v_gross)/v_sale.subtotal));
      v_points_restored:=greatest(v_target_restored-v_previous_restored,0);
    end if;
    if v_sale.points_earned>0 then
      v_target_reversed:=greatest(v_sale.points_earned-floor(greatest(v_sale.total-v_previous_refund-v_refund,0)/v_spend),0);
      v_points_requested:=greatest(v_target_reversed-v_previous_reversed,0);
    end if;
    select points into v_customer_points from public.customers where id=v_sale.customer_id for update;
    if v_points_restored>0 then
      v_customer_points:=v_customer_points+v_points_restored;
      insert into public.customer_points_ledger(store_id,customer_id,sale_id,points,balance_after,entry_type,note,created_by)
      values(v_sale.store_id,v_sale.customer_id,v_sale.id,v_points_restored,v_customer_points,'adjustment',format('退貨單 %s：退回原折抵點數',v_document),auth.uid());
    end if;
    v_points_reversed:=least(v_points_requested,v_customer_points);
    if v_points_reversed>0 then
      v_customer_points:=v_customer_points-v_points_reversed;
      insert into public.customer_points_ledger(store_id,customer_id,sale_id,points,balance_after,entry_type,note,created_by)
      values(v_sale.store_id,v_sale.customer_id,v_sale.id,-v_points_reversed,v_customer_points,'adjustment',format('退貨單 %s：扣回消費贈點',v_document),auth.uid());
    end if;
    update public.customers set points=v_customer_points where id=v_sale.customer_id;
  end if;

  update public.sale_returns set refund_amount=v_refund,points_restored=v_points_restored,points_reversed=v_points_reversed where id=v_return;
  insert into public.audit_log(store_id,actor_id,action,entity_type,entity_id,details)
  values(v_sale.store_id,auth.uid(),'complete','sale_return',v_return,jsonb_build_object('document_no',v_document,'sale_id',v_sale.id,'lines',v_lines,'units',v_units,'refund',v_refund,'points_restored',v_points_restored,'points_reversed',v_points_reversed));
  return jsonb_build_object('return_id',v_return,'document_no',v_document,'refund_amount',v_refund,'lines',v_lines,'units',v_units,'points_restored',v_points_restored,'points_reversed',v_points_reversed);
end $$;

revoke all on function public.complete_sale_return(uuid,text,text,jsonb) from public;
grant execute on function public.complete_sale_return(uuid,text,text,jsonb) to authenticated;
