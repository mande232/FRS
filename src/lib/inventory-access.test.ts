import test from "node:test";
import assert from "node:assert/strict";
import {
  allowedStockTabs,
  assertLocationAccess,
  buildInventoryAccessContext,
  BUTCHER_STOCK_TABS,
  canConfirmDepartmentIssueReceipt,
  canManageStockMasterCatalog,
  canManageStockMasterItem,
  displayItemStockLocation,
  filterCentralStoreBalances,
  itemAvailableQuantity,
  itemMatchesLocationFilter,
  resolveAuthorizedLocations,
  resolveEffectiveWorkspace,
  scopeBalances,
  scopeLedger,
  shouldShowWorkspaceSelector,
  supportsBarStockView,
  supportsDailyConsumption,
  supportsRecipeBom,
  validateAssignedInventoryLocations,
  workspaceOptions,
} from "./inventory-access.ts";
import type { AuthUser } from "./auth-context.ts";
import type { StockLocationBalance, StockLedgerEntry, StockRequestRecord, StockTransferRecord } from "./stock-management.ts";
import { getNotificationsForUser } from "./notifications.ts";

const store1Keeper: AuthUser = {
  id: "k1",
  name: "Keeper 1",
  role: "Storekeeper",
  branch: "Bole",
  assignedStore: "Store 1",
  assignedInventoryLocations: ["Store 1"],
  avatar: "K1",
  password: "x",
};

const store2Keeper: AuthUser = {
  id: "k2",
  name: "Keeper 2",
  role: "Storekeeper",
  branch: "Bole",
  assignedStore: "Store 2",
  assignedInventoryLocations: ["Store 2"],
  avatar: "K2",
  password: "x",
};

const barUser: AuthUser = {
  id: "b1",
  name: "Bar User",
  role: "Bar Staff",
  branch: "Bole",
  assignedInventoryLocations: ["Main Bar"],
  avatar: "BU",
  password: "x",
};

const vipUser: AuthUser = {
  id: "v1",
  name: "VIP User",
  role: "Bartender",
  branch: "Bole",
  assignedInventoryLocations: ["VIP Bar"],
  avatar: "VU",
  password: "x",
};

const manager: AuthUser = {
  id: "m1",
  name: "Manager",
  role: "Store Manager",
  branch: "Bole",
  avatar: "MG",
  password: "x",
};

const butcherUser: AuthUser = {
  id: "bh1",
  name: "Butcher User",
  role: "Butcher House Staff",
  branch: "Bole",
  assignedInventoryLocations: ["Butcher"],
  avatar: "BH",
  password: "x",
};

test("inventory access resolves authorized locations per user", () => {
  const keeperAccess = buildInventoryAccessContext(store1Keeper);
  assert.deepEqual(resolveAuthorizedLocations(keeperAccess), ["Store 1"]);
  assert.equal(workspaceOptions(keeperAccess).length, 1);
  assert.equal(shouldShowWorkspaceSelector(keeperAccess), false);
  assert.equal(resolveEffectiveWorkspace(keeperAccess), "Store 1");

  const managerAccess = buildInventoryAccessContext(manager);
  assert.equal(resolveAuthorizedLocations(managerAccess), "all");
  assert.ok(workspaceOptions(managerAccess).includes("all"));
});

test("department users see balance location, not catalog preferred Store", () => {
  const access = buildInventoryAccessContext(barUser);
  const balances: StockLocationBalance[] = [
    {
      itemId: "stk-dashen",
      location: "Main Bar",
      quantity: 10,
      availableQuantity: 10,
      reservedQuantity: 0,
    },
  ];
  assert.equal(
    displayItemStockLocation(
      { id: "stk-dashen", preferredLocation: "Store 1" },
      balances,
      access,
      "Main Bar",
    ),
    "Main Bar",
  );
  assert.equal(itemAvailableQuantity("stk-dashen", scopeBalances(access, balances, "Main Bar")), 10);
  assert.equal(
    itemMatchesLocationFilter(
      { id: "stk-dashen", preferredLocation: "Store 1" },
      scopeBalances(access, balances, "Main Bar"),
      "Main Bar",
      true,
    ),
    true,
  );
  assert.equal(
    itemMatchesLocationFilter(
      { id: "stk-dashen", preferredLocation: "Store 1" },
      scopeBalances(access, balances, "Main Bar"),
      "Store 1",
      true,
    ),
    false,
  );
});

