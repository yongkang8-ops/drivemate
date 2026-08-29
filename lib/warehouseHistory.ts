export type WarehouseHistoryAction =
  | "print_confirmed"
  | "print_cancelled"
  | "reprint"
  | "receipt_confirmed"
  | "discrepancy_recorded"
  | "putaway_confirmed";

export type WarehouseHistoryEvent = {
  id: string;
  createdAt: string;
  action: WarehouseHistoryAction;
  actor?: string;
  reference: string;
  shipmentId: string;
  palletNumbers?: string[];
  cartonNumbers?: string[];
  sku?: string;
  outcome: string;
};

export type WarehouseHistoryTimeZone = "Australia/Brisbane" | "Asia/Shanghai";

const actionLabels: Record<WarehouseHistoryAction, string> = {
  print_confirmed: "Label print confirmed",
  print_cancelled: "Label print cancelled",
  reprint: "Label reprint created",
  receipt_confirmed: "Receipt confirmed",
  discrepancy_recorded: "Receipt difference recorded",
  putaway_confirmed: "Putaway confirmed",
};

function formatDate(value: Date, timeZone: WarehouseHistoryTimeZone) {
  return new Intl.DateTimeFormat("en-AU", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    timeZone,
  }).format(value);
}

function formatTime(value: Date, timeZone: WarehouseHistoryTimeZone) {
  return new Intl.DateTimeFormat("en-AU", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone,
  }).format(value);
}

export function buildWarehouseHistory(input: {
  events: WarehouseHistoryEvent[];
  timeZone: WarehouseHistoryTimeZone;
}) {
  return {
    rows: [...input.events]
      .sort((left, right) => right.createdAt.localeCompare(left.createdAt))
      .map((event) => {
        const createdAt = new Date(event.createdAt);
        return {
          ...event,
          actionLabel: actionLabels[event.action],
          date: formatDate(createdAt, input.timeZone),
          time: formatTime(createdAt, input.timeZone),
          timeZone: input.timeZone,
        };
      }),
  };
}
