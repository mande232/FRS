import type { MenuItem, Order, OrderLine, StationTicket } from "./demo-data";
import type { InventoryWorkspace } from "./inventory-access";
import { formatClock } from "./date-time.ts";
import {
  appendImmutableLedgerEntries,
  convertStockQuantity,
  createCancellationReversalVoucher,
  createPosStockDeductionEntries,
  findStockManagedItemForMenuItem,
  isInDailyDashboardPeriod,
  nextInventoryDocumentNumber,
  stationToOperationalLocation,
  stockUnitFromOrderUnitLabel,
  type InventoryApprovalHistoryEntry,
  type InventoryDocumentBase,
  type InventorySettingsRecord,
  type OperationalStockLocation,
  type StockLedgerEntry,
  type StockLot,
  type StockManagedItem,
  type StockRecipe,
  DEFAULT_INVENTORY_SETTINGS,
} from "./stock-management.ts";

function todayKey(date = new Date()) {
  return date.toISOString().slice(0, 10);
}

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

export const STAFF_CONSUMPTION_TYPES = [
  "Meal",
  "Drink",
  "Coffee",
  "Alcohol",
  "Testing",
  "Management",
  "Other",
] as const;

export type StaffConsumptionType = (typeof STAFF_CONSUMPTION_TYPES)[number];

export const STAFF_CONSUMPTION_STATUSES = ["Submitted", "Rejected", "Posted", "Reversed"] as const;
export type StaffConsumptionStatus = (typeof STAFF_CONSUMPTION_STATUSES)[number];

export const STAFF_CONSUMPTION_STATIONS = [
  "Kitchen",
  "Main Bar",
  "VIP Bar",
  "Coffee House",
  "Butcher House",
] as const;

export type StaffConsumptionStation = (typeof STAFF_CONSUMPTION_STATIONS)[number];

export const STAFF_SERVING_VARIANTS = [
  "Bottle",
  "Single Shot",
  "Double Shot",
  "Plate",
  "Cup",
  "Single",
  "Double",
  "kg",
] as const;

export type StaffServingVariant = (typeof STAFF_SERVING_VARIANTS)[number];

export const STAFF_CONSUMPTION_SHIFTS = ["Morning", "Afternoon", "Evening", "Night", "Split"] as const;

export interface StaffConsumptionLine {
  id: string;
  menuItemId: string;
  menuItemName: string;
  menuCategory: string;
  stockSku?: string;
  stockItemId?: string;
  stockItemName?: string;
  unitLabel: string;
  quantity: number;
  deductionQuantity: number;
  deductionUnit: string;
  inventoryCost: number;
  station: StaffConsumptionStation;
  stockDeductionLocation: OperationalStockLocation;
  notes?: string;
}

export interface StaffConsumptionDocument extends InventoryDocumentBase {
  documentType: "Staff Consumption Voucher";
  status: StaffConsumptionStatus;
  consumptionNumber: string;
  recordedAt: string;
  recordedByManagerId: string;
  recordedByManagerName: string;
  submittedById?: string;
  submittedByName?: string;
  approvedBy?: string;
  approvedAt?: string;
  rejectedBy?: string;
  rejectedAt?: string;
  rejectionReason?: string;
  staffMemberId: string;
  staffMemberName: string;
  employeeId: string;
  department: string;
  role: string;
  branch: string;
  shift?: string;
  consumptionType: StaffConsumptionType;
  reason: string;
  lines: StaffConsumptionLine[];
  totalQuantity: number;
  totalInventoryCost: number;
  revenue: 0;
  ledgerEntryIds: string[];
  reversalOf?: string;
  reversedBy?: string;
  reversedAt?: string;
  reversalReason?: string;
}

export interface StaffConsumptionDraftLine {
  menuItemId: string;
  quantity: number;
  unitLabel: string;
  station: StaffConsumptionStation;
  stockDeductionLocation: OperationalStockLocation;
  notes?: string;
}

