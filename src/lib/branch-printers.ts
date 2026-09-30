export type PaperWidth = "58mm" | "80mm";
export type PrinterProfile = "epson" | "xprinter" | "rongta" | "generic";

export const BRANCH_PRINTERS_MODULE_KEY = "branch-printers";
export const BRANCH_PRINTERS_CACHE_KEY = "ethio_plate_branch_printers_cache";

export type BranchPrinterConfig = {
  id: string;
  branch: string;
  host: string;
  port: number;
  agentUrl: string;
  paperWidth: PaperWidth;
  profile: PrinterProfile;
  active: boolean;
  updatedAtIso: string;
  updatedBy?: string;
};

function isPaperWidth(value: unknown): value is PaperWidth {
  return value === "58mm" || value === "80mm";
}

function isPrinterProfile(value: unknown): value is PrinterProfile {
  return value === "epson" || value === "xprinter" || value === "rongta" || value === "generic";
}

export function branchPrinterRecordId(branch: string) {
  return `bp-${branch.trim().toLowerCase().replace(/\s+/g, "-") || "default"}`;
}

export function defaultBranchPrinter(branch: string): BranchPrinterConfig {
  return {
    id: branchPrinterRecordId(branch),
    branch: branch.trim() || "Main",
    host: "192.168.1.50",
    port: 9100,
    agentUrl: "http://127.0.0.1:9101",
    paperWidth: "80mm",
    profile: "generic",
    active: true,
    updatedAtIso: new Date().toISOString(),
  };
}

function isPositivePort(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value > 0 && value < 65536;
}

export function normalizeBranchPrinter(value: unknown, fallbackBranch = "Main"): BranchPrinterConfig {
  const base = defaultBranchPrinter(fallbackBranch);
  if (!value || typeof value !== "object") return base;
  const row = value as Partial<BranchPrinterConfig>;
  const branch = typeof row.branch === "string" && row.branch.trim() ? row.branch.trim() : base.branch;
  const host = typeof row.host === "string" && row.host.trim() ? row.host.trim() : base.host;
  const agentUrl =
    typeof row.agentUrl === "string" && row.agentUrl.trim() ? row.agentUrl.trim().replace(/\/$/, "") : base.agentUrl;
  const port = isPositivePort(row.port) ? Math.floor(row.port) : base.port;
  return {
    id: typeof row.id === "string" && row.id.trim() ? row.id : branchPrinterRecordId(branch),
    branch,
    host,
    port,
    agentUrl,
    paperWidth: isPaperWidth(row.paperWidth) ? row.paperWidth : base.paperWidth,
    profile: isPrinterProfile(row.profile) ? row.profile : base.profile,
    active: row.active !== false,
    updatedAtIso: typeof row.updatedAtIso === "string" ? row.updatedAtIso : base.updatedAtIso,
    updatedBy: typeof row.updatedBy === "string" ? row.updatedBy : undefined,
  };
}

export function upsertBranchPrinter(
  records: BranchPrinterConfig[],
  next: BranchPrinterConfig,
): BranchPrinterConfig[] {
  const normalized = normalizeBranchPrinter(next, next.branch);
  const exists = records.some((row) => row.id === normalized.id);
  return exists
    ? records.map((row) => (row.id === normalized.id ? normalized : row))
    : [...records, normalized];
}

export function findBranchPrinter(
  records: readonly BranchPrinterConfig[],
  branch: string,
): BranchPrinterConfig | undefined {
  const key = branch.trim().toLowerCase();
  return records.find(
    (row) => row.active && (row.branch.trim().toLowerCase() === key || row.id === branchPrinterRecordId(branch)),
  );
}

export function cacheBranchPrinters(records: readonly BranchPrinterConfig[]) {
  if (typeof window === "undefined") return;
  const normalized = records.map((row) => normalizeBranchPrinter(row, row.branch));
  window.localStorage.setItem(BRANCH_PRINTERS_CACHE_KEY, JSON.stringify(normalized));
}

export function loadCachedBranchPrinters(): BranchPrinterConfig[] {
  if (typeof window === "undefined") return [];
  try {
    const parsed = JSON.parse(window.localStorage.getItem(BRANCH_PRINTERS_CACHE_KEY) ?? "null");
    if (!Array.isArray(parsed)) return [];
    return parsed.map((row) => normalizeBranchPrinter(row));
  } catch {
    return [];
  }
}

export function loadCachedBranchPrinter(branch: string): BranchPrinterConfig | null {
  return findBranchPrinter(loadCachedBranchPrinters(), branch) ?? null;
}
