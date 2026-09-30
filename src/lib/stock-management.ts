import { startTransition, useCallback, useContext, useEffect, useMemo, createContext, createElement, type ReactNode } from "react";

import type { SalesRecord } from "./demo-data";
import type { GoatRegistration } from "./goat-butcher.ts";
import type { DailyConsumptionDocument } from "./daily-consumption.ts";
import {
  buildStaffConsumptionDashboardSummary,
  type StaffConsumptionDocument,
  type StaffConsumptionDashboardSummary,
} from "./staff-consumption.ts";
import type { StaffBreakageDocument } from "./staff-breakage.ts";
import { getModuleRecordsSnapshot, hasPersistedModuleRecords, replaceModuleRecords, useModuleRecords } from "./module-records.ts";
import { computeDashboardTodaySalesRevenue, dateKey, dateKeyFromDateTime } from "./sales-analytics.ts";
import { isNormalizedInventoryAvailable, loadNormalizedInventorySnapshot } from "./supabase/inventory-persistence.ts";
import { isSupabaseConfigured } from "./supabase/client.ts";

export const STOCK_ITEM_CATEGORIES = [
  "Bar",
  "Whisky",
  "Beer",
  "Soft Drink",
  "Weyn",
  "Water",
  "Kitchen",
  "Meat",
  "Coffee House",
  "General Expense",
] as const;

export const STOCK_UNIT_TYPES = [
  "bottle",
  "double shot",
  "single shot",
  "case",
  "crate",
  "kg",
  "gram",
  "pcs",
  "piece",
  "liter",
  "millilitre",
  "carton",
] as const;

/** Default doubles per bottle when a spirit item has no pour conversion. */
export const DEFAULT_DOUBLES_PER_BOTTLE = 16;

export const INVENTORY_COSTING_METHODS = ["Weighted Average", "FIFO", "Standard Cost"] as const;
export const STOCK_LOT_STATUSES = ["Available", "Quarantine", "Expired", "Blocked", "Recalled"] as const;
export const POS_RESERVATION_TRIGGERS = ["order_submit", "station_accept", "prep_start"] as const;
export const POS_DEDUCTION_TIMINGS = [
  "order_submit",
  "station_accept",
  "prep_start",
  "item_ready",
  "item_served",
  "payment_completed",
  "order_closed",
] as const;
export const POS_OOS_BEHAVIORS = ["block", "warn_manager", "allow_negative_authorized", "auto_unavailable"] as const;
export const POS_STOCK_DEDUCTION_RULES = ["direct", "recipe"] as const;
export const POS_RESERVATION_STATUSES = ["Reserved", "Consumed", "Released"] as const;
export const POS_AVAILABILITY_STATUSES = [
  "In Stock",
  "Low",
  "Out",
  "Insufficient Ingredients",
  "Temporarily Blocked",
] as const;
export const POS_CANCEL_REASONS = [
  "Customer changed order",
  "Wrong item entered",
  "Item unavailable",
  "Duplicate order",
  "Preparation error",
  "Customer left",
  "Other",
] as const;
export const POS_VOID_STOCK_OUTCOMES = ["release_only", "wastage", "reversal"] as const;

export const STOCK_LOCATIONS = [
  "Store 1",
  "Store 2",
  "Main Bar",
  "VIP Bar",
  "Kitchen",
  "Butcher",
  "Coffee House",
] as const;

export const CENTRAL_STOCK_LOCATIONS = ["Store 1", "Store 2"] as const;
export const OPERATIONAL_STOCK_LOCATIONS = ["Main Bar", "VIP Bar", "Kitchen", "Butcher", "Coffee House"] as const;

export const STOCK_ADJUSTMENT_REASONS = [
  "Broken",
  "Expired",
  "Staff consumption",
  "Complimentary",
  "Returned",
  "Count correction",
  "Lost/missing",
] as const;

export const STOCK_LOSS_TYPES = [
  "Wastage",
  "Damage",
  "Expiry",
  "Spoilage",
  "Breakage",
  "Theft",
  "Preparation loss",
  "Counting difference",
  "Other",
] as const;

export const STOCK_TRANSFER_STATUSES = [
  "Draft",
  "Pending Approval",
  "Approved",
  "Partially Approved",
  "Rejected",
  "Prepared",
  "Dispatched",
  "Partially Received",
  "Received",
  "Cancelled",
] as const;

export const STOCK_REQUEST_STATUSES = [
  "Draft",
  "Submitted",
  "Under Review",
  "Approved",
  "Partially Approved",
  "Rejected",
  "Converted to Issue Voucher",
  "Prepared",
  "Dispatched",
  "Partially Received",
  "Received",
  "Cancelled",
] as const;

export const STOCK_COUNT_STATUSES = ["Draft", "In Progress", "Submitted", "Reviewed", "Approved", "Rejected", "Posted"] as const;

export const STOCK_REQUEST_PRIORITIES = ["Normal", "High", "Urgent"] as const;

export const INVENTORY_DOCUMENT_TYPES = [
  "Purchase Requisition",
  "Purchase Order",
  "Goods Receiving Voucher",
  "Store Issue Voucher",
  "Store Transfer Voucher",
  "Department Stock Request",
  "Goods Return Voucher",
  "Stock Adjustment Voucher",
  "Wastage Voucher",
  "Damage Voucher",
  "Physical Stock Count",
  "Stock Count Adjustment",
  "Stock Ledger Entry",
  "Cancellation Reversal Voucher",
  "Daily Consumption Voucher",
  "Staff Consumption Voucher",
  "Staff Breakage Voucher",
] as const;

export const PURCHASE_REQUISITION_STATUSES = [
  "Draft",
  "Submitted",
  "Under Review",
  "Approved",
  "Partially Approved",
  "Rejected",
  "Converted to Purchase Order",
  "Cancelled",
] as const;

export const PURCHASE_ORDER_STATUSES = [
  "Draft",
  "Submitted",
  "Approved",
  "Partially Received",
  "Received",
  "Cancelled",
] as const;

export const GOODS_RECEIVING_STATUSES = ["Draft", "Confirmed", "Cancelled"] as const;

export const GOODS_RETURN_STATUSES = [
  "Draft",
  "Submitted",
  "Approved",
  "Dispatched",
  "Received",
  "Rejected",
  "Cancelled",
] as const;

export const STOCK_ADJUSTMENT_VOUCHER_STATUSES = [
  "Draft",
  "Submitted",
  "Approved",
  "Posted",
  "Rejected",
  "Cancelled",
] as const;

export const STOCK_RETURN_REASONS = [
  "Excess stock",
  "Wrong item",
  "Event completed",
  "Near expiry",
  "Damaged packaging",
  "Department closure",
  "Other",
] as const;

export const STOCK_EXPENSE_DEPARTMENTS = [
  "Kitchen",
  "Bar",
  "VIP",
  "General Service / Tekilala Agelglot",
  "Butcher / Siga Bet",
] as const;

export type StockItemCategory = (typeof STOCK_ITEM_CATEGORIES)[number];

export type BeerTier = "special" | "normal" | "draft";

export const SPECIAL_BEER_ITEM_IDS = [
  "stk-beer-heineken",
  "stk-beer-bedele",
  "stk-beer-arada",
] as const;

export const DRAFT_BEER_ITEM_IDS = ["stk-draft-beer", "draft-beer"] as const;

export const WEYN_ITEM_IDS = [
  "stk-acacia",
  "stk-awash",
  "stk-axumit",
  "stk-gebeta-water",
  "stk-guder",
  "stk-kemila",
  "stk-refi-valley",
  "acacia",
  "awash",
  "axumit",
  "gebeta-water",
  "guder",
  "kemila",
  "refi-valley",
] as const;

/** Main Bar special beers: Heineken, Bedele, and Arada (incl. common spelling variants). */
export function isSpecialBeerItem(item: Pick<StockManagedItem, "id" | "name" | "category">): boolean {
  if (item.category !== "Beer") return false;
  if ((SPECIAL_BEER_ITEM_IDS as readonly string[]).includes(item.id)) return true;
  const name = item.name.toLowerCase();
  return /heineken|bedele|bedelle|bedelli|arada/.test(name);
}

/** Draft beer stock (name/id), kept separate from bottled normal beer on Main Bar. */
export function isDraftBeerItem(item: Pick<StockManagedItem, "id" | "name" | "category">): boolean {
  if (item.category !== "Beer") return false;
  if ((DRAFT_BEER_ITEM_IDS as readonly string[]).includes(item.id)) return true;
  return /\bdraft\b/i.test(item.name);
}

/** Ethiopian wine / Weyn (Wayne) stock — own Main Bar category. */
export function isWeynItem(item: Pick<StockManagedItem, "id" | "name" | "category">): boolean {
  if (item.category === "Weyn") return true;
  if ((WEYN_ITEM_IDS as readonly string[]).includes(item.id)) return true;
  return /\b(wayne|weyn|wayn)\b/i.test(item.name);
}

/** Classifies beer tier for Main Bar grouping. Special beers always win over a stored tier. */
export function inferBeerTier(item: Pick<StockManagedItem, "id" | "name" | "category" | "beerTier">): BeerTier | undefined {
  if (item.category !== "Beer") return undefined;
  if (isSpecialBeerItem(item)) return "special";
  if (isDraftBeerItem(item)) return "draft";
  if (item.beerTier === "special" || item.beerTier === "normal" || item.beerTier === "draft") return item.beerTier;
  return "normal";
}
export type StockUnitType = (typeof STOCK_UNIT_TYPES)[number];
export type StockLocation = (typeof STOCK_LOCATIONS)[number];
export type CentralStockLocation = (typeof CENTRAL_STOCK_LOCATIONS)[number];
export type OperationalStockLocation = (typeof OPERATIONAL_STOCK_LOCATIONS)[number];
export type StockAdjustmentReason = (typeof STOCK_ADJUSTMENT_REASONS)[number];
export type StockExpenseDepartment = (typeof STOCK_EXPENSE_DEPARTMENTS)[number];
export type StockLossType = (typeof STOCK_LOSS_TYPES)[number];
export type StockTransferStatus = (typeof STOCK_TRANSFER_STATUSES)[number];
export type StockRequestStatus = (typeof STOCK_REQUEST_STATUSES)[number];
export type StockCountStatus = (typeof STOCK_COUNT_STATUSES)[number];
export type StockRequestPriority = (typeof STOCK_REQUEST_PRIORITIES)[number];
export type StockReturnReason = (typeof STOCK_RETURN_REASONS)[number];
export type InventoryDocumentType = (typeof INVENTORY_DOCUMENT_TYPES)[number];
export type PurchaseRequisitionStatus = (typeof PURCHASE_REQUISITION_STATUSES)[number];
export type PurchaseOrderStatus = (typeof PURCHASE_ORDER_STATUSES)[number];
export type GoodsReceivingStatus = (typeof GOODS_RECEIVING_STATUSES)[number];
export type GoodsReturnStatus = (typeof GOODS_RETURN_STATUSES)[number];
export type StockAdjustmentVoucherStatus = (typeof STOCK_ADJUSTMENT_VOUCHER_STATUSES)[number];

export type StockLedgerEntryType =
  | "OPENING_BALANCE"
  | "PURCHASE"
  | "PURCHASE_RECEIPT"
  | "GOAT_REGISTRATION"
  | "TRANSFER_OUT"
  | "TRANSFER_IN"
  | "STORE_RETURN"
  | "DEPARTMENT_RETURN"
  | "POS_CONSUMPTION"
  | "RECIPE_CONSUMPTION"
  | "ADJUSTMENT"
  | "EXPENSE"
  | "MANUAL_DEDUCTION"
  | "WASTE"
  | "DAMAGE"
  | "EXPIRY"
  | "STOCK_COUNT_ADJUSTMENT"
  | "MANUAL_ADJUSTMENT"
  | "CANCELLATION_REVERSAL"
  | "DAILY_CONSUMPTION"
  | "STAFF_CONSUMPTION"
  | "CLOSING";

export const GOAT_LIMB_SKU = "stk-goat-limb-meat";
export const GOAT_INSIDE_SKU = "stk-goat-inside-parts";
export const GOAT_BONE_SKU = "stk-goat-bones";
export const GOAT_POOL_SKUS = [GOAT_LIMB_SKU, GOAT_INSIDE_SKU, GOAT_BONE_SKU] as const;
export const GOAT_KIKL_BONE_KG_PER_PLATE = 0.5;
export const GOAT_KIKL_RECIPE_ID = "recipe-kikl-goat-bones";
export const GOAT_MENU_IDS = [
  "shekla",
  "kurete",
  "collection-yefyel",
  "mlas-sember",
  "yefyel",
  "kikl",
  "m1783247305621",
] as const;

export function isGoatPoolSku(itemId: string) {
  return (GOAT_POOL_SKUS as readonly string[]).includes(itemId);
}

/** Kikl plate — sold without POS inventory tracking (bones are butcher yield, not plate stock). */
export function isKiklMenuItem(menuItemId?: string | null, menuName?: string | null) {
  const id = (menuItemId ?? "").trim().toLowerCase();
  const name = (menuName ?? "").trim().toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
  return id === "kikl" || id === "m1783247305621" || name === "kikl";
}

/** Menu products that must not show availability / deduct stock on POS. */
export function isPosStockDisconnectedMenuItem(menuItemId?: string | null, menuName?: string | null) {
  return isKiklMenuItem(menuItemId, menuName);
}

/** Map butcher goat menu products to limb / inside / bone pool SKUs for POS deduction. */
export function resolveGoatPoolSkuForMenuItem(menuItemId?: string | null, menuName?: string | null) {
  if (isPosStockDisconnectedMenuItem(menuItemId, menuName)) return null;
  const id = (menuItemId ?? "").trim().toLowerCase();
  const name = (menuName ?? "").trim().toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
  if (id === "shekla" || id === "kurete" || name === "shekla" || name === "kurete") {
    return GOAT_LIMB_SKU;
  }
  if (
    id === "collection-yefyel" ||
    id === "mlas-sember" ||
    id === "yefyel" ||
    name === "collection yefyel" ||
    name === "mlas sember" ||
    name === "yefyel" ||
    name.includes("yefyel")
  ) {
    return GOAT_INSIDE_SKU;
  }
  return null;
}

export interface StockConversionRule {
  id: string;
  label: string;
  fromUnit: StockUnitType;
  toUnit: StockUnitType;
  multiplier: number;
}

export type InventoryCostingMethod = (typeof INVENTORY_COSTING_METHODS)[number];
export type StockLotStatus = (typeof STOCK_LOT_STATUSES)[number];
export type PosReservationTrigger = (typeof POS_RESERVATION_TRIGGERS)[number];
export type PosDeductionTiming = (typeof POS_DEDUCTION_TIMINGS)[number];
export type PosOutOfStockBehavior = (typeof POS_OOS_BEHAVIORS)[number];
export type PosStockDeductionRule = (typeof POS_STOCK_DEDUCTION_RULES)[number];
export type PosReservationStatus = (typeof POS_RESERVATION_STATUSES)[number];
export type PosCancelReason = (typeof POS_CANCEL_REASONS)[number];
export type PosVoidStockOutcome = (typeof POS_VOID_STOCK_OUTCOMES)[number];
export type PosAvailabilityStatus = (typeof POS_AVAILABILITY_STATUSES)[number];
export type PosShiftSessionStatus = "Open" | "Closed";

export interface PosShiftClosePack {
  id: string;
  date: string;
  closedAt: string;
  closedBy: string;
  salesTotal: number;
  paymentTotal: number;
  voidCount: number;
  refundCount: number;
  unclosedOrders: number;
  consumptionQty: number;
  consumptionValue: number;
  wastageQty: number;
  wastageValue: number;
  reversalValue: number;
  reservedQty: number;
  negativeStockAttempts: number;
  consumptionByDepartment: Array<{ location: string; quantity: number; value: number }>;
}

export interface PosShiftSession {
  id: string;
  openedAt: string;
  openedBy: string;
  closedAt?: string;
  closedBy?: string;
  status: PosShiftSessionStatus;
  date: string;
  openingBalances: Array<{
    itemId: string;
    itemName: string;
    location: string;
    quantity: number;
    reservedQuantity: number;
    availableQuantity: number;
  }>;
  closePack?: PosShiftClosePack;
  notes?: string;
}

export interface PosNegativeSaleAttempt {
  id: string;
  attemptedAt: string;
  attemptedBy: string;
  menuItemId?: string;
  menuItemName: string;
  requestedQty: number;
  availableQty: number | null;
  remainingQty: number | null;
  behavior: PosOutOfStockBehavior | string;
  reason: string;
  role?: string;
}

export interface InventorySettingsRecord {
  id: string;
  costingMethod: InventoryCostingMethod;
  allowNegativeStock: boolean;
  /** When open POS orders reserve department sellable stock. Default: station_accept. */
  posReservationTrigger: PosReservationTrigger;
  /** When physical POS/recipe consumption is posted. Default: item_ready. */
  posDeductionTiming: PosDeductionTiming;
  /** Default POS out-of-stock behavior. Default: block. */
  posOutOfStockBehavior: PosOutOfStockBehavior;
  updatedAt: string;
  updatedBy: string;
}

export interface StockLot {
  id: string;
  itemId: string;
  itemName: string;
  location: StockLocation;
  batchNumber: string;
  manufacturingDate?: string;
  expiryDate?: string;
  quantity: number;
  unit: StockUnitType;
  unitCost: number;
  status: StockLotStatus;
  receivedAt: string;
  referenceNo?: string;
}

export interface LocationStockPolicy {
  id: string;
  itemId: string;
  itemName: string;
  location: StockLocation;
  minimumStock: number;
  maximumStock: number;
  reorderLevel: number;
  reorderQuantity: number;
  safetyStock: number;
  preferredSourceStore?: CentralStockLocation;
  preferredSupplier?: string;
  updatedAt: string;
}

export interface FefoAllocation {
  lotId: string;
  batchNumber: string;
  expiryDate?: string;
  quantity: number;
  unitCost: number;
}

export interface StockManagedItem {
  id: string;
  name: string;
  category: StockItemCategory;
  baseUnit: StockUnitType;
  purchasePrice: number;
  sellingPrice: number;
  vipSellingPrice?: number;
  standardCost?: number;
  reorderLevel: number;
  currentStock: number;
  preferredLocation: StockLocation;
  supplierName?: string;
  conversions: StockConversionRule[];
  trackBatchExpiry?: boolean;
  /** Main Bar beer grouping: special (Heineken, Bedele, Arada) vs normal. */
  beerTier?: BeerTier;
  /** Display-only bottle size in ml (750, 1000, …). Yield uses doubles-per-bottle conversions. */
  bottleVolumeMl?: number;
  notes?: string;
  createdAt: string;
  updatedAt: string;
}

export interface StockLedgerEntry {
  id: string;
  type: StockLedgerEntryType;
  date: string;
  itemId?: string;
  itemName: string;
  category?: StockItemCategory;
  location: StockLocation | StockExpenseDepartment;
  fromLocation?: StockLocation;
  toLocation?: StockLocation;
  quantity: number;
  unit: StockUnitType;
  unitPrice?: number;
  totalCost: number;
  paymentStatus?: string;
  paymentMethod?: string;
  supplierName?: string;
  approvedBy?: string;
  receivedBy?: string;
  enteredBy: string;
  reason?: string;
  notes?: string;
  referenceNo?: string;
  transactionAt?: string;
  quantityIn?: number;
  quantityOut?: number;
  balanceAfter?: number;
  sourceLocation?: StockLocation;
  destinationLocation?: StockLocation;
  immutable?: boolean;
  batchNumber?: string;
  expiryDate?: string;
  lotStatus?: StockLotStatus;
}

export interface InventoryApprovalHistoryEntry {
  id: string;
  action: "Created" | "Submitted" | "Reviewed" | "Approved" | "Rejected" | "Converted" | "Prepared" | "Dispatched" | "Received" | "Posted" | "Cancelled" | "Reversed";
  actedBy: string;
  actedAt: string;
  notes?: string;
}

export interface InventoryDocumentBase {
  id: string;
  documentType: InventoryDocumentType;
  documentNumber: string;
  status: string;
  createdAt: string;
  createdBy: string;
  notes?: string;
  approvalHistory: InventoryApprovalHistoryEntry[];
}

export interface PurchaseRequisitionLine {
  id: string;
  itemId: string;
  itemName: string;
  currentStock: number;
  reorderLevel: number;
  requestedQuantity: number;
  approvedQuantity: number;
  unit: StockUnitType;
  reason: string;
}

export interface PurchaseRequisitionDocument extends InventoryDocumentBase {
  documentType: "Purchase Requisition";
  status: PurchaseRequisitionStatus;
  requisitionNumber: string;
  requestingStore: CentralStockLocation;
  requiredDate: string;
  requestedBy: string;
  approvedBy?: string;
  lines: PurchaseRequisitionLine[];
}

export interface PurchaseOrderLine {
  id: string;
  itemId: string;
  itemName: string;
  orderedQuantity: number;
  receivedQuantity: number;
  unit: StockUnitType;
  unitPrice: number;
  discount: number;
  tax: number;
  totalCost: number;
}

export interface PurchaseOrderDocument extends InventoryDocumentBase {
  documentType: "Purchase Order";
  status: PurchaseOrderStatus;
  purchaseOrderNumber: string;
  supplier: string;
  destinationStore: CentralStockLocation;
  orderDate: string;
  expectedDeliveryDate?: string;
  paymentTerms?: string;
  preparedBy: string;
  approvedBy?: string;
  requisitionReference?: string;
  lines: PurchaseOrderLine[];
}

export interface GoodsReceivingVoucherLine extends StockReceivingLine {
  rejectedQuantity?: number;
  freeQuantity?: number;
  manufacturingDate?: string;
}

export interface GoodsReceivingVoucherDocument extends InventoryDocumentBase {
  documentType: "Goods Receiving Voucher";
  status: GoodsReceivingStatus;
  grvNumber: string;
  purchaseOrderReference?: string;
  supplier: string;
  destinationStore: CentralStockLocation;
  receivingDate: string;
  receivedBy: string;
  inspectedBy?: string;
  lines: GoodsReceivingVoucherLine[];
}

export interface StoreIssueVoucherDocument extends InventoryDocumentBase {
  documentType: "Store Issue Voucher";
  status: StockTransferStatus;
  issueVoucherNumber: string;
  sourceStore: CentralStockLocation;
  destinationDepartment: OperationalStockLocation;
  relatedStockRequest?: string;
  issueDate: string;
  issuedBy?: string;
  receivedBy?: string;
  approvedBy?: string;
  lines: StockTransferLine[];
}

export interface StoreTransferVoucherDocument extends InventoryDocumentBase {
  documentType: "Store Transfer Voucher";
  status: StockTransferStatus;
  transferVoucherNumber: string;
  sourceLocation: StockLocation;
  destinationLocation: StockLocation;
  transferDate: string;
  transferredBy?: string;
  receivedBy?: string;
  approvedBy?: string;
  lines: StockTransferLine[];
}

export interface GoodsReturnVoucherDocument extends InventoryDocumentBase {
  documentType: "Goods Return Voucher";
  status: GoodsReturnStatus;
  returnVoucherNumber: string;
  originalTransactionReference?: string;
  sourceLocation: StockLocation;
  destinationLocation?: StockLocation;
  supplier?: string;
  returnedBy: string;
  approvedBy?: string;
  receivedBy?: string;
  returnReason: StockReturnReason | string;
  lines: StockTransferLine[];
}

export interface StockAdjustmentVoucherLine {
  id: string;
  itemId: string;
  itemName: string;
  location: StockLocation;
  quantityBefore: number;
  adjustmentQuantity: number;
  quantityAfter: number;
  unit: StockUnitType;
  unitCost: number;
  totalValue: number;
  reason: string;
}

export interface StockAdjustmentVoucherDocument extends InventoryDocumentBase {
  documentType: "Stock Adjustment Voucher" | "Wastage Voucher" | "Damage Voucher" | "Stock Count Adjustment";
  status: StockAdjustmentVoucherStatus;
  adjustmentNumber: string;
  requestedBy: string;
  approvedBy?: string;
  postedBy?: string;
  supportingDocument?: string;
  lines: StockAdjustmentVoucherLine[];
}

export interface CancellationReversalVoucherDocument extends InventoryDocumentBase {
  documentType: "Cancellation Reversal Voucher";
  status: "Posted";
  reversalNumber: string;
  originalDocumentNumber: string;
  originalDocumentType: InventoryDocumentType;
  reversedBy: string;
  reversalReason: string;
  ledgerEntries: StockLedgerEntry[];
}

export interface StockReceivingLine {
  id: string;
  itemId: string;
  itemName: string;
  unit: StockUnitType;
  orderedQuantity: number;
  receivedQuantity: number;
  unitCost: number;
  batchNumber?: string;
  expiryDate?: string;
}

export interface StockReceivingRecord {
  id: string;
  receivingNumber: string;
  supplier: string;
  purchaseOrderReference?: string;
  storeDestination: CentralStockLocation;
  receivingDate: string;
  lines: StockReceivingLine[];
  receivedBy: string;
  notes?: string;
  status: "Draft" | "Confirmed" | "Cancelled";
  confirmedAt?: string;
}

export interface StockTransferLine {
  id: string;
  itemId: string;
  itemName: string;
  unit: StockUnitType;
  requestedQuantity: number;
  approvedQuantity: number;
  sentQuantity: number;
  receivedQuantity: number;
  batchNumber?: string;
  expiryDate?: string;
}

export interface StockTransferRecord {
  id: string;
  transferNumber: string;
  sourceLocation: StockLocation;
  destinationLocation: StockLocation;
  lines: StockTransferLine[];
  transferDate: string;
  status: StockTransferStatus;
  requestedBy?: string;
  approvedBy?: string;
  sentBy?: string;
  receivedBy?: string;
  rejectedReason?: string;
  notes?: string;
  sourceReservedAt?: string;
  dispatchedAt?: string;
  receivedAt?: string;
  linkedRequestNumber?: string;
  linkedReturnNumber?: string;
  activity: string[];
}

export interface StockRequestLine {
  id: string;
  itemId: string;
  itemName: string;
  availableQuantityAtDepartment: number;
  requestedQuantity: number;
  approvedQuantity: number;
  unit: StockUnitType;
}

export interface StockRequestRecord {
  id: string;
  requestNumber: string;
  requestingDepartment: OperationalStockLocation;
  requestedSourceStore: CentralStockLocation;
  lines: StockRequestLine[];
  priority: StockRequestPriority;
  reason: string;
  requiredDate: string;
  requestedBy: string;
  reviewedBy?: string;
  rejectionReason?: string;
  notes?: string;
  status: StockRequestStatus;
  createdAt: string;
  updatedAt: string;
  convertedTransferNumber?: string;
}

export interface DepartmentStockRequestDocument extends InventoryDocumentBase {
  documentType: "Department Stock Request";
  status: StockRequestStatus;
  stockRequestNumber: string;
  requestingDepartment: OperationalStockLocation;
  requestedSourceStore: CentralStockLocation;
  priority: StockRequestPriority;
  reason: string;
  requiredDate: string;
  requestedBy: string;
  reviewedBy?: string;
  rejectionReason?: string;
  lines: StockRequestLine[];
  convertedIssueVoucherNumber?: string;
  convertedTransferVoucherNumber?: string;
}

export interface StockReturnRecord {
  id: string;
  returnNumber: string;
  department: OperationalStockLocation;
  destinationStore: CentralStockLocation;
  lines: StockTransferLine[];
  reason: StockReturnReason;
  status: StockTransferStatus;
  createdBy: string;
  approvedBy?: string;
  dispatchedBy?: string;
  receivedBy?: string;
  notes?: string;
  originalTransferNumber?: string;
  createdAt: string;
}

export interface StockLossRecord {
  id: string;
  lossNumber: string;
  location: StockLocation;
  itemId: string;
  itemName: string;
  quantity: number;
  unit: StockUnitType;
  lossType: StockLossType;
  reason: string;
  date: string;
  recordedBy: string;
  approvedBy?: string;
  notes?: string;
  documentUrl?: string;
  status: "Draft" | "Pending Approval" | "Approved" | "Rejected" | "Posted";
}

export interface StockCountLine {
  id: string;
  itemId: string;
  itemName: string;
  unit: StockUnitType;
  expectedQuantity: number;
  countedQuantity: number;
  variance: number;
  varianceValue: number;
  reason?: string;
}

export interface StockCountSession {
  id: string;
  countSessionNumber: string;
  location: StockLocation;
  countDate: string;
  lines: StockCountLine[];
  countedBy: string;
  reviewedBy?: string;
  approvedBy?: string;
  status: StockCountStatus;
  blindCount?: boolean;
  approvalHistory?: InventoryApprovalHistoryEntry[];
  notes?: string;
}

export interface InventoryPermissionSet {
  role: string;
  canViewAllLocations: boolean;
  manageableLocations: StockLocation[];
  readOnly: boolean;
  canReceivePurchases: boolean;
  canApproveRequests: boolean;
  canDispatchTransfers: boolean;
  canConfirmReceipts: boolean;
  canApproveAdjustments: boolean;
  allowNegativeStock: boolean;
}

export interface InventoryControlSettings {
  allowNegativeStock: boolean;
  costingMethod?: InventoryCostingMethod;
}

export const DEFAULT_INVENTORY_CONTROL_SETTINGS: InventoryControlSettings = {
  allowNegativeStock: false,
  costingMethod: "Weighted Average",
};

export const DEFAULT_INVENTORY_SETTINGS: InventorySettingsRecord = {
  id: "inventory-settings",
  costingMethod: "Weighted Average",
  allowNegativeStock: false,
  posReservationTrigger: "station_accept",
  posDeductionTiming: "order_submit",
  posOutOfStockBehavior: "block",
  updatedAt: new Date().toISOString(),
  updatedBy: "System",
};

export interface InventoryApprovalPolicyCheck {
  ok: boolean;
  error?: string;
}

export const STORE_ASSIGNMENT_ROLES = ["Storekeeper", "Inventory Staff", "Procurement Officer"] as const;
export type StoreAssignmentRole = (typeof STORE_ASSIGNMENT_ROLES)[number];

export interface InventoryActorContext {
  userName: string;
  role: string;
  allowedLocations?: StockLocation[];
  assignedStore?: CentralStockLocation;
}

export function isStoreAssignmentRole(role: string): role is StoreAssignmentRole {
  return (STORE_ASSIGNMENT_ROLES as readonly string[]).includes(role);
}

export function parseCentralStockLocation(value?: string | null): CentralStockLocation | null {
  const normalized = value?.trim();
  if (normalized === "Store 1" || normalized === "Store 2") return normalized;
  return null;
}

export function resolveActorCentralStore(actor: InventoryActorContext): CentralStockLocation | "all" | null {
  if (
    actor.role === "Administrator" ||
    actor.role === "Inventory Administrator" ||
    actor.role === "Branch Manager" ||
    actor.role === "Supervisor" ||
    actor.role === "Store Manager"
  ) {
    return "all";
  }
  if (isStoreAssignmentRole(actor.role)) {
    return actor.assignedStore ?? null;
  }
  return null;
}

