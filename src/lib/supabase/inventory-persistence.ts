import { isSupabaseConfigured, supabase } from "./client.ts";
import type { GoatRegistration } from "../goat-butcher.ts";
import type {
  CancellationReversalVoucherDocument,
  GoodsReceivingVoucherDocument,
  InventorySettingsRecord,
  LocationStockPolicy,
  PurchaseOrderDocument,
  PurchaseRequisitionDocument,
  StockLedgerEntry,
  StockLot,
  StockManagedItem,
  StockAdjustmentVoucherDocument,
  StockCountSession,
  StoreIssueVoucherDocument,
  StoreTransferVoucherDocument,
  GoodsReturnVoucherDocument,
} from "../stock-management";

type InventoryItemRow = {
  id: string;
  name: string;
  category: string;
  base_unit: string;
  purchase_price: number | string | null;
  selling_price: number | string | null;
  vip_selling_price?: number | string | null;
  standard_cost?: number | string | null;
  reorder_level: number | string | null;
  preferred_location: string;
  supplier_name?: string | null;
  conversions?: unknown;
  track_batch_expiry?: boolean | null;
  notes?: string | null;
  opening_stock?: number | string | null;
  created_at?: string | null;
  updated_at?: string | null;
};

type InventorySettingsRow = {
  id: string;
  costing_method: string;
  allow_negative_stock: boolean;
  pos_reservation_trigger?: string | null;
  pos_deduction_timing?: string | null;
  pos_out_of_stock_behavior?: string | null;
  updated_by: string;
  updated_at: string;
};

type InventoryLocationPolicyRow = {
  id: string;
  item_id: string;
  item_name: string;
  location: string;
  minimum_stock: number | string | null;
  maximum_stock: number | string | null;
  reorder_level: number | string | null;
  reorder_quantity: number | string | null;
  safety_stock: number | string | null;
  preferred_source_store?: string | null;
  preferred_supplier?: string | null;
  updated_at: string;
};

type InventoryLotRow = {
  id: string;
  item_id: string;
  item_name: string;
  location: string;
  batch_number: string;
  manufacturing_date?: string | null;
  expiry_date?: string | null;
  quantity: number | string;
  unit: string;
  unit_cost: number | string;
  status: string;
  received_at: string;
  reference_no?: string | null;
};

type InventoryLedgerRow = {
  id: string;
  entry_type: string;
  entry_date: string;
  item_id?: string | null;
  item_name: string;
  category?: string | null;
  location: string;
  from_location?: string | null;
  to_location?: string | null;
  quantity: number | string;
  unit: string;
  unit_price?: number | string | null;
  total_cost: number | string;
  quantity_in?: number | string | null;
  quantity_out?: number | string | null;
  supplier_name?: string | null;
  approved_by?: string | null;
  received_by?: string | null;
  entered_by: string;
  reason?: string | null;
  notes?: string | null;
  reference_no?: string | null;
  batch_number?: string | null;
  expiry_date?: string | null;
  lot_status?: string | null;
  transaction_at?: string | null;
  immutable?: boolean | null;
};

type InventoryDocumentRow = {
  id: string;
  document_type: string;
  payload: unknown;
};

type GoatRegistrationRow = {
  id: string;
  document_no: string;
  registered_at: string;
  registered_by: string;
  goat_type: string;
  purchase_price: number | string | null;
  supplier_name?: string | null;
  front_leg_kg: number | string | null;
  back_leg_kg: number | string | null;
  inside_parts_kg: number | string | null;
  bone_kg?: number | string | null;
  waste_kg?: number | string | null;
  limb_kg: number | string | null;
  location: string;
  status: string;
  reference_no: string;
  notes?: string | null;
  active?: boolean | null;
  created_at?: string | null;
  updated_at?: string | null;
};

function numberFrom(value: number | string | null | undefined, fallback = 0) {
  if (typeof value === "number") return Number.isFinite(value) ? value : fallback;
  if (typeof value === "string") {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : fallback;
  }
  return fallback;
}

function arrayFrom<T>(value: unknown): T[] {
  return Array.isArray(value) ? (value as T[]) : [];
}

function textFrom(value: unknown, fallback = "") {
  return typeof value === "string" ? value : fallback;
}

