import type { Order, SalesRecord } from "@/lib/demo-data";
import {
  dateKeyFromDateTime,
  groupSalesByDate,
  groupSalesByHour,
  groupSalesByProduct,
} from "@/lib/sales-analytics";
import { displayPaymentStatus, orderBusinessDayKey, orderOutstandingAmount } from "@/lib/orders-ops";
import type { ReportFiltersState } from "@/lib/reports-query";

export type DailySalesItemRow = {
  id: string;
  product: string;
  category: string;
  station: string;
  qty: number;
  sales: number;
};

export type DailySalesOrderRow = {
  id: string;
  orderNo: string;
  time: string;
  table: string;
  waiter: string;
  cashier: string;
  total: number;
  paid: number;
  balance: number;
  status: "Paid" | "Unpaid" | "Partial";
  href: string;
};

export type DailySalesReportData = {
  date: string;
  fromDate: string;
  toDate: string;
  totalSales: number;
  paid: number;
  unpaid: number;
  orderCount: number;
  itemsSoldQty: number;
  items: DailySalesItemRow[];
  paymentStatus: {
    paidOrders: { count: number; amount: number };
    unpaidOrders: { count: number; amount: number };
    partialOrders: { count: number; amount: number };
  };
  /** Hour buckets for a single day, or day buckets for week/month. */
  trend: Array<{ label: string; value: number }>;
  /** @deprecated use trend */
  hourly: Array<{ label: string; value: number }>;
  orders: DailySalesOrderRow[];
  isEmpty: boolean;
};

function orderDayKeys(order: Order): string[] {
  const keys = new Set<string>();
  // Paid / unpaid bills attribute to the order's original business day first.
  const business = orderBusinessDayKey(order);
  if (business) keys.add(business);

  const candidates = [
    order.receiptGeneratedAt,
    order.receipt?.generatedAt,
    order.createdAtIso,
    order.sentAt,
  ];
  // Do not add payment action timestamps — late payment must not move the bill to "today".
  for (const value of candidates) {
    const key = dateKeyFromDateTime(value);
    if (key) keys.add(key);
  }
  return [...keys];
}

function orderTotal(order: Order) {
  return Math.max(0, order.receipt?.grandTotal ?? order.total ?? 0);
}

function orderPaidAmount(order: Order) {
  const status = displayPaymentStatus(order);
  const total = orderTotal(order);
  if (status === "Paid") return total;
  if (status === "Partially Paid") return Math.max(0, Math.min(total, order.payment?.amountReceived ?? 0));
  return 0;
}

function orderStatusLabel(order: Order): DailySalesOrderRow["status"] {
  const status = displayPaymentStatus(order);
  if (status === "Paid") return "Paid";
  if (status === "Partially Paid") return "Partial";
  return "Unpaid";
}

function formatClockLabel(value?: string) {
  if (!value?.trim()) return "—";
  const iso = value.includes("T") ? new Date(value) : null;
  if (iso && !Number.isNaN(iso.getTime())) {
    return iso.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });
  }
  const match = value.match(/(\d{1,2}:\d{2}\s*[AP]M)/i) ?? value.match(/(\d{1,2}:\d{2})/);
  return match?.[1] ?? value;
}

function matchesOrderFilters(order: Order, filters: ReportFiltersState) {
  if (filters.waiter !== "All") {
    const waiter = order.waiter || order.orderedByWaiter || "";
    if (waiter !== filters.waiter) return false;
  }
  if (filters.cashier !== "All") {
    const cashier =
      order.payment?.receivedByCashier ||
      order.enteredByCashier ||
      order.receiptGeneratedBy ||
      order.receipt?.generatedBy ||
      "";
    if (cashier !== filters.cashier) return false;
  }
  if (filters.area !== "All" && order.area !== filters.area) return false;
  if (filters.table !== "All" && order.tableNumber !== filters.table) return false;
  if (filters.station !== "All" && !order.items.some((item) => item.station === filters.station)) return false;
  if (filters.category !== "All") {
    // Category lives on menu/sales rows; fall back to allowing the order through for station/area filters.
    // Item-level category filtering is applied when building the items table from sales/lines.
  }
  return true;
}

