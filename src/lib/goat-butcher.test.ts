import assert from "node:assert/strict";
import test from "node:test";

import type { MenuItem, SalesRecord } from "./demo-data";
import {
  buildGoatRegistrationReport,
  GOAT_REGISTRATION_LOCATION,
  type GoatRegistration,
} from "./goat-butcher";
import {
  getGoatPoolStockItemDefaults,
  GOAT_LIMB_SKU,
  type StockLedgerEntry,
  type StockLot,
} from "./stock-management";

function sale(partial: Partial<SalesRecord> & Pick<SalesRecord, "productName" | "qty" | "revenue">): SalesRecord {
  return {
    id: partial.id ?? `sale-${Math.random().toString(36).slice(2, 7)}`,
    date: partial.date ?? "2026-07-24",
    month: "2026-07",
    time: "12:00",
    orderId: partial.orderId,
    receiptNumber: "R1",
    productId: partial.productId,
    productName: partial.productName,
    category: "Meat",
    station: partial.station ?? "Butcher",
    qty: partial.qty,
    unitPrice: partial.unitPrice ?? partial.revenue,
    unitCost: 0,
    revenue: partial.revenue,
    expense: 0,
    profit: partial.revenue,
    area: "Main",
    tableNumber: "T1",
    waiter: "W",
    cashier: "C",
    paymentMethod: "Cash",
  };
}

const items = getGoatPoolStockItemDefaults();

const registration: GoatRegistration = {
  id: "goat-1",
  documentNo: "GOAT-2026-00001",
  registeredAt: "2026-07-24T08:00:00.000Z",
  registeredBy: "Butcher",
  goatType: "Local",
  supplierName: "",
  purchasePrice: 15000,
  frontLegKg: 10,
  backLegKg: 12,
  limbKg: 22,
  insidePartsKg: 0,
  boneKg: 0,
  wasteKg: 0,
  location: GOAT_REGISTRATION_LOCATION,
  status: "active",
  referenceNo: "GOAT-REF-1",
};

test("pool sales uses menu stockSku for custom goat menu ids", () => {
  const menuItems: MenuItem[] = [
    {
      id: "m-custom-shekla",
      name_en: "House Shekla",
      name_am: "",
      category: "Meat",
      price: 4000,
      cost: 1000,
      station: "Butcher",
      emoji: "",
      stockSku: GOAT_LIMB_SKU,
    },
  ];

  const salesRecords = [
    sale({
      id: "sr-1",
      orderId: "ord-1",
      productId: "m-custom-shekla",
      productName: "House Shekla",
      qty: 1,
      revenue: 4000,
    }),
  ];

  const ledger: StockLedgerEntry[] = [
    {
      id: "led-1",
      type: "POS_CONSUMPTION",
      date: "2026-07-24",
      itemId: GOAT_LIMB_SKU,
      itemName: "Goat Limb Meat (Front+Back)",
      category: "Meat",
      location: GOAT_REGISTRATION_LOCATION,
      quantity: 1,
      unit: "kg",
      totalCost: 1000,
      enteredBy: "POS",
      notes: "Auto deduction from POS order ORD-1: House Shekla",
      referenceNo: "POS-ord-1",
      batchNumber: "GOAT-REF-1-LIMB",
    },
  ];

  const lots: StockLot[] = [
    {
      id: "lot-1",
      itemId: GOAT_LIMB_SKU,
      itemName: "Goat Limb Meat (Front+Back)",
      location: GOAT_REGISTRATION_LOCATION,
      quantity: 21,
      unit: "kg",
      unitCost: 1000,
      batchNumber: "GOAT-REF-1-LIMB",
      referenceNo: "GOAT-REF-1",
      receivedAt: "2026-07-24T08:00:00.000Z",
      status: "Available",
    },
  ];

  const report = buildGoatRegistrationReport({
    registrations: [registration],
    lots,
    ledger,
    salesRecords,
    items,
    menuItems,
  });

  const limbPool = report.poolSummaries.find((row) => row.poolSku === GOAT_LIMB_SKU);
  assert.equal(limbPool?.soldKg, 1);
  assert.equal(limbPool?.salesBirr, 4000);
  assert.equal(report.rows[0]?.salesBirr, 4000);
  assert.equal(report.totalSalesBirr, 4000);
});

test("pool sales matches POS-consumed line even without classic shekla id", () => {
  const salesRecords = [
    sale({
      id: "sr-2",
      orderId: "ord-2",
      productId: "m-random",
      productName: "Goat Limb Meat (Front+Back)",
      qty: 1,
      revenue: 3500,
    }),
  ];

  const ledger: StockLedgerEntry[] = [
    {
      id: "led-2",
      type: "POS_CONSUMPTION",
      date: "2026-07-24",
      itemId: GOAT_LIMB_SKU,
      itemName: "Goat Limb Meat (Front+Back)",
      category: "Meat",
      location: GOAT_REGISTRATION_LOCATION,
      quantity: 1,
      unit: "kg",
      totalCost: 1000,
      enteredBy: "POS",
      notes: "Auto deduction from POS order ORD-2: Goat Limb Meat (Front+Back)",
      referenceNo: "POS-ord-2",
      batchNumber: "GOAT-REF-1-LIMB",
    },
  ];

  const report = buildGoatRegistrationReport({
    registrations: [registration],
    lots: [],
    ledger,
    salesRecords,
    items,
  });

  const limbPool = report.poolSummaries.find((row) => row.poolSku === GOAT_LIMB_SKU);
  assert.equal(limbPool?.salesBirr, 3500);
  assert.equal(report.totalSalesBirr, 3500);
});
