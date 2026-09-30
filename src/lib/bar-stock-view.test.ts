import test from "node:test";
import assert from "node:assert/strict";

import {
  buildBarStockDailyReceivedMap,
  buildBarStockReport,
  buildBarStockSnapshot,
  buildBeerCategorySummaries,
  computeBarStockItemMetrics,
  computeItemInventoryValue,
  getBarStockReceivedDates,
  getBarStockReceivedForDate,
  resolveBarStockSearch,
  sortBarStockGroupItems,
} from "./bar-stock-view.ts";
import { inferBeerTier, isDraftBeerItem, isSpecialBeerItem, type StockLedgerEntry, type StockLocationBalance, type StockManagedItem } from "./stock-management.ts";

const baseItem = (overrides: Partial<StockManagedItem>): StockManagedItem => ({
  id: "stk-test",
  name: "Test Item",
  category: "Beer",
  baseUnit: "bottle",
  purchasePrice: 50,
  sellingPrice: 120,
  reorderLevel: 10,
  currentStock: 0,
  preferredLocation: "Main Bar",
  conversions: [],
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
  ...overrides,
});

test("inferBeerTier marks Heineken, Bedele, and Arada as special", () => {
  assert.equal(inferBeerTier(baseItem({ name: "Heineken" })), "special");
  assert.equal(inferBeerTier(baseItem({ name: "Bedele" })), "special");
  assert.equal(inferBeerTier(baseItem({ name: "Bedelle" })), "special");
  assert.equal(inferBeerTier(baseItem({ name: "Arada Beer" })), "special");
  assert.equal(inferBeerTier(baseItem({ name: "Dashen" })), "normal");
  assert.equal(inferBeerTier(baseItem({ name: "Draft Beer" })), "draft");
  assert.equal(inferBeerTier(baseItem({ id: "stk-draft-beer", name: "Draft" })), "draft");
  assert.equal(inferBeerTier(baseItem({ name: "Heineken", beerTier: "normal" })), "special");
  assert.equal(inferBeerTier(baseItem({ name: "Whisky", category: "Whisky" })), undefined);
});

test("isSpecialBeerItem matches canonical stock ids and name variants", () => {
  assert.equal(isSpecialBeerItem(baseItem({ id: "stk-beer-heineken", name: "Heineken" })), true);
  assert.equal(isSpecialBeerItem(baseItem({ id: "stk-beer-bedele", name: "Bedele" })), true);
  assert.equal(isSpecialBeerItem(baseItem({ id: "stk-beer-arada", name: "Arada" })), true);
  assert.equal(isSpecialBeerItem(baseItem({ name: "Dashen" })), false);
});

test("isDraftBeerItem matches draft beer ids and names", () => {
  assert.equal(isDraftBeerItem(baseItem({ id: "stk-draft-beer", name: "Draft Beer" })), true);
  assert.equal(isDraftBeerItem(baseItem({ name: "House Draft" })), true);
  assert.equal(isDraftBeerItem(baseItem({ name: "Dashen" })), false);
});

test("computeBarStockItemMetrics derives opening, sold, and left from ledger period", () => {
  const item = baseItem({ id: "stk-beer-heineken", name: "Heineken", beerTier: "special" });
  const balance: StockLocationBalance = {
    itemId: item.id,
    itemName: item.name,
    category: "Beer",
    unit: "bottle",
    location: "Main Bar",
    quantity: 18,
    reservedQuantity: 0,
    availableQuantity: 18,
    incomingQuantity: 6,
    reorderLevel: 10,
    inventoryValue: 900,
  };
  const ledger: StockLedgerEntry[] = [
    {
      id: "l1",
      type: "OPENING_BALANCE",
      date: "2026-07-20",
      itemId: item.id,
      itemName: item.name,
      category: "Beer",
      location: "Main Bar",
      quantity: 20,
      unit: "bottle",
      totalCost: 1000,
      enteredBy: "Seed",
    },
    {
      id: "l2",
      type: "TRANSFER_IN",
      date: "2026-07-20",
      itemId: item.id,
      itemName: item.name,
      category: "Beer",
      location: "Main Bar",
      fromLocation: "Store 1",
      toLocation: "Main Bar",
      quantity: 6,
      unit: "bottle",
      totalCost: 300,
      enteredBy: "Bar",
    },
    {
      id: "l3",
      type: "POS_CONSUMPTION",
      date: "2026-07-20",
      itemId: item.id,
      itemName: item.name,
      category: "Beer",
      location: "Main Bar",
      quantity: 8,
      unit: "bottle",
      totalCost: 400,
      enteredBy: "POS",
    },
  ];

  const metrics = computeBarStockItemMetrics(item, balance, ledger, "Main Bar", null, {
    today: "2026-07-20",
  });
  assert.equal(metrics.onHand, 18);
  assert.equal(metrics.inTransit, 6);
  assert.equal(metrics.newEntered, 6);
  assert.equal(metrics.sold, 8);
  assert.equal(metrics.stock, 20);
  assert.equal(metrics.total, 26);
  assert.equal(metrics.left, 18);
  assert.equal(metrics.damageWastage, 0);
  assert.equal(metrics.staffConsumption, 0);
  assert.equal(metrics.soldDoubleShots, undefined);
  assert.equal(metrics.soldSingleShots, undefined);
  assert.equal(metrics.remainingDoubles, undefined);
  assert.equal(metrics.remainingSingles, undefined);
});

