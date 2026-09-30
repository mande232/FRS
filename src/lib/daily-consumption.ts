import type { SalesRecord } from "./demo-data";
import {
  appendImmutableLedgerEntries,
  applyLotAllocations,
  buildLocationBalances,
  convertStockQuantity,
  getLocationStockQuantity,
  nextInventoryDocumentNumber,
  resolveItemUnitCost,
  selectFefoLots,
  validateStockLedgerEntry,
  type InventoryApprovalHistoryEntry,
  type InventoryDocumentBase,
  type InventorySettingsRecord,
  type StockLedgerEntry,
  type StockLocationBalance,
  type StockLot,
  type StockManagedItem,
  type StockRecipe,
  type StockUnitType,
  DEFAULT_INVENTORY_SETTINGS,
} from "./stock-management";

function todayKey(date = new Date()) {
  return date.toISOString().slice(0, 10);
}

function money(value: number) {
  return Math.round((Number.isFinite(value) ? value : 0) * 100) / 100;
}

function qty(value: number) {
  return Math.round((Number.isFinite(value) ? value : 0) * 1000) / 1000;
}

function nowIso() {
  return new Date().toISOString();
}

function historyEntry(
  action: InventoryApprovalHistoryEntry["action"],
  actedBy: string,
  notes?: string,
): InventoryApprovalHistoryEntry {
  return {
    id: `hist-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    action,
    actedBy,
    actedAt: nowIso(),
    notes,
  };
}

export const DAILY_CONSUMPTION_DEPARTMENTS = ["Kitchen", "Coffee House"] as const;
export type DailyConsumptionDepartment = (typeof DAILY_CONSUMPTION_DEPARTMENTS)[number];

export const DAILY_CONSUMPTION_STATUSES = ["Draft", "Posted"] as const;
export type DailyConsumptionStatus = (typeof DAILY_CONSUMPTION_STATUSES)[number];

export function isDailyConsumptionDepartment(
  location: string,
): location is DailyConsumptionDepartment {
  return (DAILY_CONSUMPTION_DEPARTMENTS as readonly string[]).includes(location);
}

export interface DailyConsumptionLine {
  id: string;
  itemId: string;
  itemName: string;
  unit: StockUnitType;
  quantityBefore: number;
  consumedQuantity: number;
  quantityAfter: number;
  unitCost: number;
  totalValue: number;
  reorderLevel: number;
  lowStock: boolean;
  notes?: string;
}

export interface DailyConsumptionDocument extends InventoryDocumentBase {
  documentType: "Daily Consumption Voucher";
  status: DailyConsumptionStatus;
  consumptionNumber: string;
  department: DailyConsumptionDepartment;
  consumptionDate: string;
  shift?: string;
  preparedBy: string;
  approvedBy?: string;
  postedAt?: string;
  postedBy?: string;
  lines: DailyConsumptionLine[];
  totalConsumedQuantity: number;
  totalConsumedValue: number;
}

export interface DailyConsumptionDraftLine {
  itemId: string;
  consumedQuantity: number;
  notes?: string;
}

export interface DailyConsumptionReportRow {
  date: string;
  department: string;
  referenceNo: string;
  itemName: string;
  openingStock: number;
  consumed: number;
  transfersReceived: number;
  adjustments: number;
  closingStock: number;
  unit: string;
  totalValue: number;
  postedBy: string;
}

function summarizeLines(lines: DailyConsumptionLine[]) {
  return {
    totalConsumedQuantity: qty(lines.reduce((sum, line) => sum + line.consumedQuantity, 0)),
    totalConsumedValue: money(lines.reduce((sum, line) => sum + line.totalValue, 0)),
  };
}

export function buildDailyConsumptionTableRows(input: {
  department: DailyConsumptionDepartment;
  items: StockManagedItem[];
  balances: StockLocationBalance[];
  draftLines?: DailyConsumptionDraftLine[];
}): DailyConsumptionLine[] {
  const draftByItem = new Map((input.draftLines ?? []).map((line) => [line.itemId, line]));
  const rows = input.balances
    .filter((row) => row.location === input.department && row.quantity > 0)
    .sort((a, b) => a.itemName.localeCompare(b.itemName));

  return rows.map((balance) => {
    const item = input.items.find((row) => row.id === balance.itemId);
    const draft = draftByItem.get(balance.itemId);
    const consumedQuantity = qty(Math.max(0, draft?.consumedQuantity ?? 0));
    const quantityBefore = qty(balance.quantity);
    const quantityAfter = qty(quantityBefore - consumedQuantity);
    const unitCost = money(balance.unitCost ?? item?.purchasePrice ?? 0);
    return {
      id: `dc-line-${balance.itemId}`,
      itemId: balance.itemId,
      itemName: balance.itemName,
      unit: balance.unit,
      quantityBefore,
      consumedQuantity,
      quantityAfter,
      unitCost,
      totalValue: money(consumedQuantity * unitCost),
      reorderLevel: balance.reorderLevel,
      lowStock: quantityAfter <= balance.reorderLevel,
      notes: draft?.notes,
    };
  });
}

export function createDailyConsumptionDocument(input: {
  department: DailyConsumptionDepartment;
  consumptionDate?: string;
  shift?: string;
  preparedBy: string;
  approvedBy?: string;
  notes?: string;
  items: StockManagedItem[];
  ledger: StockLedgerEntry[];
  lines: DailyConsumptionDraftLine[];
  existingNumbers: string[];
}): DailyConsumptionDocument {
  const consumptionDate = input.consumptionDate ?? todayKey();
  const balances = buildLocationBalances(input.items, input.ledger);
  const tableLines = buildDailyConsumptionTableRows({
    department: input.department,
    items: input.items,
    balances,
    draftLines: input.lines,
  }).filter((line) => line.consumedQuantity > 0);

  if (tableLines.length === 0) {
    throw new Error("Enter consumed quantity for at least one item.");
  }

  const consumptionNumber = nextInventoryDocumentNumber("DC", input.existingNumbers, new Date(`${consumptionDate}T12:00:00`));
  const totals = summarizeLines(tableLines);

  return {
    id: `daily-consumption-${Date.now()}`,
    documentType: "Daily Consumption Voucher",
    documentNumber: consumptionNumber,
    consumptionNumber,
    status: "Draft",
    department: input.department,
    consumptionDate,
    shift: input.shift?.trim() || undefined,
    preparedBy: input.preparedBy,
    approvedBy: input.approvedBy?.trim() || undefined,
    createdAt: nowIso(),
    createdBy: input.preparedBy,
    notes: input.notes,
    approvalHistory: [historyEntry("Created", input.preparedBy, "Daily consumption draft")],
    lines: tableLines,
    totalConsumedQuantity: totals.totalConsumedQuantity,
    totalConsumedValue: totals.totalConsumedValue,
  };
}

export function postDailyConsumptionDocument(input: {
  document: DailyConsumptionDocument;
  items: StockManagedItem[];
  ledger: StockLedgerEntry[];
  settings?: InventorySettingsRecord;
  lots?: StockLot[];
  postedBy: string;
}): {
  document: DailyConsumptionDocument;
  ledgerEntries: StockLedgerEntry[];
  ledger: StockLedgerEntry[];
  lots: StockLot[];
} {
  const settings = input.settings ?? DEFAULT_INVENTORY_SETTINGS;
  if (input.document.status === "Posted") {
    throw new Error("Daily consumption is already posted.");
  }
  if (!isDailyConsumptionDepartment(input.document.department)) {
    throw new Error("Daily consumption is only supported for Kitchen and Coffee House.");
  }

  const activeLines = input.document.lines.filter((line) => line.consumedQuantity > 0);
  if (activeLines.length === 0) {
    throw new Error("No consumed quantities to post.");
  }

  let nextLots = [...(input.lots ?? [])];
  let workingLedger = [...input.ledger];
  const ledgerEntries: StockLedgerEntry[] = [];
  const at = nowIso();

  activeLines.forEach((line, index) => {
    const item = input.items.find((row) => row.id === line.itemId);
    if (!item) throw new Error(`Item not found: ${line.itemName}`);

    const baseQuantity = convertStockQuantity(item, line.consumedQuantity, line.unit, item.baseUnit);
    if (!(baseQuantity > 0)) {
      throw new Error(`Invalid quantity for ${line.itemName}.`);
    }

    const available = getLocationStockQuantity(
      input.items,
      workingLedger,
      item.id,
      input.document.department,
    );
    if (!settings.allowNegativeStock && available + 0.0001 < baseQuantity) {
      throw new Error(
        `Insufficient stock for ${line.itemName} in ${input.document.department}. Available: ${qty(available)} ${item.baseUnit}.`,
      );
    }

    const unitCost = resolveItemUnitCost(item, settings);
    const referenceNo = input.document.consumptionNumber;

    if (nextLots.length > 0) {
      const { allocations, remaining } = selectFefoLots(
        nextLots,
        item.id,
        input.document.department,
        baseQuantity,
      );
      if (remaining <= 0) {
        nextLots = applyLotAllocations(nextLots, allocations);
        allocations.forEach((allocation, allocationIndex) => {
          const entry: StockLedgerEntry = {
            id: `sled-dc-${input.document.id}-${index}-${allocationIndex}`,
            type: "DAILY_CONSUMPTION",
            date: input.document.consumptionDate,
            itemId: item.id,
            itemName: item.name,
            category: item.category,
            location: input.document.department,
            quantity: allocation.quantity,
            unit: item.baseUnit,
            unitPrice: allocation.unitCost,
            totalCost: money(allocation.quantity * allocation.unitCost),
            enteredBy: input.postedBy,
            referenceNo,
            batchNumber: allocation.batchNumber,
            expiryDate: allocation.expiryDate,
            notes: line.notes || `Daily consumption ${referenceNo}`,
            transactionAt: at,
            quantityIn: 0,
            quantityOut: allocation.quantity,
            immutable: true,
            reason: "Daily consumption",
          };
          const validation = validateStockLedgerEntry(input.items, workingLedger, entry, settings);
          if (!validation.ok) throw new Error(validation.error || `Cannot post ${line.itemName}.`);
          ledgerEntries.push(entry);
          workingLedger = appendImmutableLedgerEntries(workingLedger, [entry]);
        });
        return;
      }
    }

    const entry: StockLedgerEntry = {
      id: `sled-dc-${input.document.id}-${index}`,
      type: "DAILY_CONSUMPTION",
      date: input.document.consumptionDate,
      itemId: item.id,
      itemName: item.name,
      category: item.category,
      location: input.document.department,
      quantity: qty(line.consumedQuantity),
      unit: line.unit,
      unitPrice: unitCost,
      totalCost: money(line.consumedQuantity * unitCost),
      enteredBy: input.postedBy,
      referenceNo,
      notes: line.notes || `Daily consumption ${referenceNo}`,
      transactionAt: at,
      quantityIn: 0,
      quantityOut: qty(line.consumedQuantity),
      immutable: true,
      reason: "Daily consumption",
    };
    const validation = validateStockLedgerEntry(input.items, workingLedger, entry, settings);
    if (!validation.ok) throw new Error(validation.error || `Cannot post ${line.itemName}.`);
    ledgerEntries.push(entry);
    workingLedger = appendImmutableLedgerEntries(workingLedger, [entry]);
  });

  const postedDocument: DailyConsumptionDocument = {
    ...input.document,
    status: "Posted",
    postedAt: at,
    postedBy: input.postedBy,
    approvalHistory: [
      ...input.document.approvalHistory,
      historyEntry("Posted", input.postedBy, "Daily consumption posted"),
    ],
  };

  return {
    document: postedDocument,
    ledgerEntries,
    ledger: workingLedger,
    lots: nextLots,
  };
}

export function buildDailyConsumptionReport(input: {
  documents: DailyConsumptionDocument[];
  ledger: StockLedgerEntry[];
  fromDate?: string;
  toDate?: string;
  department?: DailyConsumptionDepartment | "ALL";
  itemId?: string;
}): DailyConsumptionReportRow[] {
  const posted = input.documents.filter((doc) => doc.status === "Posted");
  const rows: DailyConsumptionReportRow[] = [];

  for (const doc of posted) {
    if (input.department && input.department !== "ALL" && doc.department !== input.department) continue;
    if (input.fromDate && doc.consumptionDate < input.fromDate) continue;
    if (input.toDate && doc.consumptionDate > input.toDate) continue;

    for (const line of doc.lines) {
      if (input.itemId && line.itemId !== input.itemId) continue;
      const dayLedger = input.ledger.filter(
        (entry) =>
          entry.date === doc.consumptionDate &&
          entry.location === doc.department &&
          entry.itemId === line.itemId,
      );
      const transfersReceived = qty(
        dayLedger
          .filter((entry) => entry.type === "TRANSFER_IN")
          .reduce((sum, entry) => sum + entry.quantity, 0),
      );
      const adjustments = qty(
        dayLedger
          .filter((entry) => entry.type === "ADJUSTMENT" || entry.type === "STOCK_COUNT_ADJUSTMENT")
          .reduce((sum, entry) => sum + entry.quantity, 0),
      );

      rows.push({
        date: doc.consumptionDate,
        department: doc.department,
        referenceNo: doc.consumptionNumber,
        itemName: line.itemName,
        openingStock: line.quantityBefore,
        consumed: line.consumedQuantity,
        transfersReceived,
        adjustments,
        closingStock: line.quantityAfter,
        unit: line.unit,
        totalValue: line.totalValue,
        postedBy: doc.postedBy ?? doc.preparedBy,
      });
    }
  }

  return rows.sort((a, b) => b.date.localeCompare(a.date) || a.itemName.localeCompare(b.itemName));
}

export function dailyConsumptionDocumentsForDepartment(
  documents: DailyConsumptionDocument[],
  department: DailyConsumptionDepartment,
  date = todayKey(),
) {
  return documents.filter(
    (doc) => doc.department === department && doc.consumptionDate === date && doc.status === "Posted",
  );
}

export function todayDailyConsumptionTotals(
  documents: DailyConsumptionDocument[],
  department: DailyConsumptionDepartment,
  date = todayKey(),
) {
  const docs = dailyConsumptionDocumentsForDepartment(documents, department, date);
  return {
    documents: docs.length,
    totalQuantity: qty(docs.reduce((sum, doc) => sum + doc.totalConsumedQuantity, 0)),
    totalValue: money(docs.reduce((sum, doc) => sum + doc.totalConsumedValue, 0)),
    topItems: [...docs.flatMap((doc) => doc.lines)]
      .reduce<Map<string, { itemName: string; quantity: number; totalCost: number }>>((map, line) => {
        const current = map.get(line.itemId) ?? { itemName: line.itemName, quantity: 0, totalCost: 0 };
        current.quantity = qty(current.quantity + line.consumedQuantity);
        current.totalCost = money(current.totalCost + line.totalValue);
        map.set(line.itemId, current);
        return map;
      }, new Map())
      .values(),
  };
}

export const COFFEE_BEANS_SKU = "stk-coffee-beans";
export const TEA_LEAVES_SKU = "stk-tea-leaves";
/** Ginger (kg) — Keshir raw stock. */
export const GINGER_SKU = "stk-ginger";
/** Nuts / lewuz (kg) — nuts tea raw stock. */
export const NUTS_SKU = "stk-nuts";
/** Milk (liter) — sold by cup via daily consumption. */
export const MILK_SKU = "stk-milk";

/** Default kg beans per coffee cup when no recipe is configured. */
export const DEFAULT_COFFEE_BEANS_KG_PER_CUP = 0.015;
/** Default kg tea leaves per tea / lemon tea cup when no recipe is configured. */
export const DEFAULT_TEA_LEAVES_KG_PER_CUP = 0.005;
/** Default kg ginger per keshir cup when no recipe is configured. */
export const DEFAULT_GINGER_KG_PER_CUP = 0.01;
/** Default kg nuts per lewuz cup when no recipe is configured. */
export const DEFAULT_NUTS_KG_PER_CUP = 0.02;
/** Default liters milk per milk cup when no recipe is configured. */
export const DEFAULT_MILK_LITER_PER_CUP = 0.2;

export const COFFEE_HOUSE_RAW_STOCK = [
  { id: COFFEE_BEANS_SKU, defaultYield: DEFAULT_COFFEE_BEANS_KG_PER_CUP, defaultUnit: "kg" as const, label: "Coffee beans" },
  { id: TEA_LEAVES_SKU, defaultYield: DEFAULT_TEA_LEAVES_KG_PER_CUP, defaultUnit: "kg" as const, label: "Tea leaves" },
  { id: GINGER_SKU, defaultYield: DEFAULT_GINGER_KG_PER_CUP, defaultUnit: "kg" as const, label: "Ginger (Keshir)" },
  { id: NUTS_SKU, defaultYield: DEFAULT_NUTS_KG_PER_CUP, defaultUnit: "kg" as const, label: "Nuts (Lewuz)" },
  { id: MILK_SKU, defaultYield: DEFAULT_MILK_LITER_PER_CUP, defaultUnit: "liter" as const, label: "Milk" },
] as const;

export type CoffeeHouseRawSkuId = (typeof COFFEE_HOUSE_RAW_STOCK)[number]["id"];

export type CoffeeHousePosCupLine = {
  productId?: string;
  productName: string;
  qty: number;
  revenue: number;
  stockItemId: string | null;
  /** Yield in the raw item's base unit per cup (kg or liter). */
  yieldKgPerCup: number;
  suggestedKg: number;
};

export type CoffeeHousePosCupSummary = {
  date: string;
  cups: CoffeeHousePosCupLine[];
  totalCups: number;
  totalRevenue: number;
  /** Suggested raw qty by inventory item id (beans / tea / ginger / nuts / milk). */
  suggestedByItemId: Record<string, number>;
};

function normalizeDrinkName(value: string) {
  return value.trim().toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

function isCoffeeHouseSale(record: SalesRecord) {
  const station = (record.station ?? "").toLowerCase();
  return station.includes("coffee");
}

export function defaultYieldForCoffeeHouseSku(stockItemId: string | null | undefined) {
  const row = COFFEE_HOUSE_RAW_STOCK.find((item) => item.id === stockItemId);
  return row?.defaultYield ?? 0;
}

export function resolveCoffeeHouseRawSku(productName: string, productId?: string): string | null {
  const id = (productId ?? "").toLowerCase();
  const name = normalizeDrinkName(productName);

  // Milk (liter) — Wetet / milk cup
  if (
    name.includes("wetet") ||
    name.includes("milk") ||
    id === "m1782738339804" ||
    id.includes("wetet") ||
    id.includes("milk")
  ) {
    return MILK_SKU;
  }

  // Keshir — ginger (kg)
  if (
    name.includes("keshir") ||
    name.includes("qeshir") ||
    name.includes("ginger") ||
    id === "m1782738284927" ||
    id.includes("keshir") ||
    id.includes("ginger")
  ) {
    return GINGER_SKU;
  }

  // Nuts tea / Lewuz — nuts (kg)
  if (
    name.includes("lewuz") ||
    name.includes("leuz") ||
    name.includes("nuts") ||
    name.includes("nut tea") ||
    id === "m1782738316675" ||
    id.includes("lewuz") ||
    id.includes("nut")
  ) {
    return NUTS_SKU;
  }

  // Tea / lemon tea — tea leaves (kg)
  if (
    name.includes("lemon") ||
    name.includes("tea") ||
    name.includes("shai") ||
    id.includes("tea") ||
    id === "m1782738368138" ||
    id === "m1782738395794"
  ) {
    return TEA_LEAVES_SKU;
  }

  // Coffee / buna — beans (kg)
  if (
    name.includes("coffee") ||
    name.includes("buna") ||
    id.includes("coffee") ||
    id === "m1782752284800" ||
    id === "coffee"
  ) {
    return COFFEE_BEANS_SKU;
  }

  // Other Coffee House drinks still count as cups; no automatic raw mapping.
  return null;
}

function recipeQtyPerCup(recipes: StockRecipe[] | undefined, productName: string, stockItemId: string) {
  if (!recipes?.length) return null;
  const recipe = recipes.find(
    (row) => normalizeDrinkName(row.menuItemName) === normalizeDrinkName(productName),
  );
  if (!recipe) return null;
  const ingredient = recipe.ingredients.find((line) => line.itemId === stockItemId);
  if (!ingredient || !(ingredient.quantity > 0)) return null;
  const wastage = 1 + Math.max(0, recipe.wastageAllowance ?? 0) / 100;
  return qty(ingredient.quantity * wastage);
}

/**
 * Aggregate Coffee House POS cup sales for a date and suggest raw qty
 * (beans / tea / ginger / nuts / milk) from recipes or default yields — for daily consumption prefill.
 */
export function buildCoffeeHousePosCupSummary(input: {
  salesRecords: SalesRecord[];
  date: string;
  recipes?: StockRecipe[];
}): CoffeeHousePosCupSummary {
  const byProduct = new Map<string, CoffeeHousePosCupLine>();

  for (const record of input.salesRecords) {
    if (record.date !== input.date) continue;
    if (!isCoffeeHouseSale(record)) continue;
    if (!(record.qty > 0)) continue;

    const key = `${record.productId ?? ""}|${record.productName}`;
    const stockItemId = resolveCoffeeHouseRawSku(record.productName, record.productId);
    const defaultYield = defaultYieldForCoffeeHouseSku(stockItemId);
    const yieldKgPerCup =
      (stockItemId
        ? recipeQtyPerCup(input.recipes, record.productName, stockItemId)
        : null) ?? defaultYield;

    const existing = byProduct.get(key);
    if (existing) {
      existing.qty = qty(existing.qty + record.qty);
      existing.revenue = money(existing.revenue + record.revenue);
      existing.suggestedKg = qty(existing.qty * existing.yieldKgPerCup);
      continue;
    }

    byProduct.set(key, {
      productId: record.productId,
      productName: record.productName,
      qty: qty(record.qty),
      revenue: money(record.revenue),
      stockItemId,
      yieldKgPerCup,
      suggestedKg: qty(record.qty * yieldKgPerCup),
    });
  }

  const cups = [...byProduct.values()].sort((a, b) => b.qty - a.qty || a.productName.localeCompare(b.productName));
  const suggestedByItemId: Record<string, number> = {};
  for (const line of cups) {
    if (!line.stockItemId || !(line.suggestedKg > 0)) continue;
    suggestedByItemId[line.stockItemId] = qty((suggestedByItemId[line.stockItemId] ?? 0) + line.suggestedKg);
  }

  return {
    date: input.date,
    cups,
    totalCups: qty(cups.reduce((sum, row) => sum + row.qty, 0)),
    totalRevenue: money(cups.reduce((sum, row) => sum + row.revenue, 0)),
    suggestedByItemId,
  };
}

/** Cups → stock qty (kg or liter). */
export function estimateKgFromCups(cups: number, qtyPerCup: number) {
  if (!(cups > 0) || !(qtyPerCup > 0)) return 0;
  return qty(cups * qtyPerCup);
}

/** Stock on hand → cups possible. */
export function estimateCupsFromKg(onHandQty: number, qtyPerCup: number) {
  if (!(onHandQty > 0) || !(qtyPerCup > 0)) return 0;
  return qty(Math.floor((onHandQty / qtyPerCup) * 1000) / 1000);
}

export const estimateQtyFromCups = estimateKgFromCups;
export const estimateCupsFromQty = estimateCupsFromKg;

export type CoffeeHouseStockCheckRow = {
  itemId: string;
  itemName: string;
  unit: string;
  /** On-hand quantity in base unit (kg or liter). */
  onHandKg: number;
  suggestedKg: number;
  postedKg: number;
  varianceSuggestedVsPosted: number;
  cupsPossible: number;
  /** Yield in base unit per cup. */
  kgPerCup: number;
  reorderLevel: number;
};

export type CoffeeHouseWorkspaceReport = {
  date: string;
  pos: CoffeeHousePosCupSummary;
  stockRows: CoffeeHouseStockCheckRow[];
  beansOnHand: number;
  teaOnHand: number;
  gingerOnHand: number;
  nutsOnHand: number;
  milkOnHand: number;
  beansSuggested: number;
  teaSuggested: number;
  gingerSuggested: number;
  nutsSuggested: number;
  milkSuggested: number;
  beansPosted: number;
  teaPosted: number;
  gingerPosted: number;
  nutsPosted: number;
  milkPosted: number;
  totalCups: number;
  totalRevenue: number;
};

function balanceQty(
  balances: StockLocationBalance[],
  itemId: string,
  location: string,
) {
  return qty(
    balances
      .filter((row) => row.itemId === itemId && row.location === location)
      .reduce((sum, row) => sum + row.quantity, 0),
  );
}

function totalBalanceQty(balances: StockLocationBalance[], itemId: string) {
  return qty(
    balances.filter((row) => row.itemId === itemId).reduce((sum, row) => sum + row.quantity, 0),
  );
}

/** On-hand for Coffee House report: prefer Coffee House, else preferred location, else any location. */
export function coffeeHouseOnHandQty(
  balances: StockLocationBalance[],
  item: Pick<StockManagedItem, "id" | "preferredLocation"> | undefined,
  fallbackItemId: string,
) {
  const itemId = item?.id ?? fallbackItemId;
  const atCoffee = balanceQty(balances, itemId, "Coffee House");
  if (atCoffee > 0) return atCoffee;
  if (item?.preferredLocation) {
    const atPreferred = balanceQty(balances, itemId, item.preferredLocation);
    if (atPreferred > 0) return atPreferred;
  }
  return totalBalanceQty(balances, itemId);
}

function itemMatchesCoffeeHouseRole(item: StockManagedItem, roleId: CoffeeHouseRawSkuId) {
  if (item.id === roleId) return true;
  const name = normalizeDrinkName(item.name);
  switch (roleId) {
    case MILK_SKU:
      return name.includes("milk") || name.includes("wetet");
    case GINGER_SKU:
      return name.includes("ginger") || name.includes("keshir") || name.includes("qeshir") || name.includes("zinjibil");
    case NUTS_SKU:
      return name.includes("nut") || name.includes("lewuz") || name.includes("leuz");
    case TEA_LEAVES_SKU:
      return (
        name.includes("tea leaf") ||
        name.includes("tea leaves") ||
        (name.includes("tea") && !name.includes("lemon") && !name.includes("nut") && !name.includes("lewuz"))
      );
    case COFFEE_BEANS_SKU:
      return name.includes("coffee bean") || (name.includes("coffee") && name.includes("bean")) || name === "buna";
    default:
      return false;
  }
}

/**
 * Resolve the live inventory item for a Coffee House raw role.
 * Matches system SKU id first, otherwise name (e.g. manually added "Milk").
 * Prefers items with Coffee House / preferred stock on hand.
 */
export function resolveCoffeeHouseRawItem(
  items: StockManagedItem[],
  balances: StockLocationBalance[],
  roleId: CoffeeHouseRawSkuId,
): StockManagedItem | undefined {
  const active = items.filter((item) => item.active !== false);
  const candidates = active.filter((item) => itemMatchesCoffeeHouseRole(item, roleId));
  if (candidates.length === 0) return active.find((item) => item.id === roleId);

  const scored = candidates
    .map((item) => {
      const atCoffee = balanceQty(balances, item.id, "Coffee House");
      const atPreferred = balanceQty(balances, item.id, item.preferredLocation);
      const total = totalBalanceQty(balances, item.id);
      let score = 0;
      if (item.id === roleId && total > 0) score += 100;
      else if (item.id === roleId) score += 15;
      if (atCoffee > 0) score += 50 + Math.min(atCoffee, 20);
      if (item.preferredLocation === "Coffee House") score += 25;
      if (normalizeDrinkName(item.category ?? "").includes("coffee")) score += 10;
      if (atPreferred > 0) score += 20;
      if (total > 0) score += 30;
      if (roleId === MILK_SKU && (item.baseUnit === "liter" || item.baseUnit === "millilitre")) score += 15;
      if (roleId !== MILK_SKU && item.baseUnit === "kg") score += 5;
      return { item, score, atCoffee, total };
    })
    .sort((a, b) => b.score - a.score || b.atCoffee - a.atCoffee || b.total - a.total);

  return scored[0]?.item;
}

function postedDailyQty(
  documents: DailyConsumptionDocument[],
  itemIds: string | string[],
  date: string,
  department: DailyConsumptionDepartment = "Coffee House",
) {
  const idSet = new Set((Array.isArray(itemIds) ? itemIds : [itemIds]).filter(Boolean));
  return qty(
    documents
      .filter((doc) => doc.status === "Posted" && doc.department === department && doc.consumptionDate === date)
      .flatMap((doc) => doc.lines)
      .filter((line) => idSet.has(line.itemId))
      .reduce((sum, line) => sum + line.consumedQuantity, 0),
  );
}

/** Full Coffee House day report: POS cups, on-hand qty, suggested vs posted consumption. */
export function buildCoffeeHouseWorkspaceReport(input: {
  salesRecords: SalesRecord[];
  balances: StockLocationBalance[];
  items: StockManagedItem[];
  dailyConsumptions: DailyConsumptionDocument[];
  date: string;
  recipes?: StockRecipe[];
}): CoffeeHouseWorkspaceReport {
  const pos = buildCoffeeHousePosCupSummary({
    salesRecords: input.salesRecords,
    date: input.date,
    recipes: input.recipes,
  });

  const stockRows: CoffeeHouseStockCheckRow[] = COFFEE_HOUSE_RAW_STOCK.map(({ id, defaultYield, defaultUnit, label }) => {
    const item = resolveCoffeeHouseRawItem(input.items, input.balances, id);
    const liveId = item?.id ?? id;
    const onHandKg = coffeeHouseOnHandQty(input.balances, item, id);
    const suggestedKg = qty(pos.suggestedByItemId[id] ?? 0);
    const postedKg = postedDailyQty(input.dailyConsumptions, [id, liveId], input.date);
    const cupsForSku = pos.cups.filter((line) => line.stockItemId === id);
    const totalCupsForSku = qty(cupsForSku.reduce((sum, line) => sum + line.qty, 0));
    const kgPerCup =
      totalCupsForSku > 0 && suggestedKg > 0 ? qty(suggestedKg / totalCupsForSku) : defaultYield;
    const balance =
      input.balances.find((row) => row.itemId === liveId && row.location === "Coffee House") ??
      input.balances.find((row) => row.itemId === liveId && row.location === item?.preferredLocation) ??
      input.balances.find((row) => row.itemId === liveId);
    return {
      itemId: id,
      itemName: item?.name ?? label,
      unit: item?.baseUnit ?? defaultUnit,
      onHandKg,
      suggestedKg,
      postedKg,
      varianceSuggestedVsPosted: qty(suggestedKg - postedKg),
      cupsPossible: estimateCupsFromKg(onHandKg, kgPerCup),
      kgPerCup,
      reorderLevel: balance?.reorderLevel ?? item?.reorderLevel ?? 0,
    };
  });

  const pick = (roleId: string) => stockRows.find((row) => row.itemId === roleId);

  return {
    date: input.date,
    pos,
    stockRows,
    beansOnHand: pick(COFFEE_BEANS_SKU)?.onHandKg ?? 0,
    teaOnHand: pick(TEA_LEAVES_SKU)?.onHandKg ?? 0,
    gingerOnHand: pick(GINGER_SKU)?.onHandKg ?? 0,
    nutsOnHand: pick(NUTS_SKU)?.onHandKg ?? 0,
    milkOnHand: pick(MILK_SKU)?.onHandKg ?? 0,
    beansSuggested: pick(COFFEE_BEANS_SKU)?.suggestedKg ?? 0,
    teaSuggested: pick(TEA_LEAVES_SKU)?.suggestedKg ?? 0,
    gingerSuggested: pick(GINGER_SKU)?.suggestedKg ?? 0,
    nutsSuggested: pick(NUTS_SKU)?.suggestedKg ?? 0,
    milkSuggested: pick(MILK_SKU)?.suggestedKg ?? 0,
    beansPosted: pick(COFFEE_BEANS_SKU)?.postedKg ?? 0,
    teaPosted: pick(TEA_LEAVES_SKU)?.postedKg ?? 0,
    gingerPosted: pick(GINGER_SKU)?.postedKg ?? 0,
    nutsPosted: pick(NUTS_SKU)?.postedKg ?? 0,
    milkPosted: pick(MILK_SKU)?.postedKg ?? 0,
    totalCups: pos.totalCups,
    totalRevenue: pos.totalRevenue,
  };
}
