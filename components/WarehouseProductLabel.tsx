"use client";
import { useLayoutEffect, useRef } from "react";
import JsBarcode from "jsbarcode";
import type { ProductLabelPage } from "../lib/productLabelBatch";
export function WarehouseProductLabel({ label }: { label: ProductLabelPage }) {
  const barcodeRef = useRef<SVGSVGElement>(null);
  useLayoutEffect(() => {
    if (barcodeRef.current) JsBarcode(barcodeRef.current, label.barcode, {
      format: "CODE128", displayValue: false, height: 48, width: 1,
      margin: 0, marginLeft: 10, marginRight: 10, background: "#ffffff", lineColor: "#000000",
    });
  }, [label.barcode]);
  const content = label.labelContent;
  const barcode = <svg ref={barcodeRef} preserveAspectRatio={content ? "none" : undefined} aria-label={`Code 128 barcode ${label.barcode}`} role="img" />;
  if (!content) return <article className="inbound-product-label" data-item-id={label.itemId} data-sequence={label.sequence}>
    <strong>DriveMate Parts</strong><span>Unit product label</span><code>SKU {label.sku}</code>{barcode}<code>{label.barcode}</code>
  </article>;
  return <article className="product-label-v4" data-item-id={label.itemId} data-sequence={label.sequence} data-label-version={content.version} aria-label={`Product label for ${label.sku}`}>
    <div className="product-label-supplier">Supplied by <b>DriveMate Parts</b></div>
    <div className="product-label-makes">{`For ${content.profile.vehicleMakes.join(" / ")}`}</div>
    <div className="product-label-name">{content.profile.displayName}</div>
    {content.profile.position.status === "specified" ? <div className="product-label-position"><b>Position:</b> {content.profile.position.value}</div> : null}
    <div className="product-label-ref"><b>PART REF.</b> {content.profile.partReference}</div>
    <div className="product-label-sku"><b>SKU</b> {label.sku}</div>
    {barcode}<div className="product-label-code">{label.barcode}</div>
    <div className="product-label-footer"><div>{content.companyName}</div><div>{content.website}</div></div>
  </article>;
}
