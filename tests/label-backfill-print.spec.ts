import { expect, test } from '@playwright/test';
import { readFileSync } from 'node:fs';
import type draftType from '../docs/operations/product-master/2026-09-07-product-label-backfill-draft.json';
import { buildProductLabelContent } from '../lib/warehouseLabelContent';
import { productLabelProfileSchema } from '../lib/productLabelProfile';
const draft: typeof draftType = JSON.parse(readFileSync('docs/operations/product-master/2026-09-07-product-label-backfill-draft.json','utf8'));

test('confirmed 119 SKU draft renders exactly 706 dimensioned pages with unchanged barcode quantities',async({page,request},testInfo)=>{
  test.setTimeout(120000);
  const origin=new URL(testInfo.project.use.baseURL!);
  expect(['127.0.0.1','localhost']).toContain(origin.hostname);
  expect((await request.post('/api/test/reset')).ok()).toBe(true);
  // Network substitution is confined to this local browser; no Production endpoint is called.
  await page.route('**/*',async route=>{const u=new URL(route.request().url());if(['http:','https:'].includes(u.protocol)&&!['127.0.0.1','localhost'].includes(u.hostname)) return route.abort();await route.fallback();});
  await page.addInitScript(()=>{(window as any).localPrintCalls=0; window.print=()=>{(window as any).localPrintCalls++;};});
  const [header,...data]=readFileSync('docs/operations/inbound/2026-09-03-gwm-706-unit-inbound-master-data-v3-lines.csv','utf8').trim().replace(/^\uFEFF/,'').split(/\r?\n/).map(r=>r.split(','));
  const source=data.map(row=>Object.fromEntries(header.map((k,i)=>[k,row[i]])));
  const cartons=[...new Set(source.map(r=>r.source_scope_number))].map(number=>{const r=source.find(r=>r.source_scope_number===number)!;return {sourceCartonNumber:number,kind:r.scope_kind,physicalCartonCount:+r.physical_carton_count,memberCartonNumbers:r.member_carton_numbers.split('|')};});
  const scope={shipmentId:'shipment-test-1',cartonNumbers:cartons.map(c=>c.sourceCartonNumber),lines:draft.rows.map(r=>({sku:r.sku,productBarcode:r.expectedBarcode,expectedQuantity:r.expectedQuantity}))};
  const labelProducts=draft.rows.map(r=>buildProductLabelContent({sku:r.sku,barcode:r.expectedBarcode,labelProfile:productLabelProfileSchema.parse(r.labelProfile)}));
  const job={id:'LOCAL-ONLY-FINAL-DRAFT-706',templateId:'unit_product',status:'pending',requestedQuantity:706,payloadSnapshot:{...scope,labelVersion:'unit-product-v4'},createdAt:'2026-09-07T00:00:00Z'};
  let sequence=0;
  const items=draft.rows.flatMap(r=>Array.from({length:r.expectedQuantity},(_,copy)=>({id:`LOCAL-${++sequence}`,jobId:job.id,sequence,payloadSnapshot:{shipmentId:scope.shipmentId,sku:r.sku,productBarcode:r.expectedBarcode,copy:copy+1,labelContent:labelProducts.find(p=>p.sku===r.sku)!.content},createdAt:job.createdAt})));
  await page.route('**/api/warehouse/labels?*',route=>route.fulfill({json:{ok:true,shipment:{shipmentId:scope.shipmentId,pallets:[],cartons},scope,labelProducts,printGate:{ok:false}}}));
  await page.route('**/api/warehouse/labels',route=>route.fulfill({status:201,json:{ok:true,job,items}}));
  await page.goto('/warehouse');
  await expect(page.getByText('706 labels',{exact:true})).toBeVisible();
  await page.getByRole('button',{name:'Print labels',exact:true}).click();
  await expect.poll(()=>page.evaluate(()=>(window as any).localPrintCalls)).toBe(1);
  await page.emulateMedia({media:'print'});
  const articles=page.locator('.warehouse-product-print-batch .product-label-v4');
  const rendered=await articles.evaluateAll(es=>es.map(e=>({text:e.textContent??'',barcode:e.querySelector('svg')?.getAttribute('aria-label'),bars:e.querySelectorAll('svg rect').length,width:e.getBoundingClientRect().width,height:e.getBoundingClientRect().height,overflow:e.scrollWidth>e.clientWidth||e.scrollHeight>e.clientHeight,childrenOverflow:Array.from(e.children).some(c=>c.scrollWidth>c.clientWidth+1||c.scrollHeight>c.clientHeight+1)})));
  expect(rendered).toHaveLength(706);
  expect(new Set(rendered.map(r=>r.barcode)).size).toBe(119);
  for(const r of draft.rows){
    const labels=rendered.filter(l=>l.barcode===`Code 128 barcode ${r.expectedBarcode}`);
    expect(labels.length,r.sku).toBe(r.expectedQuantity);
    for(const l of labels){
      for(const value of [r.sku,r.labelProfile.displayName,r.labelProfile.partReference,'DRIVER MATE PTY LTD','drivemateparts.com.au'])expect(l.text,r.sku).toContain(value);
      expect(l.bars,r.sku).toBeGreaterThan(20); expect(l.overflow||l.childrenOverflow,r.sku).toBe(false);
      expect(Math.abs(l.width-70*96/25.4)).toBeLessThan(1);expect(Math.abs(l.height-50*96/25.4)).toBeLessThan(1);
      if(r.labelProfile.position.status==='not_applicable')expect(l.text).not.toContain('Position:');
    }
  }
  const pdf=await page.pdf({path:testInfo.outputPath('LOCAL-QA-confirmed-706-labels.pdf'),preferCSSPageSize:true,printBackground:true,displayHeaderFooter:false});
  expect(pdf.toString('latin1').match(/\/Type\s*\/Page\b/g)).toHaveLength(706);
  await page.emulateMedia({media:'screen'});
  for(const width of [375,701,768,880,1024,1440]){
    await page.setViewportSize({width,height:900});
    expect(await page.evaluate(()=>document.documentElement.scrollWidth<=document.documentElement.clientWidth),`${width}px`).toBe(true);
  }
  await page.emulateMedia({media:'print'});
  for(const sku of ['DM-GWM-0009','DM-GWM-0028','DM-GWM-0031','DM-GWM-0045','DM-GWM-0082'])await page.locator(`.warehouse-product-print-batch [aria-label="Product label for ${sku}"]`).first().screenshot({path:testInfo.outputPath(`${sku}.png`)});
  await page.emulateMedia({media:'screen'});
  await expect(page.getByRole('button',{name:'Confirm printed',exact:true})).toBeVisible();
  // Deliberately do not confirm Printed, receive or put away, even in this local browser fixture.
});
