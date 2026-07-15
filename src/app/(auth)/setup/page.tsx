import { redirect } from "next/navigation";

export default function Setup() {
  redirect("/login?message=" + encodeURIComponent("此系統已完成門市設定，只接受店主建立的員工帳號。"));
}
