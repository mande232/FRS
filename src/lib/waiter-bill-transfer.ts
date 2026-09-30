import { isFinalOrderStatus, type Order, type WaiterTransferAudit } from "./demo-data.ts";
import { assignedWaiterMatches } from "./waiter-identity.ts";

export function openBillsOwnedByWaiter(orders: readonly Order[], waiter: string) {
  const name = waiter.trim();
  if (!name) return [];
  return orders.filter(
    (order) => !isFinalOrderStatus(order.status) && assignedWaiterMatches(order.waiter, name),
  );
}

export function ordersWithPendingWaiterTransfer(orders: readonly Order[]) {
  return orders.filter(
    (order) =>
      !isFinalOrderStatus(order.status) &&
      Boolean(order.waiterTransferRequestedTo?.trim()) &&
      Boolean(order.waiterTransferRequestedBy?.trim()),
  );
}

function makeTransferAudit(
  order: Order,
  fromWaiter: string,
  toWaiter: string,
  actor: string,
  stamp: string,
  index: number,
): WaiterTransferAudit {
  return {
    id: `wt-${order.id}-${stamp}-${index}`,
    at: stamp,
    fromWaiter,
    toWaiter,
    actor,
    orderNo: order.orderNo,
    area: order.area,
    tableNumber: order.tableNumber,
  };
}

function clearTransferRequest(order: Order): Order {
  const next = { ...order };
  delete next.waiterTransferRequestedTo;
  delete next.waiterTransferRequestedBy;
  delete next.waiterTransferRequestedAt;
  return next;
}

function sameWaiter(left: string, right: string) {
  return assignedWaiterMatches(left, right) || assignedWaiterMatches(right, left);
}

/** Waiter asks cashier/manager to move open bills to another waiter. */
export function requestOpenBillsTransfer(
  orders: readonly Order[],
  fromWaiter: string,
  toWaiter: string,
  actor = "",
  options?: { orderIds?: readonly string[] },
): { ok: boolean; error?: string; orderIds: string[]; nextOrders: Order[] } {
  const from = fromWaiter.trim();
  const to = toWaiter.trim();
  const requestedBy = actor.trim() || from;
  if (!from) {
    return { ok: false, error: "Select the waitress handing over.", orderIds: [], nextOrders: [...orders] };
  }
  if (!to) {
    return { ok: false, error: "Select the waitress taking over.", orderIds: [], nextOrders: [...orders] };
  }
  if (sameWaiter(from, to)) {
    return { ok: false, error: "Choose a different waitress.", orderIds: [], nextOrders: [...orders] };
  }
  let targets = openBillsOwnedByWaiter(orders, from);
  if (options?.orderIds?.length) {
    const idSet = new Set(options.orderIds);
    targets = targets.filter((order) => idSet.has(order.id));
    if (targets.length === 0) {
      return { ok: false, error: "Select at least one open bill to transfer.", orderIds: [], nextOrders: [...orders] };
    }
  }
  if (targets.length === 0) {
    return { ok: false, error: "No open bills to transfer.", orderIds: [], nextOrders: [...orders] };
  }
  const eligible = targets.filter((order) => !order.waiterTransferRequestedTo?.trim());
  if (eligible.length === 0) {
    const pendingTo = targets[0]?.waiterTransferRequestedTo?.trim();
    return {
      ok: false,
      error: pendingTo
        ? `Selected bill(s) already waiting for approval to ${pendingTo}.`
        : "Selected bill(s) already waiting for cashier/manager approval.",
      orderIds: [],
      nextOrders: [...orders],
    };
  }
  const ids = new Set(eligible.map((order) => order.id));
  const stamp = new Date().toISOString();
  return {
    ok: true,
    orderIds: eligible.map((order) => order.id),
    nextOrders: orders.map((order) => {
      if (!ids.has(order.id)) return order;
      return {
        ...order,
        waiterTransferRequestedTo: to,
        waiterTransferRequestedBy: requestedBy,
        waiterTransferRequestedAt: stamp,
      };
    }),
  };
}

export function rejectOpenBillsTransferRequest(
  orders: readonly Order[],
  orderIds?: readonly string[],
): { ok: boolean; error?: string; rejected: number; nextOrders: Order[] } {
  const pending = ordersWithPendingWaiterTransfer(orders);
  const idSet = orderIds?.length ? new Set(orderIds) : null;
  const targets = idSet ? pending.filter((order) => idSet.has(order.id)) : pending;
  if (targets.length === 0) {
    return { ok: false, error: "No pending bill transfer to reject.", rejected: 0, nextOrders: [...orders] };
  }
  const ids = new Set(targets.map((order) => order.id));
  return {
    ok: true,
    rejected: targets.length,
    nextOrders: orders.map((order) => (ids.has(order.id) ? clearTransferRequest(order) : order)),
  };
}

/**
 * Cashier/manager completes a pending handoff (or applies an immediate transfer).
 * When `requirePending` is true, only orders with a matching pending request move.
 */
export function transferOpenBillsToWaiter(
  orders: readonly Order[],
  fromWaiter: string,
  toWaiter: string,
  actor = "",
  options?: { requirePending?: boolean; orderIds?: readonly string[] },
): { ok: boolean; error?: string; orderIds: string[]; nextOrders: Order[] } {
  const from = fromWaiter.trim();
  const to = toWaiter.trim();
  const performedBy = actor.trim() || from;
  if (!from) {
    return { ok: false, error: "Select the waitress handing over.", orderIds: [], nextOrders: [...orders] };
  }
  if (!to) {
    return { ok: false, error: "Select the waitress taking over.", orderIds: [], nextOrders: [...orders] };
  }
  if (sameWaiter(from, to)) {
    return { ok: false, error: "Choose a different waitress.", orderIds: [], nextOrders: [...orders] };
  }

  let targets = openBillsOwnedByWaiter(orders, from);
  if (options?.orderIds?.length) {
    const idSet = new Set(options.orderIds);
    targets = targets.filter((order) => idSet.has(order.id));
  }
  if (options?.requirePending) {
    targets = targets.filter((order) =>
      sameWaiter(order.waiterTransferRequestedTo?.trim() || "", to),
    );
  }
  if (targets.length === 0) {
    return {
      ok: false,
      error: options?.orderIds?.length
        ? "Select at least one open bill to transfer."
        : options?.requirePending
          ? "No pending transfer request to approve."
          : "No open bills to transfer.",
      orderIds: [],
      nextOrders: [...orders],
    };
  }

  const ids = new Set(targets.map((order) => order.id));
  const stamp = new Date().toISOString();
  let index = 0;
  return {
    ok: true,
    orderIds: targets.map((order) => order.id),
    nextOrders: orders.map((order) => {
      if (!ids.has(order.id)) return order;
      const audit = makeTransferAudit(order, from, to, performedBy, stamp, index++);
      return {
        ...clearTransferRequest(order),
        waiter: to,
        server: to,
        orderedByWaiter: order.orderedByWaiter || from,
        waiterTransfers: [...(order.waiterTransfers ?? []), audit],
      };
    }),
  };
}
