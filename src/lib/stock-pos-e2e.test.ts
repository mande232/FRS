import test from "node:test";
import assert from "node:assert/strict";

import {
  buildInventoryAccessContext,
  canConfirmDepartmentIssueReceipt,
  canManageStockMasterCatalog,
  displayItemStockLocation,
  itemAvailableQuantity,
  scopeBalances,
} from "./inventory-access.ts";
import type { AuthUser } from "./auth-context.ts";
import {
  STOCK_ITEMS_SEED,
  STOCK_LEDGER_SEED,
  approveDepartmentStockRequest,
  buildLocationBalances,
  buildStockDashboardSummary,
  collectVoucherTransferMovements,
  confirmStoreReceiving,
  convertDepartmentRequestToIssueVoucher,
  createDepartmentStockRequest,
  createPosStockDeductionEntries,
  dispatchStoreIssueVoucher,
  isInDailyDashboardPeriod,
  receiveStoreIssueVoucher,
  receiveStoreIssueVoucherAsActor,
  resolveDailyDashboardPeriodStart,
  type OperationalStockLocation,
  type StockLedgerEntry,
  type StockLocation,
  type StockLocationBalance,
  type StockManagedItem,
} from "./stock-management.ts";

const today = new Date().toISOString().slice(0, 10);

const store1Keeper: AuthUser = {
  id: "abel",
  name: "Abel Tesfaye",
  role: "Storekeeper",
  branch: "Bole",
  assignedStore: "Store 1",
  assignedInventoryLocations: ["Store 1"],
  avatar: "AT",
  password: "store123",
};

const vipUser: AuthUser = {
  id: "mulu",
  name: "Mulugeta Asfaw",
  role: "Bartender",
  branch: "Bole",
  assignedInventoryLocations: ["VIP Bar"],
  avatar: "MA",
  password: "bar123",
};

type DepartmentFlowConfig = {
  department: OperationalStockLocation;
  itemId: string;
  storekeeper: string;
  departmentUser: string;
  grvQuantity: number;
  transferQuantity: number;
  posQuantity: number;
  unitPrice: number;
  station: string;
};

function isolatedItem(itemId: string): StockManagedItem {
  const seed = STOCK_ITEMS_SEED.find((row) => row.id === itemId);
  if (!seed) throw new Error(`Missing seed item ${itemId}`);
  return { ...seed, currentStock: 0 };
}

function rowAt(balances: StockLocationBalance[], itemId: string, location: StockLocation) {
  return balances.find((row) => row.itemId === itemId && row.location === location);
}

