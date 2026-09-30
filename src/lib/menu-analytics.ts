import type { MenuItem, ProductionStation } from "@/lib/demo-data";
import { isConfiguredStation } from "@/lib/stations";
import {
  OPERATIONAL_STOCK_LOCATIONS,
  isGoatPoolSku,
  isOperationalStockLocation,
  stationToOperationalLocation,
  type StockLocation,
  type StockLocationBalance,
  type StockLot,
  type StockManagedItem,
  type StockRecipe,
} from "@/lib/stock-management";

export type MenuQuickFilter =
  | "all"
  | "active"
  | "inactive"
  | "available"
  | "out_of_stock"
  | "missing_recipe"
  | "missing_station"
  | "missing_stock_link"
  | "low_margin"
  | "price_issues"
  | "recently_added";

export type MenuFiltersState = {
  search: string;
  category: string;
  station: string;
  deductionLocation: string;
  diet: string;
  itemType: string;
  quick: MenuQuickFilter;
  priceMin: string;
  priceMax: string;
  marginMin: string;
};

export type MenuItemType = "Direct Stock" | "Recipe Item" | "Modifier" | "Combo" | "Open Price Item";

export type PriceIssueKind =
  | "zero"
  | "negative"
  | "missing"
  | "below_cost"
  | "cost_above_price"
  | "unusually_high"
  | "unusually_low";

export type RoutingIssueKind =
  | "missing_station"
  | "invalid_station"
  | "missing_deduction_location"
  | "store_deduction_location"
  | "missing_stock_link"
  | "missing_recipe";

export type MenuItemInsight = {
  item: MenuItem;
  itemType: MenuItemType;
  margin: number;
  marginPct: number;
  grossProfit: number;
  availability: "Available" | "Low Stock" | "Out of Stock" | "Temporarily Unavailable" | "Inactive";
  posVisible: boolean;
  priceIssues: PriceIssueKind[];
  routingIssues: RoutingIssueKind[];
  recipeStatus: "Complete" | "Missing" | "Incomplete" | "Zero Cost" | "Cost Above Price" | "N/A";
  recipe?: StockRecipe;
  stockQty?: number;
  attentionCount: number;
};

export type StationSummary = {
  station: ProductionStation;
  total: number;
  active: number;
  inactive: number;
  available: number;
  outOfStock: number;
  missingRecipe: number;
  missingStockLink: number;
  routingErrors: number;
  averagePrice: number;
  medianPrice: number;
  averageCost: number;
  averageMarginPct: number;
  attentionCount: number;
};

export type MenuSummary = {
  totalItems: number;
  totalCategories: number;
  totalStations: number;
  activeItems: number;
  unavailableItems: number;
  routingProblems: number;
  priceIssueCount: number;
  lastUpdated?: string;
};

const CENTRAL_STORES = new Set(["Store 1", "Store 2"]);
const HIGH_UNIT_PRICE = 5000;
const HIGH_KG_PRICE = 15000;
const LOW_PRICE = 5;

export function defaultMenuFilters(): MenuFiltersState {
  return {
    search: "",
    category: "All",
    station: "All",
    deductionLocation: "All",
    diet: "All",
    itemType: "All",
    quick: "all",
    priceMin: "",
    priceMax: "",
    marginMin: "",
  };
}

export function isButcherStation(station: string) {
  const key = station.toLowerCase();
  return key.includes("butcher") || key.includes("meat") || key.includes("grill");
}

export function resolveItemType(item: MenuItem): MenuItemType {
  if (item.stockDeductionRule === "direct" || item.stockSku) return "Direct Stock";
  if (item.stockDeductionRule === "recipe") return "Recipe Item";
  if (item.pricingMode === "kg") return "Direct Stock";
  return "Recipe Item";
}

export function detectPriceIssues(item: MenuItem): PriceIssueKind[] {
  const issues: PriceIssueKind[] = [];
  if (item.price == null || Number.isNaN(item.price)) issues.push("missing");
  else if (item.price === 0) issues.push("zero");
  else if (item.price < 0) issues.push("negative");
  else {
    const highThreshold = item.pricingMode === "kg" ? HIGH_KG_PRICE : HIGH_UNIT_PRICE;
    if (item.price > highThreshold) issues.push("unusually_high");
    if (item.price < LOW_PRICE) issues.push("unusually_low");
  }
  if (item.cost > 0 && item.price > 0 && item.cost > item.price) issues.push("cost_above_price");
  if (item.cost > 0 && item.price > 0 && item.price < item.cost) issues.push("below_cost");
  return issues;
}

