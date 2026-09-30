import test from "node:test";
import assert from "node:assert/strict";

import type { Order } from "./demo-data";
import { ensurePosStockDeductedWithFallback, mapOrderLinesForStock } from "./pos-stock-close";
import {
  STOCK_ITEMS_SEED,
  STOCK_LEDGER_SEED,
  getGoatPoolStockItemDefaults,
  orderHasPosStockDeduction,
  type StockLedgerEntry,
} from "./stock-management";

const today = new Date().toISOString().slice(0, 10);

function paidOrder(overrides: Partial<Order> = {}): Order {
  return {
    id: "o-bulk-1",
    orderNo: "ORD-BULK-1",
    source: "Dine-in",
    ref: "T1",
    area: "VIP",
    tableNumber: "V1",
    orderedByWaiter: "Hanna Tadesse",
    waiter: "Hanna Tadesse",
    enteredByCashier: "Genet Tilahun",
    items: [
      {
        name: "Habesha Beer",
        qty: 2,
        stockSku: "stk-beer-habesha",
        station: "VIP Bar",
        stockDeductionLocation: "VIP Bar",
      },
    ],
    stationTickets: [],
    sentAt: `${today} 09:00 AM`,
    status: "RECEIPT_GENERATED",
    paymentStatus: "Paid",
    openedMin: 10,
    total: 300,
    ...overrides,
  };
}

test("mapOrderLinesForStock resolves VIP Bar deduction location from station", () => {
  const lines = mapOrderLinesForStock(paidOrder());
  assert.equal(lines[0]?.stockDeductionLocation, "VIP Bar");
  assert.equal(lines[0]?.station, "VIP Bar");
});

test("mapOrderLinesForStock preserves pour unit labels for spirit deductions", () => {
  const lines = mapOrderLinesForStock(
    paidOrder({
      items: [
        {
          name: "Amarula",
          qty: 1,
          unitLabel: "Double Shot",
          stockSku: "stk-amarula",
          menuItemId: "amarula",
          station: "VIP Bar",
          stockDeductionLocation: "VIP Bar",
        },
      ],
    }),
  );
  assert.equal(lines[0]?.unitLabel, "Double Shot");
});

test("ensurePosStockDeductedWithFallback deducts spirit pours in shot units", () => {
  const vipOpening: StockLedgerEntry[] = [
    {
      id: "sled-vip-amarula",
      type: "OPENING_BALANCE",
      date: today,
      itemId: "stk-amarula",
      itemName: "Amarula",
      category: "Whisky",
      location: "VIP Bar",
      quantity: 6,
      unit: "bottle",
      totalCost: 66000,
      enteredBy: "System",
      immutable: true,
    },
  ];
  const amarula = STOCK_ITEMS_SEED.find((item) => item.id === "stk-amarula");
  assert.ok(amarula);

  const result = ensurePosStockDeductedWithFallback({
    order: paidOrder({
      id: "o-spirit-amarula",
      orderNo: "ORD-SPIRIT-1",
      items: [
        {
          name: "Amarula",
          qty: 1,
          unitLabel: "Double Shot",
          stockSku: "stk-amarula",
          menuItemId: "amarula",
          station: "VIP Bar",
          stockDeductionLocation: "VIP Bar",
        },
      ],
    }),
    enteredBy: "Genet Tilahun",
    posDeductionTiming: "payment_completed",
    events: ["payment_completed"],
    items: STOCK_ITEMS_SEED,
    recipes: [],
    ledger: vipOpening,
    reservations: [],
  });

  const consumption = result.ledger.filter((entry) => entry.type === "POS_CONSUMPTION");
  assert.equal(consumption.length, 1);
  assert.equal(consumption[0]?.unit, "double shot");
  assert.equal(consumption[0]?.quantity, 1);
});

