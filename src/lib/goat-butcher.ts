import type { MenuItem, SalesRecord } from "./demo-data";
import {
  appendImmutableLedgerEntries,
  buildLocationBalances,
  calculateWeightedAverageCost,
  GOAT_BONE_SKU,
  GOAT_INSIDE_SKU,
  GOAT_LIMB_SKU,
  GOAT_MENU_IDS,
  GOAT_POOL_SKUS,
  isGoatPoolSku,
  mergeMissingGoatPoolItems,
  nextInventoryDocumentNumber,
  posOrderReference,
  receiveIntoLots,
  resolveGoatPoolSkuForMenuItem,
  type StockLedgerEntry,
  type StockLot,
  type StockManagedItem,
} from "./stock-management";

function money(value: number) {
  return Math.round((Number.isFinite(value) ? value : 0) * 100) / 100;
}

function qty(value: number) {
  return Math.round((Number.isFinite(value) ? value : 0) * 1000) / 1000;
}

function nowIso() {
  return new Date().toISOString();
}

export const GOAT_REGISTRATION_LOCATION = "Butcher" as const;

export type GoatRegistrationStatus = "active" | "depleted" | "cancelled";

export interface GoatRegistration {
  id: string;
  documentNo: string;
  registeredAt: string;
  registeredBy: string;
  goatType: string;
  purchasePrice: number;
  supplierName?: string;
  frontLegKg: number;
  backLegKg: number;
  insidePartsKg: number;
  boneKg: number;
  wasteKg: number;
  limbKg: number;
  location: typeof GOAT_REGISTRATION_LOCATION;
  status: GoatRegistrationStatus;
  referenceNo: string;
  notes?: string;
}

export interface RegisterGoatDirectPurchaseInput {
  goatType: string;
  purchasePrice: number;
  frontLegKg: number;
  backLegKg: number;
  insidePartsKg: number;
  boneKg?: number;
  wasteKg?: number;
  supplierName?: string;
  registeredBy: string;
  notes?: string;
}

export interface GoatRegistrationReportRow {
  registration: GoatRegistration;
  registeredLimbKg: number;
  registeredInsideKg: number;
  registeredBoneKg: number;
  registeredWasteKg: number;
  soldLimbKg: number;
  soldInsideKg: number;
  soldBoneKg: number;
  remainingLimbKg: number;
  remainingInsideKg: number;
  remainingBoneKg: number;
  consumptionCost: number;
  salesBirr: number;
}

export interface GoatPoolReportSummary {
  poolSku: string;
  poolName: string;
  registeredKg: number;
  remainingKg: number;
  soldKg: number;
  salesBirr: number;
  consumptionCost: number;
  avgBirrPerKg: number;
  soldPct: number;
}

export interface GoatAttributedSaleLine {
  id: string;
  date: string;
  time: string;
  orderNo?: string;
  productName: string;
  poolSku: string;
  poolName: string;
  qty: number;
  unitPrice: number;
  revenue: number;
}

export interface GoatRegistrationReport {
  rows: GoatRegistrationReportRow[];
  poolSummaries: GoatPoolReportSummary[];
  recentSales: GoatAttributedSaleLine[];
  totalRegisteredGoats: number;
  activeGoats: number;
  depletedGoats: number;
  totalRegisteredLimbKg: number;
  totalRegisteredInsideKg: number;
  totalRegisteredBoneKg: number;
  totalRemainingLimbKg: number;
  totalRemainingInsideKg: number;
  totalRemainingBoneKg: number;
  totalRemainingKg: number;
  totalSoldLimbKg: number;
  totalSoldInsideKg: number;
  totalSoldBoneKg: number;
  totalSoldKg: number;
  totalWasteKg: number;
  totalPurchasePrice: number;
  totalConsumptionCost: number;
  totalSalesBirr: number;
  totalGrossMargin: number;
}

const GOAT_TYPES = [
  "Local",
  "Somali",
  "Afar",
  "Mixed",
  "Other",
] as const;

export function listGoatTypes(): string[] {
  return [...GOAT_TYPES];
}

export function goatReferenceNo(documentNo: string) {
  return `GOAT-${documentNo}`;
}

function goatLotBatch(referenceNo: string, pool: "limb" | "inside" | "bone") {
  return `${referenceNo}-${pool.toUpperCase()}`;
}

function poolKeyForSku(itemId: string): "limb" | "inside" | "bone" | null {
  if (itemId === GOAT_LIMB_SKU) return "limb";
  if (itemId === GOAT_INSIDE_SKU) return "inside";
  if (itemId === GOAT_BONE_SKU) return "bone";
  return null;
}

