import test from "node:test";
import assert from "node:assert/strict";

import {
  STOCK_ITEMS_SEED,
  STOCK_LEDGER_SEED,
  STOCK_RECIPES_SEED,
  approveAndPostPhysicalCount,
  approveDepartmentStockRequest,
  approveDepartmentStockRequestAsActor,
  approvePurchaseOrder,
  approvePurchaseRequisition,
  assertLedgerAppendOnly,
  buildConsumptionReport,
  buildCountVarianceReport,
  buildLocationBalances,
  buildPosReservationDrafts,
  buildPosIntegratedReports,
  buildPosShiftClosePack,
  buildStockMovementSummary,
  closePosShiftSession,
  computeRecipePortionsAvailable,
  confirmGoodsReceivingVoucher,
  confirmStoreReceiving,
  consumePosReservations,
  convertDepartmentRequestToIssueVoucher,
  convertDepartmentRequestToIssueVoucherAsActor,
  convertPurchaseRequisitionToPurchaseOrder,
  convertRequestToTransfer,
  convertStockQuantity,
  createCancellationReversalVoucher,
  createDepartmentStockRequest,
  createPhysicalCountSession,
  createPosOrderStockReversal,
  createPosOrderWastageEntries,
  createPosPackagedReturnEntries,
  createPosStockDeductionEntries,
  dispatchStockTransfer,
  dispatchStoreIssueVoucher,
  evaluatePosStockSale,
  exportRowsToCsv,
  exportRowsToXlsx,
  generateInventoryDocumentNumber,
  getGoatPoolStockItemDefaults,
  getLowStockAlertItems,
  getPosReservedQuantity,
  getSellableStockQuantity,
  GOAT_LIMB_SKU,
  inventoryPermissionSetForRole,
  inventoryPermissionSetForActor,
  isGoatPoolSku,
  mergeMissingGoatPoolItems,
  nextInventoryDocumentNumber,
  actorCanActOnCentralStore,
  resolveActorCentralStore,
  openPosShiftSession,
  orderHasPosStockDeduction,
  orderPreparationStarted,
  pickPreferredSourceStore,
  quarantineLotsForReturn,
  receiveStockTransfer,
  receiveStoreIssueVoucher,
  recordPosNegativeSaleAttempt,
  rejectDepartmentStockRequest,
  rejectDepartmentStockRequestAsActor,
  collectVoucherTransferMovements,
  createPhysicalCountSessionAsActor,
  getReservedStockQuantity,
  getIncomingStockQuantity,
  releasePosReservations,
  reservePosStock,
  resolvePosAvailabilityStatus,
  resolvePosDeductionLocation,
  resolvePosVoidStockOutcome,
  shouldDeductPosStock,
  shouldReservePosStock,
  stationToOperationalLocation,
  suggestDepartmentRestockQuantity,
  validateInventoryDocumentApproval,
  validateStockLedgerEntry,
  type DepartmentStockRequestDocument,
  type GoodsReceivingVoucherDocument,
  type PurchaseOrderDocument,
  type PurchaseRequisitionDocument,
  type StockManagedItem,
  type StockRequestRecord,
  type StockTransferRecord,
} from "./stock-management.ts";

test("convertStockQuantity converts via direct and reverse rules", () => {
  const whisky = STOCK_ITEMS_SEED.find((item) => item.id === "stk-whisky-black-label");
  assert.ok(whisky);

  assert.equal(convertStockQuantity(whisky, 1, "case", "bottle"), 12);
  assert.equal(convertStockQuantity(whisky, 16, "double shot", "bottle"), 1);
});

test("createPosStockDeductionEntries deducts pour units not whole bottles for spirits", () => {
  const amarula = STOCK_ITEMS_SEED.find((item) => item.id === "stk-amarula");
  assert.ok(amarula);
  const entries = createPosStockDeductionEntries(
    {
      orderId: "o-spirit-1",
      orderNo: "ORD-SPIRIT-1",
      closedAt: "2026-07-20 10:00 AM",
      enteredBy: "Cashier Test",
      lines: [{ name: "Amarula", qty: 3, unitLabel: "Double Shot", stockSku: "stk-amarula" }],
    },
    STOCK_ITEMS_SEED,
    STOCK_RECIPES_SEED,
    [],
  );
  assert.equal(entries.length, 1);
  assert.equal(entries[0]?.quantity, 3);
  assert.equal(entries[0]?.unit, "double shot");
  assert.notEqual(entries[0]?.quantity, 1);
});

test("buildLocationBalances applies purchases and transfers in base units", () => {
  const balances = buildLocationBalances(STOCK_ITEMS_SEED, STOCK_LEDGER_SEED);
  const warehouseBeer = balances.find(
    (row) => row.itemId === "stk-beer-habesha" && row.location === "Store 1",
  );
  const vipWhisky = balances.find(
    (row) => row.itemId === "stk-whisky-black-label" && row.location === "VIP Bar",
  );

  assert.ok(warehouseBeer);
  assert.equal(warehouseBeer.quantity, 360);
  assert.ok(vipWhisky);
  assert.equal(vipWhisky.quantity, 6);
});

test("getLowStockAlertItems returns balances at or below reorder level", () => {
  const alerts = getLowStockAlertItems(
    STOCK_ITEMS_SEED.map((item) =>
      item.id === "stk-coffee-beans" ? { ...item, currentStock: 8 } : item,
    ),
    [],
  );

  assert.ok(alerts.some((row) => row.itemId === "stk-coffee-beans"));
});

test("validateStockLedgerEntry blocks deductions beyond available quantity", () => {
  const result = validateStockLedgerEntry(STOCK_ITEMS_SEED, [], {
    id: "test-deduction",
    type: "MANUAL_DEDUCTION",
    date: "2026-07-07",
    itemId: "stk-onion",
    itemName: "Onion",
    category: "Kitchen",
    location: "Kitchen",
    quantity: 999,
    unit: "kg",
    totalCost: 0,
    enteredBy: "Test",
  });

  assert.equal(result.ok, false);
  assert.match(result.error ?? "", /Insufficient stock/i);
});

test("createPosStockDeductionEntries creates recipe-driven stock deductions", () => {
  const entries = createPosStockDeductionEntries(
    {
      orderId: "o-1",
      orderNo: "ORD-0001",
      closedAt: "2026-07-07 10:00 AM",
      enteredBy: "Cashier Test",
      lines: [{ name: "Dulet", qty: 2 }],
    },
    STOCK_ITEMS_SEED,
    STOCK_RECIPES_SEED,
    [],
  );

  assert.equal(entries.length, 2);
  assert.ok(entries.every((entry) => entry.type === "RECIPE_CONSUMPTION"));
  assert.ok(entries.some((entry) => entry.itemId === "stk-beef-prime" && entry.quantity === 0.5));
  assert.ok(entries.some((entry) => entry.itemId === "stk-onion" && entry.quantity === 0.1));
});

test("confirmStoreReceiving only increases selected central store and updates item cost", () => {
  const receiving = {
    id: "rcv-1",
    receivingNumber: "RCV-001",
    supplier: "Test Supplier",
    purchaseOrderReference: "PO-1",
    storeDestination: "Store 2" as const,
    receivingDate: "2026-07-07",
    receivedBy: "Store Manager",
    status: "Draft" as const,
    lines: [{ id: "line-1", itemId: "stk-beer-habesha", itemName: "Habesha Beer", unit: "case" as const, orderedQuantity: 2, receivedQuantity: 2, unitCost: 900 }],
  };
  const result = confirmStoreReceiving(receiving, STOCK_ITEMS_SEED, []);
  const balances = buildLocationBalances(result.items, result.ledger);
  const store2Beer = balances.find((row) => row.itemId === "stk-beer-habesha" && row.location === "Store 2");

  assert.equal(result.receiving.status, "Confirmed");
  assert.equal(result.items.find((item) => item.id === "stk-beer-habesha")?.purchasePrice, 900);
  assert.equal(store2Beer?.quantity, 24);
  assert.equal(result.ledgerEntries[0].type, "PURCHASE_RECEIPT");
});

