import {
  DEFAULT_ORDER_PREP_TARGET_MINUTES,
  isFinalOrderStatus,
  type Order,
  type OrderPriority,
  type OrderStatus,
  type PaymentStatus,
  type StationTicket,
  type StationTicketStatus,
} from "@/lib/demo-data";
import {
  collectBonoPreviewTickets,
  printKitchenTickets as printBonoTickets,
  type StationTicketPrintOptions,
} from "@/lib/station-ticket-print";
import { dateKey, dateKeyFromDateTime } from "@/lib/sales-analytics";

export type OrdersWorkspaceTab =
  | "active"
  | "ready"
  | "payment"
  | "completed"
  | "cancelled"
  | "returned"
  | "all";

export type OpsStatusFilter =
  | "All"
  | "PENDING_CASHIER"
  | "NEW"
  | "ACCEPTED"
  | "PREPARING"
  | "PARTIALLY READY"
  | "READY TO SERVE"
  | "SERVED"
  | "RECEIPT_GENERATED"
  | "PAYMENT_PENDING"
  | "CLOSED"
  | "CANCELLED"
  | "RETURNED";

export type QuickFilter =
  | "none"
  | "today"
  | "active"
  | "completed"
  | "cancelled"
  | "returned"
  | "vip"
  | "mine";

export type StationProgressTone = "green" | "orange" | "blue" | "gray" | "red";

export interface StationProgressView {
  station: string;
  readyCount: number;
  totalCount: number;
  status: StationTicketStatus | "WAITING";
  tone: StationProgressTone;
  label: string;
  delayed: boolean;
}

export interface OrderProgressView {
  readyItems: number;
  totalItems: number;
  percent: number;
  label: string;
}

export interface OrdersFilterState {
  orderNo: string;
  search: string;
  table: string;
  area: string;
  waiter: string;
  cashier: string;
  customer: string;
  station: string;
  department: string;
  orderType: string;
  status: OpsStatusFilter;
  paymentStatus: string;
  paymentMethod: string;
  priority: string;
  dateFrom: string;
  dateTo: string;
  shift: string;
  quick: QuickFilter;
}

export const EMPTY_ORDERS_FILTERS: OrdersFilterState = {
  orderNo: "",
  search: "",
  table: "",
  area: "",
  waiter: "",
  cashier: "",
  customer: "",
  station: "",
  department: "",
  orderType: "",
  status: "All",
  paymentStatus: "",
  paymentMethod: "",
  priority: "",
  dateFrom: "",
  dateTo: "",
  shift: "",
  quick: "none",
};

export function orderPriority(order: Order): OrderPriority {
  if (order.priority) return order.priority;
  if (order.area === "VIP" || order.area === "VVIP") return "VIP";
  return "Normal";
}

export function displayPaymentStatus(order: Order): PaymentStatus {
  if (order.paymentStatus === "Paid" || order.paymentStatus === "Partially Paid" || order.paymentStatus === "Refunded") {
    return order.paymentStatus;
  }
  if (order.status === "RETURNED" && order.payment) return "Refunded";
  if (order.receipt && order.paymentStatus === "Unpaid") return "Unpaid";
  return order.paymentStatus;
}

export function isPaymentPending(order: Order) {
  return (
    !isFinalOrderStatus(order.status) &&
    displayPaymentStatus(order) !== "Paid" &&
    (Boolean(order.receipt) || order.status === "RECEIPT_GENERATED" || order.status === "READY TO SERVE")
  );
}

export function isOrderCompleted(order: Pick<Order, "status" | "paymentStatus">) {
  return order.status === "CLOSED" || order.paymentStatus === "Paid";
}

export function stillOccupiesTable(
  order: Pick<Order, "status" | "paymentStatus" | "tableClearedAt">,
) {
  if (order.tableClearedAt) return false;
  if (order.status === "CANCELLED" || order.status === "RETURNED") return false;
  return !isFinalOrderStatus(order.status) || isOrderCompleted(order);
}

/**
 * Active service bill that must block another waiter from opening a new order.
 * Paid/closed bills awaiting "Clear table" do not block claiming an Available seat.
 */
export function hasActiveBillOnSeat(
  order: Pick<Order, "status" | "paymentStatus" | "tableClearedAt">,
) {
  if (!stillOccupiesTable(order)) return false;
  if (isOrderCompleted(order)) return false;
  return true;
}

/** Business day for a bill (Addis-local via dateKeyFromDateTime). */
export function orderBusinessDayKey(
  order: Pick<Order, "createdAtIso" | "cashierAcceptedAt" | "stationSentAt" | "requestedAt">,
) {
  return (
    dateKeyFromDateTime(order.createdAtIso) ||
    dateKeyFromDateTime(order.cashierAcceptedAt) ||
    dateKeyFromDateTime(order.stationSentAt) ||
    dateKeyFromDateTime(order.requestedAt) ||
    null
  );
}

