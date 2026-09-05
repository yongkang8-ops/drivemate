# Product label batch output — local QA

Date: 2026-09-05. Base: `e6a32cb11cdd8a6fc2eccba1d320004d62edad18`.
Local branch: `hotfix/product-label-batch-output-20260905`.
Status: local implementation and QA complete; no commit, GitHub push or deployment performed in this task.

## Scope and evidence

- Reproduced the original failure in the real local Warehouse page: an audited 18-label job printed one first-SKU sample, not 12 + 6 labels. The regression failed with `Expected length: 18 / Received length: 1` before implementation.
- The create/reprint APIs already return immutable item snapshots. The client ignored `items` and called `window.print()` on the sample-only page. Fixed-position print CSS also prevented a proper paginated batch.
- A separate repository test reproduced a future large-job truncation: a 2,201-item audit returned only the first service-capped 1,000 (or 37) rows. Added count-driven paginated reads in `getWarehouseLabelPrintJob`, with later-page errors propagated.

## Implemented behavior

1. Validate job/template/status, expected item count, unique item IDs, contiguous sequence, job/shipment ownership, non-empty SKU and printable product barcodes before preparing output.
2. Print from saved item snapshots, ordered by persisted sequence. Do not reconstruct a job from current screen selection or mutable product master data. Reprints use their own returned items.
3. Render a dedicated body-level print batch, separate from the screen preview. Finish SVG barcode layout before invoking native print. One item per 70 × 50 mm page; no public/internal shell in output and no trailing blank page.
4. Side sample explicitly says first SKU only. Printed SKU is labelled `SKU`, not supplier `Part No.`. Print guidance specifies 70 × 50 mm paper, 100% scale, no headers/footers and Copies = 1.
5. Output failure leaves the created task pending and cancellable, with `Confirm printed` unavailable. Opening/closing a print dialog never marks a job Printed automatically.
6. Preview cannot replace an unresolved job's outcome controls. A read-only History visit clears the printable document but retains the pending outcome action. Scope changes clear stale print documents.
7. Current reprint UI remains whole-job reprint with a mandatory reason. No template editor, carton/dispatch label module or SKU-level reprint picker was added.

## Fresh verification

| Check | Result |
| --- | --- |
| `npm.cmd test` | 61 files passed; 305 tests passed, 1 existing test skipped |
| `npm.cmd run typecheck` | Passed |
| `npm.cmd run build` | Passed; 60 static pages generated |
| `npx.cmd playwright test tests/product-label-batch.spec.ts tests/warehouse-label-print.spec.ts --reporter=line` | 10 passed |
| `scripts/verify-product-label-pdf.py` on the full-shipment PDF | Passed; 706 pages; 119 exact SKU/barcode quantity pairs; 70 × 50 mm; vector bars and contained text on every page |
| Browser print sizing | 18-page mixed SKU, 18-page reprint, 24-page selected scope, 42-page full demo shipment and 706-page authoritative-source fixture passed |
| Quantity aggregation | Same SKU across source cartons sums once correctly; both real carton groups each produce 10 labels, not carton-count multiples |
| Responsive checks | 390/768/1440px full-shipment page without horizontal document overflow; existing print-card suite also covers 701/880/1040/1600px |
| Visual review | 203 dpi PDF renders inspected for first/last labels, carton-group SKU and 34# SKU; no clipped text, overlays or missing barcode bars |

Browser print calls are intercepted in local tests. Local integration cases use the in-memory repository; the 706-label case substitutes only the external API boundary with a complete fixture generated from the approved v3 source CSV and barcode backfill CSV. It does **not** create a Production print job. PDF text/geometry/vector checks do not establish physical scan reliability.

Test output PDFs/screenshots remain in ignored `test-results/`. Reproduce full-source PDF QA after the browser suite:

```powershell
python scripts/verify-product-label-pdf.py 'test-results/product-label-batch-the-fu-c8588-ncluding-both-carton-groups-edge/full-shipment-706-labels.pdf' --render-dir 'test-results/product-label-visual'
```

Observed non-blocking runner output: inherited `NO_COLOR` / `FORCE_COLOR` warnings and Git LF/CRLF conversion warnings. No test assertion/build failure remains.

## Unchanged state and release gate

- No Production requests, database migration, business-data write, real print, Printed confirmation, receipt, stock movement, staff action, environment change or release.
- Existing untracked `AGENTS.md`, `CLAUDE.md` and the P1F Production release report were preserved.
- Existing 70 × 50 mm basic label content is retained apart from correctly naming the internal SKU. Product description/OEM/batch/template-editing work remains outside this hotfix.
- The previously delivered human guide describes the deployed version, so its L03 blocker remains valid until this fix is deployed and verified. Do not mark Production L03 as passed from local QA.
- Next: obtain separate commit/push/Production release authorization; deploy a fresh Production build with unchanged existing Production configuration and a recorded rollback point. Then run read-only checks and an explicitly agreed small physical print test. Confirm Printed only for correctly printed real labels; receive and put away only actual goods.

Method: `systematic-debugging` established both root causes; `test-driven-development` preserved red/green regressions; `verification-before-completion` required fresh full test/build evidence; `pdf` guided rendered-page inspection.
