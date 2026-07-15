"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
const schema = z.object({
  supplierName: z.string().trim().max(80),
  supplierDocumentNo: z.string().trim().max(80),
  importFingerprint: z.string().trim().min(8, "進貨識別碼遺失，請關閉視窗後重試").max(100),
  note: z.string().trim().max(150),
  items: z
    .array(
      z.object({
        variant_id: z.string().uuid(),
        quantity: z.number().int().positive(),
        unit_cost: z.number().min(0),
      }),
    )
    .min(1, "請至少加入一項商品")
    .max(500, "單次最多 500 項商品"),
});
function fail(message: string): never {
  redirect("/purchases?message=" + encodeURIComponent(message));
}
export async function receivePurchase(formData: FormData) {
  let input: z.infer<typeof schema>;
  try {
    input = schema.parse({
      supplierName: String(formData.get("supplierName") || ""),
      supplierDocumentNo: String(formData.get("supplierDocumentNo") || ""),
      importFingerprint: String(formData.get("importFingerprint") || ""),
      note: String(formData.get("note") || ""),
      items: JSON.parse(String(formData.get("items") || "[]")),
    });
  } catch (e) {
    if (e instanceof z.ZodError)
      fail(e.issues[0]?.message || "進貨資料格式錯誤");
    fail("進貨資料格式錯誤");
  }
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  const { data, error } = await supabase.rpc("receive_purchase", {
    p_supplier_name: input.supplierName,
    p_supplier_document_no: input.supplierDocumentNo,
    p_import_fingerprint: input.importFingerprint,
    p_note: input.note,
    p_items: input.items,
  });
  if (error) fail("進貨入庫失敗：" + error.message);
  revalidatePath("/purchases");
  revalidatePath("/inventory");
  revalidatePath("/products");
  revalidatePath("/sales");
  revalidatePath("/overview");
  const result = data as {
    document_no?: string;
    lines?: number;
    units?: number;
    duplicate?: boolean;
  } | null;
  if (result?.duplicate) {
    redirect(`/purchases?message=${encodeURIComponent(`已阻擋重複入庫：${result.document_no || "這份進貨資料"} 已經匯入，庫存沒有再次增加。`)}`);
  }
  redirect(
    `/purchases?message=${encodeURIComponent(`入庫完成：${result?.document_no || "進貨單"}，${result?.lines || input.items.length} 項／${result?.units || 0} 件`)}`,
  );
}
