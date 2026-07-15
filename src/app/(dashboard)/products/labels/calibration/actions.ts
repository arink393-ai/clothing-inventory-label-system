"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";

const profileSchema = z.object({
  id: z.union([z.literal(""), z.string().uuid()]),
  name: z.string().trim().min(1, "請輸入設備名稱").max(60, "設備名稱不可超過 60 個字"),
  width: z.coerce.number().min(10).max(120),
  height: z.coerce.number().min(10).max(120),
  offsetX: z.coerce.number().min(-20).max(20),
  offsetY: z.coerce.number().min(-20).max(20),
  scale: z.coerce.number().min(50).max(150),
});

function message(text: string): never {
  redirect(`/products/labels/calibration?message=${encodeURIComponent(text)}`);
}

export async function savePrinterProfile(formData: FormData) {
  const parsed = profileSchema.safeParse({
    id: String(formData.get("id") || ""),
    name: formData.get("name"),
    width: formData.get("width"),
    height: formData.get("height"),
    offsetX: formData.get("offsetX"),
    offsetY: formData.get("offsetY"),
    scale: formData.get("scale"),
  });
  if (!parsed.success) message(parsed.error.issues[0]?.message || "校正資料格式錯誤");

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  const { data: member } = await supabase.from("store_members").select("store_id,role").eq("user_id", user.id).eq("active", true).single();
  if (!member || !["owner", "manager", "stock_clerk"].includes(member.role)) message("您沒有管理標籤設備的權限");

  const values = {
    store_id: member.store_id,
    name: parsed.data.name,
    model: "B21",
    label_width_mm: parsed.data.width,
    label_height_mm: parsed.data.height,
    offset_x_mm: parsed.data.offsetX,
    offset_y_mm: parsed.data.offsetY,
    scale_percent: parsed.data.scale,
    updated_by: user.id,
    updated_at: new Date().toISOString(),
  };
  const result = parsed.data.id
    ? await supabase.from("label_printer_profiles").update(values).eq("id", parsed.data.id).eq("store_id", member.store_id)
    : await supabase.from("label_printer_profiles").insert(values);
  if (result.error) message(`設定檔儲存失敗：${result.error.message}`);
  revalidatePath("/products/labels/calibration");
  message(parsed.data.id ? "B21 校正設定已更新" : "B21 設備設定已建立");
}

export async function deletePrinterProfile(formData: FormData) {
  const id = z.string().uuid().safeParse(formData.get("id"));
  if (!id.success) message("找不到要刪除的設備設定");
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  const { data: member } = await supabase.from("store_members").select("store_id,role").eq("user_id", user.id).eq("active", true).single();
  if (!member || !["owner", "manager"].includes(member.role)) message("只有店主或店長可以刪除設備設定");
  const { error } = await supabase.from("label_printer_profiles").delete().eq("id", id.data).eq("store_id", member.store_id);
  if (error) message(`設備設定刪除失敗：${error.message}`);
  revalidatePath("/products/labels/calibration");
  message("B21 設備設定已刪除");
}
