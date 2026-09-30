import assert from "node:assert/strict";
import test from "node:test";
import type { Order, OrderLine, SalesRecord } from "./demo-data.ts";
import { buildDailySalesReport } from "./daily-sales-report.ts";
import { defaultReportFilters } from "./reports-query.ts";

function line(partial: Partial<OrderLine> & Pick<OrderLine, "name" | "station" | "qty">): OrderLine {
  return {
    done: false,
    unitPrice: 100,
    ...partial,
  };
}

function order(partial: Partial<Order> & Pick<Order, "id" | "orderNo" | "items">): Order {
  return {
    source: "Dine-in",
    ref: "Main Hall 1",
    area: "Main Hall",
    tableNumber: "1",
    orderedByWaiter: "Abel",
    waiter: "Abel",
    enteredByCashier: "Hanna",
    server: "Abel",
    stationTickets: [],
    sentAt: "8:00 PM",
    openedMin: 0,
    status: "RECEIPT_GENERATED",
    paymentStatus: "Unpaid",
    total: partial.items.reduce((sum, item) => sum + (item.unitPrice ?? 0) * item.qty, 0),
    ...partial,
  };
}

test("buildDailySalesReport splits paid unpaid and partial correctly", () => {
  const beer = line({ name: "Habesha Beer", station: "Main Bar", qty: 2, unitPrice: 120 });
  const unpaid = order({
    id: "o1",
    orderNo: "ORD-1",
    items: [beer],
    receiptGeneratedAt: "2026-09-22T10:00:00.000Z",
    receipt: {
      receiptNumber: "R-1",
      generatedAt: "2026-09-22T10:00:00.000Z",
      generatedBy: "Hanna",
      restaurantName: "Test",
      branchName: "HQ",
      subtotal: 240,
      vat: 0,
      vatRate: 0,
      serviceChargeEnabled: false,
      serviceCharge: 0,
      grandTotal: 240,
      printCount: 0,
    },
    paymentStatus: "Unpaid",
  });

  const tibs = line({ name: "Tibs", station: "Kitchen", qty: 1, unitPrice: 1500 });
  const partial = order({
    id: "o2",
    orderNo: "ORD-2",
    items: [tibs],
    receiptGeneratedAt: "2026-09-22T11:00:00.000Z",
    receipt: {
      receiptNumber: "R-2",
      generatedAt: "2026-09-22T11:00:00.000Z",
      generatedBy: "Hanna",
      restaurantName: "Test",
      branchName: "HQ",
      subtotal: 1500,
      vat: 0,
      vatRate: 0,
      serviceChargeEnabled: false,
      serviceCharge: 0,
      grandTotal: 1500,
      printCount: 0,
    },
    paymentStatus: "Partially Paid",
    payment: {
      method: "Cash",
      amountDue: 1500,
      amountReceived: 1000,
      changeDue: 0,
      receiptNumber: "R-2",
      receivedByCashier: "Hanna",
      paymentReceivedAt: "2026-09-22T11:30:00.000Z",
      closedAt: "2026-09-22T11:30:00.000Z",
    },
  });

  const paidSales: SalesRecord[] = [
    {
      id: "s1",
      date: "2026-09-22",
      month: "2026-09",
      time: "12:00 PM",
      orderId: "o3",
      orderNo: "ORD-3",
      receiptNumber: "R-3",
      productName: "Coffee",
      category: "Hot Drinks",
      station: "Coffee House",
      qty: 3,
      unitPrice: 50,
      unitCost: 10,
      revenue: 150,
      expense: 30,
      profit: 120,
      area: "Main Hall",
      tableNumber: "4",
      waiter: "Genet",
      cashier: "Hanna",
      paymentMethod: "Cash",
    },
  ];

  const paid = order({
    id: "o3",
    orderNo: "ORD-3",
    items: [line({ name: "Coffee", station: "Coffee House", qty: 3, unitPrice: 50 })],
    status: "CLOSED",
    paymentStatus: "Paid",
    receiptGeneratedAt: "2026-09-22T12:00:00.000Z",
    paymentReceivedAt: "2026-09-22T12:05:00.000Z",
    receipt: {
      receiptNumber: "R-3",
      generatedAt: "2026-09-22T12:00:00.000Z",
      generatedBy: "Hanna",
      restaurantName: "Test",
      branchName: "HQ",
      subtotal: 150,
      vat: 0,
      vatRate: 0,
      serviceChargeEnabled: false,
      serviceCharge: 0,
      grandTotal: 150,
      printCount: 1,
    },
    payment: {
      method: "Cash",
      amountDue: 150,
      amountReceived: 150,
      changeDue: 0,
      receiptNumber: "R-3",
      receivedByCashier: "Hanna",
      paymentReceivedAt: "2026-09-22T12:05:00.000Z",
      closedAt: "2026-09-22T12:05:00.000Z",
    },
  });

  const report = buildDailySalesReport({
    date: "2026-09-22",
    orders: [unpaid, partial, paid],
    salesRecords: paidSales,
    filters: { ...defaultReportFilters(), fromDate: "2026-09-22", toDate: "2026-09-22" },
  });

  assert.equal(report.totalSales, 240 + 1500 + 150);
  assert.equal(report.paid, 1000 + 150);
  assert.equal(report.unpaid, 240 + 500);
  assert.equal(report.orderCount, 3);
  assert.equal(report.paymentStatus.unpaidOrders.count, 1);
  assert.equal(report.paymentStatus.partialOrders.count, 1);
  assert.equal(report.paymentStatus.paidOrders.count, 1);
  assert.ok(report.items.some((row) => row.product === "Habesha Beer" && row.qty === 2));
  assert.ok(report.items.some((row) => row.product === "Coffee" && row.qty === 3));
  assert.equal(report.isEmpty, false);
});

