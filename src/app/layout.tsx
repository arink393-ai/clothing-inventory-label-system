import type { Metadata, Viewport } from "next";
import "./globals.css";
import "./product.css";
import "./inventory.css";
import "./purchase.css";
import "./member.css";
import "./print.css";
import "./return.css";
import "./report.css";
import "./staff.css";

export const metadata: Metadata = {
  title: "幸せ服飾・智慧進銷存",
  description: "幸せ雜貨店內部使用的進銷存與銷售應用程式",
  applicationName: "幸せ智慧進銷存",
  manifest: "/manifest.webmanifest",
  robots: { index: false, follow: false, nocache: true },
  appleWebApp: { capable: true, statusBarStyle: "black-translucent", title: "幸せ進銷存" },
  formatDetection: { telephone: false },
};
export const viewport: Viewport = { width: "device-width", initialScale: 1, viewportFit: "cover", themeColor: "#24231f" };

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="zh-Hant"><body>{children}</body></html>;
}
