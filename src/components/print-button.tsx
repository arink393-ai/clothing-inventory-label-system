"use client";

export function PrintButton({ format, children }: { format: "receipt-80" | "receipt-a4"; children: React.ReactNode }) {
  function print() {
    const style = document.createElement("style");
    style.textContent = format === "receipt-80" ? "@page{size:80mm auto;margin:3mm}" : "@page{size:A4;margin:12mm}";
    document.head.appendChild(style);
    document.body.classList.add(`printing-${format}`);
    const cleanup = () => { document.body.classList.remove(`printing-${format}`); style.remove(); };
    window.addEventListener("afterprint", cleanup, { once: true });
    window.print();
    window.setTimeout(cleanup, 1000);
  }
  return <button className="btn primary" type="button" onClick={print}>{children}</button>;
}