test("ensurePosStockDeductedWithFallback posts POS_CONSUMPTION once for bulk-close style order_closed", () => {
  const vipOpening: StockLedgerEntry[] = [
    {
      id: "sled-vip-bulk",
      type: "TRANSFER_IN",
      date: today,
      itemId: "stk-beer-habesha",
      itemName: "Habesha Beer",
      category: "Beer",
      location: "VIP Bar",
      fromLocation: "Store 1",
      toLocation: "VIP Bar",
      quantity: 20,
      quantityIn: 20,
      quantityOut: 0,
      unit: "bottle",
      totalCost: 1400,
      enteredBy: "System",
      immutable: true,
    },
  ];

  const result = ensurePosStockDeductedWithFallback({
    order: paidOrder(),
    enteredBy: "Genet Tilahun",
    posDeductionTiming: "item_ready",
    events: ["order_closed"],
    items: STOCK_ITEMS_SEED,
    recipes: [],
    ledger: vipOpening,
    reservations: [],
  });

  assert.ok(result.order.stockDeductedAt);
  assert.equal(orderHasPosStockDeduction(result.ledger, "o-bulk-1"), true);
  const consumption = result.ledger.filter((entry) => entry.type === "POS_CONSUMPTION");
  assert.equal(consumption.length, 1);
  assert.equal(consumption[0]?.location, "VIP Bar");
  assert.equal(consumption[0]?.quantity, 2);
  assert.ok(consumption.every((entry) => entry.location !== "Store 1" && entry.location !== "Store 2"));
});

test("ensurePosStockDeductedWithFallback is idempotent when order already deducted", () => {
  const first = ensurePosStockDeductedWithFallback({
    order: paidOrder(),
    enteredBy: "Genet Tilahun",
    posDeductionTiming: "order_closed",
    events: ["order_closed"],
    items: STOCK_ITEMS_SEED,
    recipes: [],
    ledger: [
      ...STOCK_LEDGER_SEED,
      {
        id: "sled-vip-repeat",
        type: "TRANSFER_IN",
        date: today,
        itemId: "stk-beer-habesha",
        itemName: "Habesha Beer",
        category: "Beer",
        location: "VIP Bar",
        quantity: 20,
        quantityIn: 20,
        quantityOut: 0,
        unit: "bottle",
        totalCost: 1400,
        enteredBy: "System",
        immutable: true,
      },
    ],
    reservations: [],
  });

  const second = ensurePosStockDeductedWithFallback({
    order: first.order,
    enteredBy: "Genet Tilahun",
    posDeductionTiming: "order_closed",
    events: ["order_closed"],
    items: STOCK_ITEMS_SEED,
    recipes: [],
    ledger: first.ledger,
    reservations: first.reservations,
  });

  assert.equal(
    second.ledger.filter((entry) => entry.type === "POS_CONSUMPTION" && entry.referenceNo?.includes("o-bulk-1")).length,
    first.ledger.filter((entry) => entry.type === "POS_CONSUMPTION" && entry.referenceNo?.includes("o-bulk-1")).length,
  );
});

