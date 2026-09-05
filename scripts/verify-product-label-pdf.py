"""Read-only full-shipment print QA; run after product-label-batch.spec.ts.

Requires PyMuPDF. Never connects to a website or creates a business record.
"""
import argparse
import csv
import re
from collections import Counter
from pathlib import Path
import fitz

parser = argparse.ArgumentParser()
parser.add_argument("pdf", type=Path)
parser.add_argument("--render-dir", type=Path, required=True)
args = parser.parse_args()
root = Path(__file__).resolve().parent.parent

def rows(path):
    with path.open(encoding="utf-8-sig", newline="") as file:
        return list(csv.DictReader(file))

source = rows(root / "docs/operations/inbound/2026-09-03-gwm-706-unit-inbound-master-data-v3-lines.csv")
barcodes = {r["sku"]: r["barcode"] for r in rows(root / "docs/operations/product-master/2026-09-04-gwm-product-barcode-backfill.csv")}
expected = Counter({(r["sku"], barcodes[r["sku"]]): int(r["expected_quantity"]) for r in source})
actual = Counter()
document = fitz.open(args.pdf)
assert len(document) == 706
args.render_dir.mkdir(parents=True, exist_ok=True)
rendered_skus = set()
for index, page in enumerate(document):
    text = page.get_text()
    sku = re.findall(r"DM-GWM-\d{4}", text)
    barcode = re.findall(r"DMPGWM\d{4}", text)
    assert len(sku) == len(barcode) == 1, (index + 1, text)
    assert "DriveMate Parts" in text and "Sign in" not in text and "Print job" not in text
    assert abs(page.rect.width - 70 * 72 / 25.4) < 1
    assert abs(page.rect.height - 50 * 72 / 25.4) < 1
    assert len(page.get_drawings()) > 20, f"Missing barcode vector bars on page {index + 1}"
    for block in page.get_text("dict")["blocks"]:
        if "lines" in block:
            for line in block["lines"]:
                for span in line["spans"]:
                    assert page.rect.contains(fitz.Rect(span["bbox"])), (index + 1, span["text"])
    actual[(sku[0], barcode[0])] += 1
    if index in (0, 705) or (sku[0] in {"DM-GWM-0064", "DM-GWM-0065", "DM-GWM-0100"} and sku[0] not in rendered_skus):
        page.get_pixmap(dpi=203).save(args.render_dir / f"page-{index+1:03d}-{sku[0]}.png")
        rendered_skus.add(sku[0])
assert actual == expected, (actual - expected, expected - actual)
print("PASS: 706 PDF pages; 119 exact SKU/barcode quantity pairs; no blank/extra pages; 70x50mm; vector bars and contained text on every page. Hardware scan acceptance remains required.")
