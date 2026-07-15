"use client";

type ReportData = {
  summary: Record<string, number | null>;
  top_products: Array<{ name: string; net_units: number; net_sales: number }>;
  payments: Array<{ method: string; amount: number }>;
  daily: Array<{ day: string; amount: number }>;
};

const labels: Record<string, string> = { cash: "現金", card: "信用卡", transfer: "銀行轉帳", line_transfer: "LINE 轉帳" };
const cell = (value: string | number | null | undefined) => `"${String(value ?? "").replaceAll('"', '""')}"`;

export function ReportExportButton({ report, from, to }: { report: ReportData; from: string; to: string }) {
  function download() {
    const rows: Array<Array<string | number | null>> = [
      ["幸せ智慧進銷存營運報表", `${from}～${to}`],
      [],
      ["摘要", "數值"],
      ["銷售總額", report.summary.gross_sales],
      ["退貨退款", report.summary.refunds],
      ["淨營業額", report.summary.net_sales],
      ["訂單數", report.summary.orders],
      ["平均客單", report.summary.average_order],
      ["銷貨毛利", report.summary.gross_profit],
      ["毛利率", report.summary.gross_margin == null ? "" : `${report.summary.gross_margin}%`],
      [],
      ["暢銷商品", "淨銷售件數", "淨銷售額"],
      ...report.top_products.map((item) => [item.name, item.net_units, item.net_sales]),
      [],
      ["付款方式", "淨收款"],
      ...report.payments.map((item) => [labels[item.method] || item.method, item.amount]),
      [],
      ["日期", "淨營業額"],
      ...report.daily.map((item) => [item.day, item.amount]),
    ];
    const csv = "\uFEFF" + rows.map((row) => row.map(cell).join(",")).join("\r\n");
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = `營運報表_${from}_${to}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  }
  return <button className="btn" type="button" onClick={download}>下載 CSV 報表</button>;
}