/**
 * Report / ledger day for a paid (or about-to-be-paid) order.
 * Prefer the order's original business day so late payment still lands on that day —
 * not the cashier's action day.
 */
export function resolvePaidOrderReportDate(
  order: Pick<
    Order,
    | "createdAtIso"
    | "cashierAcceptedAt"
    | "stationSentAt"
    | "requestedAt"
    | "receiptGeneratedAt"
    | "sentAt"
    | "paymentReceivedAt"
    | "payment"
  >,
  fallbackToday = dateKey(),
) {
  return (
    orderBusinessDayKey(order) ||
    dateKeyFromDateTime(order.receiptGeneratedAt) ||
    dateKeyFromDateTime(order.sentAt) ||
    dateKeyFromDateTime(order.payment?.closedAt) ||
    dateKeyFromDateTime(order.payment?.paymentReceivedAt) ||
    dateKeyFromDateTime(order.paymentReceivedAt) ||
    fallbackToday
  );
}

/**
 * Live bill that still owns the seat for *today*.
 * Prior-day or undated uncleared bills are treated as stale and must not block a new order.
 */
export function hasLiveBillBlockingSeat(
  order: Pick<
    Order,
    | "status"
    | "paymentStatus"
    | "tableClearedAt"
    | "createdAtIso"
    | "cashierAcceptedAt"
    | "stationSentAt"
    | "requestedAt"
  >,
  today = dateKey(),
) {
  if (!hasActiveBillOnSeat(order)) return false;
  const day = orderBusinessDayKey(order);
  // Undated or prior-day bills must not lock the floor forever.
  if (!day || day < today) return false;
  return day === today;
}

/** POS Open bills day bucket — default to today so prior unpaid bills do not clutter service. */
export type OpenBillDayScope = "today" | "prior" | "all";

export function matchesOpenBillDayScope(
  order: Pick<
    Order,
    "createdAtIso" | "cashierAcceptedAt" | "stationSentAt" | "requestedAt"
  >,
  scope: OpenBillDayScope,
  today = dateKey(),
) {
  if (scope === "all") return true;
  const day = orderBusinessDayKey(order);
  if (scope === "today") return day === today;
  // Prior: older business days + undated orphans cashiers need to settle/void.
  return !day || day < today;
}

/** Prior-day (or undated + inactive-looking) unpaid bills still marked as occupying. */
export function isStaleUnclearedBill(
  order: Pick<
    Order,
    | "status"
    | "paymentStatus"
    | "tableClearedAt"
    | "createdAtIso"
    | "cashierAcceptedAt"
    | "stationSentAt"
    | "requestedAt"
  >,
  today = dateKey(),
) {
  if (!stillOccupiesTable(order)) return false;
  if (hasLiveBillBlockingSeat(order, today)) return false;
  return true;
}

export function canCloseOrderToClearTable(
  orders: readonly Pick<Order, "status" | "paymentStatus" | "tableClearedAt">[],
  tableStatus?: string,
) {
  if (tableStatus === "Available" || tableStatus === "Reserved") {
    return orders.some(stillOccupiesTable);
  }
  return (
    orders.some(stillOccupiesTable) ||
    tableStatus === "Bill" ||
    tableStatus === "Cleaning" ||
    tableStatus === "Occupied"
  );
}

/** Cashier/manager receipt generation requires the order to be fully processed in kitchen/bar. */
export function canGenerateReceipt(order: Order) {
  if (order.receipt) return false;
  if (order.items.length === 0) return false;
  if (isFinalOrderStatus(order.status)) return false;
  if (order.status === "PENDING_CASHIER") return false;
  return true;
}

/** Orders eligible for return request/approval (not pending cashier, cancelled, or already returned). */
export function canReturnOrder(order: Pick<Order, "status" | "returnRequestedBy">, opts?: { pendingOnly?: boolean }) {
  if (order.status === "PENDING_CASHIER") return false;
  if (order.status === "CANCELLED" || order.status === "RETURNED") return false;
  if (opts?.pendingOnly) return Boolean(order.returnRequestedBy);
  return true;
}

export function canRequestReturnOrder(order: Pick<Order, "status" | "returnRequestedBy">) {
  return canReturnOrder(order) && !order.returnRequestedBy;
}

export function canApproveReturnOrder(order: Pick<Order, "status" | "returnRequestedBy">) {
  return canReturnOrder(order) && Boolean(order.returnRequestedBy);
}

/** Normalize waiter/manager return qty picks against current order lines. */
export function normalizeReturnRequestedLines(
  items: readonly { qty: number }[],
  lines?: Array<{ index: number; qty: number }> | null,
): Array<{ index: number; qty: number }> | undefined {
  if (!lines?.length) return undefined;
  const next = lines
    .map((row) => {
      const line = items[row.index];
      if (!line) return null;
      const qty = Math.min(Math.max(0, Number(row.qty) || 0), line.qty);
      if (qty <= 0) return null;
      return { index: row.index, qty };
    })
    .filter((row): row is { index: number; qty: number } => Boolean(row));
  return next.length > 0 ? next : undefined;
}

