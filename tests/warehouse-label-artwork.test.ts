import { expect, it } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { WarehouseProductLabel } from "../components/WarehouseProductLabel";
import { buildProductLabelContent } from "../lib/warehouseLabelContent";
it("prints brand compatibility, black title, part reference and company; hides inapplicable Position", () => {
  const { content } = buildProductLabelContent({ sku: "SKU1", barcode: "DMPGWM0001", labelProfile: { schemaVersion: 1, displayName: "OIL FILTER", vehicleMakes: ["Toyota"], partReference: "F123", position: { status: "not_applicable" } } });
  const markup = renderToStaticMarkup(createElement(WarehouseProductLabel, { label: { itemId: "1", sequence: 1, sku: "SKU1", barcode: "DMPGWM0001", labelContent: content } }));
  for (const text of ["For Toyota", "product-label-name", "OIL FILTER", "PART REF.", "F123", "DRIVER MATE PTY LTD", "drivemateparts.com.au"]) expect(markup).toContain(text);
  for (const text of ["Position:", "PACK QTY", "DRAFT", "SCAN CODE"]) expect(markup).not.toContain(text);
});
it("retains the explicit legacy representation for older snapshots", () => {
  const markup = renderToStaticMarkup(createElement(WarehouseProductLabel, { label: { itemId: "1", sequence: 1, sku: "SKU1", barcode: "DMPGWM0001" } }));
  expect(markup).toContain("Unit product label"); expect(markup).not.toContain("PART REF.");
});