function runDepartmentStockPosFlow(config: DepartmentFlowConfig) {
  let items = [isolatedItem(config.itemId)];
  let ledger: StockLedgerEntry[] = [];
  const item = items[0]!;

  const grv = confirmStoreReceiving(
    {
      id: `rcv-${config.department}`,
      receivingNumber: `GRV-${config.department}`,
      supplier: item.supplierName ?? "Supplier",
      storeDestination: "Store 1",
      receivingDate: today,
      receivedBy: config.storekeeper,
      status: "Draft",
      lines: [
        {
          id: `rcv-line-${config.department}`,
          itemId: item.id,
          itemName: item.name,
          unit: item.baseUnit,
          orderedQuantity: config.grvQuantity,
          receivedQuantity: config.grvQuantity,
          unitCost: item.purchasePrice,
        },
      ],
    },
    items,
    ledger,
  );
  items = grv.items;
  ledger = grv.ledger;

  let balances = buildLocationBalances(items, ledger);
  assert.equal(rowAt(balances, item.id, "Store 1")?.quantity ?? 0, config.grvQuantity);
  assert.equal(rowAt(balances, item.id, config.department)?.quantity ?? 0, 0);

  const request = createDepartmentStockRequest({
    requestingDepartment: config.department,
    requestedSourceStore: "Store 1",
    priority: "Normal",
    reason: "E2E replenishment",
    requiredDate: today,
    requestedBy: config.departmentUser,
    lines: [
      {
        itemId: item.id,
        itemName: item.name,
        availableQuantityAtDepartment: 0,
        requestedQuantity: config.transferQuantity,
        unit: item.baseUnit,
      },
    ],
  });
  assert.equal(request.status, "Submitted");

  const approved = approveDepartmentStockRequest(request, config.storekeeper);
  balances = buildLocationBalances(items, ledger);
  assert.equal(rowAt(balances, item.id, config.department)?.quantity ?? 0, 0, "approve alone must not credit department");

  const issue = convertDepartmentRequestToIssueVoucher(approved);
  balances = buildLocationBalances(items, ledger, collectVoucherTransferMovements([issue], [], []));
  assert.equal(rowAt(balances, item.id, config.department)?.quantity ?? 0, 0, "issue voucher alone must not credit department");
  assert.equal(rowAt(balances, item.id, config.department)?.incomingQuantity ?? 0, 0);

  const dispatched = dispatchStoreIssueVoucher(issue, config.storekeeper, items, ledger);
  ledger = dispatched.ledger;
  balances = buildLocationBalances(items, ledger, collectVoucherTransferMovements([dispatched.voucher], [], []));
  assert.equal(rowAt(balances, item.id, "Store 1")?.quantity ?? 0, config.grvQuantity - config.transferQuantity);
  assert.equal(rowAt(balances, item.id, config.department)?.quantity ?? 0, 0, "dispatch must not credit department on-hand");
  assert.equal(rowAt(balances, item.id, config.department)?.incomingQuantity ?? 0, config.transferQuantity);

  assert.throws(
    () =>
      receiveStoreIssueVoucherAsActor(
        dispatched.voucher,
        {
          userName: config.storekeeper,
          role: "Storekeeper",
          assignedStore: "Store 1",
          allowedLocations: ["Store 1"],
        },
        items,
        ledger,
      ),
    /cannot act on|not allowed/i,
  );

  const received = receiveStoreIssueVoucher(dispatched.voucher, config.departmentUser, items, ledger);
  ledger = received.ledger;
  balances = buildLocationBalances(items, ledger);
  assert.equal(rowAt(balances, item.id, config.department)?.quantity ?? 0, config.transferQuantity);
  assert.equal(rowAt(balances, item.id, config.department)?.incomingQuantity ?? 0, 0);

  const deptAccess = buildInventoryAccessContext({
    ...vipUser,
    name: config.departmentUser,
    assignedInventoryLocations: [config.department],
  });
  assert.equal(
    displayItemStockLocation(item, balances, deptAccess, config.department),
    config.department,
    "department user must see stock at their location, not Store 1",
  );
  assert.equal(
    itemAvailableQuantity(item.id, scopeBalances(deptAccess, balances, config.department)),
    config.transferQuantity,
  );

  const posEntries = createPosStockDeductionEntries(
    {
      orderId: `o-${config.department}`,
      orderNo: `ORD-${config.department}`,
      closedAt: `${today}T10:00:00.000Z`,
      enteredBy: "Genet Tilahun",
      lines: [
        {
          name: item.name,
          qty: config.posQuantity,
          stockSku: item.id,
          stockDeductionLocation: config.department,
          station: config.station,
        },
      ],
    },
    items,
    [],
    ledger,
  );
  assert.ok(posEntries.length >= 1);
  assert.equal(posEntries[0]?.type, "POS_CONSUMPTION");
  assert.equal(posEntries[0]?.location, config.department);
  assert.ok(posEntries.every((entry) => entry.location !== "Store 1" && entry.location !== "Store 2"));

  ledger = [...posEntries, ...ledger];
  balances = buildLocationBalances(items, ledger);
  assert.equal(
    rowAt(balances, item.id, config.department)?.quantity ?? 0,
    config.transferQuantity - config.posQuantity,
  );

  const salesRevenue = config.posQuantity * config.unitPrice;
  const dashboard = buildStockDashboardSummary(
    items,
    ledger,
    [],
    [],
    [],
    [],
    undefined,
    [],
    config.department,
    [],
    [],
    salesRevenue,
  );
  assert.equal(dashboard.todaySalesRevenue, salesRevenue);
  assert.ok(dashboard.todaySalesDeductions >= config.posQuantity);
  assert.ok(dashboard.topSellingItems.some((row) => row.itemName === item.name));

  const preCloseQty = config.posQuantity + 3;
  const postCloseQty = 2;
  const preCloseAt = `${today}T08:00:00.000Z`;
  const closedAt = `${today}T12:00:00.000Z`;
  const postCloseAt = `${today}T14:00:00.000Z`;
  const closingLedger: StockLedgerEntry[] = [
    {
      id: `sled-pre-${config.department}`,
      type: "POS_CONSUMPTION",
      date: today,
      transactionAt: preCloseAt,
      itemId: item.id,
      itemName: item.name,
      category: item.category,
      location: config.department,
      quantity: preCloseQty,
      quantityIn: 0,
      quantityOut: preCloseQty,
      unit: item.baseUnit,
      totalCost: preCloseQty * item.purchasePrice,
      enteredBy: "Cashier",
      immutable: true,
    },
    {
      id: `sled-post-${config.department}`,
      type: "POS_CONSUMPTION",
      date: today,
      transactionAt: postCloseAt,
      itemId: item.id,
      itemName: item.name,
      category: item.category,
      location: config.department,
      quantity: postCloseQty,
      quantityIn: 0,
      quantityOut: postCloseQty,
      unit: item.baseUnit,
      totalCost: postCloseQty * item.purchasePrice,
      enteredBy: "Cashier",
      immutable: true,
    },
  ];

  const beforeClosing = buildStockDashboardSummary(
    items,
    closingLedger,
    [],
    [],
    [],
    [],
    undefined,
    [],
    config.department,
    [],
    [],
    0,
  );
  assert.equal(beforeClosing.todaySalesDeductions, preCloseQty + postCloseQty);

  const closings = [
    {
      id: `close-${config.department}`,
      date: today,
      location: config.department,
      openingStock: 0,
      stockReceived: config.transferQuantity,
      salesDeduction: preCloseQty + postCloseQty,
      wasteDamage: 0,
      manualAdjustment: 0,
      closingStock: config.transferQuantity - preCloseQty - postCloseQty,
      difference: 0,
      createdBy: config.departmentUser,
      closedAt,
    },
  ];
  const periodStart = resolveDailyDashboardPeriodStart(closings, config.department, today);
  assert.equal(periodStart, closedAt);
  assert.equal(isInDailyDashboardPeriod(today, preCloseAt, periodStart), false);
  assert.equal(isInDailyDashboardPeriod(today, postCloseAt, periodStart), true);

  const afterClosing = buildStockDashboardSummary(
    items,
    closingLedger,
    [],
    [],
    [],
    [],
    undefined,
    [],
    config.department,
    [],
    closings,
    0,
  );
  assert.equal(afterClosing.todaySalesDeductions, postCloseQty);
  assert.equal(afterClosing.dailyPeriodStart, closedAt);

  return { item, ledger, balances, posEntries, dashboard, afterClosing };
}

