import type {
  Customer,
  ExpenseRecord,
  MenuItem,
  Order,
  PaymentLedgerEntry,
  PurchaseOrder,
  Reservation,
  SalesRecord,
  Table,
  StockItem,
  Supplier,
} from "../demo-data";
import { normalizeRestaurantProfile, type RestaurantProfile } from "../brand";
import type { GuestOrderRequest } from "../guest-ordering";
import { getSupabaseAdmin } from "./staff-admin.server";

export type PosPersistenceInput = {
  accessToken: string;
  menuItems?: MenuItem[];
  menuCategories?: string[];
  tables?: Table[];
  orders?: Order[];
  stations?: string[];
  stock?: StockItem[];
  suppliers?: Supplier[];
  reservations?: Reservation[];
  customers?: Customer[];
  payments?: PaymentLedgerEntry[];
  salesRecords?: SalesRecord[];
  expenseRecords?: ExpenseRecord[];
  purchaseOrders?: PurchaseOrder[];
  guestOrderRequests?: GuestOrderRequest[];
  restaurantProfile?: RestaurantProfile;
};

function nullable<T>(value: T | null | undefined) {
  return value ?? null;
}

function isMissingColumnError(error: unknown, columnName: string) {
  if (!error || typeof error !== "object") return false;
  const value = error as { code?: string; message?: string; details?: string };
  const needle = columnName.toLowerCase();
  const haystack = `${value.message ?? ""} ${value.details ?? ""}`.toLowerCase();
  return haystack.includes(needle) || value.code === "42703" || value.code === "PGRST204";
}

function menuItemToRow(item: MenuItem, options?: { includeOptional?: boolean }) {
  const row: Record<string, unknown> = {
    id: item.id,
    name_en: item.name_en,
    name_am: item.name_am ?? "",
    category: item.category,
    price: item.price,
    cost: item.cost,
    station: item.station,
    emoji: item.emoji ?? "",
    veg: Boolean(item.veg),
    active: true,
    updated_at: new Date().toISOString(),
  };
  if (options?.includeOptional === false) return row;
  row.vip_price = item.vipPrice ?? null;
  row.single_price = item.singlePrice ?? null;
  row.double_price = item.doublePrice ?? null;
  row.half_bottle_price = item.halfBottlePrice ?? null;
  row.pricing_mode = item.pricingMode === "kg" ? "kg" : "unit";
  row.unit_label = item.unitLabel ?? null;
  row.default_qty = item.defaultQty ?? 1;
  row.qty_step = item.qtyStep ?? 1;
  row.stock_sku = item.stockSku ?? "";
  return row;
}

function stripMenuItemOptionalColumns(row: Record<string, unknown>, error: unknown) {
  const next = { ...row };
  const optionalColumns = [
    "unit_label",
    "vip_price",
    "single_price",
    "double_price",
    "half_bottle_price",
    "pricing_mode",
    "default_qty",
    "qty_step",
    "stock_sku",
  ] as const;
  for (const column of optionalColumns) {
    if (isMissingColumnError(error, column)) delete next[column];
  }
  if (
    !optionalColumns.some((column) => isMissingColumnError(error, column)) &&
    String((error as { message?: string })?.message || "")
      .toLowerCase()
      .includes("schema cache")
  ) {
    delete next.unit_label;
  }
  return next;
}

async function upsertMenuItemRows(rows: Record<string, unknown>[] | undefined) {
  if (!rows?.length) return;
  const admin = getSupabaseAdmin();
  const attempt = async (payload: Record<string, unknown>[]) => {
    const { error } = await admin.from("menu_items").upsert(payload, { onConflict: "id" });
    return error;
  };

  let error = await attempt(rows);
  if (!error) return;

  const stripped = rows.map((row) => stripMenuItemOptionalColumns(row, error));
  error = await attempt(stripped);
  if (!error) return;

  const coreOnly = rows.map((row) => ({
    id: row.id,
    name_en: row.name_en,
    name_am: row.name_am ?? "",
    category: row.category,
    price: row.price,
    cost: row.cost,
    station: row.station,
    emoji: row.emoji ?? "",
    veg: Boolean(row.veg),
    active: true,
    updated_at: row.updated_at ?? new Date().toISOString(),
  }));
  error = await attempt(coreOnly);
  if (error) throw error;
}

function menuCategoryRows(categories: string[]) {
  return categories
    .map((category) => category.trim())
    .filter(Boolean)
    .filter(
      (category, index, list) =>
        list.findIndex((item) => item.toLowerCase() === category.toLowerCase()) === index,
    )
    .map((name, position) => ({
      name,
      position,
      active: true,
      updated_at: new Date().toISOString(),
    }));
}

function tableToRow(table: Table) {
  return {
    id: table.id,
    label: table.label,
    seats: table.seats,
    area: table.area,
    status: table.status,
    guests: nullable(table.guests),
    server: nullable(table.server),
    open_min: nullable(table.openMin),
    total: nullable(table.total),
    active: true,
    updated_at: new Date().toISOString(),
  };
}