export function computeMargin(item: MenuItem) {
  const revenue = Math.max(0, item.price);
  const cost = Math.max(0, item.cost);
  const grossProfit = revenue - cost;
  const marginPct = revenue > 0 ? (grossProfit / revenue) * 100 : 0;
  return { grossProfit, marginPct };
}

function recipeForItem(item: MenuItem, recipes: readonly StockRecipe[]) {
  return recipes.find(
    (recipe) =>
      recipe.menuItemName.trim().toLowerCase() === item.name_en.trim().toLowerCase() ||
      recipe.menuItemName.trim().toLowerCase() === item.name_am.trim().toLowerCase(),
  );
}

function qty(value: number) {
  return Math.round((Number.isFinite(value) ? value : 0) * 1000) / 1000;
}

function resolveMenuStockLookupLocation(item: MenuItem): string | null {
  const explicit = item.stockDeductionLocation?.trim();
  if (explicit && isOperationalStockLocation(explicit as StockLocation)) return explicit;
  if (explicit) {
    const mappedExplicit = stationToOperationalLocation(explicit);
    if (mappedExplicit) return mappedExplicit;
  }
  const fromStation = stationToOperationalLocation(item.station);
  if (fromStation) return fromStation;
  return explicit || item.station || null;
}

function goatPoolLotRemainingKg(stockSku: string, lots: readonly StockLot[]) {
  return qty(
    lots
      .filter(
        (lot) =>
          lot.itemId === stockSku &&
          lot.location === "Butcher" &&
          lot.status === "Available",
      )
      .reduce((sum, lot) => sum + lot.quantity, 0),
  );
}

function stockBalanceForItem(
  item: MenuItem,
  stockItems: readonly StockManagedItem[],
  balances: readonly StockLocationBalance[],
  lots: readonly StockLot[] = [],
) {
  if (!item.stockSku) return undefined;
  void stockItems;

  // Goat processing "left" is lot-based at Butcher — menu must use the same source.
  if (isGoatPoolSku(item.stockSku)) {
    const hasGoatLots = lots.some((lot) => lot.itemId === item.stockSku);
    if (hasGoatLots) return goatPoolLotRemainingKg(item.stockSku, lots);
    const butcherRow = balances.find(
      (balance) => balance.itemId === item.stockSku && balance.location === "Butcher",
    );
    if (butcherRow) return butcherRow.quantity;
  }

  const location = resolveMenuStockLookupLocation(item);
  if (location) {
    const row = balances.find(
      (balance) => balance.itemId === item.stockSku && String(balance.location) === location,
    );
    if (row) return row.availableQuantity;
  }
  return balances
    .filter((balance) => balance.itemId === item.stockSku)
    .reduce((sum, balance) => sum + balance.availableQuantity, 0);
}

export function detectRoutingIssues(
  item: MenuItem,
  stations: readonly ProductionStation[],
  recipes: readonly StockRecipe[],
): RoutingIssueKind[] {
  const issues: RoutingIssueKind[] = [];
  if (!item.station?.trim()) issues.push("missing_station");
  else if (!isConfiguredStation(item.station, stations)) issues.push("invalid_station");

  const deduction = item.stockDeductionLocation || item.station;
  if (!deduction) issues.push("missing_deduction_location");
  else if (CENTRAL_STORES.has(deduction)) issues.push("store_deduction_location");

  const type = resolveItemType(item);
  if (type === "Direct Stock" && !item.stockSku) issues.push("missing_stock_link");
  if (type === "Recipe Item" && !recipeForItem(item, recipes)) issues.push("missing_recipe");
  return issues;
}

function resolveAvailability(
  item: MenuItem,
  stockQty: number | undefined,
): MenuItemInsight["availability"] {
  if (item.outOfStockBehavior === "auto_unavailable" && stockQty != null && stockQty <= 0) {
    return "Out of Stock";
  }
  if (item.minimumStock != null && stockQty != null && stockQty <= item.minimumStock) {
    return "Low Stock";
  }
  if (stockQty != null && stockQty <= 0 && item.stockSku) return "Out of Stock";
  return "Available";
}

