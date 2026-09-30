import type { ExpenseRecord, PurchaseOrder, Supplier } from "./demo-data";
import { isManagerInventoryRole } from "./inventory-access";
import { dateKey, monthKey } from "./sales-analytics";
import {
  nextInventoryDocumentNumber,
  validateInventoryDocumentApproval,
  type CentralStockLocation,
  type InventoryActorContext,
  type GoodsReceivingVoucherDocument,
  type PurchaseOrderDocument,
  type PurchaseRequisitionDocument,
  type StockManagedItem,
  type StockUnitType,
} from "./stock-management";

export type ProcurementQueueAction =
  | "approve_requisition"
  | "create_po"
  | "approve_po"
  | "receive_grv"
  | "none";

export type ProcurementQueueRow = {
  id: string;
  kind: "requisition" | "purchase_order";
  documentNumber: string;
  supplier: string;
  store: CentralStockLocation;
  itemName: string;
  itemId: string;
  quantity: number;
  unit: StockUnitType;
  status: string;
  totalCost: number;
  createdAt: string;
  createdBy: string;
  nextAction: ProcurementQueueAction;
  /** English hint describing what the document is waiting for when the current user has no action. */
  pendingHint: string;
  requisition?: PurchaseRequisitionDocument;
  purchaseOrder?: PurchaseOrderDocument;
};

const FINANCE_PAY_ROLES = new Set([
  "Administrator",
  "Inventory Administrator",
  "Branch Manager",
  "Supervisor",
  "Store Manager",
  "Accountant",
]);

export function canPaySupplier(role: string) {
  return FINANCE_PAY_ROLES.has(role);
}

export function assertPurchaseOrderReceivable(order: PurchaseOrderDocument) {
  if (!["Approved", "Partially Received"].includes(order.status)) {
    throw new Error("Goods can only be received against approved purchase orders.");
  }
}

export function buildPurchaseRequisitionFromSupplierRequest(input: {
  item: StockManagedItem;
  requestingStore: CentralStockLocation;
  requestedQuantity: number;
  requestedBy: string;
  requiredDate: string;
  currentStockAtStore?: number;
  reason?: string;
  notes?: string;
  existingRequisitionNumbers?: string[];
}): PurchaseRequisitionDocument {
  const requisitionNumber = nextInventoryDocumentNumber(
    "PR",
    input.existingRequisitionNumbers ?? [],
  );
  const now = new Date().toISOString();
  return {
    id: `pr-${Date.now()}`,
    documentType: "Purchase Requisition",
    documentNumber: requisitionNumber,
    requisitionNumber,
    status: "Submitted",
    createdAt: now,
    createdBy: input.requestedBy,
    requestingStore: input.requestingStore,
    requiredDate: input.requiredDate,
    requestedBy: input.requestedBy,
    notes: input.notes,
    approvalHistory: [{ id: `hist-${Date.now()}`, action: "Submitted", actedBy: input.requestedBy, actedAt: now }],
    lines: [
      {
        id: `pr-line-${Date.now()}`,
        itemId: input.item.id,
        itemName: input.item.name,
        currentStock: input.currentStockAtStore ?? 0,
        reorderLevel: input.item.reorderLevel,
        requestedQuantity: input.requestedQuantity,
        approvedQuantity: 0,
        unit: input.item.baseUnit,
        reason: input.reason?.trim() || "Supplier procurement request",
      },
    ],
  };
}

export function applyPurchaseOrderPricing(
  order: PurchaseOrderDocument,
  unitPrices: Record<string, number>,
): PurchaseOrderDocument {
  const lines = order.lines.map((line) => {
    const unitPrice = unitPrices[line.itemId] ?? line.unitPrice ?? 0;
    const totalCost = Math.round(line.orderedQuantity * unitPrice * 100) / 100;
    return { ...line, unitPrice, totalCost };
  });
  return { ...order, lines };
}

