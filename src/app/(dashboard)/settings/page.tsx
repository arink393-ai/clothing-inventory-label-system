import { PageHead } from "@/components/page-head";
import { PwaInstallGuide } from "@/components/pwa-install-guide";
import { StaffManager, type StaffRow } from "@/components/staff-manager";
import { createClient } from "@/lib/supabase/server";
import { updateDisplayName, updateMyPassword, updatePointsSettings } from "./actions";

const roleLabel: Record<string, string> = { owner: "店主（完整權限）", manager: "店長（營運與報表）", cashier: "收銀員（銷售與退貨）", stock_clerk: "庫存人員（商品、進貨與盤點）" };

export default async function Settings({ searchParams }: { searchParams: Promise<{ message?: string }> }) {
  const { message } = await searchParams;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  const [{ data: profile }, { data: member }] = await Promise.all([
    user ? supabase.from("profiles").select("display_name").eq("id", user.id).maybeSingle() : Promise.resolve({ data: null }),
    user ? supabase.from("store_members").select("store_id,role,stores(points_spend_amount,point_value,points_enabled)").eq("user_id", user.id).eq("active", true).single() : Promise.resolve({ data: null }),
  ]);
  const store = Array.isArray(member?.stores) ? member.stores[0] : member?.stores;
  let staffRows: StaffRow[] = [];
  let staffError = "";
  if (user && member?.role === "owner") {
    const [{ data: accounts, error: accountError }, { data: members, error: memberError }] = await Promise.all([
      supabase.from("staff_accounts").select("user_id,email").eq("store_id", member.store_id),
      supabase.from("store_members").select("user_id,role,active,profiles(display_name)").eq("store_id", member.store_id).order("role"),
    ]);
    if (accountError || memberError) staffError = accountError?.message || memberError?.message || "員工資料讀取失敗";
    const emailByUser = new Map((accounts || []).map((account) => [account.user_id, account.email]));
    staffRows = (members || []).map((row) => {
      const relatedProfile = Array.isArray(row.profiles) ? row.profiles[0] : row.profiles;
      return { userId: row.user_id, displayName: relatedProfile?.display_name || "未命名員工", email: emailByUser.get(row.user_id) || "帳號資料待同步", role: row.role, active: row.active, isCurrent: row.user_id === user.id };
    });
  }
  return <>
    <PageHead title="系統設定" description="門市、個人帳號與角色權限設定"/>
    {message && <div className="notice page-notice" role="status">{message}</div>}
    <div className="grid-2">
      <section className="panel"><div className="panel-head"><h3>我的帳號</h3></div><form action={updateDisplayName}><div className="field"><label htmlFor="displayName">首頁顯示名稱</label><input id="displayName" name="displayName" defaultValue={profile?.display_name || ""} maxLength={40} placeholder="例如：王店長" required/></div><button className="btn primary">儲存顯示名稱</button></form></section>
      <section className="panel"><div className="panel-head"><div><h3>修改我的密碼</h3><p>修改後請在其他裝置重新登入。</p></div></div><form action={updateMyPassword}><div className="form-grid"><div className="field"><label htmlFor="password">新密碼</label><input id="password" name="password" type="password" minLength={8} autoComplete="new-password" placeholder="至少 8 個字元" required/></div><div className="field"><label htmlFor="confirm">再次輸入密碼</label><input id="confirm" name="confirm" type="password" minLength={8} autoComplete="new-password" required/></div></div><button className="btn primary">更新我的密碼</button></form></section>
      <section className="panel"><div className="panel-head"><div><h3>會員點數規則</h3><p>點數會依扣除折扣後的實收金額計算</p></div></div>{member?.role === "owner" ? <form action={updatePointsSettings}><div className="form-grid"><div className="field"><label htmlFor="spendAmount">每消費多少元累積 1 點</label><input id="spendAmount" name="spendAmount" type="number" min="1" step="1" defaultValue={Number(store?.points_spend_amount || 100)} required/></div><div className="field"><label htmlFor="pointValue">每 1 點折抵多少元</label><input id="pointValue" name="pointValue" type="number" min="0.01" step="0.01" defaultValue={Number(store?.point_value || 1)} required/></div></div><div className="field"><label htmlFor="enabled">功能狀態</label><select id="enabled" name="enabled" defaultValue={store?.points_enabled === false ? "false" : "true"}><option value="true">啟用累積與折抵</option><option value="false">暫停累積與折抵</option></select></div><button className="btn primary">儲存點數規則</button></form> : <p className="hint">只有店主可以修改點數規則。</p>}</section>
      <section className="panel"><div className="panel-head"><div><h3>我的角色權限</h3><p>每位人員使用自己的登入帳號。</p></div></div><p className="permission-summary">目前角色：<b>{roleLabel[String(member?.role || "")] || "未設定"}</b></p><p className="hint">密碼只由 Supabase 身分驗證系統保存，ERP 不會顯示任何人的密碼。</p></section>
      <PwaInstallGuide/>
      {member?.role === "owner" && (staffError ? <section className="panel staff-panel"><div className="notice">員工帳號讀取失敗：{staffError}</div></section> : <StaffManager rows={staffRows}/>)}
    </div>
  </>;
}