function matchesSalesFilters(row: SalesRecord, filters: ReportFiltersState) {
  if (filters.station !== "All" && row.station !== filters.station) return false;
  if (filters.category !== "All" && row.category !== filters.category) return false;
  if (filters.cashier !== "All" && row.cashier !== filters.cashier) return false;
  if (filters.waiter !== "All" && row.waiter !== filters.waiter) return false;
  if (filters.area !== "All" && row.area !== filters.area) return false;
  if (filters.table !== "All" && row.tableNumber !== filters.table) return false;
  return true;
}

function linesAsSalesRows(order: Order): SalesRecord[] {
  const day =
    dateKeyFromDateTime(order.receiptGeneratedAt) ??
    dateKeyFromDateTime(order.receipt?.generatedAt) ??
    dateKeyFromDateTime(order.createdAtIso) ??
    "";
  return order.items.map((line, index) => {
    const unitPrice = line.unitPrice ?? 0;
    const revenue = unitPrice * line.qty;
    return {
      id: `open-${order.id}-${index}`,
      date: day,
      month: day.slice(0, 7),
      time: order.receiptGeneratedAt ?? order.receipt?.generatedAt ?? order.createdAtIso ?? "",
      orderId: order.id,
      orderNo: order.orderNo,
      receiptNumber: order.receipt?.receiptNumber ?? order.orderNo,
      productId: line.menuItemId,
      productName: line.name,
      category: "Uncategorized",
      station: line.station,
      qty: line.qty,
      unitPrice,
      unitCost: 0,
      revenue,
      expense: 0,
      profit: revenue,
      area: order.area,
      tableNumber: order.tableNumber,
      waiter: order.waiter,
      cashier: order.enteredByCashier || order.receiptGeneratedBy || "",
      paymentMethod: order.payment?.method ?? "Cash",
    };
  });
}

/**
 * Operational sales for a day or date range (week / month).
 * Includes unpaid and partially paid receipts, not only settled sales ledger rows.
 */
