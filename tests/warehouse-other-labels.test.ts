import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { expect, it } from "vitest";
import { WarehouseLocationLabel } from "../components/WarehouseLocationLabel";
import { WAREHOUSE_LABEL_TEMPLATES } from "../lib/warehouseLabels";
it("keeps the complete location identifier and reserved barcode without product fields", () => {
  const markup = renderToStaticMarkup(createElement(WarehouseLocationLabel, { locationCode: "BNE-R01-L01-S01", barcode: "DMLOC:BNE-R01-L01-S01" }));
  for (const text of ["WAREHOUSE LOCATION", "BNE-R01-L01-S01", "DMLOC:BNE-R01-L01-S01", "Scan to identify location"]) expect(markup).toContain(text);
  for (const text of ["Printed", "Received", "PART REF.", "quantity"]) expect(markup).not.toContain(text);
});
it("distinguishes operational labels from definition-only templates", () => {
  expect(WAREHOUSE_LABEL_TEMPLATES.receiving_carton).toMatchObject({ availability: "definition_only" });
  expect(WAREHOUSE_LABEL_TEMPLATES.dispatch_shipping).toMatchObject({ availability: "definition_only" });
  expect(WAREHOUSE_LABEL_TEMPLATES.bin_location).toMatchObject({ availability: "operational" });
  expect(WAREHOUSE_LABEL_TEMPLATES.receiving_carton.visibleFields).toContain("expected_quantity");
  expect(WAREHOUSE_LABEL_TEMPLATES.receiving_carton.visibleFields).not.toContain("received_date");
});