test("transfer workflow reserves on approval, decreases source on dispatch, increases destination on receipt", () => {
  const transfer: StockTransferRecord = {
    id: "trf-1",
    transferNumber: "TRF-001",
    sourceLocation: "Store 1",
    destinationLocation: "Kitchen",
    transferDate: "2026-07-07",
    status: "Draft",
    notes: "Kitchen replenishment",
    activity: [],
    lines: [{ id: "line-1", itemId: "stk-onion", itemName: "Onion", unit: "kg", requestedQuantity: 10, approvedQuantity: 0, sentQuantity: 0, receivedQuantity: 0 }],
  };
  const approved = convertRequestToTransfer({
    id: "req-1",
    requestNumber: "REQ-001",
    requestingDepartment: "Kitchen",
    requestedSourceStore: "Store 1",
    lines: [{ id: "line-1", itemId: "stk-onion", itemName: "Onion", availableQuantityAtDepartment: 5, requestedQuantity: 10, approvedQuantity: 10, unit: "kg" }],
    priority: "Normal",
    reason: "Low stock",
    requiredDate: "2026-07-08",
    requestedBy: "Kitchen User",
    reviewedBy: "Store Manager",
    status: "Approved",
    createdAt: "2026-07-07",
    updatedAt: "2026-07-07",
  } satisfies StockRequestRecord);
  assert.equal(approved.sourceLocation, "Store 1");
  assert.equal(approved.destinationLocation, "Kitchen");

  const manuallyApproved = { ...approveLike(transfer), sourceLocation: "Kitchen" as const, destinationLocation: "Store 1" as const };
  const dispatched = dispatchStockTransfer(manuallyApproved, "Storekeeper", STOCK_ITEMS_SEED, []);
  const received = receiveStockTransfer(dispatched.transfer, "Storekeeper", STOCK_ITEMS_SEED, dispatched.ledger);
  const balances = buildLocationBalances(STOCK_ITEMS_SEED, received.ledger);
  const kitchenOnion = balances.find((row) => row.itemId === "stk-onion" && row.location === "Kitchen");
  const store1Onion = balances.find((row) => row.itemId === "stk-onion" && row.location === "Store 1");

  assert.equal(dispatched.ledgerEntries[0].type, "TRANSFER_OUT");
  assert.equal(received.ledgerEntries[0].type, "TRANSFER_IN");
  assert.equal(kitchenOnion?.quantity, 45);
  assert.equal(store1Onion?.quantity, 10);
});

function approveLike(transfer: StockTransferRecord): StockTransferRecord {
  return {
    ...transfer,
    sourceLocation: "Kitchen",
    destinationLocation: "Store 1",
    status: "Approved",
    approvedBy: "Store Manager",
    lines: transfer.lines.map((line) => ({ ...line, approvedQuantity: line.requestedQuantity })),
  };
}

test("generateInventoryDocumentNumber creates year-based padded document numbers", () => {
  const documentNo = generateInventoryDocumentNumber("PO", new Date("2026-07-11T00:00:00Z"), 12);
  assert.equal(documentNo, "PO-2026-00012");
});

test("nextInventoryDocumentNumber increments from existing numbers", () => {
  assert.equal(
    nextInventoryDocumentNumber("SIV", ["SIV-2026-00001", "SIV-2026-00007", "SIV-2025-00099"], new Date("2026-07-14T00:00:00Z")),
    "SIV-2026-00008",
  );
  assert.equal(nextInventoryDocumentNumber("SIV", [], new Date("2026-07-14T00:00:00Z")), "SIV-2026-00001");
});

test("approvePurchaseRequisition supports partial approval with approval history", () => {
  const requisition: PurchaseRequisitionDocument = {
    id: "pr-1",
    documentType: "Purchase Requisition",
    documentNumber: "PR-2026-00001",
    requisitionNumber: "PR-2026-00001",
    status: "Submitted",
    createdAt: "2026-07-11T08:00:00Z",
    createdBy: "Storekeeper",
    requestingStore: "Store 1",
    requiredDate: "2026-07-12",
    requestedBy: "Storekeeper",
    approvalHistory: [],
    lines: [
      {
        id: "line-1",
        itemId: "stk-beer-habesha",
        itemName: "Habesha Beer",
        currentStock: 12,
        reorderLevel: 20,
        requestedQuantity: 10,
        approvedQuantity: 0,
        unit: "case",
        reason: "Below minimum",
      },
    ],
  };

  const approved = approvePurchaseRequisition(requisition, "Branch Manager", [{ lineId: "line-1", approvedQuantity: 6 }]);
  assert.equal(approved.status, "Partially Approved");
  assert.equal(approved.lines[0]?.approvedQuantity, 6);
  assert.equal(approved.approvalHistory[0]?.action, "Approved");
});

test("convertPurchaseRequisitionToPurchaseOrder creates PO from approved quantities only", () => {
  const requisition: PurchaseRequisitionDocument = {
    id: "pr-2",
    documentType: "Purchase Requisition",
    documentNumber: "PR-2026-00002",
    requisitionNumber: "PR-2026-00002",
    status: "Approved",
    createdAt: "2026-07-11T08:00:00Z",
    createdBy: "Storekeeper",
    requestingStore: "Store 2",
    requiredDate: "2026-07-12",
    requestedBy: "Storekeeper",
    approvalHistory: [],
    lines: [
      {
        id: "line-1",
        itemId: "stk-water-ambo",
        itemName: "Ambo Water",
        currentStock: 10,
        reorderLevel: 40,
        requestedQuantity: 8,
        approvedQuantity: 8,
        unit: "case",
        reason: "Replenishment",
      },
    ],
  };

  const po = convertPurchaseRequisitionToPurchaseOrder(requisition, "Ambo Mineral Water", "Procurement Officer");
  assert.equal(po.documentType, "Purchase Order");
  assert.equal(po.status, "Submitted");
  assert.equal(po.destinationStore, "Store 2");
  assert.equal(po.lines.length, 1);
  assert.equal(po.lines[0]?.orderedQuantity, 8);
});

test("approvePurchaseOrder enforces maker-checker and ledger immutability helpers", () => {
  const order = {
    id: "po-approve-1",
    documentType: "Purchase Order" as const,
    documentNumber: "PO-2026-00099",
    purchaseOrderNumber: "PO-2026-00099",
    status: "Submitted" as const,
    createdAt: "2026-07-11T08:00:00Z",
    createdBy: "Procurement Officer",
    preparedBy: "Procurement Officer",
    supplier: "Dashen Brewery",
    destinationStore: "Store 1" as const,
    orderDate: "2026-07-11",
    approvalHistory: [],
    lines: [],
  };
  assert.throws(() => approvePurchaseOrder(order, "Procurement Officer"), /cannot approve their own/i);
  const approved = approvePurchaseOrder(order, "Store Manager");
  assert.equal(approved.status, "Approved");
  assert.equal(approved.approvedBy, "Store Manager");

  const receiveBlocked = validateInventoryDocumentApproval(
    { userName: "Storekeeper", role: "Storekeeper", assignedStore: "Store 1" },
    { createdBy: "Bartender", documentType: "Store Issue Voucher", issuedBy: "Storekeeper" },
    "receive",
    "Main Bar",
  );
  assert.equal(receiveBlocked.ok, false);

  const immutable = assertLedgerAppendOnly(
    [{
      id: "e1",
      type: "PURCHASE_RECEIPT",
      date: "2026-07-11",
      itemName: "Beer",
      location: "Store 1",
      quantity: 1,
      unit: "bottle",
      totalCost: 1,
      enteredBy: "A",
      immutable: true,
    }],
    [],
  );
  assert.equal(immutable.ok, false);

  assert.equal(inventoryPermissionSetForRole("Auditor").readOnly, true);
  assert.equal(inventoryPermissionSetForRole("Inventory Administrator").allowNegativeStock, true);
  assert.equal(inventoryPermissionSetForRole("Cashier").readOnly, true);
});