export interface StaffConsumptionReportRow {
  date: string;
  referenceNo: string;
  staffMemberName: string;
  employeeId: string;
  department: string;
  role: string;
  consumptionType: string;
  itemName: string;
  category: string;
  unitLabel: string;
  quantity: number;
  deductionQuantity: number;
  deductionUnit: string;
  inventoryCost: number;
  station: string;
  recordedBy: string;
  reason: string;
  status: StaffConsumptionStatus;
}

export function isSpiritMenuItem(item: Pick<MenuItem, "category">) {
  const category = item.category.trim().toLowerCase();
  return category.includes("spirit") || category.includes("whisky") || category.includes("whiskey");
}

export function isButcherStyleStationName(station: string) {
  const key = station.trim().toLowerCase();
  return key.includes("butcher") || key.includes("meat") || key.includes("grill");
}

export function isPosStyleKgMenuItem(item: Pick<MenuItem, "category" | "pricingMode" | "station">) {
  const category = item.category.trim().toLowerCase();
  return item.pricingMode === "kg" || category === "meat" || isButcherStyleStationName(item.station);
}

export function stationToDeductionLocation(station: StaffConsumptionStation): OperationalStockLocation {
  if (station === "Butcher House") return "Butcher";
  const mapped = stationToOperationalLocation(station);
  if (mapped) return mapped;
  return station === "Main Bar" ? "Main Bar" : "Kitchen";
}

export function defaultServingVariantsForMenuItem(item: MenuItem): string[] {
  if (isSpiritMenuItem(item)) {
    return ["Bottle", "Single Shot", "Double Shot"];
  }
  if (isPosStyleKgMenuItem(item)) return ["kg"];
  if (item.unitLabel) return [item.unitLabel];
  return ["Plate"];
}

export function defaultStaffConsumptionQuantityForMenuItem(item: MenuItem): number {
  if (isSpiritMenuItem(item)) return 1;
  if (isPosStyleKgMenuItem(item)) return item.defaultQty ?? 0.5;
  return item.defaultQty ?? 1;
}

export function quantityStepForMenuItem(item: MenuItem): number {
  if (isPosStyleKgMenuItem(item)) return item.qtyStep ?? 0.25;
  return item.qtyStep ?? 1;
}

export function resolveMenuStockLink(
  items: StockManagedItem[],
  menuItem: MenuItem,
): StockManagedItem | undefined {
  return findStockManagedItemForMenuItem(items, {
    id: menuItem.id,
    name_en: menuItem.name_en,
    stockSku: menuItem.stockSku,
  });
}

function toBaseQuantity(stockItem: StockManagedItem, quantity: number, unitLabel: string): number {
  const fromUnit = stockUnitFromOrderUnitLabel(unitLabel) ?? stockItem.baseUnit;
  if (fromUnit === stockItem.baseUnit) return qty(quantity);
  const converted = convertStockQuantity(stockItem, quantity, fromUnit, stockItem.baseUnit);
  return Number.isFinite(converted) ? qty(converted) : qty(quantity);
}

function summarizeLines(lines: StaffConsumptionLine[]) {
  return {
    totalQuantity: qty(lines.reduce((sum, line) => sum + line.quantity, 0)),
    totalInventoryCost: money(lines.reduce((sum, line) => sum + line.inventoryCost, 0)),
  };
}

