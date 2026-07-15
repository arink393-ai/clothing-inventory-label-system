"use client";

import JsBarcode from "jsbarcode";
import { useEffect, useRef } from "react";

export function BarcodeSvg({ value, className, height = 38, fontSize = 12 }: { value: string; className?: string; height?: number; fontSize?: number }) {
  const ref = useRef<SVGSVGElement>(null);
  useEffect(() => {
    if (ref.current) JsBarcode(ref.current, value, { format: "CODE128", displayValue: true, fontSize, height, margin: 0, width: 1.5 });
  }, [value, height, fontSize]);
  return <svg ref={ref} className={className} aria-label={`條碼 ${value}`}/>;
}
