import { expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import draft from '../docs/operations/product-master/2026-09-07-product-label-backfill-draft.json';
import { buildProductLabelContent } from '../lib/warehouseLabelContent';
import { productLabelProfileSchema } from '../lib/productLabelProfile';
import { prepareProductLabelBatch } from '../lib/productLabelBatch';
import { WarehouseProductLabel } from '../components/WarehouseProductLabel';
import { prepareWarehouseReceipt } from '../lib/warehouseReceiving';

const csv=(file:string)=> { const [h,...rs]=readFileSync(file,'utf8').trim().replace(/^\uFEFF/,'').split(/\r?\n/).map(r=>r.split(',')); return rs.map(r=>Object.fromEntries(h.map((k,i)=>[k,r[i]]))); };
const canonical=csv('docs/operations/inbound/2026-09-03-gwm-706-unit-inbound-master-data-v3-lines.csv');
const barcodes=csv('docs/operations/product-master/2026-09-04-gwm-product-barcode-backfill.csv');
const scope={ shipmentId:draft.shipmentId,cartonNumbers:[...new Set(draft.rows.map(r=>r.sourceScope))],lines:draft.rows.map(r=>({sku:r.sku,productBarcode:r.expectedBarcode,expectedQuantity:r.expectedQuantity})) };

it('keeps the original 119 SKU/PN/barcode identities and 706 quantities while patching only label_profile',()=>{
  expect(draft.rows).toHaveLength(119); expect(draft.rows.reduce((n,r)=>n+r.expectedQuantity,0)).toBe(706);
  expect(new Set(draft.rows.map(r=>r.expectedBarcode)).size).toBe(119);
  expect(scope.cartonNumbers).toHaveLength(35); expect(draft.productionWriteAuthorized).toBe(false);
  for(const r of draft.rows){
    const original=canonical.find(c=>c.sku===r.sku)!; const b=barcodes.find(c=>c.sku===r.sku)!;
    expect([r.expectedOriginalPn,r.expectedQuantity,r.sourceScope,r.expectedBarcode]).toEqual([original.part_number,+original.expected_quantity,original.source_scope_number,b.barcode]);
    expect(Object.keys(r.permittedProductPatch)).toEqual(['label_profile']);
    expect(r.permittedProductPatch.label_profile).toEqual(r.labelProfile);
  }
});
it('renders all 119 real content profiles without inventing position or losing the canonical barcode',()=>{
  for(const r of draft.rows){
    const ready=buildProductLabelContent({sku:r.sku,barcode:r.expectedBarcode,labelProfile:productLabelProfileSchema.parse(r.labelProfile)});
    expect(ready.issues,r.sku).toEqual([]);
    const html=renderToStaticMarkup(createElement(WarehouseProductLabel,{label:{itemId:r.sku,sequence:1,sku:r.sku,barcode:r.expectedBarcode,labelContent:ready.content}}));
    for(const value of [r.labelProfile.displayName,r.labelProfile.partReference,r.sku,r.expectedBarcode,'DRIVER MATE PTY LTD','drivemateparts.com.au']) expect(html,r.sku).toContain(value);
    if(r.labelProfile.position.status==='not_applicable') expect(html).not.toContain('Position:');
  }
  expect(draft.rows.filter(r=>r.labelProfile.position.status==='not_applicable')).toHaveLength(50);
  expect(draft.rows.find(r=>r.sku==='DM-GWM-0082')!.labelProfile.position.value).toBe('FRONT / RIGHT (RH)');
});
it('maps 706 synthetic scans through the real receipt validator to the original distinct SKUs',()=>{
  const scans=draft.rows.flatMap(r=>Array(r.expectedQuantity).fill(r.expectedBarcode));
  const scanned=prepareWarehouseReceipt({mode:'scan_each',expectedScope:scope,scannedProductBarcodes:scans});
  expect(scanned.ok).toBe(true); if(!scanned.ok) throw new Error(scanned.message);
  expect(scanned.lines).toHaveLength(119); expect(scanned.lines.reduce((n,r)=>n+r.actualQuantity,0)).toBe(706);
  for(const [sku,count] of [['DM-GWM-0009',20],['DM-GWM-0021',20],['DM-GWM-0028',8],['DM-GWM-0029',8],['DM-GWM-0030',4],['DM-GWM-0031',4]] as const) expect(scanned.lines.find(r=>r.sku===sku)?.actualQuantity).toBe(count);
  const counted=prepareWarehouseReceipt({mode:'counted_quantity',expectedScope:scope,scannedProductBarcodes:draft.rows.map(r=>r.expectedBarcode),countedLines:draft.rows.map(r=>({productBarcode:r.expectedBarcode,actualQuantity:r.expectedQuantity}))});
  expect(counted).toEqual(scanned);
  expect(prepareWarehouseReceipt({mode:'scan_each',expectedScope:scope,scannedProductBarcodes:['1109110XP6EXA']}).ok).toBe(false);
});
it('prepares all 706 content snapshots and rejects a swapped scan identity',()=>{
  const job:any={id:'LOCAL-QA-706',templateId:'unit_product',status:'pending',requestedQuantity:706,payloadSnapshot:{...scope,labelVersion:'unit-product-v4'}};
  let sequence=0;
  const items:any[]=draft.rows.flatMap(r=>{
    const labelContent=buildProductLabelContent({sku:r.sku,barcode:r.expectedBarcode,labelProfile:productLabelProfileSchema.parse(r.labelProfile)}).content;
    return Array.from({length:r.expectedQuantity},()=>({id:`LOCAL-QA-${++sequence}`,sequence,jobId:job.id,payloadSnapshot:{shipmentId:scope.shipmentId,sku:r.sku,productBarcode:r.expectedBarcode,labelContent:structuredClone(labelContent)}}));
  });
  expect(prepareProductLabelBatch(job,items)).toHaveLength(706);
  expect(prepareProductLabelBatch(job,items)[0].labelContent?.profile.displayName).toBe('FUEL FILTER');
  const corrupt=structuredClone(items); corrupt[0].payloadSnapshot.productBarcode='DMPGWM0031';
  expect(()=>prepareProductLabelBatch(job,corrupt)).toThrow('does not match');
});