test("e2e VIP Bar: GRV → request → approve → issue → dispatch → receive → POS → dashboard → closing", () => {
  runDepartmentStockPosFlow({
    department: "VIP Bar",
    itemId: "stk-beer-habesha",
    storekeeper: "Abel Tesfaye",
    departmentUser: "Mulugeta Asfaw",
    grvQuantity: 50,
    transferQuantity: 24,
    posQuantity: 2,
    unitPrice: 150,
    station: "VIP Bar",
  });
});

test("e2e Main Bar smoke: full transfer and POS deduction path", () => {
  runDepartmentStockPosFlow({
    department: "Main Bar",
    itemId: "stk-beer-habesha",
    storekeeper: "Abel Tesfaye",
    departmentUser: "Tilahun Bekele",
    grvQuantity: 40,
    transferQuantity: 12,
    posQuantity: 1,
    unitPrice: 120,
    station: "Main Bar",
  });
});

test("e2e Kitchen smoke: full transfer and POS deduction path", () => {
  runDepartmentStockPosFlow({
    department: "Kitchen",
    itemId: "stk-onion",
    storekeeper: "Abel Tesfaye",
    departmentUser: "Chef Tewodros",
    grvQuantity: 30,
    transferQuantity: 10,
    posQuantity: 2,
    unitPrice: 0,
    station: "Kitchen",
  });
});

