"use client";

import { createPortal } from "react-dom";
import { WarehouseProductLabel } from "./WarehouseProductLabel";
import type { ProductLabelPage } from "../lib/productLabelBatch";

export function ProductLabelPrintBatch({ jobId, labels }: { jobId: string; labels: ProductLabelPage[] }) {
  return createPortal(<div className="warehouse-product-print-batch" data-job-id={jobId} aria-hidden="true">
    {labels.map(label => <WarehouseProductLabel key={label.itemId} label={label} />)}
  </div>, document.body);
}
