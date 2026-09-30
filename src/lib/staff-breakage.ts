import type { InventoryWorkspace } from "./inventory-access.ts";
import {
  appendImmutableLedgerEntries,
  createCancellationReversalVoucher,
  nextInventoryDocumentNumber,
  validateStockLedgerEntry,
  type InventoryApprovalHistoryEntry,
  type InventoryDocumentBase,
  type StockLedgerEntry,
  type StockLocation,
  type StockManagedItem,
  type StockUnitType,
} from "./stock-management.ts";

function money(value: number) {
  return Math.round((Number.isFinite(value) ? value : 0) * 100) / 100;
}

function qty(value: number) {
  return Math.round((Number.isFinite(value) ? value : 0) * 1000) / 1000;
}

function nowIso() {
  return new Date().toISOString();
}

function historyEntry(
  action: InventoryApprovalHistoryEntry["action"],
  actedBy: string,
  notes?: string,
): InventoryApprovalHistoryEntry {
  return {
    id: `hist-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    action,
    actedBy,
    actedAt: nowIso(),
    notes,
  };
}

export const STAFF_BREAKAGE_REASONS = [
  "Broken glass",
  "Dropped bottle",
  "Cracked plate",
  "Chipped cup",
  "Broken cutlery",
  "Other",
] as const;

export type StaffBreakageReason = (typeof STAFF_BREAKAGE_REASONS)[number];
export const STAFF_BREAKAGE_STATUSES = ["Submitted", "Rejected", "Posted", "Reversed"] as const;
export type StaffBreakageStatus = (typeof STAFF_BREAKAGE_STATUSES)[number];

export interface StaffBreakageDocument extends InventoryDocumentBase {
  documentType: "Staff Breakage Voucher";
  status: StaffBreakageStatus;
  breakageNumber: string;
  recordedAt: string;
  submittedById: string;
  submittedByName: string;
  staffMemberId: string;
  staffMemberName: string;
  employeeId: string;
  department: string;
  role: string;
  branch: string;
  location: StockLocation;
  itemId: string;
  itemName: string;
  unit: StockUnitType;
  quantity: number;
  unitCost: number;
  totalCost: number;
  reason: StaffBreakageReason | string;
  chargeToStaff: boolean;
  ledgerEntryIds: string[];
  approvedBy?: string;
  approvedAt?: string;
  rejectedBy?: string;
  rejectedAt?: string;
  rejectionReason?: string;
  reversedBy?: string;
  reversedAt?: string;
  reversalReason?: string;
}

export function createStaffBreakageDocument(input: {
  staffMemberId: string;
  staffMemberName: string;
  employeeId: string;
  department: string;
  role: string;
  branch: string;
  submittedById: string;
  submittedByName: string;
  location: StockLocation;
  item: StockManagedItem;
  quantity: number;
  unit: StockUnitType;
  reason: string;
  notes?: string;
  chargeToStaff: boolean;
  existingNumbers: string[];
}): StaffBreakageDocument {
  if (!(input.quantity > 0)) throw new Error("Breakage quantity must be greater than zero.");
  if (!input.reason.trim()) throw new Error("Breakage reason is required.");

  const recordedAt = nowIso();
  const breakageNumber = nextInventoryDocumentNumber("SB", input.existingNumbers, new Date(recordedAt));
  const quantity = qty(input.quantity);
  const unitCost = money(input.item.purchasePrice);
  const totalCost = money(quantity * unitCost);

  return {
    id: `staff-breakage-${Date.now()}`,
    documentType: "Staff Breakage Voucher",
    documentNumber: breakageNumber,
    breakageNumber,
    status: "Submitted",
    recordedAt,
    submittedById: input.submittedById,
    submittedByName: input.submittedByName,
    staffMemberId: input.staffMemberId,
    staffMemberName: input.staffMemberName,
    employeeId: input.employeeId,
    department: input.department,
    role: input.role,
    branch: input.branch,
    location: input.location,
    itemId: input.item.id,
    itemName: input.item.name,
    unit: input.unit,
    quantity,
    unitCost,
    totalCost,
    reason: input.reason.trim(),
    chargeToStaff: input.chargeToStaff,
    createdAt: recordedAt,
    createdBy: input.submittedByName,
    notes: input.notes?.trim() || undefined,
    approvalHistory: [historyEntry("Submitted", input.submittedByName, "Staff breakage submitted")],
    ledgerEntryIds: [],
  };
}

export function rejectStaffBreakageDocument(input: {
  document: StaffBreakageDocument;
  rejectedBy: string;
  rejectionReason: string;
}): StaffBreakageDocument {
  if (input.document.status !== "Submitted") {
    throw new Error("Only submitted breakage vouchers can be rejected.");
  }
  if (!input.rejectionReason.trim()) throw new Error("Rejection reason is required.");
  return {
    ...input.document,
    status: "Rejected",
    rejectedBy: input.rejectedBy,
    rejectedAt: nowIso(),
    rejectionReason: input.rejectionReason.trim(),
    approvalHistory: [
      ...input.document.approvalHistory,
      historyEntry("Rejected", input.rejectedBy, input.rejectionReason.trim()),
    ],
  };
}

export function postStaffBreakageDocument(input: {
  document: StaffBreakageDocument;
  items: StockManagedItem[];
  ledger: StockLedgerEntry[];
  postedBy: string;
}): { document: StaffBreakageDocument; ledger: StockLedgerEntry[]; ledgerEntries: StockLedgerEntry[] } {
  if (input.document.status === "Reversed") {
    throw new Error("Cannot post a reversed breakage voucher.");
  }
  if (input.document.status === "Rejected") {
    throw new Error("Cannot post a rejected breakage voucher.");
  }
  if (input.document.status === "Posted" && input.document.ledgerEntryIds.length > 0) {
    throw new Error("This breakage voucher is already posted.");
  }

  const item = input.items.find((row) => row.id === input.document.itemId);
  if (!item) throw new Error("Broken stock item was not found.");

  const entry: StockLedgerEntry = {
    id: `sled-sb-${input.document.id}`,
    type: "DAMAGE",
    date: input.document.recordedAt.slice(0, 10),
    itemId: item.id,
    itemName: item.name,
    category: item.category,
    location: input.document.location,
    quantity: input.document.quantity,
    unit: input.document.unit,
    unitPrice: input.document.unitCost,
    totalCost: input.document.totalCost,
    enteredBy: input.postedBy,
    approvedBy: input.postedBy,
    reason: "Breakage",
    notes: `Staff breakage ${input.document.breakageNumber} (${input.document.staffMemberName}): ${input.document.reason}${
      input.document.chargeToStaff ? " · charge to staff" : ""
    }`,
    referenceNo: input.document.breakageNumber,
    transactionAt: nowIso(),
    immutable: true,
  };

  const validation = validateStockLedgerEntry(input.items, input.ledger, entry, {
    allowNegativeStock: false,
  });
  if (!validation.ok) throw new Error(validation.error);

  const ledger = appendImmutableLedgerEntries(input.ledger, [entry]);
  const postedAt = nowIso();
  return {
    ledger,
    ledgerEntries: [entry],
    document: {
      ...input.document,
      status: "Posted",
      approvedBy: input.postedBy,
      approvedAt: postedAt,
      ledgerEntryIds: [entry.id],
      totalCost: money(entry.totalCost),
      approvalHistory: [
        ...input.document.approvalHistory,
        historyEntry("Posted", input.postedBy, "Breakage posted to stock as damage"),
      ],
    },
  };
}

export function reverseStaffBreakageDocument(input: {
  document: StaffBreakageDocument;
  ledger: StockLedgerEntry[];
  reversedBy: string;
  reversalReason: string;
}): {
  document: StaffBreakageDocument;
  ledger: StockLedgerEntry[];
  reversalVoucher: ReturnType<typeof createCancellationReversalVoucher>["voucher"];
} {
  if (input.document.status !== "Posted") {
    throw new Error("Only posted breakage vouchers can be reversed.");
  }
  if (!input.reversalReason.trim()) throw new Error("Reversal reason is required.");

  const sourceEntries = input.ledger.filter(
    (entry) => entry.referenceNo === input.document.breakageNumber && entry.type === "DAMAGE",
  );
  if (sourceEntries.length === 0) {
    throw new Error("No ledger entries found for this breakage voucher.");
  }

  const { voucher, reversalEntries } = createCancellationReversalVoucher(
    input.document.breakageNumber,
    "Staff Breakage Voucher",
    input.reversedBy,
    input.reversalReason.trim(),
    sourceEntries,
  );

  return {
    ledger: appendImmutableLedgerEntries(input.ledger, reversalEntries),
    reversalVoucher: voucher,
    document: {
      ...input.document,
      status: "Reversed",
      reversedBy: input.reversedBy,
      reversedAt: nowIso(),
      reversalReason: input.reversalReason.trim(),
      approvalHistory: [
        ...input.document.approvalHistory,
        historyEntry("Reversed", input.reversedBy, input.reversalReason.trim()),
      ],
    },
  };
}

export function filterStaffBreakagesForWorkspace(
  documents: StaffBreakageDocument[],
  workspace: InventoryWorkspace,
) {
  if (workspace === "all") return documents;
  return documents.filter((doc) => doc.location === workspace);
}
