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
  quantity?: number;
  outcome: string;
};

export type WarehouseHistoryTimeZone = "Australia/Brisbane" | "Asia/Shanghai";

export type WarehouseHistorySourceScope = {
  sourceCartonNumber: string;
  kind?: "carton" | "carton_group";
  physicalCartonCount?: number;
};

const actionLabels: Record<WarehouseHistoryAction, string> = {
  print_confirmed: "Label print confirmed",
  print_cancelled: "Label print cancelled",
  reprint: "Label reprint created",
  receipt_confirmed: "Receipt confirmed",
  discrepancy_recorded: "Receipt difference recorded",
  putaway_confirmed: "Putaway confirmed",
};

function normalizeSourceScope(value: string) {
  return value.trim().toUpperCase().replace(/\s+/g, " ");
}

export function summarizeWarehouseHistoryScope(input: {
  cartons: readonly WarehouseHistorySourceScope[];
  selectedSourceScopes?: readonly string[];
}) {
  const selected = new Set(
    (input.selectedSourceScopes ?? []).map(normalizeSourceScope).filter(Boolean),
  );
  const cartons = selected.size
    ? input.cartons.filter((carton) => selected.has(normalizeSourceScope(carton.sourceCartonNumber)))
    : input.cartons;

  return {
    sourceScopeCount: cartons.length,
    physicalCartonCount: cartons.reduce(
      (total, carton) => total + (carton.physicalCartonCount ?? 1),
      0,
    ),
    cartonGroupCount: cartons.filter((carton) => carton.kind === "carton_group").length,
  };
}

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
