import test from "node:test";
import assert from "node:assert/strict";

import { buildKitchenWorkspaceReport, isKitchenManagedRecipe } from "./kitchen-ops";
import type { SalesRecord } from "./demo-data";
import type { StockLedgerEntry, StockLocationBalance, StockManagedItem, StockRecipe } from "./stock-management";

function sale(partial: Partial<SalesRecord> & Pick<SalesRecord, "productName" | "qty" | "revenue">): SalesRecord {
  return {
    id: partial.id ?? `sale-${Math.random().toString(36).slice(2, 7)}`,
    date: partial.date ?? "2026-07-24",
    month: "2026-07",
    time: "12:00",
    receiptNumber: "R1",
    productId: partial.productId,
    productName: partial.productName,
    category: "Meat",
    station: partial.station ?? "Kitchen",
    qty: partial.qty,
    unitPrice: 100,
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

test("isKitchenManagedRecipe excludes coffee house recipes", () => {
  assert.equal(
    isKitchenManagedRecipe({
      id: "r1",
      menuItemName: "Coffee",
      category: "Coffee House",
      outputQty: 1,
      outputUnit: "cup",
      stockDeductionLocation: "Coffee House",
      ingredients: [],
      updatedAt: "",
    }),
    false,
  );
  assert.equal(
    isKitchenManagedRecipe({
      id: "r2",
      menuItemName: "Dulet",
      category: "Kitchen",
      outputQty: 1,
      outputUnit: "plate",
      stockDeductionLocation: "Kitchen",
      ingredients: [],
      updatedAt: "",
    }),
    true,
  );
});

test("buildKitchenWorkspaceReport explodes recipes and compares POS deductions", () => {
  const recipes: StockRecipe[] = [
    {
      id: "recipe-dulet",
      menuItemName: "Dulet",
      category: "Kitchen",
      outputQty: 1,
      outputUnit: "plate",
      stockDeductionLocation: "Kitchen",
      ingredients: [
        { id: "d1", itemId: "stk-onion", itemName: "Onion", quantity: 0.05, unit: "kg", stockDeductionLocation: "Kitchen" },
      ],
      updatedAt: "",
    },
  ];
  const items: StockManagedItem[] = [
    {
      id: "stk-onion",
      name: "Onion",
      category: "Kitchen",
      baseUnit: "kg",
      preferredLocation: "Kitchen",
      reorderLevel: 5,
      active: true,
    } as StockManagedItem,
  ];
  const balances: StockLocationBalance[] = [
    {
      itemId: "stk-onion",
      itemName: "Onion",
      location: "Kitchen",
      quantity: 10,
      unit: "kg",
      reorderLevel: 5,
      category: "Kitchen",
      unitCost: 40,
      totalValue: 400,
    } as StockLocationBalance,
  ];
  const ledger: StockLedgerEntry[] = [
    {
      id: "led-1",
      type: "RECIPE_CONSUMPTION",
      date: "2026-07-24",
      itemId: "stk-onion",
      itemName: "Onion",
      location: "Kitchen",
      quantity: 0.1,
      unit: "kg",
      totalCost: 4,
      enteredBy: "POS",
    } as StockLedgerEntry,
  ];

  const report = buildKitchenWorkspaceReport({
    date: "2026-07-24",
    salesRecords: [
      sale({ productName: "Dulet", qty: 4, revenue: 800 }),
      sale({ productName: "Unknown Stew", qty: 1, revenue: 100 }),
      sale({ productName: "Dulet", qty: 1, revenue: 200, station: "Coffee House" }),
    ],
    balances,
    items,
    ledger,
    dailyConsumptions: [],
    recipes,
  });

  assert.equal(report.totalPlates, 5);
  assert.equal(report.mappedPlates, 4);
  assert.equal(report.unmappedPlates, 1);
  const onion = report.stockRows.find((row) => row.itemId === "stk-onion");
  assert.equal(onion?.suggestedFromRecipes, 0.2);
  assert.equal(onion?.posDeducted, 0.1);
  assert.equal(onion?.varianceVsPos, 0.1);
  assert.equal(report.suggestedDcByItemId["stk-onion"], 0.1);
});