export function returnQtyMapFromLines(
  lines?: Array<{ index: number; qty: number }> | null,
): Record<number, number> {
  if (!lines?.length) return {};
  return Object.fromEntries(lines.map((row) => [row.index, row.qty])) as Record<number, number>;
}

export function summarizeReturnRequestedLines(
  items: readonly { name: string; qty: number; unitLabel?: string }[],
  lines?: Array<{ index: number; qty: number }> | null,
): string | undefined {
  const normalized = normalizeReturnRequestedLines(items, lines);
  if (!normalized) return undefined;
  return normalized
    .map(({ index, qty }) => {
      const line = items[index];
      if (!line) return null;
      const unit = line.unitLabel ? ` ${line.unitLabel}` : "";
      return `${qty}${unit}× ${line.name}`;
    })
    .filter(Boolean)
    .join(", ");
}

/** Amount still due on an order. Cancelled, returned, and fully paid bills are 0. */
export function orderOutstandingAmount(order: Order) {
  if (order.status === "CANCELLED" || order.status === "RETURNED") return 0;
  const pay = displayPaymentStatus(order);
  if (pay === "Paid" || pay === "Refunded") return 0;
  const due = order.receipt?.grandTotal ?? order.total;
  const received = order.payment?.amountReceived ?? 0;
  if (pay === "Partially Paid") return Math.max(0, due - received);
  return Math.max(0, due);
}

export interface WaiterUnpaidSummary {
  waiter: string;
  bills: number;
  amount: number;
}

export function summarizeWaiterUnpaid(orders: readonly Order[]): WaiterUnpaidSummary[] {
  const byWaiter = new Map<string, WaiterUnpaidSummary>();
  for (const order of orders) {
    const amount = orderOutstandingAmount(order);
    if (amount <= 0) continue;
    const waiter = order.waiter?.trim() || "Unassigned";
    const current = byWaiter.get(waiter) ?? { waiter, bills: 0, amount: 0 };
    current.bills += 1;
    current.amount += amount;
    byWaiter.set(waiter, current);
  }
  return Array.from(byWaiter.values()).sort((a, b) => b.amount - a.amount);
}

/** Open bills that still accept new POS lines (before receipt / return lock). */
export function canAddItemsToOrder(
  order: Pick<Order, "status" | "receipt" | "lockedForEditing" | "returnRequestedBy">,
) {
  if (isFinalOrderStatus(order.status)) return false;
  if (order.status === "PENDING_CASHIER" || order.status === "RECEIPT_GENERATED") return false;
  if (order.receipt || order.lockedForEditing) return false;
  if (order.returnRequestedBy) return false;
  return true;
}

export function orderStartMs(order: Order, now = Date.now()) {
  if (order.createdAtIso) {
    const parsed = Date.parse(order.createdAtIso);
    if (!Number.isNaN(parsed)) return parsed;
  }
  if (order.stockReservedAt) {
    const parsed = Date.parse(order.stockReservedAt);
    if (!Number.isNaN(parsed)) return parsed;
  }
  return now - Math.max(0, order.openedMin) * 60_000;
}

export function formatElapsed(ms: number) {
  const totalSec = Math.max(0, Math.floor(ms / 1000));
  const hours = Math.floor(totalSec / 3600);
  const minutes = Math.floor((totalSec % 3600) / 60);
  const seconds = totalSec % 60;
  return [hours, minutes, seconds].map((part) => String(part).padStart(2, "0")).join(":");
}

export function isOrderDelayed(order: Order, now = Date.now(), targetMinutes = DEFAULT_ORDER_PREP_TARGET_MINUTES) {
  if (isFinalOrderStatus(order.status) || order.status === "READY TO SERVE" || order.status === "RECEIPT_GENERATED") {
    return false;
  }
  const elapsedMin = (now - orderStartMs(order, now)) / 60_000;
  return elapsedMin > targetMinutes;
}

function ticketItemCount(ticket: StationTicket) {
  return ticket.items.reduce((sum, item) => sum + item.qty, 0);
}

function ticketReadyCount(ticket: StationTicket) {
  if (ticket.status === "READY") return ticketItemCount(ticket);
  return ticket.items.reduce((sum, item) => sum + (item.done ? item.qty : 0), 0);
}

