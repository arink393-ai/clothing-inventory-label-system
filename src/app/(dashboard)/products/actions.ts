"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { categoryCode as defaultCategoryCode } from "@/lib/product-options";

const text=(v:FormDataEntryValue|null)=>String(v||"").trim();
const schema=z.object({
  productId:z.string().uuid().optional(),variantId:z.string().uuid().optional(),
  name:z.string().max(100).optional(),category:z.string().min(1,"請選擇分類"),categoryCode:z.string().max(6).optional(),
  productSku:z.string().max(40).optional(),variantSku:z.string().max(60).optional(),barcode:z.string().max(80).optional(),color:z.string().max(30),size:z.string().max(20),specification:z.string().max(30).optional(),
  price:z.coerce.number().min(0),cost:z.coerce.number().min(0),reorderPoint:z.coerce.number().int().min(0),openingStock:z.coerce.number().int().min(0).optional(),
  isConsignment:z.boolean().default(false),consignorName:z.string().max(80).optional(),commissionPercent:z.coerce.number().min(0).max(100).optional(),
}).superRefine((value,ctx)=>{if(value.isConsignment&&!value.consignorName?.trim())ctx.addIssue({code:"custom",message:"寄賣商品請填寫寄賣人／廠商"});if(value.isConsignment&&value.commissionPercent===undefined)ctx.addIssue({code:"custom",message:"寄賣商品請填寫門市抽成百分比"})});

async function context(){const supabase=await createClient();const {data:{user}}=await supabase.auth.getUser();if(!user)redirect("/login");const {data:member}=await supabase.from("store_members").select("store_id,role").eq("user_id",user.id).eq("active",true).single();if(!member||!["owner","manager","stock_clerk"].includes(member.role))throw new Error("您沒有管理商品的權限");return{supabase,user,storeId:member.store_id,role:member.role}}
function values(formData:FormData){return schema.parse({productId:text(formData.get("productId"))||undefined,variantId:text(formData.get("variantId"))||undefined,name:text(formData.get("name"))||undefined,category:text(formData.get("category"))||"其他",categoryCode:text(formData.get("categoryCode")).toUpperCase()||undefined,productSku:text(formData.get("productSku")).toUpperCase()||undefined,variantSku:text(formData.get("variantSku")).toUpperCase()||undefined,barcode:text(formData.get("barcode"))||undefined,color:text(formData.get("color"))||"未指定",size:text(formData.get("size"))||"未指定",specification:text(formData.get("specification"))||undefined,price:formData.get("price")||0,cost:formData.get("cost")||0,reorderPoint:formData.get("reorderPoint")||3,openingStock:formData.get("openingStock")||0,isConsignment:formData.get("isConsignment")==="true",consignorName:text(formData.get("consignorName"))||undefined,commissionPercent:text(formData.get("commissionPercent"))||undefined})}
function fail(message:string):never{redirect(`/products?message=${encodeURIComponent(message)}`)}
function customCode(name:string){let hash=0;for(const char of name)hash=(hash*31+char.charCodeAt(0))>>>0;return `C${hash.toString(36).toUpperCase().slice(0,5)}`}
async function savePhoto(supabase:Awaited<ReturnType<typeof createClient>>,storeId:string,productId:string,photo:FormDataEntryValue|null){if(!(photo instanceof File)||photo.size===0)return;const ext=(photo.name.split(".").pop()||"jpg").toLowerCase().replace(/[^a-z0-9]/g,"");const path=`${storeId}/${productId}/${crypto.randomUUID()}.${ext||"jpg"}`;const{error}=await supabase.storage.from("product-images").upload(path,photo,{contentType:photo.type||"image/jpeg",upsert:false});if(error)fail("商品已建立，但照片上傳失敗："+error.message);const{error:updateError}=await supabase.from("products").update({image_path:path}).eq("id",productId).eq("store_id",storeId);if(updateError)fail("照片已上傳，但商品照片連結失敗："+updateError.message)}

