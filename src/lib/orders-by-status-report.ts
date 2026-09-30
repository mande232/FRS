import type { Order } from "@/lib/demo-data";
import { dateKeyFromDateTime } from "@/lib/sales-analytics";
import { displayPaymentStatus, orderOutstandingAmount } from "@/lib/orders-ops";
import type { ReportFiltersState } from "@/lib/reports-query";

export type OpsOrderLifecycle =
  | "Open"
  | "Receipt Generated"
  | "Closed"
  | "Cancelled"
  | "Returned";

export type OpsPaymentLabel = "Paid" | "Unpaid" | "Partial" | "Voided";

export type OrdersByStatusRow = {
  id: string;
  orderNo: string;
  time: string;
  timeSort: string;
  table: string;
  waiter: string;
  cashier: string;
  itemCount: number;
  total: number;
  paid: number;
  balance: number;
  payment: OpsPaymentLabel;
  lifecycle: OpsOrderLifecycle;
  items: Array<{ name: string; qty: number; amount: number }>;
};

export type WaiterOrdersSummary = {
  waiter: string;
  openOrders: number;
  totalOrders: number;
  sales: number;
  paid: number;
  outstanding: number;
};

export type OrdersByStatusData = {
  fromDate: string;
  toDate: string;
  totalOrders: number;
  openCount: number;
  closedCount: number;
  totalValue: number;
  outstanding: number;
  lifecycleCounts: Record<OpsOrderLifecycle | "All", number>;
  paymentCounts: Record<OpsPaymentLabel | "All", number>;
  orders: OrdersByStatusRow[];
  byWaiter: WaiterOrdersSummary[];
  isEmpty: boolean;
};

export function operationalLifecycle(order: Order): OpsOrderLifecycle {
  const status = order.status;
  if (status === "CANCELLED") return "Cancelled";
  if (status === "RETURNED") return "Returned";
  if (status === "CLOSED") return "Closed";
  if (status === "RECEIPT_GENERATED" || status === ("PAYMENT_PENDING" as Order["status"])) {
    return "Receipt Generated";
  }
  // NEW and all active floor/kitchen states → Open
  return "Open";
}

export function operationalPaymentLabel(order: Order): OpsPaymentLabel {
  const status = displayPaymentStatus(order);
  if (status === "Paid") return "Paid";
  if (status === "Partially Paid") return "Partial";
  if (status === "Refunded") return "Voided";
  return "Unpaid";
}

function orderTotal(order: Order) {
  return Math.max(0, order.receipt?.grandTotal ?? order.total ?? 0);
}

function orderPaidAmount(order: Order) {
  const payment = operationalPaymentLabel(order);
  const total = orderTotal(order);
  if (payment === "Paid") return total;
  if (payment === "Partial") return Math.max(0, Math.min(total, order.payment?.amountReceived ?? 0));
  return 0;
}

function orderDayKeys(order: Order): string[] {
  const keys = new Set<string>();
  for (const value of [
    order.createdAtIso,
    order.receiptGeneratedAt,
    order.receipt?.generatedAt,
    order.paymentReceivedAt,
    order.payment?.paymentReceivedAt,
    order.payment?.closedAt,
    order.sentAt,
    order.cashierAcceptedAt,
  ]) {
    const key = dateKeyFromDateTime(value);
    if (key) keys.add(key);
  }
  return [...keys];
}

function orderInDateRange(order: Order, fromDate: string, toDate: string) {
  const days = orderDayKeys(order);
  if (days.length === 0) return false;
  return days.some((day) => day >= fromDate && day <= toDate);
}

function formatClockLabel(value?: string) {
  if (!value?.trim()) return "—";
  if (value.includes("T")) {
    const date = new Date(value);
    if (!Number.isNaN(date.getTime())) {
      return date.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });
    }
  }
  const match = value.match(/(\d{1,2}:\d{2}\s*[AP]M)/i) ?? value.match(/(\d{1,2}:\d{2})/);
  return match?.[1] ?? value;
}

function sortRank(row: OrdersByStatusRow) {
  const openUnpaid = row.lifecycle === "Open" && row.payment === "Unpaid" ? 0 : 99;
  const openPartial = row.lifecycle === "Open" && row.payment === "Partial" ? 1 : 99;
  const receipt = row.lifecycle === "Receipt Generated" ? 2 : 99;
  const closed = row.lifecycle === "Closed" ? 3 : 99;
  const cancelled = row.lifecycle === "Cancelled" || row.lifecycle === "Returned" ? 4 : 99;
  return Math.min(openUnpaid, openPartial, receipt, closed, cancelled);
}