export function getStationProgress(order: Order, now = Date.now()): StationProgressView[] {
  const delayed = isOrderDelayed(order, now);
  if (order.stationTickets.length === 0) {
    return [
      {
        station: "—",
        readyCount: 0,
        totalCount: order.items.reduce((sum, item) => sum + item.qty, 0),
        status: "WAITING",
        tone: "gray",
        label: "Waiting",
        delayed: false,
      },
    ];
  }

  return order.stationTickets.map((ticket) => {
    const totalCount = ticketItemCount(ticket);
    const readyCount = ticketReadyCount(ticket);
    let tone: StationProgressTone = "gray";
    let label = "Waiting";
    if (ticket.status === "READY" || (totalCount > 0 && readyCount >= totalCount)) {
      tone = "green";
      label = "Ready";
    } else if (ticket.status === "PREPARING") {
      tone = delayed ? "red" : "orange";
      label = delayed ? "Delayed" : "Preparing";
    } else if (ticket.status === "NEW") {
      tone = "blue";
      label = "Waiting";
    } else if (ticket.status === "UNAVAILABLE" || ticket.status === "CANCELLED") {
      tone = "red";
      label = ticket.status === "UNAVAILABLE" ? "Unavailable" : "Cancelled";
    }
    return {
      station: ticket.station,
      readyCount,
      totalCount,
      status: ticket.status,
      tone,
      label,
      delayed: delayed && ticket.status !== "READY",
    };
  });
}

export function getOrderProgress(order: Order): OrderProgressView {
  const tickets = order.stationTickets;
  if (tickets.length === 0) {
    const totalItems = order.items.reduce((sum, item) => sum + item.qty, 0);
    return { readyItems: 0, totalItems, percent: 0, label: `0 of ${totalItems} Items Ready` };
  }
  const totalItems = tickets.reduce((sum, ticket) => sum + ticketItemCount(ticket), 0);
  const readyItems = tickets.reduce((sum, ticket) => sum + ticketReadyCount(ticket), 0);
  const percent = totalItems === 0 ? 0 : Math.round((readyItems / totalItems) * 100);
  return {
    readyItems,
    totalItems,
    percent,
    label: `${readyItems} of ${totalItems} Items Ready`,
  };
}

/** Derived ops lens on top of persisted OrderStatus. */
export function matchesOpsStatus(order: Order, filter: OpsStatusFilter) {
  if (filter === "All") return true;
  if (filter === "PAYMENT_PENDING") return isPaymentPending(order);
  if (filter === "ACCEPTED") {
    return (
      order.status === "NEW" &&
      order.stationTickets.length > 0 &&
      order.stationTickets.every((ticket) => ticket.status === "NEW")
    );
  }
  if (filter === "PREPARING") {
    return (
      (order.status === "NEW" || order.status === "PARTIALLY READY") &&
      order.stationTickets.some((ticket) => ticket.status === "PREPARING")
    );
  }
  if (filter === "SERVED") {
    return order.status === "READY TO SERVE" && Boolean(order.receipt);
  }
  return order.status === filter;
}

export function orderInTab(order: Order, tab: OrdersWorkspaceTab) {
  switch (tab) {
    case "active":
      return (
        !isFinalOrderStatus(order.status) &&
        order.status !== "READY TO SERVE" &&
        order.status !== "RECEIPT_GENERATED"
      );
    case "ready":
      return order.status === "READY TO SERVE" && !order.receipt;
    case "payment":
      return (
        order.status === "RECEIPT_GENERATED" ||
        matchesOpsStatus(order, "SERVED") ||
        (isPaymentPending(order) && order.status !== "READY TO SERVE") ||
        (order.status === "READY TO SERVE" && Boolean(order.receipt))
      );
    case "completed":
      return order.status === "CLOSED";
    case "cancelled":
      return order.status === "CANCELLED";
    case "returned":
      return order.status === "RETURNED";
    case "all":
    default:
      return true;
  }
}

export function countOrdersByTab(orders: readonly Order[]) {
  return {
    active: orders.filter((order) => orderInTab(order, "active")).length,
    ready: orders.filter((order) => orderInTab(order, "ready")).length,
    payment: orders.filter((order) => orderInTab(order, "payment")).length,
    completed: orders.filter((order) => orderInTab(order, "completed")).length,
    cancelled: orders.filter((order) => orderInTab(order, "cancelled")).length,
    returned: orders.filter((order) => orderInTab(order, "returned")).length,
    all: orders.length,
  };
}

export function compactOrderStations(order: Order) {
  const names = [
    ...new Set(
      [...order.stationTickets.map((ticket) => ticket.station), ...order.items.map((item) => item.station)].filter(
        Boolean,
      ),
    ),
  ];
  if (names.length === 0) return { primary: "—", extra: 0, all: [] as string[] };
  return { primary: names[0], extra: names.length - 1, all: names };
}

export function orderClockLabel(order: Order) {
  const raw = order.requestedAt ?? order.sentAt ?? "";
  const match = raw.match(/(\d{1,2}:\d{2}\s*[AP]M)/i);
  if (match) return match[1].replace(/\s+/g, " ");
  if (order.createdAtIso) {
    const parsed = new Date(order.createdAtIso);
    if (!Number.isNaN(parsed.getTime())) {
      return parsed.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
    }
  }
  return raw || "—";
}

