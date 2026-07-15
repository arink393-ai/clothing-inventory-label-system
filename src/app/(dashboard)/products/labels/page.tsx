import { LabelPrinter, type LabelProduct } from "@/components/label-printer";
import { createClient } from "@/lib/supabase/server";

export default async function ProductLabels() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  const { data: member } = await supabase.from("store_members").select("store_id,stores(name)").eq("user_id", user!.id).eq("active", true).single();
  const { data } = await supabase.from("product_variants").select("id,sku,barcode,color,size,price,products!inner(name,active)").eq("store_id", member!.store_id).eq("active", true).not("barcode", "is", null).order("sku");
  const products: LabelProduct[] = (data || []).flatMap((variant) => { const product = Array.isArray(variant.products) ? variant.products[0] : variant.products; return product?.active && variant.barcode ? [{ id: variant.id, name: product.name, sku: variant.sku, barcode: variant.barcode, variant: [variant.color, variant.size].filter((value) => value && value !== "未指定").join(" / "), price: Number(variant.price) }] : []; });
  const store = Array.isArray(member!.stores) ? member!.stores[0] : member!.stores;
  return <LabelPrinter products={products} storeName={store?.name || "門市"}/>;
}
