export type AppRole = "public" | "trade" | "warehouse_staff" | "partner" | "admin";

export type Capability =
  | "vehicle_lookup"
  | "trade_read"
  | "create_order"
  | "warehouse_read"
  | "warehouse_label_print"
  | "warehouse_receive"
  | "warehouse_putaway"
  | "warehouse_history_read"
  | "inventory_adjust"
  | "location_manage"
  | "staff_read"
  | "staff_manage"
  | "prearrival_manage"
  | "order_dispatch"
  | "warehouse_rma_receive"
  | "admin_read"
  | "admin_write";

export const DEMO_ROLE_HEADER = "x-drivemate-role";
export const DEMO_ROLE_ENV = "DRIVEMATE_ENABLE_DEMO_AUTH";

const roles: AppRole[] = ["public", "trade", "warehouse_staff", "partner", "admin"];

const capabilityRoles: Record<Capability, AppRole[]> = {
  vehicle_lookup: ["trade", "partner", "admin"],
  trade_read: ["trade", "admin"],
  create_order: ["trade", "admin"],
  warehouse_read: ["partner", "admin"],
  warehouse_label_print: ["warehouse_staff", "partner", "admin"],
  warehouse_receive: ["warehouse_staff", "partner", "admin"],
  warehouse_putaway: ["warehouse_staff", "partner", "admin"],
  warehouse_history_read: ["warehouse_staff", "partner", "admin"],
  inventory_adjust: ["partner", "admin"],
  location_manage: ["partner", "admin"],
  staff_read: ["partner", "admin"],
  staff_manage: ["admin"],
  prearrival_manage: ["partner", "admin"],
  order_dispatch: ["partner", "admin"],
  warehouse_rma_receive: ["partner", "admin"],
  admin_read: ["admin"],
  admin_write: ["admin"],
};

export function parseRole(value: string | null | undefined): AppRole {
  return roles.includes(value as AppRole) ? (value as AppRole) : "public";
}

export function can(role: AppRole, capability: Capability): boolean {
  return capabilityRoles[capability].includes(role);
}

export function isDemoRoleHeaderEnabled(): boolean {
  const setting = process.env[DEMO_ROLE_ENV]?.toLowerCase();
  if (setting === "true" || setting === "1") return true;
  if (setting === "false" || setting === "0") return false;
  return process.env.NODE_ENV !== "production";
}
