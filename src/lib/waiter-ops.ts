import { isFinalOrderStatus, type Order, type SalesRecord } from "./demo-data.ts";
import { dateKey, dateKeyFromDateTime, salesRecordTimestamp } from "./sales-analytics.ts";
import { openBillsOwnedByWaiter } from "./waiter-bill-transfer.ts";

export const WAITER_CLOSINGS_MODULE_KEY = "waiter-closings";

export type WaiterClosingLine = {
  name: string;
  qty: number;
  amount: number;
};

export type WaiterClosingOrderRow = {
  id: string;
  orderNo: string;
  area: string;
  tableNumber: string;
  status: string;
  paymentStatus: string;
  total: number;
  time: string;
  served: boolean;
  items: WaiterClosingLine[];
};

export type WaiterClosingTableRow = {
  area: string;
  tableNumber: string;
  orderCount: number;
  servedCount: number;
  total: number;
};

export type WaiterClosingSheet = {
  waiter: string;
  date: string;
  generatedAt: string;
  orders: WaiterClosingOrderRow[];
  tables: WaiterClosingTableRow[];
  items: WaiterClosingLine[];
  servedCount: number;
  closedCount: number;
  cancelledCount: number;
  returnedCount: number;
};

export type WaiterClosingRecord = {
  id: string;
  waiter: string;
  date: string;
  closedAt: string;
  ordersCreated: number;
  openBillsAtClose: number;
  openBillValue: number;
  grossSales: number;
  collectedSales: number;
  voidsReturns: number;
  note?: string;
  sheet?: WaiterClosingSheet;
};

export type WaiterDaySummary = {
  waiter: string;
  date: string;
  ordersCreated: number;
  openBills: number;
  openBillValue: number;
  grossSales: number;
  collectedSales: number;
  collectedReceipts: number;
  voidsReturns: number;
  itemsSold: number;
};

function namesMatch(left?: string | null, right?: string | null) {
  return (left ?? "").trim().toLowerCase() === (right ?? "").trim().toLowerCase();
}

function orderBelongsToWaiter(order: Order, waiter: string) {
  return namesMatch(order.orderedByWaiter, waiter) || namesMatch(order.waiter, waiter);
}

function orderDateKey(order: Order) {
  return (
    dateKeyFromDateTime(order.createdAtIso) ??
    dateKeyFromDateTime(order.cashierAcceptedAt) ??
    dateKeyFromDateTime(order.requestedAt) ??
    dateKeyFromDateTime(order.sentAt) ??
    dateKey()
  );
}

function orderTimestamp(order: Order) {
  return order.createdAtIso || order.cashierAcceptedAt || order.requestedAt || order.sentAt || "";
}

function orderIsServed(order: Order) {
  if (order.status === "CLOSED" || order.status === "RECEIPT_GENERATED") return true;
  if (order.paymentStatus === "Paid") return true;
  return order.status === "READY TO SERVE";
}

export function waiterDayOrders(
  orders: readonly Order[],
  waiter: string,
  date = dateKey(),
  afterIso?: string,
) {
  const name = waiter.trim();
  const cutoff = afterIso ? Date.parse(afterIso) : Number.NaN;
  return orders
    .filter((order) => orderBelongsToWaiter(order, name) && orderDateKey(order) === date)
    .filter((order) => {
      if (!Number.isFinite(cutoff)) return true;
      const stamp = Date.parse(orderTimestamp(order));
      if (!Number.isFinite(stamp)) return false;
      return stamp > cutoff;
    })
    .sort((a, b) => orderTimestamp(a).localeCompare(orderTimestamp(b)));
}

export function lastWaiterClosingToday(
  closings: readonly WaiterClosingRecord[],
  waiter: string,
  date = dateKey(),
) {
  return todayWaiterClosing(closings, waiter, date);
}

