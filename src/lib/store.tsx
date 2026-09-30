import {
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { StoreCtx } from "./store-context";
import {
  MENU,
  ORDERS,
  TABLES,
  STOCK,
  CUSTOMERS,
  PAYMENTS_LEDGER,
  RESERVATIONS,
  SALES_RECORDS,
  EXPENSE_RECORDS,
  SUPPLIERS,
  PURCHASE_ORDERS,
  isFinalOrderStatus,
  type Table,
  type Order,
  type OrderPriority,
  type MenuItem,
  type SeatingArea,
  type OrderLine,
  type OrderPayment,
  type OrderReceipt,
  type PaymentMethod,
  type ProductionStation,
  type SalesRecord,
  type ExpenseRecord,
  type Supplier,
  type PurchaseOrder,
  type StationTicket,
  type StationTicketStatus,
} from "./demo-data";
import {
  DEFAULT_RESTAURANT_PROFILE,
  clearRestaurantProfile,
  loadRestaurantProfile,
  normalizeRestaurantProfile,
  saveRestaurantProfile,
  type RestaurantProfile,
} from "./brand";
import { formatClock as formatClockDisplay, formatDateTime as formatDateTimeDisplay, formatSyncClock as formatSyncClockDisplay } from "./date-time";
import { isPosMenuStockDisconnected, loadSystemSettings } from "./system-settings";
import { earnPoints, computeTier } from "./business";
import { buildSalesRecordsFromOrder, dateKeyFromDateTime } from "./sales-analytics";
import {
  buildStoredReceiptFromOrder,
  upsertStoredReceipt,
  useStoredReceiptsModule,
  type StoredReceipt,
} from "./stored-receipts";
import {
  loadGuestOrderRequests,
  loadStoredMenuItems,
  loadStoredTables,
  saveGuestOrderRequests,
  saveStoredMenuItems,
  saveStoredTables,
} from "./guest-ordering";
import { persistPosRecords } from "./api/pos-persistence.functions";
import {
  fallbackStation,
  findStation,
  canonicalizeStationName,
  loadProductionStations,
  migrateProductionStations,
  normalizeStationName,
  resolveProductionStation,
  sameStation,
  saveProductionStations,
  uniqueStations,
} from "./stations";
import { isSupabaseConfigured, supabase } from "./supabase/client";
import {
  deleteBackendMenuItem,
  deleteBackendReservation,
  deleteBackendSupplier,
  deleteBackendTable,
  loadBackendSnapshot,
  subscribeToBackendChanges,
  syncBackendCustomers,
  syncBackendExpenseRecords,
  syncBackendGuestOrders,
  syncBackendMenuCategories,
  syncBackendMenuItems,
  upsertBackendMenuItem,
  syncBackendOrders,
  syncBackendPayments,
  syncBackendPurchaseOrders,
  syncBackendRestaurantProfile,
  syncBackendReservations,
  syncBackendSalesRecords,
  syncBackendStations,
  syncBackendStock,
  syncBackendSuppliers,
  syncBackendTables,
  upsertBackendTable,
  upsertBackendTables,
  type BackendRealtimeStatus,
} from "./supabase/pos-backend";
import type { GuestOrderRequest } from "./guest-ordering";
import { getModuleRecordsSnapshot, replaceModuleRecords, setModuleRecordsSnapshot } from "./module-records";
import { emitOrdersSocketEvent } from "./orders-realtime";
import { showError } from "./toast";
import { assignedWaiterMatches, waiterCannotUseTableReason } from "./waiter-identity";
import {
  isManualDeliveryStation,
  isOrderCompleted,
  hasLiveBillBlockingSeat,
  orderBusinessDayKey,
  resolvePaidOrderReportDate,
  stillOccupiesTable,
  normalizeReturnRequestedLines,
  orderHasManualDeliveryStations,
  printKitchenTickets,
} from "./orders-ops";
import {
  requestOpenBillsTransfer,
  rejectOpenBillsTransferRequest,
  transferOpenBillsToWaiter,
} from "./waiter-bill-transfer";
import { bonoTicketsToPrint } from "./station-ticket-print";
import {
  EMPTY_STOCK_ITEMS,
  EMPTY_STOCK_LEDGER,
  EMPTY_STOCK_RECIPES,
  STOCK_CANCELLATION_REVERSALS_SEED,
  STOCK_ITEMS_SEED,
  STOCK_LEDGER_SEED,
  STOCK_MODULE_KEYS,
  STOCK_POS_RESERVATIONS_SEED,
  STOCK_RECIPES_SEED,
  STOCK_INVENTORY_SETTINGS_SEED,
  buildLocationBalances,
  buildPosReservationDrafts,
  consumePosReservations,
  createPosOrderStockReversal,
  createPosOrderWastageEntries,
  createPosPackagedReturnEntries,
  createPosStockDeductionEntries,
  normalizeInventorySettings,
  orderHasPosStockDeduction,
  orderPreparationStarted,
  releasePosReservations,
  reservePosStock,
  resolvePosVoidStockOutcome,
  shouldDeductPosStock,
  shouldReservePosStock,
  stationToOperationalLocation,
  type CancellationReversalVoucherDocument,
  type InventorySettingsRecord,
  type OperationalStockLocation,
  type PosStockReservation,
  type PosVoidStockOutcome,
  type StockLedgerEntry,
  type StockLocationBalance,
  type StockLot,
  type StockManagedItem,
  type StockRecipe,
} from "./stock-management";
import { ensurePosStockDeductedWithFallback, mapOrderLinesForStock, readPosStockLotsSnapshot } from "./pos-stock-close";

const STOCK_ITEMS_FALLBACK = isSupabaseConfigured ? EMPTY_STOCK_ITEMS : STOCK_ITEMS_SEED;
const STOCK_LEDGER_FALLBACK = isSupabaseConfigured ? EMPTY_STOCK_LEDGER : STOCK_LEDGER_SEED;
const STOCK_RECIPES_FALLBACK = isSupabaseConfigured ? EMPTY_STOCK_RECIPES : STOCK_RECIPES_SEED;

type StockItem = (typeof STOCK)[number];
type Customer = (typeof CUSTOMERS)[number];
type Payment = (typeof PAYMENTS_LEDGER)[number];
type Reservation = (typeof RESERVATIONS)[number];
type CartLine = {
  item: MenuItem;
  qty: number;
  unitPrice?: number;
  unitLabel?: string;
  qtyStep?: number;
  preferences?: string[];
  note?: string;
};
type StoreSetter<T> = (update: T[] | ((prev: T[]) => T[])) => void;
type PosPersistencePayload = {
  menuItems?: MenuItem[];
  menuCategories?: string[];
  tables?: Table[];
  orders?: Order[];
  stations?: string[];
  stock?: StockItem[];
  suppliers?: Supplier[];
  reservations?: Reservation[];
  customers?: Customer[];
  payments?: Payment[];
  salesRecords?: SalesRecord[];
  expenseRecords?: ExpenseRecord[];
  purchaseOrders?: PurchaseOrder[];
  guestOrderRequests?: GuestOrderRequest[];
  restaurantProfile?: RestaurantProfile;
};
type NewPosOrderInput = {
  area: string;
  tableNumber: string;
  waiter: string;
  enteredByCashier: string;
  customerName?: string;
  sendToCashier?: boolean;
  items: CartLine[];
};
type CloseOrderPaymentInput = {
  method: PaymentMethod;
  collectedByWaiter: string;
  receivedByCashier: string;
  amountReceived: number;
  keepAsTip?: boolean;
  tipAmount?: number;
  closedByCashier: string;
  bankPaymentReference?: string;
  bankPaymentPhone?: string;
  bankAccountSuffix?: string;
  verificationStatus?: OrderPayment["verificationStatus"];
  verificationRequestId?: string;
  verificationBank?: string;
  verificationAmount?: number;
  verificationMessage?: string;
  verifiedAt?: string;
  mixedBankPayments?: OrderPayment["mixedBankPayments"];
};
type GenerateReceiptInput = {
  generatedBy: string;
  serviceChargeEnabled?: boolean;
  serviceCharge?: number;
  discount?: number;
};
type ReceiptPrintResult = {
  receipt: OrderReceipt;
  reprint: boolean;
};

interface AppStore {
  menuItems: MenuItem[];
  menuCategories: string[];
  menuStations: string[];
  orders: Order[];
  tables: Table[];
  tableAreas: string[];
  stock: StockItem[];
  customers: Customer[];
  payments: Payment[];
  reservations: Reservation[];
  salesRecords: SalesRecord[];
  expenseRecords: ExpenseRecord[];
  suppliers: Supplier[];
  purchaseOrders: PurchaseOrder[];
  guestOrderRequests: GuestOrderRequest[];
  storedReceipts: StoredReceipt[];
  restaurantProfile: RestaurantProfile;
  realtimeStatus: BackendRealtimeStatus;
  lastRealtimeSyncAt?: string;
  updateRestaurantProfile: (profile: RestaurantProfile) => void;
  resetRestaurantProfile: () => void;

  // Menu
  setMenuItems: StoreSetter<MenuItem>;
  saveMenuItem: (item: MenuItem) => void;
  publishMenuChanges: () => Promise<{ ok: boolean; error?: string }>;
  removeMenuItem: (id: string) => void;
  addMenuCategory: (category: string) => void;
  addMenuStation: (station: string) => void;
  renameMenuCategory: (from: string, to: string) => void;
  removeMenuCategory: (category: string) => void;
  renameMenuStation: (from: string, to: string) => void;
  removeMenuStation: (station: string) => void;

  // Orders
  setOrders: StoreSetter<Order>;
  advanceOrder: (id: string) => void;
  cancelOrder: (id: string, cancelledBy?: string, reason?: string, options?: { forceWastage?: boolean; managerApproved?: boolean }) => { ok: boolean; error?: string };
  requestVoidOrder: (id: string, requestedBy: string, reason?: string) => void;
  approveVoidOrder: (id: string, approvedBy: string, options?: { reusablePackaged?: boolean; reason?: string }) => { ok: boolean; error?: string };
  rejectVoidOrder: (id: string, rejectedBy: string) => void;
  reportStationTicketUnavailable: (orderId: string, ticketId: string, reportedBy: string, reason?: string) => void;
  recordStationTicketWastage: (
    orderId: string,
    ticketId: string,
    recordedBy: string,
    reason?: string,
  ) => { ok: boolean; error?: string; alreadyDeducted?: boolean; wasteEntryCount?: number };
  voidBonoStationTickets: (
    orderId: string,
    actor: string,
    reason?: string,
  ) => { ok: boolean; error?: string; remainingStations?: boolean };
  addOrder: (order: Order) => void;
  createOrder: (input: NewPosOrderInput) => Order | null;
  addItemsToOpenOrder: (
    orderId: string,
    input: { items: CartLine[]; enteredBy: string; actingWaiter?: string },
  ) => { ok: boolean; error?: string; order?: Order; addedLines?: OrderLine[] };
  /** Durably save order(s) before Bono print / cross-device visibility. */
  ensureOrdersPersisted: (
    orderIds: string[],
    options?: { waitForRemoteMs?: number },
  ) => Promise<{ ok: boolean; error?: string; orders: Order[] }>;
  acceptWaiterOrder: (orderId: string, cashierName: string) => Order | null;
  updateStationTicket: (
    orderId: string,
    ticketId: string,
    status: StationTicketStatus,
  ) => void;
  generateReceipt: (orderId: string, input: GenerateReceiptInput) => OrderReceipt | null;
  recordReceiptPrint: (orderId: string) => ReceiptPrintResult | null;
  authorizeReceiptChanges: (orderId: string, managerName: string) => void;
  closeOrderPayment: (orderId: string, input: CloseOrderPaymentInput) => { payment: OrderPayment; skippedItems: string[] } | null;
  upsertStoredReceiptRecord: (receipt: StoredReceipt) => void;
  serveOrder: (id: string) => void;
  requestReturnOrder: (
    id: string,
    requestedBy: string,
    reason?: string,
    returnLines?: Array<{ index: number; qty: number }>,
  ) => void;
  approveReturnOrder: (
    id: string,
    approvedBy: string,
    options?: {
      restorePackagedStock?: boolean;
      reason?: string;
      direct?: boolean;
      itemIndexes?: number[];
      /** Partial qty per line index (preferred over full-line itemIndexes). */
      returnLines?: Array<{ index: number; qty: number }>;
    },
  ) => { ok: boolean; error?: string };
  rejectReturnOrder: (id: string) => void;
  updateOrderPriority: (id: string, priority: OrderPriority) => void;
  updateOrderWaiter: (id: string, waiter: string) => void;
  transferWaiterBills: (
    fromWaiter: string,
    toWaiter: string,
    actor: string,
    orderIds?: string[],
  ) => { ok: boolean; error?: string; transferred: number };
  requestWaiterBillTransfer: (
    fromWaiter: string,
    toWaiter: string,
    actor: string,
    orderIds?: string[],
  ) => { ok: boolean; error?: string; requested: number };
  approveWaiterBillTransfer: (
    fromWaiter: string,
    toWaiter: string,
    actor: string,
    orderIds?: string[],
  ) => { ok: boolean; error?: string; transferred: number };
  rejectWaiterBillTransfer: (
    orderIds?: string[],
  ) => { ok: boolean; error?: string; rejected: number };
  transferOrderTable: (
    orderId: string,
    input: { tableNumber: string; area: SeatingArea; actor: string },
  ) => { ok: boolean; error?: string };
  mergeOrders: (
    primaryOrderId: string,
    secondaryOrderId: string,
    actor: string,
  ) => { ok: boolean; error?: string; order?: Order };
  splitOrderBill: (
    orderId: string,
    lineIndexes: number[],
    actor: string,
    options?: { tableNumber?: string; area?: SeatingArea },
  ) => { ok: boolean; error?: string; newOrder?: Order };
  bulkCancelOrders: (
    orderIds: string[],
    actor: string,
    reason?: string,
  ) => { cancelled: number; failed: Array<{ id: string; error: string }> };
  bulkCloseOrders: (
    orderIds: string[],
    actor: string,
  ) => { closed: number; failed: Array<{ id: string; error: string }> };
  reprintKitchenTickets: (orderIds: string[], actor: string) => Promise<number>;
  recordBonoPrint: (orderId: string, actor: string, ticketIds?: string[]) => Order | null;
  advanceManualDeliveryTickets: (
    orderId: string,
    status: Extract<StationTicketStatus, "PREPARING" | "READY">,
    ticketId?: string,
  ) => number;

  // Tables
  setTables: StoreSetter<Table>;
  updateTable: (table: Table) => void;
  assignTablesToWaiter: (
    waiterName: string | undefined,
    tableIds: string[],
    clearOthers: boolean,
  ) => { ok: true; changed: number } | { ok: false; error: string };
  addTable: (table: Table) => void;
  addTableArea: (area: string) => void;
  renameTableArea: (from: string, to: string) => void;
  removeTableArea: (area: string) => void;
  removeTable: (id: string) => void;
  releaseTable: (id: string) => void;
  clearCompletedTable: (
    tableId: string,
    clearedBy?: string,
  ) => { ok: true; released: number } | { ok: false; error: string };

  // Stock
  setStock: StoreSetter<StockItem>;
  adjustStock: (sku: string, onHand: number) => void;

  // Customers
  setCustomers: StoreSetter<Customer>;
  creditLoyalty: (phone: string, amountPaid: number) => void;

  // Payments
  setPayments: StoreSetter<Payment>;
  addPayment: (payment: Payment) => void;

  // Sales and expenses
  setSalesRecords: StoreSetter<SalesRecord>;
  setExpenseRecords: StoreSetter<ExpenseRecord>;
  addExpenseRecord: (record: ExpenseRecord) => void;

  // Suppliers and procurement
  setSuppliers: StoreSetter<Supplier>;
  setPurchaseOrders: StoreSetter<PurchaseOrder>;
  addSupplier: (supplier: Supplier) => void;
  removeSupplier: (id: string) => void;
  updateSupplier: (supplier: Supplier) => void;
  addPurchaseOrder: (order: PurchaseOrder) => void;
  updatePurchaseOrder: (order: PurchaseOrder) => void;

  // Guest order requests
  setGuestOrderRequests: StoreSetter<GuestOrderRequest>;
  upsertGuestOrderRequest: (request: GuestOrderRequest) => void;
  updateGuestOrderRequestStatus: (id: string, status: GuestOrderRequest["status"]) => void;

  // Reservations
  setReservations: StoreSetter<Reservation>;
  addReservation: (reservation: Reservation) => void;
  updateReservation: (reservation: Reservation) => void;
  removeReservation: (id: string) => void;
  confirmReservation: (id: string) => void;
}

const STATION_STATUS_RANK: Record<StationTicketStatus, number> = {
  NEW: 0,
  PREPARING: 1,
  READY: 2,
  UNAVAILABLE: 3,
  CANCELLED: 4,
};

function deriveOrderStatus(tickets: StationTicket[]): Order["status"] {
  const active = tickets.filter(
    (ticket) => ticket.status !== "UNAVAILABLE" && ticket.status !== "CANCELLED",
  );
  if (active.length === 0) return "NEW";
  if (active.every((ticket) => ticket.status === "READY")) return "READY TO SERVE";
  if (active.some((ticket) => ticket.status === "READY")) return "PARTIALLY READY";
  return "NEW";
}

function nextOperationalStatus(order: Order, tickets: StationTicket[]): Order["status"] {
  if (isFinalOrderStatus(order.status) || order.status === "RECEIPT_GENERATED" || order.status === "PENDING_CASHIER")
    return order.status;
  return deriveOrderStatus(tickets);
}

function findTableBySeat(list: readonly Table[], area: string, label: string) {
  const normalizedLabel = label.trim().toLowerCase();
  const normalizedArea = area.trim().toLowerCase();
  if (!normalizedLabel) return undefined;
  return list.find(
    (table) =>
      table.label.trim().toLowerCase() === normalizedLabel &&
      table.area.trim().toLowerCase() === normalizedArea,
  );
}

function kitchenStation(stations: readonly ProductionStation[]) {
  return (
    findStation("Kitchen", stations) ??
    stations.find((station) => station.toLowerCase().includes("kitchen")) ??
    "Kitchen"
  );
}

function finalStationForLine(line: OrderLine, stations: readonly ProductionStation[]) {
  if (line.finalStation) return line.finalStation;
  return isKiloStation(line.station) ? kitchenStation(stations) : line.station;
}

function normalizeOrderLineRouting(line: OrderLine, stations: readonly ProductionStation[]) {
  const finalStation = finalStationForLine(line, stations);
  return line.finalStation === finalStation ? line : { ...line, finalStation };
}

function stationTicketItemKey(
  line: Pick<OrderLine, "menuItemId" | "name" | "unitPrice" | "unitLabel">,
) {
  return `${line.menuItemId ?? line.name}|${line.unitPrice ?? ""}|${line.unitLabel ?? ""}`;
}

function normalizeStationTicketRouting(
  ticket: StationTicket,
  stations: readonly ProductionStation[],
) {
  const items = ticket.items.map((item) => normalizeOrderLineRouting(item, stations));
  const nextStation =
    items.find((item) => finalStationForLine(item, stations) !== ticket.station)?.finalStation ??
    undefined;
  return {
    ...ticket,
    items,
    nextStation: nextStation && nextStation !== ticket.station ? nextStation : undefined,
  };
}

function createFollowUpTicket(ticket: StationTicket, nextStation: ProductionStation) {
  return {
    id: `${ticket.id}-${nextStation.replace(/\s+/g, "-").toLowerCase()}`,
    station: nextStation,
    status: "NEW" as StationTicketStatus,
    sentAt: formatClock(),
    previousTicketId: ticket.id,
    items: ticket.items.map((item) => ({
      ...item,
      station: nextStation,
      finalStation: nextStation,
      done: false,
    })),
  };
}

function buildStationTickets(
  orderId: string,
  items: OrderLine[],
  sentAt: string,
  stations: readonly ProductionStation[],
): StationTicket[] {
  const grouped = new Map<string, { station: ProductionStation; items: OrderLine[] }>();
  for (const item of items) {
    const station = canonicalizeStationName(item.station, stations);
    const line = normalizeOrderLineRouting({ ...item, station }, stations);
    const key = normalizeStationName(station).toLowerCase();
    const current = grouped.get(key);
    if (current) {
      current.items.push(line);
      continue;
    }
    grouped.set(key, { station, items: [line] });
  }

  return [...grouped.values()].map(({ station, items: stationItems }) => {
    const nextStation =
      stationItems.find((item) => finalStationForLine(item, stations) !== station)?.finalStation ??
      undefined;
    return {
      id: `${orderId}-${station.replace(/\s+/g, "-").toLowerCase()}`,
      station,
      status: "NEW" as StationTicketStatus,
      sentAt,
      items: stationItems,
      nextStation: nextStation && nextStation !== station ? nextStation : undefined,
    };
  });
}

function stationTicketsCoverItems(tickets: StationTicket[], items: OrderLine[]) {
  const keys = new Set(tickets.flatMap((ticket) => ticket.items.map((item) => stationTicketItemKey(item))));
  return items.every((item) => keys.has(stationTicketItemKey(item)));
}

function stationTicketsMatchRouting(tickets: StationTicket[], items: OrderLine[]) {
  if (!stationTicketsCoverItems(tickets, items)) return false;
  const stationByKey = new Map(items.map((item) => [stationTicketItemKey(item), item.station]));
  return tickets.every((ticket) =>
    ticket.items.every((item) => sameStation(stationByKey.get(stationTicketItemKey(item)), ticket.station)),
  );
}

function isKiloStation(station: string) {
  const key = station.toLowerCase();
  return key.includes("butcher") || key.includes("meat") || key.includes("grill");
}

function orderUnitLabel(item: MenuItem, station: ProductionStation) {
  if (item.unitLabel) return item.unitLabel;
  return item.pricingMode === "kg" || isKiloStation(station) ? "kg" : undefined;
}

function resolveOrderLineStation(
  item: MenuItem,
  stations: readonly ProductionStation[],
  area?: string,
) {
  return resolveProductionStation(item, stations, area);
}

function mergeStationTickets(tickets: StationTicket[]) {
  return tickets.reduce<StationTicket[]>((rows, ticket) => {
    // Never fold fresh slips into already-printed ones — add-ons need their own Bono.
    const existing = rows.find(
      (item) =>
        sameStation(item.station, ticket.station) && !item.bonoPrinted && !ticket.bonoPrinted,
    );
    if (!existing) {
      const idTaken = rows.some((row) => row.id === ticket.id);
      return [
        ...rows,
        {
          ...ticket,
          id: idTaken ? `${ticket.id}-${rows.length}` : ticket.id,
          items: ticket.items.map((item) => ({ ...item })),
        },
      ];
    }

    existing.items = [...existing.items, ...ticket.items.map((item) => ({ ...item }))];
    if (STATION_STATUS_RANK[ticket.status] < STATION_STATUS_RANK[existing.status]) {
      existing.status = ticket.status;
    }
    return rows;
  }, []);
}

function dateTimePreferences() {
  return loadSystemSettings().calendar;
}

function formatClock(date = new Date()) {
  return formatClockDisplay(date, dateTimePreferences());
}

function formatSyncClock(date = new Date()) {
  return formatSyncClockDisplay(date, dateTimePreferences());
}

function formatDateTime(date = new Date()) {
  return formatDateTimeDisplay(date, dateTimePreferences());
}

function readPosInventorySettings() {
  const rows = getModuleRecordsSnapshot<InventorySettingsRecord>(
    STOCK_MODULE_KEYS.settings,
    STOCK_INVENTORY_SETTINGS_SEED,
  );
  return normalizeInventorySettings(rows[0]);
}

function syncPosReservations(next: PosStockReservation[], canSync: boolean, reportError: (scope: string, error: unknown) => void) {
  setModuleRecordsSnapshot(STOCK_MODULE_KEYS.posReservations, next);
  if (canSync) {
    void replaceModuleRecords(STOCK_MODULE_KEYS.posReservations, next).catch((error) =>
      reportError("pos reservations sync", error),
    );
  }
}

function syncPosLedger(next: StockLedgerEntry[], canSync: boolean, reportError: (scope: string, error: unknown) => void) {
  setModuleRecordsSnapshot(STOCK_MODULE_KEYS.ledger, next);
  if (canSync) {
    void replaceModuleRecords(STOCK_MODULE_KEYS.ledger, next).catch((error) =>
      reportError("stock ledger sync", error),
    );
  }
}

function syncPosLots(next: StockLot[], canSync: boolean, reportError: (scope: string, error: unknown) => void) {
  setModuleRecordsSnapshot(STOCK_MODULE_KEYS.lots, next);
  if (canSync) {
    void replaceModuleRecords(STOCK_MODULE_KEYS.lots, next).catch((error) =>
      reportError("stock lots sync", error),
    );
    void import("./supabase/inventory-persistence.ts").then((mod) => mod.syncInventoryLots(next)).catch((error) =>
      reportError("stock lots persistence sync", error),
    );
  }
}

function syncCancellationReversal(
  voucher: CancellationReversalVoucherDocument,
  canSync: boolean,
  reportError: (scope: string, error: unknown) => void,
) {
  const existing = getModuleRecordsSnapshot<CancellationReversalVoucherDocument>(
    STOCK_MODULE_KEYS.cancellationReversals,
    STOCK_CANCELLATION_REVERSALS_SEED,
  );
  const next = [voucher, ...existing.filter((row) => row.id !== voucher.id)];
  setModuleRecordsSnapshot(STOCK_MODULE_KEYS.cancellationReversals, next);
  if (canSync) {
    void replaceModuleRecords(STOCK_MODULE_KEYS.cancellationReversals, next).catch((error) =>
      reportError("cancellation reversal sync", error),
    );
  }
}

function appendPosLedgerEntries(
  entries: StockLedgerEntry[],
  canSync: boolean,
  reportError: (scope: string, error: unknown) => void,
) {
  if (entries.length === 0) return;
  const stockLedger = getModuleRecordsSnapshot<StockLedgerEntry>(STOCK_MODULE_KEYS.ledger, STOCK_LEDGER_FALLBACK);
  syncPosLedger([...entries, ...stockLedger], canSync, reportError);
}

function applyPosStockExceptionOutcome(input: {
  order: Order;
  actor: string;
  reason: string;
  outcome: PosVoidStockOutcome;
  canSync: boolean;
  reportError: (scope: string, error: unknown) => void;
  lineNames?: string[];
  keepReservations?: boolean;
  partialLines?: Array<{ name: string; returnQty: number; orderedQty: number }>;
}) {
  if (isPosMenuStockDisconnected()) return input.outcome;
  const { order, actor, reason, outcome, canSync, reportError, lineNames, keepReservations, partialLines } = input;
  const stockLedger = getModuleRecordsSnapshot<StockLedgerEntry>(STOCK_MODULE_KEYS.ledger, STOCK_LEDGER_FALLBACK);
  const stockItems = getModuleRecordsSnapshot<StockManagedItem>(STOCK_MODULE_KEYS.items, STOCK_ITEMS_FALLBACK);
  const stockRecipes = getModuleRecordsSnapshot<StockRecipe>(STOCK_MODULE_KEYS.recipes, STOCK_RECIPES_FALLBACK);

  if (outcome === "release_only") {
    if (!keepReservations) releasePosStockForOrder(order.id, canSync, reportError);
    return outcome;
  }

  if (outcome === "reversal") {
    const { voucher, reversalEntries } = createPosOrderStockReversal({
      orderId: order.id,
      orderNo: order.orderNo,
      reversedBy: actor,
      reason,
      ledger: stockLedger,
      lineNames,
      partialLines,
    });
    appendPosLedgerEntries(reversalEntries, canSync, reportError);
    if (voucher) syncCancellationReversal(voucher, canSync, reportError);
    if (!keepReservations) releasePosStockForOrder(order.id, canSync, reportError);
    return outcome;
  }

  // wastage
  const wastageLines = lineNames?.length
    ? mapOrderLinesForStock(order).filter((line) =>
        lineNames.some((name) => name.trim().toLowerCase() === line.name.trim().toLowerCase()),
      )
    : mapOrderLinesForStock(order);
  const wastage = createPosOrderWastageEntries({
    orderId: order.id,
    orderNo: order.orderNo,
    enteredBy: actor,
    reason,
    lines: wastageLines,
    items: stockItems,
    recipes: stockRecipes,
    ledger: stockLedger,
  });
  appendPosLedgerEntries(wastage.entries, canSync, reportError);
  if (!keepReservations) releasePosStockForOrder(order.id, canSync, reportError);
  return outcome;
}

function applyPosReservationForOrder(
  order: Order,
  reservedBy: string,
  event: "order_submit" | "station_accept" | "prep_start",
  canSync: boolean,
  reportError: (scope: string, error: unknown) => void,
) {
  if (isPosMenuStockDisconnected()) return order;
  const settings = readPosInventorySettings();
  if (!shouldReservePosStock(settings.posReservationTrigger, event)) return order;
  if (order.stockReservedAt) return order;

  const stockItems = getModuleRecordsSnapshot<StockManagedItem>(STOCK_MODULE_KEYS.items, STOCK_ITEMS_FALLBACK);
  const stockRecipes = getModuleRecordsSnapshot<StockRecipe>(STOCK_MODULE_KEYS.recipes, STOCK_RECIPES_FALLBACK);
  const existing = getModuleRecordsSnapshot<PosStockReservation>(STOCK_MODULE_KEYS.posReservations, STOCK_POS_RESERVATIONS_SEED);
  const drafts = buildPosReservationDrafts({
    orderId: order.id,
    orderNo: order.orderNo,
    reservedBy,
    lines: mapOrderLinesForStock(order),
    items: stockItems,
    recipes: stockRecipes,
  });
  const result = reservePosStock(existing, drafts);
  if (result.created.length > 0) {
    syncPosReservations(result.reservations, canSync, reportError);
    return { ...order, stockReservedAt: new Date().toISOString() };
  }
  return order;
}

function applyPosReservationForNewLines(
  order: Order,
  newLines: OrderLine[],
  reservedBy: string,
  event: "order_submit" | "station_accept" | "prep_start",
  canSync: boolean,
  reportError: (scope: string, error: unknown) => void,
) {
  if (isPosMenuStockDisconnected() || newLines.length === 0) {
    return order;
  }
  const settings = readPosInventorySettings();
  if (!shouldReservePosStock(settings.posReservationTrigger, event) || newLines.length === 0) {
    return order;
  }

  const stockItems = getModuleRecordsSnapshot<StockManagedItem>(STOCK_MODULE_KEYS.items, STOCK_ITEMS_FALLBACK);
  const stockRecipes = getModuleRecordsSnapshot<StockRecipe>(STOCK_MODULE_KEYS.recipes, STOCK_RECIPES_FALLBACK);
  const existing = getModuleRecordsSnapshot<PosStockReservation>(STOCK_MODULE_KEYS.posReservations, STOCK_POS_RESERVATIONS_SEED);
  const drafts = buildPosReservationDrafts({
    orderId: order.id,
    orderNo: order.orderNo,
    reservedBy,
    lines: mapOrderLinesForStock({ ...order, items: newLines }),
    items: stockItems,
    recipes: stockRecipes,
  });
  const result = reservePosStock(existing, drafts);
  if (result.created.length > 0) {
    syncPosReservations(result.reservations, canSync, reportError);
    return { ...order, stockReservedAt: order.stockReservedAt ?? new Date().toISOString() };
  }
  return order;
}

function applyPosDeductionForNewLines(
  order: Order,
  newLines: OrderLine[],
  enteredBy: string,
  event: "order_submit" | "station_accept" | "prep_start" | "item_ready" | "item_served" | "payment_completed" | "order_closed",
  canSync: boolean,
  reportError: (scope: string, error: unknown) => void,
) {
  const settings = readPosInventorySettings();
  if (!shouldDeductPosStock(settings.posDeductionTiming, event) || newLines.length === 0) {
    return { order, skippedItems: [] as string[], deducted: false };
  }

  const stockItems = getModuleRecordsSnapshot<StockManagedItem>(STOCK_MODULE_KEYS.items, STOCK_ITEMS_FALLBACK);
  const stockRecipes = getModuleRecordsSnapshot<StockRecipe>(STOCK_MODULE_KEYS.recipes, STOCK_RECIPES_FALLBACK);
  const stockLedger = getModuleRecordsSnapshot<StockLedgerEntry>(STOCK_MODULE_KEYS.ledger, STOCK_LEDGER_FALLBACK);
  const stockLots = readPosStockLotsSnapshot();
  const closedAt = new Date().toISOString();
  const lotState = { lots: [...stockLots] };
  const posLedgerEntries = createPosStockDeductionEntries(
    {
      orderId: order.id,
      orderNo: order.orderNo,
      closedAt,
      enteredBy,
      skipIfAlreadyDeducted: false,
      lines: mapOrderLinesForStock({ ...order, items: newLines }),
    },
    stockItems,
    stockRecipes,
    stockLedger,
    lotState,
  );

  const skippedItems: string[] = [];
  newLines.forEach((line) => {
    const wasDeducted = posLedgerEntries.some((entry) => entry.notes?.includes(`: ${line.name}`));
    if (!wasDeducted) skippedItems.push(line.name);
  });

  if (posLedgerEntries.length > 0) {
    syncPosLedger([...posLedgerEntries, ...stockLedger], canSync, reportError);
    syncPosLots(lotState.lots, canSync, reportError);
  }

  const existingReservations = getModuleRecordsSnapshot<PosStockReservation>(STOCK_MODULE_KEYS.posReservations, STOCK_POS_RESERVATIONS_SEED);
  const consumed = consumePosReservations(existingReservations, order.id);
  if (consumed.changed > 0) {
    syncPosReservations(consumed.reservations, canSync, reportError);
  }

  return {
    order: {
      ...order,
      stockDeductedAt: order.stockDeductedAt ?? closedAt,
    },
    skippedItems,
    deducted: posLedgerEntries.length > 0,
  };
}

function cartLinesToOrderLines(
  cartItems: CartLine[],
  area: string,
  stations: readonly ProductionStation[],
): OrderLine[] {
  return cartItems.map((line) => {
    const { item, qty } = line;
    const station = resolveOrderLineStation(item, stations, area);
    const finalStation = isKiloStation(station) ? kitchenStation(stations) : station;
    const stockDisconnected = isPosMenuStockDisconnected();
    const stockDeductionLocation = stockDisconnected
      ? undefined
      : item.stockDeductionLocation
        || stationToOperationalLocation(station)
        || stationToOperationalLocation(finalStation)
        || undefined;
    return {
      menuItemId: item.id,
      name: item.name_en,
      qty,
      unitLabel: line.unitLabel ?? orderUnitLabel(item, station),
      stockSku: stockDisconnected ? undefined : item.stockSku,
      station,
      finalStation,
      unitPrice: line.unitPrice ?? item.price,
      done: false,
      stockDeductionLocation,
      preferences: line.preferences?.map((value) => value.trim()).filter(Boolean),
      note: line.note?.trim() || undefined,
    };
  });
}

function applyPosDeductionForOrder(
  order: Order,
  enteredBy: string,
  event: "order_submit" | "station_accept" | "prep_start" | "item_ready" | "item_served" | "payment_completed" | "order_closed",
  canSync: boolean,
  reportError: (scope: string, error: unknown) => void,
) {
  if (isPosMenuStockDisconnected()) {
    return { order, skippedItems: [] as string[], deducted: false };
  }
  const settings = readPosInventorySettings();
  if (!shouldDeductPosStock(settings.posDeductionTiming, event)) {
    return { order, skippedItems: [] as string[], deducted: false };
  }

  const stockItems = getModuleRecordsSnapshot<StockManagedItem>(STOCK_MODULE_KEYS.items, STOCK_ITEMS_FALLBACK);
  const stockRecipes = getModuleRecordsSnapshot<StockRecipe>(STOCK_MODULE_KEYS.recipes, STOCK_RECIPES_FALLBACK);
  const stockLedger = getModuleRecordsSnapshot<StockLedgerEntry>(STOCK_MODULE_KEYS.ledger, STOCK_LEDGER_FALLBACK);
  const stockLots = readPosStockLotsSnapshot();
  if (order.stockDeductedAt || orderHasPosStockDeduction(stockLedger, order.id)) {
    return { order, skippedItems: [] as string[], deducted: false };
  }

  const closedAt = new Date().toISOString();
  const lotState = { lots: [...stockLots] };
  const posLedgerEntries = createPosStockDeductionEntries(
    {
      orderId: order.id,
      orderNo: order.orderNo,
      closedAt,
      enteredBy,
      skipIfAlreadyDeducted: true,
      lines: mapOrderLinesForStock(order),
    },
    stockItems,
    stockRecipes,
    stockLedger,
    lotState,
  );

  const skippedItems: string[] = [];
  order.items.forEach((line) => {
    const wasDeducted = posLedgerEntries.some(
      (entry) => entry.notes?.includes(`: ${line.name}`),
    );
    if (!wasDeducted) skippedItems.push(line.name);
  });

  if (posLedgerEntries.length > 0) {
    syncPosLedger([...posLedgerEntries, ...stockLedger], canSync, reportError);
    syncPosLots(lotState.lots, canSync, reportError);
  }

  const existingReservations = getModuleRecordsSnapshot<PosStockReservation>(STOCK_MODULE_KEYS.posReservations, STOCK_POS_RESERVATIONS_SEED);
  const consumed = consumePosReservations(existingReservations, order.id);
  if (consumed.changed > 0) {
    syncPosReservations(consumed.reservations, canSync, reportError);
  }

  return {
    order: {
      ...order,
      stockDeductedAt: closedAt,
      items: order.items.map((item) => ({ ...item, stockDeducted: true })),
    },
    skippedItems,
    deducted: posLedgerEntries.length > 0,
  };
}

function releasePosStockForOrder(
  orderId: string,
  canSync: boolean,
  reportError: (scope: string, error: unknown) => void,
) {
  const existing = getModuleRecordsSnapshot<PosStockReservation>(STOCK_MODULE_KEYS.posReservations, STOCK_POS_RESERVATIONS_SEED);
  const released = releasePosReservations(existing, orderId);
  if (released.changed > 0) {
    syncPosReservations(released.reservations, canSync, reportError);
  }
}

function money(value: number) {
  return Math.round(value * 100) / 100;
}

function buildReceiptNumber() {
  return String(Date.now()).slice(-8).padStart(8, "0");
}

function lineGross(order: Order) {
  const fromItems = order.items.reduce((sum, line) => sum + (line.unitPrice ?? 0) * line.qty, 0);
  return fromItems > 0 ? fromItems : order.total;
}

function buildReceipt(
  order: Order,
  input: GenerateReceiptInput,
  profile: RestaurantProfile,
): OrderReceipt {
  const grossItems = lineGross(order);
  const discount = Math.max(0, input.discount ?? 0);
  const grandTotal = money(Math.max(0, grossItems - discount));
  const serviceChargeEnabled = false;
  const serviceCharge = 0;
  const generatedAt = formatDateTime();

  return {
    receiptNumber: buildReceiptNumber(),
    generatedAt,
    generatedBy: input.generatedBy,
    restaurantName: profile.name || "Fiker Bar and Restaurant",
    branchName: "",
    tin: "",
    vatRegNo: "",
    currency: profile.currency,
    subtotal: grandTotal,
    vat: 0,
    vatRate: 0,
    serviceChargeEnabled,
    serviceCharge: money(serviceCharge),
    discount: money(discount),
    grandTotal,
    paymentStatus: "Unpaid",
    orderStatusAtGeneration: "RECEIPT_GENERATED",
    printCount: 0,
  };
}

const CUSTOM_MENU_CATEGORIES_STORAGE_KEY = "bl_menu_categories";
const DELETED_MENU_CATEGORIES_STORAGE_KEY = "bl_deleted_menu_categories";
const CUSTOM_TABLE_AREAS_STORAGE_KEY = "bl_table_areas";
const DELETED_TABLES_STORAGE_KEY = "bl_deleted_tables";
const ORDERS_STORAGE_KEY = "bl_orders";
const PENDING_ORDERS_STORAGE_KEY = "bl_pending_orders";
const PENDING_TABLES_STORAGE_KEY = "bl_pending_tables";
const SUPPLIERS_STORAGE_KEY = "bl_suppliers";
const CUSTOMERS_STORAGE_KEY = "bl_customers";
const RESERVATIONS_STORAGE_KEY = "bl_reservations";
const PAYMENTS_STORAGE_KEY = "bl_payments";
const SALES_RECORDS_STORAGE_KEY = "bl_sales_records";
const EXPENSE_RECORDS_STORAGE_KEY = "bl_expense_records";
const PURCHASE_ORDERS_STORAGE_KEY = "bl_purchase_orders";

const POS_LOCAL_PURGE_FLAG = "bl_pos_demo_purge_v1";
const POS_LOCAL_STORAGE_KEYS = [
  "bl_menu_items",
  "bl_tables",
  "bl_guest_order_requests",
  CUSTOM_MENU_CATEGORIES_STORAGE_KEY,
  DELETED_MENU_CATEGORIES_STORAGE_KEY,
  CUSTOM_TABLE_AREAS_STORAGE_KEY,
  DELETED_TABLES_STORAGE_KEY,
  ORDERS_STORAGE_KEY,
  SUPPLIERS_STORAGE_KEY,
  CUSTOMERS_STORAGE_KEY,
  RESERVATIONS_STORAGE_KEY,
  PAYMENTS_STORAGE_KEY,
  SALES_RECORDS_STORAGE_KEY,
  EXPENSE_RECORDS_STORAGE_KEY,
  PURCHASE_ORDERS_STORAGE_KEY,
] as const;

/** One-time clear of cached POS demo data when Supabase is the source of truth. */
if (typeof window !== "undefined" && isSupabaseConfigured) {
  try {
    if (!window.localStorage.getItem(POS_LOCAL_PURGE_FLAG)) {
      for (const key of POS_LOCAL_STORAGE_KEYS) {
        window.localStorage.removeItem(key);
      }
      window.localStorage.setItem(POS_LOCAL_PURGE_FLAG, "1");
    }
  } catch {
    // ignore storage errors
  }
}

function uniqueTextValues(values: readonly string[]) {
  const seen = new Set<string>();
  return values.reduce<string[]>((items, item) => {
    const value = item.trim();
    const key = value.toLowerCase();
    if (!value || seen.has(key)) return items;
    seen.add(key);
    return [...items, value];
  }, []);
}

function readStoredTextValues(key: string) {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(key);
    const parsed = raw ? JSON.parse(raw) : null;
    return Array.isArray(parsed)
      ? uniqueTextValues(parsed.filter((item): item is string => typeof item === "string"))
      : [];
  } catch {
    return [];
  }
}

