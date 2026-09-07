import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

export function buildFinalLabelDraft(source) {
  // Explicit label-content review, not a rule that unknown vehicle positions are interchangeable.
  // New SKUs outside this reviewed set keep unknown; source position evidence remains separate.
  const omitPosition = new Set([1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,16,17,18,19,20,21,22,23,24,25,26,27,28,29,30,31,32,
    41,44,45,46,47,48,55,71,74,102,111,113,114,115,116,117,118,119].map(n=>`DM-GWM-${String(n).padStart(4,'0')}`));
  const skus = new Set(), barcodes = new Set();
  const rows = source.rows.map(r => {
    if (!r.sku || !r.barcode || skus.has(r.sku) || barcodes.has(r.barcode) || !Number.isSafeInteger(r.quantity) || r.quantity <= 0) throw new Error('Source SKU/barcode identity or quantity is invalid.');
    skus.add(r.sku); barcodes.add(r.barcode);
    const labelProfile = structuredClone(r.proposed_label_profile);
    labelProfile.displayName = ({'BRAKE DISC (ROTOR)':'BRAKE ROTOR','STABILIZER LINK':'SWAY BAR LINK','ENGINE OIL FILTER':'OIL FILTER'}[labelProfile.displayName] ?? labelProfile.displayName);
    if (labelProfile.position.status === 'specified') labelProfile.position.value = labelProfile.position.value.toUpperCase();
    if (omitPosition.has(r.sku) && labelProfile.position.status === 'unknown') labelProfile.position = { status: 'not_applicable' };
    let referenceDecision = { kind: 'retain_source_reference', references: [r.part_number] };
    if (['1017100EG01','1017100-EG01'].includes(r.part_number)) {
      labelProfile.partReference = '1017100-EG01';
      referenceDecision = { kind: 'same_part_spelling_alias', references: ['1017100EG01','1017100-EG01'], canonicalDisplayPn: '1017100-EG01', evidence: 'Chris reply relayed by owner, 2026-09-07' };
    }
    if (['1017110XED95','1017100XED95'].includes(r.part_number)) referenceDecision = { kind: 'filter_element_interchangeable', references: ['1017110XED95','1017100XED95'], scope: 'Cannon diesel 2.0T / 2.4T; filter element only', evidence: 'Chris reply relayed by owner, 2026-09-07' };
    if (['1109110XP6EXA','1109110XPE6EXA'].includes(r.part_number)) {
      labelProfile.partReference = '1109110XP6EXA';
      referenceDecision = { kind: 'corrected_source_typo', references: ['1109110XP6EXA'], historicalTypo: '1109110XPE6EXA', scope: 'Cannon diesel 2.0T / 2.4T; air filter', evidence: 'Chris reply relayed by owner, 2026-09-07' };
    }
    return {
      sku: r.sku, expectedBarcode: r.barcode, expectedOriginalPn: r.part_number,
      expectedQuantity: r.quantity, sourceScope: r.source_scope, sourceNameCn: r.name_cn,
      sourceRow0902: r.detail_row ?? null, sourcePositionEvidence: r.proposed_label_profile.position,
      positionDecision: omitPosition.has(r.sku) ? 'Omit Position on this supplementary label; no new axle/side interchangeability claim. Owner delegated wording decisions; existing PN remains identification.' : 'Retain documented position; 0082 right supported by PN-specific supplier label photograph.',
      referenceDecision, labelProfile,
      permittedProductPatch: { label_profile: labelProfile },
    };
  });
  return {
    version: 'label-backfill-draft-20260907', projectRef: 'gajrgqiwvgjrrbildwme', shipmentId: 'c49dad78-2ffc-406a-ac50-3c1e4ffec434',
    productionWriteAuthorized: false, needsMigration: 'v23_product_label_profiles',
    allowedProductColumns: ['label_profile'],
    preserved: ['id','sku','barcode','oem_part_number','inventory','packing_list_revisions','print_job_snapshots'],
    referenceRelationsStorage: 'Review artifact only; no alias search feature or fitment-table writes are implied.',
    sourceFiles: source.sources ?? [], rows,
  };
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  const [input, output] = process.argv.slice(2);
  if (!input || !output) throw new Error('Provide local source JSON and output JSON paths. No remote execution is supported.');
  const draft = buildFinalLabelDraft(JSON.parse(fs.readFileSync(input, 'utf8')));
  fs.mkdirSync(path.dirname(output), { recursive: true });
  fs.writeFileSync(output, JSON.stringify(draft, null, 2) + '\n');
  console.log(JSON.stringify({ records: draft.rows.length, quantity: draft.rows.reduce((n,r)=>n+r.expectedQuantity,0), productionWrites: 0 }));
}