export function actorCanActOnCentralStore(actor: InventoryActorContext, store: CentralStockLocation): boolean {
  const scope = resolveActorCentralStore(actor);
  if (scope === "all") return true;
  return scope === store;
}

export function resolveAssignedStoreForUser(
  user: { role: string; assignedStore?: CentralStockLocation },
  inventoryLocation?: string,
): CentralStockLocation | undefined {
  if (user.assignedStore) return user.assignedStore;
  const parsed = parseCentralStockLocation(inventoryLocation);
  return parsed ?? undefined;
}

export function inventoryPermissionSetForActor(actor: InventoryActorContext): InventoryPermissionSet {
  const base = inventoryPermissionSetForRole(actor.role);
  if (!isStoreAssignmentRole(actor.role)) return base;
  const assignedStore = actor.assignedStore;
  if (!assignedStore) {
    return { ...base, manageableLocations: [] };
  }
  return { ...base, manageableLocations: [assignedStore] };
}

function sameInventoryActor(left: string, right: string) {
  return left.trim().toLowerCase() === right.trim().toLowerCase();
}

export interface StockRecipeLine {
  id: string;
  itemId: string;
  itemName: string;
  quantity: number;
  unit: StockUnitType;
  /** When set, this ingredient deducts from a different department than the recipe default. */
  stockDeductionLocation?: OperationalStockLocation;
}

export interface StockRecipe {
  id: string;
  menuItemName: string;
  category: string;
  outputQty: number;
  outputUnit: string;
  preparationStation?: string;
  stockDeductionLocation?: OperationalStockLocation;
  wastageAllowance?: number;
  portionSize?: string;
  ingredients: StockRecipeLine[];
  notes?: string;
  updatedAt: string;
}

export interface PosStockReservation {
  id: string;
  orderId: string;
  orderNo: string;
  orderLineKey: string;
  itemId: string;
  itemName: string;
  location: OperationalStockLocation;
  quantity: number;
  unit: StockUnitType;
  status: PosReservationStatus;
  reservedAt: string;
  reservedBy: string;
  releasedAt?: string;
  consumedAt?: string;
  referenceNo: string;
  menuItemName?: string;
}

export interface StockClosingRecord {
  id: string;
  date: string;
  location: StockLocation;
  branch?: string;
  openingStock: number;
  stockReceived: number;
  transfersIn?: number;
  transfersOut?: number;
  posConsumption?: number;
  recipeConsumption?: number;
  salesDeduction: number;
  wasteDamage: number;
  returns?: number;
  manualAdjustment: number;
  closingStock: number;
  physicalClosingStock?: number;
  difference: number;
  varianceValue?: number;
  createdBy: string;
  approvedBy?: string;
  closedAt?: string;
  notes?: string;
}

export interface StockLocationBalance {
  itemId: string;
  itemName: string;
  category: StockItemCategory;
  unit: StockUnitType;
  location: StockLocation;
  quantity: number;
  reservedQuantity: number;
  availableQuantity: number;
  incomingQuantity: number;
  reorderLevel: number;
  inventoryValue: number;
  unitCost?: number;
}

export interface StockDashboardSummary {
  totalInventoryValue: number;
  store1StockValue: number;
  store2StockValue: number;
  departmentStockValue: number;
  locationValues: Record<StockLocation, number>;
  locationComparison: Array<{
    location: StockLocation;
    totalItems: number;
    inventoryValue: number;
    availableValue: number;
    reservedValue: number;
    lowStock: number;
    outOfStock: number;
    pendingRequests: number;
    awaitingReceipt: number;
    lastMovement?: string;
  }>;
  lowStockItems: StockLocationBalance[];
  outOfStockItems: StockLocationBalance[];
  pendingStockRequests: number;
  pendingTransferReceipts: number;
  expiringItems: number;
  wastageValue: number;
  stockVarianceValue: number;
  todayPurchases: number;
  todaySalesDeductions: number;
  todaySalesRevenue: number;
  todayRecipeConsumption: number;
  todayExpenses: number;
  stockDifferences: number;
  negativeStockItems: StockLocationBalance[];
  topSellingItems: Array<{ itemName: string; quantity: number; totalCost: number }>;
  mostIssuedItems: Array<{ itemName: string; quantity: number; totalCost: number }>;
  todayConsumption: number;
  todayDailyConsumption: number;
  todayWastage: number;
  staffConsumption: StaffConsumptionDashboardSummary;
  /** ISO timestamp of latest daily closing that reset today's counters; null if day still open. */
  dailyPeriodStart: string | null;
}

export interface StockValidationResult {
  ok: boolean;
  error?: string;
}

export interface PosStockDeductionInput {
  orderId: string;
  orderNo: string;
  closedAt: string;
  enteredBy: string;
  lines: Array<{
    name: string;
    qty: number;
    stockSku?: string;
    menuItemId?: string;
    stockDeductionLocation?: OperationalStockLocation;
    station?: string;
    /** POS sell unit label: Bottle | Single Shot | Double Shot */
    unitLabel?: string;
  }>;
  /** Skip creating entries when this order already has POS/recipe consumption rows. */
  skipIfAlreadyDeducted?: boolean;
  /** Override ledger entry types and reference for non-POS consumption (e.g. staff meals). */
  ledgerProfile?: {
    directType: StockLedgerEntryType;
    recipeType: StockLedgerEntryType;
    referenceNo: string;
    notesPrefix: string;
    entryIdPrefix: string;
  };
}

function nowIso() {
  return new Date().toISOString();
}

/** Canonical goat pool items from migration 025 — used when cached stock-items predates the migration. */
export function getGoatPoolStockItemDefaults(): StockManagedItem[] {
  const ts = nowIso();
  return [
    {
      id: GOAT_LIMB_SKU,
      name: "Goat Limb Meat (Front+Back)",
      category: "Meat",
      baseUnit: "kg",
      purchasePrice: 100,
      sellingPrice: 0,
      standardCost: 98,
      reorderLevel: 5,
      currentStock: 0,
      preferredLocation: "Butcher",
      supplierName: "Direct purchase",
      conversions: [],
      trackBatchExpiry: false,
      notes: "Butcher goat pool — limb (Shekla/Kurete)",
      createdAt: ts,
      updatedAt: ts,
    },
    {
      id: GOAT_INSIDE_SKU,
      name: "Goat Inside Parts",
      category: "Meat",
      baseUnit: "kg",
      purchasePrice: 100,
      sellingPrice: 0,
      standardCost: 98,
      reorderLevel: 5,
      currentStock: 0,
      preferredLocation: "Butcher",
      supplierName: "Direct purchase",
      conversions: [],
      trackBatchExpiry: false,
      notes: "Butcher goat pool — inside (Collection/Mlas Sember)",
      createdAt: ts,
      updatedAt: ts,
    },
    {
      id: GOAT_BONE_SKU,
      name: "Goat Bones (Kikl)",
      category: "Meat",
      baseUnit: "kg",
      purchasePrice: 100,
      sellingPrice: 0,
      standardCost: 98,
      reorderLevel: 5,
      currentStock: 0,
      preferredLocation: "Butcher",
      supplierName: "Direct purchase",
      conversions: [],
      trackBatchExpiry: false,
      notes: "Butcher goat pool — bones for Kikl (plate recipe)",
      createdAt: ts,
      updatedAt: ts,
    },
  ];
}

export function buildGoatKiklRecipe(boneKgPerPlate = GOAT_KIKL_BONE_KG_PER_PLATE): StockRecipe {
  return {
    id: GOAT_KIKL_RECIPE_ID,
    menuItemName: "Kikl",
    category: "Meat",
    outputQty: 1,
    outputUnit: "plate",
    stockDeductionLocation: "Butcher",
    preparationStation: "Kitchen",
    wastageAllowance: 0,
    ingredients: [
      {
        id: "kikl-goat-bone-1",
        itemId: GOAT_BONE_SKU,
        itemName: "Goat Bones (Kikl)",
        quantity: boneKgPerPlate,
        unit: "kg",
        stockDeductionLocation: "Butcher",
      },
    ],
    notes: `${boneKgPerPlate} kg goat bones per plate Kikl.`,
    updatedAt: nowIso(),
  };
}

/** Keep a Kikl bones recipe for butcher yield settings (POS plate sales are stock-disconnected). */
export function mergeKiklGoatRecipe(recipes: StockRecipe[]): { recipes: StockRecipe[]; changed: boolean } {
  const kiklRecipe = buildGoatKiklRecipe();
  const index = recipes.findIndex((row) => row.menuItemName.trim().toLowerCase() === "kikl");
  if (index < 0) {
    return { recipes: [kiklRecipe, ...recipes], changed: true };
  }
  const existing = recipes[index]!;
  if (existing.ingredients.some((line) => line.itemId === GOAT_BONE_SKU)) {
    return { recipes, changed: false };
  }
  const next = [...recipes];
  next[index] = { ...kiklRecipe, id: existing.id || kiklRecipe.id };
  return { recipes: next, changed: true };
}

export function findKiklGoatRecipe(recipes: StockRecipe[]): StockRecipe | undefined {
  return recipes.find((row) => row.menuItemName.trim().toLowerCase() === "kikl");
}

/** Kikl POS bone deduction (kg/plate) from the stock recipe, not a hardcoded constant. */
export function resolveKiklBoneKgPerPlate(
  recipes: StockRecipe[],
  fallback = GOAT_KIKL_BONE_KG_PER_PLATE,
): number {
  const recipe = findKiklGoatRecipe(recipes);
  const boneLine = recipe?.ingredients.find((line) => line.itemId === GOAT_BONE_SKU);
  const quantity = boneLine?.quantity;
  return quantity != null && Number.isFinite(quantity) && quantity > 0 ? qty(quantity) : fallback;
}

export function applyKiklBoneKgPerPlate(
  recipes: StockRecipe[],
  boneKgPerPlate: number,
): { recipes: StockRecipe[]; recipe: StockRecipe } {
  const kg = qty(Math.max(0, boneKgPerPlate));
  if (!(kg > 0)) {
    throw new Error("Kikl bone yield must be greater than zero.");
  }
  const { recipes: merged } = mergeKiklGoatRecipe(recipes);
  const index = merged.findIndex((row) => row.menuItemName.trim().toLowerCase() === "kikl");
  const existing = index >= 0 ? merged[index]! : null;
  const nextRecipe = buildGoatKiklRecipe(kg);
  const recipe: StockRecipe = {
    ...nextRecipe,
    id: existing?.id ?? nextRecipe.id,
    wastageAllowance: existing?.wastageAllowance ?? nextRecipe.wastageAllowance,
  };
  if (index < 0) {
    return { recipes: [recipe, ...merged], recipe };
  }
  const next = [...merged];
  next[index] = recipe;
  return { recipes: next, recipe };
}

/** Merge goat pool SKUs from DB snapshot or defaults into an existing stock-items list. */
export function mergeMissingGoatPoolItems(
  items: StockManagedItem[],
  candidates: StockManagedItem[] = getGoatPoolStockItemDefaults(),
  options?: { allowDefaults?: boolean },
): { items: StockManagedItem[]; added: StockManagedItem[] } {
  const allowDefaults = options?.allowDefaults !== false;
  const defaults = getGoatPoolStockItemDefaults();
  const added: StockManagedItem[] = [];
  let next = [...items];
  for (const sku of GOAT_POOL_SKUS) {
    if (next.some((row) => row.id === sku)) continue;
    const candidate =
      candidates.find((row) => row.id === sku) ??
      (allowDefaults ? defaults.find((row) => row.id === sku) : undefined);
    if (!candidate) continue;
    added.push(candidate);
    next = [candidate, ...next];
  }
  return { items: next, added };
}

/** Ensure special/draft beer tiers and Weyn (Wayne) category stay correct on persisted stock. */
export function mergeSpecialBeerTiers(items: StockManagedItem[]): { items: StockManagedItem[]; changed: boolean } {
  let changed = false;
  const next = items.map((item) => {
    if (isWeynItem(item) && item.category !== "Weyn") {
      changed = true;
      return { ...item, category: "Weyn" as const, updatedAt: nowIso() };
    }
    if (item.category !== "Beer") return item;
    if (isSpecialBeerItem(item) && item.beerTier !== "special") {
      changed = true;
      return { ...item, beerTier: "special" as const, updatedAt: nowIso() };
    }
    if (isDraftBeerItem(item) && item.beerTier !== "draft") {
      changed = true;
      return { ...item, beerTier: "draft" as const, updatedAt: nowIso() };
    }
    return item;
  });
  return { items: next, changed };
}

export function generateInventoryDocumentNumber(prefix: string, date = new Date(), sequence = 1) {
  const year = date.getFullYear();
  return `${prefix}-${year}-${String(sequence).padStart(5, "0")}`;
}

/** Next year-scoped sequence from existing document numbers shaped like PREFIX-YYYY-#####. */
export function nextInventoryDocumentNumber(prefix: string, existingNumbers: string[], date = new Date()) {
  const year = date.getFullYear();
  const pattern = new RegExp(`^${prefix}-${year}-(\\d+)$`, "i");
  let maxSequence = 0;
  for (const value of existingNumbers) {
    const match = pattern.exec(value.trim());
    if (!match) continue;
    const sequence = Number(match[1]);
    if (Number.isFinite(sequence) && sequence > maxSequence) maxSequence = sequence;
  }
  return generateInventoryDocumentNumber(prefix, date, maxSequence + 1);
}

