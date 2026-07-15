"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { z } from "zod";

export async function updateDisplayName(formData:FormData){
 const displayName=String(formData.get("displayName")||"").trim();
 if(!displayName||displayName.length>40)redirect("/settings?message="+encodeURIComponent("顯示名稱請輸入 1～40 個字"));
 const supabase=await createClient();const{data:{user}}=await supabase.auth.getUser();if(!user)redirect("/login");
 const{error}=await supabase.from("profiles").update({display_name:displayName}).eq("id",user.id);
 if(error)redirect("/settings?message="+encodeURIComponent("姓名更新失敗："+error.message));
 await supabase.auth.updateUser({data:{display_name:displayName}});
 revalidatePath("/overview");revalidatePath("/settings");redirect("/settings?message="+encodeURIComponent("顯示名稱已更新"));
}

export async function updatePointsSettings(formData: FormData) {
 const parsed=z.object({spendAmount:z.coerce.number().positive("消費門檻必須大於 0"),pointValue:z.coerce.number().positive("折抵金額必須大於 0"),enabled:z.coerce.boolean()}).safeParse({spendAmount:formData.get("spendAmount"),pointValue:formData.get("pointValue"),enabled:formData.get("enabled")==="true"});
 if(!parsed.success)redirect("/settings?message="+encodeURIComponent(parsed.error.issues[0]?.message||"點數規則格式錯誤"));
 const supabase=await createClient();const{data:{user}}=await supabase.auth.getUser();if(!user)redirect("/login");
 const{data:member}=await supabase.from("store_members").select("store_id,role").eq("user_id",user.id).eq("active",true).single();
 if(!member||member.role!=="owner")redirect("/settings?message="+encodeURIComponent("只有店主可以修改點數規則"));
 const{error}=await supabase.rpc("update_points_settings",{p_store_id:member.store_id,p_spend_amount:parsed.data.spendAmount,p_point_value:parsed.data.pointValue,p_enabled:parsed.data.enabled});
 if(error)redirect("/settings?message="+encodeURIComponent("點數規則更新失敗："+error.message));
 revalidatePath("/settings");revalidatePath("/members");revalidatePath("/sales");
 redirect("/settings?message="+encodeURIComponent("會員點數規則已更新"));
}

function settingsMessage(text: string): never {
 redirect("/settings?message="+encodeURIComponent(text));
}

export async function createStaffAccount(formData: FormData) {
 const parsed=z.object({displayName:z.string().trim().min(1,"請輸入員工名稱").max(40),email:z.string().trim().email("Email 格式不正確"),password:z.string().min(8,"初始密碼至少需要 8 個字元"),confirm:z.string(),role:z.enum(["manager","cashier","stock_clerk"])}).refine((value)=>value.password===value.confirm,{message:"兩次輸入的密碼不一致"}).safeParse({displayName:formData.get("displayName"),email:formData.get("email"),password:formData.get("password"),confirm:formData.get("confirm"),role:formData.get("role")});
 if(!parsed.success)settingsMessage(parsed.error.issues[0]?.message||"員工帳號資料格式錯誤");
 const supabase=await createClient();const{data:{user}}=await supabase.auth.getUser();if(!user)redirect("/login");
 const{data,error}=await supabase.functions.invoke("manage-staff",{body:{action:"create",...parsed.data}});
 const result=data as {ok?:boolean;error?:string}|null;
 if(error||!result?.ok)settingsMessage(result?.error||"無法連線帳號管理服務，請稍後再試");
 revalidatePath("/settings");settingsMessage("員工帳號已建立，請將初始密碼安全地交給本人");
}

export async function updateStaffAccess(formData: FormData) {
 const parsed=z.object({userId:z.string().uuid(),role:z.enum(["manager","cashier","stock_clerk"]),active:z.enum(["true","false"])}).safeParse({userId:formData.get("userId"),role:formData.get("role"),active:formData.get("active")});
 if(!parsed.success)settingsMessage("員工權限資料格式錯誤");
 const supabase=await createClient();const{data:{user}}=await supabase.auth.getUser();if(!user)redirect("/login");
 const{error}=await supabase.rpc("update_staff_access",{p_user_id:parsed.data.userId,p_role:parsed.data.role,p_active:parsed.data.active==="true"});
 if(error)settingsMessage("權限更新失敗："+error.message);
 revalidatePath("/settings");settingsMessage("員工角色與帳號狀態已更新");
}

export async function resetStaffPassword(formData: FormData) {
 const parsed=z.object({userId:z.string().uuid(),password:z.string().min(8,"新密碼至少需要 8 個字元"),confirm:z.string()}).refine((value)=>value.password===value.confirm,{message:"兩次輸入的密碼不一致"}).safeParse({userId:formData.get("userId"),password:formData.get("password"),confirm:formData.get("confirm")});
 if(!parsed.success)settingsMessage(parsed.error.issues[0]?.message||"密碼格式錯誤");
 const supabase=await createClient();const{data:{user}}=await supabase.auth.getUser();if(!user)redirect("/login");
 const{data,error}=await supabase.functions.invoke("manage-staff",{body:{action:"reset_password",userId:parsed.data.userId,password:parsed.data.password}});
 const result=data as {ok?:boolean;error?:string}|null;
 if(error||!result?.ok)settingsMessage(result?.error||"無法連線帳號管理服務，請稍後再試");
 settingsMessage("員工密碼已重設，請安全地通知本人");
}

export async function updateMyPassword(formData: FormData) {
 const parsed=z.object({password:z.string().min(8,"新密碼至少需要 8 個字元"),confirm:z.string()}).refine((value)=>value.password===value.confirm,{message:"兩次輸入的密碼不一致"}).safeParse({password:formData.get("password"),confirm:formData.get("confirm")});
 if(!parsed.success)settingsMessage(parsed.error.issues[0]?.message||"密碼格式錯誤");
 const supabase=await createClient();const{data:{user}}=await supabase.auth.getUser();if(!user)redirect("/login");
 const{error}=await supabase.auth.updateUser({password:parsed.data.password});
 if(error)settingsMessage("密碼更新失敗："+error.message);
 settingsMessage("您的登入密碼已更新");
}
