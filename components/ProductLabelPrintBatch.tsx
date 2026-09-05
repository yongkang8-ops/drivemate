"use client";

import { createPortal } from "react-dom";
import { useLayoutEffect, useRef } from "react";
import JsBarcode from "jsbarcode";
import type { ProductLabelPage } from "../lib/productLabelBatch";

function PrintedProductLabel({ label }: { label: ProductLabelPage }) {
  const barcodeRef = useRef<SVGSVGElement>(null);
  // Layout effects complete inside flushSync, before the native print call.
  useLayoutEffect(() => {
    if (!barcodeRef.current) return;
    JsBarcode(barcodeRef.current, label.barcode, {
      format: "CODE128", displayValue: false, height: 48, width: 1,
      margin: 0, marginLeft: 10, marginRight: 10,
      background: "#ffffff", lineColor: "#000000",
    });
  }, [label.barcode]);
  return <article className="inbound-product-label" data-item-id={label.itemId} data-sequence={label.sequence}>
    <strong>DriveMate Parts</strong>
    <span>Unit product label</span>
    <code>SKU {label.sku}</code>
    <svg ref={barcodeRef} aria-label={`Code 128 barcode ${label.barcode}`} role="img" />
    <code>{label.barcode}</code>
  </article>;
}

export function ProductLabelPrintBatch({ jobId, labels }: { jobId: string; labels: ProductLabelPage[] }) {
  return createPortal(<div className="warehouse-product-print-batch" data-job-id={jobId} aria-hidden="true">
    {labels.map(label => <PrintedProductLabel key={label.itemId} label={label} />)}
  </div>, document.body);
}
