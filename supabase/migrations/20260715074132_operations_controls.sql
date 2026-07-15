-- 營運控管、交班、稽核、寄賣與設備校正。
create schema if not exists private;

alter table public.products
  add column is_consignment boolean not null default false,
  add column consignor_name text,
  add column consignment_commission_percent numeric(5,2);
alter table public.products add constraint products_consignment_fields_check check (
  (not is_consignment and consignor_name is null and consignment_commission_percent is null)
  or
  (is_consignment and char_length(trim(coalesce(consignor_name,'')))>0
    and consignment_commission_percent between 0 and 100)
);

alter table public.sales
  add column transfer_account_last4 text,
  add column payment_note text not null default '',
  add column payment_confirmed_by text,
  add column approval_required boolean not null default false,
  add column approval_method text;
alter table public.sales add constraint sales_transfer_last4_check check (
  transfer_account_last4 is null or transfer_account_last4 ~ '^[0-9]{3,5}$'
);

alter table public.sale_returns
  add column approval_required boolean not null default false,
  add column approval_method text;

alter table public.purchases
  add column supplier_document_no text,
  add column import_fingerprint text;
create unique index purchases_store_supplier_document_unique
  on public.purchases(store_id,lower(supplier_document_no))
  where supplier_document_no is not null and trim(supplier_document_no)<>'';
create unique index purchases_store_import_fingerprint_unique
  on public.purchases(store_id,import_fingerprint)
  where import_fingerprint is not null;

create table public.store_approval_settings (
  store_id uuid primary key references public.stores(id) on delete cascade,
  discount_threshold_percent numeric(5,2) not null default 20 check(discount_threshold_percent between 0 and 100),
  return_threshold_amount numeric(12,2) not null default 3000 check(return_threshold_amount>=0),
  manager_pin_hash text,
  updated_by uuid references auth.users(id),
  updated_at timestamptz not null default now()
);
alter table public.store_approval_settings enable row level security;
create policy "owners read approval settings" on public.store_approval_settings for select to authenticated
  using((select public.has_store_role(store_id,array['owner']::public.app_role[])));
revoke all on public.store_approval_settings from anon,authenticated;
grant select(store_id,discount_threshold_percent,return_threshold_amount,updated_at)
  on public.store_approval_settings to authenticated;

create table public.cash_shifts (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references public.stores(id) on delete cascade,
  status text not null default 'open' check(status in ('open','closed')),
  opening_cash numeric(12,2) not null check(opening_cash>=0),
  cash_sales numeric(12,2) not null default 0,
  card_sales numeric(12,2) not null default 0,
  transfer_sales numeric(12,2) not null default 0,
  line_transfer_sales numeric(12,2) not null default 0,
  cash_refunds numeric(12,2) not null default 0,
  cash_expenses numeric(12,2) not null default 0,
  expected_cash numeric(12,2),
  closing_cash numeric(12,2),
  cash_difference numeric(12,2),
  opening_note text not null default '',
  closing_note text not null default '',
  opened_by uuid not null references auth.users(id),
  opened_at timestamptz not null default now(),
  closed_by uuid references auth.users(id),
  closed_at timestamptz,
  check((status='open' and closed_at is null) or (status='closed' and closed_at is not null))
);
create unique index cash_shifts_one_open_per_store on public.cash_shifts(store_id) where status='open';
create index cash_shifts_store_opened_time on public.cash_shifts(store_id,opened_at desc);
create index cash_shifts_opened_by on public.cash_shifts(opened_by);
create index cash_shifts_closed_by on public.cash_shifts(closed_by) where closed_by is not null;

create table public.cash_shift_expenses (
  id uuid primary key default gen_random_uuid(),
  shift_id uuid not null references public.cash_shifts(id) on delete cascade,
  store_id uuid not null references public.stores(id) on delete cascade,
  amount numeric(12,2) not null check(amount>0),
  note text not null check(char_length(trim(note))>=2),
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now()
);
create index cash_shift_expenses_shift_time on public.cash_shift_expenses(shift_id,created_at desc);
create index cash_shift_expenses_store_time on public.cash_shift_expenses(store_id,created_at desc);
create index cash_shift_expenses_created_by on public.cash_shift_expenses(created_by);