test("only store keepers and branch managers can manage stock master items", () => {
  const barAccess = buildInventoryAccessContext(barUser);
  const store1Access = buildInventoryAccessContext(store1Keeper);
  const store2Access = buildInventoryAccessContext(store2Keeper);
  const managerAccess = buildInventoryAccessContext(manager);
  const branchManager: AuthUser = {
    id: "bm1",
    name: "Branch Boss",
    role: "Branch Manager",
    branch: "Bole",
    avatar: "BB",
    password: "x",
  };
  const branchAccess = buildInventoryAccessContext(branchManager);

  assert.equal(canManageStockMasterCatalog(barAccess), false);
  assert.equal(canManageStockMasterCatalog(store1Access), true);
  assert.equal(canManageStockMasterCatalog(branchAccess), true);
  assert.equal(canManageStockMasterItem(barAccess, { preferredLocation: "Store 1" }), false);
  assert.equal(canManageStockMasterItem(store1Access, { preferredLocation: "Store 1" }), true);
  assert.equal(canManageStockMasterItem(store1Access, { preferredLocation: "Store 2" }), false);
  assert.equal(canManageStockMasterItem(store2Access, { preferredLocation: "Store 2" }), true);
  assert.equal(canManageStockMasterItem(branchAccess, { preferredLocation: "Store 2" }), true);
  assert.equal(canManageStockMasterItem(managerAccess, { preferredLocation: "Store 1" }), true);
});

test("butcher workspace shows goat processing tabs only", () => {
  const access = buildInventoryAccessContext(butcherUser);
  const tabs = allowedStockTabs(access, "Butcher");
  assert.deepEqual(tabs, BUTCHER_STOCK_TABS);
  assert.ok(tabs.includes("goat-processing"));
  assert.ok(tabs.includes("department-requests"));
  assert.ok(tabs.includes("issue-vouchers"));
  assert.ok(tabs.includes("store-transfer-vouchers"));
  assert.ok(tabs.includes("physical-counts"));
  assert.ok(tabs.includes("adjustment-vouchers"));
  assert.ok(!tabs.includes("items"));
  assert.ok(!tabs.includes("dashboard"));
  assert.ok(!tabs.includes("requisitions"));
  assert.ok(!tabs.includes("grv"));
  assert.ok(!tabs.includes("goods-returns"));
  assert.ok(!tabs.includes("recipes"));
});

test("bar stock view is available for Main Bar and VIP Bar workspaces only", () => {
  const barAccess = buildInventoryAccessContext(barUser);
  const vipAccess = buildInventoryAccessContext(vipUser);
  const storeAccess = buildInventoryAccessContext(store1Keeper);

  assert.equal(supportsBarStockView("Main Bar"), true);
  assert.equal(supportsBarStockView("VIP Bar"), true);
  assert.equal(supportsBarStockView("Kitchen"), false);

  // Bar stock lives on the dashboard, not as a separate tab.
  assert.ok(!allowedStockTabs(barAccess, "Main Bar").includes("bar-stock"));
  assert.ok(!allowedStockTabs(vipAccess, "VIP Bar").includes("bar-stock"));
  assert.ok(!allowedStockTabs(storeAccess, "Store 1").includes("bar-stock"));
  assert.ok(!allowedStockTabs(barAccess, "all").includes("bar-stock"));
});

test("kitchen workspace can open Recipe / BOM", () => {
  const kitchenUser: AuthUser = {
    id: "kit-1",
    name: "Kitchen User",
    role: "Kitchen Staff",
    branch: "Bole",
    assignedInventoryLocations: ["Kitchen"],
    avatar: "K",
    password: "x",
  };
  const access = buildInventoryAccessContext(kitchenUser);
  assert.equal(supportsRecipeBom("Kitchen"), true);
  assert.equal(supportsRecipeBom("Coffee House"), false);
  assert.ok(allowedStockTabs(access, "Kitchen").includes("recipes"));
  assert.ok(allowedStockTabs(access, "Kitchen").includes("daily-consumption"));
  assert.ok(!allowedStockTabs(access, "Main Bar").includes("recipes"));
});

