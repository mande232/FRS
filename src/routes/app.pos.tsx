import { createFileRoute, Link, useNavigate, useSearch } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import * as Icons from "lucide-react";
import { Card, PageHeader, Chip } from "@/components/ui-kit";
import { RealtimeBadge } from "@/components/realtime-badge";
import { PrintGatewayBadge } from "@/components/print-gateway-badge";
import {
  isFinalOrderStatus,
  type MenuItem,
  type Order,
  type Table,
} from "@/lib/demo-data";
import { formatETB } from "@/lib/ethiopic";
import { FOOD_COST_WARN_THRESHOLD } from "@/lib/business";
import { canApproveOrderReturns, canApproveWaiterBillTransfers, useAuth } from "@/lib/auth-context";
import { menuItemName, menuCategoryName, menuItemGlyph, orderLineName, selectText, useT } from "@/lib/i18n";
import { type AppLang, useLang } from "@/lib/lang-context";
import {
  computeRecipePortionsAvailable,
  convertStockQuantity,
  createDepartmentStockRequest,
  evaluatePosStockSale,
  findStockManagedItemForMenuItem,
  getLocationPolicy,
  isOperationalStockLocation,
  isGoatPoolSku,
  isPosStockDisconnectedMenuItem,
  normalizeInventorySettings,
  resolveMenuStockLocation,
  pickPreferredSourceStore,
  recordPosNegativeSaleAttempt,
  resolveEffectivePosOutOfStockBehavior,
  resolvePosAvailabilityStatus,
  stationToOperationalLocation,
  stockUnitFromOrderUnitLabel,
  isHalfBottleUnitLabel,
  suggestDepartmentRestockQuantity,
  toStockRequestRecord,
  type OperationalStockLocation,
  type PosAvailabilityStatus,
  type PosOutOfStockBehavior,
  type StockLocationBalance,
  type StockLot,
  type StockManagedItem,
  type StockRecipe,
  type StockUnitType,
  useStockManagementModule,
} from "@/lib/stock-management";
import { isPosMenuStockDisconnected } from "@/lib/system-settings";
import { useStore } from "@/lib/store";
import { resolveProductionStation, stationTone } from "@/lib/stations";
import {
  isButcherStation,
  isKitchenStation,
  preferencesForStation,
} from "@/lib/station-ticket-print";
import { translateBonoPreference } from "@/lib/station-ticket-i18n";
import {
  connectOrdersSocket,
  getRecentOrdersSocketEvents,
  subscribeOrdersSocket,
  type OrdersSocketEvent,
} from "@/lib/orders-realtime";
import { showError, showSuccess } from "@/lib/toast";
import { openBillsOwnedByWaiter, ordersWithPendingWaiterTransfer } from "@/lib/waiter-bill-transfer";
import { assignedWaiterMatches, waiterCanAccessAssignedTable } from "@/lib/waiter-identity";
import { isStaffConsumptionStationOrder } from "@/lib/staff-consumption";
import {
  canApproveReturnOrder,
  canAddItemsToOrder,
  canGenerateReceipt,
  canRequestReturnOrder,
  displayPaymentStatus,
  hasLiveBillBlockingSeat,
  matchesOpenBillDayScope,
  orderBusinessDayKey,
  paymentBadgeClass,
  returnQtyMapFromLines,
  statusBadgeClass,
  stillOccupiesTable,
  summarizeReturnRequestedLines,
} from "@/lib/orders-ops";
import { dateKey } from "@/lib/sales-analytics";
import {
  BillDialog,
  ReceiptDialog,
  type ReceiptView,
} from "@/components/order-bill-dialogs";
import { BonoStationActions } from "@/components/bono-station-actions";
import {
  StationTicketPreviewDialog,
  type StationTicketPreviewView,
} from "@/components/station-ticket-preview";
import {
  PosPrinterSetup,
  PosPrinterUnavailablePanel,
} from "@/components/pos-printer-setup";
import { appendPosPrinterAudit } from "@/lib/pos-printer-audit";
import {
  isPosPrinterVerifiedForOrdering,
  loadPosPrinterVerification,
  markPosPrinterUnavailable,
  probePosPrinterConnection,
  restorePosPrinterVerifiedAfterProbe,
  runPosPrinterTestPrint,
  type PosPrinterVerification,
} from "@/lib/pos-printer";

export const Route = createFileRoute("/app/pos")({
  validateSearch: (search: Record<string, unknown>) => ({
    table: typeof search.table === "string" ? search.table : undefined,
    area: typeof search.area === "string" ? search.area : undefined,
    waiter: typeof search.waiter === "string" ? search.waiter : undefined,
    orderId: typeof search.orderId === "string" ? search.orderId : undefined,
    mode: search.mode === "add" || search.mode === "create" ? search.mode : undefined,
  }),
  component: POS,
});

type Line = {
  item: MenuItem;
  qty: number;
  unitPrice: number;
  unitLabel?: string;
  qtyStep: number;
  preferences?: string[];
  note?: string;
};
type SpiritMode = "bottle" | "half" | "single" | "double";
type OpenBillQuickFilter = "all" | "pay" | "receipt" | "pending" | "return";
type OpenBillDayScope = "today" | "prior" | "all";
type OpenBillSort = "newest" | "table" | "amount" | "waiter";
type DraftSelection = { item: MenuItem; qty: number; mode: SpiritMode };
type PrepDraft = {
  item: MenuItem;
  qty: number;
  unitLabel?: string;
  qtyStep: number;
  preferences: string[];
  note: string;
  editKey?: string;
};
type ItemClickPopup = { name: string; qty: number; unitLabel?: string };
type StockQuickFilter = "all" | "available" | "low" | "out" | "in_cart";
const POS_PAGE_SIZE = 36;
const POS_LATIN_LETTERS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ".split("");
const TOUCH_BTN =
  "h-10 min-h-10 px-3 rounded-lg text-xs font-medium transition-colors inline-flex items-center justify-center gap-1.5 whitespace-nowrap";
const TOUCH_ICON_BTN =
  "size-10 shrink-0 grid place-items-center rounded-lg border border-border hover:bg-surface-2 transition-colors";

function itemAlphaKey(item: MenuItem, lang: AppLang) {
  const name = menuItemName(item, lang).trim();
  if (!name) return "#";
  const first = [...name][0] ?? "#";
  const upper = first.toLocaleUpperCase(lang === "am" ? "am-ET" : "en-US");
  if (/^[A-Z]$/.test(upper)) return upper;
  if (/\p{L}/u.test(upper)) return upper;
  return "#";
}

function stationAccentClass(tone: ReturnType<typeof stationTone>) {
  if (tone === "ember") return "bg-ember/60";
  if (tone === "teff") return "bg-teff/60";
  if (tone === "gold") return "bg-gold/60";
  return "bg-border";
}

function stationForItem(item: MenuItem, stations: readonly string[], area?: string) {
  return resolveProductionStation(item, stations, area);
}

function isButcherStationName(station: string) {
  const key = station.toLowerCase();
  return key.includes("butcher") || key.includes("meat") || key.includes("grill");
}

function isMeatMenuItem(item: MenuItem, stations: readonly string[]) {
  const category = item.category.trim().toLowerCase();
  return item.pricingMode === "kg" || category === "meat" || isButcherStationName(stationForItem(item, stations));
}

function isBonoMenuItem(item: MenuItem, stations: readonly string[], area?: string) {
  const station = stationForItem(item, stations, area);
  return isButcherStation(station) || isKitchenStation(station);
}

function isSpiritMenuItem(item: MenuItem) {
  const category = item.category.trim().toLowerCase();
  return category.includes("spirit") || category.includes("whisky") || category.includes("whiskey");
}

function isVipSeatingArea(area: string) {
  return area.trim().toLowerCase().includes("vip");
}

function itemPriceForArea(item: MenuItem, area: string) {
  if (isSpiritMenuItem(item)) return item.price;
  return isVipSeatingArea(area) && item.vipPrice != null ? item.vipPrice : item.price;
}

function linePriceForArea(line: Line, area: string) {
  if (isSpiritMenuItem(line.item)) return line.unitPrice;
  return isVipSeatingArea(area) && line.item.vipPrice != null ? line.item.vipPrice : line.item.price;
}

function spiritPourPrice(item: MenuItem, mode: SpiritMode): number | null {
  if (mode === "single") return item.singlePrice ?? null;
  if (mode === "double") return item.doublePrice ?? null;
  if (mode === "half") {
    if (item.halfBottlePrice != null) return item.halfBottlePrice;
    if (item.price > 0) return Math.round((item.price / 2) * 100) / 100;
    return null;
  }
  return item.price;
}

function spiritModeEnabled(item: MenuItem, mode: SpiritMode) {
  if (mode === "bottle") return item.price > 0;
  if (mode === "half") return spiritPourPrice(item, "half") != null;
  return spiritPourPrice(item, mode) != null;
}

function itemQtyStep(item: MenuItem, stations: readonly string[]) {
  if (isMeatMenuItem(item, stations)) return 0.25;
  return 1;
}

function nextMeatQty(currentQty: number) {
  if (currentQty <= 0.25) return 0;
  if (currentQty <= 0.5) return 0.25;
  if (currentQty <= 1) return 0.5;
  return normalizeQty(currentQty - 0.25);
}

function normalizeQty(value: number) {
  return Math.round(value * 1000) / 1000;
}

function formatLineQty(line: Line) {
  const value = line.qty.toLocaleString(undefined, { maximumFractionDigits: 3 });
  return line.unitLabel ? `${value} ${line.unitLabel}` : value;
}

function formatOrderQty(qty: number, unitLabel?: string) {
  const value = qty.toLocaleString(undefined, { maximumFractionDigits: 3 });
  return unitLabel ? `${value} ${unitLabel}` : value;
}

function itemUnitLabel(item: MenuItem, stations: readonly string[]) {
  if (isMeatMenuItem(item, stations)) return `per ${item.unitLabel ?? "kg"}`;
  if (isSpiritMenuItem(item)) {
    const parts: string[] = [];
    if (item.singlePrice != null) parts.push("Single");
    if (item.doublePrice != null) parts.push("Double");
    parts.push("Half", "Bottle");
    return parts.join(" / ");
  }
  return item.unitLabel ?? "each";
}

function getSpiritPrice(item: MenuItem, mode: SpiritMode) {
  return spiritPourPrice(item, mode) ?? item.price;
}

function getSpiritUnitLabel(mode: SpiritMode) {
  if (mode === "single") return "Single Shot";
  if (mode === "double") return "Double Shot";
  if (mode === "half") return "Half Bottle";
  return "Bottle";
}

function lineQtyInStockUnits(
  line: Pick<Line, "item" | "qty" | "unitLabel">,
  stockItem: StockManagedItem | undefined,
  stations: readonly string[],
): number {
  if (!stockItem || !isSpiritMenuItem(line.item)) return line.qty;
  if (isHalfBottleUnitLabel(line.unitLabel)) {
    return normalizeQty(line.qty * 0.5);
  }
  const soldUnit = stockUnitFromOrderUnitLabel(line.unitLabel) ?? stockItem.baseUnit;
  if (soldUnit === stockItem.baseUnit) return line.qty;
  const asBase = convertStockQuantity(stockItem, line.qty, soldUnit, stockItem.baseUnit);
  return Number.isFinite(asBase) ? normalizeQty(asBase) : line.qty;
}