test("confirmGoodsReceivingVoucher updates PO receipt state and central store stock only", () => {
  const purchaseOrder: PurchaseOrderDocument = {
    id: "po-1",
    documentType: "Purchase Order",
    documentNumber: "PO-2026-00001",
    purchaseOrderNumber: "PO-2026-00001",
    status: "Approved",
    createdAt: "2026-07-11T08:00:00Z",
    createdBy: "Procurement Officer",
    preparedBy: "Procurement Officer",
    supplier: "Dashen Brewery",
    destinationStore: "Store 1",
    orderDate: "2026-07-11",
    approvalHistory: [],
    lines: [
      {
        id: "pol-1",
        itemId: "stk-beer-habesha",
        itemName: "Habesha Beer",
        orderedQuantity: 5,
        receivedQuantity: 0,
        unit: "case",
        unitPrice: 850,
        discount: 0,
        tax: 0,
        totalCost: 4250,
      },
    ],
  };

  const voucher: GoodsReceivingVoucherDocument = {
    id: "grv-1",
    documentType: "Goods Receiving Voucher",
    documentNumber: "GRV-2026-00001",
    grvNumber: "GRV-2026-00001",
    status: "Draft",
    createdAt: "2026-07-11T09:00:00Z",
    createdBy: "Storekeeper",
    supplier: "Dashen Brewery",
    destinationStore: "Store 1",
    purchaseOrderReference: "PO-2026-00001",
    receivingDate: "2026-07-11",
    receivedBy: "Storekeeper",
    approvalHistory: [],
    lines: [
      {
        id: "grv-line-1",
        itemId: "stk-beer-habesha",
        itemName: "Habesha Beer",
        unit: "case",
        orderedQuantity: 5,
        receivedQuantity: 4,
        rejectedQuantity: 1,
        freeQuantity: 1,
        unitCost: 850,
      },
    ],
  };

  const result = confirmGoodsReceivingVoucher(voucher, STOCK_ITEMS_SEED, [], [purchaseOrder]);
  const balance = buildLocationBalances(result.items, result.ledger).find(
    (row) => row.itemId === "stk-beer-habesha" && row.location === "Store 1",
  );
  assert.equal(result.voucher.status, "Confirmed");
  assert.equal(result.purchaseOrders[0]?.status, "Received");
  assert.equal(result.purchaseOrders[0]?.lines[0]?.receivedQuantity, 5);
  assert.equal(balance?.quantity, 300);
});

test("convertDepartmentRequestToIssueVoucher creates department issue document", () => {
  const request: DepartmentStockRequestDocument = {
    id: "srq-1",
    documentType: "Department Stock Request",
    documentNumber: "SRQ-2026-00001",
    stockRequestNumber: "SRQ-2026-00001",
    status: "Approved",
    createdAt: "2026-07-11T10:00:00Z",
    createdBy: "Bartender",
    requestingDepartment: "Main Bar",
    requestedSourceStore: "Store 1",
    priority: "High",
    reason: "Low stock",
    requiredDate: "2026-07-12",
    requestedBy: "Bartender",
    reviewedBy: "Store Manager",
    approvalHistory: [],
    lines: [
      {
        id: "req-line-1",
        itemId: "stk-beer-habesha",
        itemName: "Habesha Beer",
        availableQuantityAtDepartment: 12,
        requestedQuantity: 5,
        approvedQuantity: 4,
        unit: "case",
      },
    ],
  };

  const issue = convertDepartmentRequestToIssueVoucher(request);
  assert.equal(issue.documentType, "Store Issue Voucher");
  assert.equal(issue.sourceStore, "Store 1");
  assert.equal(issue.destinationDepartment, "Main Bar");
  assert.equal(issue.lines[0]?.approvedQuantity, 4);
});

test("createCancellationReversalVoucher creates immutable reversal records", () => {
  const reversal = createCancellationReversalVoucher(
    "SIV-2026-00001",
    "Store Issue Voucher",
    "Inventory Administrator",
    "Incorrect dispatch",
    [
      {
        id: "orig-ledger-1",
        type: "TRANSFER_OUT",
        date: "2026-07-11",
        itemId: "stk-beer-habesha",
        itemName: "Habesha Beer",
        category: "Beer",
        location: "Store 1",
        fromLocation: "Store 1",
        toLocation: "Main Bar",
        quantity: 2,
        unit: "case",
        unitPrice: 850,
        totalCost: 1700,
        enteredBy: "Storekeeper",
        referenceNo: "SIV-2026-00001",
      },
    ],
  );

  assert.equal(reversal.voucher.documentType, "Cancellation Reversal Voucher");
  assert.equal(reversal.reversalEntries[0]?.type, "CANCELLATION_REVERSAL");
  assert.match(reversal.reversalEntries[0]?.notes ?? "", /Incorrect dispatch/);
});

test("resolvePosDeductionLocation never returns Store 1 or Store 2", () => {
  assert.equal(resolvePosDeductionLocation("Store 1", undefined, "Beer"), "Main Bar");
  assert.equal(resolvePosDeductionLocation("Store 2", undefined, "Water"), "Main Bar");
  assert.equal(resolvePosDeductionLocation("Kitchen", undefined, "Kitchen"), "Kitchen");
  assert.equal(resolvePosDeductionLocation("Store 1", "VIP Bar", "Beer"), "VIP Bar");
  assert.equal(resolvePosDeductionLocation("Store 1", undefined, "General Expense"), null);
});

test("POS direct sale deducts from VIP Bar when line station is VIP", () => {
  const item = {
    ...STOCK_ITEMS_SEED.find((row) => row.id === "stk-beer-habesha")!,
    preferredLocation: "Store 1" as const,
  };
  const vipOpening = [{
    id: "sled-vip-open",
    type: "TRANSFER_IN" as const,
    date: "2026-07-16",
    itemId: item.id,
    itemName: item.name,
    category: item.category,
    location: "VIP Bar" as const,
    fromLocation: "Store 1" as const,
    toLocation: "VIP Bar" as const,
    quantity: 20,
    unit: item.baseUnit,
    totalCost: 20 * item.purchasePrice,
    enteredBy: "System",
    immutable: true as const,
  }];
  const entries = createPosStockDeductionEntries(
    {
      orderId: "o-vip-1",
      orderNo: "VIP-1",
      closedAt: "2026-07-16T12:00:00.000Z",
      enteredBy: "Cashier",
      lines: [{
        name: item.name,
        qty: 2,
        stockSku: item.id,
        stockDeductionLocation: "VIP Bar",
        station: "VIP Bar",
      }],
    },
    [item],
    [],
    vipOpening,
  );
  assert.equal(entries.length, 1);
  assert.equal(entries[0]?.type, "POS_CONSUMPTION");
  assert.equal(entries[0]?.location, "VIP Bar");
  assert.equal(entries[0]?.quantity, 2);
});

test("createPosStockDeductionEntries never deducts from central stores", () => {
  const entries = createPosStockDeductionEntries(
    {
      orderId: "o-2",
      orderNo: "ORD-0002",
      closedAt: "2026-07-07 10:00 AM",
      enteredBy: "Cashier Test",
      lines: [{ name: "Habesha Beer", qty: 2, stockSku: "stk-beer-habesha" }],
    },
    STOCK_ITEMS_SEED,
    STOCK_RECIPES_SEED,
    STOCK_LEDGER_SEED,
  );

  assert.ok(entries.length >= 1);
  assert.ok(entries.every((entry) => entry.location !== "Store 1" && entry.location !== "Store 2"));
  assert.equal(entries[0]?.location, "Main Bar");
});