test("Main Bar bottle items never expose VIP whisky pour metrics", () => {
  const item = baseItem({
    id: "beer-with-bad-yield",
    name: "Castel",
    category: "Beer",
    conversions: [
      { id: "bad-double", label: "legacy", fromUnit: "bottle", toUnit: "double shot", multiplier: 16 },
      { id: "bad-single", label: "legacy", fromUnit: "bottle", toUnit: "single shot", multiplier: 32 },
    ],
  });
  const metrics = computeBarStockItemMetrics(
    item,
    {
      itemId: item.id,
      itemName: item.name,
      category: item.category,
      unit: "bottle",
      location: "Main Bar",
      quantity: 46,
      reservedQuantity: 0,
      availableQuantity: 46,
      incomingQuantity: 0,
      reorderLevel: 5,
      inventoryValue: 2300,
    },
    [],
    "Main Bar",
    null,
    { today: "2026-07-20" },
  );

  assert.equal(metrics.left, 46);
  assert.equal(metrics.remainingDoubles, undefined);
  assert.equal(metrics.remainingSingles, undefined);
});

test("buildBarStockSnapshot groups Main Bar beers into special, draft, and normal rollups", () => {
  const items: StockManagedItem[] = [
    baseItem({ id: "beer-1", name: "Heineken", beerTier: "special" }),
    baseItem({ id: "beer-2", name: "Bedele", beerTier: "special" }),
    baseItem({ id: "beer-3", name: "Dashen", beerTier: "normal" }),
    baseItem({ id: "stk-draft-beer", name: "Draft Beer", beerTier: "normal" }),
    baseItem({ id: "soft-1", name: "Sprite", category: "Soft Drink" }),
  ];
  const balances: StockLocationBalance[] = items.map((item) => ({
    itemId: item.id,
    itemName: item.name,
    category: item.category,
    unit: "bottle",
    location: "Main Bar",
    quantity: 10,
    reservedQuantity: 0,
    availableQuantity: 10,
    incomingQuantity: 0,
    reorderLevel: 5,
    inventoryValue: 500,
  }));

  const snapshot = buildBarStockSnapshot({
    items,
    balances,
    ledger: [],
    closings: [],
    workspace: "Main Bar",
    salesRecords: [],
    today: "2026-07-20",
  });

  assert.ok(snapshot);
  assert.equal(snapshot!.groups[0]?.id, "special-beer");
  assert.equal(snapshot!.groups[0]?.items.length, 2);
  assert.equal(snapshot!.groups[1]?.id, "draft-beer");
  assert.equal(snapshot!.groups[1]?.items.length, 1);
  assert.equal(snapshot!.groups[1]?.items[0]?.itemName, "Draft Beer");
  assert.equal(snapshot!.groups[2]?.id, "normal-beer");
  assert.equal(snapshot!.groups[2]?.items.length, 1);
  assert.equal(snapshot!.groups[0]?.metrics.onHand, 20);
  assert.equal(snapshot!.groups[3]?.category, "Soft Drink");
});

test("buildBarStockSnapshot returns null for non-bar workspaces", () => {
  const snapshot = buildBarStockSnapshot({
    items: [],
    balances: [],
    ledger: [],
    closings: [],
    workspace: "Kitchen",
    salesRecords: [],
  });
  assert.equal(snapshot, null);
});

