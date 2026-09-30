import type { SalesRecord } from "./demo-data.ts";
import type { InventoryWorkspace } from "./inventory-access.ts";
import {
  dateKey,
  filterSalesAfterDashboardPeriod,
  filterSalesForOperationalLocations,
  groupSalesByProduct,
} from "./sales-analytics.ts";
import {
  convertStockQuantity,
  inferBeerTier,
  isInDailyDashboardPeriod,
  isWeynItem,
  remainingSpiritPours,
  resolveDailyDashboardPeriodStart,
  spiritYieldForItem,
  stationToOperationalLocation,
  stockUnitFromOrderUnitLabel,
  STOCK_LOCATIONS,
  type BeerTier,
  type StockClosingRecord,
  type StockItemCategory,
  type StockLedgerEntry,
  type StockLedgerEntryType,
  type StockLocation,
  type StockLocationBalance,
  type StockManagedItem,
  type StockUnitType,
} from "./stock-management.ts";

export type { BeerTier };

export const BAR_DRINK_CATEGORIES: StockItemCategory[] = [
  "Bar",
  "Beer",
  "Whisky",
  "Soft Drink",
  "Weyn",
  "Water",
];

export interface BarStockItemMetrics {
  itemId: string;
  itemName: string;
  category: StockItemCategory;
  unit: StockUnitType;
  beerTier?: BeerTier;
  stock: number;
  inTransit: number;
  newEntered: number;
  total: number;
  sold: number;
  damageWastage: number;
  staffConsumption: number;
  left: number;
  onHand: number;
  soldBottles?: number;
  soldDoubleShots?: number;
  soldSingleShots?: number;
  remainingDoubles?: number;
  remainingSingles?: number;
  bottleVolumeMl?: number;
}

export interface BarStockGroupRollup {
  id: string;
  label: string;
  kind: "special-beer" | "normal-beer" | "draft-beer" | "weyn" | "category";
  category?: StockItemCategory;
  metrics: Omit<BarStockItemMetrics, "itemId" | "itemName" | "category" | "beerTier">;
  items: BarStockItemMetrics[];
}

export interface BarStockTopSoldRow {
  productId?: string;
  productName: string;
  qty: number;
  revenue: number;
}

export interface BarStockSnapshot {
  workspace: StockLocation;
  dailyPeriodStart: string | null;
  groups: BarStockGroupRollup[];
  topSold: BarStockTopSoldRow[];
}

export interface BarStockCategorySummary {
  id: string;
  label: string;
  kind: "special-beer" | "normal-beer";
  totalBottles: number;
  soldToday: number;
  inventoryValue: number;
  unit: StockUnitType;
}

export type BarStockSortKey =
  | "name"
  | "opening"
  | "received"
  | "total"
  | "sold"
  | "damageWastage"
  | "staffConsumption"
  | "left";

export type BarStockReportKind =
  | "special-summary"
  | "normal-summary"
  | "draft-summary"
  | "brand-performance"
  | "inventory-valuation"
  | "sales-report"
  | "whisky-summary"
  | "spirit-category-summary"
  | "spirit-brand-performance"
  | "spirit-inventory-valuation"
  | "spirit-sales-report";

export interface BarStockReportRow {
  label: string;
  opening: number;
  received: number;
  total: number;
  sold: number;
  damageWastage: number;
  staffConsumption: number;
  left: number;
  inventoryValue: number;
  unit: StockUnitType;
  soldBottles?: number;
  soldDoubleShots?: number;
  soldSingleShots?: number;
  remainingDoubles?: number;
  remainingSingles?: number;
  bottleVolumeMl?: number;
}

export interface BarStockSearchResult {
  groups: BarStockGroupRollup[];
  expandGroupIds: Set<string>;
  highlightItemIds: Set<string>;
}

export interface BarStockReport {
  kind: BarStockReportKind;
  title: string;
  rows: BarStockReportRow[];
  totals: BarStockReportRow;
}

export const BAR_RECEIVED_FROM_STOCK_TYPES: StockLedgerEntryType[] = ["TRANSFER_IN"];

export interface BarStockReceivedLine {
  id: string;
  date: string;
  transactionAt?: string;
  itemId?: string;
  itemName: string;
  category?: StockItemCategory;
  quantity: number;
  unit: StockUnitType;
  fromLocation?: StockLocation;
  referenceNo?: string;
  receivedBy?: string;
  approvedBy?: string;
  enteredBy: string;
  totalCost: number;
  notes?: string;
  type: StockLedgerEntryType;
}

export interface BarStockDailyReceivedSummary {
  date: string;
  lineCount: number;
  itemCount: number;
  totalQuantity: number;
  totalValue: number;
  lines: BarStockReceivedLine[];
}

function qty(value: number) {
  return Math.round((Number.isFinite(value) ? value : 0) * 1000) / 1000;
}

function todayKey(date = new Date()) {
  return dateKey(date);
}

const CONSUMPTION_TYPES: StockLedgerEntryType[] = [
  "POS_CONSUMPTION",
  "RECIPE_CONSUMPTION",
  "MANUAL_DEDUCTION",
];

const DAMAGE_WASTAGE_TYPES: StockLedgerEntryType[] = ["DAMAGE", "WASTE"];

const NEW_ENTERED_TYPES: StockLedgerEntryType[] = ["TRANSFER_IN"];

function normalizeStockLocation(value: string): StockLocation {
  if (value === "Butcher House") return "Butcher";
  return value as StockLocation;
}

