"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";

const memberSchema = z.object({
  id: z.string().uuid().optional(),
  name: z.string().trim().min(1, "請輸入會員姓名").max(80),
  phone: z.string().trim().max(30).optional(),
  email: z.union([z.literal(""), z.string().email("Email 格式不正確")]).optional(),
});

function back(message: string): never {
  redirect("/members?message=" + encodeURIComponent(message));
}

async function context() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  const { data: member } = await supabase.from("store_members").select("store_id,role").eq("user_id", user.id).eq("active", true).single();
  if (!member || !["owner", "manager", "cashier"].includes(member.role)) back("您沒有會員管理權限");
  return { supabase, member };
}

export async function saveMember(formData: FormData) {
  const parsed = memberSchema.safeParse({
    id: formData.get("id") || undefined,
    name: formData.get("name"),
    phone: formData.get("phone") || "",
    email: formData.get("email") || "",
  });
  if (!parsed.success) back(parsed.error.issues[0]?.message || "會員資料格式錯誤");
  const { supabase, member } = await context();
  const values = { name: parsed.data.name, phone: parsed.data.phone || null, email: parsed.data.email || null };
  const result = parsed.data.id
    ? await supabase.from("customers").update(values).eq("id", parsed.data.id).eq("store_id", member.store_id)
    : await supabase.from("customers").insert({ store_id: member.store_id, ...values });
  if (result.error) back(result.error.code === "23505" ? "這個電話已經是會員" : "儲存會員失敗：" + result.error.message);
  revalidatePath("/members");
  back(parsed.data.id ? "會員資料已更新" : "會員已建立");
}

export async function deleteMember(formData: FormData) {
  const id = z.string().uuid().safeParse(formData.get("id"));
  if (!id.success) back("會員資料格式錯誤");
  const { supabase, member } = await context();
  if (!['owner', 'manager'].includes(member.role)) back("只有店主或店長可以刪除會員");
  const { error } = await supabase.from("customers").delete().eq("id", id.data).eq("store_id", member.store_id);
  if (error) back("無法刪除會員；若已有銷售紀錄，請保留會員資料");
  revalidatePath("/members");
  back("會員已刪除");
}

export async function adjustPoints(formData: FormData) {
  const parsed = z.object({ customerId: z.string().uuid(), delta: z.coerce.number().int().refine((n) => n !== 0, "調整點數不可為 0"), note: z.string().trim().min(2, "請填寫調整原因").max(120) }).safeParse({
    customerId: formData.get("customerId"), delta: formData.get("delta"), note: formData.get("note"),
  });
  if (!parsed.success) back(parsed.error.issues[0]?.message || "點數資料格式錯誤");
  const { supabase, member } = await context();
  if (!['owner', 'manager'].includes(member.role)) back("只有店主或店長可以人工調整點數");
  const { error } = await supabase.rpc("adjust_customer_points", { p_customer_id: parsed.data.customerId, p_delta: parsed.data.delta, p_note: parsed.data.note });
  if (error) back("點數調整失敗：" + error.message);
  revalidatePath("/members");
  back("會員點數已調整並留下紀錄");
}
