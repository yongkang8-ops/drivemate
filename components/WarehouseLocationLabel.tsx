"use client";
import { useLayoutEffect, useRef } from "react";
import JsBarcode from "jsbarcode";
export function WarehouseLocationLabel({ locationCode, barcode }: { locationCode: string; barcode: string }) {
  const ref = useRef<SVGSVGElement>(null);
  useLayoutEffect(() => {
    if (ref.current) JsBarcode(ref.current, barcode, { format: "CODE128", displayValue: false, height: 46, width: 1, margin: 0, marginLeft: 10, marginRight: 10, background: "#ffffff", lineColor: "#000000" });
  }, [barcode]);
  return <article className="inventory-location-label location-label-v2" aria-label={`Location label for ${locationCode}`}>
    <div className="location-label-heading"><strong>DriveMate Parts</strong><span>WAREHOUSE LOCATION</span></div>
    <code>{locationCode}</code><svg ref={ref} preserveAspectRatio="none" aria-label={`Code 128 barcode ${barcode}`} role="img" />
    <small>{barcode}</small><div className="location-label-purpose">Scan to identify location</div>
  </article>;
}