alter table public.cash_shifts enable row level security;
alter table public.cash_shift_expenses enable row level security;
create policy "sales roles read shifts" on public.cash_shifts for select to authenticated
  using((select public.has_store_role(store_id,array['owner','manager','cashier']::public.app_role[])));
create policy "sales roles read shift expenses" on public.cash_shift_expenses for select to authenticated
  using((select public.has_store_role(store_id,array['owner','manager','cashier']::public.app_role[])));
revoke all on public.cash_shifts,public.cash_shift_expenses from anon,authenticated;
grant select on public.cash_shifts,public.cash_shift_expenses to authenticated;

create table public.label_printer_profiles (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references public.stores(id) on delete cascade,
  name text not null check(char_length(trim(name)) between 1 and 60),
  model text not null default 'B21',
  label_width_mm numeric(6,2) not null default 50 check(label_width_mm between 10 and 120),
  label_height_mm numeric(6,2) not null default 30 check(label_height_mm between 10 and 120),
  offset_x_mm numeric(6,2) not null default 0 check(offset_x_mm between -20 and 20),
  offset_y_mm numeric(6,2) not null default 0 check(offset_y_mm between -20 and 20),
  scale_percent numeric(6,2) not null default 100 check(scale_percent between 50 and 150),
  updated_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(store_id,name)
);
create index label_printer_profiles_updated_by on public.label_printer_profiles(updated_by);
alter table public.label_printer_profiles enable row level security;
create policy "stock roles read printer profiles" on public.label_printer_profiles for select to authenticated
  using((select public.has_store_role(store_id,array['owner','manager','stock_clerk']::public.app_role[])));
create policy "stock roles create printer profiles" on public.label_printer_profiles for insert to authenticated
  with check((select public.has_store_role(store_id,array['owner','manager','stock_clerk']::public.app_role[])) and updated_by=(select auth.uid()));
create policy "stock roles update printer profiles" on public.label_printer_profiles for update to authenticated
  using((select public.has_store_role(store_id,array['owner','manager','stock_clerk']::public.app_role[])))
  with check((select public.has_store_role(store_id,array['owner','manager','stock_clerk']::public.app_role[])) and updated_by=(select auth.uid()));
create policy "managers delete printer profiles" on public.label_printer_profiles for delete to authenticated
  using((select public.has_store_role(store_id,array['owner','manager']::public.app_role[])));
revoke all on public.label_printer_profiles from anon,authenticated;
grant select,insert,update,delete on public.label_printer_profiles to authenticated;

create table public.sale_item_consignments (
  sale_item_id uuid primary key references public.sale_items(id) on delete cascade,
  store_id uuid not null references public.stores(id) on delete cascade,
  consignor_name text not null,
  commission_percent numeric(5,2) not null check(commission_percent between 0 and 100)
);
create index sale_item_consignments_store on public.sale_item_consignments(store_id);
alter table public.sale_item_consignments enable row level security;
create policy "managers read consignment snapshots" on public.sale_item_consignments for select to authenticated
  using((select public.has_store_role(store_id,array['owner','manager']::public.app_role[])));
revoke all on public.sale_item_consignments from anon,authenticated;
grant select on public.sale_item_consignments to authenticated;

create index audit_log_store_created_id on public.audit_log(store_id,created_at desc,id desc);
create index audit_log_actor_time on public.audit_log(actor_id,created_at desc) where actor_id is not null;
create index stock_movements_store_created_id on public.stock_movements(store_id,created_at desc,id desc);
create index sale_items_sale_id_idx on public.sale_items(sale_id);
create index purchase_items_purchase_id_idx on public.purchase_items(purchase_id);

create or replace function private.approval_method(p_store uuid,p_role public.app_role,p_pin text)
returns text language plpgsql security definer set search_path='' as $$
declare v_hash text;
begin
  if p_role in ('owner','manager') then return 'manager_role'; end if;
  select manager_pin_hash into v_hash from public.store_approval_settings where store_id=p_store;
  if v_hash is null then raise exception '此操作需要店長核准，請先由店主設定店長 PIN'; end if;
  if trim(coalesce(p_pin,''))='' or crypt(trim(p_pin),v_hash)<>v_hash then raise exception '店長 PIN 不正確'; end if;
  return 'manager_pin';
