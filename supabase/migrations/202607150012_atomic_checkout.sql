-- 結帳建立、商品明細、扣庫存與會員點數全部在同一個資料庫交易完成。
-- checkout_request_id 讓瀏覽器重送同一筆請求時只會取得原銷售單，不會重複扣庫存。
alter table public.sales add column checkout_request_id uuid;

create unique index sales_store_checkout_request_unique
on public.sales(store_id,checkout_request_id)
where checkout_request_id is not null;

create index sales_store_status_completed_time
on public.sales(store_id,status,completed_at desc);

create index sale_returns_store_completed_time
on public.sale_returns(store_id,completed_at desc);

create or replace function public.create_and_complete_sale(
  p_store_id uuid,
  p_request_id uuid,
  p_payment_method text,
  p_discount numeric,
  p_customer_id uuid,
  p_points_to_redeem integer,
  p_items jsonb
) returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare
  v_role public.app_role;
  v_existing public.sales;
  v_sale public.sales;
  v_item jsonb;
  v_variant_id uuid;
  v_quantity integer;
  v_seen uuid[]:=array[]::uuid[];
  v_locked integer:=0;
  v_subtotal numeric(12,2):=0;
  v_document text;
begin
  select role into v_role
  from public.store_members
  where store_id=p_store_id and user_id=auth.uid() and active;

  if v_role is null or v_role not in ('owner','manager','cashier') then
    raise exception '您沒有銷售結帳權限';
  end if;
  if p_request_id is null then raise exception '結帳識別碼不可空白'; end if;
  if p_payment_method not in ('cash','card','transfer','line_transfer') then raise exception '付款方式不正確'; end if;
  if p_discount is null or p_discount<0 then raise exception '折扣金額不可小於 0'; end if;
  if p_points_to_redeem is null or p_points_to_redeem<0 then raise exception '折抵點數不可小於 0'; end if;
  if jsonb_typeof(p_items)<>'array' or jsonb_array_length(p_items)=0 then raise exception '請至少選擇一項商品'; end if;
  if jsonb_array_length(p_items)>200 then raise exception '單筆銷售最多 200 項商品'; end if;

  -- 相同門市與識別碼依序處理，避免兩個同時送出的請求都建立訂單。
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(p_store_id::text || ':' || p_request_id::text,0)
  );

  select * into v_existing
  from public.sales
  where store_id=p_store_id and checkout_request_id=p_request_id;
  if found then
    if v_existing.status='completed' then
      return jsonb_build_object(
        'sale_id',v_existing.id,
        'document_no',v_existing.document_no,
        'total',v_existing.total,
        'replayed',true
      );
    end if;
    raise exception '這筆結帳正在處理中，請勿重複送出';
  end if;

  for v_item in select value from jsonb_array_elements(p_items) loop
    v_variant_id:=(v_item->>'variant_id')::uuid;
    v_quantity:=(v_item->>'quantity')::integer;
    if v_variant_id is null then raise exception '結帳商品資料不完整'; end if;
    if v_variant_id=any(v_seen) then raise exception '購物車包含重複商品'; end if;
    if v_quantity is null or v_quantity<=0 then raise exception '商品數量必須大於 0'; end if;
    if v_quantity>9999 then raise exception '單項商品數量過大'; end if;
    v_seen:=array_append(v_seen,v_variant_id);
  end loop;

  -- 以固定順序先鎖住全部規格，降低兩台收銀機同時結帳時的鎖定衝突。
  perform variant.id
  from public.product_variants variant
  where variant.store_id=p_store_id and variant.id=any(v_seen) and variant.active
  order by variant.id
  for update;
  get diagnostics v_locked = row_count;
  if v_locked<>array_length(v_seen,1) then raise exception '部分商品不存在或已停售，請重新整理'; end if;

  select coalesce(sum(variant.price*item.quantity),0)
  into v_subtotal
  from jsonb_to_recordset(p_items) as item(variant_id uuid,quantity integer)
  join public.product_variants variant
    on variant.id=item.variant_id and variant.store_id=p_store_id and variant.active;
  if p_discount>v_subtotal then raise exception '折扣不能大於商品小計'; end if;
  if p_points_to_redeem>0 and p_customer_id is null then raise exception '使用點數前請先選擇會員'; end if;

  v_document:=format(
    'SO-%s-%s',
    to_char(clock_timestamp(),'YYYYMMDDHH24MISS'),
    upper(substr(replace(gen_random_uuid()::text,'-',''),1,4))
  );

  insert into public.sales(
    store_id,document_no,checkout_request_id,payment_method,discount,subtotal,total,
    customer_id,points_redeemed,created_by
  ) values(
    p_store_id,v_document,p_request_id,p_payment_method,p_discount,v_subtotal,
    v_subtotal-p_discount,p_customer_id,p_points_to_redeem,auth.uid()
  ) returning * into v_sale;

  insert into public.sale_items(sale_id,variant_id,quantity,unit_price)
  select v_sale.id,variant.id,item.quantity,variant.price
  from jsonb_to_recordset(p_items) as item(variant_id uuid,quantity integer)
  join public.product_variants variant
    on variant.id=item.variant_id and variant.store_id=p_store_id;

  select * into v_sale from public.complete_sale(v_sale.id);

  return jsonb_build_object(
    'sale_id',v_sale.id,
    'document_no',v_sale.document_no,
    'total',v_sale.total,
    'replayed',false
  );
end
$$;

revoke all on function public.create_and_complete_sale(uuid,uuid,text,numeric,uuid,integer,jsonb) from public;
grant execute on function public.create_and_complete_sale(uuid,uuid,text,numeric,uuid,integer,jsonb) to authenticated;

-- 正式銷售只能經過原子化函式；前端仍保留銷售與明細的讀取權限。
revoke insert,update,delete on public.sales from authenticated,anon;
revoke insert,update,delete on public.sale_items from authenticated,anon;
revoke execute on function public.complete_sale(uuid) from authenticated;
grant select on public.sales to authenticated;
grant select on public.sale_items to authenticated;
