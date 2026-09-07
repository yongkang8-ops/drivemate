import { expect, it } from 'vitest';
// @ts-expect-error Local artifact generator is plain JavaScript, not application runtime.
import { buildFinalLabelDraft } from '../scripts/label-backfill-draft.mjs';

const row = (sku: string, pn: string, barcode: string, qty=4) => ({ sku, part_number: pn, barcode, quantity: qty, source_scope: '19#',
  name_cn: '空气滤芯', source_position_explicit: false, detail_row: 36,
  proposed_label_profile: { schemaVersion: 1, displayName: 'ENGINE AIR FILTER', vehicleMakes: ['GWM'], partReference: pn, position: { status: 'unknown' } } });

it('corrects the approved display PN without merging SKUs or scan identities', () => {
  const source = { rows: [row('DM-GWM-0030','1109110XP6EXA','DMPGWM0030'),row('DM-GWM-0031','1109110XPE6EXA','DMPGWM0031')] };
  const result = buildFinalLabelDraft(source);
  expect(result.rows.map((r:any)=>r.labelProfile.partReference)).toEqual(['1109110XP6EXA','1109110XP6EXA']);
  expect(result.rows.map((r:any)=>r.expectedBarcode)).toEqual(['DMPGWM0030','DMPGWM0031']);
  expect(result.rows.map((r:any)=>r.expectedQuantity)).toEqual([4,4]);
  expect(source.rows[1].proposed_label_profile.partReference).toBe('1109110XPE6EXA');
});
it('records element interchangeability without collapsing two PN references or claiming housing fitment', () => {
  const result = buildFinalLabelDraft({ rows: [row('DM-GWM-0028','1017110XED95','DMPGWM0028',8),row('DM-GWM-0029','1017100XED95','DMPGWM0029',8)] });
  expect(result.rows.map((r:any)=>r.labelProfile.partReference)).toEqual(['1017110XED95','1017100XED95']);
  expect(result.rows[0].referenceDecision).toMatchObject({ kind: 'filter_element_interchangeable', scope: 'Cannon diesel 2.0T / 2.4T; filter element only', references: ['1017110XED95','1017100XED95'] });
  expect(result.productionWriteAuthorized).toBe(false);
});
it('does not silently mark newly encountered unknown-position products print-ready', () => {
  const result = buildFinalLabelDraft({ rows: [row('NEW-SKU','NEW-PN','NEWBARCODE')] });
  expect(result.rows[0].labelProfile.position).toEqual({ status: 'unknown' });
});
it('normalizes the explicitly confirmed oil-filter reference and rejects ambiguous input identities', () => {
  expect(buildFinalLabelDraft({ rows: [row('DM-GWM-0009','1017100EG01','DMPGWM0009',20)] }).rows[0].labelProfile.partReference).toBe('1017100-EG01');
  expect(()=>buildFinalLabelDraft({rows:[row('SAME','A','CODE'),row('SAME','B','CODE')]})).toThrow();
});
