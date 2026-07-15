-- 真實營運報表，以及安全的員工帳號索引與權限管理。
create table public.staff_accounts (
  store_id uuid not null references public.stores(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  email text not null,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  primary key(store_id,user_id),
  unique(store_id,email)
);

insert into public.staff_accounts(store_id,user_id,email,created_by)
select m.store_id,m.user_id,lower(u.email),m.user_id
from public.store_members m join auth.users u on u.id=m.user_id
where u.email is not null
on conflict(store_id,user_id) do nothing;

alter table public.staff_accounts enable row level security;
create policy "owners read staff accounts" on public.staff_accounts for select
using(public.has_store_role(store_id,array['owner']::public.app_role[]));
revoke insert,update,delete on public.staff_accounts from authenticated,anon;
grant select on public.staff_accounts to authenticated;

create policy "owners read teammate profiles" on public.profiles for select
using(exists(
  select 1 from public.store_members target
  where target.user_id=profiles.id
    and public.has_store_role(target.store_id,array['owner']::public.app_role[])
));

create or replace function public.update_staff_access(
  p_user_id uuid,
  p_role public.app_role,
  p_active boolean
) returns void
language plpgsql security definer set search_path='' as $$
declare v_store uuid; v_current_role public.app_role;
begin
  select store_id,role into v_store,v_current_role
  from public.store_members
  where user_id=auth.uid() and active and role='owner'
  limit 1;
  if v_store is null then raise exception '只有店主可以管理員工權限'; end if;
  if p_user_id=auth.uid() then raise exception '不可在此停用或變更自己的店主帳號'; end if;
  if p_role not in ('manager','cashier','stock_clerk') then raise exception '員工角色不正確'; end if;
  select role into v_current_role from public.store_members where store_id=v_store and user_id=p_user_id for update;
  if v_current_role is null then raise exception '找不到這位門市員工'; end if;
  if v_current_role='owner' then raise exception '不可變更其他店主帳號'; end if;
  update public.store_members set role=p_role,active=p_active where store_id=v_store and user_id=p_user_id;
  insert into public.audit_log(store_id,actor_id,action,entity_type,entity_id,details)
  values(v_store,auth.uid(),'update_access','store_member',p_user_id,jsonb_build_object('role',p_role,'active',p_active));
end $$;
revoke all on function public.update_staff_access(uuid,public.app_role,boolean) from public;
grant execute on function public.update_staff_access(uuid,public.app_role,boolean) to authenticated;

create or replace function public.get_operations_report(
  p_store_id uuid,
  p_from timestamptz,
  p_to timestamptz
) returns jsonb
language plpgsql security definer set search_path='' as $$
declare
  v_role public.app_role;
  v_sales numeric(14,2):=0;
  v_refunds numeric(14,2):=0;
  v_net numeric(14,2):=0;
  v_orders integer:=0;
  v_returns integer:=0;
  v_units integer:=0;
  v_return_units integer:=0;
  v_sales_cogs numeric(14,2):=0;
  v_return_cogs numeric(14,2):=0;
  v_cogs numeric(14,2):=0;
  v_profit numeric(14,2):=0;
  v_margin numeric(8,2):=0;
  v_previous_net numeric(14,2):=0;
  v_previous_from timestamptz;
  v_top jsonb:='[]'::jsonb;
  v_payments jsonb:='[]'::jsonb;
  v_daily jsonb:='[]'::jsonb;
begin
  select role into v_role from public.store_members where store_id=p_store_id and user_id=auth.uid() and active;
  if v_role is null or v_role not in ('owner','manager') then raise exception '只有店主或店長可以查看營運報表'; end if;
  if p_from is null or p_to is null or p_to<=p_from then raise exception '報表日期範圍不正確'; end if;
  if p_to-p_from>interval '367 days' then raise exception '單次報表最多查詢 367 天'; end if;
  v_previous_from:=p_from-(p_to-p_from);

  select count(*)::integer,coalesce(sum(total),0) into v_orders,v_sales
  from public.sales where store_id=p_store_id and status='completed' and completed_at>=p_from and completed_at<p_to;
  select count(*)::integer,coalesce(sum(refund_amount),0) into v_returns,v_refunds
  from public.sale_returns where store_id=p_store_id and completed_at>=p_from and completed_at<p_to;
  select coalesce(sum(si.quantity),0)::integer into v_units
  from public.sale_items si join public.sales s on s.id=si.sale_id
  where s.store_id=p_store_id and s.status='completed' and s.completed_at>=p_from and s.completed_at<p_to;
  select coalesce(sum(ri.quantity),0)::integer into v_return_units
  from public.sale_return_items ri join public.sale_returns r on r.id=ri.return_id
  where r.store_id=p_store_id and r.completed_at>=p_from and r.completed_at<p_to;
  v_net:=v_sales-v_refunds;

  select
    coalesce((select sum(total) from public.sales where store_id=p_store_id and status='completed' and completed_at>=v_previous_from and completed_at<p_from),0)
    -coalesce((select sum(refund_amount) from public.sale_returns where store_id=p_store_id and completed_at>=v_previous_from and completed_at<p_from),0)
  into v_previous_net;

  if v_role='owner' then
    select coalesce(sum(si.quantity*coalesce(c.unit_cost,0)),0) into v_sales_cogs
    from public.sale_items si join public.sales s on s.id=si.sale_id
    left join public.sale_item_costs c on c.sale_item_id=si.id
    where s.store_id=p_store_id and s.status='completed' and s.completed_at>=p_from and s.completed_at<p_to;
    select coalesce(sum(ri.quantity*coalesce(c.unit_cost,0)),0) into v_return_cogs
    from public.sale_return_items ri join public.sale_returns r on r.id=ri.return_id
    left join public.sale_item_costs c on c.sale_item_id=ri.sale_item_id
    where r.store_id=p_store_id and r.completed_at>=p_from and r.completed_at<p_to;
    v_cogs:=v_sales_cogs-v_return_cogs;
    v_profit:=v_net-v_cogs;
    v_margin:=case when v_net<>0 then round(v_profit/v_net*100,2) else 0 end;
  end if;

  with product_movements as (
    select p.id product_id,p.name,si.quantity net_units,
      case when s.subtotal>0 then si.quantity*si.unit_price*(s.total/s.subtotal) else 0 end net_sales
    from public.sale_items si join public.sales s on s.id=si.sale_id
    join public.product_variants v on v.id=si.variant_id join public.products p on p.id=v.product_id
    where s.store_id=p_store_id and s.status='completed' and s.completed_at>=p_from and s.completed_at<p_to
    union all
    select p.id,p.name,-ri.quantity,-ri.refund_amount
    from public.sale_return_items ri join public.sale_returns r on r.id=ri.return_id
    join public.product_variants v on v.id=ri.variant_id join public.products p on p.id=v.product_id
    where r.store_id=p_store_id and r.completed_at>=p_from and r.completed_at<p_to
  ), ranked as (
    select product_id,name,sum(net_units)::integer net_units,round(sum(net_sales),2) net_sales
    from product_movements group by product_id,name
    having sum(net_units)<>0 or sum(net_sales)<>0
    order by net_units desc,net_sales desc limit 10
  )
  select coalesce(jsonb_agg(jsonb_build_object('product_id',product_id,'name',name,'net_units',net_units,'net_sales',net_sales) order by net_units desc,net_sales desc),'[]'::jsonb)
  into v_top from ranked;

  with payment_movements as (
    select payment_method method,total amount from public.sales
    where store_id=p_store_id and status='completed' and completed_at>=p_from and completed_at<p_to
    union all
    select case when r.refund_method='original' then s.payment_method else r.refund_method end,-r.refund_amount
    from public.sale_returns r join public.sales s on s.id=r.sale_id
    where r.store_id=p_store_id and r.completed_at>=p_from and r.completed_at<p_to
  ), grouped as (
    select method,round(sum(amount),2) amount from payment_movements group by method order by amount desc
  )
  select coalesce(jsonb_agg(jsonb_build_object('method',method,'amount',amount) order by amount desc),'[]'::jsonb)
  into v_payments from grouped;

  with daily_movements as (
    select (completed_at at time zone 'Asia/Taipei')::date report_date,total amount from public.sales
    where store_id=p_store_id and status='completed' and completed_at>=p_from and completed_at<p_to
    union all
    select (completed_at at time zone 'Asia/Taipei')::date,-refund_amount from public.sale_returns
    where store_id=p_store_id and completed_at>=p_from and completed_at<p_to
  ), grouped as (
    select report_date,round(sum(amount),2) amount from daily_movements group by report_date order by report_date
  )
  select coalesce(jsonb_agg(jsonb_build_object('day',report_date,'amount',amount) order by report_date),'[]'::jsonb)
  into v_daily from grouped;

  return jsonb_build_object(
    'summary',jsonb_build_object(
      'gross_sales',v_sales,'refunds',v_refunds,'net_sales',v_net,'orders',v_orders,
      'returns',v_returns,'units',v_units,'return_units',v_return_units,
      'average_order',case when v_orders>0 then round(v_net/v_orders,2) else 0 end,
      'previous_net_sales',v_previous_net,
      'cogs',case when v_role='owner' then to_jsonb(v_cogs) else 'null'::jsonb end,
      'gross_profit',case when v_role='owner' then to_jsonb(v_profit) else 'null'::jsonb end,
      'gross_margin',case when v_role='owner' then to_jsonb(v_margin) else 'null'::jsonb end
    ),
    'top_products',v_top,'payments',v_payments,'daily',v_daily,'can_view_costs',v_role='owner'
  );
end $$;
revoke all on function public.get_operations_report(uuid,timestamptz,timestamptz) from public;
grant execute on function public.get_operations_report(uuid,timestamptz,timestamptz) to authenticated;
