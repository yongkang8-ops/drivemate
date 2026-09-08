export const adminSections = [
  { id: "overview", label: "Overview" },
  { id: "purchasing", label: "Purchasing" },
  { id: "products", label: "Products & fitment" },
  { id: "costs", label: "Shipment costs" },
  { id: "accounts", label: "Accounts" },
  { id: "orders", label: "Orders & returns" },
  { id: "pricing", label: "Pricing & compliance" },
  { id: "reports", label: "Reports" },
] as const;
export type AdminSectionId = typeof adminSections[number]["id"];

export function adminSectionFromHash(hash: string): AdminSectionId {
  const id = hash.replace(/^#/, "");
  if (id === "sku-master-editor") return "products";
  // Older bookmarks pointed to the combined finance/RMA panel.
  if (id === "compliance") return "costs";
  return adminSections.find(section => section.id === id)?.id ?? "overview";
}
