import type { DrivemateRepository } from "./repository";
import { buildWarehouseHistory, type WarehouseHistoryEvent, type WarehouseHistoryTimeZone } from "./warehouseHistory";

export type PartnerDashboardShipmentSource = {
  shipmentId: string;
  shipmentReference: string;
  packingListConfirmed: boolean;
  packingListVersion: number;
  physicalPalletCount: number | null;
  mappedPalletCount: number;
  palletMappingStatus: "not_recorded" | "partial" | "complete";
  cartonCount: number;
  expectedQuantity: number;
  labelConfirmed: boolean;
  receiptQuantity: number;
  stagingQuantity: number;
  locatedQuantity: number;
  lastEventAt?: string;
};

export type PartnerDashboardAttention = {
  id: string;
  type: "receipt_difference" | "print_gate" | "staging_pending" | "packing_list_required";
  shipmentId: string;
  reference: string;
  title: string;
  detail: string;
  href: string;
  createdAt?: string;
};

function totalFor(events: WarehouseHistoryEvent[], action: WarehouseHistoryEvent["action"]) {
  return events
    .filter((event) => event.action === action)
    .reduce((total, event) => total + (event.quantity ?? 0), 0);
}

function mostRecent(values: Array<string | undefined>) {
  return values.filter((value): value is string => Boolean(value)).sort().at(-1);
}

function worklistStatus(source: PartnerDashboardShipmentSource) {
  if (!source.packingListConfirmed) {
    return {
      stage: "packing_list_required",
      stageLabel: "Packing List required",
      labelStatus: "not_ready",
      receiptStatus: "blocked",
      putawayStatus: "blocked",
      nextAction: "Open pre-arrival",
      nextActionHref: `/prearrival?shipmentId=${encodeURIComponent(source.shipmentId)}`,
    } as const;
  }

  if (source.stagingQuantity > 0) {
    return {
      stage: "staging",
      stageLabel: "In staging",
      labelStatus: source.labelConfirmed ? "printed" : "pending",
      receiptStatus: "confirmed",
      putawayStatus: "pending",
      nextAction: "Open putaway",
      nextActionHref: `/warehouse?shipmentId=${encodeURIComponent(source.shipmentId)}`,
    } as const;
  }

  if (source.receiptQuantity > 0 && source.locatedQuantity > 0) {
    return {
      stage: "located",
      stageLabel: "Located",
      labelStatus: source.labelConfirmed ? "printed" : "pending",
      receiptStatus: "confirmed",
      putawayStatus: "complete",
      nextAction: "Review history",
      nextActionHref: `/warehouse?shipmentId=${encodeURIComponent(source.shipmentId)}`,
    } as const;
  }

  if (source.receiptQuantity > 0) {
    return {
      stage: "receipt_confirmed",
      stageLabel: "Receipt confirmed",
      labelStatus: source.labelConfirmed ? "printed" : "pending",
      receiptStatus: "confirmed",
      putawayStatus: "waiting",
      nextAction: "Open putaway",
      nextActionHref: `/warehouse?shipmentId=${encodeURIComponent(source.shipmentId)}`,
    } as const;
  }

  if (source.labelConfirmed) {
    return {
      stage: "ready_to_receive",
      stageLabel: "Ready to receive",
      labelStatus: "printed",
      receiptStatus: "waiting",
      putawayStatus: "waiting",
      nextAction: "Receive stock",
      nextActionHref: `/warehouse?shipmentId=${encodeURIComponent(source.shipmentId)}`,
    } as const;
  }

  return {
    stage: "label_required",
    stageLabel: "Label required",
    labelStatus: "pending",
    receiptStatus: "waiting",
    putawayStatus: "waiting",
    nextAction: "Prepare labels",
    nextActionHref: `/warehouse?shipmentId=${encodeURIComponent(source.shipmentId)}`,
  } as const;
}

function matchesSearch(
  shipment: PartnerDashboardShipmentSource,
  shipmentEvents: WarehouseHistoryEvent[],
  search?: string,
) {
  const normalized = search?.trim().toLowerCase();
  if (!normalized) return true;
  return [
    shipment.shipmentReference,
    shipment.shipmentId,
    ...shipmentEvents.flatMap((event) => [event.sku ?? "", event.reference, event.outcome]),
  ].some((value) => value.toLowerCase().includes(normalized));
}

