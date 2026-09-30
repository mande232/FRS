import test from "node:test";
import assert from "node:assert/strict";

import {
  buildCoffeeHousePosCupSummary,
  buildCoffeeHouseWorkspaceReport,
  COFFEE_BEANS_SKU,
  estimateCupsFromKg,
  estimateKgFromCups,
  GINGER_SKU,
  MILK_SKU,
  NUTS_SKU,
  TEA_LEAVES_SKU,
} from "./daily-consumption";
import type { SalesRecord } from "./demo-data";
import type { StockLocationBalance, StockManagedItem } from "./stock-management";

function sale(partial: Partial<SalesRecord> & Pick<SalesRecord, "productName" | "qty" | "revenue">): SalesRecord {
  return {
    id: partial.id ?? `sale-${Math.random().toString(36).slice(2, 7)}`,
    date: partial.date ?? "2026-07-24",
    month: "2026-07",
    time: "10:00",
    receiptNumber: "R1",
    productId: partial.productId,
    productName: partial.productName,
    category: "Hot Drinks",
    station: partial.station ?? "Coffee House",
    qty: partial.qty,
    unitPrice: 50,
    unitCost: 0,
    revenue: partial.revenue,
    expense: 0,
    profit: partial.revenue,
    area: "Main",
    tableNumber: "T1",
    waiter: "W",
    cashier: "C",
    paymentMethod: "Cash",
  };
}

test("buildCoffeeHousePosCupSummary aggregates cups and suggests bean/tea kg", () => {
  const summary = buildCoffeeHousePosCupSummary({
    date: "2026-07-24",
    salesRecords: [
      sale({ productId: "m1782752284800", productName: "Coffee", qty: 10, revenue: 500 }),
      sale({ productId: "m1782738368138", productName: "Tea", qty: 4, revenue: 200 }),
      sale({ productName: "Coffee", qty: 2, revenue: 100, station: "Kitchen" }),
    ],
  });

  assert.equal(summary.totalCups, 14);
  assert.equal(summary.suggestedByItemId[COFFEE_BEANS_SKU], 0.15);
  assert.equal(summary.suggestedByItemId[TEA_LEAVES_SKU], 0.02);
});

test("maps keshir to ginger kg, lewuz to nuts kg, wetet to milk liter, lemon tea to tea leaves", () => {
  const summary = buildCoffeeHousePosCupSummary({
    date: "2026-07-24",
    salesRecords: [
      sale({ productId: "m1782738284927", productName: "Keshir", qty: 5, revenue: 150 }),
      sale({ productId: "m1782738316675", productName: "Lewuz", qty: 3, revenue: 120 }),
      sale({ productId: "m1782738339804", productName: "Wetet", qty: 4, revenue: 160 }),
      sale({ productId: "m1782738395794", productName: "Lemon Tea", qty: 2, revenue: 80 }),
    ],
  });

  assert.equal(summary.totalCups, 14);
  assert.equal(summary.suggestedByItemId[GINGER_SKU], 0.05);
  assert.equal(summary.suggestedByItemId[NUTS_SKU], 0.06);
  assert.equal(summary.suggestedByItemId[MILK_SKU], 0.8);
  assert.equal(summary.suggestedByItemId[TEA_LEAVES_SKU], 0.01);
});

test("estimateKgFromCups and estimateCupsFromKg round-trip at default yields", () => {
  assert.equal(estimateKgFromCups(10, 0.015), 0.15);
  assert.equal(estimateCupsFromKg(0.15, 0.015), 10);
  assert.equal(estimateKgFromCups(4, 0.2), 0.8);
  assert.equal(estimateCupsFromKg(0.8, 0.2), 4);
  assert.equal(estimateKgFromCups(0, 0.015), 0);
  assert.equal(estimateCupsFromKg(1, 0), 0);
});