test("buildBarStockSnapshot lists VIP Bar drinks by category without beer groups", () => {
  const items: StockManagedItem[] = [
    baseItem({ id: "wh-1", name: "Black Label", category: "Whisky", preferredLocation: "VIP Bar" }),
  ];
  const balances: StockLocationBalance[] = [
    {
      itemId: "wh-1",
      itemName: "Black Label",
      category: "Whisky",
      unit: "bottle",
      location: "VIP Bar",
      quantity: 12,
      reservedQuantity: 0,
      availableQuantity: 12,
      incomingQuantity: 0,
      reorderLevel: 4,
      inventoryValue: 1200,
    },
  ];

  const snapshot = buildBarStockSnapshot({
    items,
    balances,
    ledger: [],
    closings: [],
    workspace: "VIP Bar",
    salesRecords: [],
  });

  assert.ok(snapshot);
  assert.equal(snapshot!.groups.length, 1);
  assert.equal(snapshot!.groups[0]?.kind, "category");
  assert.equal(snapshot!.groups[0]?.category, "Whisky");
  assert.ok(!snapshot!.groups.some((group) => group.kind === "special-beer"));
});

test("buildBarStockSnapshot excludes Whisky from Main Bar view", () => {
  const items: StockManagedItem[] = [
    baseItem({ id: "beer-1", name: "Arada", beerTier: "special" }),
    baseItem({
      id: "wh-1",
      name: "Black Label",
      category: "Whisky",
      preferredLocation: "VIP Bar",
    }),
  ];
  const balances: StockLocationBalance[] = [
    {
      itemId: "beer-1",
      itemName: "Arada",
      category: "Beer",
      unit: "bottle",
      location: "Main Bar",
      quantity: 10,
      reservedQuantity: 0,
      availableQuantity: 10,
      incomingQuantity: 0,
      reorderLevel: 5,
      inventoryValue: 500,
    },
    {
      itemId: "wh-1",
      itemName: "Black Label",
      category: "Whisky",
      unit: "bottle",
      location: "Main Bar",
      quantity: 3,
      reservedQuantity: 0,
      availableQuantity: 3,
      incomingQuantity: 0,
      reorderLevel: 2,
      inventoryValue: 900,
    },
  ];

  const snapshot = buildBarStockSnapshot({
    items,
    balances,
    ledger: [],
    closings: [],
    workspace: "Main Bar",
    salesRecords: [],
    today: "2026-07-20",
  });

  assert.ok(snapshot);
  assert.ok(!snapshot!.groups.some((group) => group.category === "Whisky"));
  assert.ok(!snapshot!.groups.some((group) => group.items.some((item) => item.category === "Whisky")));
  assert.ok(snapshot!.groups.some((group) => group.items.some((item) => item.itemName === "Arada")));
});

test("buildBarStockSnapshot resets Sold after mid-day closing", () => {
  const items: StockManagedItem[] = [
    baseItem({ id: "stk-beer-arada", name: "Arada", beerTier: "special" }),
  ];
  const balances: StockLocationBalance[] = [
    {
      itemId: "stk-beer-arada",
      itemName: "Arada",
      category: "Beer",
      unit: "bottle",
      location: "Main Bar",
      quantity: 28,
      reservedQuantity: 0,
      availableQuantity: 28,
      incomingQuantity: 0,
      reorderLevel: 10,
      inventoryValue: 1400,
    },
  ];

  const snapshot = buildBarStockSnapshot({
    items,
    balances,
    ledger: [
      {
        id: "l-sold",
        type: "POS_CONSUMPTION",
        date: "2026-07-20",
        transactionAt: "2026-07-20T05:00:00.000Z",
        itemId: "stk-beer-arada",
        itemName: "Arada",
        category: "Beer",
        location: "Main Bar",
        quantity: 1,
        unit: "bottle",
        totalCost: 50,
        enteredBy: "POS",
      },
    ],
    closings: [{ date: "2026-07-20", location: "Main Bar", closedAt: "2026-07-20T06:00:00.000Z" }],
    workspace: "Main Bar",
    today: "2026-07-20",
    salesRecords: [
      {
        id: "sr-1",
        date: "2026-07-20",
        month: "2026-07",
        time: "2026-07-20T05:00:00.000Z",
        orderId: "o-1",
        orderNo: "1",
        productId: "arada",
        productName: "Arada",
        category: "Beer",
        station: "Bar",
        qty: 1,
        unitPrice: 140,
        unitCost: 50,
        revenue: 140,
        expense: 50,
        profit: 90,
        area: "Main Hall",
        tableNumber: "1",
        waiter: "W",
        cashier: "C",
        paymentMethod: "Cash",
      },
    ],
  });

  assert.ok(snapshot);
  const arada = snapshot!.groups.flatMap((g) => g.items).find((row) => row.itemId === "stk-beer-arada");
  assert.equal(arada?.sold, 0);
  assert.equal(snapshot!.topSold.length, 0);
});