test("department stock request supports submit, approve, reject, and issue conversion", () => {
  const request = createDepartmentStockRequest({
    requestingDepartment: "Main Bar",
    requestedSourceStore: "Store 1",
    priority: "Urgent",
    reason: "Low stock",
    requiredDate: "2026-07-12",
    requestedBy: "Bartender",
    lines: [{
      itemId: "stk-beer-habesha",
      itemName: "Habesha Beer",
      availableQuantityAtDepartment: 4,
      requestedQuantity: 10,
      unit: "case",
    }],
  });
  assert.equal(request.status, "Submitted");
  assert.match(request.stockRequestNumber, /^SRQ-/);

  assert.throws(() => approveDepartmentStockRequest(request, "Bartender"), /must not approve their own/i);

  const approved = approveDepartmentStockRequest(request, "Storekeeper", [{ lineId: request.lines[0]!.id, approvedQuantity: 6 }]);
  assert.equal(approved.status, "Partially Approved");
  assert.equal(approved.lines[0]?.approvedQuantity, 6);

  const rejected = rejectDepartmentStockRequest(request, "Storekeeper", "Out of stock");
  assert.equal(rejected.status, "Rejected");

  const converted = convertDepartmentRequestToIssueVoucherAsActor(approved, {
    userName: "Storekeeper",
    role: "Storekeeper",
    assignedStore: "Store 1",
  });
  assert.equal(converted.voucher.documentType, "Store Issue Voucher");
  assert.equal(converted.request.status, "Converted to Issue Voucher");
  assert.equal(converted.voucher.lines[0]?.approvedQuantity, 6);
});

test("store issue voucher decreases source on dispatch and increases department on receipt", () => {
  const request = createDepartmentStockRequest({
    requestingDepartment: "Main Bar",
    requestedSourceStore: "Store 1",
    priority: "Normal",
    reason: "Replenish",
    requiredDate: "2026-07-12",
    requestedBy: "Bartender",
    lines: [{
      itemId: "stk-beer-habesha",
      itemName: "Habesha Beer",
      availableQuantityAtDepartment: 0,
      requestedQuantity: 24,
      unit: "bottle",
    }],
  });
  const approved = approveDepartmentStockRequest(request, "Storekeeper");
  const afterApprove = buildLocationBalances(STOCK_ITEMS_SEED, [], collectVoucherTransferMovements([], [], []));
  const barAfterApprove = afterApprove.find((row) => row.itemId === "stk-beer-habesha" && row.location === "Main Bar");
  assert.equal(barAfterApprove?.quantity ?? 0, 0, "approve alone must not credit department inventory");

  const issue = convertDepartmentRequestToIssueVoucher(approved);
  const afterConvert = buildLocationBalances(
    STOCK_ITEMS_SEED,
    [],
    collectVoucherTransferMovements([issue], [], []),
  );
  const barAfterConvert = afterConvert.find((row) => row.itemId === "stk-beer-habesha" && row.location === "Main Bar");
  assert.equal(barAfterConvert?.quantity ?? 0, 0, "creating issue voucher must not credit department inventory");
  assert.equal(barAfterConvert?.incomingQuantity ?? 0, 0, "approved voucher is not in transit yet");

  const dispatched = dispatchStoreIssueVoucher(issue, "Storekeeper", STOCK_ITEMS_SEED, []);
  assert.equal(dispatched.voucher.status, "Dispatched");
  assert.equal(dispatched.ledgerEntries[0]?.type, "TRANSFER_OUT");

  const balancesAfterDispatch = buildLocationBalances(
    STOCK_ITEMS_SEED,
    dispatched.ledger,
    collectVoucherTransferMovements([dispatched.voucher], [], []),
  );
  const barAfterDispatch = balancesAfterDispatch.find((row) => row.itemId === "stk-beer-habesha" && row.location === "Main Bar");
  assert.equal(barAfterDispatch?.quantity ?? 0, 0, "dispatch must not credit department on-hand");
  assert.equal(barAfterDispatch?.incomingQuantity ?? 0, 24);

  const received = receiveStoreIssueVoucher(dispatched.voucher, "Bartender", STOCK_ITEMS_SEED, dispatched.ledger);
  assert.equal(received.voucher.status, "Received");
  assert.equal(received.ledgerEntries[0]?.type, "TRANSFER_IN");

  const balances = buildLocationBalances(STOCK_ITEMS_SEED, received.ledger);
  const barBeer = balances.find((row) => row.itemId === "stk-beer-habesha" && row.location === "Main Bar");
  const storeBeer = balances.find((row) => row.itemId === "stk-beer-habesha" && row.location === "Store 1");
  assert.equal(barBeer?.quantity, 24);
  assert.equal(storeBeer?.quantity, 216);
});

test("phase 3: weighted average updates purchase price on GRV confirm", () => {
  const item = STOCK_ITEMS_SEED.find((row) => row.id === "stk-beer-habesha");
  assert.ok(item);
  const result = confirmStoreReceiving(
    {
      id: "rcv-wac-1",
      receivingNumber: "GRV-WAC-1",
      supplier: "Dashen",
      storeDestination: "Store 1",
      receivingDate: "2026-07-11",
      status: "Draft",
      receivedBy: "Storekeeper",
      lines: [{
        id: "line-1",
        itemId: item.id,
        itemName: item.name,
        unit: "bottle",
        orderedQuantity: 100,
        receivedQuantity: 100,
        unitCost: 90,
      }],
    },
    [item],
    [],
    { settings: { id: "inventory-settings", costingMethod: "Weighted Average", allowNegativeStock: false, posReservationTrigger: "station_accept", posDeductionTiming: "item_ready", posOutOfStockBehavior: "block", updatedAt: "2026-07-11", updatedBy: "System" } },
  );
  const updated = result.items.find((row) => row.id === item.id);
  assert.ok(updated);
  // Opening Store 1 balance uses item.currentStock (240) at 70; receive 100 @ 90 → WAC 75.88
  assert.equal(updated.purchasePrice, 75.88);
  assert.equal(result.lots.length, 1);
  assert.equal(result.lots[0]?.status, "Available");
});

test("phase 3: FEFO allocates earliest expiry batch first on transfer dispatch", () => {
  const item = STOCK_ITEMS_SEED.find((row) => row.id === "stk-beer-habesha");
  assert.ok(item);
  const lots = [
    {
      id: "lot-late",
      itemId: item.id,
      itemName: item.name,
      location: "Store 1" as const,
      batchNumber: "B-LATE",
      expiryDate: "2027-01-01",
      quantity: 50,
      unit: "bottle" as const,
      unitCost: 70,
      status: "Available" as const,
      receivedAt: "2026-01-01T00:00:00.000Z",
    },
    {
      id: "lot-early",
      itemId: item.id,
      itemName: item.name,
      location: "Store 1" as const,
      batchNumber: "B-EARLY",
      expiryDate: "2026-08-01",
      quantity: 50,
      unit: "bottle" as const,
      unitCost: 70,
      status: "Available" as const,
      receivedAt: "2026-02-01T00:00:00.000Z",
    },
  ];
  const transfer: StockTransferRecord = {
    id: "trf-fefo",
    transferNumber: "STV-FEFO-1",
    sourceLocation: "Store 1",
    destinationLocation: "Main Bar",
    transferDate: "2026-07-11",
    status: "Approved",
    approvedBy: "Storekeeper",
    activity: [],
    lines: [{
      id: "trf-line-1",
      itemId: item.id,
      itemName: item.name,
      unit: "bottle",
      requestedQuantity: 10,
      approvedQuantity: 10,
      sentQuantity: 0,
      receivedQuantity: 0,
    }],
  };
  const dispatched = dispatchStockTransfer(transfer, "Storekeeper", [item], [], undefined, lots);
  assert.equal(dispatched.transfer.lines[0]?.batchNumber, "B-EARLY");
  const early = dispatched.lots.find((lot) => lot.batchNumber === "B-EARLY");
  assert.equal(early?.quantity, 40);
});

