import assert from "node:assert/strict";
import test from "node:test";
import {
  assignedWaiterMatches,
  canonicalWaiterName,
  waiterCanAccessAssignedTable,
  waiterCannotUseTableReason,
} from "./waiter-identity.ts";

test("assignedWaiterMatches accepts name, email, and first/last tokens", () => {
  assert.equal(assignedWaiterMatches("Hanna Tadesse", { name: "Hanna Tadesse" }), true);
  assert.equal(assignedWaiterMatches("hanna.tadesse@example.com", { email: "hanna.tadesse@example.com" }), true);
  assert.equal(assignedWaiterMatches("Hanna", { name: "Hanna Tadesse" }), true);
  assert.equal(assignedWaiterMatches("Hanna Tadesse", { name: "Hanna" }), true);
  assert.equal(
    assignedWaiterMatches("Hanna M Tadesse", { name: "Hanna Tadesse" }),
    true,
  );
  assert.equal(assignedWaiterMatches("Other Waiter", { name: "Hanna Tadesse" }), false);
});

test("canonicalWaiterName resolves to staff account name", () => {
  const waiters = [
    { name: "Hanna Tadesse", email: "hanna@example.com" },
    { name: "Abel Kebede", email: "abel@example.com" },
  ];
  assert.equal(canonicalWaiterName("Hanna", waiters), "Hanna Tadesse");
  assert.equal(canonicalWaiterName("hanna@example.com", waiters), "Hanna Tadesse");
  assert.equal(canonicalWaiterName("Unknown", waiters), "Unknown");
});

test("waiterCanAccessAssignedTable requires assignment or own bill", () => {
  assert.equal(
    waiterCanAccessAssignedTable("Fasika", { area: "Main Hall", label: "5", server: "Fasika" }),
    true,
  );
  assert.equal(
    waiterCanAccessAssignedTable("Kal", { area: "Main Hall", label: "5", server: "Fasika" }),
    false,
  );
  assert.equal(
    waiterCanAccessAssignedTable("Kal", { area: "Main Hall", label: "5", server: undefined }),
    false,
  );
  assert.equal(
    waiterCanAccessAssignedTable("Kal", { area: "Main Hall", label: "5", server: undefined }, [
      { area: "Main Hall", tableNumber: "5", waiter: "Kal", status: "NEW" },
    ]),
    true,
  );
});

test("waiterCannotUseTableReason requires assignment for empty seats", () => {
  assert.equal(
    waiterCannotUseTableReason({
      waiter: "Fasika",
      table: { area: "Main Hall", label: "5", server: "Fasika" },
    }),
    null,
  );

  const otherAssigned = waiterCannotUseTableReason({
    waiter: "Kal Eshetu",
    table: { area: "Main Hall", label: "5", server: "Fasika" },
  });
  assert.match(otherAssigned ?? "", /assigned to Fasika/i);

  const unassigned = waiterCannotUseTableReason({
    waiter: "Kal Eshetu",
    table: { area: "Main Hall", label: "5", server: undefined, status: "Available" },
  });
  assert.match(unassigned ?? "", /not assigned/i);

  // Cashier may claim unassigned empty seat when creating for a waiter.
  assert.equal(
    waiterCannotUseTableReason({
      waiter: "Kal Eshetu",
      table: { area: "Main Hall", label: "5", server: undefined, status: "Available" },
      allowUnassignedClaim: true,
    }),
    null,
  );

  // Available floor status does NOT bypass a foreign assignment.
  const availableForeign = waiterCannotUseTableReason({
    waiter: "Kal Eshetu",
    table: { area: "Main Hall", label: "5", server: "Fasika", status: "Available" },
    occupyingOrder: { waiter: "Fasika", orderNo: "ORD-1001", status: "NEW" },
  });
  assert.match(availableForeign ?? "", /Fasika/i);

  // Paid bill awaiting clear does not block own/cashier claim if assigned or allowUnassigned.
  assert.equal(
    waiterCannotUseTableReason({
      waiter: "Fasika",
      table: { area: "Main Hall", label: "5", server: "Fasika", status: "Bill" },
      occupyingOrder: { waiter: "Fasika", orderNo: "ORD-1001", paymentStatus: "Paid" },
    }),
    null,
  );

  const occupiedConflict = waiterCannotUseTableReason({
    waiter: "Kal Eshetu",
    table: { area: "Main Hall", label: "5", server: undefined, status: "Occupied" },
    occupyingOrder: { waiter: "Fasika", orderNo: "ORD-1001", status: "NEW" },
  });
  assert.match(occupiedConflict ?? "", /Fasika/i);

  assert.equal(
    waiterCannotUseTableReason({
      waiter: "Fasika",
      table: { area: "Main Hall", label: "5", status: "Occupied" },
      occupyingOrder: { waiter: "Fasika", orderNo: "ORD-1001", status: "NEW" },
    }),
    null,
  );
});
