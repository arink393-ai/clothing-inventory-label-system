"use server";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

function message(text:string){return `/login?message=${encodeURIComponent(text)}`}
export async function login(formData:FormData){
  const email=String(formData.get("email")||"").trim(); const password=String(formData.get("password")||"");
  const supabase=await createClient(); const {error}=await supabase.auth.signInWithPassword({email,password});
  if(error) redirect(message("帳號或密碼不正確，請再試一次。")); redirect("/overview");
}
export async function logout(){const supabase=await createClient();await supabase.auth.signOut();redirect("/login")}
