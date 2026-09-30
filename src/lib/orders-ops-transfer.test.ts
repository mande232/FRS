import assert from "node:assert/strict";
import test from "node:test";
import type { Order } from "./demo-data.ts";
import {
  openBillsOwnedByWaiter,
  rejectOpenBillsTransferRequest,
  requestOpenBillsTransfer,
  transferOpenBillsToWaiter,
} from "./waiter-bill-transfer.ts";

function bill(partial: Partial<Order> & Pick<Order, "id" | "waiter" | "status">): Order {
  return {
    orderNo: partial.id.toUpperCase(),
    source: "Dine-in",
    ref: "Main Hall 1",
    area: "Main Hall",
    tableNumber: "1",
    orderedByWaiter: partial.waiter,
    enteredByCashier: "Cashier",
    items: [],
    stationTickets: [],
    sentAt: "10:00 AM",
    openedMin: 0,
    paymentStatus: "Unpaid",
    total: 100,
    ...partial,
  };
}

test("requestOpenBillsTransfer can target selected order ids only", () => {
  const orders: Order[] = [
    bill({ id: "open-a", waiter: "Hanna", status: "NEW" }),
    bill({ id: "open-b", waiter: "Hanna", status: "NEW", tableNumber: "4" }),
  ];
  const requested = requestOpenBillsTransfer(orders, "Hanna", "Abel", "Hanna", {
    orderIds: ["open-b"],
  });
  assert.equal(requested.ok, true);
  assert.deepEqual(requested.orderIds, ["open-b"]);
  assert.equal(requested.nextOrders.find((order) => order.id === "open-a")?.waiterTransferRequestedTo, undefined);
  assert.equal(requested.nextOrders.find((order) => order.id === "open-b")?.waiterTransferRequestedTo, "Abel");
});

test("requestOpenBillsTransfer parks bills for cashier approval", () => {
  const orders: Order[] = [
    bill({ id: "open-a", waiter: "Hanna", status: "NEW" }),
    bill({ id: "open-b", waiter: "Hanna", status: "NEW", tableNumber: "4" }),
  ];
  const requested = requestOpenBillsTransfer(orders, "Hanna", "Abel", "Hanna");
  assert.equal(requested.ok, true);
  assert.equal(requested.nextOrders.find((order) => order.id === "open-a")?.waiter, "Hanna");
  assert.equal(requested.nextOrders.find((order) => order.id === "open-a")?.waiterTransferRequestedTo, "Abel");

  const approved = transferOpenBillsToWaiter(requested.nextOrders, "Hanna", "Abel", "Cashier", {
    requirePending: true,
  });
  assert.equal(approved.ok, true);
  assert.equal(approved.nextOrders.find((order) => order.id === "open-a")?.waiter, "Abel");
  assert.equal(approved.nextOrders.find((order) => order.id === "open-a")?.waiterTransferRequestedTo, undefined);
});

test("rejectOpenBillsTransferRequest clears pending handoff", () => {
  const orders: Order[] = [
    bill({
      id: "open-a",
      waiter: "Hanna",
      status: "NEW",
      waiterTransferRequestedTo: "Abel",
      waiterTransferRequestedBy: "Hanna",
      waiterTransferRequestedAt: new Date().toISOString(),
    }),
  ];
  const rejected = rejectOpenBillsTransferRequest(orders);
  assert.equal(rejected.ok, true);
  assert.equal(rejected.nextOrders[0]?.waiterTransferRequestedTo, undefined);
  assert.equal(rejected.nextOrders[0]?.waiter, "Hanna");
});

test("openBillsOwnedByWaiter matches short and full waiter names", () => {
  const orders: Order[] = [
    bill({ id: "open-a", waiter: "Hanna Tadesse", status: "NEW" }),
    bill({ id: "open-b", waiter: "Abel", status: "NEW", tableNumber: "4" }),
  ];
  assert.deepEqual(
    openBillsOwnedByWaiter(orders, "Hanna").map((order) => order.id),
    ["open-a"],
  );
  assert.deepEqual(
    openBillsOwnedByWaiter(orders, "Hanna Tadesse").map((order) => order.id),
    ["open-a"],
  );
});

test("transferOpenBillsToWaiter moves only the leaving waitress open bills", () => {
  const orders: Order[] = [
    bill({ id: "open-a", waiter: "Hanna", status: "NEW" }),
    bill({ id: "open-b", waiter: "Hanna", status: "NEW", tableNumber: "4" }),
    bill({ id: "closed", waiter: "Hanna", status: "CLOSED" }),
    bill({ id: "other", waiter: "Abel", status: "NEW" }),
  ];

  const mine = openBillsOwnedByWaiter(orders, "Hanna");
  assert.deepEqual(
    mine.map((order) => order.id),
    ["open-a", "open-b"],
  );

  const result = transferOpenBillsToWaiter(orders, "Hanna", "Abel", "Liya");
  assert.equal(result.ok, true);
  assert.deepEqual(result.orderIds, ["open-a", "open-b"]);
  assert.equal(result.nextOrders.find((order) => order.id === "open-a")?.waiter, "Abel");
  assert.equal(result.nextOrders.find((order) => order.id === "open-b")?.waiter, "Abel");
  assert.equal(result.nextOrders.find((order) => order.id === "closed")?.waiter, "Hanna");
  assert.equal(result.nextOrders.find((order) => order.id === "other")?.waiter, "Abel");
  assert.equal(result.nextOrders.find((order) => order.id === "open-a")?.orderedByWaiter, "Hanna");
  const audit = result.nextOrders.find((order) => order.id === "open-a")?.waiterTransfers ?? [];
  assert.equal(audit.length, 1);
  assert.equal(audit[0]?.fromWaiter, "Hanna");
  assert.equal(audit[0]?.toWaiter, "Abel");
  assert.equal(audit[0]?.actor, "Liya");
});

test("transferOpenBillsToWaiter rejects same waitress or empty handoff", () => {
  const orders = [bill({ id: "open-a", waiter: "Hanna", status: "NEW" })];
  assert.equal(transferOpenBillsToWaiter(orders, "Hanna", "Hanna").ok, false);
  assert.equal(transferOpenBillsToWaiter(orders, "Abel", "Hanna").ok, false);
});
