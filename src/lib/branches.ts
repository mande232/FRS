import { CENTRAL_STOCK_LOCATIONS, type CentralStockLocation } from "@/lib/stock-management";

export const BRANCHES_MODULE_KEY = "restaurant-branches";
export const BRANCHES_CACHE_KEY = "ethio_plate_branches_cache";

export type BranchAdjustments = {
  /** Override receipt number prefix for this branch (blank = use global). */
  receiptPrefix: string;
  /** Override VAT %; null = use global settings. */
  vatRateOverride: number | null;
  /** Override service charge %; null = use global settings. */
  serviceChargeRateOverride: number | null;
  /** Default central store for this branch’s inventory moves. */
  inventoryStore: CentralStockLocation;
  /** Share HQ menu catalog. */
  shareMenuWithHq: boolean;
  /** Share HQ inventory master / costing. */
  shareInventoryWithHq: boolean;
  /** Use branch printer config published from Printer Settings. */
  useBranchPrinter: boolean;
  /** Optional manager notes for cashiers / openers. */
  opsNotes: string;
};

export type BranchRecord = {
  id: string;
  name: string;
  code: string;
  city: string;
  address: string;
  phone: string;
  timezone: string;
  active: boolean;
  isHeadquarters: boolean;
  adjustments: BranchAdjustments;
  updatedAtIso: string;
  updatedBy?: string;
};

export const DEFAULT_BRANCH_ADJUSTMENTS: BranchAdjustments = {
  receiptPrefix: "",
  vatRateOverride: null,
  serviceChargeRateOverride: null,
  inventoryStore: "Store 1",
  shareMenuWithHq: true,
  shareInventoryWithHq: true,
  useBranchPrinter: true,
  opsNotes: "",
};

export function branchRecordId(name: string) {
  return `br-${name.trim().toLowerCase().replace(/\s+/g, "-") || "branch"}`;
}

export function defaultBranchAdjustments(
  partial?: Partial<BranchAdjustments>,
): BranchAdjustments {
  const store =
    partial?.inventoryStore &&
    CENTRAL_STOCK_LOCATIONS.includes(partial.inventoryStore as CentralStockLocation)
      ? (partial.inventoryStore as CentralStockLocation)
      : DEFAULT_BRANCH_ADJUSTMENTS.inventoryStore;

  const vat =
    partial?.vatRateOverride == null || Number.isNaN(Number(partial.vatRateOverride))
      ? null
      : Math.max(0, Math.min(100, Number(partial.vatRateOverride)));
  const service =
    partial?.serviceChargeRateOverride == null ||
    Number.isNaN(Number(partial.serviceChargeRateOverride))
      ? null
      : Math.max(0, Math.min(100, Number(partial.serviceChargeRateOverride)));

  return {
    receiptPrefix: (partial?.receiptPrefix ?? "").trim().toUpperCase().slice(0, 8),
    vatRateOverride: vat,
    serviceChargeRateOverride: service,
    inventoryStore: store,
    shareMenuWithHq: partial?.shareMenuWithHq !== false,
    shareInventoryWithHq: partial?.shareInventoryWithHq !== false,
    useBranchPrinter: partial?.useBranchPrinter !== false,
    opsNotes: (partial?.opsNotes ?? "").trim().slice(0, 500),
  };
}

export function defaultBranchRecord(
  name: string,
  extras?: Partial<Omit<BranchRecord, "id" | "name" | "adjustments">> & {
    adjustments?: Partial<BranchAdjustments>;
  },
): BranchRecord {
  const trimmed = name.trim() || "Main";
  return {
    id: branchRecordId(trimmed),
    name: trimmed,
    code: (extras?.code ?? trimmed.slice(0, 4)).trim().toUpperCase() || "MAIN",
    city: extras?.city?.trim() ?? "",
    address: extras?.address?.trim() ?? "",
    phone: extras?.phone?.trim() ?? "",
    timezone: extras?.timezone?.trim() || "Africa/Addis_Ababa",
    active: extras?.active !== false,
    isHeadquarters: extras?.isHeadquarters === true,
    adjustments: defaultBranchAdjustments(extras?.adjustments),
    updatedAtIso: extras?.updatedAtIso ?? new Date().toISOString(),
    updatedBy: extras?.updatedBy,
  };
}