function allocateGoatPurchaseCost(
  purchasePrice: number,
  limbKg: number,
  insideKg: number,
  boneKg: number,
): { limbUnitCost: number; insideUnitCost: number; boneUnitCost: number } {
  const totalKg = qty(limbKg + insideKg + boneKg);
  if (!(totalKg > 0)) {
    return { limbUnitCost: 0, insideUnitCost: 0, boneUnitCost: 0 };
  }
  const limbShare = money(purchasePrice * (limbKg / totalKg));
  const insideShare = money(purchasePrice * (insideKg / totalKg));
  const boneShare = money(purchasePrice - limbShare - insideShare);
  return {
    limbUnitCost: limbKg > 0 ? money(limbShare / limbKg) : 0,
    insideUnitCost: insideKg > 0 ? money(insideShare / insideKg) : 0,
    boneUnitCost: boneKg > 0 ? money(boneShare / boneKg) : 0,
  };
}

export function normalizeGoatRegistration(registration: GoatRegistration): GoatRegistration {
  return {
    ...registration,
    boneKg: registration.boneKg ?? 0,
    wasteKg: registration.wasteKg ?? 0,
  };
}

export function normalizeGoatRegistrations(registrations: GoatRegistration[]): GoatRegistration[] {
  return registrations.map(normalizeGoatRegistration);
}

export interface GoatRegistrationUsage {
  soldLimbKg: number;
  soldInsideKg: number;
  soldBoneKg: number;
  soldTotalKg: number;
}

export function getGoatRegistrationUsage(
  ledger: StockLedgerEntry[],
  referenceNo: string,
): GoatRegistrationUsage {
  const limb = consumptionForRegistration(ledger, referenceNo, GOAT_LIMB_SKU);
  const inside = consumptionForRegistration(ledger, referenceNo, GOAT_INSIDE_SKU);
  const bone = consumptionForRegistration(ledger, referenceNo, GOAT_BONE_SKU);
  const soldLimbKg = limb.quantity;
  const soldInsideKg = inside.quantity;
  const soldBoneKg = bone.quantity;
  return {
    soldLimbKg,
    soldInsideKg,
    soldBoneKg,
    soldTotalKg: qty(soldLimbKg + soldInsideKg + soldBoneKg),
  };
}

export function canModifyGoatRegistration(ledger: StockLedgerEntry[], referenceNo: string) {
  return getGoatRegistrationUsage(ledger, referenceNo).soldTotalKg <= 0;
}

function findGoatRegistrationLedgerEntries(ledger: StockLedgerEntry[], registration: GoatRegistration) {
  return ledger.filter(
    (entry) =>
      entry.type === "GOAT_REGISTRATION" &&
      (entry.referenceNo === registration.referenceNo ||
        entry.batchNumber?.startsWith(`${registration.referenceNo}-`) ||
        entry.id.startsWith(`sled-goat-${registration.id}`)),
  );
}

function removeRegistrationLots(lots: StockLot[], referenceNo: string) {
  return lots.filter((lot) => lot.referenceNo !== referenceNo);
}

function reverseGoatRegistrationStock(
  registration: GoatRegistration,
  ledger: StockLedgerEntry[],
  lots: StockLot[],
  reversedBy: string,
  reason: string,
) {
  const normalized = normalizeGoatRegistration(registration);
  let originalEntries = findGoatRegistrationLedgerEntries(ledger, normalized);
  if (originalEntries.length === 0) {
    const goatLots = lots.filter(
      (lot) =>
        lot.referenceNo === normalized.referenceNo &&
        lot.location === GOAT_REGISTRATION_LOCATION &&
        lot.status === "Available",
    );
    originalEntries = goatLots.map((lot, index) => ({
      id: `sled-goat-${normalized.id}-lot-${index}`,
      type: "GOAT_REGISTRATION" as const,
      date: normalized.registeredAt.slice(0, 10),
      itemId: lot.itemId,
      itemName: lot.itemName,
      category: lot.category ?? "Meat",
      location: GOAT_REGISTRATION_LOCATION,
      quantity: lot.quantity,
      unit: lot.unit,
      unitPrice: lot.unitCost,
      totalCost: money(lot.quantity * lot.unitCost),
      enteredBy: normalized.registeredBy,
      referenceNo: normalized.referenceNo,
      batchNumber: lot.batchNumber,
      notes: `Goat ${normalized.documentNo}`,
      transactionAt: normalized.registeredAt,
      quantityIn: lot.quantity,
      quantityOut: 0,
      immutable: true,
    }));
  }
  if (originalEntries.length === 0) {
    return { ledgerEntries: [] as StockLedgerEntry[], lots: removeRegistrationLots(lots, normalized.referenceNo) };
  }
  const at = nowIso();
  const ledgerEntries = originalEntries.map((entry, index) => ({
    id: `sled-goat-rev-${normalized.id}-${index}-${Date.now()}`,
    type: "MANUAL_ADJUSTMENT" as const,
    date: at.slice(0, 10),
    itemId: entry.itemId,
    itemName: entry.itemName,
    category: entry.category,
    location: GOAT_REGISTRATION_LOCATION,
    quantity: entry.quantity,
    unit: entry.unit,
    unitPrice: entry.unitPrice,
    totalCost: entry.totalCost,
    enteredBy: reversedBy,
    referenceNo: `${normalized.referenceNo}-REV`,
    batchNumber: entry.batchNumber,
    notes: `Goat registration reversal: ${reason}`,
    transactionAt: at,
    quantityIn: 0,
    quantityOut: entry.quantity,
    immutable: true,
    reason: "Goat registration cancelled",
  }));
  return {
    ledgerEntries,
    lots: removeRegistrationLots(lots, normalized.referenceNo),
  };
}