function entryMatchesWorkspace(entry: StockLedgerEntry, workspace: StockLocation): boolean {
  if (entry.type === "TRANSFER_IN" && entry.toLocation) {
    return (
      normalizeStockLocation(entry.toLocation) === workspace ||
      stationToOperationalLocation(entry.toLocation) === workspace
    );
  }
  if (entry.type === "TRANSFER_OUT" && entry.fromLocation) {
    return (
      normalizeStockLocation(entry.fromLocation) === workspace ||
      stationToOperationalLocation(entry.fromLocation) === workspace
    );
  }
  const raw = String(entry.location ?? "");
  if (!raw) return false;
  if (STOCK_LOCATIONS.includes(normalizeStockLocation(raw)) && normalizeStockLocation(raw) === workspace) {
    return true;
  }
  return stationToOperationalLocation(raw) === workspace;
}

function entryInPeriod(
  entry: StockLedgerEntry,
  periodStart: string | null,
  today: string,
): boolean {
  if (entry.date !== today) return false;
  // After daily closing, Sold/Received reset — only post-close activity counts.
  return isInDailyDashboardPeriod(entry.date, entry.transactionAt, periodStart);
}

function normalizedSaleKey(value: string) {
  return value.trim().toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

function saleMatchesStockItem(record: SalesRecord, item: StockManagedItem): boolean {
  const productId = (record.productId ?? "").trim();
  if (productId) {
    if (productId === item.id) return true;
    if (item.id === `stk-${productId}`) return true;
    if (item.id === `stk-beer-${productId}`) return true;
    if (productId === "bedeli" && item.id === "stk-beer-bedele") return true;
    if (productId === `stk-${item.id.replace(/^stk-/, "")}`) return true;
  }
  const saleName = normalizedSaleKey(record.productName);
  const itemName = normalizedSaleKey(item.name);
  if (saleName && itemName && saleName === itemName) return true;
  if (saleName && itemName && (saleName.includes(itemName) || itemName.includes(saleName))) return true;
  const compactSale = saleName.replace(/\s+/g, "");
  const compactItem = itemName.replace(/\s+/g, "");
  return Boolean(compactSale && compactItem && (compactSale === compactItem || compactSale.startsWith(compactItem) || compactItem.startsWith(compactSale)));
}

function pourQtyToBottleEquivalent(
  item: StockManagedItem,
  quantity: number,
  unit: StockUnitType,
): number {
  if (unit === item.baseUnit) return qty(quantity);
  const converted = convertStockQuantity(item, quantity, unit, item.baseUnit);
  return Number.isFinite(converted) ? qty(converted) : qty(quantity);
}

function itemHasSpiritYield(item: StockManagedItem, workspace: StockLocation): boolean {
  if (workspace !== "VIP Bar" || item.category !== "Whisky") return false;
  return spiritYieldForItem(item).doublesPerBottle > 0;
}

function buildSalesSoldBreakdownByItemId(
  items: StockManagedItem[],
  salesRecords: SalesRecord[],
  workspace: StockLocation,
  periodStart: string | null,
  today: string,
): Map<string, { bottles: number; doubleShots: number; singleShots: number; bottleEquivalent: number }> {
  const scoped = filterSalesAfterDashboardPeriod(
    filterSalesForOperationalLocations(salesRecords, [workspace], today),
    periodStart,
  );
  const soldByItem = new Map<string, { bottles: number; doubleShots: number; singleShots: number; bottleEquivalent: number }>();
  for (const record of scoped) {
    const item = items.find((candidate) => saleMatchesStockItem(record, candidate));
    if (!item) continue;
    if (item.category === "Whisky" && workspace === "Main Bar") continue;
    const unit = stockUnitFromOrderUnitLabel(record.unitLabel) ?? item.baseUnit;
    const current = soldByItem.get(item.id) ?? { bottles: 0, doubleShots: 0, singleShots: 0, bottleEquivalent: 0 };
    if (unit === "double shot") {
      current.doubleShots = qty(current.doubleShots + record.qty);
    } else if (unit === "single shot") {
      current.singleShots = qty(current.singleShots + record.qty);
    } else {
      current.bottles = qty(current.bottles + record.qty);
    }
    current.bottleEquivalent = qty(current.bottleEquivalent + pourQtyToBottleEquivalent(item, record.qty, unit));
    soldByItem.set(item.id, current);
  }
  return soldByItem;
}

function buildSalesSoldByItemId(
  items: StockManagedItem[],
  salesRecords: SalesRecord[],
  workspace: StockLocation,
  periodStart: string | null,
  today: string,
): Map<string, number> {
  const breakdown = buildSalesSoldBreakdownByItemId(items, salesRecords, workspace, periodStart, today);
  const soldByItem = new Map<string, number>();
  for (const [itemId, row] of breakdown) {
    soldByItem.set(itemId, row.bottleEquivalent);
  }
  return soldByItem;
}

function sumMetrics(items: BarStockItemMetrics[]): Omit<BarStockItemMetrics, "itemId" | "itemName" | "category" | "beerTier"> {
  return items.reduce(
    (acc, row) => ({
      unit: row.unit,
      stock: qty(acc.stock + row.stock),
      inTransit: qty(acc.inTransit + row.inTransit),
      newEntered: qty(acc.newEntered + row.newEntered),
      total: qty(acc.total + row.total),
      sold: qty(acc.sold + row.sold),
      damageWastage: qty(acc.damageWastage + row.damageWastage),
      staffConsumption: qty(acc.staffConsumption + row.staffConsumption),
      left: qty(acc.left + row.left),
      onHand: qty(acc.onHand + row.onHand),
      soldBottles: qty((acc.soldBottles ?? 0) + (row.soldBottles ?? 0)),
      soldDoubleShots: qty((acc.soldDoubleShots ?? 0) + (row.soldDoubleShots ?? 0)),
      soldSingleShots: qty((acc.soldSingleShots ?? 0) + (row.soldSingleShots ?? 0)),
    }),
    {
      unit: items[0]?.unit ?? ("bottle" as StockUnitType),
      stock: 0,
      inTransit: 0,
      newEntered: 0,
      total: 0,
      sold: 0,
      damageWastage: 0,
      staffConsumption: 0,
      left: 0,
      onHand: 0,
      soldBottles: 0,
      soldDoubleShots: 0,
      soldSingleShots: 0,
    },
  );
}

function isBarDrinkItem(item: StockManagedItem): boolean {
  return BAR_DRINK_CATEGORIES.includes(item.category);
}

function itemAtWorkspace(
  item: StockManagedItem,
  balances: StockLocationBalance[],
  workspace: StockLocation,
): boolean {
  // Whisky is VIP Bar stock only — never list it on Main Bar.
  if (item.category === "Whisky" && workspace === "Main Bar") return false;
  const balance = balances.find((row) => row.itemId === item.id && row.location === workspace);
  if (balance && (balance.quantity > 0 || balance.incomingQuantity > 0 || balance.availableQuantity > 0)) {
    return true;
  }
  if (!isBarDrinkItem(item)) return false;
  return item.preferredLocation === workspace;
}

export function computeBarStockItemMetrics(
  item: StockManagedItem,
  balance: StockLocationBalance | undefined,
  ledger: StockLedgerEntry[],
  workspace: StockLocation,
  periodStart: string | null,
  options: {
    today?: string;
    salesSoldQty?: number;
    salesSoldBottles?: number;
    salesSoldDoubleShots?: number;
    salesSoldSingleShots?: number;
  } = {},
): BarStockItemMetrics {
  const today = options.today ?? todayKey();
  const onHand = qty(balance?.availableQuantity ?? 0);
  const inTransit = qty(balance?.incomingQuantity ?? 0);

  let newEntered = 0;
  let ledgerSoldBottles = 0;
  let ledgerSoldDoubleShots = 0;
  let ledgerSoldSingleShots = 0;
  let ledgerSoldBottleEquivalent = 0;
  let transferOut = 0;
  let damageWastage = 0;
  let staffConsumption = 0;

  for (const entry of ledger) {
    if (!entryInPeriod(entry, periodStart, today)) continue;
    if (entry.itemId !== item.id) continue;
    if (!entryMatchesWorkspace(entry, workspace)) continue;

    const converted =
      entry.unit === item.baseUnit
        ? qty(entry.quantity)
        : convertStockQuantity(item, entry.quantity, entry.unit, item.baseUnit);
    const quantity = Number.isFinite(converted) ? converted : qty(entry.quantity);

    if (NEW_ENTERED_TYPES.includes(entry.type)) {
      newEntered = qty(newEntered + quantity);
    }
    if (CONSUMPTION_TYPES.includes(entry.type)) {
      if (entry.unit === "double shot") {
        ledgerSoldDoubleShots = qty(ledgerSoldDoubleShots + entry.quantity);
        ledgerSoldBottleEquivalent = qty(
          ledgerSoldBottleEquivalent + pourQtyToBottleEquivalent(item, entry.quantity, "double shot"),
        );
      } else if (entry.unit === "single shot") {
        ledgerSoldSingleShots = qty(ledgerSoldSingleShots + entry.quantity);
        ledgerSoldBottleEquivalent = qty(
          ledgerSoldBottleEquivalent + pourQtyToBottleEquivalent(item, entry.quantity, "single shot"),
        );
      } else {
        ledgerSoldBottles = qty(ledgerSoldBottles + quantity);
        ledgerSoldBottleEquivalent = qty(ledgerSoldBottleEquivalent + quantity);
      }
    }
    if (DAMAGE_WASTAGE_TYPES.includes(entry.type)) {
      damageWastage = qty(damageWastage + quantity);
    }
    if (entry.type === "STAFF_CONSUMPTION") {
      staffConsumption = qty(staffConsumption + quantity);
    }
    if (entry.type === "TRANSFER_OUT") {
      transferOut = qty(transferOut + quantity);
    }
  }

  const salesSoldBottleEquivalent = qty(options.salesSoldQty ?? 0);
  const salesSoldBottles = qty(options.salesSoldBottles ?? 0);
  const salesSoldDoubleShots = qty(options.salesSoldDoubleShots ?? 0);
  const salesSoldSingleShots = qty(options.salesSoldSingleShots ?? 0);
  const ledgerHasPourSales = ledgerSoldDoubleShots > 0 || ledgerSoldSingleShots > 0;
  const salesHasPourSales = salesSoldDoubleShots > 0 || salesSoldSingleShots > 0;

  let soldBottles = ledgerSoldBottles;
  let soldDoubleShots = ledgerSoldDoubleShots;
  let soldSingleShots = ledgerSoldSingleShots;

  if (salesHasPourSales) {
    soldBottles = salesSoldBottles;
    soldDoubleShots = salesSoldDoubleShots;
    soldSingleShots = salesSoldSingleShots;
  } else if (!ledgerHasPourSales && salesSoldBottleEquivalent > ledgerSoldBottleEquivalent) {
    soldBottles = salesSoldBottles;
  }

  const sold = qty(
    Math.max(
      ledgerSoldBottleEquivalent,
      salesHasPourSales || !ledgerHasPourSales ? salesSoldBottleEquivalent : 0,
    ),
  );
  const stock = qty(onHand + sold + damageWastage + staffConsumption + transferOut - newEntered);
  const total = qty(stock + newEntered);
  const left = qty(Math.max(0, total - sold - damageWastage - staffConsumption));

  // Single/double and remaining-pour counts belong to VIP whisky only.
  const hasYield = itemHasSpiritYield(item, workspace);
  const pours = hasYield ? remainingSpiritPours(left, item) : null;

  return {
    itemId: item.id,
    itemName: item.name,
    category: item.category,
    unit: item.baseUnit,
    beerTier: inferBeerTier(item),
    stock,
    inTransit,
    newEntered,
    total,
    sold,
    damageWastage,
    staffConsumption,
    left,
    onHand,
  ...(hasYield
    ? {
        soldBottles,
        soldDoubleShots,
        soldSingleShots,
        remainingDoubles: pours?.remainingDoubles,
        remainingSingles: pours?.remainingSingles,
        bottleVolumeMl: item.bottleVolumeMl,
      }
    : {}),
  };
}

export function buildBarStockTopSold(
  salesRecords: SalesRecord[],
  workspace: StockLocation,
  closings: Array<Pick<StockClosingRecord, "date" | "location" | "closedAt">>,
  today = todayKey(),
  limit = 8,
): BarStockTopSoldRow[] {
  const periodStart = resolveDailyDashboardPeriodStart(closings, workspace, today);
  const scoped = filterSalesAfterDashboardPeriod(
    filterSalesForOperationalLocations(salesRecords, [workspace], today),
    periodStart,
  );
  return groupSalesByProduct(scoped)
    .filter((row) => {
      const category = row.category?.trim().toLowerCase() ?? "";
      if (workspace === "Main Bar" && (category === "whisky" || category.includes("whisky") || category.includes("spirit"))) {
        return false;
      }
      if (!category) return true;
      if (BAR_DRINK_CATEGORIES.some((candidate) => candidate.toLowerCase() === category)) return true;
      return (
        category.includes("beer") ||
        category.includes("drink") ||
        category.includes("weyn") ||
        category.includes("wayne") ||
        category.includes("wayn") ||
        category.includes("whisky") ||
        category.includes("spirit")
      );
    })
    .slice(0, limit)
    .map((row) => ({
      productId: row.productId,
      productName: row.productName,
      qty: row.qty,
      revenue: row.revenue,
    }));
}

export function buildBarStockSnapshot(input: {
  items: StockManagedItem[];
  balances: StockLocationBalance[];
  ledger: StockLedgerEntry[];
  closings: Array<Pick<StockClosingRecord, "date" | "location" | "closedAt">>;
  workspace: InventoryWorkspace;
  salesRecords: SalesRecord[];
  today?: string;
}): BarStockSnapshot | null {
  const { items, balances, ledger, closings, salesRecords } = input;
  if (input.workspace !== "Main Bar" && input.workspace !== "VIP Bar") return null;

  const workspace = input.workspace;
  const today = input.today ?? todayKey();
  const periodStart = resolveDailyDashboardPeriodStart(closings, workspace, today);
  const workspaceBalances = balances.filter((row) => row.location === workspace);

  const drinkItems = items
    .filter((item) => itemAtWorkspace(item, workspaceBalances, workspace))
    .sort((a, b) => a.name.localeCompare(b.name));

  const salesSoldByItem = buildSalesSoldByItemId(drinkItems, salesRecords, workspace, periodStart, today);
  const salesBreakdownByItem = buildSalesSoldBreakdownByItemId(drinkItems, salesRecords, workspace, periodStart, today);

  const metrics = drinkItems.map((item) => {
    const balance = workspaceBalances.find((row) => row.itemId === item.id);
    const salesBreakdown = salesBreakdownByItem.get(item.id);
    return computeBarStockItemMetrics(item, balance, ledger, workspace, periodStart, {
      today,
      salesSoldQty: salesSoldByItem.get(item.id) ?? 0,
      salesSoldBottles: salesBreakdown?.bottles,
      salesSoldDoubleShots: salesBreakdown?.doubleShots,
      salesSoldSingleShots: salesBreakdown?.singleShots,
    });
  });

  const groups: BarStockGroupRollup[] = [];

  if (workspace === "Main Bar") {
    const specialItems = metrics.filter((row) => row.category === "Beer" && row.beerTier === "special");
    const draftItems = metrics.filter((row) => row.category === "Beer" && row.beerTier === "draft");
    const normalItems = metrics.filter((row) => row.category === "Beer" && row.beerTier === "normal");
    const weynItems = metrics.filter(
      (row) =>
        row.category === "Weyn" ||
        isWeynItem({ id: row.itemId, name: row.itemName, category: row.category }),
    );
    const weynIds = new Set(weynItems.map((row) => row.itemId));
    const otherItems = metrics.filter(
      (row) => row.category !== "Beer" && row.category !== "Whisky" && !weynIds.has(row.itemId),
    );

    if (specialItems.length > 0) {
      groups.push({
        id: "special-beer",
        label: "Special Beer",
        kind: "special-beer",
        category: "Beer",
        metrics: sumMetrics(specialItems),
        items: specialItems,
      });
    }
    if (draftItems.length > 0) {
      groups.push({
        id: "draft-beer",
        label: "Draft Beer",
        kind: "draft-beer",
        category: "Beer",
        metrics: sumMetrics(draftItems),
        items: draftItems,
      });
    }
    if (normalItems.length > 0) {
      groups.push({
        id: "normal-beer",
        label: "Normal Beer",
        kind: "normal-beer",
        category: "Beer",
        metrics: sumMetrics(normalItems),
        items: normalItems,
      });
    }
    if (weynItems.length > 0) {
      groups.push({
        id: "weyn",
        label: "Weyn",
        kind: "weyn",
        category: "Weyn",
        metrics: sumMetrics(weynItems),
        items: weynItems,
      });
    }

    const otherByCategory = new Map<StockItemCategory, BarStockItemMetrics[]>();
    for (const row of otherItems) {
      const list = otherByCategory.get(row.category) ?? [];
      list.push(row);
      otherByCategory.set(row.category, list);
    }
    for (const category of BAR_DRINK_CATEGORIES.filter(
      (c) => c !== "Beer" && c !== "Weyn" && c !== "Whisky",
    )) {
      const rows = otherByCategory.get(category);
      if (!rows?.length) continue;
      groups.push({
        id: `category-${category}`,
        label: category,
        kind: "category",
        category,
        metrics: sumMetrics(rows),
        items: rows,
      });
    }
  } else {
    const byCategory = new Map<StockItemCategory, BarStockItemMetrics[]>();
    for (const row of metrics) {
      const list = byCategory.get(row.category) ?? [];
      list.push(row);
      byCategory.set(row.category, list);
    }
    for (const category of BAR_DRINK_CATEGORIES) {
      const rows = byCategory.get(category);
      if (!rows?.length) continue;
      groups.push({
        id: `category-${category}`,
        label: category,
        kind: "category",
        category,
        metrics: sumMetrics(rows),
        items: rows,
      });
    }
    for (const [category, rows] of byCategory) {
      if (BAR_DRINK_CATEGORIES.includes(category)) continue;
      if (!rows.length) continue;
      groups.push({
        id: `category-${category}`,
        label: category,
        kind: "category",
        category,
        metrics: sumMetrics(rows),
        items: rows,
      });
    }
  }

  return {
    workspace,
    dailyPeriodStart: periodStart,
    groups,
    topSold: buildBarStockTopSold(salesRecords, workspace, closings, today),
  };
}

function itemPurchasePrice(itemId: string, items: StockManagedItem[]): number {
  return items.find((row) => row.id === itemId)?.purchasePrice ?? 0;
}

export function computeItemInventoryValue(itemId: string, left: number, items: StockManagedItem[]): number {
  return qty(left * itemPurchasePrice(itemId, items));
}

export function buildBeerCategorySummaries(
  snapshot: BarStockSnapshot,
  items: StockManagedItem[],
): BarStockCategorySummary[] {
  return snapshot.groups
    .filter(
      (group): group is BarStockGroupRollup & { kind: "special-beer" | "normal-beer" } =>
        group.kind === "special-beer" || group.kind === "normal-beer",
    )
    .map((group) => ({
      id: group.id,
      label: group.label,
      kind: group.kind,
      totalBottles: group.metrics.onHand,
      soldToday: group.metrics.sold,
      inventoryValue: qty(
        group.items.reduce((sum, row) => sum + computeItemInventoryValue(row.itemId, row.left, items), 0),
      ),
      unit: group.metrics.unit,
    }));
}

function metricsToReportRow(
  label: string,
  metrics: BarStockItemMetrics | Pick<BarStockItemMetrics, "stock" | "newEntered" | "total" | "sold" | "damageWastage" | "staffConsumption" | "left" | "unit">,
  inventoryValue = 0,
): BarStockReportRow {
  const pourFields =
    "soldDoubleShots" in metrics || "remainingDoubles" in metrics
      ? {
          soldBottles: (metrics as BarStockItemMetrics).soldBottles,
          soldDoubleShots: (metrics as BarStockItemMetrics).soldDoubleShots,
          soldSingleShots: (metrics as BarStockItemMetrics).soldSingleShots,
          remainingDoubles: (metrics as BarStockItemMetrics).remainingDoubles,
          remainingSingles: (metrics as BarStockItemMetrics).remainingSingles,
          bottleVolumeMl: (metrics as BarStockItemMetrics).bottleVolumeMl,
        }
      : {};
  return {
    label,
    opening: metrics.stock,
    received: metrics.newEntered,
    total: metrics.total,
    sold: metrics.sold,
    damageWastage: "damageWastage" in metrics ? metrics.damageWastage : 0,
    staffConsumption: "staffConsumption" in metrics ? metrics.staffConsumption : 0,
    left: metrics.left,
    inventoryValue,
    unit: metrics.unit,
    ...pourFields,
  };
}

function itemHasSoldActivity(item: BarStockItemMetrics): boolean {
  return (
    item.sold > 0 ||
    (item.soldBottles ?? 0) > 0 ||
    (item.soldDoubleShots ?? 0) > 0 ||
    (item.soldSingleShots ?? 0) > 0
  );
}

function buildVipBarStockReport(
  snapshot: BarStockSnapshot,
  items: StockManagedItem[],
  kind: BarStockReportKind,
): BarStockReport | null {
  const allItems = snapshot.groups.flatMap((group) => group.items);
  const soldItems = allItems.filter(itemHasSoldActivity);
  if (soldItems.length === 0) return null;

  const titleByKind: Partial<Record<BarStockReportKind, string>> = {
    "whisky-summary": "Whisky Sold Summary",
    "spirit-category-summary": "Spirit Sold by Category",
    "spirit-brand-performance": "Spirit Sold — Brand Performance",
    "spirit-inventory-valuation": "Spirit Sold — Remaining Stock",
    "spirit-sales-report": "Spirit Sales Report",
  };

  let rows: BarStockReportRow[] = [];

  if (kind === "whisky-summary") {
    const group = snapshot.groups.find((row) => row.category === "Whisky" || row.id === "category-Whisky");
    if (!group) return null;
    const groupSoldItems = group.items.filter(itemHasSoldActivity);
    if (groupSoldItems.length === 0) return null;
    rows = [
      metricsToReportRow(
        group.label,
        sumMetrics(groupSoldItems),
        groupSoldItems.reduce((sum, item) => sum + computeItemInventoryValue(item.itemId, item.left, items), 0),
      ),
      ...groupSoldItems.map((item) =>
        metricsToReportRow(item.itemName, item, computeItemInventoryValue(item.itemId, item.left, items)),
      ),
    ];
  } else if (kind === "spirit-category-summary") {
    rows = snapshot.groups.flatMap((group) => {
      const groupSoldItems = group.items.filter(itemHasSoldActivity);
      if (groupSoldItems.length === 0) return [];
      return [
        metricsToReportRow(
          group.label,
          sumMetrics(groupSoldItems),
          groupSoldItems.reduce((sum, item) => sum + computeItemInventoryValue(item.itemId, item.left, items), 0),
        ),
        ...groupSoldItems.map((item) =>
          metricsToReportRow(item.itemName, item, computeItemInventoryValue(item.itemId, item.left, items)),
        ),
      ];
    });
  } else if (kind === "spirit-inventory-valuation") {
    rows = sortBarStockGroupItems(soldItems, "left").map((item) =>
      metricsToReportRow(item.itemName, item, computeItemInventoryValue(item.itemId, item.left, items)),
    );
  } else {
    rows = sortBarStockGroupItems(soldItems, "sold").map((item) =>
      metricsToReportRow(item.itemName, item, computeItemInventoryValue(item.itemId, item.left, items)),
    );
  }

  if (rows.length === 0) return null;

  const detailRows =
    kind === "whisky-summary"
      ? rows.slice(1)
      : kind === "spirit-category-summary"
        ? soldItems.map((item) =>
            metricsToReportRow(item.itemName, item, computeItemInventoryValue(item.itemId, item.left, items)),
          )
        : rows;
  const totals = detailRows.reduce<BarStockReportRow>(
    (acc, row) => ({
      label: "Total",
      opening: qty(acc.opening + row.opening),
      received: qty(acc.received + row.received),
      total: qty(acc.total + row.total),
      sold: qty(acc.sold + row.sold),
      damageWastage: qty(acc.damageWastage + row.damageWastage),
      staffConsumption: qty(acc.staffConsumption + row.staffConsumption),
      left: qty(acc.left + row.left),
      inventoryValue: qty(acc.inventoryValue + row.inventoryValue),
      unit: row.unit,
    }),
    {
      label: "Total",
      opening: 0,
      received: 0,
      total: 0,
      sold: 0,
      damageWastage: 0,
      staffConsumption: 0,
      left: 0,
      inventoryValue: 0,
      unit: detailRows[0]?.unit ?? ("bottle" as StockUnitType),
    },
  );

  return {
    kind,
    title: titleByKind[kind] ?? "Spirit Report",
    rows,
    totals,
  };
}

export function sortBarStockGroupItems(items: BarStockItemMetrics[], sortKey: BarStockSortKey): BarStockItemMetrics[] {
  const sorted = [...items];
  const compare = (left: number | string, right: number | string) => {
    if (typeof left === "string") return left.localeCompare(String(right));
    return left - Number(right);
  };
  sorted.sort((a, b) => {
    switch (sortKey) {
      case "opening":
        return compare(a.stock, b.stock);
      case "received":
        return compare(a.newEntered, b.newEntered);
      case "total":
        return compare(a.total, b.total);
      case "sold":
        return compare(b.sold, a.sold);
      case "damageWastage":
        return compare(b.damageWastage, a.damageWastage);
      case "staffConsumption":
        return compare(b.staffConsumption, a.staffConsumption);
      case "left":
        return compare(b.left, a.left);
      case "name":
      default:
        return a.itemName.localeCompare(b.itemName);
    }
  });
  return sorted;
}

export function resolveBarStockSearch(groups: BarStockGroupRollup[], query: string): BarStockSearchResult {
  const normalized = query.trim().toLowerCase();
  if (!normalized) {
    return { groups, expandGroupIds: new Set(), highlightItemIds: new Set() };
  }

  const expandGroupIds = new Set<string>();
  const highlightItemIds = new Set<string>();
  const filtered: BarStockGroupRollup[] = [];

  for (const group of groups) {
    const groupMatches = group.label.toLowerCase().includes(normalized);
    const matchingItems = group.items.filter((item) => item.itemName.toLowerCase().includes(normalized));
    if (!groupMatches && matchingItems.length === 0) continue;

    filtered.push(group);
    expandGroupIds.add(group.id);
    if (groupMatches) {
      group.items.forEach((item) => highlightItemIds.add(item.itemId));
    } else {
      matchingItems.forEach((item) => highlightItemIds.add(item.itemId));
    }
  }

  return { groups: filtered, expandGroupIds, highlightItemIds };
}

export function buildBarStockReport(
  snapshot: BarStockSnapshot,
  items: StockManagedItem[],
  kind: BarStockReportKind,
): BarStockReport | null {
  if (snapshot.workspace === "VIP Bar") {
    const vipKinds: BarStockReportKind[] = [
      "whisky-summary",
      "spirit-category-summary",
      "spirit-brand-performance",
      "spirit-inventory-valuation",
      "spirit-sales-report",
    ];
    if (vipKinds.includes(kind)) {
      return buildVipBarStockReport(snapshot, items, kind);
    }
    return null;
  }

  const beerGroups = snapshot.groups.filter(
    (group) =>
      group.kind === "special-beer" || group.kind === "normal-beer" || group.kind === "draft-beer",
  );
  const allBeerItems = beerGroups.flatMap((group) => group.items);

  if (allBeerItems.length === 0) return null;

  const titleByKind: Record<BarStockReportKind, string> = {
    "special-summary": "Special Beer Summary",
    "normal-summary": "Normal Beer Summary",
    "draft-summary": "Draft Beer Summary",
    "brand-performance": "Beer Brand Performance",
    "inventory-valuation": "Beer Inventory Valuation",
    "sales-report": "Beer Sales Report",
  };

  let rows: BarStockReportRow[] = [];

  if (kind === "special-summary") {
    const group = beerGroups.find((row) => row.kind === "special-beer");
    if (!group) return null;
    rows = [
      metricsToReportRow(
        group.label,
        group.metrics,
        group.items.reduce((sum, item) => sum + computeItemInventoryValue(item.itemId, item.left, items), 0),
      ),
      ...group.items.map((item) =>
        metricsToReportRow(item.itemName, item, computeItemInventoryValue(item.itemId, item.left, items)),
      ),
    ];
  } else if (kind === "normal-summary") {
    const group = beerGroups.find((row) => row.kind === "normal-beer");
    if (!group) return null;
    rows = [
      metricsToReportRow(
        group.label,
        group.metrics,
        group.items.reduce((sum, item) => sum + computeItemInventoryValue(item.itemId, item.left, items), 0),
      ),
      ...group.items.map((item) =>
        metricsToReportRow(item.itemName, item, computeItemInventoryValue(item.itemId, item.left, items)),
      ),
    ];
  } else if (kind === "draft-summary") {
    const group = beerGroups.find((row) => row.kind === "draft-beer");
    if (!group) return null;
    rows = [
      metricsToReportRow(
        group.label,
        group.metrics,
        group.items.reduce((sum, item) => sum + computeItemInventoryValue(item.itemId, item.left, items), 0),
      ),
      ...group.items.map((item) =>
        metricsToReportRow(item.itemName, item, computeItemInventoryValue(item.itemId, item.left, items)),
      ),
    ];
  } else if (kind === "brand-performance") {
    rows = sortBarStockGroupItems(allBeerItems, "sold").map((item) =>
      metricsToReportRow(item.itemName, item, computeItemInventoryValue(item.itemId, item.left, items)),
    );
  } else if (kind === "inventory-valuation") {
    rows = sortBarStockGroupItems(allBeerItems, "left").map((item) =>
      metricsToReportRow(item.itemName, item, computeItemInventoryValue(item.itemId, item.left, items)),
    );
  } else {
    rows = sortBarStockGroupItems(allBeerItems, "sold").map((item) =>
      metricsToReportRow(item.itemName, item, computeItemInventoryValue(item.itemId, item.left, items)),
    );
  }

  const detailRows = rows.slice(
    kind === "special-summary" || kind === "normal-summary" || kind === "draft-summary" ? 1 : 0,
  );
  const totals = detailRows.reduce<BarStockReportRow>(
    (acc, row) => ({
      label: "Total",
      opening: qty(acc.opening + row.opening),
      received: qty(acc.received + row.received),
      total: qty(acc.total + row.total),
      sold: qty(acc.sold + row.sold),
      damageWastage: qty(acc.damageWastage + row.damageWastage),
      staffConsumption: qty(acc.staffConsumption + row.staffConsumption),
      left: qty(acc.left + row.left),
      inventoryValue: qty(acc.inventoryValue + row.inventoryValue),
      unit: row.unit,
    }),
    {
      label: "Total",
      opening: 0,
      received: 0,
      total: 0,
      sold: 0,
      damageWastage: 0,
      staffConsumption: 0,
      left: 0,
      inventoryValue: 0,
      unit: detailRows[0]?.unit ?? ("bottle" as StockUnitType),
    },
  );

  return {
    kind,
    title: titleByKind[kind],
    rows,
    totals,
  };
}

export function isBeerCategoryGroup(group: BarStockGroupRollup): boolean {
  return group.kind === "special-beer" || group.kind === "normal-beer" || group.kind === "draft-beer";
}

export function sumBarStockDisplayMetrics(
  metrics: Array<Pick<BarStockItemMetrics, "stock" | "newEntered" | "total" | "sold" | "damageWastage" | "staffConsumption" | "left" | "unit" | "onHand">>,
): Pick<BarStockItemMetrics, "stock" | "newEntered" | "total" | "sold" | "damageWastage" | "staffConsumption" | "left" | "unit" | "onHand"> {
  if (metrics.length === 0) {
    return {
      stock: 0,
      newEntered: 0,
      total: 0,
      sold: 0,
      damageWastage: 0,
      staffConsumption: 0,
      left: 0,
      onHand: 0,
      unit: "bottle",
    };
  }
  return metrics.reduce(
    (acc, row) => ({
      unit: row.unit,
      stock: qty(acc.stock + row.stock),
      newEntered: qty(acc.newEntered + row.newEntered),
      total: qty(acc.total + row.total),
      sold: qty(acc.sold + row.sold),
      damageWastage: qty(acc.damageWastage + row.damageWastage),
      staffConsumption: qty(acc.staffConsumption + row.staffConsumption),
      left: qty(acc.left + row.left),
      onHand: qty(acc.onHand + row.onHand),
    }),
    {
      unit: metrics[0]!.unit,
      stock: 0,
      newEntered: 0,
      total: 0,
      sold: 0,
      damageWastage: 0,
      staffConsumption: 0,
      left: 0,
      onHand: 0,
    },
  );
}

export function canExpandBarStockGroup(group: BarStockGroupRollup): boolean {
  if (isBeerCategoryGroup(group)) return group.items.length > 0;
  return group.items.length > 1;
}

function isBarReceivedFromStockEntry(entry: StockLedgerEntry, workspace: StockLocation): boolean {
  if (!BAR_RECEIVED_FROM_STOCK_TYPES.includes(entry.type)) return false;
  const destination = entry.toLocation
    ? normalizeStockLocation(entry.toLocation)
    : normalizeStockLocation(String(entry.location));
  return destination === workspace;
}

function toBarStockReceivedLine(entry: StockLedgerEntry, item?: StockManagedItem): BarStockReceivedLine | null {
  const quantity = item
    ? convertStockQuantity(item, entry.quantity, entry.unit, item.baseUnit)
    : entry.quantity;
  if (!Number.isFinite(quantity)) return null;

  return {
    id: entry.id,
    date: entry.date,
    transactionAt: entry.transactionAt,
    itemId: entry.itemId,
    itemName: entry.itemName,
    category: entry.category ?? item?.category,
    quantity: qty(quantity),
    unit: item?.baseUnit ?? entry.unit,
    fromLocation: entry.fromLocation
      ? normalizeStockLocation(entry.fromLocation)
      : entry.sourceLocation
        ? normalizeStockLocation(entry.sourceLocation)
        : undefined,
    referenceNo: entry.referenceNo,
    receivedBy: entry.receivedBy,
    approvedBy: entry.approvedBy,
    enteredBy: entry.enteredBy,
    totalCost: entry.totalCost,
    notes: entry.notes,
    type: entry.type,
  };
}

export function buildBarStockDailyReceivedMap(input: {
  items: StockManagedItem[];
  balances: StockLocationBalance[];
  ledger: StockLedgerEntry[];
  workspace: StockLocation;
}): Map<string, BarStockDailyReceivedSummary> {
  const { items, balances, ledger, workspace } = input;
  const workspaceBalances = balances.filter((row) => row.location === workspace);
  const drinkItemIds = new Set(
    items.filter((item) => itemAtWorkspace(item, workspaceBalances, workspace)).map((item) => item.id),
  );
  const itemById = new Map(items.map((item) => [item.id, item]));
  const byDate = new Map<string, BarStockReceivedLine[]>();

  for (const entry of ledger) {
    if (!isBarReceivedFromStockEntry(entry, workspace)) continue;
    if (entry.itemId && !drinkItemIds.has(entry.itemId)) continue;
    const item = entry.itemId ? itemById.get(entry.itemId) : undefined;
    const line = toBarStockReceivedLine(entry, item);
    if (!line) continue;
    const list = byDate.get(entry.date) ?? [];
    list.push(line);
    byDate.set(entry.date, list);
  }

  const result = new Map<string, BarStockDailyReceivedSummary>();
  for (const [date, lines] of byDate.entries()) {
    const sorted = [...lines].sort((a, b) => a.itemName.localeCompare(b.itemName));
    const uniqueItems = new Set(sorted.map((row) => row.itemId ?? row.itemName));
    result.set(date, {
      date,
      lineCount: sorted.length,
      itemCount: uniqueItems.size,
      totalQuantity: qty(sorted.reduce((sum, row) => sum + row.quantity, 0)),
      totalValue: qty(sorted.reduce((sum, row) => sum + row.totalCost, 0)),
      lines: sorted,
    });
  }
  return result;
}

export function getBarStockReceivedDates(receivedMap: Map<string, BarStockDailyReceivedSummary>): string[] {
  return [...receivedMap.keys()].sort((a, b) => b.localeCompare(a));
}

export function getBarStockReceivedForDate(
  receivedMap: Map<string, BarStockDailyReceivedSummary>,
  date: string,
): BarStockDailyReceivedSummary | null {
  return receivedMap.get(date) ?? null;
}

export function countBarStockDrinkItems(
  items: StockManagedItem[],
  balances: StockLocationBalance[],
  workspace: InventoryWorkspace,
): number {
  if (workspace !== "Main Bar" && workspace !== "VIP Bar") return 0;
  return items.filter((item) => itemAtWorkspace(item, balances.filter((row) => row.location === workspace), workspace)).length;
}