test("bulk close simulation deducts each paid order exactly once", () => {
  const item = { ...STOCK_ITEMS_SEED.find((row) => row.id === "stk-beer-habesha")!, currentStock: 0 };
  let ledger: StockLedgerEntry[] = [
    {
      id: "sled-vip-bulk-2",
      type: "TRANSFER_IN",
      date: today,
      itemId: item.id,
      itemName: item.name,
      category: item.category,
      location: "VIP Bar",
      fromLocation: "Store 1",
      toLocation: "VIP Bar",
      quantity: 50,
      quantityIn: 50,
      quantityOut: 0,
      unit: "bottle",
      totalCost: 3500,
      enteredBy: "System",
      immutable: true,
    },
  ];

  const orders = [
    paidOrder({ id: "o-bulk-a", orderNo: "ORD-A" }),
    paidOrder({
      id: "o-bulk-b",
      orderNo: "ORD-B",
      items: [
        {
          name: "Habesha Beer",
          qty: 1,
          stockSku: item.id,
          station: "VIP Bar",
          stockDeductionLocation: "VIP Bar",
        },
      ],
    }),
  ];

  for (const order of orders) {
    const result = ensurePosStockDeductedWithFallback({
      order,
      enteredBy: "Genet Tilahun",
      posDeductionTiming: "order_closed",
      events: ["order_closed"],
      items: [item],
      recipes: [],
      ledger,
      reservations: [],
    });
    ledger = result.ledger;
    assert.equal(
      ledger.some(
        (entry) =>
          entry.type === "POS_CONSUMPTION" &&
          entry.referenceNo === `POS-${order.id}` &&
          entry.location === "VIP Bar",
      ),
      true,
      `expected deduction for ${order.id}`,
    );
  }

  assert.equal(ledger.filter((entry) => entry.type === "POS_CONSUMPTION").length, 2);
  assert.ok(ledger.every((entry) => entry.location === "VIP Bar"));
});

test("mapOrderLinesForStock prefers Butcher over Kitchen final-station for kilo meat", () => {
  const lines = mapOrderLinesForStock(
    paidOrder({
      items: [
        {
          name: "Collection Yefyel",
          qty: 1,
          stockSku: "stk-collection-yefyel",
          menuItemId: "collection-yefyel",
          station: "Butcher House",
          finalStation: "Kitchen",
          stockDeductionLocation: "Kitchen",
        },
      ],
    }),
  );
  assert.equal(lines[0]?.stockDeductionLocation, "Butcher");
  assert.equal(lines[0]?.station, "Butcher House");
});

test("Collection Yefyel POS deducts goat inside pool even with obsolete stockSku", () => {
  const goatItems = getGoatPoolStockItemDefaults();
  const inside = goatItems.find((item) => item.id === "stk-goat-inside-parts")!;
  const items = [...STOCK_ITEMS_SEED, ...goatItems];

  const butcherStock: StockLedgerEntry[] = [
    {
      id: "sled-goat-inside-open",
      type: "GOAT_REGISTRATION",
      date: today,
      itemId: "stk-goat-inside-parts",
      itemName: inside.name,
      category: "Meat",
      location: "Butcher",
      quantity: 30,
      quantityIn: 30,
      quantityOut: 0,
      unit: "kg",
      totalCost: 3000,
      enteredBy: "System",
      immutable: true,
      referenceNo: "GOAT-GOAT-2026-SEED01",
      batchNumber: "GOAT-GOAT-2026-SEED01-INSIDE",
    },
  ];

  const result = ensurePosStockDeductedWithFallback({
    order: paidOrder({
      id: "o-yefyel-1",
      orderNo: "ORD-YEFYEL-1",
      items: [
        {
          name: "Collection Yefyel",
          qty: 1.5,
          // Obsolete 024 SKU — must still resolve via menuItemId → goat inside pool
          stockSku: "stk-collection-yefyel",
          menuItemId: "collection-yefyel",
          station: "Butcher House",
          finalStation: "Kitchen",
          stockDeductionLocation: "Kitchen",
        },
      ],
    }),
    enteredBy: "Genet Tilahun",
    posDeductionTiming: "order_closed",
    events: ["order_closed"],
    items,
    recipes: [],
    ledger: butcherStock,
    reservations: [],
  });

  assert.ok(result.order.stockDeductedAt, "expected stockDeductedAt");
  assert.deepEqual(result.skippedItems, []);
  const consumption = result.ledger.filter(
    (entry) => entry.type === "POS_CONSUMPTION" && entry.referenceNo === "POS-o-yefyel-1",
  );
  assert.equal(consumption.length, 1);
  assert.equal(consumption[0]?.itemId, "stk-goat-inside-parts");
  assert.equal(consumption[0]?.location, "Butcher");
  assert.equal(consumption[0]?.quantity, 1.5);
});
