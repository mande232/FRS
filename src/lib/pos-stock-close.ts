import type { Order } from "./demo-data";
import {
  consumePosReservations,
  createPosStockDeductionEntries,
  orderHasPosStockDeduction,
  shouldDeductPosStock,
  stationToOperationalLocation,
  STOCK_LOTS_SEED,
  STOCK_MODULE_KEYS,
  type OperationalStockLocation,
  type PosDeductionTiming,
  type PosStockReservation,
  type StockLedgerEntry,
  type StockLot,
  type StockManagedItem,
  type StockRecipe,
} from "./stock-management";
import { getModuleRecordsSnapshot } from "./module-records";
import { isPosMenuStockDisconnected } from "./system-settings";

export { isPosMenuStockDisconnected };

export type PosStockCloseEvent = Extract<
  PosDeductionTiming,
  "payment_completed" | "order_closed"
>;

export function mapOrderLinesForStock(order: Order) {
  return order.items.map((item) => {
    const prepStation = item.station;
    const finalStation = item.finalStation;
    const prepLoc = stationToOperationalLocation(prepStation);
    const finalLoc = stationToOperationalLocation(finalStation || prepStation);
    // Prefer prep station for stock. Kilo meat uses Kitchen as final KDS hop only.
    let stockDeductionLocation =
      (item.stockDeductionLocation as OperationalStockLocation | undefined) ??
      prepLoc ??
      finalLoc ??
      undefined;
    if (stockDeductionLocation === "Kitchen" && prepLoc === "Butcher") {
      stockDeductionLocation = "Butcher";
    }
    if (
      !stockDeductionLocation &&
      (item.stockSku?.startsWith("stk-goat-") || item.stockSku === "stk-beef-prime")
    ) {
      stockDeductionLocation = "Butcher";
    }
    return {
      name: item.name,
      qty: item.qty,
      unitLabel: item.unitLabel,
      stockSku: item.stockSku,
      menuItemId: item.menuItemId,
      stockDeductionLocation,
      station: prepStation || finalStation,
    };
  });
}

function skippedLineNames(order: Order, entries: StockLedgerEntry[]) {
  const skipped: string[] = [];
  order.items.forEach((line) => {
    const wasDeducted = entries.some((entry) => entry.notes?.includes(`: ${line.name}`));
    if (!wasDeducted) skipped.push(line.name);
  });
  return skipped;
}

function applyPosDeductionAtEvent(
  order: Order,
  enteredBy: string,
  items: StockManagedItem[],
  recipes: StockRecipe[],
  ledger: StockLedgerEntry[],
  reservations: PosStockReservation[],
  lots: StockLot[],
) {
  if (order.stockDeductedAt || orderHasPosStockDeduction(ledger, order.id)) {
    return {
      order,
      skippedItems: [] as string[],
      ledger,
      reservations,
      lots,
      deducted: false,
    };
  }

  const closedAt = new Date().toISOString();
  const lotState = { lots: [...lots] };
  const posLedgerEntries = createPosStockDeductionEntries(
    {
      orderId: order.id,
      orderNo: order.orderNo,
      closedAt,
      enteredBy,
      skipIfAlreadyDeducted: true,
      lines: mapOrderLinesForStock(order),
    },
    items,
    recipes,
    ledger,
    lotState,
  );

  let nextLedger = ledger;
  if (posLedgerEntries.length > 0) {
    nextLedger = [...posLedgerEntries, ...ledger];
  }

  let nextReservations = reservations;
  const consumed = consumePosReservations(reservations, order.id);
  if (consumed.changed > 0) {
    nextReservations = consumed.reservations;
  }

  const nextOrder =
    posLedgerEntries.length > 0
      ? {
          ...order,
          stockDeductedAt: closedAt,
          items: order.items.map((item) => ({ ...item, stockDeducted: true })),
        }
      : order;

  return {
    order: nextOrder,
    skippedItems: skippedLineNames(order, posLedgerEntries),
    ledger: nextLedger,
    reservations: nextReservations,
    lots: lotState.lots,
    deducted: posLedgerEntries.length > 0,
  };
}

/** Deduct POS stock on close with configured timing events plus a one-time safety-net fallback. */
export function ensurePosStockDeductedWithFallback(input: {
  order: Order;
  enteredBy: string;
  posDeductionTiming: PosDeductionTiming;
  events: PosStockCloseEvent[];
  items: StockManagedItem[];
  recipes: StockRecipe[];
  ledger: StockLedgerEntry[];
  reservations: PosStockReservation[];
  lots?: StockLot[];
}) {
  let workingOrder = input.order;
  let ledger = input.ledger;
  let reservations = input.reservations;
  let lots = input.lots ?? [];
  let skippedItems: string[] = [];

  for (const event of input.events) {
    if (!shouldDeductPosStock(input.posDeductionTiming, event)) continue;
    const result = applyPosDeductionAtEvent(
      workingOrder,
      input.enteredBy,
      input.items,
      input.recipes,
      ledger,
      reservations,
      lots,
    );
    workingOrder = result.order;
    ledger = result.ledger;
    reservations = result.reservations;
    lots = result.lots;
    skippedItems = [...new Set([...skippedItems, ...result.skippedItems])];
  }

  if (
    !workingOrder.stockDeductedAt &&
    !orderHasPosStockDeduction(ledger, workingOrder.id)
  ) {
    const lotState = { lots: [...lots] };
    const fallbackEntries = createPosStockDeductionEntries(
      {
        orderId: workingOrder.id,
        orderNo: workingOrder.orderNo,
        closedAt: new Date().toISOString(),
        enteredBy: input.enteredBy,
        skipIfAlreadyDeducted: true,
        lines: mapOrderLinesForStock(workingOrder),
      },
      input.items,
      input.recipes,
      ledger,
      lotState,
    );
    skippedItems = skippedLineNames(workingOrder, fallbackEntries);
    if (fallbackEntries.length > 0) {
      ledger = [...fallbackEntries, ...ledger];
      lots = lotState.lots;
      workingOrder = {
        ...workingOrder,
        stockDeductedAt: new Date().toISOString(),
        items: workingOrder.items.map((item) => ({ ...item, stockDeducted: true })),
      };
    }
  }

  if (workingOrder.stockDeductedAt) {
    const consumed = consumePosReservations(reservations, workingOrder.id);
    if (consumed.changed > 0) {
      reservations = consumed.reservations;
    }
  }

  return {
    order: workingOrder,
    skippedItems,
    ledger,
    reservations,
    lots,
  };
}

export function readPosStockLotsSnapshot(): StockLot[] {
  return getModuleRecordsSnapshot<StockLot>(STOCK_MODULE_KEYS.lots, STOCK_LOTS_SEED);
}