function historyEntry(action: InventoryApprovalHistoryEntry["action"], actedBy: string, notes?: string): InventoryApprovalHistoryEntry {
  return {
    id: `hist-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    action,
    actedBy,
    actedAt: nowIso(),
    notes,
  };
}

export function inventoryPermissionSetForRole(role: string): InventoryPermissionSet {
  switch (role) {
    case "Administrator":
    case "Inventory Administrator":
      return { role, canViewAllLocations: true, manageableLocations: [...STOCK_LOCATIONS], readOnly: false, canReceivePurchases: true, canApproveRequests: true, canDispatchTransfers: true, canConfirmReceipts: true, canApproveAdjustments: true, allowNegativeStock: true };
    case "Branch Manager":
    case "Supervisor":
    case "Store Manager":
      return { role, canViewAllLocations: true, manageableLocations: [...STOCK_LOCATIONS], readOnly: false, canReceivePurchases: true, canApproveRequests: true, canDispatchTransfers: true, canConfirmReceipts: true, canApproveAdjustments: true, allowNegativeStock: false };
    case "Storekeeper":
    case "Inventory Staff":
    case "Procurement Officer":
      return { role, canViewAllLocations: false, manageableLocations: ["Store 1", "Store 2"], readOnly: false, canReceivePurchases: true, canApproveRequests: true, canDispatchTransfers: true, canConfirmReceipts: true, canApproveAdjustments: false, allowNegativeStock: false };
    case "Department Manager":
      return { role, canViewAllLocations: false, manageableLocations: [...OPERATIONAL_STOCK_LOCATIONS], readOnly: false, canReceivePurchases: false, canApproveRequests: false, canDispatchTransfers: false, canConfirmReceipts: true, canApproveAdjustments: true, allowNegativeStock: false };
    case "Chef":
    case "Kitchen Staff":
      return { role, canViewAllLocations: false, manageableLocations: ["Kitchen"], readOnly: false, canReceivePurchases: false, canApproveRequests: false, canDispatchTransfers: false, canConfirmReceipts: true, canApproveAdjustments: false, allowNegativeStock: false };
    case "Bartender":
    case "Bar Staff":
      return { role, canViewAllLocations: false, manageableLocations: ["Main Bar", "VIP Bar"], readOnly: false, canReceivePurchases: false, canApproveRequests: false, canDispatchTransfers: false, canConfirmReceipts: true, canApproveAdjustments: false, allowNegativeStock: false };
    case "Coffee House Staff":
      return { role, canViewAllLocations: false, manageableLocations: ["Coffee House"], readOnly: false, canReceivePurchases: false, canApproveRequests: false, canDispatchTransfers: false, canConfirmReceipts: true, canApproveAdjustments: false, allowNegativeStock: false };
    case "Butcher Staff":
    case "Butcher House Staff":
      return { role, canViewAllLocations: false, manageableLocations: ["Butcher"], readOnly: false, canReceivePurchases: false, canApproveRequests: false, canDispatchTransfers: false, canConfirmReceipts: true, canApproveAdjustments: false, allowNegativeStock: false };
    case "Cashier":
      return { role, canViewAllLocations: false, manageableLocations: [], readOnly: true, canReceivePurchases: false, canApproveRequests: false, canDispatchTransfers: false, canConfirmReceipts: false, canApproveAdjustments: false, allowNegativeStock: false };
    case "Auditor":
    case "Accountant":
      return { role, canViewAllLocations: true, manageableLocations: [...STOCK_LOCATIONS], readOnly: true, canReceivePurchases: false, canApproveRequests: false, canDispatchTransfers: false, canConfirmReceipts: false, canApproveAdjustments: false, allowNegativeStock: false };
    default:
      return { role, canViewAllLocations: false, manageableLocations: [], readOnly: true, canReceivePurchases: false, canApproveRequests: false, canDispatchTransfers: false, canConfirmReceipts: false, canApproveAdjustments: false, allowNegativeStock: false };
  }
}

export function validateInventoryDocumentApproval(
  actor: InventoryActorContext,
  document: Pick<InventoryDocumentBase, "createdBy" | "documentType"> & {
    approvedBy?: string;
    issuedBy?: string;
    transferredBy?: string;
    receivedBy?: string;
    requestedBy?: string;
    approvalHistory?: InventoryApprovalHistoryEntry[];
  },
  action: "approve" | "post" | "reject" | "dispatch" | "receive",
  location?: StockLocation,
): InventoryApprovalPolicyCheck {
  const permissions = inventoryPermissionSetForActor(actor);
  if (permissions.readOnly) return { ok: false, error: "Read-only users cannot perform this action." };

  if (isStoreAssignmentRole(actor.role) && !actor.assignedStore) {
    return { ok: false, error: `${actor.role} must be assigned to Store 1 or Store 2 before acting on inventory.` };
  }

  if (sameInventoryActor(document.createdBy, actor.userName) && ["approve", "post", "reject"].includes(action)) {
    return { ok: false, error: "Users cannot approve, reject, or post their own restricted inventory documents." };
  }

  const requester = document.requestedBy;
  if (requester && sameInventoryActor(requester, actor.userName) && ["approve", "reject"].includes(action)) {
    return { ok: false, error: "Users cannot approve or reject their own stock requests." };
  }

  if (location && !permissions.canViewAllLocations && !permissions.manageableLocations.includes(location)) {
    return { ok: false, error: `Role ${actor.role} cannot act on ${location}.` };
  }
  if (action === "approve" && !permissions.canApproveRequests && !permissions.canApproveAdjustments) {
    return { ok: false, error: `Role ${actor.role} is not allowed to approve this document.` };
  }
  if (action === "dispatch" && !permissions.canDispatchTransfers) {
    return { ok: false, error: `Role ${actor.role} is not allowed to dispatch transfers.` };
  }
  if (action === "receive" && !permissions.canConfirmReceipts) {
    return { ok: false, error: `Role ${actor.role} is not allowed to confirm receipts.` };
  }
  if (action === "post" && !permissions.canApproveAdjustments && !permissions.canApproveRequests && !permissions.canDispatchTransfers) {
    return { ok: false, error: `Role ${actor.role} is not allowed to post this document.` };
  }

  const dispatchedBy =
    document.issuedBy ||
    document.transferredBy ||
    document.approvalHistory?.find((entry) => entry.action === "Dispatched")?.actedBy;
  if (action === "receive" && dispatchedBy && sameInventoryActor(dispatchedBy, actor.userName)) {
    return { ok: false, error: "Maker-checker: the user who dispatched stock cannot confirm receipt." };
  }

  if (action === "dispatch" && document.approvedBy && sameInventoryActor(document.approvedBy, actor.userName) === false) {
    // Allowed: approver and dispatcher may differ; no extra block.
  }
  if (action === "dispatch" && document.receivedBy && sameInventoryActor(document.receivedBy, actor.userName)) {
    return { ok: false, error: "Maker-checker: the receiving user cannot dispatch the same voucher." };
  }

  return { ok: true };
}

/** POS and recipe consumption must deduct from operational departments, never Store 1/2. */
export function resolvePosDeductionLocation(
  preferred: StockLocation | undefined,
  recipeLocation?: OperationalStockLocation,
  category?: StockItemCategory,
): OperationalStockLocation | null {
  if (recipeLocation && isOperationalStockLocation(recipeLocation)) return recipeLocation;
  if (preferred && isOperationalStockLocation(preferred)) return preferred;
  if (category === "Meat") return "Butcher";
  if (category === "Kitchen") return "Kitchen";
  if (category === "Coffee House") return "Coffee House";
  if (category === "Beer" || category === "Whisky" || category === "Soft Drink" || category === "Weyn" || category === "Water" || category === "Bar") {
    return "Main Bar";
  }
  return null;
}

/** Map a preparation / KDS station label to an operational stock location. */
export function stationToOperationalLocation(station?: string): OperationalStockLocation | null {
  if (!station) return null;
  const key = station.trim().toLowerCase();
  if (key.includes("vip")) return "VIP Bar";
  if (key.includes("bar") || key.includes("beverage")) return "Main Bar";
  if (key.includes("butcher") || key.includes("siga")) return "Butcher";
  if (key.includes("coffee") || key.includes("buna")) return "Coffee House";
  if (key.includes("kitchen")) return "Kitchen";
  return null;
}

function normalizeStockLookupName(value: string) {
  return value.trim().toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

export function resolveMenuItemStockItemCandidates(menuItem: {
  id: string;
  stockSku?: string | null;
}) {
  const candidates: string[] = [];
  const add = (value?: string | null) => {
    const trimmed = value?.trim();
    if (!trimmed || candidates.includes(trimmed)) return;
    candidates.push(trimmed);
  };
  add(menuItem.stockSku);
  add(menuItem.id);
  add(`stk-${menuItem.id}`);
  add(`stk-beer-${menuItem.id}`);
  if (menuItem.stockSku && !menuItem.stockSku.startsWith("stk-")) {
    add(`stk-${menuItem.stockSku}`);
    add(`stk-beer-${menuItem.stockSku}`);
  }
  // Bedelle menu spelling vs Bedele stock id
  if (menuItem.id === "bedeli" || menuItem.stockSku === "bedeli") {
    add("stk-beer-bedele");
  }
  return candidates;
}

export function findStockManagedItemForMenuItem(
  items: StockManagedItem[],
  menuItem: { id: string; name_en: string; stockSku?: string | null },
) {
  // Kikl must not soft-match "Goat Bones (Kikl)" or appear stock-tracked on POS.
  if (isPosStockDisconnectedMenuItem(menuItem.id, menuItem.name_en)) return undefined;
  const byId = new Map(items.map((item) => [item.id, item]));
  for (const candidate of resolveMenuItemStockItemCandidates(menuItem)) {
    const match = byId.get(candidate);
    if (match) return match;
  }
  const normalizedName = normalizeStockLookupName(menuItem.name_en);
  const exact = items.find((item) => normalizeStockLookupName(item.name) === normalizedName);
  if (exact) return exact;
  // Soft match: Bedelle ↔ Bedele, brand contained in stock name
  return items.find((item) => {
    const stockName = normalizeStockLookupName(item.name);
    if (!stockName || !normalizedName) return false;
    if (stockName.includes(normalizedName) || normalizedName.includes(stockName)) return true;
    const compactMenu = normalizedName.replace(/\s+/g, "");
    const compactStock = stockName.replace(/\s+/g, "");
    return compactMenu === compactStock || compactMenu.startsWith(compactStock) || compactStock.startsWith(compactMenu);
  });
}

/**
 * Align POS / inventory location with menu station and deduction settings.
 *
 * Butcher/meat/grill lines are often routed to Kitchen as a *final* KDS station
 * (kilo prep). Stock must still deduct from Butcher — never treat that Kitchen
 * hop as the inventory location when the prep station is butcher.
 */
export function resolveMenuStockLocation(input: {
  station?: string | null;
  finalStation?: string | null;
  stockDeductionLocation?: string | null;
  menuCategory?: string | null;
  stockPreferredLocation?: StockLocation | null;
}): OperationalStockLocation | null {
  const prepStation = input.station ?? undefined;
  const prepLoc = stationToOperationalLocation(prepStation);
  const explicit = input.stockDeductionLocation?.trim();

  if (explicit && isOperationalStockLocation(explicit as StockLocation)) {
    // Kilo routing artifact: order line stored Kitchen while prep is Butcher House.
    if (explicit === "Kitchen" && prepLoc === "Butcher") {
      return "Butcher";
    }
    return explicit as OperationalStockLocation;
  }

  if (prepLoc) return prepLoc;

  const fromFinal = stationToOperationalLocation(input.finalStation ?? undefined);
  if (fromFinal === "Butcher") return "Butcher";
  // Prefer butcher preferred/category over a Kitchen final-station hop.
  if (
    input.stockPreferredLocation === "Butcher" ||
    input.menuCategory === "Meat" ||
    (input.stockPreferredLocation &&
      isOperationalStockLocation(input.stockPreferredLocation) &&
      input.stockPreferredLocation !== "Kitchen")
  ) {
    if (input.stockPreferredLocation && isOperationalStockLocation(input.stockPreferredLocation)) {
      return input.stockPreferredLocation;
    }
    if (input.menuCategory === "Meat") return "Butcher";
  }

  if (fromFinal) return fromFinal;

  if (input.stockPreferredLocation && isOperationalStockLocation(input.stockPreferredLocation)) {
    return input.stockPreferredLocation;
  }

  if (input.menuCategory === "Meat") return "Butcher";
  return null;
}

export function mapMenuCategoryToStockCategory(menuCategory?: string | null, station?: string | null) {
  if (station === "Coffee House") return "Coffee House" as StockItemCategory;
  switch (menuCategory) {
    case "Whisky":
      return "Whisky";
    case "Beer":
      return "Beer";
    case "Soft Drinks":
      return "Soft Drink";
    case "Water":
      return "Water";
    case "Weyn":
    case "Wayn":
    case "Wayne":
      return "Weyn";
    case "Meat":
      return "Meat";
    case "Spirits":
      return "Bar";
    default:
      return "Kitchen";
  }
}

export function posOrderReference(orderId: string) {
  return `POS-${orderId}`;
}

export function orderHasPosStockDeduction(ledger: StockLedgerEntry[], orderId: string) {
  const reference = posOrderReference(orderId);
  return ledger.some(
    (entry) =>
      entry.referenceNo === reference &&
      (entry.type === "POS_CONSUMPTION" || entry.type === "RECIPE_CONSUMPTION"),
  );
}

export function getPosReservedQuantity(
  reservations: PosStockReservation[],
  itemId: string,
  location: StockLocation,
) {
  return qty(
    reservations
      .filter((row) => row.status === "Reserved" && row.itemId === itemId && row.location === location)
      .reduce((sum, row) => sum + row.quantity, 0),
  );
}

export function getSellableStockQuantity(physicalQuantity: number, reservedQuantity: number) {
  return qty(Math.max(0, physicalQuantity - reservedQuantity));
}

function migrateDeductionTiming(timing?: PosDeductionTiming | null): PosDeductionTiming {
  if (!timing) return DEFAULT_INVENTORY_SETTINGS.posDeductionTiming;
  if (timing === "item_ready" || timing === "item_served" || timing === "prep_start" || timing === "station_accept") {
    return "order_submit";
  }
  return timing;
}

export function normalizeInventorySettings(
  settings?: Partial<InventorySettingsRecord> | null,
): InventorySettingsRecord {
  return {
    ...DEFAULT_INVENTORY_SETTINGS,
    ...settings,
    id: settings?.id || "inventory-settings",
    costingMethod: settings?.costingMethod ?? DEFAULT_INVENTORY_SETTINGS.costingMethod,
    allowNegativeStock: settings?.allowNegativeStock ?? DEFAULT_INVENTORY_SETTINGS.allowNegativeStock,
    posReservationTrigger: settings?.posReservationTrigger ?? DEFAULT_INVENTORY_SETTINGS.posReservationTrigger,
    posDeductionTiming: migrateDeductionTiming(settings?.posDeductionTiming),
    posOutOfStockBehavior: settings?.posOutOfStockBehavior ?? DEFAULT_INVENTORY_SETTINGS.posOutOfStockBehavior,
    // Keep a stable timestamp when hydrating defaults — nowIso() here re-renders forever.
    updatedAt: settings?.updatedAt ?? DEFAULT_INVENTORY_SETTINGS.updatedAt,
    updatedBy: settings?.updatedBy ?? "System",
  };
}

function todayKey(date = new Date()) {
  return dateKey(date);
}

function ledgerDateFromClosedAt(closedAt: string, fallback = todayKey()) {
  return dateKeyFromDateTime(closedAt) ?? (closedAt.length >= 10 && /^\d{4}-\d{2}-\d{2}/.test(closedAt) ? closedAt.slice(0, 10) : fallback);
}

function ledgerTimestampFromClosedAt(closedAt: string) {
  if (closedAt.includes("T") && closedAt.length >= 19) return closedAt;
  return nowIso();
}

/** After Daily Stock Closing is saved, dashboard "today" counters start from this timestamp. */
export function resolveDailyDashboardPeriodStart(
  closings: Array<Pick<StockClosingRecord, "date" | "location" | "closedAt">>,
  workspace: import("@/lib/inventory-access").InventoryWorkspace = "all",
  today = todayKey(),
): string | null {
  const todays = closings.filter(
    (row) => row.date === today && (workspace === "all" || row.location === workspace),
  );
  if (todays.length === 0) return null;
  return (
    todays
      .map((row) => row.closedAt || `${row.date}T23:59:59.999Z`)
      .sort((a, b) => b.localeCompare(a))[0] ?? null
  );
}

/**
 * Branch-wide dashboard reset: any location/shift closing today resets
 * "today" KPIs for every role (cashier, waiter, manager, ops).
 */
export function resolveBranchDashboardPeriodStart(
  closings: Array<Pick<StockClosingRecord, "date" | "location" | "closedAt">>,
  today = todayKey(),
): string | null {
  return resolveDailyDashboardPeriodStart(closings, "all", today);
}

/** Latest ISO timestamp among candidates (used to combine branch + personal closing). */
export function latestDashboardCutoff(...candidates: Array<string | null | undefined>): string | undefined {
  const values = candidates.filter((value): value is string => Boolean(value && value.trim()));
  if (values.length === 0) return undefined;
  return values.sort((a, b) => b.localeCompare(a))[0];
}

export function isInDailyDashboardPeriod(
  entryDate: string,
  entryTimestamp: string | undefined,
  periodStart: string | null,
): boolean {
  if (!periodStart) return true;
  const ts =
    entryTimestamp && entryTimestamp.length >= 19
      ? entryTimestamp
      : `${entryDate}T00:00:00.000Z`;
  return ts > periodStart;
}

function money(value: number) {
  return Math.round((Number.isFinite(value) ? value : 0) * 100) / 100;
}

function qty(value: number) {
  return Math.round((Number.isFinite(value) ? value : 0) * 1000) / 1000;
}

function normalizedKey(value: string) {
  return value.trim().toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

function isWholeUnit(unit: StockUnitType) {
  return (
    unit === "bottle" ||
    unit === "case" ||
    unit === "pcs" ||
    unit === "piece" ||
    unit === "carton" ||
    unit === "double shot" ||
    unit === "single shot"
  );
}

export function stockUnitFromOrderUnitLabel(unitLabel?: string): StockUnitType | null {
  const key = (unitLabel ?? "").trim().toLowerCase();
  if (!key) return null;
  if (key === "bottle" || key === "bottles") return "bottle";
  if (key === "double shot" || key === "double shots" || key === "double") return "double shot";
  if (key === "single shot" || key === "single shots" || key === "single") return "single shot";
  return null;
}

/** True when the POS line is a half-bottle spirit sale (0.5 bottle stock). */
export function isHalfBottleUnitLabel(unitLabel?: string) {
  const key = (unitLabel ?? "").trim().toLowerCase();
  return key === "half bottle" || key === "half bottles" || key === "half";
}

export function spiritYieldForItem(item: Pick<StockManagedItem, "conversions" | "baseUnit">): {
  doublesPerBottle: number;
  singlesPerBottle: number;
} {
  const doublesRaw = convertStockQuantity(item, 1, "bottle", "double shot");
  const doublesPerBottle =
    Number.isFinite(doublesRaw) && doublesRaw > 0 ? qty(doublesRaw) : DEFAULT_DOUBLES_PER_BOTTLE;
  const singlesRaw = convertStockQuantity(item, 1, "bottle", "single shot");
  const singlesPerBottle =
    Number.isFinite(singlesRaw) && singlesRaw > 0 ? qty(singlesRaw) : qty(doublesPerBottle * 2);
  return { doublesPerBottle, singlesPerBottle };
}

/** Replace bottle↔shot conversion rules from a doubles-per-bottle yield. */
export function applySpiritYieldConversions(
  item: StockManagedItem,
  doublesPerBottle: number,
  bottleVolumeMl?: number,
): StockManagedItem {
  const doubles = Math.max(1, Math.round(doublesPerBottle));
  const singles = doubles * 2;
  const withoutPour = item.conversions.filter((rule) => {
    const pair = `${rule.fromUnit}->${rule.toUnit}`;
    return !(
      pair === "bottle->double shot" ||
      pair === "double shot->bottle" ||
      pair === "bottle->single shot" ||
      pair === "single shot->bottle"
    );
  });
  return {
    ...item,
    bottleVolumeMl: bottleVolumeMl && bottleVolumeMl > 0 ? bottleVolumeMl : undefined,
    conversions: [
      ...withoutPour,
      {
        id: `conv-${item.id}-double`,
        label: `1 bottle = ${doubles} double shots`,
        fromUnit: "bottle",
        toUnit: "double shot",
        multiplier: doubles,
      },
      {
        id: `conv-${item.id}-single`,
        label: `1 bottle = ${singles} single shots`,
        fromUnit: "bottle",
        toUnit: "single shot",
        multiplier: singles,
      },
    ],
    updatedAt: nowIso(),
  };
}

export function remainingSpiritPours(onHandBottles: number, item: Pick<StockManagedItem, "conversions" | "baseUnit">) {
  const { doublesPerBottle, singlesPerBottle } = spiritYieldForItem(item);
  const bottles = Math.max(0, onHandBottles);
  return {
    remainingDoubles: qty(bottles * doublesPerBottle),
    remainingSingles: qty(bottles * singlesPerBottle),
    doublesPerBottle,
    singlesPerBottle,
  };
}

export function normalizeStockLocation(location: string): StockLocation {
  if (location === "Warehouse") return "Store 1";
  if (location === "Butcher / Siga Bet") return "Butcher";
  return STOCK_LOCATIONS.includes(location as StockLocation) ? (location as StockLocation) : "Store 1";
}

export function isCentralStockLocation(location: StockLocation): location is CentralStockLocation {
  return CENTRAL_STOCK_LOCATIONS.includes(location as CentralStockLocation);
}

export function isOperationalStockLocation(location: StockLocation): location is OperationalStockLocation {
  return OPERATIONAL_STOCK_LOCATIONS.includes(location as OperationalStockLocation);
}

function ledgerIncomingTypes(type: StockLedgerEntryType) {
  return [
    "OPENING_BALANCE",
    "PURCHASE",
    "PURCHASE_RECEIPT",
    "GOAT_REGISTRATION",
    "TRANSFER_IN",
    "STORE_RETURN",
    "DEPARTMENT_RETURN",
    "CANCELLATION_REVERSAL",
  ].includes(type);
}

function ledgerOutgoingTypes(type: StockLedgerEntryType) {
  return [
    "TRANSFER_OUT",
    "POS_CONSUMPTION",
    "RECIPE_CONSUMPTION",
    "MANUAL_DEDUCTION",
    "WASTE",
    "DAMAGE",
    "EXPIRY",
    "STOCK_COUNT_ADJUSTMENT",
    "MANUAL_ADJUSTMENT",
    "DAILY_CONSUMPTION",
    "STAFF_CONSUMPTION",
  ].includes(type);
}

function canConvertQuantity(item: StockManagedItem, fromUnit: StockUnitType, toUnit: StockUnitType) {
  if (fromUnit === toUnit) return true;
  const converted = convertStockQuantity(item, 1, fromUnit, toUnit);
  return Number.isFinite(converted);
}

export function convertStockQuantity(
  item: Pick<StockManagedItem, "baseUnit" | "conversions">,
  quantity: number,
  fromUnit: StockUnitType,
  toUnit = item.baseUnit,
) {
  if (!Number.isFinite(quantity)) return Number.NaN;
  if (fromUnit === toUnit) return qty(quantity);

  const rules = [...item.conversions, ...DEFAULT_UNIT_CONVERSIONS.map((rule, index) => ({
    id: `default-conv-${index}`,
    label: rule.label,
    fromUnit: rule.fromUnit,
    toUnit: rule.toUnit,
    multiplier: rule.multiplier,
  }))];

  const direct = rules.find((rule) => rule.fromUnit === fromUnit && rule.toUnit === toUnit);
  if (direct) return qty(quantity * direct.multiplier);

  const reverse = rules.find((rule) => rule.fromUnit === toUnit && rule.toUnit === fromUnit);
  if (reverse && reverse.multiplier !== 0) return qty(quantity / reverse.multiplier);

  // Spirit pour fallback when item has no explicit bottle↔shot rules.
  const doubles = DEFAULT_DOUBLES_PER_BOTTLE;
  const singles = DEFAULT_DOUBLES_PER_BOTTLE * 2;
  if (fromUnit === "bottle" && toUnit === "double shot") return qty(quantity * doubles);
  if (fromUnit === "double shot" && toUnit === "bottle") return qty(quantity / doubles);
  if (fromUnit === "bottle" && toUnit === "single shot") return qty(quantity * singles);
  if (fromUnit === "single shot" && toUnit === "bottle") return qty(quantity / singles);
  if (fromUnit === "double shot" && toUnit === "single shot") return qty(quantity * 2);
  if (fromUnit === "single shot" && toUnit === "double shot") return qty(quantity / 2);

  return Number.NaN;
}

function locationKey(itemId: string, location: StockLocation) {
  return `${itemId}:${location}`;
}

function signedEntryQuantity(entry: StockLedgerEntry) {
  if (ledgerIncomingTypes(entry.type)) return entry.quantity;
  if (ledgerOutgoingTypes(entry.type)) return -entry.quantity;
  if (entry.type === "ADJUSTMENT") {
    if (entry.reason === "Returned") return entry.quantity;
    if (entry.reason === "Count correction") {
      const notes = entry.notes?.toLowerCase() ?? "";
      if (notes.includes("increase") || notes.includes("add") || notes.includes("plus") || notes.includes("+")) {
        return entry.quantity;
      }
    }
    return -entry.quantity;
  }
  return 0;
}

export function getLocationStockQuantity(
  items: StockManagedItem[],
  ledger: StockLedgerEntry[],
  itemId: string,
  location: StockLocation,
) {
  const balance = buildLocationBalances(items, ledger).find(
    (row) => row.itemId === itemId && row.location === location,
  );
  return qty(balance?.quantity ?? 0);
}

export function validateStockItem(item: StockManagedItem): StockValidationResult {
  if (!item.name.trim()) return { ok: false, error: "Item name is required." };
  if (item.purchasePrice < 0 || item.sellingPrice < 0 || (item.vipSellingPrice ?? 0) < 0) {
    return { ok: false, error: "Prices cannot be negative." };
  }
  if (item.currentStock < 0 || item.reorderLevel < 0) {
    return { ok: false, error: "Stock and reorder level cannot be negative." };
  }
  if (isWholeUnit(item.baseUnit) && !Number.isInteger(item.currentStock)) {
    return { ok: false, error: `Current stock for ${item.baseUnit} items must be a whole number.` };
  }
  for (const rule of item.conversions) {
    if (!rule.label.trim()) return { ok: false, error: "Each conversion rule needs a label." };
    if (!(rule.multiplier > 0)) return { ok: false, error: "Conversion multipliers must be greater than zero." };
  }
  return { ok: true };
}

export function validateStockLedgerEntry(
  items: StockManagedItem[],
  ledger: StockLedgerEntry[],
  entry: StockLedgerEntry,
  settings: InventoryControlSettings = DEFAULT_INVENTORY_CONTROL_SETTINGS,
): StockValidationResult {
  if (!(entry.quantity > 0)) return { ok: false, error: "Quantity must be greater than zero." };
  if (isWholeUnit(entry.unit) && !Number.isInteger(entry.quantity)) {
    return { ok: false, error: `${entry.unit} quantities must be whole numbers.` };
  }

  const stockTypes: StockLedgerEntryType[] = [
    "OPENING_BALANCE",
    "PURCHASE",
    "PURCHASE_RECEIPT",
    "GOAT_REGISTRATION",
    "TRANSFER_OUT",
    "TRANSFER_IN",
    "STORE_RETURN",
    "DEPARTMENT_RETURN",
    "ADJUSTMENT",
    "MANUAL_DEDUCTION",
    "POS_CONSUMPTION",
    "RECIPE_CONSUMPTION",
    "WASTE",
    "DAMAGE",
    "EXPIRY",
    "STOCK_COUNT_ADJUSTMENT",
    "MANUAL_ADJUSTMENT",
    "DAILY_CONSUMPTION",
    "CANCELLATION_REVERSAL",
    "STAFF_CONSUMPTION",
  ];

  if (!stockTypes.includes(entry.type)) return { ok: true };
  if (!entry.itemId) return { ok: false, error: "A stock item is required for this transaction." };

  const item = items.find((candidate) => candidate.id === entry.itemId);
  if (!item) return { ok: false, error: "Selected stock item was not found." };

  if (!canConvertQuantity(item, entry.unit, item.baseUnit)) {
    return { ok: false, error: `Cannot convert ${entry.unit} to ${item.baseUnit} for ${item.name}.` };
  }

  const baseQuantity = convertStockQuantity(item, entry.quantity, entry.unit, item.baseUnit);
  if (!(baseQuantity > 0)) return { ok: false, error: "Quantity conversion failed for this stock item." };

  const allowNegative = settings.allowNegativeStock;

  if (entry.type === "TRANSFER_OUT") {
    if (!entry.fromLocation || !entry.toLocation) {
      return { ok: false, error: "Transfer entries require both source and destination locations." };
    }
    if (entry.fromLocation === entry.toLocation) {
      return { ok: false, error: "Source and destination locations must be different." };
    }
    const available = getLocationStockQuantity(items, ledger, item.id, entry.fromLocation);
    if (!allowNegative && available < baseQuantity) {
      return { ok: false, error: `Insufficient stock in ${entry.fromLocation}. Available: ${available} ${item.baseUnit}.` };
    }
  }

  if (ledgerOutgoingTypes(entry.type) && entry.type !== "TRANSFER_OUT") {
    const normalizedLocation = normalizeStockLocation(String(entry.location));
    const available = STOCK_LOCATIONS.includes(normalizedLocation)
      ? getLocationStockQuantity(items, ledger, item.id, normalizedLocation)
      : 0;
    if (!allowNegative && available < baseQuantity) {
      return { ok: false, error: `Insufficient stock in ${entry.location}. Available: ${available} ${item.baseUnit}.` };
    }
  }

  if (entry.type === "ADJUSTMENT" && entry.reason !== "Returned") {
    const isIncrease = entry.reason === "Count correction" && /increase|add|plus|\+/i.test(entry.notes ?? "");
    if (!isIncrease && STOCK_LOCATIONS.includes(entry.location as StockLocation)) {
      const available = getLocationStockQuantity(items, ledger, item.id, entry.location as StockLocation);
      if (!allowNegative && available < baseQuantity) {
        return { ok: false, error: `Insufficient stock in ${entry.location}. Available: ${available} ${item.baseUnit}.` };
      }
    }
  }

  return { ok: true };
}

/** Posted ledger rows are immutable: only appends are allowed. Corrections use reversal vouchers. */
export function assertLedgerAppendOnly(previous: StockLedgerEntry[], next: StockLedgerEntry[]): StockValidationResult {
  const nextById = new Map(next.map((entry) => [entry.id, entry]));
  for (const prev of previous) {
    const immutable = prev.immutable !== false;
    if (!immutable) continue;
    const found = nextById.get(prev.id);
    if (!found) {
      return { ok: false, error: `Immutable ledger entry ${prev.id} cannot be deleted. Use a cancellation reversal voucher.` };
    }
    if (
      found.type !== prev.type ||
      found.quantity !== prev.quantity ||
      found.itemId !== prev.itemId ||
      found.location !== prev.location ||
      found.referenceNo !== prev.referenceNo ||
      found.fromLocation !== prev.fromLocation ||
      found.toLocation !== prev.toLocation
    ) {
      return { ok: false, error: `Immutable ledger entry ${prev.id} cannot be edited. Use a cancellation reversal voucher.` };
    }
  }
  return { ok: true };
}

export function appendImmutableLedgerEntries(existing: StockLedgerEntry[], entries: StockLedgerEntry[]) {
  return [...entries.map((entry) => ({ ...entry, immutable: true as const })), ...existing];
}

export const STOCK_MODULE_KEYS = {
  items: "stock-items",
  ledger: "stock-ledger",
  recipes: "stock-recipes",
  closings: "stock-closings",
  purchaseRequisitions: "stock-purchase-requisitions",
  purchaseOrders: "stock-purchase-orders",
  goodsReceivingVouchers: "stock-goods-receiving-vouchers",
  storeIssueVouchers: "stock-store-issue-vouchers",
  storeTransferVouchers: "stock-store-transfer-vouchers",
  goodsReturnVouchers: "stock-goods-return-vouchers",
  stockAdjustmentVouchers: "stock-adjustment-vouchers",
  cancellationReversals: "stock-cancellation-reversals",
  receivings: "stock-receivings",
  transfers: "stock-transfers",
  requests: "stock-requests",
  returns: "stock-returns",
  losses: "stock-losses",
  counts: "stock-counts",
  settings: "stock-inventory-settings",
  lots: "stock-lots",
  locationPolicies: "stock-location-policies",
  posReservations: "stock-pos-reservations",
  posShiftSessions: "stock-pos-shift-sessions",
  posNegativeSaleAttempts: "stock-pos-negative-sale-attempts",
  goatRegistrations: "goat-registrations",
  dailyConsumptions: "daily-consumptions",
  staffConsumptions: "staff-consumptions",
  staffBreakages: "staff-breakages",
} as const;

/** Empty fallbacks when Supabase is configured (DB is the source of truth). */
export const EMPTY_STOCK_ITEMS: StockManagedItem[] = [];
export const EMPTY_STOCK_LEDGER: StockLedgerEntry[] = [];
export const EMPTY_STOCK_RECIPES: StockRecipe[] = [];

const STOCK_SEED_PURGE_FLAG = "bl_stock_seed_purge_v4";

/** One-time clear of locally cached stock seed data so empty DB stays empty. */
if (typeof window !== "undefined" && isSupabaseConfigured) {
  try {
    if (!window.localStorage.getItem(STOCK_SEED_PURGE_FLAG)) {
      for (const moduleKey of Object.values(STOCK_MODULE_KEYS)) {
        window.localStorage.removeItem(`bl_module_records_${moduleKey}`);
        window.localStorage.removeItem(`bl_module_records_pending_sync_${moduleKey}`);
      }
      window.localStorage.setItem(STOCK_SEED_PURGE_FLAG, "1");
    }
  } catch {
    // ignore storage errors
  }
}

export const STOCK_INVENTORY_SETTINGS_SEED: InventorySettingsRecord[] = [DEFAULT_INVENTORY_SETTINGS];
export const STOCK_LOTS_SEED: StockLot[] = [];
export const STOCK_GOAT_REGISTRATIONS_SEED: GoatRegistration[] = [];
export const STOCK_DAILY_CONSUMPTIONS_SEED: DailyConsumptionDocument[] = [];
export const STOCK_STAFF_CONSUMPTIONS_SEED: StaffConsumptionDocument[] = [];
export const STOCK_STAFF_BREAKAGES_SEED: StaffBreakageDocument[] = [];
export const STOCK_LOCATION_POLICIES_SEED: LocationStockPolicy[] = [];
export const STOCK_POS_RESERVATIONS_SEED: PosStockReservation[] = [];
export const STOCK_POS_SHIFT_SESSIONS_SEED: PosShiftSession[] = [];
export const STOCK_POS_NEGATIVE_SALE_ATTEMPTS_SEED: PosNegativeSaleAttempt[] = [];

/** Built-in unit pairs used when an item has no explicit conversion rule. */
export const DEFAULT_UNIT_CONVERSIONS: Array<{ fromUnit: StockUnitType; toUnit: StockUnitType; multiplier: number; label: string }> = [
  { fromUnit: "case", toUnit: "bottle", multiplier: 12, label: "1 case = 12 bottles" },
  { fromUnit: "crate", toUnit: "bottle", multiplier: 24, label: "1 crate = 24 bottles" },
  { fromUnit: "carton", toUnit: "piece", multiplier: 24, label: "1 carton = 24 pieces" },
  { fromUnit: "carton", toUnit: "pcs", multiplier: 24, label: "1 carton = 24 pcs" },
  { fromUnit: "kg", toUnit: "gram", multiplier: 1000, label: "1 kg = 1000 gram" },
  { fromUnit: "liter", toUnit: "millilitre", multiplier: 1000, label: "1 liter = 1000 millilitre" },
];

export function isLotExpired(lot: Pick<StockLot, "expiryDate" | "status">, asOf = todayKey()) {
  if (lot.status === "Expired") return true;
  if (!lot.expiryDate) return false;
  return lot.expiryDate.slice(0, 10) <= asOf;
}

export function isLotIssuable(lot: StockLot, asOf = todayKey()) {
  if (lot.status !== "Available") return false;
  if (isLotExpired(lot, asOf)) return false;
  return lot.quantity > 0;
}

export function calculateWeightedAverageCost(currentQty: number, currentUnitCost: number, incomingQty: number, incomingUnitCost: number) {
  const onHand = Math.max(0, currentQty);
  const incoming = Math.max(0, incomingQty);
  if (onHand + incoming <= 0) return money(incomingUnitCost);
  return money((onHand * currentUnitCost + incoming * incomingUnitCost) / (onHand + incoming));
}

export function resolveItemUnitCost(item: StockManagedItem, settings: InventorySettingsRecord = DEFAULT_INVENTORY_SETTINGS) {
  if (settings.costingMethod === "Standard Cost") {
    return money(item.standardCost ?? item.purchasePrice);
  }
  return money(item.purchasePrice);
}

export function selectFefoLots(
  lots: StockLot[],
  itemId: string,
  location: StockLocation,
  quantityNeeded: number,
  asOf = todayKey(),
): { allocations: FefoAllocation[]; remaining: number } {
  const available = lots
    .filter((lot) => lot.itemId === itemId && lot.location === location && isLotIssuable(lot, asOf))
    .sort((a, b) => {
      const aExpiry = a.expiryDate || "9999-12-31";
      const bExpiry = b.expiryDate || "9999-12-31";
      const byExpiry = aExpiry.localeCompare(bExpiry);
      if (byExpiry !== 0) return byExpiry;
      return a.receivedAt.localeCompare(b.receivedAt);
    });

  let remaining = qty(quantityNeeded);
  const allocations: FefoAllocation[] = [];
  for (const lot of available) {
    if (!(remaining > 0)) break;
    const take = qty(Math.min(lot.quantity, remaining));
    if (!(take > 0)) continue;
    allocations.push({
      lotId: lot.id,
      batchNumber: lot.batchNumber,
      expiryDate: lot.expiryDate,
      quantity: take,
      unitCost: lot.unitCost,
    });
    remaining = qty(remaining - take);
  }
  return { allocations, remaining };
}

export function applyLotAllocations(lots: StockLot[], allocations: FefoAllocation[]): StockLot[] {
  const byId = new Map(allocations.map((row) => [row.lotId, row.quantity]));
  return lots.map((lot) => {
    const take = byId.get(lot.id);
    if (!take) return lot;
    return { ...lot, quantity: qty(Math.max(0, lot.quantity - take)) };
  }).filter((lot) => lot.quantity > 0 || lot.status !== "Available");
}

export function receiveIntoLots(
  lots: StockLot[],
  input: {
    itemId: string;
    itemName: string;
    location: StockLocation;
    quantity: number;
    unit: StockUnitType;
    unitCost: number;
    batchNumber?: string;
    manufacturingDate?: string;
    expiryDate?: string;
    referenceNo?: string;
    status?: StockLotStatus;
  },
): StockLot[] {
  const lot: StockLot = {
    id: `lot-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    itemId: input.itemId,
    itemName: input.itemName,
    location: input.location,
    batchNumber: input.batchNumber?.trim() || `BATCH-${todayKey()}`,
    manufacturingDate: input.manufacturingDate,
    expiryDate: input.expiryDate,
    quantity: qty(input.quantity),
    unit: input.unit,
    unitCost: money(input.unitCost),
    status: input.status ?? (input.expiryDate && isLotExpired({ expiryDate: input.expiryDate, status: "Available" }) ? "Expired" : "Available"),
    receivedAt: nowIso(),
    referenceNo: input.referenceNo,
  };
  return [lot, ...lots];
}

export function quarantineLotsForReturn(
  lots: StockLot[],
  itemId: string,
  location: StockLocation,
  quantity: number,
  reason: string,
): StockLot[] {
  const damaged = /damage|expired|near expiry|spoil/i.test(reason);
  if (!damaged) return lots;
  const { allocations } = selectFefoLots(lots, itemId, location, quantity);
  if (allocations.length === 0) {
    return receiveIntoLots(lots, {
      itemId,
      itemName: lots.find((lot) => lot.itemId === itemId)?.itemName || itemId,
      location,
      quantity,
      unit: "pcs",
      unitCost: 0,
      status: "Quarantine",
      batchNumber: `Q-${Date.now()}`,
    });
  }
  const takeIds = new Set(allocations.map((row) => row.lotId));
  return lots.map((lot) => (takeIds.has(lot.id) ? { ...lot, status: "Quarantine" as const } : lot));
}

export function getLocationPolicy(
  policies: LocationStockPolicy[],
  itemId: string,
  location: StockLocation,
) {
  return policies.find((row) => row.itemId === itemId && row.location === location);
}

export function suggestedReorderQuantity(
  policy: LocationStockPolicy | undefined,
  availableQuantity: number,
  fallbackReorderLevel: number,
) {
  if (policy) {
    if (availableQuantity > policy.reorderLevel) return 0;
    return qty(Math.max(policy.reorderQuantity, policy.maximumStock - availableQuantity, 0));
  }
  if (availableQuantity > fallbackReorderLevel) return 0;
  return qty(Math.max(fallbackReorderLevel - availableQuantity, 0));
}

export function buildExpiryAlerts(lots: StockLot[], withinDays = 30, asOf = new Date()) {
  const asOfKey = asOf.toISOString().slice(0, 10);
  const limit = new Date(asOf);
  limit.setDate(limit.getDate() + withinDays);
  const limitKey = limit.toISOString().slice(0, 10);
  return lots
    .filter((lot) => lot.quantity > 0)
    .map((lot) => {
      const expired = isLotExpired(lot, asOfKey);
      const expiringSoon = !expired && !!lot.expiryDate && lot.expiryDate.slice(0, 10) <= limitKey;
      return {
        ...lot,
        alert: expired ? ("Expired" as const) : lot.status === "Quarantine" || lot.status === "Blocked" || lot.status === "Recalled" ? lot.status : expiringSoon ? ("Expiring soon" as const) : null,
      };
    })
    .filter((lot) => lot.alert != null);
}

export function buildStockValuationReport(
  items: StockManagedItem[],
  ledger: StockLedgerEntry[],
  lots: StockLot[] = [],
  settings: InventorySettingsRecord = DEFAULT_INVENTORY_SETTINGS,
  transfers: StockTransferRecord[] = [],
  policies: LocationStockPolicy[] = [],
) {
  const balances = buildLocationBalances(items, ledger, transfers, policies, settings, lots);
  return balances.map((row) => ({
    ...row,
    costingMethod: settings.costingMethod,
  }));
}

export function buildBatchReport(lots: StockLot[]) {
  return [...lots].sort((a, b) => a.itemName.localeCompare(b.itemName) || (a.expiryDate || "").localeCompare(b.expiryDate || ""));
}

export function buildPurchaseOrderReceivingReport(purchaseOrders: PurchaseOrderDocument[], goodsReceiving: GoodsReceivingVoucherDocument[]) {
  return purchaseOrders.map((order) => {
    const receipts = goodsReceiving.filter((row) => row.purchaseOrderReference === order.purchaseOrderNumber);
    const receivedQty = order.lines.reduce((sum, line) => sum + line.receivedQuantity, 0);
    const orderedQty = order.lines.reduce((sum, line) => sum + line.orderedQuantity, 0);
    return {
      purchaseOrderNumber: order.purchaseOrderNumber,
      supplier: order.supplier,
      destinationStore: order.destinationStore,
      status: order.status,
      orderedQty,
      receivedQty,
      receiptCount: receipts.length,
      grvNumbers: receipts.map((row) => row.grvNumber).join(", "),
    };
  });
}

export function buildApprovalActivityReport(documents: Array<{ documentType: string; documentNumber: string; approvalHistory: InventoryApprovalHistoryEntry[] }>) {
  return documents.flatMap((doc) =>
    doc.approvalHistory.map((entry) => ({
      documentType: doc.documentType,
      documentNumber: doc.documentNumber,
      action: entry.action,
      actedBy: entry.actedBy,
      actedAt: entry.actedAt,
      notes: entry.notes || "",
    })),
  ).sort((a, b) => b.actedAt.localeCompare(a.actedAt));
}

