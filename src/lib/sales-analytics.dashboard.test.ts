import assert from "node:assert/strict";
import test from "node:test";
import type { PaymentLedgerEntry, SalesRecord } from "./demo-data.ts";
import { activeReportDate, buildDashboardTodaySlice } from "./sales-analytics.ts";

function sale(partial: Partial<SalesRecord> & Pick<SalesRecord, "date" | "time" | "revenue">): SalesRecord {
  return {
    id: partial.id ?? `sale-${partial.date}-${partial.time}`,
    date: partial.date,
    month: partial.date.slice(0, 7),
    time: partial.time,
    receiptNumber: partial.receiptNumber ?? `R-${partial.date}`,
    productName: partial.productName ?? "Item",
    category: partial.category ?? "Food",
    station: partial.station ?? "Kitchen",
    qty: partial.qty ?? 1,
    unitPrice: partial.unitPrice ?? partial.revenue,
    unitCost: partial.unitCost ?? 0,
    revenue: partial.revenue,
    expense: partial.expense ?? 0,
    profit: partial.profit ?? partial.revenue,
    area: partial.area ?? "Hall",
    tableNumber: partial.tableNumber ?? "1",
    waiter: partial.waiter ?? "Waiter",
    cashier: partial.cashier ?? "Cashier",
    paymentMethod: partial.paymentMethod ?? "Cash",
  };
}

function payment(
  partial: Partial<PaymentLedgerEntry> & Pick<PaymentLedgerEntry, "amount" | "paymentReceivedAt">,
): PaymentLedgerEntry {
  return {
    id: partial.id ?? `pay-${partial.paymentReceivedAt}`,
    ref: partial.ref ?? "REF",
    method: partial.method ?? "Cash",
    amount: partial.amount,
    table: partial.table ?? "1",
    cashier: partial.cashier ?? "Cashier",
    time: partial.time ?? partial.paymentReceivedAt,
    status: partial.status ?? "Settled",
    paymentReceivedAt: partial.paymentReceivedAt,
  };
}

test("activeReportDate falls back to latest day — dashboard must not use that for Today", () => {
  const sales = [sale({ date: "2026-09-10", time: "2026-09-10T12:00:00.000Z", revenue: 500 })];
  assert.equal(activeReportDate(sales, [], [], "2026-09-12"), "2026-09-10");
});

test("buildDashboardTodaySlice uses calendar today only (no past-day fallback)", () => {
  const sales = [
    sale({ date: "2026-09-10", time: "2026-09-10T12:00:00.000Z", revenue: 500 }),
    sale({ date: "2026-09-12", time: "2026-09-12T10:00:00.000Z", revenue: 80 }),
  ];
  const slice = buildDashboardTodaySlice(sales, [], [], [], { today: "2026-09-12" });
  assert.equal(slice.summary.revenue, 80);
  assert.equal(slice.today, "2026-09-12");
});

test("buildDashboardTodaySlice resets after daily closing", () => {
  const sales = [
    sale({ date: "2026-09-12", time: "2026-09-12T08:00:00.000Z", revenue: 200 }),
    sale({ date: "2026-09-12", time: "2026-09-12T14:00:00.000Z", revenue: 50 }),
  ];
  const payments = [
    payment({ amount: 200, paymentReceivedAt: "2026-09-12T08:05:00.000Z" }),
    payment({ amount: 50, paymentReceivedAt: "2026-09-12T14:05:00.000Z" }),
  ];
  const closings = [
    { date: "2026-09-12", location: "Main Bar", closedAt: "2026-09-12T12:00:00.000Z" },
  ];
  const slice = buildDashboardTodaySlice(sales, [], payments, closings, { today: "2026-09-12" });
  assert.equal(slice.periodStart, "2026-09-12T12:00:00.000Z");
  assert.equal(slice.summary.revenue, 50);
  assert.equal(slice.payments.length, 1);
  assert.equal(slice.payments[0]?.amount, 50);
});

test("buildDashboardTodaySlice uses any location closing for all workspaces/roles", () => {
  const sales = [
    sale({ date: "2026-09-12", time: "2026-09-12T08:00:00.000Z", revenue: 120, station: "Kitchen" }),
    sale({ date: "2026-09-12", time: "2026-09-12T15:00:00.000Z", revenue: 40, station: "Kitchen" }),
  ];
  const closings = [
    { date: "2026-09-12", location: "VIP Bar", closedAt: "2026-09-12T12:00:00.000Z" },
  ];
  const slice = buildDashboardTodaySlice(sales, [], [], closings, {
    today: "2026-09-12",
    workspace: "Kitchen",
  });
  assert.equal(slice.periodStart, "2026-09-12T12:00:00.000Z");
  assert.equal(slice.summary.revenue, 40);
});

test("buildDashboardTodaySlice shows zero when today has no sales", () => {
  const sales = [sale({ date: "2026-09-10", time: "2026-09-10T12:00:00.000Z", revenue: 900 })];
  const slice = buildDashboardTodaySlice(sales, [], [], [], { today: "2026-09-12" });
  assert.equal(slice.summary.revenue, 0);
  assert.equal(slice.sales.length, 0);
});