export async function createProduct(formData:FormData){
  let v;try{v=values(formData)}catch(e){if(e instanceof z.ZodError)fail(e.issues[0]?.message||"資料格式錯誤");throw e}
  const {supabase,user,storeId,role}=await context();
  const code=(v.categoryCode==="OTH"&&v.category!=="其他"?customCode(v.category):v.categoryCode||defaultCategoryCode(v.category)).toUpperCase();const token=`${Date.now().toString(36).toUpperCase()}${crypto.randomUUID().slice(0,3).toUpperCase()}`;const productSku=v.productSku||`${code}-${token}`;const variantSku=v.variantSku||`${productSku}-01`;const name=v.name||`待補資料商品・${v.barcode?.slice(-6)||token.slice(-6)}`;
  const {data:category,error:catError}=await supabase.from("categories").upsert({store_id:storeId,name:v.category,code},{onConflict:"store_id,name"}).select("id").single();
  if(catError||!category)fail("分類建立失敗："+(catError?.message||"未知錯誤"));
  const {data:product,error:productError}=await supabase.from("products").insert({store_id:storeId,category_id:category.id,sku:productSku,name,description:v.specification||"",is_consignment:v.isConsignment,consignor_name:v.isConsignment?v.consignorName:null,consignment_commission_percent:v.isConsignment?v.commissionPercent:null}).select("id").single();
  if(productError||!product)fail("商品建立失敗："+(productError?.message||"SKU 可能已存在"));
  const {data:variant,error:variantError}=await supabase.from("product_variants").insert({store_id:storeId,product_id:product.id,sku:variantSku,barcode:v.barcode||null,color:v.color,size:v.size,price:v.price,reorder_point:v.reorderPoint}).select("id").single();
  if(variantError||!variant){await supabase.from("products").delete().eq("id",product.id);fail("商品規格建立失敗："+(variantError?.message||"SKU 或條碼可能已存在"))}
  if((v.openingStock||0)>0){const {error}=await supabase.from("stock_movements").insert({store_id:storeId,variant_id:variant.id,movement_type:"opening",quantity:v.openingStock,reference_type:"opening",reference_id:product.id,note:"商品建立時的期初庫存",created_by:user.id});if(error)fail("商品已建立，但期初庫存失敗："+error.message)}
  if(role==="owner"&&v.cost>0){const{error}=await supabase.from("product_costs").insert({variant_id:variant.id,store_id:storeId,cost:v.cost,updated_by:user.id});if(error)fail("商品已建立，但成本儲存失敗："+error.message)}
  await savePhoto(supabase,storeId,product.id,formData.get("photo"));
  revalidatePath("/products");revalidatePath("/inventory");redirect("/products?message="+encodeURIComponent("商品建立成功"));
}

export async function updateProduct(formData:FormData){
  let v;try{v=values(formData)}catch(e){if(e instanceof z.ZodError)fail(e.issues[0]?.message||"資料格式錯誤");throw e}
  if(!v.productId||!v.variantId||!v.name||!v.productSku||!v.variantSku)fail("編輯商品時名稱與 SKU 不可空白");const{supabase,user,storeId,role}=await context();
  const code=(v.categoryCode==="OTH"&&v.category!=="其他"?customCode(v.category):v.categoryCode||defaultCategoryCode(v.category)).toUpperCase();const {data:category,error:catError}=await supabase.from("categories").upsert({store_id:storeId,name:v.category,code},{onConflict:"store_id,name"}).select("id").single();if(catError||!category)fail("分類更新失敗");
  const {error:pError}=await supabase.from("products").update({name:v.name,sku:v.productSku,category_id:category.id,description:v.specification||"",updated_at:new Date().toISOString(),is_consignment:v.isConsignment,consignor_name:v.isConsignment?v.consignorName:null,consignment_commission_percent:v.isConsignment?v.commissionPercent:null}).eq("id",v.productId).eq("store_id",storeId);if(pError)fail("商品更新失敗："+pError.message);
  const {error:vError}=await supabase.from("product_variants").update({sku:v.variantSku,barcode:v.barcode||null,color:v.color,size:v.size,price:v.price,reorder_point:v.reorderPoint}).eq("id",v.variantId).eq("store_id",storeId);if(vError)fail("規格更新失敗："+vError.message);
  if(role==="owner"){const{error}=await supabase.from("product_costs").upsert({variant_id:v.variantId,store_id:storeId,cost:v.cost,updated_by:user.id});if(error)fail("成本更新失敗："+error.message)}
  await savePhoto(supabase,storeId,v.productId,formData.get("photo"));
  revalidatePath("/products");redirect("/products?message="+encodeURIComponent("商品資料已更新"));
}

export async function toggleProduct(formData:FormData){const productId=text(formData.get("productId"));const active=text(formData.get("active"))==="true";const{supabase,storeId}=await context();const{error}=await supabase.from("products").update({active}).eq("id",productId).eq("store_id",storeId);if(error)fail("狀態更新失敗："+error.message);revalidatePath("/products")}
