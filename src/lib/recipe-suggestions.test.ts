import test from "node:test";
import assert from "node:assert/strict";

import type { MenuItem } from "./demo-data";
import { suggestRecipeFromMenuItem } from "./recipe-suggestions";
import type { StockManagedItem } from "./stock-management";

test("suggestRecipeFromMenuItem uses linked stock sku and its base unit", () => {
  const menuItem = {
    id: "dulet",
    name_en: "Dulet",
    name_am: "ዱለት",
    category: "Meat",
    price: 250,
    cost: 0,
    station: "Kitchen",
    emoji: "",
    stockSku: "stk-onion",
    unitLabel: "plate",
    defaultQty: 1,
  } as MenuItem;

  const stockItems = [
    {
      id: "stk-onion",
      name: "Onion",
      category: "Kitchen",
      baseUnit: "kg",
      preferredLocation: "Kitchen",
      active: true,
    } as StockManagedItem,
    {
      id: "stk-beef-prime",
      name: "Prime Beef",
      category: "Meat",
      baseUnit: "kg",
      preferredLocation: "Butcher",
      active: true,
    } as StockManagedItem,
  ];

  const suggestion = suggestRecipeFromMenuItem({ menuItem, stockItems });
  assert.equal(suggestion.menuItemName, "Dulet");
  assert.equal(suggestion.preparationStation, "Kitchen");
  assert.equal(suggestion.outputUnit, "plate");
  assert.equal(suggestion.ingredients.length, 1);
  assert.equal(suggestion.ingredients[0]?.itemId, "stk-onion");
  assert.equal(suggestion.ingredients[0]?.unit, "kg");
  assert.ok(suggestion.relatedStockItems.some((item) => item.id === "stk-beef-prime"));
});

test("suggestRecipeFromMenuItem uses kg output for kilo menu items", () => {
  const menuItem = {
    id: "shekla",
    name_en: "Shekla",
    name_am: "ሸክላ",
    category: "Meat",
    price: 800,
    cost: 0,
    station: "Butcher House",
    emoji: "",
    stockSku: "stk-goat-limb-meat",
    pricingMode: "kg",
    unitLabel: "kg",
    defaultQty: 0.5,
    stockDeductionLocation: "Butcher",
  } as MenuItem;

  const stockItems = [
    {
      id: "stk-goat-limb-meat",
      name: "Goat Limb Meat",
      category: "Meat",
      baseUnit: "kg",
      preferredLocation: "Butcher",
      active: true,
    } as StockManagedItem,
  ];

  const suggestion = suggestRecipeFromMenuItem({ menuItem, stockItems });
  assert.equal(suggestion.outputUnit, "kg");
  assert.equal(suggestion.stockDeductionLocation, "Butcher");
  assert.equal(suggestion.ingredients[0]?.quantity, 0.5);
  assert.equal(suggestion.ingredients[0]?.unit, "kg");
});
