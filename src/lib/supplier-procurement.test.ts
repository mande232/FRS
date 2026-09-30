import test from "node:test";
import assert from "node:assert/strict";

import {
  applyPurchaseOrderPricing,
  assertPurchaseOrderReceivable,
  buildGoodsReceivingVoucherDraft,
  buildProcurementQueueRows,
  buildPurchaseRequisitionFromSupplierRequest,
  buildSupplierPayableExpense,
  canActorApproveRequisition,
  canPaySupplier,
  supplierHasProcurementRecords,
  supplierPayableExpenseId,
} from "./supplier-procurement";
import {
  STOCK_ITEMS_SEED,
  approvePurchaseOrderAsActor,
  approvePurchaseRequisitionAsActor,
  confirmGoodsReceivingVoucher,
  convertPurchaseRequisitionToPurchaseOrderAsActor,
  type InventoryActorContext,
  type PurchaseOrderDocument,
  type PurchaseRequisitionDocument,
} from "./stock-management";

const storekeeper: InventoryActorContext = {
  userName: "Abel Tesfaye",
  role: "Storekeeper",
  assignedStore: "Store 1",
  allowedLocations: ["Store 1"],
};

const manager: InventoryActorContext = {
  userName: "Liya Demeke",
  role: "Branch Manager",
};

const item = { ...STOCK_ITEMS_SEED.find((row) => row.id === "stk-beer-habesha")!, currentStock: 0 };

function sampleRequisition(requestedBy = "Abel Tesfaye"): PurchaseRequisitionDocument {
  return buildPurchaseRequisitionFromSupplierRequest({
    item,
    requestingStore: "Store 1",
    requestedQuantity: 50,
    requestedBy,
    requiredDate: "2026-07-17",
    currentStockAtStore: 0,
    existingRequisitionNumbers: [],
  });
}

function approvedRequisition(requestedBy = "Abel Tesfaye") {
  const requisition = sampleRequisition(requestedBy);
  return approvePurchaseRequisitionAsActor(
    requisition,
    manager,
    requisition.lines.map((line) => ({ lineId: line.id, approvedQuantity: line.requestedQuantity })),
  );
}

function submittedPurchaseOrder(preparedBy = "Liya Demeke"): PurchaseOrderDocument {
  const requisition = approvedRequisition("Abel Tesfaye");
  const po = convertPurchaseRequisitionToPurchaseOrderAsActor(requisition, "Dashen Supplier", {
    userName: preparedBy,
    role: "Branch Manager",
  });
  return applyPurchaseOrderPricing(po, { [item.id]: 100 });
}

test("buildPurchaseRequisitionFromSupplierRequest creates submitted stock requisition", () => {
  const requisition = sampleRequisition();
  assert.equal(requisition.status, "Submitted");
  assert.match(requisition.requisitionNumber, /^PR-/);
  assert.equal(requisition.requestingStore, "Store 1");
  assert.equal(requisition.lines[0]?.itemId, item.id);
});

test("same actor cannot approve their own requisition", () => {
  const requisition = sampleRequisition("Abel Tesfaye");
  assert.throws(
    () =>
      approvePurchaseRequisitionAsActor(
        requisition,
        storekeeper,
        requisition.lines.map((line) => ({ lineId: line.id, approvedQuantity: line.requestedQuantity })),
      ),
    /cannot approve|not allowed|Users cannot/i,
  );
});

test("manager can approve requisition and create priced purchase order", () => {
  const approved = approvedRequisition();
  const po = convertPurchaseRequisitionToPurchaseOrderAsActor(approved, "Dashen Supplier", manager);
  const priced = applyPurchaseOrderPricing(po, { [item.id]: 100 });
  assert.equal(priced.status, "Submitted");
  assert.equal(priced.supplier, "Dashen Supplier");
  assert.equal(priced.lines[0]?.totalCost, 5000);
});

test("PO preparer cannot approve their own purchase order", () => {
  const po = submittedPurchaseOrder("Liya Demeke");
  assert.throws(() => approvePurchaseOrderAsActor(po, manager), /cannot approve|own restricted/i);
});

test("different actor can approve purchase order", () => {
  const po = submittedPurchaseOrder("Liya Demeke");
  const approved = approvePurchaseOrderAsActor(po, storekeeper);
  assert.equal(approved.status, "Approved");
});

test("GRV against unapproved purchase order is rejected", () => {
  const po = submittedPurchaseOrder();
  assert.throws(() => assertPurchaseOrderReceivable(po), /approved purchase orders/i);
  assert.throws(
    () =>
      buildGoodsReceivingVoucherDraft({
        purchaseOrder: po,
        itemId: item.id,
        receivedQuantity: 50,
        unitCost: 100,
        receivingDate: "2026-07-17",
        receivedBy: "Abel Tesfaye",
        createdBy: "Abel Tesfaye",
      }),
    /approved purchase orders/i,
  );
});

