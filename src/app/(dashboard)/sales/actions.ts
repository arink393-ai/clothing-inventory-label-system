"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";

const schema = z.object({
  requestId: z.string().uuid("結帳識別碼格式錯誤"),
  paymentMethod: z.enum(["cash", "card", "transfer", "line_transfer"]),
  discount: z.coerce.number().finite().min(0).default(0),
  customerId: z.union([z.literal(""), z.string().uuid()]).default(""),
  pointsToRedeem: z.coerce.number().int().min(0).default(0),
  items: z.array(z.object({
    variantId: z.string().uuid(),
    quantity: z.number().int().positive().max(9999),
  })).min(1, "請至少選擇一項商品").max(200, "單筆銷售最多 200 項商品"),
});

function fail(message: string): never {
  redirect("/sales?message=" + encodeURIComponent(message));
}

function friendlyCheckoutError(message: string) {
  if (message.includes("庫存不足")) return "部分商品庫存不足，這筆交易沒有扣庫存；請重新整理後確認數量。";
  if (message.includes("點數不足")) return "會員點數不足，這筆交易沒有成立；請重新選擇折抵點數。";
  if (message.includes("已停售") || message.includes("不存在")) return "部分商品已停售或不存在，這筆交易沒有成立；請重新整理商品。";
  if (message.includes("折扣") || message.includes("點數折抵")) return "折扣或點數折抵金額不正確，這筆交易沒有成立。";
  if (message.includes("正在處理") || message.includes("重複")) return "這筆結帳已送出，系統正在確認結果，請稍後重新整理銷售紀錄。";
  if (message.includes("create_and_complete_sale") || message.includes("schema cache")) return "結帳功能尚未完成資料庫升級，請通知店主執行最新 migration。";
  if (message.includes("權限") || message.includes("無權")) return "您沒有銷售結帳權限，請由店主確認帳號角色。";
  return "結帳未完成，庫存與點數沒有變更。請確認網路後再試；若持續發生請通知店主。";
}

export async function completeCheckout(formData: FormData) {
  let input: z.infer<typeof schema>;
  try {
    input = schema.parse({
      requestId: formData.get("requestId"),
      paymentMethod: formData.get("paymentMethod"),
      discount: formData.get("discount") || 0,
      customerId: formData.get("customerId") || "",
      pointsToRedeem: formData.get("pointsToRedeem") || 0,
      items: JSON.parse(String(formData.get("items") || "[]")),
    });
  } catch (error) {
    if (error instanceof z.ZodError) fail(error.issues[0]?.message || "結帳資料格式錯誤");
    fail("結帳資料格式錯誤");
  }

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: member } = await supabase
    .from("store_members")
    .select("store_id,role")
    .eq("user_id", user.id)
    .eq("active", true)
    .single();
  if (!member || !["owner", "manager", "cashier"].includes(member.role)) {
    fail("您沒有銷售結帳權限");
  }

  const { data, error } = await supabase.rpc("create_and_complete_sale", {
    p_store_id: member.store_id,
    p_request_id: input.requestId,
    p_payment_method: input.paymentMethod,
    p_discount: input.discount,
    p_customer_id: input.customerId || null,
    p_points_to_redeem: input.pointsToRedeem,
    p_items: input.items.map((item) => ({
      variant_id: item.variantId,
      quantity: item.quantity,
    })),
  });

  if (error) fail(friendlyCheckoutError(error.message));
  const result = data as { sale_id?: string; document_no?: string; replayed?: boolean } | null;
  if (!result?.sale_id || !result.document_no) {
    fail("結帳結果不完整，請先查看最近銷售紀錄，避免重複結帳。");
  }

  revalidatePath("/sales");
  revalidatePath("/inventory");
  revalidatePath("/products");
  revalidatePath("/overview");
  revalidatePath("/members");
  revalidatePath("/reports");
  const message = result.replayed
    ? `已確認先前結帳完成，銷售單號 ${result.document_no}`
    : `結帳完成，銷售單號 ${result.document_no}`;
  redirect("/sales?message=" + encodeURIComponent(message));
}