export function registerGoatDirectPurchase(
  input: RegisterGoatDirectPurchaseInput,
  items: StockManagedItem[],
  existingRegistrations: GoatRegistration[],
  existingLedger: StockLedgerEntry[],
  existingLots: StockLot[] = [],
  preserve?: GoatRegistration,
): {
  registration: GoatRegistration;
  ledgerEntries: StockLedgerEntry[];
  ledger: StockLedgerEntry[];
  lots: StockLot[];
  items: StockManagedItem[];
  addedGoatItems: StockManagedItem[];
} {
  const frontLegKg = qty(Math.max(0, input.frontLegKg));
  const backLegKg = qty(Math.max(0, input.backLegKg));
  const insidePartsKg = qty(Math.max(0, input.insidePartsKg));
  const boneKg = qty(Math.max(0, input.boneKg ?? 0));
  const wasteKg = qty(Math.max(0, input.wasteKg ?? 0));
  const limbKg = qty(frontLegKg + backLegKg);
  const purchasePrice = money(Math.max(0, input.purchasePrice));

  if (!(limbKg > 0) && !(insidePartsKg > 0) && !(boneKg > 0)) {
    throw new Error("Enter at least one part weight in kg (leg, inside, or bone).");
  }
  if (!(purchasePrice > 0)) {
    throw new Error("Purchase price must be greater than zero.");
  }
  if (!input.goatType.trim()) {
    throw new Error("Goat type is required.");
  }

  const { items: stockItems, added: addedGoatItems } = mergeMissingGoatPoolItems(items);
  const limbItem = stockItems.find((row) => row.id === GOAT_LIMB_SKU);
  const insideItem = stockItems.find((row) => row.id === GOAT_INSIDE_SKU);
  const boneItem = stockItems.find((row) => row.id === GOAT_BONE_SKU);
  if (!limbItem || !insideItem || !boneItem) {
    throw new Error("Goat pool stock items could not be loaded. Apply migrations 025/027 and refresh.");
  }

  const documentNo = preserve?.documentNo ?? nextInventoryDocumentNumber(
    "GOAT",
    existingRegistrations.map((row) => row.documentNo),
  );
  const referenceNo = preserve?.referenceNo ?? goatReferenceNo(documentNo);
  const registeredAt = preserve?.registeredAt ?? nowIso();
  const registration: GoatRegistration = {
    id: preserve?.id ?? `goat-reg-${Date.now()}`,
    documentNo,
    registeredAt,
    registeredBy: input.registeredBy.trim() || preserve?.registeredBy || "Butcher Staff",
    goatType: input.goatType.trim(),
    purchasePrice,
    supplierName: input.supplierName?.trim() || undefined,
    frontLegKg,
    backLegKg,
    insidePartsKg,
    boneKg,
    wasteKg,
    limbKg,
    location: GOAT_REGISTRATION_LOCATION,
    status: "active",
    referenceNo,
    notes: input.notes?.trim() || undefined,
  };

  const { limbUnitCost, insideUnitCost, boneUnitCost } = allocateGoatPurchaseCost(
    purchasePrice,
    limbKg,
    insidePartsKg,
    boneKg,
  );
  let nextLots = [...existingLots];
  const ledgerEntries: StockLedgerEntry[] = [];
  const balancesBefore = buildLocationBalances(stockItems, existingLedger);

  const nextItems = stockItems.map((item) => {
    if (item.id === GOAT_LIMB_SKU && limbKg > 0) {
      const currentBalance =
        balancesBefore.find((row) => row.itemId === item.id && row.location === GOAT_REGISTRATION_LOCATION)?.quantity ?? 0;
      const nextCost = calculateWeightedAverageCost(currentBalance, item.purchasePrice, limbKg, limbUnitCost);
      return { ...item, purchasePrice: nextCost, updatedAt: registeredAt };
    }
    if (item.id === GOAT_INSIDE_SKU && insidePartsKg > 0) {
      const currentBalance =
        balancesBefore.find((row) => row.itemId === item.id && row.location === GOAT_REGISTRATION_LOCATION)?.quantity ?? 0;
      const nextCost = calculateWeightedAverageCost(currentBalance, item.purchasePrice, insidePartsKg, insideUnitCost);
      return { ...item, purchasePrice: nextCost, updatedAt: registeredAt };
    }
    if (item.id === GOAT_BONE_SKU && boneKg > 0) {
      const currentBalance =
        balancesBefore.find((row) => row.itemId === item.id && row.location === GOAT_REGISTRATION_LOCATION)?.quantity ?? 0;
      const nextCost = calculateWeightedAverageCost(currentBalance, item.purchasePrice, boneKg, boneUnitCost);
      return { ...item, purchasePrice: nextCost, updatedAt: registeredAt };
    }
    return item;
  });

  if (limbKg > 0) {
    nextLots = receiveIntoLots(nextLots, {
      itemId: limbItem.id,
      itemName: limbItem.name,
      location: GOAT_REGISTRATION_LOCATION,
      quantity: limbKg,
      unit: "kg",
      unitCost: limbUnitCost,
      batchNumber: goatLotBatch(referenceNo, "limb"),
      referenceNo,
    });
    ledgerEntries.push({
      id: `sled-goat-${registration.id}-limb`,
      type: "GOAT_REGISTRATION",
      date: registeredAt.slice(0, 10),
      itemId: limbItem.id,
      itemName: limbItem.name,
      category: limbItem.category,
      location: GOAT_REGISTRATION_LOCATION,
      quantity: limbKg,
      unit: "kg",
      unitPrice: limbUnitCost,
      totalCost: money(limbKg * limbUnitCost),
      supplierName: registration.supplierName,
      enteredBy: registration.registeredBy,
      referenceNo,
      batchNumber: goatLotBatch(referenceNo, "limb"),
      notes: `Goat ${documentNo}: front ${frontLegKg} kg + back ${backLegKg} kg`,
      transactionAt: registeredAt,
      quantityIn: limbKg,
      quantityOut: 0,
      immutable: true,
    });
  }

  if (insidePartsKg > 0) {
    nextLots = receiveIntoLots(nextLots, {
      itemId: insideItem.id,
      itemName: insideItem.name,
      location: GOAT_REGISTRATION_LOCATION,
      quantity: insidePartsKg,
      unit: "kg",
      unitCost: insideUnitCost,
      batchNumber: goatLotBatch(referenceNo, "inside"),
      referenceNo,
    });
    ledgerEntries.push({
      id: `sled-goat-${registration.id}-inside`,
      type: "GOAT_REGISTRATION",
      date: registeredAt.slice(0, 10),
      itemId: insideItem.id,
      itemName: insideItem.name,
      category: insideItem.category,
      location: GOAT_REGISTRATION_LOCATION,
      quantity: insidePartsKg,
      unit: "kg",
      unitPrice: insideUnitCost,
      totalCost: money(insidePartsKg * insideUnitCost),
      supplierName: registration.supplierName,
      enteredBy: registration.registeredBy,
      referenceNo,
      batchNumber: goatLotBatch(referenceNo, "inside"),
      notes: `Goat ${documentNo}: inside parts ${insidePartsKg} kg`,
      transactionAt: registeredAt,
      quantityIn: insidePartsKg,
      quantityOut: 0,
      immutable: true,
    });
  }

  if (boneKg > 0) {
    nextLots = receiveIntoLots(nextLots, {
      itemId: boneItem.id,
      itemName: boneItem.name,
      location: GOAT_REGISTRATION_LOCATION,
      quantity: boneKg,
      unit: "kg",
      unitCost: boneUnitCost,
      batchNumber: goatLotBatch(referenceNo, "bone"),
      referenceNo,
    });
    ledgerEntries.push({
      id: `sled-goat-${registration.id}-bone`,
      type: "GOAT_REGISTRATION",
      date: registeredAt.slice(0, 10),
      itemId: boneItem.id,
      itemName: boneItem.name,
      category: boneItem.category,
      location: GOAT_REGISTRATION_LOCATION,
      quantity: boneKg,
      unit: "kg",
      unitPrice: boneUnitCost,
      totalCost: money(boneKg * boneUnitCost),
      supplierName: registration.supplierName,
      enteredBy: registration.registeredBy,
      referenceNo,
      batchNumber: goatLotBatch(referenceNo, "bone"),
      notes: `Goat ${documentNo}: bones for Kikl ${boneKg} kg`,
      transactionAt: registeredAt,
      quantityIn: boneKg,
      quantityOut: 0,
      immutable: true,
    });
  }

  return {
    registration,
    ledgerEntries,
    ledger: appendImmutableLedgerEntries(existingLedger, ledgerEntries),
    lots: nextLots,
    items: nextItems,
    addedGoatItems,
  };
}