export function buildGoodsReceivingVoucherDraft(input: {
  purchaseOrder: PurchaseOrderDocument;
  itemId: string;
  receivedQuantity: number;
  rejectedQuantity?: number;
  freeQuantity?: number;
  unitCost: number;
  receivingDate: string;
  receivedBy: string;
  createdBy: string;
  batchNumber?: string;
  expiryDate?: string;
  existingGrvNumbers?: string[];
}): GoodsReceivingVoucherDocument {
  assertPurchaseOrderReceivable(input.purchaseOrder);
  const line = input.purchaseOrder.lines.find((row) => row.itemId === input.itemId);
  if (!line) throw new Error("Purchase order line not found for selected item.");
  const voucherNo = nextInventoryDocumentNumber("GRV", input.existingGrvNumbers ?? []);
  const now = new Date().toISOString();
  return {
    id: `grv-${Date.now()}`,
    documentType: "Goods Receiving Voucher",
    documentNumber: voucherNo,
    grvNumber: voucherNo,
    status: "Draft",
    createdAt: now,
    createdBy: input.createdBy,
    purchaseOrderReference: input.purchaseOrder.purchaseOrderNumber,
    supplier: input.purchaseOrder.supplier,
    destinationStore: input.purchaseOrder.destinationStore,
    receivingDate: input.receivingDate,
    receivedBy: input.receivedBy,
    approvalHistory: [{ id: `hist-${Date.now()}`, action: "Created", actedBy: input.createdBy, actedAt: now }],
    lines: [
      {
        id: `grv-line-${Date.now()}`,
        itemId: line.itemId,
        itemName: line.itemName,
        orderedQuantity: line.orderedQuantity,
        receivedQuantity: input.receivedQuantity,
        rejectedQuantity: input.rejectedQuantity ?? 0,
        freeQuantity: input.freeQuantity ?? 0,
        unit: line.unit,
        unitCost: input.unitCost,
        batchNumber: input.batchNumber?.trim() || undefined,
        expiryDate: input.expiryDate || undefined,
      },
    ],
  };
}

export function canActorApproveRequisition(
  actor: InventoryActorContext,
  requisition: PurchaseRequisitionDocument,
) {
  return validateInventoryDocumentApproval(actor, requisition, "approve", requisition.requestingStore).ok;
}

export function canActorConvertRequisition(
  actor: InventoryActorContext,
  requisition: PurchaseRequisitionDocument,
) {
  return validateInventoryDocumentApproval(actor, requisition, "post", requisition.requestingStore).ok;
}

export function canActorApprovePurchaseOrder(
  actor: InventoryActorContext,
  order: PurchaseOrderDocument,
) {
  return validateInventoryDocumentApproval(actor, order, "approve", order.destinationStore).ok;
}

export function canActorReceiveGrv(
  actor: InventoryActorContext,
  destinationStore: CentralStockLocation,
) {
  const synthetic: GoodsReceivingVoucherDocument = {
    id: "grv-check",
    documentType: "Goods Receiving Voucher",
    documentNumber: "GRV-CHECK",
    grvNumber: "GRV-CHECK",
    status: "Draft",
    createdAt: new Date().toISOString(),
    createdBy: actor.userName,
    supplier: "Check",
    destinationStore,
    receivingDate: dateKey(),
    receivedBy: actor.userName,
    approvalHistory: [],
    lines: [],
  };
  return validateInventoryDocumentApproval(actor, synthetic, "receive", destinationStore).ok;
}

