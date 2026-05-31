export const pilotPurchaseBatches = [
  {
    batchNo: "BNE-2026-06-PILOT",
    sku: "DM-GWM-OF-001",
    receivedQuantity: 42,
    supplierName: "DriveMate pilot supplier",
    purchaseRef: "PILOT-001",
    receivedDate: "2026-06-01",
  },
  {
    batchNo: "BNE-2026-06-PILOT",
    sku: "DM-GWM-AF-002",
    receivedQuantity: 38,
    supplierName: "DriveMate pilot supplier",
    purchaseRef: "PILOT-001",
    receivedDate: "2026-06-01",
  },
  {
    batchNo: "BNE-2026-06-PILOT",
    sku: "DM-GWM-CF-003",
    receivedQuantity: 25,
    supplierName: "DriveMate pilot supplier",
    purchaseRef: "PILOT-001",
    receivedDate: "2026-06-01",
  },
  {
    batchNo: "BNE-2026-06-PILOT",
    sku: "DM-BYD-CF-007",
    receivedQuantity: 18,
    supplierName: "DriveMate pilot supplier",
    purchaseRef: "PILOT-001",
    receivedDate: "2026-06-01",
  },
];

export const pilotPricingRules = [
  {
    id: "PRICE-GWM-SERVICE-FILTERS",
    sku: "DM-GWM-OF-001",
    channel: "Trade account",
    priceMode: "Login visible",
    unitPriceExGstCents: 2595,
    status: "active",
  },
  {
    id: "PRICE-GWM-AF-002",
    sku: "DM-GWM-AF-002",
    channel: "Trade account",
    priceMode: "Login visible",
    unitPriceExGstCents: 3449,
    status: "active",
  },
  {
    id: "PRICE-GWM-CF-003",
    sku: "DM-GWM-CF-003",
    channel: "Trade account",
    priceMode: "Login visible",
    unitPriceExGstCents: 4499,
    status: "active",
  },
  {
    id: "PRICE-GWM-FF-004",
    sku: "DM-GWM-FF-004",
    channel: "Trade account",
    priceMode: "Login visible",
    unitPriceExGstCents: 4313,
    status: "active",
  },
  {
    id: "PRICE-BYD-CF-007",
    sku: "DM-BYD-CF-007",
    channel: "Trade account",
    priceMode: "Login visible",
    unitPriceExGstCents: 3850,
    status: "active",
  },
  {
    id: "PRICE-MG-CF-008",
    sku: "DM-MG-CF-008",
    channel: "Trade account",
    priceMode: "Login visible",
    unitPriceExGstCents: 3200,
    status: "active",
  },
];

export const pilotRfqReviews = [
  {
    id: "RFQ-GWM-ALPHA-FUEL-FILTER",
    brand: "GWM",
    vehicle: "Cannon Alpha 2.4D 2024-on",
    requestedPart: "Diesel fuel filter",
    priority: "high",
    status: "needs supplier confirmation",
  },
  {
    id: "RFQ-BYD-SHARK-SERVICE",
    brand: "BYD",
    vehicle: "Shark 6 / Sealion 6",
    requestedPart: "Service filter pack",
    priority: "medium",
    status: "monitor",
  },
];

export const demoUserRoles = [
  {
    userId: "demo-trade-user",
    role: "trade",
    displayName: "Demo trade account",
    tradeAccountId: "acct-demo",
  },
  {
    userId: "demo-warehouse-user",
    role: "warehouse",
    displayName: "Demo warehouse operator",
  },
  {
    userId: "demo-admin-user",
    role: "admin",
    displayName: "Demo admin operator",
  },
];