export function updateGoatRegistration(
  existing: GoatRegistration,
  input: RegisterGoatDirectPurchaseInput,
  items: StockManagedItem[],
  registrations: GoatRegistration[],
  ledger: StockLedgerEntry[],
  lots: StockLot[] = [],
) {
  if (!canModifyGoatRegistration(ledger, existing.referenceNo)) {
    throw new Error("Cannot edit: meat from this goat has already been sold or consumed.");
  }
  const remaining = registrations.filter((row) => row.id !== existing.id);
  const { ledgerEntries: reversalEntries, lots: lotsAfterReversal } = reverseGoatRegistrationStock(
    existing,
    ledger,
    lots,
    input.registeredBy,
    "Registration updated",
  );
  const ledgerAfterReversal = appendImmutableLedgerEntries(ledger, reversalEntries);
  const result = registerGoatDirectPurchase(
    input,
    items,
    remaining,
    ledgerAfterReversal,
    lotsAfterReversal,
    existing,
  );
  const nextRegistrations = refreshGoatRegistrationStatuses(
    [result.registration, ...remaining.filter((row) => row.id !== result.registration.id)],
    result.lots,
  );
  return {
    ...result,
    ledgerEntries: [...reversalEntries, ...result.ledgerEntries],
    registrations: nextRegistrations,
  };
}

