import type { StockTabId } from "./inventory-access";
import {
  canConfirmDepartmentIssueReceipt,
  resolveAuthorizedLocations,
  type InventoryAccessContext,
  type InventoryPermissionFlags,
} from "./inventory-access";
import type {
  DepartmentStockRequestDocument,
  GoodsReturnVoucherDocument,
  PurchaseOrderDocument,
  PurchaseRequisitionDocument,
  StockCountSession,
  StockLocation,
  StockRequestRecord,
  StoreIssueVoucherDocument,
  StoreTransferVoucherDocument,
} from "./stock-management";
import {
  filterPendingRequestsForStoreReview,
  filterRequestsForIssueVoucher,
  findStoreIssueVoucherForRequest,
} from "./store-issue-voucher-utils.ts";

export type StockWorkflowBucket = "approve" | "dispatch" | "receive" | "convert";

export type StockWorkflowAction =
  | "approve"
  | "dispatch"
  | "receive"
  | "convert-issue"
  | "open";

export interface StockWorkflowTask {
  id: string;
  bucket: StockWorkflowBucket;
  action: StockWorkflowAction;
  documentType: string;
  referenceNo: string;
  title: string;
  subtitle: string;
  status: string;
  createdAt: string;
  createdBy: string;
  entityId: string;
  sourceTab: StockTabId;
  canAct: boolean;
  itemSummary?: string;
  lines?: Array<{
    id: string;
    name: string;
    unit: string;
    sentQuantity: number;
    receivedQuantity: number;
  }>;
}

export interface StockWorkflowModuleSnapshot {
  purchaseRequisitions: PurchaseRequisitionDocument[];
  purchaseOrders: PurchaseOrderDocument[];
  requests: StockRequestRecord[];
  storeIssueVouchers: StoreIssueVoucherDocument[];
  storeTransferVouchers: StoreTransferVoucherDocument[];
  goodsReturnVouchers: GoodsReturnVoucherDocument[];
  counts: StockCountSession[];
}

function locationAllowed(access: InventoryAccessContext, location?: StockLocation): boolean {
  if (!location) return true;
  const authorized = resolveAuthorizedLocations(access);
  return authorized === "all" || authorized.includes(location);
}

function matchesWorkspace(workspace: string, ...locations: Array<string | undefined>): boolean {
  if (workspace === "all") return true;
  return locations.some((loc) => loc === workspace);
}

function transferLineViews(
  lines: Array<{
    id: string;
    itemName: string;
    unit: string;
    requestedQuantity?: number;
    approvedQuantity?: number;
    sentQuantity?: number;
    receivedQuantity?: number;
  }>,
) {
  return lines.map((line) => {
    const sentQuantity = line.sentQuantity || line.approvedQuantity || line.requestedQuantity || 0;
    const receivedQuantity = line.receivedQuantity ?? 0;
    return {
      id: line.id,
      name: line.itemName,
      unit: line.unit,
      sentQuantity,
      receivedQuantity,
    };
  });
}

function transferLineSummary(
  lines: Array<{
    id: string;
    itemName: string;
    unit: string;
    requestedQuantity?: number;
    approvedQuantity?: number;
    sentQuantity?: number;
    receivedQuantity?: number;
  }>,
) {
  return transferLineViews(lines)
    .map((line) =>
      line.receivedQuantity > 0
        ? `${line.name} · ${line.receivedQuantity} ${line.unit} received`
        : `${line.name} · ${line.sentQuantity} ${line.unit}`,
    )
    .join(", ");
}

