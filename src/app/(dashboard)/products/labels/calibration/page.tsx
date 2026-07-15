import { redirect } from "next/navigation";
import { LabelCalibration, type PrinterProfile } from "@/components/label-calibration";
import { createClient } from "@/lib/supabase/server";

export default async function CalibrationPage({ searchParams }: { searchParams: Promise<{ message?: string }> }) {
  const params = await searchParams;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  const { data: member } = await supabase.from("store_members").select("store_id,role,stores(name)").eq("user_id", user.id).eq("active", true).single();
  if (!member || !["owner", "manager", "stock_clerk"].includes(member.role)) redirect("/overview");
  const { data } = await supabase.from("label_printer_profiles").select("id,name,label_width_mm,label_height_mm,offset_x_mm,offset_y_mm,scale_percent").eq("store_id", member.store_id).order("name");
  const profiles: PrinterProfile[] = (data || []).map((item) => ({ id: item.id, name: item.name, labelWidthMm: Number(item.label_width_mm), labelHeightMm: Number(item.label_height_mm), offsetXMm: Number(item.offset_x_mm), offsetYMm: Number(item.offset_y_mm), scalePercent: Number(item.scale_percent) }));
  const store = Array.isArray(member.stores) ? member.stores[0] : member.stores;
  return <>{params.message && <div className="notice page-notice">{params.message}</div>}<LabelCalibration profiles={profiles} storeName={store?.name || "門市"} canDelete={["owner", "manager"].includes(member.role)}/></>;
}