function orderToRow(order: Order) {
  return {
    id: order.id,
    order_no: order.orderNo,
    source: order.source,
    ref: order.ref,
    customer_name: nullable(order.customerName),
    area: order.area,
    table_number: order.tableNumber,
    ordered_by_waiter: order.orderedByWaiter,
    waiter: order.waiter,
    entered_by_cashier: order.enteredByCashier,
    server: nullable(order.server),
    items: order.items,
    station_tickets: order.stationTickets,
    sent_at: order.sentAt,
    requested_at: nullable(order.requestedAt),
    cashier_accepted_at: nullable(order.cashierAcceptedAt),
    station_sent_at: nullable(order.stationSentAt),
    status: order.status,
    payment_status: order.paymentStatus,
    opened_min: order.openedMin,
    total: order.total,
    receipt: order.receipt ?? null,
    receipt_number: nullable(order.receiptNumber),
    receipt_generated_at: nullable(order.receiptGeneratedAt),
    receipt_generated_by: nullable(order.receiptGeneratedBy),
    locked_for_editing: nullable(order.lockedForEditing),
    manager_authorized_changes_by: nullable(order.managerAuthorizedChangesBy),
    manager_authorized_changes_at: nullable(order.managerAuthorizedChangesAt),
    payment_received_at: nullable(order.paymentReceivedAt),
    closed_by_cashier: nullable(order.closedByCashier),
    cancelled_at: nullable(order.cancelledAt),
    cancelled_by: nullable(order.cancelledBy),
    void_requested_by: nullable(order.voidRequestedBy),
    void_requested_at: nullable(order.voidRequestedAt),
    void_reason: nullable(order.voidReason),
    payment: order.payment ?? null,
    waiter_transfers: order.waiterTransfers ?? [],
    waiter_transfer_requested_to: nullable(order.waiterTransferRequestedTo),
    waiter_transfer_requested_by: nullable(order.waiterTransferRequestedBy),
    waiter_transfer_requested_at: nullable(order.waiterTransferRequestedAt),
    table_cleared_at: nullable(order.tableClearedAt),
    table_cleared_by: nullable(order.tableClearedBy),
    bono_print_count: order.bonoPrintCount ?? 0,
    bono_last_printed_at: nullable(order.bonoLastPrintedAt),
    bono_last_printed_by: nullable(order.bonoLastPrintedBy),
    updated_at: new Date().toISOString(),
  };
}

const OPTIONAL_ORDER_COLUMNS = [
  "return_requested_lines",
  "waiter_transfers",
  "waiter_transfer_requested_to",
  "waiter_transfer_requested_by",
  "waiter_transfer_requested_at",
  "table_cleared_at",
  "table_cleared_by",
  "bono_print_count",
  "bono_last_printed_at",
  "bono_last_printed_by",
] as const;

async function upsertOrderRows(rows: Record<string, unknown>[] | undefined) {
  if (!rows?.length) return;
  const admin = getSupabaseAdmin();
  let payload = rows;
  for (let attempt = 0; attempt < OPTIONAL_ORDER_COLUMNS.length + 1; attempt += 1) {
    const { error } = await admin.from("orders").upsert(payload, { onConflict: "id" });
    if (!error) return;
    const haystack = `${(error as { message?: string }).message ?? ""} ${(error as { details?: string }).details ?? ""}`.toLowerCase();
    const strip = OPTIONAL_ORDER_COLUMNS.filter((column) => haystack.includes(column));
    const fallback =
      strip.length === 0 &&
      (error.code === "42703" || error.code === "PGRST204" || haystack.includes("schema cache"))
        ? OPTIONAL_ORDER_COLUMNS.filter((column) => column in (payload[0] ?? {}))
        : strip;
    if (fallback.length === 0) throw error;
    payload = payload.map((row) => {
      const next = { ...row };
      for (const column of fallback) delete next[column];
      return next;
    });
  }
}

function stationRows(stations: string[]) {
  return stations
    .map((station) => station.trim())
    .filter(Boolean)
    .filter(
      (station, index, list) =>
        list.findIndex((item) => item.toLowerCase() === station.toLowerCase()) === index,
    )
    .map((name, position) => ({
      name,
      position,
      active: true,
      updated_at: new Date().toISOString(),
    }));
}

function stockToRow(item: StockItem) {
  return {
    sku: item.sku,
    name: item.name,
    unit: item.unit,
    store: item.store,
    on_hand: item.onHand,
    reorder_qty: item.reorder,
    value: item.value,
    supplier: item.supplier,
    active: true,
    updated_at: new Date().toISOString(),
  };
}

function supplierToRow(supplier: Supplier) {
  return {
    id: supplier.id,
    name: supplier.name,
    contact: supplier.contact,
    category: supplier.category,
    outstanding: supplier.outstanding,
    status: supplier.status,
    store: supplier.store === "Store 2" ? "Store 2" : "Store 1",
    active: true,
    updated_at: new Date().toISOString(),
  };
}