test("branch manager on butcher workspace gets butcher tab set", () => {
  const branchManager: AuthUser = {
    id: "bm1",
    name: "Branch Boss",
    role: "Branch Manager",
    branch: "Bole",
    avatar: "BB",
    password: "x",
  };
  const access = buildInventoryAccessContext(branchManager);
  assert.deepEqual(allowedStockTabs(access, "Butcher"), BUTCHER_STOCK_TABS);
  assert.notDeepEqual(allowedStockTabs(access, "all"), BUTCHER_STOCK_TABS);
});

test("only destination department can confirm issue voucher receipt", () => {
  const vipAccess = buildInventoryAccessContext(vipUser);
  const barAccess = buildInventoryAccessContext(barUser);
  const store1Access = buildInventoryAccessContext(store1Keeper);
  const managerAccess = buildInventoryAccessContext(manager);

  assert.equal(canConfirmDepartmentIssueReceipt(vipAccess, "VIP Bar"), true);
  assert.equal(canConfirmDepartmentIssueReceipt(vipAccess, "Main Bar"), false);
  assert.equal(canConfirmDepartmentIssueReceipt(barAccess, "VIP Bar"), false);
  assert.equal(canConfirmDepartmentIssueReceipt(store1Access, "VIP Bar"), false);
  assert.equal(canConfirmDepartmentIssueReceipt(managerAccess, "VIP Bar"), false);
});

test("Store 2 keeper resolves Store 2 workspace only", () => {
  const access = buildInventoryAccessContext(store2Keeper);
  assert.deepEqual(resolveAuthorizedLocations(access), ["Store 2"]);
  assert.equal(resolveEffectiveWorkspace(access), "Store 2");
  assert.equal(shouldShowWorkspaceSelector(access), false);
  assert.throws(() => assertLocationAccess(access, "Store 1"), /not authorized/);
});

test("storekeeper without assignment falls back to Store 1 default", () => {
  const bare: AuthUser = {
    id: "k0",
    name: "Bare Keeper",
    role: "Storekeeper",
    branch: "Bole",
    avatar: "BK",
    password: "x",
  };
  const access = buildInventoryAccessContext(bare);
  assert.deepEqual(resolveAuthorizedLocations(access), ["Store 1"]);
  assert.equal(resolveEffectiveWorkspace(access), "Store 1");
});

test("scoped balances and ledger hide unauthorized locations", () => {
  const access = buildInventoryAccessContext(store1Keeper);
  const balances: StockLocationBalance[] = [
    {
      itemId: "1",
      itemName: "Beer",
      category: "Beer",
      unit: "bottle",
      location: "Store 1",
      quantity: 10,
      reservedQuantity: 0,
      availableQuantity: 10,
      incomingQuantity: 0,
      reorderLevel: 2,
      inventoryValue: 100,
    },
    {
      itemId: "1",
      itemName: "Beer",
      category: "Beer",
      unit: "bottle",
      location: "Store 2",
      quantity: 5,
      reservedQuantity: 0,
      availableQuantity: 5,
      incomingQuantity: 0,
      reorderLevel: 2,
      inventoryValue: 50,
    },
  ];
  const scoped = scopeBalances(access, balances, "all");
  assert.equal(scoped.length, 1);
  assert.equal(scoped[0]?.location, "Store 1");

  const ledger: StockLedgerEntry[] = [
    {
      id: "l1",
      type: "PURCHASE",
      date: "2026-07-13",
      itemId: "1",
      itemName: "Beer",
      location: "Store 2",
      quantity: 1,
      unit: "bottle",
      totalCost: 10,
      enteredBy: "X",
    },
  ];
  assert.equal(scopeLedger(access, ledger, "all").length, 0);
});