export function buildOrdersByStatusReport(input: {
  orders: readonly Order[];
  filters: ReportFiltersState;
  lifecycleFilter?: OpsOrderLifecycle | "All";
  paymentFilter?: OpsPaymentLabel | "All";
  waiterFilter?: string;
  search?: string;
}): OrdersByStatusData {
  const { filters } = input;
  const fromDate = filters.fromDate;
  const toDate = filters.toDate;
  const lifecycleFilter = input.lifecycleFilter ?? "All";
  const paymentFilter = input.paymentFilter ?? "All";
  const waiterFilter = input.waiterFilter ?? "All";
  const search = (input.search ?? filters.search ?? "").trim().toLowerCase();

  const scoped = input.orders.filter((order) => {
    if (!orderInDateRange(order, fromDate, toDate)) return false;
    if (filters.waiter !== "All") {
      const waiter = order.waiter || order.orderedByWaiter || "";
      if (waiter !== filters.waiter) return false;
    }
    if (filters.cashier !== "All") {
      const cashier =
        order.payment?.receivedByCashier ||
        order.enteredByCashier ||
        order.receiptGeneratedBy ||
        "";
      if (cashier !== filters.cashier) return false;
    }
    if (filters.area !== "All" && order.area !== filters.area) return false;
    if (filters.table !== "All" && order.tableNumber !== filters.table) return false;
    return true;
  });

  const rows: OrdersByStatusRow[] = scoped.map((order) => {
    const total = orderTotal(order);
    const paid = orderPaidAmount(order);
    const balance = orderOutstandingAmount(order);
    const timeRaw =
      order.createdAtIso ??
      order.receiptGeneratedAt ??
      order.sentAt ??
      order.paymentReceivedAt ??
      "";
    return {
      id: order.id,
      orderNo: order.orderNo,
      time: formatClockLabel(timeRaw),
      timeSort: timeRaw,
      table: `${order.area} ${order.tableNumber}`,
      waiter: order.waiter || order.orderedByWaiter || "—",
      cashier:
        order.payment?.receivedByCashier ||
        order.enteredByCashier ||
        order.receiptGeneratedBy ||
        "—",
      itemCount: order.items.reduce((sum, item) => sum + item.qty, 0),
      total,
      paid,
      balance,
      payment: operationalPaymentLabel(order),
      lifecycle: operationalLifecycle(order),
      items: order.items.map((item) => ({
        name: item.name,
        qty: item.qty,
        amount: (item.unitPrice ?? 0) * item.qty,
      })),
    };
  });

  const lifecycleCounts: Record<OpsOrderLifecycle | "All", number> = {
    All: rows.length,
    Open: 0,
    "Receipt Generated": 0,
    Closed: 0,
    Cancelled: 0,
    Returned: 0,
  };
  const paymentCounts: Record<OpsPaymentLabel | "All", number> = {
    All: rows.length,
    Paid: 0,
    Unpaid: 0,
    Partial: 0,
    Voided: 0,
  };

  for (const row of rows) {
    lifecycleCounts[row.lifecycle] += 1;
    paymentCounts[row.payment] += 1;
  }

  let visible = rows;
  if (lifecycleFilter !== "All") {
    visible = visible.filter((row) => row.lifecycle === lifecycleFilter);
  }
  if (paymentFilter !== "All") {
    visible = visible.filter((row) => row.payment === paymentFilter);
  }
  if (waiterFilter !== "All") {
    visible = visible.filter((row) => row.waiter === waiterFilter);
  }
  if (search) {
    visible = visible.filter(
      (row) =>
        row.orderNo.toLowerCase().includes(search) ||
        row.table.toLowerCase().includes(search) ||
        row.waiter.toLowerCase().includes(search) ||
        row.cashier.toLowerCase().includes(search),
    );
  }

  visible = [...visible].sort((a, b) => {
    const rank = sortRank(a) - sortRank(b);
    if (rank !== 0) return rank;
    return b.timeSort.localeCompare(a.timeSort) || b.orderNo.localeCompare(a.orderNo);
  });

  const byWaiterMap = new Map<string, WaiterOrdersSummary>();
  for (const row of rows) {
    const waiter = row.waiter || "Unassigned";
    const current = byWaiterMap.get(waiter) ?? {
      waiter,
      openOrders: 0,
      totalOrders: 0,
      sales: 0,
      paid: 0,
      outstanding: 0,
    };
    const countsTowardValue =
      row.lifecycle !== "Cancelled" && row.lifecycle !== "Returned";
    current.totalOrders += 1;
    if (countsTowardValue) {
      current.sales += row.total;
      current.paid += row.paid;
      current.outstanding += row.balance;
    }
    if (row.lifecycle === "Open" || row.lifecycle === "Receipt Generated") {
      current.openOrders += 1;
    }
    byWaiterMap.set(waiter, current);
  }

  const byWaiter = [...byWaiterMap.values()].sort(
    (a, b) => b.outstanding - a.outstanding || b.openOrders - a.openOrders || a.waiter.localeCompare(b.waiter),
  );

  const openCount = lifecycleCounts.Open + lifecycleCounts["Receipt Generated"];
  // Cancelled / returned bills stay visible in the list, but do not inflate value KPIs.
  const valueRows = rows.filter(
    (row) => row.lifecycle !== "Cancelled" && row.lifecycle !== "Returned",
  );
  const outstanding = valueRows.reduce((sum, row) => sum + row.balance, 0);
  const totalValue = valueRows.reduce((sum, row) => sum + row.total, 0);

  return {
    fromDate,
    toDate,
    totalOrders: rows.length,
    openCount,
    closedCount: lifecycleCounts.Closed,
    totalValue: Number(totalValue.toFixed(2)),
    outstanding: Number(outstanding.toFixed(2)),
    lifecycleCounts,
    paymentCounts,
    orders: visible,
    byWaiter,
    isEmpty: rows.length === 0,
  };
}