export function cancelGoatRegistration(
  existing: GoatRegistration,
  items: StockManagedItem[],
  registrations: GoatRegistration[],
  ledger: StockLedgerEntry[],
  lots: StockLot[] = [],
  cancelledBy: string,
  reason = "Registration cancelled",
) {
  if (!canModifyGoatRegistration(ledger, existing.referenceNo)) {
    throw new Error("Cannot delete: meat from this goat has already been sold or consumed.");
  }
  const { ledgerEntries, lots: nextLots } = reverseGoatRegistrationStock(
    existing,
    ledger,
    lots,
    cancelledBy,
    reason,
  );
  const registration: GoatRegistration = {
    ...normalizeGoatRegistration(existing),
    status: "cancelled",
  };
  const nextRegistrations = registrations.filter((row) => row.id !== registration.id);
  return {
    registration,
    ledgerEntries,
    lots: nextLots,
    items,
    registrations: nextRegistrations,
    addedGoatItems: [] as StockManagedItem[],
  };
}

export type GoatRegistrationPersistInput = {
  ledgerEntries: StockLedgerEntry[];
  items: StockManagedItem[];
  lots: StockLot[];
  registrations: GoatRegistration[];
  addedGoatItems: StockManagedItem[];
};

export type GoatRegistrationPersistActions = {
  saveGoatRegistrations: (next: GoatRegistration[]) => void;
  setLedger: (
    update: StockLedgerEntry[] | ((prev: StockLedgerEntry[]) => StockLedgerEntry[]),
  ) => void;
  saveLots: (next: StockLot[] | ((prev: StockLot[]) => StockLot[])) => void;
  saveItem: (item: StockManagedItem) => void;
};

function mergeGoatRegistrationLots(prev: StockLot[], nextLots: StockLot[]) {
  const nextById = new Map(nextLots.map((lot) => [lot.id, lot]));
  const affectedRefs = new Set(
    nextLots.map((lot) => lot.referenceNo).filter((ref): ref is string => Boolean(ref)),
  );
  const kept = prev.filter((lot) => {
    if (nextById.has(lot.id)) return false;
    if (lot.referenceNo && affectedRefs.has(lot.referenceNo)) return false;
    return true;
  });
  return [...kept, ...nextLots];
}

export function persistGoatRegistrationChange(
  actions: GoatRegistrationPersistActions,
  input: GoatRegistrationPersistInput,
) {
  actions.saveGoatRegistrations(input.registrations);
  actions.setLedger((prev) => appendImmutableLedgerEntries(prev, input.ledgerEntries));
  actions.saveLots((prev) => mergeGoatRegistrationLots(prev, input.lots));
  input.addedGoatItems.forEach((item) => actions.saveItem(item));
  input.items
    .filter((item) => !input.addedGoatItems.some((added) => added.id === item.id))
    .forEach((item) => actions.saveItem(item));
}

function lotQuantityForRegistration(lots: StockLot[], referenceNo: string, pool: "limb" | "inside" | "bone") {
  const batch = goatLotBatch(referenceNo, pool);
  return qty(
    lots
      .filter(
        (lot) =>
          lot.referenceNo === referenceNo &&
          lot.batchNumber === batch &&
          lot.location === GOAT_REGISTRATION_LOCATION &&
          lot.status === "Available",
      )
      .reduce((sum, lot) => sum + lot.quantity, 0),
  );
}

function consumptionForRegistration(
  ledger: StockLedgerEntry[],
  referenceNo: string,
  itemId: string,
) {
  const pool = poolKeyForSku(itemId);
  if (!pool) return { quantity: 0, cost: 0 };
  const batch = goatLotBatch(referenceNo, pool);
  return ledger
    .filter(
      (entry) =>
        (entry.type === "POS_CONSUMPTION" || entry.type === "RECIPE_CONSUMPTION") &&
        entry.itemId === itemId &&
        entry.batchNumber === batch,
    )
    .reduce(
      (acc, entry) => ({
        quantity: qty(acc.quantity + entry.quantity),
        cost: money(acc.cost + entry.totalCost),
      }),
      { quantity: 0, cost: 0 },
    );
}

