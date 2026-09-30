import { getModuleRecordsSnapshot, setModuleRecordsSnapshot } from "./module-records.ts";
import {
  buildPosPrinterSnapshot,
  getPosTerminalId,
  loadPosPrinterSettings,
  loadPosPrinterVerification,
  loadStoredBluetoothPrinter,
  type PosPrinterSnapshot,
  type PosPrinterVerification,
} from "./pos-printer.ts";
import {
  appendAuditEntry,
  loadSystemSettings,
  saveSystemSettings,
} from "./system-settings.ts";

export const POS_PRINTER_AUDIT_MODULE_KEY = "pos-printer-audit";

export type PosPrinterAuditAction =
  | "test_print"
  | "verify"
  | "unlock"
  | "change"
  | "unavailable"
  | "restore";

export type PosPrinterAuditEntry = {
  id: string;
  action: PosPrinterAuditAction;
  actor: string;
  actorRole: string;
  branch: string;
  terminalId: string;
  testPrintOk?: boolean;
  previousPrinter?: string;
  newPrinter?: string;
  mode?: string;
  reason?: string;
  timestamp: string;
};

function printerLabelFrom(snapshot?: PosPrinterSnapshot | null) {
  return snapshot?.printerLabel?.trim() || snapshot?.mode || "—";
}

function newAuditId() {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return `ppa-${crypto.randomUUID()}`;
  }
  return `ppa-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

export function appendPosPrinterAudit(input: {
  action: PosPrinterAuditAction;
  actor: string;
  actorRole: string;
  branch?: string;
  testPrintOk?: boolean;
  previousPrinter?: string;
  newPrinter?: string;
  mode?: string;
  reason?: string;
  previous?: PosPrinterVerification | null;
  next?: PosPrinterVerification | null;
}) {
  const previous = input.previous ?? null;
  const next = input.next ?? loadPosPrinterVerification();
  const previousLabel =
    input.previousPrinter ??
    printerLabelFrom(previous?.snapshot) ??
    printerLabelFrom(buildPosPrinterSnapshot());
  const newLabel =
    input.newPrinter ??
    printerLabelFrom(next.snapshot) ??
    printerLabelFrom(
      buildPosPrinterSnapshot(loadPosPrinterSettings(), loadStoredBluetoothPrinter()),
    );
  const entry: PosPrinterAuditEntry = {
    id: newAuditId(),
    action: input.action,
    actor: input.actor.trim() || "Staff",
    actorRole: input.actorRole.trim() || "Staff",
    branch: input.branch?.trim() || "Main",
    terminalId: getPosTerminalId(),
    testPrintOk: input.testPrintOk,
    previousPrinter: previousLabel,
    newPrinter: newLabel,
    mode: input.mode || next.snapshot?.mode || loadPosPrinterSettings().mode,
    reason: input.reason,
    timestamp: new Date().toISOString(),
  };

  const existing = getModuleRecordsSnapshot<PosPrinterAuditEntry>(POS_PRINTER_AUDIT_MODULE_KEY, []);
  setModuleRecordsSnapshot(POS_PRINTER_AUDIT_MODULE_KEY, [entry, ...existing].slice(0, 200));

  try {
    const settings = loadSystemSettings();
    const nextSettings = appendAuditEntry(settings, {
      section: "devices-printers",
      settingName: `pos-printer:${input.action}`,
      previousValue: previousLabel,
      newValue: newLabel,
      changedBy: entry.actor,
      changedByRole: entry.actorRole,
      branch: entry.branch,
      reason: [
        `terminal=${entry.terminalId}`,
        entry.mode ? `mode=${entry.mode}` : null,
        typeof entry.testPrintOk === "boolean" ? `test=${entry.testPrintOk}` : null,
        entry.reason || null,
      ]
        .filter(Boolean)
        .join("; "),
    });
    saveSystemSettings(nextSettings);
  } catch {
    // Device-local module audit is enough if system settings fail.
  }

  return entry;
}
