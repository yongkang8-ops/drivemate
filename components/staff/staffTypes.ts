import type { StaffCollectionAccount, StaffViewerRole, staffSummary } from "../../lib/staffUi";

export type ReturnTypeOfStaffSummary = ReturnType<typeof staffSummary>;
export type StaffViewer = StaffViewerRole;
export type StaffRow = StaffCollectionAccount;