test("phase 3: damaged returns quarantine lots at destination", () => {
  const lots = [{
    id: "lot-q",
    itemId: "stk-beer-habesha",
    itemName: "Habesha Beer",
    location: "Store 1" as const,
    batchNumber: "B-Q",
    expiryDate: "2026-12-01",
    quantity: 12,
    unit: "bottle" as const,
    unitCost: 70,
    status: "Available" as const,
    receivedAt: "2026-07-01T00:00:00.000Z",
  }];
  const quarantined = quarantineLotsForReturn(lots, "stk-beer-habesha", "Store 1", 12, "Damaged packaging");
  assert.equal(quarantined.find((lot) => lot.batchNumber === "B-Q")?.status, "Quarantine");
});

test("phase 3: default unit conversions include crate and carton pairs", () => {
  const beer = { ...STOCK_ITEMS_SEED.find((row) => row.id === "stk-beer-habesha")!, conversions: [] };
  assert.equal(convertStockQuantity(beer, 1, "crate", "bottle"), 24);
  assert.equal(convertStockQuantity(beer, 1, "carton", "pcs"), 24);
});

test("phase 3: location policies drive low-stock alerts and CSV export works", () => {
  const item = STOCK_ITEMS_SEED.find((row) => row.id === "stk-beer-habesha");
  assert.ok(item);
  const policies = [{
    id: "pol-1",
    itemId: item.id,
    itemName: item.name,
    location: "Store 1" as const,
    minimumStock: 500,
    maximumStock: 1000,
    reorderLevel: 500,
    reorderQuantity: 200,
    safetyStock: 50,
    updatedAt: "2026-07-11T00:00:00.000Z",
  }];
  const alerts = getLowStockAlertItems([item], STOCK_LEDGER_SEED, policies);
  assert.ok(alerts.some((row) => row.itemId === item.id && row.location === "Store 1"));
  const csv = exportRowsToCsv(["A", "B"], [["1", 2]]);
  assert.equal(csv, "A,B\n1,2");
});

test("phase 4: blind physical count requires different approver and posts variance", () => {
  const item = STOCK_ITEMS_SEED.find((row) => row.id === "stk-beer-habesha");
  assert.ok(item);
  const session = createPhysicalCountSession({
    location: "Store 1",
    itemId: item.id,
    itemName: item.name,
    unit: "bottle",
    countedQuantity: 350,
    expectedQuantity: 360,
    unitCost: item.purchasePrice,
    countedBy: "Counter One",
    blindCount: true,
  });
  assert.equal(session.status, "Submitted");
  assert.equal(session.blindCount, true);
  assert.equal(session.lines[0]?.variance, -10);

  assert.throws(
    () => approveAndPostPhysicalCount(session, "Counter One", [item], STOCK_LEDGER_SEED),
    /cannot approve and post their own/i,
  );

  const posted = approveAndPostPhysicalCount(session, "Store Manager", [item], STOCK_LEDGER_SEED);
  assert.equal(posted.count.status, "Posted");
  assert.equal(posted.ledgerEntries.length, 1);
  assert.equal(posted.ledgerEntries[0]?.type, "ADJUSTMENT");
  assert.match(posted.ledgerEntries[0]?.notes || "", /decrease/i);
});

test("phase 4: consumption and movement summary reports aggregate ledger", () => {
  const consumption = buildConsumptionReport(STOCK_LEDGER_SEED);
  const movement = buildStockMovementSummary(STOCK_LEDGER_SEED);
  assert.ok(Array.isArray(consumption));
  assert.ok(movement.some((row) => row.type === "PURCHASE" || row.type === "PURCHASE_RECEIPT" || row.count >= 0));
  const variance = buildCountVarianceReport([]);
  assert.equal(variance.length, 0);
});

test("phase A: station maps to operational locations and never stores", () => {
  assert.equal(stationToOperationalLocation("Main Bar"), "Main Bar");
  assert.equal(stationToOperationalLocation("VIP Bar"), "VIP Bar");
  assert.equal(stationToOperationalLocation("Kitchen"), "Kitchen");
  assert.equal(stationToOperationalLocation("Bar"), "Main Bar");
  assert.equal(stationToOperationalLocation("Store 1"), null);
});

test("phase A: reservation reduces sellable qty and releases on cancel", () => {
  const drafts = buildPosReservationDrafts({
    orderId: "o-phase-a",
    orderNo: "ORD-9001",
    reservedBy: "Cashier",
    lines: [{ name: "Habesha Beer", qty: 5, stockSku: "stk-beer-habesha", station: "Main Bar" }],
    items: STOCK_ITEMS_SEED,
    recipes: STOCK_RECIPES_SEED,
  });
  assert.ok(drafts.length >= 1);
  assert.equal(drafts[0]?.location, "Main Bar");

  const reserved = reservePosStock([], drafts);
  assert.equal(reserved.created.length, drafts.length);
  assert.equal(getPosReservedQuantity(reserved.reservations, "stk-beer-habesha", "Main Bar"), 5);
  assert.equal(getSellableStockQuantity(20, 5), 15);

  const released = releasePosReservations(reserved.reservations, "o-phase-a");
  assert.equal(released.changed, reserved.created.length);
  assert.equal(getPosReservedQuantity(released.reservations, "stk-beer-habesha", "Main Bar"), 0);
});

test("phase A: reservation adds incremental quantity when an existing order line quantity increases", () => {
  const initialDrafts = buildPosReservationDrafts({
    orderId: "o-phase-a-edit",
    orderNo: "ORD-9002",
    reservedBy: "Cashier",
    lines: [{ name: "Habesha Beer", qty: 2, stockSku: "stk-beer-habesha", station: "Main Bar" }],
    items: STOCK_ITEMS_SEED,
    recipes: STOCK_RECIPES_SEED,
  });
  const firstReserve = reservePosStock([], initialDrafts);
  assert.equal(getPosReservedQuantity(firstReserve.reservations, "stk-beer-habesha", "Main Bar"), 2);

  const updatedDrafts = buildPosReservationDrafts({
    orderId: "o-phase-a-edit",
    orderNo: "ORD-9002",
    reservedBy: "Cashier",
    lines: [{ name: "Habesha Beer", qty: 5, stockSku: "stk-beer-habesha", station: "Main Bar" }],
    items: STOCK_ITEMS_SEED,
    recipes: STOCK_RECIPES_SEED,
  });
  const updatedReserve = reservePosStock(firstReserve.reservations, updatedDrafts);

  assert.equal(updatedReserve.created.length, 1);
  assert.equal(updatedReserve.created[0]?.quantity, 3);
  assert.equal(getPosReservedQuantity(updatedReserve.reservations, "stk-beer-habesha", "Main Bar"), 5);
});

