import assert from "node:assert/strict";
import test from "node:test";
import type { Order, OrderLine } from "./demo-data.ts";
import {
  buildOrdersByStatusReport,
  operationalLifecycle,
  operationalPaymentLabel,
} from "./orders-by-status-report.ts";
import { defaultReportFilters } from "./reports-query.ts";

function line(name: string, qty = 1, price = 100): OrderLine {
  return { name, qty, done: false, station: "Kitchen", unitPrice: price };
}

function order(partial: Partial<Order> & Pick<Order, "id" | "orderNo" | "status" | "paymentStatus">): Order {
  const items = partial.items ?? [line("Tibs", 2, 350)];
  return {
    source: "Dine-in",
    ref: "Main Hall 1",
    area: "Main Hall",
    tableNumber: "1",
    orderedByWaiter: "Emebet",
    waiter: "Emebet",
    enteredByCashier: "Hanna",
    server: "Emebet",
    stationTickets: [],
    sentAt: "8:00 PM",
    openedMin: 0,
    total: items.reduce((sum, item) => sum + (item.unitPrice ?? 0) * item.qty, 0),
    createdAtIso: "2026-09-22T17:00:00.000Z",
    items,
    ...partial,
  };
}

test("operational labels map NEW to Open and separate payment", () => {
  const open = order({ id: "1", orderNo: "ORD-1", status: "NEW", paymentStatus: "Unpaid" });
  const receipt = order({
    id: "2",
    orderNo: "ORD-2",
    status: "RECEIPT_GENERATED",
    paymentStatus: "Unpaid",
    receiptGeneratedAt: "2026-09-22T18:00:00.000Z",
  });
  assert.equal(operationalLifecycle(open), "Open");
  assert.equal(operationalLifecycle(receipt), "Receipt Generated");
  assert.equal(operationalPaymentLabel(open), "Unpaid");
});

test("buildOrdersByStatusReport prioritizes open unpaid and tracks outstanding", () => {
  const openUnpaid = order({
    id: "o1",
    orderNo: "ORD-1680",
    status: "NEW",
    paymentStatus: "Unpaid",
    createdAtIso: "2026-09-22T17:42:00.000Z",
    items: [line("Habesha", 4, 120)],
  });
  const closedPaid = order({
    id: "o2",
    orderNo: "ORD-1600",
    status: "CLOSED",
    paymentStatus: "Paid",
    createdAtIso: "2026-09-22T12:00:00.000Z",
    paymentReceivedAt: "2026-09-22T12:10:00.000Z",
    receipt: {
      receiptNumber: "R1",
      generatedAt: "2026-09-22T12:05:00.000Z",
      generatedBy: "Hanna",
      restaurantName: "Test",
      branchName: "HQ",
      subtotal: 600,
      vat: 0,
      vatRate: 0,
      serviceChargeEnabled: false,
      serviceCharge: 0,
      grandTotal: 600,
      printCount: 1,
    },
    payment: {
      method: "Cash",
      amountDue: 600,
      amountReceived: 600,
      changeDue: 0,
      receiptNumber: "R1",
      receivedByCashier: "Hanna",
      paymentReceivedAt: "2026-09-22T12:10:00.000Z",
      closedAt: "2026-09-22T12:10:00.000Z",
    },
    items: [line("Coffee", 4, 150)],
  });

  const report = buildOrdersByStatusReport({
    orders: [closedPaid, openUnpaid],
    filters: {
      ...defaultReportFilters(),
      preset: "today",
      fromDate: "2026-09-22",
      toDate: "2026-09-22",
    },
  });

  assert.equal(report.orders[0]?.orderNo, "ORD-1680");
  assert.equal(report.openCount, 1);
  assert.equal(report.closedCount, 1);
  assert.ok(report.outstanding >= 480);
  assert.equal(report.lifecycleCounts.Open, 1);
  assert.equal(report.byWaiter[0]?.waiter, "Emebet");
});

test("buildOrdersByStatusReport excludes cancelled orders from total value", () => {
  const openUnpaid = order({
    id: "o1",
    orderNo: "ORD-1",
    status: "NEW",
    paymentStatus: "Unpaid",
    createdAtIso: "2026-09-22T17:00:00.000Z",
    items: [line("Water", 1, 60)],
  });
  const cancelled = order({
    id: "o2",
    orderNo: "ORD-2",
    status: "CANCELLED",
    paymentStatus: "Unpaid",
    createdAtIso: "2026-09-22T17:05:00.000Z",
    items: [line("Beer", 1, 120)],
  });

  const report = buildOrdersByStatusReport({
    orders: [openUnpaid, cancelled],
    filters: {
      ...defaultReportFilters(),
      preset: "today",
      fromDate: "2026-09-22",
      toDate: "2026-09-22",
    },
  });

  assert.equal(report.totalOrders, 2);
  assert.equal(report.openCount, 1);
  assert.equal(report.lifecycleCounts.Cancelled, 1);
  assert.equal(report.totalValue, 60);
  assert.equal(report.outstanding, 60);
  assert.equal(report.byWaiter[0]?.sales, 60);
});
