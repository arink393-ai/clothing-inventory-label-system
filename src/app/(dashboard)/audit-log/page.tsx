import { HistoryFilters } from "@/components/history-filters";
import { PageHead } from "@/components/page-head";
import { HISTORY_PAGE_SIZE, parseHistoryParams, type HistorySearchParams } from "@/lib/history-query";
import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";

const dateTime=(value:string)=>new Intl.DateTimeFormat("zh-TW",{dateStyle:"short",timeStyle:"short",timeZone:"Asia/Taipei"}).format(new Date(value));
const actionLabel:Record<string,string>={insert:"新增",update:"修改",delete:"刪除",complete:"完成交易",receive:"進貨入庫",inventory_adjust:"庫存調整",inventory_count:"盤點差異",points_adjust:"人工調整點數",update_access:"變更帳號權限",approve_discount:"核准折扣",approve_large_return:"核准大額退貨",open_shift:"開班",close_shift:"結班",cash_expense:"現金支出",update_approval_settings:"更新核准規則"};
const entityLabel:Record<string,string>={products:"商品",product_variants:"商品規格",purchase:"進貨單",sale:"銷售單",sale_return:"退貨單",product_variant:"庫存",customer:"會員",store_member:"帳號權限",cash_shift:"交班",store:"門市設定"};

export default async function AuditLogPage({searchParams}:{searchParams:Promise<HistorySearchParams>}){
  const raw=await searchParams;const filter=parseHistoryParams(raw);const supabase=await createClient();const{data:{user}}=await supabase.auth.getUser();
  const{data:member}=await supabase.from("store_members").select("store_id,role").eq("user_id",user!.id).eq("active",true).single();
  if(!member||!["owner","manager"].includes(member.role))redirect("/overview");
  let query=supabase.from("audit_log").select("id,actor_id,action,entity_type,entity_id,details,created_at",{count:"exact"}).eq("store_id",member!.store_id);
  if(filter.safe)query=query.or(`action.ilike.%${filter.safe}%,entity_type.ilike.%${filter.safe}%`);
  if(filter.start)query=query.gte("created_at",filter.start);if(filter.end)query=query.lt("created_at",filter.end);
  const{data:rows,count,error}=await query.order("created_at",{ascending:false}).order("id",{ascending:false}).range(filter.offset,filter.offset+HISTORY_PAGE_SIZE-1);
  const actorIds=Array.from(new Set((rows||[]).map(row=>row.actor_id).filter((id):id is string=>Boolean(id))));
  const{data:profiles}=actorIds.length?await supabase.from("profiles").select("id,display_name").in("id",actorIds):{data:[]};
  const names=new Map((profiles||[]).map(profile=>[profile.id,profile.display_name]));
  return <><PageHead title="操作紀錄" description="查詢誰修改庫存、折扣、退貨、點數及帳號權限"/>{error&&<div className="notice page-notice">操作紀錄讀取失敗：{error.message}</div>}<section className="panel"><HistoryFilters basePath="/audit-log" q={filter.q} from={filter.from} to={filter.to} page={filter.page} pageSize={HISTORY_PAGE_SIZE} total={count||0} placeholder="搜尋動作或資料類型…"/><div className="table-wrap"><table><thead><tr><th>時間</th><th>操作者</th><th>動作</th><th>資料類型</th><th>識別碼</th><th>內容</th></tr></thead><tbody>{!rows?.length?<tr><td colSpan={6} className="empty">此範圍沒有操作紀錄</td></tr>:rows.map(row=><tr key={row.id}><td>{dateTime(row.created_at)}</td><td>{row.actor_id?names.get(row.actor_id)||"門市人員":"系統"}</td><td><span className="pill">{actionLabel[row.action]||row.action}</span></td><td>{entityLabel[row.entity_type]||row.entity_type}</td><td className="code">{row.entity_id?.slice(0,8)||"—"}</td><td><details className="audit-details"><summary>查看明細</summary><pre>{JSON.stringify(row.details,null,2)}</pre></details></td></tr>)}</tbody></table></div></section></>;
}