export function analyzeMenuItem(
  item: MenuItem,
  stations: readonly ProductionStation[],
  recipes: readonly StockRecipe[],
  stockItems: readonly StockManagedItem[],
  balances: readonly StockLocationBalance[],
  lots: readonly StockLot[] = [],
): MenuItemInsight {
  const recipe = recipeForItem(item, recipes);
  const priceIssues = detectPriceIssues(item);
  const routingIssues = detectRoutingIssues(item, stations, recipes);
  const { grossProfit, marginPct } = computeMargin(item);
  const stockQty = stockBalanceForItem(item, stockItems, balances, lots);
  const itemType = resolveItemType(item);

  let recipeStatus: MenuItemInsight["recipeStatus"] = "N/A";
  if (itemType === "Recipe Item") {
    if (!recipe) recipeStatus = "Missing";
    else if (recipe.ingredients.length === 0) recipeStatus = "Incomplete";
    else if (item.cost <= 0) recipeStatus = "Zero Cost";
    else if (item.cost > item.price && item.price > 0) recipeStatus = "Cost Above Price";
    else recipeStatus = "Complete";
  }

  const attentionCount = priceIssues.length + routingIssues.length + (recipeStatus === "Missing" || recipeStatus === "Incomplete" ? 1 : 0);

  return {
    item,
    itemType,
    margin: marginPct,
    marginPct,
    grossProfit,
    availability: resolveAvailability(item, stockQty),
    posVisible: true,
    priceIssues,
    routingIssues,
    recipeStatus,
    recipe,
    stockQty,
    attentionCount,
  };
}

export function robustAveragePrice(items: readonly MenuItem[]) {
  const unitPrices = items
    .filter((item) => item.price > 0)
    .map((item) => item.price)
    .sort((a, b) => a - b);
  if (unitPrices.length === 0) return 0;
  const median = unitPrices[Math.floor(unitPrices.length / 2)] ?? 0;
  const trimmed = unitPrices.filter((price) => price <= median * 4 && price >= median / 4);
  const pool = trimmed.length > 0 ? trimmed : unitPrices;
  return pool.reduce((sum, price) => sum + price, 0) / pool.length;
}

export function medianPrice(items: readonly MenuItem[]) {
  const prices = items.map((item) => item.price).filter((price) => price > 0).sort((a, b) => a - b);
  if (!prices.length) return 0;
  return prices[Math.floor(prices.length / 2)] ?? 0;
}

export function computeStationSummaries(
  items: readonly MenuItem[],
  stations: readonly ProductionStation[],
  recipes: readonly StockRecipe[],
  stockItems: readonly StockManagedItem[],
  balances: readonly StockLocationBalance[],
  lots: readonly StockLot[] = [],
): StationSummary[] {
  return stations.map((station) => {
    const stationItems = items.filter((item) => item.station === station);
    const insights = stationItems.map((item) =>
      analyzeMenuItem(item, stations, recipes, stockItems, balances, lots),
    );
    const costs = stationItems.filter((item) => item.cost > 0);
    const margins = insights.filter((row) => row.item.price > 0);
    return {
      station,
      total: stationItems.length,
      active: stationItems.length,
      inactive: 0,
      available: insights.filter((row) => row.availability === "Available").length,
      outOfStock: insights.filter((row) => row.availability === "Out of Stock").length,
      missingRecipe: insights.filter((row) => row.recipeStatus === "Missing").length,
      missingStockLink: insights.filter((row) => row.routingIssues.includes("missing_stock_link")).length,
      routingErrors: insights.filter((row) => row.routingIssues.length > 0).length,
      averagePrice: robustAveragePrice(stationItems),
      medianPrice: medianPrice(stationItems),
      averageCost: costs.length ? costs.reduce((sum, item) => sum + item.cost, 0) / costs.length : 0,
      averageMarginPct: margins.length
        ? margins.reduce((sum, row) => sum + row.marginPct, 0) / margins.length
        : 0,
      attentionCount: insights.filter((row) => row.attentionCount > 0).length,
    };
  });
}