export function buildProcurementQueueRows(input: {
  requisitions: PurchaseRequisitionDocument[];
  purchaseOrders: PurchaseOrderDocument[];
  storeFilter: "all" | CentralStockLocation;
  actor: InventoryActorContext;
}): ProcurementQueueRow[] {
  const rows: ProcurementQueueRow[] = [];
  const storeMatches = (store: CentralStockLocation) =>
    input.storeFilter === "all" || input.storeFilter === store;

  for (const requisition of input.requisitions) {
    if (!storeMatches(requisition.requestingStore)) continue;
    if (["Converted to Purchase Order", "Rejected", "Cancelled"].includes(requisition.status)) continue;
    const line = requisition.lines[0];
    if (!line) continue;
    let nextAction: ProcurementQueueAction = "none";
    let pendingHint = "";
    if (["Submitted", "Under Review"].includes(requisition.status)) {
      if (canActorApproveRequisition(input.actor, requisition)) {
        nextAction = "approve_requisition";
      } else {
        pendingHint = "Awaiting approval by a different authorized user";
      }
    } else if (["Approved", "Partially Approved"].includes(requisition.status)) {
      if (canActorConvertRequisition(input.actor, requisition)) {
        nextAction = "create_po";
      } else {
        pendingHint = "Approved. Awaiting PO creation by an authorized user";
      }
    }
    rows.push({
      id: requisition.id,
      kind: "requisition",
      documentNumber: requisition.requisitionNumber,
      supplier: "-",
      store: requisition.requestingStore,
      itemName: line.itemName,
      itemId: line.itemId,
      quantity: line.requestedQuantity,
      unit: line.unit,
      status: requisition.status,
      totalCost: 0,
      createdAt: requisition.createdAt,
      createdBy: requisition.requestedBy,
      nextAction,
      pendingHint,
      requisition,
    });
  }

  for (const order of input.purchaseOrders) {
    if (!storeMatches(order.destinationStore)) continue;
    const line = order.lines[0];
    if (!line) continue;
    let nextAction: ProcurementQueueAction = "none";
    let pendingHint = "";
    if (["Draft", "Submitted"].includes(order.status)) {
      if (canActorApprovePurchaseOrder(input.actor, order)) {
        nextAction = "approve_po";
      } else {
        pendingHint = `Awaiting PO approval by a user other than ${order.preparedBy}`;
      }
    } else if (["Approved", "Partially Received"].includes(order.status)) {
      if (canActorReceiveGrv(input.actor, order.destinationStore)) {
        nextAction = "receive_grv";
      } else {
        pendingHint = `Approved. Awaiting GRV by ${order.destinationStore} staff`;
      }
    }
    rows.push({
      id: order.id,
      kind: "purchase_order",
      documentNumber: order.purchaseOrderNumber,
      supplier: order.supplier,
      store: order.destinationStore,
      itemName: line.itemName,
      itemId: line.itemId,
      quantity: line.orderedQuantity,
      unit: line.unit,
      status: order.status,
      totalCost: order.lines.reduce((sum, row) => sum + row.totalCost, 0),
      createdAt: order.createdAt,
      createdBy: order.preparedBy,
      nextAction,
      pendingHint,
      purchaseOrder: order,
    });
  }

  return rows.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export function supplierPayableExpenseId(grvNumber: string) {
  return `exp-grv-${grvNumber}`;
}

export function buildSupplierPayableExpense(input: {
  grv: GoodsReceivingVoucherDocument;
  supplierName: string;
  receivedAt?: Date;
}): ExpenseRecord {
  const receivedAt = input.receivedAt ?? new Date();
  const amount = Math.round(
    input.grv.lines.reduce(
      (sum, line) => sum + line.receivedQuantity * line.unitCost,
      0,
    ) * 100,
  ) / 100;
  return {
    id: supplierPayableExpenseId(input.grv.grvNumber),
    date: dateKey(receivedAt),
    month: monthKey(receivedAt),
    category: "Purchase",
    label: `${input.grv.lines.map((line) => line.itemName).join(", ")} from ${input.supplierName} (${input.grv.destinationStore})`,
    amount,
    source: "Purchase",
  };
}

export function supplierHasProcurementRecords(input: {
  supplierName: string;
  legacyPurchaseOrders?: PurchaseOrder[];
  purchaseOrders?: PurchaseOrderDocument[];
  requisitions?: PurchaseRequisitionDocument[];
}) {
  const key = input.supplierName.trim().toLowerCase();
  if (!key) return false;
  if ((input.legacyPurchaseOrders ?? []).some((row) => row.supplier.trim().toLowerCase() === key)) return true;
  if ((input.purchaseOrders ?? []).some((row) => row.supplier.trim().toLowerCase() === key)) return true;
  return false;
}

export function canManageSuppliers(role: string) {
  return (
    role === "Administrator"
    || role === "Branch Manager"
    || role === "Inventory Administrator"
    || role === "Store Manager"
    || role === "Supervisor"
    || role === "Storekeeper"
    || role === "Inventory Staff"
    || role === "Procurement Officer"
  );
}

export function canCreateSupplierPurchaseRequest(role: string) {
  return canManageSuppliers(role) || isManagerInventoryRole(role);
}
