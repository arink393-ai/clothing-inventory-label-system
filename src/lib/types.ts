export type Role = "owner" | "manager" | "cashier" | "stock_clerk";
export type Product = { id:string; sku:string; name:string; category:string; variant:string; stock:number; reorderPoint:number; price:number; cost:number; active:boolean };
export type StockMovement = { id:string; occurredAt:string; type:"purchase"|"sale"|"return"|"adjustment"; reference:string; product:string; quantity:number; actor:string };
