import assert from "node:assert/strict";
import test from "node:test";
import type { Order } from "./demo-data.ts";
import { isOrderToday, parseOrderDayKey, filterOrdersForDashboardToday } from "./orders-ops.ts";

function order(partial: Partial<Order> & Pick<Order, "id" | "sentAt">): Order {
  return {
    id: partial.id,
    orderNo: partial.orderNo ?? partial.id,
    source: partial.source ?? "Dine-in",
    ref: partial.ref ?? partial.id,
    area: partial.area ?? "Hall",
    tableNumber: partial.tableNumber ?? "1",
    orderedByWaiter: partial.orderedByWaiter ?? "Waiter",
    waiter: partial.waiter ?? "Waiter",
    enteredByCashier: partial.enteredByCashier ?? "Cashier",
    items: partial.items ?? [],
    stationTickets: partial.stationTickets ?? [],
    sentAt: partial.sentAt,
    requestedAt: partial.requestedAt,
    createdAtIso: partial.createdAtIso,
    cashierAcceptedAt: partial.cashierAcceptedAt,
    status: partial.status ?? "NEW",
    paymentStatus: partial.paymentStatus ?? "Unpaid",
    openedMin: partial.openedMin ?? 0,
    total: partial.total ?? 100,
  };
}

test("parseOrderDayKey uses local calendar day from createdAtIso (not UTC)", () => {
  // 2026-09-12 01:30 Addis (UTC+3) == 2026-09-11T22:30:00.000Z
  const row = order({
    id: "o1",
    sentAt: "1:30 AM",
    createdAtIso: "2026-09-11T22:30:00.000Z",
  });
  assert.equal(parseOrderDayKey(row), "2026-09-12");
});

test("isOrderToday does not treat clock-only sentAt as today", () => {
  const row = order({ id: "o2", sentAt: "10:00 AM" });
  assert.equal(parseOrderDayKey(row), null);
  assert.equal(isOrderToday(row, new Date("2026-09-12T12:00:00+03:00")), false);
});

test("isOrderToday matches local business today", () => {
  const row = order({
    id: "o3",
    sentAt: "10:00 AM",
    createdAtIso: "2026-09-12T07:00:00.000Z",
  });
  assert.equal(isOrderToday(row, new Date("2026-09-12T12:00:00+03:00")), true);
  assert.equal(isOrderToday(row, new Date("2026-09-11T12:00:00+03:00")), false);
});

test("filterOrdersForDashboardToday excludes past days and pre-closing orders", () => {
  const rows = [
    order({ id: "old", sentAt: "noon", createdAtIso: "2026-09-11T10:00:00.000Z" }),
    order({ id: "pre", sentAt: "morning", createdAtIso: "2026-09-12T06:00:00.000Z" }),
    order({ id: "post", sentAt: "afternoon", createdAtIso: "2026-09-12T14:00:00.000Z" }),
    order({ id: "nodate", sentAt: "9:00 AM" }),
  ];
  const today = filterOrdersForDashboardToday(rows, {
    now: new Date("2026-09-12T18:00:00+03:00"),
    periodStart: "2026-09-12T12:00:00.000Z",
  });
  assert.deepEqual(
    today.map((row) => row.id),
    ["post"],
  );
});

test("matchesOpenBillDayScope keeps today clean and parks prior/undated", async () => {
  const { matchesOpenBillDayScope } = await import("./orders-ops.ts");
  const today = "2026-09-12";
  const live = order({ id: "live", sentAt: "noon", createdAtIso: "2026-09-12T10:00:00.000Z" });
  const old = order({ id: "old", sentAt: "noon", createdAtIso: "2026-09-11T10:00:00.000Z" });
  const undated = order({ id: "nodate", sentAt: "9:00 AM" });
  assert.equal(matchesOpenBillDayScope(live, "today", today), true);
  assert.equal(matchesOpenBillDayScope(old, "today", today), false);
  assert.equal(matchesOpenBillDayScope(undated, "today", today), false);
  assert.equal(matchesOpenBillDayScope(old, "prior", today), true);
  assert.equal(matchesOpenBillDayScope(undated, "prior", today), true);
  assert.equal(matchesOpenBillDayScope(live, "all", today), true);
});
