import type { ReturnTypeOfStaffSummary } from "./staffTypes";

const metrics: Array<{ key: keyof ReturnTypeOfStaffSummary; label: string; note: string }> = [
  { key: "total", label: "Total accounts", note: "Includes system administrator" },
  { key: "pendingFirstLogin", label: "Pending first login", note: "Action required within 7 days" },
  { key: "active", label: "Active", note: "Authorised accounts" },
  { key: "disabled", label: "Disabled", note: "Access blocked" },
  { key: "expiringSoon", label: "Expiring soon", note: "Within 48 hours" },
];

export function StaffSummaryMetrics({ summary }: { summary: ReturnTypeOfStaffSummary }) {
  return (
    <section className="staff-summary-metrics" aria-label="Staff account summary">
      {metrics.map((metric) => (
        <article key={metric.key}>
          <span>{metric.label}</span>
          <strong>{summary[metric.key]}</strong>
          <small>{metric.note}</small>
        </article>
      ))}
    </section>
  );
}