function itemFromRow(row: InventoryItemRow): StockManagedItem {
  return {
    id: row.id,
    name: row.name,
    category: row.category as StockManagedItem["category"],
    baseUnit: row.base_unit as StockManagedItem["baseUnit"],
    purchasePrice: numberFrom(row.purchase_price),
    sellingPrice: numberFrom(row.selling_price),
    vipSellingPrice: row.vip_selling_price == null ? undefined : numberFrom(row.vip_selling_price),
    standardCost: row.standard_cost == null ? undefined : numberFrom(row.standard_cost),
    reorderLevel: numberFrom(row.reorder_level),
    currentStock: numberFrom(row.opening_stock),
    preferredLocation: row.preferred_location as StockManagedItem["preferredLocation"],
    supplierName: row.supplier_name ?? undefined,
    conversions: arrayFrom(row.conversions) as StockManagedItem["conversions"],
    trackBatchExpiry: Boolean(row.track_batch_expiry),
    notes: row.notes ?? undefined,
    createdAt: row.created_at ?? row.updated_at ?? new Date().toISOString(),
    updatedAt: row.updated_at ?? row.created_at ?? new Date().toISOString(),
  };
}

function settingsFromRow(row: InventorySettingsRow): InventorySettingsRecord {
  return {
    id: row.id,
    costingMethod: row.costing_method as InventorySettingsRecord["costingMethod"],
    allowNegativeStock: Boolean(row.allow_negative_stock),
    posReservationTrigger: (row.pos_reservation_trigger ?? "station_accept") as InventorySettingsRecord["posReservationTrigger"],
    posDeductionTiming: (row.pos_deduction_timing ?? "item_ready") as InventorySettingsRecord["posDeductionTiming"],
    posOutOfStockBehavior: (row.pos_out_of_stock_behavior ?? "block") as InventorySettingsRecord["posOutOfStockBehavior"],
    updatedBy: row.updated_by,
    updatedAt: row.updated_at,
  };
}

function policyFromRow(row: InventoryLocationPolicyRow): LocationStockPolicy {
  return {
    id: row.id,
    itemId: row.item_id,
    itemName: row.item_name,
    location: row.location as LocationStockPolicy["location"],
    minimumStock: numberFrom(row.minimum_stock),
    maximumStock: numberFrom(row.maximum_stock),
    reorderLevel: numberFrom(row.reorder_level),
    reorderQuantity: numberFrom(row.reorder_quantity),
    safetyStock: numberFrom(row.safety_stock),
    preferredSourceStore: row.preferred_source_store as LocationStockPolicy["preferredSourceStore"],
    preferredSupplier: row.preferred_supplier ?? undefined,
    updatedAt: row.updated_at,
  };
}

function lotFromRow(row: InventoryLotRow): StockLot {
  return {
    id: row.id,
    itemId: row.item_id,
    itemName: row.item_name,
    location: row.location as StockLot["location"],
    batchNumber: row.batch_number,
    manufacturingDate: row.manufacturing_date ?? undefined,
    expiryDate: row.expiry_date ?? undefined,
    quantity: numberFrom(row.quantity),
    unit: row.unit as StockLot["unit"],
    unitCost: numberFrom(row.unit_cost),
    status: row.status as StockLot["status"],
    receivedAt: row.received_at,
    referenceNo: row.reference_no ?? undefined,
  };
}

function ledgerFromRow(row: InventoryLedgerRow): StockLedgerEntry {
  return {
    id: row.id,
    type: row.entry_type as StockLedgerEntry["type"],
    date: row.entry_date,
    itemId: row.item_id ?? undefined,
    itemName: row.item_name,
    category: (row.category ?? undefined) as StockLedgerEntry["category"],
    location: row.location as StockLedgerEntry["location"],
    fromLocation: (row.from_location ?? undefined) as StockLedgerEntry["fromLocation"],
    toLocation: (row.to_location ?? undefined) as StockLedgerEntry["toLocation"],
    quantity: numberFrom(row.quantity),
    unit: row.unit as StockLedgerEntry["unit"],
    unitPrice: row.unit_price == null ? undefined : numberFrom(row.unit_price),
    totalCost: numberFrom(row.total_cost),
    quantityIn: row.quantity_in == null ? undefined : numberFrom(row.quantity_in),
    quantityOut: row.quantity_out == null ? undefined : numberFrom(row.quantity_out),
    supplierName: row.supplier_name ?? undefined,
    approvedBy: row.approved_by ?? undefined,
    receivedBy: row.received_by ?? undefined,
    enteredBy: row.entered_by,
    reason: row.reason ?? undefined,
    notes: row.notes ?? undefined,
    referenceNo: row.reference_no ?? undefined,
    batchNumber: row.batch_number ?? undefined,
    expiryDate: row.expiry_date ?? undefined,
    lotStatus: row.lot_status as StockLedgerEntry["lotStatus"],
    transactionAt: row.transaction_at ?? undefined,
    immutable: row.immutable !== false,
  };
}