export function exportRowsToCsv(headers: string[], rows: Array<Array<string | number>>) {
  const escape = (value: string | number) => {
    const text = String(value ?? "");
    if (/[",\n]/.test(text)) return `"${text.replace(/"/g, '""')}"`;
    return text;
  };
  return [headers.map(escape).join(","), ...rows.map((row) => row.map(escape).join(","))].join("\n");
}

/** Build a real .xlsx ArrayBuffer (SheetJS). */
export async function exportRowsToXlsx(
  sheetName: string,
  headers: string[],
  rows: Array<Array<string | number>>,
) {
  const XLSX = await import("xlsx");
  const worksheet = XLSX.utils.aoa_to_sheet([headers, ...rows.map((row) => row.map((cell) => cell ?? ""))]);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, sheetName.slice(0, 31) || "Sheet1");
  return XLSX.write(workbook, { bookType: "xlsx", type: "array" }) as Uint8Array;
}

export function downloadXlsxBytes(filename: string, bytes: Uint8Array) {
  if (typeof window === "undefined") return;
  const blob = new Blob([bytes], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename.endsWith(".xlsx") ? filename : `${filename}.xlsx`;
  anchor.click();
  URL.revokeObjectURL(url);
}

export function buildConsumptionReport(
  ledger: StockLedgerEntry[],
  fromDate?: string,
  toDate?: string,
) {
  return ledger
    .filter((entry) => ["POS_CONSUMPTION", "RECIPE_CONSUMPTION", "MANUAL_DEDUCTION", "DAILY_CONSUMPTION", "EXPENSE", "WASTE", "DAMAGE"].includes(entry.type))
    .filter((entry) => (!fromDate || entry.date >= fromDate) && (!toDate || entry.date <= toDate))
    .map((entry) => ({
      date: entry.date,
      type: entry.type,
      itemName: entry.itemName,
      location: String(entry.location),
      quantity: entry.quantity,
      unit: entry.unit,
      totalCost: entry.totalCost,
      referenceNo: entry.referenceNo || "",
      enteredBy: entry.enteredBy,
    }))
    .sort((a, b) => b.date.localeCompare(a.date));
}

export function buildStockMovementSummary(ledger: StockLedgerEntry[], fromDate?: string, toDate?: string) {
  const scoped = ledger.filter((entry) => (!fromDate || entry.date >= fromDate) && (!toDate || entry.date <= toDate));
  const byType = new Map<string, { type: string; count: number; quantity: number; value: number }>();
  for (const entry of scoped) {
    const current = byType.get(entry.type) ?? { type: entry.type, count: 0, quantity: 0, value: 0 };
    current.count += 1;
    current.quantity = qty(current.quantity + entry.quantity);
    current.value = money(current.value + entry.totalCost);
    byType.set(entry.type, current);
  }
  return [...byType.values()].sort((a, b) => a.type.localeCompare(b.type));
}

export function buildCountVarianceReport(counts: StockCountSession[]) {
  return counts.flatMap((session) =>
    session.lines.map((line) => ({
      countSessionNumber: session.countSessionNumber,
      location: session.location,
      countDate: session.countDate,
      status: session.status,
      blindCount: Boolean(session.blindCount),
      itemName: line.itemName,
      expectedQuantity: line.expectedQuantity,
      countedQuantity: line.countedQuantity,
      variance: line.variance,
      varianceValue: line.varianceValue,
      countedBy: session.countedBy,
      approvedBy: session.approvedBy || "",
    })),
  );
}

export function createPhysicalCountSession(input: {
  location: StockLocation;
  itemId: string;
  itemName: string;
  unit: StockUnitType;
  countedQuantity: number;
  expectedQuantity: number;
  unitCost: number;
  countedBy: string;
  blindCount?: boolean;
  notes?: string;
}): StockCountSession {
  const variance = qty(input.countedQuantity - input.expectedQuantity);
  return {
    id: `count-${Date.now()}`,
    countSessionNumber: generateInventoryDocumentNumber("CNT"),
    location: input.location,
    countDate: todayKey(),
    countedBy: input.countedBy,
    status: "Submitted",
    blindCount: Boolean(input.blindCount),
    notes: input.notes,
    approvalHistory: [historyEntry("Submitted", input.countedBy, input.blindCount ? "Blind count" : "Open count")],
    lines: [{
      id: `count-line-${Date.now()}`,
      itemId: input.itemId,
      itemName: input.itemName,
      unit: input.unit,
      expectedQuantity: input.expectedQuantity,
      countedQuantity: qty(input.countedQuantity),
      variance,
      varianceValue: money(variance * input.unitCost),
      reason: input.notes,
    }],
  };
}

function assertActorLocation(actor: InventoryActorContext, location: StockLocation, action: string) {
  if (actor.allowedLocations && actor.allowedLocations.length > 0 && !actor.allowedLocations.includes(location)) {
    throw new Error(`You are not authorized to ${action} stock at ${location}.`);
  }
}

export function createPhysicalCountSessionAsActor(
  input: Omit<Parameters<typeof createPhysicalCountSession>[0], "countedBy">,
  actor: InventoryActorContext,
) {
  assertActorLocation(actor, input.location, "count");
  return createPhysicalCountSession({ ...input, countedBy: actor.userName });
}

export function approveAndPostPhysicalCount(
  session: StockCountSession,
  approvedBy: string,
  items: StockManagedItem[],
  existingLedger: StockLedgerEntry[],
) {
  if (!["Submitted", "Reviewed"].includes(session.status)) {
    throw new Error("Only submitted or reviewed counts can be approved and posted.");
  }
  if (sameInventoryActor(session.countedBy, approvedBy)) {
    throw new Error("Counters cannot approve and post their own physical counts.");
  }
  const line = session.lines[0];
  if (!line) throw new Error("Count session has no lines.");
  const item = items.find((row) => row.id === line.itemId);
  if (!item) throw new Error("Counted item was not found.");

  const posted: StockCountSession = {
    ...session,
    status: "Posted",
    reviewedBy: approvedBy,
    approvedBy,
    approvalHistory: [historyEntry("Posted", approvedBy), historyEntry("Approved", approvedBy), ...(session.approvalHistory || [])],
  };

  if (line.variance === 0) {
    return { count: posted, ledger: existingLedger, ledgerEntries: [] as StockLedgerEntry[] };
  }

  const directionNote = line.variance > 0 ? "increase" : "decrease";
  const entry = buildLedgerEntry({
    id: `sled-cnt-${session.id}`,
    type: "ADJUSTMENT",
    date: session.countDate,
    itemId: item.id,
    itemName: item.name,
    category: item.category,
    location: session.location,
    quantity: Math.abs(line.variance),
    unit: line.unit,
    unitPrice: item.purchasePrice,
    totalCost: money(Math.abs(line.variance) * item.purchasePrice),
    enteredBy: approvedBy,
    approvedBy,
    reason: "Count correction",
    notes: `${directionNote}${session.notes ? ` • ${session.notes}` : ""}`,
    referenceNo: session.countSessionNumber,
  });
  const validation = validateStockLedgerEntry(items, existingLedger, entry);
  if (!validation.ok) throw new Error(validation.error);

  return {
    count: posted,
    ledger: appendImmutableLedgerEntries(existingLedger, [entry]),
    ledgerEntries: [entry],
  };
}

export function approveAndPostPhysicalCountAsActor(
  session: StockCountSession,
  actor: InventoryActorContext,
  items: StockManagedItem[],
  existingLedger: StockLedgerEntry[],
) {
  assertActorLocation(actor, session.location, "approve counts at");
  const permissions = inventoryPermissionSetForActor(actor);
  if (!permissions.canApproveAdjustments && !permissions.canApproveRequests) {
    throw new Error("You are not authorized to approve physical counts.");
  }
  return approveAndPostPhysicalCount(session, actor.userName, items, existingLedger);
}

export function openInventoryPrintReport(title: string, headers: string[], rows: Array<Array<string | number>>) {
  if (typeof window === "undefined") return;
  const tableRows = rows
    .map((row) => `<tr>${row.map((cell) => `<td style="border:1px solid #ccc;padding:6px;font-size:12px;">${String(cell)}</td>`).join("")}</tr>`)
    .join("");
  const html = `<!doctype html><html><head><title>${title}</title></head><body style="font-family:Segoe UI,sans-serif;padding:24px;">
    <h1 style="font-size:18px;margin:0 0 8px;">${title}</h1>
    <p style="color:#666;font-size:12px;margin:0 0 16px;">Generated ${new Date().toLocaleString()}</p>
    <table style="border-collapse:collapse;width:100%;">
      <thead><tr>${headers.map((h) => `<th style="border:1px solid #ccc;padding:6px;text-align:left;background:#f5f5f5;font-size:12px;">${h}</th>`).join("")}</tr></thead>
      <tbody>${tableRows || `<tr><td colspan="${headers.length}" style="padding:12px;text-align:center;color:#666;">No rows</td></tr>`}</tbody>
    </table>
    <script>window.onload=()=>{window.print();}</script>
  </body></html>`;
  const popup = window.open("", "_blank", "noopener,noreferrer,width=960,height=720");
  if (!popup) return;
  popup.document.write(html);
  popup.document.close();
}

export const STOCK_ITEMS_SEED: StockManagedItem[] = [
  {
    id: "stk-whisky-black-label",
    name: "Black Label Whisky",
    category: "Whisky",
    baseUnit: "bottle",
    purchasePrice: 4200,
    sellingPrice: 5200,
    vipSellingPrice: 5600,
    reorderLevel: 6,
    currentStock: 18,
    preferredLocation: "Store 1",
    supplierName: "Addis Beverage Supply",
    conversions: [
      { id: "conv-whisky-case", label: "1 case = 12 bottles", fromUnit: "case", toUnit: "bottle", multiplier: 12 },
      { id: "conv-whisky-double", label: "1 bottle = 16 double shots", fromUnit: "bottle", toUnit: "double shot", multiplier: 16 },
      { id: "conv-whisky-single", label: "1 bottle = 32 single shots", fromUnit: "bottle", toUnit: "single shot", multiplier: 32 },
    ],
    bottleVolumeMl: 750,
    createdAt: nowIso(),
    updatedAt: nowIso(),
  },
  {
    id: "stk-amarula",
    name: "Amarula",
    category: "Whisky",
    baseUnit: "bottle",
    purchasePrice: 2800,
    sellingPrice: 20000,
    vipSellingPrice: 20000,
    reorderLevel: 4,
    currentStock: 12,
    preferredLocation: "VIP Bar",
    supplierName: "Addis Beverage Supply",
    conversions: [
      { id: "conv-amarula-case", label: "1 case = 12 bottles", fromUnit: "case", toUnit: "bottle", multiplier: 12 },
      { id: "conv-amarula-double", label: "1 bottle = 25 double shots", fromUnit: "bottle", toUnit: "double shot", multiplier: 25 },
      { id: "conv-amarula-single", label: "1 bottle = 50 single shots", fromUnit: "bottle", toUnit: "single shot", multiplier: 50 },
    ],
    bottleVolumeMl: 750,
    createdAt: nowIso(),
    updatedAt: nowIso(),
  },
  {
    id: "stk-beer-habesha",
    name: "Habesha Beer",
    category: "Beer",
    baseUnit: "bottle",
    purchasePrice: 70,
    sellingPrice: 120,
    vipSellingPrice: 150,
    beerTier: "normal",
    reorderLevel: 48,
    currentStock: 240,
    preferredLocation: "Store 1",
    supplierName: "Dashen Brewery",
    conversions: [
      { id: "conv-beer-case", label: "1 case = 12 bottles", fromUnit: "case", toUnit: "bottle", multiplier: 12 },
    ],
    createdAt: nowIso(),
    updatedAt: nowIso(),
  },
  {
    id: "stk-beer-heineken",
    name: "Heineken",
    category: "Beer",
    baseUnit: "bottle",
    purchasePrice: 85,
    sellingPrice: 140,
    vipSellingPrice: 300,
    beerTier: "special",
    reorderLevel: 24,
    currentStock: 72,
    preferredLocation: "Main Bar",
    supplierName: "Addis Beverage Supply",
    conversions: [
      { id: "conv-heineken-case", label: "1 case = 12 bottles", fromUnit: "case", toUnit: "bottle", multiplier: 12 },
    ],
    createdAt: nowIso(),
    updatedAt: nowIso(),
  },
  {
    id: "stk-beer-bedele",
    name: "Bedele",
    category: "Beer",
    baseUnit: "bottle",
    purchasePrice: 65,
    sellingPrice: 140,
    vipSellingPrice: 300,
    beerTier: "special",
    reorderLevel: 36,
    currentStock: 96,
    preferredLocation: "Main Bar",
    supplierName: "Bedele Brewery",
    conversions: [
      { id: "conv-bedele-case", label: "1 case = 12 bottles", fromUnit: "case", toUnit: "bottle", multiplier: 12 },
    ],
    createdAt: nowIso(),
    updatedAt: nowIso(),
  },
  {
    id: "stk-beer-arada",
    name: "Arada",
    category: "Beer",
    baseUnit: "bottle",
    purchasePrice: 65,
    sellingPrice: 140,
    vipSellingPrice: 300,
    beerTier: "special",
    reorderLevel: 36,
    currentStock: 84,
    preferredLocation: "Main Bar",
    supplierName: "Dashen Brewery",
    conversions: [
      { id: "conv-arada-case", label: "1 case = 12 bottles", fromUnit: "case", toUnit: "bottle", multiplier: 12 },
    ],
    createdAt: nowIso(),
    updatedAt: nowIso(),
  },
  {
    id: "stk-beer-dashen",
    name: "Dashen",
    category: "Beer",
    baseUnit: "bottle",
    purchasePrice: 60,
    sellingPrice: 140,
    vipSellingPrice: 300,
    beerTier: "normal",
    reorderLevel: 48,
    currentStock: 120,
    preferredLocation: "Main Bar",
    supplierName: "Dashen Brewery",
    conversions: [
      { id: "conv-dashen-case", label: "1 case = 12 bottles", fromUnit: "case", toUnit: "bottle", multiplier: 12 },
    ],
    createdAt: nowIso(),
    updatedAt: nowIso(),
  },
  {
    id: "stk-water-ambo",
    name: "Ambo Water",
    category: "Water",
    baseUnit: "bottle",
    purchasePrice: 18,
    sellingPrice: 35,
    vipSellingPrice: 45,
    reorderLevel: 72,
    currentStock: 144,
    preferredLocation: "Store 2",
    supplierName: "Ambo Mineral Water",
    conversions: [
      { id: "conv-water-case", label: "1 case = 12 bottles", fromUnit: "case", toUnit: "bottle", multiplier: 12 },
    ],
    createdAt: nowIso(),
    updatedAt: nowIso(),
  },
  {
    id: "stk-beef-prime",
    name: "Prime Beef",
    category: "Meat",
    baseUnit: "kg",
    purchasePrice: 780,
    sellingPrice: 0,
    reorderLevel: 25,
    currentStock: 64,
    preferredLocation: "Butcher",
    supplierName: "Merkato Meat Traders",
    conversions: [],
    createdAt: nowIso(),
    updatedAt: nowIso(),
  },
  {
    id: "stk-coffee-beans",
    name: "Coffee Beans",
    category: "Coffee House",
    baseUnit: "kg",
    purchasePrice: 620,
    sellingPrice: 0,
    reorderLevel: 8,
    currentStock: 22,
    preferredLocation: "Coffee House",
    supplierName: "Sidama Coffee Union",
    conversions: [],
    createdAt: nowIso(),
    updatedAt: nowIso(),
  },
  {
    id: "stk-tea-leaves",
    name: "Tea Leaves",
    category: "Coffee House",
    baseUnit: "kg",
    purchasePrice: 280,
    sellingPrice: 0,
    reorderLevel: 4,
    currentStock: 10,
    preferredLocation: "Coffee House",
    supplierName: "Sidama Coffee Union",
    conversions: [],
    notes: "Coffee House raw stock — tea / lemon tea daily consumption",
    createdAt: nowIso(),
    updatedAt: nowIso(),
  },
  {
    id: "stk-ginger",
    name: "Ginger",
    category: "Coffee House",
    baseUnit: "kg",
    purchasePrice: 180,
    sellingPrice: 0,
    reorderLevel: 2,
    currentStock: 5,
    preferredLocation: "Coffee House",
    supplierName: "Atikilt Supplier PLC",
    conversions: [],
    notes: "Coffee House raw stock — Keshir daily consumption (kg)",
    createdAt: nowIso(),
    updatedAt: nowIso(),
  },
  {
    id: "stk-nuts",
    name: "Nuts (Lewuz)",
    category: "Coffee House",
    baseUnit: "kg",
    purchasePrice: 450,
    sellingPrice: 0,
    reorderLevel: 2,
    currentStock: 4,
    preferredLocation: "Coffee House",
    supplierName: "Merkato Dry Goods",
    conversions: [],
    notes: "Coffee House raw stock — nuts tea / Lewuz daily consumption (kg)",
    createdAt: nowIso(),
    updatedAt: nowIso(),
  },
  {
    id: "stk-milk",
    name: "Milk",
    category: "Coffee House",
    baseUnit: "liter",
    purchasePrice: 85,
    sellingPrice: 0,
    reorderLevel: 10,
    currentStock: 20,
    preferredLocation: "Coffee House",
    supplierName: "Dairy Supply",
    conversions: [],
    notes: "Coffee House raw stock — milk cups via daily consumption (liter)",
    createdAt: nowIso(),
    updatedAt: nowIso(),
  },
  {
    id: "stk-onion",
    name: "Onion",
    category: "Kitchen",
    baseUnit: "kg",
    purchasePrice: 45,
    sellingPrice: 0,
    reorderLevel: 20,
    currentStock: 55,
    preferredLocation: "Kitchen",
    supplierName: "Atikilt Supplier PLC",
    conversions: [],
    createdAt: nowIso(),
    updatedAt: nowIso(),
  },
];

export const STOCK_LEDGER_SEED: StockLedgerEntry[] = [
  {
    id: "sled-1",
    type: "PURCHASE",
    date: todayKey(),
    itemId: "stk-beer-habesha",
    itemName: "Habesha Beer",
    category: "Beer",
    location: "Store 1",
    quantity: 10,
    unit: "case",
    unitPrice: 840,
    totalCost: 8400,
    paymentStatus: "Pending",
    supplierName: "Dashen Brewery",
    enteredBy: "System Seed",
    notes: "Opening stock seed",
    referenceNo: "PUR-001",
  },
  {
    id: "sled-2",
    type: "TRANSFER_IN",
    date: todayKey(),
    itemId: "stk-whisky-black-label",
    itemName: "Black Label Whisky",
    category: "Whisky",
    location: "VIP Bar",
    fromLocation: "Store 1",
    toLocation: "VIP Bar",
    quantity: 6,
    unit: "bottle",
    totalCost: 25200,
    approvedBy: "Liya Demeke",
    receivedBy: "Mulugeta Asfaw",
    enteredBy: "System Seed",
    referenceNo: "TR-001",
  },
  {
    id: "sled-3",
    type: "EXPENSE",
    date: todayKey(),
    itemName: "Cleaning materials",
    location: "General Service / Tekilala Agelglot",
    quantity: 4,
    unit: "pcs",
    unitPrice: 180,
    totalCost: 720,
    paymentMethod: "Cash",
    enteredBy: "System Seed",
    notes: "Daily opening supplies",
  },
  {
    id: "sled-4",
    type: "OPENING_BALANCE",
    date: todayKey(),
    itemId: "stk-beer-habesha",
    itemName: "Habesha Beer",
    category: "Beer",
    location: "Main Bar",
    quantity: 48,
    unit: "bottle",
    unitPrice: 70,
    totalCost: 3360,
    enteredBy: "System Seed",
    notes: "Department opening stock for POS deductions",
    referenceNo: "OB-MAIN-BEER",
  },
  {
    id: "sled-4b",
    type: "OPENING_BALANCE",
    date: todayKey(),
    itemId: "stk-beer-heineken",
    itemName: "Heineken",
    category: "Beer",
    location: "Main Bar",
    quantity: 24,
    unit: "bottle",
    unitPrice: 85,
    totalCost: 2040,
    enteredBy: "System Seed",
    notes: "Main Bar special beer opening",
    referenceNo: "OB-MAIN-HEINEKEN",
  },
  {
    id: "sled-4c",
    type: "OPENING_BALANCE",
    date: todayKey(),
    itemId: "stk-beer-bedele",
    itemName: "Bedele",
    category: "Beer",
    location: "Main Bar",
    quantity: 36,
    unit: "bottle",
    unitPrice: 65,
    totalCost: 2340,
    enteredBy: "System Seed",
    notes: "Main Bar special beer opening",
    referenceNo: "OB-MAIN-BEDELE",
  },
  {
    id: "sled-4d",
    type: "OPENING_BALANCE",
    date: todayKey(),
    itemId: "stk-beer-arada",
    itemName: "Arada",
    category: "Beer",
    location: "Main Bar",
    quantity: 30,
    unit: "bottle",
    unitPrice: 65,
    totalCost: 1950,
    enteredBy: "System Seed",
    notes: "Main Bar special beer opening",
    referenceNo: "OB-MAIN-ARADA",
  },
  {
    id: "sled-4e",
    type: "OPENING_BALANCE",
    date: todayKey(),
    itemId: "stk-beer-dashen",
    itemName: "Dashen",
    category: "Beer",
    location: "Main Bar",
    quantity: 40,
    unit: "bottle",
    unitPrice: 60,
    totalCost: 2400,
    enteredBy: "System Seed",
    notes: "Main Bar normal beer opening",
    referenceNo: "OB-MAIN-DASHEN",
  },
  {
    id: "sled-5",
    type: "OPENING_BALANCE",
    date: todayKey(),
    itemId: "stk-beef-prime",
    itemName: "Prime Beef",
    category: "Meat",
    location: "Butcher",
    quantity: 20,
    unit: "kg",
    unitPrice: 650,
    totalCost: 13000,
    enteredBy: "System Seed",
    notes: "Butcher opening stock",
    referenceNo: "OB-BUTCHER-BEEF",
  },
  {
    id: "sled-6",
    type: "OPENING_BALANCE",
    date: todayKey(),
    itemId: "stk-onion",
    itemName: "Onion",
    category: "Kitchen",
    location: "Kitchen",
    quantity: 15,
    unit: "kg",
    unitPrice: 40,
    totalCost: 600,
    enteredBy: "System Seed",
    notes: "Kitchen opening stock",
    referenceNo: "OB-KITCHEN-ONION",
  },
  {
    id: "sled-7",
    type: "OPENING_BALANCE",
    date: todayKey(),
    itemId: "stk-coffee-beans",
    itemName: "Coffee Beans",
    category: "Coffee House",
    location: "Coffee House",
    quantity: 5,
    unit: "kg",
    unitPrice: 800,
    totalCost: 4000,
    enteredBy: "System Seed",
    notes: "Coffee house opening stock",
    referenceNo: "OB-COFFEE-BEANS",
  },
  {
    id: "sled-8",
    type: "OPENING_BALANCE",
    date: todayKey(),
    itemId: "stk-ginger",
    itemName: "Ginger",
    category: "Coffee House",
    location: "Coffee House",
    quantity: 5,
    unit: "kg",
    unitPrice: 180,
    totalCost: 900,
    enteredBy: "System Seed",
    notes: "Coffee house ginger for Keshir",
    referenceNo: "OB-GINGER",
  },
  {
    id: "sled-9",
    type: "OPENING_BALANCE",
    date: todayKey(),
    itemId: "stk-nuts",
    itemName: "Nuts (Lewuz)",
    category: "Coffee House",
    location: "Coffee House",
    quantity: 4,
    unit: "kg",
    unitPrice: 450,
    totalCost: 1800,
    enteredBy: "System Seed",
    notes: "Coffee house nuts for Lewuz",
    referenceNo: "OB-NUTS",
  },
  {
    id: "sled-10",
    type: "OPENING_BALANCE",
    date: todayKey(),
    itemId: "stk-milk",
    itemName: "Milk",
    category: "Coffee House",
    location: "Coffee House",
    quantity: 20,
    unit: "liter",
    unitPrice: 85,
    totalCost: 1700,
    enteredBy: "System Seed",
    notes: "Coffee house milk (liter) for cup sales",
    referenceNo: "OB-MILK",
  },
];

export const STOCK_RECIPES_SEED: StockRecipe[] = [
  {
    id: "recipe-dulet",
    menuItemName: "Dulet",
    category: "Kitchen",
    outputQty: 1,
    outputUnit: "plate",
    stockDeductionLocation: "Kitchen",
    updatedAt: nowIso(),
    ingredients: [
      { id: "dulet-1", itemId: "stk-beef-prime", itemName: "Prime Beef", quantity: 0.25, unit: "kg", stockDeductionLocation: "Butcher" },
      { id: "dulet-2", itemId: "stk-onion", itemName: "Onion", quantity: 0.05, unit: "kg", stockDeductionLocation: "Kitchen" },
    ],
  },
  {
    id: "recipe-coffee",
    menuItemName: "Coffee",
    category: "Coffee House",
    outputQty: 1,
    outputUnit: "cup",
    stockDeductionLocation: "Coffee House",
    wastageAllowance: 5,
    updatedAt: nowIso(),
    ingredients: [
      { id: "coffee-1", itemId: "stk-coffee-beans", itemName: "Coffee Beans", quantity: 0.015, unit: "kg", stockDeductionLocation: "Coffee House" },
    ],
  },
  {
    id: "recipe-keshir",
    menuItemName: "Keshir",
    category: "Coffee House",
    outputQty: 1,
    outputUnit: "cup",
    stockDeductionLocation: "Coffee House",
    updatedAt: nowIso(),
    ingredients: [
      { id: "keshir-1", itemId: "stk-ginger", itemName: "Ginger", quantity: 0.01, unit: "kg", stockDeductionLocation: "Coffee House" },
    ],
  },
  {
    id: "recipe-lewuz",
    menuItemName: "Lewuz",
    category: "Coffee House",
    outputQty: 1,
    outputUnit: "cup",
    stockDeductionLocation: "Coffee House",
    updatedAt: nowIso(),
    ingredients: [
      { id: "lewuz-1", itemId: "stk-nuts", itemName: "Nuts (Lewuz)", quantity: 0.02, unit: "kg", stockDeductionLocation: "Coffee House" },
    ],
  },
  {
    id: "recipe-wetet",
    menuItemName: "Wetet",
    category: "Coffee House",
    outputQty: 1,
    outputUnit: "cup",
    stockDeductionLocation: "Coffee House",
    updatedAt: nowIso(),
    ingredients: [
      { id: "wetet-1", itemId: "stk-milk", itemName: "Milk", quantity: 0.2, unit: "liter", stockDeductionLocation: "Coffee House" },
    ],
  },
  {
    id: "recipe-lemon-tea",
    menuItemName: "Lemon Tea",
    category: "Coffee House",
    outputQty: 1,
    outputUnit: "cup",
    stockDeductionLocation: "Coffee House",
    updatedAt: nowIso(),
    ingredients: [
      { id: "lemon-tea-1", itemId: "stk-tea-leaves", itemName: "Tea Leaves", quantity: 0.005, unit: "kg", stockDeductionLocation: "Coffee House" },
    ],
  },
  buildGoatKiklRecipe(),
];

export const STOCK_CLOSINGS_SEED: StockClosingRecord[] = [];
export const STOCK_PURCHASE_REQUISITIONS_SEED: PurchaseRequisitionDocument[] = [];
export const STOCK_PURCHASE_ORDERS_SEED: PurchaseOrderDocument[] = [];
export const STOCK_GOODS_RECEIVING_VOUCHERS_SEED: GoodsReceivingVoucherDocument[] = [];
export const STOCK_STORE_ISSUE_VOUCHERS_SEED: StoreIssueVoucherDocument[] = [];
export const STOCK_STORE_TRANSFER_VOUCHERS_SEED: StoreTransferVoucherDocument[] = [];
export const STOCK_GOODS_RETURN_VOUCHERS_SEED: GoodsReturnVoucherDocument[] = [];
export const STOCK_ADJUSTMENT_VOUCHERS_SEED: StockAdjustmentVoucherDocument[] = [];
export const STOCK_CANCELLATION_REVERSALS_SEED: CancellationReversalVoucherDocument[] = [];
export const STOCK_RECEIVINGS_SEED: StockReceivingRecord[] = [];
export const STOCK_TRANSFERS_SEED: StockTransferRecord[] = [];
export const STOCK_REQUESTS_SEED: StockRequestRecord[] = [];
export const STOCK_RETURNS_SEED: StockReturnRecord[] = [];
export const STOCK_LOSSES_SEED: StockLossRecord[] = [];
export const STOCK_COUNTS_SEED: StockCountSession[] = [];

export function getLowStockAlertItems(
  items: StockManagedItem[],
  ledger: StockLedgerEntry[],
  policies: LocationStockPolicy[] = [],
  transfers: StockTransferRecord[] = [],
) {
  return buildLocationBalances(items, ledger, transfers, policies).filter((row) => row.quantity <= row.reorderLevel);
}

function buildLedgerEntry(input: Omit<StockLedgerEntry, "quantityIn" | "quantityOut" | "immutable">): StockLedgerEntry {
  const quantityIn = ledgerIncomingTypes(input.type) ? input.quantity : 0;
  const quantityOut = ledgerOutgoingTypes(input.type) ? input.quantity : 0;
  return {
    ...input,
    transactionAt: input.transactionAt ?? nowIso(),
    quantityIn,
    quantityOut,
    sourceLocation: input.fromLocation,
    destinationLocation: input.toLocation,
    immutable: true,
  };
}

export function confirmStoreReceiving(
  receiving: StockReceivingRecord,
  items: StockManagedItem[],
  existingLedger: StockLedgerEntry[],
  options: {
    settings?: InventorySettingsRecord;
    lots?: StockLot[];
  } = {},
) {
  if (receiving.status === "Cancelled") throw new Error("Cancelled receiving cannot be confirmed.");
  if (!isCentralStockLocation(receiving.storeDestination)) throw new Error("Purchases must be received into Store 1 or Store 2.");

  const settings = options.settings ?? DEFAULT_INVENTORY_SETTINGS;
  let nextLots = [...(options.lots ?? [])];
  const balancesBefore = buildLocationBalances(items, existingLedger);

  const nextItems = items.map((item) => {
    const line = receiving.lines.find((row) => row.itemId === item.id && row.receivedQuantity > 0);
    if (!line) return item;
    const baseQty = convertStockQuantity(item, line.receivedQuantity, line.unit, item.baseUnit);
    const currentBalance = balancesBefore.find((row) => row.itemId === item.id && row.location === receiving.storeDestination)?.quantity ?? 0;
    const nextCost =
      settings.costingMethod === "Standard Cost"
        ? money(item.standardCost ?? item.purchasePrice)
        : settings.costingMethod === "Weighted Average"
          ? calculateWeightedAverageCost(currentBalance, item.purchasePrice, baseQty, line.unitCost)
          : money(line.unitCost);
    return { ...item, purchasePrice: nextCost, updatedAt: nowIso() };
  });

  const ledgerEntries = receiving.lines.flatMap((line, index) => {
    if (!(line.receivedQuantity > 0)) return [];
    const item = nextItems.find((row) => row.id === line.itemId);
    if (!item) return [];
    const baseQty = convertStockQuantity(item, line.receivedQuantity, line.unit, item.baseUnit);
    nextLots = receiveIntoLots(nextLots, {
      itemId: item.id,
      itemName: item.name,
      location: receiving.storeDestination,
      quantity: baseQty,
      unit: item.baseUnit,
      unitCost: money(line.unitCost),
      batchNumber: line.batchNumber,
      manufacturingDate: undefined,
      expiryDate: line.expiryDate,
      referenceNo: receiving.receivingNumber,
    });
    return [buildLedgerEntry({
      id: `sled-rcv-${receiving.id}-${index}`,
      type: "PURCHASE_RECEIPT",
      date: receiving.receivingDate,
      itemId: item.id,
      itemName: item.name,
      category: item.category,
      location: receiving.storeDestination,
      quantity: qty(line.receivedQuantity),
      unit: line.unit,
      unitPrice: money(line.unitCost),
      totalCost: money(line.receivedQuantity * line.unitCost),
      supplierName: receiving.supplier,
      receivedBy: receiving.receivedBy,
      enteredBy: receiving.receivedBy,
      referenceNo: receiving.receivingNumber,
      batchNumber: line.batchNumber,
      expiryDate: line.expiryDate,
      notes: [receiving.purchaseOrderReference, line.batchNumber, line.expiryDate, receiving.notes].filter(Boolean).join(" • "),
    })];
  });

  return {
    receiving: { ...receiving, status: "Confirmed" as const, confirmedAt: nowIso() },
    items: nextItems,
    ledger: appendImmutableLedgerEntries(existingLedger, ledgerEntries),
    ledgerEntries,
    lots: nextLots,
  };
}

export function approvePurchaseRequisition(
  requisition: PurchaseRequisitionDocument,
  approvedBy: string,
  partialLines?: Array<{ lineId: string; approvedQuantity: number }>,
) {
  const lines = requisition.lines.map((line) => {
    const partial = partialLines?.find((row) => row.lineId === line.id);
    const approvedQuantity = qty(Math.min(line.requestedQuantity, Math.max(0, partial?.approvedQuantity ?? line.requestedQuantity)));
    return { ...line, approvedQuantity };
  });
  const requestedTotal = requisition.lines.reduce((sum, line) => sum + line.requestedQuantity, 0);
  const approvedTotal = lines.reduce((sum, line) => sum + line.approvedQuantity, 0);
  return {
    ...requisition,
    approvedBy,
    lines,
    status: approvedTotal <= 0 ? ("Rejected" as const) : approvedTotal < requestedTotal ? ("Partially Approved" as const) : ("Approved" as const),
    approvalHistory: [historyEntry(approvedTotal <= 0 ? "Rejected" : "Approved", approvedBy), ...requisition.approvalHistory],
  } satisfies PurchaseRequisitionDocument;
}

export function approvePurchaseRequisitionAsActor(
  requisition: PurchaseRequisitionDocument,
  actor: InventoryActorContext,
  partialLines?: Array<{ lineId: string; approvedQuantity: number }>,
) {
  const check = validateInventoryDocumentApproval(actor, requisition, "approve", requisition.requestingStore);
  if (!check.ok) throw new Error(check.error);
  return approvePurchaseRequisition(requisition, actor.userName, partialLines);
}

export function convertPurchaseRequisitionToPurchaseOrder(
  requisition: PurchaseRequisitionDocument,
  supplier: string,
  preparedBy: string,
): PurchaseOrderDocument {
  if (!["Approved", "Partially Approved"].includes(requisition.status)) {
    throw new Error("Only approved purchase requisitions can be converted to purchase orders.");
  }
  return {
    id: `po-${requisition.id}`,
    documentType: "Purchase Order",
    documentNumber: generateInventoryDocumentNumber("PO"),
    purchaseOrderNumber: generateInventoryDocumentNumber("PO"),
    status: "Submitted",
    createdAt: nowIso(),
    createdBy: preparedBy,
    preparedBy,
    supplier,
    destinationStore: requisition.requestingStore,
    orderDate: todayKey(),
    requisitionReference: requisition.requisitionNumber,
    approvalHistory: [historyEntry("Converted", preparedBy, `From ${requisition.requisitionNumber}`)],
    lines: requisition.lines
      .filter((line) => line.approvedQuantity > 0)
      .map((line) => ({
        id: `pol-${line.id}`,
        itemId: line.itemId,
        itemName: line.itemName,
        orderedQuantity: line.approvedQuantity,
        receivedQuantity: 0,
        unit: line.unit,
        unitPrice: 0,
        discount: 0,
        tax: 0,
        totalCost: 0,
      })),
  };
}

export function approvePurchaseOrder(order: PurchaseOrderDocument, approvedBy: string) {
  if (!["Draft", "Submitted"].includes(order.status)) {
    throw new Error("Only draft or submitted purchase orders can be approved.");
  }
  if (sameInventoryActor(order.createdBy, approvedBy) || sameInventoryActor(order.preparedBy, approvedBy)) {
    throw new Error("Users cannot approve their own purchase orders.");
  }
  return {
    ...order,
    status: "Approved" as const,
    approvedBy,
    approvalHistory: [historyEntry("Approved", approvedBy), ...order.approvalHistory],
  } satisfies PurchaseOrderDocument;
}

export function approvePurchaseOrderAsActor(order: PurchaseOrderDocument, actor: InventoryActorContext) {
  const check = validateInventoryDocumentApproval(actor, order, "approve", order.destinationStore);
  if (!check.ok) throw new Error(check.error);
  return approvePurchaseOrder(order, actor.userName);
}

export function convertPurchaseRequisitionToPurchaseOrderAsActor(
  requisition: PurchaseRequisitionDocument,
  supplier: string,
  actor: InventoryActorContext,
) {
  const check = validateInventoryDocumentApproval(actor, requisition, "post", requisition.requestingStore);
  if (!check.ok) throw new Error(check.error);
  return convertPurchaseRequisitionToPurchaseOrder(requisition, supplier, actor.userName);
}

export function confirmGoodsReceivingVoucher(
  voucher: GoodsReceivingVoucherDocument,
  items: StockManagedItem[],
  existingLedger: StockLedgerEntry[],
  purchaseOrders: PurchaseOrderDocument[] = [],
  options: { settings?: InventorySettingsRecord; lots?: StockLot[] } = {},
) {
  const linkedPo = purchaseOrders.find((order) => order.purchaseOrderNumber === voucher.purchaseOrderReference);
  if (linkedPo && !["Approved", "Partially Received"].includes(linkedPo.status)) {
    throw new Error("Goods can only be received against approved purchase orders.");
  }

  const result = confirmStoreReceiving(
    {
      id: voucher.id,
      receivingNumber: voucher.grvNumber,
      supplier: voucher.supplier,
      purchaseOrderReference: voucher.purchaseOrderReference,
      storeDestination: voucher.destinationStore,
      receivingDate: voucher.receivingDate,
      lines: voucher.lines.map((line) => ({
        id: line.id,
        itemId: line.itemId,
        itemName: line.itemName,
        unit: line.unit,
        orderedQuantity: line.orderedQuantity,
        receivedQuantity: line.receivedQuantity + (line.freeQuantity ?? 0),
        unitCost: line.unitCost,
        batchNumber: line.batchNumber,
        expiryDate: line.expiryDate,
      })),
      receivedBy: voucher.receivedBy,
      notes: voucher.notes,
      status: voucher.status,
    },
    items,
    existingLedger,
    options,
  );

  const updatedPurchaseOrders = purchaseOrders.map((order) => {
    if (order.purchaseOrderNumber !== voucher.purchaseOrderReference) return order;
    const lines = order.lines.map((line) => {
      const receivedLine = voucher.lines.find((row) => row.itemId === line.itemId);
      if (!receivedLine) return line;
      return {
        ...line,
        receivedQuantity: qty(line.receivedQuantity + receivedLine.receivedQuantity + (receivedLine.freeQuantity ?? 0)),
      };
    });
    const fullyReceived = lines.every((line) => line.receivedQuantity >= line.orderedQuantity);
    return {
      ...order,
      lines,
      status: fullyReceived ? ("Received" as const) : ("Partially Received" as const),
      approvalHistory: [historyEntry("Received", voucher.receivedBy, voucher.grvNumber), ...order.approvalHistory],
    };
  });

  return {
    ...result,
    voucher: {
      ...voucher,
      status: "Confirmed" as const,
      approvalHistory: [historyEntry("Received", voucher.receivedBy), ...voucher.approvalHistory],
    },
    purchaseOrders: updatedPurchaseOrders,
  };
}

export function confirmGoodsReceivingVoucherAsActor(
  voucher: GoodsReceivingVoucherDocument,
  items: StockManagedItem[],
  existingLedger: StockLedgerEntry[],
  purchaseOrders: PurchaseOrderDocument[],
  actor: InventoryActorContext,
  options: { settings?: InventorySettingsRecord; lots?: StockLot[] } = {},
) {
  const check = validateInventoryDocumentApproval(actor, voucher, "receive", voucher.destinationStore);
  if (!check.ok) throw new Error(check.error);
  return confirmGoodsReceivingVoucher({ ...voucher, receivedBy: actor.userName }, items, existingLedger, purchaseOrders, options);
}

export function toDepartmentStockRequestDocument(request: StockRequestRecord): DepartmentStockRequestDocument {
  return {
    id: request.id,
    documentType: "Department Stock Request",
    documentNumber: request.requestNumber,
    stockRequestNumber: request.requestNumber,
    status: request.status,
    createdAt: request.createdAt,
    createdBy: request.requestedBy,
    requestingDepartment: request.requestingDepartment,
    requestedSourceStore: request.requestedSourceStore,
    priority: request.priority,
    reason: request.reason,
    requiredDate: request.requiredDate,
    requestedBy: request.requestedBy,
    reviewedBy: request.reviewedBy,
    rejectionReason: request.rejectionReason,
    notes: request.notes,
    approvalHistory: [],
    lines: request.lines,
    convertedIssueVoucherNumber: request.convertedTransferNumber,
  };
}

export function toStockRequestRecord(document: DepartmentStockRequestDocument): StockRequestRecord {
  return {
    id: document.id,
    requestNumber: document.stockRequestNumber,
    requestingDepartment: document.requestingDepartment,
    requestedSourceStore: document.requestedSourceStore,
    lines: document.lines,
    priority: document.priority,
    reason: document.reason,
    requiredDate: document.requiredDate,
    requestedBy: document.requestedBy,
    reviewedBy: document.reviewedBy,
    rejectionReason: document.rejectionReason,
    notes: document.notes,
    status: document.status,
    createdAt: document.createdAt,
    updatedAt: nowIso(),
    convertedTransferNumber: document.convertedIssueVoucherNumber ?? document.convertedTransferVoucherNumber,
  };
}

export function createDepartmentStockRequest(input: {
  requestingDepartment: OperationalStockLocation;
  requestedSourceStore: CentralStockLocation;
  priority: StockRequestPriority;
  reason: string;
  requiredDate: string;
  requestedBy: string;
  notes?: string;
  lines: Array<{
    itemId: string;
    itemName: string;
    availableQuantityAtDepartment: number;
    requestedQuantity: number;
    unit: StockUnitType;
  }>;
}): DepartmentStockRequestDocument {
  const stockRequestNumber = generateInventoryDocumentNumber("SRQ");
  const stamp = nowIso();
  return {
    id: `srq-${Date.now()}`,
    documentType: "Department Stock Request",
    documentNumber: stockRequestNumber,
    stockRequestNumber,
    status: "Submitted",
    createdAt: stamp,
    createdBy: input.requestedBy,
    requestingDepartment: input.requestingDepartment,
    requestedSourceStore: input.requestedSourceStore,
    priority: input.priority,
    reason: input.reason,
    requiredDate: input.requiredDate,
    requestedBy: input.requestedBy,
    notes: input.notes,
    approvalHistory: [historyEntry("Submitted", input.requestedBy)],
    lines: input.lines.map((line, index) => ({
      id: `srq-line-${Date.now()}-${index}`,
      itemId: line.itemId,
      itemName: line.itemName,
      availableQuantityAtDepartment: qty(line.availableQuantityAtDepartment),
      requestedQuantity: qty(line.requestedQuantity),
      approvedQuantity: 0,
      unit: line.unit,
    })),
  };
}

export function approveDepartmentStockRequest(
  request: DepartmentStockRequestDocument,
  reviewedBy: string,
  partialLines?: Array<{ lineId: string; approvedQuantity: number }>,
  requestedSourceStore?: CentralStockLocation,
) {
  if (!["Submitted", "Under Review"].includes(request.status)) {
    throw new Error("Only submitted department stock requests can be approved.");
  }
  if (request.requestedBy.trim().toLowerCase() === reviewedBy.trim().toLowerCase()) {
    throw new Error("Department users must not approve their own stock requests.");
  }
  const lines = request.lines.map((line) => {
    const partial = partialLines?.find((row) => row.lineId === line.id);
    const approvedQuantity = qty(Math.min(line.requestedQuantity, Math.max(0, partial?.approvedQuantity ?? line.requestedQuantity)));
    return { ...line, approvedQuantity };
  });
  const requestedTotal = request.lines.reduce((sum, line) => sum + line.requestedQuantity, 0);
  const approvedTotal = lines.reduce((sum, line) => sum + line.approvedQuantity, 0);
  return {
    ...request,
    reviewedBy,
    requestedSourceStore: requestedSourceStore ?? request.requestedSourceStore,
    lines,
    status: approvedTotal <= 0 ? ("Rejected" as const) : approvedTotal < requestedTotal ? ("Partially Approved" as const) : ("Approved" as const),
    approvalHistory: [historyEntry(approvedTotal <= 0 ? "Rejected" : "Approved", reviewedBy), ...request.approvalHistory],
  } satisfies DepartmentStockRequestDocument;
}

export function approveDepartmentStockRequestAsActor(
  request: DepartmentStockRequestDocument,
  actor: InventoryActorContext,
  partialLines?: Array<{ lineId: string; approvedQuantity: number }>,
  requestedSourceStore?: CentralStockLocation,
) {
  const check = validateInventoryDocumentApproval(actor, request, "approve", requestedSourceStore ?? request.requestedSourceStore);
  if (!check.ok) throw new Error(check.error);
  return approveDepartmentStockRequest(request, actor.userName, partialLines, requestedSourceStore);
}

export function rejectDepartmentStockRequest(request: DepartmentStockRequestDocument, reviewedBy: string, rejectionReason: string) {
  if (!["Submitted", "Under Review"].includes(request.status)) {
    throw new Error("Only submitted department stock requests can be rejected.");
  }
  if (request.requestedBy.trim().toLowerCase() === reviewedBy.trim().toLowerCase()) {
    throw new Error("Department users must not reject their own stock requests.");
  }
  return {
    ...request,
    reviewedBy,
    rejectionReason,
    status: "Rejected" as const,
    approvalHistory: [historyEntry("Rejected", reviewedBy, rejectionReason), ...request.approvalHistory],
  } satisfies DepartmentStockRequestDocument;
}

export function rejectDepartmentStockRequestAsActor(
  request: DepartmentStockRequestDocument,
  actor: InventoryActorContext,
  rejectionReason: string,
) {
  const check = validateInventoryDocumentApproval(actor, request, "reject", request.requestedSourceStore);
  if (!check.ok) throw new Error(check.error);
  return rejectDepartmentStockRequest(request, actor.userName, rejectionReason);
}

export function convertDepartmentRequestToIssueVoucher(
  request: DepartmentStockRequestDocument,
  existingIssueNumbers: string[] = [],
): StoreIssueVoucherDocument {
  if (!["Approved", "Partially Approved", "Prepared"].includes(request.status)) {
    throw new Error("Only approved department requests can be converted to issue vouchers.");
  }
  const voucherNo =
    request.convertedIssueVoucherNumber?.trim() ||
    nextInventoryDocumentNumber("SIV", existingIssueNumbers);
  return {
    id: `siv-${request.id}`,
    documentType: "Store Issue Voucher",
    documentNumber: voucherNo,
    issueVoucherNumber: voucherNo,
    status: "Approved",
    createdAt: nowIso(),
    createdBy: request.requestedBy,
    sourceStore: request.requestedSourceStore,
    destinationDepartment: request.requestingDepartment,
    relatedStockRequest: request.stockRequestNumber,
    issueDate: todayKey(),
    approvedBy: request.reviewedBy,
    notes: request.notes,
    approvalHistory: [historyEntry("Converted", request.reviewedBy || request.requestedBy, request.stockRequestNumber)],
    lines: request.lines
      .filter((line) => line.approvedQuantity > 0)
      .map((line) => ({
      id: `siv-${line.id}`,
      itemId: line.itemId,
      itemName: line.itemName,
      unit: line.unit,
      requestedQuantity: line.requestedQuantity,
      approvedQuantity: line.approvedQuantity,
      sentQuantity: 0,
      receivedQuantity: 0,
    })),
  };
}

export function convertDepartmentRequestToIssueVoucherAsActor(
  request: DepartmentStockRequestDocument,
  actor: InventoryActorContext,
  existingIssueNumbers: string[] = [],
  existingVoucher?: StoreIssueVoucherDocument | null,
) {
  const check = validateInventoryDocumentApproval(actor, request, "post", request.requestedSourceStore);
  if (!check.ok) throw new Error(check.error);
  if (existingVoucher) {
    return {
      voucher: existingVoucher,
      request: {
        ...request,
        status: "Converted to Issue Voucher" as const,
        convertedIssueVoucherNumber: existingVoucher.issueVoucherNumber,
      },
    };
  }
  const voucher = convertDepartmentRequestToIssueVoucher(request, existingIssueNumbers);
  const nextVoucher = {
    ...voucher,
    approvedBy: actor.userName,
    approvalHistory: [historyEntry("Posted", actor.userName, request.stockRequestNumber), ...voucher.approvalHistory],
  } satisfies StoreIssueVoucherDocument;
  const nextRequest: DepartmentStockRequestDocument = {
    ...request,
    status: "Converted to Issue Voucher",
    convertedIssueVoucherNumber: nextVoucher.issueVoucherNumber,
    approvalHistory: [historyEntry("Converted", actor.userName, nextVoucher.issueVoucherNumber), ...request.approvalHistory],
  };
  return { voucher: nextVoucher, request: nextRequest };
}

export function storeIssueVoucherAsTransfer(voucher: StoreIssueVoucherDocument): StockTransferRecord {
  return {
    id: voucher.id,
    transferNumber: voucher.issueVoucherNumber,
    sourceLocation: voucher.sourceStore,
    destinationLocation: voucher.destinationDepartment,
    transferDate: voucher.issueDate,
    status: voucher.status,
    requestedBy: voucher.createdBy,
    approvedBy: voucher.approvedBy,
    sentBy: voucher.issuedBy,
    receivedBy: voucher.receivedBy,
    notes: voucher.notes,
    linkedRequestNumber: voucher.relatedStockRequest,
    activity: voucher.approvalHistory.map((entry) => `${entry.actedAt} ${entry.actedBy} ${entry.action}`),
    lines: voucher.lines,
  };
}

export function storeTransferVoucherAsTransfer(voucher: StoreTransferVoucherDocument): StockTransferRecord {
  return {
    id: voucher.id,
    transferNumber: voucher.transferVoucherNumber,
    sourceLocation: voucher.sourceLocation,
    destinationLocation: voucher.destinationLocation,
    transferDate: voucher.transferDate,
    status: voucher.status,
    requestedBy: voucher.createdBy,
    approvedBy: voucher.approvedBy,
    sentBy: voucher.transferredBy,
    receivedBy: voucher.receivedBy,
    notes: voucher.notes,
    activity: voucher.approvalHistory.map((entry) => `${entry.actedAt} ${entry.actedBy} ${entry.action}`),
    lines: voucher.lines,
  };
}

/** Active issue + transfer vouchers are the source of truth for reserved/incoming quantities. */
export function collectVoucherTransferMovements(
  issueVouchers: StoreIssueVoucherDocument[] = [],
  transferVouchers: StoreTransferVoucherDocument[] = [],
  legacyTransfers: StockTransferRecord[] = [],
): StockTransferRecord[] {
  const fromIssues = issueVouchers.map(storeIssueVoucherAsTransfer);
  const fromTransfers = transferVouchers.map(storeTransferVoucherAsTransfer);
  const voucherIds = new Set([...fromIssues, ...fromTransfers].map((row) => row.id));
  const legacy = legacyTransfers.filter((row) => !voucherIds.has(row.id));
  return [...fromIssues, ...fromTransfers, ...legacy];
}

function transferAsStoreIssueVoucher(voucher: StoreIssueVoucherDocument, transfer: StockTransferRecord): StoreIssueVoucherDocument {
  return {
    ...voucher,
    status: transfer.status,
    issuedBy: transfer.sentBy,
    receivedBy: transfer.receivedBy,
    lines: transfer.lines,
    approvalHistory: [
      ...(transfer.status === "Dispatched" || transfer.status === "Partially Received"
        ? [historyEntry("Dispatched", transfer.sentBy || voucher.issuedBy || "Storekeeper")]
        : []),
      ...(transfer.status === "Received" || transfer.status === "Partially Received"
        ? [historyEntry("Received", transfer.receivedBy || voucher.receivedBy || "Department User")]
        : []),
      ...voucher.approvalHistory,
    ],
  };
}

export function dispatchStoreIssueVoucher(
  voucher: StoreIssueVoucherDocument,
  issuedBy: string,
  items: StockManagedItem[],
  existingLedger: StockLedgerEntry[],
  sentLines?: Array<{ lineId: string; sentQuantity: number }>,
  lots: StockLot[] = [],
) {
  const result = dispatchStockTransfer(storeIssueVoucherAsTransfer(voucher), issuedBy, items, existingLedger, sentLines, lots);
  return {
    voucher: transferAsStoreIssueVoucher(voucher, result.transfer),
    ledger: result.ledger,
    ledgerEntries: result.ledgerEntries,
    lots: result.lots,
  };
}

export function dispatchStoreIssueVoucherAsActor(
  voucher: StoreIssueVoucherDocument,
  actor: InventoryActorContext,
  items: StockManagedItem[],
  existingLedger: StockLedgerEntry[],
  sentLines?: Array<{ lineId: string; sentQuantity: number }>,
  lots: StockLot[] = [],
) {
  const check = validateInventoryDocumentApproval(actor, voucher, "dispatch", voucher.sourceStore);
  if (!check.ok) throw new Error(check.error);
  return dispatchStoreIssueVoucher(voucher, actor.userName, items, existingLedger, sentLines, lots);
}

export function receiveStoreIssueVoucher(
  voucher: StoreIssueVoucherDocument,
  receivedBy: string,
  items: StockManagedItem[],
  existingLedger: StockLedgerEntry[],
  receivedLines?: Array<{ lineId: string; receivedQuantity: number }>,
  lots: StockLot[] = [],
) {
  const result = receiveStockTransfer(storeIssueVoucherAsTransfer(voucher), receivedBy, items, existingLedger, receivedLines, lots);
  return {
    voucher: transferAsStoreIssueVoucher(voucher, result.transfer),
    ledger: result.ledger,
    ledgerEntries: result.ledgerEntries,
    lots: result.lots,
  };
}

export function receiveStoreIssueVoucherAsActor(
  voucher: StoreIssueVoucherDocument,
  actor: InventoryActorContext,
  items: StockManagedItem[],
  existingLedger: StockLedgerEntry[],
  receivedLines?: Array<{ lineId: string; receivedQuantity: number }>,
  lots: StockLot[] = [],
) {
  const check = validateInventoryDocumentApproval(actor, voucher, "receive", voucher.destinationDepartment);
  if (!check.ok) throw new Error(check.error);
  return receiveStoreIssueVoucher(voucher, actor.userName, items, existingLedger, receivedLines, lots);
}

export function createCancellationReversalVoucher(
  originalDocumentNumber: string,
  originalDocumentType: InventoryDocumentType,
  reversedBy: string,
  reversalReason: string,
  ledgerEntries: StockLedgerEntry[],
) {
  const reversalEntries = ledgerEntries.map((entry, index) =>
    buildLedgerEntry({
      ...entry,
      id: `reversal-${entry.id}-${index}`,
      type: "CANCELLATION_REVERSAL",
      date: todayKey(),
      quantity: entry.quantity,
      notes: `Reversal of ${entry.referenceNo || originalDocumentNumber}. ${reversalReason}`,
      enteredBy: reversedBy,
      referenceNo: generateInventoryDocumentNumber("REV"),
    }),
  );

  return {
    voucher: {
      id: `rev-${Date.now()}`,
      documentType: "Cancellation Reversal Voucher",
      documentNumber: generateInventoryDocumentNumber("REV"),
      reversalNumber: generateInventoryDocumentNumber("REV"),
      status: "Posted" as const,
      createdAt: nowIso(),
      createdBy: reversedBy,
      reversedBy,
      reversalReason,
      originalDocumentNumber,
      originalDocumentType,
      approvalHistory: [historyEntry("Reversed", reversedBy, reversalReason)],
      ledgerEntries: reversalEntries,
    } satisfies CancellationReversalVoucherDocument,
    reversalEntries,
  };
}

export function createCancellationReversalVoucherAsActor(
  originalDocumentNumber: string,
  originalDocumentType: InventoryDocumentType,
  reversalReason: string,
  ledgerEntries: StockLedgerEntry[],
  actor: InventoryActorContext,
) {
  const syntheticDoc: InventoryDocumentBase = {
    id: originalDocumentNumber,
    documentType: originalDocumentType,
    documentNumber: originalDocumentNumber,
    status: "Posted",
    createdAt: nowIso(),
    createdBy: ledgerEntries[0]?.enteredBy || actor.userName,
    approvalHistory: [],
  };
  const check = validateInventoryDocumentApproval(actor, syntheticDoc, "post");
  if (!check.ok) throw new Error(check.error);
  return createCancellationReversalVoucher(originalDocumentNumber, originalDocumentType, actor.userName, reversalReason, ledgerEntries);
}

export function getReservedStockQuantity(transfers: StockTransferRecord[], itemId: string, location: StockLocation) {
  return qty(transfers
    .filter((transfer) => transfer.sourceLocation === location && ["Approved", "Partially Approved", "Prepared"].includes(transfer.status))
    .flatMap((transfer) => transfer.lines.filter((line) => line.itemId === itemId))
    .reduce((sum, line) => sum + Math.max(0, line.approvedQuantity - line.sentQuantity), 0));
}

export function getIncomingStockQuantity(transfers: StockTransferRecord[], itemId: string, location: StockLocation) {
  return qty(transfers
    .filter((transfer) => transfer.destinationLocation === location && ["Dispatched", "Partially Received"].includes(transfer.status))
    .flatMap((transfer) => transfer.lines.filter((line) => line.itemId === itemId))
    .reduce((sum, line) => sum + Math.max(0, line.sentQuantity - line.receivedQuantity), 0));
}

export function approveStockTransfer(transfer: StockTransferRecord, approvedBy: string, partialLines?: Array<{ lineId: string; approvedQuantity: number }>) {
  if (transfer.sourceLocation === transfer.destinationLocation) throw new Error("Source and destination locations must be different.");
  if (!approvedBy.trim()) throw new Error("Approver is required.");
  const lines = transfer.lines.map((line) => {
    const partial = partialLines?.find((row) => row.lineId === line.id);
    const approvedQuantity = qty(Math.min(line.requestedQuantity, Math.max(0, partial?.approvedQuantity ?? line.requestedQuantity)));
    return { ...line, approvedQuantity };
  });
  const requestedTotal = transfer.lines.reduce((sum, line) => sum + line.requestedQuantity, 0);
  const approvedTotal = lines.reduce((sum, line) => sum + line.approvedQuantity, 0);
  return {
    ...transfer,
    lines,
    approvedBy,
    status: approvedTotal <= 0 ? ("Rejected" as const) : approvedTotal < requestedTotal ? ("Partially Approved" as const) : ("Approved" as const),
    sourceReservedAt: approvedTotal > 0 ? nowIso() : transfer.sourceReservedAt,
    activity: [`${nowIso()} ${approvedBy} approved ${approvedTotal}/${requestedTotal}.`, ...transfer.activity],
  } satisfies StockTransferRecord;
}

export function dispatchStockTransfer(
  transfer: StockTransferRecord,
  sentBy: string,
  items: StockManagedItem[],
  existingLedger: StockLedgerEntry[],
  sentLines?: Array<{ lineId: string; sentQuantity: number }>,
  lots: StockLot[] = [],
) {
  if (!["Approved", "Partially Approved", "Prepared"].includes(transfer.status)) throw new Error("Only approved transfers can be dispatched.");
  let nextLots = [...lots];
  const nextLines = transfer.lines.map((line) => {
    const sent = sentLines?.find((row) => row.lineId === line.id);
    const sentQuantity = qty(Math.min(line.approvedQuantity, Math.max(0, sent?.sentQuantity ?? line.approvedQuantity)));
    const item = items.find((row) => row.id === line.itemId);
    if (!item || !(sentQuantity > 0)) return { ...line, sentQuantity };
    const baseQty = convertStockQuantity(item, sentQuantity, line.unit, item.baseUnit);
    const trackedLots = nextLots.filter((lot) => lot.itemId === item.id && lot.location === transfer.sourceLocation);
    if (trackedLots.length > 0) {
      const { allocations, remaining } = selectFefoLots(nextLots, item.id, transfer.sourceLocation, baseQty);
      if (remaining > 0) {
        throw new Error(`Insufficient issuable (non-expired) batch stock for ${item.name} in ${transfer.sourceLocation}. Short by ${remaining} ${item.baseUnit}.`);
      }
      nextLots = applyLotAllocations(nextLots, allocations);
      const primary = allocations[0];
      return {
        ...line,
        sentQuantity,
        batchNumber: primary?.batchNumber,
        expiryDate: primary?.expiryDate,
      };
    }
    return { ...line, sentQuantity };
  });

  const nextTransfer = {
    ...transfer,
    sentBy,
    dispatchedAt: nowIso(),
    status: "Dispatched" as const,
    lines: nextLines,
    activity: [`${nowIso()} ${sentBy} dispatched transfer (FEFO where batches exist).`, ...transfer.activity],
  } satisfies StockTransferRecord;

  const ledgerEntries = nextTransfer.lines.flatMap((line, index) => {
    if (!(line.sentQuantity > 0)) return [];
    const item = items.find((row) => row.id === line.itemId);
    if (!item) return [];
    const unitCost = line.batchNumber
      ? (lots.find((lot) => lot.batchNumber === line.batchNumber && lot.itemId === item.id)?.unitCost ?? item.purchasePrice)
      : item.purchasePrice;
    const entry = buildLedgerEntry({
      id: `sled-trf-${transfer.id}-out-${index}`,
      type: "TRANSFER_OUT",
      date: transfer.transferDate,
      itemId: item.id,
      itemName: item.name,
      category: item.category,
      location: transfer.sourceLocation,
      fromLocation: transfer.sourceLocation,
      toLocation: transfer.destinationLocation,
      quantity: line.sentQuantity,
      unit: line.unit,
      unitPrice: unitCost,
      totalCost: money(line.sentQuantity * unitCost),
      enteredBy: sentBy,
      approvedBy: transfer.approvedBy,
      referenceNo: transfer.transferNumber,
      batchNumber: line.batchNumber,
      expiryDate: line.expiryDate,
      notes: transfer.notes,
    });
    const validation = validateStockLedgerEntry(items, existingLedger, entry);
    if (!validation.ok) throw new Error(validation.error);
    return [entry];
  });
  return { transfer: nextTransfer, ledger: appendImmutableLedgerEntries(existingLedger, ledgerEntries), ledgerEntries, lots: nextLots };
}

export function receiveStockTransfer(
  transfer: StockTransferRecord,
  receivedBy: string,
  items: StockManagedItem[],
  existingLedger: StockLedgerEntry[],
  receivedLines?: Array<{ lineId: string; receivedQuantity: number }>,
  lots: StockLot[] = [],
) {
  if (!["Dispatched", "Partially Received"].includes(transfer.status)) throw new Error("Only dispatched transfers can be received.");
  const lines = transfer.lines.map((line) => {
    const received = receivedLines?.find((row) => row.lineId === line.id);
    return { ...line, receivedQuantity: qty(Math.min(line.sentQuantity, Math.max(0, received?.receivedQuantity ?? line.sentQuantity))) };
  });
  const sentTotal = lines.reduce((sum, line) => sum + line.sentQuantity, 0);
  const receivedTotal = lines.reduce((sum, line) => sum + line.receivedQuantity, 0);
  const nextTransfer = {
    ...transfer,
    lines,
    receivedBy,
    receivedAt: nowIso(),
    status: receivedTotal < sentTotal ? ("Partially Received" as const) : ("Received" as const),
    activity: [`${nowIso()} ${receivedBy} confirmed ${receivedTotal}/${sentTotal} received.`, ...transfer.activity],
  } satisfies StockTransferRecord;

  let nextLots = [...lots];
  const ledgerEntries = lines.flatMap((line, index) => {
    if (!(line.receivedQuantity > 0)) return [];
    const item = items.find((row) => row.id === line.itemId);
    if (!item) return [];
    const baseQty = convertStockQuantity(item, line.receivedQuantity, line.unit, item.baseUnit);
    const unitCost = line.batchNumber
      ? (lots.find((lot) => lot.batchNumber === line.batchNumber && lot.itemId === item.id)?.unitCost ?? item.purchasePrice)
      : item.purchasePrice;
    nextLots = receiveIntoLots(nextLots, {
      itemId: item.id,
      itemName: item.name,
      location: transfer.destinationLocation,
      quantity: baseQty,
      unit: item.baseUnit,
      unitCost,
      batchNumber: line.batchNumber,
      expiryDate: line.expiryDate,
      referenceNo: transfer.transferNumber,
    });
    return [buildLedgerEntry({
      id: `sled-trf-${transfer.id}-in-${index}`,
      type: "TRANSFER_IN",
      date: transfer.transferDate,
      itemId: item.id,
      itemName: item.name,
      category: item.category,
      location: transfer.destinationLocation,
      fromLocation: transfer.sourceLocation,
      toLocation: transfer.destinationLocation,
      quantity: line.receivedQuantity,
      unit: line.unit,
      unitPrice: unitCost,
      totalCost: money(line.receivedQuantity * unitCost),
      enteredBy: receivedBy,
      approvedBy: transfer.approvedBy,
      receivedBy,
      referenceNo: transfer.transferNumber,
      batchNumber: line.batchNumber,
      expiryDate: line.expiryDate,
      notes: transfer.notes,
    })];
  });
  return { transfer: nextTransfer, ledger: appendImmutableLedgerEntries(existingLedger, ledgerEntries), ledgerEntries, lots: nextLots };
}

export function convertRequestToTransfer(request: StockRequestRecord): StockTransferRecord {
  if (!["Approved", "Partially Approved", "Prepared"].includes(request.status)) throw new Error("Only approved requests can become transfers.");
  return {
    id: `trf-${request.id}`,
    transferNumber: request.convertedTransferNumber || `TRF-${request.requestNumber}`,
    sourceLocation: request.requestedSourceStore,
    destinationLocation: request.requestingDepartment,
    transferDate: todayKey(),
    status: "Approved",
    requestedBy: request.requestedBy,
    approvedBy: request.reviewedBy,
    notes: request.notes,
    linkedRequestNumber: request.requestNumber,
    activity: [`${nowIso()} Converted from request ${request.requestNumber}.`],
    lines: request.lines.map((line) => ({
      id: `trf-${line.id}`,
      itemId: line.itemId,
      itemName: line.itemName,
      unit: line.unit,
      requestedQuantity: line.requestedQuantity,
      approvedQuantity: line.approvedQuantity,
      sentQuantity: 0,
      receivedQuantity: 0,
    })),
  };
}

export function createPosStockDeductionEntries(
  input: PosStockDeductionInput,
  items: StockManagedItem[],
  recipes: StockRecipe[],
  existingLedger: StockLedgerEntry[],
  lotState?: { lots: StockLot[] },
  controlSettings: InventoryControlSettings = DEFAULT_INVENTORY_CONTROL_SETTINGS,
) {
  const profile = input.ledgerProfile;
  const referenceNo = profile?.referenceNo ?? posOrderReference(input.orderId);
  const directType: StockLedgerEntryType = profile?.directType ?? "POS_CONSUMPTION";
  const recipeType: StockLedgerEntryType = profile?.recipeType ?? "RECIPE_CONSUMPTION";
  const notesPrefix = profile?.notesPrefix ?? `Auto deduction from POS order ${input.orderNo}`;
  const entryIdPrefix = profile?.entryIdPrefix ?? `sled-pos-${input.orderId}`;

  if (input.skipIfAlreadyDeducted !== false) {
    const alreadyPosted = profile
      ? existingLedger.some(
          (entry) =>
            entry.referenceNo === referenceNo &&
            (entry.type === directType || entry.type === recipeType),
        )
      : orderHasPosStockDeduction(existingLedger, input.orderId);
    if (alreadyPosted) return [] as StockLedgerEntry[];
  }

  const nextLedger = [...existingLedger];
  const entries: StockLedgerEntry[] = [];
  let nextLots = lotState ? [...lotState.lots] : [];

  const pushEntry = (entry: StockLedgerEntry) => {
    const validation = validateStockLedgerEntry(items, nextLedger, entry, controlSettings);
    if (!validation.ok) return;
    const stamped: StockLedgerEntry = {
      ...entry,
      transactionAt: entry.transactionAt ?? ledgerTimestampFromClosedAt(input.closedAt),
    };
    entries.push(stamped);
    nextLedger.unshift(stamped);
  };

  const pushGoatPoolConsumption = (
    directItem: StockManagedItem,
    location: StockLocation,
    quantity: number,
    lineIndex: number,
    lineName: string,
    allocSuffix = 0,
    entryType: StockLedgerEntryType = directType,
  ) => {
    if (!lotState || nextLots.length === 0) {
      pushEntry({
        id: `${entryIdPrefix}-${lineIndex}${allocSuffix ? `-${allocSuffix}` : ""}`,
        type: entryType,
        date: ledgerDateFromClosedAt(input.closedAt),
        itemId: directItem.id,
        itemName: directItem.name,
        category: directItem.category,
        location,
        quantity: qty(quantity),
        unit: directItem.baseUnit,
        totalCost: money(quantity * directItem.purchasePrice),
        enteredBy: input.enteredBy,
        notes: `${notesPrefix}: ${lineName}`,
        referenceNo,
      });
      return;
    }

    const { allocations, remaining } = selectFefoLots(nextLots, directItem.id, location, quantity);
    if (remaining > 0) {
      pushEntry({
        id: `${entryIdPrefix}-${lineIndex}${allocSuffix ? `-${allocSuffix}` : ""}`,
        type: entryType,
        date: ledgerDateFromClosedAt(input.closedAt),
        itemId: directItem.id,
        itemName: directItem.name,
        category: directItem.category,
        location,
        quantity: qty(quantity),
        unit: directItem.baseUnit,
        totalCost: money(quantity * directItem.purchasePrice),
        enteredBy: input.enteredBy,
        notes: `${notesPrefix}: ${lineName}`,
        referenceNo,
      });
      return;
    }

    nextLots = applyLotAllocations(nextLots, allocations);
    allocations.forEach((allocation, allocationIndex) => {
      pushEntry({
        id: `${entryIdPrefix}-${lineIndex}-${allocationIndex}`,
        type: entryType,
        date: ledgerDateFromClosedAt(input.closedAt),
        itemId: directItem.id,
        itemName: directItem.name,
        category: directItem.category,
        location,
        quantity: allocation.quantity,
        unit: directItem.baseUnit,
        unitPrice: allocation.unitCost,
        totalCost: money(allocation.quantity * allocation.unitCost),
        enteredBy: input.enteredBy,
        notes: `${notesPrefix}: ${lineName}`,
        referenceNo,
        batchNumber: allocation.batchNumber,
        expiryDate: allocation.expiryDate,
      });
    });
  };

  input.lines.forEach((line, lineIndex) => {
    if (isPosStockDisconnectedMenuItem(line.menuItemId, line.name)) return;

    const recipe = recipes.find(
      (candidate) => normalizedKey(candidate.menuItemName) === normalizedKey(line.name),
    );

    if (recipe) {
      const wastageFactor = 1 + Math.max(0, recipe.wastageAllowance ?? 0) / 100;
      recipe.ingredients.forEach((ingredient, ingredientIndex) => {
        const stockItem = items.find((candidate) => candidate.id === ingredient.itemId);
        if (!stockItem) return;
        const quantity = qty(ingredient.quantity * line.qty * wastageFactor);
        if (!(quantity > 0)) return;
        const location =
          resolveMenuStockLocation({
            station: line.station,
            stockDeductionLocation:
              ingredient.stockDeductionLocation ?? line.stockDeductionLocation ?? recipe.stockDeductionLocation,
            menuCategory: stockItem.category,
            stockPreferredLocation: stockItem.preferredLocation,
          }) ??
          resolvePosDeductionLocation(
            stockItem.preferredLocation,
            ingredient.stockDeductionLocation ?? line.stockDeductionLocation ?? recipe.stockDeductionLocation,
            stockItem.category,
          );
        if (!location) return;
        if (isGoatPoolSku(stockItem.id)) {
          pushGoatPoolConsumption(
            stockItem,
            "Butcher",
            quantity,
            lineIndex,
            line.name,
            ingredientIndex,
            recipeType,
          );
          return;
        }
        pushEntry({
          id: `${entryIdPrefix}-${lineIndex}-${ingredientIndex}`,
          type: recipeType,
          date: ledgerDateFromClosedAt(input.closedAt),
          itemId: stockItem.id,
          itemName: stockItem.name,
          category: stockItem.category,
          location,
          quantity,
          unit: ingredient.unit,
          totalCost: money(quantity * stockItem.purchasePrice),
          enteredBy: input.enteredBy,
          notes: `${notesPrefix}: ${line.name}`,
          referenceNo,
        });
      });
      return;
    }

    const goatPoolSku = resolveGoatPoolSkuForMenuItem(line.menuItemId, line.name);
    const directItem =
      (goatPoolSku ? items.find((candidate) => candidate.id === goatPoolSku) : undefined) ??
      findStockManagedItemForMenuItem(items, {
        id: line.menuItemId ?? "",
        name_en: line.name,
        stockSku: line.stockSku,
      }) ??
      items.find((candidate) => candidate.id === line.stockSku) ??
      items.find((candidate) => normalizedKey(candidate.name) === normalizedKey(line.name));

    if (!directItem) return;

    const soldUnit = isHalfBottleUnitLabel(line.unitLabel)
      ? ("bottle" as StockUnitType)
      : stockUnitFromOrderUnitLabel(line.unitLabel) ?? directItem.baseUnit;
    let deductQty = isHalfBottleUnitLabel(line.unitLabel) ? qty(line.qty * 0.5) : qty(line.qty);
    let deductUnit: StockUnitType = soldUnit;
    let bottleNote = isHalfBottleUnitLabel(line.unitLabel) ? " (half bottle)" : "";

    if (!isHalfBottleUnitLabel(line.unitLabel) && soldUnit !== directItem.baseUnit) {
      const asBase = convertStockQuantity(directItem, line.qty, soldUnit, directItem.baseUnit);
      if (Number.isFinite(asBase) && asBase > 0) {
        deductQty = qty(line.qty);
        deductUnit = soldUnit;
        bottleNote = ` (${asBase} ${directItem.baseUnit})`;
      } else {
        deductQty = qty(line.qty);
        deductUnit = soldUnit;
      }
    } else if (isHalfBottleUnitLabel(line.unitLabel) && directItem.baseUnit !== "bottle") {
      const asBase = convertStockQuantity(directItem, deductQty, "bottle", directItem.baseUnit);
      if (Number.isFinite(asBase) && asBase > 0) {
        deductQty = qty(asBase);
        deductUnit = directItem.baseUnit;
        bottleNote = ` (half bottle → ${asBase} ${directItem.baseUnit})`;
      }
    }

    const location =
      resolveMenuStockLocation({
        station: line.station,
        stockDeductionLocation: line.stockDeductionLocation,
        menuCategory: directItem.category,
        stockPreferredLocation: directItem.preferredLocation,
      }) ??
      resolvePosDeductionLocation(
        line.stockDeductionLocation ?? directItem.preferredLocation,
        line.stockDeductionLocation,
        directItem.category,
      );
    if (!location) return;

    if (isGoatPoolSku(directItem.id) || goatPoolSku) {
      // Goat pool kg always deducts from Butcher House, never Kitchen/Store.
      pushGoatPoolConsumption(directItem, "Butcher", line.qty, lineIndex, line.name);
      return;
    }

    const baseForCost =
      deductUnit === directItem.baseUnit
        ? deductQty
        : convertStockQuantity(directItem, deductQty, deductUnit, directItem.baseUnit);
    const costQty = Number.isFinite(baseForCost) ? qty(baseForCost) : deductQty;

    pushEntry({
      id: `${entryIdPrefix}-${lineIndex}`,
      type: directType,
      date: ledgerDateFromClosedAt(input.closedAt),
      itemId: directItem.id,
      itemName: directItem.name,
      category: directItem.category,
      location,
      quantity: deductQty,
      unit: deductUnit,
      totalCost: money(costQty * directItem.purchasePrice),
      enteredBy: input.enteredBy,
      notes: `${notesPrefix}: ${line.name} — ${deductQty} ${deductUnit}${bottleNote}`,
      referenceNo,
    });
  });

  if (lotState) {
    lotState.lots = nextLots;
  }

  return entries;
}

export function buildPosReservationDrafts(input: {
  orderId: string;
  orderNo: string;
  reservedBy: string;
  lines: Array<{
    name: string;
    qty: number;
    stockSku?: string;
    menuItemId?: string;
    stockDeductionLocation?: OperationalStockLocation;
    station?: string;
    unitLabel?: string;
  }>;
  items: StockManagedItem[];
  recipes: StockRecipe[];
}): Omit<PosStockReservation, "id" | "reservedAt" | "status">[] {
  const drafts: Omit<PosStockReservation, "id" | "reservedAt" | "status">[] = [];
  const referenceNo = posOrderReference(input.orderId);

  input.lines.forEach((line, lineIndex) => {
    if (isPosStockDisconnectedMenuItem(line.menuItemId, line.name)) return;

    const orderLineKey = `${line.menuItemId || line.name}:${lineIndex}`;
    const recipe = input.recipes.find(
      (candidate) => normalizedKey(candidate.menuItemName) === normalizedKey(line.name),
    );
    const stationLocation = stationToOperationalLocation(line.station);

    if (recipe) {
      const wastageFactor = 1 + Math.max(0, recipe.wastageAllowance ?? 0) / 100;
      recipe.ingredients.forEach((ingredient) => {
        const stockItem = input.items.find((candidate) => candidate.id === ingredient.itemId);
        if (!stockItem) return;
        const location = resolvePosDeductionLocation(
          stockItem.preferredLocation,
          ingredient.stockDeductionLocation ?? line.stockDeductionLocation ?? recipe.stockDeductionLocation ?? stationLocation ?? undefined,
          stockItem.category,
        );
        if (!location) return;
        const quantity = qty(
          convertStockQuantity(stockItem, ingredient.quantity * line.qty * wastageFactor, ingredient.unit, stockItem.baseUnit),
        );
        if (!(quantity > 0)) return;
        drafts.push({
          orderId: input.orderId,
          orderNo: input.orderNo,
          orderLineKey,
          itemId: stockItem.id,
          itemName: stockItem.name,
          location,
          quantity,
          unit: stockItem.baseUnit,
          reservedBy: input.reservedBy,
          referenceNo,
          menuItemName: line.name,
        });
      });
      return;
    }

    const goatPoolSku = resolveGoatPoolSkuForMenuItem(line.menuItemId, line.name);
    const directItem =
      (goatPoolSku ? input.items.find((candidate) => candidate.id === goatPoolSku) : undefined) ??
      findStockManagedItemForMenuItem(input.items, {
        id: line.menuItemId ?? "",
        name_en: line.name,
        stockSku: line.stockSku,
      }) ??
      input.items.find((candidate) => candidate.id === line.stockSku) ??
      input.items.find((candidate) => normalizedKey(candidate.name) === normalizedKey(line.name));
    if (!directItem) return;
    const location =
      resolveMenuStockLocation({
        station: line.station,
        stockDeductionLocation: line.stockDeductionLocation,
        menuCategory: directItem.category,
        stockPreferredLocation: directItem.preferredLocation,
      }) ??
      resolvePosDeductionLocation(
        line.stockDeductionLocation ?? stationLocation ?? directItem.preferredLocation,
        line.stockDeductionLocation ?? stationLocation ?? undefined,
        directItem.category,
      );
    if (!location) return;
    const soldUnit = isHalfBottleUnitLabel(line.unitLabel)
      ? ("bottle" as StockUnitType)
      : stockUnitFromOrderUnitLabel(line.unitLabel) ?? directItem.baseUnit;
    let reserveQty = isHalfBottleUnitLabel(line.unitLabel) ? qty(line.qty * 0.5) : qty(line.qty);
    if (isHalfBottleUnitLabel(line.unitLabel) && directItem.baseUnit !== "bottle") {
      const asBase = convertStockQuantity(directItem, reserveQty, "bottle", directItem.baseUnit);
      reserveQty = Number.isFinite(asBase) && asBase > 0 ? qty(asBase) : reserveQty;
    } else if (!isHalfBottleUnitLabel(line.unitLabel) && soldUnit !== directItem.baseUnit) {
      const asBase = convertStockQuantity(directItem, line.qty, soldUnit, directItem.baseUnit);
      reserveQty = Number.isFinite(asBase) && asBase > 0 ? qty(asBase) : qty(line.qty);
    }
    drafts.push({
      orderId: input.orderId,
      orderNo: input.orderNo,
      orderLineKey,
      itemId: directItem.id,
      itemName: directItem.name,
      // Goat pool kg is reserved/deducted only at Butcher House.
      location: isGoatPoolSku(directItem.id) || goatPoolSku ? "Butcher" : location,
      quantity: reserveQty,
      unit: directItem.baseUnit,
      reservedBy: input.reservedBy,
      referenceNo,
      menuItemName: line.name,
    });
  });

  return drafts;
}

export function reservePosStock(
  existing: PosStockReservation[],
  drafts: Omit<PosStockReservation, "id" | "reservedAt" | "status">[],
) {
  const activeReservedByKey = new Map<string, number>();
  for (const row of existing) {
    if (row.status !== "Reserved") continue;
    const key = `${row.orderId}:${row.orderLineKey}:${row.itemId}:${row.location}`;
    activeReservedByKey.set(key, qty((activeReservedByKey.get(key) ?? 0) + row.quantity));
  }
  const created: PosStockReservation[] = [];
  for (const draft of drafts) {
    const key = `${draft.orderId}:${draft.orderLineKey}:${draft.itemId}:${draft.location}`;
    const existingReservedQty = activeReservedByKey.get(key) ?? 0;
    const additionalQty = qty(draft.quantity - existingReservedQty);
    if (!(additionalQty > 0)) continue;
    created.push({
      ...draft,
      quantity: additionalQty,
      id: `pos-rsv-${draft.orderId}-${draft.orderLineKey}-${draft.itemId}-${Math.random().toString(36).slice(2, 7)}`,
      status: "Reserved",
      reservedAt: nowIso(),
    });
    activeReservedByKey.set(key, qty(existingReservedQty + additionalQty));
  }
  return { reservations: [...created, ...existing], created };
}

export function releasePosReservations(
  existing: PosStockReservation[],
  orderId: string,
  releasedBy?: string,
) {
  const releasedAt = nowIso();
  let changed = 0;
  const reservations = existing.map((row) => {
    if (row.orderId !== orderId || row.status !== "Reserved") return row;
    changed += 1;
    return {
      ...row,
      status: "Released" as const,
      releasedAt,
      reservedBy: releasedBy || row.reservedBy,
    };
  });
  return { reservations, changed };
}

export function consumePosReservations(
  existing: PosStockReservation[],
  orderId: string,
) {
  const consumedAt = nowIso();
  let changed = 0;
  const reservations = existing.map((row) => {
    if (row.orderId !== orderId || row.status !== "Reserved") return row;
    changed += 1;
    return { ...row, status: "Consumed" as const, consumedAt };
  });
  return { reservations, changed };
}

export function shouldReservePosStock(
  trigger: PosReservationTrigger,
  event: "order_submit" | "station_accept" | "prep_start",
) {
  return trigger === event;
}

export function shouldDeductPosStock(
  timing: PosDeductionTiming,
  event: PosDeductionTiming,
) {
  return timing === event;
}

export function orderPreparationStarted(order: {
  stockDeductedAt?: string;
  stationTickets?: Array<{ status: string }>;
}) {
  if (order.stockDeductedAt) return true;
  return (order.stationTickets ?? []).some((ticket) => ticket.status === "PREPARING" || ticket.status === "READY");
}

export function getPosConsumptionEntriesForOrder(ledger: StockLedgerEntry[], orderId: string) {
  const reference = posOrderReference(orderId);
  return ledger.filter(
    (entry) =>
      entry.referenceNo === reference &&
      (entry.type === "POS_CONSUMPTION" || entry.type === "RECIPE_CONSUMPTION"),
  );
}

export function createPosWastageEntries(input: {
  orderId: string;
  orderNo: string;
  enteredBy: string;
  reason: string;
  sourceEntries: StockLedgerEntry[];
}) {
  const at = nowIso();
  return input.sourceEntries.map((entry, index) =>
    buildLedgerEntry({
      id: `sled-pos-wst-${input.orderId}-${index}`,
      type: "WASTE",
      date: at.slice(0, 10),
      itemId: entry.itemId,
      itemName: entry.itemName,
      category: entry.category,
      location: entry.location,
      quantity: entry.quantity,
      unit: entry.unit,
      unitPrice: entry.unitPrice,
      totalCost: entry.totalCost,
      enteredBy: input.enteredBy,
      approvedBy: input.enteredBy,
      reason: input.reason,
      notes: `POS wastage for ${input.orderNo}: ${input.reason}`,
      referenceNo: posOrderReference(input.orderId),
      batchNumber: entry.batchNumber,
      expiryDate: entry.expiryDate,
    }),
  );
}

/** Posts WASTE only when consumption has not already left inventory (avoids double-deduct). */
export function createPosOrderWastageEntries(input: {
  orderId: string;
  orderNo: string;
  enteredBy: string;
  reason: string;
  lines: Array<{
    name: string;
    qty: number;
    stockSku?: string;
    menuItemId?: string;
    stockDeductionLocation?: OperationalStockLocation;
    station?: string;
  }>;
  items: StockManagedItem[];
  recipes: StockRecipe[];
  ledger: StockLedgerEntry[];
  lots?: StockLot[];
}) {
  const existing = getPosConsumptionEntriesForOrder(input.ledger, input.orderId);
  if (existing.length > 0) {
    return { entries: [] as StockLedgerEntry[], alreadyDeducted: true, sourceEntries: existing };
  }
  const lotState = input.lots ? { lots: [...input.lots] } : undefined;
  // Wastage must still post even when on-hand is short — write-off is the point.
  const drafts = createPosStockDeductionEntries(
    {
      orderId: input.orderId,
      orderNo: input.orderNo,
      closedAt: nowIso(),
      enteredBy: input.enteredBy,
      lines: input.lines,
      skipIfAlreadyDeducted: false,
    },
    input.items,
    input.recipes,
    input.ledger,
    lotState,
    { allowNegativeStock: true },
  );
  return {
    entries: createPosWastageEntries({
      orderId: input.orderId,
      orderNo: input.orderNo,
      enteredBy: input.enteredBy,
      reason: input.reason,
      sourceEntries: drafts,
    }),
    alreadyDeducted: false,
    sourceEntries: drafts,
  };
}

function filterPosEntriesByLineNames(entries: StockLedgerEntry[], lineNames?: string[]) {
  if (!lineNames || lineNames.length === 0) return entries;
  const keys = lineNames.map((name) => name.trim().toLowerCase()).filter(Boolean);
  if (keys.length === 0) return entries;
  return entries.filter((entry) =>
    keys.some(
      (name) =>
        entry.notes?.toLowerCase().includes(`: ${name}`) ||
        entry.itemName.trim().toLowerCase() === name,
    ),
  );
}

export type PosPartialReturnLine = {
  name: string;
  returnQty: number;
  orderedQty: number;
};

/** Scale ledger rows when only part of a sold line is returned. */
function scalePosEntriesForPartialReturn(
  entries: StockLedgerEntry[],
  partialLines?: PosPartialReturnLine[],
) {
  if (!partialLines || partialLines.length === 0) return entries;
  const byName = new Map(
    partialLines.map((line) => [line.name.trim().toLowerCase(), line] as const),
  );
  return entries
    .map((entry) => {
      const match =
        [...byName.entries()].find(
          ([name]) =>
            entry.notes?.toLowerCase().includes(`: ${name}`) ||
            entry.itemName.trim().toLowerCase() === name,
        )?.[1] ?? null;
      if (!match || match.orderedQty <= 0 || match.returnQty >= match.orderedQty) return entry;
      const ratio = Math.max(0, Math.min(1, match.returnQty / match.orderedQty));
      if (ratio <= 0) return null;
      const quantity = Math.round(entry.quantity * ratio * 1000) / 1000;
      if (quantity <= 0) return null;
      return {
        ...entry,
        quantity,
        totalCost: Math.round((entry.unitPrice ?? 0) * quantity * 100) / 100,
      };
    })
    .filter((entry): entry is StockLedgerEntry => Boolean(entry));
}

export function createPosOrderStockReversal(input: {
  orderId: string;
  orderNo: string;
  reversedBy: string;
  reason: string;
  ledger: StockLedgerEntry[];
  /** When set, only reverse consumption for these sold line names. */
  lineNames?: string[];
  /** When set, scale reversed qty for partial line returns. */
  partialLines?: PosPartialReturnLine[];
}) {
  const sourceEntries = scalePosEntriesForPartialReturn(
    filterPosEntriesByLineNames(
      getPosConsumptionEntriesForOrder(input.ledger, input.orderId),
      input.lineNames,
    ),
    input.partialLines,
  );
  if (sourceEntries.length === 0) {
    return { voucher: null, reversalEntries: [] as StockLedgerEntry[], sourceEntries };
  }
  const result = createCancellationReversalVoucher(
    posOrderReference(input.orderId),
    "Stock Ledger Entry",
    input.reversedBy,
    `${input.reason} (order ${input.orderNo})`,
    sourceEntries,
  );
  return { ...result, sourceEntries };
}

export function createPosPackagedReturnEntries(input: {
  orderId: string;
  orderNo: string;
  enteredBy: string;
  reason: string;
  ledger: StockLedgerEntry[];
  /** When set, only restore packaged stock for these sold line names. */
  lineNames?: string[];
  /** When set, scale restored qty for partial line returns. */
  partialLines?: PosPartialReturnLine[];
}) {
  const sourceEntries = scalePosEntriesForPartialReturn(
    filterPosEntriesByLineNames(
      getPosConsumptionEntriesForOrder(input.ledger, input.orderId).filter(
        (entry) => entry.type === "POS_CONSUMPTION",
      ),
      input.lineNames,
    ),
    input.partialLines,
  );
  const at = nowIso();
  const entries = sourceEntries.map((entry, index) =>
    buildLedgerEntry({
      id: `sled-pos-ret-${input.orderId}-${index}`,
      type: "DEPARTMENT_RETURN",
      date: at.slice(0, 10),
      itemId: entry.itemId,
      itemName: entry.itemName,
      category: entry.category,
      location: entry.location,
      quantity: entry.quantity,
      unit: entry.unit,
      unitPrice: entry.unitPrice,
      totalCost: entry.totalCost,
      enteredBy: input.enteredBy,
      approvedBy: input.enteredBy,
      reason: input.reason,
      notes: `Packaged return to department for ${input.orderNo}: ${input.reason}`,
      referenceNo: posOrderReference(input.orderId),
    }),
  );
  return { entries, sourceEntries };
}

export function resolveEffectivePosOutOfStockBehavior(
  settings: InventorySettingsRecord,
  menuItemBehavior?: PosOutOfStockBehavior | string | null,
): PosOutOfStockBehavior {
  if (menuItemBehavior && POS_OOS_BEHAVIORS.includes(menuItemBehavior as PosOutOfStockBehavior)) {
    return menuItemBehavior as PosOutOfStockBehavior;
  }
  return settings.posOutOfStockBehavior;
}

export function evaluatePosStockSale(input: {
  behavior: PosOutOfStockBehavior;
  remainingQty: number | null;
  tracked: boolean;
  role?: string;
  managerApproved?: boolean;
}): { allowed: boolean; requiresManager: boolean; reason?: string } {
  if (!input.tracked || input.remainingQty == null) {
    return { allowed: true, requiresManager: false };
  }
  if (input.remainingQty >= 0) {
    return { allowed: true, requiresManager: false };
  }

  switch (input.behavior) {
    case "block":
    case "auto_unavailable":
      return { allowed: false, requiresManager: false, reason: "Item is out of stock." };
    case "warn_manager":
      return input.managerApproved
        ? { allowed: true, requiresManager: true }
        : { allowed: false, requiresManager: true, reason: "Manager approval required to sell beyond available stock." };
    case "allow_negative_authorized": {
      const authorized = ["Administrator", "Inventory Administrator", "Branch Manager", "Store Manager", "Supervisor"].includes(input.role || "");
      return authorized
        ? { allowed: true, requiresManager: false }
        : { allowed: false, requiresManager: false, reason: "Negative stock is restricted to authorized roles." };
    }
    default:
      return { allowed: false, requiresManager: false, reason: "Item is out of stock." };
  }
}

export function resolvePosVoidStockOutcome(input: {
  preparationStarted: boolean;
  stockDeducted: boolean;
  reusablePackaged?: boolean;
}): PosVoidStockOutcome {
  if (!input.preparationStarted && !input.stockDeducted) return "release_only";
  if (input.stockDeducted && input.reusablePackaged) return "reversal";
  if (input.stockDeducted || input.preparationStarted) return "wastage";
  return "release_only";
}

export function resolvePosAvailabilityStatus(input: {
  tracked: boolean;
  availableQty: number | null;
  remainingQty?: number | null;
  minimumStock?: number;
  reorderLevel?: number;
  source?: "recipe" | "direct" | "name" | null;
  behavior?: PosOutOfStockBehavior;
  temporarilyBlocked?: boolean;
}): PosAvailabilityStatus | null {
  if (!input.tracked || input.availableQty == null) return null;
  if (input.temporarilyBlocked || (input.behavior === "auto_unavailable" && input.availableQty <= 0)) {
    return "Temporarily Blocked";
  }
  const sellable = input.remainingQty ?? input.availableQty;
  if (sellable <= 0) {
    return input.source === "recipe" ? "Insufficient Ingredients" : "Out";
  }
  const lowThreshold = Math.max(0, input.minimumStock ?? input.reorderLevel ?? 0);
  if (lowThreshold > 0 && sellable <= lowThreshold) return "Low";
  if (sellable <= 3 && lowThreshold <= 0) return "Low";
  return "In Stock";
}

export function computeRecipePortionsAvailable(
  recipe: StockRecipe,
  items: StockManagedItem[],
  balances: StockLocationBalance[],
) {
  if (recipe.ingredients.length === 0) {
    return { portions: null as number | null, bottleneckItemId: null as string | null, bottleneckItemName: null as string | null };
  }
  let portions = Number.POSITIVE_INFINITY;
  let bottleneckItemId: string | null = null;
  let bottleneckItemName: string | null = null;
  for (const ingredient of recipe.ingredients) {
    const stockItem = items.find((row) => row.id === ingredient.itemId);
    if (!stockItem) {
      return { portions: 0, bottleneckItemId: ingredient.itemId, bottleneckItemName: ingredient.itemName };
    }
    const location =
      ingredient.stockDeductionLocation
      ?? recipe.stockDeductionLocation
      ?? stockItem.preferredLocation;
    const balance = balances.find((row) => row.itemId === stockItem.id && row.location === location)
      ?? balances.find((row) => row.itemId === stockItem.id);
    const availableBaseQty = balance?.availableQuantity ?? balance?.quantity ?? 0;
    const requiredBaseQty = convertStockQuantity(
      stockItem,
      ingredient.quantity * (1 + Math.max(0, recipe.wastageAllowance ?? 0) / 100),
      ingredient.unit,
      stockItem.baseUnit,
    );
    if (!(requiredBaseQty > 0) || !Number.isFinite(requiredBaseQty)) {
      return { portions: 0, bottleneckItemId: stockItem.id, bottleneckItemName: stockItem.name };
    }
    const canMake = availableBaseQty / requiredBaseQty;
    if (canMake < portions) {
      portions = canMake;
      bottleneckItemId = stockItem.id;
      bottleneckItemName = stockItem.name;
    }
  }
  const normalized = Number.isFinite(portions) ? qty(Math.max(0, Math.floor(portions * 1000) / 1000)) : 0;
  return { portions: normalized, bottleneckItemId, bottleneckItemName };
}

export function suggestDepartmentRestockQuantity(
  balance: Pick<StockLocationBalance, "quantity" | "availableQuantity" | "reorderLevel">,
  policy?: Pick<LocationStockPolicy, "reorderQuantity" | "maximumStock" | "safetyStock"> | null,
) {
  const onHand = balance.availableQuantity ?? balance.quantity;
  const target = policy?.maximumStock
    ?? Math.max(balance.reorderLevel * 2, balance.reorderLevel + (policy?.safetyStock ?? 0), onHand);
  const suggested = policy?.reorderQuantity && policy.reorderQuantity > 0
    ? policy.reorderQuantity
    : Math.max(0, qty(target - onHand));
  return qty(Math.max(suggested, balance.reorderLevel > onHand ? balance.reorderLevel - onHand : 0));
}

export function availableQuantityAtLocation(
  balances: StockLocationBalance[],
  itemId: string,
  location: StockLocation,
) {
  const row = balances.find((candidate) => candidate.itemId === itemId && candidate.location === location);
  return qty(row?.availableQuantity ?? row?.quantity ?? 0);
}

export function pickPreferredSourceStore(balances: StockLocationBalance[], itemId: string): CentralStockLocation {
  const store1 = availableQuantityAtLocation(balances, itemId, "Store 1");
  const store2 = availableQuantityAtLocation(balances, itemId, "Store 2");
  return store2 > store1 ? "Store 2" : "Store 1";
}

export type PreferredSourcePreference = CentralStockLocation | "Best Available";

export function resolvePreferredSourceStore(
  balances: StockLocationBalance[],
  itemId: string,
  preference: PreferredSourcePreference = "Best Available",
): CentralStockLocation {
  if (preference === "Best Available") return pickPreferredSourceStore(balances, itemId);
  return preference;
}

export function buildPosShiftClosePack(input: {
  date: string;
  closedBy: string;
  orders: Array<{
    id: string;
    orderNo: string;
    status: string;
    total: number;
    waiter: string;
    enteredByCashier?: string;
    paymentStatus?: string;
    cancelledAt?: string;
    returnedAt?: string;
    stockExceptionOutcome?: string;
    stationTickets?: Array<{ station: string; status: string }>;
  }>;
  payments: Array<{ amount: number; status: string; method: string; amountReceived?: number; changeAmount?: number }>;
  ledger: StockLedgerEntry[];
  posReservations: PosStockReservation[];
  negativeSaleAttempts?: PosNegativeSaleAttempt[];
}): PosShiftClosePack {
  const dayOrders = input.orders;
  const settled = input.payments.filter((payment) => payment.status === "Settled");
  const salesTotal = dayOrders
    .filter((order) => order.paymentStatus === "Paid" || order.status === "CLOSED")
    .reduce((sum, order) => sum + order.total, 0);
  const paymentTotal = settled.reduce((sum, payment) => sum + payment.amount, 0);
  const voidCount = dayOrders.filter((order) => order.status === "CANCELLED" || order.cancelledAt).length;
  const refundCount = dayOrders.filter((order) => order.status === "RETURNED" || order.returnedAt).length;
  const unclosedOrders = dayOrders.filter((order) => !["CLOSED", "CANCELLED", "RETURNED"].includes(order.status)).length;
  const dayLedger = input.ledger.filter((entry) => entry.date === input.date);
  const consumption = dayLedger.filter((entry) => entry.type === "POS_CONSUMPTION" || entry.type === "RECIPE_CONSUMPTION");
  const wastage = dayLedger.filter((entry) => entry.type === "WASTE" || entry.type === "DAMAGE");
  const reversals = dayLedger.filter((entry) => entry.type === "CANCELLATION_REVERSAL" || entry.type === "DEPARTMENT_RETURN");
  const dayAttempts = (input.negativeSaleAttempts ?? []).filter((row) => row.attemptedAt.slice(0, 10) === input.date);
  const negativeStockAttempts = dayAttempts.length;
  const reservedQty = input.posReservations
    .filter((row) => row.status === "Reserved")
    .reduce((sum, row) => sum + row.quantity, 0);
  const consumptionByDepartment = new Map<string, { location: string; quantity: number; value: number }>();
  for (const entry of consumption) {
    const key = String(entry.location);
    const current = consumptionByDepartment.get(key) ?? { location: key, quantity: 0, value: 0 };
    current.quantity = qty(current.quantity + entry.quantity);
    current.value = money(current.value + entry.totalCost);
    consumptionByDepartment.set(key, current);
  }
  return {
    id: `shift-${input.date}-${Date.now()}`,
    date: input.date,
    closedAt: nowIso(),
    closedBy: input.closedBy,
    salesTotal: money(salesTotal),
    paymentTotal: money(paymentTotal),
    voidCount,
    refundCount,
    unclosedOrders,
    consumptionQty: qty(consumption.reduce((sum, row) => sum + row.quantity, 0)),
    consumptionValue: money(consumption.reduce((sum, row) => sum + row.totalCost, 0)),
    wastageQty: qty(wastage.reduce((sum, row) => sum + row.quantity, 0)),
    wastageValue: money(wastage.reduce((sum, row) => sum + row.totalCost, 0)),
    reversalValue: money(reversals.reduce((sum, row) => sum + row.totalCost, 0)),
    reservedQty: qty(reservedQty),
    negativeStockAttempts,
    consumptionByDepartment: [...consumptionByDepartment.values()].sort((a, b) => a.location.localeCompare(b.location)),
  };
}

export function openPosShiftSession(input: {
  openedBy: string;
  balances: StockLocationBalance[];
  notes?: string;
}): PosShiftSession {
  const at = nowIso();
  return {
    id: `shift-session-${Date.now()}`,
    openedAt: at,
    openedBy: input.openedBy,
    status: "Open",
    date: at.slice(0, 10),
    notes: input.notes,
    openingBalances: input.balances
      .filter((row) => isOperationalStockLocation(row.location))
      .map((row) => ({
        itemId: row.itemId,
        itemName: row.itemName,
        location: row.location,
        quantity: row.quantity,
        reservedQuantity: row.reservedQuantity,
        availableQuantity: row.availableQuantity,
      })),
  };
}

export function closePosShiftSession(
  session: PosShiftSession,
  closedBy: string,
  closePack: PosShiftClosePack,
): PosShiftSession {
  return {
    ...session,
    status: "Closed",
    closedAt: closePack.closedAt,
    closedBy,
    closePack,
  };
}

export function recordPosNegativeSaleAttempt(input: Omit<PosNegativeSaleAttempt, "id" | "attemptedAt">): PosNegativeSaleAttempt {
  return {
    id: `neg-sale-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    attemptedAt: nowIso(),
    ...input,
  };
}

export function buildPosIntegratedReports(input: {
  orders: Array<{
    id: string;
    orderNo: string;
    status: string;
    total: number;
    waiter: string;
    enteredByCashier?: string;
    paymentStatus?: string;
    cancelledAt?: string;
    returnedAt?: string;
    stockExceptionOutcome?: string;
    items: Array<{ name: string; qty: number; unitPrice?: number; station?: string; finalStation?: string; stockDeductionLocation?: string }>;
  }>;
  ledger: StockLedgerEntry[];
  posReservations: PosStockReservation[];
  fromDate?: string;
  toDate?: string;
}) {
  const inRange = (date: string) =>
    (!input.fromDate || date >= input.fromDate) && (!input.toDate || date <= input.toDate);

  const salesByStation = new Map<string, { key: string; orders: number; quantity: number; sales: number }>();
  const salesByWaiter = new Map<string, { key: string; orders: number; sales: number }>();
  const salesByCashier = new Map<string, { key: string; orders: number; sales: number }>();

  for (const order of input.orders) {
    if (order.paymentStatus !== "Paid" && order.status !== "CLOSED") continue;
    for (const line of order.items) {
      const station = line.stockDeductionLocation || line.finalStation || line.station || "Unassigned";
      const current = salesByStation.get(station) ?? { key: station, orders: 0, quantity: 0, sales: 0 };
      current.quantity = qty(current.quantity + line.qty);
      current.sales = money(current.sales + line.qty * (line.unitPrice ?? 0));
      salesByStation.set(station, current);
    }
    const waiter = salesByWaiter.get(order.waiter) ?? { key: order.waiter, orders: 0, sales: 0 };
    waiter.orders += 1;
    waiter.sales = money(waiter.sales + order.total);
    salesByWaiter.set(order.waiter, waiter);
    const cashierName = order.enteredByCashier || "Unknown";
    const cashier = salesByCashier.get(cashierName) ?? { key: cashierName, orders: 0, sales: 0 };
    cashier.orders += 1;
    cashier.sales = money(cashier.sales + order.total);
    salesByCashier.set(cashierName, cashier);
  }

  const scopedLedger = input.ledger.filter((entry) => inRange(entry.date));
  const consumption = buildConsumptionReport(scopedLedger, input.fromDate, input.toDate);
  const reversals = scopedLedger
    .filter((entry) => entry.type === "CANCELLATION_REVERSAL" || entry.type === "DEPARTMENT_RETURN")
    .map((entry) => ({
      date: entry.date,
      type: entry.type,
      itemName: entry.itemName,
      location: String(entry.location),
      quantity: entry.quantity,
      totalCost: entry.totalCost,
      referenceNo: entry.referenceNo || "",
    }));
  const voidsCancelsRefunds = input.orders
    .filter((order) => order.status === "CANCELLED" || order.status === "RETURNED" || order.cancelledAt || order.returnedAt)
    .map((order) => ({
      orderNo: order.orderNo,
      status: order.status,
      total: order.total,
      outcome: order.stockExceptionOutcome || "",
      waiter: order.waiter,
      cashier: order.enteredByCashier || "",
    }));
  const reservedStock = input.posReservations
    .filter((row) => row.status === "Reserved")
    .map((row) => ({
      orderNo: row.orderNo,
      itemName: row.itemName,
      location: row.location,
      quantity: row.quantity,
      reservedBy: row.reservedBy,
    }));
  const cogs = money(consumption.reduce((sum, row) => sum + row.totalCost, 0));
  const salesTotal = money([...salesByWaiter.values()].reduce((sum, row) => sum + row.sales, 0));

  return {
    salesByStation: [...salesByStation.values()].sort((a, b) => b.sales - a.sales),
    salesByWaiter: [...salesByWaiter.values()].sort((a, b) => b.sales - a.sales),
    salesByCashier: [...salesByCashier.values()].sort((a, b) => b.sales - a.sales),
    consumption,
    reversals,
    voidsCancelsRefunds,
    reservedStock,
    cogs,
    salesTotal,
    foodAndBevCostPercent: salesTotal > 0 ? money((cogs / salesTotal) * 100) : 0,
  };
}

function calculateItemUnitValue(item?: StockManagedItem, settings: InventorySettingsRecord = DEFAULT_INVENTORY_SETTINGS) {
  if (!item) return 0;
  return resolveItemUnitCost(item, settings);
}

export function buildLocationBalances(
  items: StockManagedItem[],
  ledger: StockLedgerEntry[],
  transfers: StockTransferRecord[] = [],
  policies: LocationStockPolicy[] = [],
  settings: InventorySettingsRecord = DEFAULT_INVENTORY_SETTINGS,
  lots: StockLot[] = [],
  posReservations: PosStockReservation[] = [],
) {
  const balances = new Map<string, StockLocationBalance>();

  for (const item of items) {
    const baseKey = `${item.id}:${item.preferredLocation}`;
    const policy = getLocationPolicy(policies, item.id, item.preferredLocation);
    const unitCost = calculateItemUnitValue(item, settings);
    const transferReserved = getReservedStockQuantity(transfers, item.id, item.preferredLocation);
    const posReserved = getPosReservedQuantity(posReservations, item.id, item.preferredLocation);
    const reservedQuantity = qty(transferReserved + posReserved);
    balances.set(baseKey, {
      itemId: item.id,
      itemName: item.name,
      category: item.category,
      unit: item.baseUnit,
      location: item.preferredLocation,
      quantity: item.currentStock,
      reservedQuantity,
      availableQuantity: getSellableStockQuantity(item.currentStock, reservedQuantity),
      incomingQuantity: getIncomingStockQuantity(transfers, item.id, item.preferredLocation),
      reorderLevel: policy?.reorderLevel ?? item.reorderLevel,
      unitCost,
      inventoryValue: money(item.currentStock * unitCost),
    });
  }

  for (const entry of ledger) {
    if (!entry.itemId) continue;
    const entryItemId = entry.itemId;
    const item = items.find((candidate) => candidate.id === entry.itemId);
    if (!item) continue;
    const valuePerUnit = entry.unitPrice || calculateItemUnitValue(item, settings);
    const apply = (location: StockLocation, delta: number) => {
      const key = locationKey(entryItemId, location);
      const policy = getLocationPolicy(policies, item.id, location);
      const transferReserved = getReservedStockQuantity(transfers, item.id, location);
      const posReserved = getPosReservedQuantity(posReservations, item.id, location);
      const reservedQuantity = qty(transferReserved + posReserved);
      const existing =
        balances.get(key) ?? {
          itemId: item.id,
          itemName: item.name,
          category: item.category,
          unit: item.baseUnit,
          location,
          quantity: 0,
          reservedQuantity,
          availableQuantity: 0,
          incomingQuantity: getIncomingStockQuantity(transfers, item.id, location),
          reorderLevel: policy?.reorderLevel ?? item.reorderLevel,
          unitCost: valuePerUnit,
          inventoryValue: 0,
        };
      const nextQty = qty(existing.quantity + delta);
      const fifoValue = money(
        lots
          .filter((lot) => lot.itemId === item.id && lot.location === location && lot.status === "Available")
          .reduce((sum, lot) => sum + lot.quantity * lot.unitCost, 0),
      );
      // A zero cost means "not priced yet" (item created without purchase price):
      // adopt the first priced ledger entry (e.g. GRV unit cost) instead of
      // sticking at 0, which made inventory value read 0 despite stock on hand.
      const effectiveUnitCost = existing.unitCost && existing.unitCost > 0 ? existing.unitCost : valuePerUnit;
      balances.set(key, {
        ...existing,
        quantity: nextQty,
        reservedQuantity,
        availableQuantity: getSellableStockQuantity(nextQty, reservedQuantity),
        incomingQuantity: getIncomingStockQuantity(transfers, item.id, location),
        reorderLevel: policy?.reorderLevel ?? item.reorderLevel,
        unitCost: effectiveUnitCost,
        inventoryValue:
          settings.costingMethod === "FIFO" && lots.some((lot) => lot.itemId === item.id && lot.location === location)
            ? fifoValue
            : money(nextQty * effectiveUnitCost),
      });
    };

    const convertedQuantity = convertStockQuantity(item, entry.quantity, entry.unit, item.baseUnit);
    if (!Number.isFinite(convertedQuantity)) continue;

    if (entry.type === "TRANSFER_OUT" && entry.fromLocation) apply(normalizeStockLocation(entry.fromLocation), -convertedQuantity);
    if (entry.type === "TRANSFER_IN" && entry.toLocation) apply(normalizeStockLocation(entry.toLocation), convertedQuantity);
    if (entry.type !== "TRANSFER_OUT" && entry.type !== "TRANSFER_IN" && STOCK_LOCATIONS.includes(normalizeStockLocation(String(entry.location)))) {
      apply(normalizeStockLocation(String(entry.location)), signedEntryQuantity({ ...entry, quantity: convertedQuantity }));
    }
  }

  // Ensure in-transit / reserved destinations appear even when on-hand is still 0.
  for (const transfer of transfers) {
    for (const line of transfer.lines) {
      const item = items.find((candidate) => candidate.id === line.itemId);
      if (!item) continue;
      for (const location of [transfer.sourceLocation, transfer.destinationLocation] as StockLocation[]) {
        const reservedQuantity = qty(
          getReservedStockQuantity(transfers, item.id, location) + getPosReservedQuantity(posReservations, item.id, location),
        );
        const incomingQuantity = getIncomingStockQuantity(transfers, item.id, location);
        if (!(reservedQuantity > 0 || incomingQuantity > 0)) continue;
        const key = locationKey(item.id, location);
        if (balances.has(key)) continue;
        const policy = getLocationPolicy(policies, item.id, location);
        const unitCost = calculateItemUnitValue(item, settings);
        balances.set(key, {
          itemId: item.id,
          itemName: item.name,
          category: item.category,
          unit: item.baseUnit,
          location,
          quantity: 0,
          reservedQuantity,
          availableQuantity: getSellableStockQuantity(0, reservedQuantity),
          incomingQuantity,
          reorderLevel: policy?.reorderLevel ?? item.reorderLevel,
          unitCost,
          inventoryValue: 0,
        });
      }
    }
  }

  // Goat pool on-hand at Butcher is lot-authoritative (same as Goat processing "left").
  // Ledger can lag after edits/sync, so reconcile quantity from available lots.
  for (const sku of GOAT_POOL_SKUS) {
    const item = items.find((candidate) => candidate.id === sku);
    if (!item) continue;
    const poolLots = lots.filter(
      (lot) => lot.itemId === sku && lot.location === "Butcher" && lot.status === "Available",
    );
    if (poolLots.length === 0 && !lots.some((lot) => lot.itemId === sku)) continue;
    const lotQty = qty(poolLots.reduce((sum, lot) => sum + lot.quantity, 0));
    const key = locationKey(sku, "Butcher");
    const policy = getLocationPolicy(policies, item.id, "Butcher");
    const transferReserved = getReservedStockQuantity(transfers, item.id, "Butcher");
    const posReserved = getPosReservedQuantity(posReservations, item.id, "Butcher");
    const reservedQuantity = qty(transferReserved + posReserved);
    const existing = balances.get(key);
    const unitCost = existing?.unitCost && existing.unitCost > 0 ? existing.unitCost : calculateItemUnitValue(item, settings);
    balances.set(key, {
      itemId: item.id,
      itemName: item.name,
      category: item.category,
      unit: item.baseUnit,
      location: "Butcher",
      quantity: lotQty,
      reservedQuantity,
      availableQuantity: getSellableStockQuantity(lotQty, reservedQuantity),
      incomingQuantity: getIncomingStockQuantity(transfers, item.id, "Butcher"),
      reorderLevel: policy?.reorderLevel ?? item.reorderLevel,
      unitCost,
      inventoryValue:
        settings.costingMethod === "FIFO"
          ? money(poolLots.reduce((sum, lot) => sum + lot.quantity * lot.unitCost, 0))
          : money(lotQty * unitCost),
    });
  }

  return [...balances.values()].sort((a, b) => a.itemName.localeCompare(b.itemName) || a.location.localeCompare(b.location));
}

export function buildStockDashboardSummary(
  items: StockManagedItem[],
  ledger: StockLedgerEntry[],
  requests: StockRequestRecord[] = [],
  transfers: StockTransferRecord[] = [],
  counts: StockCountSession[] = [],
  policies: LocationStockPolicy[] = [],
  settings: InventorySettingsRecord = DEFAULT_INVENTORY_SETTINGS,
  lots: StockLot[] = [],
  workspace: import("@/lib/inventory-access").InventoryWorkspace = "all",
  posReservations: PosStockReservation[] = [],
  closings: StockClosingRecord[] = [],
  todaySalesRevenue = 0,
  staffConsumptions: StaffConsumptionDocument[] = [],
  assignedLocations: OperationalStockLocation[] = [],
) {
  const balances = buildLocationBalances(items, ledger, transfers, policies, settings, lots, posReservations);
  const scopedBalances =
    workspace === "all" ? balances : balances.filter((row) => row.location === workspace);
  const today = todayKey();
  const dailyPeriodStart = resolveDailyDashboardPeriodStart(closings, workspace, today);
  const todaysEntries = ledger.filter(
    (entry) =>
      entry.date === today &&
      isInDailyDashboardPeriod(entry.date, entry.transactionAt, dailyPeriodStart),
  );
  const workspaceEntries =
    workspace === "all"
      ? todaysEntries
      : todaysEntries.filter(
          (entry) =>
            entry.location === workspace ||
            entry.fromLocation === workspace ||
            entry.toLocation === workspace,
        );
  const topSellingMap = new Map<string, { itemName: string; quantity: number; totalCost: number }>();
  const issuedMap = new Map<string, { itemName: string; quantity: number; totalCost: number }>();

  for (const entry of workspaceEntries.filter((candidate) =>
    ["MANUAL_DEDUCTION", "POS_CONSUMPTION", "RECIPE_CONSUMPTION", "DAILY_CONSUMPTION", "STAFF_CONSUMPTION"].includes(candidate.type),
  )) {
    const current = topSellingMap.get(entry.itemName) ?? { itemName: entry.itemName, quantity: 0, totalCost: 0 };
    current.quantity = qty(current.quantity + entry.quantity);
    current.totalCost = money(current.totalCost + entry.totalCost);
    topSellingMap.set(entry.itemName, current);
  }

  for (const entry of workspaceEntries.filter((candidate) => candidate.type === "TRANSFER_OUT")) {
    const current = issuedMap.get(entry.itemName) ?? { itemName: entry.itemName, quantity: 0, totalCost: 0 };
    current.quantity = qty(current.quantity + entry.quantity);
    current.totalCost = money(current.totalCost + entry.totalCost);
    issuedMap.set(entry.itemName, current);
  }

  const locationValues = Object.fromEntries(
    STOCK_LOCATIONS.map((location) => [
      location,
      money(balances.filter((row) => row.location === location).reduce((sum, row) => sum + row.inventoryValue, 0)),
    ]),
  ) as Record<StockLocation, number>;

  const locationComparison = STOCK_LOCATIONS.map((location) => {
    const rows = balances.filter((row) => row.location === location);
    const lastMovement = ledger
      .filter((entry) => entry.location === location || entry.fromLocation === location || entry.toLocation === location)
      .sort((a, b) => b.date.localeCompare(a.date))[0]?.date;
    return {
      location,
      totalItems: rows.length,
      inventoryValue: money(rows.reduce((sum, row) => sum + row.inventoryValue, 0)),
      availableValue: money(rows.reduce((sum, row) => sum + row.availableQuantity * (row.unitCost ?? 0), 0)),
      reservedValue: money(rows.reduce((sum, row) => sum + row.reservedQuantity * (row.unitCost ?? 0), 0)),
      lowStock: rows.filter((row) => row.quantity <= row.reorderLevel).length,
      outOfStock: rows.filter((row) => row.quantity <= 0).length,
      pendingRequests: requests.filter(
        (request) =>
          request.requestedSourceStore === location &&
          !["Received", "Rejected", "Cancelled"].includes(request.status),
      ).length,
      awaitingReceipt: transfers.filter(
        (transfer) =>
          (transfer.destinationLocation === location || transfer.sourceLocation === location) &&
          ["Dispatched", "Partially Received"].includes(transfer.status),
      ).length,
      lastMovement,
    };
  });

  const recipeToday = qty(
    workspaceEntries
      .filter((entry) => entry.type === "RECIPE_CONSUMPTION")
      .reduce((sum, row) => sum + row.quantity, 0),
  );
  const consumptionToday = qty(
    workspaceEntries
      .filter((entry) => ["POS_CONSUMPTION", "RECIPE_CONSUMPTION", "MANUAL_DEDUCTION", "DAILY_CONSUMPTION", "STAFF_CONSUMPTION"].includes(entry.type))
      .reduce((sum, row) => sum + row.quantity, 0),
  );
  const dailyConsumptionToday = qty(
    workspaceEntries
      .filter((entry) => entry.type === "DAILY_CONSUMPTION")
      .reduce((sum, row) => sum + row.quantity, 0),
  );
  const wastageToday = money(
    workspaceEntries
      .filter((entry) => ["WASTE", "DAMAGE", "EXPIRY"].includes(entry.type))
      .reduce((sum, row) => sum + row.totalCost, 0),
  );

  const staffConsumption = buildStaffConsumptionDashboardSummary(staffConsumptions, {
    workspace,
    assignedLocations,
    dailyPeriodStart,
    today,
  });

  return {
    totalInventoryValue: money(scopedBalances.reduce((sum, row) => sum + row.inventoryValue, 0)),
    store1StockValue: money(balances.filter((row) => row.location === "Store 1").reduce((sum, row) => sum + row.inventoryValue, 0)),
    store2StockValue: money(balances.filter((row) => row.location === "Store 2").reduce((sum, row) => sum + row.inventoryValue, 0)),
    departmentStockValue: money(balances.filter((row) => isOperationalStockLocation(row.location)).reduce((sum, row) => sum + row.inventoryValue, 0)),
    locationValues,
    locationComparison,
    lowStockItems: scopedBalances.filter((row) => row.quantity <= row.reorderLevel),
    outOfStockItems: scopedBalances.filter((row) => row.quantity <= 0),
    pendingStockRequests: requests.filter((request) => !["Received", "Rejected", "Cancelled"].includes(request.status)).length,
    pendingTransferReceipts: transfers.filter((transfer) => ["Dispatched", "Partially Received"].includes(transfer.status)).length,
    expiringItems: buildExpiryAlerts(lots).length,
    wastageValue: money(ledger.filter((entry) => ["WASTE", "DAMAGE", "EXPIRY"].includes(entry.type)).reduce((sum, row) => sum + row.totalCost, 0)),
    stockVarianceValue: money(
      counts
        .flatMap((count) => count.lines ?? [])
        .reduce((sum, line) => sum + Math.abs(Number(line?.varianceValue ?? 0)), 0),
    ),
    todayPurchases: money(workspaceEntries.filter((entry) => entry.type === "PURCHASE" || entry.type === "PURCHASE_RECEIPT").reduce((sum, row) => sum + row.totalCost, 0)),
    todaySalesDeductions: qty(workspaceEntries.filter((entry) => entry.type === "MANUAL_DEDUCTION" || entry.type === "POS_CONSUMPTION").reduce((sum, row) => sum + row.quantity, 0)),
    todaySalesRevenue: money(todaySalesRevenue),
    todayRecipeConsumption: recipeToday,
    todayExpenses: money(workspaceEntries.filter((entry) => entry.type === "EXPENSE").reduce((sum, row) => sum + row.totalCost, 0)),
    stockDifferences: qty(
      workspaceEntries
        .filter((entry) => entry.type === "CLOSING")
        .reduce((sum, row) => sum + Math.abs(Number(row.notes?.match(/difference:([-0-9.]+)/)?.[1] ?? 0)), 0),
    ),
    negativeStockItems: scopedBalances.filter((row) => row.quantity < 0),
    topSellingItems: [...topSellingMap.values()].sort((a, b) => b.quantity - a.quantity).slice(0, 5),
    mostIssuedItems: [...issuedMap.values()].sort((a, b) => b.quantity - a.quantity).slice(0, 5),
    todayConsumption: consumptionToday,
    todayDailyConsumption: dailyConsumptionToday,
    todayWastage: wastageToday,
    staffConsumption,
    dailyPeriodStart,
  } satisfies StockDashboardSummary;
}

export function useStockManagementModuleState(salesRecords: SalesRecord[] = []) {
  const itemsSeed = isSupabaseConfigured ? EMPTY_STOCK_ITEMS : STOCK_ITEMS_SEED;
  const ledgerSeed = isSupabaseConfigured ? EMPTY_STOCK_LEDGER : STOCK_LEDGER_SEED;
  const recipesSeed = isSupabaseConfigured ? EMPTY_STOCK_RECIPES : STOCK_RECIPES_SEED;

  const itemsState = useModuleRecords<StockManagedItem>(STOCK_MODULE_KEYS.items, itemsSeed);
  const ledgerState = useModuleRecords<StockLedgerEntry>(STOCK_MODULE_KEYS.ledger, ledgerSeed);
  const recipesState = useModuleRecords<StockRecipe>(STOCK_MODULE_KEYS.recipes, recipesSeed);
  const closingsState = useModuleRecords<StockClosingRecord>(STOCK_MODULE_KEYS.closings, STOCK_CLOSINGS_SEED);
  const purchaseRequisitionsState = useModuleRecords<PurchaseRequisitionDocument>(STOCK_MODULE_KEYS.purchaseRequisitions, STOCK_PURCHASE_REQUISITIONS_SEED);
  const purchaseOrdersState = useModuleRecords<PurchaseOrderDocument>(STOCK_MODULE_KEYS.purchaseOrders, STOCK_PURCHASE_ORDERS_SEED);
  const goodsReceivingVouchersState = useModuleRecords<GoodsReceivingVoucherDocument>(STOCK_MODULE_KEYS.goodsReceivingVouchers, STOCK_GOODS_RECEIVING_VOUCHERS_SEED);
  const storeIssueVouchersState = useModuleRecords<StoreIssueVoucherDocument>(STOCK_MODULE_KEYS.storeIssueVouchers, STOCK_STORE_ISSUE_VOUCHERS_SEED);
  const storeTransferVouchersState = useModuleRecords<StoreTransferVoucherDocument>(STOCK_MODULE_KEYS.storeTransferVouchers, STOCK_STORE_TRANSFER_VOUCHERS_SEED);
  const goodsReturnVouchersState = useModuleRecords<GoodsReturnVoucherDocument>(STOCK_MODULE_KEYS.goodsReturnVouchers, STOCK_GOODS_RETURN_VOUCHERS_SEED);
  const stockAdjustmentVouchersState = useModuleRecords<StockAdjustmentVoucherDocument>(STOCK_MODULE_KEYS.stockAdjustmentVouchers, STOCK_ADJUSTMENT_VOUCHERS_SEED);
  const cancellationReversalsState = useModuleRecords<CancellationReversalVoucherDocument>(STOCK_MODULE_KEYS.cancellationReversals, STOCK_CANCELLATION_REVERSALS_SEED);
  const receivingsState = useModuleRecords<StockReceivingRecord>(STOCK_MODULE_KEYS.receivings, STOCK_RECEIVINGS_SEED);
  const transfersState = useModuleRecords<StockTransferRecord>(STOCK_MODULE_KEYS.transfers, STOCK_TRANSFERS_SEED);
  const requestsState = useModuleRecords<StockRequestRecord>(STOCK_MODULE_KEYS.requests, STOCK_REQUESTS_SEED);
  const returnsState = useModuleRecords<StockReturnRecord>(STOCK_MODULE_KEYS.returns, STOCK_RETURNS_SEED);
  const lossesState = useModuleRecords<StockLossRecord>(STOCK_MODULE_KEYS.losses, STOCK_LOSSES_SEED);
  const countsState = useModuleRecords<StockCountSession>(STOCK_MODULE_KEYS.counts, STOCK_COUNTS_SEED);
  const settingsState = useModuleRecords<InventorySettingsRecord>(STOCK_MODULE_KEYS.settings, STOCK_INVENTORY_SETTINGS_SEED);
  const lotsState = useModuleRecords<StockLot>(STOCK_MODULE_KEYS.lots, STOCK_LOTS_SEED);
  const locationPoliciesState = useModuleRecords<LocationStockPolicy>(STOCK_MODULE_KEYS.locationPolicies, STOCK_LOCATION_POLICIES_SEED);
  const posReservationsState = useModuleRecords<PosStockReservation>(STOCK_MODULE_KEYS.posReservations, STOCK_POS_RESERVATIONS_SEED);
  const posShiftSessionsState = useModuleRecords<PosShiftSession>(STOCK_MODULE_KEYS.posShiftSessions, STOCK_POS_SHIFT_SESSIONS_SEED);
  const posNegativeSaleAttemptsState = useModuleRecords<PosNegativeSaleAttempt>(
    STOCK_MODULE_KEYS.posNegativeSaleAttempts,
    STOCK_POS_NEGATIVE_SALE_ATTEMPTS_SEED,
  );
  const goatRegistrationsState = useModuleRecords<GoatRegistration>(
    STOCK_MODULE_KEYS.goatRegistrations,
    STOCK_GOAT_REGISTRATIONS_SEED,
  );
  const dailyConsumptionsState = useModuleRecords<DailyConsumptionDocument>(
    STOCK_MODULE_KEYS.dailyConsumptions,
    STOCK_DAILY_CONSUMPTIONS_SEED,
  );
  const staffConsumptionsState = useModuleRecords<StaffConsumptionDocument>(
    STOCK_MODULE_KEYS.staffConsumptions,
    STOCK_STAFF_CONSUMPTIONS_SEED,
  );
  const staffBreakagesState = useModuleRecords<StaffBreakageDocument>(
    STOCK_MODULE_KEYS.staffBreakages,
    STOCK_STAFF_BREAKAGES_SEED,
  );

  useEffect(() => {
    // After a module_records clear + local purge, snapshot falls back to seed.
    // Never push that seed into the backend or we refill an intentionally empty table.
    if (!hasPersistedModuleRecords(STOCK_MODULE_KEYS.items)) return;
    const current = getModuleRecordsSnapshot<StockManagedItem>(STOCK_MODULE_KEYS.items, itemsSeed);
    const { items: merged, changed } = mergeSpecialBeerTiers(current);
    if (!changed) return;
    itemsState.setRecordsLocalOnly(merged);
    void replaceModuleRecords(STOCK_MODULE_KEYS.items, merged);
  }, [itemsSeed, itemsState.setRecordsLocalOnly]);

  useEffect(() => {
    if (!isNormalizedInventoryAvailable()) return;

    let active = true;

    async function hydrateNormalizedInventory() {
      try {
        const snapshot = await loadNormalizedInventorySnapshot();
        if (!active || !snapshot) return;

        // module_records is the source of truth. Do not re-seed empty modules from
        // normalized inventory_* tables — that repopulates module_records after a DB clear.
        if (hasPersistedModuleRecords(STOCK_MODULE_KEYS.items)) {
          const goatCandidates = snapshot.items.filter((item) => isGoatPoolSku(item.id));
          if (goatCandidates.length > 0) {
            const currentItems = getModuleRecordsSnapshot<StockManagedItem>(
              STOCK_MODULE_KEYS.items,
              itemsSeed,
            );
            const { items: mergedItems, added: addedGoatItems } = mergeMissingGoatPoolItems(
              currentItems,
              goatCandidates,
              { allowDefaults: false },
            );
            if (addedGoatItems.length > 0) {
              itemsState.setRecordsLocalOnly(mergedItems);
              await replaceModuleRecords(STOCK_MODULE_KEYS.items, mergedItems);
              for (const item of addedGoatItems) {
                void import("./supabase/inventory-persistence.ts").then((mod) => mod.syncInventoryItem(item));
              }
            }
          }
        }

        if (hasPersistedModuleRecords(STOCK_MODULE_KEYS.recipes)) {
          const currentRecipes = getModuleRecordsSnapshot<StockRecipe>(STOCK_MODULE_KEYS.recipes, recipesSeed);
          const { recipes: mergedRecipes, changed: kiklRecipeChanged } = mergeKiklGoatRecipe(currentRecipes);
          if (kiklRecipeChanged) {
            recipesState.setRecords(mergedRecipes);
            await replaceModuleRecords(STOCK_MODULE_KEYS.recipes, mergedRecipes);
          }
        }
      } catch (error) {
        console.error("Normalized inventory hydrate failed", error);
      }
    }

    void hydrateNormalizedInventory();

    return () => {
      active = false;
    };
  }, [
    cancellationReversalsState.setRecords,
    countsState.setRecords,
    goatRegistrationsState.setRecords,
    goodsReceivingVouchersState.setRecords,
    goodsReturnVouchersState.setRecords,
    itemsState.setRecordsLocalOnly,
    recipesState.setRecords,
    ledgerState.setRecords,
    locationPoliciesState.setRecords,
    lotsState.setRecords,
    purchaseOrdersState.setRecords,
    purchaseRequisitionsState.setRecords,
    settingsState.setRecords,
    stockAdjustmentVouchersState.setRecords,
    storeIssueVouchersState.setRecords,
    storeTransferVouchersState.setRecords,
  ]);

  // React to ledger / reservation writes made by the POS store (setModuleRecordsSnapshot) in the same tab
  useEffect(() => {
    const ledgerEvent = `bl_module_records_updated:${STOCK_MODULE_KEYS.ledger}`;
    const reservationEvent = `bl_module_records_updated:${STOCK_MODULE_KEYS.posReservations}`;
    const lotsEvent = `bl_module_records_updated:${STOCK_MODULE_KEYS.lots}`;
    function handleLedgerUpdate() {
      const fresh = getModuleRecordsSnapshot<StockLedgerEntry>(STOCK_MODULE_KEYS.ledger, STOCK_LEDGER_SEED);
      // Keep order-submit paint responsive — balances rebuild can wait a frame.
      startTransition(() => {
        ledgerState.setRecordsLocalOnly(fresh);
      });
    }
    function handleReservationUpdate() {
      const fresh = getModuleRecordsSnapshot<PosStockReservation>(STOCK_MODULE_KEYS.posReservations, STOCK_POS_RESERVATIONS_SEED);
      startTransition(() => {
        posReservationsState.setRecordsLocalOnly(fresh);
      });
    }
    function handleLotsUpdate() {
      const fresh = getModuleRecordsSnapshot<StockLot>(STOCK_MODULE_KEYS.lots, STOCK_LOTS_SEED);
      startTransition(() => {
        lotsState.setRecordsLocalOnly(fresh);
      });
    }
    window.addEventListener(ledgerEvent, handleLedgerUpdate);
    window.addEventListener(reservationEvent, handleReservationUpdate);
    window.addEventListener(lotsEvent, handleLotsUpdate);
    return () => {
      window.removeEventListener(ledgerEvent, handleLedgerUpdate);
      window.removeEventListener(reservationEvent, handleReservationUpdate);
      window.removeEventListener(lotsEvent, handleLotsUpdate);
    };
  }, [
    ledgerState.setRecordsLocalOnly,
    lotsState.setRecordsLocalOnly,
    posReservationsState.setRecordsLocalOnly,
  ]);

  const items = itemsState.records;
  const ledger = ledgerState.records;
  const recipes = recipesState.records;
  const closings = closingsState.records;
  const purchaseRequisitions = purchaseRequisitionsState.records;
  const purchaseOrders = purchaseOrdersState.records;
  const goodsReceivingVouchers = goodsReceivingVouchersState.records;
  const storeIssueVouchers = storeIssueVouchersState.records;
  const storeTransferVouchers = storeTransferVouchersState.records;
  const goodsReturnVouchers = goodsReturnVouchersState.records;
  const stockAdjustmentVouchers = stockAdjustmentVouchersState.records;
  const cancellationReversals = cancellationReversalsState.records;
  const receivings = receivingsState.records;
  const transfers = transfersState.records;
  const requests = requestsState.records;
  const returns = returnsState.records;
  const losses = lossesState.records;
  const counts = countsState.records;
  const settings = useMemo(
    () => normalizeInventorySettings(settingsState.records[0]),
    [settingsState.records],
  );
  const lots = lotsState.records;
  const locationPolicies = locationPoliciesState.records;
  const posReservations = posReservationsState.records;
  const posShiftSessions = posShiftSessionsState.records;
  const posNegativeSaleAttempts = posNegativeSaleAttemptsState.records;
  const goatRegistrations = goatRegistrationsState.records;
  const dailyConsumptions = dailyConsumptionsState.records;
  const staffConsumptions = staffConsumptionsState.records;
  const staffBreakages = staffBreakagesState.records;

  const balances = useMemo(
    () =>
      buildLocationBalances(
        items,
        ledger,
        collectVoucherTransferMovements(storeIssueVouchers, storeTransferVouchers, transfers),
        locationPolicies,
        settings,
        lots,
        posReservations,
      ),
    [items, ledger, storeIssueVouchers, storeTransferVouchers, transfers, locationPolicies, settings, lots, posReservations],
  );
  const todaySalesRevenue = useMemo(
    () => computeDashboardTodaySalesRevenue(salesRecords, closings, "all"),
    [salesRecords, closings],
  );
  const dashboard = useMemo(
    () =>
      buildStockDashboardSummary(
        items,
        ledger,
        requests,
        collectVoucherTransferMovements(storeIssueVouchers, storeTransferVouchers, transfers),
        counts,
        locationPolicies,
        settings,
        lots,
        "all",
        posReservations,
        closings,
        todaySalesRevenue,
      ),
    [items, ledger, requests, storeIssueVouchers, storeTransferVouchers, transfers, counts, locationPolicies, settings, lots, posReservations, closings, todaySalesRevenue],
  );

  const saveItem = useCallback((item: StockManagedItem) => {
    const validation = validateStockItem(item);
    if (!validation.ok) {
      throw new Error(validation.error);
    }
    let saved: StockManagedItem | null = null;
    itemsState.setRecords((prev) => {
      const existing = prev.find((current) => current.id === item.id);
      // Quantity is ledger-controlled: preserve opening seed on update; new items start at 0.
      const next = {
        ...item,
        currentStock: existing ? existing.currentStock : 0,
        updatedAt: nowIso(),
      };
      saved = next;
      return existing ? prev.map((current) => (current.id === next.id ? next : current)) : [next, ...prev];
    });
    if (saved) {
      void import("./supabase/inventory-persistence.ts").then((mod) => mod.syncInventoryItem(saved!));
    }
  }, [itemsState]);

  const deleteItem = useCallback((itemId: string) => {
    itemsState.setRecords((prev) => prev.filter((current) => current.id !== itemId));
    void import("./supabase/inventory-persistence.ts").then((mod) => mod.syncInventoryItemDeletion(itemId));
    // Ledger entries are immutable audit records and are never deleted with the item.
    recipesState.setRecords((prev) =>
      prev
        .map((recipe) => ({
          ...recipe,
          ingredients: recipe.ingredients.filter((line) => line.itemId !== itemId),
          updatedAt: nowIso(),
        }))
        .filter((recipe) => recipe.ingredients.length > 0),
    );
  }, [itemsState, recipesState]);

  const saveLedgerEntry = useCallback((entry: StockLedgerEntry) => {
    const allowNegativeStock = false;
    const validation = validateStockLedgerEntry(itemsState.records, ledgerState.records, entry, { allowNegativeStock });
    if (!validation.ok) {
      throw new Error(validation.error);
    }
    const appended = [{ ...entry, immutable: true as const }];
    ledgerState.setRecords((prev) => appendImmutableLedgerEntries(prev, appended));
    void import("./supabase/inventory-persistence.ts").then((mod) => mod.syncInventoryLedgerAppend(appended));
  }, [itemsState.records, ledgerState]);

  const setItemsSafe = useCallback((update: StockManagedItem[] | ((prev: StockManagedItem[]) => StockManagedItem[])) => {
    itemsState.setRecords((prev) => {
      const next = typeof update === "function" ? update(prev) : update;
      // Mirror added/changed items into the normalized inventory_items table
      // (best-effort), so bulk writers like GRV confirm keep it in sync too.
      const prevById = new Map(prev.map((item) => [item.id, item]));
      const changed = next.filter((item) => {
        const before = prevById.get(item.id);
        return !before || JSON.stringify(before) !== JSON.stringify(item);
      });
      if (changed.length > 0) {
        void import("./supabase/inventory-persistence.ts").then((mod) => {
          changed.forEach((item) => mod.syncInventoryItem(item));
        });
      }
      return next;
    });
  }, [itemsState]);

  const setLedgerSafe = useCallback((update: StockLedgerEntry[] | ((prev: StockLedgerEntry[]) => StockLedgerEntry[])) => {
    ledgerState.setRecords((prev) => {
      const next = typeof update === "function" ? update(prev) : update;
      const check = assertLedgerAppendOnly(prev, next);
      if (!check.ok) {
        throw new Error(check.error);
      }
      const normalized = next.map((entry) => (entry.immutable === false ? entry : { ...entry, immutable: true }));
      const previousIds = new Set(prev.map((entry) => entry.id));
      const appended = normalized.filter((entry) => !previousIds.has(entry.id));
      if (appended.length > 0) {
        void import("./supabase/inventory-persistence.ts").then((mod) => mod.syncInventoryLedgerAppend(appended));
      }
      return normalized;
    });
  }, [ledgerState]);

  const saveRecipe = useCallback((recipe: StockRecipe) => {
    const next = { ...recipe, updatedAt: nowIso() };
    recipesState.setRecords((prev) => {
      const exists = prev.some((current) => current.id === next.id);
      return exists ? prev.map((current) => (current.id === next.id ? next : current)) : [next, ...prev];
    });
  }, [recipesState]);

  const saveClosing = useCallback((closing: StockClosingRecord) => {
    closingsState.setRecords((prev) => [closing, ...prev]);
  }, [closingsState]);

  const syncNormalizedDocument = useCallback((document: {
    id: string;
    documentType: string;
    documentNumber: string;
    status: string;
    createdBy: string;
    createdAt?: string;
    location?: string;
    sourceLocation?: string;
    destinationLocation?: string;
    approvalHistory?: InventoryApprovalHistoryEntry[];
  }) => {
    void import("./supabase/inventory-persistence.ts").then((mod) =>
      mod.syncInventoryDocument({
        id: document.id,
        documentType: document.documentType,
        documentNumber: document.documentNumber,
        status: document.status,
        createdBy: document.createdBy,
        createdAt: document.createdAt,
        location: document.location,
        sourceLocation: document.sourceLocation,
        destinationLocation: document.destinationLocation,
        payload: document,
        approvalHistory: document.approvalHistory ?? [],
        postedAt: document.status === "Posted" || document.status === "Confirmed" || document.status === "Received" ? nowIso() : undefined,
      }),
    );
  }, []);

  const savePurchaseRequisition = useCallback((document: PurchaseRequisitionDocument) => {
    purchaseRequisitionsState.setRecords((prev) => [document, ...prev.filter((row) => row.id !== document.id)]);
    syncNormalizedDocument(document);
  }, [purchaseRequisitionsState, syncNormalizedDocument]);

  const savePurchaseOrder = useCallback((document: PurchaseOrderDocument) => {
    purchaseOrdersState.setRecords((prev) => [document, ...prev.filter((row) => row.id !== document.id)]);
    syncNormalizedDocument({ ...document, location: document.destinationStore });
  }, [purchaseOrdersState, syncNormalizedDocument]);

  const saveGoodsReceivingVoucher = useCallback((document: GoodsReceivingVoucherDocument) => {
    goodsReceivingVouchersState.setRecords((prev) => [document, ...prev.filter((row) => row.id !== document.id)]);
    syncNormalizedDocument({ ...document, location: document.destinationStore, destinationLocation: document.destinationStore });
  }, [goodsReceivingVouchersState, syncNormalizedDocument]);

  const saveStoreIssueVoucher = useCallback((document: StoreIssueVoucherDocument) => {
    storeIssueVouchersState.setRecords((prev) => [document, ...prev.filter((row) => row.id !== document.id)]);
    syncNormalizedDocument({
      ...document,
      location: document.sourceStore,
      sourceLocation: document.sourceStore,
      destinationLocation: document.destinationDepartment,
    });
  }, [storeIssueVouchersState, syncNormalizedDocument]);

  const saveStoreTransferVoucher = useCallback((document: StoreTransferVoucherDocument) => {
    storeTransferVouchersState.setRecords((prev) => [document, ...prev.filter((row) => row.id !== document.id)]);
    syncNormalizedDocument({
      ...document,
      location: document.sourceLocation,
      sourceLocation: document.sourceLocation,
      destinationLocation: document.destinationLocation,
    });
  }, [storeTransferVouchersState, syncNormalizedDocument]);

  const saveGoodsReturnVoucher = useCallback((document: GoodsReturnVoucherDocument) => {
    goodsReturnVouchersState.setRecords((prev) => [document, ...prev.filter((row) => row.id !== document.id)]);
    syncNormalizedDocument({
      ...document,
      location: document.sourceLocation,
      sourceLocation: document.sourceLocation,
      destinationLocation: document.destinationLocation,
    });
  }, [goodsReturnVouchersState, syncNormalizedDocument]);

  const saveStockAdjustmentVoucher = useCallback((document: StockAdjustmentVoucherDocument) => {
    stockAdjustmentVouchersState.setRecords((prev) => [document, ...prev.filter((row) => row.id !== document.id)]);
    syncNormalizedDocument({ ...document, location: document.lines[0]?.location });
  }, [stockAdjustmentVouchersState, syncNormalizedDocument]);

  const saveCancellationReversal = useCallback((document: CancellationReversalVoucherDocument) => {
    cancellationReversalsState.setRecords((prev) => [document, ...prev.filter((row) => row.id !== document.id)]);
    syncNormalizedDocument(document);
  }, [cancellationReversalsState, syncNormalizedDocument]);

  const saveReceiving = useCallback((receiving: StockReceivingRecord) => {
    receivingsState.setRecords((prev) => [receiving, ...prev.filter((row) => row.id !== receiving.id)]);
  }, [receivingsState]);

  const confirmReceiving = useCallback((receiving: StockReceivingRecord) => {
    const result = confirmStoreReceiving(receiving, itemsState.records, ledgerState.records, {
      settings: settingsState.records[0] ?? DEFAULT_INVENTORY_SETTINGS,
      lots: lotsState.records,
    });
    itemsState.setRecords(result.items);
    const check = assertLedgerAppendOnly(ledgerState.records, result.ledger);
    if (!check.ok) throw new Error(check.error);
    const previousIds = new Set(ledgerState.records.map((entry) => entry.id));
    const appended = result.ledger.filter((entry) => !previousIds.has(entry.id)).map((entry) => ({ ...entry, immutable: true }));
    ledgerState.setRecords(result.ledger.map((entry) => ({ ...entry, immutable: true })));
    lotsState.setRecords(result.lots);
    receivingsState.setRecords((prev) => [result.receiving, ...prev.filter((row) => row.id !== receiving.id)]);
    void import("./supabase/inventory-persistence.ts").then((mod) => {
      mod.syncInventoryLedgerAppend(appended);
      mod.syncInventoryLots(result.lots);
      result.items.forEach((item) => mod.syncInventoryItem(item));
    });
    return result;
  }, [itemsState, ledgerState, lotsState, receivingsState, settingsState.records]);

  const saveInventorySettings = useCallback((next: InventorySettingsRecord) => {
    const saved = normalizeInventorySettings({ ...next, id: "inventory-settings", updatedAt: nowIso() });
    settingsState.setRecords([saved]);
    void import("./supabase/inventory-persistence.ts").then((mod) => mod.syncInventorySettings(saved));
  }, [settingsState]);

  const saveLocationPolicy = useCallback((policy: LocationStockPolicy) => {
    locationPoliciesState.setRecords((prev) => [policy, ...prev.filter((row) => !(row.itemId === policy.itemId && row.location === policy.location))]);
    void import("./supabase/inventory-persistence.ts").then((mod) => mod.syncInventoryLocationPolicy(policy));
  }, [locationPoliciesState]);

  const saveLots = useCallback((next: StockLot[] | ((prev: StockLot[]) => StockLot[])) => {
    lotsState.setRecords((prev) => {
      const resolved = typeof next === "function" ? next(prev) : next;
      void import("./supabase/inventory-persistence.ts").then((mod) => mod.syncInventoryLots(resolved));
      return resolved;
    });
  }, [lotsState]);

  const saveTransfer = useCallback((transfer: StockTransferRecord) => {
    transfersState.setRecords((prev) => [transfer, ...prev.filter((row) => row.id !== transfer.id)]);
  }, [transfersState]);

  const saveRequest = useCallback((request: StockRequestRecord) => {
    requestsState.setRecords((prev) => [request, ...prev.filter((row) => row.id !== request.id)]);
  }, [requestsState]);

  const saveReturn = useCallback((returnRecord: StockReturnRecord) => {
    returnsState.setRecords((prev) => [returnRecord, ...prev.filter((row) => row.id !== returnRecord.id)]);
  }, [returnsState]);

  const saveLoss = useCallback((loss: StockLossRecord) => {
    lossesState.setRecords((prev) => [loss, ...prev.filter((row) => row.id !== loss.id)]);
  }, [lossesState]);

  const saveCount = useCallback((count: StockCountSession) => {
    countsState.setRecords((prev) => [count, ...prev.filter((row) => row.id !== count.id)]);
    syncNormalizedDocument({
      id: count.id,
      documentType: "Physical Stock Count",
      documentNumber: count.countSessionNumber,
      status: count.status,
      createdBy: count.countedBy,
      location: count.location,
      approvalHistory: count.approvalHistory,
    });
  }, [countsState, syncNormalizedDocument]);

  const saveGoatRegistration = useCallback((registration: GoatRegistration) => {
    goatRegistrationsState.setRecords((prev) => [registration, ...prev.filter((row) => row.id !== registration.id)]);
    void import("./supabase/inventory-persistence.ts").then((mod) => mod.syncGoatRegistration(registration));
  }, [goatRegistrationsState]);

  const saveGoatRegistrations = useCallback((next: GoatRegistration[] | ((prev: GoatRegistration[]) => GoatRegistration[])) => {
    let resolved: GoatRegistration[] = [];
    let removedIds: string[] = [];
    goatRegistrationsState.setRecords((prev) => {
      resolved = typeof next === "function" ? next(prev) : next;
      const resolvedIds = new Set(resolved.map((row) => row.id));
      removedIds = prev.filter((row) => !resolvedIds.has(row.id)).map((row) => row.id);
      return resolved;
    });
    void import("./supabase/inventory-persistence.ts").then((mod) => {
      if (removedIds.length > 0) {
        mod.syncGoatRegistrationRemovals(removedIds);
      }
      mod.syncGoatRegistrations(resolved);
    });
  }, [goatRegistrationsState]);

  const saveDailyConsumption = useCallback((document: DailyConsumptionDocument) => {
    dailyConsumptionsState.setRecords((prev) => [document, ...prev.filter((row) => row.id !== document.id)]);
    syncNormalizedDocument({ ...document, location: document.department });
  }, [dailyConsumptionsState, syncNormalizedDocument]);

  const saveStaffConsumption = useCallback((document: StaffConsumptionDocument) => {
    staffConsumptionsState.setRecords((prev) => [document, ...prev.filter((row) => row.id !== document.id)]);
  }, [staffConsumptionsState]);

  const saveStaffBreakage = useCallback((document: StaffBreakageDocument) => {
    staffBreakagesState.setRecords((prev) => [document, ...prev.filter((row) => row.id !== document.id)]);
  }, [staffBreakagesState]);

  const savePosShiftSession = useCallback((session: PosShiftSession) => {
    posShiftSessionsState.setRecords((prev) => [session, ...prev.filter((row) => row.id !== session.id)]);
  }, [posShiftSessionsState.setRecords]);

  const savePosNegativeSaleAttempt = useCallback((attempt: PosNegativeSaleAttempt) => {
    posNegativeSaleAttemptsState.setRecords((prev) => [attempt, ...prev]);
  }, [posNegativeSaleAttemptsState.setRecords]);

  const loading =
    itemsState.loading ||
    ledgerState.loading ||
    recipesState.loading ||
    closingsState.loading ||
    purchaseRequisitionsState.loading ||
    purchaseOrdersState.loading ||
    goodsReceivingVouchersState.loading ||
    storeIssueVouchersState.loading ||
    storeTransferVouchersState.loading ||
    goodsReturnVouchersState.loading ||
    stockAdjustmentVouchersState.loading ||
    cancellationReversalsState.loading ||
    receivingsState.loading ||
    transfersState.loading ||
    requestsState.loading ||
    returnsState.loading ||
    lossesState.loading ||
    countsState.loading ||
    settingsState.loading ||
    lotsState.loading ||
    locationPoliciesState.loading ||
    posReservationsState.loading ||
    posShiftSessionsState.loading ||
    posNegativeSaleAttemptsState.loading ||
    goatRegistrationsState.loading ||
    dailyConsumptionsState.loading ||
    staffConsumptionsState.loading ||
    staffBreakagesState.loading;

  const backendError =
    itemsState.backendError ||
    ledgerState.backendError ||
    recipesState.backendError ||
    closingsState.backendError ||
    purchaseRequisitionsState.backendError ||
    purchaseOrdersState.backendError ||
    goodsReceivingVouchersState.backendError ||
    storeIssueVouchersState.backendError ||
    storeTransferVouchersState.backendError ||
    goodsReturnVouchersState.backendError ||
    stockAdjustmentVouchersState.backendError ||
    cancellationReversalsState.backendError ||
    receivingsState.backendError ||
    transfersState.backendError ||
    requestsState.backendError ||
    returnsState.backendError ||
    lossesState.backendError ||
    countsState.backendError ||
    settingsState.backendError ||
    lotsState.backendError ||
    locationPoliciesState.backendError ||
    posReservationsState.backendError ||
    posShiftSessionsState.backendError ||
    posNegativeSaleAttemptsState.backendError ||
    goatRegistrationsState.backendError ||
    dailyConsumptionsState.backendError ||
    staffConsumptionsState.backendError ||
    staffBreakagesState.backendError;

  return useMemo(
    () => ({
      items,
      ledger,
      recipes,
      closings,
      purchaseRequisitions,
      purchaseOrders,
      goodsReceivingVouchers,
      storeIssueVouchers,
      storeTransferVouchers,
      goodsReturnVouchers,
      stockAdjustmentVouchers,
      cancellationReversals,
      receivings,
      transfers,
      requests,
      returns,
      losses,
      counts,
      settings,
      lots,
      locationPolicies,
      posReservations,
      posShiftSessions,
      posNegativeSaleAttempts,
      goatRegistrations,
      dailyConsumptions,
      staffConsumptions,
      staffBreakages,
      balances,
      dashboard,
      loading,
      backendError,
      saveItem,
      deleteItem,
      saveLedgerEntry,
      saveRecipe,
      saveClosing,
      savePurchaseRequisition,
      savePurchaseOrder,
      saveGoodsReceivingVoucher,
      saveStoreIssueVoucher,
      saveStoreTransferVoucher,
      saveGoodsReturnVoucher,
      saveStockAdjustmentVoucher,
      saveCancellationReversal,
      saveReceiving,
      confirmReceiving,
      saveInventorySettings,
      saveLocationPolicy,
      saveLots,
      saveTransfer,
      saveRequest,
      saveReturn,
      saveLoss,
      saveCount,
      setItems: setItemsSafe,
      setLedger: setLedgerSafe,
      setRecipes: recipesState.setRecords,
      setClosings: closingsState.setRecords,
      setPurchaseRequisitions: purchaseRequisitionsState.setRecords,
      setPurchaseOrders: purchaseOrdersState.setRecords,
      setGoodsReceivingVouchers: goodsReceivingVouchersState.setRecords,
      setStoreIssueVouchers: storeIssueVouchersState.setRecords,
      setStoreTransferVouchers: storeTransferVouchersState.setRecords,
      setGoodsReturnVouchers: goodsReturnVouchersState.setRecords,
      setStockAdjustmentVouchers: stockAdjustmentVouchersState.setRecords,
      setCancellationReversals: cancellationReversalsState.setRecords,
      setReceivings: receivingsState.setRecords,
      setTransfers: transfersState.setRecords,
      setRequests: requestsState.setRecords,
      setReturns: returnsState.setRecords,
      setLosses: lossesState.setRecords,
      setCounts: countsState.setRecords,
      setPosReservations: posReservationsState.setRecords,
      setPosShiftSessions: posShiftSessionsState.setRecords,
      setPosNegativeSaleAttempts: posNegativeSaleAttemptsState.setRecords,
      savePosShiftSession,
      savePosNegativeSaleAttempt,
      saveGoatRegistration,
      saveGoatRegistrations,
      saveDailyConsumption,
      saveStaffConsumption,
      saveStaffBreakage,
      setGoatRegistrations: goatRegistrationsState.setRecords,
      setDailyConsumptions: dailyConsumptionsState.setRecords,
      setStaffConsumptions: staffConsumptionsState.setRecords,
      setStaffBreakages: staffBreakagesState.setRecords,
    }),
    [
      items,
      ledger,
      recipes,
      closings,
      purchaseRequisitions,
      purchaseOrders,
      goodsReceivingVouchers,
      storeIssueVouchers,
      storeTransferVouchers,
      goodsReturnVouchers,
      stockAdjustmentVouchers,
      cancellationReversals,
      receivings,
      transfers,
      requests,
      returns,
      losses,
      counts,
      settings,
      lots,
      locationPolicies,
      posReservations,
      posShiftSessions,
      posNegativeSaleAttempts,
      goatRegistrations,
      dailyConsumptions,
      staffConsumptions,
      staffBreakages,
      balances,
      dashboard,
      loading,
      backendError,
      saveItem,
      deleteItem,
      saveLedgerEntry,
      saveRecipe,
      saveClosing,
      savePurchaseRequisition,
      savePurchaseOrder,
      saveGoodsReceivingVoucher,
      saveStoreIssueVoucher,
      saveStoreTransferVoucher,
      saveGoodsReturnVoucher,
      saveStockAdjustmentVoucher,
      saveCancellationReversal,
      saveReceiving,
      confirmReceiving,
      saveInventorySettings,
      saveLocationPolicy,
      saveLots,
      saveTransfer,
      saveRequest,
      saveReturn,
      saveLoss,
      saveCount,
      setItemsSafe,
      setLedgerSafe,
      recipesState.setRecords,
      closingsState.setRecords,
      purchaseRequisitionsState.setRecords,
      purchaseOrdersState.setRecords,
      goodsReceivingVouchersState.setRecords,
      storeIssueVouchersState.setRecords,
      storeTransferVouchersState.setRecords,
      goodsReturnVouchersState.setRecords,
      stockAdjustmentVouchersState.setRecords,
      cancellationReversalsState.setRecords,
      receivingsState.setRecords,
      transfersState.setRecords,
      requestsState.setRecords,
      returnsState.setRecords,
      lossesState.setRecords,
      countsState.setRecords,
      posReservationsState.setRecords,
      posShiftSessionsState.setRecords,
      posNegativeSaleAttemptsState.setRecords,
      savePosShiftSession,
      savePosNegativeSaleAttempt,
      saveGoatRegistration,
      saveGoatRegistrations,
      saveDailyConsumption,
      saveStaffConsumption,
      saveStaffBreakage,
      goatRegistrationsState.setRecords,
      dailyConsumptionsState.setRecords,
      staffConsumptionsState.setRecords,
      staffBreakagesState.setRecords,
    ],
  );
}

export type StockManagementModule = ReturnType<typeof useStockManagementModuleState>;

const StockModuleContext = createContext<StockManagementModule | null>(null);

/** Mount once under StoreProvider — all pages share one stock hydrate/realtime set. */
export function StockModuleProvider({
  children,
  salesRecords = [],
}: {
  children: ReactNode;
  salesRecords?: SalesRecord[];
}) {
  const value = useStockManagementModuleState(salesRecords);
  return createElement(StockModuleContext.Provider, { value }, children);
}

export function useStockManagementModule(_salesRecords: SalesRecord[] = []): StockManagementModule {
  const value = useContext(StockModuleContext);
  if (!value) {
    throw new Error("useStockManagementModule must be used within StockModuleProvider");
  }
  return value;
}