function openBillSearchHaystack(order: Order) {
  return [
    order.orderNo,
    order.area,
    order.tableNumber,
    order.waiter,
    order.orderedByWaiter,
    order.receiptNumber,
    order.receipt?.receiptNumber,
    order.status,
    ...order.items.map((line) => line.name),
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
}

function matchesOpenBillQuickFilter(order: Order, filter: OpenBillQuickFilter) {
  switch (filter) {
    case "pay":
      return Boolean(order.receipt) && order.status !== "PENDING_CASHIER";
    case "receipt":
      return !order.receipt && order.status !== "PENDING_CASHIER" && canGenerateReceipt(order);
    case "pending":
      return order.status === "PENDING_CASHIER";
    case "return":
      return Boolean(order.returnRequestedBy);
    default:
      return true;
  }
}

function sortOpenBills(orders: readonly Order[], sort: OpenBillSort) {
  const list = [...orders];
  switch (sort) {
    case "table":
      return list.sort((a, b) =>
        `${a.area} ${a.tableNumber}`.localeCompare(`${b.area} ${b.tableNumber}`, undefined, {
          numeric: true,
          sensitivity: "base",
        }),
      );
    case "amount":
      return list.sort((a, b) => b.total - a.total);
    case "waiter":
      return list.sort((a, b) =>
        (a.waiter || "").localeCompare(b.waiter || "", undefined, { sensitivity: "base" }),
      );
    case "newest":
    default:
      return list.sort((a, b) => {
        const aTime = Date.parse(a.createdAtIso || a.sentAt || "") || 0;
        const bTime = Date.parse(b.createdAtIso || b.sentAt || "") || 0;
        return bTime - aTime;
      });
  }
}

function buildPaginationSteps(currentPage: number, totalPages: number): Array<number | "ellipsis"> {
  if (totalPages <= 7) {
    return Array.from({ length: totalPages }, (_, index) => index + 1);
  }

  const pages = new Set<number>([1, totalPages]);
  if (currentPage <= 4) {
    for (let page = 2; page <= Math.min(5, totalPages - 1); page += 1) pages.add(page);
  } else if (currentPage >= totalPages - 3) {
    for (let page = Math.max(2, totalPages - 4); page <= totalPages - 1; page += 1) pages.add(page);
  } else {
    for (let page = currentPage - 1; page <= currentPage + 1; page += 1) pages.add(page);
  }

  const sorted = [...pages].sort((a, b) => a - b);
  return sorted.reduce<Array<number | "ellipsis">>((result, page) => {
    const last = result[result.length - 1];
    if (typeof last === "number" && page - last > 1) result.push("ellipsis");
    result.push(page);
    return result;
  }, []);
}

function cartItemSummary(cart: Line[], item: MenuItem) {
  const matches = cart.filter((line) => line.item.id === item.id);
  const qty = matches.reduce((sum, line) => sum + line.qty, 0);
  const total = matches.reduce((sum, line) => sum + line.qty * line.unitPrice, 0);
  return { qty: normalizeQty(qty), total, count: matches.length };
}

function orderStatusLabel(status: Order["status"], lang: AppLang) {
  if (status === "PENDING_CASHIER") return selectText(lang, "Waiting cashier", "ካሸር እየጠበቀ");
  if (status === "NEW") return selectText(lang, "New", "አዲስ");
  if (status === "PARTIALLY READY") return selectText(lang, "Partially ready", "በከፊል ዝግጁ");
  if (status === "READY TO SERVE") return selectText(lang, "Ready to serve", "ለማቅረብ ዝግጁ");
  if (status === "RECEIPT_GENERATED") return selectText(lang, "Receipt generated", "ደረሰኝ ተፈጥሯል");
  if (status === "CLOSED") return selectText(lang, "Closed", "ተዘግቷል");
  if (status === "CANCELLED") return selectText(lang, "Cancelled", "ተሰርዟል");
  return status;
}

function namesMatch(left?: string | null, right?: string | null) {
  return (left ?? "").trim().toLowerCase() === (right ?? "").trim().toLowerCase();
}

function findTableByLabelArea(
  tables: readonly Table[],
  label: string,
  areaName?: string,
) {
  const withArea = tables.find(
    (row) => namesMatch(row.label, label) && (!areaName || namesMatch(row.area, areaName)),
  );
  if (withArea) return withArea;
  return tables.find((row) => namesMatch(row.label, label)) ?? null;
}

/** Waiters may only sell to tables assigned to them (table.server) or with their open bill. */
function tablesAvailableToWaiter(
  tables: readonly Table[],
  orders: readonly Order[],
  waiter: { name?: string | null; email?: string | null } | string,
) {
  const identity = typeof waiter === "string" ? { name: waiter } : waiter;
  if (!identity.name?.trim() && !identity.email?.trim()) return [];
  return tables.filter((table) => waiterCanAccessAssignedTable(identity, table, orders));
}

function uniqueNames(names: readonly string[]) {
  const seen = new Set<string>();
  return names.reduce<string[]>((items, name) => {
    const value = name.trim();
    const key = value.toLowerCase();
    if (!value || seen.has(key)) return items;
    seen.add(key);
    return [...items, value];
  }, []);
}

function normalizedKey(value: string) {
  return value.trim().toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

function findStockBalance(
  balances: StockLocationBalance[],
  item: Pick<StockManagedItem, "id" | "preferredLocation">,
  location?: string | null,
  options?: { strictLocation?: boolean },
) {
  if (location) {
    const exact = balances.find((row) => row.itemId === item.id && row.location === location);
    if (exact) return exact;
    if (options?.strictLocation) return undefined;
  }
  const preferred = balances.find(
    (row) => row.itemId === item.id && row.location === item.preferredLocation,
  );
  if (preferred) return preferred;
  return balances.find((row) => row.itemId === item.id);
}

function availableMenuQtyFromRecipe(
  recipe: StockRecipe,
  stockItemsById: Map<string, StockManagedItem>,
  balances: StockLocationBalance[],
) {
  const items = [...stockItemsById.values()];
  const result = computeRecipePortionsAvailable(recipe, items, balances);
  return result;
}

function availableMenuQtyFromDirectStock(
  stockItem: StockManagedItem,
  balances: StockLocationBalance[],
  location?: string | null,
  lots: StockLot[] = [],
) {
  if (isGoatPoolSku(stockItem.id)) {
    const butcherLots = lots.filter(
      (lot) =>
        lot.itemId === stockItem.id &&
        lot.location === "Butcher" &&
        lot.status === "Available",
    );
    if (butcherLots.length > 0 || lots.some((lot) => lot.itemId === stockItem.id)) {
      const lotQty = normalizeQty(butcherLots.reduce((sum, lot) => sum + lot.quantity, 0));
      const reservedQty = normalizeQty(
        balances.find((row) => row.itemId === stockItem.id && row.location === "Butcher")?.reservedQuantity ?? 0,
      );
      return {
        availableQty: normalizeQty(Math.max(0, lotQty - reservedQty)),
        reservedQty,
        reorderLevel:
          balances.find((row) => row.itemId === stockItem.id && row.location === "Butcher")?.reorderLevel ??
          stockItem.reorderLevel ??
          0,
        balance: balances.find((row) => row.itemId === stockItem.id && row.location === "Butcher"),
      };
    }
  }

  const strictLocation = Boolean(location && isOperationalStockLocation(location as OperationalStockLocation));
  const balance = findStockBalance(balances, stockItem, location, { strictLocation });
  const availableQty = balance
    ? normalizeQty(Math.max(0, balance.availableQuantity ?? balance.quantity ?? 0))
    : strictLocation
      ? 0
      : normalizeQty(Math.max(0, stockItem.currentStock ?? 0));
  return {
    availableQty,
    reservedQty: normalizeQty(balance?.reservedQuantity ?? 0),
    reorderLevel: balance?.reorderLevel ?? stockItem.reorderLevel ?? 0,
    balance,
  };
}

function availabilityLabel(status: PosAvailabilityStatus | null, t: ReturnType<typeof useT>) {
  if (status === "In Stock") return t("In Stock", "በክምችት");
  if (status === "Low") return t("Low", "ዝቅተኛ");
  if (status === "Out") return t("Out", "አልቋል");
  if (status === "Insufficient Ingredients") return t("Insufficient Ingredients", "ንጥረ ነገር አይበቃም");
  if (status === "Temporarily Blocked") return t("Temporarily Blocked", "ለጊዜው ታግዷል");
  return "";
}

function availabilityTone(status: PosAvailabilityStatus | null): "teff" | "gold" | "destructive" | "muted" {
  if (status === "In Stock") return "teff";
  if (status === "Low") return "gold";
  if (status === "Out" || status === "Insufficient Ingredients" || status === "Temporarily Blocked") return "destructive";
  return "muted";
}

function POS() {
  const store = useStore();
  const stockModule = useStockManagementModule();
  const { user, users } = useAuth();
  const t = useT();
  const lang = useLang();
  const navigate = useNavigate({ from: "/app/pos" });
  const posSearch = useSearch({ from: "/app/pos" });
  const activeUserName =
    user?.name?.trim() ||
    (user?.email?.includes("@") ? user.email.split("@")[0]!.trim() : user?.email?.trim()) ||
    "Staff";
  const canSendToStations = user?.role === "Cashier" || user?.role === "Branch Manager";
  const canManageBills = canSendToStations;
  const canApproveReturns = canApproveOrderReturns(user?.role);
  const canApproveTransfers = canApproveWaiterBillTransfers(user?.role);
  const isWaiter = user?.role === "Waiter";
  const canUseReturns = canManageBills || canApproveReturns || isWaiter;
  /** Waiters originate live bills: KDS tickets + paper Bono. Other non-cashier roles still send to cashier. */
  const createsLiveOrder = canSendToStations || isWaiter;
  const sendsToCashier = !createsLiveOrder;
  const cashierName = canSendToStations || isWaiter
    ? activeUserName
    : t("Pending cashier", "ካሸር እየተጠበቀ");
  const [search, setSearch] = useState("");
  const [area, setArea] = useState(() => posSearch.area?.trim() || "Main Hall");
  const [tableNumber, setTableNumber] = useState(() => posSearch.table?.trim() || "");
  const [waiter, setWaiter] = useState(() => posSearch.waiter?.trim() || "");
  const [cart, setCart] = useState<Line[]>([]);
  const [page, setPage] = useState(1);
  const [draftSelection, setDraftSelection] = useState<DraftSelection | null>(null);
  const [prepDraft, setPrepDraft] = useState<PrepDraft | null>(null);
  const [lastSent, setLastSent] = useState<Order | null>(null);
  const [paymentOrder, setPaymentOrder] = useState<Order | null>(null);
  const [receiptView, setReceiptView] = useState<ReceiptView | null>(null);
  const [ticketPreview, setTicketPreview] = useState<StationTicketPreviewView | null>(null);
  const [returnDialog, setReturnDialog] = useState<{
    orderId: string;
    orderNo: string;
    requestedBy?: string;
    pending?: boolean;
  } | null>(null);
  const [returnReason, setReturnReason] = useState("");
  const [returnQtys, setReturnQtys] = useState<Record<number, number>>({});
  const [restorePackagedStock, setRestorePackagedStock] = useState(false);
  const [skippedStockItems, setSkippedStockItems] = useState<string[]>([]);
  const [stockWarning, setStockWarning] = useState<string | null>(null);
  const [managerStockOverride, setManagerStockOverride] = useState(false);
  const [itemClickPopup, setItemClickPopup] = useState<ItemClickPopup | null>(null);
  const [restockDialog, setRestockDialog] = useState<{
    itemId: string;
    itemName: string;
    department: OperationalStockLocation;
    suggestedQty: number;
    unit: string;
    store1Qty: number;
    store2Qty: number;
    sourceStore: "Store 1" | "Store 2";
  } | null>(null);
  const [restockQty, setRestockQty] = useState(0);
  const [stationFilter, setStationFilter] = useState<string>("All");
  const [letterFilter, setLetterFilter] = useState<string>("All");
  const [stockFilter, setStockFilter] = useState<StockQuickFilter>("all");
  const [liveEvents, setLiveEvents] = useState<OrdersSocketEvent[]>(() => getRecentOrdersSocketEvents());
  const [mobileCartOpen, setMobileCartOpen] = useState(false);
  const [transferOpen, setTransferOpen] = useState(false);
  const [transferFrom, setTransferFrom] = useState("");
  const [transferTo, setTransferTo] = useState("");
  const [transferSelectedIds, setTransferSelectedIds] = useState<Set<string>>(new Set());
  const [addingToOrder, setAddingToOrder] = useState<Order | null>(null);
  const [feedExpanded, setFeedExpanded] = useState(false);
  const [printerVerification, setPrinterVerification] = useState<PosPrinterVerification>(() =>
    loadPosPrinterVerification(),
  );
  const [printerProbeBusy, setPrinterProbeBusy] = useState(false);
  const printerReadyForWaiter = !isWaiter || isPosPrinterVerifiedForOrdering(printerVerification);
  const printerUnavailable = isWaiter && printerVerification.status === "unavailable";
  const showPrinterSetupGate = isWaiter && !isPosPrinterVerifiedForOrdering(printerVerification);
  const [openBillSearch, setOpenBillSearch] = useState("");
  const [openBillAreaFilter, setOpenBillAreaFilter] = useState("All");
  const [openBillWaiterFilter, setOpenBillWaiterFilter] = useState("All");
  const [openBillQuickFilter, setOpenBillQuickFilter] = useState<OpenBillQuickFilter>("all");
  const [openBillDayScope, setOpenBillDayScope] = useState<OpenBillDayScope>("today");
  const [openBillSort, setOpenBillSort] = useState<OpenBillSort>("newest");
  const sendInFlightRef = useRef(false);
  const [isSending, setIsSending] = useState(false);

  const stationScopedItems = useMemo(() => {
    let list = store.menuItems;
    if (stationFilter !== "All") {
      list = list.filter((item) => stationForItem(item, store.menuStations, area) === stationFilter);
    }
    if (search) {
      const needle = search.toLowerCase();
      list = list.filter(
        (m) =>
          m.name_en.toLowerCase().includes(needle) ||
          (m.name_am ?? "").toLowerCase().includes(needle) ||
          menuItemName(m, "am").toLowerCase().includes(needle) ||
          menuCategoryName(m.category, "am").toLowerCase().includes(needle),
      );
    }
    return list;
  }, [area, search, stationFilter, store.menuItems, store.menuStations]);

  const letterOptions = useMemo(() => {
    const counts = new Map<string, number>();
    for (const item of stationScopedItems) {
      const key = itemAlphaKey(item, lang);
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }
    if (lang === "am") {
      return [...counts.keys()].sort((left, right) => {
        if (left === "#") return 1;
        if (right === "#") return -1;
        return left.localeCompare(right, "am-ET");
      });
    }
    const latin = POS_LATIN_LETTERS.filter((letter) => (counts.get(letter) ?? 0) > 0);
    return counts.has("#") ? [...latin, "#"] : latin;
  }, [lang, stationScopedItems]);

  const filteredItems = useMemo(() => {
    let list = stationScopedItems;
    if (letterFilter !== "All") {
      list = list.filter((item) => itemAlphaKey(item, lang) === letterFilter);
    }
    return [...list].sort((left, right) =>
      menuItemName(left, lang).localeCompare(menuItemName(right, lang), lang === "am" ? "am-ET" : "en-US"),
    );
  }, [lang, letterFilter, stationScopedItems]);
  const itemLabel = (item: MenuItem) => menuItemName(item, lang);
  const stockItemsById = useMemo(
    () => new Map(stockModule.items.map((item) => [item.id, item] as const)),
    [stockModule.items],
  );
  const stockRecipesByMenuName = useMemo(
    () => new Map(stockModule.recipes.map((recipe) => [normalizedKey(recipe.menuItemName), recipe] as const)),
    [stockModule.recipes],
  );

  const getAvailableStockForMenuItem = useMemo(() => {
    return (item: MenuItem) => {
      if (isPosMenuStockDisconnected() || isPosStockDisconnectedMenuItem(item.id, item.name_en)) {
        return {
          tracked: false,
          availableQty: null as number | null,
          reservedQty: 0,
          reorderLevel: 0,
          source: null,
          location: null as string | null,
          bottleneckItemId: null as string | null,
          bottleneckItemName: null as string | null,
          stockItemId: null as string | null,
        };
      }
      const directStockItem = findStockManagedItemForMenuItem(stockModule.items, item);
      const deductionLocation = resolveMenuStockLocation({
        station: item.station,
        stockDeductionLocation: item.stockDeductionLocation,
        menuCategory: item.category,
        stockPreferredLocation: directStockItem?.preferredLocation,
      }) ?? undefined;
      const recipe = stockRecipesByMenuName.get(normalizedKey(item.name_en));
      if (recipe || item.stockDeductionRule === "recipe") {
        if (recipe) {
          const recipeAvailability = availableMenuQtyFromRecipe(recipe, stockItemsById, stockModule.balances);
          if (recipeAvailability.portions != null) {
            return {
              tracked: true,
              availableQty: recipeAvailability.portions,
              reservedQty: 0,
              reorderLevel: item.minimumStock ?? 0,
              source: "recipe" as const,
              location: deductionLocation ?? recipe.stockDeductionLocation ?? null,
              bottleneckItemId: recipeAvailability.bottleneckItemId,
              bottleneckItemName: recipeAvailability.bottleneckItemName,
              stockItemId: recipeAvailability.bottleneckItemId,
            };
          }
        }
      }

      if (directStockItem) {
        const location = isGoatPoolSku(directStockItem.id)
          ? "Butcher"
          : deductionLocation;
        const direct = availableMenuQtyFromDirectStock(
          directStockItem,
          stockModule.balances,
          location,
          stockModule.lots,
        );
        return {
          tracked: true,
          availableQty: direct.availableQty,
          reservedQty: direct.reservedQty,
          reorderLevel: direct.reorderLevel,
          source: "direct" as const,
          location: location ?? directStockItem.preferredLocation ?? null,
          bottleneckItemId: null as string | null,
          bottleneckItemName: null as string | null,
          stockItemId: directStockItem.id,
        };
      }

      return {
        tracked: false,
        availableQty: null,
        reservedQty: 0,
        reorderLevel: 0,
        source: null,
        location: null,
        bottleneckItemId: null as string | null,
        bottleneckItemName: null as string | null,
        stockItemId: null as string | null,
      };
    };
  }, [stockModule.balances, stockModule.items, stockModule.lots, stockItemsById, stockRecipesByMenuName]);

  const inventorySettings = useMemo(
    () => normalizeInventorySettings(stockModule.settings),
    [stockModule.settings],
  );

  function getRemainingStockForItem(item: MenuItem, nextQty = 0, nextUnitLabel?: string) {
    const stockInfo = getAvailableStockForMenuItem(item);
    const stockItem = findStockManagedItemForMenuItem(stockModule.items, item);
    if (!stockInfo.tracked || stockInfo.availableQty == null) {
      return { ...stockInfo, remainingQty: null, cartReservedQty: 0, status: null as PosAvailabilityStatus | null };
    }
    const cartReservedQty = normalizeQty(
      cart
        .filter((line) => line.item.id === item.id)
        .reduce((sum, line) => sum + lineQtyInStockUnits(line, stockItem, store.menuStations), 0),
    );
    const nextQtyInStockUnits =
      nextQty > 0
        ? lineQtyInStockUnits(
            { item, qty: nextQty, unitLabel: nextUnitLabel },
            stockItem,
            store.menuStations,
          )
        : 0;
    const remainingQty = normalizeQty(stockInfo.availableQty - cartReservedQty - nextQtyInStockUnits);
    const behavior = resolveEffectivePosOutOfStockBehavior(
      inventorySettings,
      item.outOfStockBehavior as PosOutOfStockBehavior | undefined,
    );
    const status = resolvePosAvailabilityStatus({
      tracked: true,
      availableQty: stockInfo.availableQty,
      remainingQty,
      minimumStock: item.minimumStock,
      reorderLevel: stockInfo.reorderLevel,
      source: stockInfo.source,
      behavior,
    });
    return {
      ...stockInfo,
      cartReservedQty: normalizeQty(cartReservedQty),
      remainingQty,
      status,
    };
  }

  function resolveSalePolicy(item: MenuItem, remainingQty: number | null, tracked: boolean) {
    const behavior = resolveEffectivePosOutOfStockBehavior(
      inventorySettings,
      item.outOfStockBehavior as PosOutOfStockBehavior | undefined,
    );
    return {
      behavior,
      decision: evaluatePosStockSale({
        behavior,
        remainingQty,
        tracked,
        role: user?.role,
        managerApproved: managerStockOverride,
      }),
    };
  }

  const stockFilteredItems = useMemo(() => {
    if (stockFilter === "all") return filteredItems;
    return filteredItems.filter((item) => {
      const stockInfo = getRemainingStockForItem(item);
      const inCart = cart.some((line) => line.item.id === item.id);
      if (stockFilter === "in_cart") return inCart;
      if (!stockInfo.tracked) return stockFilter === "available";
      const status = stockInfo.status;
      if (stockFilter === "out") return status === "Out" || status === "Insufficient Ingredients";
      if (stockFilter === "low") return status === "Low";
      if (stockFilter === "available") {
        return status === "In Stock" || status == null;
      }
      return true;
    });
  }, [cart, filteredItems, stockFilter, getAvailableStockForMenuItem, inventorySettings, managerStockOverride, user?.role]);

  const totalPages = Math.max(1, Math.ceil(stockFilteredItems.length / POS_PAGE_SIZE));
  const currentPage = Math.min(page, totalPages);
  const pageItems = useMemo(() => {
    const start = (currentPage - 1) * POS_PAGE_SIZE;
    return stockFilteredItems.slice(start, start + POS_PAGE_SIZE);
  }, [currentPage, stockFilteredItems]);
  const pageSteps = useMemo(
    () => buildPaginationSteps(currentPage, totalPages),
    [currentPage, totalPages],
  );
  const startRow = stockFilteredItems.length === 0 ? 0 : (currentPage - 1) * POS_PAGE_SIZE + 1;
  const endRow = Math.min(currentPage * POS_PAGE_SIZE, stockFilteredItems.length);

  const cartStockIssues = useMemo(() => {
    const demandByItem = new Map<string, number>();
    for (const line of cart) {
      const stockItem = findStockManagedItemForMenuItem(stockModule.items, line.item);
      const demand = lineQtyInStockUnits(line, stockItem, store.menuStations);
      demandByItem.set(line.item.id, normalizeQty((demandByItem.get(line.item.id) ?? 0) + demand));
    }
    return cart.flatMap((line) => {
      const stockInfo = getAvailableStockForMenuItem(line.item);
      if (!stockInfo.tracked || stockInfo.availableQty == null) return [];
      const totalDemand = demandByItem.get(line.item.id) ?? 0;
      const remainingQty = normalizeQty(stockInfo.availableQty - totalDemand);
      if (remainingQty >= 0) return [];
      const { behavior, decision } = resolveSalePolicy(line.item, remainingQty, true);
      if (decision.allowed) return [];
      return [{
        item: line.item,
        availableQty: stockInfo.availableQty,
        requestedQty: totalDemand,
        behavior,
        requiresManager: decision.requiresManager,
        reason: decision.reason,
      }];
    });
  }, [cart, getAvailableStockForMenuItem, inventorySettings, managerStockOverride, user?.role, stockModule.items, store.menuStations]);
  const hasCartStockConflict = cartStockIssues.length > 0;
  const cartNeedsManagerOverride = cartStockIssues.some((issue) => issue.requiresManager);

  const pendingCashierOrders = useMemo(
    () => store.orders.filter((order) => order.status === "PENDING_CASHIER"),
    [store.orders],
  );
  const openOrders = useMemo(
    () =>
      store.orders.filter(
        (order) =>
          !isFinalOrderStatus(order.status) &&
          order.paymentStatus !== "Paid" &&
          !isStaffConsumptionStationOrder(order),
      ),
    [store.orders],
  );
  const visibleOpenOrders = useMemo(
    () =>
      canManageBills
        ? openOrders
        : openOrders.filter(
            (order) =>
              assignedWaiterMatches(order.waiter, user) ||
              assignedWaiterMatches(order.orderedByWaiter, user),
          ),
    [canManageBills, openOrders, user],
  );
  const openBillTodayKey = dateKey();
  const priorOpenBillCount = useMemo(
    () =>
      visibleOpenOrders.filter((order) => matchesOpenBillDayScope(order, "prior", openBillTodayKey))
        .length,
    [openBillTodayKey, visibleOpenOrders],
  );
  const openBillAreaOptions = useMemo(
    () => ["All", ...uniqueNames(visibleOpenOrders.map((order) => order.area))],
    [visibleOpenOrders],
  );
  const openBillWaiterOptions = useMemo(
    () => ["All", ...uniqueNames(visibleOpenOrders.map((order) => order.waiter))],
    [visibleOpenOrders],
  );
  const filteredOpenOrders = useMemo(() => {
    const needle = openBillSearch.trim().toLowerCase();
    const filtered = visibleOpenOrders.filter((order) => {
      if (!matchesOpenBillDayScope(order, openBillDayScope, openBillTodayKey)) return false;
      if (openBillAreaFilter !== "All" && !namesMatch(order.area, openBillAreaFilter)) return false;
      if (openBillWaiterFilter !== "All" && !assignedWaiterMatches(order.waiter, openBillWaiterFilter)) {
        return false;
      }
      if (!matchesOpenBillQuickFilter(order, openBillQuickFilter)) return false;
      if (needle && !openBillSearchHaystack(order).includes(needle)) return false;
      return true;
    });
    return sortOpenBills(filtered, openBillSort);
  }, [
    openBillAreaFilter,
    openBillDayScope,
    openBillQuickFilter,
    openBillSearch,
    openBillSort,
    openBillTodayKey,
    openBillWaiterFilter,
    visibleOpenOrders,
  ]);
  const openBillFiltersActive =
    Boolean(openBillSearch.trim()) ||
    openBillAreaFilter !== "All" ||
    openBillWaiterFilter !== "All" ||
    openBillQuickFilter !== "all" ||
    openBillDayScope !== "today" ||
    openBillSort !== "newest";
  const canTransferBills = isWaiter || canManageBills;
  const subtotal = cart.reduce((sum, line) => sum + line.unitPrice * line.qty, 0);
  const cartLineCount = cart.reduce((sum, line) => sum + line.qty, 0);
  const sendActionLabel = addingToOrder
    ? t("Add to bill & print Bono", "ወደ ሂሳብ አክል እና ቦኖ አትም")
    : sendsToCashier
      ? t("Send to cashier", "ወደ ካሸር ላክ")
      : t("Create & print Bono", "ፍጠር እና ቦኖ አትም");
  const cartStations = useMemo(
    () => uniqueNames(cart.map((line) => stationForItem(line.item, store.menuStations, area))),
    [area, cart, store.menuStations],
  );
  const occupiedInArea = store.tables.filter(
    (table) => table.area === area && table.status === "Occupied",
  ).length;

  useEffect(() => {
    if (openBillAreaFilter !== "All" && !openBillAreaOptions.includes(openBillAreaFilter)) {
      setOpenBillAreaFilter("All");
    }
  }, [openBillAreaFilter, openBillAreaOptions]);

  useEffect(() => {
    if (openBillWaiterFilter !== "All" && !openBillWaiterOptions.includes(openBillWaiterFilter)) {
      setOpenBillWaiterFilter("All");
    }
  }, [openBillWaiterFilter, openBillWaiterOptions]);

  useEffect(() => {
    setPage(1);
  }, [search, stationFilter, letterFilter, stockFilter, area]);

  useEffect(() => {
    if (letterFilter === "All") return;
    if (!letterOptions.includes(letterFilter)) setLetterFilter("All");
  }, [letterFilter, letterOptions]);

  useEffect(() => {
    let active = true;
    let disconnect: (() => void) | undefined;
    void connectOrdersSocket().then((fn) => {
      if (active) disconnect = fn;
      else fn?.();
    });
    const unsubscribe = subscribeOrdersSocket((event) => {
      setLiveEvents((prev) => [event, ...prev].slice(0, 30));
    });
    return () => {
      active = false;
      unsubscribe();
      disconnect?.();
    };
  }, []);

  const allWaiterNames = useMemo(() => {
    const staffWaiters = users
      .filter((staffUser) => staffUser.role === "Waiter")
      .map((staffUser) => staffUser.name);
    return uniqueNames([...(isWaiter ? [activeUserName] : []), ...staffWaiters]).sort((a, b) =>
      a.localeCompare(b),
    );
  }, [activeUserName, isWaiter, users]);

  /** Order creation: cashiers/managers only pick waiters who already have a table. */
  const waiterOptions = useMemo(() => {
    if (isWaiter) return allWaiterNames;
    const assigned = allWaiterNames.filter(
      (name) => tablesAvailableToWaiter(store.tables, store.orders, name).length > 0,
    );
    const requested = (posSearch.waiter || waiter).trim();
    if (!requested) return assigned;
    const extra =
      allWaiterNames.find((name) => namesMatch(name, requested)) ?? requested;
    if (!assigned.some((name) => namesMatch(name, extra))) {
      return [...assigned, extra].sort((a, b) => a.localeCompare(b));
    }
    return assigned;
  }, [allWaiterNames, isWaiter, posSearch.waiter, store.orders, store.tables, waiter]);

  /** Bill transfer: cashiers/managers need the full waiter list (from + to). */
  const transferWaiterOptions = allWaiterNames;

  const selectedWaiter = isWaiter
    ? activeUserName
    : waiterOptions.find((name) => namesMatch(name, waiter)) ?? "";
  const transferSourceWaiter = isWaiter ? activeUserName : transferFrom || selectedWaiter;
  const transferCandidateBills = useMemo(
    () => openBillsOwnedByWaiter(openOrders, transferSourceWaiter),
    [openOrders, transferSourceWaiter],
  );
  const pendingTransferGroups = useMemo(() => {
    if (!canApproveTransfers) return [] as Array<{ from: string; to: string; orderIds: string[]; bills: Order[] }>;
    const pending = ordersWithPendingWaiterTransfer(store.orders);
    const groups = new Map<string, { from: string; to: string; orderIds: string[]; bills: Order[] }>();
    for (const order of pending) {
      const from = order.waiter.trim();
      const to = order.waiterTransferRequestedTo?.trim() || "";
      if (!from || !to) continue;
      const key = `${from.toLowerCase()}=>${to.toLowerCase()}`;
      const current = groups.get(key) ?? { from, to, orderIds: [], bills: [] };
      current.orderIds.push(order.id);
      current.bills.push(order);
      groups.set(key, current);
    }
    return [...groups.values()];
  }, [canApproveTransfers, store.orders]);
  const pendingReturnOrders = useMemo(
    () =>
      canApproveReturns
        ? store.orders.filter((order) => canApproveReturnOrder(order))
        : [],
    [canApproveReturns, store.orders],
  );

  /** Floor seats for POS: waiters = assigned only; cashiers also get unassigned free seats. */
  const assignedTables = useMemo(() => {
    const waiterIdentity = isWaiter
      ? { name: activeUserName, email: user?.email }
      : { name: selectedWaiter };
    if (!(selectedWaiter || isWaiter)) return [];
    const forWaiter = tablesAvailableToWaiter(store.tables, store.orders, waiterIdentity);
    if (isWaiter) return forWaiter;

    const seen = new Set(forWaiter.map((table) => table.id));
    const unassignedFree = store.tables.filter((table) => {
      if (seen.has(table.id)) return false;
      if (table.server?.trim()) return false;
      const blocked = store.orders.some(
        (order) =>
          hasLiveBillBlockingSeat(order) &&
          namesMatch(order.area, table.area) &&
          namesMatch(order.tableNumber, table.label),
      );
      return !blocked;
    });
    return [...forWaiter, ...unassignedFree];
  }, [
    store.tables,
    store.orders,
    selectedWaiter,
    isWaiter,
    activeUserName,
    user?.email,
  ]);
  const selectedFloorTable = useMemo(
    () =>
      store.tables.find(
        (table) => namesMatch(table.area, area) && namesMatch(table.label, tableNumber),
      ) ?? null,
    [store.tables, area, tableNumber],
  );
  const selectedAssignedTable = useMemo(
    () =>
      assignedTables.find(
        (table) => namesMatch(table.area, area) && namesMatch(table.label, tableNumber),
      ) ?? selectedFloorTable,
    [assignedTables, selectedFloorTable, area, tableNumber],
  );
  const selectedTableClaimable = useMemo(() => {
    if (!tableNumber?.trim() || !selectedWaiter) return false;
    const identity = isWaiter ? user : { name: selectedWaiter };
    if (!identity) return false;

    // Waiters: only assigned seats (or seats with their live bill).
    if (isWaiter) {
      if (selectedFloorTable) {
        return waiterCanAccessAssignedTable(identity, selectedFloorTable, store.orders);
      }
      // Deep-linked seat not on floor yet — deny until assignment exists.
      return false;
    }

    // Cashiers/managers: seat must be unassigned or assigned to the selected waiter,
    // and must not have another waiter's live bill.
    if (selectedFloorTable?.server?.trim()) {
      if (!assignedWaiterMatches(selectedFloorTable.server, identity)) return false;
    }
    if (
      selectedFloorTable?.status === "Available" ||
      selectedFloorTable?.status === "Cleaning" ||
      !selectedFloorTable
    ) {
      return true;
    }
    const foreignLive = store.orders.some(
      (order) =>
        hasLiveBillBlockingSeat(order) &&
        namesMatch(order.area, area) &&
        namesMatch(order.tableNumber, tableNumber) &&
        !(
          assignedWaiterMatches(order.waiter, identity) ||
          assignedWaiterMatches(order.orderedByWaiter, identity)
        ),
    );
    return !foreignLive;
  }, [
    tableNumber,
    selectedWaiter,
    selectedFloorTable,
    store.orders,
    area,
    isWaiter,
    user,
  ]);
  const posSessionReady = Boolean(selectedWaiter && tableNumber && selectedTableClaimable);
  const sendBusy = isSending;
  const sendDisabled =
    sendBusy ||
    cart.length === 0 ||
    !tableNumber ||
    !selectedWaiter ||
    hasCartStockConflict ||
    !selectedTableClaimable ||
    (isWaiter && (!printerReadyForWaiter || printerUnavailable));
  const sendButtonLabel = sendBusy ? t("Sending…", "በመላክ ላይ…") : sendActionLabel;

  useEffect(() => {
    if (isWaiter) return;
    if (posSearch.waiter || posSearch.table) return;
    if (waiter && !waiterOptions.some((name) => namesMatch(name, waiter))) {
      setWaiter("");
    }
  }, [isWaiter, waiter, waiterOptions, posSearch.waiter, posSearch.table]);

  useEffect(() => {
    // Keep a table passed from Create order / Add items until POS applies it.
    if (posSearch.table || posSearch.orderId) return;
    // Never wipe the seat while adding lines to an open bill.
    if (addingToOrder) return;
    if (assignedTables.length === 0) {
      // Floor plan still loading — don't clear a deep-linked table number.
      if (store.tables.length === 0) return;
      if (tableNumber) setTableNumber("");
      return;
    }
    const stillValid = assignedTables.some(
      (table) => namesMatch(table.area, area) && namesMatch(table.label, tableNumber),
    );
    if (stillValid) return;
    // Waiters with a single assigned table can auto-focus it when none is chosen.
    if (isWaiter && assignedTables.length === 1 && !tableNumber) {
      const next = assignedTables[0];
      setArea(next.area);
      setTableNumber(next.label);
      return;
    }
    if (tableNumber) setTableNumber("");
  }, [
    assignedTables,
    area,
    tableNumber,
    isWaiter,
    addingToOrder,
    posSearch.table,
    posSearch.orderId,
    store.tables.length,
  ]);

  useEffect(() => {
    if (stationFilter !== "All") return;
    if (letterFilter !== "All") setLetterFilter("All");
  }, [stationFilter, letterFilter]);

  useEffect(() => {
    setPage((current) => Math.min(Math.max(current, 1), totalPages));
  }, [totalPages]);

  useEffect(() => {
    setCart((current) =>
      current.map((line) => {
        const unitPrice = linePriceForArea(line, area);
        return line.unitPrice === unitPrice ? line : { ...line, unitPrice };
      }),
    );
  }, [area]);

  useEffect(() => {
    if (!itemClickPopup) return;
    const timeout = window.setTimeout(() => setItemClickPopup(null), 900);
    return () => window.clearTimeout(timeout);
  }, [itemClickPopup]);

  useEffect(() => {
    if (!stockWarning) return;
    const timeout = window.setTimeout(() => setStockWarning(null), 2200);
    return () => window.clearTimeout(timeout);
  }, [stockWarning]);

  function selectAssignedTable(tableId: string) {
    if (!tableId) {
      setTableNumber("");
      return;
    }
    const table = assignedTables.find((row) => row.id === tableId);
    if (!table) return;
    setArea(table.area);
    setTableNumber(table.label);
  }

  function cartLineKey(line: Line) {
    const prefs = (line.preferences ?? []).map((value) => value.toUpperCase()).join(",");
    return `${line.item.id}|${line.unitPrice}|${line.unitLabel ?? ""}|${prefs}|${line.note ?? ""}`;
  }

  function openPrepDraft(item: MenuItem, existing?: Line) {
    const isMeat = isMeatMenuItem(item, store.menuStations);
    setPrepDraft({
      item,
      qty: existing?.qty ?? (isMeat ? 1 : 1),
      unitLabel: existing?.unitLabel ?? (isMeat ? "kg" : (item.unitLabel ?? undefined)),
      qtyStep: existing?.qtyStep ?? itemQtyStep(item, store.menuStations),
      preferences: [...(existing?.preferences ?? [])],
      note: existing?.note ?? "",
      editKey: existing ? cartLineKey(existing) : undefined,
    });
  }

  function togglePrepPreference(pref: string) {
    setPrepDraft((current) => {
      if (!current) return current;
      const has = current.preferences.some((value) => value.toUpperCase() === pref.toUpperCase());
      return {
        ...current,
        preferences: has
          ? current.preferences.filter((value) => value.toUpperCase() !== pref.toUpperCase())
          : [...current.preferences, pref],
      };
    });
  }

  function confirmPrepDraft() {
    if (!prepDraft) return;
    const line: Line = {
      item: prepDraft.item,
      qty: normalizeQty(prepDraft.qty),
      unitPrice: itemPriceForArea(prepDraft.item, area),
      unitLabel: prepDraft.unitLabel,
      qtyStep: prepDraft.qtyStep,
      preferences: prepDraft.preferences,
      note: prepDraft.note.trim() || undefined,
    };
    if (prepDraft.editKey) {
      const editKey = prepDraft.editKey;
      setCart((current) =>
        current.map((entry) => (cartLineKey(entry) === editKey ? { ...entry, ...line } : entry)),
      );
    } else {
      addToCart(line);
      showItemClickPopup(line.item, line.qty, line.unitLabel);
    }
    setPrepDraft(null);
  }

  function addToCart(line: Line) {
    if (!isPosMenuStockDisconnected()) {
      const remaining = getRemainingStockForItem(line.item, line.qty, line.unitLabel);
      const { behavior, decision } = resolveSalePolicy(
        line.item,
        remaining.remainingQty,
        remaining.tracked,
      );
      if (!decision.allowed) {
        stockModule.savePosNegativeSaleAttempt(recordPosNegativeSaleAttempt({
          attemptedBy: activeUserName,
          menuItemId: line.item.id,
          menuItemName: itemLabel(line.item),
          requestedQty: line.qty,
          availableQty: remaining.availableQty,
          remainingQty: remaining.remainingQty,
          behavior,
          reason: decision.reason || "Blocked by out-of-stock policy",
          role: user?.role,
        }));
        if (behavior === "auto_unavailable") {
          setStockWarning(
            `${itemLabel(line.item)} ${t("is marked unavailable (out of stock).", "ከክምችት ውጭ ስለሆነ አይገኝም።")}`,
          );
        } else if (decision.requiresManager) {
          setStockWarning(
            `${itemLabel(line.item)} ${t("needs manager approval to sell beyond stock.", "ከክምችት በላይ ለመሸጥ የአስተዳዳሪ ፈቃድ ያስፈልጋል።")}`,
          );
        } else {
          setStockWarning(
            decision.reason
              || `${itemLabel(line.item)} ${t("is out of stock or exceeds available quantity.", "ከክምችት ውጭ ነው ወይም ያለውን መጠን አልፏል።")}`,
          );
        }
        return;
      }
    }
    setCart((current) => {
      const existing = current.find((entry) => cartLineKey(entry) === cartLineKey(line));
      if (existing) {
        return current.map((entry) =>
          cartLineKey(entry) === cartLineKey(line)
            ? { ...entry, qty: normalizeQty(entry.qty + line.qty) }
            : entry,
        );
      }
      return [...current, line];
    });
  }

  function openRestockDialog(
    item: MenuItem,
    stockInfo: ReturnType<typeof getRemainingStockForItem>,
  ) {
    const stockItemId = stockInfo.stockItemId || item.stockSku;
    if (!stockItemId) return;
    const stockItem = stockModule.items.find((row) => row.id === stockItemId);
    if (!stockItem) return;
    const department = (stockInfo.location as OperationalStockLocation | null)
      || stationToOperationalLocation(item.station)
      || "Kitchen";
    const balance = stockModule.balances.find((row) => row.itemId === stockItem.id && row.location === department)
      || stockModule.balances.find((row) => row.itemId === stockItem.id);
    const policy = getLocationPolicy(stockModule.locationPolicies, stockItem.id, department);
    const suggestedQty = suggestDepartmentRestockQuantity(
      balance ?? { quantity: 0, availableQuantity: 0, reorderLevel: stockItem.reorderLevel ?? 0 },
      policy,
    );
    const store1Qty = stockModule.balances.find((row) => row.itemId === stockItem.id && row.location === "Store 1")?.availableQuantity
      ?? stockModule.balances.find((row) => row.itemId === stockItem.id && row.location === "Store 1")?.quantity
      ?? 0;
    const store2Qty = stockModule.balances.find((row) => row.itemId === stockItem.id && row.location === "Store 2")?.availableQuantity
      ?? stockModule.balances.find((row) => row.itemId === stockItem.id && row.location === "Store 2")?.quantity
      ?? 0;
    const sourceStore = pickPreferredSourceStore(stockModule.balances, stockItem.id);
    setRestockQty(Math.max(1, suggestedQty || 1));
    setRestockDialog({
      itemId: stockItem.id,
      itemName: stockItem.name,
      department,
      suggestedQty: Math.max(1, suggestedQty || 1),
      unit: stockItem.baseUnit,
      store1Qty,
      store2Qty,
      sourceStore,
    });
  }

  function submitRestockRequest() {
    if (!restockDialog || !user || !(restockQty > 0)) return;
    const availableQuantityAtDepartment =
      stockModule.balances.find(
        (row) => row.itemId === restockDialog.itemId && row.location === restockDialog.department,
      )?.availableQuantity
      ?? stockModule.balances.find(
        (row) => row.itemId === restockDialog.itemId && row.location === restockDialog.department,
      )?.quantity
      ?? 0;
    const document = createDepartmentStockRequest({
      requestingDepartment: restockDialog.department,
      requestedSourceStore: restockDialog.sourceStore,
      priority: availableQuantityAtDepartment <= 0 ? "Urgent" : "Normal",
      reason: "POS low stock replenishment",
      requiredDate: new Date().toISOString().slice(0, 10),
      requestedBy: user.name,
      notes: `Requested from POS for ${restockDialog.itemName}`,
      lines: [{
        itemId: restockDialog.itemId,
        itemName: restockDialog.itemName,
        availableQuantityAtDepartment,
        requestedQuantity: restockQty,
        unit: restockDialog.unit as StockUnitType,
      }],
    });
    stockModule.saveRequest(toStockRequestRecord(document));
    setStockWarning(
      t("Department stock request submitted.", "የክፍል የክምችት ጥያቄ ተልኳል።"),
    );
    setRestockDialog(null);
  }

  function showItemClickPopup(item: MenuItem, qty: number, unitLabel?: string) {
    setItemClickPopup({ name: itemLabel(item), qty, unitLabel });
  }

  function openItem(item: MenuItem) {
    if (isSpiritMenuItem(item)) {
      const defaultMode: SpiritMode =
        item.doublePrice != null ? "double" : item.singlePrice != null ? "single" : "bottle";
      setDraftSelection({ item, qty: 1, mode: defaultMode });
      return;
    }

    if (isBonoMenuItem(item, store.menuStations, area)) {
      openPrepDraft(item);
      return;
    }

    const isMeat = isMeatMenuItem(item, store.menuStations);
    const qtyStep = itemQtyStep(item, store.menuStations);
    const qty = isMeat ? 1 : 1;
    const unitLabel = isMeat ? "kg" : (item.unitLabel ?? undefined);
    addToCart({
      item,
      qty: normalizeQty(qty),
      unitPrice: itemPriceForArea(item, area),
      unitLabel,
      qtyStep,
    });
    showItemClickPopup(item, qty, unitLabel);
  }

  function confirmDraftSelection() {
    if (!draftSelection) return;
    const { item, qty, mode } = draftSelection;
    const isSpirit = isSpiritMenuItem(item);
    const isMeat = isMeatMenuItem(item, store.menuStations);
    const qtyStep = itemQtyStep(item, store.menuStations);
    addToCart({
      item,
      qty: normalizeQty(qty),
      unitPrice: isSpirit ? getSpiritPrice(item, mode) : itemPriceForArea(item, area),
      unitLabel: isSpirit ? getSpiritUnitLabel(mode) : isMeat ? "kg" : (item.unitLabel ?? undefined),
      qtyStep,
    });
    showItemClickPopup(
      item,
      qty,
      isSpirit ? getSpiritUnitLabel(mode) : isMeat ? "kg" : (item.unitLabel ?? undefined),
    );
    setDraftSelection(null);
  }

  function dec(line: Line) {
    setCart((current) =>
      current.flatMap((entry) => {
        if (cartLineKey(entry) !== cartLineKey(line)) return [entry];
        const nextQty = isMeatMenuItem(entry.item, store.menuStations)
          ? nextMeatQty(entry.qty)
          : normalizeQty(entry.qty - (entry.qtyStep || 1));
        return nextQty > 0 ? [{ ...entry, qty: nextQty }] : [];
      }),
    );
  }

  function removeItemFromCart(item: MenuItem) {
    const matching = cart.filter((line) => line.item.id === item.id);
    const last = matching[matching.length - 1];
    if (!last) return;
    dec(last);
  }

  function refreshPrinterVerification() {
    setPrinterVerification(loadPosPrinterVerification());
  }

  async function ensureWaiterPrinterReady(action: "send" | "bono" | "add" = "send") {
    if (!isWaiter) return true;
    const current = loadPosPrinterVerification();
    setPrinterVerification(current);
    if (!isPosPrinterVerifiedForOrdering(current)) {
      showError(
        t(
          "Complete printer setup before taking orders.",
          "ትዕዛዝ ከመውሰድዎ በፊት የአታሚ ቅንብርን ያጠናቅቁ።",
        ),
      );
      return false;
    }
    if (action === "add") return true;
    setPrinterProbeBusy(true);
    try {
      const probe = await probePosPrinterConnection({ branch: user?.branch });
      if (!probe.ok) {
        const next = markPosPrinterUnavailable(probe.reason || "Printer unavailable");
        setPrinterVerification(next);
        appendPosPrinterAudit({
          action: "unavailable",
          actor: activeUserName,
          actorRole: user?.role || "Waiter",
          branch: user?.branch,
          previous: current,
          next,
          reason: probe.reason,
        });
        showError(t("Printer unavailable", "አታሚ አይገኝም"));
        return false;
      }
      if (current.status === "unavailable") {
        const restored = restorePosPrinterVerifiedAfterProbe();
        setPrinterVerification(restored);
        appendPosPrinterAudit({
          action: "restore",
          actor: activeUserName,
          actorRole: user?.role || "Waiter",
          branch: user?.branch,
          previous: current,
          next: restored,
        });
      }
      return true;
    } finally {
      setPrinterProbeBusy(false);
    }
  }

  async function retryPrinterConnection() {
    setPrinterProbeBusy(true);
    try {
      const previous = loadPosPrinterVerification();
      const probe = await probePosPrinterConnection({ branch: user?.branch });
      if (probe.ok) {
        const restored = restorePosPrinterVerifiedAfterProbe();
        setPrinterVerification(restored);
        appendPosPrinterAudit({
          action: "restore",
          actor: activeUserName,
          actorRole: user?.role || "Waiter",
          branch: user?.branch,
          previous,
          next: restored,
        });
        showSuccess(t("Printer connection restored.", "የአታሚ ግንኙነት ተመልሷል።"));
        return;
      }
      const next = markPosPrinterUnavailable(probe.reason || "Printer unavailable");
      setPrinterVerification(next);
      showError(probe.reason || t("Printer unavailable", "አታሚ አይገኝም"));
    } finally {
      setPrinterProbeBusy(false);
    }
  }

  async function testPrinterFromPos() {
    setPrinterProbeBusy(true);
    try {
      const previous = loadPosPrinterVerification();
      const result = await runPosPrinterTestPrint({
        branch: user?.branch,
        requestedBy: activeUserName,
      });
      setPrinterVerification(result.verification);
      appendPosPrinterAudit({
        action: "test_print",
        actor: activeUserName,
        actorRole: user?.role || "Waiter",
        branch: user?.branch,
        testPrintOk: result.ok,
        previous,
        next: result.verification,
        reason: result.error,
      });
      if (result.ok) {
        showSuccess(t("Test print succeeded.", "የሙከራ ህትመት ተሳክቷል።"));
      } else {
        showError(result.error || t("Test print failed.", "የሙከራ ህትመት አልተሳካም።"));
      }
    } finally {
      setPrinterProbeBusy(false);
    }
  }

  function requestManagerForPrinter() {
    showError(
      t(
        "Ask a manager or administrator to sign in on this terminal to unlock or change the printer.",
        "አታሚውን ለመክፈት ወይም ለመቀየር ሥራ አስኪያጅ ወይም አስተዳዳሪ በዚህ ተርሚናል እንዲገቡ ይጠይቁ።",
      ),
    );
  }

  function cancelAddToOrder() {
    setAddingToOrder(null);
    setCart([]);
    setManagerStockOverride(false);
  }

  function startAddToOrder(order: Order) {
    if (!canAddItemsToOrder(order)) return;
    if (!canManageBills && !assignedWaiterMatches(order.waiter, user)) return;
    if (isWaiter && !isPosPrinterVerifiedForOrdering(loadPosPrinterVerification())) {
      showError(
        t(
          "Complete printer setup before taking orders.",
          "ትዕዛዝ ከመውሰድዎ በፊት የአታሚ ቅንብርን ያጠናቅቁ።",
        ),
      );
      refreshPrinterVerification();
      return;
    }
    if (isWaiter && loadPosPrinterVerification().status === "unavailable") {
      showError(t("Printer unavailable", "አታሚ አይገኝም"));
      refreshPrinterVerification();
      return;
    }
    const fresh = store.orders.find((item) => item.id === order.id) ?? order;
    setAddingToOrder(fresh);
    if (!isWaiter) setWaiter(fresh.waiter);
    setArea(fresh.area);
    setTableNumber(fresh.tableNumber);
    setCart([]);
    setManagerStockOverride(false);
    // Keep the menu visible on phones — cart sheet opens when the waiter reviews/sends.
    setMobileCartOpen(false);
  }

  function focusOpenBillSeat(order: Order) {
    setArea(order.area);
    setTableNumber(order.tableNumber);
    if (!isWaiter && order.waiter?.trim()) setWaiter(order.waiter);
  }

  function clearOpenBillFilters() {
    setOpenBillSearch("");
    setOpenBillAreaFilter("All");
    setOpenBillWaiterFilter("All");
    setOpenBillQuickFilter("all");
    setOpenBillDayScope("today");
    setOpenBillSort("newest");
  }

  useEffect(() => {
    const { table, area: searchArea, waiter: searchWaiter, orderId, mode } = posSearch;
    if (!table && !orderId && !searchArea && !searchWaiter && !mode) return;

    let applied = false;

    if (orderId) {
      const order = store.orders.find((row) => row.id === orderId);
      if (!order) return;
      if (
        (mode === "add" || !mode) &&
        canAddItemsToOrder(order) &&
        (canManageBills || assignedWaiterMatches(order.waiter, user) || assignedWaiterMatches(order.orderedByWaiter, user))
      ) {
        startAddToOrder(order);
        applied = true;
      } else if (canManageBills || assignedWaiterMatches(order.waiter, user) || assignedWaiterMatches(order.orderedByWaiter, user)) {
        setArea(order.area);
        setTableNumber(order.tableNumber);
        if (!isWaiter) setWaiter(order.waiter);
        applied = true;
      }
    } else if (table) {
      // Wait for floor tables to load so we can pin the exact seat from Create order.
      if (store.tables.length === 0) return;
      const matchFromFloor = findTableByLabelArea(store.tables, table, searchArea);
      // Always pin the seat from Create order — claim/block is enforced on send, not here.
      const match =
        findTableByLabelArea(assignedTables, table, searchArea) ?? matchFromFloor ?? null;

      if (match) {
        setArea(match.area);
        setTableNumber(match.label);
        if (!isWaiter) {
          const waiterName = searchWaiter?.trim() || match.server?.trim() || "";
          if (waiterName) setWaiter(waiterName);
        }
        if (mode === "create") setAddingToOrder(null);
        applied = true;
      } else if (!matchFromFloor) {
        // Table not in local floor list yet — still allow create; claim happens on send.
        if (searchArea) setArea(searchArea);
        setTableNumber(table);
        if (!isWaiter && searchWaiter?.trim()) setWaiter(searchWaiter);
        if (mode === "create") setAddingToOrder(null);
        applied = true;
      }
    } else if (searchWaiter && !isWaiter) {
      setWaiter(searchWaiter);
      applied = true;
    }

    if (!applied) return;

    void navigate({
      search: {
        table: undefined,
        area: undefined,
        waiter: undefined,
        orderId: undefined,
        mode: undefined,
      },
      replace: true,
    });
    // Deep-link bootstrap only; avoid re-running on unrelated state churn.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [posSearch.table, posSearch.area, posSearch.waiter, posSearch.orderId, posSearch.mode, store.orders.length, store.tables.length, assignedTables.length]);

  async function sendOrder() {
    if (sendInFlightRef.current || isSending) return;
    if (!selectedWaiter) return;
    if (!(await ensureWaiterPrinterReady("send"))) return;
    if (!tableNumber || !selectedTableClaimable) {
      showError(
        t(
          "Select a free table (or one assigned to this waiter).",
          "ነፃ ጠረጴዛ ይምረጡ (ወይም ለዚህ አስተናጋጅ የተመደበ)።",
        ),
      );
      return;
    }
    if (cart.length === 0) {
      showError(t("Add items before sending the order.", "ትዕዛዙን ከመላክዎ በፊት እቃዎችን ያክሉ።"));
      return;
    }
    if (hasCartStockConflict) {
      const firstIssue = cartStockIssues[0];
      if (firstIssue) {
        setStockWarning(
          `${itemLabel(firstIssue.item)} ${t("does not have enough stock for this order.", "ለዚህ ትዕዛዝ በቂ ክምችት የለውም።")}`,
        );
      }
      return;
    }

    sendInFlightRef.current = true;
    setIsSending(true);
    try {
      async function afterSaved(order: Order, previewOrder?: Order) {
        // Require the bill to exist locally; wait briefly for remote, then allow Bono.
        const persist = await store.ensureOrdersPersisted([order.id], { waitForRemoteMs: 900 });
        if (!persist.ok) {
          showError(
            persist.error ||
              t(
                "Order could not be saved. Bono will not print until the bill is created.",
                "ትዕዛዙ ማስቀመጥ አልተቻለም። ሂሳቡ እስኪፈጠር ድረስ ቦኖ አይታተምም።",
              ),
          );
          return false;
        }
        const saved = persist.orders[0] ?? order;
        setLastSent(saved);
        if (createsLiveOrder && previewOrder) {
          openTicketPreview(previewOrder.id === saved.id ? { ...saved, ...previewOrder, id: saved.id } : saved);
        } else if (createsLiveOrder) {
          openTicketPreview(saved);
        }
        return true;
      }

      if (addingToOrder) {
        const result = store.addItemsToOpenOrder(addingToOrder.id, {
          items: cart,
          enteredBy: cashierName,
          actingWaiter: isWaiter ? selectedWaiter : undefined,
        });
        if (!result.ok || !result.order) {
          showError(result.error ?? t("Could not add items to this bill.", "ወደ ሂሳቡ እቃዎችን ማክል አልተቻለም።"));
          return;
        }
        const updated = result.order;
        const addedLines = result.addedLines ?? [];
        setCart([]);
        setAddingToOrder(null);
        setMobileCartOpen(false);
        setManagerStockOverride(false);
        const saved = await afterSaved(
          updated,
          createsLiveOrder && addedLines.length > 0
            ? { ...updated, items: addedLines, stationTickets: [] }
            : undefined,
        );
        if (!saved) return;
        showSuccess(
          t(
            `Added ${addedLines.length} item(s) to ${updated.orderNo}. Station tickets updated.`,
            `${addedLines.length} እቃ ወደ ${updated.orderNo} ታክሏል። የጣቢያ ቲኬቶች ተዘምነዋል።`,
          ),
        );
        return;
      }

      // Waiters: one open bill per table — more items go on the existing order.
      if (isWaiter) {
        const openOnTable = store.orders.find(
          (order) =>
            stillOccupiesTable(order) &&
            namesMatch(order.area, area) &&
            namesMatch(order.tableNumber, tableNumber) &&
            (assignedWaiterMatches(order.waiter, user) ||
              assignedWaiterMatches(order.orderedByWaiter, user)),
        );
        if (openOnTable) {
          if (!canAddItemsToOrder(openOnTable)) {
            showError(
              t(
                "This table already has an open order that cannot accept more items. Clear the table or generate a receipt first.",
                "ይህ ጠረጴዛ አስቀድሞ ክፍት ትዕዛዝ አለው እና ተጨማሪ እቃ አይቀበልም። መጀመሪያ ጠረጴዛውን ያፅዱ ወይም ደረሰኝ ይፍጠሩ።",
              ),
            );
            return;
          }
          const result = store.addItemsToOpenOrder(openOnTable.id, {
            items: cart,
            enteredBy: cashierName,
            actingWaiter: selectedWaiter,
          });
          if (!result.ok || !result.order) {
            showError(result.error ?? t("Could not add items to this bill.", "ወደ ሂሳቡ እቃዎችን ማክል አልተቻለም።"));
            return;
          }
          const updated = result.order;
          const addedLines = result.addedLines ?? [];
          setCart([]);
          setAddingToOrder(null);
          setMobileCartOpen(false);
          setManagerStockOverride(false);
          const saved = await afterSaved(
            updated,
            createsLiveOrder && addedLines.length > 0
              ? { ...updated, items: addedLines, stationTickets: [] }
              : undefined,
          );
          if (!saved) return;
          showSuccess(
            t(
              `Added ${addedLines.length} item(s) to ${updated.orderNo}. Station tickets updated.`,
              `${addedLines.length} እቃ ወደ ${updated.orderNo} ታክሏል። የጣቢያ ቲኬቶች ተዘምነዋል።`,
            ),
          );
          return;
        }
      }

      const order = store.createOrder({
        area,
        tableNumber,
        waiter: selectedWaiter,
        enteredByCashier: cashierName,
        sendToCashier: sendsToCashier,
        items: cart,
      });
      if (!order) {
        showError(
          t(
            "Could not create the order. If this table has another waiter's open bill, clear it first.",
            "ትዕዛዙን መፍጠር አልተቻለም። ይህ ጠረጴዛ የሌላ አስተናጋጅ ክፍት ሂሳብ ካለው መጀመሪያ ያፅዱ።",
          ),
        );
        return;
      }
      setCart([]);
      setMobileCartOpen(false);
      setManagerStockOverride(false);
      const savedOk = await afterSaved(order, createsLiveOrder ? order : undefined);
      if (!savedOk) return;
      const confirmed = store.orders.find((row) => row.id === order.id) ?? order;
      if (createsLiveOrder) {
        showSuccess(
          t(
            `${confirmed.orderNo} sent to stations for ${confirmed.area} ${confirmed.tableNumber}.`,
            `${confirmed.orderNo} ወደ ጣቢያዎች ተልኳል ለ ${confirmed.area} ${confirmed.tableNumber}።`,
          ),
        );
      } else {
        showSuccess(
          t(
            `${confirmed.orderNo} sent to cashier for ${confirmed.area} ${confirmed.tableNumber}.`,
            `${confirmed.orderNo} ወደ ካሸር ተልኳል ለ ${confirmed.area} ${confirmed.tableNumber}።`,
          ),
        );
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error ?? "");
      showError(
        t(
          `Order failed and was not sent.${message ? ` ${message}` : ""}`,
          `ትዕዛዙ አልተላከም።${message ? ` ${message}` : ""}`,
        ),
      );
    } finally {
      sendInFlightRef.current = false;
      setIsSending(false);
    }
  }

  async function acceptWaiterOrder(order: Order) {
    const accepted = store.acceptWaiterOrder(order.id, activeUserName);
    if (!accepted) return;
    const persist = await store.ensureOrdersPersisted([accepted.id], { waitForRemoteMs: 900 });
    if (!persist.ok) {
      showError(
        persist.error ||
          t(
            "Order could not be saved. Bono will not print until the bill is created.",
            "ትዕዛዙ ማስቀመጥ አልተቻለም። ሂሳቡ እስኪፈጠር ድረስ ቦኖ አይታተምም።",
          ),
      );
      return;
    }
    const saved = persist.orders[0] ?? accepted;
    setLastSent(saved);
    openTicketPreview(saved);
  }

  function openTicketPreview(order: Order) {
    if (!canManageBills && !(isWaiter && (assignedWaiterMatches(order.waiter, user) || assignedWaiterMatches(order.orderedByWaiter, user)))) {
      return;
    }
    if (isWaiter && !isPosPrinterVerifiedForOrdering(loadPosPrinterVerification())) {
      showError(
        t(
          "Complete printer setup before taking orders.",
          "ትዕዛዝ ከመውሰድዎ በፊት የአታሚ ቅንብርን ያጠናቅቁ።",
        ),
      );
      refreshPrinterVerification();
      return;
    }
    if (isWaiter && loadPosPrinterVerification().status === "unavailable") {
      showError(t("Printer unavailable", "አታሚ አይገኝም"));
      refreshPrinterVerification();
      return;
    }
    const fresh = store.orders.find((item) => item.id === order.id) ?? order;
    const previewOrder =
      order.items.length > 0 && order.stationTickets.length === 0 && order.id === fresh.id
        ? order
        : fresh;
    if (previewOrder.items.length === 0 && previewOrder.stationTickets.length === 0) return;
    setTicketPreview({
      orders: [previewOrder],
    });
  }

  function openBillTransfer() {
    const from = isWaiter
      ? activeUserName
      : transferFrom ||
        selectedWaiter ||
        transferWaiterOptions.find((name) => openBillsOwnedByWaiter(openOrders, name).length > 0) ||
        transferWaiterOptions[0] ||
        "";
    const to = transferWaiterOptions.find((name) => !assignedWaiterMatches(name, from)) ?? "";
    setTransferFrom(from);
    setTransferTo(to);
    const bills = openBillsOwnedByWaiter(openOrders, from);
    setTransferSelectedIds(new Set(bills.map((order) => order.id)));
    setTransferOpen(true);
  }

  function toggleTransferOrder(orderId: string) {
    setTransferSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(orderId)) next.delete(orderId);
      else next.add(orderId);
      return next;
    });
  }

  function submitBillTransfer() {
    const from = isWaiter ? activeUserName : transferFrom;
    const selected = [...transferSelectedIds];
    if (selected.length === 0) {
      showError(t("Select at least one bill.", "ቢያንስ አንድ ሂሳብ ይምረጡ።"));
      return;
    }
    if (isWaiter) {
      const result = store.requestWaiterBillTransfer(from, transferTo, activeUserName, selected);
      if (!result.ok) {
        showError(result.error ?? t("Could not request transfer.", "ማስተላለፍ መጠየቅ አልተቻለም።"));
        return;
      }
      showSuccess(
        t(
          `${result.requested} bill(s) sent for cashier/manager approval.`,
          `${result.requested} ሂሳብ ለካሸር/ሥራ አስኪያጅ ማፅደቂያ ተልኳል።`,
        ),
      );
      setTransferOpen(false);
      return;
    }
    const result = store.transferWaiterBills(from, transferTo, activeUserName, selected);
    if (!result.ok) {
      showError(result.error ?? t("Could not transfer bills.", "ሂሳቦችን ማስተላለፍ አልተቻለም።"));
      return;
    }
    showSuccess(
      t(
        `${result.transferred} bill(s) transferred to ${transferTo}.`,
        `${result.transferred} ሂሳብ ወደ ${transferTo} ተላልፏል።`,
      ),
    );
    setTransferOpen(false);
  }

  function approvePendingTransfer(fromWaiter: string, toWaiter: string, orderIds: string[]) {
    const result = store.approveWaiterBillTransfer(fromWaiter, toWaiter, activeUserName, orderIds);
    if (!result.ok) {
      showError(result.error ?? t("Could not approve transfer.", "ማስተላለፍ ማፅደቅ አልተቻለም።"));
      return;
    }
    showSuccess(
      t(
        `${result.transferred} bill(s) transferred to ${toWaiter}.`,
        `${result.transferred} ሂሳብ ወደ ${toWaiter} ተላልፏል።`,
      ),
    );
  }

  function rejectPendingTransfer(orderIds: string[]) {
    const result = store.rejectWaiterBillTransfer(orderIds);
    if (!result.ok) {
      showError(result.error ?? t("Could not reject transfer.", "ማስተላለፍ መሰረዝ አልተቻለም።"));
      return;
    }
    showSuccess(t("Transfer request rejected.", "የማስተላለፊያ ጥያቄ ተሰርዟል።"));
  }

  function rejectPendingReturn(orderId: string) {
    store.rejectReturnOrder(orderId);
    showSuccess(t("Return request rejected.", "የመልስ ጥያቄ ተሰርዟል።"));
    if (returnDialog?.orderId === orderId) {
      setReturnDialog(null);
      setReturnReason("");
      setReturnQtys({});
      setRestorePackagedStock(false);
    }
  }

  function openReturnOrder(order: Order) {
    if (!canUseReturns) return;
    if (isWaiter && order.waiter !== activeUserName && order.orderedByWaiter !== activeUserName) {
      return;
    }
    if (canApproveReturns) {
      if (!canRequestReturnOrder(order) && !canApproveReturnOrder(order)) return;
    } else if (!canRequestReturnOrder(order)) {
      return;
    }
    const fresh = store.orders.find((item) => item.id === order.id) ?? order;
    setReturnReason(fresh.returnReason ?? "");
    const pending = Boolean(fresh.returnRequestedBy);
    if (pending && fresh.returnRequestedLines?.length) {
      setReturnQtys(returnQtyMapFromLines(fresh.returnRequestedLines));
    } else if (!canApproveReturns) {
      // Waiters must explicitly pick items (or tap All).
      setReturnQtys({});
    } else {
      setReturnQtys(
        Object.fromEntries(fresh.items.map((line, index) => [index, line.qty])) as Record<number, number>,
      );
    }
    setRestorePackagedStock(false);
    setReturnDialog({
      orderId: fresh.id,
      orderNo: fresh.orderNo,
      requestedBy: fresh.returnRequestedBy,
      pending,
    });
  }

  function setReturnLineQty(index: number, qty: number, maxQty: number) {
    const next = Math.min(Math.max(0, qty), maxQty);
    setReturnQtys((prev) => {
      const copy = { ...prev };
      if (next <= 0) {
        delete copy[index];
      } else {
        copy[index] = next;
      }
      return copy;
    });
  }

  function submitReturnOrder() {
    if (!returnDialog || !returnReason.trim()) return;
    const returnLines = Object.entries(returnQtys)
      .map(([index, qty]) => ({ index: Number(index), qty: Number(qty) }))
      .filter((row) => Number.isInteger(row.index) && row.qty > 0);
    if (returnLines.length === 0) {
      showError(t("Select at least one item quantity to return.", "ቢያንስ አንድ እቃ መጠን ይምረጡ።"));
      return;
    }
    if (!canApproveReturns) {
      store.requestReturnOrder(returnDialog.orderId, activeUserName, returnReason.trim(), returnLines);
      showSuccess(t("Return request sent to manager", "የመልስ ጥያቄ ለሥራ አስኪያጅ ተልኳል"));
      setReturnDialog(null);
      setReturnReason("");
      setReturnQtys({});
      setRestorePackagedStock(false);
      return;
    }
    const orderBefore = store.orders.find((order) => order.id === returnDialog.orderId);
    const returningAll =
      !!orderBefore &&
      returnLines.length === orderBefore.items.length &&
      returnLines.every((row) => row.qty >= (orderBefore.items[row.index]?.qty ?? 0));
    const result = store.approveReturnOrder(returnDialog.orderId, activeUserName, {
      restorePackagedStock,
      reason: returnReason.trim(),
      direct: !returnDialog.pending,
      returnLines,
    });
    if (!result.ok) {
      showError(result.error ?? t("Could not return order", "ትዕዛዙን መመለስ አልተቻለም"));
      return;
    }
    showSuccess(
      returningAll
        ? t("Order returned", "ትዕዛዙ ተመልሷል")
        : t("Selected quantity returned", "የተመረጠው መጠን ተመልሷል"),
    );
    setReturnDialog(null);
    setReturnReason("");
    setReturnQtys({});
    setRestorePackagedStock(false);
    if (lastSent?.id === returnDialog.orderId) setLastSent(null);
  }

  function openPayment(order: Order) {
    if (!canManageBills) return;
    const fresh = store.orders.find((item) => item.id === order.id) ?? order;
    setPaymentOrder(fresh);
  }

  function generateOrShowReceipt(order: Order) {
    const fresh = store.orders.find((item) => item.id === order.id) ?? order;
    if (fresh.receipt) {
      setReceiptView({ order: fresh, receipt: fresh.receipt });
      return;
    }
    if (!canGenerateReceipt(fresh)) {
      showError(
        t(
          "Order is not ready for a customer receipt yet.",
          "ትዕዛዙ ለደንበኛ ደረሰኝ ገና ዝግጁ አይደለም።",
        ),
      );
      return;
    }
    const generated = store.generateReceipt(fresh.id, {
      generatedBy: activeUserName || t("Waiter", "አስተናጋጅ"),
    });
    if (!generated) {
      showError(t("Could not generate receipt.", "ደረሰኝ መፍጠር አልተቻለም።"));
      return;
    }
    const nextOrder: Order = {
      ...fresh,
      status: "RECEIPT_GENERATED",
      paymentStatus: "Unpaid",
      receipt: generated,
      receiptNumber: generated.receiptNumber,
      receiptGeneratedAt: generated.generatedAt,
      receiptGeneratedBy: generated.generatedBy,
      lockedForEditing: true,
      total: generated.grandTotal,
    };
    setReceiptView({ order: nextOrder, receipt: generated });
    showSuccess(t("Customer receipt ready.", "የደንበኛ ደረሰኝ ዝግጁ ነው።"));
  }

  return (
    <div className="min-w-0 pb-24 lg:pb-0">
      <PageHeader
        title={t("Point of Sale", "ፖስ")}
        action={
          <div className="flex flex-wrap items-center gap-1.5 sm:gap-2">
            <RealtimeBadge status={store.realtimeStatus} lastSyncAt={store.lastRealtimeSyncAt} />
            <PrintGatewayBadge />
            {isWaiter && printerReadyForWaiter && !printerUnavailable ? (
              <Chip tone="teff">
                <Icons.Printer className="size-3.5" />
                {t("Printer Ready", "አታሚ ዝግጁ")}
              </Chip>
            ) : null}
            {isWaiter && printerUnavailable ? (
              <Chip tone="destructive">
                <Icons.Printer className="size-3.5" />
                {t("Printer unavailable", "አታሚ አይገኝም")}
              </Chip>
            ) : null}
            {canSendToStations && pendingCashierOrders.length > 0 && (
              <Chip tone="ember">
                <span className="size-1.5 rounded-full bg-ember animate-pulse" />
                {pendingCashierOrders.length}
              </Chip>
            )}
            <Link
              to="/app/orders"
              className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-border bg-card px-2.5 text-xs font-medium hover:bg-surface-2 sm:px-3 sm:text-sm"
            >
              <Icons.ClipboardList className="size-3.5" /> <span className="hidden min-[400px]:inline">{t("Open bills", "ክፍት ሂሳቦች")}</span>
            </Link>
          </div>
        }
      />

      {showPrinterSetupGate ? (
        <PosPrinterSetup
          forced
          onVerified={(next) => {
            setPrinterVerification(next);
          }}
          onStartTakingOrders={() => {
            refreshPrinterVerification();
          }}
        />
      ) : null}

      {!showPrinterSetupGate && printerUnavailable ? (
        <div className="mb-3">
          <PosPrinterUnavailablePanel
            reason={printerVerification.unavailableReason}
            busy={printerProbeBusy}
            onRetry={() => void retryPrinterConnection()}
            onTest={() => void testPrinterFromPos()}
            onRequestManager={requestManagerForPrinter}
          />
        </div>
      ) : null}

      {!showPrinterSetupGate ? (
      <>
      <div className="mb-3 grid grid-cols-4 gap-1.5 sm:gap-2 xl:grid-cols-5">
        <button
          type="button"
          className="rounded-lg border border-amber-500/30 bg-amber-500/5 p-2 text-left transition-colors active:scale-[0.98] sm:p-2.5"
        >
          <div className="text-[9px] uppercase tracking-wide text-muted-foreground sm:text-[10px]">{t("Waiting", "በመጠባበቅ")}</div>
          <div className="mt-0.5 font-display text-lg font-semibold sm:text-xl">{pendingCashierOrders.length}</div>
        </button>
        <div className="rounded-lg border border-sky-500/30 bg-sky-500/5 p-2 text-left sm:p-2.5">
          <div className="text-[9px] uppercase tracking-wide text-muted-foreground sm:text-[10px]">{t("Open", "ክፍት")}</div>
          <div className="mt-0.5 font-display text-lg font-semibold sm:text-xl">{visibleOpenOrders.length}</div>
        </div>
        <div className="rounded-lg border border-orange-500/30 bg-orange-500/5 p-2 text-left sm:p-2.5">
          <div className="text-[9px] uppercase tracking-wide text-muted-foreground sm:text-[10px]">{t("Tables", "ጠረጴዛ")}</div>
          <div className="mt-0.5 font-display text-lg font-semibold sm:text-xl">{occupiedInArea}</div>
        </div>
        <button
          type="button"
          onClick={() => setMobileCartOpen(true)}
          className="rounded-lg border border-ember/30 bg-ember/5 p-2 text-left transition-colors active:scale-[0.98] sm:p-2.5 lg:pointer-events-none"
        >
          <div className="text-[9px] uppercase tracking-wide text-muted-foreground sm:text-[10px]">{t("Cart", "ትዕዛዝ")}</div>
          <div className="mt-0.5 truncate font-display text-base font-semibold sm:text-lg">{formatOrderQty(cartLineCount)} · {formatETB(subtotal).replace("ETB ", "")}</div>
        </button>
        <div className="col-span-4 hidden rounded-lg border border-emerald-500/30 bg-emerald-500/5 p-2.5 text-left xl:col-span-1 xl:block">
          <div className="text-[10px] uppercase tracking-wide text-muted-foreground">{t("Cart total", "የትዕዛዝ ድምር")}</div>
          <div className="mt-0.5 truncate font-display text-lg font-semibold">{formatETB(subtotal)}</div>
        </div>
      </div>

      {liveEvents.length > 0 && (
        <div className="mb-3">
          <button
            type="button"
            onClick={() => setFeedExpanded((open) => !open)}
            className="flex w-full items-center gap-2 rounded-lg border border-border bg-card px-3 py-2 text-left text-xs"
          >
            <Icons.Radio className="size-3.5 shrink-0 text-muted-foreground" />
            <span className="min-w-0 flex-1 truncate font-medium">
              {liveEvents[0]?.message}
              <span className="text-muted-foreground"> · {liveEvents[0]?.at}</span>
            </span>
            <Chip tone="muted">{liveEvents.length}</Chip>
            <Icons.ChevronDown className={`size-3.5 shrink-0 text-muted-foreground transition-transform ${feedExpanded ? "rotate-180" : ""}`} />
          </button>
          {feedExpanded && (
            <div className="mt-1.5 flex gap-2 overflow-x-auto rounded-lg border border-border bg-card px-3 py-2 text-xs [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
              {liveEvents.slice(0, 8).map((event, index) => (
                <span key={`${event.at}-${event.type}-${index}`} className="shrink-0 rounded-full bg-surface-2 px-2.5 py-1">
                  {event.message}
                  <span className="text-muted-foreground"> · {event.at}</span>
                </span>
              ))}
            </div>
          )}
        </div>
      )}

      {addingToOrder ? (
        <div className="mb-3 flex items-center justify-between gap-3 rounded-lg border border-ember/30 bg-ember/10 px-3 py-2.5 text-sm lg:hidden">
          <div className="min-w-0">
            <div className="text-[11px] text-muted-foreground">
              {t("Adding to open bill", "ወደ ክፍት ሂሳብ በመጨመር ላይ")}
            </div>
            <div className="truncate font-semibold">
              {addingToOrder.orderNo} · {addingToOrder.area} · {addingToOrder.tableNumber}
            </div>
            <div className="text-[11px] text-muted-foreground">
              {t("Tap menu items, then Add below.", "የሜኑ እቃዎችን ይጫኑ፣ ከዚያ ከታች አክል ይጫኑ።")}
            </div>
          </div>
          <button
            type="button"
            onClick={cancelAddToOrder}
            className="h-9 shrink-0 rounded-lg border border-border bg-card px-3 text-xs font-medium"
          >
            {t("Cancel", "ሰርዝ")}
          </button>
        </div>
      ) : null}

      {lastSent && (
        <div className="mb-3 flex items-center justify-between gap-3 rounded-lg bg-teff/10 px-3 py-2.5 text-sm text-teff">
          <span className="min-w-0 line-clamp-2">
            {lastSent.status === "PENDING_CASHIER"
              ? `${lastSent.orderNo} ${t("sent to cashier for", "ለካሸር ተልኳል")} ${lastSent.area} ${lastSent.tableNumber}.`
              : `${lastSent.orderNo} ${t("sent to stations for", "ወደ ጣቢያዎች ተልኳል ለ")} ${lastSent.area} ${lastSent.tableNumber}.`}
          </span>
          <div className="flex shrink-0 items-center gap-1.5">
            {createsLiveOrder && !isWaiter && lastSent.status !== "PENDING_CASHIER" && (
                <button
                  type="button"
                  onClick={() => openTicketPreview(lastSent)}
                  className="inline-flex h-8 items-center gap-1.5 rounded-md border border-teff/30 bg-card px-2.5 text-xs font-semibold text-foreground hover:bg-surface-2"
                >
                  <Icons.Ticket className="size-3.5" />
                  {t("Print Bono", "ቦኖ አትም")}
                </button>
              )}
            <button
              onClick={() => setLastSent(null)}
              className="grid size-8 shrink-0 place-items-center rounded-md hover:bg-teff/10"
            >
              <Icons.X className="size-4" />
            </button>
          </div>
        </div>
      )}

      {itemClickPopup && (
        <div className="fixed inset-x-4 bottom-24 z-[60] mx-auto max-w-sm rounded-xl border border-ember/30 bg-card/95 px-4 py-3 shadow-[var(--shadow-lift)] backdrop-blur-sm animate-in fade-in slide-in-from-bottom-2 duration-200 lg:inset-x-auto lg:bottom-auto lg:right-4 lg:top-20 lg:slide-in-from-top-2">
          <div className="flex items-start gap-3">
            <div className="grid size-8 place-items-center rounded-lg bg-ember/10 text-ember">
              <Icons.Check className="size-4" />
            </div>
            <div className="min-w-0">
              <div className="text-sm font-semibold">{t("Added to order", "ወደ ትዕዛዝ ታክሏል")}</div>
              <div className="mt-0.5 truncate text-xs text-muted-foreground">
                {itemClickPopup.name} • {formatOrderQty(itemClickPopup.qty, itemClickPopup.unitLabel)}
              </div>
            </div>
          </div>
        </div>
      )}

      {stockWarning && (
        <div className="fixed inset-x-4 bottom-24 z-[60] mx-auto max-w-sm rounded-xl border border-destructive/30 bg-card/95 px-4 py-3 shadow-[var(--shadow-lift)] backdrop-blur-sm md:inset-x-auto md:right-4 lg:bottom-auto lg:top-20">
          <div className="flex items-start gap-3 text-sm">
            <div className="grid size-8 place-items-center rounded-lg bg-destructive/10 text-destructive">
              <Icons.AlertTriangle className="size-4" />
            </div>
            <div className="min-w-0">
              <div className="font-semibold text-destructive">{t("Stock warning", "የክምችት ማስጠንቀቂያ")}</div>
              <div className="mt-0.5 text-muted-foreground">{stockWarning}</div>
            </div>
          </div>
        </div>
      )}

      {restockDialog && (
        <div className="fixed inset-0 z-50 bg-foreground/40 backdrop-blur-sm grid place-items-center p-4">
          <div className="surface-card max-w-md w-full !p-5 space-y-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h3 className="font-display text-lg font-semibold">{t("Request stock", "ክምችት ጠይቅ")}</h3>
                <p className="text-xs text-muted-foreground mt-0.5">{restockDialog.itemName}</p>
              </div>
              <button type="button" onClick={() => setRestockDialog(null)} className="size-8 grid place-items-center rounded-lg hover:bg-surface-2">
                <Icons.X className="size-4" />
              </button>
            </div>
            <div className="rounded-lg bg-surface-2 border border-border p-3 space-y-2 text-sm">
              <div className="flex justify-between gap-3"><span className="text-muted-foreground">{t("Department", "ክፍል")}</span><span className="font-medium">{restockDialog.department}</span></div>
              <div className="flex justify-between gap-3"><span className="text-muted-foreground">Store 1</span><span className="font-mono">{restockDialog.store1Qty}</span></div>
              <div className="flex justify-between gap-3"><span className="text-muted-foreground">Store 2</span><span className="font-mono">{restockDialog.store2Qty}</span></div>
              <div className="flex justify-between gap-3"><span className="text-muted-foreground">{t("Source store", "የመነሻ ማከማቻ")}</span><span className="font-medium">{restockDialog.sourceStore}</span></div>
            </div>
            <div>
              <label className="text-xs text-muted-foreground">{t("Requested quantity", "የተጠየቀ ብዛት")} ({restockDialog.unit})</label>
              <input
                type="number"
                min={1}
                value={restockQty}
                onChange={(event) => setRestockQty(Number(event.target.value))}
                className="w-full mt-1 h-11 px-3 rounded-lg border border-border bg-card text-sm font-mono focus:outline-none focus:ring-2 focus:ring-ring/40"
              />
            </div>
            <div className="flex gap-2">
              <button type="button" onClick={() => setRestockDialog(null)} className="flex-1 h-11 rounded-lg border border-border text-sm hover:bg-surface-2">{t("Cancel", "ሰርዝ")}</button>
              <button type="button" onClick={submitRestockRequest} className="flex-1 h-11 rounded-lg bg-ember text-ember-foreground text-sm font-semibold">{t("Submit request", "ጥያቄ ላክ")}</button>
            </div>
          </div>
        </div>
      )}

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(280px,360px)] xl:grid-cols-[minmax(0,1fr)_minmax(320px,400px)] lg:gap-6">
        <div className="space-y-4 min-w-0">
          <Card>
            <div className="grid md:grid-cols-2 gap-3">
              <div>
                <label className="text-xs text-muted-foreground">{t("Waiter / waitress", "አስተናጋጅ / አስተናጋጅት")}</label>
                <select
                  value={selectedWaiter}
                  onChange={(e) => {
                    setWaiter(e.target.value);
                    setStationFilter("All");
                    setLetterFilter("All");
                    setStockFilter("all");
                    setSearch("");
                    setTableNumber("");
                  }}
                  disabled={isWaiter || waiterOptions.length === 0}
                  className="w-full mt-1 h-11 px-3 rounded-lg border border-border bg-card text-sm focus:outline-none focus:ring-2 focus:ring-ring/40 disabled:opacity-70"
                >
                  {isWaiter ? (
                    <option>{activeUserName}</option>
                  ) : (
                    <>
                      <option value="">{t("Select waiter", "አስተናጋጅ ይምረጡ")}</option>
                      {waiterOptions.map((name) => (
                        <option key={name} value={name}>
                          {name}
                        </option>
                      ))}
                    </>
                  )}
                </select>
              </div>
              <div>
                <label className="text-xs text-muted-foreground">
                  {t("Assigned table", "የተመደበ ጠረጴዛ")}
                </label>
                <select
                  value={selectedAssignedTable?.id ?? ""}
                  onChange={(e) => {
                    selectAssignedTable(e.target.value);
                    setStationFilter("All");
                    setLetterFilter("All");
                    setStockFilter("all");
                  }}
                  disabled={!selectedWaiter || assignedTables.length === 0}
                  className="w-full mt-1 h-11 px-3 rounded-lg border border-border bg-card text-sm focus:outline-none focus:ring-2 focus:ring-ring/40 disabled:opacity-70"
                >
                  {!selectedWaiter ? (
                    <option value="">{t("Select waiter first", "መጀመሪያ አስተናጋጅ ይምረጡ")}</option>
                  ) : assignedTables.length > 0 ? (
                    <>
                      <option value="">{t("Select table", "ጠረጴዛ ይምረጡ")}</option>
                      {assignedTables.map((table) => (
                        <option key={table.id} value={table.id}>
                          {table.area} · {table.label} ({table.status})
                        </option>
                      ))}
                    </>
                  ) : (
                    <option value="">
                      {t("No tables assigned", "የተመደበ ጠረጴዛ የለም")}
                    </option>
                  )}
                </select>
              </div>
            </div>
          </Card>

          {!posSessionReady ? (
            <div className="rounded-xl border border-dashed border-border py-14 text-center text-sm text-muted-foreground">
              {t("Select waiter and table to continue", "ለመቀጠል አስተናጋጅ እና ጠረጴዛ ይምረጡ")}
            </div>
          ) : (
            <>
          <div className="space-y-2.5">
            <div className="flex flex-wrap items-center gap-2">
              {stationFilter === "All" ? (
                <>
                  {store.menuStations.map((station) => {
                    const tone = stationTone(station);
                    return (
                      <button
                        key={station}
                        type="button"
                        onClick={() => {
                          setStationFilter(station);
                          setLetterFilter("All");
                          setStockFilter("all");
                        }}
                        className="h-10 inline-flex items-center gap-1.5 rounded-full border border-border bg-card px-4 text-sm font-medium text-muted-foreground transition-all hover:bg-surface-2 hover:text-foreground active:scale-95"
                      >
                        <span className={`size-2 rounded-full ${stationAccentClass(tone)}`} />
                        {station}
                      </button>
                    );
                  })}
                </>
              ) : (
                <button
                  type="button"
                  onClick={() => {
                    setStationFilter("All");
                    setLetterFilter("All");
                    setStockFilter("all");
                  }}
                  className="h-10 inline-flex items-center gap-2 rounded-full bg-ember px-4 text-sm font-semibold text-ember-foreground shadow-[var(--shadow-glow)] transition-all active:scale-95"
                >
                  <span className={`size-2 rounded-full ${stationAccentClass(stationTone(stationFilter))}`} />
                  {stationFilter}
                  <Icons.X className="size-3.5 opacity-90" />
                </button>
              )}
              {stationFilter !== "All" ? (
                <div className="ml-auto relative w-full sm:w-auto sm:min-w-[240px]">
                  <Icons.Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
                  <input
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    className="h-10 w-full rounded-lg border border-border bg-card pl-9 pr-9 text-sm focus:outline-none focus:ring-2 focus:ring-ring/40"
                    placeholder={t("Search menu...", "ምናሌ ፈልግ...")}
                  />
                  {search ? (
                    <button
                      type="button"
                      onClick={() => setSearch("")}
                      className="absolute right-1.5 top-1/2 grid size-7 -translate-y-1/2 place-items-center rounded-md text-muted-foreground hover:bg-surface-2 hover:text-foreground"
                      aria-label={t("Clear search", "ፍለጋ አጽዳ")}
                    >
                      <Icons.X className="size-3.5" />
                    </button>
                  ) : null}
                </div>
              ) : null}
            </div>

            {stationFilter !== "All" ? (
              <>
                <div className="flex flex-wrap items-center gap-1">
                  {letterFilter === "All" ? (
                    <>
                      <button
                        type="button"
                        onClick={() => setLetterFilter("All")}
                        className="h-7 min-w-7 rounded-md bg-foreground px-1.5 text-[11px] font-semibold text-background transition-transform active:scale-95"
                      >
                        {t("A–Z", "ሁሉም")}
                      </button>
                      {letterOptions.map((letter) => (
                        <button
                          key={letter}
                          type="button"
                          onClick={() => setLetterFilter(letter)}
                          className="h-7 min-w-7 rounded-md border border-border bg-card px-1.5 text-[11px] font-bold text-muted-foreground transition-all hover:bg-surface-2 hover:text-foreground active:scale-95"
                          aria-label={t(`Filter by ${letter}`, `በ ${letter} አጣራ`)}
                        >
                          {letter}
                        </button>
                      ))}
                    </>
                  ) : (
                    <button
                      type="button"
                      onClick={() => setLetterFilter("All")}
                      className="h-7 inline-flex min-w-7 items-center gap-1 rounded-md bg-ember px-2 text-[11px] font-bold text-ember-foreground shadow-[var(--shadow-glow)] transition-transform active:scale-95"
                      aria-label={t("Clear letter filter", "የፊደል ማጣሪያ አጽዳ")}
                    >
                      {letterFilter}
                      <Icons.X className="size-3 opacity-90" />
                    </button>
                  )}
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  {stockFilter === "all" ? (
                    <>
                      <label className="sr-only" htmlFor="pos-stock-filter">
                        {t("Stock filter", "የክምችት ማጣሪያ")}
                      </label>
                      <select
                        id="pos-stock-filter"
                        value={stockFilter}
                        onChange={(e) => setStockFilter(e.target.value as StockQuickFilter)}
                        className="h-9 w-full max-w-xs rounded-lg border border-border bg-card px-2.5 text-xs font-medium focus:outline-none focus:ring-2 focus:ring-ring/40 sm:w-auto sm:min-w-[9.5rem]"
                      >
                        <option value="all">{t("All stock", "ሁሉም ክምችት")}</option>
                        <option value="available">{t("Available", "ይገኛል")}</option>
                        <option value="low">{t("Low", "ዝቅተኛ")}</option>
                        <option value="out">{t("Out", "አልቋል")}</option>
                        <option value="in_cart">{t("In cart", "በትዕዛዝ")}</option>
                      </select>
                    </>
                  ) : (
                    <button
                      type="button"
                      onClick={() => setStockFilter("all")}
                      className="h-9 inline-flex items-center gap-1.5 rounded-lg bg-foreground px-3 text-xs font-semibold text-background transition-transform active:scale-95"
                    >
                      {stockFilter === "available"
                        ? t("Available", "ይገኛል")
                        : stockFilter === "low"
                          ? t("Low", "ዝቅተኛ")
                          : stockFilter === "out"
                            ? t("Out", "አልቋል")
                            : t("In cart", "በትዕዛዝ")}
                      <Icons.X className="size-3.5 opacity-90" />
                    </button>
                  )}
                </div>
              </>
            ) : null}
          </div>

          {stationFilter === "All" ? (
            <div className="rounded-xl border border-dashed border-border py-14 text-center text-sm text-muted-foreground">
              {t("Choose a station to browse items", "እቃዎችን ለማየት ጣቢያ ይምረጡ")}
            </div>
          ) : (
            <>
          <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-3 2xl:grid-cols-4 gap-2 sm:gap-3">
            {pageItems.map((item) => {
              const station = stationForItem(item, store.menuStations, area);
              const displayPrice = itemPriceForArea(item, area);
              const cartSummary = cartItemSummary(cart, item);
              const inCart = cartSummary.qty > 0;
              const stockInfo = getRemainingStockForItem(item);
              const trackedStock = stockInfo.tracked && stockInfo.availableQty != null;
              const remainingQty = stockInfo.remainingQty ?? null;
              const { behavior, decision } = resolveSalePolicy(item, remainingQty, Boolean(trackedStock));
              const status = stockInfo.status;
              const outOfStock = trackedStock && !decision.allowed && (remainingQty ?? 0) <= 0;
              const softWarn = trackedStock && (remainingQty ?? 0) <= 0 && decision.allowed;
              const highCost =
                displayPrice > 0 && (item.cost / displayPrice) * 100 > FOOD_COST_WARN_THRESHOLD;
              const tone = stationTone(station);
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => openItem(item)}
                  disabled={outOfStock && (behavior === "block" || behavior === "auto_unavailable")}
                  className={`group relative flex min-h-[132px] sm:min-h-[168px] lg:min-h-[188px] flex-col overflow-hidden rounded-xl border text-left shadow-sm transition-all duration-150 ease-out focus:outline-none focus:ring-2 focus:ring-ember/35 active:scale-[0.97] ${
                    outOfStock
                      ? "cursor-not-allowed border-destructive/30 bg-card opacity-60"
                      : softWarn
                        ? "border-gold/40 bg-card hover:-translate-y-0.5 hover:border-gold/50 hover:shadow-[var(--shadow-lift)] active:translate-y-0 active:scale-[0.98]"
                      : "border-border bg-card hover:-translate-y-0.5 hover:border-ember/40 hover:shadow-[var(--shadow-lift)] active:translate-y-0 active:scale-[0.98]"
                  }`}
                >
                  <div className={`h-1 w-full shrink-0 rounded-t-xl ${stationAccentClass(tone)}`} />
                  <div className="pointer-events-none absolute inset-0 bg-gradient-to-br from-ember/8 via-transparent to-transparent opacity-0 transition-opacity duration-200 group-hover:opacity-100" />
                  <div className="relative flex flex-1 flex-col gap-2 sm:gap-3 p-2.5 sm:p-3.5">
                    <div className="flex items-start justify-between gap-1.5 sm:gap-2">
                      {menuItemGlyph(item.emoji, lang) ? (
                        <div className="grid size-10 sm:size-11 lg:size-12 place-items-center rounded-xl bg-surface-2 text-xl sm:text-2xl transition-transform duration-200 group-hover:scale-110">
                          {menuItemGlyph(item.emoji, lang)}
                        </div>
                      ) : (
                        <div className="min-w-0" />
                      )}
                      <div className="flex min-w-0 flex-col items-end gap-1">
                        <Chip tone={tone}>
                          <span className="max-w-[3.5rem] sm:max-w-[4.5rem] truncate text-[9px] sm:text-[10px]">{station}</span>
                        </Chip>
                        {trackedStock && status ? (
                          <Chip tone={availabilityTone(status)}>
                            <span className="text-[9px] sm:text-[10px]">{availabilityLabel(status, t)}</span>
                          </Chip>
                        ) : null}
                        {inCart ? <Chip tone="teff"><span className="text-[9px] sm:text-[10px]">{cartSummary.qty}</span></Chip> : null}
                      </div>
                    </div>
                    <div className="flex min-h-0 flex-1 items-start">
                      <div className="min-w-0 font-display text-sm sm:text-base lg:text-lg font-semibold leading-snug line-clamp-2 sm:line-clamp-3 break-words">
                        {itemLabel(item)}
                      </div>
                    </div>
                    <div className="mt-auto flex items-end justify-between gap-2">
                      <div className="min-w-0 flex-1">
                        <div className="font-mono text-base sm:text-lg font-bold text-foreground leading-none">
                          {formatETB(displayPrice).replace("ETB ", "")}
                          {highCost && (
                            <span title={t("High food cost", "ከፍተኛ የምግብ ወጪ")}>
                              <Icons.AlertTriangle className="ml-1 inline size-3 text-gold-foreground" />
                            </span>
                          )}
                        </div>
                        <div className="mt-1 text-[10px] sm:text-[11px] text-muted-foreground line-clamp-1 sm:line-clamp-2">
                          {itemUnitLabel(item, store.menuStations)}
                        </div>
                        {trackedStock ? (
                          <div className={`mt-1 text-[10px] sm:text-[11px] line-clamp-2 ${outOfStock ? "text-destructive" : "text-muted-foreground"}`}>
                            {`${t("Sellable", "ሊሸጥ የሚችል")}${stockInfo.location ? ` (${stockInfo.location})` : ""}: ${formatOrderQty(Math.max(0, remainingQty ?? 0), item.unitLabel)}`}
                            {stockInfo.reservedQty > 0 ? ` · ${t("Reserved", "ሪዘርቭ")}: ${formatOrderQty(stockInfo.reservedQty, item.unitLabel)}` : ""}
                            {stockInfo.bottleneckItemName ? ` · ${stockInfo.bottleneckItemName}` : ""}
                          </div>
                        ) : null}
                        {inCart ? (
                          <div className="mt-1 text-[10px] sm:text-[11px] font-medium text-teff line-clamp-1">
                            {t("In cart", "በትዕዛዝ")}: {formatETB(cartSummary.total)}
                          </div>
                        ) : null}
                      </div>
                      {(status === "Low" || status === "Out" || status === "Insufficient Ingredients") && stockInfo.stockItemId && canManageBills ? (
                        <span
                          role="button"
                          tabIndex={0}
                          onClick={(event) => {
                            event.stopPropagation();
                            openRestockDialog(item, stockInfo);
                          }}
                          onKeyDown={(event) => {
                            if (event.key === "Enter" || event.key === " ") {
                              event.preventDefault();
                              event.stopPropagation();
                              openRestockDialog(item, stockInfo);
                            }
                          }}
                          className="grid min-h-9 min-w-9 sm:min-h-10 sm:min-w-10 shrink-0 place-items-center self-end rounded-xl border border-border bg-card px-1.5 text-[9px] sm:text-[10px] font-semibold hover:bg-surface-2"
                        >
                          {t("Request", "ጠይቅ")}
                        </span>
                      ) : (
                        <span className="grid size-8 sm:size-9 shrink-0 place-items-center self-end rounded-xl bg-ember/10 text-ember transition-all duration-200 group-hover:scale-110 group-hover:bg-ember group-hover:text-ember-foreground group-active:scale-95">
                          <Icons.Plus className="size-4" />
                        </span>
                      )}
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
          {stockFilteredItems.length === 0 ? (
            <div className="py-10 text-center text-sm text-muted-foreground">
              {t("No items match", "ምንም ዕቃ አልተገኘም")}
            </div>
          ) : totalPages > 1 ? (
            <div className="flex flex-col gap-3 border-t border-border px-1 pt-4 sm:flex-row sm:items-center sm:justify-between">
              <div className="text-xs text-muted-foreground">
                {t("Showing", "እያሳየ")}{" "}
                <span className="font-medium text-foreground">
                  {startRow}-{endRow}
                </span>{" "}
                {t("of", "ከ")}{" "}
                <span className="font-medium text-foreground">{stockFilteredItems.length}</span>
              </div>
              <div className="flex flex-wrap items-center justify-end gap-1">
                <button
                  type="button"
                  onClick={() => setPage((current) => Math.max(1, current - 1))}
                  disabled={currentPage === 1}
                  aria-label={t("Previous page", "የቀደመው ገጽ")}
                  className="inline-flex size-10 items-center justify-center rounded-lg border border-border text-muted-foreground transition-colors hover:bg-surface-2 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <Icons.ChevronLeft className="size-4" />
                </button>
                {pageSteps.map((step, index) =>
                  step === "ellipsis" ? (
                    <span
                      key={`pos-page-ellipsis-${index}`}
                      className="inline-flex size-10 items-center justify-center text-muted-foreground"
                      aria-hidden="true"
                    >
                      <Icons.MoreHorizontal className="size-4" />
                    </span>
                  ) : (
                    <button
                      key={step}
                      type="button"
                      onClick={() => setPage(step)}
                      aria-current={step === currentPage ? "page" : undefined}
                      className={[
                        "inline-flex size-10 items-center justify-center rounded-lg border text-sm transition-colors",
                        step === currentPage
                          ? "border-primary bg-primary text-primary-foreground"
                          : "border-border text-foreground hover:bg-surface-2",
                      ].join(" ")}
                    >
                      {step}
                    </button>
                  ),
                )}
                <button
                  type="button"
                  onClick={() => setPage((current) => Math.min(totalPages, current + 1))}
                  disabled={currentPage === totalPages}
                  aria-label={t("Next page", "የሚቀጥለው ገጽ")}
                  className="inline-flex size-10 items-center justify-center rounded-lg border border-border text-muted-foreground transition-colors hover:bg-surface-2 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <Icons.ChevronRight className="size-4" />
                </button>
              </div>
            </div>
          ) : null}
            </>
          )}
            </>
          )}
        </div>

        <aside className="space-y-4">
          {canSendToStations && pendingCashierOrders.length > 0 && (
            <Card className="!p-0 overflow-hidden ring-2 ring-ember/30">
              <div className="p-4 border-b border-border bg-ember/5">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <div className="font-display font-semibold">{t("Waiter orders waiting", "እየተጠበቁ ያሉ የአስተናጋጅ ትዕዛዞች")}</div>
                    <div className="text-xs text-muted-foreground">
                      {t("Accept and print Bono", "ተቀብለህ ቦኖ አትም")}
                    </div>
                  </div>
                  <Chip tone="ember">{pendingCashierOrders.length} {t("new", "አዲስ")}</Chip>
                </div>
              </div>
              <div className="p-3 space-y-2 max-h-[260px] overflow-y-auto">
                {pendingCashierOrders.map((order) => (
                  <div key={order.id} className="rounded-lg border border-border bg-card p-3">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <div className="font-mono text-sm font-semibold">{order.orderNo}</div>
                        <div className="text-xs text-muted-foreground">
                          {order.area} · {order.tableNumber}
                        </div>
                        <div className="text-xs mt-1">
                          {t("Waiter", "አስተናጋጅ")}: <span className="font-medium">{order.waiter}</span>
                        </div>
                      </div>
                      <div className="text-right">
                        <div className="font-mono text-sm font-semibold">
                          {formatETB(order.total)}
                        </div>
                        <div className="text-[10px] text-muted-foreground">
                          {t("Requested", "ተጠይቋል")} {order.requestedAt ?? order.sentAt}
                        </div>
                      </div>
                    </div>
                    <button
                      onClick={() => void acceptWaiterOrder(order)}
                      className="w-full h-10 mt-3 rounded-lg bg-ember text-ember-foreground text-xs font-semibold inline-flex items-center justify-center gap-2"
                    >
                      <Icons.Send className="size-3.5" /> {t("Accept and send", "ተቀብለህ ላክ")}
                    </button>
                  </div>
                ))}
              </div>
            </Card>
          )}

          <div className="hidden space-y-4 self-start lg:block lg:sticky lg:top-14 lg:z-10 lg:max-h-[calc(100dvh-3.5rem)] lg:overflow-y-auto lg:overscroll-contain lg:pb-2">
            <Card className="!p-0 overflow-hidden flex flex-col max-h-[min(62dvh,calc(100dvh-14rem))]">
              <div className="shrink-0 border-b border-border p-3">
                {addingToOrder ? (
                  <>
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <div className="text-xs text-muted-foreground">
                          {t("Adding to open bill", "ወደ ክፍት ሂሳብ በመጨመር ላይ")}
                        </div>
                        <div className="font-display text-base font-semibold break-words">
                          {addingToOrder.orderNo} · {addingToOrder.area} · {addingToOrder.tableNumber}
                        </div>
                        <div className="text-xs text-muted-foreground">{addingToOrder.waiter}</div>
                      </div>
                      <button
                        type="button"
                        onClick={cancelAddToOrder}
                        className="shrink-0 rounded-md border border-border px-2 py-1 text-[11px] font-medium hover:bg-surface-2"
                      >
                        {t("Cancel", "ሰርዝ")}
                      </button>
                    </div>
                  </>
                ) : (
                  <>
                    <div className="text-xs text-muted-foreground">{t("New order", "አዲስ ትዕዛዝ")}</div>
                    <div className="font-display text-base font-semibold break-words">
                      {area} · {tableNumber || t("No table", "ጠረጴዛ የለም")}
                    </div>
                    {isWaiter ? (
                      <div className="mt-1 text-[11px] text-muted-foreground">
                        {t("Items go to their stations automatically.", "እቃዎች በራስ-ሰር ወደ ጣቢያቸው ይሄዳሉ።")}
                      </div>
                    ) : null}
                  </>
                )}
              </div>
              <div className="min-h-0 flex-1 space-y-2 overflow-y-auto overscroll-contain p-3">
                {cart.length === 0 && (
                  <div className="py-8 text-center text-sm text-muted-foreground">
                    {addingToOrder
                      ? t("Select items to add to this open bill.", "ለዚህ ክፍት ሂሳብ የሚጨመሩ እቃዎችን ይምረጡ።")
                      : t("Select menu items for this waiter order.", "ለዚህ የአስተናጋጅ ትዕዛዝ የሜኑ እቃዎችን ይምረጡ።")}
                  </div>
                )}
                {cart.map((line) => {
                  const lineIssue = cartStockIssues.find((issue) => issue.item.id === line.item.id);
                  const station = stationForItem(line.item, store.menuStations, area);
                  const prepSummary = [
                    ...(line.preferences ?? []).map((value) =>
                      translateBonoPreference(value.toUpperCase(), lang),
                    ),
                    line.note?.trim(),
                  ]
                    .filter(Boolean)
                    .join(" · ");
                  return (
                  <div key={cartLineKey(line)} className="flex items-center gap-2.5">
                    {menuItemGlyph(line.item.emoji, lang) ? (
                      <span className="text-xl shrink-0">{menuItemGlyph(line.item.emoji, lang)}</span>
                    ) : null}
                    <div className="flex-1 min-w-0">
                      <div className="truncate text-sm font-medium">
                        {menuItemName(line.item, lang)}
                      </div>
                      <div className="truncate text-[11px] text-muted-foreground">
                        {station} - {formatETB(line.unitPrice)}{" "}
                        {line.unitLabel ?? itemUnitLabel(line.item, store.menuStations)}
                      </div>
                      {prepSummary ? (
                        <div className="truncate text-[11px] font-semibold uppercase text-foreground/80">
                          {prepSummary}
                        </div>
                      ) : null}
                      {lineIssue && (
                        <div className="mt-0.5 text-[11px] text-destructive">
                          {t("Exceeds stock", "ከክምችት በላይ")}
                        </div>
                      )}
                    </div>
                    <div className="flex shrink-0 items-center gap-1">
                      {isBonoMenuItem(line.item, store.menuStations, area) && (
                        <button
                          type="button"
                          onClick={() => openPrepDraft(line.item, line)}
                          className={`${TOUCH_BTN} border border-border hover:bg-surface-2`}
                          aria-label={t("Extras", "ተጨማሪዎች")}
                        >
                          <Icons.SlidersHorizontal className="size-3.5" />
                          {t("Extras", "ተጨማሪዎች")}
                        </button>
                      )}
                      <button
                        onClick={() => dec(line)}
                        className={TOUCH_ICON_BTN}
                        aria-label={t("Decrease", "ቀንስ")}
                      >
                        <Icons.Minus className="size-4" />
                      </button>
                      <span className="min-w-10 text-center text-sm font-semibold tabular-nums">
                        {formatLineQty(line)}
                      </span>
                      <button
                        onClick={() => addToCart({ ...line, qty: line.qtyStep })}
                        className={TOUCH_ICON_BTN}
                        aria-label={t("Increase", "ጨምር")}
                      >
                        <Icons.Plus className="size-4" />
                      </button>
                    </div>
                  </div>
                  );
                })}
              </div>
              <div className="shrink-0 space-y-2.5 border-t border-border bg-card p-3">
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">{t("Total amount", "ጠቅላላ መጠን")}</span>
                  <span className="font-mono font-semibold">{formatETB(subtotal)}</span>
                </div>
                {cartStations.length > 0 && (
                  <div className="flex flex-wrap gap-1">
                    {cartStations.map((station) => (
                      <Chip key={station} tone="muted">{station}</Chip>
                    ))}
                  </div>
                )}
                <button
                  onClick={() => void sendOrder()}
                  disabled={sendDisabled}
                  className="inline-flex h-12 w-full items-center justify-center gap-2 rounded-lg bg-ember text-sm font-semibold text-ember-foreground shadow-[var(--shadow-glow)] disabled:opacity-40"
                >
                  {sendBusy ? (
                    <Icons.Loader2 className="size-4 animate-spin" />
                  ) : (
                    <Icons.Send className="size-4" />
                  )}{" "}
                  {sendButtonLabel}
                </button>
                {hasCartStockConflict && (
                  <div className="space-y-2 rounded-lg border border-destructive/25 bg-destructive/5 px-3 py-2 text-xs text-destructive">
                    <div>
                      {t(
                        "One or more items in the cart exceed available stock. Reduce quantity before sending.",
                        "በጋሪው ውስጥ ያሉ አንዳንድ እቃዎች ካለው ክምችት በላይ ናቸው። ከመላክ በፊት መጠኑን ይቀንሱ።",
                      )}
                    </div>
                    {cartNeedsManagerOverride && !managerStockOverride && (
                      <button
                        type="button"
                        onClick={() => setManagerStockOverride(true)}
                        className="h-10 px-3 rounded-md border border-destructive/40 text-xs font-semibold text-destructive hover:bg-destructive/10"
                      >
                        {t("Manager override", "የአስተዳዳሪ ማለፍ")}
                      </button>
                    )}
                    {managerStockOverride && (
                      <div className="text-muted-foreground">
                        {t("Manager override active for this cart.", "ለዚህ ጋሪ የአስተዳዳሪ ማለፍ ንቁ ነው።")}
                      </div>
                    )}
                  </div>
                )}
                {cart.length > 0 && (
                  <button
                    onClick={() => {
                      setCart([]);
                      setManagerStockOverride(false);
                    }}
                    className="h-10 w-full rounded-lg border border-destructive/30 text-xs text-destructive hover:bg-destructive/5"
                  >
                    {t("Clear order", "ትዕዛዝ አጽዳ")}
                  </button>
                )}
              </div>
            </Card>

            {canApproveReturns && pendingReturnOrders.length > 0 ? (
              <Card className="border-rose-500/40 bg-rose-500/10">
                <div className="mb-3 flex items-center justify-between gap-2">
                  <h3 className="font-display font-semibold text-rose-800 dark:text-rose-200">
                    {t("Return requests need approval", "የመልስ ጥያቄዎች ማፅደቅ ያስፈልጋቸዋል")}
                  </h3>
                  <Chip tone="destructive">{pendingReturnOrders.length}</Chip>
                </div>
                <div className="space-y-2">
                  {pendingReturnOrders.map((order) => {
                    const itemsSummary = summarizeReturnRequestedLines(
                      order.items,
                      order.returnRequestedLines,
                    );
                    return (
                      <div
                        key={order.id}
                        className="rounded-lg border border-rose-500/30 bg-card p-3"
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0">
                            <div className="font-mono text-sm font-semibold">{order.orderNo}</div>
                            <div className="text-xs text-muted-foreground">
                              {order.area} · {order.tableNumber} · {order.waiter}
                            </div>
                            <div className="mt-1 text-xs font-medium text-rose-800 dark:text-rose-200">
                              {t("Requested by", "የጠየቀ")}: {order.returnRequestedBy}
                              {order.returnReason ? ` — ${order.returnReason}` : ""}
                            </div>
                            {itemsSummary ? (
                              <div className="mt-1 text-xs text-muted-foreground">{itemsSummary}</div>
                            ) : null}
                          </div>
                          <span className="font-mono text-sm font-semibold">{formatETB(order.total)}</span>
                        </div>
                        <div className="mt-2 flex gap-2">
                          <button
                            type="button"
                            onClick={() => rejectPendingReturn(order.id)}
                            className="h-8 rounded-md border border-border px-3 text-xs font-semibold hover:bg-surface-2"
                          >
                            {t("Reject", "ውድቅ")}
                          </button>
                          <button
                            type="button"
                            onClick={() => openReturnOrder(order)}
                            className="h-8 rounded-md bg-ember px-3 text-xs font-semibold text-ember-foreground"
                          >
                            {t("Review & approve", "ይገምግሙ እና ያፅድቁ")}
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </Card>
            ) : null}

            {canApproveTransfers && pendingTransferGroups.length > 0 ? (
              <Card>
                <h3 className="mb-3 font-display font-semibold">
                  {t("Pending bill transfers", "በመጠባበቅ ላይ ያሉ የሂሳብ ማስተላለፎች")}
                </h3>
                <div className="space-y-2">
                  {pendingTransferGroups.map((group) => (
                    <div key={`${group.from}->${group.to}`} className="rounded-lg border border-amber-500/30 bg-amber-500/5 p-3">
                      <div className="text-sm font-medium">
                        {group.from} → {group.to}
                      </div>
                      <div className="mt-1 text-xs text-muted-foreground">
                        {group.bills.map((bill) => `${bill.orderNo} (${bill.tableNumber})`).join(" · ")}
                      </div>
                      <div className="mt-2 flex gap-2">
                        <button
                          type="button"
                          onClick={() => rejectPendingTransfer(group.orderIds)}
                          className="h-8 rounded-md border border-border px-3 text-xs font-semibold hover:bg-surface-2"
                        >
                          {t("Reject", "ውድቅ")}
                        </button>
                        <button
                          type="button"
                          onClick={() => approvePendingTransfer(group.from, group.to, group.orderIds)}
                          className="h-8 rounded-md bg-ember px-3 text-xs font-semibold text-ember-foreground"
                        >
                          {t("Approve", "አፅድቅ")}
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </Card>
            ) : null}

            <Card>
              <div className="mb-3 flex items-center justify-between gap-2">
                <h3 className="font-display font-semibold">
                  {canManageBills ? t("Open bills", "ክፍት ሂሳቦች") : t("My bills", "የእኔ ሂሳቦች")}
                </h3>
                <div className="flex items-center gap-1.5">
                  <Chip tone="muted">
                    {filteredOpenOrders.length === visibleOpenOrders.length
                      ? visibleOpenOrders.length
                      : `${filteredOpenOrders.length}/${visibleOpenOrders.length}`}
                  </Chip>
                  {canTransferBills ? (
                    <button
                      type="button"
                      onClick={openBillTransfer}
                      className="inline-flex h-8 items-center gap-1 rounded-md border border-border px-2 text-[11px] font-semibold hover:bg-surface-2"
                    >
                      <Icons.ArrowRightLeft className="size-3.5" />
                      {t("Transfer", "አስተላልፍ")}
                    </button>
                  ) : null}
                </div>
              </div>

              <div className="mb-3 space-y-2">
                <div className="relative">
                  <Icons.Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
                  <input
                    value={openBillSearch}
                    onChange={(e) => setOpenBillSearch(e.target.value)}
                    className="h-9 w-full rounded-lg border border-border bg-card pl-8 pr-8 text-sm focus:outline-none focus:ring-2 focus:ring-ring/40"
                    placeholder={t("Search table, order, waiter…", "ጠረጴዛ፣ ትዕዛዝ፣ አስተናጋጅ ፈልግ…")}
                  />
                  {openBillSearch ? (
                    <button
                      type="button"
                      onClick={() => setOpenBillSearch("")}
                      className="absolute right-1.5 top-1/2 grid size-6 -translate-y-1/2 place-items-center rounded-md text-muted-foreground hover:bg-surface-2"
                      aria-label={t("Clear search", "ፍለጋ አጽዳ")}
                    >
                      <Icons.X className="size-3.5" />
                    </button>
                  ) : null}
                </div>

                <div className="flex flex-wrap gap-1">
                  {(
                    [
                      ["today", t("Today", "ዛሬ")],
                      ["prior", t("Prior days", "ያለፉ ቀናት")],
                      ["all", t("All days", "ሁሉም ቀናት")],
                    ] as const
                  ).map(([id, label]) => (
                    <button
                      key={id}
                      type="button"
                      onClick={() => setOpenBillDayScope(id)}
                      className={`h-7 rounded-md px-2 text-[11px] font-semibold transition-colors ${
                        openBillDayScope === id
                          ? "bg-ember text-ember-foreground"
                          : "border border-border hover:bg-surface-2"
                      }`}
                    >
                      {label}
                      {id === "prior" && priorOpenBillCount > 0 ? (
                        <span className="ml-1 tabular-nums opacity-90">({priorOpenBillCount})</span>
                      ) : null}
                    </button>
                  ))}
                </div>
                {openBillDayScope === "today" && priorOpenBillCount > 0 ? (
                  <button
                    type="button"
                    onClick={() => setOpenBillDayScope("prior")}
                    className="w-full rounded-md border border-gold/40 bg-gold/10 px-2.5 py-1.5 text-left text-[11px] text-foreground hover:bg-gold/15"
                  >
                    {t(
                      `${priorOpenBillCount} unpaid bill(s) from prior days — tap to review & settle.`,
                      `${priorOpenBillCount} ያለፉ ቀናት ክፍት ሂሳቦች — ለመክፈል/ለማጽዳት ይጫኑ።`,
                    )}
                  </button>
                ) : null}

                <div className="flex flex-wrap gap-1">
                  {(
                    [
                      ["all", t("All", "ሁሉም")],
                      ["pay", t("Ready to pay", "ለክፍያ ዝግጁ")],
                      ["receipt", t("Need receipt", "ደረሰኝ ያስፈልጋል")],
                      ["pending", t("Pending cashier", "ካሸር እየጠበቀ")],
                      ["return", t("Returns", "መልሶች")],
                    ] as const
                  ).map(([id, label]) => (
                    <button
                      key={id}
                      type="button"
                      onClick={() => setOpenBillQuickFilter(id)}
                      className={`h-7 rounded-md px-2 text-[11px] font-semibold transition-colors ${
                        openBillQuickFilter === id
                          ? "bg-foreground text-background"
                          : "border border-border hover:bg-surface-2"
                      }`}
                    >
                      {label}
                    </button>
                  ))}
                </div>

                <div className="flex flex-wrap gap-1.5">
                  <select
                    value={openBillAreaFilter}
                    onChange={(e) => setOpenBillAreaFilter(e.target.value)}
                    className="h-8 min-w-0 flex-1 rounded-md border border-border bg-card px-2 text-xs"
                    aria-label={t("Filter by area", "በአካባቢ አጣራ")}
                  >
                    {openBillAreaOptions.map((option) => (
                      <option key={option} value={option}>
                        {option === "All" ? t("All areas", "ሁሉም አካባቢዎች") : option}
                      </option>
                    ))}
                  </select>
                  {canManageBills ? (
                    <select
                      value={openBillWaiterFilter}
                      onChange={(e) => setOpenBillWaiterFilter(e.target.value)}
                      className="h-8 min-w-0 flex-1 rounded-md border border-border bg-card px-2 text-xs"
                      aria-label={t("Filter by waiter", "በአስተናጋጅ አጣራ")}
                    >
                      {openBillWaiterOptions.map((option) => (
                        <option key={option} value={option}>
                          {option === "All" ? t("All waiters", "ሁሉም አስተናጋጆች") : option}
                        </option>
                      ))}
                    </select>
                  ) : null}
                  <select
                    value={openBillSort}
                    onChange={(e) => setOpenBillSort(e.target.value as OpenBillSort)}
                    className="h-8 min-w-0 flex-1 rounded-md border border-border bg-card px-2 text-xs"
                    aria-label={t("Sort bills", "ሂሳቦችን ደርድር")}
                  >
                    <option value="newest">{t("Newest", "አዲስ")}</option>
                    <option value="table">{t("Table", "ጠረጴዛ")}</option>
                    <option value="amount">{t("Amount", "መጠን")}</option>
                    <option value="waiter">{t("Waiter", "አስተናጋጅ")}</option>
                  </select>
                  {openBillFiltersActive ? (
                    <button
                      type="button"
                      onClick={clearOpenBillFilters}
                      className="inline-flex h-8 items-center gap-1 rounded-md border border-border px-2 text-[11px] font-semibold hover:bg-surface-2"
                    >
                      <Icons.RotateCcw className="size-3" />
                      {t("Reset", "መልስ")}
                    </button>
                  ) : null}
                </div>
              </div>

              <div className="max-h-[min(42dvh,360px)] space-y-2 overflow-y-auto overscroll-contain pr-1">
              {filteredOpenOrders.map((order) => (
                <div
                  key={order.id}
                  className={`rounded-lg border bg-card p-3 ${
                    canApproveReturns && canApproveReturnOrder(order)
                      ? "border-rose-500/50 ring-1 ring-rose-500/20"
                      : addingToOrder?.id === order.id
                        ? "border-ember ring-1 ring-ember/20"
                        : "border-border"
                  }`}
                >
                  <button
                    type="button"
                    onClick={() => focusOpenBillSeat(order)}
                    className="flex w-full items-start justify-between gap-2 rounded-md text-left hover:bg-surface-2/60"
                    title={t("Jump to this table", "ወደዚህ ጠረጴዛ ሂድ")}
                  >
                    <div className="min-w-0">
                      <div className="truncate font-mono text-sm font-semibold">{order.orderNo}</div>
                      <div className="text-xs text-muted-foreground line-clamp-2">
                        {order.area} · {order.tableNumber} · {order.waiter}
                      </div>
                      <div className="mt-1 flex flex-wrap gap-1">
                        {order.tableClearedAt ? (
                          <span className="inline-flex rounded-full bg-gold/15 px-2 py-0.5 text-[11px] font-semibold text-foreground">
                            {t("Seat cleared · pay", "ጠረጴዛ ተፀድቷል · ክፈል")}
                          </span>
                        ) : null}
                        {openBillDayScope !== "today" &&
                        matchesOpenBillDayScope(order, "prior", openBillTodayKey) ? (
                          <span className="inline-flex rounded-full bg-muted px-2 py-0.5 text-[11px] font-semibold text-muted-foreground">
                            {orderBusinessDayKey(order) || t("Undated", "ቀን የለውም")}
                          </span>
                        ) : null}
                        {canApproveReturns && canApproveReturnOrder(order) ? (
                          <span className="inline-flex rounded-full bg-rose-500/15 px-2 py-0.5 text-[11px] font-semibold text-rose-800 dark:text-rose-200">
                            {t("Return requested", "መልስ ተጠይቋል")} · {order.returnRequestedBy}
                          </span>
                        ) : null}
                      </div>
                    </div>
                    <div className="flex flex-col items-end gap-1">
                      <span className={`inline-flex rounded-full px-2 py-0.5 text-[11px] font-medium ${statusBadgeClass(order.status)}`}>
                        {orderStatusLabel(order.status, lang)}
                      </span>
                      <span className={`inline-flex rounded-full px-2 py-0.5 text-[11px] font-medium ${paymentBadgeClass(displayPaymentStatus(order))}`}>
                        {displayPaymentStatus(order)}
                      </span>
                    </div>
                  </button>
                  <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                    <span className="font-mono text-sm font-semibold">{formatETB(order.total)}</span>
                    <div className="flex flex-wrap items-center justify-end gap-1.5">
                      {order.status === "PENDING_CASHIER" ? (
                        canSendToStations ? (
                          <button
                            onClick={() => void acceptWaiterOrder(order)}
                            className={`${TOUCH_BTN} bg-ember text-ember-foreground`}
                          >
                            <Icons.Send className="size-3.5" /> {t("Accept", "ተቀበል")}
                          </button>
                        ) : (
                            <span className="text-xs text-muted-foreground">{t("Waiting cashier", "ካሸር እየጠበቀ")}</span>
                        )
                      ) : (
                        canManageBills &&
                        order.receipt && (
                          <button
                            onClick={() => setReceiptView({ order, receipt: order.receipt! })}
                            className={`${TOUCH_BTN} border border-border hover:bg-surface-2`}
                          >
                <Icons.Eye className="size-3.5" /> {t("Preview", "ቅድመ እይታ")}
                          </button>
                        )
                      )}
                      {canAddItemsToOrder(order) && (canManageBills || assignedWaiterMatches(order.waiter, user)) && (
                        <button
                          type="button"
                          onClick={() => startAddToOrder(order)}
                          className={`${TOUCH_BTN} ${
                            addingToOrder?.id === order.id
                              ? "border-ember bg-ember/10 text-ember"
                              : "border border-border hover:bg-surface-2"
                          }`}
                        >
                          <Icons.Plus className="size-3.5" />
                          {addingToOrder?.id === order.id ? t("Adding…", "በመጨመር…") : t("Add items", "እቃዎች አክል")}
                        </button>
                      )}
                      {canManageBills && order.status !== "PENDING_CASHIER" && (
                          <BonoStationActions
                            order={order}
                            compact
                            onPreview={() => openTicketPreview(order)}
                          />
                        )}
                      {canUseReturns && canRequestReturnOrder(order) && (
                        <button
                          type="button"
                          onClick={() => openReturnOrder(order)}
                          className={`${TOUCH_BTN} border border-border hover:bg-surface-2`}
                        >
                          <Icons.RotateCcw className="size-3.5" />
                          {t("Return", "መልስ")}
                        </button>
                      )}
                      {canApproveReturns && canApproveReturnOrder(order) && (
                        <button
                          type="button"
                          onClick={() => openReturnOrder(order)}
                          className={`${TOUCH_BTN} border border-gold/40 bg-gold/10`}
                        >
                          <Icons.ShieldCheck className="size-3.5" /> {t("Approve return", "መልስ አፅድቅ")}
                        </button>
                      )}
                      {!canApproveReturns && order.returnRequestedBy && (
                        <span className={`${TOUCH_BTN} border border-gold/40 bg-gold/10 text-gold-foreground`}>
                          {t("Return pending", "መልስ እየጠበቀ")}
                        </span>
                      )}
                      {canManageBills && order.status !== "PENDING_CASHIER" && (order.receipt || canGenerateReceipt(order)) && (
                        <button
                          onClick={() => openPayment(order)}
                          className={`${TOUCH_BTN} bg-foreground text-background`}
                        >
                          {order.receipt ? (
                            <Icons.Wallet className="size-3.5" />
                          ) : (
                            <Icons.ReceiptText className="size-3.5" />
                          )}
                          {order.receipt ? t("Take payment", "ክፍያ ፈጽም") : t("Generate receipt", "ደረሰኝ ፍጠር")}
                        </button>
                      )}
                      {isWaiter &&
                        (assignedWaiterMatches(order.waiter, user) || assignedWaiterMatches(order.orderedByWaiter, user)) &&
                        order.status !== "PENDING_CASHIER" &&
                        (order.receipt || canGenerateReceipt(order)) && (
                          <button
                            type="button"
                            onClick={() => generateOrShowReceipt(order)}
                            className={`${TOUCH_BTN} bg-foreground text-background`}
                          >
                            <Icons.Receipt className="size-3.5" />
                            {order.receipt
                              ? t("Show receipt", "ደረሰኝ አሳይ")
                              : t("Generate receipt", "ደረሰኝ ፍጠር")}
                          </button>
                        )}
                      {canManageBills && order.status !== "PENDING_CASHIER" && !order.receipt && !canGenerateReceipt(order) && (
                        <span className={`${TOUCH_BTN} border border-border text-muted-foreground`}>
                          <Icons.Clock className="size-3.5" /> {t("Not ready", "አልተዘጋጀም")}
                        </span>
                      )}
                      {!canManageBills && order.status !== "PENDING_CASHIER" && (
                        <Link
                          to="/app/orders"
                          className="inline-flex h-10 items-center gap-1.5 rounded-lg border border-border px-3 text-xs font-medium hover:bg-surface-2"
                        >
                           <Icons.ClipboardList className="size-3.5" /> {t("View status", "ሁኔታ ይመልከቱ")}
                        </Link>
                      )}
                    </div>
                  </div>
                </div>
              ))}
              {visibleOpenOrders.length === 0 ? (
                <div className="py-6 text-center text-sm text-muted-foreground">
                  {canManageBills ? t("No open bills.", "ክፍት ሂሳቦች የሉም።") : t("No active orders assigned to you.", "ለእርስዎ የተመደቡ ንቁ ትዕዛዞች የሉም።")}
                </div>
              ) : filteredOpenOrders.length === 0 ? (
                <div className="py-6 text-center text-sm text-muted-foreground">
                  <div>
                    {openBillDayScope === "today"
                      ? t("No open bills for today.", "ለዛሬ ክፍት ሂሳቦች የሉም።")
                      : openBillDayScope === "prior"
                        ? t("No prior-day open bills.", "ያለፉ ቀናት ክፍት ሂሳቦች የሉም።")
                        : t("No bills match these filters.", "ከእነዚህ ማጣሪያዎች ጋር የሚዛመድ ሂሳብ የለም።")}
                  </div>
                  {openBillDayScope === "today" && priorOpenBillCount > 0 ? (
                    <button
                      type="button"
                      onClick={() => setOpenBillDayScope("prior")}
                      className="mt-2 text-xs font-semibold text-ember hover:underline"
                    >
                      {t(
                        `Show ${priorOpenBillCount} prior-day bill(s)`,
                        `${priorOpenBillCount} ያለፉ ቀናት ሂሳቦችን አሳይ`,
                      )}
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={clearOpenBillFilters}
                      className="mt-2 text-xs font-semibold text-ember hover:underline"
                    >
                      {t("Clear filters", "ማጣሪያዎችን አጽዳ")}
                    </button>
                  )}
                </div>
              ) : null}
              </div>
            </Card>
          </div>

          {/* Mobile open bills (desktop bills live in sticky column above) */}
          <Card className="lg:hidden">
              <div className="mb-3 flex items-center justify-between">
                <h3 className="font-display text-sm font-semibold">
                  {canManageBills ? t("Open bills", "ክፍት ሂሳቦች") : t("My order updates", "የትዕዛዜ ማሻሻያዎች")}
                </h3>
                <Chip tone="muted">
                  {filteredOpenOrders.length === visibleOpenOrders.length
                    ? visibleOpenOrders.length
                    : `${filteredOpenOrders.length}/${visibleOpenOrders.length}`}
                </Chip>
              </div>

              <div className="mb-2 space-y-2">
                <div className="relative">
                  <Icons.Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
                  <input
                    value={openBillSearch}
                    onChange={(e) => setOpenBillSearch(e.target.value)}
                    className="h-9 w-full rounded-lg border border-border bg-card pl-8 pr-8 text-sm focus:outline-none focus:ring-2 focus:ring-ring/40"
                    placeholder={t("Search bills…", "ሂሳቦችን ፈልግ…")}
                  />
                  {openBillSearch ? (
                    <button
                      type="button"
                      onClick={() => setOpenBillSearch("")}
                      className="absolute right-1.5 top-1/2 grid size-6 -translate-y-1/2 place-items-center rounded-md text-muted-foreground hover:bg-surface-2"
                      aria-label={t("Clear search", "ፍለጋ አጽዳ")}
                    >
                      <Icons.X className="size-3.5" />
                    </button>
                  ) : null}
                </div>
                <div className="flex gap-1.5 overflow-x-auto pb-0.5">
                  {(
                    [
                      ["today", t("Today", "ዛሬ")],
                      ["prior", t("Prior", "ያለፉ")],
                      ["all", t("All days", "ሁሉም")],
                    ] as const
                  ).map(([id, label]) => (
                    <button
                      key={id}
                      type="button"
                      onClick={() => setOpenBillDayScope(id)}
                      className={`h-7 shrink-0 rounded-md px-2.5 text-[11px] font-semibold ${
                        openBillDayScope === id
                          ? "bg-ember text-ember-foreground"
                          : "border border-border"
                      }`}
                    >
                      {label}
                      {id === "prior" && priorOpenBillCount > 0 ? ` (${priorOpenBillCount})` : ""}
                    </button>
                  ))}
                </div>
                <div className="flex gap-1.5 overflow-x-auto pb-0.5">
                  {(
                    [
                      ["all", t("All", "ሁሉም")],
                      ["pay", t("Pay", "ክፈል")],
                      ["receipt", t("Receipt", "ደረሰኝ")],
                      ["pending", t("Pending", "እየጠበቀ")],
                      ["return", t("Return", "መልስ")],
                    ] as const
                  ).map(([id, label]) => (
                    <button
                      key={id}
                      type="button"
                      onClick={() => setOpenBillQuickFilter(id)}
                      className={`h-7 shrink-0 rounded-md px-2.5 text-[11px] font-semibold ${
                        openBillQuickFilter === id
                          ? "bg-foreground text-background"
                          : "border border-border"
                      }`}
                    >
                      {label}
                    </button>
                  ))}
                </div>
                <div className="flex gap-1.5">
                  <select
                    value={openBillAreaFilter}
                    onChange={(e) => setOpenBillAreaFilter(e.target.value)}
                    className="h-8 min-w-0 flex-1 rounded-md border border-border bg-card px-2 text-xs"
                  >
                    {openBillAreaOptions.map((option) => (
                      <option key={option} value={option}>
                        {option === "All" ? t("All areas", "ሁሉም አካባቢዎች") : option}
                      </option>
                    ))}
                  </select>
                  <select
                    value={openBillSort}
                    onChange={(e) => setOpenBillSort(e.target.value as OpenBillSort)}
                    className="h-8 min-w-0 flex-1 rounded-md border border-border bg-card px-2 text-xs"
                  >
                    <option value="newest">{t("Newest", "አዲስ")}</option>
                    <option value="table">{t("Table", "ጠረጴዛ")}</option>
                    <option value="amount">{t("Amount", "መጠን")}</option>
                    <option value="waiter">{t("Waiter", "አስተናጋጅ")}</option>
                  </select>
                </div>
              </div>

              <div className="max-h-72 space-y-2 overflow-y-auto pr-1">
              {filteredOpenOrders.map((order) => (
                <div
                  key={`m-${order.id}`}
                  className={`rounded-lg border bg-card p-2.5 ${
                    addingToOrder?.id === order.id ? "border-ember ring-1 ring-ember/20" : "border-border"
                  }`}
                >
                  <button
                    type="button"
                    onClick={() => focusOpenBillSeat(order)}
                    className="flex w-full items-start justify-between gap-2 rounded-md text-left"
                  >
                    <div className="min-w-0">
                      <div className="truncate font-mono text-sm font-semibold">{order.orderNo}</div>
                      <div className="text-[11px] text-muted-foreground line-clamp-1">
                        {order.area} · {order.tableNumber} · {order.waiter}
                      </div>
                    </div>
                    <span className="font-mono text-sm font-semibold">{formatETB(order.total)}</span>
                  </button>
                  <div className="mt-2 flex gap-1.5">
                    {canAddItemsToOrder(order) && (canManageBills || assignedWaiterMatches(order.waiter, user)) && (
                      <button
                        type="button"
                        onClick={() => startAddToOrder(order)}
                        className={`${TOUCH_BTN} ${
                          addingToOrder?.id === order.id
                            ? "border-ember bg-ember/10 text-ember"
                            : "border border-border hover:bg-surface-2"
                        }`}
                      >
                        <Icons.Plus className="size-3.5" />
                        {addingToOrder?.id === order.id ? t("Adding…", "በመጨመር…") : t("Add", "አክል")}
                      </button>
                    )}
                    {canManageBills && order.status !== "PENDING_CASHIER" && (
                        <BonoStationActions
                          order={order}
                          compact
                          onPreview={() => openTicketPreview(order)}
                        />
                      )}
                    {canUseReturns && canRequestReturnOrder(order) && (
                      <button
                        type="button"
                        onClick={() => openReturnOrder(order)}
                        className={`${TOUCH_BTN} border border-border hover:bg-surface-2`}
                      >
                        <Icons.RotateCcw className="size-3.5" />
                        {t("Return", "መልስ")}
                      </button>
                    )}
                    {canApproveReturns && canApproveReturnOrder(order) && (
                      <button
                        type="button"
                        onClick={() => openReturnOrder(order)}
                        className={`${TOUCH_BTN} border border-gold/40 bg-gold/10`}
                      >
                        <Icons.ShieldCheck className="size-3.5" /> {t("Approve return", "መልስ አፅድቅ")}
                      </button>
                    )}
                    {!canApproveReturns && order.returnRequestedBy && (
                      <span className={`${TOUCH_BTN} border border-gold/40 bg-gold/10 text-gold-foreground`}>
                        {t("Pending", "እየጠበቀ")}
                      </span>
                    )}
                    {canManageBills && order.status !== "PENDING_CASHIER" && (order.receipt || canGenerateReceipt(order)) && (
                      <button
                        onClick={() => openPayment(order)}
                        className={`${TOUCH_BTN} flex-1 bg-foreground text-background`}
                      >
                        {order.receipt ? t("Pay", "ክፈል") : t("Receipt", "ደረሰኝ")}
                      </button>
                    )}
                    {isWaiter &&
                      (assignedWaiterMatches(order.waiter, user) || assignedWaiterMatches(order.orderedByWaiter, user)) &&
                      order.status !== "PENDING_CASHIER" &&
                      (order.receipt || canGenerateReceipt(order)) && (
                        <button
                          type="button"
                          onClick={() => generateOrShowReceipt(order)}
                          className={`${TOUCH_BTN} flex-1 bg-foreground text-background`}
                        >
                          {order.receipt ? t("Show", "አሳይ") : t("Receipt", "ደረሰኝ")}
                        </button>
                      )}
                    {canManageBills && order.status !== "PENDING_CASHIER" && !order.receipt && !canGenerateReceipt(order) && (
                      <span className={`${TOUCH_BTN} flex-1 border border-border text-muted-foreground`}>
                        {t("Not ready", "አልተዘጋጀም")}
                      </span>
                    )}
                    {order.status === "PENDING_CASHIER" && canSendToStations && (
                      <button
                        onClick={() => void acceptWaiterOrder(order)}
                        className={`${TOUCH_BTN} flex-1 bg-ember text-ember-foreground`}
                      >
                        {t("Accept", "ተቀበል")}
                      </button>
                    )}
                  </div>
                </div>
              ))}
              {visibleOpenOrders.length === 0 ? (
                <div className="py-4 text-center text-sm text-muted-foreground">
                  {canManageBills ? t("No open bills.", "ክፍት ሂሳቦች የሉም።") : t("No active orders.", "ንቁ ትዕዛዞች የሉም።")}
                </div>
              ) : filteredOpenOrders.length === 0 ? (
                <div className="py-4 text-center text-sm text-muted-foreground">
                  {t("No bills match.", "የሚዛመድ ሂሳብ የለም።")}
                </div>
              ) : null}
              </div>
          </Card>
        </aside>
      </div>

      {/* Mobile always-visible cart bar */}
      <div className="fixed inset-x-0 bottom-0 z-40 border-t border-border bg-card/95 p-2.5 shadow-[0_-8px_24px_rgba(0,0,0,0.08)] backdrop-blur-md lg:hidden">
        <div className="mx-auto flex max-w-lg items-center gap-2">
          <Link
            to="/app"
            aria-label={t("Dashboard", "ዳሽቦርድ")}
            title={t("Back to dashboard", "ወደ ዳሽቦርድ ተመለስ")}
            className="inline-flex size-12 shrink-0 items-center justify-center rounded-xl border border-border bg-surface-2 active:scale-[0.98]"
          >
            <Icons.Home className="size-4" />
          </Link>
          <button
            type="button"
            onClick={() => setMobileCartOpen(true)}
            className="flex min-w-0 flex-1 items-center gap-2.5 rounded-xl border border-border bg-surface-2 px-3 py-2.5 text-left active:scale-[0.99]"
          >
            <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-ember/10 text-ember">
              <Icons.ShoppingBag className="size-4" />
            </span>
            <div className="min-w-0 flex-1">
              <div className="truncate text-xs text-muted-foreground">
                {addingToOrder
                  ? `${addingToOrder.orderNo} · ${t("Adding items", "እቃዎች በመጨመር")}`
                  : tableNumber
                    ? `${area} · ${tableNumber}`
                    : t("No table", "ጠረጴዛ የለም")}
                {cart.length > 0 ? ` · ${cart.length} ${t("lines", "መስመሮች")}` : ""}
              </div>
              <div className="font-mono text-sm font-semibold tabular-nums">
                {formatOrderQty(cartLineCount)} · {formatETB(subtotal)}
              </div>
            </div>
            <Icons.ChevronUp className="size-4 shrink-0 text-muted-foreground" />
          </button>
          <button
            type="button"
            onClick={() => void sendOrder()}
            disabled={sendDisabled}
            className="inline-flex h-12 shrink-0 items-center justify-center gap-1.5 rounded-xl bg-ember px-4 text-sm font-semibold text-ember-foreground shadow-[var(--shadow-glow)] disabled:opacity-40"
          >
            {sendBusy ? (
              <Icons.Loader2 className="size-4 animate-spin" />
            ) : (
              <Icons.Send className="size-4" />
            )}
            {sendBusy ? t("Sending…", "በመላክ ላይ…") : addingToOrder ? t("Add", "አክል") : t("Send", "ላክ")}
          </button>
        </div>
      </div>

      {/* Mobile cart sheet */}
      {mobileCartOpen && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <button
            type="button"
            className="absolute inset-0 bg-foreground/40 backdrop-blur-sm"
            aria-label={t("Close", "ዝጋ")}
            onClick={() => setMobileCartOpen(false)}
          />
          <div className="absolute inset-x-0 bottom-0 flex max-h-[85dvh] flex-col rounded-t-2xl border border-border bg-card shadow-[var(--shadow-lift)]">
            <div className="flex shrink-0 items-center justify-between gap-3 border-b border-border px-4 py-3">
              <div className="min-w-0">
                {addingToOrder ? (
                  <>
                    <div className="text-xs text-muted-foreground">
                      {t("Adding to open bill", "ወደ ክፍት ሂሳብ በመጨመር ላይ")}
                    </div>
                    <div className="truncate font-display text-base font-semibold">
                      {addingToOrder.orderNo} · {addingToOrder.area} · {addingToOrder.tableNumber}
                    </div>
                  </>
                ) : (
                  <>
                    <div className="text-xs text-muted-foreground">{t("Current order", "አሁን ያለ ትዕዛዝ")}</div>
                    <div className="truncate font-display text-base font-semibold">
                      {area} · {tableNumber || t("No table", "ጠረጴዛ የለም")}
                    </div>
                  </>
                )}
              </div>
              <div className="flex items-center gap-1">
                {addingToOrder ? (
                  <button
                    type="button"
                    onClick={cancelAddToOrder}
                    className="h-10 rounded-lg border border-border px-3 text-xs font-medium hover:bg-surface-2"
                  >
                    {t("Cancel", "ሰርዝ")}
                  </button>
                ) : null}
                <button
                  type="button"
                  onClick={() => setMobileCartOpen(false)}
                  className="grid size-10 place-items-center rounded-lg border border-border hover:bg-surface-2"
                >
                  <Icons.X className="size-4" />
                </button>
              </div>
            </div>
            <div className="min-h-0 flex-1 space-y-2 overflow-y-auto overscroll-contain p-3">
              {cart.length === 0 && (
                <div className="py-10 text-center text-sm text-muted-foreground">
                  {addingToOrder
                    ? t("Select items to add to this open bill.", "ለዚህ ክፍት ሂሳብ የሚጨመሩ እቃዎችን ይምረጡ።")
                    : t("Select menu items for this waiter order.", "ለዚህ የአስተናጋጅ ትዕዛዝ የሜኑ እቃዎችን ይምረጡ።")}
                </div>
              )}
              {cart.map((line) => {
                const lineIssue = cartStockIssues.find((issue) => issue.item.id === line.item.id);
                const prepSummary = [
                  ...(line.preferences ?? []).map((value) =>
                    translateBonoPreference(value.toUpperCase(), lang),
                  ),
                  line.note?.trim(),
                ]
                  .filter(Boolean)
                  .join(" · ");
                return (
                  <div
                    key={`sheet-${cartLineKey(line)}`}
                    className="flex flex-col gap-2 rounded-xl border border-border/70 bg-surface-2/50 p-2.5"
                  >
                    <div className="flex min-w-0 items-start gap-2.5">
                      {menuItemGlyph(line.item.emoji, lang) ? (
                        <span className="text-xl shrink-0">{menuItemGlyph(line.item.emoji, lang)}</span>
                      ) : null}
                      <div className="min-w-0 flex-1">
                        <div className="text-sm font-medium line-clamp-2">{menuItemName(line.item, lang)}</div>
                        <div className="text-[11px] text-muted-foreground">
                          {formatETB(line.unitPrice)} {line.unitLabel ?? itemUnitLabel(line.item, store.menuStations)}
                        </div>
                        {prepSummary ? (
                          <div className="truncate text-[11px] font-semibold uppercase text-foreground/80">
                            {prepSummary}
                          </div>
                        ) : null}
                        {lineIssue && (
                          <div className="mt-0.5 text-[11px] text-destructive">{t("Exceeds stock", "ከክምችት በላይ")}</div>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center justify-end gap-1.5">
                      {isBonoMenuItem(line.item, store.menuStations, area) && (
                        <button
                          type="button"
                          onClick={() => openPrepDraft(line.item, line)}
                          className={`${TOUCH_BTN} border border-border hover:bg-surface-2`}
                          aria-label={t("Extras", "ተጨማሪዎች")}
                        >
                          <Icons.SlidersHorizontal className="size-3.5" />
                          {t("Extras", "ተጨማሪዎች")}
                        </button>
                      )}
                      <button type="button" onClick={() => dec(line)} className={TOUCH_ICON_BTN} aria-label={t("Decrease", "ቀንስ")}>
                        <Icons.Minus className="size-4" />
                      </button>
                      <span className="min-w-12 text-center text-sm font-semibold tabular-nums">{formatLineQty(line)}</span>
                      <button type="button" onClick={() => addToCart({ ...line, qty: line.qtyStep })} className={TOUCH_ICON_BTN} aria-label={t("Increase", "ጨምር")}>
                        <Icons.Plus className="size-4" />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
            <div className="shrink-0 space-y-2 border-t border-border p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">{t("Total amount", "ጠቅላላ መጠን")}</span>
                <span className="font-mono font-semibold">{formatETB(subtotal)}</span>
              </div>
              {cartStations.length > 0 && (
                <div className="flex flex-wrap gap-1">
                  {cartStations.map((station) => (
                    <Chip key={`m-${station}`} tone="muted">{station}</Chip>
                  ))}
                </div>
              )}
              {hasCartStockConflict && (
                <div className="rounded-lg border border-destructive/25 bg-destructive/5 px-3 py-2 text-xs text-destructive">
                  {t(
                    "Reduce cart quantities that exceed stock before sending.",
                    "ከመላክ በፊት ከክምችት በላይ ያሉ መጠኖችን ይቀንሱ።",
                  )}
                  {cartNeedsManagerOverride && !managerStockOverride && (
                    <button
                      type="button"
                      onClick={() => setManagerStockOverride(true)}
                      className="mt-2 h-10 w-full rounded-md border border-destructive/40 text-xs font-semibold"
                    >
                      {t("Manager override", "የአስተዳዳሪ ማለፍ")}
                    </button>
                  )}
                </div>
              )}
              <button
                type="button"
                onClick={() => void sendOrder()}
                disabled={sendDisabled}
                className="inline-flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-ember text-sm font-semibold text-ember-foreground shadow-[var(--shadow-glow)] disabled:opacity-40"
              >
                {sendBusy ? (
                  <Icons.Loader2 className="size-4 animate-spin" />
                ) : (
                  <Icons.Send className="size-4" />
                )}{" "}
                {sendButtonLabel}
              </button>
              {cart.length > 0 && (
                <button
                  type="button"
                  onClick={() => {
                    setCart([]);
                    setManagerStockOverride(false);
                  }}
                  className="h-10 w-full rounded-lg border border-destructive/30 text-xs text-destructive"
                >
                  {t("Clear order", "ትዕዛዝ አጽዳ")}
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {prepDraft && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-foreground/40 p-4 backdrop-blur-sm">
          <div className="surface-card max-h-[90vh] w-full max-w-md overflow-y-auto !p-5">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h3 className="font-display text-lg font-semibold">
                  {menuItemName(prepDraft.item, lang)}
                </h3>
                <p className="mt-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  {isButcherStation(stationForItem(prepDraft.item, store.menuStations, area))
                    ? t("Butcher extras", "የቡቸር ተጨማሪዎች")
                    : t("Kitchen extras", "የኩሽና ተጨማሪዎች")}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setPrepDraft(null)}
                className="grid size-8 place-items-center rounded-lg hover:bg-surface-2"
                aria-label={t("Close", "ዝጋ")}
              >
                <Icons.X className="size-4" />
              </button>
            </div>

            <div className="mt-4 space-y-4">
              <div>
                <div className="mb-2 text-xs text-muted-foreground">{t("Quantity", "ብዛት")}</div>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() =>
                      setPrepDraft((current) =>
                        current
                          ? {
                              ...current,
                              qty: normalizeQty(Math.max(current.qtyStep, current.qty - current.qtyStep)),
                            }
                          : current,
                      )
                    }
                    className="grid size-10 place-items-center rounded-lg border border-border hover:bg-surface-2"
                  >
                    <Icons.Minus className="size-4" />
                  </button>
                  <input
                    type="number"
                    min={prepDraft.qtyStep}
                    step={prepDraft.qtyStep}
                    value={prepDraft.qty}
                    onChange={(event) =>
                      setPrepDraft((current) =>
                        current
                          ? {
                              ...current,
                              qty: normalizeQty(Math.max(current.qtyStep, Number(event.target.value) || current.qtyStep)),
                            }
                          : current,
                      )
                    }
                    className="h-10 flex-1 rounded-lg border border-border bg-card px-3 font-mono text-sm focus:outline-none focus:ring-2 focus:ring-ring/40"
                  />
                  <button
                    type="button"
                    onClick={() =>
                      setPrepDraft((current) =>
                        current ? { ...current, qty: normalizeQty(current.qty + current.qtyStep) } : current,
                      )
                    }
                    className="grid size-10 place-items-center rounded-lg border border-border hover:bg-surface-2"
                  >
                    <Icons.Plus className="size-4" />
                  </button>
                </div>
              </div>

              <div>
                <div className="mb-2 text-xs text-muted-foreground">
                  {t("Select extras", "ተጨማሪዎችን ይምረጡ")}
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {preferencesForStation(stationForItem(prepDraft.item, store.menuStations, area)).map((pref) => {
                    const active = prepDraft.preferences.some((value) => value.toUpperCase() === pref);
                    return (
                      <button
                        key={pref}
                        type="button"
                        onClick={() => togglePrepPreference(pref)}
                        className={`h-10 rounded-lg border px-3 text-xs font-bold ${
                          lang === "am" ? "tracking-normal" : "uppercase tracking-wide"
                        } ${
                          active
                            ? "border-foreground bg-foreground text-background"
                            : "border-border bg-card text-muted-foreground hover:bg-surface-2"
                        }`}
                      >
                        {translateBonoPreference(pref, lang)}
                      </button>
                    );
                  })}
                </div>
              </div>

              <div>
                <div className="mb-2 text-xs text-muted-foreground">
                  {t("Special instruction", "ልዩ መመሪያ")}
                </div>
                <input
                  value={prepDraft.note}
                  onChange={(event) =>
                    setPrepDraft((current) => (current ? { ...current, note: event.target.value } : current))
                  }
                  placeholder={t("Optional custom note", "አማራጭ ማስታወሻ")}
                  className="h-10 w-full rounded-lg border border-border bg-card px-3 text-sm uppercase focus:outline-none focus:ring-2 focus:ring-ring/40"
                />
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setPrepDraft(null)}
                  className="h-10 rounded-lg border border-border bg-card px-4 text-sm font-medium hover:bg-surface-2"
                >
                  {t("Cancel", "ሰርዝ")}
                </button>
                <button
                  type="button"
                  onClick={confirmPrepDraft}
                  className="ml-auto h-10 rounded-lg bg-ember px-4 text-sm font-semibold text-ember-foreground shadow-[var(--shadow-glow)]"
                >
                  {prepDraft.editKey
                    ? t("Save preferences", "ምርጫዎችን አስቀምጥ")
                    : t("Add to order", "ወደ ትዕዛዝ አክል")}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {draftSelection && (
        <div className="fixed inset-0 z-50 bg-foreground/40 backdrop-blur-sm grid place-items-center p-4">
          <div className="surface-card max-w-md w-full !p-5">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h3 className="font-display text-lg font-semibold">
                  {menuItemName(draftSelection.item, lang)}
                </h3>
                <p className="text-xs text-muted-foreground mt-1">
                  {itemUnitLabel(draftSelection.item, store.menuStations)}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setDraftSelection(null)}
                className="size-8 grid place-items-center rounded-lg hover:bg-surface-2"
                aria-label={t("Close", "ዝጋ")}
              >
                <Icons.X className="size-4" />
              </button>
            </div>

            <div className="mt-4 space-y-4">
              {isSpiritMenuItem(draftSelection.item) ? (
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                  <button
                    type="button"
                    onClick={() =>
                      setDraftSelection((current) => (current ? { ...current, mode: "single" } : current))
                    }
                    disabled={!spiritModeEnabled(draftSelection.item, "single")}
                    className={`rounded-lg border px-3 py-3 text-left transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${
                      draftSelection.mode === "single"
                        ? "border-primary bg-primary/10"
                        : "border-border bg-card hover:bg-surface-2"
                    }`}
                  >
                    <div className="text-xs text-muted-foreground">{t("Single shot", "ነጠላ ሾት")}</div>
                    <div className="font-mono font-semibold">
                      {draftSelection.item.singlePrice != null
                        ? formatETB(draftSelection.item.singlePrice)
                        : t("Not set", "አልተዘጋጀም")}
                    </div>
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      setDraftSelection((current) => (current ? { ...current, mode: "double" } : current))
                    }
                    disabled={!spiritModeEnabled(draftSelection.item, "double")}
                    className={`rounded-lg border px-3 py-3 text-left transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${
                      draftSelection.mode === "double"
                        ? "border-primary bg-primary/10"
                        : "border-border bg-card hover:bg-surface-2"
                    }`}
                  >
                    <div className="text-xs text-muted-foreground">{t("Double shot", "ድርብ ሾት")}</div>
                    <div className="font-mono font-semibold">
                      {draftSelection.item.doublePrice != null
                        ? formatETB(draftSelection.item.doublePrice)
                        : t("Not set", "አልተዘጋጀም")}
                    </div>
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      setDraftSelection((current) => (current ? { ...current, mode: "half" } : current))
                    }
                    disabled={!spiritModeEnabled(draftSelection.item, "half")}
                    className={`rounded-lg border px-3 py-3 text-left transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${
                      draftSelection.mode === "half"
                        ? "border-primary bg-primary/10"
                        : "border-border bg-card hover:bg-surface-2"
                    }`}
                  >
                    <div className="text-xs text-muted-foreground">{t("Half bottle", "ግማሽ ጠርሙስ")}</div>
                    <div className="font-mono font-semibold">
                      {formatETB(getSpiritPrice(draftSelection.item, "half"))}
                    </div>
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      setDraftSelection((current) => (current ? { ...current, mode: "bottle" } : current))
                    }
                    className={`rounded-lg border px-3 py-3 text-left transition-colors ${
                      draftSelection.mode === "bottle"
                        ? "border-primary bg-primary/10"
                        : "border-border bg-card hover:bg-surface-2"
                    }`}
                  >
                    <div className="text-xs text-muted-foreground">{t("Bottle price", "የጠርሙስ ዋጋ")}</div>
                    <div className="font-mono font-semibold">{formatETB(draftSelection.item.price)}</div>
                  </button>
                </div>
              ) : (
                <div className="rounded-lg border border-border bg-surface-2 px-3 py-3">
                  <div className="text-xs text-muted-foreground">{t("Price", "ዋጋ")}</div>
                  <div className="mt-1 font-mono text-lg font-semibold">
                    {formatETB(itemPriceForArea(draftSelection.item, area))}
                  </div>
                </div>
              )}

              <div>
                <div className="text-xs text-muted-foreground mb-2">{t("Quantity", "ብዛት")}</div>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() =>
                      setDraftSelection((current) =>
                        current
                          ? {
                              ...current,
                              qty: normalizeQty(
                                Math.max(
                                  1,
                                  current.qty - itemQtyStep(current.item, store.menuStations),
                                ),
                              ),
                            }
                          : current,
                      )
                    }
                    className="size-9 grid place-items-center rounded-lg border border-border hover:bg-surface-2"
                  >
                    <Icons.Minus className="size-4" />
                  </button>
                  <input
                    type="number"
                    min={1}
                    step={1}
                    value={draftSelection.qty}
                    onChange={(event) =>
                      setDraftSelection((current) =>
                        current
                          ? {
                              ...current,
                              qty: normalizeQty(
                                Math.max(
                                  1,
                                  Number(event.target.value) || 1,
                                ),
                              ),
                            }
                          : current,
                      )
                    }
                    className="h-9 flex-1 rounded-lg border border-border bg-card px-3 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-ring/40"
                  />
                  <button
                    type="button"
                    onClick={() =>
                      setDraftSelection((current) =>
                        current
                          ? { ...current, qty: normalizeQty(current.qty + itemQtyStep(current.item, store.menuStations)) }
                          : current,
                      )
                    }
                    className="size-9 grid place-items-center rounded-lg border border-border hover:bg-surface-2"
                  >
                    <Icons.Plus className="size-4" />
                  </button>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setDraftSelection(null)}
                  className="h-10 px-4 rounded-lg border border-border bg-card text-sm font-medium hover:bg-surface-2"
                >
                  {t("Cancel", "ሰርዝ")}
                </button>
                <button
                  type="button"
                  onClick={confirmDraftSelection}
                  disabled={!spiritModeEnabled(draftSelection.item, draftSelection.mode)}
                  className="ml-auto h-10 px-4 rounded-lg bg-ember text-ember-foreground text-sm font-semibold shadow-[var(--shadow-glow)] disabled:opacity-40"
                >
                  {t("Add to order", "ወደ ትዕዛዝ አክል")}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {paymentOrder && canManageBills && (
        <BillDialog
          order={paymentOrder}
          cashierName={cashierName}
          onClose={() => setPaymentOrder(null)}
          onReceipt={(order, receipt, reprint) => setReceiptView({ order, receipt, reprint })}
          onPaid={(order) => {
            if (order.receipt) setReceiptView({ order, receipt: order.receipt });
            setPaymentOrder(null);
          }}
          onSkippedStock={(items) => setSkippedStockItems(items)}
        />
      )}
      {receiptView && <ReceiptDialog view={receiptView} onClose={() => setReceiptView(null)} />}
      {ticketPreview && (
        <StationTicketPreviewDialog view={ticketPreview} onClose={() => setTicketPreview(null)} />
      )}
      {transferOpen ? (
        <div className="fixed inset-0 z-50 grid place-items-center bg-foreground/40 p-4 backdrop-blur-sm">
          <div className="surface-card w-full max-w-md space-y-4 !p-6">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h3 className="font-display text-xl font-semibold">
                  {t("Transfer open bills", "ክፍት ሂሳቦችን አስተላልፍ")}
                </h3>
                {/* <p className="mt-1 text-xs text-muted-foreground">
                  {t(
                    "When the morning waitress leaves, hand all of her open bills to the next waitress in one step.",
                    "የጠዋት አስተናጋጅት ስትሄድ ክፍት ሂሳቦቿን በአንድ እርምጃ ለሚቀጥለው አስተናጋጅ አስረክቡ።",
                  )}
                </p> */}
              </div>
              <button
                type="button"
                onClick={() => setTransferOpen(false)}
                className="grid size-8 place-items-center rounded-lg hover:bg-surface-2"
                aria-label={t("Close", "ዝጋ")}
              >
                <Icons.X className="size-4" />
              </button>
            </div>
            {isWaiter ? (
              <p className="text-xs text-muted-foreground">
                {t(
                  "Cashier or manager must approve before bills move.",
                  "ሂሳቦቹ ከመዘዋወራቸው በፊት ካሸር ወይም ሥራ አስኪያጅ ማፅደቅ አለባቸው።",
                )}
              </p>
            ) : null}
            {isWaiter ? (
              <div className="text-sm">
                {t("From", "ከ")}: <span className="font-semibold">{activeUserName}</span>
              </div>
            ) : (
              <div>
                <label className="text-xs text-muted-foreground">{t("From waitress", "ከ አስተናጋጅት")}</label>
                <select
                  value={transferFrom}
                  onChange={(event) => {
                    const nextFrom = event.target.value;
                    setTransferFrom(nextFrom);
                    const bills = openBillsOwnedByWaiter(openOrders, nextFrom);
                    setTransferSelectedIds(new Set(bills.map((order) => order.id)));
                    if (assignedWaiterMatches(transferTo, nextFrom)) {
                      setTransferTo(
                        transferWaiterOptions.find((name) => !assignedWaiterMatches(name, nextFrom)) ?? "",
                      );
                    }
                  }}
                  className="mt-1 h-11 w-full rounded-lg border border-border bg-card px-3 text-sm"
                >
                  {transferWaiterOptions.map((name) => (
                    <option key={name} value={name}>
                      {name}
                    </option>
                  ))}
                </select>
              </div>
            )}
            <div>
              <label className="text-xs text-muted-foreground">{t("To waitress", "ወደ አስተናጋጅት")}</label>
              <select
                value={transferTo}
                onChange={(event) => setTransferTo(event.target.value)}
                className="mt-1 h-11 w-full rounded-lg border border-border bg-card px-3 text-sm"
              >
                {transferWaiterOptions
                  .filter((name) => !assignedWaiterMatches(name, transferSourceWaiter))
                  .map((name) => (
                    <option key={name} value={name}>
                      {name}
                    </option>
                  ))}
              </select>
            </div>
            <div className="max-h-48 space-y-1 overflow-y-auto rounded-lg border border-border p-2">
              {transferCandidateBills.length === 0 ? (
                <div className="py-4 text-center text-sm text-muted-foreground">
                  {t("No open bills on this waitress.", "በዚህ አስተናጋጅት ላይ ክፍት ሂሳብ የለም።")}
                </div>
              ) : (
                <>
                  <div className="mb-1 flex items-center justify-between gap-2 px-1">
                    <span className="text-xs text-muted-foreground">
                      {t("Select bills to transfer", "የሚተላለፉ ሂሳቦችን ይምረጡ")}
                    </span>
                    <button
                      type="button"
                      className="text-[11px] font-semibold text-ember"
                      onClick={() => {
                        if (transferSelectedIds.size === transferCandidateBills.length) {
                          setTransferSelectedIds(new Set());
                        } else {
                          setTransferSelectedIds(new Set(transferCandidateBills.map((order) => order.id)));
                        }
                      }}
                    >
                      {transferSelectedIds.size === transferCandidateBills.length
                        ? t("Clear", "አጽዳ")
                        : t("Select all", "ሁሉንም ምረጥ")}
                    </button>
                  </div>
                  {transferCandidateBills.map((order) => {
                    const checked = transferSelectedIds.has(order.id);
                    const pending = Boolean(order.waiterTransferRequestedTo);
                    return (
                      <label
                        key={order.id}
                        className={`flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-surface-2 ${
                          pending ? "opacity-60" : ""
                        }`}
                      >
                        <input
                          type="checkbox"
                          checked={checked}
                          disabled={pending}
                          onChange={() => toggleTransferOrder(order.id)}
                          className="size-4 accent-[var(--ember)]"
                        />
                        <span className="min-w-0 flex-1 truncate font-mono">
                          {order.orderNo} · {order.tableNumber}
                          {pending
                            ? ` · ${t("Pending", "እየጠበቀ")} → ${order.waiterTransferRequestedTo}`
                            : ""}
                        </span>
                        <span className="font-mono text-xs">{formatETB(order.total)}</span>
                      </label>
                    );
                  })}
                </>
              )}
            </div>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setTransferOpen(false)}
                className="h-10 rounded-lg border border-border px-4 text-sm font-semibold hover:bg-surface-2"
              >
                {t("Cancel", "ሰርዝ")}
              </button>
              <button
                type="button"
                onClick={submitBillTransfer}
                disabled={!transferTo || transferSelectedIds.size === 0}
                className="ml-auto h-10 rounded-lg bg-ember px-4 text-sm font-semibold text-ember-foreground disabled:opacity-40"
              >
                {isWaiter ? t("Request transfer", "ማስተላለፍ ጠይቅ") : t("Hand over bills", "ሂሳቦችን አስረክብ")}
                {transferSelectedIds.size > 0 ? ` (${transferSelectedIds.size})` : ""}
              </button>
            </div>
          </div>
        </div>
      ) : null}
      {returnDialog && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-foreground/40 p-4 backdrop-blur-sm">
          <div className="surface-card w-full max-w-md space-y-4 !p-6">
            <h3 className="font-display text-xl font-semibold">
              {canApproveReturns
                ? returnDialog.pending
                  ? t("Approve return", "መልስ አፅድቅ")
                  : t("Return order", "ትዕዛዝ መልስ")
                : t("Request return", "መልስ ጠይቅ")}{" "}
              — {returnDialog.orderNo}
            </h3>
            {canApproveReturns && returnDialog.pending && returnDialog.requestedBy ? (
              <div className="text-xs text-muted-foreground">
                {t("Requested by", "የጠየቀ")}: {returnDialog.requestedBy}
              </div>
            ) : null}
            {(() => {
              const returnOrder = store.orders.find((order) => order.id === returnDialog.orderId);
              if (!returnOrder?.items.length) return null;
              return (
                <div className="space-y-2">
                  <div className="flex items-center justify-between gap-2">
                    <div className="text-xs font-medium text-muted-foreground">
                      {t("Items to return", "የሚመለሱ እቃዎች")}
                    </div>
                    <div className="flex gap-2">
                      <button
                        type="button"
                        className="text-xs font-medium text-ember hover:underline"
                        onClick={() =>
                          setReturnQtys(
                            Object.fromEntries(
                              returnOrder.items.map((line, index) => [index, line.qty]),
                            ) as Record<number, number>,
                          )
                        }
                      >
                        {t("All", "ሁሉም")}
                      </button>
                      <button
                        type="button"
                        className="text-xs font-medium text-muted-foreground hover:underline"
                        onClick={() => setReturnQtys({})}
                      >
                        {t("None", "ምንም")}
                      </button>
                    </div>
                  </div>
                  <div className="max-h-56 space-y-1.5 overflow-y-auto rounded-lg border border-border p-2">
                    {returnOrder.items.map((line, index) => {
                      const returnQty = returnQtys[index] ?? 0;
                      const checked = returnQty > 0;
                      const lineTotal = (line.unitPrice ?? 0) * (returnQty || line.qty);
                      const step = Number.isInteger(line.qty) ? 1 : 0.1;
                      return (
                        <div
                          key={`${line.name}-${index}`}
                          className={`rounded-md px-2 py-1.5 text-sm ${checked ? "bg-ember/5" : ""}`}
                        >
                          <div className="flex items-center gap-2">
                            <input
                              type="checkbox"
                              className="size-4"
                              checked={checked}
                              onChange={() =>
                                setReturnLineQty(index, checked ? 0 : line.qty, line.qty)
                              }
                            />
                            <span className="min-w-0 flex-1 truncate">
                              {line.qty}
                              {line.unitLabel ? ` ${line.unitLabel}` : "x"} {line.name}
                            </span>
                            <span className="shrink-0 font-mono text-xs text-muted-foreground">
                              {formatETB(lineTotal)}
                            </span>
                          </div>
                          {checked ? (
                            <div className="mt-1.5 flex items-center justify-between gap-2 pl-6">
                              <span className="text-[11px] text-muted-foreground">
                                {t("Return qty", "የመመለሻ መጠን")}
                              </span>
                              <div className="flex items-center gap-1">
                                <button
                                  type="button"
                                  className="inline-flex size-7 items-center justify-center rounded-md border border-border"
                                  onClick={() => setReturnLineQty(index, returnQty - step, line.qty)}
                                  aria-label={t("Decrease", "ቀንስ")}
                                >
                                  <Icons.Minus className="size-3.5" />
                                </button>
                                <input
                                  type="number"
                                  min={step}
                                  max={line.qty}
                                  step={step}
                                  value={returnQty}
                                  onChange={(e) =>
                                    setReturnLineQty(index, Number(e.target.value) || 0, line.qty)
                                  }
                                  className="h-7 w-16 rounded-md border border-border bg-card px-1.5 text-center text-xs font-semibold tabular-nums"
                                />
                                <button
                                  type="button"
                                  className="inline-flex size-7 items-center justify-center rounded-md border border-border"
                                  onClick={() => setReturnLineQty(index, returnQty + step, line.qty)}
                                  aria-label={t("Increase", "ጨምር")}
                                >
                                  <Icons.Plus className="size-3.5" />
                                </button>
                                <span className="text-[11px] text-muted-foreground">
                                  / {line.qty}
                                  {line.unitLabel ? ` ${line.unitLabel}` : ""}
                                </span>
                              </div>
                            </div>
                          ) : null}
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })()}
            <textarea
              value={returnReason}
              onChange={(e) => setReturnReason(e.target.value)}
              rows={3}
              className="w-full rounded-lg border border-border bg-card px-3 py-2 text-sm resize-none"
              placeholder={t("Reason for return", "የመልስ ምክንያት")}
            />
            {canApproveReturns ? (
              <label className="flex items-start gap-2 text-xs text-muted-foreground">
                <input
                  type="checkbox"
                  className="mt-0.5"
                  checked={restorePackagedStock}
                  onChange={(e) => setRestorePackagedStock(e.target.checked)}
                />
                <span>
                  {t(
                    "Restore packaged stock to department (beer/bottle style returns)",
                    "የታሸገ ክምችት ወደ ክፍል ይመለስ",
                  )}
                </span>
              </label>
            ) : (
              <p className="text-xs text-muted-foreground">
                {t(
                  "A manager must approve this return before stock and payment are reversed.",
                  "ክምችት እና ክፍያ ከመመለሳቸው በፊት ሥራ አስኪያጅ ይህን መልስ ማጽደቅ አለበት።",
                )}
              </p>
            )}
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => {
                  setReturnDialog(null);
                  setReturnReason("");
                  setReturnQtys({});
                  setRestorePackagedStock(false);
                }}
                className="h-10 rounded-lg border border-border px-3 text-sm font-semibold hover:bg-surface-2"
              >
                {t("Cancel", "ሰርዝ")}
              </button>
              <button
                type="button"
                disabled={!returnReason.trim() || Object.keys(returnQtys).length === 0}
                onClick={submitReturnOrder}
                className="h-10 rounded-lg bg-ember px-3 text-sm font-semibold text-ember-foreground disabled:opacity-40"
              >
                {canApproveReturns
                  ? t("Confirm return", "መልስ አረጋግጥ")
                  : t("Send request", "ጥያቄ ላክ")}
              </button>
            </div>
          </div>
        </div>
      )}
      {skippedStockItems.length > 0 && (
        <div className="fixed bottom-4 right-4 z-50 max-w-sm rounded-xl border border-gold/40 bg-gold/10 px-4 py-3 text-sm shadow-lg">
          <div className="flex items-start justify-between gap-3">
            <div>
              <div className="font-semibold text-gold-foreground">{t("Stock not deducted", "ክምችት አልተቀነሰም")}</div>
              <div className="mt-1 text-xs text-muted-foreground">
                {skippedStockItems.join(", ")}
              </div>
            </div>
            <button onClick={() => setSkippedStockItems([])} className="size-6 grid place-items-center rounded-md hover:bg-gold/20">
              <Icons.X className="size-3.5" />
            </button>
          </div>
        </div>
      )}
      </>
      ) : null}
    </div>
  );
}