function payloadFromRow<T extends { id: string }>(row: InventoryDocumentRow): T | null {
  if (!row.payload || typeof row.payload !== "object") return null;
  const payload = row.payload as T;
  return { ...payload, id: payload.id ?? row.id };
}

function goatRegistrationFromRow(row: GoatRegistrationRow): GoatRegistration {
  return {
    id: row.id,
    documentNo: row.document_no,
    registeredAt: row.registered_at,
    registeredBy: row.registered_by,
    goatType: row.goat_type,
    purchasePrice: numberFrom(row.purchase_price),
    supplierName: row.supplier_name ?? undefined,
    frontLegKg: numberFrom(row.front_leg_kg),
    backLegKg: numberFrom(row.back_leg_kg),
    insidePartsKg: numberFrom(row.inside_parts_kg),
    boneKg: numberFrom(row.bone_kg),
    wasteKg: numberFrom(row.waste_kg),
    limbKg: numberFrom(row.limb_kg),
    location: row.location as GoatRegistration["location"],
    status: row.status as GoatRegistration["status"],
    referenceNo: row.reference_no,
    notes: row.notes ?? undefined,
  };
}

function goatRegistrationToRow(registration: GoatRegistration) {
  return {
    id: registration.id,
    document_no: registration.documentNo,
    registered_at: registration.registeredAt,
    registered_by: registration.registeredBy,
    goat_type: registration.goatType,
    purchase_price: registration.purchasePrice,
    supplier_name: registration.supplierName ?? null,
    front_leg_kg: registration.frontLegKg,
    back_leg_kg: registration.backLegKg,
    inside_parts_kg: registration.insidePartsKg,
    bone_kg: registration.boneKg ?? 0,
    waste_kg: registration.wasteKg ?? 0,
    limb_kg: registration.limbKg,
    location: registration.location,
    status: registration.status,
    reference_no: registration.referenceNo,
    notes: registration.notes ?? null,
    active: registration.status !== "cancelled",
    created_at: registration.registeredAt,
    updated_at: new Date().toISOString(),
  };
}