test("buildPeriodSalesReport aggregates a week range with daily trend", async () => {
  const { buildPeriodSalesReport } = await import("./daily-sales-report.ts");
  const day1 = order({
    id: "w1",
    orderNo: "ORD-W1",
    items: [line({ name: "Beer", station: "Main Bar", qty: 1, unitPrice: 100 })],
    receiptGeneratedAt: "2026-09-21T10:00:00.000Z",
    receipt: {
      receiptNumber: "R-W1",
      generatedAt: "2026-09-21T10:00:00.000Z",
      generatedBy: "Hanna",
      restaurantName: "Test",
      branchName: "HQ",
      subtotal: 100,
      vat: 0,
      vatRate: 0,
      serviceChargeEnabled: false,
      serviceCharge: 0,
      grandTotal: 100,
      printCount: 0,
    },
    paymentStatus: "Unpaid",
  });
  const day2 = order({
    id: "w2",
    orderNo: "ORD-W2",
    items: [line({ name: "Tibs", station: "Kitchen", qty: 1, unitPrice: 200 })],
    receiptGeneratedAt: "2026-09-22T10:00:00.000Z",
    receipt: {
      receiptNumber: "R-W2",
      generatedAt: "2026-09-22T10:00:00.000Z",
      generatedBy: "Hanna",
      restaurantName: "Test",
      branchName: "HQ",
      subtotal: 200,
      vat: 0,
      vatRate: 0,
      serviceChargeEnabled: false,
      serviceCharge: 0,
      grandTotal: 200,
      printCount: 0,
    },
    paymentStatus: "Unpaid",
  });

  const report = buildPeriodSalesReport({
    fromDate: "2026-09-21",
    toDate: "2026-09-27",
    orders: [day1, day2],
    salesRecords: [],
    filters: { ...defaultReportFilters(), fromDate: "2026-09-21", toDate: "2026-09-27" },
  });

  assert.equal(report.totalSales, 300);
  assert.equal(report.unpaid, 300);
  assert.equal(report.orderCount, 2);
  assert.ok(report.trend.length >= 1);
  assert.equal(report.fromDate, "2026-09-21");
  assert.equal(report.toDate, "2026-09-27");
});