test("buildBarStockSnapshot counts Sold from sales after closing timestamp", () => {
  const items: StockManagedItem[] = [
    baseItem({ id: "stk-beer-arada", name: "Arada", beerTier: "special" }),
  ];
  const balances: StockLocationBalance[] = [
    {
      itemId: "stk-beer-arada",
      itemName: "Arada",
      category: "Beer",
      unit: "bottle",
      location: "Main Bar",
      quantity: 27,
      reservedQuantity: 0,
      availableQuantity: 27,
      incomingQuantity: 0,
      reorderLevel: 10,
      inventoryValue: 1350,
    },
  ];

  const snapshot = buildBarStockSnapshot({
    items,
    balances,
    ledger: [],
    closings: [{ date: "2026-07-20", location: "Main Bar", closedAt: "2026-07-20T06:00:00.000Z" }],
    workspace: "Main Bar",
    today: "2026-07-20",
    salesRecords: [
      {
        id: "sr-before",
        date: "2026-07-20",
        month: "2026-07",
        time: "2026-07-20T05:00:00.000Z",
        orderId: "o-1",
        orderNo: "1",
        productId: "arada",
        productName: "Arada",
        category: "Beer",
        station: "Bar",
        qty: 1,
        unitPrice: 140,
        unitCost: 50,
        revenue: 140,
        expense: 50,
        profit: 90,
        area: "Main Hall",
        tableNumber: "1",
        waiter: "W",
        cashier: "C",
        paymentMethod: "Cash",
      },
      {
        id: "sr-after",
        date: "2026-07-20",
        month: "2026-07",
        time: "2026-07-20T07:00:00.000Z",
        orderId: "o-2",
        orderNo: "2",
        productId: "arada",
        productName: "Arada",
        category: "Beer",
        station: "Bar",
        qty: 2,
        unitPrice: 140,
        unitCost: 50,
        revenue: 280,
        expense: 100,
        profit: 180,
        area: "Main Hall",
        tableNumber: "2",
        waiter: "W",
        cashier: "C",
        paymentMethod: "Cash",
      },
    ],
  });

  assert.ok(snapshot);
  const arada = snapshot!.groups.flatMap((g) => g.items).find((row) => row.itemId === "stk-beer-arada");
  assert.equal(arada?.sold, 2);
  assert.equal(snapshot!.topSold[0]?.qty, 2);
});

test("buildBeerCategorySummaries aggregates bottles, sold, and inventory value", () => {
  const items: StockManagedItem[] = [
    baseItem({ id: "beer-1", name: "Heineken", beerTier: "special", purchasePrice: 80 }),
    baseItem({ id: "beer-2", name: "Dashen", beerTier: "normal", purchasePrice: 60 }),
  ];
  const balances: StockLocationBalance[] = items.map((item) => ({
    itemId: item.id,
    itemName: item.name,
    category: item.category,
    unit: "bottle",
    location: "Main Bar",
    quantity: 10,
    reservedQuantity: 0,
    availableQuantity: 10,
    incomingQuantity: 0,
    reorderLevel: 5,
    inventoryValue: 500,
  }));

  const snapshot = buildBarStockSnapshot({
    items,
    balances,
    ledger: [],
    closings: [],
    workspace: "Main Bar",
    salesRecords: [],
  });

  const summaries = buildBeerCategorySummaries(snapshot!, items);
  assert.equal(summaries.length, 2);
  assert.equal(summaries[0]?.kind, "special-beer");
  assert.equal(summaries[0]?.totalBottles, 10);
  assert.equal(computeItemInventoryValue("beer-1", 10, items), 800);
});