export function delayedElapsedMinutes(order: Order, now = Date.now()) {
  return Math.max(0, Math.floor((now - orderStartMs(order, now)) / 60_000));
}

/** Local business calendar day for an order. Never invents "today" for undated rows. */
export function parseOrderDayKey(order: Order): string | null {
  return (
    dateKeyFromDateTime(order.createdAtIso) ??
    dateKeyFromDateTime(order.cashierAcceptedAt) ??
    dateKeyFromDateTime(order.requestedAt) ??
    dateKeyFromDateTime(order.stationSentAt) ??
    dateKeyFromDateTime(order.receiptGeneratedAt) ??
    dateKeyFromDateTime(order.paymentReceivedAt) ??
    dateKeyFromDateTime(order.payment?.paymentReceivedAt) ??
    dateKeyFromDateTime(order.payment?.closedAt) ??
    dateKeyFromDateTime(order.cancelledAt) ??
    dateKeyFromDateTime(order.returnedAt) ??
    dateKeyFromDateTime(order.sentAt)
  );
}

export function orderBusinessTimestamp(order: Order): string | null {
  const candidates = [
    order.createdAtIso,
    order.cashierAcceptedAt,
    order.requestedAt,
    order.stationSentAt,
    order.receiptGeneratedAt,
    order.paymentReceivedAt,
    order.payment?.paymentReceivedAt,
    order.payment?.closedAt,
    order.cancelledAt,
    order.returnedAt,
    order.sentAt,
  ];
  for (const value of candidates) {
    if (!value?.trim()) continue;
    if (value.includes("T") && value.length >= 19) return value;
    const day = dateKeyFromDateTime(value);
    if (day) {
      const parsed = Date.parse(value);
      if (!Number.isNaN(parsed)) return new Date(parsed).toISOString();
      return `${day}T00:00:00.000Z`;
    }
  }
  return null;
}

export function isOrderToday(order: Order, now = new Date()) {
  const day = parseOrderDayKey(order);
  return day != null && day === dateKey(now);
}

/** Today's orders, optionally only those after branch daily closing. */
export function filterOrdersForDashboardToday(
  orders: readonly Order[],
  options: { now?: Date; periodStart?: string | null } = {},
) {
  const now = options.now ?? new Date();
  const periodStart = options.periodStart ?? null;
  return orders.filter((order) => {
    if (!isOrderToday(order, now)) return false;
    if (!periodStart) return true;
    const ts = orderBusinessTimestamp(order);
    if (!ts) return true;
    return ts > periodStart;
  });
}

export function filterOrders(
  orders: readonly Order[],
  filters: OrdersFilterState,
  opts?: { currentUserName?: string; tab?: OrdersWorkspaceTab },
) {
  const tab = opts?.tab ?? "all";
  return orders.filter((order) => {
    if (!orderInTab(order, tab)) return false;
    if (!matchesOpsStatus(order, filters.status)) return false;

    if (filters.quick === "today" && !isOrderToday(order)) return false;
    if (filters.quick === "active" && isFinalOrderStatus(order.status)) return false;
    if (filters.quick === "completed" && order.status !== "CLOSED") return false;
    if (filters.quick === "cancelled" && order.status !== "CANCELLED") return false;
    if (filters.quick === "returned" && order.status !== "RETURNED") return false;
    if (filters.quick === "vip" && orderPriority(order) !== "VIP" && order.area !== "VIP" && order.area !== "VVIP") {
      return false;
    }
    if (filters.quick === "mine" && opts?.currentUserName && order.waiter !== opts.currentUserName) return false;

    const q = (filters.search || filters.orderNo).trim().toLowerCase();
    if (q) {
      const hay = [
        order.orderNo,
        order.id,
        order.tableNumber,
        order.area,
        order.waiter,
        ...order.stationTickets.map((ticket) => ticket.station),
        ...order.items.map((item) => item.station),
      ]
        .join(" ")
        .toLowerCase();
      if (!hay.includes(q)) return false;
    }
    if (filters.table.trim() && !order.tableNumber.toLowerCase().includes(filters.table.trim().toLowerCase())) return false;
    if (filters.area && order.area !== filters.area) return false;
    if (filters.waiter) {
      const wanted = filters.waiter.trim().toLowerCase();
      if ((order.waiter ?? "").trim().toLowerCase() !== wanted) return false;
    }
    if (filters.cashier && order.enteredByCashier !== filters.cashier) return false;
    if (filters.customer.trim()) {
      const c = filters.customer.trim().toLowerCase();
      if (!(order.customerName ?? "").toLowerCase().includes(c)) return false;
    }
    if (filters.station) {
      const hasStation =
        order.stationTickets.some((ticket) => ticket.station === filters.station) ||
        order.items.some((item) => item.station === filters.station);
      if (!hasStation) return false;
    }
    if (filters.department) {
      const hasDept = order.items.some(
        (item) => (item.stockDeductionLocation ?? item.station) === filters.department,
      );
      if (!hasDept) return false;
    }
    if (filters.orderType && order.source !== filters.orderType) return false;
    if (filters.paymentStatus && displayPaymentStatus(order) !== filters.paymentStatus) return false;
    if (filters.paymentMethod && order.payment?.method !== filters.paymentMethod) return false;
    if (filters.priority && orderPriority(order) !== filters.priority) return false;
    if (filters.shift && (order.shiftLabel ?? "") !== filters.shift) return false;

    if (filters.dateFrom || filters.dateTo) {
      const day = parseOrderDayKey(order);
      if (!day) return false;
      if (filters.dateFrom && day < filters.dateFrom) return false;
      if (filters.dateTo && day > filters.dateTo) return false;
    }

    return true;
  });
}