test("confirmed GRV creates supplier payable once", () => {
  const po = approvePurchaseOrderAsActor(submittedPurchaseOrder("Liya Demeke"), storekeeper);
  const voucher = buildGoodsReceivingVoucherDraft({
    purchaseOrder: po,
    itemId: item.id,
    receivedQuantity: 50,
    unitCost: 100,
    receivingDate: "2026-07-17",
    receivedBy: "Abel Tesfaye",
    createdBy: "Abel Tesfaye",
  });
  const result = confirmGoodsReceivingVoucher(voucher, [item], [], [po]);
  const expense = buildSupplierPayableExpense({ grv: result.voucher, supplierName: po.supplier });
  assert.equal(expense.id, supplierPayableExpenseId(result.voucher.grvNumber));
  assert.equal(expense.amount, 5000);
  assert.match(expense.label, /Dashen Supplier/);
});

test("canPaySupplier allows manager and accountant but not storekeeper", () => {
  assert.equal(canPaySupplier("Branch Manager"), true);
  assert.equal(canPaySupplier("Accountant"), true);
  assert.equal(canPaySupplier("Storekeeper"), false);
});

test("buildProcurementQueueRows exposes next actions based on actor permissions", () => {
  const requisition = sampleRequisition("Abel Tesfaye");
  const managerRows = buildProcurementQueueRows({
    requisitions: [requisition],
    purchaseOrders: [],
    storeFilter: "Store 1",
    actor: manager,
  });
  assert.equal(managerRows[0]?.nextAction, "approve_requisition");

  const keeperRows = buildProcurementQueueRows({
    requisitions: [requisition],
    purchaseOrders: [],
    storeFilter: "Store 1",
    actor: storekeeper,
  });
  assert.equal(keeperRows[0]?.nextAction, "none");
  assert.equal(canActorApproveRequisition(storekeeper, requisition), false);
});

test("supplierHasProcurementRecords checks legacy and stock purchase orders", () => {
  assert.equal(
    supplierHasProcurementRecords({
      supplierName: "Dashen Supplier",
      legacyPurchaseOrders: [{ id: "po1", supplier: "Dashen Supplier", sku: item.id, item: item.name, qty: 1, unit: "bottle", unitCost: 1, total: 1, status: "Pending", date: "2026-07-17", store: "Store 1" }],
      purchaseOrders: [],
    }),
    true,
  );
  assert.equal(
    supplierHasProcurementRecords({
      supplierName: "Unknown",
      legacyPurchaseOrders: [],
      purchaseOrders: [submittedPurchaseOrder()],
    }),
    false,
  );
});

test("full reported flow: request -> approve -> create PO -> approve PO -> receive GRV", () => {
  // Step 1: store user requests a purchase (requisition).
  const requisition = sampleRequisition("Abel Tesfaye");

  // Step 2: manager approves the requisition. The queue must now offer "Create PO",
  // not "Receive GRV" - GRV only unlocks after a PO exists and is approved.
  const approved = approvedRequisition("Abel Tesfaye");
  const afterApproval = buildProcurementQueueRows({
    requisitions: [approved],
    purchaseOrders: [],
    storeFilter: "Store 1",
    actor: manager,
  });
  assert.equal(afterApproval[0]?.nextAction, "create_po");

  // Step 3: manager creates the PO. The manager cannot approve their own PO,
  // so their row shows a pending hint instead of an action.
  const po = submittedPurchaseOrder("Liya Demeke");
  const managerView = buildProcurementQueueRows({
    requisitions: [],
    purchaseOrders: [po],
    storeFilter: "Store 1",
    actor: manager,
  });
  assert.equal(managerView[0]?.nextAction, "none");
  assert.match(managerView[0]?.pendingHint ?? "", /Awaiting PO approval/);

  // Step 4: a different user (storekeeper) approves the PO.
  const keeperView = buildProcurementQueueRows({
    requisitions: [],
    purchaseOrders: [po],
    storeFilter: "Store 1",
    actor: storekeeper,
  });
  assert.equal(keeperView[0]?.nextAction, "approve_po");
  const approvedPo = approvePurchaseOrderAsActor(po, storekeeper);

  // Step 5: only now does "Receive GRV" appear for the store actor.
  const receiveView = buildProcurementQueueRows({
    requisitions: [],
    purchaseOrders: [approvedPo],
    storeFilter: "Store 1",
    actor: storekeeper,
  });
  assert.equal(receiveView[0]?.nextAction, "receive_grv");
  assert.ok(requisition.id);
});

test("approved purchase order exposes receive action for authorized store actor", () => {
  const approved = approvePurchaseOrderAsActor(submittedPurchaseOrder("Liya Demeke"), storekeeper);
  const rows = buildProcurementQueueRows({
    requisitions: [],
    purchaseOrders: [approved],
    storeFilter: "Store 1",
    actor: storekeeper,
  });
  assert.equal(rows[0]?.nextAction, "receive_grv");
  assert.equal(rows[0]?.status, "Approved");
});
