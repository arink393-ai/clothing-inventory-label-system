import { AppShell } from "@/components/app-shell";
import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
export const dynamic="force-dynamic";
export default async function DashboardLayout({children}:{children:React.ReactNode}){const supabase=await createClient();const {data:{user}}=await supabase.auth.getUser();if(!user)redirect("/login");const {data:member}=await supabase.from("store_members").select("role,stores(name)").eq("user_id",user.id).eq("active",true).maybeSingle();if(!member)redirect("/login?message="+encodeURIComponent("此帳號尚未加入門市，或已被店主停用。"));const store=Array.isArray(member.stores)?member.stores[0]:member.stores;return <AppShell storeName={store?.name||"門市"} role={member.role}>{children}</AppShell>}
