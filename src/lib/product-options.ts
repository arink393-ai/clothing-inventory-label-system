export const categories=[
 ["上衣","TOP"],["襯衫","SHT"],["T恤","TSH"],["針織衫","KNT"],["外套","JKT"],["洋裝","DRS"],
 ["下身","BTM"],["下褲","BTMS"],["短褲","SHTS"],["長褲","PNT"],["牛仔褲","DEN"],["裙子","SKT"],
 ["襪子","SOC"],["內衣","BRA"],["內褲","UND"],["睡衣／居家服","PJ"],["泳裝","SWM"],
 ["鞋子","SHO"],["包包","BAG"],["帽子","HAT"],["圍巾／手套","SCF"],["飾品","ACC"],
 ["生活雜貨","ZAK"],["雜貨","MSC"],["其他","OTH"],
] as const;
export const colors=["未指定","黑色","白色","灰色","米色","棕色","紅色","粉紅色","橘色","黃色","綠色","藍色","深藍色","紫色","金色","銀色","多色","其他"];
export const sizes=["未指定","XXS","XS","S","M","L","XL","XXL","3XL","F／均碼","童裝 90","童裝 100","童裝 110","童裝 120","童裝 130","童裝 140","其他"];
export const specifications=["一般款","短版","長版","寬鬆版","合身版","高腰","中腰","低腰","薄款","厚款","其他"];
export const categoryCode=(name:string)=>categories.find(([label])=>label===name)?.[1]||"OTH";