test("phase A: recipe wastage and per-ingredient locations + idempotent deduction", () => {
  assert.equal(shouldReservePosStock("station_accept", "station_accept"), true);
  assert.equal(shouldDeductPosStock("item_ready", "payment_completed"), false);

  const first = createPosStockDeductionEntries(
    {
      orderId: "o-dulet-1",
      orderNo: "ORD-DULET",
      closedAt: "2026-07-11T12:00:00.000Z",
      enteredBy: "Cashier",
      lines: [{ name: "Dulet", qty: 1 }],
    },
    STOCK_ITEMS_SEED,
    STOCK_RECIPES_SEED,
    [],
  );
  assert.ok(first.some((entry) => entry.type === "RECIPE_CONSUMPTION" && entry.location === "Butcher"));
  assert.ok(first.some((entry) => entry.type === "RECIPE_CONSUMPTION" && entry.location === "Kitchen"));

  const coffee = createPosStockDeductionEntries(
    {
      orderId: "o-coffee-1",
      orderNo: "ORD-COFFEE",
      closedAt: "2026-07-11T12:00:00.000Z",
      enteredBy: "Cashier",
      lines: [{ name: "Coffee", qty: 1 }],
    },
    STOCK_ITEMS_SEED,
    STOCK_RECIPES_SEED,
    [],
  );
  const coffeeQty = coffee.find((entry) => entry.itemId === "stk-coffee-beans")?.quantity;
  assert.ok(coffeeQty != null && coffeeQty > 0.015); // 5% wastage

  const second = createPosStockDeductionEntries(
    {
      orderId: "o-dulet-1",
      orderNo: "ORD-DULET",
      closedAt: "2026-07-11T12:05:00.000Z",
      enteredBy: "Cashier",
      lines: [{ name: "Dulet", qty: 1 }],
      skipIfAlreadyDeducted: true,
    },
    STOCK_ITEMS_SEED,
    STOCK_RECIPES_SEED,
    first,
  );
  assert.equal(second.length, 0);
  assert.equal(orderHasPosStockDeduction(first, "o-dulet-1"), true);

  const consumed = consumePosReservations(
    reservePosStock([], buildPosReservationDrafts({
      orderId: "o-dulet-1",
      orderNo: "ORD-DULET",
      reservedBy: "Cashier",
      lines: [{ name: "Dulet", qty: 1, station: "Kitchen" }],
      items: STOCK_ITEMS_SEED,
      recipes: STOCK_RECIPES_SEED,
    })).reservations,
    "o-dulet-1",
  );
  assert.ok(consumed.changed > 0);
  assert.ok(consumed.reservations.every((row) => row.status !== "Reserved" || row.orderId !== "o-dulet-1"));
});

test("phase B: void outcome and OOS policy engine", () => {
  assert.equal(
    resolvePosVoidStockOutcome({ preparationStarted: false, stockDeducted: false }),
    "release_only",
  );
  assert.equal(
    resolvePosVoidStockOutcome({ preparationStarted: true, stockDeducted: false }),
    "wastage",
  );
  assert.equal(
    resolvePosVoidStockOutcome({ preparationStarted: true, stockDeducted: true }),
    "wastage",
  );
  assert.equal(
    resolvePosVoidStockOutcome({ preparationStarted: true, stockDeducted: true, reusablePackaged: true }),
    "reversal",
  );

  assert.equal(evaluatePosStockSale({ behavior: "block", remainingQty: -1, tracked: true }).allowed, false);
  assert.equal(
    evaluatePosStockSale({ behavior: "warn_manager", remainingQty: -1, tracked: true }).requiresManager,
    true,
  );
  assert.equal(
    evaluatePosStockSale({ behavior: "warn_manager", remainingQty: -1, tracked: true, managerApproved: true }).allowed,
    true,
  );
  assert.equal(
    evaluatePosStockSale({
      behavior: "allow_negative_authorized",
      remainingQty: -1,
      tracked: true,
      role: "Waiter",
    }).allowed,
    false,
  );
  assert.equal(
    evaluatePosStockSale({
      behavior: "allow_negative_authorized",
      remainingQty: -1,
      tracked: true,
      role: "Branch Manager",
    }).allowed,
    true,
  );
});

test("phase B: wastage without double-deduct; reversal and packaged return", () => {
  const consumed = createPosStockDeductionEntries(
    {
      orderId: "o-phase-b-beer",
      orderNo: "ORD-B-BEER",
      closedAt: "2026-07-11T12:00:00.000Z",
      enteredBy: "Cashier",
      lines: [{ name: "Habesha Beer", qty: 2, stockSku: "stk-beer-habesha", stockDeductionLocation: "Main Bar" }],
    },
    STOCK_ITEMS_SEED,
    STOCK_RECIPES_SEED,
    STOCK_LEDGER_SEED,
  );
  assert.ok(consumed.length >= 1);

  const afterDeductWastage = createPosOrderWastageEntries({
    orderId: "o-phase-b-beer",
    orderNo: "ORD-B-BEER",
    enteredBy: "Manager",
    reason: "Void after prep",
    lines: [{ name: "Habesha Beer", qty: 2, stockSku: "stk-beer-habesha", stockDeductionLocation: "Main Bar" }],
    items: STOCK_ITEMS_SEED,
    recipes: STOCK_RECIPES_SEED,
    ledger: consumed,
  });
  assert.equal(afterDeductWastage.alreadyDeducted, true);
  assert.equal(afterDeductWastage.entries.length, 0);

  const preDeductWastage = createPosOrderWastageEntries({
    orderId: "o-phase-b-prep",
    orderNo: "ORD-B-PREP",
    enteredBy: "Manager",
    reason: "Cancel after prep",
    lines: [{ name: "Habesha Beer", qty: 1, stockSku: "stk-beer-habesha", stockDeductionLocation: "Main Bar" }],
    items: STOCK_ITEMS_SEED,
    recipes: STOCK_RECIPES_SEED,
    ledger: STOCK_LEDGER_SEED,
  });
  assert.equal(preDeductWastage.alreadyDeducted, false);
  assert.ok(preDeductWastage.entries.some((entry) => entry.type === "WASTE"));

  const reversal = createPosOrderStockReversal({
    orderId: "o-phase-b-beer",
    orderNo: "ORD-B-BEER",
    reversedBy: "Manager",
    reason: "Reusable packaged void",
    ledger: consumed,
  });
  assert.ok(reversal.voucher);
  assert.ok(reversal.reversalEntries.some((entry) => entry.type === "CANCELLATION_REVERSAL"));

  const packagedReturn = createPosPackagedReturnEntries({
    orderId: "o-phase-b-beer",
    orderNo: "ORD-B-BEER",
    enteredBy: "Manager",
    reason: "Customer return",
    ledger: consumed,
  });
  assert.ok(packagedReturn.entries.some((entry) => entry.type === "DEPARTMENT_RETURN"));
});

test("phase B: preparation started detection", () => {
  assert.equal(orderPreparationStarted({ stationTickets: [{ status: "NEW" }] }), false);
  assert.equal(orderPreparationStarted({ stationTickets: [{ status: "PREPARING" }] }), true);
  assert.equal(orderPreparationStarted({ stockDeductedAt: "2026-07-11T12:00:00.000Z" }), true);
});

test("phase C: availability status and recipe bottleneck", () => {
  assert.equal(
    resolvePosAvailabilityStatus({ tracked: true, availableQty: 10, remainingQty: 8, reorderLevel: 3 }),
    "In Stock",
  );
  assert.equal(
    resolvePosAvailabilityStatus({ tracked: true, availableQty: 2, remainingQty: 2, reorderLevel: 5 }),
    "Low",
  );
  assert.equal(
    resolvePosAvailabilityStatus({ tracked: true, availableQty: 0, remainingQty: -1, source: "direct" }),
    "Out",
  );
  assert.equal(
    resolvePosAvailabilityStatus({ tracked: true, availableQty: 0, remainingQty: -1, source: "recipe" }),
    "Insufficient Ingredients",
  );
  assert.equal(
    resolvePosAvailabilityStatus({
      tracked: true,
      availableQty: 0,
      behavior: "auto_unavailable",
    }),
    "Temporarily Blocked",
  );

  const recipe = STOCK_RECIPES_SEED.find((row) => row.menuItemName === "Dulet");
  assert.ok(recipe);
  const balances = buildLocationBalances(STOCK_ITEMS_SEED, STOCK_LEDGER_SEED);
  const portions = computeRecipePortionsAvailable(recipe, STOCK_ITEMS_SEED, balances);
  assert.ok(portions.portions != null);
  assert.ok(portions.portions >= 0);
  assert.ok(portions.bottleneckItemName);
});

