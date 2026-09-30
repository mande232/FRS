import type { MenuItem } from "./demo-data";
import {
  isOperationalStockLocation,
  stationToOperationalLocation,
  type OperationalStockLocation,
  type StockManagedItem,
  type StockRecipe,
  type StockRecipeLine,
  type StockUnitType,
} from "./stock-management";

function normalizeName(value: string) {
  return value.trim().toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

function qty(value: number) {
  return Math.round((Number.isFinite(value) ? value : 0) * 1000) / 1000;
}

export function resolveMenuStockItem(
  menuItem: Pick<MenuItem, "stockSku" | "name_en">,
  stockItems: StockManagedItem[],
) {
  const sku = (menuItem.stockSku ?? "").trim();
  if (sku && sku !== (menuItem as { id?: string }).id && sku.startsWith("stk-")) {
    const byId = stockItems.find((item) => item.id === sku && item.active !== false);
    if (byId) return byId;
  }
  const name = normalizeName(menuItem.name_en);
  return stockItems.find(
    (item) => item.active !== false && normalizeName(item.name) === name,
  );
}

export function menuOutputUnit(menuItem: Pick<MenuItem, "unitLabel" | "pricingMode" | "sellingUnit">) {
  if (menuItem.pricingMode === "kg") return "kg";
  const label = (menuItem.unitLabel || menuItem.sellingUnit || "").trim().toLowerCase();
  if (label.includes("kg") || label.includes("kilo")) return "kg";
  if (label.includes("liter") || label === "l") return "liter";
  if (label.includes("cup")) return "cup";
  if (label.includes("plate") || label.includes("portion")) return label.includes("plate") ? "plate" : "portion";
  return menuItem.unitLabel?.trim() || menuItem.sellingUnit?.trim() || "portion";
}

export function menuStockLocation(
  menuItem: Pick<MenuItem, "station" | "stockDeductionLocation">,
): OperationalStockLocation {
  const explicit = menuItem.stockDeductionLocation?.trim();
  if (explicit && isOperationalStockLocation(explicit)) return explicit;
  return stationToOperationalLocation(menuItem.station) ?? "Kitchen";
}

/** Build one BOM line from a stock item, always using that item's base unit. */
export function recipeLineFromStockItem(
  item: StockManagedItem,
  quantity = 1,
  location?: OperationalStockLocation,
): StockRecipeLine {
  return {
    id: `line-${item.id}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    itemId: item.id,
    itemName: item.name,
    quantity: qty(Math.max(0, quantity)),
    unit: item.baseUnit,
    stockDeductionLocation: location ?? (isOperationalStockLocation(item.preferredLocation) ? item.preferredLocation : undefined),
  };
}

/**
 * Suggest recipe header + ingredient lines from a menu item.
 * Primary suggestion uses menu stock_sku (or name match) in the stock item's base unit.
 * Also returns related department stock items for quick-add chips.
 */
export function suggestRecipeFromMenuItem(input: {
  menuItem: MenuItem;
  stockItems: StockManagedItem[];
  keepExistingIngredients?: StockRecipeLine[];
}): {
  menuItemName: string;
  category: string;
  preparationStation: string;
  stockDeductionLocation: OperationalStockLocation;
  outputQty: number;
  outputUnit: string;
  ingredients: StockRecipeLine[];
  relatedStockItems: StockManagedItem[];
} {
  const location = menuStockLocation(input.menuItem);
  const linked = resolveMenuStockItem(input.menuItem, input.stockItems);
  const defaultQty =
    input.menuItem.pricingMode === "kg"
      ? qty(input.menuItem.defaultQty ?? 1)
      : qty(input.menuItem.defaultQty ?? (linked ? 1 : 0));

  const existing = input.keepExistingIngredients ?? [];
  const ingredients: StockRecipeLine[] = [];

  if (linked) {
    const already = existing.some((line) => line.itemId === linked.id);
    if (!already) {
      ingredients.push(
        recipeLineFromStockItem(
          linked,
          defaultQty > 0 ? defaultQty : 1,
          location,
        ),
      );
    }
  }

  for (const line of existing) {
    const stock = input.stockItems.find((item) => item.id === line.itemId);
    ingredients.push({
      ...line,
      itemName: stock?.name ?? line.itemName,
      unit: (stock?.baseUnit ?? line.unit) as StockUnitType,
    });
  }

  const relatedStockItems = input.stockItems
    .filter((item) => item.active !== false)
    .filter((item) => item.id !== linked?.id)
    .filter((item) => {
      if (item.preferredLocation === location) return true;
      const category = normalizeName(item.category ?? "");
      const menuCategory = normalizeName(input.menuItem.category ?? "");
      if (menuCategory && category.includes(menuCategory)) return true;
      if (location === "Kitchen" && (category.includes("kitchen") || category.includes("meat"))) return true;
      if (location === "Coffee House" && category.includes("coffee")) return true;
      return false;
    })
    .sort((a, b) => a.name.localeCompare(b.name))
    .slice(0, 12);

  return {
    menuItemName: input.menuItem.name_en,
    category: input.menuItem.category || "Kitchen",
    preparationStation: input.menuItem.station || "Kitchen",
    stockDeductionLocation: location,
    outputQty: 1,
    outputUnit: menuOutputUnit(input.menuItem),
    ingredients,
    relatedStockItems,
  };
}

export function applyStockItemUnitToLine(
  line: StockRecipeLine,
  stockItems: StockManagedItem[],
): StockRecipeLine {
  const stock = stockItems.find((item) => item.id === line.itemId);
  if (!stock) return line;
  return {
    ...line,
    itemName: stock.name,
    unit: stock.baseUnit,
  };
}

export type MenuRecipeSuggestion = ReturnType<typeof suggestRecipeFromMenuItem>;