function salesInWaiterSession(
  salesRecords: readonly SalesRecord[],
  waiter: string,
  date: string,
  afterIso?: string,
) {
  return salesRecords.filter((row) => {
    if (row.date !== date || !namesMatch(row.waiter, waiter)) return false;
    if (!afterIso) return true;
    // Same cutoff rules as cashier/dashboard buildDashboardTodaySlice.
    return salesRecordTimestamp(row) > afterIso;
  });
}

export function buildWaiterClosingSheet(
  orders: readonly Order[],
  waiter: string,
  date = dateKey(),
  afterIso?: string,
  salesRecords: readonly SalesRecord[] = [],
): WaiterClosingSheet {
  const name = waiter.trim();
  const dayOrders = waiterDayOrders(orders, name, date, afterIso);
  const openBills = openBillsOwnedByWaiter(orders, name);
  const collectedSales = salesInWaiterSession(salesRecords, name, date, afterIso);

  // Prefer paid sales lines for the receipt body; fall back to day orders when sales are empty.
  const orderRows: WaiterClosingOrderRow[] = (() => {
    if (collectedSales.length > 0) {
      const byOrder = new Map<string, WaiterClosingOrderRow>();
      for (const sale of collectedSales) {
        const orderId = sale.orderId || sale.receiptNumber || `${sale.area}-${sale.tableNumber}-${sale.time}`;
        const current = byOrder.get(orderId) ?? {
          id: orderId,
          orderNo: sale.orderNo || sale.receiptNumber,
          area: sale.area,
          tableNumber: sale.tableNumber,
          status: "CLOSED",
          paymentStatus: "Paid",
          total: 0,
          time: sale.time,
          served: true,
          items: [],
        };
        current.total += sale.revenue;
        current.items.push({
          name: sale.productName,
          qty: sale.qty,
          amount: sale.revenue,
        });
        byOrder.set(orderId, current);
      }

      // Keep still-open bills on the sheet so waiters can see unfinished tables.
      for (const order of openBills) {
        if (byOrder.has(order.id)) continue;
        byOrder.set(order.id, {
          id: order.id,
          orderNo: order.orderNo,
          area: order.area,
          tableNumber: order.tableNumber,
          status: order.status,
          paymentStatus: order.paymentStatus,
          total: order.total,
          time: orderTimestamp(order),
          served: false,
          items: order.items.map((line) => ({
            name: line.name,
            qty: line.qty,
            amount: (line.unitPrice ?? 0) * line.qty,
          })),
        });
      }

      return [...byOrder.values()].sort((a, b) => a.time.localeCompare(b.time));
    }

    const merged = new Map<string, Order>();
    for (const order of [...dayOrders, ...openBills]) merged.set(order.id, order);
    return [...merged.values()]
      .sort((a, b) => orderTimestamp(a).localeCompare(orderTimestamp(b)))
      .map((order) => ({
        id: order.id,
        orderNo: order.orderNo,
        area: order.area,
        tableNumber: order.tableNumber,
        status: order.status,
        paymentStatus: order.paymentStatus,
        total: order.total,
        time: orderTimestamp(order),
        served: orderIsServed(order),
        items: order.items.map((line) => ({
          name: line.name,
          qty: line.qty,
          amount: (line.unitPrice ?? 0) * line.qty,
        })),
      }));
  })();

  const tablesMap = new Map<string, WaiterClosingTableRow>();
  for (const row of orderRows) {
    const key = `${row.area}::${row.tableNumber}`;
    const current = tablesMap.get(key) ?? {
      area: row.area,
      tableNumber: row.tableNumber,
      orderCount: 0,
      servedCount: 0,
      total: 0,
    };
    current.orderCount += 1;
    if (row.served) current.servedCount += 1;
    current.total += row.total;
    tablesMap.set(key, current);
  }

  const itemsMap = new Map<string, WaiterClosingLine>();
  for (const row of orderRows) {
    if (row.status === "CANCELLED") continue;
    for (const line of row.items) {
      const key = line.name.trim().toLowerCase();
      const current = itemsMap.get(key) ?? { name: line.name, qty: 0, amount: 0 };
      current.qty += line.qty;
      current.amount += line.amount;
      itemsMap.set(key, current);
    }
  }

  return {
    waiter: name,
    date,
    generatedAt: new Date().toISOString(),
    orders: orderRows,
    tables: [...tablesMap.values()].sort(
      (a, b) => a.area.localeCompare(b.area) || a.tableNumber.localeCompare(b.tableNumber, undefined, { numeric: true }),
    ),
    items: [...itemsMap.values()].sort((a, b) => b.amount - a.amount),
    servedCount: orderRows.filter((row) => row.served).length,
    closedCount: orderRows.filter((row) => row.status === "CLOSED").length,
    cancelledCount: orderRows.filter((row) => row.status === "CANCELLED").length,
    returnedCount: orderRows.filter((row) => row.status === "RETURNED").length,
  };
}

