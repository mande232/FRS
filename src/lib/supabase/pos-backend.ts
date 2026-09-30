import {
  FINAL_ORDER_STATUSES,
  type Customer,
  type ExpenseRecord,
  type MenuItem,
  type Order,
  type PaymentLedgerEntry,
  type PaymentStatus,
  type PurchaseOrder,
  type Reservation,
  type SalesRecord,
  type SeatingArea,
  type StockItem,
  type StationTicketStatus,
  type Supplier,
  type Table,
} from "../demo-data";
import {
  DEFAULT_RESTAURANT_PROFILE,
  normalizeRestaurantProfile,
  type RestaurantProfile,
} from "../brand";
import type { GuestOrderRequest } from "../guest-ordering";
import { isSupabaseConfigured, supabase } from "./client";

type MenuItemRow = {
  id: string;
  name_en: string;
  name_am: string;
  category: string;
  price: number | string;
  vip_price?: number | string | null;
  single_price?: number | string | null;
  double_price?: number | string | null;
  half_bottle_price?: number | string | null;
  cost: number | string;
  station: string;
  emoji: string;
  veg: boolean | null;
  pricing_mode?: string | null;
  unit_label?: string | null;
  default_qty?: number | string | null;
  qty_step?: number | string | null;
  stock_sku?: string | null;
};

type MenuCategoryRow = {
  name: string;
  position: number | null;
};

type TableRow = {
  id: string;
  label: string;
  seats: number;
  area: string;
  status: Table["status"];
  guests: number | null;
  server: string | null;
  open_min: number | null;
  total: number | string | null;
};

type OrderRow = {
  id: string;
  order_no: string;
  source: Order["source"];
  ref: string;
  customer_name: string | null;
  area: string;
  table_number: string;
  ordered_by_waiter: string;
  waiter: string;
  entered_by_cashier: string;
  server: string | null;
  items: unknown;
  station_tickets: unknown;
  sent_at: string;
  requested_at: string | null;
  cashier_accepted_at: string | null;
  station_sent_at: string | null;
  status: Order["status"];
  payment_status: PaymentStatus;
  opened_min: number;
  total: number | string;
  receipt: unknown;
  receipt_number: string | null;
  receipt_generated_at: string | null;
  receipt_generated_by: string | null;
  locked_for_editing: boolean | null;
  manager_authorized_changes_by: string | null;
  manager_authorized_changes_at: string | null;
  payment_received_at: string | null;
  closed_by_cashier: string | null;
  cancelled_at: string | null;
  void_requested_by: string | null;
  void_requested_at: string | null;
  void_reason: string | null;
  cancelled_by: string | null;
  payment: unknown;
  return_requested_by?: string | null;
  return_requested_at?: string | null;
  return_reason?: string | null;
  return_requested_lines?: unknown;
  returned_at?: string | null;
  returned_by?: string | null;
  waiter_transfers?: unknown;
  waiter_transfer_requested_to?: string | null;
  waiter_transfer_requested_by?: string | null;
  waiter_transfer_requested_at?: string | null;
  table_cleared_at?: string | null;
  table_cleared_by?: string | null;
  bono_print_count?: number | string | null;
  bono_last_printed_at?: string | null;
  bono_last_printed_by?: string | null;
  created_at?: string;
  updated_at?: string;
};

type StockRow = {
  sku: string;
  name?: string | null;
  unit?: string | null;
  store?: string | null;
  on_hand?: number | string | null;
  reorder_qty?: number | string | null;
  value?: number | string | null;
  supplier?: string | null;
};

type SupplierRow = {
  id: string;
  name: string;
  contact: string | null;
  category: string;
  outstanding: number | string;
  status: string;
  store?: string | null;
};

type ReservationRow = {
  id: string;
  name: string;
  phone: string;
  time: string;
  party: number;
  table_ref: string;
  deposit: number | string;
  status: string;
};

type CustomerRow = {
  id: string;
  name: string;
  phone: string;
  email?: string | null;
  visits: number;
  spent: number | string;
  tier: string;
  last_visit: string;
  points: number;
  feedback: string | null;
};

type PaymentRow = {
  id: string;
  ref: string;
  method: PaymentLedgerEntry["method"];
  amount: number | string;
  table_ref: string | null;
  cashier: string | null;
  time: string | null;
  status: PaymentLedgerEntry["status"];
  order_id: string | null;
  collected_by_waiter: string | null;
  received_by_cashier: string | null;
  amount_received: number | string | null;
  change_amount: number | string | null;
  receipt_number: string | null;
  payment_received_at: string | null;
  closed_by_cashier: string | null;
  raw_payment?: unknown;
};

type SalesRow = {
  id: string;
  data: unknown;
};

type ExpenseRow = {
  id: string;
  data: unknown;
};

type PurchaseOrderRow = {
  id: string;
  supplier: string;
  sku: string;
  item: string;
  qty: number | string;
  unit: string;
  unit_cost: number | string;
  total: number | string;
  status: string;
  date: string;
  store?: string | null;
};

type GuestOrderRow = {
  id: string;
  table_number: string;
  area: string;
  waiter: string;
  status: GuestOrderRequest["status"];
  note: string | null;
  created_at_text: string;
  total: number | string;
  items: unknown;
};

type ModuleRecordRow = {
  record_id: string;
  data: unknown;
};

export type BackendSnapshot = {
  menuItems: MenuItem[];
  menuCategories: string[];
  tables: Table[];
  orders: Order[];
  stations: string[];
  stock: StockItem[];
  suppliers: Supplier[];
  reservations: Reservation[];
  customers: Customer[];
  payments: PaymentLedgerEntry[];
  salesRecords: SalesRecord[];
  expenseRecords: ExpenseRecord[];
  purchaseOrders: PurchaseOrder[];
  guestOrderRequests: GuestOrderRequest[];
  restaurantProfile: RestaurantProfile;
};

function numberFrom(value: number | string | null | undefined, fallback = 0) {
  if (typeof value === "number") return Number.isFinite(value) ? value : fallback;
  if (typeof value === "string") {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : fallback;
  }
  return fallback;
}

