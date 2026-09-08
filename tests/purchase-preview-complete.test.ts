import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import React, { createElement } from "react";
import { PurchasePreviewTable } from "../components/PurchasePreviewTable";

describe("purchase review completeness", () => {
  it("lets the reviewer see rows beyond the old twelve-line cut-off", () => {
    const rows = Array.from({ length: 24 }, (_, i) => ({ sku: `QA-PART-${i + 1}`, partNumber: `PN-${i + 1}`, nameEn: "Test part", quantity: 1, cashPurchaseCostMinor: 100, riskTier: "low" }));
    const html = renderToStaticMarkup(createElement(PurchasePreviewTable, { rows }));
    expect(html).toContain("QA-PART-24");
    expect(html).not.toContain("first 12");
  });
});