test("buildCoffeeHouseWorkspaceReport compares on-hand, suggested, and posted kg", () => {
  const items: StockManagedItem[] = [
    {
      id: COFFEE_BEANS_SKU,
      name: "Coffee Beans",
      category: "Beverage",
      baseUnit: "kg",
      purchaseUnit: "kg",
      conversionFactor: 1,
      reorderLevel: 1,
      active: true,
      trackLots: false,
    } as StockManagedItem,
    {
      id: TEA_LEAVES_SKU,
      name: "Tea Leaves",
      category: "Beverage",
      baseUnit: "kg",
      purchaseUnit: "kg",
      conversionFactor: 1,
      reorderLevel: 0.5,
      active: true,
      trackLots: false,
    } as StockManagedItem,
  ];
  const balances: StockLocationBalance[] = [
    {
      itemId: COFFEE_BEANS_SKU,
      itemName: "Coffee Beans",
      location: "Coffee House",
      quantity: 2,
      unit: "kg",
      reorderLevel: 1,
      category: "Beverage",
      unitCost: 500,
      totalValue: 1000,
    } as StockLocationBalance,
    {
      itemId: TEA_LEAVES_SKU,
      itemName: "Tea Leaves",
      location: "Coffee House",
      quantity: 0.5,
      unit: "kg",
      reorderLevel: 0.5,
      category: "Beverage",
      unitCost: 200,
      totalValue: 100,
    } as StockLocationBalance,
  ];

  const report = buildCoffeeHouseWorkspaceReport({
    date: "2026-07-24",
    salesRecords: [
      sale({ productId: "m1782752284800", productName: "Coffee", qty: 10, revenue: 500 }),
      sale({ productId: "m1782738368138", productName: "Tea", qty: 4, revenue: 200 }),
    ],
    balances,
    items,
    dailyConsumptions: [
      {
        id: "dc-1",
        documentType: "DAILY_CONSUMPTION",
        documentNumber: "DC-1",
        consumptionNumber: "DC-1",
        status: "Posted",
        department: "Coffee House",
        consumptionDate: "2026-07-24",
        createdAt: "2026-07-24T10:00:00.000Z",
        createdBy: "Tester",
        approvalHistory: [],
        lines: [
          {
            id: "l1",
            itemId: COFFEE_BEANS_SKU,
            itemName: "Coffee Beans",
            unit: "kg",
            quantityBefore: 2,
            consumedQuantity: 0.1,
            quantityAfter: 1.9,
            unitCost: 500,
            totalValue: 50,
            reorderLevel: 1,
            lowStock: false,
          },
        ],
      } as never,
    ],
  });

  assert.equal(report.totalCups, 14);
  assert.equal(report.beansOnHand, 2);
  assert.equal(report.beansSuggested, 0.15);
  assert.equal(report.beansPosted, 0.1);
  assert.equal(report.stockRows.find((row) => row.itemId === COFFEE_BEANS_SKU)?.varianceSuggestedVsPosted, 0.05);
  assert.ok((report.stockRows.find((row) => row.itemId === COFFEE_BEANS_SKU)?.cupsPossible ?? 0) > 100);
});

test("buildCoffeeHouseWorkspaceReport picks manually added milk by name and preferred location qty", () => {
  const items: StockManagedItem[] = [
    {
      id: "stk-user-milk-1",
      name: "Milk",
      category: "Coffee House",
      baseUnit: "liter",
      preferredLocation: "Store 1",
      reorderLevel: 5,
      active: true,
    } as StockManagedItem,
  ];
  const balances: StockLocationBalance[] = [
    {
      itemId: "stk-user-milk-1",
      itemName: "Milk",
      location: "Store 1",
      quantity: 12,
      unit: "liter",
      reorderLevel: 5,
      category: "Coffee House",
      unitCost: 85,
      totalValue: 1020,
    } as StockLocationBalance,
  ];

  const report = buildCoffeeHouseWorkspaceReport({
    date: "2026-07-24",
    salesRecords: [sale({ productId: "m1782738339804", productName: "Wetet", qty: 2, revenue: 80 })],
    balances,
    items,
    dailyConsumptions: [],
  });

  const milkRow = report.stockRows.find((row) => row.itemId === MILK_SKU);
  assert.equal(milkRow?.itemName, "Milk");
  assert.equal(milkRow?.unit, "liter");
  assert.equal(milkRow?.onHandKg, 12);
  assert.equal(report.milkOnHand, 12);
  assert.equal(report.milkSuggested, 0.4);
});