test("department requests read central store availability outside workspace scope", () => {
  const access = buildInventoryAccessContext(vipUser);
  const balances: StockLocationBalance[] = [
    {
      itemId: "sun-brew",
      itemName: "Sun Brew Beer",
      category: "Beer",
      unit: "bottle",
      location: "Store 1",
      quantity: 50,
      reservedQuantity: 0,
      availableQuantity: 50,
      incomingQuantity: 0,
      reorderLevel: 5,
      inventoryValue: 5000,
    },
    {
      itemId: "sun-brew",
      itemName: "Sun Brew Beer",
      category: "Beer",
      unit: "bottle",
      location: "VIP Bar",
      quantity: 0,
      reservedQuantity: 0,
      availableQuantity: 0,
      incomingQuantity: 0,
      reorderLevel: 5,
      inventoryValue: 0,
    },
  ];
  const scoped = scopeBalances(access, balances, "VIP Bar");
  assert.equal(scoped.length, 1);
  assert.equal(scoped[0]?.location, "VIP Bar");
  assert.equal(scoped[0]?.quantity, 0);

  const warehouse = filterCentralStoreBalances(balances);
  assert.equal(warehouse.length, 1);
  assert.equal(warehouse[0]?.location, "Store 1");
  assert.equal(warehouse[0]?.availableQuantity, 50);
});

test("department user cannot be assigned central and operational mix for store role", () => {
  assert.match(validateAssignedInventoryLocations("Storekeeper", ["Store 1", "Kitchen"]) ?? "", /Store roles cannot/);
  assert.equal(validateAssignedInventoryLocations("Bar Staff", ["Main Bar"]), null);
});

test("VIP Bar low-stock notification is not sent to Main Bar users", () => {
  const balances: StockLocationBalance[] = [
    {
      itemId: "beer",
      itemName: "Habesha",
      category: "Beer",
      unit: "bottle",
      location: "VIP Bar",
      quantity: 1,
      reservedQuantity: 0,
      availableQuantity: 1,
      incomingQuantity: 0,
      reorderLevel: 5,
      inventoryValue: 10,
    },
    {
      itemId: "beer",
      itemName: "Habesha",
      category: "Beer",
      unit: "bottle",
      location: "Main Bar",
      quantity: 1,
      reservedQuantity: 0,
      availableQuantity: 1,
      incomingQuantity: 0,
      reorderLevel: 5,
      inventoryValue: 10,
    },
  ];
  const vipAlerts = getNotificationsForUser(vipUser, [], balances).filter((n) => n.kind === "stock-alert");
  assert.ok(vipAlerts.some((n) => n.area === "VIP Bar"));
  assert.ok(!vipAlerts.some((n) => n.area === "Main Bar"));

  const mainAlerts = getNotificationsForUser(barUser, [], balances).filter((n) => n.kind === "stock-alert");
  assert.ok(mainAlerts.some((n) => n.area === "Main Bar"));
  assert.ok(!mainAlerts.some((n) => n.area === "VIP Bar"));

  const store1Alerts = getNotificationsForUser(store1Keeper, [], [
    {
      ...balances[0]!,
      location: "Store 1",
      quantity: 2,
      availableQuantity: 2,
      reorderLevel: 10,
    },
    {
      ...balances[0]!,
      location: "Store 2",
      quantity: 1,
      availableQuantity: 1,
      reorderLevel: 10,
    },
  ]).filter((n) => n.kind === "stock-alert");
  assert.ok(store1Alerts.every((n) => n.area === "Store 1"));
  assert.ok(!store1Alerts.some((n) => n.area === "Store 2"));

  const store2Alerts = getNotificationsForUser(store2Keeper, [], [
    {
      ...balances[0]!,
      location: "Store 2",
      quantity: 1,
      availableQuantity: 1,
      reorderLevel: 10,
    },
  ]).filter((n) => n.kind === "stock-alert");
  assert.ok(store2Alerts.some((n) => n.area === "Store 2"));
});

