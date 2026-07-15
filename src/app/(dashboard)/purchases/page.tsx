import {
  PurchaseManager,
  type PurchaseProduct,
  type PurchaseRecord,
} from "@/components/purchase-manager";
import { createClient } from "@/lib/supabase/server";
type RawProduct = {
  id: string;
  sku: string;
  barcode: string | null;
  color: string;
  size: string;
  products:
    | { name: string; active: boolean }
    | { name: string; active: boolean }[];
  inventory_balances: { quantity: number } | { quantity: number }[] | null;
};
type RawPurchase = {
  id: string;
  document_no: string;
  completed_at: string | null;
  note: string;
  suppliers: { name: string } | { name: string }[] | null;
  purchase_items: { quantity: number }[];
};
export default async function Purchases({
  searchParams,
}: {
  searchParams: Promise<{ message?: string }>;
}) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const { data: member } = await supabase
    .from("store_members")
    .select("store_id")
    .eq("user_id", user!.id)
    .eq("active", true)
    .single();
  const [
    { data: variants, error: productError },
    { data: purchases, error: purchaseError },
  ] = await Promise.all([
    supabase
      .from("product_variants")
      .select(
        "id,sku,barcode,color,size,products!inner(name,active),inventory_balances(quantity)",
      )
      .eq("store_id", member!.store_id)
      .eq("active", true)
      .order("sku"),
    supabase
      .from("purchases")
      .select(
        "id,document_no,completed_at,note,suppliers(name),purchase_items(quantity)",
      )
      .eq("store_id", member!.store_id)
      .eq("status", "completed")
      .order("completed_at", { ascending: false })
      .limit(50),
  ]);
  const products: PurchaseProduct[] = (
    (variants || []) as unknown as RawProduct[]
  )
    .map((v) => {
      const p = Array.isArray(v.products) ? v.products[0] : v.products;
      const b = Array.isArray(v.inventory_balances)
        ? v.inventory_balances[0]
        : v.inventory_balances;
      return {
        id: v.id,
        sku: v.sku,
        barcode: v.barcode || "",
        name: p.name,
        variant: [v.color, v.size]
          .filter((x) => x && x !== "未指定")
          .join(" / "),
        stock: Number(b?.quantity || 0),
        active: p.active,
      };
    })
    .filter((p) => p.active)
    .map((p) => ({id:p.id,sku:p.sku,barcode:p.barcode,name:p.name,variant:p.variant,stock:p.stock}));
  const records: PurchaseRecord[] = (
    (purchases || []) as unknown as RawPurchase[]
  ).map((p) => {
    const supplier = Array.isArray(p.suppliers) ? p.suppliers[0] : p.suppliers;
    return {
      id: p.id,
      documentNo: p.document_no,
      completedAt: p.completed_at
        ? new Intl.DateTimeFormat("zh-TW", {
            dateStyle: "short",
            timeStyle: "short",
            timeZone: "Asia/Taipei",
          }).format(new Date(p.completed_at))
        : "—",
      supplier: supplier?.name || "未填寫",
      lines: p.purchase_items.length,
      units: p.purchase_items.reduce((n, i) => n + i.quantity, 0),
      note: p.note,
    };
  });
  const { message } = await searchParams;
  const error = productError || purchaseError;
  return (
    <PurchaseManager
      products={products}
      records={records}
      message={
        message || (error ? "讀取進貨資料失敗：" + error.message : undefined)
      }
    />
  );
}