function writeStoredTextValues(key: string, values: readonly string[]) {
  if (typeof window === "undefined") return;
  localStorage.setItem(key, JSON.stringify(uniqueTextValues(values)));
}

function readStoredRows<T>(key: string, fallback: T[]) {
  if (typeof window === "undefined") return fallback;
  try {
    const raw = localStorage.getItem(key);
    const parsed = raw ? JSON.parse(raw) : null;
    return Array.isArray(parsed) ? (parsed as T[]) : fallback;
  } catch {
    return fallback;
  }
}

function writeStoredRows<T>(key: string, rows: readonly T[]) {
  if (typeof window === "undefined") return;
  const next = JSON.stringify(rows);
  if (localStorage.getItem(key) === next) return;
  localStorage.setItem(key, next);
}

function readStorageEventRows<T>(event: StorageEvent) {
  if (!event.newValue) return null;
  try {
    const parsed = JSON.parse(event.newValue);
    return Array.isArray(parsed) ? (parsed as T[]) : null;
  } catch {
    return null;
  }
}

function loadCustomMenuCategories() {
  return readStoredTextValues(CUSTOM_MENU_CATEGORIES_STORAGE_KEY);
}

function saveCustomMenuCategories(categories: readonly string[]) {
  writeStoredTextValues(CUSTOM_MENU_CATEGORIES_STORAGE_KEY, categories);
}

function loadCustomTableAreas() {
  return readStoredTextValues(CUSTOM_TABLE_AREAS_STORAGE_KEY);
}

function saveCustomTableAreas(areas: readonly string[]) {
  writeStoredTextValues(CUSTOM_TABLE_AREAS_STORAGE_KEY, areas);
}

function loadStoredOrders(fallback: Order[] = []) {
  return readStoredRows<Order>(ORDERS_STORAGE_KEY, fallback);
}

function saveStoredOrders(orders: readonly Order[]) {
  writeStoredRows(ORDERS_STORAGE_KEY, orders);
}

function loadPendingOrderWrites(): Order[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.sessionStorage.getItem(PENDING_ORDERS_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    return Array.isArray(parsed) ? (parsed as Order[]) : [];
  } catch {
    return [];
  }
}

function savePendingOrderWrites(pending: ReadonlyMap<string, Order>) {
  if (typeof window === "undefined") return;
  try {
    if (pending.size === 0) {
      window.sessionStorage.removeItem(PENDING_ORDERS_STORAGE_KEY);
      return;
    }
    window.sessionStorage.setItem(PENDING_ORDERS_STORAGE_KEY, JSON.stringify([...pending.values()]));
  } catch {
    // Ignore quota / private-mode failures; in-memory pending still applies for this session.
  }
}

function loadPendingTableWrites(): Table[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.sessionStorage.getItem(PENDING_TABLES_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    return Array.isArray(parsed) ? (parsed as Table[]) : [];
  } catch {
    return [];
  }
}

function savePendingTableWrites(pending: ReadonlyMap<string, Table>) {
  if (typeof window === "undefined") return;
  try {
    if (pending.size === 0) {
      window.sessionStorage.removeItem(PENDING_TABLES_STORAGE_KEY);
      return;
    }
    window.sessionStorage.setItem(PENDING_TABLES_STORAGE_KEY, JSON.stringify([...pending.values()]));
  } catch {
    // Ignore quota / private-mode failures.
  }
}

function loadStoredSuppliers(fallback: Supplier[] = []) {
  return readStoredRows<Supplier>(SUPPLIERS_STORAGE_KEY, fallback);
}

function saveStoredSuppliers(items: readonly Supplier[]) {
  writeStoredRows(SUPPLIERS_STORAGE_KEY, items);
}

function loadStoredCustomers(fallback: Customer[] = []) {
  return readStoredRows<Customer>(CUSTOMERS_STORAGE_KEY, fallback);
}

function saveStoredCustomers(items: readonly Customer[]) {
  writeStoredRows(CUSTOMERS_STORAGE_KEY, items);
}

function loadStoredReservations(fallback: Reservation[] = []) {
  return readStoredRows<Reservation>(RESERVATIONS_STORAGE_KEY, fallback);
}

function saveStoredReservations(items: readonly Reservation[]) {
  writeStoredRows(RESERVATIONS_STORAGE_KEY, items);
}

function loadStoredPayments(fallback: Payment[] = []) {
  return readStoredRows<Payment>(PAYMENTS_STORAGE_KEY, fallback);
}

function saveStoredPayments(items: readonly Payment[]) {
  writeStoredRows(PAYMENTS_STORAGE_KEY, items);
}

function loadStoredSalesRecords(fallback: SalesRecord[] = []) {
  return readStoredRows<SalesRecord>(SALES_RECORDS_STORAGE_KEY, fallback);
}

function saveStoredSalesRecords(items: readonly SalesRecord[]) {
  writeStoredRows(SALES_RECORDS_STORAGE_KEY, items);
}

function loadStoredExpenseRecords(fallback: ExpenseRecord[] = []) {
  return readStoredRows<ExpenseRecord>(EXPENSE_RECORDS_STORAGE_KEY, fallback);
}

function saveStoredExpenseRecords(items: readonly ExpenseRecord[]) {
  writeStoredRows(EXPENSE_RECORDS_STORAGE_KEY, items);
}

function loadStoredPurchaseOrders(fallback: PurchaseOrder[] = []) {
  return readStoredRows<PurchaseOrder>(PURCHASE_ORDERS_STORAGE_KEY, fallback);
}

function saveStoredPurchaseOrders(items: readonly PurchaseOrder[]) {
  writeStoredRows(PURCHASE_ORDERS_STORAGE_KEY, items);
}

function mergeById<T extends { id: string }>(primary: readonly T[], fallback: readonly T[]) {
  return mergeByKey(primary, fallback, (item) => item.id);
}

/** Higher = more settled. Prevents stale remote snapshots from reopening paid/closed bills. */
function orderSettlementRank(order: Pick<Order, "status" | "paymentStatus">) {
  if (order.status === "RETURNED") return 50;
  if (order.status === "CANCELLED") return 45;
  if (order.status === "CLOSED" || order.paymentStatus === "Paid") return 40;
  if (order.status === "RECEIPT_GENERATED") return 20;
  if (order.status === "PENDING_CASHIER") return 10;
  return 0;
}

/** Live Supabase snapshot is partial (open + recent closed). Merge into existing history. */
function mergePartialSnapshotOrders(incoming: readonly Order[], existing: readonly Order[]): Order[] {
  const existingById = new Map(existing.map((order) => [order.id, order] as const));
  const mergedIncoming = incoming.map((row) => {
    const current = existingById.get(row.id);
    if (!current) return row;
    const preferLocalSettlement = orderSettlementRank(current) > orderSettlementRank(row);
    const base = preferLocalSettlement ? { ...row, ...current } : { ...current, ...row };
    return {
      ...base,
      createdAtIso: row.createdAtIso ?? current.createdAtIso,
      returnRequestedBy: row.returnRequestedBy ?? current.returnRequestedBy,
      returnRequestedAt: row.returnRequestedAt ?? current.returnRequestedAt,
      returnReason: row.returnReason ?? current.returnReason,
      returnRequestedLines: row.returnRequestedLines ?? current.returnRequestedLines,
      returnedAt: row.returnedAt ?? current.returnedAt,
      returnedBy: row.returnedBy ?? current.returnedBy,
      tableClearedAt: row.tableClearedAt ?? current.tableClearedAt,
      tableClearedBy: row.tableClearedBy ?? current.tableClearedBy,
      waiterTransferRequestedTo: row.waiterTransferRequestedTo ?? current.waiterTransferRequestedTo,
      waiterTransferRequestedBy: row.waiterTransferRequestedBy ?? current.waiterTransferRequestedBy,
      waiterTransferRequestedAt: row.waiterTransferRequestedAt ?? current.waiterTransferRequestedAt,
      status: preferLocalSettlement ? current.status : row.status,
      paymentStatus: preferLocalSettlement ? current.paymentStatus : row.paymentStatus,
      payment: preferLocalSettlement ? current.payment ?? row.payment : row.payment ?? current.payment,
      receipt: preferLocalSettlement ? current.receipt ?? row.receipt : row.receipt ?? current.receipt,
    };
  });
  const incomingIds = new Set(incoming.map((order) => order.id));
  const keptLocal = existing.filter((order) => !incomingIds.has(order.id));
  return [...mergedIncoming, ...keptLocal];
}