export function buildStockWorkflowTasks(input: {
  access: InventoryAccessContext;
  permissions: InventoryPermissionFlags;
  workspace?: string;
  module: StockWorkflowModuleSnapshot;
}): StockWorkflowTask[] {
  const { access, permissions, module } = input;
  const workspace = input.workspace ?? "all";
  const tasks: StockWorkflowTask[] = [];
  const canApprove = permissions.canApproveRequests || permissions.canApproveAdjustments;
  const canDispatch = permissions.canDispatchTransfers;
  const canReceiveAt = (location: StockLocation) => canConfirmDepartmentIssueReceipt(access, location);

  const canReceiveTransferAt = (location: StockLocation) => {
    const authorized = resolveAuthorizedLocations(access);
    return authorized === "all" || authorized.includes(location);
  };

  for (const doc of module.purchaseRequisitions) {
    if (!["Submitted", "Under Review"].includes(doc.status)) continue;
    if (!matchesWorkspace(workspace, doc.requestingStore)) continue;
    if (!locationAllowed(access, doc.requestingStore)) continue;
    tasks.push({
      id: `req-${doc.id}`,
      bucket: "approve",
      action: canApprove ? "approve" : "open",
      documentType: doc.documentType,
      referenceNo: doc.requisitionNumber,
      title: doc.requisitionNumber,
      subtitle: `${doc.requestingStore} · ${doc.createdBy}`,
      status: doc.status,
      createdAt: doc.createdAt,
      createdBy: doc.createdBy,
      entityId: doc.id,
      sourceTab: "requisitions",
      canAct: canApprove,
      itemSummary: doc.lines.map((line) => line.itemName).join(", "),
    });
  }

  for (const doc of module.purchaseOrders) {
    if (!["Draft", "Submitted"].includes(doc.status)) continue;
    if (!matchesWorkspace(workspace, doc.destinationStore)) continue;
    if (!locationAllowed(access, doc.destinationStore)) continue;
    tasks.push({
      id: `po-${doc.id}`,
      bucket: "approve",
      action: canApprove ? "approve" : "open",
      documentType: doc.documentType,
      referenceNo: doc.purchaseOrderNumber,
      title: doc.purchaseOrderNumber,
      subtitle: `${doc.destinationStore} · ${doc.supplierName || "Supplier"}`,
      status: doc.status,
      createdAt: doc.createdAt,
      createdBy: doc.createdBy,
      entityId: doc.id,
      sourceTab: "purchase-orders",
      canAct: canApprove,
      itemSummary: doc.lines.map((line) => line.itemName).join(", "),
    });
  }

  const authorized = resolveAuthorizedLocations(access);
  const authorizedList = authorized === "all" ? "all" : authorized;
  const pendingDepartmentRequests = filterPendingRequestsForStoreReview(
    authorizedList,
    module.requests,
    workspace,
  );
  const approvedForIssueVoucher = filterRequestsForIssueVoucher(
    authorizedList,
    module.requests,
    workspace,
  );

  for (const row of pendingDepartmentRequests) {
    tasks.push({
      id: `dsr-${row.id}`,
      bucket: "approve",
      action: canApprove ? "approve" : "open",
      documentType: "Department Stock Request",
      referenceNo: row.requestNumber,
      title: row.requestNumber,
      subtitle: `${row.requestingDepartment} ← ${row.requestedSourceStore} · ${row.requestedBy}`,
      status: row.status,
      createdAt: row.createdAt,
      createdBy: row.requestedBy,
      entityId: row.id,
      sourceTab: "department-requests",
      canAct: canApprove,
      itemSummary: row.lines.map((line) => line.itemName).join(", "),
    });
  }

  for (const row of approvedForIssueVoucher) {
    if (findStoreIssueVoucherForRequest(module.storeIssueVouchers, row)) continue;
    tasks.push({
      id: `dsr-convert-${row.id}`,
      bucket: "convert",
      action: canDispatch ? "convert-issue" : "open",
      documentType: "Department Stock Request",
      referenceNo: row.requestNumber,
      title: row.requestNumber,
      subtitle: `${tConvertLabel(row.requestingDepartment)} · ${row.requestedSourceStore}`,
      status: row.status,
      createdAt: row.updatedAt,
      createdBy: row.requestedBy,
      entityId: row.id,
      sourceTab: "issue-vouchers",
      canAct: canDispatch,
      itemSummary: row.lines.map((line) => line.itemName).join(", "),
    });
  }

  for (const voucher of module.storeIssueVouchers) {
    if (["Approved", "Partially Approved", "Prepared"].includes(voucher.status)) {
      if (!matchesWorkspace(workspace, voucher.sourceStore, voucher.destinationDepartment)) continue;
      if (!locationAllowed(access, voucher.sourceStore)) continue;
      tasks.push({
        id: `issue-dispatch-${voucher.id}`,
        bucket: "dispatch",
        action: canDispatch ? "dispatch" : "open",
        documentType: voucher.documentType,
        referenceNo: voucher.issueVoucherNumber,
        title: voucher.issueVoucherNumber,
        subtitle: `${voucher.sourceStore} → ${voucher.destinationDepartment}`,
        status: voucher.status,
        createdAt: voucher.createdAt,
        createdBy: voucher.createdBy,
        entityId: voucher.id,
        sourceTab: "issue-vouchers",
        canAct: canDispatch,
        itemSummary: transferLineSummary(voucher.lines),
        lines: transferLineViews(voucher.lines),
      });
    }
    if (["Dispatched", "Partially Received"].includes(voucher.status)) {
      if (!matchesWorkspace(workspace, voucher.destinationDepartment)) continue;
      const canReceive = canReceiveAt(voucher.destinationDepartment);
      tasks.push({
        id: `issue-receive-${voucher.id}`,
        bucket: "receive",
        action: canReceive ? "receive" : "open",
        documentType: voucher.documentType,
        referenceNo: voucher.issueVoucherNumber,
        title: voucher.issueVoucherNumber,
        subtitle: `${voucher.sourceStore} → ${voucher.destinationDepartment}`,
        status: voucher.status,
        createdAt: voucher.createdAt,
        createdBy: voucher.createdBy,
        entityId: voucher.id,
        sourceTab: "receive-stock",
        canAct: canReceive,
        itemSummary: transferLineSummary(voucher.lines),
        lines: transferLineViews(voucher.lines),
      });
    }
  }

  for (const voucher of module.storeTransferVouchers) {
    if (voucher.status === "Pending Approval") {
      if (!matchesWorkspace(workspace, voucher.sourceLocation, voucher.destinationLocation)) continue;
      if (!locationAllowed(access, voucher.sourceLocation)) continue;
      tasks.push({
        id: `xfer-approve-${voucher.id}`,
        bucket: "approve",
        action: canApprove ? "approve" : "open",
        documentType: voucher.documentType,
        referenceNo: voucher.transferVoucherNumber,
        title: voucher.transferVoucherNumber,
        subtitle: `${voucher.sourceLocation} → ${voucher.destinationLocation}`,
        status: voucher.status,
        createdAt: voucher.createdAt,
        createdBy: voucher.createdBy,
        entityId: voucher.id,
        sourceTab: "store-transfer-vouchers",
        canAct: canApprove,
        itemSummary: transferLineSummary(voucher.lines),
        lines: transferLineViews(voucher.lines),
      });
    }
    if (["Approved", "Partially Approved", "Prepared"].includes(voucher.status)) {
      if (!matchesWorkspace(workspace, voucher.sourceLocation, voucher.destinationLocation)) continue;
      if (!locationAllowed(access, voucher.sourceLocation)) continue;
      tasks.push({
        id: `xfer-dispatch-${voucher.id}`,
        bucket: "dispatch",
        action: canDispatch ? "dispatch" : "open",
        documentType: voucher.documentType,
        referenceNo: voucher.transferVoucherNumber,
        title: voucher.transferVoucherNumber,
        subtitle: `${voucher.sourceLocation} → ${voucher.destinationLocation}`,
        status: voucher.status,
        createdAt: voucher.createdAt,
        createdBy: voucher.createdBy,
        entityId: voucher.id,
        sourceTab: "store-transfer-vouchers",
        canAct: canDispatch,
        itemSummary: transferLineSummary(voucher.lines),
        lines: transferLineViews(voucher.lines),
      });
    }
    if (["Dispatched", "Partially Received"].includes(voucher.status)) {
      if (!matchesWorkspace(workspace, voucher.destinationLocation)) continue;
      const canReceive = canReceiveTransferAt(voucher.destinationLocation);
      tasks.push({
        id: `xfer-receive-${voucher.id}`,
        bucket: "receive",
        action: canReceive ? "receive" : "open",
        documentType: voucher.documentType,
        referenceNo: voucher.transferVoucherNumber,
        title: voucher.transferVoucherNumber,
        subtitle: `${voucher.sourceLocation} → ${voucher.destinationLocation}`,
        status: voucher.status,
        createdAt: voucher.createdAt,
        createdBy: voucher.createdBy,
        entityId: voucher.id,
        sourceTab: "receive-stock",
        canAct: canReceive,
        itemSummary: transferLineSummary(voucher.lines),
        lines: transferLineViews(voucher.lines),
      });
    }
  }

  for (const voucher of module.goodsReturnVouchers) {
    if (voucher.status !== "Submitted") continue;
    if (!matchesWorkspace(workspace, voucher.sourceLocation, voucher.destinationLocation)) continue;
    if (!locationAllowed(access, voucher.sourceLocation)) continue;
    tasks.push({
      id: `return-${voucher.id}`,
      bucket: "approve",
      action: canApprove ? "approve" : "open",
      documentType: voucher.documentType,
      referenceNo: voucher.returnVoucherNumber,
      title: voucher.returnVoucherNumber,
      subtitle: `${voucher.sourceLocation} → ${voucher.destinationLocation}`,
      status: voucher.status,
      createdAt: voucher.createdAt,
      createdBy: voucher.createdBy,
      entityId: voucher.id,
      sourceTab: "goods-returns",
      canAct: canApprove,
      itemSummary: voucher.lines.map((line) => line.itemName).join(", "),
    });
  }

  for (const session of module.counts) {
    if (!["Submitted", "Reviewed"].includes(session.status)) continue;
    if (!matchesWorkspace(workspace, session.location)) continue;
    if (!locationAllowed(access, session.location)) continue;
    tasks.push({
      id: `count-${session.id}`,
      bucket: "approve",
      action: permissions.canApproveAdjustments || permissions.canApproveRequests ? "approve" : "open",
      documentType: "Physical Stock Count",
      referenceNo: session.countSessionNumber,
      title: session.countSessionNumber,
      subtitle: `${session.location} · ${session.lines[0]?.itemName || "Count"}`,
      status: session.status,
      createdAt: session.countDate,
      createdBy: session.countedBy,
      entityId: session.id,
      sourceTab: "physical-counts",
      canAct: permissions.canApproveAdjustments || permissions.canApproveRequests,
      itemSummary: session.lines.map((line) => line.itemName).join(", "),
    });
  }

  return tasks.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

function tConvertLabel(department: string) {
  return `Create issue voucher for ${department}`;
}

export function summarizeStockWorkflowTasks(tasks: StockWorkflowTask[]) {
  return {
    total: tasks.length,
    approve: tasks.filter((row) => row.bucket === "approve").length,
    dispatch: tasks.filter((row) => row.bucket === "dispatch").length,
    receive: tasks.filter((row) => row.bucket === "receive").length,
    convert: tasks.filter((row) => row.bucket === "convert").length,
    actionable: tasks.filter((row) => row.canAct).length,
  };
}

export function requestToDepartmentDocument(row: StockRequestRecord): DepartmentStockRequestDocument {
  return {
    id: row.id,
    documentType: "Department Stock Request",
    documentNumber: row.requestNumber,
    stockRequestNumber: row.requestNumber,
    status: row.status as DepartmentStockRequestDocument["status"],
    createdAt: row.createdAt,
    createdBy: row.requestedBy,
    requestingDepartment: row.requestingDepartment,
    requestedSourceStore: row.requestedSourceStore,
    priority: row.priority,
    reason: row.reason,
    requiredDate: row.requiredDate,
    requestedBy: row.requestedBy,
    reviewedBy: row.reviewedBy,
    rejectionReason: row.rejectionReason,
    notes: row.notes,
    approvalHistory: [],
    lines: row.lines,
  };
}