export async function loadNormalizedInventorySnapshot() {
  if (!supabase) return null;

  const [items, settings, policies, lots, ledger, documents, goatRegistrations] = await Promise.all([
    supabase.from("inventory_items").select("*").eq("active", true).order("name"),
    supabase.from("inventory_settings").select("*").limit(1).maybeSingle(),
    supabase.from("inventory_location_policies").select("*").order("item_name").order("location"),
    supabase.from("inventory_lots").select("*").eq("active", true).order("received_at", { ascending: false }),
    supabase.from("inventory_ledger").select("*").order("entry_date", { ascending: false }).order("transaction_at", { ascending: false }).limit(1000),
    supabase.from("inventory_documents").select("id,document_type,payload").eq("active", true).order("created_at", { ascending: false }),
    supabase.from("goat_registrations").select("*").eq("active", true).order("registered_at", { ascending: false }),
  ]);

  if (items.error) throw items.error;
  if (settings.error) throw settings.error;
  if (policies.error) throw policies.error;
  if (lots.error) throw lots.error;
  if (ledger.error) throw ledger.error;
  if (documents.error) throw documents.error;
  if (goatRegistrations.error) throw goatRegistrations.error;

  return {
    items: ((items.data ?? []) as InventoryItemRow[]).map(itemFromRow),
    settings: settings.data ? settingsFromRow(settings.data as InventorySettingsRow) : null,
    locationPolicies: ((policies.data ?? []) as InventoryLocationPolicyRow[]).map(policyFromRow),
    lots: ((lots.data ?? []) as InventoryLotRow[]).map(lotFromRow),
    ledger: ((ledger.data ?? []) as InventoryLedgerRow[]).map(ledgerFromRow),
    purchaseRequisitions: ((documents.data ?? []) as InventoryDocumentRow[])
      .filter((row) => row.document_type === "Purchase Requisition")
      .flatMap((row) => payloadFromRow<PurchaseRequisitionDocument>(row) ?? []),
    purchaseOrders: ((documents.data ?? []) as InventoryDocumentRow[])
      .filter((row) => row.document_type === "Purchase Order")
      .flatMap((row) => payloadFromRow<PurchaseOrderDocument>(row) ?? []),
    goodsReceivingVouchers: ((documents.data ?? []) as InventoryDocumentRow[])
      .filter((row) => row.document_type === "Goods Receiving Voucher")
      .flatMap((row) => payloadFromRow<GoodsReceivingVoucherDocument>(row) ?? []),
    storeIssueVouchers: ((documents.data ?? []) as InventoryDocumentRow[])
      .filter((row) => row.document_type === "Store Issue Voucher")
      .flatMap((row) => payloadFromRow<StoreIssueVoucherDocument>(row) ?? []),
    storeTransferVouchers: ((documents.data ?? []) as InventoryDocumentRow[])
      .filter((row) => row.document_type === "Store Transfer Voucher")
      .flatMap((row) => payloadFromRow<StoreTransferVoucherDocument>(row) ?? []),
    goodsReturnVouchers: ((documents.data ?? []) as InventoryDocumentRow[])
      .filter((row) => row.document_type === "Goods Return Voucher")
      .flatMap((row) => payloadFromRow<GoodsReturnVoucherDocument>(row) ?? []),
    stockAdjustmentVouchers: ((documents.data ?? []) as InventoryDocumentRow[])
      .filter((row) => ["Stock Adjustment Voucher", "Wastage Voucher", "Damage Voucher", "Stock Count Adjustment"].includes(row.document_type))
      .flatMap((row) => payloadFromRow<StockAdjustmentVoucherDocument>(row) ?? []),
    cancellationReversals: ((documents.data ?? []) as InventoryDocumentRow[])
      .filter((row) => row.document_type === "Cancellation Reversal Voucher")
      .flatMap((row) => payloadFromRow<CancellationReversalVoucherDocument>(row) ?? []),
    counts: ((documents.data ?? []) as InventoryDocumentRow[])
      .filter((row) => row.document_type === "Physical Stock Count")
      .flatMap((row) => payloadFromRow<StockCountSession>(row) ?? []),
    dailyConsumptions: ((documents.data ?? []) as InventoryDocumentRow[])
      .filter((row) => row.document_type === "Daily Consumption Voucher")
      .flatMap((row) => payloadFromRow<import("../daily-consumption.ts").DailyConsumptionDocument>(row) ?? []),
    goatRegistrations: ((goatRegistrations.data ?? []) as GoatRegistrationRow[]).map(goatRegistrationFromRow),
  };
}

function logInventorySyncError(scope: string, error: unknown) {
  console.error(`Inventory normalized sync failed (${scope})`, error);
}

export function isNormalizedInventoryAvailable() {
  return Boolean(isSupabaseConfigured && supabase);
}

/** Primary UI source remains module_records; inventory_* dual-write is best-effort when Supabase is configured. */
export function getInventoryPersistenceMode(): "module_records_only" | "module_records_with_normalized_dual_write" {
  return isNormalizedInventoryAvailable()
    ? "module_records_with_normalized_dual_write"
    : "module_records_only";
}

export async function upsertInventoryItem(item: StockManagedItem) {
  if (!supabase) return;
  const { error } = await supabase.from("inventory_items").upsert({
    id: item.id,
    name: item.name,
    category: item.category,
    base_unit: item.baseUnit,
    purchase_price: item.purchasePrice,
    selling_price: item.sellingPrice,
    vip_selling_price: item.vipSellingPrice ?? null,
    standard_cost: item.standardCost ?? null,
    reorder_level: item.reorderLevel,
    preferred_location: item.preferredLocation,
    supplier_name: item.supplierName ?? null,
    conversions: item.conversions ?? [],
    track_batch_expiry: Boolean(item.trackBatchExpiry),
    notes: item.notes ?? null,
    opening_stock: item.currentStock,
    active: true,
    updated_at: new Date().toISOString(),
  }, { onConflict: "id" });
  if (error) throw error;
}

export async function upsertInventorySettings(settings: InventorySettingsRecord) {
  if (!supabase) return;
  const { error } = await supabase.from("inventory_settings").upsert({
    id: settings.id || "inventory-settings",
    costing_method: settings.costingMethod,
    allow_negative_stock: settings.allowNegativeStock,
    pos_reservation_trigger: settings.posReservationTrigger,
    pos_deduction_timing: settings.posDeductionTiming,
    pos_out_of_stock_behavior: settings.posOutOfStockBehavior,
    updated_by: settings.updatedBy,
    updated_at: settings.updatedAt,
  }, { onConflict: "id" });
  if (error) throw error;
}

