import { ProductManager, type ProductRow } from "@/components/product-manager";
import { createClient } from "@/lib/supabase/server";
type RawVariant = {
  id: string;
  sku: string;
  barcode: string | null;
  color: string;
  size: string;
  price: number | string;
  reorder_point: number;
  active: boolean;
  products:
    | {
        id: string;
        sku: string;
        name: string;
        image_path: string | null;
        active: boolean;
        is_consignment: boolean;
        consignor_name: string | null;
        consignment_commission_percent: number | string | null;
        categories:
          | { name: string; code: string }
          | { name: string; code: string }[]
          | null;
      }
    | {
        id: string;
        sku: string;
        name: string;
        image_path: string | null;
        active: boolean;
        is_consignment: boolean;
        consignor_name: string | null;
        consignment_commission_percent: number | string | null;
        categories:
          | { name: string; code: string }
          | { name: string; code: string }[]
          | null;
      }[];
  inventory_balances: { quantity: number } | { quantity: number }[] | null;
};

export default async function Products({
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
    .select("store_id,role")
    .eq("user_id", user!.id)
    .eq("active", true)
    .single();
  const { data, error } = await supabase
    .from("product_variants")
    .select(
      "id,sku,barcode,color,size,price,reorder_point,active,products!inner(id,sku,name,image_path,active,is_consignment,consignor_name,consignment_commission_percent,categories(name,code)),inventory_balances(quantity)",
    )
    .eq("store_id", member!.store_id)
    .order("sku");
  const { data: costs } = member?.role === "owner"
    ? await supabase.from("product_costs").select("variant_id,cost").eq("store_id", member.store_id)
    : { data: [] };
  const costByVariant = new Map((costs || []).map((c) => [c.variant_id, Number(c.cost)]));
  const paths = Array.from(new Set(((data || []) as unknown as RawVariant[]).map((v) => (Array.isArray(v.products) ? v.products[0] : v.products).image_path).filter((p): p is string => Boolean(p))));
  const { data: signed } = paths.length ? await supabase.storage.from("product-images").createSignedUrls(paths, 3600) : { data: [] };
  const imageByPath = new Map((signed || []).map((item, index) => [paths[index], item.signedUrl]));
  const rows: ProductRow[] = ((data || []) as unknown as RawVariant[]).map(
    (v) => {
      const p = Array.isArray(v.products) ? v.products[0] : v.products;
      const c = Array.isArray(p?.categories) ? p.categories[0] : p?.categories;
      const b = Array.isArray(v.inventory_balances)
        ? v.inventory_balances[0]
        : v.inventory_balances;
      return {
        id: p.id,
        variantId: v.id,
        productSku: p.sku,
        variantSku: v.sku,
        barcode: v.barcode || "",
        name: p.name,
        imageUrl: p.image_path ? imageByPath.get(p.image_path) || "" : "",
        category: c?.name || "未分類",
        categoryCode: c?.code || "MSC",
        color: v.color || "",
        size: v.size || "",
        stock: b?.quantity || 0,
        price: Number(v.price),
        cost: costByVariant.get(v.id) || 0,
        reorderPoint: v.reorder_point,
        active: Boolean(p.active && v.active),
        isConsignment: p.is_consignment,
        consignorName: p.consignor_name || "",
        commissionPercent: Number(p.consignment_commission_percent || 0),
      };
    },
  );
  const { message } = await searchParams;
  return (
    <ProductManager
      rows={rows}
      canManageConsignment={["owner", "manager"].includes(member!.role)}
      message={
        message || (error ? "讀取商品失敗：" + error.message : undefined)
      }
    />
  );
}
