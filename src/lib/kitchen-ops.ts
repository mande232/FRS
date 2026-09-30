import type { SalesRecord } from "./demo-data";
import type { DailyConsumptionDocument } from "./daily-consumption";
import type {
  StockLedgerEntry,
  StockLocationBalance,
  StockManagedItem,
  StockRecipe,
} from "./stock-management";

function money(value: number) {
  return Math.round((Number.isFinite(value) ? value : 0) * 100) / 100;
}

function qty(value: number) {
  return Math.round((Number.isFinite(value) ? value : 0) * 1000) / 1000;
}

function normalizeName(value: string) {
  return value.trim().toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

export function isKitchenSale(record: SalesRecord) {
  const station = (record.station ?? "").toLowerCase();
  return station.includes("kitchen");
}

/** Recipes Kitchen users should see / manage (excludes Coffee House / Bar recipes). */
export function isKitchenManagedRecipe(recipe: StockRecipe) {
  const category = normalizeName(recipe.category ?? "");
  const station = normalizeName(recipe.preparationStation ?? "");
  const location = recipe.stockDeductionLocation;
  if (location === "Coffee House" || location === "Main Bar" || location === "VIP Bar") return false;
  if (category.includes("coffee")) return false;
  if (location === "Kitchen") return true;
  if (station.includes("kitchen")) return true;
  if (recipe.ingredients.some((line) => line.stockDeductionLocation === "Kitchen")) return true;
  if (
    ["kitchen", "meat", "fasting", "starters", "extra", "traditional", "food"].some((token) =>
      category.includes(token),
    )
  ) {
    return true;
  }
  // Uncategorized recipes with no location default to Kitchen-managed.
  return !location && !category.includes("bar") && !category.includes("drink");
}

function kitchenIngredientLocation(recipe: StockRecipe, line: StockRecipe["ingredients"][number]) {
  return line.stockDeductionLocation ?? recipe.stockDeductionLocation ?? "Kitchen";
}

function findRecipeForSale(recipes: StockRecipe[], productName: string) {
  const key = normalizeName(productName);
  return recipes.find((recipe) => normalizeName(recipe.menuItemName) === key);
}

export type KitchenPosPlateLine = {
  productId?: string;
  productName: string;
  qty: number;
  revenue: number;
  hasRecipe: boolean;
  recipeId?: string;
};

export type KitchenStockCheckRow = {
  itemId: string;
  itemName: string;
  unit: string;
  onHand: number;
  suggestedFromRecipes: number;
  posDeducted: number;
  dcPosted: number;
  /** Suggested − POS/recipe auto deductions. */
  varianceVsPos: number;
  /** Suggested − posted daily consumption. */
  varianceVsDc: number;
  /** Prefer POS tracking when auto-deductions already exist. */
  tracking: "pos" | "daily_consumption" | "both" | "untracked";
  reorderLevel: number;
};

export type KitchenWorkspaceReport = {
  date: string;
  plates: KitchenPosPlateLine[];
  totalPlates: number;
  totalRevenue: number;
  mappedPlates: number;
  unmappedPlates: number;
  stockRows: KitchenStockCheckRow[];
  /** Suggested Kitchen ingredient qty by item id (for DC prefill of non-POS items). */
  suggestedDcByItemId: Record<string, number>;
  recipeCountUsed: number;
};

function balanceAtKitchen(balances: StockLocationBalance[], itemId: string) {
  return qty(
    balances
      .filter((row) => row.itemId === itemId && row.location === "Kitchen")
      .reduce((sum, row) => sum + row.quantity, 0),
  );
}

function posDeductedAtKitchen(
  ledger: StockLedgerEntry[],
  itemId: string,
  date: string,
) {
  return qty(
    ledger
      .filter(
        (entry) =>
          entry.date === date &&
          entry.itemId === itemId &&
          entry.location === "Kitchen" &&
          (entry.type === "POS_CONSUMPTION" || entry.type === "RECIPE_CONSUMPTION"),
      )
      .reduce((sum, entry) => sum + entry.quantity, 0),
  );
}

function postedDailyAtKitchen(
  documents: DailyConsumptionDocument[],
  itemId: string,
  date: string,
) {
  return qty(
    documents
      .filter((doc) => doc.status === "Posted" && doc.department === "Kitchen" && doc.consumptionDate === date)
      .flatMap((doc) => doc.lines)
      .filter((line) => line.itemId === itemId)
      .reduce((sum, line) => sum + line.consumedQuantity, 0),
  );
}

/**
 * Kitchen day report: POS plates → recipe BOM explode → compare to POS deductions and daily consumption.
 */
export function buildKitchenWorkspaceReport(input: {
  salesRecords: SalesRecord[];
  balances: StockLocationBalance[];
  items: StockManagedItem[];
  ledger: StockLedgerEntry[];
  dailyConsumptions: DailyConsumptionDocument[];
  recipes: StockRecipe[];
  date: string;
}): KitchenWorkspaceReport {
  const kitchenRecipes = input.recipes.filter(isKitchenManagedRecipe);
  const platesByKey = new Map<string, KitchenPosPlateLine>();
  const suggestedByItemId: Record<string, number> = {};
  const recipeIdsUsed = new Set<string>();

  for (const record of input.salesRecords) {
    if (record.date !== input.date) continue;
    if (!isKitchenSale(record)) continue;
    if (!(record.qty > 0)) continue;

    const key = `${record.productId ?? ""}|${record.productName}`;
    const recipe = findRecipeForSale(kitchenRecipes, record.productName);
    const existing = platesByKey.get(key);
    if (existing) {
      existing.qty = qty(existing.qty + record.qty);
      existing.revenue = money(existing.revenue + record.revenue);
    } else {
      platesByKey.set(key, {
        productId: record.productId,
        productName: record.productName,
        qty: qty(record.qty),
        revenue: money(record.revenue),
        hasRecipe: Boolean(recipe),
        recipeId: recipe?.id,
      });
    }

    if (!recipe) continue;
    recipeIdsUsed.add(recipe.id);
    const outputQty = recipe.outputQty > 0 ? recipe.outputQty : 1;
    const wastage = 1 + Math.max(0, recipe.wastageAllowance ?? 0) / 100;
    const portions = record.qty / outputQty;

    for (const line of recipe.ingredients) {
      if (!(line.quantity > 0)) continue;
      if (kitchenIngredientLocation(recipe, line) !== "Kitchen") continue;
      const need = qty(portions * line.quantity * wastage);
      suggestedByItemId[line.itemId] = qty((suggestedByItemId[line.itemId] ?? 0) + need);
    }
  }

  const plates = [...platesByKey.values()].sort(
    (a, b) => b.qty - a.qty || a.productName.localeCompare(b.productName),
  );

  const itemIds = new Set<string>([
    ...Object.keys(suggestedByItemId),
    ...input.ledger
      .filter(
        (entry) =>
          entry.date === input.date &&
          entry.location === "Kitchen" &&
          (entry.type === "POS_CONSUMPTION" || entry.type === "RECIPE_CONSUMPTION") &&
          entry.itemId,
      )
      .map((entry) => entry.itemId as string),
    ...input.dailyConsumptions
      .filter((doc) => doc.status === "Posted" && doc.department === "Kitchen" && doc.consumptionDate === input.date)
      .flatMap((doc) => doc.lines.map((line) => line.itemId)),
  ]);

  // Include Kitchen on-hand items that appear in kitchen recipes even with no sales today.
  for (const recipe of kitchenRecipes) {
    for (const line of recipe.ingredients) {
      if (kitchenIngredientLocation(recipe, line) === "Kitchen") itemIds.add(line.itemId);
    }
  }

  const stockRows: KitchenStockCheckRow[] = [...itemIds]
    .map((itemId) => {
      const item = input.items.find((row) => row.id === itemId);
      const balance = input.balances.find((row) => row.itemId === itemId && row.location === "Kitchen");
      const onHand = balanceAtKitchen(input.balances, itemId);
      const suggestedFromRecipes = qty(suggestedByItemId[itemId] ?? 0);
      const posDeducted = posDeductedAtKitchen(input.ledger, itemId, input.date);
      const dcPosted = postedDailyAtKitchen(input.dailyConsumptions, itemId, input.date);
      const tracking: KitchenStockCheckRow["tracking"] =
        posDeducted > 0 && dcPosted > 0
          ? "both"
          : posDeducted > 0
            ? "pos"
            : dcPosted > 0 || suggestedFromRecipes > 0
              ? "daily_consumption"
              : "untracked";
      return {
        itemId,
        itemName: item?.name ?? balance?.itemName ?? itemId,
        unit: item?.baseUnit ?? balance?.unit ?? "kg",
        onHand,
        suggestedFromRecipes,
        posDeducted,
        dcPosted,
        varianceVsPos: qty(suggestedFromRecipes - posDeducted),
        varianceVsDc: qty(suggestedFromRecipes - dcPosted),
        tracking,
        reorderLevel: balance?.reorderLevel ?? item?.reorderLevel ?? 0,
      };
    })
    .filter((row) => row.onHand > 0 || row.suggestedFromRecipes > 0 || row.posDeducted > 0 || row.dcPosted > 0)
    .sort((a, b) => b.suggestedFromRecipes - a.suggestedFromRecipes || a.itemName.localeCompare(b.itemName));

  const suggestedDcByItemId: Record<string, number> = {};
  for (const row of stockRows) {
    // Prefill DC only when POS has not already covered the suggested use.
    if (row.suggestedFromRecipes > 0 && row.posDeducted + 0.0001 < row.suggestedFromRecipes) {
      suggestedDcByItemId[row.itemId] = qty(Math.max(0, row.suggestedFromRecipes - row.posDeducted));
    }
  }

  return {
    date: input.date,
    plates,
    totalPlates: qty(plates.reduce((sum, row) => sum + row.qty, 0)),
    totalRevenue: money(plates.reduce((sum, row) => sum + row.revenue, 0)),
    mappedPlates: qty(plates.filter((row) => row.hasRecipe).reduce((sum, row) => sum + row.qty, 0)),
    unmappedPlates: qty(plates.filter((row) => !row.hasRecipe).reduce((sum, row) => sum + row.qty, 0)),
    stockRows,
    suggestedDcByItemId,
    recipeCountUsed: recipeIdsUsed.size,
  };
}
