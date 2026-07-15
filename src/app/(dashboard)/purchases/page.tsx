import { PurchaseManager, type PurchaseProduct, type PurchaseRecord } from "@/components/purchase-manager";
import { HistoryFilters } from "@/components/history-filters";
import { HISTORY_PAGE_SIZE, parseHistoryParams, type HistorySearchParams } from "@/lib/history-query";
import { createClient } from "@/lib/supabase/server";

type RawProduct = { id:string;sku:string;barcode:string|null;color:string;size:string;products:{name:string;active:boolean}|{name:string;active:boolean}[];inventory_balances:{quantity:number}|{quantity:number}[]|null };
type RawPurchase = { id:string;document_no:string;supplier_document_no:string|null;completed_at:string|null;note:string;suppliers:{name:string}|{name:string}[]|null;purchase_items:{quantity:number}[] };
const dateTime = (value:string) => new Intl.DateTimeFormat("zh-TW", { dateStyle:"short", timeStyle:"short", timeZone:"Asia/Taipei" }).format(new Date(value));

export default async function Purchases({ searchParams }: { searchParams: Promise<HistorySearchParams> }) {
  const raw = await searchParams;
  const filter = parseHistoryParams(raw);
  const supabase = await createClient();
  const { data:{ user } } = await supabase.auth.getUser();
  const { data:member } = await supabase.from("store_members").select("store_id").eq("user_id",user!.id).eq("active",true).single();
  let historyQuery = supabase.from("purchases").select("id,document_no,supplier_document_no,completed_at,note,suppliers(name),purchase_items(quantity)", { count:"exact" }).eq("store_id",member!.store_id).eq("status","completed");
  if (filter.safe) historyQuery = historyQuery.or(`document_no.ilike.%${filter.safe}%,supplier_document_no.ilike.%${filter.safe}%,note.ilike.%${filter.safe}%`);
  if (filter.start) historyQuery = historyQuery.gte("completed_at",filter.start);
  if (filter.end) historyQuery = historyQuery.lt("completed_at",filter.end);
  const [{data:variants,error:productError},{data:purchases,count,error:purchaseError}] = await Promise.all([
    supabase.from("product_variants").select("id,sku,barcode,color,size,products!inner(name,active),inventory_balances(quantity)").eq("store_id",member!.store_id).eq("active",true).order("sku"),
    historyQuery.order("completed_at",{ascending:false}).order("id",{ascending:false}).range(filter.offset,filter.offset+HISTORY_PAGE_SIZE-1),
  ]);
  const products:PurchaseProduct[]=((variants||[]) as unknown as RawProduct[]).flatMap((v)=>{const p=Array.isArray(v.products)?v.products[0]:v.products;if(!p.active)return[];const b=Array.isArray(v.inventory_balances)?v.inventory_balances[0]:v.inventory_balances;return[{id:v.id,sku:v.sku,barcode:v.barcode||"",name:p.name,variant:[v.color,v.size].filter((x)=>x&&x!=="未指定").join(" / "),stock:Number(b?.quantity||0)}]});
  const records:PurchaseRecord[]=((purchases||[]) as unknown as RawPurchase[]).map((p)=>{const supplier=Array.isArray(p.suppliers)?p.suppliers[0]:p.suppliers;return{id:p.id,documentNo:p.document_no,supplierDocumentNo:p.supplier_document_no||"",completedAt:p.completed_at?dateTime(p.completed_at):"—",supplier:supplier?.name||"未填寫",lines:p.purchase_items.length,units:p.purchase_items.reduce((n,i)=>n+i.quantity,0),note:p.note}});
  const error=productError||purchaseError;
  return <><PurchaseManager products={products} records={records} message={raw.message||(error?"讀取進貨資料失敗："+error.message:undefined)}/><section className="panel history-filter-only"><HistoryFilters basePath="/purchases" q={filter.q} from={filter.from} to={filter.to} page={filter.page} pageSize={HISTORY_PAGE_SIZE} total={count||0} placeholder="搜尋進貨單號、廠商單號或備註…"/></section></>;
}
