"use client";
import { type ProductLabelProfile } from "../lib/productLabelProfile";
import { buildProductLabelContent, describeProductLabelIssues } from "../lib/warehouseLabelContent";
export const emptyProductLabelProfile: ProductLabelProfile = { schemaVersion: 1, displayName: "", vehicleMakes: [], partReference: "", position: { status: "unknown" } };
export function ProductLabelProfileFields({ value, onChange, sku, barcode }: {
  value: ProductLabelProfile | null; onChange: (value: ProductLabelProfile | null) => void; sku: string; barcode: string;
}) {
  const profile = value ?? emptyProductLabelProfile;
  const issues = buildProductLabelContent({ sku, barcode, labelProfile: value }).issues;
  const change = (patch: Partial<ProductLabelProfile>) => onChange({ ...profile, ...patch });
  return <fieldset className="label-profile-fields"><legend>Supplementary product label · 70 × 50 mm</legend>
    <p>Use verified English packaging details. Vehicle makes describe compatibility, not the manufacturer. Drafts may be saved incomplete.</p>
    <div className="form-grid">
      <label>Label product name<input value={profile.displayName} maxLength={100} onChange={event => change({ displayName: event.target.value })} /><small>Print layout: up to 48 characters, maximum 24 per word.</small></label>
      <label>Compatible vehicle makes<input value={profile.vehicleMakes.join(",")} onChange={event => change({ vehicleMakes: event.target.value ? event.target.value.split(",") : [] })} /><small>Comma-separated; for example Toyota,Lexus. Confirm from source documents.</small></label>
      <label>Label part reference<input value={profile.partReference} maxLength={60} onChange={event => change({ partReference: event.target.value })} /><small>Neutral supplier reference. Maximum 26 characters for printing.</small></label>
      <label>Position applicability<select value={profile.position.status} onChange={event => change({ position: event.target.value === "specified" ? { status: "specified", value: "" } : { status: event.target.value as "unknown" | "not_applicable" } })}>
        <option value="unknown">Not yet confirmed</option><option value="not_applicable">Not applicable — omit Position</option><option value="specified">Specified — show Position</option>
      </select></label>
      {profile.position.status === "specified" ? <label>Label position<input value={profile.position.value} maxLength={48} onChange={event => change({ position: { status: "specified", value: event.target.value } })} placeholder="e.g. Front / Left (LH)" /></label> : null}
    </div>
    <p role="status" className={issues.length ? "label-profile-readiness is-warning" : "label-profile-readiness"}>{issues.length ? `Not print-ready: ${describeProductLabelIssues(issues)}. Confirm missing details; shorten wording only when its meaning is preserved.` : "Label details ready. Save the SKU master to apply these details to new jobs."}</p>
    <button className="button button-secondary" type="button" onClick={() => onChange(null)}>Clear label draft</button>
  </fieldset>;
}