/** Pending local writes always win until Supabase confirms the upsert. */
function applyPendingOrderWrites(
  orders: readonly Order[],
  pending: ReadonlyMap<string, Order>,
): Order[] {
  if (pending.size === 0) return [...orders];
  const byId = new Map(orders.map((order) => [order.id, order] as const));
  for (const [id, order] of pending) {
    byId.set(id, order);
  }
  const seen = new Set<string>();
  const next: Order[] = [];
  for (const order of pending.values()) {
    next.push(order);
    seen.add(order.id);
  }
  for (const order of orders) {
    if (seen.has(order.id)) continue;
    next.push(byId.get(order.id) ?? order);
    seen.add(order.id);
  }
  return next;
}

function newOrderId() {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return `o-${crypto.randomUUID()}`;
  }
  return `o${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

function mergeByKey<T>(primary: readonly T[], fallback: readonly T[], keyOf: (item: T) => string) {
  const seen = new Set<string>();
  const merged: T[] = [];
  for (const item of [...primary, ...fallback]) {
    const key = keyOf(item);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    merged.push(item);
  }
  return merged;
}

function reportBackendError(action: string, error: unknown) {
  const message = error instanceof Error ? error.message : String(error ?? "");
  if (/jwt|401|not authenticated|session expired|unauthorized/i.test(message)) {
    console.warn(`Supabase ${action} paused (auth)`, error);
    return;
  }
  console.error(`Supabase ${action} failed`, error);
}

function paidOrderReportDate(order: Order) {
  // Prefer the order's original business day so late payment stays on that day.
  return (
    orderBusinessDayKey(order) ??
    dateKeyFromDateTime(order.receiptGeneratedAt) ??
    dateKeyFromDateTime(order.createdAtIso) ??
    dateKeyFromDateTime(order.sentAt) ??
    dateKeyFromDateTime(order.payment?.closedAt) ??
    dateKeyFromDateTime(order.payment?.paymentReceivedAt) ??
    dateKeyFromDateTime(order.paymentReceivedAt) ??
    null
  );
}

/** Fill missing payment.reportDate from the linked order's business day (late-pay attribution). */
function enrichPaymentsWithOrderReportDates(
  payments: readonly Payment[],
  orders: readonly Order[],
): Payment[] {
  if (payments.length === 0) return [...payments];
  const ordersById = new Map(orders.map((order) => [order.id, order]));
  let changed = false;
  const next = payments.map((payment) => {
    if (payment.reportDate && /^\d{4}-\d{2}-\d{2}$/.test(payment.reportDate)) return payment;
    const order = payment.orderId ? ordersById.get(payment.orderId) : undefined;
    if (!order) return payment;
    const reportDate = paidOrderReportDate(order);
    if (!reportDate) return payment;
    changed = true;
    return { ...payment, reportDate };
  });
  return changed ? next : [...payments];
}

function paidOrderReportTime(order: Order) {
  return (
    order.payment?.closedAt ??
    order.payment?.paymentReceivedAt ??
    order.paymentReceivedAt ??
    order.receiptGeneratedAt ??
    order.sentAt ??
    order.createdAtIso ??
    formatDateTime()
  );
}

function ensureSalesRecordsForPaidOrders(
  orders: readonly Order[],
  salesRecords: SalesRecord[],
  menuItems: readonly MenuItem[],
) {
  const recordedOrderIds = new Set(
    salesRecords.flatMap((record) => (record.orderId ? [record.orderId] : [])),
  );
  const missingRows = orders.flatMap((order) => {
    if (order.paymentStatus !== "Paid" || !order.payment || recordedOrderIds.has(order.id))
      return [];
    const date = paidOrderReportDate(order);
    // Never invent "today" for undated history — that spikes Today's Sales until hydrate finishes.
    if (!date) return [];
    return buildSalesRecordsFromOrder(
      order,
      order.payment,
      [...menuItems],
      paidOrderReportTime(order),
      date,
    );
  });

  return missingRows.length > 0 ? [...missingRows, ...salesRecords] : salesRecords;
}

function rerouteOrderLines(
  items: OrderLine[],
  stations: readonly ProductionStation[],
  menuItems: readonly MenuItem[],
  area?: string,
) {
  return items.map((item) => {
    const menuItem = menuItems.find(
      (candidate) => candidate.id === item.menuItemId || candidate.name_en === item.name,
    );
    const station = menuItem
      ? resolveProductionStation(menuItem, stations, area)
      : canonicalizeStationName(item.station, stations);
    return normalizeOrderLineRouting({ ...item, station }, stations);
  });
}

function alignTicketsToItemStations(
  orderId: string,
  items: OrderLine[],
  tickets: StationTicket[],
  sentAt: string,
  stations: readonly ProductionStation[],
) {
  const next: StationTicket[] = [];
  const moved: OrderLine[] = [];
  const covered = new Set<string>();

  for (const ticket of tickets) {
    if (ticket.status !== "NEW") {
      next.push(ticket);
      for (const item of ticket.items) covered.add(stationTicketItemKey(item));
      continue;
    }
    const keep: OrderLine[] = [];
    for (const item of ticket.items) {
      const dest = canonicalizeStationName(item.station, stations);
      if (sameStation(dest, ticket.station)) {
        keep.push(item);
        continue;
      }
      moved.push({ ...item, station: dest });
    }
    if (keep.length > 0) {
      next.push({ ...ticket, items: keep });
      for (const item of keep) covered.add(stationTicketItemKey(item));
    }
  }

  const missing = items.filter((item) => !covered.has(stationTicketItemKey(item)));
  const toCreate = [...moved, ...missing];
  if (toCreate.length > 0) {
    return mergeStationTickets([...next, ...buildStationTickets(orderId, toCreate, sentAt, stations)]);
  }
  return next;
}

function normalizeStationOrders(
  orders: readonly Order[],
  stations: readonly ProductionStation[],
  menuItems: readonly MenuItem[] = [],
) {
  return orders.map((order) => {
    const items = rerouteOrderLines(order.items ?? [], stations, menuItems, order.area);
    const existingTickets = (order.stationTickets ?? []).map((ticket) =>
      normalizeStationTicketRouting(
        {
          ...ticket,
          station: canonicalizeStationName(ticket.station, stations),
        },
        stations,
      ),
    );
    const voidFields = {
      voidRequestedBy: order.voidRequestedBy,
      voidRequestedAt: order.voidRequestedAt,
      voidReason: order.voidReason,
    };
    if (order.status === "PENDING_CASHIER" || isFinalOrderStatus(order.status)) {
      return { ...order, ...voidFields, items, stationTickets: existingTickets };
    }
    const sentAt = order.stationSentAt ?? order.sentAt ?? formatClock();
    const canRebuildTickets = existingTickets.every((ticket) => ticket.status === "NEW");
    const stationTickets =
      existingTickets.length > 0 && canRebuildTickets && stationTicketsMatchRouting(existingTickets, items)
        ? existingTickets
        : existingTickets.length === 0 || canRebuildTickets
          ? buildStationTickets(order.id, items, sentAt, stations)
          : alignTicketsToItemStations(order.id, items, existingTickets, sentAt, stations);
    return {
      ...order,
      ...voidFields,
      sentAt,
      stationSentAt: order.stationSentAt ?? sentAt,
      items,
      stationTickets,
      status: nextOperationalStatus(order, stationTickets),
    };
  });
}

export function StoreProvider({ children }: { children: ReactNode }) {
  const [menuStations, setMenuStations] = useState<ProductionStation[]>(() =>
    loadProductionStations(),
  );
  const [menuItems, setMenuItemState] = useState<MenuItem[]>(() => {
    const stations = loadProductionStations();
    const fallback = isSupabaseConfigured ? [] : MENU;
    const seeded = fallback.map((m) => ({ ...m, station: resolveProductionStation(m, stations) }));
    return loadStoredMenuItems(seeded).map((m) => ({
      ...m,
      station: resolveProductionStation(m, stations),
    }));
  });
  const [customMenuCategories, setCustomMenuCategories] = useState<string[]>(() =>
    loadCustomMenuCategories(),
  );
  const [deletedMenuCategories, setDeletedMenuCategories] = useState<string[]>(() =>
    readStoredTextValues(DELETED_MENU_CATEGORIES_STORAGE_KEY),
  );
  const [deletedTableIds, setDeletedTableIds] = useState<string[]>(() =>
    readStoredTextValues(DELETED_TABLES_STORAGE_KEY),
  );
  const [orders, setOrderState] = useState<Order[]>(() => {
    const stations = loadProductionStations();
    const fallback = isSupabaseConfigured ? [] : ORDERS.map((o) => ({ ...o }));
    const stored = normalizeStationOrders(loadStoredOrders(fallback), stations);
    const pending = loadPendingOrderWrites();
    if (pending.length === 0) return stored;
    return applyPendingOrderWrites(stored, new Map(pending.map((order) => [order.id, order])));
  });
  const [tables, setTableState] = useState<Table[]>(() => {
    if (isSupabaseConfigured) return [];
    const deleted = new Set(readStoredTextValues(DELETED_TABLES_STORAGE_KEY));
    return loadStoredTables(TABLES.map((t) => ({ ...t }))).filter((table) => !deleted.has(table.id));
  });
  const [customTableAreas, setCustomTableAreas] = useState<string[]>(() => loadCustomTableAreas());
  const [stock, setStockState] = useState<StockItem[]>([]);
  const [customers, setCustomerState] = useState<Customer[]>(() =>
    loadStoredCustomers(isSupabaseConfigured ? [] : CUSTOMERS.map((c) => ({ ...c }))),
  );
  const [payments, setPaymentState] = useState<Payment[]>(() =>
    loadStoredPayments(isSupabaseConfigured ? [] : PAYMENTS_LEDGER.map((p) => ({ ...p }))),
  );
  const [reservations, setReservationState] = useState<Reservation[]>(() =>
    loadStoredReservations(isSupabaseConfigured ? [] : RESERVATIONS.map((r) => ({ ...r }))),
  );
  const [salesRecords, setSalesRecordState] = useState<SalesRecord[]>(() =>
    loadStoredSalesRecords(isSupabaseConfigured ? [] : SALES_RECORDS.map((r) => ({ ...r }))),
  );
  const [expenseRecords, setExpenseRecordState] = useState<ExpenseRecord[]>(() =>
    loadStoredExpenseRecords(isSupabaseConfigured ? [] : EXPENSE_RECORDS.map((r) => ({ ...r }))),
  );
  const [suppliers, setSupplierState] = useState<Supplier[]>(() =>
    isSupabaseConfigured ? loadStoredSuppliers([]) : loadStoredSuppliers(SUPPLIERS.map((s) => ({ ...s }))),
  );
  const [purchaseOrders, setPurchaseOrderState] = useState<PurchaseOrder[]>(() =>
    loadStoredPurchaseOrders(isSupabaseConfigured ? [] : PURCHASE_ORDERS.map((p) => ({ ...p }))),
  );
  const [guestOrderRequests, setGuestOrderRequestState] = useState<GuestOrderRequest[]>(() =>
    loadGuestOrderRequests(),
  );
  const storedReceiptsState = useStoredReceiptsModule();
  const storedReceipts = storedReceiptsState.records;
  const [restaurantProfile, setRestaurantProfile] = useState<RestaurantProfile>(() =>
    loadRestaurantProfile(),
  );
  const [realtimeStatus, setRealtimeStatus] = useState<BackendRealtimeStatus>(() =>
    isSupabaseConfigured ? "connecting" : "disabled",
  );
  const [lastRealtimeSyncAt, setLastRealtimeSyncAt] = useState<string | undefined>();
  const backendHydratedRef = useRef(!isSupabaseConfigured);
  const applyingBackendSnapshotRef = useRef(false);
  const hydrateInFlightRef = useRef(false);
  const hydrateQueuedRef = useRef(false);
  const realtimeHydrateTimerRef = useRef<number | null>(null);
  /** Local menu creates/edits waiting on DB confirmation — hydrate must not wipe these. */
  const pendingMenuWritesRef = useRef(new Map<string, MenuItem>());
  /** Local table assignment edits waiting on DB — hydrate must not wipe these. */
  const pendingTableWritesRef = useRef(new Map<string, Table>());
  const tableSyncRetryTimerRef = useRef<number | null>(null);
  const pendingTablesBootstrappedRef = useRef(false);
  /** Local order creates/edits waiting on DB confirmation — hydrate must not wipe these. */
  const pendingOrdersWritesRef = useRef(new Map<string, Order>());
  const orderSyncRetryTimerRef = useRef<number | null>(null);
  const pendingOrdersBootstrappedRef = useRef(false);

  if (!pendingTablesBootstrappedRef.current && typeof window !== "undefined") {
    pendingTablesBootstrappedRef.current = true;
    for (const table of loadPendingTableWrites()) {
      if (table?.id) pendingTableWritesRef.current.set(table.id, table);
    }
  }

  if (!pendingOrdersBootstrappedRef.current && typeof window !== "undefined") {
    pendingOrdersBootstrappedRef.current = true;
    for (const order of loadPendingOrderWrites()) {
      if (order?.id) pendingOrdersWritesRef.current.set(order.id, order);
    }
  }

  function canSyncBackend() {
    return (
      isSupabaseConfigured &&
      backendHydratedRef.current &&
      !applyingBackendSnapshotRef.current
    );
  }
  const latestStateRef = useRef({
    menuStations,
    menuItems,
    customMenuCategories,
    orders,
    tables,
    customTableAreas,
    stock,
    customers,
    payments,
    reservations,
    salesRecords,
    expenseRecords,
    suppliers,
    purchaseOrders,
    guestOrderRequests,
    restaurantProfile,
  });

  const menuCategories = [
    "All",
    ...Array.from(
      new Set([...menuItems.map((item) => item.category), ...customMenuCategories]),
    )
      .filter((cat) => !deletedMenuCategories.some((d) => d.toLowerCase() === cat.toLowerCase()))
      .sort(),
  ];
  const tableAreas = [
    "All",
    ...Array.from(new Set([...tables.map((table) => table.area), ...customTableAreas])).sort(),
  ];

  const syncServerPosRecords = useCallback((payload: PosPersistencePayload, action: string) => {
    if (!isSupabaseConfigured || !supabase || typeof window === "undefined") return;
    void (async () => {
      const { ensureSupabaseAccessToken } = await import("./supabase/session");
      const accessToken = await ensureSupabaseAccessToken();
      if (!accessToken) return;
      await persistPosRecords({ data: { accessToken, ...payload } });
    })().catch((error) => reportBackendError(action, error));
  }, []);

  function clearPendingOrderWrite(orderId: string, expected?: Order) {
    const pending = pendingOrdersWritesRef.current.get(orderId);
    if (!pending) return;
    if (expected && pending !== expected) return;
    pendingOrdersWritesRef.current.delete(orderId);
    savePendingOrderWrites(pendingOrdersWritesRef.current);
  }

  function rememberPendingOrderWrite(order: Order) {
    pendingOrdersWritesRef.current.set(order.id, order);
    savePendingOrderWrites(pendingOrdersWritesRef.current);
  }

  function clearPendingTableWrite(tableId: string, expected?: Table) {
    const pending = pendingTableWritesRef.current.get(tableId);
    if (!pending) return;
    if (expected && pending !== expected) return;
    pendingTableWritesRef.current.delete(tableId);
    savePendingTableWrites(pendingTableWritesRef.current);
  }

  function rememberPendingTableWrite(table: Table) {
    pendingTableWritesRef.current.set(table.id, table);
    savePendingTableWrites(pendingTableWritesRef.current);
  }

  function schedulePendingTableSyncRetry() {
    if (typeof window === "undefined") return;
    if (tableSyncRetryTimerRef.current) return;
    tableSyncRetryTimerRef.current = window.setTimeout(() => {
      tableSyncRetryTimerRef.current = null;
      flushPendingTableSync();
    }, 2_000);
  }

  async function persistTablesReliable(changed: Table[]): Promise<{ ok: boolean; error?: string }> {
    if (changed.length === 0) return { ok: true };
    if (!isSupabaseConfigured) {
      for (const table of changed) clearPendingTableWrite(table.id, table);
      return { ok: true };
    }

    try {
      const { ensureSupabaseAccessToken } = await import("./supabase/session");
      const accessToken = await ensureSupabaseAccessToken();
      if (accessToken) {
        await persistPosRecords({ data: { accessToken, tables: changed } });
        for (const table of changed) clearPendingTableWrite(table.id, table);
        return { ok: true };
      }
    } catch (error) {
      reportBackendError("tables service sync", error);
    }

    try {
      await upsertBackendTables(changed);
      for (const table of changed) clearPendingTableWrite(table.id, table);
      syncServerPosRecords({ tables: changed }, "tables service sync");
      return { ok: true };
    } catch (error) {
      reportBackendError("tables sync", error);
      schedulePendingTableSyncRetry();
      const message = error instanceof Error ? error.message : String(error ?? "");
      return { ok: false, error: message || "Tables could not be saved to the server." };
    }
  }

  function flushPendingTableSync() {
    if (!isSupabaseConfigured || applyingBackendSnapshotRef.current) return;
    const pending = [...pendingTableWritesRef.current.values()];
    if (pending.length === 0) return;
    void persistTablesReliable(pending);
  }

  function schedulePendingOrderSyncRetry() {
    if (typeof window === "undefined") return;
    if (orderSyncRetryTimerRef.current) return;
    orderSyncRetryTimerRef.current = window.setTimeout(() => {
      orderSyncRetryTimerRef.current = null;
      flushPendingOrderSync();
    }, 2_500);
  }

  const orderPersistInFlightRef = useRef<Promise<{ ok: boolean; error?: string }> | null>(null);

  async function persistOrdersReliable(changed: Order[]): Promise<{ ok: boolean; error?: string }> {
    if (changed.length === 0) return { ok: true };
    if (!isSupabaseConfigured) {
      for (const order of changed) clearPendingOrderWrite(order.id, order);
      return { ok: true };
    }

    // Coalesce overlapping syncs so Send + Print dialog do not stack network waits.
    if (orderPersistInFlightRef.current) {
      try {
        await orderPersistInFlightRef.current;
      } catch {
        // Prior attempt failed; continue with a fresh sync below.
      }
    }

    const run = (async (): Promise<{ ok: boolean; error?: string }> => {
      // Prefer service-role persistence so waiter/cashier client RLS cannot silently drop inserts
      // (Supabase upsert can return no error while writing zero rows).
      try {
        const { ensureSupabaseAccessToken } = await import("./supabase/session");
        const accessToken = await ensureSupabaseAccessToken();
        if (accessToken) {
          await persistPosRecords({ data: { accessToken, orders: changed } });
          for (const order of changed) clearPendingOrderWrite(order.id, order);
          return { ok: true };
        }
      } catch (error) {
        reportBackendError("orders service sync", error);
      }

      try {
        await syncBackendOrders(changed);
        for (const order of changed) clearPendingOrderWrite(order.id, order);
        syncServerPosRecords({ orders: changed }, "orders service sync");
        return { ok: true };
      } catch (error) {
        reportBackendError("orders sync", error);
        schedulePendingOrderSyncRetry();
        const message = error instanceof Error ? error.message : String(error ?? "");
        return { ok: false, error: message || "Order could not be saved to the server." };
      }
    })();

    orderPersistInFlightRef.current = run.then(
      (result) => {
        if (orderPersistInFlightRef.current === run) orderPersistInFlightRef.current = null;
        return result;
      },
      (error) => {
        if (orderPersistInFlightRef.current === run) orderPersistInFlightRef.current = null;
        throw error;
      },
    );

    return run;
  }

  function flushPendingOrderSync() {
    if (!isSupabaseConfigured || applyingBackendSnapshotRef.current) return;
    const pending = [...pendingOrdersWritesRef.current.values()];
    if (pending.length === 0) return;
    void persistOrdersReliable(pending);
  }

  async function ensureOrdersPersisted(
    orderIds: string[],
    options?: { waitForRemoteMs?: number },
  ) {
    const ids = [...new Set(orderIds.map((id) => id.trim()).filter(Boolean))];
    const resolve = () =>
      ids
        .map(
          (id) =>
            pendingOrdersWritesRef.current.get(id) ??
            latestStateRef.current.orders.find((order) => order.id === id),
        )
        .filter((order): order is Order => Boolean(order));

    if (ids.length === 0) {
      return { ok: false, error: "No order to save.", orders: [] as Order[] };
    }

    let orders = resolve();
    if (orders.length !== ids.length) {
      return {
        ok: false,
        error: "Order was not created. Bono cannot print until the bill exists.",
        orders,
      };
    }

    // Local-only mode: localStorage write in setOrders is enough.
    if (!isSupabaseConfigured) {
      for (const order of orders) clearPendingOrderWrite(order.id);
      return { ok: true, orders };
    }

    // Already flushed — allow print immediately (no second network round-trip).
    const needsRemote = ids.some((id) => pendingOrdersWritesRef.current.has(id));
    if (!needsRemote) {
      return { ok: true, orders };
    }

    const waitForRemoteMs = Math.max(0, options?.waitForRemoteMs ?? 1_200);
    const syncPromise = persistOrdersReliable(orders);

    if (waitForRemoteMs === 0) {
      void syncPromise;
      // Bill exists locally; remote sync continues in background.
      return { ok: true, orders };
    }

    const timedOut = await Promise.race([
      syncPromise.then(() => false),
      new Promise<boolean>((resolve) => {
        window.setTimeout(() => resolve(true), waitForRemoteMs);
      }),
    ]);

    if (timedOut) {
      // Keep syncing; local bill is already created so Bono may print.
      void syncPromise.then((result) => {
        if (!result.ok) schedulePendingOrderSyncRetry();
      });
      return { ok: true, orders: resolve() };
    }

    const first = await syncPromise;
    if (!first.ok) {
      // Local create succeeded; retry remote later rather than blocking print forever.
      schedulePendingOrderSyncRetry();
      return { ok: true, orders: resolve() };
    }

    orders = resolve();
    const stillPending = orders.filter((order) => pendingOrdersWritesRef.current.has(order.id));
    if (stillPending.length > 0) {
      void persistOrdersReliable(stillPending);
    }

    return { ok: true, orders: resolve() };
  }

  function persistMenuCategories(categories: readonly string[], items = menuItems) {
    const next = uniqueTextValues(categories);
    saveCustomMenuCategories(next);
    if (canSyncBackend()) {
      const backendCategories = uniqueTextValues([...items.map((item) => item.category), ...next]);
      void syncBackendMenuCategories(backendCategories).catch((error) =>
        reportBackendError("menu categories sync", error),
      );
      syncServerPosRecords({ menuCategories: backendCategories }, "menu categories service sync");
    }
    return next;
  }

  function persistTableAreas(areas: readonly string[]) {
    const next = uniqueTextValues(areas);
    saveCustomTableAreas(next);
    return next;
  }

  useEffect(() => {
    latestStateRef.current = {
      menuStations,
      menuItems,
      customMenuCategories,
      orders,
      tables,
      customTableAreas,
      stock,
      customers,
      payments,
      reservations,
      salesRecords,
      expenseRecords,
      suppliers,
      purchaseOrders,
      guestOrderRequests,
      restaurantProfile,
    };
  });

  // Re-push any waiter/cashier bills that were created before a refresh finished syncing.
  useEffect(() => {
    if (!isSupabaseConfigured) return;
    const timer = window.setTimeout(() => {
      flushPendingOrderSync();
      flushPendingTableSync();
    }, 800);
    return () => window.clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const nextSalesRecords = ensureSalesRecordsForPaidOrders(orders, salesRecords, menuItems);
    if (nextSalesRecords === salesRecords) return;

    latestStateRef.current = { ...latestStateRef.current, salesRecords: nextSalesRecords };
    saveStoredSalesRecords(nextSalesRecords);
    setSalesRecordState(nextSalesRecords);
    if (canSyncBackend()) {
      void syncBackendSalesRecords(nextSalesRecords).catch((error) =>
        reportBackendError("sales backfill sync", error),
      );
      syncServerPosRecords({ salesRecords: nextSalesRecords }, "sales backfill service sync");
    }
  }, [orders, salesRecords, menuItems, syncServerPosRecords]);

  useEffect(() => {
    const withReceipts = orders.filter((order) => order.receipt);
    if (withReceipts.length === 0) return;
    storedReceiptsState.setRecords((prev) => {
      const known = new Set(prev.map((row) => row.orderId));
      const missing = withReceipts.filter((order) => !known.has(order.id));
      if (missing.length === 0) return prev;
      return missing.reduce(
        (list, order) => upsertStoredReceipt(list, buildStoredReceiptFromOrder(order, order.receipt!)),
        prev,
      );
    });
  }, [orders, storedReceiptsState.setRecords]);

  useEffect(() => {
    if (!isSupabaseConfigured) return;

    let active = true;
    const queuedTablesRef = { current: new Set<string>() as "all" | Set<string> };

    async function runHydrate(only?: readonly string[]) {
      if (!active || hydrateInFlightRef.current) {
        if (only?.length) {
          if (queuedTablesRef.current !== "all") {
            for (const table of only) queuedTablesRef.current.add(table);
          }
        } else {
          queuedTablesRef.current = "all";
        }
        hydrateQueuedRef.current = true;
        return;
      }

      hydrateInFlightRef.current = true;
      try {
        const snapshot = await loadBackendSnapshot(only?.length ? { only } : undefined);
        if (!active || !snapshot) return;

        const latest = latestStateRef.current;
        const remoteMenuItems = snapshot.menuItems ?? latest.menuItems;
        const pendingWrites = pendingMenuWritesRef.current;
        const remoteById = new Map(remoteMenuItems.map((item) => [item.id, item] as const));
        const localById = new Map(latest.menuItems.map((item) => [item.id, item] as const));
        const menuIds = new Set<string>([
          ...remoteById.keys(),
          ...localById.keys(),
          ...pendingWrites.keys(),
        ]);
        const nextMenuItems = Array.from(menuIds, (id) => {
          const pending = pendingWrites.get(id);
          if (pending) return pending;
          return remoteById.get(id) ?? localById.get(id)!;
        });
        const remoteMenuCategories = uniqueTextValues([
          ...nextMenuItems.map((item) => item.category),
          ...(snapshot.menuCategories ?? latest.customMenuCategories),
        ]);
        const nextMenuCategories = remoteMenuCategories;
        // When Supabase is configured, dining_tables is the source of truth.
        // Never re-merge local-only rows â€” that resurrects soft-deleted tables on other browsers.
        const deletedIds = new Set(readStoredTextValues(DELETED_TABLES_STORAGE_KEY));
        const pendingTableWrites = pendingTableWritesRef.current;
        const remoteTables = (snapshot.tables ?? latest.tables).filter((table) => !deletedIds.has(table.id));
        const nextTables = isSupabaseConfigured
          ? remoteTables.map((remote) => pendingTableWrites.get(remote.id) ?? remote)
          : (() => {
              const remotes = remoteTables.map((remote) => pendingTableWrites.get(remote.id) ?? remote);
              const localOnlyTables = latest.tables.filter(
                (table) =>
                  !deletedIds.has(table.id) &&
                  !remotes.some((remote) => remote.id === table.id),
              );
              return [...remotes, ...localOnlyTables];
            })();
        const nextStations = migrateProductionStations(snapshot.stations ?? latest.menuStations);
        const routedMenuItems = nextMenuItems.map((item) => ({
          ...item,
          station: resolveProductionStation(item, nextStations),
        }));
        const nextOrders = applyPendingOrderWrites(
          normalizeStationOrders(
            snapshot.orders
              ? mergePartialSnapshotOrders(snapshot.orders, latest.orders)
              : latest.orders,
            nextStations,
            routedMenuItems,
          ),
          pendingOrdersWritesRef.current,
        );
        const nextStock = snapshot.stock ?? latest.stock;
        const nextSuppliers = snapshot.suppliers ?? latest.suppliers;
        const nextReservations = snapshot.reservations ?? latest.reservations;
        const nextCustomers = snapshot.customers ?? latest.customers;
        const nextPayments = enrichPaymentsWithOrderReportDates(
          snapshot.payments ?? latest.payments,
          nextOrders,
        );
        const mergedSalesRecords = snapshot.salesRecords ?? latest.salesRecords;
        const nextSalesRecords = ensureSalesRecordsForPaidOrders(
          nextOrders,
          mergedSalesRecords,
          routedMenuItems,
        );
        const nextExpenseRecords = snapshot.expenseRecords ?? latest.expenseRecords;
        const nextPurchaseOrders = snapshot.purchaseOrders ?? latest.purchaseOrders;
        const nextGuestOrderRequests = snapshot.guestOrderRequests ?? latest.guestOrderRequests;

        applyingBackendSnapshotRef.current = true;
        const onlySet = only?.length ? new Set(only) : null;
        const touch = (table: string) => !onlySet || onlySet.has(table);
        const nextLatest = { ...latest };

        if (touch("menu_items") || touch("menu_categories") || touch("production_stations")) {
          nextLatest.menuItems = routedMenuItems;
          nextLatest.customMenuCategories = nextMenuCategories;
          nextLatest.menuStations = nextStations;
          setMenuItemState(routedMenuItems);
          saveStoredMenuItems(routedMenuItems);
          setCustomMenuCategories(nextMenuCategories);
          saveCustomMenuCategories(nextMenuCategories);
          setMenuStations(nextStations);
          saveProductionStations(nextStations);
        }

        if (touch("dining_tables")) {
          nextLatest.tables = nextTables;
          setTableState(nextTables);
          saveStoredTables(nextTables);
        }

        if (touch("orders")) {
          nextLatest.orders = nextOrders;
          setOrderState(nextOrders);
          saveStoredOrders(nextOrders);
        }

        if (touch("stock_items")) {
          nextLatest.stock = nextStock;
          setStockState(nextStock);
        }

        if (touch("suppliers")) {
          nextLatest.suppliers = nextSuppliers;
          setSupplierState(nextSuppliers);
          saveStoredSuppliers(nextSuppliers);
        }

        if (touch("reservations")) {
          nextLatest.reservations = nextReservations;
          setReservationState(nextReservations);
          saveStoredReservations(nextReservations);
        }

        if (touch("customers")) {
          nextLatest.customers = nextCustomers;
          setCustomerState(nextCustomers);
          saveStoredCustomers(nextCustomers);
        }

        if (touch("payments_ledger") || touch("orders")) {
          nextLatest.payments = nextPayments;
          setPaymentState(nextPayments);
          saveStoredPayments(nextPayments);
        }

        if (touch("sales_records") || touch("orders")) {
          nextLatest.salesRecords = nextSalesRecords;
          setSalesRecordState(nextSalesRecords);
          saveStoredSalesRecords(nextSalesRecords);
        }

        if (touch("expense_records")) {
          nextLatest.expenseRecords = nextExpenseRecords;
          setExpenseRecordState(nextExpenseRecords);
          saveStoredExpenseRecords(nextExpenseRecords);
        }

        if (touch("purchase_orders")) {
          nextLatest.purchaseOrders = nextPurchaseOrders;
          setPurchaseOrderState(nextPurchaseOrders);
          saveStoredPurchaseOrders(nextPurchaseOrders);
        }

        if (touch("guest_order_requests")) {
          nextLatest.guestOrderRequests = nextGuestOrderRequests;
          setGuestOrderRequestState(nextGuestOrderRequests);
          saveGuestOrderRequests(nextGuestOrderRequests);
        }

        if (touch("restaurant_profile") || snapshot.restaurantProfile) {
          const profile = snapshot.restaurantProfile ?? latest.restaurantProfile;
          nextLatest.restaurantProfile = profile;
          setRestaurantProfile(profile);
          saveRestaurantProfile(profile);
        }

        latestStateRef.current = nextLatest;
        setLastRealtimeSyncAt(formatSyncClock());
      } catch (error) {
        setRealtimeStatus("error");
        reportBackendError("hydrate", error);
      } finally {
        hydrateInFlightRef.current = false;
        applyingBackendSnapshotRef.current = false;
        backendHydratedRef.current = true;
        flushPendingOrderSync();
        flushPendingTableSync();
        if (active && hydrateQueuedRef.current) {
          hydrateQueuedRef.current = false;
          const queued = queuedTablesRef.current;
          queuedTablesRef.current = new Set();
          void runHydrate(queued === "all" ? undefined : [...queued]);
        }
      }
    }

    void runHydrate();
    const pendingRealtimeTables = new Set<string>();
    const REALTIME_HYDRATE_DEBOUNCE_MS = 4_000;
    const REALTIME_TABLES_DEBOUNCE_MS = 600;

    function flushRealtimeHydrate() {
      if (typeof document !== "undefined" && document.visibilityState === "hidden") {
        return;
      }
      if (realtimeHydrateTimerRef.current) {
        window.clearTimeout(realtimeHydrateTimerRef.current);
        realtimeHydrateTimerRef.current = null;
      }
      const tables = [...pendingRealtimeTables];
      pendingRealtimeTables.clear();
      if (tables.length === 0) return;
      void runHydrate(tables);
    }

    function scheduleRealtimeHydrate(table: string) {
      pendingRealtimeTables.add(table);
      if (typeof document !== "undefined" && document.visibilityState === "hidden") {
        return;
      }
      if (realtimeHydrateTimerRef.current) {
        window.clearTimeout(realtimeHydrateTimerRef.current);
      }
      // Floor seat changes should reach other POS sessions almost immediately.
      const onlyDiningTables = [...pendingRealtimeTables].every((name) => name === "dining_tables");
      realtimeHydrateTimerRef.current = window.setTimeout(() => {
        realtimeHydrateTimerRef.current = null;
        flushRealtimeHydrate();
      }, onlyDiningTables ? REALTIME_TABLES_DEBOUNCE_MS : REALTIME_HYDRATE_DEBOUNCE_MS);
    }

    function handleVisibility() {
      if (document.visibilityState === "visible" && pendingRealtimeTables.size > 0) {
        flushRealtimeHydrate();
      }
    }

    document.addEventListener("visibilitychange", handleVisibility);

    const subscription = subscribeToBackendChanges((table) => {
      scheduleRealtimeHydrate(table);
    }, setRealtimeStatus);

    return () => {
      active = false;
      document.removeEventListener("visibilitychange", handleVisibility);
      if (realtimeHydrateTimerRef.current) {
        window.clearTimeout(realtimeHydrateTimerRef.current);
      }
      subscription?.unsubscribe();
    };
  }, [syncServerPosRecords]);

  useEffect(() => {
    if (typeof window === "undefined") return;

    function handleStorage(event: StorageEvent) {
      if (!event.key || !event.newValue) return;
      applyingBackendSnapshotRef.current = true;
      try {
        if (event.key === ORDERS_STORAGE_KEY) {
          const parsed = readStorageEventRows<Order>(event);
          if (!parsed) return;
          const incomingOrders = normalizeStationOrders(
            parsed,
            latestStateRef.current.menuStations,
            latestStateRef.current.menuItems,
          );
          // Merge: for each order, prefer whichever copy has void fields set,
          // otherwise prefer the incoming (cross-tab) version for other updates.
          const currentById = new Map(
            latestStateRef.current.orders.map((o) => [o.id, o]),
          );
          const merged = incomingOrders.map((incoming) => {
            const current = currentById.get(incoming.id);
            if (!current) return incoming;
            const preferLocalSettlement = orderSettlementRank(current) > orderSettlementRank(incoming);
            if (preferLocalSettlement) {
              return {
                ...incoming,
                ...current,
                voidRequestedBy: current.voidRequestedBy ?? incoming.voidRequestedBy,
                voidRequestedAt: current.voidRequestedAt ?? incoming.voidRequestedAt,
                voidReason: current.voidReason ?? incoming.voidReason,
              };
            }
            // For final/terminal statuses, always trust the incoming (just-saved) version
            // For void fields, prefer whichever side has them set
            return {
              ...incoming,
              voidRequestedBy: current.voidRequestedBy ?? incoming.voidRequestedBy,
              voidRequestedAt: current.voidRequestedAt ?? incoming.voidRequestedAt,
              voidReason: current.voidReason ?? incoming.voidReason,
            };
          });
          // Add any orders only in current (not yet in localStorage)
          const incomingIds = new Set(incomingOrders.map((o) => o.id));
          const currentOnly = latestStateRef.current.orders.filter((o) => !incomingIds.has(o.id));
          const nextOrders = applyPendingOrderWrites(
            normalizeStationOrders(
              [...merged, ...currentOnly],
              latestStateRef.current.menuStations,
              latestStateRef.current.menuItems,
            ),
            pendingOrdersWritesRef.current,
          );

          latestStateRef.current = { ...latestStateRef.current, orders: nextOrders };
          setOrderState(nextOrders);
          saveStoredOrders(nextOrders);
          setLastRealtimeSyncAt(formatSyncClock());
          return;
        }

        if (event.key === SUPPLIERS_STORAGE_KEY) {
          const parsed = readStorageEventRows<Supplier>(event);
          if (!parsed) return;
          // Supplier lists are authoritative. Do not merge with the previous in-memory
          // list, otherwise a supplier deleted in the DB/another tab can be re-added
          // from stale local state.
          const nextSuppliers = parsed;
          latestStateRef.current = { ...latestStateRef.current, suppliers: nextSuppliers };
          setSupplierState(nextSuppliers);
          saveStoredSuppliers(nextSuppliers);
          setLastRealtimeSyncAt(formatSyncClock());
          return;
        }

        if (event.key === CUSTOMERS_STORAGE_KEY) {
          const parsed = readStorageEventRows<Customer>(event);
          if (!parsed) return;
          const nextCustomers = isSupabaseConfigured ? parsed : mergeById(parsed, latestStateRef.current.customers);
          latestStateRef.current = { ...latestStateRef.current, customers: nextCustomers };
          setCustomerState(nextCustomers);
          saveStoredCustomers(nextCustomers);
          setLastRealtimeSyncAt(formatSyncClock());
          return;
        }

        if (event.key === RESERVATIONS_STORAGE_KEY) {
          const parsed = readStorageEventRows<Reservation>(event);
          if (!parsed) return;
          const nextReservations = isSupabaseConfigured ? parsed : mergeById(parsed, latestStateRef.current.reservations);
          latestStateRef.current = { ...latestStateRef.current, reservations: nextReservations };
          setReservationState(nextReservations);
          saveStoredReservations(nextReservations);
          setLastRealtimeSyncAt(formatSyncClock());
          return;
        }

        if (event.key === PAYMENTS_STORAGE_KEY) {
          const parsed = readStorageEventRows<Payment>(event);
          if (!parsed) return;
          const nextPayments = isSupabaseConfigured ? parsed : mergeById(parsed, latestStateRef.current.payments);
          latestStateRef.current = { ...latestStateRef.current, payments: nextPayments };
          setPaymentState(nextPayments);
          saveStoredPayments(nextPayments);
          setLastRealtimeSyncAt(formatSyncClock());
          return;
        }

        if (event.key === SALES_RECORDS_STORAGE_KEY) {
          const parsed = readStorageEventRows<SalesRecord>(event);
          if (!parsed) return;
          const nextSalesRecords = isSupabaseConfigured ? parsed : mergeById(parsed, latestStateRef.current.salesRecords);
          latestStateRef.current = { ...latestStateRef.current, salesRecords: nextSalesRecords };
          setSalesRecordState(nextSalesRecords);
          saveStoredSalesRecords(nextSalesRecords);
          setLastRealtimeSyncAt(formatSyncClock());
          return;
        }

        if (event.key === EXPENSE_RECORDS_STORAGE_KEY) {
          const parsed = readStorageEventRows<ExpenseRecord>(event);
          if (!parsed) return;
          const nextExpenseRecords = isSupabaseConfigured ? parsed : mergeById(parsed, latestStateRef.current.expenseRecords);
          latestStateRef.current = {
            ...latestStateRef.current,
            expenseRecords: nextExpenseRecords,
          };
          setExpenseRecordState(nextExpenseRecords);
          saveStoredExpenseRecords(nextExpenseRecords);
          setLastRealtimeSyncAt(formatSyncClock());
          return;
        }

        if (event.key === PURCHASE_ORDERS_STORAGE_KEY) {
          const parsed = readStorageEventRows<PurchaseOrder>(event);
          if (!parsed) return;
          const nextPurchaseOrders = isSupabaseConfigured ? parsed : mergeById(parsed, latestStateRef.current.purchaseOrders);
          latestStateRef.current = {
            ...latestStateRef.current,
            purchaseOrders: nextPurchaseOrders,
          };
          setPurchaseOrderState(nextPurchaseOrders);
          saveStoredPurchaseOrders(nextPurchaseOrders);
          setLastRealtimeSyncAt(formatSyncClock());
        }
      } catch (error) {
        reportBackendError("storage sync", error);
      } finally {
        applyingBackendSnapshotRef.current = false;
      }
    }

    window.addEventListener("storage", handleStorage);
    return () => window.removeEventListener("storage", handleStorage);
  }, []);

  function setMenuItems(update: MenuItem[] | ((prev: MenuItem[]) => MenuItem[])) {
    setMenuItemState((prev) => {
      const next = typeof update === "function" ? update(prev) : update;
      // Keep hydrate merge in sync immediately â€” waiting for useEffect can drop unsaved creates.
      latestStateRef.current = { ...latestStateRef.current, menuItems: next };
      saveStoredMenuItems(next);
      if (canSyncBackend()) {
        const backendCategories = uniqueTextValues([
          ...next.map((item) => item.category),
          ...customMenuCategories,
        ]);
        void syncBackendMenuItems(next).catch((error) => reportBackendError("menu sync", error));
        void syncBackendMenuCategories(backendCategories).catch((error) =>
          reportBackendError("menu categories sync", error),
        );
        syncServerPosRecords(
          {
            menuItems: next,
            menuCategories: backendCategories,
            stations: uniqueStations(next.map((item) => item.station)),
          },
          "menu service sync",
        );
      }
      return next;
    });
  }

  function setOrders(update: Order[] | ((prev: Order[]) => Order[])) {
    setOrderState((prev) => {
      const next = typeof update === "function" ? update(prev) : update;
      latestStateRef.current = { ...latestStateRef.current, orders: next };
      saveStoredOrders(next);
      const changed = next.filter((order) => prev.find((row) => row.id === order.id) !== order);
      for (const order of changed) {
        rememberPendingOrderWrite(order);
      }
      if (changed.length === 0) return next;

      if (!isSupabaseConfigured) {
        for (const order of changed) clearPendingOrderWrite(order.id, order);
        return next;
      }

      // Sync even before first hydrate finishes so new POS orders are not lost in the gap.
      if (!applyingBackendSnapshotRef.current) {
        void persistOrdersReliable(changed);
      } else {
        schedulePendingOrderSyncRetry();
      }
      return next;
    });
  }

  function setTables(update: Table[] | ((prev: Table[]) => Table[])) {
    setTableState((prev) => {
      const next = typeof update === "function" ? update(prev) : update;
      latestStateRef.current = { ...latestStateRef.current, tables: next };
      saveStoredTables(next);
      const changed = next.filter((table) => {
        const before = prev.find((row) => row.id === table.id);
        return (
          !before ||
          before.server !== table.server ||
          before.status !== table.status ||
          before.label !== table.label ||
          before.area !== table.area ||
          before.seats !== table.seats ||
          before.guests !== table.guests ||
          before.openMin !== table.openMin ||
          before.total !== table.total
        );
      });
      for (const table of changed) {
        rememberPendingTableWrite(table);
      }
      if (changed.length === 0) return next;

      if (!isSupabaseConfigured) {
        for (const table of changed) clearPendingTableWrite(table.id, table);
        return next;
      }

      if (!applyingBackendSnapshotRef.current) {
        void persistTablesReliable(changed);
      } else {
        schedulePendingTableSyncRetry();
      }
      return next;
    });
  }

  function setStock(update: StockItem[] | ((prev: StockItem[]) => StockItem[])) {
    setStockState((prev) => {
      const next = typeof update === "function" ? update(prev) : update;
      latestStateRef.current = { ...latestStateRef.current, stock: next };
      if (canSyncBackend()) {
        void syncBackendStock(next).catch((error) => reportBackendError("stock sync", error));
        syncServerPosRecords({ stock: next }, "stock service sync");
      }
      return next;
    });
  }

  function setCustomers(update: Customer[] | ((prev: Customer[]) => Customer[])) {
    setCustomerState((prev) => {
      const next = typeof update === "function" ? update(prev) : update;
      latestStateRef.current = { ...latestStateRef.current, customers: next };
      saveStoredCustomers(next);
      if (canSyncBackend()) {
        void syncBackendCustomers(next).catch((error) =>
          reportBackendError("customers sync", error),
        );
        syncServerPosRecords({ customers: next }, "customers service sync");
      }
      return next;
    });
  }

  function setPayments(update: Payment[] | ((prev: Payment[]) => Payment[])) {
    setPaymentState((prev) => {
      const next = typeof update === "function" ? update(prev) : update;
      latestStateRef.current = { ...latestStateRef.current, payments: next };
      saveStoredPayments(next);
      if (canSyncBackend()) {
        void syncBackendPayments(next).catch((error) => reportBackendError("payments sync", error));
        syncServerPosRecords(
          { orders: latestStateRef.current.orders, payments: next },
          "payments service sync",
        );
      }
      return next;
    });
  }

  function setReservations(update: Reservation[] | ((prev: Reservation[]) => Reservation[])) {
    setReservationState((prev) => {
      const next = typeof update === "function" ? update(prev) : update;
      latestStateRef.current = { ...latestStateRef.current, reservations: next };
      saveStoredReservations(next);
      if (canSyncBackend()) {
        void syncBackendReservations(next).catch((error) =>
          reportBackendError("reservations sync", error),
        );
        syncServerPosRecords({ reservations: next }, "reservations service sync");
      }
      return next;
    });
  }

  function setSalesRecords(update: SalesRecord[] | ((prev: SalesRecord[]) => SalesRecord[])) {
    setSalesRecordState((prev) => {
      const next = typeof update === "function" ? update(prev) : update;
      latestStateRef.current = { ...latestStateRef.current, salesRecords: next };
      saveStoredSalesRecords(next);
      if (canSyncBackend()) {
        void syncBackendSalesRecords(next).catch((error) =>
          reportBackendError("sales sync", error),
        );
        syncServerPosRecords({ salesRecords: next }, "sales service sync");
      }
      return next;
    });
  }

  function setExpenseRecords(
    update: ExpenseRecord[] | ((prev: ExpenseRecord[]) => ExpenseRecord[]),
  ) {
    setExpenseRecordState((prev) => {
      const next = typeof update === "function" ? update(prev) : update;
      latestStateRef.current = { ...latestStateRef.current, expenseRecords: next };
      saveStoredExpenseRecords(next);
      if (canSyncBackend()) {
        void syncBackendExpenseRecords(next).catch((error) =>
          reportBackendError("expenses sync", error),
        );
        syncServerPosRecords({ expenseRecords: next }, "expenses service sync");
      }
      return next;
    });
  }

  function setSuppliers(update: Supplier[] | ((prev: Supplier[]) => Supplier[])) {
    setSupplierState((prev) => {
      const next = typeof update === "function" ? update(prev) : update;
      latestStateRef.current = { ...latestStateRef.current, suppliers: next };
      saveStoredSuppliers(next);
      if (canSyncBackend()) {
        void syncBackendSuppliers(next).catch((error) =>
          reportBackendError("suppliers sync", error),
        );
        syncServerPosRecords({ suppliers: next }, "suppliers service sync");
      } else if (isSupabaseConfigured) {
        void syncBackendSuppliers(next).catch((error) =>
          reportBackendError("suppliers direct fallback sync", error),
        );
        syncServerPosRecords({ suppliers: next }, "suppliers service sync (fallback)");
      }
      return next;
    });
  }

  function setPurchaseOrders(
    update: PurchaseOrder[] | ((prev: PurchaseOrder[]) => PurchaseOrder[]),
  ) {
    setPurchaseOrderState((prev) => {
      const next = typeof update === "function" ? update(prev) : update;
      latestStateRef.current = { ...latestStateRef.current, purchaseOrders: next };
      saveStoredPurchaseOrders(next);
      if (canSyncBackend()) {
        void syncBackendPurchaseOrders(next).catch((error) =>
          reportBackendError("purchase orders sync", error),
        );
        syncServerPosRecords({ purchaseOrders: next }, "purchase orders service sync");
      }
      return next;
    });
  }

  function setGuestOrderRequests(
    update: GuestOrderRequest[] | ((prev: GuestOrderRequest[]) => GuestOrderRequest[]),
  ) {
    setGuestOrderRequestState((prev) => {
      const next = typeof update === "function" ? update(prev) : update;
      latestStateRef.current = { ...latestStateRef.current, guestOrderRequests: next };
      saveGuestOrderRequests(next);
      if (canSyncBackend()) {
        void syncBackendGuestOrders(next).catch((error) =>
          reportBackendError("guest orders sync", error),
        );
        syncServerPosRecords({ guestOrderRequests: next }, "guest orders service sync");
      }
      return next;
    });
  }

  function addMenuCategory(category: string) {
    const value = category.trim();
    if (!value) return;
    if (menuCategories.some((existing) => existing.toLowerCase() === value.toLowerCase())) return;
    // Un-delete if it was previously deleted
    const nextDeleted = deletedMenuCategories.filter((d) => d.toLowerCase() !== value.toLowerCase());
    if (nextDeleted.length !== deletedMenuCategories.length) {
      setDeletedMenuCategories(nextDeleted);
      writeStoredTextValues(DELETED_MENU_CATEGORIES_STORAGE_KEY, nextDeleted);
    }
    setCustomMenuCategories((prev) => persistMenuCategories([...prev, value]));
  }

  function addMenuStation(station: string) {
    const value = normalizeStationName(station);
    if (!value) return;
    setMenuStations((prev) => {
      if (findStation(value, prev)) return prev;
      const next = uniqueStations([...prev, value]);
      saveProductionStations(next);
      if (canSyncBackend()) {
        void syncBackendStations(next).catch((error) => reportBackendError("stations sync", error));
        syncServerPosRecords({ stations: next }, "stations service sync");
      }
      return next;
    });
  }

  function renameMenuCategory(from: string, to: string) {
    const next = to.trim();
    if (!from.trim() || !next) return;
    if (
      from.toLowerCase() !== next.toLowerCase() &&
      menuCategories.some((existing) => existing.toLowerCase() === next.toLowerCase())
    )
      return;
    setMenuItems((prev) =>
      prev.map((item) => (item.category === from ? { ...item, category: next } : item)),
    );
    setCustomMenuCategories((prev) => {
      const filtered = prev.filter((category) => category.toLowerCase() !== from.toLowerCase());
      const categories = filtered.some((category) => category.toLowerCase() === next.toLowerCase())
        ? filtered
        : [...filtered, next];
      return persistMenuCategories(categories);
    });
  }

  function removeMenuCategory(category: string) {
    const value = category.trim();
    if (!value) return;
    const filteredCustomCategories = customMenuCategories.filter(
      (item) => item.toLowerCase() !== value.toLowerCase(),
    );

    // Track deleted categories so seed data items with this category don't resurface
    const nextDeleted = uniqueTextValues([...deletedMenuCategories, value]);
    setDeletedMenuCategories(nextDeleted);
    writeStoredTextValues(DELETED_MENU_CATEGORIES_STORAGE_KEY, nextDeleted);

    setMenuItemState((prev) => {
      const nextItems = prev.filter((item) => item.category.toLowerCase() !== value.toLowerCase());
      const nextCategories = uniqueTextValues([
        ...nextItems.map((item) => item.category),
        ...filteredCustomCategories,
      ]);

      latestStateRef.current = {
        ...latestStateRef.current,
        menuItems: nextItems,
        customMenuCategories: nextCategories,
      };
      saveStoredMenuItems(nextItems);
      setCustomMenuCategories(nextCategories);
      saveCustomMenuCategories(nextCategories);

      if (canSyncBackend()) {
        void syncBackendMenuItems(nextItems).catch((error) => reportBackendError("menu sync", error));
        void syncBackendMenuCategories(nextCategories).catch((error) =>
          reportBackendError("menu categories sync", error),
        );
        syncServerPosRecords(
          { menuItems: nextItems, menuCategories: nextCategories },
          "menu service sync",
        );
      }

      return nextItems;
    });
  }

  function renameMenuStation(from: string, to: string) {
    const source = normalizeStationName(from);
    const next = normalizeStationName(to);
    if (!from.trim() || !next) return;
    if (source.toLowerCase() !== next.toLowerCase() && findStation(next, menuStations)) return;
    setMenuStations((prev) => {
      const renamed = prev.map((station) =>
        station.toLowerCase() === source.toLowerCase() ? next : station,
      );
      const clean = uniqueStations(renamed);
      saveProductionStations(clean);
      if (canSyncBackend()) {
        void syncBackendStations(clean).catch((error) =>
          reportBackendError("stations sync", error),
        );
        syncServerPosRecords({ stations: clean }, "stations service sync");
      }
      return clean;
    });
    setMenuItems((prev) =>
      prev.map((item) =>
        item.station.toLowerCase() === source.toLowerCase() ? { ...item, station: next } : item,
      ),
    );
    setOrders((prev) =>
      prev.map((order) => ({
        ...order,
        items: order.items.map((item) =>
          item.station.toLowerCase() === source.toLowerCase() ? { ...item, station: next } : item,
        ),
        stationTickets: order.stationTickets.map((ticket) =>
          ticket.station.toLowerCase() === source.toLowerCase()
            ? {
                ...ticket,
                id: `${order.id}-${next.replace(/\s+/g, "-").toLowerCase()}`,
                station: next,
                items: ticket.items.map((item) =>
                  item.station.toLowerCase() === source.toLowerCase()
                    ? { ...item, station: next }
                    : item,
                ),
              }
            : ticket,
        ),
      })),
    );
    setSalesRecords((prev) =>
      prev.map((record) =>
        record.station.toLowerCase() === source.toLowerCase()
          ? { ...record, station: next }
          : record,
      ),
    );
  }

  function removeMenuStation(station: string) {
    const value = normalizeStationName(station);
    if (!value) return;
    if (menuStations.length <= 1) return;
    const nextStations = menuStations.filter((item) => item.toLowerCase() !== value.toLowerCase());
    const replacement = fallbackStation(nextStations);
    setMenuStations(nextStations);
    saveProductionStations(nextStations);
    if (canSyncBackend()) {
      void syncBackendStations(nextStations).catch((error) =>
        reportBackendError("stations sync", error),
      );
      syncServerPosRecords({ stations: nextStations }, "stations service sync");
    }
    setMenuItems((prev) =>
      prev.map((item) =>
        item.station.toLowerCase() === value.toLowerCase()
          ? { ...item, station: replacement }
          : item,
      ),
    );
    setOrders((prev) =>
      prev.map((order) => {
        const items = order.items.map((item) =>
          item.station.toLowerCase() === value.toLowerCase()
            ? { ...item, station: replacement }
            : item,
        );
        const stationTickets =
          order.status === "PENDING_CASHIER"
            ? []
            : order.stationTickets.length > 0
              ? mergeStationTickets(
                  order.stationTickets.map((ticket) => ({
                    ...ticket,
                    id:
                      ticket.station.toLowerCase() === value.toLowerCase()
                        ? `${order.id}-${replacement.replace(/\s+/g, "-").toLowerCase()}`
                        : ticket.id,
                    station:
                      ticket.station.toLowerCase() === value.toLowerCase()
                        ? replacement
                        : ticket.station,
                    items: ticket.items.map((item) =>
                      item.station.toLowerCase() === value.toLowerCase()
                        ? { ...item, station: replacement }
                        : item,
                    ),
                  })),
                )
              : buildStationTickets(
                  order.id,
                  items,
                  order.stationSentAt ?? order.sentAt,
                  nextStations,
                );
        return {
          ...order,
          items,
          stationTickets,
          status: nextOperationalStatus(order, stationTickets),
        };
      }),
    );
    setSalesRecords((prev) =>
      prev.map((record) =>
        record.station.toLowerCase() === value.toLowerCase()
          ? { ...record, station: replacement }
          : record,
      ),
    );
  }

  function saveMenuItem(item: MenuItem) {
    const normalized = { ...item, station: resolveProductionStation(item, menuStations) };
    pendingMenuWritesRef.current.set(normalized.id, normalized);
    setMenuItems((prev) =>
      prev.some((m) => m.id === normalized.id)
        ? prev.map((m) => (m.id === normalized.id ? normalized : m))
        : [...prev, normalized],
    );
    addMenuCategory(normalized.category);
    // Persist the single item immediately so one bad historical row cannot block creates.
    if (isSupabaseConfigured) {
      void upsertBackendMenuItem(normalized)
        .then(() => {
          if (pendingMenuWritesRef.current.get(normalized.id) === normalized) {
            pendingMenuWritesRef.current.delete(normalized.id);
          }
          syncServerPosRecords(
            {
              menuItems: [normalized],
              menuCategories: [normalized.category],
              stations: [normalized.station],
            },
            "menu item service sync",
          );
        })
        .catch((error) => {
          reportBackendError("menu item upsert", error);
          const message = error instanceof Error ? error.message : String(error);
          if (typeof window !== "undefined") {
            showError(`Menu item could not be saved to the database.\n\n${message}`);
          }
        });
    }
  }

  async function publishMenuChanges() {
    if (!isSupabaseConfigured) {
      return { ok: false, error: "Supabase is not configured." };
    }
    const items = latestStateRef.current.menuItems.map((item) => ({
      ...item,
      station: resolveProductionStation(item, latestStateRef.current.menuStations),
    }));
    const categories = uniqueTextValues([
      ...items.map((item) => item.category),
      ...latestStateRef.current.customMenuCategories,
    ]);
    for (const item of items) {
      pendingMenuWritesRef.current.set(item.id, item);
    }
    try {
      await syncBackendMenuItems(items);
      await syncBackendMenuCategories(categories);
      syncServerPosRecords(
        {
          menuItems: items,
          menuCategories: categories,
          stations: uniqueStations(items.map((item) => item.station)),
        },
        "menu publish service sync",
      );
      pendingMenuWritesRef.current.clear();
      setMenuItemState(items);
      latestStateRef.current = { ...latestStateRef.current, menuItems: items };
      saveStoredMenuItems(items);
      return { ok: true };
    } catch (error) {
      reportBackendError("menu publish", error);
      return {
        ok: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  function removeMenuItem(id: string) {
    pendingMenuWritesRef.current.delete(id);
    setMenuItems((prev) => prev.filter((item) => item.id !== id));
    if (canSyncBackend() || isSupabaseConfigured) {
      void deleteBackendMenuItem(id).catch((error) => reportBackendError("menu delete", error));
    }
  }

  function updateRestaurantProfile(profile: RestaurantProfile) {
    const next = normalizeRestaurantProfile(profile);
    setRestaurantProfile(next);
    saveRestaurantProfile(next);
    if (canSyncBackend()) {
      void syncBackendRestaurantProfile(next).catch((error) =>
        reportBackendError("restaurant profile sync", error),
      );
      syncServerPosRecords({ restaurantProfile: next }, "restaurant profile service sync");
    }
  }

  function resetRestaurantProfile() {
    clearRestaurantProfile();
    setRestaurantProfile(DEFAULT_RESTAURANT_PROFILE);
    if (canSyncBackend()) {
      void syncBackendRestaurantProfile(DEFAULT_RESTAURANT_PROFILE).catch((error) =>
        reportBackendError("restaurant profile sync", error),
      );
      syncServerPosRecords(
        { restaurantProfile: DEFAULT_RESTAURANT_PROFILE },
        "restaurant profile service sync",
      );
    }
  }

  function advanceOrder(id: string) {
    setOrders((prev) =>
      prev.map((order) => {
        if (order.id !== id || isFinalOrderStatus(order.status)) return order;
        const nextTickets = order.stationTickets.map((ticket) => {
          if (ticket.status === "READY") return ticket;
          return {
            ...ticket,
            status: ticket.status === "NEW" ? ("PREPARING" as const) : ("READY" as const),
          };
        });
        return {
          ...order,
          stationTickets: nextTickets,
          status: nextOperationalStatus(order, nextTickets),
        };
      }),
    );
  }

  function requestVoidOrder(id: string, requestedBy: string, reason?: string) {
    const requestedAt = formatDateTime();
    const trimmedReason = reason?.trim() || undefined;
    setOrders((prev) =>
      prev.map((order) =>
        order.id === id && !isFinalOrderStatus(order.status) && !order.voidRequestedBy
          ? { ...order, voidRequestedBy: requestedBy, voidRequestedAt: requestedAt, voidReason: trimmedReason }
          : order,
      ),
    );
  }

  function rejectVoidOrder(id: string, _rejectedBy: string) {
    setOrders((prev) =>
      prev.map((order) =>
        order.id === id && !isFinalOrderStatus(order.status) && order.voidRequestedBy
          ? { ...order, voidRequestedBy: undefined, voidRequestedAt: undefined, voidReason: undefined }
          : order,
      ),
    );
  }

  function approveVoidOrder(
    id: string,
    approvedBy: string,
    options?: { reusablePackaged?: boolean; reason?: string },
  ) {
    const existing = orders.find((order) => order.id === id);
    if (!existing || isFinalOrderStatus(existing.status)) {
      return { ok: false, error: "Order is not available to void." };
    }

    const cancelledAt = formatDateTime();
    const reason = options?.reason?.trim() || existing.voidReason || "Void approved";
    const stockDeducted = Boolean(existing.stockDeductedAt) || orderHasPosStockDeduction(
      getModuleRecordsSnapshot<StockLedgerEntry>(STOCK_MODULE_KEYS.ledger, STOCK_LEDGER_FALLBACK),
      existing.id,
    );
    const outcome = resolvePosVoidStockOutcome({
      preparationStarted: orderPreparationStarted(existing),
      stockDeducted,
      reusablePackaged: options?.reusablePackaged,
    });
    applyPosStockExceptionOutcome({
      order: existing,
      actor: approvedBy,
      reason,
      outcome,
      canSync: canSyncBackend(),
      reportError: reportBackendError,
    });

    setOrders((prev) =>
      prev.map((order) =>
        order.id === id && !isFinalOrderStatus(order.status)
          ? {
              ...order,
              status: "CANCELLED",
              paymentStatus: "Unpaid",
              cancelledAt,
              cancelledBy: approvedBy,
              cancelReason: reason,
              voidReason: reason,
              stockExceptionOutcome: outcome,
              lockedForEditing: true,
              voidRequestedBy: undefined,
              voidRequestedAt: undefined,
              stationTickets: order.stationTickets.map((ticket) =>
                ticket.status === "CANCELLED" || ticket.status === "UNAVAILABLE"
                  ? ticket
                  : { ...ticket, status: "CANCELLED" as const },
              ),
            }
          : order,
      ),
    );

    {
      const voidReceipt: OrderReceipt = existing.receipt ?? {
        receiptNumber: `VOID-${existing.orderNo}-${Date.now()}`,
        generatedAt: cancelledAt,
        generatedBy: approvedBy,
        restaurantName: "",
        branchName: "",
        subtotal: existing.total ?? 0,
        vat: 0,
        vatRate: 0,
        serviceChargeEnabled: false,
        serviceCharge: 0,
        discount: 0,
        grandTotal: existing.total ?? 0,
        paymentStatus: "Unpaid",
        orderStatusAtGeneration: "CANCELLED",
        printCount: 0,
      };
      const stored = buildStoredReceiptFromOrder({
        ...existing,
        status: "CANCELLED",
        paymentStatus: "Unpaid",
        cancelledAt,
        cancelledBy: approvedBy,
        receipt: voidReceipt,
      }, voidReceipt);
      stored.returnReason = `Void: ${reason}`;
      upsertStoredReceiptRecord(stored);
    }

    const tableObj = findTableBySeat(tables, existing.area, existing.tableNumber);
    if (tableObj) releaseTable(tableObj.id);
    return { ok: true };
  }

  function cancelOrder(
    id: string,
    cancelledBy?: string,
    reason?: string,
    options?: { forceWastage?: boolean; managerApproved?: boolean },
  ) {
    const existing = orders.find((order) => order.id === id);
    if (!existing || isFinalOrderStatus(existing.status)) {
      return { ok: false, error: "Order is not available to cancel." };
    }

    const actor = cancelledBy?.trim() || existing.cancelledBy || "System";
    const cancelReason = reason?.trim() || "Order cancelled";
    const prepStarted = orderPreparationStarted(existing);
    const stockDeducted = Boolean(existing.stockDeductedAt) || orderHasPosStockDeduction(
      getModuleRecordsSnapshot<StockLedgerEntry>(STOCK_MODULE_KEYS.ledger, STOCK_LEDGER_FALLBACK),
      existing.id,
    );

    if (prepStarted && !options?.managerApproved && !options?.forceWastage) {
      return {
        ok: false,
        error: "Manager approval required to cancel after preparation started. Stock will be recorded as wastage.",
      };
    }

    const outcome = resolvePosVoidStockOutcome({
      preparationStarted: prepStarted,
      stockDeducted,
      reusablePackaged: false,
    });
    applyPosStockExceptionOutcome({
      order: existing,
      actor,
      reason: cancelReason,
      outcome,
      canSync: canSyncBackend(),
      reportError: reportBackendError,
    });

    const cancelledAt = formatDateTime();
    setOrders((prev) =>
      prev.map((order) =>
        order.id === id && !isFinalOrderStatus(order.status)
          ? {
              ...order,
              status: "CANCELLED",
              paymentStatus: "Unpaid",
              cancelledAt,
              cancelledBy: actor,
              cancelReason,
              voidReason: cancelReason,
              stockExceptionOutcome: outcome,
              lockedForEditing: true,
              stationTickets: order.stationTickets.map((ticket) =>
                ticket.status === "CANCELLED" || ticket.status === "UNAVAILABLE"
                  ? ticket
                  : { ...ticket, status: "CANCELLED" as const },
              ),
            }
          : order,
      ),
    );

    {
      const voidReceipt: OrderReceipt = existing.receipt ?? {
        receiptNumber: `VOID-${existing.orderNo}-${Date.now()}`,
        generatedAt: cancelledAt,
        generatedBy: actor,
        restaurantName: "",
        branchName: "",
        subtotal: existing.total ?? 0,
        vat: 0,
        vatRate: 0,
        serviceChargeEnabled: false,
        serviceCharge: 0,
        discount: 0,
        grandTotal: existing.total ?? 0,
        paymentStatus: "Unpaid",
        orderStatusAtGeneration: "CANCELLED",
        printCount: 0,
      };
      const stored = buildStoredReceiptFromOrder({
        ...existing,
        status: "CANCELLED",
        paymentStatus: "Unpaid",
        cancelledAt,
        cancelledBy: actor,
        receipt: voidReceipt,
      }, voidReceipt);
      stored.returnReason = `Void: ${cancelReason}`;
      upsertStoredReceiptRecord(stored);
    }

    const tableObj = findTableBySeat(tables, existing.area, existing.tableNumber);
    if (tableObj) releaseTable(tableObj.id);
    return { ok: true };
  }

  function reportStationTicketUnavailable(
    orderId: string,
    ticketId: string,
    reportedBy: string,
    reason?: string,
  ) {
    const note = reason?.trim() || "Item unavailable at station";
    setOrders((prev) =>
      prev.map((order) => {
        if (order.id !== orderId || isFinalOrderStatus(order.status)) return order;
        const stationTickets = order.stationTickets.map((ticket) =>
          ticket.id === ticketId ? { ...ticket, status: "UNAVAILABLE" as const } : ticket,
        );
        const hasActive = stationTickets.some(
          (ticket) => ticket.status === "NEW" || ticket.status === "PREPARING" || ticket.status === "READY",
        );
        return {
          ...order,
          stationTickets,
          cancelReason: note,
          status: hasActive ? nextOperationalStatus(order, stationTickets) : order.status,
          voidRequestedBy: order.voidRequestedBy || reportedBy,
          voidRequestedAt: order.voidRequestedAt || formatDateTime(),
          voidReason: order.voidReason || note,
        };
      }),
    );
  }

  function recordStationTicketWastage(
    orderId: string,
    ticketId: string,
    recordedBy: string,
    reason?: string,
  ) {
    const existing = orders.find((order) => order.id === orderId);
    if (!existing || isFinalOrderStatus(existing.status)) {
      return { ok: false, error: "Order is not available." };
    }
    const ticket = existing.stationTickets.find((row) => row.id === ticketId);
    if (!ticket) return { ok: false, error: "Station ticket not found." };
    if (ticket.status === "CANCELLED" || ticket.status === "UNAVAILABLE") {
      return { ok: false, error: "Ticket is already closed." };
    }

    const note = reason?.trim() || "Station wastage";
    const stockItems = getModuleRecordsSnapshot<StockManagedItem>(STOCK_MODULE_KEYS.items, STOCK_ITEMS_FALLBACK);
    const stockRecipes = getModuleRecordsSnapshot<StockRecipe>(STOCK_MODULE_KEYS.recipes, STOCK_RECIPES_FALLBACK);
    const stockLedger = getModuleRecordsSnapshot<StockLedgerEntry>(STOCK_MODULE_KEYS.ledger, STOCK_LEDGER_FALLBACK);
    const stockLots = readPosStockLotsSnapshot();
    const ticketKeys = new Set(ticket.items.map((item) => `${item.menuItemId ?? ""}|${item.name}`));
    const lines = mapOrderLinesForStock(existing).filter((line) =>
      ticketKeys.has(`${line.menuItemId ?? ""}|${line.name}`),
    );
    const wastage = createPosOrderWastageEntries({
      orderId: existing.id,
      orderNo: existing.orderNo,
      enteredBy: recordedBy,
      reason: note,
      lines: lines.length > 0 ? lines : mapOrderLinesForStock(existing),
      items: stockItems,
      recipes: stockRecipes,
      ledger: stockLedger,
      lots: stockLots,
    });
    appendPosLedgerEntries(wastage.entries, canSyncBackend(), reportBackendError);
    releasePosStockForOrder(existing.id, canSyncBackend(), reportBackendError);

    setOrders((prev) =>
      prev.map((order) => {
        if (order.id !== orderId) return order;
        const stationTickets = order.stationTickets.map((row) =>
          row.id === ticketId ? { ...row, status: "CANCELLED" as const } : row,
        );
        const hasActive = stationTickets.some(
          (row) => row.status === "NEW" || row.status === "PREPARING" || row.status === "READY",
        );
        return {
          ...order,
          stationTickets,
          cancelReason: note,
          stockExceptionOutcome: "wastage",
          status: hasActive
            ? nextOperationalStatus(order, stationTickets)
            : order.status === "PENDING_CASHIER" || order.status === "RECEIPT_GENERATED"
              ? order.status
              : "CANCELLED",
          cancelledAt: hasActive ? order.cancelledAt : formatDateTime(),
          cancelledBy: hasActive ? order.cancelledBy : recordedBy,
          lockedForEditing: hasActive ? order.lockedForEditing : true,
        };
      }),
    );
    return {
      ok: true,
      alreadyDeducted: wastage.alreadyDeducted,
      wasteEntryCount: wastage.entries.length,
    };
  }

  function voidBonoStationTickets(orderId: string, actor: string, reason?: string) {
    const existing = orders.find((order) => order.id === orderId);
    if (!existing || isFinalOrderStatus(existing.status) || existing.status === "PENDING_CASHIER") {
      return { ok: false, error: "Order is not available to void." };
    }

    const bonoTickets = existing.stationTickets.filter(
      (ticket) =>
        isManualDeliveryStation(ticket.station) &&
        ticket.status !== "CANCELLED" &&
        ticket.status !== "UNAVAILABLE",
    );
    if (bonoTickets.length === 0) {
      return { ok: false, error: "No kitchen or butcher tickets to void." };
    }

    const note = reason?.trim() || "CUSTOMER CANCELLED";
    const prepStarted = bonoTickets.some(
      (ticket) => ticket.status === "PREPARING" || ticket.status === "READY",
    );
    const bonoKeys = new Set(
      bonoTickets.flatMap((ticket) => ticket.items.map((item) => `${item.menuItemId ?? ""}|${item.name}`)),
    );
    const bonoLines = mapOrderLinesForStock(existing).filter((line) =>
      bonoKeys.has(`${line.menuItemId ?? ""}|${line.name}`),
    );

    if (prepStarted && bonoLines.length > 0) {
      const stockItems = getModuleRecordsSnapshot<StockManagedItem>(STOCK_MODULE_KEYS.items, STOCK_ITEMS_FALLBACK);
      const stockRecipes = getModuleRecordsSnapshot<StockRecipe>(STOCK_MODULE_KEYS.recipes, STOCK_RECIPES_FALLBACK);
      const stockLedger = getModuleRecordsSnapshot<StockLedgerEntry>(STOCK_MODULE_KEYS.ledger, STOCK_LEDGER_FALLBACK);
      const wastage = createPosOrderWastageEntries({
        orderId: existing.id,
        orderNo: existing.orderNo,
        enteredBy: actor,
        reason: note,
        lines: bonoLines,
        items: stockItems,
        recipes: stockRecipes,
        ledger: stockLedger,
        lots: readPosStockLotsSnapshot(),
      });
      appendPosLedgerEntries(wastage.entries, canSyncBackend(), reportBackendError);
    }

    const bonoIds = new Set(bonoTickets.map((ticket) => ticket.id));
    const stationTickets = existing.stationTickets.map((ticket) =>
      bonoIds.has(ticket.id) ? { ...ticket, status: "CANCELLED" as const } : ticket,
    );
    const remainingStations = stationTickets.some(
      (ticket) =>
        !isManualDeliveryStation(ticket.station) &&
        (ticket.status === "NEW" || ticket.status === "PREPARING" || ticket.status === "READY"),
    );
    const hasActive = stationTickets.some(
      (ticket) => ticket.status === "NEW" || ticket.status === "PREPARING" || ticket.status === "READY",
    );

    if (!hasActive && !prepStarted) {
      releasePosStockForOrder(existing.id, canSyncBackend(), reportBackendError);
    }

    const cancelledAt = formatDateTime();
    setOrders((prev) =>
      prev.map((order) =>
        order.id === orderId
          ? {
              ...order,
              stationTickets,
              cancelReason: note,
              voidReason: note,
              status: hasActive ? nextOperationalStatus(order, stationTickets) : "CANCELLED",
              cancelledAt: hasActive ? order.cancelledAt : cancelledAt,
              cancelledBy: hasActive ? order.cancelledBy : actor,
              lockedForEditing: hasActive ? order.lockedForEditing : true,
              stockExceptionOutcome: prepStarted ? "wastage" : hasActive ? order.stockExceptionOutcome : "release_only",
            }
          : order,
      ),
    );

    if (!hasActive) {
      const tableObj = findTableBySeat(tables, existing.area, existing.tableNumber);
      if (tableObj) releaseTable(tableObj.id);

      const voidReceipt: OrderReceipt = existing.receipt ?? {
        receiptNumber: `VOID-${existing.orderNo}-${Date.now()}`,
        generatedAt: cancelledAt,
        generatedBy: actor,
        restaurantName: "",
        branchName: "",
        subtotal: existing.total ?? 0,
        vat: 0,
        vatRate: 0,
        serviceChargeEnabled: false,
        serviceCharge: 0,
        discount: 0,
        grandTotal: existing.total ?? 0,
        paymentStatus: "Unpaid",
        orderStatusAtGeneration: "CANCELLED",
        printCount: 0,
      };
      const stored = buildStoredReceiptFromOrder({
        ...existing,
        status: "CANCELLED",
        paymentStatus: "Unpaid",
        cancelledAt,
        cancelledBy: actor,
        receipt: voidReceipt,
      }, voidReceipt);
      stored.returnReason = `Void: ${note}`;
      upsertStoredReceiptRecord(stored);
    }

    emitOrdersSocketEvent({
      type: "kitchen:void",
      orderId: existing.id,
      orderNo: existing.orderNo,
      actor,
      message: remainingStations
        ? `Kitchen/Butcher voided for ${existing.orderNo}; other stations continue`
        : `Kitchen/Butcher order voided ${existing.orderNo}`,
    });

    return { ok: true, remainingStations };
  }

  function addOrder(order: Order) {
    const sentAt = order.sentAt || formatClock();
    const items = (order.items ?? []).map((item) => normalizeOrderLineRouting(item, menuStations));
    const stationTickets =
      order.status === "PENDING_CASHIER"
        ? []
        : order.stationTickets?.length
          ? order.stationTickets.map((ticket) => normalizeStationTicketRouting(ticket, menuStations))
          : buildStationTickets(order.id, items, sentAt, menuStations);
    const nextOrder = {
      ...order,
      sentAt,
      items,
      stationTickets,
      paymentStatus:
        order.paymentStatus ?? (order.payment ? ("Paid" as const) : ("Unpaid" as const)),
      status: nextOperationalStatus(order, stationTickets),
    };
    setOrders((prev) => [nextOrder, ...prev]);
  }

  function createOrder(input: NewPosOrderInput) {
    if (input.items.length === 0) return null;

    const seatArea = input.area.trim();
    const seatLabel = input.tableNumber.trim();
    const currentTables = latestStateRef.current.tables;
    const currentOrders = latestStateRef.current.orders;
    const table = findTableBySeat(currentTables, seatArea, seatLabel);
    const occupyingOrder =
      currentOrders.find(
        (order) =>
          hasLiveBillBlockingSeat(order) &&
          order.area.trim().toLowerCase() === seatArea.toLowerCase() &&
          order.tableNumber.trim().toLowerCase() === seatLabel.toLowerCase(),
      ) ?? null;
    const conflict = waiterCannotUseTableReason({
      waiter: input.waiter,
      table: table
        ? { area: table.area, label: table.label, server: table.server, status: table.status }
        : { area: seatArea, label: seatLabel, server: undefined, status: "Available" },
      area: seatArea,
      tableNumber: seatLabel,
      occupyingOrder,
      // Cashiers/managers creating for a waiter may claim an unassigned empty seat
      // (auto-assigns via ensureTableForSeat). Waiters must already be assigned.
      allowUnassignedClaim: !assignedWaiterMatches(input.enteredByCashier, input.waiter),
    });
    if (conflict) {
      showError(conflict);
      return null;
    }

    // Clear ghost / prior-day uncleared bills so today's waiter can open a fresh bill.
    const stamp = new Date().toISOString();
    const ghostIds = new Set(
      currentOrders
        .filter(
          (order) =>
            order.area.trim().toLowerCase() === seatArea.toLowerCase() &&
            order.tableNumber.trim().toLowerCase() === seatLabel.toLowerCase() &&
            stillOccupiesTable(order) &&
            !hasLiveBillBlockingSeat(order),
        )
        .map((order) => order.id),
    );
    if (ghostIds.size > 0) {
      const clearedOrders = latestStateRef.current.orders.map((order) =>
        ghostIds.has(order.id)
          ? {
              ...order,
              tableClearedAt: order.tableClearedAt || stamp,
              tableClearedBy: order.tableClearedBy || input.waiter,
            }
          : order,
      );
      latestStateRef.current = { ...latestStateRef.current, orders: clearedOrders };
      saveStoredOrders(clearedOrders);
      setOrders(() => clearedOrders);
    }

    const id = newOrderId();
    const sentAt = formatClock();
    const lines = cartLinesToOrderLines(input.items, input.area, menuStations);
    const stationTickets = input.sendToCashier
      ? []
      : buildStationTickets(id, lines, sentAt, menuStations);
    const total = lines.reduce((sum, line) => sum + (line.unitPrice ?? 0) * line.qty, 0);
    let order: Order = {
      id,
      orderNo: `ORD-${String(1000 + orders.length + 1).padStart(4, "0")}`,
      source: "Dine-in",
      ref: `${input.area} ${input.tableNumber}`,
      customerName: input.customerName?.trim() || undefined,
      area: input.area as SeatingArea,
      tableNumber: input.tableNumber,
      orderedByWaiter: input.waiter,
      waiter: input.waiter,
      enteredByCashier: input.sendToCashier ? "Pending cashier" : input.enteredByCashier,
      server: input.waiter,
      items: lines,
      stationTickets,
      sentAt,
      requestedAt: input.sendToCashier ? sentAt : undefined,
      stationSentAt: input.sendToCashier ? undefined : sentAt,
      createdAtIso: new Date().toISOString(),
      priority: input.area === "VIP" || input.area === "VVIP" ? "VIP" : "Normal",
      guests: findTableBySeat(tables, input.area, input.tableNumber)?.guests,
      openedMin: 0,
      status: input.sendToCashier ? "PENDING_CASHIER" : "NEW",
      paymentStatus: "Unpaid",
      total,
    };

    // Persist the bill first. Stock failures must never block order creation / station send.
    if (!input.sendToCashier) {
      try {
        order = applyPosReservationForOrder(
          order,
          input.enteredByCashier || input.waiter,
          "order_submit",
          canSyncBackend(),
          reportBackendError,
        );
        const deducted = applyPosDeductionForOrder(
          order,
          input.enteredByCashier || input.waiter,
          "order_submit",
          canSyncBackend(),
          reportBackendError,
        );
        order = deducted.order;
      } catch (error) {
        reportBackendError("order stock on create", error);
      }
    }

    rememberPendingOrderWrite(order);
    setOrders((prev) => {
      if (prev.some((row) => row.id === order.id)) {
        return prev.map((row) => (row.id === order.id ? order : row));
      }
      return [order, ...prev];
    });
    // Ensure callers (preview/print) see the bill immediately, even before React re-renders.
    if (!latestStateRef.current.orders.some((row) => row.id === order.id)) {
      latestStateRef.current = {
        ...latestStateRef.current,
        orders: [order, ...latestStateRef.current.orders],
      };
      saveStoredOrders(latestStateRef.current.orders);
    }
    ensureTableForSeat(input.area, input.tableNumber, {
      status: "Occupied",
      server: input.waiter,
      openMin: 0,
      total,
    });

    emitOrdersSocketEvent({
      type: "order:created",
      orderId: order.id,
      orderNo: order.orderNo,
      actor: input.waiter || input.enteredByCashier,
      message: input.sendToCashier
        ? `${order.orderNo} sent to cashier for ${order.area} ${order.tableNumber}`
        : `${order.orderNo} sent to stations for ${order.area} ${order.tableNumber}`,
    });

    const confirmed =
      latestStateRef.current.orders.find((row) => row.id === order.id) ?? order;
    return confirmed;
  }

  function addItemsToOpenOrder(
    orderId: string,
    input: { items: CartLine[]; enteredBy: string; actingWaiter?: string },
  ) {
    const existing = orders.find((order) => order.id === orderId);
    if (!existing) return { ok: false, error: "Order not found." };
    if (input.items.length === 0) return { ok: false, error: "Add at least one item." };
    if (
      isFinalOrderStatus(existing.status) ||
      existing.status === "PENDING_CASHIER" ||
      existing.status === "RECEIPT_GENERATED"
    ) {
      return { ok: false, error: "This bill cannot accept more items." };
    }
    if (existing.receipt || existing.lockedForEditing) {
      return { ok: false, error: "Cannot add items after a receipt was generated." };
    }
    if (existing.returnRequestedBy) {
      return { ok: false, error: "Resolve the pending return before adding items." };
    }

    const actingWaiter = input.actingWaiter?.trim() || "";
    if (actingWaiter) {
      const table = findTableBySeat(
        latestStateRef.current.tables,
        existing.area,
        existing.tableNumber,
      );
      const conflict = waiterCannotUseTableReason({
        waiter: actingWaiter,
        table: table
          ? { area: table.area, label: table.label, server: table.server }
          : {
              area: existing.area,
              label: existing.tableNumber,
              server: existing.waiter || existing.orderedByWaiter,
            },
        occupyingOrder: existing,
      });
      if (conflict) {
        return { ok: false, error: conflict };
      }
      const billOwner = existing.waiter?.trim() || existing.orderedByWaiter?.trim() || "";
      if (billOwner && !assignedWaiterMatches(billOwner, actingWaiter)) {
        return {
          ok: false,
          error: `Order ${existing.orderNo} belongs to ${billOwner}. Only that waiter can add items.`,
        };
      }
    }

    const newLines = cartLinesToOrderLines(input.items, existing.area, menuStations);
    const mergedItems = [...existing.items, ...newLines];
    const sentAt = formatClock();
    const baseTickets =
      existing.stationTickets.length > 0
        ? existing.stationTickets
        : buildStationTickets(
            existing.id,
            existing.items,
            existing.stationSentAt ?? existing.sentAt ?? sentAt,
            menuStations,
          );
    const stationTickets = alignTicketsToItemStations(
      existing.id,
      mergedItems,
      baseTickets,
      sentAt,
      menuStations,
    );
    const total = mergedItems.reduce((sum, line) => sum + (line.unitPrice ?? 0) * line.qty, 0);
    let nextOrder: Order = {
      ...existing,
      tableClearedAt: undefined,
      tableClearedBy: undefined,
      items: mergedItems,
      stationTickets,
      total,
      status: nextOperationalStatus(existing, stationTickets),
      stationSentAt: existing.stationSentAt ?? sentAt,
    };

    const actor = input.enteredBy.trim() || existing.enteredByCashier || existing.waiter;
    try {
      nextOrder = applyPosReservationForNewLines(
        nextOrder,
        newLines,
        actor,
        "order_submit",
        canSyncBackend(),
        reportBackendError,
      );
      const deducted = applyPosDeductionForNewLines(
        nextOrder,
        newLines,
        actor,
        "order_submit",
        canSyncBackend(),
        reportBackendError,
      );
      nextOrder = {
        ...deducted.order,
        items: mergedItems.map((line, index) =>
          index >= existing.items.length && deducted.deducted ? { ...line, stockDeducted: true } : line,
        ),
      };
    } catch (error) {
      reportBackendError("order stock on add items", error);
    }

    rememberPendingOrderWrite(nextOrder);
    setOrders((prev) => prev.map((order) => (order.id === orderId ? nextOrder : order)));
    ensureTableForSeat(existing.area, existing.tableNumber, {
      status: "Occupied",
      server: existing.waiter,
      total,
    });

    emitOrdersSocketEvent({
      type: "order:updated",
      orderId: nextOrder.id,
      orderNo: nextOrder.orderNo,
      actor,
      message: `Added ${newLines.length} item(s) to ${nextOrder.orderNo}`,
    });

    return { ok: true, order: nextOrder, addedLines: newLines };
  }

  function acceptWaiterOrder(orderId: string, cashierName: string) {
    const order = orders.find((item) => item.id === orderId);
    const cashier = cashierName.trim();
    if (!order || order.status !== "PENDING_CASHIER" || !cashier) return null;

    const sentAt = formatClock();
    const items = (order.items ?? []).map((item) => normalizeOrderLineRouting(item, menuStations));
    const stationTickets = buildStationTickets(order.id, items, sentAt, menuStations);
    let nextOrder: Order = {
      ...order,
      enteredByCashier: cashier,
      sentAt,
      cashierAcceptedAt: formatDateTime(),
      stationSentAt: sentAt,
      items,
      stationTickets,
      status: deriveOrderStatus(stationTickets),
    };
    try {
      nextOrder = applyPosReservationForOrder(nextOrder, cashier, "order_submit", canSyncBackend(), reportBackendError);
      const deducted = applyPosDeductionForOrder(nextOrder, cashier, "order_submit", canSyncBackend(), reportBackendError);
      nextOrder = deducted.order;
    } catch (error) {
      reportBackendError("order stock on accept", error);
    }

    rememberPendingOrderWrite(nextOrder);
    setOrders((prev) => prev.map((item) => (item.id === orderId ? nextOrder : item)));
    emitOrdersSocketEvent({
      type: "order:status",
      orderId: nextOrder.id,
      orderNo: nextOrder.orderNo,
      actor: cashier,
      message: `${nextOrder.orderNo} accepted — sent to stations`,
    });
    return nextOrder;
  }

  function updateStationTicket(
    orderId: string,
    ticketId: string,
    status: StationTicketStatus,
  ) {
    const stamp = formatDateTime();
    setOrders((prev) =>
      prev.map((order) => {
        if (order.id !== orderId || isFinalOrderStatus(order.status)) return order;
        const targetTicket = order.stationTickets.find((ticket) => ticket.id === ticketId);
        if (!targetTicket) return order;

        const stationTickets = order.stationTickets.flatMap((ticket) => {
          if (ticket.id !== ticketId) return [ticket];
          const updatedTicket = {
            ...ticket,
            status,
            acceptedAt:
              status === "PREPARING" || status === "READY"
                ? ticket.acceptedAt ?? stamp
                : ticket.acceptedAt,
            preparingAt:
              status === "PREPARING" || status === "READY"
                ? ticket.preparingAt ?? stamp
                : ticket.preparingAt,
            readyAt: status === "READY" ? stamp : ticket.readyAt,
            items: ticket.items.map((item) => {
              if (status === "NEW" || status === "PREPARING") {
                return {
                  ...item,
                  assignedStaff: item.assignedStaff ?? order.enteredByCashier ?? order.waiter,
                  acceptedAt: item.acceptedAt ?? stamp,
                  startedAt: status === "PREPARING" ? stamp : item.startedAt,
                };
              }
              if (status === "READY") {
                return {
                  ...item,
                  done: !ticket.nextStation ? true : item.done,
                  readyAt: stamp,
                  servedAt: !ticket.nextStation ? stamp : item.servedAt,
                };
              }
              return item;
            }),
          };
          if (status === "READY" && ticket.nextStation) {
            const alreadyQueued = order.stationTickets.some(
              (existing) =>
                existing.previousTicketId === ticket.id && existing.station === ticket.nextStation,
            );
            if (!alreadyQueued) return [updatedTicket, createFollowUpTicket(updatedTicket, ticket.nextStation)];
          }
          return [updatedTicket];
        });
        const targetKeys = new Set(targetTicket.items.map((item) => stationTicketItemKey(item)));
        const shouldMarkDone = status === "READY" && !targetTicket.nextStation;
        const items = order.items.map((item) => {
          if (!targetKeys.has(stationTicketItemKey(item))) return item;
          if (status === "NEW" || status === "PREPARING") {
            return {
              ...item,
              assignedStaff: item.assignedStaff ?? order.enteredByCashier ?? order.waiter,
              acceptedAt: item.acceptedAt ?? stamp,
              startedAt: status === "PREPARING" ? stamp : item.startedAt,
            };
          }
          if (shouldMarkDone) {
            return { ...item, done: true, readyAt: stamp, servedAt: stamp };
          }
          if (status === "READY") {
            return { ...item, readyAt: stamp };
          }
          return item;
        });
        let nextOrder: Order = {
          ...order,
          items,
          stationTickets,
          status: nextOperationalStatus(order, stationTickets),
        };

        if (status === "PREPARING") {
          nextOrder = applyPosReservationForOrder(
            nextOrder,
            nextOrder.enteredByCashier || nextOrder.waiter,
            "station_accept",
            canSyncBackend(),
            reportBackendError,
          );
          nextOrder = applyPosReservationForOrder(
            nextOrder,
            nextOrder.enteredByCashier || nextOrder.waiter,
            "prep_start",
            canSyncBackend(),
            reportBackendError,
          );
          const acceptDeduct = applyPosDeductionForOrder(
            nextOrder,
            nextOrder.enteredByCashier || nextOrder.waiter,
            "station_accept",
            canSyncBackend(),
            reportBackendError,
          );
          nextOrder = acceptDeduct.order;
          const prepDeduct = applyPosDeductionForOrder(
            nextOrder,
            nextOrder.enteredByCashier || nextOrder.waiter,
            "prep_start",
            canSyncBackend(),
            reportBackendError,
          );
          nextOrder = prepDeduct.order;
        }

        if (status === "READY" && !targetTicket.nextStation) {
          const readyDeduct = applyPosDeductionForOrder(
            nextOrder,
            nextOrder.enteredByCashier || nextOrder.waiter,
            "item_ready",
            canSyncBackend(),
            reportBackendError,
          );
          nextOrder = readyDeduct.order;
          const servedDeduct = applyPosDeductionForOrder(
            nextOrder,
            nextOrder.enteredByCashier || nextOrder.waiter,
            "item_served",
            canSyncBackend(),
            reportBackendError,
          );
          nextOrder = servedDeduct.order;
        }

        return nextOrder;
      }),
    );
  }

  function upsertStoredReceiptRecord(receipt: StoredReceipt) {
    storedReceiptsState.setRecords((prev) => upsertStoredReceipt(prev, receipt));
  }

  function generateReceipt(orderId: string, input: GenerateReceiptInput) {
    const order = latestStateRef.current.orders.find((item) => item.id === orderId);
    if (
      !order ||
      order.receipt ||
      order.items.length === 0 ||
      isFinalOrderStatus(order.status) ||
      order.status === "PENDING_CASHIER"
    ) {
      return null;
    }

    const receipt = buildReceipt(order, input, restaurantProfile);
    const nextOrder: Order = {
      ...order,
      status: "RECEIPT_GENERATED",
      paymentStatus: "Unpaid",
      receipt,
      receiptNumber: receipt.receiptNumber,
      receiptGeneratedAt: receipt.generatedAt,
      receiptGeneratedBy: receipt.generatedBy,
      lockedForEditing: true,
      total: receipt.grandTotal,
    };
    setOrders((prev) => prev.map((item) => (item.id === orderId ? nextOrder : item)));
    if (!order.tableClearedAt) {
      ensureTableForSeat(order.area, order.tableNumber, {
        status: "Bill",
        server: order.waiter,
        total: receipt.grandTotal,
      });
    }
    upsertStoredReceiptRecord(buildStoredReceiptFromOrder(nextOrder, receipt));

    return receipt;
  }

  function recordReceiptPrint(orderId: string) {
    const order = latestStateRef.current.orders.find((item) => item.id === orderId);
    if (!order?.receipt) return null;

    const reprint = order.receipt.printCount > 0;
    const receipt = {
      ...order.receipt,
      printCount: order.receipt.printCount + 1,
      lastPrintedAt: formatDateTime(),
    };
    setOrders((prev) => prev.map((item) => (item.id === orderId ? { ...item, receipt } : item)));
    upsertStoredReceiptRecord(
      buildStoredReceiptFromOrder(
        { ...order, receipt },
        receipt,
      ),
    );

    return { receipt, reprint };
  }

  function authorizeReceiptChanges(orderId: string, managerName: string) {
    const name = managerName.trim();
    if (!name) return;
    setOrders((prev) =>
      prev.map((order) =>
        order.id === orderId && order.status === "RECEIPT_GENERATED"
          ? {
              ...order,
              lockedForEditing: false,
              managerAuthorizedChangesBy: name,
              managerAuthorizedChangesAt: formatDateTime(),
            }
          : order,
      ),
    );
  }

  function closeOrderPayment(orderId: string, input: CloseOrderPaymentInput) {
    const order = latestStateRef.current.orders.find((o) => o.id === orderId);
    if (!order?.receipt || order.paymentStatus === "Paid" || order.status === "CANCELLED") return null;

    const receipt = order.receipt;
    const amountDue = receipt.grandTotal;
    if (input.amountReceived < amountDue) return null;

    const extraAmount = Math.max(0, input.amountReceived - amountDue);
    const requestedTip = Math.max(0, input.tipAmount ?? 0);
    const tipAmount = input.keepAsTip
      ? extraAmount
      : Math.min(requestedTip, extraAmount);
    const changeAmount = Math.max(0, extraAmount - tipAmount);
    const closedAtIso = new Date().toISOString();
    const closedAt = formatDateTime();
    // Attribute sales/payment reports to the order's business day (e.g. yesterday unpaid → paid today still counts as yesterday).
    const reportDate = resolvePaidOrderReportDate(order);
    const payment: OrderPayment = {
      totalAmount: amountDue,
      method: input.method,
      collectedByWaiter: input.collectedByWaiter,
      receivedByCashier: input.receivedByCashier,
      amountReceived: input.amountReceived,
      changeAmount,
      tipAmount,
      receiptNumber: receipt.receiptNumber,
      paymentReceivedAt: closedAt,
      closedByCashier: input.closedByCashier,
      closedAt,
      bankPaymentReference: input.bankPaymentReference,
      bankPaymentPhone: input.bankPaymentPhone,
      bankAccountSuffix: input.bankAccountSuffix,
      verificationStatus: input.verificationStatus,
      verificationRequestId: input.verificationRequestId,
      verificationBank: input.verificationBank,
      verificationAmount: input.verificationAmount,
      verificationMessage: input.verificationMessage,
      verifiedAt: input.verifiedAt,
      mixedBankPayments: input.mixedBankPayments,
    };
    const salesRows = buildSalesRecordsFromOrder(order, payment, menuItems, closedAtIso, reportDate);

    const posSettings = readPosInventorySettings();
    const stockItems = getModuleRecordsSnapshot<StockManagedItem>(STOCK_MODULE_KEYS.items, STOCK_ITEMS_FALLBACK);
    const stockRecipes = getModuleRecordsSnapshot<StockRecipe>(STOCK_MODULE_KEYS.recipes, STOCK_RECIPES_FALLBACK);
    const stockLedger = getModuleRecordsSnapshot<StockLedgerEntry>(STOCK_MODULE_KEYS.ledger, STOCK_LEDGER_FALLBACK);
    const stockReservations = getModuleRecordsSnapshot<PosStockReservation>(STOCK_MODULE_KEYS.posReservations, STOCK_POS_RESERVATIONS_SEED);
    const stockLots = readPosStockLotsSnapshot();
    const deduction = isPosMenuStockDisconnected()
      ? {
          order,
          skippedItems: [] as string[],
          ledger: stockLedger,
          reservations: stockReservations,
          lots: stockLots,
        }
      : ensurePosStockDeductedWithFallback({
      order,
      enteredBy: input.closedByCashier,
      posDeductionTiming: posSettings.posDeductionTiming,
      events: ["payment_completed", "order_closed"],
      items: stockItems,
      recipes: stockRecipes,
      ledger: stockLedger,
      reservations: stockReservations,
      lots: stockLots,
    });
    if (deduction.ledger !== stockLedger) {
      syncPosLedger(deduction.ledger, canSyncBackend(), reportBackendError);
    }
    if (deduction.lots !== stockLots) {
      syncPosLots(deduction.lots, canSyncBackend(), reportBackendError);
    }
    if (deduction.reservations !== stockReservations) {
      syncPosReservations(deduction.reservations, canSyncBackend(), reportBackendError);
    }
    const workingOrder = deduction.order;
    const skippedItems = deduction.skippedItems;

    setOrders((prev) =>
      prev.map((o) =>
        o.id === orderId
          ? {
              ...workingOrder,
              status: "CLOSED",
              paymentStatus: "Paid",
              receipt: workingOrder.receipt ? { ...workingOrder.receipt, paymentStatus: "Paid" } : workingOrder.receipt,
              payment,
              paymentReceivedAt: closedAt,
              closedByCashier: input.closedByCashier,
              lockedForEditing: true,
            }
          : o,
      ),
    );
    setPayments((prev) => [
      {
        id: `pay${Date.now()}`,
        ref: receipt.receiptNumber,
        method: input.method,
        amount: amountDue,
        table: `${order.area} ${order.tableNumber}`,
        cashier: input.receivedByCashier,
        time: closedAt,
        status: "Settled",
        orderId,
        collectedByWaiter: input.collectedByWaiter,
        receivedByCashier: input.receivedByCashier,
        amountReceived: input.amountReceived,
        changeAmount,
        tipAmount,
        receiptNumber: receipt.receiptNumber,
        paymentReceivedAt: closedAt,
        closedByCashier: input.closedByCashier,
        reportDate,
      },
      ...prev,
    ]);
    setSalesRecords((prev) => [...salesRows, ...prev]);

    const paidReceipt = workingOrder.receipt
      ? { ...workingOrder.receipt, paymentStatus: "Paid" as const }
      : receipt;
    upsertStoredReceiptRecord(
      buildStoredReceiptFromOrder(
        {
          ...workingOrder,
          status: "CLOSED",
          paymentStatus: "Paid",
          receipt: paidReceipt,
          payment,
          paymentReceivedAt: closedAt,
          closedByCashier: input.closedByCashier,
        },
        paidReceipt,
      ),
    );

    const otherOpen = latestStateRef.current.orders.some(
      (row) =>
        row.id !== orderId &&
        row.area === order.area &&
        row.tableNumber === order.tableNumber &&
        stillOccupiesTable(row) &&
        !isOrderCompleted(row),
    );
    const tableObj = findTableBySeat(latestStateRef.current.tables, order.area, order.tableNumber);
    if (tableObj && !order.tableClearedAt) {
      ensureTableForSeat(order.area, order.tableNumber, {
        status: otherOpen ? "Occupied" : "Bill",
        server: tableObj.server || order.waiter,
        total: otherOpen ? tableObj.total : receipt.grandTotal,
      });
    }

    return { payment, skippedItems };
  }

  function serveOrder(id: string) {
    const order = orders.find((o) => o.id === id);
    if (!order) return;
    const stationTickets = order.stationTickets.map((ticket) => ({
      ...ticket,
      status: "READY" as const,
    }));
    setOrders((prev) =>
      prev.map((o) =>
        o.id === id && !isFinalOrderStatus(o.status) && o.status !== "RECEIPT_GENERATED"
          ? {
              ...o,
              stationTickets,
              status: "READY TO SERVE",
              items: o.items.map((item) => ({ ...item, done: true })),
            }
          : o,
      ),
    );
  }

  function requestReturnOrder(
    id: string,
    requestedBy: string,
    reason?: string,
    returnLines?: Array<{ index: number; qty: number }>,
  ) {
    const existing = orders.find((order) => order.id === id);
    if (
      !existing ||
      existing.status === "PENDING_CASHIER" ||
      existing.status === "CANCELLED" ||
      existing.status === "RETURNED" ||
      existing.returnRequestedBy
    ) {
      return;
    }
    const requestedAt = formatDateTime();
    const trimmedReason = reason?.trim() || undefined;
    const requestedLines = normalizeReturnRequestedLines(existing.items, returnLines);
    if (returnLines && returnLines.length > 0 && !requestedLines) {
      return;
    }
    setOrders((prev) =>
      prev.map((order) =>
        order.id === id
          ? {
              ...order,
              returnRequestedBy: requestedBy,
              returnRequestedAt: requestedAt,
              returnReason: trimmedReason,
              returnRequestedLines: requestedLines,
            }
          : order,
      ),
    );
    emitOrdersSocketEvent(
      {
        type: "order:return-requested",
        orderId: existing.id,
        orderNo: existing.orderNo,
        actor: requestedBy,
        message: `Return requested for ${existing.orderNo} — manager approval needed`,
        meta: { reason: trimmedReason, audience: "manager", returnLines: requestedLines },
      },
      { toast: false },
    );
  }

  function approveReturnOrder(
    id: string,
    approvedBy: string,
    options?: {
      restorePackagedStock?: boolean;
      reason?: string;
      direct?: boolean;
      itemIndexes?: number[];
      returnLines?: Array<{ index: number; qty: number }>;
    },
  ) {
    const existing = orders.find((order) => order.id === id);
    if (
      !existing ||
      existing.status === "PENDING_CASHIER" ||
      existing.status === "CANCELLED" ||
      existing.status === "RETURNED"
    ) {
      return { ok: false, error: "Order is not available for return approval." };
    }
    if (!options?.direct && !existing.returnRequestedBy) {
      return { ok: false, error: "Order has no pending return request." };
    }

    const reason = options?.reason?.trim() || existing.returnReason || "Customer return";
    const selections = (() => {
      const preferredLines =
        options?.returnLines && options.returnLines.length > 0
          ? options.returnLines
          : existing.returnRequestedLines;
      if (preferredLines && preferredLines.length > 0) {
        return preferredLines
          .map((row) => {
            const line = existing.items[row.index];
            if (!line) return null;
            const qty = Math.min(Math.max(0, Number(row.qty) || 0), line.qty);
            if (qty <= 0) return null;
            return { index: row.index, qty, line };
          })
          .filter((row): row is { index: number; qty: number; line: (typeof existing.items)[number] } => Boolean(row));
      }
      const raw = options?.itemIndexes;
      const indexes =
        !raw || raw.length === 0
          ? existing.items.map((_, index) => index)
          : [...new Set(raw)].filter((index) => index >= 0 && index < existing.items.length);
      return indexes
        .map((index) => {
          const line = existing.items[index];
          if (!line) return null;
          return { index, qty: line.qty, line };
        })
        .filter((row): row is { index: number; qty: number; line: (typeof existing.items)[number] } => Boolean(row));
    })();
    if (selections.length === 0) {
      return { ok: false, error: "Select at least one item quantity to return." };
    }

    const returnedItems = selections.map(({ line, qty }) => ({ ...line, qty, pouredQty: undefined }));
    const remainingItems = existing.items
      .map((line, index) => {
        const selection = selections.find((row) => row.index === index);
        if (!selection) return line;
        const left = Math.round((line.qty - selection.qty) * 1000) / 1000;
        if (left <= 0) return null;
        const poured = Math.min(line.pouredQty ?? 0, left);
        return { ...line, qty: left, pouredQty: poured > 0 ? poured : undefined };
      })
      .filter((line): line is (typeof existing.items)[number] => Boolean(line));
    const isPartial = remainingItems.length > 0;
    const returnedTotal = money(
      returnedItems.reduce((sum, line) => sum + (line.unitPrice ?? 0) * line.qty, 0),
    );
    const remainingTotal = money(
      remainingItems.reduce((sum, line) => sum + (line.unitPrice ?? 0) * line.qty, 0),
    );
    const lineNames = returnedItems.map((line) => line.name);
    const partialLines = selections.map(({ line, qty }) => ({
      name: line.name,
      returnQty: qty,
      orderedQty: line.qty,
    }));
    const itemSummary = returnedItems
      .map((line) => `${line.qty}${line.unitLabel ? ` ${line.unitLabel}` : "x"} ${line.name}`)
      .join(", ");
    const returnNote = isPartial ? `${reason} Â· returned: ${itemSummary}` : reason;

    const stockDeducted = Boolean(existing.stockDeductedAt) || orderHasPosStockDeduction(
      getModuleRecordsSnapshot<StockLedgerEntry>(STOCK_MODULE_KEYS.ledger, STOCK_LEDGER_FALLBACK),
      existing.id,
    );
    const canSync = canSyncBackend();
    let stockOutcome: Order["stockExceptionOutcome"] = "release_only";

    if (options?.restorePackagedStock) {
      const stockLedger = getModuleRecordsSnapshot<StockLedgerEntry>(STOCK_MODULE_KEYS.ledger, STOCK_LEDGER_FALLBACK);
      const { entries } = createPosPackagedReturnEntries({
        orderId: existing.id,
        orderNo: existing.orderNo,
        enteredBy: approvedBy,
        reason,
        ledger: stockLedger,
        lineNames,
        partialLines,
      });
      appendPosLedgerEntries(entries, canSync, reportBackendError);
      if (!isPartial) releasePosStockForOrder(existing.id, canSync, reportBackendError);
      stockOutcome = "packaged_return";
    } else if (stockDeducted) {
      applyPosStockExceptionOutcome({
        order: existing,
        actor: approvedBy,
        reason,
        outcome: "reversal",
        canSync,
        reportError: reportBackendError,
        lineNames,
        keepReservations: isPartial,
        partialLines,
      });
      stockOutcome = "reversal";
    } else if (!isPartial) {
      releasePosStockForOrder(existing.id, canSync, reportBackendError);
    }

    const returnedAt = formatDateTime();
    const wasPaid = existing.paymentStatus === "Paid" || existing.paymentStatus === "Partially Paid" || Boolean(existing.payment);

    if (isPartial) {
      const stationTickets = buildStationTickets(
        existing.id,
        remainingItems,
        existing.stationSentAt ?? existing.sentAt,
        menuStations,
      );
      const nextReceipt = existing.receipt
        ? {
            ...existing.receipt,
            subtotal: remainingTotal,
            grandTotal: remainingTotal,
            discount: Math.min(existing.receipt.discount ?? 0, remainingTotal),
          }
        : existing.receipt;

      setOrders((prev) =>
        prev.map((order) =>
          order.id === id &&
          order.status !== "PENDING_CASHIER" &&
          order.status !== "CANCELLED" &&
          order.status !== "RETURNED" &&
          (options?.direct || order.returnRequestedBy)
            ? {
                ...order,
                items: remainingItems,
                stationTickets,
                total: remainingTotal,
                receipt: nextReceipt,
                returnRequestedBy: undefined,
                returnRequestedAt: undefined,
                returnReason: undefined,
                returnRequestedLines: undefined,
                stockExceptionOutcome: stockOutcome,
                lockedForEditing: Boolean(nextReceipt) || order.lockedForEditing,
              }
            : order,
        ),
      );

      const returnReceipt: OrderReceipt = {
        receiptNumber: `RET-${existing.orderNo}-${Date.now()}`,
        generatedAt: returnedAt,
        generatedBy: approvedBy,
        restaurantName: existing.receipt?.restaurantName ?? "",
        branchName: existing.receipt?.branchName ?? "",
        subtotal: returnedTotal,
        vat: 0,
        vatRate: 0,
        serviceChargeEnabled: false,
        serviceCharge: 0,
        discount: 0,
        grandTotal: returnedTotal,
        paymentStatus: wasPaid ? "Refunded" : existing.paymentStatus,
        orderStatusAtGeneration: "RETURNED",
        printCount: 0,
      };
      const stored = buildStoredReceiptFromOrder(
        {
          ...existing,
          items: returnedItems,
          status: "RETURNED",
          paymentStatus: wasPaid ? "Refunded" : existing.paymentStatus,
          returnedAt,
          returnedBy: approvedBy,
          total: returnedTotal,
          receipt: returnReceipt,
        },
        returnReceipt,
      );
      stored.returnReason = returnNote;
      upsertStoredReceiptRecord(stored);

      emitOrdersSocketEvent({
        type: "order:returned",
        orderId: existing.id,
        orderNo: existing.orderNo,
        actor: approvedBy,
        message: `Partial return on ${existing.orderNo}: ${itemSummary}`,
        meta: { reason, stockOutcome, partial: true, returnLines: selections.map(({ index, qty }) => ({ index, qty })) },
      });

      return { ok: true };
    }

    const nextPaymentStatus: Order["paymentStatus"] = wasPaid ? "Refunded" : existing.paymentStatus;
    const stationTickets = existing.stationTickets.map((ticket) =>
      ticket.status === "CANCELLED" || ticket.status === "UNAVAILABLE"
        ? ticket
        : { ...ticket, status: "CANCELLED" as const },
    );
    const nextReceipt = existing.receipt
      ? { ...existing.receipt, paymentStatus: nextPaymentStatus }
      : existing.receipt;

    setOrders((prev) =>
      prev.map((order) =>
        order.id === id &&
        order.status !== "PENDING_CASHIER" &&
        order.status !== "CANCELLED" &&
        order.status !== "RETURNED" &&
        (options?.direct || order.returnRequestedBy)
          ? {
              ...order,
              status: "RETURNED",
              paymentStatus: nextPaymentStatus,
              returnedAt,
              returnedBy: approvedBy,
              returnReason: returnNote,
              returnRequestedBy: undefined,
              returnRequestedAt: undefined,
              returnRequestedLines: undefined,
              stockExceptionOutcome: stockOutcome,
              cancelReason: returnNote,
              lockedForEditing: true,
              stationTickets,
              receipt: nextReceipt,
            }
          : order,
      ),
    );

    {
      const returnReceipt: OrderReceipt = nextReceipt ?? {
        receiptNumber: `RET-${existing.orderNo}-${Date.now()}`,
        generatedAt: returnedAt,
        generatedBy: approvedBy,
        restaurantName: "",
        branchName: "",
        subtotal: existing.total ?? 0,
        vat: 0,
        vatRate: 0,
        serviceChargeEnabled: false,
        serviceCharge: 0,
        discount: 0,
        grandTotal: existing.total ?? 0,
        paymentStatus: nextPaymentStatus,
        orderStatusAtGeneration: "RETURNED",
        printCount: 0,
      };
      const stored = buildStoredReceiptFromOrder({
        ...existing,
        status: "RETURNED",
        paymentStatus: nextPaymentStatus,
        returnedAt,
        returnedBy: approvedBy,
        receipt: returnReceipt,
      }, returnReceipt);
      stored.returnReason = returnNote;
      upsertStoredReceiptRecord(stored);
    }

    setPayments((prev) =>
      prev.map((payment) =>
        payment.orderId === existing.id || payment.receiptNumber === existing.receiptNumber
          ? { ...payment, status: "Void" }
          : payment,
      ),
    );

    const tableObj = findTableBySeat(tables, existing.area, existing.tableNumber);
    if (tableObj) releaseTable(tableObj.id);

    emitOrdersSocketEvent({
      type: "order:returned",
      orderId: existing.id,
      orderNo: existing.orderNo,
      actor: approvedBy,
      message: `Returned ${existing.orderNo}`,
      meta: { reason, stockOutcome },
    });

    return { ok: true };
  }

  function rejectReturnOrder(id: string) {
    setOrders((prev) =>
      prev.map((order) =>
        order.id === id && order.returnRequestedBy
          ? {
              ...order,
              returnRequestedBy: undefined,
              returnRequestedAt: undefined,
              returnReason: undefined,
              returnRequestedLines: undefined,
            }
          : order,
      ),
    );
  }

  function updateOrderPriority(id: string, priority: OrderPriority) {
    setOrders((prev) => prev.map((order) => (order.id === id ? { ...order, priority } : order)));
  }

  function updateOrderWaiter(id: string, waiter: string) {
    const next = waiter.trim();
    if (!next) return;
    setOrders((prev) =>
      prev.map((order) =>
        order.id === id ? { ...order, waiter: next, orderedByWaiter: order.orderedByWaiter || next, server: next } : order,
      ),
    );
  }

  function transferWaiterBills(
    fromWaiter: string,
    toWaiter: string,
    actor: string,
    orderIds?: string[],
  ) {
    const result = transferOpenBillsToWaiter(orders, fromWaiter, toWaiter, actor, { orderIds });
    if (!result.ok) {
      return { ok: false, error: result.error, transferred: 0 };
    }
    const transferredOrders = result.nextOrders.filter((order) => result.orderIds.includes(order.id));
    const nextWaiter = toWaiter.trim();
    setOrders(() => result.nextOrders);
    setTables((prev) =>
      prev.map((table) => {
        const match = transferredOrders.find(
          (order) => order.tableNumber === table.label && order.area === table.area,
        );
        return match ? { ...table, server: nextWaiter } : table;
      }),
    );
    emitOrdersSocketEvent({
      type: "order:transferred",
      actor,
      message: `${fromWaiter.trim()} handed ${result.orderIds.length} open bill${result.orderIds.length === 1 ? "" : "s"} to ${nextWaiter}`,
      meta: { fromWaiter: fromWaiter.trim(), toWaiter: nextWaiter, orderIds: result.orderIds },
    });
    return { ok: true, transferred: result.orderIds.length };
  }

  function requestWaiterBillTransfer(
    fromWaiter: string,
    toWaiter: string,
    actor: string,
    orderIds?: string[],
  ) {
    const result = requestOpenBillsTransfer(orders, fromWaiter, toWaiter, actor, { orderIds });
    if (!result.ok) {
      return { ok: false, error: result.error, requested: 0 };
    }
    setOrders(() => result.nextOrders);
    emitOrdersSocketEvent({
      type: "order:transfer-requested",
      actor,
      message: `${actor.trim() || fromWaiter.trim()} requested transfer of ${result.orderIds.length} open bill${result.orderIds.length === 1 ? "" : "s"} from ${fromWaiter.trim()} to ${toWaiter.trim()}`,
      meta: {
        fromWaiter: fromWaiter.trim(),
        toWaiter: toWaiter.trim(),
        orderIds: result.orderIds,
      },
    });
    return { ok: true, requested: result.orderIds.length };
  }

  function approveWaiterBillTransfer(
    fromWaiter: string,
    toWaiter: string,
    actor: string,
    orderIds?: string[],
  ) {
    const result = transferOpenBillsToWaiter(orders, fromWaiter, toWaiter, actor, {
      requirePending: true,
      orderIds,
    });
    if (!result.ok) {
      return { ok: false, error: result.error, transferred: 0 };
    }
    const transferredOrders = result.nextOrders.filter((order) => result.orderIds.includes(order.id));
    const nextWaiter = toWaiter.trim();
    setOrders(() => result.nextOrders);
    setTables((prev) =>
      prev.map((table) => {
        const match = transferredOrders.find(
          (order) => order.tableNumber === table.label && order.area === table.area,
        );
        return match ? { ...table, server: nextWaiter } : table;
      }),
    );
    emitOrdersSocketEvent({
      type: "order:transferred",
      actor,
      message: `${actor.trim()} approved transfer of ${result.orderIds.length} open bill${result.orderIds.length === 1 ? "" : "s"} from ${fromWaiter.trim()} to ${nextWaiter}`,
      meta: { fromWaiter: fromWaiter.trim(), toWaiter: nextWaiter, orderIds: result.orderIds },
    });
    return { ok: true, transferred: result.orderIds.length };
  }

  function rejectWaiterBillTransfer(orderIds?: string[]) {
    const result = rejectOpenBillsTransferRequest(orders, orderIds);
    if (!result.ok) {
      return { ok: false, error: result.error, rejected: 0 };
    }
    setOrders(() => result.nextOrders);
    emitOrdersSocketEvent({
      type: "order:transfer-rejected",
      actor: "system",
      message: `Rejected ${result.rejected} pending bill transfer${result.rejected === 1 ? "" : "s"}`,
      meta: { orderIds: orderIds ?? result.nextOrders.filter((o) => !o.waiterTransferRequestedTo).map((o) => o.id) },
    });
    return { ok: true, rejected: result.rejected };
  }

  function transferOrderTable(
    orderId: string,
    input: { tableNumber: string; area: SeatingArea; actor: string },
  ) {
    const order = orders.find((item) => item.id === orderId);
    if (!order || isFinalOrderStatus(order.status)) {
      return { ok: false, error: "Order is not available to transfer." };
    }
    const targetLabel = input.tableNumber.trim();
    if (!targetLabel) return { ok: false, error: "Target table is required." };
    if (targetLabel === order.tableNumber && input.area === order.area) {
      return { ok: false, error: "Order is already on that table." };
    }
    const occupied = orders.some(
      (item) =>
        item.id !== orderId &&
        !isFinalOrderStatus(item.status) &&
        item.tableNumber === targetLabel,
    );
    if (occupied) return { ok: false, error: "Target table already has an active order." };

    const previousTable = findTableBySeat(tables, order.area, order.tableNumber);

    setOrders((prev) =>
      prev.map((item) =>
        item.id === orderId
          ? {
              ...item,
              area: input.area,
              tableNumber: targetLabel,
              ref: `${input.area} ${targetLabel}`,
            }
          : item,
      ),
    );

    if (previousTable) releaseTable(previousTable.id);
    ensureTableForSeat(input.area, targetLabel, {
      status: "Occupied",
      server: order.waiter,
      guests: order.guests,
      total: order.total,
    });

    emitOrdersSocketEvent({
      type: "order:transferred",
      orderId,
      orderNo: order.orderNo,
      actor: input.actor,
      message: `Transferred ${order.orderNo} to ${input.area} ${targetLabel}`,
      meta: { from: order.tableNumber, to: targetLabel },
    });
    return { ok: true };
  }

  function mergeOrders(primaryOrderId: string, secondaryOrderId: string, actor: string) {
    if (primaryOrderId === secondaryOrderId) {
      return { ok: false, error: "Select two different orders to merge." };
    }
    const primary = orders.find((item) => item.id === primaryOrderId);
    const secondary = orders.find((item) => item.id === secondaryOrderId);
    if (!primary || !secondary) return { ok: false, error: "One or both orders were not found." };
    if (isFinalOrderStatus(primary.status) || isFinalOrderStatus(secondary.status)) {
      return { ok: false, error: "Cannot merge closed, cancelled, or returned orders." };
    }
    if (primary.receipt || secondary.receipt) {
      return { ok: false, error: "Cannot merge orders after a receipt was generated." };
    }

    const mergedItems = [...primary.items, ...secondary.items];
    const sentAt = formatDateTime();
    const stationTickets = buildStationTickets(primary.id, mergedItems, sentAt, menuStations);
    const total = mergedItems.reduce((sum, line) => sum + (line.unitPrice ?? 0) * line.qty, 0);
    const merged: Order = {
      ...primary,
      items: mergedItems,
      stationTickets,
      status: deriveOrderStatus(stationTickets),
      total,
      customerName: primary.customerName || secondary.customerName,
      guests: ((primary.guests ?? 0) + (secondary.guests ?? 0)) || primary.guests,
    };

    setOrders((prev) => {
      const without = prev.filter((item) => item.id !== primaryOrderId && item.id !== secondaryOrderId);
      return [
        merged,
        {
          ...secondary,
          status: "CANCELLED",
          cancelledAt: formatDateTime(),
          cancelledBy: actor,
          cancelReason: `Merged into ${primary.orderNo}`,
          lockedForEditing: true,
          paymentStatus: "Unpaid",
        },
        ...without,
      ];
    });

    const secondaryTable = findTableBySeat(tables, secondary.area, secondary.tableNumber);
    if (
      secondaryTable &&
      (secondary.tableNumber !== primary.tableNumber || secondary.area !== primary.area)
    ) {
      releaseTable(secondaryTable.id);
    }

    emitOrdersSocketEvent({
      type: "order:merged",
      orderId: primary.id,
      orderNo: primary.orderNo,
      actor,
      message: `Merged ${secondary.orderNo} into ${primary.orderNo}`,
      meta: { secondaryOrderId },
    });
    return { ok: true, order: merged };
  }

  function splitOrderBill(
    orderId: string,
    lineIndexes: number[],
    actor: string,
    options?: { tableNumber?: string; area?: SeatingArea },
  ) {
    const order = orders.find((item) => item.id === orderId);
    if (!order || isFinalOrderStatus(order.status)) {
      return { ok: false, error: "Order is not available to split." };
    }
    if (order.receipt) return { ok: false, error: "Cannot split after receipt generation." };
    const uniqueIndexes = Array.from(new Set(lineIndexes)).filter(
      (index) => index >= 0 && index < order.items.length,
    );
    if (uniqueIndexes.length === 0) return { ok: false, error: "Select at least one item to split." };
    if (uniqueIndexes.length >= order.items.length) {
      return { ok: false, error: "Keep at least one item on the original order." };
    }

    const moveSet = new Set(uniqueIndexes);
    const remaining = order.items.filter((_, index) => !moveSet.has(index));
    const moving = order.items.filter((_, index) => moveSet.has(index));
    const sentAt = formatDateTime();
    const newId = `ord${Date.now()}`;
    const tableNumber = options?.tableNumber?.trim() || order.tableNumber;
    const area = options?.area ?? order.area;
    const stationTickets = buildStationTickets(newId, moving, sentAt, menuStations);
    const newOrder: Order = {
      ...order,
      id: newId,
      orderNo: `ORD-${String(1000 + orders.length + 1).padStart(4, "0")}`,
      items: moving,
      stationTickets,
      status: deriveOrderStatus(stationTickets),
      total: moving.reduce((sum, line) => sum + (line.unitPrice ?? 0) * line.qty, 0),
      tableNumber,
      area,
      ref: `${area} ${tableNumber}`,
      receipt: undefined,
      receiptNumber: undefined,
      receiptGeneratedAt: undefined,
      receiptGeneratedBy: undefined,
      payment: undefined,
      lockedForEditing: false,
      paymentStatus: "Unpaid",
      createdAtIso: new Date().toISOString(),
      stockReservedAt: undefined,
      stockDeductedAt: undefined,
      voidRequestedBy: undefined,
      voidReason: undefined,
    };

    const remainingTickets = buildStationTickets(order.id, remaining, order.stationSentAt ?? sentAt, menuStations);
    const remainingTotal = remaining.reduce((sum, line) => sum + (line.unitPrice ?? 0) * line.qty, 0);

    setOrders((prev) => [
      newOrder,
      ...prev.map((item) =>
        item.id === orderId
          ? {
              ...item,
              items: remaining,
              stationTickets: remainingTickets,
              status: deriveOrderStatus(remainingTickets),
              total: remainingTotal,
            }
          : item,
      ),
    ]);

    emitOrdersSocketEvent({
      type: "order:split",
      orderId: order.id,
      orderNo: order.orderNo,
      actor,
      message: `Split ${moving.length} item(s) from ${order.orderNo} â†’ ${newOrder.orderNo}`,
      meta: { newOrderId: newOrder.id },
    });
    return { ok: true, newOrder };
  }

  function bulkCancelOrders(orderIds: string[], actor: string, reason?: string) {
    const failed: Array<{ id: string; error: string }> = [];
    let cancelled = 0;
    for (const id of orderIds) {
      const result = cancelOrder(id, actor, reason ?? "Bulk cancel", {
        managerApproved: true,
        forceWastage: true,
      });
      if (result.ok) {
        cancelled += 1;
        const order = orders.find((item) => item.id === id);
        emitOrdersSocketEvent({
          type: "order:cancelled",
          orderId: id,
          orderNo: order?.orderNo,
          actor,
          message: `Cancelled ${order?.orderNo ?? id}`,
        });
      } else {
        failed.push({ id, error: result.error ?? "Cancel failed" });
      }
    }
    return { cancelled, failed };
  }

  function bulkCloseOrders(orderIds: string[], actor: string) {
    const failed: Array<{ id: string; error: string }> = [];
    let closed = 0;
    const closedAt = formatDateTime();
    const posSettings = readPosInventorySettings();
    const stockItems = getModuleRecordsSnapshot<StockManagedItem>(STOCK_MODULE_KEYS.items, STOCK_ITEMS_FALLBACK);
    const stockRecipes = getModuleRecordsSnapshot<StockRecipe>(STOCK_MODULE_KEYS.recipes, STOCK_RECIPES_FALLBACK);
    let stockLedger = getModuleRecordsSnapshot<StockLedgerEntry>(STOCK_MODULE_KEYS.ledger, STOCK_LEDGER_FALLBACK);
    let stockReservations = getModuleRecordsSnapshot<PosStockReservation>(STOCK_MODULE_KEYS.posReservations, STOCK_POS_RESERVATIONS_SEED);
    let stockLots = readPosStockLotsSnapshot();

    for (const id of orderIds) {
      const order = orders.find((item) => item.id === id);
      if (!order) {
        failed.push({ id, error: "Not found" });
        continue;
      }
      if (order.status === "CLOSED") {
        closed += 1;
        continue;
      }
      if (isFinalOrderStatus(order.status)) {
        failed.push({ id, error: `Cannot close ${order.status}` });
        continue;
      }
      if (order.paymentStatus !== "Paid" && !order.payment) {
        failed.push({ id, error: "Payment required before close" });
        continue;
      }

      const deduction = isPosMenuStockDisconnected()
        ? {
            order,
            skippedItems: [] as string[],
            ledger: stockLedger,
            reservations: stockReservations,
            lots: stockLots,
          }
        : ensurePosStockDeductedWithFallback({
        order,
        enteredBy: actor,
        posDeductionTiming: posSettings.posDeductionTiming,
        events: ["order_closed"],
        items: stockItems,
        recipes: stockRecipes,
        ledger: stockLedger,
        reservations: stockReservations,
        lots: stockLots,
      });
      if (deduction.ledger !== stockLedger) {
        syncPosLedger(deduction.ledger, canSyncBackend(), reportBackendError);
        stockLedger = deduction.ledger;
      }
      if (deduction.lots !== stockLots) {
        syncPosLots(deduction.lots, canSyncBackend(), reportBackendError);
        stockLots = deduction.lots;
      }
      if (deduction.reservations !== stockReservations) {
        syncPosReservations(deduction.reservations, canSyncBackend(), reportBackendError);
        stockReservations = deduction.reservations;
      }

      setOrders((prev) =>
        prev.map((item) =>
          item.id === id
            ? {
                ...deduction.order,
                status: "CLOSED",
                paymentStatus: "Paid",
                lockedForEditing: true,
                closedByCashier: actor,
                paymentReceivedAt: item.paymentReceivedAt ?? closedAt,
              }
            : item,
        ),
      );
      const otherOpen = orders.some(
        (row) =>
          row.id !== id &&
          row.area === order.area &&
          row.tableNumber === order.tableNumber &&
          stillOccupiesTable(row) &&
          !isOrderCompleted(row),
      );
      const tableObj = findTableBySeat(tables, order.area, order.tableNumber);
      if (tableObj && !otherOpen && !order.tableClearedAt) {
        ensureTableForSeat(order.area, order.tableNumber, {
          status: "Bill",
          server: tableObj.server || order.waiter,
          total: order.total,
        });
      }
      closed += 1;
      emitOrdersSocketEvent({
        type: "order:closed",
        orderId: id,
        orderNo: order.orderNo,
        actor,
        message: `Closed ${order.orderNo}`,
      });
    }
    return { closed, failed };
  }

  function recordBonoPrint(orderId: string, actor: string, ticketIds?: string[]) {
    const existing = orders.find((order) => order.id === orderId);
    if (!existing) return null;
    const markAllNew = !ticketIds || ticketIds.length === 0;
    const idSet = ticketIds ? new Set(ticketIds) : null;
    const nextOrder: Order = {
      ...existing,
      bonoPrintCount: (existing.bonoPrintCount ?? 0) + 1,
      bonoLastPrintedAt: new Date().toISOString(),
      bonoLastPrintedBy: actor.trim() || existing.bonoLastPrintedBy,
      stationTickets: existing.stationTickets.map((ticket) => {
        if (ticket.bonoPrinted) return ticket;
        if (markAllNew) {
          if (ticket.status !== "NEW") return ticket;
          return { ...ticket, bonoPrinted: true };
        }
        if (!idSet?.has(ticket.id)) return ticket;
        return { ...ticket, bonoPrinted: true };
      }),
    };
    rememberPendingOrderWrite(nextOrder);
    setOrders((prev) => prev.map((order) => (order.id === orderId ? nextOrder : order)));
    return nextOrder;
  }

  async function reprintKitchenTickets(orderIds: string[], actor: string) {
    const persist = await ensureOrdersPersisted(orderIds, { waitForRemoteMs: 900 });
    if (!persist.ok) {
      showError(
        persist.error ||
          "Order is not saved yet. Bono cannot print until the bill is created.",
      );
      return 0;
    }
    const targets = persist.orders.filter(
      (order) => order.stationTickets.length > 0 || order.items.length > 0,
    );
    let printed = 0;
    for (const order of targets) {
      const jobs = bonoTicketsToPrint(order, { reprint: true });
      if (jobs.length === 0) continue;
      const result = printKitchenTickets([order], { menuItems, reprint: true });
      if (!result.ok) {
        showError(result.error ?? "Station Bono could not be printed.");
        continue;
      }
      recordBonoPrint(
        order.id,
        actor,
        jobs.map((job) => job.ticketId).filter((id): id is string => Boolean(id)),
      );
      printed += 1;
      emitOrdersSocketEvent({
        type: "kitchen:reprint",
        orderId: order.id,
        orderNo: order.orderNo,
        actor,
        message: `Bono printed for ${order.orderNo}`,
      });
    }
    return printed;
  }

  function advanceManualDeliveryTickets(
    orderId: string,
    status: Extract<StationTicketStatus, "PREPARING" | "READY">,
    ticketId?: string,
  ) {
    const order = orders.find((item) => item.id === orderId);
    if (!order || isFinalOrderStatus(order.status)) return 0;
    const targets = order.stationTickets.filter((ticket) => {
      if (!isManualDeliveryStation(ticket.station)) return false;
      if (ticketId && ticket.id !== ticketId) return false;
      if (status === "PREPARING") return ticket.status === "NEW";
      return ticket.status === "NEW" || ticket.status === "PREPARING";
    });
    for (const ticket of targets) {
      updateStationTicket(orderId, ticket.id, status);
    }
    return targets.length;
  }

  function ensureTableForSeat(
    area: string,
    tableNumber: string,
    patch?: Partial<Pick<Table, "status" | "server" | "guests" | "openMin" | "total">>,
  ) {
    const label = tableNumber.trim();
    const seatArea = area.trim() || "Main Hall";
    if (!label) return;

    const current = latestStateRef.current.tables;
    const existing = findTableBySeat(current, seatArea, label);
    const nextTable: Table = existing
      ? {
          ...existing,
          area: seatArea,
          ...patch,
          // Keep an existing waiter lock; only set server when the seat was unassigned.
          server: existing.server?.trim() ? existing.server : patch?.server,
        }
      : {
          id: `tbl-${Date.now()}`,
          label,
          area: seatArea,
          seats: 4,
          status: patch?.status ?? "Occupied",
          server: patch?.server,
          guests: patch?.guests,
          openMin: patch?.openMin,
          total: patch?.total,
        };

    rememberPendingTableWrite(nextTable);
    setTableState((prev) => {
      const found = findTableBySeat(prev, seatArea, label);
      const next = found
        ? prev.map((table) => (table.id === found.id ? nextTable : table))
        : [nextTable, ...prev];
      latestStateRef.current = { ...latestStateRef.current, tables: next };
      saveStoredTables(next);
      return next;
    });
    addTableArea(seatArea);
    if (isSupabaseConfigured) {
      void persistTablesReliable([nextTable]);
    }
  }

  function updateTable(table: Table) {
    const normalized = {
      ...table,
      label: table.label.trim(),
      area: table.area.trim() || "Main Hall",
      seats: Math.max(1, Number(table.seats) || 1),
      status: table.status || "Available",
    };
    if (!normalized.label) return;
    const duplicate = latestStateRef.current.tables.some(
      (existing) =>
        existing.id !== normalized.id &&
        existing.area.trim().toLowerCase() === normalized.area.toLowerCase() &&
        existing.label.trim().toLowerCase() === normalized.label.toLowerCase(),
    );
    if (duplicate) {
      if (typeof window !== "undefined") {
        showError(`Table "${normalized.label}" already exists in ${normalized.area}.`);
      }
      return;
    }

    const previous = latestStateRef.current.tables.find((row) => row.id === normalized.id);
    const prevServer = previous?.server?.trim() || "";
    const nextServer = normalized.server?.trim() || "";
    const seatHasActiveBill = latestStateRef.current.orders.some(
      (order) =>
        hasLiveBillBlockingSeat(order) &&
        order.area.trim().toLowerCase() === normalized.area.toLowerCase() &&
        order.tableNumber.trim().toLowerCase() === normalized.label.toLowerCase(),
    );
    if (prevServer && nextServer && !assignedWaiterMatches(prevServer, nextServer) && seatHasActiveBill) {
      if (typeof window !== "undefined") {
        showError(
          `Table ${normalized.area} ${normalized.label} has an open order for ${prevServer}. Clear the table before assigning another waiter.`,
        );
      }
      return;
    }
    if (
      (Boolean(prevServer) || Boolean(nextServer)) &&
      !(prevServer && nextServer && assignedWaiterMatches(prevServer, nextServer)) &&
      prevServer !== nextServer
    ) {
      const hasOpenOrder = latestStateRef.current.orders.some(
        (order) =>
          stillOccupiesTable(order) &&
          order.area.trim().toLowerCase() === normalized.area.toLowerCase() &&
          order.tableNumber.trim().toLowerCase() === normalized.label.toLowerCase(),
      );
      if (hasOpenOrder) {
        if (typeof window !== "undefined") {
          showError(
            `Clear open orders on ${normalized.area} ${normalized.label} before changing waiter assignment.`,
          );
        }
        return;
      }
    }

    rememberPendingTableWrite(normalized);
    setDeletedTableIds((prev) => {
      if (!prev.includes(normalized.id)) return prev;
      const next = prev.filter((id) => id !== normalized.id);
      writeStoredTextValues(DELETED_TABLES_STORAGE_KEY, next);
      return next;
    });
    setTableState((prev) => {
      const next = prev.map((t) => (t.id === normalized.id ? normalized : t));
      latestStateRef.current = { ...latestStateRef.current, tables: next };
      saveStoredTables(next);
      return next;
    });
    addTableArea(normalized.area);
    if (isSupabaseConfigured) {
      void persistTablesReliable([normalized]).then((result) => {
        if (!result.ok && typeof window !== "undefined") {
          showError(
            `Table could not be saved to the database.\n\n${result.error ?? "Unknown error"}`,
          );
        }
      });
    }
  }

  function assignTablesToWaiter(
    waiterName: string | undefined,
    tableIds: string[],
    clearOthers: boolean,
  ): { ok: true; changed: number } | { ok: false; error: string } {
    const assignedName = waiterName?.trim() || undefined;
    const selected = new Set(tableIds);
    const currentTables = latestStateRef.current.tables;
    const currentOrders = latestStateRef.current.orders;

    const tableHasOpenOrder = (table: Table) =>
      currentOrders.some(
        (order) =>
          hasLiveBillBlockingSeat(order) &&
          order.area.trim().toLowerCase() === table.area.trim().toLowerCase() &&
          order.tableNumber.trim().toLowerCase() === table.label.trim().toLowerCase(),
      );

    for (const id of selected) {
      const table = currentTables.find((row) => row.id === id);
      if (!table) continue;
      const owner = table.server?.trim() || "";
      const nextOwner = assignedName ?? "";
      // Empty seats (no active bill) can be reassigned freely — no "remove waiter first" gate.
      if (owner && nextOwner && !assignedWaiterMatches(owner, nextOwner) && tableHasOpenOrder(table)) {
        return {
          ok: false,
          error: `${table.area} ${table.label} has an open order for ${owner}. Clear the table before assigning another waiter.`,
        };
      }
      if (!assignedWaiterMatches(owner || null, nextOwner || null) && owner !== nextOwner && tableHasOpenOrder(table)) {
        return {
          ok: false,
          error: `Clear open orders on ${table.area} ${table.label} before changing waiter assignment.`,
        };
      }
    }

    if (clearOthers && assignedName) {
      for (const table of currentTables) {
        if (selected.has(table.id)) continue;
        if (!assignedWaiterMatches(table.server, assignedName)) continue;
        if (tableHasOpenOrder(table)) {
          return {
            ok: false,
            error: `Cannot unassign ${table.area} ${table.label} from ${assignedName} while an order is open. Clear the table first, or keep that table selected.`,
          };
        }
      }
    }

    const nextTables = currentTables.map((table) => {
      if (selected.has(table.id)) {
        return { ...table, server: assignedName };
      }
      if (clearOthers && assignedName && assignedWaiterMatches(table.server, assignedName)) {
        return { ...table, server: undefined };
      }
      return table;
    });
    const changedTables = nextTables.filter((table) => {
      const before = currentTables.find((row) => row.id === table.id);
      return !before || before.server !== table.server;
    });
    for (const table of changedTables) {
      rememberPendingTableWrite(table);
    }
    setTableState(() => {
      latestStateRef.current = { ...latestStateRef.current, tables: nextTables };
      saveStoredTables(nextTables);
      return nextTables;
    });
    if (isSupabaseConfigured && changedTables.length > 0) {
      void persistTablesReliable(changedTables).then((result) => {
        if (!result.ok && typeof window !== "undefined") {
          showError(
            `Table assignment could not be saved to the database.\n\n${result.error ?? "Unknown error"}`,
          );
        }
      });
    }
    return { ok: true, changed: changedTables.length };
  }

  function addTable(table: Table) {
    const normalized = {
      ...table,
      label: table.label.trim(),
      area: table.area.trim() || "Main Hall",
      seats: Math.max(1, Number(table.seats) || 1),
      status: table.status || "Available",
    };
    if (!normalized.label) return;
    const duplicate = latestStateRef.current.tables.some(
      (existing) =>
        existing.id !== normalized.id &&
        existing.area.trim().toLowerCase() === normalized.area.toLowerCase() &&
        existing.label.trim().toLowerCase() === normalized.label.toLowerCase(),
    );
    if (duplicate) {
      if (typeof window !== "undefined") {
        showError(`Table "${normalized.label}" already exists in ${normalized.area}.`);
      }
      return;
    }
    setDeletedTableIds((prev) => {
      if (!prev.includes(normalized.id)) return prev;
      const next = prev.filter((id) => id !== normalized.id);
      writeStoredTextValues(DELETED_TABLES_STORAGE_KEY, next);
      return next;
    });
    setTables((prev) => [normalized, ...prev.filter((row) => row.id !== normalized.id)]);
    addTableArea(normalized.area);
    // setTables already queues persistTablesReliable for the changed seat.
  }

  function addTableArea(area: string) {
    const value = area.trim();
    if (!value) return;
    if (tableAreas.some((existing) => existing.toLowerCase() === value.toLowerCase())) return;
    setCustomTableAreas((prev) => persistTableAreas([...prev, value]));
  }

  function renameTableArea(from: string, to: string) {
    const next = to.trim();
    if (!from.trim() || !next) return;
    if (
      from.toLowerCase() !== next.toLowerCase() &&
      tableAreas.some((existing) => existing.toLowerCase() === next.toLowerCase())
    )
      return;
    setTables((prev) =>
      prev.map((table) => (table.area === from ? { ...table, area: next } : table)),
    );
    setCustomTableAreas((prev) => {
      const filtered = prev.filter((area) => area.toLowerCase() !== from.toLowerCase());
      const areas = filtered.some((area) => area.toLowerCase() === next.toLowerCase())
        ? filtered
        : [...filtered, next];
      return persistTableAreas(areas);
    });
  }

  function removeTableArea(area: string) {
    const value = area.trim();
    if (!value) return;
    const removedIds = tables
      .filter((table) => table.area === value)
      .map((table) => table.id);
    if (removedIds.length > 0) {
      const nextDeleted = uniqueTextValues([...deletedTableIds, ...removedIds]);
      setDeletedTableIds(nextDeleted);
      writeStoredTextValues(DELETED_TABLES_STORAGE_KEY, nextDeleted);
      if (isSupabaseConfigured) {
        for (const id of removedIds) {
          void deleteBackendTable(id).catch((error) => reportBackendError("table delete", error));
        }
      }
    }
    setTables((prev) => prev.filter((table) => table.area !== value));
    setCustomTableAreas((prev) =>
      persistTableAreas(prev.filter((item) => item.toLowerCase() !== value.toLowerCase())),
    );
  }

  function removeTable(id: string) {
    const nextDeleted = uniqueTextValues([...deletedTableIds, id]);
    setDeletedTableIds(nextDeleted);
    writeStoredTextValues(DELETED_TABLES_STORAGE_KEY, nextDeleted);
    const remaining = latestStateRef.current.tables.filter((table) => table.id !== id);
    latestStateRef.current = { ...latestStateRef.current, tables: remaining };
    setTables(remaining);
    if (isSupabaseConfigured) {
      void (async () => {
        try {
          await deleteBackendTable(id);
          // Keep other browsers from resurrecting this row from stale local caches.
          await syncBackendTables(remaining);
        } catch (error) {
          reportBackendError("table delete", error);
          const message = error instanceof Error ? error.message : String(error);
          if (typeof window !== "undefined") {
            showError(`Table could not be deleted from the database.\n\n${message}`);
          }
        }
      })();
    }
  }

  function releaseTable(id: string) {
    setTables((prev) =>
      prev.map((t) =>
        t.id === id
          ? {
              ...t,
              status: "Cleaning",
              guests: undefined,
              // Keep assigned waiter so they can close/clear the table.
              openMin: undefined,
              total: undefined,
            }
          : t,
      ),
    );
  }

  function clearCompletedTable(tableId: string, clearedBy?: string) {
    const currentTables = latestStateRef.current.tables;
    const currentOrders = latestStateRef.current.orders;
    const stored = currentTables.find((row) => row.id === tableId);
    const virtualOrder = stored
      ? undefined
      : currentOrders.find((order) => `order-${order.id}` === tableId);
    const area = stored?.area ?? virtualOrder?.area;
    const label = stored?.label ?? virtualOrder?.tableNumber;
    if (!area || !label) return { ok: false as const, error: "Table not found." };

    const seatArea = area.trim().toLowerCase();
    const seatLabel = label.trim().toLowerCase();
    const occupying = currentOrders.filter(
      (order) =>
        stillOccupiesTable(order) &&
        order.area.trim().toLowerCase() === seatArea &&
        order.tableNumber.trim().toLowerCase() === seatLabel,
    );
    const stamp = new Date().toISOString();
    const actor = clearedBy?.trim();
    if (occupying.length > 0) {
      const occupyingIds = new Set(occupying.map((order) => order.id));
      setOrders((prev) =>
        prev.map((order) =>
          occupyingIds.has(order.id)
            ? {
                ...order,
                tableClearedAt: stamp,
                tableClearedBy: actor || order.tableClearedBy,
              }
            : order,
        ),
      );
    }
    if (stored) {
      const clearedTable: Table = {
        ...stored,
        status: "Available",
        guests: undefined,
        openMin: undefined,
        total: undefined,
        // Keep waiter assignment so they can open the next bill on this seat.
        server: stored.server,
      };
      rememberPendingTableWrite(clearedTable);
      setTableState((prev) => {
        const next = prev.map((row) => (row.id === clearedTable.id ? clearedTable : row));
        latestStateRef.current = { ...latestStateRef.current, tables: next };
        saveStoredTables(next);
        return next;
      });
      if (isSupabaseConfigured) {
        void persistTablesReliable([clearedTable]).then((result) => {
          if (!result.ok && typeof window !== "undefined") {
            showError(
              `Table clear could not be saved to the database.\n\n${result.error ?? "Unknown error"}`,
            );
          }
        });
      }
    }
    return { ok: true as const, released: occupying.length };
  }

  function adjustStock(sku: string, onHand: number) {
    setStock((prev) =>
      prev.map((s) => (s.sku === sku ? { ...s, onHand: Math.max(0, onHand) } : s)),
    );
  }

  function creditLoyalty(phone: string, amountPaid: number) {
    const pts = earnPoints(amountPaid);
    setCustomers((prev) =>
      prev.map((c) => {
        if (c.phone !== phone) return c;
        const newPoints = c.points + pts;
        return {
          ...c,
          points: newPoints,
          spent: c.spent + amountPaid,
          visits: c.visits + 1,
          lastVisit: "Today",
          tier: computeTier(newPoints),
        };
      }),
    );
  }

  function addPayment(payment: Payment) {
    setPayments((prev) => [payment, ...prev]);
  }

  function addExpenseRecord(record: ExpenseRecord) {
    setExpenseRecords((prev) => [record, ...prev]);
  }

  function addSupplier(supplier: Supplier) {
    setSuppliers((prev) => [supplier, ...prev]);
  }

  function updateSupplier(supplier: Supplier) {
    setSuppliers((prev) => prev.map((item) => (item.id === supplier.id ? supplier : item)));
  }

  function removeSupplier(id: string) {
    setSuppliers((prev) => prev.filter((item) => item.id !== id));
    if (isSupabaseConfigured) {
      void deleteBackendSupplier(id).catch((error) =>
        reportBackendError("supplier delete", error),
      );
    }
  }

  function addPurchaseOrder(order: PurchaseOrder) {
    setPurchaseOrders((prev) => [order, ...prev]);
  }

  function updatePurchaseOrder(order: PurchaseOrder) {
    setPurchaseOrders((prev) => prev.map((item) => (item.id === order.id ? order : item)));
  }

  function addReservation(reservation: Reservation) {
    setReservations((prev) => [reservation, ...prev]);
  }

  function updateReservation(reservation: Reservation) {
    setReservations((prev) =>
      prev.map((item) => (item.id === reservation.id ? reservation : item)),
    );
  }

  function removeReservation(id: string) {
    setReservations((prev) => prev.filter((item) => item.id !== id));
    if (canSyncBackend()) {
      void deleteBackendReservation(id).catch((error) =>
        reportBackendError("reservation delete", error),
      );
    }
  }

  function upsertGuestOrderRequest(request: GuestOrderRequest) {
    setGuestOrderRequests((prev) =>
      prev.some((item) => item.id === request.id)
        ? prev.map((item) => (item.id === request.id ? request : item))
        : [request, ...prev],
    );
  }

  function updateGuestOrderRequestStatus(id: string, status: GuestOrderRequest["status"]) {
    setGuestOrderRequests((prev) =>
      prev.map((item) => (item.id === id ? { ...item, status } : item)),
    );
  }

  function confirmReservation(id: string) {
    const res = reservations.find((r) => r.id === id);
    if (!res) return;
    setReservations((prev) => prev.map((r) => (r.id === id ? { ...r, status: "Confirmed" } : r)));
    setTables((prev) =>
      prev.map((t) => (t.label === res.table ? { ...t, status: "Reserved" } : t)),
    );
  }

  const value: AppStore = {
    restaurantProfile,
    realtimeStatus,
    lastRealtimeSyncAt,
    updateRestaurantProfile,
    resetRestaurantProfile,
    menuItems,
    menuCategories,
    menuStations,
    setMenuItems,
    saveMenuItem,
    publishMenuChanges,
    removeMenuItem,
    addMenuCategory,
    addMenuStation,
    renameMenuCategory,
    removeMenuCategory,
    renameMenuStation,
    removeMenuStation,
    orders,
    setOrders,
    advanceOrder,
    cancelOrder,
    requestVoidOrder,
    approveVoidOrder,
    rejectVoidOrder,
    reportStationTicketUnavailable,
    recordStationTicketWastage,
    voidBonoStationTickets,
    addOrder,
    createOrder,
    addItemsToOpenOrder,
    ensureOrdersPersisted,
    acceptWaiterOrder,
    updateStationTicket,
    generateReceipt,
    recordReceiptPrint,
    authorizeReceiptChanges,
    closeOrderPayment,
    upsertStoredReceiptRecord,
    serveOrder,
    requestReturnOrder,
    approveReturnOrder,
    rejectReturnOrder,
    updateOrderPriority,
    updateOrderWaiter,
    transferWaiterBills,
    requestWaiterBillTransfer,
    approveWaiterBillTransfer,
    rejectWaiterBillTransfer,
    transferOrderTable,
    mergeOrders,
    splitOrderBill,
    bulkCancelOrders,
    bulkCloseOrders,
    reprintKitchenTickets,
    recordBonoPrint,
    advanceManualDeliveryTickets,
    tables,
    tableAreas,
    setTables,
    updateTable,
    assignTablesToWaiter,
    addTable,
    addTableArea,
    renameTableArea,
    removeTableArea,
    removeTable,
    releaseTable,
    clearCompletedTable,
    stock,
    setStock,
    adjustStock,
    customers,
    setCustomers,
    creditLoyalty,
    payments,
    setPayments,
    addPayment,
    salesRecords,
    expenseRecords,
    setSalesRecords,
    setExpenseRecords,
    addExpenseRecord,
    suppliers,
    purchaseOrders,
    setSuppliers,
    setPurchaseOrders,
    addSupplier,
    updateSupplier,
    removeSupplier,
    addPurchaseOrder,
    updatePurchaseOrder,
    guestOrderRequests,
    storedReceipts,
    setGuestOrderRequests,
    upsertGuestOrderRequest,
    updateGuestOrderRequestStatus,
    reservations,
    setReservations,
    addReservation,
    updateReservation,
    removeReservation,
    confirmReservation,
  };

  return <StoreCtx.Provider value={value}>{children}</StoreCtx.Provider>;
}

export function useStore(): AppStore {
  const ctx = useContext(StoreCtx);
  if (!ctx) throw new Error("useStore must be used inside StoreProvider");
  return ctx as AppStore;
}