end $$;
revoke all on function private.approval_method(uuid,public.app_role,text) from public,anon,authenticated;

create or replace function public.get_approval_settings(p_store_id uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare v_role public.app_role; v_row public.store_approval_settings;
begin
  select role into v_role from public.store_members where store_id=p_store_id and user_id=auth.uid() and active;
  if v_role is null then raise exception '您不是此門市的有效人員'; end if;
  select * into v_row from public.store_approval_settings where store_id=p_store_id;
  return jsonb_build_object(
    'discount_threshold_percent',coalesce(v_row.discount_threshold_percent,20),
    'return_threshold_amount',coalesce(v_row.return_threshold_amount,3000),
    'pin_configured',v_row.manager_pin_hash is not null
  );
end $$;
revoke all on function public.get_approval_settings(uuid) from public,anon,authenticated;
grant execute on function public.get_approval_settings(uuid) to authenticated;

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
    case when trim(coalesce(p_manager_pin,''))<>'' then crypt(trim(p_manager_pin),gen_salt('bf')) else null end,
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

create or replace function public.open_cash_shift(p_store_id uuid,p_opening_cash numeric,p_note text default '')
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_shift public.cash_shifts;
begin
  if not public.has_store_role(p_store_id,array['owner','manager','cashier']::public.app_role[]) then raise exception '您沒有開班權限'; end if;
  if p_opening_cash<0 then raise exception '開班現金不可小於 0'; end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('cash-shift:'||p_store_id::text,0));
  if exists(select 1 from public.cash_shifts where store_id=p_store_id and status='open') then raise exception '此門市已有尚未結班的班次'; end if;
  insert into public.cash_shifts(store_id,opening_cash,opening_note,opened_by)
  values(p_store_id,p_opening_cash,trim(coalesce(p_note,'')),auth.uid()) returning * into v_shift;
  insert into public.audit_log(store_id,actor_id,action,entity_type,entity_id,details)
  values(p_store_id,auth.uid(),'open_shift','cash_shift',v_shift.id,jsonb_build_object('opening_cash',p_opening_cash));
  return to_jsonb(v_shift);
end $$;
revoke all on function public.open_cash_shift(uuid,numeric,text) from public,anon,authenticated;
grant execute on function public.open_cash_shift(uuid,numeric,text) to authenticated;

