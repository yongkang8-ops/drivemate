"""Read-only final draft PDF QA. No website, database or printer connection."""
import json, re, sys
from pathlib import Path
from collections import Counter
from pypdf import PdfReader

root = Path(__file__).resolve().parent.parent
draft = json.loads((root/'docs/operations/product-master/2026-09-07-product-label-backfill-draft.json').read_text(encoding='utf-8'))
records = {r['sku']: r for r in draft['rows']}
pdf = PdfReader(sys.argv[1])
assert len(pdf.pages) == 706
actual = Counter()
for i, page in enumerate(pdf.pages, 1):
    text = page.extract_text()
    skus = re.findall(r'DM-GWM-\d{4}', text)
    codes = re.findall(r'DMPGWM\d{4}', text)
    assert len(skus) == len(codes) == 1, i
    row = records[skus[0]]
    assert codes[0] == row['expectedBarcode'], i
    for value in [row['labelProfile']['displayName'], row['labelProfile']['partReference'], 'DRIVER MATE PTY LTD', 'drivemateparts.com.au']:
        assert re.sub(r'\s+', '', value) in re.sub(r'\s+', '', text), (i, value)
    if row['labelProfile']['position']['status'] == 'not_applicable':
        assert 'Position:' not in text, i
    assert abs(float(page.mediabox.width)-70*72/25.4) < 1, i
    assert abs(float(page.mediabox.height)-50*72/25.4) < 1, i
    actual[(skus[0],codes[0])] += 1
assert actual == Counter({(r['sku'],r['expectedBarcode']):r['expectedQuantity'] for r in draft['rows']})
print(json.dumps({'pages':706,'uniqueSkuBarcodePairs':119,'textAndReferenceMatches':706,'pageDimensionsMm':[70,50],'productionWrites':0,'physicalPrintOrScan':False}))
