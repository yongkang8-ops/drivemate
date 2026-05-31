export type AppRole = "public" | "trade" | "warehouse" | "admin";

export type Capability =
  | "vehicle_lookup"
  | "trade_read"
  | "create_order"
  | "inventory_write"
  | "warehouse_read"
  | "admin_read"
  | "admin_write";

export const DEMO_ROLE_HEADER = "x-drivemate-role";
export const DEMO_ROLE_ENV = "DRIVEMATE_ENABLE_DEMO_AUTH";

const roles: AppRole[] = ["public", "trade", "warehouse", "admin"];

const capabilityRoles: Record<Capability, AppRole[]> = {
  vehicle_lookup: ["trade", "warehouse", "admin"],
  trade_read: ["trade", "admin"],
  create_order: ["trade", "admin"],
  inventory_write: ["warehouse", "admin"],
  warehouse_read: ["warehouse", "admin"],
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