export function buildPartnerDashboard(input: {
  shipments: PartnerDashboardShipmentSource[];
  events: WarehouseHistoryEvent[];
  displayTimeZone: WarehouseHistoryTimeZone;
  generatedAt: string;
  search?: string;
}) {
  const eventsByShipment = new Map<string, WarehouseHistoryEvent[]>();
  for (const event of input.events) {
    const shipmentEvents = eventsByShipment.get(event.shipmentId) ?? [];
    shipmentEvents.push(event);
    eventsByShipment.set(event.shipmentId, shipmentEvents);
  }

  const shipments = input.shipments
    .filter((shipment) => matchesSearch(shipment, eventsByShipment.get(shipment.shipmentId) ?? [], input.search))
    .map((shipment) => ({
      ...shipment,
      ...worklistStatus(shipment),
      lastEventAt: mostRecent([
        shipment.lastEventAt,
        ...(eventsByShipment.get(shipment.shipmentId) ?? []).map((event) => event.createdAt),
      ]),
    }))
    .sort((left, right) => (right.lastEventAt ?? "").localeCompare(left.lastEventAt ?? ""));

  const shipmentIds = new Set(shipments.map((shipment) => shipment.shipmentId));
  const visibleEvents = input.events.filter((event) => shipmentIds.has(event.shipmentId));
  const exceptions: PartnerDashboardAttention[] = visibleEvents
    .filter((event) => event.action === "discrepancy_recorded")
    .map((event): PartnerDashboardAttention => ({
      id: event.id,
      type: "receipt_difference",
      shipmentId: event.shipmentId,
      reference: event.sku ?? event.reference,
      title: "Receipt difference",
      detail: event.outcome,
      href: "/warehouse",
      createdAt: event.createdAt,
    }))
    .sort((left, right) => (right.createdAt ?? "").localeCompare(left.createdAt ?? ""));

  const attention: PartnerDashboardAttention[] = [
    ...exceptions,
    ...shipments
      .filter((shipment) => !shipment.packingListConfirmed)
      .map((shipment) => ({
        id: `packing-list-${shipment.shipmentId}`,
        type: "packing_list_required" as const,
        shipmentId: shipment.shipmentId,
        reference: shipment.shipmentReference,
        title: "Packing List confirmation required",
        detail: "Create and confirm the first Packing List before label preparation.",
        href: `/prearrival?shipmentId=${encodeURIComponent(shipment.shipmentId)}`,
        createdAt: shipment.lastEventAt,
      })),
    ...shipments
      .filter((shipment) => shipment.packingListConfirmed && shipment.labelStatus === "pending")
      .map((shipment) => ({
        id: `print-gate-${shipment.shipmentId}`,
        type: "print_gate" as const,
        shipmentId: shipment.shipmentId,
        reference: shipment.shipmentReference,
        title: "Label print confirmation required",
        detail: `Packing List v${shipment.packingListVersion} is ready for label preparation.`,
        href: `/warehouse?shipmentId=${encodeURIComponent(shipment.shipmentId)}`,
        createdAt: shipment.lastEventAt,
      })),
    ...shipments
      .filter((shipment) => shipment.stagingQuantity > 0)
      .map((shipment) => ({
        id: `staging-${shipment.shipmentId}`,
        type: "staging_pending" as const,
        shipmentId: shipment.shipmentId,
        reference: shipment.shipmentReference,
        title: "Putaway required",
        detail: `${shipment.stagingQuantity} units remain in BNE-RECEIVING-STAGING.`,
        href: `/warehouse?shipmentId=${encodeURIComponent(shipment.shipmentId)}`,
        createdAt: shipment.lastEventAt,
      })),
  ];

  const confirmedShipments = shipments.filter((shipment) => shipment.packingListConfirmed);

  return {
    generatedAt: input.generatedAt,
    displayTimeZone: input.displayTimeZone,
    pipeline: {
      activeShipments: confirmedShipments.length,
      printConfirmationRequired: confirmedShipments.filter(
        (shipment) => shipment.labelStatus === "pending",
      ).length,
      stagingUnits: shipments.reduce((total, shipment) => total + shipment.stagingQuantity, 0),
      locatedUnits: shipments.reduce((total, shipment) => total + shipment.locatedQuantity, 0),
      openExceptions: exceptions.length,
    },
    shipments,
    exceptions,
    attention,
    activities: buildWarehouseHistory({ events: visibleEvents, timeZone: input.displayTimeZone }).rows.slice(0, 12),
  };
}

export async function loadPartnerDashboardSource(
  repository: DrivemateRepository,
  query: { from?: string; to?: string } = {},
) {
  const [shipmentList, history] = await Promise.all([
    repository.listPrearrivalShipments(),
    repository.listWarehouseHistory(query),
  ]);
  const events = history.events;
  const shipmentResults: Array<PartnerDashboardShipmentSource | undefined> = await Promise.all(shipmentList.shipments.map(async (summary): Promise<PartnerDashboardShipmentSource | undefined> => {
    const result = await repository.getPrearrivalShipment(summary.shipmentId);
    if (!result.ok) return undefined;
    const confirmedRevision = [...result.shipment.revisions]
      .filter((revision) => revision.status === "confirmed")
      .sort((left, right) => right.version - left.version)[0];
    const shipmentEvents = events.filter((event) => event.shipmentId === summary.shipmentId);
    const receiptQuantity = totalFor(shipmentEvents, "receipt_confirmed");
    const locatedQuantity = totalFor(shipmentEvents, "putaway_confirmed");
    return {
      shipmentId: summary.shipmentId,
      shipmentReference: summary.shipmentReference ?? summary.shipmentId,
      packingListConfirmed: Boolean(confirmedRevision),
      packingListVersion: confirmedRevision?.version ?? 0,
      physicalPalletCount: result.shipment.physicalPalletCount ?? null,
      mappedPalletCount: result.shipment.pallets.length,
      palletMappingStatus: result.shipment.palletMappingStatus ?? "not_recorded",
      cartonCount: result.shipment.cartons.length,
      expectedQuantity: confirmedRevision?.totalExpectedQuantity
        ?? result.shipment.lines.reduce((total, line) => total + line.expectedQuantity, 0),
      labelConfirmed: shipmentEvents.some((event) => event.action === "print_confirmed"),
      receiptQuantity,
      stagingQuantity: Math.max(receiptQuantity - locatedQuantity, 0),
      locatedQuantity,
      lastEventAt: mostRecent([
        ...shipmentEvents.map((event) => event.createdAt),
        confirmedRevision?.confirmedAt,
        confirmedRevision?.createdAt,
      ]),
    };
  }));
  const shipments = shipmentResults.filter((shipment): shipment is PartnerDashboardShipmentSource => Boolean(shipment));

  return { shipments, events };
}