export async function upsertInventoryLocationPolicy(policy: LocationStockPolicy) {
  if (!supabase) return;
  const { error } = await supabase.from("inventory_location_policies").upsert({
    id: policy.id,
    item_id: policy.itemId,
    item_name: policy.itemName,
    location: policy.location,
    minimum_stock: policy.minimumStock,
    maximum_stock: policy.maximumStock,
    reorder_level: policy.reorderLevel,
    reorder_quantity: policy.reorderQuantity,
    safety_stock: policy.safetyStock,
    preferred_source_store: policy.preferredSourceStore ?? null,
    preferred_supplier: policy.preferredSupplier ?? null,
    updated_at: policy.updatedAt,
  }, { onConflict: "id" });
  if (error) throw error;
}

export async function replaceInventoryLots(lots: StockLot[]) {
  if (!supabase) return;
  const timestamp = new Date().toISOString();
  const deactivate = await supabase
    .from("inventory_lots")
    .update({ active: false, updated_at: timestamp })
    .eq("active", true)
    .neq("id", "");
  if (deactivate.error) throw deactivate.error;
  if (lots.length === 0) return;
  const rows = lots.map((lot) => ({
    id: lot.id,
    item_id: lot.itemId,
    item_name: lot.itemName,
    location: lot.location,
    batch_number: lot.batchNumber,
    manufacturing_date: lot.manufacturingDate ?? null,
    expiry_date: lot.expiryDate ?? null,
    quantity: lot.quantity,
    unit: lot.unit,
    unit_cost: lot.unitCost,
    status: lot.status,
    received_at: lot.receivedAt,
    reference_no: lot.referenceNo ?? null,
    active: true,
    updated_at: timestamp,
  }));
  const { error } = await supabase.from("inventory_lots").upsert(rows, { onConflict: "id" });
  if (error) throw error;
}

/** Append-only: inserts missing ledger rows; never updates existing immutable rows. */
export async function appendInventoryLedgerEntries(entries: StockLedgerEntry[]) {
  if (!supabase || entries.length === 0) return;
  const ids = entries.map((entry) => entry.id);
  const existing = await supabase.from("inventory_ledger").select("id").in("id", ids);
  if (existing.error) throw existing.error;
  const existingIds = new Set((existing.data ?? []).map((row) => row.id as string));
  const toInsert = entries.filter((entry) => !existingIds.has(entry.id));
  if (toInsert.length === 0) return;
  const rows = toInsert.map((entry) => ({
    id: entry.id,
    entry_type: entry.type,
    entry_date: entry.date,
    item_id: entry.itemId ?? null,
    item_name: entry.itemName,
    category: entry.category ?? null,
    location: String(entry.location),
    from_location: entry.fromLocation ?? null,
    to_location: entry.toLocation ?? null,
    quantity: entry.quantity,
    unit: entry.unit,
    unit_price: entry.unitPrice ?? null,
    total_cost: entry.totalCost,
    quantity_in: entry.quantityIn ?? 0,
    quantity_out: entry.quantityOut ?? 0,
    supplier_name: entry.supplierName ?? null,
    approved_by: entry.approvedBy ?? null,
    received_by: entry.receivedBy ?? null,
    entered_by: entry.enteredBy,
    reason: entry.reason ?? null,
    notes: entry.notes ?? null,
    reference_no: entry.referenceNo ?? null,
    batch_number: entry.batchNumber ?? null,
    expiry_date: entry.expiryDate ?? null,
    lot_status: entry.lotStatus ?? null,
    transaction_at: entry.transactionAt ?? new Date().toISOString(),
    immutable: entry.immutable !== false,
  }));
  const { error } = await supabase.from("inventory_ledger").insert(rows);
  if (error) {
    // Concurrent double-sync can race past the pre-check; ignore duplicate primary keys.
    if (error.code === "23505") return;
    throw error;
  }
}