export function buildStaffConsumptionLines(input: {
  draftLines: StaffConsumptionDraftLine[];
  menuItems: MenuItem[];
  items: StockManagedItem[];
}): StaffConsumptionLine[] {
  return input.draftLines
    .filter((draft) => draft.quantity > 0)
    .map((draft, index) => {
      const menuItem = input.menuItems.find((row) => row.id === draft.menuItemId);
      if (!menuItem) throw new Error(`Menu item not found: ${draft.menuItemId}`);

      const stockItem = resolveMenuStockLink(input.items, menuItem);
      let deductionQuantity = qty(draft.quantity);
      let deductionUnit = draft.unitLabel;
      let inventoryCost = 0;

      if (stockItem) {
        deductionUnit = stockItem.baseUnit;
        deductionQuantity = toBaseQuantity(stockItem, draft.quantity, draft.unitLabel);
        inventoryCost = money(deductionQuantity * stockItem.purchasePrice);
      } else if (menuItem.cost > 0) {
        inventoryCost = money(menuItem.cost * draft.quantity);
      }

      return {
        id: `sc-line-${Date.now()}-${index}`,
        menuItemId: menuItem.id,
        menuItemName: menuItem.name_en,
        menuCategory: menuItem.category,
        stockSku: menuItem.stockSku,
        stockItemId: stockItem?.id,
        stockItemName: stockItem?.name,
        unitLabel: draft.unitLabel,
        quantity: qty(draft.quantity),
        deductionQuantity,
        deductionUnit,
        inventoryCost,
        station: draft.station,
        stockDeductionLocation: draft.stockDeductionLocation,
        notes: draft.notes,
      };
    });
}

export function createStaffConsumptionDocument(input: {
  staffMemberId: string;
  staffMemberName: string;
  employeeId: string;
  department: string;
  role: string;
  branch: string;
  shift?: string;
  consumptionType: StaffConsumptionType;
  reason: string;
  notes?: string;
  recordedByManagerId: string;
  recordedByManagerName: string;
  recordedAt?: string;
  menuItems: MenuItem[];
  items: StockManagedItem[];
  lines: StaffConsumptionDraftLine[];
  existingNumbers: string[];
}): StaffConsumptionDocument {
  if (!input.reason.trim()) {
    throw new Error("Reason is required.");
  }
  if (input.lines.length === 0) {
    throw new Error("Add at least one consumption line.");
  }

  const tableLines = buildStaffConsumptionLines({
    draftLines: input.lines,
    menuItems: input.menuItems,
    items: input.items,
  });
  const recordedAt = input.recordedAt ?? nowIso();
  const consumptionNumber = nextInventoryDocumentNumber(
    "SC",
    input.existingNumbers,
    new Date(recordedAt),
  );
  const totals = summarizeLines(tableLines);

  return {
    id: `staff-consumption-${Date.now()}`,
    documentType: "Staff Consumption Voucher",
    documentNumber: consumptionNumber,
    consumptionNumber,
    status: "Submitted",
    recordedAt,
    recordedByManagerId: input.recordedByManagerId,
    recordedByManagerName: input.recordedByManagerName,
    submittedById: input.recordedByManagerId,
    submittedByName: input.recordedByManagerName,
    staffMemberId: input.staffMemberId,
    staffMemberName: input.staffMemberName,
    employeeId: input.employeeId,
    department: input.department,
    role: input.role,
    branch: input.branch,
    shift: input.shift?.trim() || undefined,
    consumptionType: input.consumptionType,
    reason: input.reason.trim(),
    createdAt: recordedAt,
    createdBy: input.recordedByManagerName,
    notes: input.notes?.trim() || undefined,
    approvalHistory: [
      historyEntry("Submitted", input.recordedByManagerName, "Staff consumption recorded"),
    ],
    lines: tableLines,
    totalQuantity: totals.totalQuantity,
    totalInventoryCost: totals.totalInventoryCost,
    revenue: 0,
    ledgerEntryIds: [],
  };
}