export function normalizeBranchRecord(value: unknown, fallbackName = "Main"): BranchRecord {
  const base = defaultBranchRecord(fallbackName);
  if (!value || typeof value !== "object") return base;
  const row = value as Partial<BranchRecord> & { adjustments?: Partial<BranchAdjustments> };
  const name = typeof row.name === "string" && row.name.trim() ? row.name.trim() : base.name;
  return {
    id: typeof row.id === "string" && row.id.trim() ? row.id : branchRecordId(name),
    name,
    code:
      typeof row.code === "string" && row.code.trim()
        ? row.code.trim().toUpperCase().slice(0, 8)
        : base.code,
    city: typeof row.city === "string" ? row.city.trim() : "",
    address: typeof row.address === "string" ? row.address.trim() : "",
    phone: typeof row.phone === "string" ? row.phone.trim() : "",
    timezone:
      typeof row.timezone === "string" && row.timezone.trim()
        ? row.timezone.trim()
        : base.timezone,
    active: row.active !== false,
    isHeadquarters: row.isHeadquarters === true,
    adjustments: defaultBranchAdjustments(row.adjustments),
    updatedAtIso:
      typeof row.updatedAtIso === "string" && row.updatedAtIso
        ? row.updatedAtIso
        : base.updatedAtIso,
    updatedBy: typeof row.updatedBy === "string" ? row.updatedBy : undefined,
  };
}

export function upsertBranchRecord(
  records: BranchRecord[],
  next: BranchRecord,
): BranchRecord[] {
  const normalized = normalizeBranchRecord(next, next.name);
  let list = records.map((row) => normalizeBranchRecord(row, row.name));

  if (normalized.isHeadquarters) {
    list = list.map((row) =>
      row.id === normalized.id ? row : { ...row, isHeadquarters: false },
    );
  }

  const exists = list.some((row) => row.id === normalized.id);
  return exists
    ? list.map((row) => (row.id === normalized.id ? normalized : row))
    : [...list, normalized];
}

export function ensureSeedBranches(
  records: BranchRecord[],
  seed?: { name?: string; address?: string; phone?: string; timezone?: string },
): BranchRecord[] {
  if (records.length > 0) return records.map((row) => normalizeBranchRecord(row, row.name));
  const name = seed?.name?.trim() || "Main";
  return [
    defaultBranchRecord(name, {
      address: seed?.address,
      phone: seed?.phone,
      timezone: seed?.timezone,
      isHeadquarters: true,
      active: true,
    }),
  ];
}

export function activeBranchNames(records: readonly BranchRecord[]): string[] {
  return records
    .filter((row) => row.active)
    .map((row) => row.name)
    .sort((a, b) => a.localeCompare(b));
}

export function findBranchByName(
  records: readonly BranchRecord[],
  name: string,
): BranchRecord | undefined {
  const key = name.trim().toLowerCase();
  return records.find((row) => row.name.trim().toLowerCase() === key);
}

export function cacheBranches(records: readonly BranchRecord[]) {
  if (typeof window === "undefined") return;
  const normalized = records.map((row) => normalizeBranchRecord(row, row.name));
  window.localStorage.setItem(BRANCHES_CACHE_KEY, JSON.stringify(normalized));
}

export function loadCachedBranches(): BranchRecord[] {
  if (typeof window === "undefined") return [];
  try {
    const parsed = JSON.parse(window.localStorage.getItem(BRANCHES_CACHE_KEY) ?? "null");
    if (!Array.isArray(parsed)) return [];
    return parsed.map((row) => normalizeBranchRecord(row));
  } catch {
    return [];
  }
}

export function validateBranchRecord(
  draft: BranchRecord,
  existing: readonly BranchRecord[],
): string[] {
  const errors: string[] = [];
  if (!draft.name.trim()) errors.push("Branch name is required.");
  if (!draft.code.trim()) errors.push("Branch code is required.");
  const nameKey = draft.name.trim().toLowerCase();
  const codeKey = draft.code.trim().toLowerCase();
  if (existing.some((row) => row.id !== draft.id && row.name.trim().toLowerCase() === nameKey)) {
    errors.push("Another branch already uses this name.");
  }
  if (existing.some((row) => row.id !== draft.id && row.code.trim().toLowerCase() === codeKey)) {
    errors.push("Another branch already uses this code.");
  }
  const vat = draft.adjustments.vatRateOverride;
  if (vat != null && (vat < 0 || vat > 100)) errors.push("VAT override must be between 0 and 100.");
  const service = draft.adjustments.serviceChargeRateOverride;
  if (service != null && (service < 0 || service > 100)) {
    errors.push("Service charge override must be between 0 and 100.");
  }
  return errors;
}