test("resolveBarStockSearch expands matching beer groups and highlights brands", () => {
  const groups = buildBarStockSnapshot({
    items: [
      baseItem({ id: "beer-1", name: "Arada", beerTier: "special" }),
      baseItem({ id: "beer-2", name: "Dashen", beerTier: "normal" }),
    ],
    balances: [
      {
        itemId: "beer-1",
        itemName: "Arada",
        category: "Beer",
        unit: "bottle",
        location: "Main Bar",
        quantity: 5,
        reservedQuantity: 0,
        availableQuantity: 5,
        incomingQuantity: 0,
        reorderLevel: 2,
        inventoryValue: 250,
      },
      {
        itemId: "beer-2",
        itemName: "Dashen",
        category: "Beer",
        unit: "bottle",
        location: "Main Bar",
        quantity: 8,
        reservedQuantity: 0,
        availableQuantity: 8,
        incomingQuantity: 0,
        reorderLevel: 2,
        inventoryValue: 400,
      },
    ],
    ledger: [],
    closings: [],
    workspace: "Main Bar",
    salesRecords: [],
  })!.groups;

  const aradaSearch = resolveBarStockSearch(groups, "arada");
  assert.equal(aradaSearch.groups.length, 1);
  assert.ok(aradaSearch.expandGroupIds.has("special-beer"));
  assert.ok(aradaSearch.highlightItemIds.has("beer-1"));

  const categorySearch = resolveBarStockSearch(groups, "special beer");
  assert.equal(categorySearch.groups.length, 1);
  assert.ok(categorySearch.highlightItemIds.has("beer-1"));
});

test("sortBarStockGroupItems orders brands by sold quantity", () => {
  const items = [
    {
      itemId: "a",
      itemName: "A",
      category: "Beer" as const,
      unit: "bottle" as const,
      stock: 0,
      inTransit: 0,
      newEntered: 0,
      total: 0,
      sold: 2,
      left: 0,
      onHand: 0,
    },
    {
      itemId: "b",
      itemName: "B",
      category: "Beer" as const,
      unit: "bottle" as const,
      stock: 0,
      inTransit: 0,
      newEntered: 0,
      total: 0,
      sold: 9,
      left: 0,
      onHand: 0,
    },
  ];

  const sorted = sortBarStockGroupItems(items, "sold");
  assert.equal(sorted[0]?.itemId, "b");
});

test("buildBarStockReport returns category and brand rows", () => {
  const items: StockManagedItem[] = [
    baseItem({ id: "beer-1", name: "Heineken", beerTier: "special", purchasePrice: 50 }),
    baseItem({ id: "beer-2", name: "Dashen", beerTier: "normal", purchasePrice: 40 }),
  ];
  const snapshot = buildBarStockSnapshot({
    items,
    balances: items.map((item) => ({
      itemId: item.id,
      itemName: item.name,
      category: item.category,
      unit: "bottle",
      location: "Main Bar",
      quantity: 4,
      reservedQuantity: 0,
      availableQuantity: 4,
      incomingQuantity: 0,
      reorderLevel: 2,
      inventoryValue: 200,
    })),
    ledger: [],
    closings: [],
    workspace: "Main Bar",
    salesRecords: [],
  });

  const report = buildBarStockReport(snapshot!, items, "special-summary");
  assert.ok(report);
  assert.equal(report!.rows[0]?.label, "Special Beer");
  assert.equal(report!.rows.length, 2);
});