function normalizedSaleKey(value: string) {
  return value.trim().toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

function posOrderIdFromReference(referenceNo?: string | null) {
  if (!referenceNo?.startsWith("POS-")) return null;
  return referenceNo.slice(4);
}

function lineNameFromPosNote(notes?: string | null) {
  if (!notes) return null;
  const marker = ": ";
  const idx = notes.lastIndexOf(marker);
  if (idx < 0) return null;
  const name = notes.slice(idx + marker.length).trim();
  return name || null;
}

function menuStockSkuByProductId(menuItems: MenuItem[] | undefined) {
  const map = new Map<string, string>();
  for (const item of menuItems ?? []) {
    if (item.id && item.stockSku) map.set(item.id, item.stockSku);
  }
  return map;
}

/** Resolve which goat pool a sales line belongs to (name/id, stock SKU, or pool item name). */
function resolvePoolSkuForSale(
  record: SalesRecord,
  items: StockManagedItem[],
  stockSkuByProductId: Map<string, string>,
) {
  const mapped = resolveGoatPoolSkuForMenuItem(record.productId, record.productName);
  if (mapped) return mapped;

  const linkedSku = record.productId ? stockSkuByProductId.get(record.productId) : undefined;
  if (linkedSku && isGoatPoolSku(linkedSku)) return linkedSku;

  if (record.productId && isGoatPoolSku(record.productId)) return record.productId;

  const saleKey = normalizedSaleKey(record.productName);
  const poolItem = items.find(
    (item) => isGoatPoolSku(item.id) && normalizedSaleKey(item.name) === saleKey,
  );
  return poolItem?.id ?? null;
}

function salesBirrForRegistration(
  ledger: StockLedgerEntry[],
  salesRecords: SalesRecord[],
  referenceNo: string,
  items: StockManagedItem[],
  stockSkuByProductId: Map<string, string>,
) {
  const goatEntries = ledger.filter(
    (entry) =>
      (entry.type === "POS_CONSUMPTION" || entry.type === "RECIPE_CONSUMPTION") &&
      isGoatPoolSku(entry.itemId ?? "") &&
      Boolean(entry.batchNumber?.startsWith(referenceNo)),
  );
  const orderRefs = new Set(
    goatEntries.map((entry) => entry.referenceNo).filter((ref): ref is string => Boolean(ref)),
  );
  const consumedLineKeys = new Set(
    goatEntries
      .map((entry) => lineNameFromPosNote(entry.notes))
      .filter((name): name is string => Boolean(name))
      .map((name) => normalizedSaleKey(name)),
  );

  return money(
    salesRecords
      .filter((record) => {
        if (!record.orderId || !orderRefs.has(posOrderReference(record.orderId))) return false;
        if (resolvePoolSkuForSale(record, items, stockSkuByProductId)) return true;
        return consumedLineKeys.has(normalizedSaleKey(record.productName));
      })
      .reduce((sum, record) => sum + record.revenue, 0),
  );
}

function poolConsumptionIndex(
  ledger: StockLedgerEntry[],
  poolSku: string,
) {
  const consumedOrderIds = new Set<string>();
  const consumedLineKeysByOrder = new Map<string, Set<string>>();

  for (const entry of ledger) {
    if (
      !(entry.type === "POS_CONSUMPTION" || entry.type === "RECIPE_CONSUMPTION") ||
      entry.itemId !== poolSku
    ) {
      continue;
    }
    const orderId = posOrderIdFromReference(entry.referenceNo);
    if (!orderId) continue;
    consumedOrderIds.add(orderId);
    const lineName = lineNameFromPosNote(entry.notes);
    if (!lineName) continue;
    const keys = consumedLineKeysByOrder.get(orderId) ?? new Set<string>();
    keys.add(normalizedSaleKey(lineName));
    consumedLineKeysByOrder.set(orderId, keys);
  }

  return { consumedOrderIds, consumedLineKeysByOrder };
}

function saleMatchesPool(
  record: SalesRecord,
  poolSku: string,
  items: StockManagedItem[],
  stockSkuByProductId: Map<string, string>,
  index: ReturnType<typeof poolConsumptionIndex>,
) {
  const mapsToPool = resolvePoolSkuForSale(record, items, stockSkuByProductId) === poolSku;
  const orderId = record.orderId;
  const matchedConsumedLine =
    Boolean(orderId) &&
    index.consumedOrderIds.has(orderId!) &&
    (index.consumedLineKeysByOrder.get(orderId!)?.has(normalizedSaleKey(record.productName)) ?? false);
  return mapsToPool || matchedConsumedLine;
}

function salesForPoolSku(
  ledger: StockLedgerEntry[],
  salesRecords: SalesRecord[],
  poolSku: string,
  items: StockManagedItem[],
  stockSkuByProductId: Map<string, string>,
) {
  const index = poolConsumptionIndex(ledger, poolSku);
  const matched: SalesRecord[] = [];
  const counted = new Set<string>();
  for (const record of salesRecords) {
    if (counted.has(record.id)) continue;
    if (!saleMatchesPool(record, poolSku, items, stockSkuByProductId, index)) continue;
    counted.add(record.id);
    matched.push(record);
  }
  return matched;
}

function salesBirrForPoolSku(
  ledger: StockLedgerEntry[],
  salesRecords: SalesRecord[],
  poolSku: string,
  items: StockManagedItem[],
  stockSkuByProductId: Map<string, string>,
) {
  return money(
    salesForPoolSku(ledger, salesRecords, poolSku, items, stockSkuByProductId).reduce(
      (sum, record) => sum + record.revenue,
      0,
    ),
  );
}

function consumptionCostForPoolSku(ledger: StockLedgerEntry[], poolSku: string) {
  return money(
    ledger
      .filter(
        (entry) =>
          (entry.type === "POS_CONSUMPTION" || entry.type === "RECIPE_CONSUMPTION") &&
          entry.itemId === poolSku &&
          entry.location === GOAT_REGISTRATION_LOCATION,
      )
      .reduce((sum, entry) => sum + entry.totalCost, 0),
  );
}

export function refreshGoatRegistrationStatuses(
  registrations: GoatRegistration[],
  lots: StockLot[],
): GoatRegistration[] {
  return registrations.map((registration) => {
    const row = normalizeGoatRegistration(registration);
    if (row.status === "cancelled") return row;
    const remainingLimb = lotQuantityForRegistration(lots, row.referenceNo, "limb");
    const remainingInside = lotQuantityForRegistration(lots, row.referenceNo, "inside");
    const remainingBone = lotQuantityForRegistration(lots, row.referenceNo, "bone");
    const remaining = qty(remainingLimb + remainingInside + remainingBone);
    const registeredStockKg = qty(row.limbKg + row.insidePartsKg + row.boneKg);
    const nextStatus: GoatRegistrationStatus =
      registeredStockKg > 0 && remaining <= 0 ? "depleted" : "active";
    if (nextStatus === row.status) return row;
    return { ...row, status: nextStatus };
  });
}

export function buildGoatRegistrationReport(input: {
  registrations: GoatRegistration[];
  lots: StockLot[];
  ledger: StockLedgerEntry[];
  salesRecords: SalesRecord[];
  items: StockManagedItem[];
  menuItems?: MenuItem[];
}): GoatRegistrationReport {
  const activeRegs = normalizeGoatRegistrations(input.registrations).filter((row) => row.status !== "cancelled");
  const consumptionTypes = new Set<StockLedgerEntry["type"]>(["POS_CONSUMPTION", "RECIPE_CONSUMPTION"]);
  const stockSkuByProductId = menuStockSkuByProductId(input.menuItems);
  const rows: GoatRegistrationReportRow[] = activeRegs.map((registration) => {
    const remainingLimbKg = lotQuantityForRegistration(input.lots, registration.referenceNo, "limb");
    const remainingInsideKg = lotQuantityForRegistration(input.lots, registration.referenceNo, "inside");
    const remainingBoneKg = lotQuantityForRegistration(input.lots, registration.referenceNo, "bone");
    const limbConsumption = consumptionForRegistration(input.ledger, registration.referenceNo, GOAT_LIMB_SKU);
    const insideConsumption = consumptionForRegistration(input.ledger, registration.referenceNo, GOAT_INSIDE_SKU);
    const boneConsumption = consumptionForRegistration(input.ledger, registration.referenceNo, GOAT_BONE_SKU);
    const soldLimbKg = limbConsumption.quantity;
    const soldInsideKg = insideConsumption.quantity;
    const soldBoneKg = boneConsumption.quantity;
    const consumptionCost = money(limbConsumption.cost + insideConsumption.cost + boneConsumption.cost);
    const salesBirr = salesBirrForRegistration(
      input.ledger,
      input.salesRecords,
      registration.referenceNo,
      input.items,
      stockSkuByProductId,
    );

    return {
      registration,
      registeredLimbKg: registration.limbKg,
      registeredInsideKg: registration.insidePartsKg,
      registeredBoneKg: registration.boneKg,
      registeredWasteKg: registration.wasteKg,
      soldLimbKg,
      soldInsideKg,
      soldBoneKg,
      remainingLimbKg,
      remainingInsideKg,
      remainingBoneKg,
      consumptionCost,
      salesBirr,
    };
  });

  const registeredByPool: Record<string, number> = {
    [GOAT_LIMB_SKU]: qty(activeRegs.reduce((sum, row) => sum + row.limbKg, 0)),
    [GOAT_INSIDE_SKU]: qty(activeRegs.reduce((sum, row) => sum + row.insidePartsKg, 0)),
    [GOAT_BONE_SKU]: qty(activeRegs.reduce((sum, row) => sum + row.boneKg, 0)),
  };

  const poolSummaries: GoatPoolReportSummary[] = GOAT_POOL_SKUS.map((poolSku) => {
    const item = input.items.find((row) => row.id === poolSku);
    const registeredKg = registeredByPool[poolSku] ?? 0;
    const remainingKg = qty(
      input.lots
        .filter((lot) => lot.itemId === poolSku && lot.location === GOAT_REGISTRATION_LOCATION)
        .reduce((sum, lot) => sum + lot.quantity, 0),
    );
    const soldKg = qty(
      input.ledger
        .filter(
          (entry) =>
            consumptionTypes.has(entry.type) &&
            entry.itemId === poolSku &&
            entry.location === GOAT_REGISTRATION_LOCATION,
        )
        .reduce((sum, entry) => sum + entry.quantity, 0),
    );
    const salesBirr = salesBirrForPoolSku(
      input.ledger,
      input.salesRecords,
      poolSku,
      input.items,
      stockSkuByProductId,
    );
    const consumptionCost = consumptionCostForPoolSku(input.ledger, poolSku);
    const avgBirrPerKg = soldKg > 0 ? money(salesBirr / soldKg) : 0;
    const soldPct = registeredKg > 0 ? money((soldKg / registeredKg) * 100) : soldKg > 0 ? 100 : 0;
    return {
      poolSku,
      poolName: item?.name ?? poolSku,
      registeredKg,
      remainingKg,
      soldKg,
      salesBirr,
      consumptionCost,
      avgBirrPerKg,
      soldPct,
    };
  });

  const poolNameBySku = new Map(poolSummaries.map((pool) => [pool.poolSku, pool.poolName]));
  const recentSalesMap = new Map<string, GoatAttributedSaleLine>();
  for (const poolSku of GOAT_POOL_SKUS) {
    for (const record of salesForPoolSku(
      input.ledger,
      input.salesRecords,
      poolSku,
      input.items,
      stockSkuByProductId,
    )) {
      if (recentSalesMap.has(record.id)) continue;
      recentSalesMap.set(record.id, {
        id: record.id,
        date: record.date,
        time: record.time,
        orderNo: record.orderNo,
        productName: record.productName,
        poolSku,
        poolName: poolNameBySku.get(poolSku) ?? poolSku,
        qty: qty(record.qty),
        unitPrice: money(record.unitPrice),
        revenue: money(record.revenue),
      });
    }
  }
  const recentSales = [...recentSalesMap.values()].sort((a, b) => {
    const aKey = `${a.date}T${a.time}`;
    const bKey = `${b.date}T${b.time}`;
    return bKey.localeCompare(aKey);
  });

  const sortedRows = rows.sort((a, b) => b.registration.registeredAt.localeCompare(a.registration.registeredAt));
  const totalSoldLimbKg = qty(sortedRows.reduce((sum, row) => sum + row.soldLimbKg, 0));
  const totalSoldInsideKg = qty(sortedRows.reduce((sum, row) => sum + row.soldInsideKg, 0));
  const totalSoldBoneKg = qty(sortedRows.reduce((sum, row) => sum + row.soldBoneKg, 0));
  const totalRemainingLimbKg = qty(sortedRows.reduce((sum, row) => sum + row.remainingLimbKg, 0));
  const totalRemainingInsideKg = qty(sortedRows.reduce((sum, row) => sum + row.remainingInsideKg, 0));
  const totalRemainingBoneKg = qty(sortedRows.reduce((sum, row) => sum + row.remainingBoneKg, 0));
  const totalSalesBirr = money(poolSummaries.reduce((sum, pool) => sum + pool.salesBirr, 0));
  const totalConsumptionCost = money(poolSummaries.reduce((sum, pool) => sum + pool.consumptionCost, 0));
  const totalPurchasePrice = money(activeRegs.reduce((sum, row) => sum + row.purchasePrice, 0));

  return {
    rows: sortedRows,
    poolSummaries,
    recentSales,
    totalRegisteredGoats: activeRegs.length,
    activeGoats: activeRegs.filter((row) => row.status === "active").length,
    depletedGoats: activeRegs.filter((row) => row.status === "depleted").length,
    totalRegisteredLimbKg: registeredByPool[GOAT_LIMB_SKU] ?? 0,
    totalRegisteredInsideKg: registeredByPool[GOAT_INSIDE_SKU] ?? 0,
    totalRegisteredBoneKg: registeredByPool[GOAT_BONE_SKU] ?? 0,
    totalRemainingLimbKg,
    totalRemainingInsideKg,
    totalRemainingBoneKg,
    totalRemainingKg: qty(totalRemainingLimbKg + totalRemainingInsideKg + totalRemainingBoneKg),
    totalSoldLimbKg,
    totalSoldInsideKg,
    totalSoldBoneKg,
    totalSoldKg: qty(totalSoldLimbKg + totalSoldInsideKg + totalSoldBoneKg),
    totalWasteKg: qty(activeRegs.reduce((sum, row) => sum + row.wasteKg, 0)),
    totalPurchasePrice,
    totalConsumptionCost,
    totalSalesBirr,
    totalGrossMargin: money(totalSalesBirr - totalConsumptionCost),
  };
}

export { GOAT_BONE_SKU, GOAT_LIMB_SKU, GOAT_INSIDE_SKU, GOAT_MENU_IDS, GOAT_POOL_SKUS, isGoatPoolSku };