create or replace function public.add_cash_expense(p_shift_id uuid,p_amount numeric,p_note text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_shift public.cash_shifts; v_expense public.cash_shift_expenses;
begin
  select * into v_shift from public.cash_shifts where id=p_shift_id for update;
  if v_shift.id is null or v_shift.status<>'open' then raise exception '找不到尚未結班的班次'; end if;
  if not public.has_store_role(v_shift.store_id,array['owner','manager','cashier']::public.app_role[]) then raise exception '您沒有登記現金支出的權限'; end if;
  if p_amount<=0 then raise exception '現金支出必須大於 0'; end if;
  if char_length(trim(coalesce(p_note,'')))<2 then raise exception '請填寫現金支出原因'; end if;
  insert into public.cash_shift_expenses(shift_id,store_id,amount,note,created_by)
  values(v_shift.id,v_shift.store_id,p_amount,trim(p_note),auth.uid()) returning * into v_expense;
  insert into public.audit_log(store_id,actor_id,action,entity_type,entity_id,details)
  values(v_shift.store_id,auth.uid(),'cash_expense','cash_shift',v_shift.id,jsonb_build_object('expense_id',v_expense.id,'amount',p_amount,'note',trim(p_note)));
  return to_jsonb(v_expense);
end $$;
revoke all on function public.add_cash_expense(uuid,numeric,text) from public,anon,authenticated;
grant execute on function public.add_cash_expense(uuid,numeric,text) to authenticated;

create or replace function public.get_cash_shift_summary(p_shift_id uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare v_shift public.cash_shifts; v_cash numeric:=0; v_card numeric:=0; v_transfer numeric:=0; v_line numeric:=0; v_refunds numeric:=0; v_expenses numeric:=0;
begin
  select * into v_shift from public.cash_shifts where id=p_shift_id;
  if v_shift.id is null or not public.has_store_role(v_shift.store_id,array['owner','manager','cashier']::public.app_role[]) then raise exception '無權查看此班次'; end if;
  select
    coalesce(sum(total) filter(where payment_method='cash'),0),
    coalesce(sum(total) filter(where payment_method='card'),0),
    coalesce(sum(total) filter(where payment_method='transfer'),0),
    coalesce(sum(total) filter(where payment_method='line_transfer'),0)
  into v_cash,v_card,v_transfer,v_line from public.sales
  where store_id=v_shift.store_id and status='completed' and completed_at>=v_shift.opened_at and completed_at<coalesce(v_shift.closed_at,now());
  select coalesce(sum(refund_amount),0) into v_refunds from public.sale_returns r
  where r.store_id=v_shift.store_id and r.completed_at>=v_shift.opened_at and r.completed_at<coalesce(v_shift.closed_at,now())
    and (r.refund_method='cash' or (r.refund_method='original' and exists(select 1 from public.sales s where s.id=r.sale_id and s.payment_method='cash')));
  select coalesce(sum(amount),0) into v_expenses from public.cash_shift_expenses where shift_id=v_shift.id;
  return jsonb_build_object('shift',to_jsonb(v_shift),'cash_sales',v_cash,'card_sales',v_card,'transfer_sales',v_transfer,
    'line_transfer_sales',v_line,'cash_refunds',v_refunds,'cash_expenses',v_expenses,
    'expected_cash',v_shift.opening_cash+v_cash-v_refunds-v_expenses);
end $$;
revoke all on function public.get_cash_shift_summary(uuid) from public,anon,authenticated;
grant execute on function public.get_cash_shift_summary(uuid) to authenticated;

create or replace function public.close_cash_shift(p_shift_id uuid,p_actual_cash numeric,p_note text default '')
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_shift public.cash_shifts; v_summary jsonb; v_expected numeric;
begin
  select * into v_shift from public.cash_shifts where id=p_shift_id for update;
  if v_shift.id is null or v_shift.status<>'open' then raise exception '找不到尚未結班的班次'; end if;
  if not public.has_store_role(v_shift.store_id,array['owner','manager','cashier']::public.app_role[]) then raise exception '您沒有結班權限'; end if;
  if p_actual_cash<0 then raise exception '結班實際現金不可小於 0'; end if;
  v_summary:=public.get_cash_shift_summary(v_shift.id); v_expected:=(v_summary->>'expected_cash')::numeric;
  update public.cash_shifts set status='closed',cash_sales=(v_summary->>'cash_sales')::numeric,card_sales=(v_summary->>'card_sales')::numeric,
    transfer_sales=(v_summary->>'transfer_sales')::numeric,line_transfer_sales=(v_summary->>'line_transfer_sales')::numeric,
    cash_refunds=(v_summary->>'cash_refunds')::numeric,cash_expenses=(v_summary->>'cash_expenses')::numeric,
    expected_cash=v_expected,closing_cash=p_actual_cash,cash_difference=p_actual_cash-v_expected,
    closing_note=trim(coalesce(p_note,'')),closed_by=auth.uid(),closed_at=now()
  where id=v_shift.id returning * into v_shift;
  insert into public.audit_log(store_id,actor_id,action,entity_type,entity_id,details)
  values(v_shift.store_id,auth.uid(),'close_shift','cash_shift',v_shift.id,
    jsonb_build_object('expected_cash',v_expected,'actual_cash',p_actual_cash,'difference',p_actual_cash-v_expected));
  return to_jsonb(v_shift);
end $$;
revoke all on function public.close_cash_shift(uuid,numeric,text) from public,anon,authenticated;
grant execute on function public.close_cash_shift(uuid,numeric,text) to authenticated;

-- 新進貨入口：以 Excel 指紋或廠商單號阻擋重複入庫。
create or replace function public.receive_purchase(
  p_supplier_name text,p_supplier_document_no text,p_import_fingerprint text,p_note text,p_items jsonb
) returns jsonb language plpgsql security definer set search_path='' as $$
declare v_store uuid; v_existing public.purchases; v_result jsonb; v_purchase_id uuid;
begin
  select pv.store_id into v_store from jsonb_to_recordset(p_items) as i(variant_id uuid,quantity integer,unit_cost numeric)
  join public.product_variants pv on pv.id=i.variant_id limit 1;
  if v_store is null then raise exception '進貨清單不可為空'; end if;
  if not public.has_store_role(v_store,array['owner','manager','stock_clerk']::public.app_role[]) then raise exception '您沒有進貨入庫權限'; end if;
  if trim(coalesce(p_import_fingerprint,''))='' then raise exception '進貨防重複識別碼不可空白'; end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(v_store::text||':'||trim(p_import_fingerprint),0));
  select * into v_existing from public.purchases where store_id=v_store and import_fingerprint=trim(p_import_fingerprint);
  if found then return jsonb_build_object('purchase_id',v_existing.id,'document_no',v_existing.document_no,'duplicate',true,'lines',0,'units',0); end if;
  if trim(coalesce(p_supplier_document_no,''))<>'' and exists(
    select 1 from public.purchases where store_id=v_store and lower(supplier_document_no)=lower(trim(p_supplier_document_no))
  ) then raise exception '此廠商單號已入庫，請勿重複匯入'; end if;
  v_result:=public.receive_purchase(p_supplier_name,p_note,p_items);
  v_purchase_id:=(v_result->>'purchase_id')::uuid;
  update public.purchases set supplier_document_no=nullif(trim(coalesce(p_supplier_document_no,'')),''),
    import_fingerprint=trim(p_import_fingerprint) where id=v_purchase_id;
  return v_result||jsonb_build_object('duplicate',false,'supplier_document_no',nullif(trim(coalesce(p_supplier_document_no,'')),''));
end $$;
revoke all on function public.receive_purchase(text,text,jsonb) from public,anon,authenticated;
revoke all on function public.receive_purchase(text,text,text,text,jsonb) from public,anon,authenticated;
grant execute on function public.receive_purchase(text,text,text,text,jsonb) to authenticated;

-- 新點數入口：店主／店長可直接核准，收銀員需輸入店長 PIN。
create or replace function public.adjust_customer_points(p_customer_id uuid,p_delta integer,p_note text,p_manager_pin text default null)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_store uuid; v_role public.app_role; v_before integer; v_after integer; v_method text;
begin
  select c.store_id,c.points,m.role into v_store,v_before,v_role from public.customers c
  join public.store_members m on m.store_id=c.store_id and m.user_id=auth.uid() and m.active where c.id=p_customer_id for update of c;
  if v_store is null or v_role not in ('owner','manager','cashier') then raise exception '您沒有調整會員點數的權限'; end if;
  if p_delta=0 then raise exception '調整點數不可為 0'; end if;
  if char_length(trim(coalesce(p_note,'')))<2 then raise exception '請填寫調整原因'; end if;
  v_method:=private.approval_method(v_store,v_role,p_manager_pin);
  v_after:=v_before+p_delta; if v_after<0 then raise exception '會員點數不可小於 0'; end if;
  update public.customers set points=v_after where id=p_customer_id;
  insert into public.customer_points_ledger(store_id,customer_id,points,balance_after,entry_type,note,created_by)
  values(v_store,p_customer_id,p_delta,v_after,'adjustment',trim(p_note),auth.uid());
  insert into public.audit_log(store_id,actor_id,action,entity_type,entity_id,details)
  values(v_store,auth.uid(),'points_adjust','customer',p_customer_id,
    jsonb_build_object('before',v_before,'change',p_delta,'after',v_after,'note',trim(p_note),'approval_method',v_method));
  return jsonb_build_object('before',v_before,'after',v_after,'change',p_delta,'approval_method',v_method);
end $$;
revoke all on function public.adjust_customer_points(uuid,integer,text) from public,anon,authenticated;
revoke all on function public.adjust_customer_points(uuid,integer,text,text) from public,anon,authenticated;
grant execute on function public.adjust_customer_points(uuid,integer,text,text) to authenticated;

-- 新退貨入口包住既有原子退貨；若核准失敗，整筆退貨交易會回滾。
create or replace function public.complete_sale_return(
  p_sale_id uuid,p_refund_method text,p_reason text,p_items jsonb,p_manager_pin text default null
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

-- 結帳加入折扣核准、轉帳對帳欄位與寄賣拆帳快照。
create or replace function public.create_and_complete_sale(
  p_store_id uuid,p_request_id uuid,p_payment_method text,p_discount numeric,p_customer_id uuid,
  p_points_to_redeem integer,p_items jsonb,p_manager_pin text default null,p_transfer_last4 text default null,
  p_payment_note text default '',p_payment_confirmed_by text default null
) returns jsonb language plpgsql security definer set search_path='' as $$
declare v_role public.app_role; v_existing public.sales; v_sale public.sales; v_item jsonb; v_variant_id uuid; v_quantity integer;
  v_seen uuid[]:=array[]::uuid[]; v_locked integer:=0; v_subtotal numeric(12,2):=0; v_document text;
  v_threshold numeric:=20; v_discount_percent numeric:=0; v_approval_required boolean:=false; v_approval_method text:=null;
begin
  select role into v_role from public.store_members where store_id=p_store_id and user_id=auth.uid() and active;
  if v_role is null or v_role not in ('owner','manager','cashier') then raise exception '您沒有銷售結帳權限'; end if;
  if p_request_id is null then raise exception '結帳識別碼不可空白'; end if;
  if p_payment_method not in ('cash','card','transfer','line_transfer') then raise exception '付款方式不正確'; end if;
  if p_discount is null or p_discount<0 then raise exception '折扣金額不可小於 0'; end if;
  if p_points_to_redeem is null or p_points_to_redeem<0 then raise exception '折抵點數不可小於 0'; end if;
  if jsonb_typeof(p_items)<>'array' or jsonb_array_length(p_items)=0 then raise exception '請至少選擇一項商品'; end if;
  if jsonb_array_length(p_items)>200 then raise exception '單筆銷售最多 200 項商品'; end if;
  if p_payment_method in ('transfer','line_transfer') then
    if trim(coalesce(p_transfer_last4,''))<>'' and trim(p_transfer_last4)!~'^[0-9]{3,5}$' then raise exception '轉帳帳號末碼請輸入 3～5 位數字'; end if;
    if trim(coalesce(p_transfer_last4,''))='' and trim(coalesce(p_payment_note,''))='' and trim(coalesce(p_payment_confirmed_by,''))='' then
      raise exception '轉帳請至少填寫帳號末碼、交易備註或確認人';
    end if;
  end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_store_id::text||':'||p_request_id::text,0));
  select * into v_existing from public.sales where store_id=p_store_id and checkout_request_id=p_request_id;
  if found then
    if v_existing.status='completed' then return jsonb_build_object('sale_id',v_existing.id,'document_no',v_existing.document_no,'total',v_existing.total,'replayed',true); end if;
    raise exception '這筆結帳正在處理中，請勿重複送出';
  end if;
  for v_item in select value from jsonb_array_elements(p_items) loop
    v_variant_id:=(v_item->>'variant_id')::uuid; v_quantity:=(v_item->>'quantity')::integer;
    if v_variant_id is null or v_variant_id=any(v_seen) then raise exception '購物車包含不完整或重複商品'; end if;
    if v_quantity is null or v_quantity<=0 or v_quantity>9999 then raise exception '商品數量不正確'; end if;
    v_seen:=array_append(v_seen,v_variant_id);
  end loop;
  perform variant.id from public.product_variants variant
  where variant.store_id=p_store_id and variant.id=any(v_seen) and variant.active order by variant.id for update;
  get diagnostics v_locked=row_count;
  if v_locked<>array_length(v_seen,1) then raise exception '部分商品不存在或已停售，請重新整理'; end if;
  select coalesce(sum(variant.price*item.quantity),0) into v_subtotal
  from jsonb_to_recordset(p_items) as item(variant_id uuid,quantity integer)
  join public.product_variants variant on variant.id=item.variant_id and variant.store_id=p_store_id and variant.active;
  if p_discount>v_subtotal then raise exception '折扣不能大於商品小計'; end if;
  if p_points_to_redeem>0 and p_customer_id is null then raise exception '使用點數前請先選擇會員'; end if;
  select coalesce(discount_threshold_percent,20) into v_threshold from public.store_approval_settings where store_id=p_store_id;
  v_threshold:=coalesce(v_threshold,20); v_discount_percent:=case when v_subtotal>0 then p_discount/v_subtotal*100 else 0 end;
  v_approval_required:=v_discount_percent>v_threshold;
  if v_approval_required then v_approval_method:=private.approval_method(p_store_id,v_role,p_manager_pin); end if;
  v_document:=format('SO-%s-%s',to_char(clock_timestamp(),'YYYYMMDDHH24MISS'),upper(substr(replace(gen_random_uuid()::text,'-',''),1,4)));
  insert into public.sales(store_id,document_no,checkout_request_id,payment_method,discount,subtotal,total,customer_id,points_redeemed,created_by,
    transfer_account_last4,payment_note,payment_confirmed_by,approval_required,approval_method)
  values(p_store_id,v_document,p_request_id,p_payment_method,p_discount,v_subtotal,v_subtotal-p_discount,p_customer_id,p_points_to_redeem,auth.uid(),
    case when p_payment_method in ('transfer','line_transfer') then nullif(trim(coalesce(p_transfer_last4,'')),'') else null end,
    case when p_payment_method in ('transfer','line_transfer') then trim(coalesce(p_payment_note,'')) else '' end,
    case when p_payment_method in ('transfer','line_transfer') then nullif(trim(coalesce(p_payment_confirmed_by,'')),'') else null end,
    v_approval_required,v_approval_method) returning * into v_sale;
  insert into public.sale_items(sale_id,variant_id,quantity,unit_price)
  select v_sale.id,variant.id,item.quantity,variant.price from jsonb_to_recordset(p_items) as item(variant_id uuid,quantity integer)
  join public.product_variants variant on variant.id=item.variant_id and variant.store_id=p_store_id;
  insert into public.sale_item_consignments(sale_item_id,store_id,consignor_name,commission_percent)
  select si.id,p_store_id,p.consignor_name,p.consignment_commission_percent from public.sale_items si
  join public.product_variants pv on pv.id=si.variant_id join public.products p on p.id=pv.product_id
  where si.sale_id=v_sale.id and p.is_consignment;
  select * into v_sale from public.complete_sale(v_sale.id);
  if v_approval_required then
    insert into public.audit_log(store_id,actor_id,action,entity_type,entity_id,details)
    values(p_store_id,auth.uid(),'approve_discount','sale',v_sale.id,
      jsonb_build_object('discount',p_discount,'discount_percent',round(v_discount_percent,2),'threshold',v_threshold,'approval_method',v_approval_method));
  end if;
  return jsonb_build_object('sale_id',v_sale.id,'document_no',v_sale.document_no,'total',v_sale.total,'replayed',false,
    'approval_required',v_approval_required,'approval_method',v_approval_method);
