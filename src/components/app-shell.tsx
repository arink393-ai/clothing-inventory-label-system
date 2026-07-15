"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { BarChart3, Boxes, ClipboardList, LayoutDashboard, PackagePlus, RotateCcw, Settings, ShoppingCart, Users } from "lucide-react";
import { logout } from "@/app/(auth)/login/actions";

const nav=[
 ["/overview","營運總覽",LayoutDashboard,["owner","manager","cashier","stock_clerk"]],
 ["/products","商品管理",Boxes,["owner","manager","stock_clerk"]],
 ["/inventory","庫存管理",ClipboardList,["owner","manager","stock_clerk"]],
 ["/purchases","進貨入庫",PackagePlus,["owner","manager","stock_clerk"]],
 ["/sales","銷售結帳",ShoppingCart,["owner","manager","cashier"]],
 ["/members","會員管理",Users,["owner","manager","cashier"]],
 ["/returns","退貨處理",RotateCcw,["owner","manager","cashier"]],
 ["/reports","營運報表",BarChart3,["owner","manager"]],
 ["/settings","系統設定",Settings,["owner","manager","cashier","stock_clerk"]],
] as const;
const titles=Object.fromEntries(nav.map(([href,label])=>[href,label]));

function Navigation({role,mobile=false}:{role:string;mobile?:boolean}){
 const pathname=usePathname();
 return <nav className={mobile?"mobile-nav":"nav"} aria-label="主要功能">{nav.filter(([, , ,roles])=>roles.includes(role as never)).map(([href,label,Icon])=><Link key={href} href={href} className={`nav-link ${pathname===href?"active":""}`}><Icon aria-hidden/><span>{label}</span></Link>)}</nav>;
}
const roleLabel:Record<string,string>={owner:"店主",manager:"店長",cashier:"收銀員",stock_clerk:"庫存人員"};
export function AppShell({children,storeName,role}:{children:React.ReactNode;storeName:string;role:string}){
 const pathname=usePathname();
 return <div className="app-shell"><aside className="sidebar"><div className="brand"><span className="brand-mark">幸</span><div><strong>幸せ服飾・智慧進銷存</strong><small>SHIAWASE ERP</small></div></div><Navigation role={role}/><div className="sidebar-foot"><b>{storeName}</b><br/>{roleLabel[role]||role}<form action={logout}><button className="nav-logout">安全登出</button></form></div></aside><div className="page-wrap"><header className="topbar"><h1>{titles[pathname]||"智慧進銷存"}</h1><div className="status"><span className="status-dot"/>雲端已連線</div></header><main className="content">{children}</main><Navigation role={role} mobile/></div></div>;
}