export async function upsertInventoryDocument(input: {
  id: string;
  documentType: string;
  documentNumber: string;
  status: string;
  createdBy: string;
  createdAt?: string;
  location?: string;
  sourceLocation?: string;
  destinationLocation?: string;
  postedAt?: string;
  payload: unknown;
  approvalHistory?: unknown;
}) {
  if (!supabase) return;
  const row = {
    id: input.id,
    document_type: input.documentType,
    document_number: input.documentNumber,
    status: input.status,
    location: input.location ?? null,
    source_location: input.sourceLocation ?? null,
    destination_location: input.destinationLocation ?? null,
    created_by: input.createdBy,
    created_at: input.createdAt ?? new Date().toISOString(),
    updated_at: new Date().toISOString(),
    posted_at: input.postedAt ?? null,
    payload: input.payload ?? {},
    approval_history: input.approvalHistory ?? [],
    active: true,
  };
  const { error } = await supabase.from("inventory_documents").upsert(row, { onConflict: "id" });
  if (!error) return;
  // Unique (document_type, document_number) can collide when older clients reused sequence 1.
  if (error.code === "23505") {
    const { error: updateError } = await supabase
      .from("inventory_documents")
      .update({
        status: row.status,
        location: row.location,
        source_location: row.source_location,
        destination_location: row.destination_location,
        updated_at: row.updated_at,
        posted_at: row.posted_at,
        payload: row.payload,
        approval_history: row.approval_history,
        active: true,
      })
      .eq("document_type", input.documentType)
      .eq("document_number", input.documentNumber);
    if (updateError) throw updateError;
    return;
  }
  throw error;
}

export function syncInventoryItem(item: StockManagedItem) {
  if (!isNormalizedInventoryAvailable()) return;
  void upsertInventoryItem(item).catch((error) => logInventorySyncError("item", error));
}

export function syncInventoryItemDeletion(itemId: string) {
  if (!isNormalizedInventoryAvailable()) return;
  void deactivateInventoryItem(itemId).catch((error) => logInventorySyncError("item-delete", error));
}

export async function deactivateInventoryItem(itemId: string) {
  if (!supabase) return;
  const timestamp = new Date().toISOString();
  const { error } = await supabase
    .from("inventory_items")
    .update({ active: false, updated_at: timestamp })
    .eq("id", itemId);
  if (error) throw error;
}

export function syncInventorySettings(settings: InventorySettingsRecord) {
  if (!isNormalizedInventoryAvailable()) return;
  void upsertInventorySettings(settings).catch((error) => logInventorySyncError("settings", error));
}

export function syncInventoryLocationPolicy(policy: LocationStockPolicy) {
  if (!isNormalizedInventoryAvailable()) return;
  void upsertInventoryLocationPolicy(policy).catch((error) => logInventorySyncError("policy", error));
}

export function syncInventoryLots(lots: StockLot[]) {
  if (!isNormalizedInventoryAvailable()) return;
  void replaceInventoryLots(lots).catch((error) => logInventorySyncError("lots", error));
}

export function syncInventoryLedgerAppend(entries: StockLedgerEntry[]) {
  if (!isNormalizedInventoryAvailable()) return;
  void appendInventoryLedgerEntries(entries).catch((error) => logInventorySyncError("ledger", error));
}

export async function upsertGoatRegistration(registration: GoatRegistration) {
  if (!supabase) return;
  const { error } = await supabase
    .from("goat_registrations")
    .upsert(goatRegistrationToRow(registration), { onConflict: "id" });
  if (error) throw error;
}

export async function upsertGoatRegistrations(registrations: GoatRegistration[]) {
  if (!supabase || registrations.length === 0) return;
  const rows = registrations.map((registration) => goatRegistrationToRow(registration));
  const { error } = await supabase.from("goat_registrations").upsert(rows, { onConflict: "id" });
  if (error) throw error;
}

export async function deactivateGoatRegistrations(ids: string[]) {
  if (!supabase || ids.length === 0) return;
  const { error } = await supabase
    .from("goat_registrations")
    .update({ active: false, status: "cancelled", updated_at: new Date().toISOString() })
    .in("id", ids);
  if (error) throw error;
}

export function syncGoatRegistration(registration: GoatRegistration) {
  if (!isNormalizedInventoryAvailable()) return;
  void upsertGoatRegistration(registration).catch((error) => logInventorySyncError("goat-registration", error));
}

export function syncGoatRegistrations(registrations: GoatRegistration[]) {
  if (!isNormalizedInventoryAvailable()) return;
  void upsertGoatRegistrations(registrations).catch((error) => logInventorySyncError("goat-registrations", error));
}

export function syncGoatRegistrationRemovals(ids: string[]) {
  if (!isNormalizedInventoryAvailable()) return;
  void deactivateGoatRegistrations(ids).catch((error) => logInventorySyncError("goat-registrations-remove", error));
}

export function syncInventoryDocument(input: Parameters<typeof upsertInventoryDocument>[0]) {
  if (!isNormalizedInventoryAvailable()) return;
  void upsertInventoryDocument(input).catch((error) => logInventorySyncError("document", error));
}