end $$;
revoke all on function public.create_and_complete_sale(uuid,uuid,text,numeric,uuid,integer,jsonb) from public,anon,authenticated;
revoke all on function public.create_and_complete_sale(uuid,uuid,text,numeric,uuid,integer,jsonb,text,text,text,text) from public,anon,authenticated;
grant execute on function public.create_and_complete_sale(uuid,uuid,text,numeric,uuid,integer,jsonb,text,text,text,text) to authenticated;

create or replace function public.get_consignment_report(p_store_id uuid,p_from timestamptz,p_to timestamptz)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_rows jsonb;
begin
  if not public.has_store_role(p_store_id,array['owner','manager']::public.app_role[]) then raise exception '只有店主或店長可以查看寄賣拆帳'; end if;
  if p_from is null or p_to is null or p_to<=p_from or p_to-p_from>interval '367 days' then raise exception '日期範圍不正確'; end if;
  with sold as (
    select c.consignor_name,c.commission_percent,
      sum(case when s.subtotal>0 then si.quantity*si.unit_price*(s.total/s.subtotal) else 0 end) gross_sales,
      sum(si.quantity)::integer sold_units
    from public.sale_item_consignments c join public.sale_items si on si.id=c.sale_item_id join public.sales s on s.id=si.sale_id
    where c.store_id=p_store_id and s.status='completed' and s.completed_at>=p_from and s.completed_at<p_to
    group by c.consignor_name,c.commission_percent
  ), refunded as (
    select c.consignor_name,c.commission_percent,sum(ri.refund_amount) refunds,sum(ri.quantity)::integer return_units
    from public.sale_item_consignments c join public.sale_return_items ri on ri.sale_item_id=c.sale_item_id
    join public.sale_returns r on r.id=ri.return_id
    where c.store_id=p_store_id and r.completed_at>=p_from and r.completed_at<p_to
    group by c.consignor_name,c.commission_percent
  ), merged as (
    select s.consignor_name,s.commission_percent,s.sold_units,coalesce(r.return_units,0) return_units,
      round(s.gross_sales-coalesce(r.refunds,0),2) net_sales
    from sold s left join refunded r using(consignor_name,commission_percent)
  ) select coalesce(jsonb_agg(jsonb_build_object('consignor_name',consignor_name,'commission_percent',commission_percent,
      'sold_units',sold_units,'return_units',return_units,'net_sales',net_sales,
      'store_commission',round(net_sales*commission_percent/100,2),
      'consignor_payable',round(net_sales*(100-commission_percent)/100,2)) order by consignor_name),'[]'::jsonb)
    into v_rows from merged;
  return jsonb_build_object('rows',v_rows,'from',p_from,'to',p_to);
