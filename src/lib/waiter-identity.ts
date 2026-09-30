/** Normalize staff display names / emails for waiter↔table assignment matching. */
export function normalizePersonKey(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/[_./\\-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function namesEqual(left?: string | null, right?: string | null) {
  const a = left?.trim();
  const b = right?.trim();
  if (!a || !b) return false;
  return normalizePersonKey(a) === normalizePersonKey(b);
}

function identityCandidates(identity: { name?: string | null; email?: string | null } | string | null | undefined) {
  const identityObj =
    typeof identity === "string" || identity == null
      ? { name: identity ?? "", email: undefined }
      : identity;

  return [
    identityObj.name,
    identityObj.email,
    identityObj.email?.includes("@") ? identityObj.email.split("@")[0] : undefined,
  ].filter((value): value is string => Boolean(value?.trim()));
}

/**
 * True when a table.server (or order.waiter) value refers to this signed-in staff member.
 * Accepts full name, email, or email local-part so assignment survives minor naming differences.
 */
export function assignedWaiterMatches(
  assigned: string | null | undefined,
  identity: { name?: string | null; email?: string | null } | string | null | undefined,
) {
  const server = typeof assigned === "string" ? assigned.trim() : "";
  if (!server) return false;

  const candidates = identityCandidates(identity);
  if (candidates.length === 0) return false;

  if (candidates.some((candidate) => namesEqual(candidate, server))) return true;

  // Allow "Hanna" to match assigned "Hanna Tadesse" and the reverse when one side is a single token.
  const serverKey = normalizePersonKey(server);
  const serverParts = serverKey.split(" ").filter(Boolean);
  for (const candidate of candidates) {
    const key = normalizePersonKey(candidate);
    const parts = key.split(" ").filter(Boolean);
    if (serverParts.length === 1 && parts[0] === serverParts[0]) return true;
    if (parts.length === 1 && serverParts[0] === parts[0]) return true;
    // Same first + last token even if middle names differ.
    if (
      serverParts.length >= 2 &&
      parts.length >= 2 &&
      serverParts[0] === parts[0] &&
      serverParts[serverParts.length - 1] === parts[parts.length - 1]
    ) {
      return true;
    }
  }

  return false;
}

/** Resolve a free-typed waiter label to the canonical staff account name when possible. */
export function canonicalWaiterName(
  value: string | null | undefined,
  waiters: readonly { name: string; email?: string | null }[],
) {
  const raw = value?.trim() || "";
  if (!raw) return "";
  const match = waiters.find((waiter) => assignedWaiterMatches(raw, waiter));
  return match?.name?.trim() || raw;
}

type WaiterTableSeat = {
  area?: string | null;
  label?: string | null;
  server?: string | null;
  status?: string | null;
};

type WaiterOccupyingOrder = {
  area?: string | null;
  tableNumber?: string | null;
  waiter?: string | null;
  orderedByWaiter?: string | null;
  orderNo?: string | null;
  status?: string | null;
  paymentStatus?: string | null;
  tableClearedAt?: string | null;
};

function namesMatchSeat(left?: string | null, right?: string | null) {
  const a = left?.trim().toLowerCase();
  const b = right?.trim().toLowerCase();
  return Boolean(a && b && a === b);
}

/** True when this waiter owns a live (today) unpaid bill on the seat. */
export function waiterOwnsLiveBillOnSeat(
  identity: { name?: string | null; email?: string | null } | string | null | undefined,
  table: WaiterTableSeat,
  orders: readonly WaiterOccupyingOrder[],
) {
  const area = table.area?.trim() || "";
  const label = table.label?.trim() || "";
  if (!area || !label) return false;
  return orders.some((order) => {
    if (!namesMatchSeat(order.area, area) || !namesMatchSeat(order.tableNumber, label)) return false;
    if (order.tableClearedAt) return false;
    if (order.paymentStatus === "Paid") return false;
    if (order.status === "CLOSED" || order.status === "CANCELLED" || order.status === "RETURNED") {
      return false;
    }
    return (
      assignedWaiterMatches(order.waiter, identity) ||
      assignedWaiterMatches(order.orderedByWaiter, identity)
    );
  });
}

/**
 * Waiters only see / use seats assigned to them (`table.server`),
 * plus seats where they already have a live open bill.
 * Unassigned empty tables are NOT claimable from the floor or POS.
 */
export function waiterCanAccessAssignedTable(
  identity: { name?: string | null; email?: string | null } | string | null | undefined,
  table: WaiterTableSeat,
  orders: readonly WaiterOccupyingOrder[] = [],
) {
  if (assignedWaiterMatches(table.server, identity)) return true;
  return waiterOwnsLiveBillOnSeat(identity, table, orders);
}

/**
 * Returns an error message when `waiter` must not send/order on this seat.
 * Waiters need an explicit assignment (`table.server`) or their own live bill.
 */
export function waiterCannotUseTableReason(input: {
  waiter: string | null | undefined;
  table?: WaiterTableSeat | null;
  area?: string;
  tableNumber?: string;
  occupyingOrder?: WaiterOccupyingOrder | null;
  /** When true (cashier/manager creating for a waiter), skip assignment gate if seat is free. */
  allowUnassignedClaim?: boolean;
}): string | null {
  const waiter = input.waiter?.trim() || "";
  if (!waiter) return "Select a waiter before sending an order.";

  const seatLabel = [
    input.table?.area?.trim() || input.area?.trim() || "",
    input.table?.label?.trim() || input.tableNumber?.trim() || "",
  ]
    .filter(Boolean)
    .join(" ");

  const occupying = input.occupyingOrder;
  const paymentStatus = occupying?.paymentStatus;
  const status = occupying?.status;
  const completed =
    !occupying ||
    status === "CLOSED" ||
    paymentStatus === "Paid" ||
    Boolean(occupying.tableClearedAt);

  if (occupying && !completed) {
    const occupyingOwner =
      occupying.waiter?.trim() || occupying.orderedByWaiter?.trim() || "";
    if (occupyingOwner && !assignedWaiterMatches(occupyingOwner, waiter)) {
      const orderNo = occupying.orderNo?.trim();
      return seatLabel
        ? `Table ${seatLabel} already has an open order${orderNo ? ` (${orderNo})` : ""} for ${occupyingOwner}.`
        : `This table already has an open order for ${occupyingOwner}.`;
    }
    // Own live bill — allowed even if server name drifted.
    return null;
  }

  const assigned = input.table?.server?.trim() || "";
  if (assignedWaiterMatches(assigned, waiter)) return null;

  if (input.allowUnassignedClaim && !assigned) return null;

  if (assigned) {
    return seatLabel
      ? `Table ${seatLabel} is assigned to ${assigned}. Ask a cashier to reassign it.`
      : `This table is assigned to ${assigned}. Ask a cashier to reassign it.`;
  }

  return seatLabel
    ? `Table ${seatLabel} is not assigned to you. Ask a cashier to assign tables.`
    : "This table is not assigned to you. Ask a cashier to assign tables.";
}