test("stock request and transfer notifications are scoped to assigned users and branch managers", () => {
  const requests: StockRequestRecord[] = [
    {
      id: "req-1",
      requestNumber: "SR-001",
      requestingDepartment: "VIP Bar",
      requestedSourceStore: "Store 2",
      lines: [{ id: "r1", itemId: "beer", itemName: "Habesha", availableQuantityAtDepartment: 0, requestedQuantity: 12, approvedQuantity: 0, unit: "bottle" }],
      priority: "Urgent",
      reason: "Out of stock",
      requiredDate: "2026-07-16",
      requestedBy: "VIP User",
      status: "Submitted",
      createdAt: "2026-07-16T08:00:00.000Z",
      updatedAt: "2026-07-16T08:00:00.000Z",
    },
  ];

  const transfers: StockTransferRecord[] = [
    {
      id: "tr-1",
      transferNumber: "TR-001",
      sourceLocation: "Store 2",
      destinationLocation: "VIP Bar",
      lines: [{ id: "t1", itemId: "beer", itemName: "Habesha", unit: "bottle", requestedQuantity: 12, approvedQuantity: 12, sentQuantity: 12, receivedQuantity: 0 }],
      transferDate: "2026-07-16",
      status: "Dispatched",
      requestedBy: "VIP User",
      approvedBy: "Manager",
      sentBy: "Keeper 2",
      dispatchedAt: "2026-07-16T09:00:00.000Z",
      activity: [],
    },
  ];

  const vipNotifications = getNotificationsForUser(vipUser, [], [], requests, transfers);
  assert.ok(vipNotifications.some((n) => n.kind === "stock-request" && n.orderNo === "SR-001"));
  assert.ok(vipNotifications.some((n) => n.kind === "stock-transfer" && n.orderNo === "TR-001"));

  const mainNotifications = getNotificationsForUser(barUser, [], [], requests, transfers);
  assert.ok(!mainNotifications.some((n) => n.kind === "stock-request" || n.kind === "stock-transfer"));

  const branchManager: AuthUser = {
    id: "bm1",
    name: "Branch Boss",
    role: "Branch Manager",
    branch: "Bole",
    avatar: "BB",
    password: "x",
  };
  const managerNotifications = getNotificationsForUser(branchManager, [], [], requests, transfers);
  assert.ok(managerNotifications.some((n) => n.kind === "stock-request" && n.orderNo === "SR-001"));
  assert.ok(managerNotifications.some((n) => n.kind === "stock-transfer" && n.orderNo === "TR-001"));
});

test("resolved stock requests and transfers do not keep notifications", () => {
  const resolvedRequest: StockRequestRecord = {
    id: "req-done",
    requestNumber: "SR-DONE",
    requestingDepartment: "VIP Bar",
    requestedSourceStore: "Store 2",
    lines: [
      {
        id: "r1",
        itemId: "beer",
        itemName: "Habesha",
        availableQuantityAtDepartment: 0,
        requestedQuantity: 12,
        approvedQuantity: 12,
        unit: "bottle",
      },
    ],
    priority: "Urgent",
    reason: "Out of stock",
    requiredDate: "2026-07-16",
    requestedBy: "VIP User",
    status: "Converted to Issue Voucher",
    createdAt: "2026-07-16T08:00:00.000Z",
    updatedAt: "2026-07-16T09:00:00.000Z",
  };

  const resolvedTransfer: StockTransferRecord = {
    id: "tr-done",
    transferNumber: "TR-DONE",
    sourceLocation: "Store 2",
    destinationLocation: "VIP Bar",
    lines: [
      {
        id: "t1",
        itemId: "beer",
        itemName: "Habesha",
        unit: "bottle",
        requestedQuantity: 12,
        approvedQuantity: 12,
        sentQuantity: 12,
        receivedQuantity: 12,
      },
    ],
    transferDate: "2026-07-16",
    status: "Received",
    requestedBy: "VIP User",
    approvedBy: "Manager",
    sentBy: "Keeper 2",
    receivedBy: "VIP User",
    receivedAt: "2026-07-16T10:00:00.000Z",
    activity: [],
  };

  const postedTransfer: StockTransferRecord = {
    ...resolvedTransfer,
    id: "tr-posted",
    transferNumber: "TR-POSTED",
    status: "Posted" as StockTransferRecord["status"],
  };

  const branchManager: AuthUser = {
    id: "bm1",
    name: "Branch Boss",
    role: "Branch Manager",
    branch: "Bole",
    avatar: "BB",
    password: "x",
  };

  const notifications = getNotificationsForUser(
    branchManager,
    [],
    [],
    [resolvedRequest],
    [resolvedTransfer, postedTransfer],
  );
  assert.equal(
    notifications.filter((n) => n.kind === "stock-request" || n.kind === "stock-transfer").length,
    0,
  );
});
