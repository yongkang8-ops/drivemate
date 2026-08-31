import { formatStaffDate } from "../../lib/staffUi";

export type StaffAuditItem = {
  id: string;
  action: string;
  actorId?: string;
  beforeValue?: unknown;
  afterValue?: unknown;
  createdAt: string;
};

function actionLabel(action: string) {
  return action.replace(/^staff_/, "").replaceAll("_", " ").replace(/^./, (value) => value.toUpperCase());
}

export function StaffAuditTimeline({ audit }: { audit: StaffAuditItem[] }) {
  if (audit.length === 0) return <div className="staff-drawer-empty"><h3>No audit events yet</h3><p>Security and account changes will appear here.</p></div>;
  return (
    <div className="staff-audit-timeline">
      {audit.map((item) => (
        <article key={item.id}><span aria-hidden="true" /><div><strong>{actionLabel(item.action)}</strong><p>Actor: {item.actorId || "System"}</p><time dateTime={item.createdAt}>{formatStaffDate(item.createdAt)}</time></div></article>
      ))}
    </div>
  );
}