export function summarizeWaiterDay(
  orders: readonly Order[],
  salesRecords: readonly SalesRecord[],
  waiter: string,
  date = dateKey(),
  afterIso?: string,
): WaiterDaySummary {
  const name = waiter.trim();
  const dayOrders = waiterDayOrders(orders, name, date, afterIso);
  const openBills = openBillsOwnedByWaiter(orders, name);
  const collected = salesInWaiterSession(salesRecords, name, date, afterIso);
  const voidsReturns = dayOrders
    .filter((order) => order.status === "CANCELLED" || order.status === "RETURNED")
    .reduce((sum, order) => sum + order.total, 0);
  const grossSales = dayOrders.reduce((sum, order) => sum + order.total, 0);
  const collectedSales = collected.reduce((sum, row) => sum + row.revenue, 0);
  const collectedReceipts = new Set(collected.map((row) => row.receiptNumber)).size;
  const itemsSold = collected.reduce((sum, row) => sum + row.qty, 0);

  return {
    waiter: name,
    date,
    ordersCreated: dayOrders.length,
    openBills: openBills.length,
    openBillValue: openBills.reduce((sum, order) => sum + order.total, 0),
    grossSales,
    collectedSales,
    collectedReceipts,
    voidsReturns,
    itemsSold,
  };
}

export function waiterClosingBlockers(orders: readonly Order[], waiter: string) {
  return openBillsOwnedByWaiter(orders, waiter).map((order) => ({
    orderId: order.id,
    orderNo: order.orderNo,
    area: order.area,
    tableNumber: order.tableNumber,
    total: order.total,
    paymentStatus: order.paymentStatus,
  }));
}

export function hasWaiterClosedToday(
  closings: readonly WaiterClosingRecord[],
  waiter: string,
  date = dateKey(),
) {
  return closings.some((row) => row.date === date && namesMatch(row.waiter, waiter));
}

export function todayWaiterClosing(
  closings: readonly WaiterClosingRecord[],
  waiter: string,
  date = dateKey(),
) {
  const matches = closings.filter((row) => row.date === date && namesMatch(row.waiter, waiter));
  if (matches.length === 0) return null;
  return matches.sort((a, b) => b.closedAt.localeCompare(a.closedAt))[0] ?? null;
}

export function buildWaiterClosingRecord(
  summary: WaiterDaySummary,
  note?: string,
  sheet?: WaiterClosingSheet,
): WaiterClosingRecord {
  const closedAt = new Date().toISOString();
  return {
    id: `wc-${summary.date}-${summary.waiter.trim().toLowerCase().replace(/\s+/g, "-")}`,
    waiter: summary.waiter,
    date: summary.date,
    closedAt,
    ordersCreated: summary.ordersCreated,
    openBillsAtClose: summary.openBills,
    openBillValue: summary.openBillValue,
    grossSales: summary.grossSales,
    collectedSales: summary.collectedSales,
    voidsReturns: summary.voidsReturns,
    note: note?.trim() || undefined,
    sheet: sheet
      ? { ...sheet, generatedAt: closedAt }
      : undefined,
  };
}