test("buildBarStockDailyReceivedMap groups store transfer receipts by date", () => {
  const items: StockManagedItem[] = [
    baseItem({ id: "beer-1", name: "Heineken", beerTier: "special" }),
    baseItem({ id: "soft-1", name: "Sprite", category: "Soft Drink" }),
  ];
  const balances: StockLocationBalance[] = items.map((item) => ({
    itemId: item.id,
    itemName: item.name,
    category: item.category,
    unit: "bottle",
    location: "Main Bar",
    quantity: 10,
    reservedQuantity: 0,
    availableQuantity: 10,
    incomingQuantity: 0,
    reorderLevel: 5,
    inventoryValue: 500,
  }));
  const ledger: StockLedgerEntry[] = [
    {
      id: "recv-1",
      type: "TRANSFER_IN",
      date: "2026-07-20",
      transactionAt: "2026-07-20T09:30:00.000Z",
      itemId: "beer-1",
      itemName: "Heineken",
      category: "Beer",
      location: "Main Bar",
      fromLocation: "Store 1",
      toLocation: "Main Bar",
      referenceNo: "TR-1001",
      quantity: 6,
      unit: "bottle",
      totalCost: 300,
      enteredBy: "Store",
      receivedBy: "Bar Lead",
    },
    {
      id: "recv-2",
      type: "TRANSFER_IN",
      date: "2026-07-20",
      itemId: "soft-1",
      itemName: "Sprite",
      category: "Soft Drink",
      location: "Main Bar",
      fromLocation: "Store 2",
      toLocation: "Main Bar",
      quantity: 12,
      unit: "bottle",
      totalCost: 240,
      enteredBy: "Store",
    },
    {
      id: "recv-3",
      type: "TRANSFER_IN",
      date: "2026-07-21",
      itemId: "beer-1",
      itemName: "Heineken",
      category: "Beer",
      location: "Main Bar",
      fromLocation: "Store 1",
      toLocation: "Main Bar",
      quantity: 4,
      unit: "bottle",
      totalCost: 200,
      enteredBy: "Store",
    },
    {
      id: "ignore-pos",
      type: "POS_CONSUMPTION",
      date: "2026-07-20",
      itemId: "beer-1",
      itemName: "Heineken",
      category: "Beer",
      location: "Main Bar",
      quantity: 2,
      unit: "bottle",
      totalCost: 100,
      enteredBy: "POS",
    },
  ];

  const receivedMap = buildBarStockDailyReceivedMap({ items, balances, ledger, workspace: "Main Bar" });
  const july20 = getBarStockReceivedForDate(receivedMap, "2026-07-20");
  const july21 = getBarStockReceivedForDate(receivedMap, "2026-07-21");

  assert.equal(receivedMap.size, 2);
  assert.equal(getBarStockReceivedDates(receivedMap)[0], "2026-07-21");
  assert.equal(july20?.lineCount, 2);
  assert.equal(july20?.itemCount, 2);
  assert.equal(july20?.totalQuantity, 18);
  assert.equal(july20?.totalValue, 540);
  assert.equal(july20?.lines[0]?.fromLocation, "Store 1");
  assert.equal(july20?.lines[0]?.referenceNo, "TR-1001");
  assert.equal(july20?.lines[0]?.receivedBy, "Bar Lead");
  assert.equal(july21?.totalQuantity, 4);
});

test("computeBarStockItemMetrics tracks double shot sales separately from bottles", () => {
  const item = baseItem({
    id: "stk-amarula",
    name: "Amarula",
    category: "Whisky",
    preferredLocation: "VIP Bar",
    conversions: [
      { id: "c1", label: "1 bottle = 25 doubles", fromUnit: "bottle", toUnit: "double shot", multiplier: 25 },
      { id: "c2", label: "1 bottle = 50 singles", fromUnit: "bottle", toUnit: "single shot", multiplier: 50 },
    ],
    bottleVolumeMl: 750,
  });
  const balance: StockLocationBalance = {
    itemId: item.id,
    itemName: item.name,
    category: "Whisky",
    unit: "bottle",
    location: "VIP Bar",
    quantity: 5.85,
    reservedQuantity: 0,
    availableQuantity: 5.85,
    incomingQuantity: 0,
    reorderLevel: 4,
    inventoryValue: 5000,
  };
  const ledger: StockLedgerEntry[] = [
    {
      id: "l-open",
      type: "OPENING_BALANCE",
      date: "2026-07-20",
      itemId: item.id,
      itemName: item.name,
      category: "Whisky",
      location: "VIP Bar",
      quantity: 6,
      unit: "bottle",
      totalCost: 1000,
      enteredBy: "Seed",
    },
    {
      id: "l-dbl",
      type: "POS_CONSUMPTION",
      date: "2026-07-20",
      itemId: item.id,
      itemName: item.name,
      category: "Whisky",
      location: "VIP Bar",
      quantity: 3,
      unit: "double shot",
      totalCost: 50,
      enteredBy: "POS",
    },
  ];

  const metrics = computeBarStockItemMetrics(item, balance, ledger, "VIP Bar", null, {
    today: "2026-07-20",
  });
  assert.equal(metrics.soldDoubleShots, 3);
  assert.equal(metrics.soldBottles, 0);
  assert.equal(metrics.sold, 0.12);
  assert.equal(metrics.remainingDoubles, 146.25);
  assert.equal(metrics.bottleVolumeMl, 750);
});