export function buildPeriodSalesReport(input: {
  fromDate: string;
  toDate: string;
  orders: readonly Order[];
  salesRecords: readonly SalesRecord[];
  filters: ReportFiltersState;
}): DailySalesReportData {
  const { fromDate, toDate, filters } = input;
  const singleDay = fromDate === toDate;
  const periodSales = input.salesRecords.filter(
    (row) => row.date >= fromDate && row.date <= toDate && matchesSalesFilters(row, filters),
  );

  const periodOrders = input.orders.filter((order) => {
    if (order.status === "CANCELLED") return false;
    const days = orderDayKeys(order);
    const inRange =
      days.some((day) => day >= fromDate && day <= toDate) ||
      periodSales.some((row) => row.orderId === order.id);
    if (!inRange) return false;
    const hasReceipt = Boolean(order.receipt);
    const hasSales = periodSales.some((row) => row.orderId === order.id);
    const isPaid = displayPaymentStatus(order) === "Paid";
    if (!hasReceipt && !hasSales && !isPaid) return false;
    return matchesOrderFilters(order, filters);
  });

  let totalSales = 0;
  let paid = 0;
  let unpaid = 0;
  const paymentStatus = {
    paidOrders: { count: 0, amount: 0 },
    unpaidOrders: { count: 0, amount: 0 },
    partialOrders: { count: 0, amount: 0 },
  };

  const orderRows: DailySalesOrderRow[] = periodOrders.map((order) => {
    const total = orderTotal(order);
    const paidAmount = orderPaidAmount(order);
    const balance = orderOutstandingAmount(order);
    const status = orderStatusLabel(order);

    totalSales += total;
    paid += paidAmount;
    unpaid += balance;

    if (status === "Paid") {
      paymentStatus.paidOrders.count += 1;
      paymentStatus.paidOrders.amount += paidAmount;
    } else if (status === "Partial") {
      paymentStatus.partialOrders.count += 1;
      paymentStatus.partialOrders.amount += balance;
    } else {
      paymentStatus.unpaidOrders.count += 1;
      paymentStatus.unpaidOrders.amount += balance;
    }

    return {
      id: order.id,
      orderNo: order.orderNo,
      time: formatClockLabel(
        order.paymentReceivedAt ??
          order.payment?.paymentReceivedAt ??
          order.receiptGeneratedAt ??
          order.receipt?.generatedAt ??
          order.createdAtIso,
      ),
      table: `${order.area} ${order.tableNumber}`,
      waiter: order.waiter || order.orderedByWaiter || "—",
      cashier:
        order.payment?.receivedByCashier ||
        order.enteredByCashier ||
        order.receiptGeneratedBy ||
        "—",
      total,
      paid: paidAmount,
      balance,
      status,
      href: `/app/orders?orderId=${encodeURIComponent(order.id)}`,
    };
  });

  const coveredOrderIds = new Set(periodOrders.map((order) => order.id));
  const orphanSales = periodSales.filter((row) => !row.orderId || !coveredOrderIds.has(row.orderId));
  if (orphanSales.length > 0) {
    const orphanRevenue = orphanSales.reduce((sum, row) => sum + row.revenue, 0);
    totalSales += orphanRevenue;
    paid += orphanRevenue;
  }

  const orderIdsWithSales = new Set(periodSales.map((row) => row.orderId).filter(Boolean) as string[]);
  const openItemSales = periodOrders
    .filter((order) => !orderIdsWithSales.has(order.id))
    .flatMap((order) => linesAsSalesRows(order))
    .filter((row) => matchesSalesFilters(row, filters));

  const itemSource = [...periodSales, ...openItemSales];
  const grouped = groupSalesByProduct(itemSource);
  const items: DailySalesItemRow[] = grouped
    .map((row, index) => ({
      id: `item-${index}`,
      product: row.productName,
      category: row.category,
      station: row.station,
      qty: row.qty,
      sales: Number(row.revenue.toFixed(2)),
    }))
    .sort((a, b) => b.qty - a.qty || b.sales - a.sales || a.product.localeCompare(b.product));

  const itemsSoldQty = items.reduce((sum, row) => sum + row.qty, 0);
  const trend = singleDay
    ? groupSalesByHour(itemSource.length > 0 ? itemSource : periodSales).map((row) => ({
        label: row.h,
        value: row.sales,
      }))
    : groupSalesByDate(itemSource.length > 0 ? itemSource : periodSales).map((row) => ({
        label: row.key.slice(5),
        value: row.revenue,
      }));

  orderRows.sort((a, b) => b.time.localeCompare(a.time) || b.orderNo.localeCompare(a.orderNo));

  return {
    date: fromDate,
    fromDate,
    toDate,
    totalSales: Number(totalSales.toFixed(2)),
    paid: Number(paid.toFixed(2)),
    unpaid: Number(unpaid.toFixed(2)),
    orderCount:
      periodOrders.length +
      (orphanSales.length > 0 ? new Set(orphanSales.map((r) => r.receiptNumber)).size : 0),
    itemsSoldQty: Number(itemsSoldQty.toFixed(3)),
    items,
    paymentStatus,
    trend,
    hourly: trend,
    orders: orderRows,
    isEmpty: periodOrders.length === 0 && periodSales.length === 0,
  };
}

/** @deprecated prefer buildPeriodSalesReport */
export function buildDailySalesReport(input: {
  date: string;
  orders: readonly Order[];
  salesRecords: readonly SalesRecord[];
  filters: ReportFiltersState;
}): DailySalesReportData {
  return buildPeriodSalesReport({
    fromDate: input.date,
    toDate: input.date,
    orders: input.orders,
    salesRecords: input.salesRecords,
    filters: input.filters,
  });
}