export function rejectStaffConsumptionDocument(input: {
  document: StaffConsumptionDocument;
  rejectedBy: string;
  rejectionReason: string;
}): StaffConsumptionDocument {
  if (input.document.status !== "Submitted") {
    throw new Error("Only submitted staff consumption can be rejected.");
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

export function postStaffConsumptionDocument(input: {
  document: StaffConsumptionDocument;
  menuItems: MenuItem[];
  items: StockManagedItem[];
  recipes: StockRecipe[];
  ledger: StockLedgerEntry[];
  lots?: StockLot[];
  settings?: InventorySettingsRecord;
  postedBy: string;
}): {
  document: StaffConsumptionDocument;
  ledgerEntries: StockLedgerEntry[];
  ledger: StockLedgerEntry[];
  lots: StockLot[];
} {
  const settings = input.settings ?? DEFAULT_INVENTORY_SETTINGS;
  if (input.document.status === "Reversed") {
    throw new Error("Cannot post a reversed staff consumption record.");
  }
  if (input.document.status === "Rejected") {
    throw new Error("Cannot post a rejected staff consumption record.");
  }
  if (input.document.status === "Posted" && input.document.ledgerEntryIds.length > 0) {
    throw new Error("This staff consumption record is already posted.");
  }

  const lotState = { lots: [...(input.lots ?? [])] };
  const referenceNo = input.document.consumptionNumber;

  const ledgerEntries = createPosStockDeductionEntries(
    {
      orderId: input.document.id,
      orderNo: referenceNo,
      closedAt: input.document.recordedAt,
      enteredBy: input.postedBy,
      lines: input.document.lines.map((line) => ({
        name: line.menuItemName,
        qty: line.quantity,
        stockSku: line.stockSku,
        menuItemId: line.menuItemId,
        stockDeductionLocation: line.stockDeductionLocation,
        station: line.station,
        unitLabel: line.unitLabel,
      })),
      skipIfAlreadyDeducted: true,
      ledgerProfile: {
        directType: "STAFF_CONSUMPTION",
        recipeType: "STAFF_CONSUMPTION",
        referenceNo,
        notesPrefix: `Staff consumption ${referenceNo} (${input.document.staffMemberName})`,
        entryIdPrefix: `sled-sc-${input.document.id}`,
      },
    },
    input.items,
    input.recipes,
    input.ledger,
    lotState,
    settings,
  );

  if (ledgerEntries.length === 0) {
    throw new Error("No inventory deduction was created. Check menu stock links and available stock.");
  }

  const ledger = appendImmutableLedgerEntries(input.ledger, ledgerEntries);
  const postedDocument: StaffConsumptionDocument = {
    ...input.document,
    status: "Posted",
    approvedBy: input.postedBy,
    approvedAt: nowIso(),
    totalInventoryCost: money(
      ledgerEntries.reduce((sum, entry) => sum + (entry.totalCost ?? 0), 0),
    ),
    ledgerEntryIds: ledgerEntries.map((entry) => entry.id),
    approvalHistory: [
      ...input.document.approvalHistory,
      historyEntry("Posted", input.postedBy, "Staff consumption posted to stock ledger"),
    ],
  };

  return {
    document: postedDocument,
    ledgerEntries,
    ledger,
    lots: lotState.lots,
  };
}

/** Build a station/KDS + Bono order under the consuming staff member's name (stock already posted). */
export function buildStaffConsumptionStationOrder(
  document: StaffConsumptionDocument,
  options?: { sentAt?: string },
): Order {
  const sentAt = options?.sentAt ?? formatClock(new Date(document.recordedAt || Date.now()));
  const items: OrderLine[] = document.lines.map((line) => ({
    menuItemId: line.menuItemId,
    name: line.menuItemName,
    qty: line.quantity,
    unitLabel: line.unitLabel,
    stockSku: line.stockSku,
    station: line.station,
    finalStation: line.station,
    unitPrice: 0,
    done: false,
    stockDeductionLocation: line.stockDeductionLocation,
    stockDeducted: true,
    note: line.notes,
  }));

  const stationTickets: StationTicket[] = (() => {
    const grouped = new Map<string, OrderLine[]>();
    for (const item of items) {
      const key = item.station.trim().toLowerCase() || "kitchen";
      const list = grouped.get(key) ?? [];
      list.push(item);
      grouped.set(key, list);
    }
    return [...grouped.entries()].map(([key, stationItems]) => ({
      id: `${document.id}-${key.replace(/\s+/g, "-")}`,
      station: stationItems[0]!.station,
      status: "NEW" as const,
      sentAt,
      items: stationItems,
    }));
  })();

  return {
    id: document.id,
    orderNo: document.consumptionNumber,
    source: "Dine-in",
    ref: `Staff ${document.consumptionNumber}`,
    customerName: document.staffMemberName,
    customerNotes: `${document.consumptionType}: ${document.reason}`,
    area: "Main Hall",
    tableNumber: "STAFF",
    orderedByWaiter: document.staffMemberName,
    waiter: document.staffMemberName,
    enteredByCashier: document.recordedByManagerName,
    server: document.staffMemberName,
    items,
    stationTickets,
    sentAt,
    stationSentAt: sentAt,
    createdAtIso: document.recordedAt,
    priority: "Normal",
    status: "NEW",
    paymentStatus: "Paid",
    openedMin: 0,
    total: 0,
    stockDeductedAt: document.approvedAt ?? document.recordedAt,
  };
}

export function isStaffConsumptionStationOrder(order: Pick<Order, "tableNumber" | "ref">) {
  return (
    order.tableNumber.trim().toUpperCase() === "STAFF" ||
    order.ref.trim().toLowerCase().startsWith("staff ")
  );
}

export function reverseStaffConsumptionDocument(input: {
  document: StaffConsumptionDocument;
  ledger: StockLedgerEntry[];
  reversedBy: string;
  reversalReason: string;
}): {
  document: StaffConsumptionDocument;
  reversalDocument: StaffConsumptionDocument;
  ledgerEntries: StockLedgerEntry[];
  ledger: StockLedgerEntry[];
  reversalVoucher: ReturnType<typeof createCancellationReversalVoucher>["voucher"];
} {
  if (input.document.status === "Reversed") {
    throw new Error("This staff consumption record is already reversed.");
  }
  if (!input.reversalReason.trim()) {
    throw new Error("Reversal reason is required.");
  }

  const sourceEntries = input.ledger.filter(
    (entry) =>
      entry.referenceNo === input.document.consumptionNumber &&
      entry.type === "STAFF_CONSUMPTION",
  );
  if (sourceEntries.length === 0) {
    throw new Error("No ledger entries found for this staff consumption record.");
  }

  const { voucher, reversalEntries } = createCancellationReversalVoucher(
    input.document.consumptionNumber,
    "Staff Consumption Voucher",
    input.reversedBy,
    input.reversalReason.trim(),
    sourceEntries,
  );

  const ledger = appendImmutableLedgerEntries(input.ledger, reversalEntries);
  const reversedAt = nowIso();
  const reversalNumber = nextInventoryDocumentNumber("SC-REV", []);

  const reversalDocument: StaffConsumptionDocument = {
    ...input.document,
    id: `staff-consumption-rev-${Date.now()}`,
    documentNumber: reversalNumber,
    consumptionNumber: reversalNumber,
    status: "Posted",
    recordedAt: reversedAt,
    recordedByManagerId: input.document.recordedByManagerId,
    recordedByManagerName: input.reversedBy,
    reversalOf: input.document.consumptionNumber,
    reason: `Reversal: ${input.reversalReason.trim()}`,
    createdAt: reversedAt,
    createdBy: input.reversedBy,
    notes: `Reversal of ${input.document.consumptionNumber}`,
    approvalHistory: [historyEntry("Reversed", input.reversedBy, input.reversalReason.trim())],
    ledgerEntryIds: reversalEntries.map((entry) => entry.id),
    totalInventoryCost: money(
      reversalEntries.reduce((sum, entry) => sum + (entry.totalCost ?? 0), 0),
    ),
  };

  const document: StaffConsumptionDocument = {
    ...input.document,
    status: "Reversed",
    reversedBy: input.reversedBy,
    reversedAt,
    reversalReason: input.reversalReason.trim(),
    approvalHistory: [
      ...input.document.approvalHistory,
      historyEntry("Reversed", input.reversedBy, input.reversalReason.trim()),
    ],
  };

  return {
    document,
    reversalDocument,
    ledgerEntries: reversalEntries,
    ledger,
    reversalVoucher: voucher,
  };
}

export function buildStaffConsumptionReport(input: {
  documents: StaffConsumptionDocument[];
  from?: string;
  to?: string;
  staffMemberId?: string;
  department?: string;
  role?: string;
  station?: StaffConsumptionStation | "ALL";
  consumptionType?: StaffConsumptionType | "ALL";
  itemId?: string;
  category?: string;
}): StaffConsumptionReportRow[] {
  const rows: StaffConsumptionReportRow[] = [];

  input.documents.forEach((doc) => {
    if (doc.reversalOf) return;
    if (doc.status !== "Posted") return;
    const dateKey = doc.recordedAt.slice(0, 10);
    if (input.from && dateKey < input.from) return;
    if (input.to && dateKey > input.to) return;
    if (input.staffMemberId && doc.staffMemberId !== input.staffMemberId) return;
    if (input.department && doc.department !== input.department) return;
    if (input.role && doc.role !== input.role) return;
    if (
      input.consumptionType &&
      input.consumptionType !== "ALL" &&
      doc.consumptionType !== input.consumptionType
    ) {
      return;
    }

    doc.lines.forEach((line) => {
      if (input.station && input.station !== "ALL" && line.station !== input.station) return;
      if (input.itemId && line.menuItemId !== input.itemId) return;
      if (input.category && line.menuCategory !== input.category) return;

      rows.push({
        date: dateKey,
        referenceNo: doc.consumptionNumber,
        staffMemberName: doc.staffMemberName,
        employeeId: doc.employeeId,
        department: doc.department,
        role: doc.role,
        consumptionType: doc.consumptionType,
        itemName: line.menuItemName,
        category: line.menuCategory,
        unitLabel: line.unitLabel,
        quantity: line.quantity,
        deductionQuantity: line.deductionQuantity,
        deductionUnit: line.deductionUnit,
        inventoryCost: line.inventoryCost,
        station: line.station,
        recordedBy: doc.recordedByManagerName,
        reason: doc.reason,
        status: doc.status,
      });
    });
  });

  return rows.sort((a, b) => b.date.localeCompare(a.date));
}

export function todayStaffConsumptionTotals(documents: StaffConsumptionDocument[], date = todayKey()) {
  const posted = documents.filter(
    (doc) => doc.status === "Posted" && doc.recordedAt.startsWith(date) && !doc.reversalOf,
  );
  const submitted = documents.filter(
    (doc) => doc.status === "Submitted" && doc.recordedAt.startsWith(date),
  );
  return {
    count: posted.length,
    submitted: submitted.length,
    quantity: qty(posted.reduce((sum, doc) => sum + doc.totalQuantity, 0)),
    cost: money(posted.reduce((sum, doc) => sum + doc.totalInventoryCost, 0)),
  };
}

export interface StaffConsumptionDashboardLineItem {
  itemName: string;
  quantity: number;
  totalCost: number;
}

export interface StaffConsumptionDashboardRecord {
  referenceNo: string;
  recordedAt: string;
  staffMemberName: string;
  consumptionType: string;
  lines: StaffConsumptionDashboardLineItem[];
  totalQuantity: number;
  totalInventoryCost: number;
  recordedBy: string;
  status: StaffConsumptionStatus;
}

export interface StaffConsumptionByStaffRow {
  staffMemberId: string;
  staffMemberName: string;
  records: number;
  quantity: number;
  cost: number;
}

export interface StaffConsumptionDashboardSummary {
  todayRecords: number;
  todayQuantity: number;
  todayCost: number;
  topItems: Array<{ itemName: string; quantity: number; totalCost: number }>;
  recentRecords: StaffConsumptionDashboardRecord[];
  byStaff: StaffConsumptionByStaffRow[];
}

export const EMPTY_STAFF_CONSUMPTION_DASHBOARD: StaffConsumptionDashboardSummary = {
  todayRecords: 0,
  todayQuantity: 0,
  todayCost: 0,
  topItems: [],
  recentRecords: [],
  byStaff: [],
};

export function buildStaffConsumptionDashboardSummary(
  documents: StaffConsumptionDocument[],
  options: {
    workspace: InventoryWorkspace;
    assignedLocations?: OperationalStockLocation[];
    dailyPeriodStart: string | null;
    today?: string;
    detailLimit?: number;
  },
): StaffConsumptionDashboardSummary {
  const today = options.today ?? todayKey();
  const detailLimit = options.detailLimit ?? 8;

  const matchesLocation = (location: OperationalStockLocation) => {
    if (options.workspace !== "all") {
      return location === options.workspace;
    }
    if (options.assignedLocations && options.assignedLocations.length > 0) {
      return options.assignedLocations.includes(location);
    }
    return true;
  };

  const inDashboardPeriod = (recordedAt: string) =>
    isInDailyDashboardPeriod(today, recordedAt, options.dailyPeriodStart);

  const itemMap = new Map<string, { itemName: string; quantity: number; totalCost: number }>();
  const staffMap = new Map<string, StaffConsumptionByStaffRow>();
  const recentRecords: StaffConsumptionDashboardRecord[] = [];
  let todayRecords = 0;
  let todayQuantity = 0;
  let todayCost = 0;

  const eligible = documents
    .filter((doc) => doc.status === "Posted" && !doc.reversalOf && inDashboardPeriod(doc.recordedAt))
    .sort((a, b) => b.recordedAt.localeCompare(a.recordedAt));

  for (const doc of eligible) {
    const matchingLines = doc.lines.filter((line) => matchesLocation(line.stockDeductionLocation));
    if (matchingLines.length === 0) continue;

    const docQty = qty(matchingLines.reduce((sum, line) => sum + line.quantity, 0));
    const docCost = money(matchingLines.reduce((sum, line) => sum + line.inventoryCost, 0));

    todayRecords += 1;
    todayQuantity = qty(todayQuantity + docQty);
    todayCost = money(todayCost + docCost);

    for (const line of matchingLines) {
      const current = itemMap.get(line.menuItemName) ?? { itemName: line.menuItemName, quantity: 0, totalCost: 0 };
      current.quantity = qty(current.quantity + line.quantity);
      current.totalCost = money(current.totalCost + line.inventoryCost);
      itemMap.set(line.menuItemName, current);
    }

    const staffRow =
      staffMap.get(doc.staffMemberId) ??
      ({
        staffMemberId: doc.staffMemberId,
        staffMemberName: doc.staffMemberName,
        records: 0,
        quantity: 0,
        cost: 0,
      } satisfies StaffConsumptionByStaffRow);
    staffRow.records += 1;
    staffRow.quantity = qty(staffRow.quantity + docQty);
    staffRow.cost = money(staffRow.cost + docCost);
    staffMap.set(doc.staffMemberId, staffRow);

    if (recentRecords.length < detailLimit) {
      recentRecords.push({
        referenceNo: doc.consumptionNumber,
        recordedAt: doc.recordedAt,
        staffMemberName: doc.staffMemberName,
        consumptionType: doc.consumptionType,
        lines: matchingLines.map((line) => ({
          itemName: line.menuItemName,
          quantity: line.quantity,
          totalCost: line.inventoryCost,
        })),
        totalQuantity: docQty,
        totalInventoryCost: docCost,
        recordedBy: doc.recordedByManagerName,
        status: doc.status,
      });
    }
  }

  return {
    todayRecords,
    todayQuantity,
    todayCost,
    topItems: [...itemMap.values()].sort((a, b) => b.quantity - a.quantity).slice(0, 5),
    recentRecords,
    byStaff: [...staffMap.values()].sort((a, b) => b.cost - a.cost),
  };
}