function reservationToRow(reservation: Reservation) {
  return {
    id: reservation.id,
    name: reservation.name,
    phone: reservation.phone,
    time: reservation.time,
    party: reservation.party,
    table_ref: reservation.table,
    deposit: reservation.deposit,
    status: reservation.status,
    active: true,
    updated_at: new Date().toISOString(),
  };
}

function customerToRow(customer: Customer) {
  return {
    id: customer.id,
    name: customer.name,
    phone: customer.phone,
    email: nullable(customer.email),
    visits: customer.visits,
    spent: customer.spent,
    tier: customer.tier,
    last_visit: customer.lastVisit,
    points: customer.points,
    feedback: customer.feedback,
    active: true,
    updated_at: new Date().toISOString(),
  };
}

function paymentToRow(payment: PaymentLedgerEntry) {
  return {
    id: payment.id,
    order_id: nullable(payment.orderId),
    ref: payment.ref,
    method: payment.method,
    amount: payment.amount,
    table_ref: payment.table,
    cashier: payment.cashier,
    time: payment.time,
    status: payment.status,
    collected_by_waiter: nullable(payment.collectedByWaiter),
    received_by_cashier: nullable(payment.receivedByCashier),
    amount_received: nullable(payment.amountReceived),
    change_amount: nullable(payment.changeAmount),
    receipt_number: nullable(payment.receiptNumber),
    payment_received_at: nullable(payment.paymentReceivedAt),
    closed_by_cashier: nullable(payment.closedByCashier),
    raw_payment: payment,
  };
}

function recordDataToRow<T extends { id: string }>(record: T) {
  return {
    id: record.id,
    data: record,
    updated_at: new Date().toISOString(),
  };
}

function purchaseOrderToRow(po: PurchaseOrder) {
  return {
    id: po.id,
    supplier: po.supplier,
    sku: po.sku,
    item: po.item,
    qty: po.qty,
    unit: po.unit,
    unit_cost: po.unitCost,
    total: po.total,
    status: po.status,
    date: po.date,
    store: po.store === "Store 2" ? "Store 2" : "Store 1",
    active: true,
    updated_at: new Date().toISOString(),
  };
}

function guestOrderToRow(request: GuestOrderRequest) {
  return {
    id: request.id,
    table_number: request.tableNumber,
    area: request.area,
    waiter: request.waiter,
    status: request.status,
    note: request.note,
    created_at_text: request.createdAt,
    total: request.total,
    items: request.items,
    updated_at: new Date().toISOString(),
  };
}

function restaurantProfileToRow(profile: RestaurantProfile) {
  return {
    module_key: "settings",
    record_id: "restaurant_profile",
    data: normalizeRestaurantProfile(profile),
    position: 0,
    active: true,
    updated_at: new Date().toISOString(),
  };
}

async function upsertRows(
  table: string,
  rows: Record<string, unknown>[] | undefined,
  onConflict: string,
) {
  if (!rows?.length) return;
  const admin = getSupabaseAdmin();
  const { error } = await admin.from(table).upsert(rows, { onConflict });
  if (error) throw error;
}

export async function persistPosRecordsWithServiceRole(input: PosPersistenceInput) {
  const admin = getSupabaseAdmin();
  const { data, error } = await admin.auth.getUser(input.accessToken);
  if (error || !data.user) throw new Error("You must be signed in to persist POS records.");

  // Stations must exist before menu_items (FK). Prefer explicit stations, else derive from items.
  const stationNames = Array.from(
    new Set(
      [
        ...(input.stations ?? []),
        ...(input.menuItems ?? []).map((item) => item.station?.trim() ?? ""),
      ].filter(Boolean),
    ),
  );
  if (stationNames.length > 0) {
    await upsertRows("production_stations", stationRows(stationNames), "name");
  }

  await upsertMenuItemRows(input.menuItems?.map((item) => menuItemToRow(item)));

  await Promise.all([
    upsertRows(
      "menu_categories",
      input.menuCategories ? menuCategoryRows(input.menuCategories) : undefined,
      "name",
    ),
    upsertRows("dining_tables", input.tables?.map(tableToRow), "id"),
    upsertOrderRows(input.orders?.map(orderToRow)),
    upsertRows("stock_items", input.stock?.map(stockToRow), "sku"),
    upsertRows("suppliers", input.suppliers?.map(supplierToRow), "id"),
    upsertRows("reservations", input.reservations?.map(reservationToRow), "id"),
    upsertRows("customers", input.customers?.map(customerToRow), "id"),
    upsertRows("payments_ledger", input.payments?.map(paymentToRow), "id"),
    upsertRows("sales_records", input.salesRecords?.map(recordDataToRow), "id"),
    upsertRows("expense_records", input.expenseRecords?.map(recordDataToRow), "id"),
    upsertRows("purchase_orders", input.purchaseOrders?.map(purchaseOrderToRow), "id"),
    upsertRows("guest_order_requests", input.guestOrderRequests?.map(guestOrderToRow), "id"),
    upsertRows(
      "module_records",
      input.restaurantProfile ? [restaurantProfileToRow(input.restaurantProfile)] : undefined,
      "module_key,record_id",
    ),
  ]);

  return { ok: true };
}