export function computeMenuSummary(
  items: readonly MenuItem[],
  categories: readonly string[],
  stations: readonly ProductionStation[],
  insights: readonly MenuItemInsight[],
): MenuSummary {
  return {
    totalItems: items.length,
    totalCategories: Math.max(0, categories.filter((category) => category !== "All").length),
    totalStations: stations.length,
    activeItems: items.length,
    unavailableItems: insights.filter(
      (row) => row.availability === "Out of Stock" || row.availability === "Temporarily Unavailable",
    ).length,
    routingProblems: insights.filter((row) => row.routingIssues.length > 0).length,
    priceIssueCount: insights.filter((row) => row.priceIssues.length > 0).length,
    lastUpdated: new Date().toLocaleString(),
  };
}

export function filterMenuItems(
  insights: readonly MenuItemInsight[],
  filters: MenuFiltersState,
  lang: "en" | "am",
): MenuItemInsight[] {
  const query = filters.search.trim().toLowerCase();
  return insights.filter((row) => {
    const item = row.item;
    if (filters.category !== "All" && item.category !== filters.category) return false;
    if (filters.station !== "All" && item.station !== filters.station) return false;
    if (
      filters.deductionLocation !== "All" &&
      (item.stockDeductionLocation || item.station) !== filters.deductionLocation
    )
      return false;
    if (filters.diet === "Veg" && !item.veg) return false;
    if (filters.diet === "Non-Veg" && item.veg) return false;
    if (filters.itemType !== "All" && row.itemType !== filters.itemType) return false;

    if (query) {
      const haystack = [
        item.name_en,
        item.name_am,
        item.id,
        item.emoji,
        item.category,
        item.station,
        item.stockSku ?? "",
      ]
        .join(" ")
        .toLowerCase();
      if (!haystack.includes(query)) return false;
    }

    if (filters.priceMin && item.price < Number(filters.priceMin)) return false;
    if (filters.priceMax && item.price > Number(filters.priceMax)) return false;
    if (filters.marginMin && row.marginPct < Number(filters.marginMin)) return false;

    switch (filters.quick) {
      case "available":
        if (row.availability !== "Available") return false;
        break;
      case "out_of_stock":
        if (row.availability !== "Out of Stock") return false;
        break;
      case "missing_recipe":
        if (row.recipeStatus !== "Missing") return false;
        break;
      case "missing_station":
        if (!row.routingIssues.includes("missing_station") && !row.routingIssues.includes("invalid_station")) return false;
        break;
      case "missing_stock_link":
        if (!row.routingIssues.includes("missing_stock_link")) return false;
        break;
      case "low_margin":
        if (row.marginPct >= 20) return false;
        break;
      case "price_issues":
        if (row.priceIssues.length === 0) return false;
        break;
      default:
        break;
    }
    return true;
  });
}

export function detectDuplicateGroups(items: readonly MenuItem[]) {
  const map = new Map<string, MenuItem[]>();
  for (const item of items) {
    const key = item.name_en.trim().toLowerCase();
    if (!key) continue;
    const group = map.get(key) ?? [];
    group.push(item);
    map.set(key, group);
  }
  return [...map.values()].filter((group) => group.length > 1);
}

export function exportMenuCsv(items: readonly MenuItem[]) {
  const headers = [
    "id",
    "name_en",
    "name_am",
    "category",
    "station",
    "stockDeductionLocation",
    "price",
    "cost",
    "veg",
    "stockSku",
    "stockDeductionRule",
    "pricingMode",
    "unitLabel",
  ];
  const rows = items.map((item) =>
    [
      item.id,
      item.name_en,
      item.name_am,
      item.category,
      item.station,
      item.stockDeductionLocation ?? "",
      item.price,
      item.cost,
      item.veg ? "yes" : "no",
      item.stockSku ?? "",
      item.stockDeductionRule ?? "",
      item.pricingMode ?? "unit",
      item.unitLabel ?? "",
    ].map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(","),
  );
  return [headers.join(","), ...rows].join("\n");
}

export const OPERATIONAL_DEDUCTION_LOCATIONS = [...OPERATIONAL_STOCK_LOCATIONS];

export function isValidDeductionLocation(location?: string) {
  if (!location) return false;
  if (CENTRAL_STORES.has(location)) return false;
  return isOperationalStockLocation(location as (typeof OPERATIONAL_STOCK_LOCATIONS)[number]);
}
