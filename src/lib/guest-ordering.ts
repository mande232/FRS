import type { MenuItem, Table } from "./demo-data";
import {
  updateBackendGuestOrderStatus,
  upsertBackendGuestOrder,
} from "./supabase/pos-backend";
import { isSupabaseConfigured } from "./supabase/client";

const MENU_STORAGE_KEY = "bl_menu_items";
const TABLE_STORAGE_KEY = "bl_tables";
const GUEST_ORDER_STORAGE_KEY = "bl_guest_order_requests";
const ORDER_QR_PREFIX = "BL_ORDER:";

const POS_LOCAL_PURGE_FLAG = "bl_pos_demo_purge_v1";
const POS_LOCAL_STORAGE_KEYS = [
  MENU_STORAGE_KEY,
  TABLE_STORAGE_KEY,
  GUEST_ORDER_STORAGE_KEY,
  "bl_menu_categories",
  "bl_deleted_menu_categories",
  "bl_table_areas",
  "bl_orders",
  "bl_suppliers",
  "bl_customers",
  "bl_reservations",
  "bl_payments",
  "bl_sales_records",
  "bl_expense_records",
  "bl_purchase_orders",
] as const;

if (typeof window !== "undefined" && isSupabaseConfigured) {
  try {
    if (!window.localStorage.getItem(POS_LOCAL_PURGE_FLAG)) {
      for (const key of POS_LOCAL_STORAGE_KEYS) {
        window.localStorage.removeItem(key);
      }
      window.localStorage.setItem(POS_LOCAL_PURGE_FLAG, "1");
    }
  } catch {
    // ignore
  }
}

export type GuestOrderStatus = "QR_GENERATED" | "SENT_TO_WAITER" | "IMPORTED" | "SENT_TO_CASHIER";

export interface GuestOrderLine {
  item: MenuItem;
  qty: number;
}

export interface GuestOrderRequest {
  id: string;
  tableNumber: string;
  area: string;
  waiter: string;
  status: GuestOrderStatus;
  note: string;
  createdAt: string;
  total: number;
  items: GuestOrderLine[];
}

type Updater<T> = T[] | ((prev: T[]) => T[]);

function readArray<T>(key: string, fallback: T[]) {
  if (typeof window === "undefined") return fallback;
  try {
    const raw = localStorage.getItem(key);
    const parsed = raw ? JSON.parse(raw) : null;
    return Array.isArray(parsed) ? parsed as T[] : fallback;
  } catch {
    return fallback;
  }
}

function writeArray<T>(key: string, rows: T[]) {
  if (typeof window === "undefined") return;
  localStorage.setItem(key, JSON.stringify(rows));
}

function updateArray<T>(key: string, update: Updater<T>, fallback: T[]) {
  const current = readArray<T>(key, fallback);
  const next = typeof update === "function" ? update(current) : update;
  writeArray(key, next);
  return next;
}

function notifyGuestOrdersChanged() {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new Event("guest-orders-updated"));
}

export function loadStoredMenuItems(fallback: MenuItem[] = []) {
  return readArray<MenuItem>(MENU_STORAGE_KEY, fallback).map(normalizeMenuItemStockSku);
}

// Strip stock_sku values that are just the menu item's own id (old seed behavior).
// Valid managed stock item ids start with "stk-".
function normalizeMenuItemStockSku(item: MenuItem): MenuItem {
  if (!item.stockSku) return item;
  if (item.stockSku === item.id || !item.stockSku.startsWith("stk-")) {
    return { ...item, stockSku: undefined };
  }
  return item;
}

export function saveStoredMenuItems(update: Updater<MenuItem>) {
  const normalize = (items: MenuItem[]) => items.map(normalizeMenuItemStockSku);
  return updateArray<MenuItem>(MENU_STORAGE_KEY, (prev) => {
    const next = typeof update === "function" ? update(prev) : update;
    return normalize(next);
  }, []);
}

export function loadStoredTables(fallback: Table[] = []) {
  return readArray<Table>(TABLE_STORAGE_KEY, fallback);
}

export function saveStoredTables(update: Updater<Table>) {
  return updateArray<Table>(TABLE_STORAGE_KEY, update, []);
}

export function findStoredTable(tableNumber: string) {
  const key = tableNumber.trim().toLowerCase();
  return loadStoredTables().find((table) => table.label.toLowerCase() === key);
}

export function loadGuestOrderRequests() {
  return readArray<GuestOrderRequest>(GUEST_ORDER_STORAGE_KEY, []);
}

export function saveGuestOrderRequests(update: Updater<GuestOrderRequest>) {
  const next = updateArray<GuestOrderRequest>(GUEST_ORDER_STORAGE_KEY, update, []);
  notifyGuestOrdersChanged();
  return next;
}

export function upsertGuestOrderRequest(request: GuestOrderRequest) {
  const next = saveGuestOrderRequests((current) =>
    current.some((item) => item.id === request.id)
      ? current.map((item) => item.id === request.id ? request : item)
      : [request, ...current],
  );
  if (isSupabaseConfigured) {
    void upsertBackendGuestOrder(request).catch((error) => console.error("Supabase guest order sync failed", error));
  }
  return next;
}

export function updateGuestOrderStatus(id: string, status: GuestOrderStatus) {
  const next = saveGuestOrderRequests((current) =>
    current.map((item) => item.id === id ? { ...item, status } : item),
  );
  if (isSupabaseConfigured) {
    void updateBackendGuestOrderStatus(id, status).catch((error) => console.error("Supabase guest order status sync failed", error));
  }
  return next;
}

export function encodeGuestOrderQr(request: GuestOrderRequest) {
  const encoded = btoa(unescape(encodeURIComponent(JSON.stringify(request))));
  return `${ORDER_QR_PREFIX}${encoded}`;
}

export function decodeGuestOrderQr(value: string): GuestOrderRequest | null {
  const raw = value.trim();
  if (!raw.startsWith(ORDER_QR_PREFIX)) return null;

  try {
    const json = decodeURIComponent(escape(atob(raw.slice(ORDER_QR_PREFIX.length))));
    const parsed = JSON.parse(json) as GuestOrderRequest;
    if (!parsed.id || !parsed.tableNumber || !Array.isArray(parsed.items)) return null;
    return parsed;
  } catch {
    return null;
  }
}