export interface OrdersSummaryMetrics {
  totalToday: number;
  active: number;
  waitingCashier: number;
  newOrders: number;
  accepted: number;
  preparing: number;
  partiallyReady: number;
  ready: number;
  paymentPending: number;
  closed: number;
  cancelled: number;
  returned: number;
  salesToday: number;
  avgPrepMinutes: number | null;
  avgServiceMinutes: number | null;
}

export function computeOrdersSummary(orders: readonly Order[], now = Date.now()): OrdersSummaryMetrics {
  const today = orders.filter((order) => isOrderToday(order));
  const activeOrders = orders.filter((order) => !isFinalOrderStatus(order.status));
  const closedToday = today.filter((order) => order.status === "CLOSED");

  const prepSamples = closedToday
    .map((order) => {
      if (!order.createdAtIso || !order.payment?.closedAt) return order.openedMin || null;
      const start = Date.parse(order.createdAtIso);
      // closedAt is display format — fall back to openedMin
      return Number.isNaN(start) ? order.openedMin || null : order.openedMin || null;
    })
    .filter((value): value is number => value != null && value > 0);

  const avg = (values: number[]) =>
    values.length === 0 ? null : Math.round(values.reduce((sum, value) => sum + value, 0) / values.length);

  return {
    totalToday: today.length,
    active: activeOrders.length,
    waitingCashier: orders.filter((order) => order.status === "PENDING_CASHIER").length,
    newOrders: orders.filter((order) => order.status === "NEW").length,
    accepted: orders.filter((order) => matchesOpsStatus(order, "ACCEPTED")).length,
    preparing: orders.filter((order) => matchesOpsStatus(order, "PREPARING")).length,
    partiallyReady: orders.filter((order) => order.status === "PARTIALLY READY").length,
    ready: orders.filter((order) => order.status === "READY TO SERVE").length,
    paymentPending: orders.filter((order) => isPaymentPending(order)).length,
    closed: orders.filter((order) => order.status === "CLOSED").length,
    cancelled: orders.filter((order) => order.status === "CANCELLED").length,
    returned: orders.filter((order) => order.status === "RETURNED").length,
    salesToday: today
      .filter((order) => order.paymentStatus === "Paid" || order.status === "CLOSED")
      .reduce((sum, order) => sum + order.total, 0),
    avgPrepMinutes: avg(prepSamples),
    avgServiceMinutes: avg(prepSamples.map((value) => value + 3)),
  };
}

export function buildOrderTimeline(order: Order) {
  const events: Array<{ label: string; at?: string; user?: string }> = [];
  events.push({ label: "Order Created", at: order.requestedAt ?? order.sentAt, user: order.orderedByWaiter });
  if (order.cashierAcceptedAt) {
    events.push({ label: "Cashier Accepted", at: order.cashierAcceptedAt, user: order.enteredByCashier });
  }
  if (order.stationSentAt || order.stationTickets.length) {
    events.push({
      label: "Sent to Stations",
      at: order.stationSentAt ?? order.sentAt,
      user: order.enteredByCashier,
    });
  }
  for (const ticket of order.stationTickets) {
    events.push({
      label: `${ticket.station}: ${ticket.status}`,
      at: ticket.sentAt,
    });
  }
  if (order.receiptGeneratedAt || order.receipt) {
    events.push({
      label: "Receipt Generated",
      at: order.receiptGeneratedAt ?? order.receipt?.generatedAt,
      user: order.receiptGeneratedBy ?? order.receipt?.generatedBy,
    });
  }
  if (order.payment) {
    events.push({
      label: "Paid",
      at: order.payment.paymentReceivedAt,
      user: order.payment.receivedByCashier,
    });
    events.push({
      label: "Closed",
      at: order.payment.closedAt,
      user: order.payment.closedByCashier,
    });
  }
  if (order.cancelledAt) {
    events.push({ label: "Cancelled", at: order.cancelledAt, user: order.cancelledBy });
  }
  if (order.returnedAt) {
    events.push({ label: "Returned", at: order.returnedAt, user: order.returnedBy });
  }
  return events;
}

