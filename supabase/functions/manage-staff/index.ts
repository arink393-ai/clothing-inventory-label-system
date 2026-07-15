import { createClient } from "npm:@supabase/supabase-js@2";

const cors = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type" };
const reply = (body: Record<string, unknown>) => new Response(JSON.stringify(body), { status: 200, headers: { ...cors, "Content-Type": "application/json" } });
const validRoles = ["manager", "cashier", "stock_clerk"];

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: cors });
  try {
    const authorization = request.headers.get("Authorization");
    if (!authorization) return reply({ ok: false, error: "請先登入" });
    const url = Deno.env.get("SUPABASE_URL")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const userClient = createClient(url, anonKey, { global: { headers: { Authorization: authorization } } });
    const admin = createClient(url, serviceKey, { auth: { autoRefreshToken: false, persistSession: false } });
    const { data: { user }, error: userError } = await userClient.auth.getUser();
    if (userError || !user) return reply({ ok: false, error: "登入狀態已失效，請重新登入" });
    const { data: owner } = await admin.from("store_members").select("store_id,role").eq("user_id", user.id).eq("role", "owner").eq("active", true).maybeSingle();
    if (!owner) return reply({ ok: false, error: "只有店主可以管理員工帳號" });
    const body = await request.json();
    if (body.action === "create") {
      const email = String(body.email || "").trim().toLowerCase();
      const password = String(body.password || "");
      const displayName = String(body.displayName || "").trim();
      const role = String(body.role || "");
      if (!/^\S+@\S+\.\S+$/.test(email)) return reply({ ok: false, error: "Email 格式不正確" });
      if (password.length < 8) return reply({ ok: false, error: "初始密碼至少需要 8 個字元" });
      if (!displayName || displayName.length > 40) return reply({ ok: false, error: "員工名稱請輸入 1～40 個字" });
      if (!validRoles.includes(role)) return reply({ ok: false, error: "員工角色不正確" });
      const { data: created, error: createError } = await admin.auth.admin.createUser({ email, password, email_confirm: true, user_metadata: { display_name: displayName } });
      if (createError || !created.user) return reply({ ok: false, error: createError?.message.includes("already") ? "這個 Email 已經有帳號" : `建立登入帳號失敗：${createError?.message || "未知錯誤"}` });
      const staffId = created.user.id;
      const { error: profileError } = await admin.from("profiles").upsert({ id: staffId, display_name: displayName });
      const { error: memberError } = await admin.from("store_members").insert({ store_id: owner.store_id, user_id: staffId, role, active: true });
      const { error: accountError } = await admin.from("staff_accounts").insert({ store_id: owner.store_id, user_id: staffId, email, created_by: user.id });
      if (profileError || memberError || accountError) {
        await admin.auth.admin.deleteUser(staffId);
        return reply({ ok: false, error: `建立門市權限失敗：${profileError?.message || memberError?.message || accountError?.message}` });
      }
      await admin.from("audit_log").insert({ store_id: owner.store_id, actor_id: user.id, action: "create", entity_type: "staff_account", entity_id: staffId, details: { email, role } });
      return reply({ ok: true, userId: staffId });
    }
    if (body.action === "reset_password") {
      const targetUserId = String(body.userId || "");
      const password = String(body.password || "");
      if (password.length < 8) return reply({ ok: false, error: "新密碼至少需要 8 個字元" });
      if (targetUserId === user.id) return reply({ ok: false, error: "請使用『修改我的密碼』變更自己的密碼" });
      const { data: target } = await admin.from("store_members").select("role").eq("store_id", owner.store_id).eq("user_id", targetUserId).maybeSingle();
      if (!target || target.role === "owner") return reply({ ok: false, error: "找不到可重設密碼的員工帳號" });
      const { error } = await admin.auth.admin.updateUserById(targetUserId, { password });
      if (error) return reply({ ok: false, error: `密碼重設失敗：${error.message}` });
      await admin.from("audit_log").insert({ store_id: owner.store_id, actor_id: user.id, action: "reset_password", entity_type: "staff_account", entity_id: targetUserId, details: {} });
      return reply({ ok: true });
    }
    return reply({ ok: false, error: "不支援的帳號管理操作" });
  } catch (error) {
    return reply({ ok: false, error: error instanceof Error ? error.message : "帳號管理服務發生錯誤" });
  }
});
