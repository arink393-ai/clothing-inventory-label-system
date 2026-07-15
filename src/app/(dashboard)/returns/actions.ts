"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";

const schema = z.object({
  saleId: z.string().uuid(),
  saleDocument: z.string().trim().min(1),
  refundMethod: z.enum(["original", "cash", "card", "transfer"]),
  reason: z.string().trim().min(2, "請選擇或填寫退貨原因").max(120),
  items: z.array(z.object({ sale_item_id: z.string().uuid(), quantity: z.number().int().positive() })).min(1, "請至少選擇一項退貨商品").max(100),
});

function fail(message: string, saleDocument = ""): never {
  const query = new URLSearchParams({ message });
  if (saleDocument) query.set("sale", saleDocument);
  redirect(`/returns?${query.toString()}`);
}

export async function completeReturn(formData: FormData) {
  let input: z.infer<typeof schema>;
  try {
    input = schema.parse({
      saleId: formData.get("saleId"),
      saleDocument: formData.get("saleDocument"),
      refundMethod: formData.get("refundMethod"),
      reason: formData.get("reason"),
      items: JSON.parse(String(formData.get("items") || "[]")),
    });
  } catch (error) {
    if (error instanceof z.ZodError) fail(error.issues[0]?.message || "退貨資料格式錯誤", String(formData.get("saleDocument") || ""));
    fail("退貨資料格式錯誤", String(formData.get("saleDocument") || ""));
  }
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  const { data, error } = await supabase.rpc("complete_sale_return", {
    p_sale_id: input.saleId,
    p_refund_method: input.refundMethod,
    p_reason: input.reason,
    p_items: input.items,
  });
  if (error) fail("退貨失敗：" + error.message, input.saleDocument);
  revalidatePath("/returns");
  revalidatePath("/inventory");
  revalidatePath("/products");
  revalidatePath("/sales");
  revalidatePath("/members");
  revalidatePath("/overview");
  const result = data as { document_no?: string; refund_amount?: number; units?: number; points_restored?: number; points_reversed?: number } | null;
  const pointText = result && ((result.points_restored || 0) > 0 || (result.points_reversed || 0) > 0)
    ? `；點數退回 ${result.points_restored || 0}／扣回 ${result.points_reversed || 0}`
    : "";
  redirect(`/returns?message=${encodeURIComponent(`退貨完成：${result?.document_no || "退貨單"}，${result?.units || 0} 件，退款 NT$${Number(result?.refund_amount || 0).toLocaleString("zh-TW")}${pointText}`)}`);
}