export function exportOrdersCsv(orders: readonly Order[]) {
  const headers = [
    "Order No",
    "Status",
    "Payment",
    "Area",
    "Table",
    "Waiter",
    "Cashier",
    "Type",
    "Priority",
    "Total",
    "Created",
  ];
  const rows = orders.map((order) => [
    order.orderNo,
    order.status,
    displayPaymentStatus(order),
    order.area,
    order.tableNumber,
    order.waiter,
    order.enteredByCashier,
    order.source,
    orderPriority(order),
    String(order.total),
    order.createdAtIso ?? order.sentAt,
  ]);
  const escape = (value: string) => `"${value.replaceAll('"', '""')}"`;
  const csv = [headers, ...rows].map((row) => row.map(escape).join(",")).join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = `orders-export-${new Date().toISOString().slice(0, 10)}.csv`;
  anchor.click();
  URL.revokeObjectURL(url);
}

export function statusBadgeClass(status: OrderStatus | string) {
  switch (status) {
    case "PENDING_CASHIER":
      return "bg-amber-500/15 text-amber-700 dark:text-amber-300";
    case "NEW":
    case "ACCEPTED":
      return "bg-sky-500/15 text-sky-700 dark:text-sky-300";
    case "PREPARING":
    case "PARTIALLY READY":
      return "bg-orange-500/15 text-orange-700 dark:text-orange-300";
    case "READY TO SERVE":
    case "SERVED":
      return "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300";
    case "RECEIPT_GENERATED":
    case "PAYMENT_PENDING":
      return "bg-violet-500/15 text-violet-700 dark:text-violet-300";
    case "CLOSED":
      return "bg-slate-500/15 text-slate-600 dark:text-slate-300";
    case "CANCELLED":
      return "bg-red-500/15 text-red-700 dark:text-red-300";
    case "RETURNED":
      return "bg-rose-900/15 text-rose-800 dark:text-rose-300";
    default:
      return "bg-muted text-muted-foreground";
  }
}

export function paymentBadgeClass(status: PaymentStatus) {
  switch (status) {
    case "Paid":
      return "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300";
    case "Partially Paid":
      return "bg-amber-500/15 text-amber-700 dark:text-amber-300";
    case "Refunded":
      return "bg-rose-500/15 text-rose-700 dark:text-rose-300";
    default:
      return "bg-yellow-500/15 text-yellow-800 dark:text-yellow-300";
  }
}

export function priorityBadgeClass(priority: OrderPriority) {
  switch (priority) {
    case "Urgent":
      return "bg-red-600/15 text-red-700 dark:text-red-300";
    case "High":
      return "bg-orange-500/15 text-orange-700 dark:text-orange-300";
    case "VIP":
      return "bg-violet-500/15 text-violet-700 dark:text-violet-300";
    default:
      return "bg-slate-500/10 text-slate-600 dark:text-slate-300";
  }
}

export function stationToneClass(tone: StationProgressTone) {
  switch (tone) {
    case "green":
      return "text-emerald-700 dark:text-emerald-300";
    case "orange":
      return "text-orange-700 dark:text-orange-300";
    case "blue":
      return "text-sky-700 dark:text-sky-300";
    case "red":
      return "text-red-700 dark:text-red-300";
    default:
      return "text-muted-foreground";
  }
}

export interface OrdersPageResult<T> {
  rows: T[];
  page: number;
  pageSize: number;
  total: number;
  pageCount: number;
  from: number;
  to: number;
}

export function paginateOrders<T>(rows: readonly T[], page: number, pageSize: number): OrdersPageResult<T> {
  const safeSize = Math.max(1, pageSize);
  const total = rows.length;
  const pageCount = Math.max(1, Math.ceil(total / safeSize));
  const safePage = Math.min(Math.max(1, page), pageCount);
  const start = (safePage - 1) * safeSize;
  const pageRows = rows.slice(start, start + safeSize);
  return {
    rows: pageRows,
    page: safePage,
    pageSize: safeSize,
    total,
    pageCount,
    from: total === 0 ? 0 : start + 1,
    to: start + pageRows.length,
  };
}

/** Every fulfillment station gets a paper Bono and a live KDS ticket. */
export function isFulfillmentStation(station: string) {
  return Boolean(station?.trim());
}

/** @deprecated Use isFulfillmentStation. Kept so existing call sites keep working. */
export function isManualDeliveryStation(station: string) {
  return isFulfillmentStation(station);
}

export function orderHasManualDeliveryStations(order: Order) {
  if (order.stationTickets.some((ticket) => isManualDeliveryStation(ticket.station))) {
    return true;
  }
  return order.items.some((item) => isManualDeliveryStation(item.station));
}

