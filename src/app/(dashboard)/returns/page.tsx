import { ReturnManager, type RecentReturn, type ReturnOrder } from "@/components/return-manager";
import { createClient } from "@/lib/supabase/server";
import { HistoryFilters } from "@/components/history-filters";
import { HISTORY_PAGE_SIZE, parseHistoryParams, type HistorySearchParams } from "@/lib/history-query";

const dateTime = (value: string) => new Intl.DateTimeFormat("zh-TW", { dateStyle: "short", timeStyle: "short", timeZone: "Asia/Taipei" }).format(new Date(value));

export default async function Returns({ searchParams }: { searchParams: Promise<HistorySearchParams & { sale?: string }> }) {
  const raw = await searchParams;
  const { sale: rawSale = "", message } = raw;
  const filter = parseHistoryParams(raw);
  const saleCode = rawSale.trim();
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  const { data: member } = await supabase.from("store_members").select("store_id,role").eq("user_id", user!.id).eq("active", true).single();
  let recentQuery = supabase.from("sale_returns").select("id,document_no,sale_id,refund_method,refund_amount,reason,completed_at,created_by,sales(document_no),sale_return_items(quantity)", { count: "exact" }).eq("store_id", member!.store_id);
  if (filter.safe) recentQuery = recentQuery.or(`document_no.ilike.%${filter.safe}%,reason.ilike.%${filter.safe}%`);
  if (filter.start) recentQuery = recentQuery.gte("completed_at", filter.start);
  if (filter.end) recentQuery = recentQuery.lt("completed_at", filter.end);
  const [{ data: recentRows, count }, { data: approvalData }] = await Promise.all([
    recentQuery.order("completed_at", { ascending: false }).order("id", { ascending: false }).range(filter.offset, filter.offset + HISTORY_PAGE_SIZE - 1),
    supabase.rpc("get_approval_settings", { p_store_id: member!.store_id }),
  ]);
  const recent: RecentReturn[] = (recentRows || []).map((row) => {
    const originalSale = Array.isArray(row.sales) ? row.sales[0] : row.sales;
    return { id: row.id, documentNo: row.document_no, saleDocument: originalSale?.document_no || "—", completedAt: dateTime(row.completed_at), itemCount: row.sale_return_items?.length || 0, unitCount: row.sale_return_items?.reduce((sum, item) => sum + item.quantity, 0) || 0, refundAmount: Number(row.refund_amount), refundMethod: row.refund_method, reason: row.reason, actor: row.created_by === user!.id ? "我" : "門市人員" };
  });
  let order: ReturnOrder | undefined;
  let lookupError: string | undefined;
  if (saleCode) {
    const { data: saleRow, error } = await supabase.from("sales").select("id,document_no,completed_at,payment_method,subtotal,total,customers(name),sale_items(id,quantity,unit_price,product_variants(sku,color,size,products(name)))").eq("store_id", member!.store_id).eq("document_no", saleCode).eq("status", "completed").maybeSingle();
    if (error || !saleRow) {
      lookupError = `找不到已完成的銷貨單「${saleCode}」，請確認條碼或單號。`;
    } else {
      const { data: returnDocs } = await supabase.from("sale_returns").select("id,refund_amount").eq("sale_id", saleRow.id);
      const returnIds = (returnDocs || []).map((row) => row.id);
      const { data: returnedRows } = returnIds.length ? await supabase.from("sale_return_items").select("sale_item_id,quantity").in("return_id", returnIds) : { data: [] };
      const returnedByItem = new Map<string, number>();
      for (const row of returnedRows || []) returnedByItem.set(row.sale_item_id, (returnedByItem.get(row.sale_item_id) || 0) + row.quantity);
      const customer = Array.isArray(saleRow.customers) ? saleRow.customers[0] : saleRow.customers;
      order = {
        id: saleRow.id,
        documentNo: saleRow.document_no,
        completedAt: saleRow.completed_at ? dateTime(saleRow.completed_at) : "—",
        customer: customer?.name || "一般客人",
        paymentMethod: saleRow.payment_method,
        subtotal: Number(saleRow.subtotal),
        total: Number(saleRow.total),
        alreadyRefunded: (returnDocs || []).reduce((sum, row) => sum + Number(row.refund_amount), 0),
        items: saleRow.sale_items.map((item) => {
          const variant = Array.isArray(item.product_variants) ? item.product_variants[0] : item.product_variants;
          const product = Array.isArray(variant?.products) ? variant.products[0] : variant?.products;
          const returned = returnedByItem.get(item.id) || 0;
          return { id: item.id, name: product?.name || "商品", sku: variant?.sku || "", variant: [variant?.color, variant?.size].filter(Boolean).join(" / "), quantity: item.quantity, returned, available: Math.max(0, item.quantity - returned), unitPrice: Number(item.unit_price) };
        }),
      };
    }
  }
  const approval = approvalData as { return_threshold_amount?: number; pin_configured?: boolean } | null;
  return <><ReturnManager key={order?.id || saleCode || "lookup"} order={order} recent={recent} query={saleCode} message={message} lookupError={lookupError} role={member!.role} approval={{ returnThresholdAmount: Number(approval?.return_threshold_amount ?? 3000), pinConfigured: approval?.pin_configured === true }}/><section className="panel history-filter-only"><HistoryFilters basePath="/returns" q={filter.q} from={filter.from} to={filter.to} page={filter.page} pageSize={HISTORY_PAGE_SIZE} total={count || 0} placeholder="搜尋退貨單號或原因…"/></section></>;
}