test("e2e Butcher smoke: full transfer and POS deduction path", () => {
  runDepartmentStockPosFlow({
    department: "Butcher",
    itemId: "stk-beef-prime",
    storekeeper: "Abel Tesfaye",
    departmentUser: "Bereket Alemu",
    grvQuantity: 25,
    transferQuantity: 8,
    posQuantity: 1,
    unitPrice: 0,
    station: "Butcher",
  });
});

test("e2e negatives: stock master, receipt auth, approve-only, warehouse POS", () => {
  const barStaff: AuthUser = {
    id: "vip",
    name: "Mulugeta Asfaw",
    role: "Bartender",
    branch: "Bole",
    assignedInventoryLocations: ["VIP Bar"],
    avatar: "MA",
    password: "bar123",
  };
  const storeAccess = buildInventoryAccessContext(store1Keeper);
  const vipAccess = buildInventoryAccessContext(barStaff);

  assert.equal(canManageStockMasterCatalog(vipAccess), false);
  assert.equal(canManageStockMasterCatalog(storeAccess), true);
  assert.equal(canConfirmDepartmentIssueReceipt(vipAccess, "VIP Bar"), true);
  assert.equal(canConfirmDepartmentIssueReceipt(storeAccess, "VIP Bar"), false);

  const request = createDepartmentStockRequest({
    requestingDepartment: "VIP Bar",
    requestedSourceStore: "Store 1",
    priority: "Normal",
    reason: "Negative check",
    requiredDate: today,
    requestedBy: "Mulugeta Asfaw",
    lines: [
      {
        itemId: "stk-beer-habesha",
        itemName: "Habesha Beer",
        availableQuantityAtDepartment: 0,
        requestedQuantity: 6,
        unit: "bottle",
      },
    ],
  });
  const approved = approveDepartmentStockRequest(request, "Abel Tesfaye");
  const testItem = isolatedItem("stk-beer-habesha");
  const balancesAfterApprove = buildLocationBalances([testItem], []);
  assert.equal(rowAt(balancesAfterApprove, "stk-beer-habesha", "VIP Bar")?.quantity ?? 0, 0);

  const stocked = confirmStoreReceiving(
    {
      id: "rcv-negative",
      receivingNumber: "GRV-NEG",
      supplier: "Dashen Brewery",
      storeDestination: "Store 1",
      receivingDate: today,
      receivedBy: "Abel Tesfaye",
      status: "Draft",
      lines: [
        {
          id: "rcv-line-neg",
          itemId: testItem.id,
          itemName: testItem.name,
          unit: testItem.baseUnit,
          orderedQuantity: 12,
          receivedQuantity: 12,
          unitCost: testItem.purchasePrice,
        },
      ],
    },
    [testItem],
    [],
  );

  const issue = convertDepartmentRequestToIssueVoucher(approved);
  const dispatched = dispatchStoreIssueVoucher(issue, "Abel Tesfaye", stocked.items, stocked.ledger);
  assert.throws(
    () =>
      receiveStoreIssueVoucherAsActor(
        dispatched.voucher,
        {
          userName: "Abel Tesfaye",
          role: "Storekeeper",
          assignedStore: "Store 1",
          allowedLocations: ["Store 1"],
        },
        stocked.items,
        dispatched.ledger,
      ),
    /cannot act on|not allowed/i,
  );

  const warehousePos = createPosStockDeductionEntries(
    {
      orderId: "o-warehouse-block",
      orderNo: "ORD-WH",
      closedAt: `${today}T11:00:00.000Z`,
      enteredBy: "Cashier",
      lines: [{ name: "Habesha Beer", qty: 3, stockSku: "stk-beer-habesha" }],
    },
    STOCK_ITEMS_SEED,
    [],
    STOCK_LEDGER_SEED,
  );
  assert.ok(warehousePos.length >= 1);
  assert.ok(warehousePos.every((entry) => entry.location !== "Store 1" && entry.location !== "Store 2"));
});