test("computeBarStockItemMetrics keeps ledger pour breakdown when sales mislabel bottles", () => {
  const item = baseItem({
    id: "stk-amarula",
    name: "Amarula",
    category: "Whisky",
    preferredLocation: "VIP Bar",
    conversions: [
      { id: "c1", label: "1 bottle = 25 doubles", fromUnit: "bottle", toUnit: "double shot", multiplier: 25 },
    ],
  });
  const balance: StockLocationBalance = {
    itemId: item.id,
    itemName: item.name,
    category: "Whisky",
    unit: "bottle",
    location: "VIP Bar",
    quantity: 5,
    reservedQuantity: 0,
    availableQuantity: 5,
    incomingQuantity: 0,
    reorderLevel: 4,
    inventoryValue: 5000,
  };
  const ledger: StockLedgerEntry[] = [
    {
      id: "l-dbl",
      type: "POS_CONSUMPTION",
      date: "2026-07-20",
      itemId: item.id,
      itemName: item.name,
      category: "Whisky",
      location: "VIP Bar",
      quantity: 1,
      unit: "double shot",
      totalCost: 50,
      enteredBy: "POS",
    },
  ];
  const metrics = computeBarStockItemMetrics(item, balance, ledger, "VIP Bar", null, {
    today: "2026-07-20",
    salesSoldQty: 2,
    salesSoldBottles: 2,
    salesSoldDoubleShots: 0,
    salesSoldSingleShots: 0,
  });
  assert.equal(metrics.soldDoubleShots, 1);
  assert.equal(metrics.soldBottles, 0);
  assert.equal(metrics.sold, 0.04);
});

test("VIP bar snapshot includes items with balance even when category is outside bar drink list", () => {
  const items: StockManagedItem[] = [
    baseItem({
      id: "stk-gin-misc",
      name: "Gordon's Gin",
      category: "Kitchen",
      preferredLocation: "Store 1",
    }),
  ];
  const balances: StockLocationBalance[] = [
    {
      itemId: "stk-gin-misc",
      itemName: "Gordon's Gin",
      category: "Kitchen",
      unit: "bottle",
      location: "VIP Bar",
      quantity: 6,
      reservedQuantity: 0,
      availableQuantity: 6,
      incomingQuantity: 0,
      reorderLevel: 2,
      inventoryValue: 300,
    },
  ];
  const snapshot = buildBarStockSnapshot({
    items,
    balances,
    ledger: [],
    closings: [],
    workspace: "VIP Bar",
    salesRecords: [],
    today: "2026-07-20",
  });
  assert.ok(snapshot);
  assert.equal(snapshot?.groups.some((group) => group.items.some((row) => row.itemId === "stk-gin-misc")), true);
});

test("buildBarStockReport lists only VIP spirits with sold activity", () => {
  const amarula = baseItem({
    id: "stk-amarula",
    name: "Amarula",
    category: "Whisky",
    preferredLocation: "VIP Bar",
    purchasePrice: 100,
    conversions: [
      { id: "c1", label: "1 bottle = 25 doubles", fromUnit: "bottle", toUnit: "double shot", multiplier: 25 },
    ],
  });
  const idle = baseItem({
    id: "stk-idle",
    name: "Idle Brand",
    category: "Whisky",
    preferredLocation: "VIP Bar",
    purchasePrice: 100,
  });
  const items = [amarula, idle];
  const balances: StockLocationBalance[] = items.map((item) => ({
    itemId: item.id,
    itemName: item.name,
    category: "Whisky",
    unit: "bottle",
    location: "VIP Bar",
    quantity: 6,
    reservedQuantity: 0,
    availableQuantity: 6,
    incomingQuantity: 0,
    reorderLevel: 2,
    inventoryValue: 600,
  }));
  const ledger: StockLedgerEntry[] = [
    {
      id: "l-sold",
      type: "POS_CONSUMPTION",
      date: "2026-07-20",
      itemId: "stk-amarula",
      itemName: "Amarula",
      category: "Whisky",
      location: "VIP Bar",
      quantity: 2,
      unit: "double shot",
      totalCost: 50,
      enteredBy: "POS",
    },
  ];
  const snapshot = buildBarStockSnapshot({
    items,
    balances,
    ledger,
    closings: [],
    workspace: "VIP Bar",
    salesRecords: [],
    today: "2026-07-20",
  });

  const report = buildBarStockReport(snapshot!, items, "spirit-sales-report");
  assert.ok(report);
  assert.equal(report!.rows.length, 1);
  assert.equal(report!.rows[0]?.label, "Amarula");
  assert.ok((report!.rows[0]?.sold ?? 0) > 0);
});