end $$;
revoke all on function public.get_consignment_report(uuid,timestamptz,timestamptz) from public,anon,authenticated;
grant execute on function public.get_consignment_report(uuid,timestamptz,timestamptz) to authenticated;

create or replace function private.audit_product_change() returns trigger
language plpgsql security definer set search_path='' as $$
declare v_store uuid:=coalesce(new.store_id,old.store_id); v_id uuid:=coalesce(new.id,old.id);
begin
  insert into public.audit_log(store_id,actor_id,action,entity_type,entity_id,details)
  values(v_store,auth.uid(),lower(tg_op),tg_table_name,v_id,
    jsonb_build_object('before',case when tg_op='INSERT' then null else to_jsonb(old) end,
      'after',case when tg_op='DELETE' then null else to_jsonb(new) end));
  return coalesce(new,old);
end $$;
revoke all on function private.audit_product_change() from public,anon,authenticated;
create trigger products_audit after insert or update or delete on public.products for each row execute function private.audit_product_change();
create trigger product_variants_audit after insert or update or delete on public.product_variants for each row execute function private.audit_product_change();

create or replace function private.audit_store_member_change() returns trigger
language plpgsql security definer set search_path='' as $$
declare v_store uuid:=coalesce(new.store_id,old.store_id); v_user uuid:=coalesce(new.user_id,old.user_id);
begin
  insert into public.audit_log(store_id,actor_id,action,entity_type,entity_id,details)
  values(v_store,auth.uid(),lower(tg_op),'store_member',v_user,
    jsonb_build_object('before',case when tg_op='INSERT' then null else to_jsonb(old) end,
      'after',case when tg_op='DELETE' then null else to_jsonb(new) end));
  return coalesce(new,old);
end $$;
revoke all on function private.audit_store_member_change() from public,anon,authenticated;
create trigger store_members_audit after insert or update or delete on public.store_members for each row execute function private.audit_store_member_change();

create or replace function private.guard_consignment_change() returns trigger
language plpgsql security invoker set search_path='' as $$
begin
  if (new.is_consignment or (tg_op='UPDATE' and (old.is_consignment,old.consignor_name,old.consignment_commission_percent)
      is distinct from (new.is_consignment,new.consignor_name,new.consignment_commission_percent)))
    and not public.has_store_role(new.store_id,array['owner','manager']::public.app_role[]) then
    raise exception '只有店主或店長可以設定寄賣與拆帳比例';
  end if;
  return new;
end $$;
revoke all on function private.guard_consignment_change() from public,anon,authenticated;
create trigger products_guard_consignment before insert or update on public.products for each row execute function private.guard_consignment_change();