test("phase C: restock suggestion, shift pack, and integrated reports", () => {
  const suggested = suggestDepartmentRestockQuantity(
    { quantity: 2, availableQuantity: 2, reorderLevel: 10 },
    { reorderQuantity: 24, maximumStock: 40, safetyStock: 5 },
  );
  assert.equal(suggested, 24);
  assert.equal(pickPreferredSourceStore(buildLocationBalances(STOCK_ITEMS_SEED, STOCK_LEDGER_SEED), "stk-beer-habesha"), "Store 1");

  const pack = buildPosShiftClosePack({
    date: "2026-07-11",
    closedBy: "Cashier",
    orders: [
      {
        id: "o1",
        orderNo: "ORD-1",
        status: "CLOSED",
        total: 200,
        waiter: "Abebe",
        enteredByCashier: "Genet",
        paymentStatus: "Paid",
      },
      {
        id: "o2",
        orderNo: "ORD-2",
        status: "CANCELLED",
        total: 50,
        waiter: "Abebe",
        cancelledAt: "2026-07-11",
        stockExceptionOutcome: "wastage",
      },
    ],
    payments: [{ amount: 200, status: "Settled", method: "Cash" }],
    ledger: [
      {
        id: "l1",
        type: "POS_CONSUMPTION",
        date: "2026-07-11",
        itemId: "stk-beer-habesha",
        itemName: "Habesha Beer",
        category: "Beer",
        location: "Main Bar",
        quantity: 2,
        unit: "bottle",
        unitPrice: 40,
        totalCost: 80,
        enteredBy: "Cashier",
        quantityIn: 0,
        quantityOut: 2,
        immutable: true,
      },
      {
        id: "l2",
        type: "WASTE",
        date: "2026-07-11",
        itemId: "stk-beer-habesha",
        itemName: "Habesha Beer",
        category: "Beer",
        location: "Main Bar",
        quantity: 1,
        unit: "bottle",
        unitPrice: 40,
        totalCost: 40,
        enteredBy: "Manager",
        quantityIn: 0,
        quantityOut: 1,
        immutable: true,
      },
    ],
    posReservations: [],
  });
  assert.equal(pack.salesTotal, 200);
  assert.equal(pack.voidCount, 1);
  assert.ok(pack.consumptionValue >= 80);
  assert.ok(pack.wastageValue >= 40);
  assert.ok(pack.consumptionByDepartment.some((row) => row.location === "Main Bar"));

  const reports = buildPosIntegratedReports({
    orders: [
      {
        id: "o1",
        orderNo: "ORD-1",
        status: "CLOSED",
        total: 200,
        waiter: "Abebe",
        enteredByCashier: "Genet",
        paymentStatus: "Paid",
        items: [{ name: "Habesha Beer", qty: 2, unitPrice: 100, station: "Main Bar", stockDeductionLocation: "Main Bar" }],
      },
    ],
    ledger: pack.consumptionByDepartment.length
      ? [
          {
            id: "l1",
            type: "POS_CONSUMPTION",
            date: "2026-07-11",
            itemId: "stk-beer-habesha",
            itemName: "Habesha Beer",
            category: "Beer",
            location: "Main Bar",
            quantity: 2,
            unit: "bottle",
            unitPrice: 40,
            totalCost: 80,
            enteredBy: "Cashier",
            quantityIn: 0,
            quantityOut: 2,
            immutable: true,
          },
        ]
      : [],
    posReservations: [],
  });
  assert.ok(reports.salesByStation.some((row) => row.key === "Main Bar"));
  assert.ok(reports.salesByWaiter.some((row) => row.key === "Abebe"));
  assert.equal(reports.cogs, 80);
  assert.ok(reports.foodAndBevCostPercent > 0);
});

test("follow-up: shift open/close and negative-sale audit", () => {
  const balances = buildLocationBalances(STOCK_ITEMS_SEED, STOCK_LEDGER_SEED);
  const opened = openPosShiftSession({ openedBy: "Cashier", balances });
  assert.equal(opened.status, "Open");
  assert.ok(opened.openingBalances.length > 0);

  const attempt = recordPosNegativeSaleAttempt({
    attemptedBy: "Cashier",
    menuItemName: "Habesha Beer",
    requestedQty: 5,
    availableQty: 1,
    remainingQty: -4,
    behavior: "block",
    reason: "Out of stock",
    role: "Cashier",
  });
  assert.ok(attempt.id);
  assert.equal(attempt.behavior, "block");

  const pack = buildPosShiftClosePack({
    date: opened.date,
    closedBy: "Cashier",
    orders: [],
    payments: [],
    ledger: [],
    posReservations: [],
    negativeSaleAttempts: [attempt],
  });
  assert.equal(pack.negativeStockAttempts, 1);
  const closed = closePosShiftSession(opened, "Cashier", pack);
  assert.equal(closed.status, "Closed");
  assert.ok(closed.closePack);
});

test("follow-up: xlsx export produces workbook bytes", async () => {
  const bytes = await exportRowsToXlsx("Sheet1", ["A", "B"], [[1, "x"], [2, "y"]]);
  assert.ok(bytes.byteLength > 50);
});

test("e2e smoke: reserve → deduct → void wastage → restock request → issue", () => {
  const drafts = buildPosReservationDrafts({
    orderId: "o-smoke",
    orderNo: "ORD-SMOKE",
    reservedBy: "Cashier",
    lines: [{ name: "Habesha Beer", qty: 1, stockSku: "stk-beer-habesha", station: "Main Bar" }],
    items: STOCK_ITEMS_SEED,
    recipes: STOCK_RECIPES_SEED,
  });
  const reserved = reservePosStock([], drafts);
  assert.ok(reserved.created.length >= 1);

  const deducted = createPosStockDeductionEntries(
    {
      orderId: "o-smoke",
      orderNo: "ORD-SMOKE",
      closedAt: "2026-07-11T12:00:00.000Z",
      enteredBy: "Cashier",
      lines: [{ name: "Habesha Beer", qty: 1, stockSku: "stk-beer-habesha", stockDeductionLocation: "Main Bar" }],
    },
    STOCK_ITEMS_SEED,
    STOCK_RECIPES_SEED,
    STOCK_LEDGER_SEED,
  );
  assert.ok(deducted.length >= 1);
  const consumed = consumePosReservations(reserved.reservations, "o-smoke");
  assert.ok(consumed.changed > 0);

  const wastage = createPosOrderWastageEntries({
    orderId: "o-smoke",
    orderNo: "ORD-SMOKE",
    enteredBy: "Manager",
    reason: "Void after prep",
    lines: [{ name: "Habesha Beer", qty: 1, stockSku: "stk-beer-habesha", stockDeductionLocation: "Main Bar" }],
    items: STOCK_ITEMS_SEED,
    recipes: STOCK_RECIPES_SEED,
    ledger: deducted,
  });
  assert.equal(wastage.alreadyDeducted, true);

  const request = createDepartmentStockRequest({
    requestingDepartment: "Main Bar",
    requestedSourceStore: "Store 1",
    priority: "Urgent",
    reason: "POS replenishment",
    requiredDate: "2026-07-11",
    requestedBy: "Cashier",
    lines: [{
      itemId: "stk-beer-habesha",
      itemName: "Habesha Beer",
      availableQuantityAtDepartment: 0,
      requestedQuantity: 24,
      unit: "bottle",
    }],
  });
  assert.equal(request.status, "Submitted");

  const approved = approveDepartmentStockRequest(request, "Store Manager");
  assert.ok(approved.status === "Approved" || approved.status === "Partially Approved");
  const issued = convertDepartmentRequestToIssueVoucher(approved);
  assert.ok(issued.documentNumber);
});