test("computeBarStockItemMetrics tracks damage/wastage and staff consumption after sold", () => {
  const item = baseItem({ id: "stk-beer-heineken", name: "Heineken", beerTier: "special" });
  const balance: StockLocationBalance = {
    itemId: item.id,
    itemName: item.name,
    category: "Beer",
    unit: "bottle",
    location: "Main Bar",
    quantity: 14,
    reservedQuantity: 0,
    availableQuantity: 14,
    incomingQuantity: 0,
    reorderLevel: 10,
    inventoryValue: 700,
  };
  const ledger: StockLedgerEntry[] = [
    {
      id: "l-sold",
      type: "POS_CONSUMPTION",
      date: "2026-07-20",
      itemId: item.id,
      itemName: item.name,
      category: "Beer",
      location: "Main Bar",
      quantity: 4,
      unit: "bottle",
      totalCost: 200,
      enteredBy: "POS",
    },
    {
      id: "l-damage",
      type: "DAMAGE",
      date: "2026-07-20",
      itemId: item.id,
      itemName: item.name,
      category: "Beer",
      location: "Main Bar",
      quantity: 1,
      unit: "bottle",
      totalCost: 50,
      enteredBy: "Bar",
    },
    {
      id: "l-waste",
      type: "WASTE",
      date: "2026-07-20",
      itemId: item.id,
      itemName: item.name,
      category: "Beer",
      location: "Main Bar",
      quantity: 1,
      unit: "bottle",
      totalCost: 50,
      enteredBy: "Bar",
    },
    {
      id: "l-staff",
      type: "STAFF_CONSUMPTION",
      date: "2026-07-20",
      itemId: item.id,
      itemName: item.name,
      category: "Beer",
      location: "Main Bar",
      quantity: 2,
      unit: "bottle",
      totalCost: 100,
      enteredBy: "Staff",
    },
  ];

  const metrics = computeBarStockItemMetrics(item, balance, ledger, "Main Bar", null, {
    today: "2026-07-20",
  });
  assert.equal(metrics.sold, 4);
  assert.equal(metrics.damageWastage, 2);
  assert.equal(metrics.staffConsumption, 2);
  assert.equal(metrics.stock, 22);
  assert.equal(metrics.total, 22);
  assert.equal(metrics.left, 14);
});

test("computeBarStockItemMetrics splits sold bottles into bottles, singles, and doubles", () => {
  const item = baseItem({
    id: "stk-black-label",
    name: "Black Label",
    category: "Whisky",
    preferredLocation: "VIP Bar",
    conversions: [
      { id: "c1", label: "1 bottle = 20 doubles", fromUnit: "bottle", toUnit: "double shot", multiplier: 20 },
      { id: "c2", label: "1 bottle = 40 singles", fromUnit: "bottle", toUnit: "single shot", multiplier: 40 },
    ],
  });
  const balance: StockLocationBalance = {
    itemId: item.id,
    itemName: item.name,
    category: "Whisky",
    unit: "bottle",
    location: "VIP Bar",
    quantity: 10,
    reservedQuantity: 0,
    availableQuantity: 10,
    incomingQuantity: 0,
    reorderLevel: 4,
    inventoryValue: 8000,
  };
  const metrics = computeBarStockItemMetrics(item, balance, [], "VIP Bar", null, {
    today: "2026-07-20",
    salesSoldQty: 7,
    salesSoldBottles: 5,
    salesSoldDoubleShots: 20,
    salesSoldSingleShots: 40,
  });
  assert.equal(metrics.soldBottles, 5);
  assert.equal(metrics.soldSingleShots, 40);
  assert.equal(metrics.soldDoubleShots, 20);
  assert.equal(metrics.sold, 7);
  assert.equal(metrics.left, 10);
});
