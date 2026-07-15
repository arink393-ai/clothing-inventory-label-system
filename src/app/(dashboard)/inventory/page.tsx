import { HistoryFilters } from "@/components/history-filters";
import { InventoryManager, type InventoryMovement, type InventoryProduct } from "@/components/inventory-manager";
import { HISTORY_PAGE_SIZE, parseHistoryParams, type HistorySearchParams } from "@/lib/history-query";
import { createClient } from "@/lib/supabase/server";

type RawProduct={id:string;sku:string;barcode:string|null;color:string;size:string;active:boolean;products:{name:string;active:boolean}|{name:string;active:boolean}[];inventory_balances:{quantity:number}|{quantity:number}[]|null};
type RawMovement={id:string;created_at:string;movement_type:string;reference_type:string;quantity:number;note:string;product_variants:{sku:string;color:string;size:string;products:{name:string}|{name:string}[]}|{sku:string;color:string;size:string;products:{name:string}|{name:string}[]}[]};
const dateTime=(value:string)=>new Intl.DateTimeFormat("zh-TW",{dateStyle:"short",timeStyle:"short",timeZone:"Asia/Taipei"}).format(new Date(value));

export default async function Inventory({searchParams}:{searchParams:Promise<HistorySearchParams>}){
  const raw=await searchParams;const filter=parseHistoryParams(raw);const supabase=await createClient();const{data:{user}}=await supabase.auth.getUser();
  const{data:member}=await supabase.from("store_members").select("store_id").eq("user_id",user!.id).eq("active",true).single();
  let movementQuery=supabase.from("stock_movements").select("id,created_at,movement_type,reference_type,quantity,note,product_variants!inner(sku,color,size,products!inner(name))",{count:"exact"}).eq("store_id",member!.store_id);
  if(filter.safe)movementQuery=movementQuery.or(`note.ilike.%${filter.safe}%,reference_type.ilike.%${filter.safe}%,movement_type.ilike.%${filter.safe}%`);
  if(filter.start)movementQuery=movementQuery.gte("created_at",filter.start);if(filter.end)movementQuery=movementQuery.lt("created_at",filter.end);
  const[{data:variants,error:productError},{data:movementData,count,error:movementError}]=await Promise.all([
    supabase.from("product_variants").select("id,sku,barcode,color,size,active,products!inner(name,active),inventory_balances(quantity)").eq("store_id",member!.store_id).eq("active",true).order("sku"),
    movementQuery.order("created_at",{ascending:false}).order("id",{ascending:false}).range(filter.offset,filter.offset+HISTORY_PAGE_SIZE-1),
  ]);
  const products:InventoryProduct[]=((variants||[]) as unknown as RawProduct[]).flatMap(v=>{const p=Array.isArray(v.products)?v.products[0]:v.products;if(!p.active)return[];const b=Array.isArray(v.inventory_balances)?v.inventory_balances[0]:v.inventory_balances;return[{id:v.id,sku:v.sku,barcode:v.barcode||"",name:p.name,variant:[v.color,v.size].filter(x=>x&&x!=="未指定").join(" / "),stock:Number(b?.quantity||0)}]});
  const movements:InventoryMovement[]=((movementData||[]) as unknown as RawMovement[]).map(m=>{const v=Array.isArray(m.product_variants)?m.product_variants[0]:m.product_variants;const p=Array.isArray(v.products)?v.products[0]:v.products;return{id:m.id,createdAt:dateTime(m.created_at),type:m.movement_type,reference:m.reference_type,product:`${p.name}・${[v.color,v.size].filter(x=>x&&x!=="未指定").join(" / ")||v.sku}`,quantity:m.quantity,note:m.note}});
  const error=productError||movementError;
  return <><InventoryManager products={products} movements={movements} message={raw.message||(error?"讀取庫存失敗："+error.message:undefined)}/><section className="panel history-filter-only"><HistoryFilters basePath="/inventory" q={filter.q} from={filter.from} to={filter.to} page={filter.page} pageSize={HISTORY_PAGE_SIZE} total={count||0} placeholder="搜尋異動類型或備註…"/></section></>;
}
