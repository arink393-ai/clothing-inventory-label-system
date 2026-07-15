import type { Product, StockMovement } from "./types";
export const products: Product[] = [
 {id:"1",sku:"TOP-0001-BLK-M",name:"羅紋短版上衣",category:"上衣",variant:"黑 / M",stock:12,reorderPoint:4,price:490,cost:210,active:true},
 {id:"2",sku:"DRS-0003-BEI-F",name:"亞麻綁帶洋裝",category:"洋裝",variant:"米色 / F",stock:3,reorderPoint:4,price:1280,cost:560,active:true},
 {id:"3",sku:"PNT-0008-NVY-L",name:"高腰寬褲",category:"褲裝",variant:"深藍 / L",stock:8,reorderPoint:3,price:890,cost:390,active:true},
 {id:"4",sku:"ACC-0012-GLD",name:"金色細鍊項鍊",category:"飾品",variant:"金色",stock:2,reorderPoint:5,price:390,cost:105,active:true},
];
export const movements: StockMovement[] = [
 {id:"1",occurredAt:"今日 14:32",type:"sale",reference:"SO-20260715-018",product:"羅紋短版上衣・黑 / M",quantity:-1,actor:"王小美"},
 {id:"2",occurredAt:"今日 13:10",type:"purchase",reference:"PO-20260715-004",product:"亞麻綁帶洋裝・米色 / F",quantity:6,actor:"林店長"},
 {id:"3",occurredAt:"今日 11:48",type:"return",reference:"RT-20260715-002",product:"高腰寬褲・深藍 / L",quantity:1,actor:"王小美"},
];
export const money=(n:number)=>new Intl.NumberFormat("zh-TW",{style:"currency",currency:"TWD",maximumFractionDigits:0}).format(n);
