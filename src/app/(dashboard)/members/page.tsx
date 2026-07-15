import { MemberManager, type MemberRow, type PointEntry } from "@/components/member-manager";
import { createClient } from "@/lib/supabase/server";

const date = (value: string) => new Intl.DateTimeFormat("zh-TW", { dateStyle: "short", timeZone: "Asia/Taipei" }).format(new Date(value));
const dateTime = (value: string) => new Intl.DateTimeFormat("zh-TW", { dateStyle: "short", timeStyle: "short", timeZone: "Asia/Taipei" }).format(new Date(value));

export default async function Members({ searchParams }: { searchParams: Promise<{ message?: string }> }) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  const { data: member } = await supabase.from("store_members").select("store_id,role").eq("user_id", user!.id).eq("active", true).single();
  const [{ data: customers }, { data: ledger }, { data: store }] = await Promise.all([
    supabase.from("customers").select("id,name,phone,email,points,created_at").eq("store_id", member!.store_id).order("created_at", { ascending: false }),
    supabase.from("customer_points_ledger").select("id,customer_id,points,balance_after,entry_type,note,created_at,customers(name)").eq("store_id", member!.store_id).order("created_at", { ascending: false }).limit(100),
    supabase.from("stores").select("points_spend_amount,point_value,points_enabled").eq("id", member!.store_id).single(),
  ]);
  const rows: MemberRow[] = (customers || []).map((row) => ({ id: row.id, name: row.name, phone: row.phone || "", email: row.email || "", points: row.points, createdAt: date(row.created_at) }));
  const history: PointEntry[] = (ledger || []).map((row) => { const customer = Array.isArray(row.customers) ? row.customers[0] : row.customers; return { id: row.id, customerId: row.customer_id, memberName: customer?.name || "已刪除會員", points: row.points, balanceAfter: row.balance_after, type: row.entry_type, note: row.note, createdAt: dateTime(row.created_at) }; });
  const { message } = await searchParams;
  return <MemberManager rows={rows} history={history} message={message} canAdjust={["owner", "manager"].includes(member!.role)} spendAmount={Number(store?.points_spend_amount || 100)} pointValue={Number(store?.point_value || 1)} enabled={store?.points_enabled !== false}/>;
}
