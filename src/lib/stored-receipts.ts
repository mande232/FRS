import type {
  Order,
  OrderLine,
  OrderPayment,
  OrderReceipt,
  PaymentStatus,
  SeatingArea,
} from "./demo-data.ts";
import { EMPTY_MODULE_RECORDS, useModuleRecords } from "./module-records.ts";

export const STORED_RECEIPTS_MODULE_KEY = "pos-stored-receipts";

export type StoredReceiptLine = {
  name: string;
  qty: number;
  unitPrice: number;
  unitLabel?: string;
  station: string;
};

export type StoredReceipt = {
  id: string;
  orderId: string;
  orderNo: string;
  ref: string;
  area: string;
  tableNumber: string;
  waiter: string;
  items: StoredReceiptLine[];
  receipt: OrderReceipt;
  payment?: OrderPayment;
  paymentStatus: PaymentStatus;
  returnReason?: string;
  storedAt: string;
  updatedAt: string;
};

export function buildStoredReceiptFromOrder(order: Order, receipt: OrderReceipt): StoredReceipt {
  const now = receipt.generatedAt || new Date().toISOString();
  return {
    id: receipt.receiptNumber,
    orderId: order.id,
    orderNo: order.orderNo,
    ref: order.ref,
    area: order.area,
    tableNumber: order.tableNumber,
    waiter: order.waiter?.trim() || order.orderedByWaiter?.trim() || "Unassigned",
    items: order.items.map((line) => ({
      name: line.name,
      qty: line.qty,
      unitPrice: line.unitPrice ?? 0,
      unitLabel: line.unitLabel,
      station: line.station,
    })),
    receipt,
    payment: order.payment,
    paymentStatus: receipt.paymentStatus,
    storedAt: now,
    updatedAt: now,
  };
}

export function upsertStoredReceipt(list: StoredReceipt[], next: StoredReceipt): StoredReceipt[] {
  const index = list.findIndex((row) => row.id === next.id || row.orderId === next.orderId);
  if (index === -1) return [next, ...list];
  return list.map((row, i) =>
    i === index
      ? {
          ...row,
          ...next,
          storedAt: row.storedAt,
          updatedAt: next.updatedAt,
        }
      : row,
  );
}

export function orderFromStoredReceipt(stored: StoredReceipt): Order {
  const items: OrderLine[] = stored.items.map((line) => ({
    name: line.name,
    qty: line.qty,
    unitPrice: line.unitPrice,
    unitLabel: line.unitLabel,
    station: line.station,
  }));
  return {
    id: stored.orderId,
    orderNo: stored.orderNo,
    source: "Dine-in",
    ref: stored.ref,
    area: stored.area as SeatingArea,
    tableNumber: stored.tableNumber,
    orderedByWaiter: stored.waiter,
    waiter: stored.waiter,
    enteredByCashier: stored.receipt.generatedBy,
    items,
    stationTickets: [],
    sentAt: stored.receipt.generatedAt,
    status: stored.paymentStatus === "Paid" ? "CLOSED" : "RECEIPT_GENERATED",
    paymentStatus: stored.paymentStatus,
    openedMin: 0,
    total: stored.receipt.grandTotal,
    receipt: stored.receipt,
    receiptNumber: stored.receipt.receiptNumber,
    receiptGeneratedAt: stored.receipt.generatedAt,
    receiptGeneratedBy: stored.receipt.generatedBy,
    payment: stored.payment,
  };
}

export function useStoredReceiptsModule() {
  return useModuleRecords<StoredReceipt>(STORED_RECEIPTS_MODULE_KEY, EMPTY_MODULE_RECORDS);
}
