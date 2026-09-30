import type { StockLocation } from "@/lib/stock-management";
import { stockLocationLabel } from "@/lib/inventory-access";

export type InventoryAuditAction =
  | "Location Assignment Changed"
  | "Stock View"
  | "Voucher Created"
  | "Voucher Approved"
  | "Voucher Dispatched"
  | "Voucher Received"
  | "Adjustment Posted"
  | "Count Posted"
  | "Daily Closing"
  | "Report Export";

export type InventoryAuditEntry = {
  id: string;
  atIso: string;
  userId: string;
  userName: string;
  role: string;
  branch: string;
  inventoryLocation?: StockLocation | "all";
  action: InventoryAuditAction;
  reference?: string;
  previousValue?: string;
  newValue?: string;
  notes?: string;
};

const STORAGE_KEY = "bl_inventory_audit";

export function loadInventoryAudit(): InventoryAuditEntry[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as InventoryAuditEntry[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function appendInventoryAudit(entry: Omit<InventoryAuditEntry, "id" | "atIso">) {
  if (typeof window === "undefined") return;
  const next: InventoryAuditEntry = {
    ...entry,
    id: `inv-audit-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    atIso: new Date().toISOString(),
  };
  const existing = loadInventoryAudit();
  localStorage.setItem(STORAGE_KEY, JSON.stringify([next, ...existing].slice(0, 500)));
}

export function auditInventoryExport(input: {
  userId: string;
  userName: string;
  role: string;
  branch: string;
  inventoryLocation?: StockLocation | "all";
  reference: string;
  filters?: string;
}) {
  appendInventoryAudit({
    userId: input.userId,
    userName: input.userName,
    role: input.role,
    branch: input.branch,
    inventoryLocation: input.inventoryLocation,
    action: "Report Export",
    reference: input.reference,
    newValue: input.filters,
    notes: input.inventoryLocation ? stockLocationLabel(input.inventoryLocation === "all" ? "Store 1" : input.inventoryLocation) : undefined,
  });
}
