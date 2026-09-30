import assert from "node:assert/strict";
import test from "node:test";
import type { SalesRecord } from "./demo-data.ts";
import { summarizeWaiterDay } from "./waiter-ops.ts";

function sale(partial: Partial<SalesRecord> & Pick<SalesRecord, "date" | "time" | "revenue" | "waiter">): SalesRecord {
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
    waiter: partial.waiter,
    cashier: partial.cashier ?? "Cashier",
    paymentMethod: partial.paymentMethod ?? "Cash",
  };
}

test("waiter collected sales reset after branch cash-up cutoff", () => {
  const sales = [
    sale({
      date: "2026-09-14",
      time: "2026-09-14T08:00:00.000Z",
      revenue: 200,
      waiter: "Abebe",
    }),
    sale({
      date: "2026-09-14",
      time: "2026-09-14T14:00:00.000Z",
      revenue: 75,
      waiter: "Abebe",
    }),
  ];
  const summary = summarizeWaiterDay(
    [],
    sales,
    "Abebe",
    "2026-09-14",
    "2026-09-14T12:00:00.000Z",
  );
  assert.equal(summary.collectedSales, 75);
  assert.equal(summary.collectedReceipts, 1);
});

test("waiter collected sales drop clock-time rows before cash-up", () => {
  const sales = [
    sale({ date: "2026-09-14", time: "09:30", revenue: 120, waiter: "Abebe" }),
    sale({ date: "2026-09-14", time: "15:10", revenue: 40, waiter: "Abebe" }),
  ];
  const summary = summarizeWaiterDay(
    [],
    sales,
    "Abebe",
    "2026-09-14",
    "2026-09-14T12:00:00.000Z",
  );
  assert.equal(summary.collectedSales, 40);
});