function arrayFrom<T>(value: unknown): T[] {
  return Array.isArray(value) ? (value as T[]) : [];
}

function nullable<T>(value: T | undefined): T | null {
  return value ?? null;
}

function isOptionalBackendTableError(error: unknown) {
  if (!error || typeof error !== "object") return false;
  const value = error as { code?: string; message?: string; details?: string; hint?: string; status?: number };
  const haystack = `${value.code ?? ""} ${value.message ?? ""} ${value.details ?? ""} ${value.hint ?? ""}`.toLowerCase();
  return (
    value.code === "42P01" ||
    value.code === "PGRST205" ||
    value.code === "PGRST116" ||
    value.status === 404 ||
    haystack.includes("could not find the table") ||
    haystack.includes("does not exist") ||
    haystack.includes("schema cache") ||
    (haystack.includes("404") &&
      (haystack.includes("table") || haystack.includes("relation") || haystack.includes("schema")))
  );
}

function logSnapshotQueryError(label: string, error: unknown) {
  if (!error) return;
  if (isOptionalBackendTableError(error)) {
    console.warn(`Supabase ${label} skipped`, error);
    return;
  }
  console.error(`Supabase ${label} failed`, error);
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

function isNamedMissingColumn(error: unknown, columnName: string) {
  if (!error || typeof error !== "object") return false;
  const value = error as { code?: string; message?: string; details?: string };
  const haystack = `${value.message ?? ""} ${value.details ?? ""}`.toLowerCase();
  return haystack.includes(columnName.toLowerCase());
}

function isGenericMissingColumnError(error: unknown) {
  if (!error || typeof error !== "object") return false;
  const value = error as { code?: string; message?: string; details?: string };
  const haystack = `${value.message ?? ""} ${value.details ?? ""}`.toLowerCase();
  return (
    value.code === "42703" ||
    value.code === "PGRST204" ||
    haystack.includes("schema cache") ||
    haystack.includes("could not find")
  );
}

function missingOptionalOrderColumns(error: unknown, present: ReadonlySet<string>) {
  const named = OPTIONAL_ORDER_COLUMNS.filter(
    (column) => present.has(column) && isNamedMissingColumn(error, column),
  );
  if (named.length > 0) return named;
  if (isGenericMissingColumnError(error)) {
    return OPTIONAL_ORDER_COLUMNS.filter((column) => present.has(column));
  }
  return [];
}

function isMissingColumnError(error: unknown, columnName: string) {
  return isNamedMissingColumn(error, columnName);
}

function textFrom(value: unknown, fallback = "") {
  return typeof value === "string" ? value : fallback;
}

function unitLabelFromRow(row: MenuItemRow) {
  const category = row.category.trim();
  const id = row.id.trim().toLowerCase();
  const station = row.station.trim().toLowerCase();

  if (id === "derek-enjera" || id === "foyel") return "Piece";
  if (id === "telba-juice") return "Glass";
  if (row.pricing_mode === "kg" || category === "Meat" || station.includes("butcher")) return "kg";
  if (["Breakfast", "Vegetarian", "Mains", "Starters"].includes(category)) return "Plate";
  if (["Drinks", "Beer", "Soft Drinks", "Water", "Other Drinks", "Spirits"].includes(category))
    return "Bottle";
  return undefined;
}

function menuItemFromRow(row: MenuItemRow): MenuItem {
  const category = textFrom(row.category).trim();
  const station = textFrom(row.station, "Kitchen").trim() || "Kitchen";
  const pricingMode = row.pricing_mode === "kg" ? "kg" : "unit";
  const storedUnitLabel = row.unit_label?.trim() || undefined;
  // Only treat stock_sku as valid if it looks like a managed stock item id (starts with "stk-")
  // or is explicitly set to a non-empty value that differs from the menu item id.
  // Old seed data set stock_sku = menu item id, which never matches StockManagedItem ids.
  const rawSku = row.stock_sku?.trim() || undefined;
  const stockSku = rawSku && rawSku !== row.id && rawSku.startsWith("stk-") ? rawSku : undefined;
  const categoryLower = category.toLowerCase();
  const isSpirits = categoryLower === "spirits" || categoryLower === "whisky";
  const vipFromRow =
    row.vip_price === null || row.vip_price === undefined ? undefined : numberFrom(row.vip_price);
  const singleFromRow =
    row.single_price === null || row.single_price === undefined ? undefined : numberFrom(row.single_price);
  const doubleFromRow =
    row.double_price === null || row.double_price === undefined ? undefined : numberFrom(row.double_price);
  const halfFromRow =
    row.half_bottle_price === null || row.half_bottle_price === undefined
      ? undefined
      : numberFrom(row.half_bottle_price);
  const migratedDouble = isSpirits && doubleFromRow == null && vipFromRow != null && vipFromRow > 0 ? vipFromRow : undefined;
  const migratedSingle =
    isSpirits && singleFromRow == null && migratedDouble != null
      ? Math.round((migratedDouble / 2) * 100) / 100
      : undefined;
  const bottlePrice = numberFrom(row.price);
  const migratedHalf =
    isSpirits && halfFromRow == null && bottlePrice > 0
      ? Math.round((bottlePrice / 2) * 100) / 100
      : undefined;
  return {
    id: row.id,
    name_en: textFrom(row.name_en),
    name_am: textFrom(row.name_am),
    category,
    price: bottlePrice,
    vipPrice: isSpirits ? undefined : vipFromRow,
    singlePrice: singleFromRow ?? migratedSingle,
    doublePrice: doubleFromRow ?? migratedDouble,
    halfBottlePrice: halfFromRow ?? migratedHalf,
    cost: numberFrom(row.cost),
    station,
    emoji: textFrom(row.emoji),
    veg: Boolean(row.veg),
    pricingMode,
    unitLabel: storedUnitLabel ?? unitLabelFromRow(row),
    defaultQty: numberFrom(row.default_qty ?? (pricingMode === "kg" ? 1 : 1)),
    qtyStep: numberFrom(row.qty_step ?? (pricingMode === "kg" ? 0.25 : 1)),
    stockSku,
  };
}

function menuItemToRow(item: MenuItem, options?: { includeUnitLabel?: boolean }) {
  const row: Record<string, unknown> = {
    id: item.id,
    name_en: item.name_en,
    name_am: item.name_am ?? "",
    category: item.category,
    price: item.price,
    vip_price: item.vipPrice ?? null,
    single_price: item.singlePrice ?? null,
    double_price: item.doublePrice ?? null,
    half_bottle_price: item.halfBottlePrice ?? null,
    cost: item.cost,
    station: item.station,
    emoji: item.emoji ?? "",
    veg: Boolean(item.veg),
    pricing_mode: item.pricingMode === "kg" ? "kg" : "unit",
    default_qty: item.defaultQty ?? 1,
    qty_step: item.qtyStep ?? 1,
    stock_sku: item.stockSku ?? "",
    active: true,
    updated_at: new Date().toISOString(),
  };
  if (options?.includeUnitLabel !== false) {
    row.unit_label = item.unitLabel ?? null;
  }
  return row;
}

const MENU_ITEM_OPTIONAL_COLUMNS = [
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

type MenuItemOptionalColumn = (typeof MENU_ITEM_OPTIONAL_COLUMNS)[number];

// Saving without these silently discards configured prices, so a dropped price
// column has to be reported instead of looking like a successful save.
const MENU_ITEM_PRICE_COLUMNS: readonly MenuItemOptionalColumn[] = [
  "vip_price",
  "single_price",
  "double_price",
  "half_bottle_price",
];

function missingMenuItemColumns(error: unknown): MenuItemOptionalColumn[] {
  const named = MENU_ITEM_OPTIONAL_COLUMNS.filter((column) => isMissingColumnError(error, column));
  if (named.length > 0) return named;
  // If PostgREST only says "schema cache" without naming the column, drop unit_label first.
  const message = String((error as { message?: string })?.message || "").toLowerCase();
  return message.includes("schema cache") ? ["unit_label"] : [];
}

function stripMenuItemColumns(
  row: Record<string, unknown>,
  columns: readonly MenuItemOptionalColumn[],
) {
  const next = { ...row };
  for (const column of columns) delete next[column];
  return next;
}

function warnDroppedMenuItemColumns(columns: readonly MenuItemOptionalColumn[]) {
  const droppedPrices = MENU_ITEM_PRICE_COLUMNS.filter((column) => columns.includes(column));
  if (droppedPrices.length === 0) return;
  console.error(
    `Menu items saved without ${droppedPrices.join(", ")} because the columns are missing from menu_items. ` +
      "Apply supabase/migrations/030_menu_spirit_pour_prices.sql, then re-save the affected items — " +
      "single/double shot prices cannot reach the POS until the columns exist.",
  );
}

async function upsertMenuItemRows(
  client: NonNullable<typeof supabase>,
  items: MenuItem[],
) {
  if (items.length === 0) return;

  const attempt = async (rows: Record<string, unknown>[]) => {
    const { error } = await client.from("menu_items").upsert(rows, { onConflict: "id" });
    return error;
  };

  let rows = items.map((item) => menuItemToRow(item));
  let error = await attempt(rows);
  if (!error) return;

  const dropped = missingMenuItemColumns(error);
  rows = items.map((item) => stripMenuItemColumns(menuItemToRow(item), dropped));
  error = await attempt(rows);
  if (!error) {
    warnDroppedMenuItemColumns(dropped);
    return;
  }

  // Last resort: core columns only (001_core_pos + common price fields).
  rows = items.map((item) => ({
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
  }));
  error = await attempt(rows);
  if (error) throw error;
  warnDroppedMenuItemColumns(MENU_ITEM_OPTIONAL_COLUMNS);
}

async function loadMenuItemRows() {
  if (!supabase) return [] as MenuItemRow[];

  const { data, error } = await supabase
    .from("menu_items")
    .select("*")
    .eq("active", true)
    .order("category")
    .order("name_en");

  if (error) {
    if (isMissingColumnError(error, "active")) {
      const fallback = await supabase
        .from("menu_items")
        .select("*")
        .order("category")
        .order("name_en");
      if (fallback.error) throw fallback.error;
      return (fallback.data ?? []) as MenuItemRow[];
    }
    throw error;
  }

  return (data ?? []) as MenuItemRow[];
}

function menuCategoriesFromRows(rows: MenuCategoryRow[]) {
  return rows
    .map((row) => row.name?.trim())
    .filter((name): name is string => Boolean(name))
    .filter(
      (name, index, list) =>
        list.findIndex((item) => item.toLowerCase() === name.toLowerCase()) === index,
    );
}

function tableFromRow(row: TableRow): Table {
  return {
    id: row.id,
    label: row.label,
    seats: row.seats,
    area: row.area,
    status: row.status,
    guests: row.guests ?? undefined,
    server: row.server ?? undefined,
    openMin: row.open_min ?? undefined,
    total: row.total === null ? undefined : numberFrom(row.total),
  };
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

function orderFromRow(row: OrderRow): Order {
  return {
    id: row.id,
    orderNo: row.order_no,
    source: row.source,
    ref: row.ref,
    customerName: row.customer_name ?? undefined,
    area: row.area as SeatingArea,
    tableNumber: row.table_number,
    orderedByWaiter: row.ordered_by_waiter,
    waiter: row.waiter,
    enteredByCashier: row.entered_by_cashier,
    server: row.server ?? undefined,
    items: arrayFrom(row.items),
    stationTickets: arrayFrom(row.station_tickets),
    sentAt: row.sent_at,
    requestedAt: row.requested_at ?? undefined,
    cashierAcceptedAt: row.cashier_accepted_at ?? undefined,
    stationSentAt: row.station_sent_at ?? undefined,
    status: row.status,
    paymentStatus: row.payment_status,
    openedMin: row.opened_min,
    total: numberFrom(row.total),
    receipt:
      row.receipt && typeof row.receipt === "object"
        ? (row.receipt as Order["receipt"])
        : undefined,
    receiptNumber: row.receipt_number ?? undefined,
    receiptGeneratedAt: row.receipt_generated_at ?? undefined,
    receiptGeneratedBy: row.receipt_generated_by ?? undefined,
    lockedForEditing: row.locked_for_editing ?? undefined,
    managerAuthorizedChangesBy: row.manager_authorized_changes_by ?? undefined,
    managerAuthorizedChangesAt: row.manager_authorized_changes_at ?? undefined,
    paymentReceivedAt: row.payment_received_at ?? undefined,
    closedByCashier: row.closed_by_cashier ?? undefined,
    cancelledAt: row.cancelled_at ?? undefined,
    cancelledBy: row.cancelled_by ?? undefined,
    voidRequestedBy: row.void_requested_by ?? undefined,
    voidRequestedAt: row.void_requested_at ?? undefined,
    voidReason: row.void_reason ?? undefined,
    returnRequestedBy: row.return_requested_by ?? undefined,
    returnRequestedAt: row.return_requested_at ?? undefined,
    returnReason: row.return_reason ?? undefined,
    returnRequestedLines: Array.isArray(row.return_requested_lines)
      ? (row.return_requested_lines as Order["returnRequestedLines"])
      : undefined,
    returnedAt: row.returned_at ?? undefined,
    returnedBy: row.returned_by ?? undefined,
    payment:
      row.payment && typeof row.payment === "object"
        ? (row.payment as Order["payment"])
        : undefined,
    waiterTransfers: Array.isArray(row.waiter_transfers)
      ? (row.waiter_transfers as Order["waiterTransfers"])
      : undefined,
    waiterTransferRequestedTo: row.waiter_transfer_requested_to ?? undefined,
    waiterTransferRequestedBy: row.waiter_transfer_requested_by ?? undefined,
    waiterTransferRequestedAt: row.waiter_transfer_requested_at ?? undefined,
    tableClearedAt: row.table_cleared_at ?? undefined,
    tableClearedBy: row.table_cleared_by ?? undefined,
    bonoPrintCount: row.bono_print_count == null ? undefined : numberFrom(row.bono_print_count),
    bonoLastPrintedAt: row.bono_last_printed_at ?? undefined,
    bonoLastPrintedBy: row.bono_last_printed_by ?? undefined,
    createdAtIso: row.created_at ?? undefined,
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
    return_requested_by: nullable(order.returnRequestedBy),
    return_requested_at: nullable(order.returnRequestedAt),
    return_reason: nullable(order.returnReason),
    return_requested_lines: order.returnRequestedLines ?? [],
    returned_at: nullable(order.returnedAt),
    returned_by: nullable(order.returnedBy),
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

function stockFromRow(row: StockRow): StockItem {
  return {
    sku: row.sku,
    name: row.name?.trim() || row.sku,
    unit: row.unit ?? "",
    store: row.store ?? "",
    onHand: numberFrom(row.on_hand),
    reorder: numberFrom(row.reorder_qty),
    value: numberFrom(row.value),
    supplier: row.supplier ?? "",
  };
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

function supplierFromRow(row: SupplierRow): Supplier {
  return {
    id: row.id,
    name: row.name,
    contact: row.contact ?? "",
    category: row.category,
    outstanding: numberFrom(row.outstanding),
    status: row.status,
    store: row.store === "Store 2" ? "Store 2" : "Store 1",
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

function reservationFromRow(row: ReservationRow): Reservation {
  return {
    id: row.id,
    name: row.name,
    phone: row.phone,
    time: row.time,
    party: row.party,
    table: row.table_ref,
    deposit: numberFrom(row.deposit),
    status: row.status,
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

function customerFromRow(row: CustomerRow): Customer {
  return {
    id: row.id,
    name: row.name,
    phone: row.phone,
    email: row.email ?? "",
    visits: row.visits,
    spent: numberFrom(row.spent),
    tier: row.tier,
    lastVisit: row.last_visit,
    points: row.points,
    feedback: row.feedback ?? "",
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

function paymentFromRow(row: PaymentRow): PaymentLedgerEntry {
  const raw =
    row.raw_payment && typeof row.raw_payment === "object"
      ? (row.raw_payment as Partial<PaymentLedgerEntry>)
      : null;
  const reportDate =
    typeof raw?.reportDate === "string" && /^\d{4}-\d{2}-\d{2}$/.test(raw.reportDate.trim())
      ? raw.reportDate.trim()
      : undefined;
  return {
    id: row.id,
    ref: row.ref,
    method: row.method,
    amount: numberFrom(row.amount),
    table: row.table_ref ?? "",
    cashier: row.cashier ?? "",
    time: row.time ?? "",
    status: row.status,
    orderId: row.order_id ?? undefined,
    collectedByWaiter: row.collected_by_waiter ?? undefined,
    receivedByCashier: row.received_by_cashier ?? undefined,
    amountReceived: row.amount_received === null ? undefined : numberFrom(row.amount_received),
    changeAmount: row.change_amount === null ? undefined : numberFrom(row.change_amount),
    tipAmount: typeof raw?.tipAmount === "number" ? raw.tipAmount : undefined,
    receiptNumber: row.receipt_number ?? undefined,
    paymentReceivedAt: row.payment_received_at ?? undefined,
    closedByCashier: row.closed_by_cashier ?? undefined,
    reportDate,
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

function purchaseOrderFromRow(row: PurchaseOrderRow): PurchaseOrder {
  return {
    id: row.id,
    supplier: row.supplier,
    sku: row.sku,
    item: row.item,
    qty: numberFrom(row.qty),
    unit: row.unit,
    unitCost: numberFrom(row.unit_cost),
    total: numberFrom(row.total),
    status: row.status,
    date: row.date,
    store: row.store === "Store 2" ? "Store 2" : "Store 1",
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

function guestOrderFromRow(row: GuestOrderRow): GuestOrderRequest {
  return {
    id: row.id,
    tableNumber: row.table_number,
    area: row.area,
    waiter: row.waiter,
    status: row.status,
    note: row.note ?? "",
    createdAt: row.created_at_text,
    total: numberFrom(row.total),
    items: arrayFrom(row.items),
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

function recordDataFromRow<T extends { id: string }>(row: SalesRow | ExpenseRow): T | null {
  if (!row.data || typeof row.data !== "object") return null;
  return { id: row.id, ...(row.data as object) } as T;
}

function recordDataToRow<T extends { id: string }>(record: T) {
  return {
    id: record.id,
    data: record,
    updated_at: new Date().toISOString(),
  };
}

function restaurantProfileFromRow(row: ModuleRecordRow | null | undefined): RestaurantProfile {
  if (!row?.data || typeof row.data !== "object") return DEFAULT_RESTAURANT_PROFILE;
  return normalizeRestaurantProfile(row.data as Partial<RestaurantProfile>);
}

function assertConfigured() {
  if (!supabase) throw new Error("Supabase is not configured.");
  return supabase;
}

const LIVE_ORDER_STATUSES = [
  "PENDING_CASHIER",
  "NEW",
  "ACCEPTED",
  "PREPARING",
  "PARTIALLY READY",
  "READY TO SERVE",
  "SERVED",
  "RECEIPT_GENERATED",
] as const;
/** Keep closed-order lookback wide enough for Orders history without pulling entire table. */
const SNAPSHOT_RECENT_MS = 30 * 24 * 60 * 60 * 1000;
const SNAPSHOT_RECENT_CLOSED_LIMIT = 300;
const SNAPSHOT_LEDGER_LIMIT = 150;
const SNAPSHOT_GUEST_ORDER_LIMIT = 50;

/** Tables that must stay live for floor / POS. Everything else is initial-hydrate only. */
const REALTIME_HOT_TABLES = [
  "orders",
  "dining_tables",
  "menu_items",
  "menu_categories",
  "payments_ledger",
  "sales_records",
] as const;

async function loadLiveOrderRows(): Promise<{ rows: OrderRow[]; ok: boolean }> {
  if (!supabase) return { rows: [], ok: false };
  const cutoff = new Date(Date.now() - SNAPSHOT_RECENT_MS).toISOString();
  const [open, recent] = await Promise.all([
    supabase
      .from("orders")
      .select("*")
      .in("status", [...LIVE_ORDER_STATUSES])
      .order("created_at", { ascending: false }),
    supabase
      .from("orders")
      .select("*")
      .in("status", [...FINAL_ORDER_STATUSES])
      .gte("updated_at", cutoff)
      .order("updated_at", { ascending: false })
      .limit(SNAPSHOT_RECENT_CLOSED_LIMIT),
  ]);
  logSnapshotQueryError("open orders", open.error);
  logSnapshotQueryError("recent closed orders", recent.error);
  // Both queries failed → do not treat as authoritative empty snapshot.
  if (open.error && recent.error) {
    return { rows: [], ok: false };
  }
  const byId = new Map<string, OrderRow>();
  for (const row of [...((open.data ?? []) as OrderRow[]), ...((recent.data ?? []) as OrderRow[])]) {
    byId.set(row.id, row);
  }
  return { rows: [...byId.values()], ok: true };
}

export async function loadBackendSnapshot(options?: {
  only?: readonly string[];
}): Promise<Partial<BackendSnapshot> | null> {
  if (!isSupabaseConfigured || !supabase) return null;
  const only = options?.only;
  const include = (table: string) => !only || only.includes(table);
  const snapshot: Partial<BackendSnapshot> = {};

  // Load menu on its own so a timeout/error on orders or stock_items cannot
  // wipe an otherwise successful catalog hydrate.
  if (include("menu_items")) {
    try {
      const menu = await loadMenuItemRows();
      snapshot.menuItems = menu.map(menuItemFromRow);
    } catch (error) {
      logSnapshotQueryError("menu items", error);
    }
  }

  const [
    menuCategories,
    tables,
    orders,
    stations,
    stock,
    suppliers,
    reservations,
    customers,
    payments,
    sales,
    expenses,
    purchaseOrders,
    guestOrders,
    restaurantProfile,
  ] = await Promise.all([
    include("menu_categories")
      ? supabase
          .from("menu_categories")
          .select("name,position")
          .eq("active", true)
          .order("position")
          .order("name")
      : Promise.resolve({ data: null, error: null }),
    include("dining_tables")
      ? supabase
          .from("dining_tables")
          .select("id,label,seats,area,status,guests,server,open_min,total,active")
          .eq("active", true)
          .order("area")
          .order("label")
      : Promise.resolve({ data: null, error: null }),
    include("orders")
      ? loadLiveOrderRows().then((result) => result)
      : Promise.resolve({ rows: null as OrderRow[] | null, ok: false }),
    include("production_stations")
      ? supabase
          .from("production_stations")
          .select("name")
          .eq("active", true)
          .order("position")
          .order("name")
      : Promise.resolve({ data: null, error: null }),
    include("stock_items")
      ? supabase.from("stock_items").select("*").eq("active", true).order("sku")
      : Promise.resolve({ data: null, error: null }),
    include("suppliers")
      ? supabase.from("suppliers").select("*").eq("active", true).order("name")
      : Promise.resolve({ data: null, error: null }),
    include("reservations")
      ? supabase.from("reservations").select("*").eq("active", true).order("time")
      : Promise.resolve({ data: null, error: null }),
    include("customers")
      ? supabase.from("customers").select("*").eq("active", true).order("name")
      : Promise.resolve({ data: null, error: null }),
    include("payments_ledger")
      ? supabase
          .from("payments_ledger")
          .select("*")
          .order("created_at", { ascending: false })
          .limit(SNAPSHOT_LEDGER_LIMIT)
      : Promise.resolve({ data: null, error: null }),
    include("sales_records")
      ? supabase
          .from("sales_records")
          .select("id,data")
          .order("created_at", { ascending: false })
          .limit(SNAPSHOT_LEDGER_LIMIT)
      : Promise.resolve({ data: null, error: null }),
    include("expense_records")
      ? supabase
          .from("expense_records")
          .select("id,data")
          .order("created_at", { ascending: false })
          .limit(SNAPSHOT_LEDGER_LIMIT)
      : Promise.resolve({ data: null, error: null }),
    include("purchase_orders")
      ? supabase
          .from("purchase_orders")
          .select("*")
          .eq("active", true)
          .order("created_at", { ascending: false })
          .limit(SNAPSHOT_LEDGER_LIMIT)
      : Promise.resolve({ data: null, error: null }),
    include("guest_order_requests")
      ? supabase
          .from("guest_order_requests")
          .select("*")
          .order("created_at", { ascending: false })
          .limit(SNAPSHOT_GUEST_ORDER_LIMIT)
      : Promise.resolve({ data: null, error: null }),
    include("module_records")
      ? supabase
          .from("module_records")
          .select("record_id,data")
          .eq("module_key", "settings")
          .eq("record_id", "restaurant_profile")
          .eq("active", true)
          .maybeSingle()
      : Promise.resolve({ data: null, error: null }),
  ]);

  if (include("menu_categories")) {
    logSnapshotQueryError("menu categories", menuCategories.error);
    snapshot.menuCategories = menuCategories.error
      ? []
      : menuCategoriesFromRows((menuCategories.data ?? []) as MenuCategoryRow[]);
  }
  if (include("dining_tables")) {
    logSnapshotQueryError("tables", tables.error);
    snapshot.tables = tables.error ? [] : ((tables.data ?? []) as TableRow[]).map(tableFromRow);
  }
  if (include("orders")) {
    // Partial live snapshot only. Omit on failure so hydrate does not wipe local history.
    if (orders.ok && Array.isArray(orders.rows)) {
      snapshot.orders = orders.rows.map(orderFromRow);
    }
  }
  if (include("production_stations")) {
    logSnapshotQueryError("stations", stations.error);
    snapshot.stations = stations.error
      ? []
      : ((stations.data ?? []) as { name: string }[]).map((row) => row.name);
  }
  if (include("stock_items")) {
    logSnapshotQueryError("stock items", stock.error);
    snapshot.stock = stock.error ? [] : ((stock.data ?? []) as StockRow[]).map(stockFromRow);
  }
  if (include("suppliers")) {
    logSnapshotQueryError("suppliers", suppliers.error);
    snapshot.suppliers = suppliers.error
      ? []
      : ((suppliers.data ?? []) as SupplierRow[]).map(supplierFromRow);
  }
  if (include("reservations")) {
    logSnapshotQueryError("reservations", reservations.error);
    snapshot.reservations = reservations.error
      ? []
      : ((reservations.data ?? []) as ReservationRow[]).map(reservationFromRow);
  }
  if (include("customers")) {
    logSnapshotQueryError("customers", customers.error);
    snapshot.customers = customers.error
      ? []
      : ((customers.data ?? []) as CustomerRow[]).map(customerFromRow);
  }
  if (include("payments_ledger")) {
    logSnapshotQueryError("payments", payments.error);
    // Omit on failure — never wipe the ledger with [] (that backfills wrong "today" sales).
    if (!payments.error) {
      snapshot.payments = ((payments.data ?? []) as PaymentRow[]).map(paymentFromRow);
    }
  }
  if (include("sales_records")) {
    logSnapshotQueryError("sales", sales.error);
    if (!sales.error) {
      snapshot.salesRecords = ((sales.data ?? []) as SalesRow[]).flatMap(
        (row) => recordDataFromRow<SalesRecord>(row) ?? [],
      );
    }
  }
  if (include("expense_records")) {
    logSnapshotQueryError("expenses", expenses.error);
    if (!expenses.error) {
      snapshot.expenseRecords = ((expenses.data ?? []) as ExpenseRow[]).flatMap(
        (row) => recordDataFromRow<ExpenseRecord>(row) ?? [],
      );
    }
  }
  if (include("purchase_orders")) {
    logSnapshotQueryError("purchase orders", purchaseOrders.error);
    snapshot.purchaseOrders = purchaseOrders.error
      ? []
      : ((purchaseOrders.data ?? []) as PurchaseOrderRow[]).map(purchaseOrderFromRow);
  }
  if (include("guest_order_requests")) {
    logSnapshotQueryError("guest orders", guestOrders.error);
    snapshot.guestOrderRequests = guestOrders.error
      ? []
      : ((guestOrders.data ?? []) as GuestOrderRow[]).map(guestOrderFromRow);
  }
  if (include("module_records")) {
    logSnapshotQueryError("restaurant profile", restaurantProfile.error);
    snapshot.restaurantProfile = restaurantProfile.error
      ? DEFAULT_RESTAURANT_PROFILE
      : restaurantProfileFromRow(restaurantProfile.data as ModuleRecordRow | null);
  }

  return snapshot;
}

export async function loadGuestOrderingSnapshot(
  tableNumber: string,
): Promise<{ menuItems: MenuItem[]; table: Table | null; stations: string[] } | null> {
  if (!isSupabaseConfigured || !supabase) return null;

  const menuRowsPromise = loadMenuItemRows();

  const [menu, tables, stations] = await Promise.all([
    menuRowsPromise,
    supabase.from("dining_tables").select("*").eq("active", true).ilike("label", tableNumber),
    supabase
      .from("production_stations")
      .select("name")
      .eq("active", true)
      .order("position")
      .order("name"),
  ]);

  if (tables.error) throw tables.error;
  if (stations.error) throw stations.error;

  return {
    menuItems: (menu ?? []).map(menuItemFromRow),
    table: ((tables.data ?? []) as TableRow[]).map(tableFromRow)[0] ?? null,
    stations: ((stations.data ?? []) as { name: string }[]).map((row) => row.name),
  };
}

export async function loadBackendRestaurantProfile(): Promise<RestaurantProfile | null> {
  if (!isSupabaseConfigured || !supabase) return null;

  const { data, error } = await supabase
    .from("module_records")
    .select("record_id,data")
    .eq("module_key", "settings")
    .eq("record_id", "restaurant_profile")
    .eq("active", true)
    .maybeSingle();

  if (error) {
    if (isOptionalBackendTableError(error)) return null;
    throw error;
  }
  return restaurantProfileFromRow(data as ModuleRecordRow | null);
}

export async function syncBackendMenuItems(items: MenuItem[]) {
  const client = assertConfigured();
  const timestamp = new Date().toISOString();
  const stations = Array.from(
    new Set(items.map((item) => item.station?.trim()).filter((name): name is string => Boolean(name))),
  );
  if (stations.length > 0) {
    const stationRows = stations.map((name, index) => ({
      name,
      position: index,
      active: true,
      updated_at: timestamp,
    }));
    const stationResult = await client
      .from("production_stations")
      .upsert(stationRows, { onConflict: "name" });
    if (stationResult.error) throw stationResult.error;
  }
  if (items.length === 0) return;

  try {
    await upsertMenuItemRows(client, items);
  } catch (batchError) {
    // One bad historical row must not block newly created items.
    if (items.length === 1) throw batchError;
    const failures: string[] = [];
    for (const item of items) {
      try {
        await upsertMenuItemRows(client, [item]);
      } catch (itemError) {
        failures.push(`${item.id}: ${itemError instanceof Error ? itemError.message : String(itemError)}`);
      }
    }
    if (failures.length === items.length) throw batchError;
    if (failures.length > 0) {
      console.warn("Some menu items failed to sync", failures);
    }
  }
}

export async function upsertBackendMenuItem(item: MenuItem) {
  await syncBackendMenuItems([item]);
}

export async function syncBackendMenuCategories(categories: string[]) {
  const client = assertConfigured();
  const timestamp = new Date().toISOString();
  const disabled = await client
    .from("menu_categories")
    .update({ active: false, updated_at: timestamp })
    .neq("name", "");

  if (disabled.error) throw disabled.error;

  const clean = categories
    .map((category) => category.trim())
    .filter(Boolean)
    .filter(
      (category, index, list) =>
        list.findIndex((item) => item.toLowerCase() === category.toLowerCase()) === index,
    );

  if (clean.length === 0) return;

  const rows = clean.map((name, position) => ({
    name,
    position,
    active: true,
    updated_at: timestamp,
  }));

  const { error } = await client.from("menu_categories").upsert(rows, { onConflict: "name" });
  if (error) throw error;
}

export async function deleteBackendMenuItem(id: string) {
  const client = assertConfigured();
  const { error } = await client
    .from("menu_items")
    .update({ active: false, updated_at: new Date().toISOString() })
    .eq("id", id);
  if (error) throw error;
}

export async function syncBackendTables(tables: Table[]) {
  const client = assertConfigured();
  if (tables.length > 0) {
    try {
      const { error } = await client
        .from("dining_tables")
        .upsert(tables.map(tableToRow), { onConflict: "id" });
      if (error) throw error;
    } catch (batchError) {
      if (tables.length === 1) throw batchError;
      const failures: string[] = [];
      for (const table of tables) {
        const { error } = await client.from("dining_tables").upsert(tableToRow(table), { onConflict: "id" });
        if (error) failures.push(`${table.id}: ${error.message}`);
      }
      if (failures.length === tables.length) throw batchError;
      if (failures.length > 0) console.warn("Some dining tables failed to sync", failures);
    }
  }

  const { data: activeRows, error: listError } = await client
    .from("dining_tables")
    .select("id")
    .eq("active", true);
  if (listError) throw listError;

  const keep = new Set(tables.map((table) => table.id));
  const toDisable = (activeRows ?? [])
    .map((row) => row.id as string)
    .filter((id) => !keep.has(id));
  if (toDisable.length === 0) return;

  const { error: disableError } = await client
    .from("dining_tables")
    .update({ active: false, updated_at: new Date().toISOString() })
    .in("id", toDisable);
  if (disableError) throw disableError;
}

/** Upsert tables without deactivating other active seats (safe for waiter assignment). */
export async function upsertBackendTables(tables: Table[]) {
  const client = assertConfigured();
  if (tables.length === 0) return;
  try {
    const { error } = await client
      .from("dining_tables")
      .upsert(tables.map(tableToRow), { onConflict: "id" });
    if (error) throw error;
  } catch (batchError) {
    if (tables.length === 1) throw batchError;
    const failures: string[] = [];
    for (const table of tables) {
      const { error } = await client.from("dining_tables").upsert(tableToRow(table), { onConflict: "id" });
      if (error) failures.push(`${table.id}: ${error.message}`);
    }
    if (failures.length === tables.length) throw batchError;
    if (failures.length > 0) console.warn("Some dining tables failed to upsert", failures);
  }
}

export async function upsertBackendTable(table: Table) {
  const client = assertConfigured();
  const { error } = await client.from("dining_tables").upsert(tableToRow(table), { onConflict: "id" });
  if (error) throw error;
}

export async function deleteBackendTable(id: string) {
  const client = assertConfigured();
  const { error } = await client
    .from("dining_tables")
    .update({ active: false, updated_at: new Date().toISOString() })
    .eq("id", id);
  if (error) throw error;
}

export async function syncBackendOrders(orders: Order[]) {
  const client = assertConfigured();
  if (orders.length === 0) return;
  let rows = orders.map(orderToRow);
  for (let attempt = 0; attempt < OPTIONAL_ORDER_COLUMNS.length + 1; attempt += 1) {
    const { error } = await client.from("orders").upsert(rows, { onConflict: "id" });
    if (!error) return;
    const present = new Set(Object.keys(rows[0] ?? {}));
    const stripCols = missingOptionalOrderColumns(error, present);
    if (stripCols.length === 0) throw error;
    rows = rows.map((row) => {
      const next = { ...row };
      for (const column of stripCols) delete (next as Record<string, unknown>)[column];
      return next;
    });
  }
}

/** Server-side page fetch for large order volumes (Supabase range). */
export async function fetchOrdersPage(input: {
  page: number;
  pageSize: number;
  status?: Order["status"];
}) {
  const client = assertConfigured();
  const page = Math.max(1, input.page);
  const pageSize = Math.max(1, Math.min(100, input.pageSize));
  const from = (page - 1) * pageSize;
  const to = from + pageSize - 1;
  let query = client
    .from("orders")
    .select("*", { count: "exact" })
    .order("updated_at", { ascending: false })
    .range(from, to);
  if (input.status) query = query.eq("status", input.status);
  const { data, error, count } = await query;
  if (error) throw error;
  const rows = ((data ?? []) as OrderRow[]).map(orderFromRow);
  const total = count ?? rows.length;
  return {
    rows,
    page,
    pageSize,
    total,
    pageCount: Math.max(1, Math.ceil(total / pageSize)),
  };
}

export async function deleteBackendOrder(id: string) {
  const client = assertConfigured();
  const { error } = await client.from("orders").delete().eq("id", id);
  if (error) throw error;
}

export async function syncBackendStations(stations: string[]) {
  const client = assertConfigured();
  const disabled = await client
    .from("production_stations")
    .update({ active: false, updated_at: new Date().toISOString() })
    .neq("name", "");
  if (disabled.error) throw disabled.error;
  if (stations.length === 0) return;
  const rows = stations.map((name, index) => ({
    name,
    position: index,
    active: true,
    updated_at: new Date().toISOString(),
  }));
  const { error } = await client.from("production_stations").upsert(rows, { onConflict: "name" });
  if (error) throw error;
}

export async function syncBackendStock(items: StockItem[]) {
  const client = assertConfigured();
  if (items.length === 0) return;
  const { error } = await client
    .from("stock_items")
    .upsert(items.map(stockToRow), { onConflict: "sku" });
  if (error) throw error;
}

export async function syncBackendSuppliers(items: Supplier[]) {
  const client = assertConfigured();
  if (items.length === 0) return;
  const { error } = await client
    .from("suppliers")
    .upsert(items.map(supplierToRow), { onConflict: "id" });
  if (error) throw error;
}

export async function deleteBackendSupplier(id: string) {
  const client = assertConfigured();
  const { error } = await client
    .from("suppliers")
    .update({ active: false, updated_at: new Date().toISOString() })
    .eq("id", id);
  if (error) throw error;
}

export async function syncBackendReservations(items: Reservation[]) {
  const client = assertConfigured();
  if (items.length === 0) return;
  const { error } = await client
    .from("reservations")
    .upsert(items.map(reservationToRow), { onConflict: "id" });
  if (error) throw error;
}

export async function deleteBackendReservation(id: string) {
  const client = assertConfigured();
  const { error } = await client
    .from("reservations")
    .update({ active: false, updated_at: new Date().toISOString() })
    .eq("id", id);
  if (error) throw error;
}

export async function syncBackendCustomers(items: Customer[]) {
  const client = assertConfigured();
  if (items.length === 0) return;
  const { error } = await client
    .from("customers")
    .upsert(items.map(customerToRow), { onConflict: "id" });
  if (error) throw error;
}

export async function syncBackendPayments(items: PaymentLedgerEntry[]) {
  const client = assertConfigured();
  if (items.length === 0) return;
  const { error } = await client
    .from("payments_ledger")
    .upsert(items.map(paymentToRow), { onConflict: "id" });
  if (error) throw error;
}

export async function syncBackendSalesRecords(items: SalesRecord[]) {
  const client = assertConfigured();
  if (items.length === 0) return;
  const { error } = await client
    .from("sales_records")
    .upsert(items.map(recordDataToRow), { onConflict: "id" });
  if (error) throw error;
}

export async function syncBackendExpenseRecords(items: ExpenseRecord[]) {
  const client = assertConfigured();
  if (items.length === 0) return;
  const { error } = await client
    .from("expense_records")
    .upsert(items.map(recordDataToRow), { onConflict: "id" });
  if (error) throw error;
}

export async function syncBackendPurchaseOrders(items: PurchaseOrder[]) {
  const client = assertConfigured();
  if (items.length === 0) return;
  const { error } = await client
    .from("purchase_orders")
    .upsert(items.map(purchaseOrderToRow), { onConflict: "id" });
  if (error) throw error;
}

export async function syncBackendGuestOrders(items: GuestOrderRequest[]) {
  const client = assertConfigured();
  if (items.length === 0) return;
  const { error } = await client
    .from("guest_order_requests")
    .upsert(items.map(guestOrderToRow), { onConflict: "id" });
  if (error) throw error;
}

export async function syncBackendRestaurantProfile(profile: RestaurantProfile) {
  const client = assertConfigured();
  const { error } = await client.from("module_records").upsert(
    {
      module_key: "settings",
      record_id: "restaurant_profile",
      data: normalizeRestaurantProfile(profile),
      position: 0,
      active: true,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "module_key,record_id" },
  );

  if (error) throw error;
}

export async function upsertBackendGuestOrder(request: GuestOrderRequest) {
  const client = assertConfigured();
  const { error } = await client
    .from("guest_order_requests")
    .upsert(guestOrderToRow(request), { onConflict: "id" });
  if (error) throw error;
}

export async function updateBackendGuestOrderStatus(
  id: string,
  status: GuestOrderRequest["status"],
) {
  const client = assertConfigured();
  const { error } = await client
    .from("guest_order_requests")
    .update({ status, updated_at: new Date().toISOString() })
    .eq("id", id);
  if (error) throw error;
}

export type BackendRealtimeStatus = "disabled" | "connecting" | "connected" | "error";

export function subscribeToBackendChanges(
  onChange: (table: string) => void,
  onStatusChange?: (status: BackendRealtimeStatus) => void,
) {
  if (!isSupabaseConfigured || !supabase) {
    onStatusChange?.("disabled");
    return null;
  }

  onStatusChange?.("connecting");

  const notify = (table: string) => () => onChange(table);

  // Subscribe only to hot floor/POS tables. Cold catalogs (stock, suppliers,
  // reservations, customers, expenses, POs, guest QR, stations) load on boot
  // and when that screen explicitly refreshes — not on every remote write.
  let channel = supabase.channel("pos-core-hot");
  for (const table of REALTIME_HOT_TABLES) {
    channel = channel.on(
      "postgres_changes",
      { event: "*", schema: "public", table },
      notify(table),
    );
  }
  channel = channel
    .on("broadcast", { event: "orders:event" }, notify("orders"))
    .subscribe((status) => {
      if (status === "SUBSCRIBED") onStatusChange?.("connected");
      if (status === "CHANNEL_ERROR" || status === "TIMED_OUT" || status === "CLOSED") {
        onStatusChange?.("error");
      }
    });

  return {
    unsubscribe: () => {
      void channel.unsubscribe();
    },
  };
}