export function manualDeliveryTickets(order: Pick<Order, "stationTickets">) {
  return order.stationTickets.filter(
    (ticket) =>
      isManualDeliveryStation(ticket.station) &&
      ticket.status !== "CANCELLED" &&
      ticket.status !== "UNAVAILABLE",
  );
}

export function bonoTicketsAwaitingPrint(order: Pick<Order, "stationTickets">) {
  return manualDeliveryTickets(order).filter((ticket) => ticket.status === "NEW");
}

export function bonoTicketsAwaitingPickup(order: Pick<Order, "stationTickets">) {
  return manualDeliveryTickets(order).filter(
    (ticket) => ticket.status === "NEW" || ticket.status === "PREPARING",
  );
}

export type StationTicketTheme = {
  label: string;
  accent: string;
  soft: string;
  ink: string;
};

export function stationTicketTheme(station: string): StationTicketTheme {
  const key = station.toLowerCase();
  if (key.includes("butcher") || key.includes("meat") || key.includes("grill")) {
    return {
      label: "BUTCHER",
      accent: "#b91c1c",
      soft: "#fee2e2",
      ink: "#7f1d1d",
    };
  }
  if (key.includes("kitchen")) {
    return {
      label: "KITCHEN",
      accent: "#c2410c",
      soft: "#ffedd5",
      ink: "#7c2d12",
    };
  }
  if (key.includes("coffee") || key.includes("buna")) {
    return {
      label: "COFFEE",
      accent: "#047857",
      soft: "#d1fae5",
      ink: "#064e3b",
    };
  }
  if (key.includes("bar") || key.includes("drink") || key.includes("beverage")) {
    return {
      label: "BAR",
      accent: "#a16207",
      soft: "#fef3c7",
      ink: "#713f12",
    };
  }
  return {
    label: station.toUpperCase(),
    accent: "#475569",
    soft: "#e2e8f0",
    ink: "#0f172a",
  };
}

export function collectManualDeliveryTicketViews(
  orders: readonly Order[],
  options?: StationTicketPrintOptions,
) {
  return collectBonoPreviewTickets(orders, options);
}

export function buildKitchenTicketText(order: Order, options?: StationTicketPrintOptions) {
  return collectBonoPreviewTickets([order], options)
    .map((ticket) => ticket.text)
    .join("\n\n");
}

/** Prints paper Bono slips for every fulfillment station. */
export function printKitchenTickets(orders: readonly Order[], options?: StationTicketPrintOptions) {
  return printBonoTickets(orders, options);
}

/* removed colored ticket HTML
<!doctype html>
<html>
  <head>
    <title>Kitchen / Butcher Tickets</title>
    <style>
      @page { size: 80mm auto; margin: 4mm; }
      * { box-sizing: border-box; }
      body {
        margin: 0;
        background: #fff;
        color: #111;
        font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
      }
      .sheet { padding: 8px; display: grid; gap: 16px; }
      .ticket {
        width: 100%;
        max-width: 320px;
        margin: 0 auto;
        border: 3px solid var(--accent);
        border-radius: 10px;
        overflow: hidden;
        background: #fff;
        page-break-inside: avoid;
        break-inside: avoid;
      }
      .band {
        background: var(--accent);
        color: #fff;
        text-align: center;
        font-weight: 800;
        letter-spacing: 0.12em;
        padding: 10px 8px;
        font-size: 14px;
      }
      .delivery {
        background: #111;
        color: #fff;
        text-align: center;
        font-size: 10px;
        font-weight: 700;
        letter-spacing: 0.18em;
        padding: 5px 8px;
      }
      .meta {
        padding: 10px 12px 8px;
        background: var(--soft);
        color: var(--ink);
        font-size: 12px;
        line-height: 1.45;
        border-bottom: 2px dashed var(--accent);
      }
      .order { font-size: 18px; font-weight: 800; margin-bottom: 2px; }
      .items { padding: 10px 12px; }
      .item {
        display: grid;
        grid-template-columns: 64px 1fr;
        gap: 8px;
        padding: 6px 0;
        border-bottom: 1px dotted #cbd5e1;
        font-size: 13px;
        font-weight: 700;
      }
      .item:last-child { border-bottom: 0; }
      .qty { color: var(--accent); }
      .name { color: #0f172a; }
      .empty { color: #64748b; font-size: 12px; }
      .footer {
        padding: 8px 12px 10px;
        border-top: 2px dashed var(--accent);
        text-align: center;
        font-size: 10px;
        color: #64748b;
      }
      @media print {
        .sheet { padding: 0; gap: 10mm; }
        .ticket { max-width: none; }
      }
    </style>
  </head>
  <body>
    <div class="sheet"></div>
    <script>
      window.onload = () => {
        window.focus();
        window.print();
      };
    </script>
  </body>
</html>
*/

