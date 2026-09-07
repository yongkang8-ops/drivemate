# Approved label v4 system scope

Authority: user approved the v4 label proof, then approved product-label system integration, immutable job compatibility, carton-only lookup feedback, local QA; requested moderate improvement of other labels. Physical printing is assigned to Australia and does not block local development.

## Fixed requirements
- Keep supplier/original packaging. Supplied by DriveMate Parts; vehicle application makes are separate from manufacturer identity.
- Product label 70 x 50 mm, white product name on black band, For vehicle makes, Position only when applicable, PART REF., SKU, Code 128 with existing products.barcode, DRIVER MATE PTY LTD and drivemateparts.com.au footer.
- No PACK QTY, DriveMate scan code, invented batch/origin/fitment, customer addresses or costs on product labels.
- Position is specified / not_applicable / unknown. Unknown never means universal/not_applicable. Data gaps block only the affected selection's new printing, not workspace navigation or unrelated products.
- New jobs freeze full content and layout version. Legacy jobs remain legacy, with no current-master reconstruction of historical labels.
- Find scope remains carton/group lookup. Invalid input has explicit accessible feedback; unsuccessful lookup preserves selection. Do not add SKU-to-carton search.
- Location labels retain DMLOC semantics and dimensions, improve identifier hierarchy and readability. Carton/dispatch definitions must truthfully represent their distinct purpose; neither currently has an operational printing route. Do not invent one or mislabel them as available.
- No carrier API, template editor, production migrations/data writes, push, deployment, SMTP/DNS/GST/payment/roles changes. Existing security and receipt gates stay intact.

## Data design
ProductLabelProfile schemaVersion 1 is nullable product metadata, with controlled English displayName, vehicleMakes array, partReference and discriminated position. Empty profile content may be saved as a draft; readiness is calculated when preparing a new label. No guessed fallback from product brand or name.

Persist profile as nullable products.label_profile JSONB through the existing protected product-master API. Migration is prepared locally only, no backfill. This makes a subsequent data review/approval required before live v4 jobs can be created for existing SKUs. Use dedicated warehouse-label product reads to avoid exposing prices or the admin state to warehouse users.

## Review basis
Approved local artwork: project deliverables/2026-09-06-product-label-content-review/output/pdf/DriveMate_Product_Labels_v4_REVIEW_SHEETS.pdf. Mock/fixture products are not production data. Previously confirmed 119-SKU source data is reference material, not an automatic metadata backfill authorization.