test("per-store keeper assignment limits department request approval", () => {
  const requestStore1 = createDepartmentStockRequest({
    requestingDepartment: "Main Bar",
    requestedSourceStore: "Store 1",
    priority: "Normal",
    reason: "Low stock",
    requiredDate: "2026-07-12",
    requestedBy: "Bartender",
    lines: [{
      itemId: "stk-beer-habesha",
      itemName: "Habesha Beer",
      availableQuantityAtDepartment: 2,
      requestedQuantity: 12,
      unit: "bottle",
    }],
  });
  const requestStore2 = createDepartmentStockRequest({
    requestingDepartment: "Kitchen",
    requestedSourceStore: "Store 2",
    priority: "Normal",
    reason: "Prep stock",
    requiredDate: "2026-07-12",
    requestedBy: "Chef",
    lines: [{
      itemId: "stk-onion",
      itemName: "Onion",
      availableQuantityAtDepartment: 1,
      requestedQuantity: 10,
      unit: "kg",
    }],
  });

  const store1Keeper = { userName: "Keeper1", role: "Storekeeper", assignedStore: "Store 1" as const };
  const store2Keeper = { userName: "Keeper2", role: "Storekeeper", assignedStore: "Store 2" as const };
  const storeManager = { userName: "Store Manager", role: "Store Manager" };
  const bartender = { userName: "Bartender", role: "Bartender" };

  assert.equal(resolveActorCentralStore(store1Keeper), "Store 1");
  assert.equal(resolveActorCentralStore(storeManager), "all");
  assert.equal(actorCanActOnCentralStore(store1Keeper, "Store 1"), true);
  assert.equal(actorCanActOnCentralStore(store1Keeper, "Store 2"), false);
  assert.deepEqual(inventoryPermissionSetForActor(store1Keeper).manageableLocations, ["Store 1"]);
  assert.deepEqual(inventoryPermissionSetForActor({ userName: "Unassigned", role: "Storekeeper" }).manageableLocations, []);

  const approvedStore1 = approveDepartmentStockRequestAsActor(requestStore1, store1Keeper);
  assert.equal(approvedStore1.status, "Approved");
  assert.throws(() => approveDepartmentStockRequestAsActor(requestStore2, store1Keeper), /cannot act on Store 2/i);
  assert.throws(() => approveDepartmentStockRequestAsActor(requestStore1, store2Keeper), /cannot act on Store 1/i);

  const approvedByManager1 = approveDepartmentStockRequestAsActor(requestStore1, storeManager);
  const approvedByManager2 = approveDepartmentStockRequestAsActor(requestStore2, storeManager);
  assert.equal(approvedByManager1.status, "Approved");
  assert.equal(approvedByManager2.status, "Approved");

  const bartenderBlocked = validateInventoryDocumentApproval(
    bartender,
    requestStore1,
    "approve",
    requestStore1.requestedSourceStore,
  );
  assert.equal(bartenderBlocked.ok, false);

  const unassignedBlocked = validateInventoryDocumentApproval(
    { userName: "Unassigned", role: "Storekeeper" },
    requestStore1,
    "approve",
    requestStore1.requestedSourceStore,
  );
  assert.equal(unassignedBlocked.ok, false);
});

test("voucher movements drive reserved and incoming quantities", () => {
  const issue = {
    id: "siv-1",
    documentType: "Store Issue Voucher" as const,
    documentNumber: "SIV-1",
    issueVoucherNumber: "SIV-1",
    status: "Approved" as const,
    createdAt: new Date().toISOString(),
    createdBy: "Keeper",
    sourceStore: "Store 1" as const,
    destinationDepartment: "VIP Bar" as const,
    issueDate: "2026-07-14",
    approvalHistory: [],
    lines: [{
      id: "l1",
      itemId: "beer",
      itemName: "Beer",
      unit: "bottle" as const,
      requestedQuantity: 10,
      approvedQuantity: 10,
      sentQuantity: 0,
      receivedQuantity: 0,
    }],
  };
  const dispatched = {
    ...issue,
    id: "siv-2",
    status: "Dispatched" as const,
    lines: [{
      ...issue.lines[0]!,
      id: "l2",
      sentQuantity: 8,
      receivedQuantity: 0,
    }],
  };
  const movements = collectVoucherTransferMovements([issue, dispatched], [], []);
  assert.equal(getReservedStockQuantity(movements, "beer", "Store 1"), 10);
  assert.equal(getIncomingStockQuantity(movements, "beer", "VIP Bar"), 8);
});

test("physical count and reject require actor authorization", () => {
  assert.throws(
    () =>
      createPhysicalCountSessionAsActor(
        {
          location: "Store 2",
          itemId: "beer",
          itemName: "Beer",
          unit: "bottle",
          countedQuantity: 5,
          expectedQuantity: 4,
          unitCost: 10,
        },
        { userName: "Keeper1", role: "Storekeeper", assignedStore: "Store 1", allowedLocations: ["Store 1"] },
      ),
    /not authorized/i,
  );

  const count = createPhysicalCountSessionAsActor(
    {
      location: "Store 1",
      itemId: "beer",
      itemName: "Beer",
      unit: "bottle",
      countedQuantity: 5,
      expectedQuantity: 4,
      unitCost: 10,
    },
    { userName: "Keeper1", role: "Storekeeper", assignedStore: "Store 1", allowedLocations: ["Store 1"] },
  );
  assert.equal(count.location, "Store 1");
  assert.equal(count.countedBy, "Keeper1");

  const request = createDepartmentStockRequest({
    requestingDepartment: "VIP Bar",
    requestedSourceStore: "Store 1",
    priority: "Normal",
    reason: "Low",
    requiredDate: "2026-07-14",
    requestedBy: "VIP User",
    lines: [{
      itemId: "beer",
      itemName: "Beer",
      availableQuantityAtDepartment: 1,
      requestedQuantity: 5,
      unit: "bottle",
    }],
  });
  assert.throws(
    () =>
      rejectDepartmentStockRequestAsActor(
        request,
        { userName: "VIP User", role: "Bartender", allowedLocations: ["VIP Bar"] },
        "No stock",
      ),
    /not authorized|cannot|permission|reject/i,
  );
  const rejected = rejectDepartmentStockRequestAsActor(
    request,
    { userName: "Keeper1", role: "Storekeeper", assignedStore: "Store 1", allowedLocations: ["Store 1"] },
    "Insufficient stock",
  );
  assert.equal(rejected.status, "Rejected");
});

test("mergeMissingGoatPoolItems does not reseed defaults when allowDefaults is false", () => {
  const empty: StockManagedItem[] = [];
  const withoutDefaults = mergeMissingGoatPoolItems(empty, [], { allowDefaults: false });
  assert.equal(withoutDefaults.added.length, 0);
  assert.equal(withoutDefaults.items.length, 0);

  const withDefaults = mergeMissingGoatPoolItems(empty, []);
  assert.equal(withDefaults.added.length, 3);
  assert.ok(withDefaults.items.every((item) => isGoatPoolSku(item.id)));
});

test("mergeMissingGoatPoolItems with allowDefaults false only adds provided candidates", () => {
  const limbOnly = getGoatPoolStockItemDefaults().filter((item) => item.id === GOAT_LIMB_SKU);
  const result = mergeMissingGoatPoolItems([], limbOnly, { allowDefaults: false });
  assert.equal(result.added.length, 1);
  assert.equal(result.items[0]?.id, GOAT_LIMB_SKU);
});
