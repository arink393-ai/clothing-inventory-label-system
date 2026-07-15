import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    id: "/",
    name: "幸せ服飾・智慧進銷存",
    short_name: "幸せ進銷存",
    description: "幸せ雜貨店內部使用的商品、庫存、銷售與營運管理應用程式",
    start_url: "/overview",
    scope: "/",
    display: "standalone",
    background_color: "#f3f1eb",
    theme_color: "#24231f",
    lang: "zh-Hant-TW",
    orientation: "any",
    categories: ["business", "productivity"],
    icons: [
      { src: "/icon.svg", sizes: "any", type: "image/svg+xml", purpose: "any" },
      { src: "/icon.svg", sizes: "any", type: "image/svg+xml", purpose: "maskable" },
    ],
  };
}
