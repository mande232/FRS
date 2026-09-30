import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useVirtualizer } from "@tanstack/react-virtual";
import * as Icons from "lucide-react";
import { PageHeader, Card } from "@/components/ui-kit";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { RealtimeBadge } from "@/components/realtime-badge";
import {
  isFinalOrderStatus,
  ORDER_PRIORITIES,
  PAYMENT_METHODS,
  SEATING_AREAS,
  type Order,
  type OrderPriority,
  type PaymentMethod,
  type SeatingArea,
} from "@/lib/demo-data";
import { useStore } from "@/lib/store";
import { canApproveOrderReturns, canApproveWaiterBillTransfers, useAuth } from "@/lib/auth-context";
import { assignedWaiterMatches } from "@/lib/waiter-identity";
import { orderLineName, useT } from "@/lib/i18n";
import { showError, showSuccess } from "@/lib/toast";
import { useLang } from "@/lib/lang-context";
import { formatETB } from "@/lib/ethiopic";
import { getModuleRecordsSnapshot } from "@/lib/module-records";
import {
  STOCK_LEDGER_SEED,
  STOCK_MODULE_KEYS,
  type StockLedgerEntry,
  useStockManagementModule,
} from "@/lib/stock-management";
import { buildDashboardTodaySlice, dateKey } from "@/lib/sales-analytics";
import {
  connectOrdersSocket,
  subscribeOrdersSocket,
} from "@/lib/orders-realtime";
import { isSupabaseConfigured } from "@/lib/supabase/client";
import { fetchOrdersPage } from "@/lib/supabase/pos-backend";
import { BonoStationActions } from "@/components/bono-station-actions";
import { BillDialog, ReceiptDialog, type ReceiptView } from "@/components/order-bill-dialogs";
import {
  StationTicketPreviewDialog,
  type StationTicketPreviewView,
} from "@/components/station-ticket-preview";
import {
  bonoTicketsAwaitingPickup,
  buildOrderTimeline,
  canGenerateReceipt,
  canApproveReturnOrder,
  canRequestReturnOrder,
  compactOrderStations,
  computeOrdersSummary,
  countOrdersByTab,
  delayedElapsedMinutes,
  displayPaymentStatus,
  EMPTY_ORDERS_FILTERS,
  exportOrdersCsv,
  filterOrders,
  isOrderDelayed,
  isOrderToday,
  orderClockLabel,
  orderHasManualDeliveryStations,
  orderOutstandingAmount,
  orderPriority,
  paginateOrders,
  parseOrderDayKey,
  paymentBadgeClass,
  returnQtyMapFromLines,
  statusBadgeClass,
  summarizeReturnRequestedLines,
  summarizeWaiterUnpaid,
  type OpsStatusFilter,
  type OrdersFilterState,
  type OrdersWorkspaceTab,
  type QuickFilter,
} from "@/lib/orders-ops";
import { openBillsOwnedByWaiter, ordersWithPendingWaiterTransfer } from "@/lib/waiter-bill-transfer";

export const Route = createFileRoute("/app/orders")({ component: Orders });

const ACTION_BTN =
  "h-9 px-3 rounded-lg text-xs font-medium transition-colors whitespace-nowrap inline-flex items-center gap-1.5";

// Header and virtualized rows are separate elements, so they must share one
// column template or the labels stop lining up over their data.
const ORDERS_ROW_GRID =
  "grid grid-cols-[minmax(7.5rem,1.2fr)_minmax(5.5rem,0.9fr)_minmax(5rem,0.8fr)_minmax(6.5rem,0.9fr)_minmax(5.5rem,0.7fr)] lg:grid-cols-[minmax(8rem,1.2fr)_minmax(6rem,0.9fr)_minmax(5.5rem,0.8fr)_minmax(6rem,0.85fr)_minmax(6.5rem,0.9fr)_minmax(5.5rem,0.7fr)] gap-3 px-4";

const ORDERS_TABLE_MIN_WIDTH = "min-w-[760px]";

const WORKSPACE_TABS: Array<{ id: OrdersWorkspaceTab; en: string; am: string }> = [
  { id: "active", en: "Active", am: "ንቁ" },
  { id: "ready", en: "Ready", am: "ዝግጁ" },
  { id: "payment", en: "Payment", am: "ክፍያ" },
  { id: "completed", en: "Completed", am: "ተጠናቀቀ" },
  { id: "cancelled", en: "Cancelled", am: "ተሰርዟል" },
  { id: "returned", en: "Returned", am: "ተመልሷል" },
  { id: "all", en: "All", am: "ሁሉም" },
];

const STATUS_BAR: Array<{ id: OpsStatusFilter; en: string; am: string }> = [
  { id: "All", en: "All", am: "ሁሉም" },
  { id: "PENDING_CASHIER", en: "Waiting Cashier", am: "ካሸርን እየጠበቀ" },
  { id: "NEW", en: "New", am: "አዲስ" },
  { id: "ACCEPTED", en: "Accepted", am: "ተቀባይነት አግኝቷል" },
  { id: "PREPARING", en: "Preparing", am: "በዝግጅት" },
  { id: "PARTIALLY READY", en: "Partially Ready", am: "በከፊል ዝግጁ" },
  { id: "READY TO SERVE", en: "Ready to Serve", am: "ለማቅረብ ዝግጁ" },
  { id: "SERVED", en: "Served", am: "ቀርቧል" },
  { id: "RECEIPT_GENERATED", en: "Receipt Generated", am: "ደረሰኝ ተፈጥሯል" },
  { id: "PAYMENT_PENDING", en: "Payment Pending", am: "ክፍያ እየጠበቀ" },
  { id: "CLOSED", en: "Closed", am: "ተዘግቷል" },
  { id: "CANCELLED", en: "Cancelled", am: "ተሰርዟል" },
  { id: "RETURNED", en: "Returned", am: "ተመልሷል" },
];

const QUICK_FILTERS: Array<{ id: QuickFilter; en: string; am: string }> = [
  { id: "today", en: "Today's Orders", am: "የዛሬ ትዕዛዞች" },
  { id: "active", en: "Active Orders", am: "ንቁ ትዕዛዞች" },
  { id: "completed", en: "Completed Orders", am: "የተጠናቀቁ" },
  { id: "cancelled", en: "Cancelled Orders", am: "የተሰረዙ" },
  { id: "returned", en: "Returned Orders", am: "የተመለሱ" },
  { id: "vip", en: "VIP Orders", am: "VIP ትዕዛዞች" },
  { id: "mine", en: "My Orders", am: "የእኔ ትዕዛዞች" },
];

function useNow(intervalMs = 1000) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), intervalMs);
    return () => window.clearInterval(id);
  }, [intervalMs]);
  return now;
}

function stockOutcomeLabel(
  outcome: Order["stockExceptionOutcome"],
  t: (en: string, am: string) => string,
) {
  if (!outcome) return null;
  if (outcome === "release_only") return t("Released reservation", "ቦታ ማስያዝ ተለቋል");
  if (outcome === "wastage") return t("Recorded as wastage", "እንደ ብክነት ተመዝግቧል");
  if (outcome === "reversal") return t("Stock reversed", "ክምችት ተመልሷል");
  if (outcome === "packaged_return") return t("Packaged stock restored", "የታሸገ ክምችት ተመልሷል");
  return outcome;
}

function formatQty(qty: number, unitLabel?: string) {
  const value = qty.toLocaleString(undefined, { maximumFractionDigits: 3 });
  return unitLabel ? `${value} ${unitLabel}` : `${value}x`;
}

function shiftDateKey(base: string, days: number) {
  const [y, m, d] = base.split("-").map(Number);
  const date = new Date(y, (m ?? 1) - 1, d ?? 1);
  date.setDate(date.getDate() + days);
  return dateKey(date);
}

function defaultOrdersFilters(): OrdersFilterState {
  const today = dateKey();
  return { ...EMPTY_ORDERS_FILTERS, dateFrom: today, dateTo: today };
}

function Orders() {
  const store = useStore();
  const { user, users } = useAuth();
  const t = useT();
  const lang = useLang();
  const navigate = useNavigate();
  const now = useNow(30_000);

  const [tab, setTab] = useState<OrdersWorkspaceTab>("active");
  const [filters, setFilters] = useState<OrdersFilterState>(() => defaultOrdersFilters());
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [drawerId, setDrawerId] = useState<string | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [focusSelection, setFocusSelection] = useState(false);
  const [actionMenuId, setActionMenuId] = useState<string | null>(null);

  const [voidDialog, setVoidDialog] = useState<{ orderId: string; orderNo: string } | null>(null);
  const [voidReason, setVoidReason] = useState("");
  const reasonRef = useRef<HTMLTextAreaElement>(null);
  const [approveDialog, setApproveDialog] = useState<{
    orderId: string;
    orderNo: string;
    requestedBy: string;
    reason?: string;
  } | null>(null);
  const [voidReusablePackaged, setVoidReusablePackaged] = useState(false);
  const [returnDialog, setReturnDialog] = useState<{
    orderId: string;
    orderNo: string;
    requestedBy?: string;
    pending: boolean;
  } | null>(null);
  const [returnReason, setReturnReason] = useState("");
  const [returnQtys, setReturnQtys] = useState<Record<number, number>>({});
  const returnReasonRef = useRef<HTMLTextAreaElement>(null);
  const [restorePackagedStock, setRestorePackagedStock] = useState(false);
  const [waiterDialog, setWaiterDialog] = useState<{ orderId: string; orderNo: string; waiter: string } | null>(null);
  const [priorityDialog, setPriorityDialog] = useState<{
    orderId: string;
    orderNo: string;
    priority: OrderPriority;
  } | null>(null);
  const [billOrder, setBillOrder] = useState<Order | null>(null);
  const [receiptView, setReceiptView] = useState<ReceiptView | null>(null);
  const [bulkPayOpen, setBulkPayOpen] = useState(false);
  const [bulkPayMethod, setBulkPayMethod] = useState<PaymentMethod>("Cash");
  const [bulkPayWaiter, setBulkPayWaiter] = useState("");
  const [bulkPayAmount, setBulkPayAmount] = useState(0);
  const [bulkPayIds, setBulkPayIds] = useState<string[]>([]);
  const [ticketPreview, setTicketPreview] = useState<StationTicketPreviewView | null>(null);
  const [skippedStockItems, setSkippedStockItems] = useState<string[]>([]);
  const [transferDialog, setTransferDialog] = useState<{
    orderId: string;
    orderNo: string;
    tableNumber: string;
    area: SeatingArea;
  } | null>(null);
  const [mergeDialog, setMergeDialog] = useState<{ primaryId: string; secondaryId: string } | null>(null);
  const [splitDialog, setSplitDialog] = useState<{ orderId: string; selected: Set<number> } | null>(null);
  const [transferOpen, setTransferOpen] = useState(false);
  const [transferFrom, setTransferFrom] = useState("");
  const [transferTo, setTransferTo] = useState("");
  const [transferSelectedIds, setTransferSelectedIds] = useState<Set<string>>(new Set());
  const [serverMode, setServerMode] = useState(false);
  const [serverPage, setServerPage] = useState(1);
  const [serverTotal, setServerTotal] = useState(0);
  const [serverLoading, setServerLoading] = useState(false);
  const tableScrollRef = useRef<HTMLDivElement>(null);
  const tableHeaderScrollRef = useRef<HTMLDivElement>(null);

  const isWaiter = user?.role === "Waiter";
  const isManager = user?.role === "Branch Manager";
  const canApproveReturns = canApproveOrderReturns(user?.role);
  const canApproveTransfers = canApproveWaiterBillTransfers(user?.role);
  const canManageBills = user?.role === "Cashier" || isManager;
  const canTransferBills = isWaiter || canManageBills || canApproveTransfers;
  const canViewInventory =
    isManager ||
    user?.role === "Inventory Administrator" ||
    user?.role === "Store Manager" ||
    user?.role === "Auditor";
  const canAccept = canManageBills;

  const scopedOrders = useMemo(
    () =>
      isWaiter && user
        ? store.orders.filter(
            (order) =>
              assignedWaiterMatches(order.waiter, user) ||
              assignedWaiterMatches(order.orderedByWaiter, user),
          )
        : store.orders,
    [isWaiter, user, store.orders],
  );

  const stockModule = useStockManagementModule();
  const summary = useMemo(() => {
    const base = computeOrdersSummary(scopedOrders, now);
    // Calendar today only — do not apply daily-closing cutoff here (that caused 14→13 flicker
    // when closings hydrated). Closing reset stays on dashboard sales KPIs.
    const todayOrderCount = scopedOrders.filter((order) => isOrderToday(order)).length;
    const todaySales = buildDashboardTodaySlice(
      store.salesRecords,
      [],
      store.payments,
      stockModule.closings,
    ).summary.revenue;
    const waiterScoped =
      isWaiter && user
        ? buildDashboardTodaySlice(
            store.salesRecords.filter((row) => assignedWaiterMatches(row.waiter, user)),
            [],
            [],
            stockModule.closings,
          ).summary.revenue
        : todaySales;
    return { ...base, totalToday: todayOrderCount, salesToday: waiterScoped };
  }, [isWaiter, now, scopedOrders, stockModule.closings, store.payments, store.salesRecords, user]);

  const list = useMemo(() => {
    const filtered = filterOrders(scopedOrders, filters, {
      currentUserName: user?.name,
      tab,
    });
    if (!focusSelection || selected.size === 0) return filtered;
    const focused = filtered.filter((order) => selected.has(order.id));
    if (focused.length > 0) return focused;
    // Filters would hide the selection (e.g. Payment tab) — still show selected bills.
    return scopedOrders.filter((order) => selected.has(order.id));
  }, [scopedOrders, filters, user?.name, tab, focusSelection, selected]);

  const tabCounts = useMemo(
    () =>
      countOrdersByTab(
        filterOrders(
          scopedOrders,
          { ...filters, status: "All" },
          { currentUserName: user?.name, tab: "all" },
        ),
      ),
    [scopedOrders, filters, user?.name],
  );

  const todayCounts = useMemo(
    () => countOrdersByTab(scopedOrders.filter((order) => isOrderToday(order))),
    [scopedOrders],
  );

  const pageSize = serverMode ? 50 : 100;
  const [page, setPage] = useState(1);
  const paged = useMemo(() => paginateOrders(list, page, pageSize), [list, page, pageSize]);
  const pageRows = paged.rows;

  useEffect(() => {
    setPage(1);
    setServerPage(1);
    // Do not clear row selection here — waiter unpaid select updates filters/tab
    // in the same action and must keep the chosen bills checked.
  }, [tab, filters, serverMode]);

  useEffect(() => {
    let active = true;
    let disconnect: (() => void) | undefined;
    void connectOrdersSocket().then((fn) => {
      if (active) disconnect = fn;
      else fn?.();
    });
    const unsubscribe = subscribeOrdersSocket(() => {
      /* Order rows refresh from store realtime; keep the socket connected. */
    });
    return () => {
      active = false;
      unsubscribe();
      disconnect?.();
    };
  }, []);

  useEffect(() => {
    if (!serverMode || !isSupabaseConfigured) return;
    let cancelled = false;
    setServerLoading(true);
    void fetchOrdersPage({ page: serverPage, pageSize: 50 })
      .then((result) => {
        if (cancelled) return;
        setServerTotal(result.total);
        // Merge server page into view by preferring freshest local copies
        const localById = new Map(store.orders.map((order) => [order.id, order]));
        const merged = result.rows.map((row) => localById.get(row.id) ?? row);
        store.setOrders((prev) => {
          const others = prev.filter((order) => !merged.some((row) => row.id === order.id));
          return [...merged, ...others];
        });
      })
      .catch((error) => {
        if (!cancelled) {
          showError(error instanceof Error ? error.message : t("Server page load failed", "የሰርቨር ገጽ መጫን አልተሳካም"));
        }
      })
      .finally(() => {
        if (!cancelled) setServerLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [serverMode, serverPage]);

  const virtualizer = useVirtualizer({
    count: pageRows.length,
    getScrollElement: () => tableScrollRef.current,
    estimateSize: () => 88,
    overscan: 10,
  });

  const drawerOrder = drawerId ? scopedOrders.find((order) => order.id === drawerId) ?? null : null;

  const waiterNames = useMemo(() => {
    const fromStaff = users.filter((staffUser) => staffUser.role === "Waiter").map((staffUser) => staffUser.name);
    const fromOrders = scopedOrders.map((order) => order.waiter).filter(Boolean);
    return Array.from(new Set([...fromStaff, ...fromOrders])).sort((a, b) => a.localeCompare(b));
  }, [scopedOrders, users]);
  const stations = useMemo(() => store.menuStations, [store.menuStations]);
  const transferSourceWaiter = isWaiter ? (user?.name ?? "") : transferFrom;
  const transferCandidateBills = useMemo(
    () => openBillsOwnedByWaiter(store.orders, transferSourceWaiter),
    [store.orders, transferSourceWaiter],
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
  const waiterUnpaid = useMemo(() => {
    const dateScoped = scopedOrders.filter((order) => {
      if (filters.waiter && order.waiter !== filters.waiter) return false;
      if (!filters.dateFrom && !filters.dateTo) return true;
      const day = parseOrderDayKey(order);
      if (!day) return false;
      if (filters.dateFrom && day < filters.dateFrom) return false;
      if (filters.dateTo && day > filters.dateTo) return false;
      return true;
    });
    return summarizeWaiterUnpaid(dateScoped);
  }, [filters.dateFrom, filters.dateTo, filters.waiter, scopedOrders]);

  const waiterUnpaidTotal = useMemo(
    () => ({
      bills: waiterUnpaid.reduce((sum, row) => sum + row.bills, 0),
      amount: waiterUnpaid.reduce((sum, row) => sum + row.amount, 0),
    }),
    [waiterUnpaid],
  );

  const waiterUnpaidDateLabel = useMemo(() => {
    if (!filters.dateFrom && !filters.dateTo) return null;
    return [filters.dateFrom || "…", filters.dateTo || "…"].join(" – ");
  }, [filters.dateFrom, filters.dateTo]);

  function openBillTransfer() {
    const from = isWaiter ? (user?.name ?? "") : (filters.waiter || waiterNames[0] || "");
    const to = waiterNames.find((name) => !assignedWaiterMatches(name, from)) ?? "";
    setTransferFrom(from);
    setTransferTo(to);
    const bills = openBillsOwnedByWaiter(store.orders, from);
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
    if (!user) return;
    const from = isWaiter ? user.name : transferFrom;
    const selected = [...transferSelectedIds];
    if (selected.length === 0) {
      showError(t("Select at least one bill.", "ቢያንስ አንድ ሂሳብ ይምረጡ።"));
      return;
    }
    if (isWaiter) {
      const result = store.requestWaiterBillTransfer(from, transferTo, user.name, selected);
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
    const result = store.transferWaiterBills(from, transferTo, user.name, selected);
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
    if (!user) return;
    const result = store.approveWaiterBillTransfer(fromWaiter, toWaiter, user.name, orderIds);
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


  function patchFilters(patch: Partial<OrdersFilterState>) {
    setFilters((prev) => ({ ...prev, ...patch }));
  }

  function statusLabel(status: string) {
    const found = STATUS_BAR.find((item) => item.id === status);
    if (found) return t(found.en, found.am);
    return status;
  }

  function paymentShort(order: Order) {
    const pay = displayPaymentStatus(order);
    if (pay === "Paid") return t("Paid", "ተከፍሏል");
    if (pay === "Refunded") return t("Refunded", "ተመልሷል");
    if (pay === "Partially Paid" || order.receipt || order.status === "RECEIPT_GENERATED") {
      return t("Pending", "እየጠበቀ");
    }
    return t("Unpaid", "ያልተከፈለ");
  }

  function paymentTone(order: Order) {
    const pay = displayPaymentStatus(order);
    if (pay === "Paid") return "Paid" as const;
    if (pay === "Refunded") return "Refunded" as const;
    if (pay === "Partially Paid" || order.receipt || order.status === "RECEIPT_GENERATED") {
      return "Partially Paid" as const;
    }
    return "Unpaid" as const;
  }

  function renderPaymentPill(order: Order) {
    const tone = paymentTone(order);
    const stronger =
      tone === "Unpaid"
        ? "bg-amber-500/20 text-amber-900 dark:text-amber-200 ring-1 ring-amber-500/40 font-semibold"
        : tone === "Paid"
          ? "bg-emerald-500/20 text-emerald-800 dark:text-emerald-200 ring-1 ring-emerald-500/35 font-semibold"
          : `${paymentBadgeClass(tone)} font-semibold ring-1 ring-current/15`;
    return (
      <span className={`inline-flex h-5 items-center whitespace-nowrap rounded-full px-2 text-[10px] ${stronger}`}>
        {paymentShort(order)}
      </span>
    );
  }

  function compactStatusLabel(status: string) {
    if (status === "READY TO SERVE") return t("Ready", "ዝግጁ");
    if (status === "PENDING_CASHIER") return t("Waiting", "እየጠበቀ");
    if (status === "RECEIPT_GENERATED") return t("Receipt", "ደረሰኝ");
    if (status === "RETURNED") return t("Returned", "ተመልሷል");
    if (status === "CANCELLED") return t("Cancelled", "ተሰርዟል");
    return statusLabel(status);
  }

  function delayHint(order: Order) {
    if (!isOrderDelayed(order, now)) return null;
    const minutes = delayedElapsedMinutes(order, now);
    return (
      <span className="text-[11px] font-semibold text-red-600" title={t("Delayed", "ዘግይቷል")}>
        {minutes} {t("min", "ደቂቃ")}
      </span>
    );
  }

  function rowTone(order: Order) {
    if (order.status === "READY TO SERVE" && !order.receipt) return "bg-emerald-500/8";
    if (order.status === "CANCELLED" || order.status === "RETURNED") return "bg-rose-500/5 opacity-90";
    if (order.status === "CLOSED") return "bg-muted/20 text-muted-foreground";
    if (isOrderDelayed(order, now)) return "bg-red-500/5";
    return "bg-card";
  }

  const todayKeyValue = dateKey();
  const isDefaultTodayFilter =
    filters.dateFrom === todayKeyValue &&
    filters.dateTo === todayKeyValue &&
    filters.quick === "none";
  const hasExtraFilters =
    filters.status !== "All" ||
    Boolean(filters.station) ||
    Boolean(filters.waiter) ||
    Boolean(filters.area) ||
    Boolean(filters.table.trim()) ||
    Boolean(filters.paymentStatus) ||
    Boolean(filters.search.trim()) ||
    (Boolean(filters.dateFrom || filters.dateTo) && !isDefaultTodayFilter) ||
    (filters.quick !== "none" && filters.quick !== "today");

  const activeFilterChips = useMemo(() => {
    const chips: Array<{ key: string; label: string; clear: Partial<OrdersFilterState> }> = [];
    if (filters.search.trim()) {
      chips.push({ key: "search", label: filters.search.trim(), clear: { search: "", orderNo: "" } });
    }
    if (filters.status !== "All") {
      chips.push({ key: "status", label: statusLabel(filters.status), clear: { status: "All" } });
    }
    if (filters.station) chips.push({ key: "station", label: filters.station, clear: { station: "" } });
    if (filters.waiter) chips.push({ key: "waiter", label: filters.waiter, clear: { waiter: "" } });
    if (filters.area) chips.push({ key: "area", label: filters.area, clear: { area: "" } });
    if (filters.table.trim()) chips.push({ key: "table", label: filters.table.trim(), clear: { table: "" } });
    if (filters.paymentStatus) {
      chips.push({ key: "pay", label: filters.paymentStatus, clear: { paymentStatus: "" } });
    }
    if (filters.dateFrom || filters.dateTo) {
      const todayOnly =
        filters.dateFrom === todayKeyValue && filters.dateTo === todayKeyValue;
      chips.push({
        key: "date",
        label: todayOnly
          ? t("Today", "ዛሬ")
          : `${t("Date", "ቀን")}: ${[filters.dateFrom || "…", filters.dateTo || "…"].join(" – ")}`,
        clear: { dateFrom: "", dateTo: "" },
      });
    }
    if (filters.quick !== "none") {
      const q = QUICK_FILTERS.find((item) => item.id === filters.quick);
      if (q) chips.push({ key: "quick", label: t(q.en, q.am), clear: { quick: "none" } });
    }
    return chips;
  }, [filters, t, todayKeyValue]);

  function acceptOrder(orderId: string) {
    if (!user) return;
    store.acceptWaiterOrder(orderId, user.name);
  }

  function requestVoid(orderId: string, orderNo: string) {
    setVoidReason("");
    setVoidDialog({ orderId, orderNo });
    setTimeout(() => reasonRef.current?.focus(), 50);
  }

  function submitVoidRequest() {
    if (!user || !voidDialog) return;
    store.requestVoidOrder(voidDialog.orderId, user.name, voidReason);
    setVoidDialog(null);
  }

  function approveVoid(orderId: string) {
    if (!user) return;
    const result = store.approveVoidOrder(orderId, user.name, {
      reusablePackaged: voidReusablePackaged,
      reason: approveDialog?.reason,
    });
    if (!result.ok) {
      showError(result.error ?? t("Could not void order", "ትዕዛዙን መሰረዝ አልተቻለም"));
      return;
    }
    setApproveDialog(null);
    setVoidReusablePackaged(false);
  }

  function rejectVoid(orderId: string) {
    if (!user) return;
    store.rejectVoidOrder(orderId, user.name);
    setApproveDialog(null);
    setVoidReusablePackaged(false);
  }

  function openManagerVoid(orderId: string, orderNo: string) {
    if (!user) return;
    setVoidReusablePackaged(false);
    setApproveDialog({
      orderId,
      orderNo,
      requestedBy: user.name,
      reason: t("Manager void", "የሥራ አስኪያጅ ሰረዛ"),
    });
  }

  function openReturnOrder(order: Order) {
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
        Object.fromEntries(fresh.items.map((line, index) => [index, line.qty])) as Record<
          number,
          number
        >,
      );
    }
    setRestorePackagedStock(false);
    setReturnDialog({
      orderId: fresh.id,
      orderNo: fresh.orderNo,
      requestedBy: fresh.returnRequestedBy,
      pending,
    });
    setTimeout(() => returnReasonRef.current?.focus(), 50);
  }

  function setReturnLineQty(index: number, qty: number, maxQty: number) {
    const next = Math.min(Math.max(0, qty), maxQty);
    setReturnQtys((prev) => {
      const copy = { ...prev };
      if (next <= 0) delete copy[index];
      else copy[index] = next;
      return copy;
    });
  }

  function closeReturnDialog() {
    setReturnDialog(null);
    setReturnQtys({});
    setReturnReason("");
    setRestorePackagedStock(false);
  }

  function submitReturnOrder() {
    if (!user || !returnDialog) return;
    if (!returnReason.trim()) return;
    const returnLines = Object.entries(returnQtys)
      .map(([index, qty]) => ({ index: Number(index), qty: Number(qty) }))
      .filter((row) => Number.isInteger(row.index) && row.qty > 0);
    if (returnLines.length === 0) {
      showError(t("Select at least one item quantity to return.", "ቢያንስ አንድ እቃ መጠን ይምረጡ።"));
      return;
    }
    if (!canApproveReturns) {
      store.requestReturnOrder(returnDialog.orderId, user.name, returnReason.trim(), returnLines);
      showSuccess(t("Return request sent to manager", "የመልስ ጥያቄ ለሥራ አስኪያጅ ተልኳል"));
      closeReturnDialog();
      return;
    }
    const orderBefore = store.orders.find((order) => order.id === returnDialog.orderId);
    const returningAll =
      !!orderBefore &&
      returnLines.length === orderBefore.items.length &&
      returnLines.every((row) => row.qty >= (orderBefore.items[row.index]?.qty ?? 0));
    const result = store.approveReturnOrder(returnDialog.orderId, user.name, {
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
    closeReturnDialog();
  }

  function rejectReturn(orderId: string) {
    store.rejectReturnOrder(orderId);
    if (returnDialog?.orderId === orderId) closeReturnDialog();
  }

  function applyDateRange(dateFrom: string, dateTo: string) {
    setTab("all");
    patchFilters({ dateFrom, dateTo, quick: "none" });
  }

  function applySummaryFilter(status: OpsStatusFilter | "TODAY_SALES") {
    if (status === "TODAY_SALES") {
      setTab("completed");
      setFilters(defaultOrdersFilters());
      return;
    }
    setTab("all");
    setFilters({ ...defaultOrdersFilters(), status });
  }

  function clearSelection() {
    setSelected(new Set());
    setFocusSelection(false);
  }

  const selectedOrders = scopedOrders.filter((order) => selected.has(order.id));

  function bulkExport() {
    exportOrdersCsv(selectedOrders.length ? selectedOrders : list);
  }

  function bulkPriority(priority: OrderPriority) {
    for (const order of selectedOrders) store.updateOrderPriority(order.id, priority);
    clearSelection();
  }

  function bulkAssignWaiter(waiter: string) {
    if (!waiter.trim()) return;
    for (const order of selectedOrders) store.updateOrderWaiter(order.id, waiter.trim());
    clearSelection();
  }

  function bulkPrintKitchen() {
    const targets = selectedOrders.filter(orderHasManualDeliveryStations);
    if (targets.length === 0) {
      showError(t("No station Bono items in selection.", "በምርጫው ውስጥ የጣቢያ ቦኖ እቃ የለም።"));
      return;
    }
    setTicketPreview({
      orders: targets,
    });
    clearSelection();
  }

  function openTicketPreview(order: Order) {
    const fresh = store.orders.find((item) => item.id === order.id) ?? order;
    if (fresh.items.length === 0 && fresh.stationTickets.length === 0) return;
    setTicketPreview({
      orders: [fresh],
    });
  }

  function bulkCancelSelected() {
    if (!user || !isManager) return;
    const result = store.bulkCancelOrders(
      selectedOrders.map((order) => order.id),
      user.name,
      t("Bulk cancel", "ጅምላ ሰረዛ"),
    );
    if (result.failed.length) {
      showError(`${result.cancelled} cancelled, ${result.failed.length} failed`);
    }
    clearSelection();
  }

  function bulkCloseSelected() {
    if (!user || !canManageBills) return;
    const result = store.bulkCloseOrders(
      selectedOrders.map((order) => order.id),
      user.name,
    );
    if (result.failed.length) {
      showError(`${result.closed} closed, ${result.failed.length} failed (payment required)`);
    }
    clearSelection();
  }

  function unpaidOrdersForWaiter(waiterName: string) {
    const key = waiterName.trim().toLowerCase();
    return scopedOrders.filter((order) => {
      if (orderOutstandingAmount(order) <= 0) return false;
      if (filters.dateFrom || filters.dateTo) {
        const day = parseOrderDayKey(order);
        if (!day) return false;
        if (filters.dateFrom && day < filters.dateFrom) return false;
        if (filters.dateTo && day > filters.dateTo) return false;
      }
      const waiter = order.waiter?.trim() || "Unassigned";
      if (key === "unassigned") return !order.waiter?.trim();
      return waiter.toLowerCase() === key;
    });
  }

  function selectWaiterUnpaid(waiterName: string) {
    const unpaid = unpaidOrdersForWaiter(waiterName);
    if (unpaid.length === 0) {
      showError(t("No unpaid bills for this waiter.", "ለዚህ አስተናጋጅ ያልተከፈለ ሂሳብ የለም።"));
      return;
    }
    // Use "all" + clear paymentStatus: many unpaid bills have no receipt yet, so the
    // Payment tab / "Unpaid" filter would hide them and show an empty list.
    setTab("all");
    const waiterFilter =
      waiterName === "Unassigned"
        ? ""
        : unpaid.find((order) => order.waiter?.trim())?.waiter?.trim() || waiterName.trim();
    patchFilters({
      waiter: waiterFilter,
      paymentStatus: "",
      status: "All",
      quick: "none",
    });
    setSelected(new Set(unpaid.map((order) => order.id)));
    setFocusSelection(true);
    showSuccess(
      t(
        `${unpaid.length} unpaid bill(s) selected for ${waiterName}`,
        `${unpaid.length} ያልተከፈሉ ሂሳቦች ለ ${waiterName} ተመርጠዋል`,
      ),
    );
  }

  function bulkGenerateReceipts() {
    if (!user || !canManageBills) return;
    let generated = 0;
    let already = 0;
    let skipped = 0;
    for (const order of selectedOrders) {
      const fresh = store.orders.find((row) => row.id === order.id) ?? order;
      if (fresh.receipt) {
        already += 1;
        continue;
      }
      if (!canGenerateReceipt(fresh)) {
        skipped += 1;
        continue;
      }
      const receipt = store.generateReceipt(fresh.id, { generatedBy: user.name });
      if (receipt) generated += 1;
      else skipped += 1;
    }
    if (generated === 0 && already === 0) {
      showError(
        t(
          "No selected orders are ready for a receipt yet.",
          "ከተመረጡት ትዕዛዞች ደረሰኝ ለመፍጠር ዝግጁ የሆነ የለም።",
        ),
      );
      return;
    }
    showSuccess(
      t(
        `Receipts: ${generated} new, ${already} already had one${skipped ? `, ${skipped} skipped` : ""}.`,
        `ደረሰኞች: ${generated} አዲስ, ${already} ቀድሞ ነበራቸው${skipped ? `, ${skipped} ተዘለዋል` : ""}።`,
      ),
    );
  }

  function openBulkPayment() {
    if (!user || !canManageBills) return;
    const payableIds: string[] = [];
    let dueTotal = 0;
    const waiters = new Set<string>();
    let skipped = 0;

    for (const order of selectedOrders) {
      const fresh = store.orders.find((row) => row.id === order.id) ?? order;
      if (orderOutstandingAmount(fresh) <= 0) {
        skipped += 1;
        continue;
      }
      let working = fresh;
      if (!working.receipt) {
        if (!canGenerateReceipt(working)) {
          skipped += 1;
          continue;
        }
        const receipt = store.generateReceipt(working.id, { generatedBy: user.name });
        if (!receipt) {
          skipped += 1;
          continue;
        }
        working = {
          ...working,
          receipt,
          receiptNumber: receipt.receiptNumber,
          total: receipt.grandTotal,
          status: "RECEIPT_GENERATED",
          paymentStatus: "Unpaid",
          lockedForEditing: true,
        };
      }
      payableIds.push(working.id);
      dueTotal += working.receipt?.grandTotal ?? working.total;
      if (working.waiter?.trim()) waiters.add(working.waiter.trim());
    }

    if (payableIds.length === 0) {
      showError(
        t(
          "Select unpaid orders that are ready for payment.",
          "ለክፍያ ዝግጁ የሆኑ ያልተከፈሉ ትዕዛዞችን ይምረጡ።",
        ),
      );
      return;
    }

    const defaultWaiter =
      (filters.waiter && filters.waiter !== "All" ? filters.waiter : "") ||
      (waiters.size === 1 ? [...waiters][0] : "") ||
      [...waiters][0] ||
      "";
    setBulkPayIds(payableIds);
    setBulkPayWaiter(defaultWaiter);
    setBulkPayMethod("Cash");
    setBulkPayAmount(Math.ceil(dueTotal / 10) * 10);
    setBulkPayOpen(true);
    if (skipped > 0) {
      showError(
        t(
          `${skipped} order(s) skipped (already paid or not ready).`,
          `${skipped} ትዕዛዞች ተዘለዋል (ተከፍለዋል ወይም ዝግጁ አይደሉም)።`,
        ),
      );
    }
  }

  function submitBulkPayment() {
    if (!user || !canManageBills || bulkPayIds.length === 0) return;
    if (!bulkPayWaiter.trim()) {
      showError(t("Select the waiter who collected payment.", "ክፍያ የሰበሰበውን አስተናጋጅ ይምረጡ።"));
      return;
    }
    const dues = bulkPayIds.map((id) => {
      const order = store.orders.find((row) => row.id === id);
      return {
        id,
        due: order?.receipt?.grandTotal ?? order?.total ?? 0,
      };
    });
    const totalDue = dues.reduce((sum, row) => sum + row.due, 0);
    if (bulkPayAmount + 0.001 < totalDue) {
      showError(
        t(
          `Amount received must cover ${formatETB(totalDue)}.`,
          `የተቀበለው መጠን ${formatETB(totalDue)} መሸፈን አለበት።`,
        ),
      );
      return;
    }

    let paid = 0;
    let failed = 0;
    const skippedStock: string[] = [];
    // Distribute cash across bills; tip/change only on the last paid bill.
    let remainingCash = bulkPayAmount;
    dues.forEach((row, index) => {
      const isLast = index === dues.length - 1;
      const amountForBill = isLast ? remainingCash : row.due;
      remainingCash = Math.max(0, remainingCash - row.due);
      const result = store.closeOrderPayment(row.id, {
        method: bulkPayMethod,
        collectedByWaiter: bulkPayWaiter.trim(),
        receivedByCashier: user.name,
        amountReceived: amountForBill,
        keepAsTip: false,
        closedByCashier: user.name,
      });
      if (result) {
        paid += 1;
        if (result.skippedItems.length) skippedStock.push(...result.skippedItems);
      } else {
        failed += 1;
      }
    });

    if (paid === 0) {
      showError(t("Could not record payments.", "ክፍያዎችን መመዝገብ አልተቻለም።"));
      return;
    }
    showSuccess(
      t(
        `Recorded payment for ${paid} order(s)${failed ? `, ${failed} failed` : ""}.`,
        `ለ ${paid} ትዕዛዞች ክፍያ ተመዝግቧል${failed ? `, ${failed} አልተሳካም` : ""}።`,
      ),
    );
    if (skippedStock.length) setSkippedStockItems(skippedStock);
    setBulkPayOpen(false);
    setBulkPayIds([]);
    clearSelection();
  }

  const bulkPayOrders = useMemo(
    () =>
      bulkPayIds
        .map((id) => store.orders.find((order) => order.id === id))
        .filter((order): order is Order => Boolean(order)),
    [bulkPayIds, store.orders],
  );
  const bulkPayDueTotal = useMemo(
    () => bulkPayOrders.reduce((sum, order) => sum + (order.receipt?.grandTotal ?? order.total), 0),
    [bulkPayOrders],
  );

  const ledgerForDrawer = useMemo(() => {
    if (!drawerOrder || !canViewInventory) return [];
    const ledger = getModuleRecordsSnapshot<StockLedgerEntry>(STOCK_MODULE_KEYS.ledger, STOCK_LEDGER_SEED);
    return ledger.filter(
      (entry) =>
        entry.referenceNo === drawerOrder.id ||
        entry.referenceNo?.includes(drawerOrder.orderNo) ||
        entry.notes?.includes(drawerOrder.orderNo) ||
        entry.reason?.includes(drawerOrder.orderNo) ||
        entry.notes?.includes(drawerOrder.id),
    );
  }, [drawerOrder, canViewInventory]);

  const summaryCards: Array<{
    key: string;
    label: string;
    value: string;
    onClick: () => void;
  }> = [
    {
      key: "today",
      label: t("Today", "ዛሬ"),
      value: String(summary.totalToday),
      onClick: () => {
        setTab("all");
        setFilters(defaultOrdersFilters());
      },
    },
    {
      key: "active",
      label: t("Active", "ንቁ"),
      value: String(todayCounts.active),
      onClick: () => {
        setTab("active");
        setFilters(defaultOrdersFilters());
      },
    },
    {
      key: "ready",
      label: t("Ready to Serve", "ለማቅረብ ዝግጁ"),
      value: String(todayCounts.ready),
      onClick: () => {
        setTab("ready");
        setFilters(defaultOrdersFilters());
      },
    },
    {
      key: "sales",
      label: t("Today's Sales", "የዛሬ ሽያጭ"),
      value: formatETB(summary.salesToday),
      onClick: () => applySummaryFilter("TODAY_SALES"),
    },
  ];

  function openOrderBill(order: Order) {
    if (!canManageBills) return;
    const fresh = store.orders.find((item) => item.id === order.id) ?? order;
    setBillOrder(fresh);
    setActionMenuId(null);
  }

  function renderOrderActions(order: Order) {
    const canOpenBill =
      canManageBills &&
      order.status !== "PENDING_CASHIER" &&
      (!isFinalOrderStatus(order.status) || Boolean(order.receipt));
    const itemClass = "cursor-pointer";
    const dangerClass = "cursor-pointer text-destructive focus:text-destructive";
    return (
      <div className="relative" onClick={(e) => e.stopPropagation()}>
        <DropdownMenu
          modal={false}
          onOpenChange={(next) => setActionMenuId(next ? order.id : null)}
        >
          <DropdownMenuTrigger
            type="button"
            className="size-8 rounded-lg border border-border hover:bg-surface-2 inline-flex items-center justify-center"
            aria-label={t("Quick actions", "ፈጣን እርምጃዎች")}
          >
            <Icons.MoreHorizontal className="size-4" />
          </DropdownMenuTrigger>
            <DropdownMenuContent
              align="end"
              side="bottom"
              sideOffset={4}
              collisionPadding={8}
              className="z-[9999] w-56 max-h-80 animate-none data-[state=open]:animate-none data-[state=closed]:animate-none"
            >
              <DropdownMenuItem
                className={itemClass}
                onSelect={() => {
                  setDrawerId(order.id);
                  setActionMenuId(null);
                }}
              >
                <Icons.Eye className="size-3.5" /> {t("View Details", "ዝርዝር ተመልከት")}
              </DropdownMenuItem>
              <DropdownMenuItem
                className={itemClass}
                onSelect={() => {
                  setDrawerId(order.id);
                  setActionMenuId(null);
                }}
              >
                <Icons.History className="size-3.5" /> {t("View Audit Trail", "የኦዲት መዝገብ ተመልከት")}
              </DropdownMenuItem>
              {canOpenBill ? (
                <DropdownMenuItem className={itemClass} onSelect={() => openOrderBill(order)}>
                  <Icons.ReceiptText className="size-3.5" /> {t("Order bill", "የትዕዛዝ ሂሳብ")}
                </DropdownMenuItem>
              ) : null}
              {canManageBills && order.receipt ? (
                <DropdownMenuItem
                  className={itemClass}
                  onSelect={() => {
                    setReceiptView({ order, receipt: order.receipt! });
                    setActionMenuId(null);
                  }}
                >
                  <Icons.Eye className="size-3.5" /> {t("Preview receipt", "የደረሰኝ ቅድመ እይታ")}
                </DropdownMenuItem>
              ) : null}
              {canManageBills ? (
                <DropdownMenuItem
                  className={itemClass}
                  onSelect={() => {
                    setActionMenuId(null);
                    void navigate({ to: "/app/pos", search: { table: undefined, area: undefined, waiter: undefined, orderId: order.id, mode: undefined } });
                  }}
                >
                  <Icons.Pencil className="size-3.5" /> {t("Edit / Add Items", "አርትዕ / ዕቃ ጨምር")}
                </DropdownMenuItem>
              ) : null}
              {canTransferBills && !isFinalOrderStatus(order.status) ? (
                <DropdownMenuItem
                  className={itemClass}
                  onSelect={() => {
                    setTransferFrom(order.waiter);
                    setTransferTo(
                      waiterNames.find((name) => !assignedWaiterMatches(name, order.waiter)) ?? "",
                    );
                    setTransferSelectedIds(
                      new Set(openBillsOwnedByWaiter(store.orders, order.waiter).map((row) => row.id)),
                    );
                    setTransferOpen(true);
                    setActionMenuId(null);
                  }}
                >
                  <Icons.ArrowRightLeft className="size-3.5" /> {t("Transfer open bills", "ክፍት ሂሳቦችን አስተላልፍ")}
                </DropdownMenuItem>
              ) : null}
              {canManageBills && !isFinalOrderStatus(order.status) ? (
                <DropdownMenuItem
                  className={itemClass}
                  onSelect={() => {
                    setTransferDialog({
                      orderId: order.id,
                      orderNo: order.orderNo,
                      tableNumber: order.tableNumber,
                      area: order.area,
                    });
                    setActionMenuId(null);
                  }}
                >
                  <Icons.ArrowRightLeft className="size-3.5" /> {t("Transfer Table", "ጠረጴዛ አስተላልፍ")}
                </DropdownMenuItem>
              ) : null}
              {canManageBills && !isFinalOrderStatus(order.status) && !order.receipt ? (
                <DropdownMenuItem
                  className={itemClass}
                  onSelect={() => {
                    setMergeDialog({ primaryId: order.id, secondaryId: "" });
                    setActionMenuId(null);
                  }}
                >
                  <Icons.Merge className="size-3.5" /> {t("Merge Orders", "ትዕዛዞች አዋህድ")}
                </DropdownMenuItem>
              ) : null}
              {canManageBills && !isFinalOrderStatus(order.status) && !order.receipt && order.items.length > 1 ? (
                <DropdownMenuItem
                  className={itemClass}
                  onSelect={() => {
                    setSplitDialog({ orderId: order.id, selected: new Set() });
                    setActionMenuId(null);
                  }}
                >
                  <Icons.Split className="size-3.5" /> {t("Split Bill", "ሂሳብ ክፈል")}
                </DropdownMenuItem>
              ) : null}
              {canManageBills && orderHasManualDeliveryStations(order) ? (
                <DropdownMenuItem
                  className={itemClass}
                  onSelect={() => {
                    openTicketPreview(order);
                    setActionMenuId(null);
                  }}
                >
                  <Icons.Ticket className="size-3.5" />{" "}
                  {t("Print Kitchen/Butcher bono", "የኩሽና/ቡቸር ቦኖ አትም")}
                </DropdownMenuItem>
              ) : null}
              {bonoTicketsAwaitingPickup(order).map((ticket) => (
                <DropdownMenuItem
                  key={ticket.id}
                  className={itemClass}
                  onSelect={() => {
                    store.advanceManualDeliveryTickets(order.id, "READY", ticket.id);
                    setActionMenuId(null);
                  }}
                >
                  <Icons.CheckCircle2 className="size-3.5" />
                  {t("{station} ready for pickup", "{station} ለመውሰድ ዝግጁ").replace(
                    "{station}",
                    ticket.station,
                  )}
                </DropdownMenuItem>
              ))}
              {canManageBills && order.receipt ? (
                <DropdownMenuItem
                  className={itemClass}
                  onSelect={() => {
                    store.recordReceiptPrint(order.id);
                    setActionMenuId(null);
                  }}
                >
                  <Icons.Printer className="size-3.5" /> {t("Reprint Receipt", "ደረሰኝ እንደገና አትም")}
                </DropdownMenuItem>
              ) : null}
              {isManager ? (
                <DropdownMenuItem
                  className={itemClass}
                  onSelect={() => {
                    setWaiterDialog({ orderId: order.id, orderNo: order.orderNo, waiter: order.waiter });
                    setActionMenuId(null);
                  }}
                >
                  <Icons.UserRoundCog className="size-3.5" /> {t("Change Waiter", "አስተናጋጅ ቀይር")}
                </DropdownMenuItem>
              ) : null}
              {isManager || canManageBills ? (
                <DropdownMenuItem
                  className={itemClass}
                  onSelect={() => {
                    setPriorityDialog({
                      orderId: order.id,
                      orderNo: order.orderNo,
                      priority: orderPriority(order),
                    });
                    setActionMenuId(null);
                  }}
                >
                  <Icons.Flag className="size-3.5" /> {t("Change Priority", "ቅድሚያ ቀይር")}
                </DropdownMenuItem>
              ) : null}
              {canRequestReturnOrder(order) || (canApproveReturnOrder(order) && canApproveReturns) ? (
                <DropdownMenuSeparator />
              ) : null}
              {canRequestReturnOrder(order) ? (
                <DropdownMenuItem
                  className={itemClass}
                  onSelect={() => {
                    openReturnOrder(order);
                    setActionMenuId(null);
                  }}
                >
                  <Icons.RotateCcw className="size-3.5" />
                  {canApproveReturns
                    ? t("Return order", "ትዕዛዝ መልስ")
                    : t("Request return", "መልስ ጠይቅ")}
                </DropdownMenuItem>
              ) : null}
              {canApproveReturnOrder(order) && canApproveReturns ? (
                <DropdownMenuItem
                  className={itemClass}
                  onSelect={() => {
                    openReturnOrder(order);
                    setActionMenuId(null);
                  }}
                >
                  <Icons.ShieldCheck className="size-3.5" /> {t("Approve return", "መልስ አፅድቅ")}
                </DropdownMenuItem>
              ) : null}
              {!isFinalOrderStatus(order.status) && order.status !== "PENDING_CASHIER" ? (
                <>
                  {isManager && order.voidRequestedBy ? (
                    <DropdownMenuItem
                      className={dangerClass}
                      onSelect={() => {
                        setApproveDialog({
                          orderId: order.id,
                          orderNo: order.orderNo,
                          requestedBy: order.voidRequestedBy!,
                          reason: order.voidReason,
                        });
                        setActionMenuId(null);
                      }}
                    >
                      <Icons.ShieldCheck className="size-3.5" /> {t("Approve void", "ሰረዛ አፅድቅ")}
                    </DropdownMenuItem>
                  ) : isManager ? (
                    <DropdownMenuItem
                      className={dangerClass}
                      onSelect={() => {
                        openManagerVoid(order.id, order.orderNo);
                        setActionMenuId(null);
                      }}
                    >
                      <Icons.Trash2 className="size-3.5" /> {t("Void", "ሰርዝ")}
                    </DropdownMenuItem>
                  ) : !order.voidRequestedBy ? (
                    <DropdownMenuItem
                      className={dangerClass}
                      onSelect={() => {
                        requestVoid(order.id, order.orderNo);
                        setActionMenuId(null);
                      }}
                    >
                      <Icons.Trash2 className="size-3.5" /> {t("Request void", "ሰረዛ ጠይቅ")}
                    </DropdownMenuItem>
                  ) : null}
                </>
              ) : null}
            </DropdownMenuContent>
          </DropdownMenu>
      </div>
    );
  }

  return (
    <div className="pb-8">
      <PageHeader
        title={t("Orders", "ትዕዛዞች")}
        action={
          <div className="flex flex-wrap items-center gap-2">
            <RealtimeBadge compact status={store.realtimeStatus} lastSyncAt={store.lastRealtimeSyncAt} />
            {canTransferBills && (
              <button
                type="button"
                onClick={openBillTransfer}
                className="h-10 px-3 rounded-lg border border-border text-sm font-medium inline-flex items-center gap-2 hover:bg-surface-2"
              >
                <Icons.ArrowRightLeft className="size-4" /> {t("Transfer bills", "ሂሳቦችን አስተላልፍ")}
              </button>
            )}
            <Link
              to="/app/pos"
              className="h-10 px-4 rounded-lg bg-ember text-ember-foreground text-sm font-medium inline-flex items-center gap-2"
            >
              <Icons.Plus className="size-4" /> {t("New Order", "አዲስ ትዕዛዝ")}
            </Link>
          </div>
        }
      />

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-2 sm:gap-3 mb-4">
        {summaryCards.map((card) => (
          <button
            key={card.key}
            type="button"
            onClick={card.onClick}
            className="rounded-xl border border-border bg-card px-3 py-2.5 text-left hover:bg-surface-2/70 transition-colors"
          >
            <div className="text-[11px] text-muted-foreground leading-tight">{card.label}</div>
            <div className="font-display text-xl sm:text-2xl font-semibold mt-0.5 tracking-tight">{card.value}</div>
          </button>
        ))}
      </div>

      {canManageBills && (waiterUnpaid.length > 0 || Boolean(waiterUnpaidDateLabel)) && (
        <Card className="mb-4 !p-0 overflow-x-auto">
          <div className="flex flex-wrap items-center justify-between gap-2 px-4 py-2.5">
            <div className="text-sm font-semibold">
              {t("Unpaid expected by waiter", "ያልተከፈለ የሚጠበቅ በአስተናጋጅ")}
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-[11px] text-muted-foreground">
                {t("Select a waiter to multi-pay their bills", "ለብዙ ክፍያ አስተናጋጅ ይምረጡ")}
              </span>
              {waiterUnpaidDateLabel ? (
                <span className="inline-flex items-center gap-1.5 rounded-full border border-border bg-surface-2 px-2.5 py-1 text-[11px] font-medium text-muted-foreground">
                  <Icons.CalendarDays className="size-3.5" />
                  {waiterUnpaidDateLabel}
                </span>
              ) : null}
            </div>
          </div>
          <table className="min-w-full text-sm">
            <thead>
              <tr className="border-y border-border text-left text-xs text-muted-foreground">
                <th className="px-4 py-2 font-medium">{t("Waiter", "አስተናጋጅ")}</th>
                <th className="px-4 py-2 text-right font-medium">{t("Unpaid bills", "ያልተከፈሉ ሂሳቦች")}</th>
                <th className="px-4 py-2 text-right font-medium">{t("Amount expected", "የሚጠበቀው መጠን")}</th>
              </tr>
            </thead>
            <tbody>
              {waiterUnpaid.length === 0 ? (
                <tr>
                  <td colSpan={3} className="px-4 py-6 text-center text-sm text-muted-foreground">
                    {t("No unpaid bills for this date range.", "ለዚህ የቀን ክልል ያልተከፈለ ሂሳብ የለም።")}
                  </td>
                </tr>
              ) : (
                waiterUnpaid.map((row) => (
                  <tr key={row.waiter} className="border-b border-border/70 last:border-0">
                    <td className="px-4 py-2 font-medium">
                      <button
                        type="button"
                        onClick={() => selectWaiterUnpaid(row.waiter)}
                        className="text-left hover:underline hover:text-ember"
                        title={t("Select unpaid bills", "ያልተከፈሉ ሂሳቦችን ምረጥ")}
                      >
                        {row.waiter === "Unassigned" ? t("Unassigned", "ያልተመደበ") : row.waiter}
                      </button>
                    </td>
                    <td className="px-4 py-2 text-right font-mono">{row.bills}</td>
                    <td className="px-4 py-2 text-right">
                      <div className="inline-flex items-center justify-end gap-2">
                        <span className="font-mono font-semibold">{formatETB(row.amount)}</span>
                        <button
                          type="button"
                          onClick={() => selectWaiterUnpaid(row.waiter)}
                          className={`${ACTION_BTN} border border-border bg-card`}
                        >
                          <Icons.CheckSquare className="size-3.5" />
                          {t("Select", "ምረጥ")}
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
              <tr className="bg-surface-2/60">
                <td className="px-4 py-2 font-semibold">{t("Total expected", "ጠቅላላ የሚጠበቅ")}</td>
                <td className="px-4 py-2 text-right font-mono">{waiterUnpaidTotal.bills}</td>
                <td className="px-4 py-2 text-right font-mono font-semibold">
                  {formatETB(waiterUnpaidTotal.amount)}
                </td>
              </tr>
            </tbody>
          </table>
        </Card>
      )}

      <div className="flex gap-1 overflow-x-auto mb-3 pb-1">
        {WORKSPACE_TABS.map((item) => {
          const count = tabCounts[item.id];
          const active = tab === item.id;
          const ready = item.id === "ready";
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => setTab(item.id)}
              className={`h-9 px-3 rounded-lg text-xs font-semibold border whitespace-nowrap inline-flex items-center gap-1.5 transition-colors ${
                active
                  ? ready
                    ? "bg-emerald-600 text-white border-emerald-600"
                    : "bg-foreground text-background border-foreground"
                  : ready && count > 0
                    ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-800 dark:text-emerald-300"
                    : "bg-card border-border text-muted-foreground hover:text-foreground"
              }`}
            >
              {t(item.en, item.am)}
              <span className={`rounded-full px-1.5 py-0.5 text-[10px] font-semibold ${active ? "bg-white/20" : "bg-black/10 dark:bg-white/10"}`}>
                {count}
              </span>
            </button>
          );
        })}
      </div>

      {canApproveReturns && pendingReturnOrders.length > 0 ? (
        <Card className="mb-3 border-rose-500/40 bg-rose-500/10">
          <div className="mb-2 flex items-center justify-between gap-2">
            <h3 className="font-display text-sm font-semibold text-rose-800 dark:text-rose-200">
              {t("Return requests need approval", "የመልስ ጥያቄዎች ማፅደቅ ያስፈልጋቸዋል")}
            </h3>
            <span className="rounded-full bg-rose-600 px-2 py-0.5 text-[11px] font-semibold text-white">
              {pendingReturnOrders.length}
            </span>
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
                  className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-rose-500/30 bg-card p-3"
                >
                  <div className="min-w-0 text-sm">
                    <div className="font-mono font-semibold">{order.orderNo}</div>
                    <div className="text-xs text-muted-foreground">
                      {order.area} · {order.tableNumber} · {order.waiter} · {formatETB(order.total)}
                    </div>
                    <div className="mt-1 text-xs font-medium text-rose-800 dark:text-rose-200">
                      {t("Requested by", "የጠየቀ")}: {order.returnRequestedBy}
                      {order.returnReason ? ` — ${order.returnReason}` : ""}
                    </div>
                    {itemsSummary ? (
                      <div className="mt-1 text-xs text-muted-foreground">{itemsSummary}</div>
                    ) : null}
                  </div>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => rejectReturn(order.id)}
                      className={`${ACTION_BTN} border border-border`}
                    >
                      {t("Reject", "ውድቅ")}
                    </button>
                    <button
                      type="button"
                      onClick={() => openReturnOrder(order)}
                      className={`${ACTION_BTN} bg-ember text-ember-foreground`}
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
        <Card className="mb-3 border-amber-500/30 bg-amber-500/5">
          <h3 className="mb-2 font-display text-sm font-semibold">
            {t("Pending bill transfers", "በመጠባበቅ ላይ ያሉ የሂሳብ ማስተላለፎች")}
          </h3>
          <div className="space-y-2">
            {pendingTransferGroups.map((group) => (
              <div key={`${group.from}->${group.to}`} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border bg-card p-3">
                <div className="min-w-0 text-sm">
                  <div className="font-medium">
                    {group.from} → {group.to}
                  </div>
                  <div className="text-xs text-muted-foreground">
                    {group.bills.map((bill) => `${bill.orderNo} (${bill.tableNumber})`).join(" · ")}
                  </div>
                </div>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => rejectPendingTransfer(group.orderIds)}
                    className={`${ACTION_BTN} border border-border`}
                  >
                    {t("Reject", "ውድቅ")}
                  </button>
                  <button
                    type="button"
                    onClick={() => approvePendingTransfer(group.from, group.to, group.orderIds)}
                    className={`${ACTION_BTN} bg-ember text-ember-foreground`}
                  >
                    {t("Approve", "አፅድቅ")}
                  </button>
                </div>
              </div>
            ))}
          </div>
        </Card>
      ) : null}


      <div className="mb-3 space-y-2">
        <div className="flex flex-col sm:flex-row gap-2">
          <div className="relative flex-1">
            <Icons.Search className="size-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <input
              value={filters.search}
              onChange={(e) => patchFilters({ search: e.target.value, orderNo: e.target.value })}
              placeholder={t("Search order, table, or waiter...", "ትዕዛዝ፣ ጠረጴዛ ወይም አስተናጋጅ ፈልግ...")}
              className="h-10 w-full rounded-lg border border-border bg-card pl-9 pr-3 text-sm"
            />
          </div>
          {!isWaiter && (
            <select
              value={filters.waiter}
              onChange={(e) => patchFilters({ waiter: e.target.value })}
              className={`h-10 min-w-[10rem] rounded-lg border bg-card px-3 text-sm ${
                filters.waiter ? "border-foreground text-foreground" : "border-border text-muted-foreground"
              }`}
              aria-label={t("Waiter", "አስተናጋጅ")}
            >
              <option value="">{t("All waiters", "ሁሉም አስተናጋጆች")}</option>
              {waiterNames.map((name) => (
                <option key={name} value={name}>
                  {name}
                </option>
              ))}
            </select>
          )}
          <button
            type="button"
            onClick={() => setFiltersOpen((open) => !open)}
            className={`h-10 px-4 rounded-lg text-sm font-medium border inline-flex items-center justify-center gap-2 ${
              filtersOpen || hasExtraFilters
                ? "bg-foreground text-background border-foreground"
                : "bg-card border-border"
            }`}
          >
            <Icons.Filter className="size-4" />
            {t("Filters", "ማጣሪያዎች")}
          </button>
        </div>

        {activeFilterChips.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {activeFilterChips.map((chip) => (
              <button
                key={chip.key}
                type="button"
                onClick={() => patchFilters(chip.clear)}
                className="h-7 px-2.5 rounded-full bg-surface-2 border border-border text-xs inline-flex items-center gap-1 hover:bg-muted"
              >
                {chip.label}
                <Icons.X className="size-3" />
              </button>
            ))}
          </div>
        )}
        {filtersOpen && (
          <div className="rounded-xl border border-border bg-card p-4 space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium">{t("Filters", "ማጣሪያዎች")}</span>
              <button
                type="button"
                onClick={() => {
                  setTab("active");
                  setFilters(defaultOrdersFilters());
                }}
                className="h-8 px-3 rounded-lg text-xs border border-border hover:bg-surface-2"
              >
                {t("Clear", "አጽዳ")}
              </button>
            </div>

            <div className="space-y-2 rounded-lg border border-border bg-surface-2/50 p-3">
              <div className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
                <Icons.CalendarDays className="size-3.5 shrink-0" />
                {t("Date", "ቀን")}
              </div>
              <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center">
                <input
                  type="date"
                  value={filters.dateFrom}
                  onChange={(e) =>
                    applyDateRange(
                      e.target.value,
                      filters.dateTo && e.target.value && e.target.value > filters.dateTo
                        ? e.target.value
                        : filters.dateTo,
                    )
                  }
                  className={`h-9 min-w-[9.5rem] flex-1 rounded-lg border bg-card px-2.5 text-sm sm:flex-none ${
                    filters.dateFrom ? "border-foreground" : "border-border"
                  }`}
                  aria-label={t("From date", "ከቀን")}
                />
                <span className="text-xs text-muted-foreground">{t("to", "እስከ")}</span>
                <input
                  type="date"
                  value={filters.dateTo}
                  min={filters.dateFrom || undefined}
                  onChange={(e) => applyDateRange(filters.dateFrom, e.target.value)}
                  className={`h-9 min-w-[9.5rem] flex-1 rounded-lg border bg-card px-2.5 text-sm sm:flex-none ${
                    filters.dateTo ? "border-foreground" : "border-border"
                  }`}
                  aria-label={t("To date", "እስከ ቀን")}
                />
              </div>
              <div className="flex flex-wrap gap-1.5">
                {(
                  [
                    { id: "today", label: t("Today", "ዛሬ"), from: todayKeyValue, to: todayKeyValue },
                    {
                      id: "yesterday",
                      label: t("Yesterday", "ትላንት"),
                      from: shiftDateKey(todayKeyValue, -1),
                      to: shiftDateKey(todayKeyValue, -1),
                    },
                    {
                      id: "week",
                      label: t("7 days", "7 ቀን"),
                      from: shiftDateKey(todayKeyValue, -6),
                      to: todayKeyValue,
                    },
                  ] as const
                ).map((preset) => {
                  const active = filters.dateFrom === preset.from && filters.dateTo === preset.to;
                  return (
                    <button
                      key={preset.id}
                      type="button"
                      onClick={() => {
                        if (preset.id === "today") {
                          setTab("active");
                          patchFilters({ dateFrom: preset.from, dateTo: preset.to, quick: "none" });
                          return;
                        }
                        applyDateRange(preset.from, preset.to);
                      }}
                      className={`h-8 rounded-lg border px-2.5 text-xs font-medium ${
                        active
                          ? "border-foreground bg-foreground text-background"
                          : "border-border bg-card hover:bg-muted"
                      }`}
                    >
                      {preset.label}
                    </button>
                  );
                })}
                {(filters.dateFrom || filters.dateTo) && (
                  <button
                    type="button"
                    onClick={() => {
                      setTab("all");
                      patchFilters({ dateFrom: "", dateTo: "", quick: "none" });
                    }}
                    className="h-8 rounded-lg border border-border bg-card px-2.5 text-xs font-medium hover:bg-muted"
                  >
                    {t("All dates", "ሁሉም ቀናት")}
                  </button>
                )}
              </div>
            </div>

            <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-2">
              <select
                value={filters.status}
                onChange={(e) => patchFilters({ status: e.target.value as OpsStatusFilter, quick: "none" })}
                className="h-9 rounded-lg border border-border bg-surface-2 px-3 text-sm"
              >
                {STATUS_BAR.map((item) => (
                  <option key={item.id} value={item.id}>
                    {t(item.en, item.am)}
                  </option>
                ))}
              </select>
              <select
                value={filters.station}
                onChange={(e) => patchFilters({ station: e.target.value })}
                className="h-9 rounded-lg border border-border bg-surface-2 px-3 text-sm"
              >
                <option value="">{t("Station", "ጣቢያ")}</option>
                {stations.map((station) => (
                  <option key={station} value={station}>
                    {station}
                  </option>
                ))}
              </select>
              <select
                value={filters.waiter}
                onChange={(e) => patchFilters({ waiter: e.target.value })}
                className="h-9 rounded-lg border border-border bg-surface-2 px-3 text-sm"
              >
                <option value="">{t("Waiter", "አስተናጋጅ")}</option>
                {waiterNames.map((name) => (
                  <option key={name} value={name}>
                    {name}
                  </option>
                ))}
              </select>
              <select
                value={filters.area}
                onChange={(e) => patchFilters({ area: e.target.value })}
                className="h-9 rounded-lg border border-border bg-surface-2 px-3 text-sm"
              >
                <option value="">{t("Area", "ክፍል")}</option>
                {SEATING_AREAS.map((area) => (
                  <option key={area} value={area}>
                    {area}
                  </option>
                ))}
              </select>
              <input
                value={filters.table}
                onChange={(e) => patchFilters({ table: e.target.value })}
                placeholder={t("Table", "ጠረጴዛ")}
                className="h-9 rounded-lg border border-border bg-surface-2 px-3 text-sm"
              />
              <select
                value={filters.paymentStatus}
                onChange={(e) => patchFilters({ paymentStatus: e.target.value })}
                className="h-9 rounded-lg border border-border bg-surface-2 px-3 text-sm"
              >
                <option value="">{t("Payment Status", "የክፍያ ሁኔታ")}</option>
                {["Unpaid", "Partially Paid", "Paid", "Refunded"].map((status) => (
                  <option key={status} value={status}>
                    {status}
                  </option>
                ))}
              </select>
            </div>
          </div>
        )}
      </div>

      {/* Bulk actions */}
      {selected.size > 0 && (
        <div className="mb-3 rounded-xl border border-ember/30 bg-ember/5 px-4 py-3 flex flex-wrap items-center gap-2 text-sm">
          <span className="font-medium">
            {selected.size} {t("selected", "ተመርጠዋል")}
          </span>
          <button type="button" onClick={bulkExport} className={`${ACTION_BTN} border border-border bg-card`}>
            <Icons.Download className="size-3.5" /> {t("Export Orders", "ትዕዛዞች ላክ")}
          </button>
          <button type="button" onClick={bulkPrintKitchen} className={`${ACTION_BTN} border border-border bg-card`}>
            <Icons.Ticket className="size-3.5" /> {t("Preview Kitchen/Butcher Tickets", "የኩሽና/ቡቸር ቲኬት ቅድመ እይታ")}
          </button>
          {canManageBills && (
            <>
              <button type="button" onClick={bulkGenerateReceipts} className={`${ACTION_BTN} border border-border bg-card`}>
                <Icons.Receipt className="size-3.5" /> {t("Generate receipts", "ደረሰኞች ፍጠር")}
              </button>
              <button type="button" onClick={openBulkPayment} className={`${ACTION_BTN} bg-ember text-ember-foreground`}>
                <Icons.Wallet className="size-3.5" /> {t("Record payment", "ክፍያ መዝግብ")}
              </button>
              <button type="button" onClick={bulkCloseSelected} className={`${ACTION_BTN} border border-border bg-card`}>
                <Icons.Archive className="size-3.5" /> {t("Close Orders", "ትዕዛዞች ዝጋ")}
              </button>
            </>
          )}
          {isManager && (
            <>
              <button type="button" onClick={bulkCancelSelected} className={`${ACTION_BTN} border border-destructive text-destructive`}>
                <Icons.Ban className="size-3.5" /> {t("Cancel Orders", "ትዕዛዞች ሰርዝ")}
              </button>
              <select
                className="h-9 rounded-lg border border-border bg-card px-2 text-xs"
                defaultValue=""
                onChange={(e) => {
                  if (e.target.value) bulkAssignWaiter(e.target.value);
                  e.target.value = "";
                }}
              >
                <option value="">{t("Assign Waiter", "አስተናጋጅ መድብ")}</option>
                {waiterNames.map((name) => (
                  <option key={name} value={name}>
                    {name}
                  </option>
                ))}
              </select>
              <select
                className="h-9 rounded-lg border border-border bg-card px-2 text-xs"
                defaultValue=""
                onChange={(e) => {
                  if (e.target.value) bulkPriority(e.target.value as OrderPriority);
                  e.target.value = "";
                }}
              >
                <option value="">{t("Change Priority", "ቅድሚያ ቀይር")}</option>
                {ORDER_PRIORITIES.map((priority) => (
                  <option key={priority} value={priority}>
                    {priority}
                  </option>
                ))}
              </select>
            </>
          )}
          <button type="button" onClick={clearSelection} className={`${ACTION_BTN} text-muted-foreground`}>
            {t("Clear selection", "ምርጫ አጽዳ")}
          </button>
        </div>
      )}


      <Card className="!p-0 overflow-hidden">
        <div className="hidden md:block">
          <div
            ref={tableHeaderScrollRef}
            className="overflow-x-auto overflow-y-hidden [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
          >
            <div
              className={`${ORDERS_ROW_GRID} ${ORDERS_TABLE_MIN_WIDTH} bg-surface-2 py-3 text-[11px] uppercase tracking-wider text-muted-foreground`}
            >
              <div>{t("Order", "ትዕዛዝ")}</div>
              <div>{t("Table", "ጠረጴዛ")}</div>
              <div>{t("Waiter", "አስተናጋጅ")}</div>
              <div className="hidden lg:block">{t("Station", "ጣቢያ")}</div>
              <div>{t("Status", "ሁኔታ")}</div>
              <div className="text-right">{t("Total", "ጠቅላላ")}</div>
            </div>
          </div>
          <div
            ref={tableScrollRef}
            className="max-h-[70vh] overflow-auto"
            onScroll={(event) => {
              const header = tableHeaderScrollRef.current;
              if (header) header.scrollLeft = event.currentTarget.scrollLeft;
            }}
          >
            <div className={`relative ${ORDERS_TABLE_MIN_WIDTH}`} style={{ height: virtualizer.getTotalSize() }}>
              {virtualizer.getVirtualItems().map((virtualRow) => {
                const order = pageRows[virtualRow.index];
                if (!order) return null;
                const itemCount = order.items.reduce((sum, item) => sum + item.qty, 0);
                const stationsView = compactOrderStations(order);
                return (
                  <div
                    key={order.id}
                    data-index={virtualRow.index}
                    ref={virtualizer.measureElement}
                    className={`absolute left-0 w-full border-t border-border cursor-pointer hover:bg-surface-2/80 ${ORDERS_ROW_GRID} py-2.5 text-sm ${rowTone(order)} ${
                      actionMenuId === order.id ? "z-[100]" : "z-0"
                    }`}
                    style={{ transform: `translateY(${virtualRow.start}px)` }}
                    onClick={() => setDrawerId(order.id)}
                  >
                    <div>
                      <div className="font-mono font-semibold text-foreground">{order.orderNo}</div>
                      <div className="text-[11px] text-muted-foreground">
                        {itemCount} {itemCount === 1 ? t("item", "ዕቃ") : t("items", "ዕቃዎች")} · {orderClockLabel(order)}
                      </div>
                      {delayHint(order)}
                    </div>
                    <div>
                      <div className="font-medium text-foreground">{order.tableNumber}</div>
                      <div className="text-[11px] text-muted-foreground">{order.area}</div>
                    </div>
                    <div className="text-foreground">{order.waiter || "—"}</div>
                    <div className="hidden lg:block min-w-0 truncate text-foreground">
                      {stationsView.primary}
                      {stationsView.extra > 0 ? (
                        <span className="text-muted-foreground"> +{stationsView.extra}</span>
                      ) : null}
                    </div>
                    <div className="space-y-1">
                      <span className={`inline-flex h-6 items-center whitespace-nowrap rounded-full px-2.5 text-[11px] font-medium ${statusBadgeClass(order.status)}`}>
                        {compactStatusLabel(order.status)}
                      </span>
                      <div>{renderPaymentPill(order)}</div>
                    </div>
                    <div className="text-right font-mono font-semibold text-foreground">{formatETB(order.total)}</div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        <div className="md:hidden divide-y divide-border">
          {pageRows.map((order) => {
            const itemCount = order.items.reduce((sum, item) => sum + item.qty, 0);
            const stationsView = compactOrderStations(order);
            return (
              <button
                key={order.id}
                type="button"
                className={`w-full text-left p-4 space-y-1.5 ${rowTone(order)}`}
                onClick={() => setDrawerId(order.id)}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="font-mono font-semibold">{order.orderNo}</div>
                  <div className="font-mono font-semibold">{formatETB(order.total)}</div>
                </div>
                <div className="text-xs text-muted-foreground">
                  {order.tableNumber} · {order.area}
                </div>
                <div className="text-xs text-muted-foreground">
                  {order.waiter || "—"} · {stationsView.primary}
                  {stationsView.extra > 0 ? ` +${stationsView.extra}` : ""}
                </div>
                <div className="flex flex-wrap items-center gap-1.5 text-xs">
                  <span className={`inline-flex h-6 items-center rounded-full px-2.5 text-[11px] font-medium ${statusBadgeClass(order.status)}`}>
                    {compactStatusLabel(order.status)}
                  </span>
                  {renderPaymentPill(order)}
                </div>
                <div className="text-[11px] text-muted-foreground">
                  {itemCount} {itemCount === 1 ? t("item", "ዕቃ") : t("items", "ዕቃዎች")} · {orderClockLabel(order)}
                  {delayHint(order) ? <span className="ml-2">{delayHint(order)}</span> : null}
                </div>
              </button>
            );
          })}
        </div>

        {list.length === 0 && (
          <div className="text-center text-muted-foreground py-12 text-sm">
            {t("No orders", "ትዕዛዞች የሉም")}
          </div>
        )}

        {(paged.pageCount > 1 || serverMode) && (
          <div className="flex flex-col gap-3 border-t border-border px-4 py-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="text-xs text-muted-foreground">
                {serverLoading
                ? t("Loading…", "በመጫን ላይ…")
                : `${paged.from}-${paged.to} ${lang === "am" ? "ከ" : "of"} ${serverMode ? serverTotal || list.length : list.length}`}
            </div>
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                disabled={serverMode ? serverPage === 1 : paged.page === 1}
                onClick={() =>
                  serverMode
                    ? setServerPage((p) => Math.max(1, p - 1))
                    : setPage((p) => Math.max(1, p - 1))
                }
                className="inline-flex size-9 items-center justify-center rounded-lg border border-border disabled:opacity-50"
              >
                <Icons.ChevronLeft className="size-4" />
              </button>
              <span className="text-xs px-2">
                {serverMode ? serverPage : paged.page} /{" "}
                {serverMode ? Math.max(1, Math.ceil((serverTotal || 1) / 50)) : paged.pageCount}
              </span>
              <button
                type="button"
                disabled={
                  serverMode
                    ? serverPage >= Math.max(1, Math.ceil((serverTotal || 1) / 50))
                    : paged.page === paged.pageCount
                }
                onClick={() =>
                  serverMode
                    ? setServerPage((p) => p + 1)
                    : setPage((p) => Math.min(paged.pageCount, p + 1))
                }
                className="inline-flex size-9 items-center justify-center rounded-lg border border-border disabled:opacity-50"
              >
                <Icons.ChevronRight className="size-4" />
              </button>
            </div>
          </div>
        )}
      </Card>

      {/* 11. Order details drawer */}
      {drawerOrder && (
        <div className="fixed inset-0 z-40 flex justify-end">
          <button
            type="button"
            className="absolute inset-0 bg-black/40"
            aria-label={t("Close", "ዝጋ")}
            onClick={() => setDrawerId(null)}
          />
          <aside className="relative z-10 h-full w-full max-w-xl bg-card border-l border-border shadow-2xl overflow-y-auto">
            <div className="sticky top-0 z-10 bg-card/95 backdrop-blur border-b border-border px-5 py-4 flex items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <div className="font-mono text-lg font-semibold">{drawerOrder.orderNo}</div>
                  <span className={`inline-flex h-6 items-center rounded-full px-2.5 text-[11px] font-medium ${statusBadgeClass(drawerOrder.status)}`}>
                    {statusLabel(drawerOrder.status)}
                  </span>
                  {renderPaymentPill(drawerOrder)}
                </div>
                <div className="text-xs text-muted-foreground mt-1">
                  {drawerOrder.tableNumber} · {drawerOrder.area}
                </div>
              </div>
              <div className="flex items-center gap-2">
                {renderOrderActions(drawerOrder)}
                <button
                  type="button"
                  onClick={() => setDrawerId(null)}
                  className="size-9 rounded-lg border border-border inline-flex items-center justify-center hover:bg-surface-2"
                >
                  <Icons.X className="size-4" />
                </button>
              </div>
            </div>

            <div className="p-5 space-y-6">
              {drawerOrder.status === "PENDING_CASHIER" && canAccept ? (
                <button
                  type="button"
                  onClick={() => acceptOrder(drawerOrder.id)}
                  className="w-full h-11 rounded-lg bg-ember text-ember-foreground text-sm font-semibold inline-flex items-center justify-center gap-2"
                >
                  <Icons.Send className="size-4" /> {t("Accept", "ተቀበል")}
                </button>
              ) : null}

              <section className="space-y-2 text-sm">
                <div className="grid grid-cols-1 gap-2 text-sm">
                  <InfoRow label={t("Table", "ጠረጴዛ")} value={`${drawerOrder.tableNumber} · ${drawerOrder.area}`} />
                  <InfoRow label={t("Waiter", "አስተናጋጅ")} value={drawerOrder.waiter || "—"} />
                  <InfoRow
                    label={t("Opened by", "የከፈተ")}
                    value={drawerOrder.orderedByWaiter || drawerOrder.waiter || "—"}
                  />
                  <InfoRow label={t("Created", "ተፈጥሯል")} value={orderClockLabel(drawerOrder)} />
                </div>
              </section>

              {(drawerOrder.waiterTransfers?.length ?? 0) > 0 ? (
                <section className="space-y-2">
                  <h3 className="font-display text-sm font-semibold">
                    {t("Transfer history", "የማስተላለፍ ታሪክ")}
                  </h3>
                  <div className="space-y-1.5">
                    {drawerOrder.waiterTransfers!.map((entry) => (
                      <div
                        key={entry.id}
                        className="rounded-lg border border-border bg-surface-2/60 px-3 py-2 text-xs"
                      >
                        <div className="font-medium">
                          {entry.fromWaiter} → {entry.toWaiter}
                        </div>
                        <div className="mt-0.5 text-muted-foreground">
                          {t("By", "በ")}: {entry.actor} · {new Date(entry.at).toLocaleString()}
                        </div>
                      </div>
                    ))}
                  </div>
                </section>
              ) : null}

              <section className="space-y-2">
                <h3 className="font-display font-semibold text-sm">{t("Items", "ዕቃዎች")}</h3>
                <div className="space-y-2">
                  {drawerOrder.items.map((item, index) => {
                    return (
                      <div key={`${item.menuItemId ?? item.name}-${index}`} className="rounded-lg border border-border p-3 text-xs space-y-1">
                        <div className="flex justify-between gap-3">
                          <span className="font-medium">
                            {formatQty(item.qty, item.unitLabel)} {orderLineName(item, store.menuItems, lang)}
                          </span>
                          <span className="font-mono">{formatETB((item.unitPrice ?? 0) * item.qty)}</span>
                        </div>
                        <div className="text-muted-foreground">{t("Station", "ጣቢያ")}: {item.station}</div>
                      </div>
                    );
                  })}
                </div>
              </section>

              {canManageBills &&
              drawerOrder.stationTickets.length > 0 &&
              !isFinalOrderStatus(drawerOrder.status) ? (
                <section className="space-y-2">
                  <h3 className="font-display font-semibold text-sm">
                    {t("Print Bono", "ቦኖ አትም")}
                  </h3>
                  <p className="text-xs text-muted-foreground">
                    {t(
                      "Paper Bono is how the waitress sends this bill to Bar, Kitchen, Butcher, and Coffee.",
                      "አስተናጋጅቱ ይህን ሂሳብ ወደ ባር፣ ኩሽና፣ ቡቸር እና ቡና የምትልከው በወረቀት ቦኖ ነው።",
                    )}
                  </p>
                  <BonoStationActions
                    order={drawerOrder}
                    onPreview={() => openTicketPreview(drawerOrder)}
                  />
                </section>
              ) : null}

              <section className="space-y-2">
                <h3 className="font-display font-semibold text-sm">{t("Audit Trail", "የኦዲት መዝገብ")}</h3>
                <div className="space-y-3 border-l border-border ml-1.5 pl-4">
                  {buildOrderTimeline(drawerOrder).map((event, index) => (
                    <div key={`${event.label}-${index}`} className="relative text-xs">
                      <div className="absolute -left-[21px] top-1 size-2.5 rounded-full bg-ember" />
                      <div className="font-medium">{event.label}</div>
                      <div className="text-muted-foreground">
                        {[event.user, event.at].filter(Boolean).join(" · ") || "—"}
                      </div>
                    </div>
                  ))}
                </div>
              </section>

              <section className="space-y-2 text-xs">
                <h3 className="font-display font-semibold text-sm">{t("Payment", "ክፍያ")}</h3>
                <div className="rounded-lg border border-border p-3 space-y-1.5">
                  <InfoRow label={t("Status", "ሁኔታ")} value={paymentShort(drawerOrder)} />
                  <InfoRow label={t("Subtotal", "ንዑስ ድምር")} value={formatETB(drawerOrder.receipt?.subtotal ?? drawerOrder.total)} />
                  <InfoRow label={t("Discount", "ቅናሽ")} value={formatETB(drawerOrder.receipt?.discount ?? 0)} />
                  <InfoRow label={t("Service Charge", "የአገልግሎት ክፍያ")} value={formatETB(drawerOrder.receipt?.serviceCharge ?? 0)} />
                  <InfoRow label={t("VAT", "ተ.እ.ታ")} value={formatETB(drawerOrder.receipt?.vat ?? 0)} />
                  <InfoRow label={t("Total", "ጠቅላላ")} value={formatETB(drawerOrder.receipt?.grandTotal ?? drawerOrder.total)} />
                  <InfoRow
                    label={t("Paid Amount", "የተከፈለ")}
                    value={formatETB(drawerOrder.payment?.amountReceived ?? (drawerOrder.paymentStatus === "Paid" ? drawerOrder.total : 0))}
                  />
                  <InfoRow label={t("Method", "ዘዴ")} value={drawerOrder.payment?.method ?? "—"} />
                </div>
              </section>

              <section className="space-y-2">
                <h3 className="font-display font-semibold text-sm">{t("Station Status", "የጣቢያ ሁኔታ")}</h3>
                <div className="space-y-1.5">
                  {(drawerOrder.stationTickets.length
                    ? drawerOrder.stationTickets
                    : compactOrderStations(drawerOrder).all.map((station) => ({
                        id: station,
                        station,
                        status: drawerOrder.status,
                      }))
                  ).map((ticket) => (
                    <div key={ticket.id} className="flex items-center justify-between rounded-lg border border-border px-3 py-2 text-xs">
                      <span>{ticket.station}</span>
                      <span className={`inline-flex h-6 items-center rounded-full px-2 text-[11px] font-medium ${statusBadgeClass(ticket.status)}`}>
                        {statusLabel(ticket.status)}
                      </span>
                    </div>
                  ))}
                </div>
              </section>

              {canViewInventory && (
                <section className="space-y-2 text-xs">
                  <h3 className="font-display font-semibold text-sm">{t("Inventory Summary", "የክምችት ማጠቃለያ")}</h3>
                  <div className="rounded-lg border border-border p-3 space-y-2">
                    <InfoRow label={t("Reserved", "ተይዟል")} value={drawerOrder.stockReservedAt ?? "—"} />
                    <InfoRow label={t("Deducted", "ተቀንሷል")} value={drawerOrder.stockDeductedAt ?? "—"} />
                    <InfoRow
                      label={t("Exception outcome", "የልዩ ውጤት")}
                      value={stockOutcomeLabel(drawerOrder.stockExceptionOutcome, t) ?? "—"}
                    />
                    <div className="pt-1 border-t border-dashed border-border space-y-1">
                      <div className="font-medium">{t("Consumed / locations", "ፍጆታ / ቦታዎች")}</div>
                      {drawerOrder.items.map((item, index) => (
                        <div key={`inv-${index}`} className="flex justify-between gap-2 text-muted-foreground">
                          <span>{orderLineName(item, store.menuItems, lang)}</span>
                          <span>{item.stockDeductionLocation ?? item.station}</span>
                        </div>
                      ))}
                    </div>
                    {ledgerForDrawer.length > 0 && (
                      <div className="pt-1 border-t border-dashed border-border space-y-1">
                        <div className="font-medium">{t("Stock ledger refs", "የክምችት መዝገብ")}</div>
                        {ledgerForDrawer.slice(0, 8).map((entry) => (
                          <div key={entry.id} className="flex justify-between gap-2 text-muted-foreground">
                            <span className="truncate">{entry.type} · {entry.itemName}</span>
                            <span className="font-mono shrink-0">{entry.quantity}</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </section>
              )}

              <section className="space-y-2 text-xs">
                <h3 className="font-display font-semibold text-sm">{t("Customer Information", "የደንበኛ መረጃ")}</h3>
                <div className="rounded-lg border border-border p-3 space-y-1.5">
                  <InfoRow label={t("Name", "ስም")} value={drawerOrder.customerName ?? "—"} />
                  <InfoRow label={t("Phone", "ስልክ")} value={drawerOrder.customerPhone ?? "—"} />
                  <InfoRow
                    label={t("Loyalty Status", "የታማኝነት ሁኔታ")}
                    value={orderPriority(drawerOrder) === "VIP" ? "VIP" : t("Standard", "መደበኛ")}
                  />
                  <InfoRow label={t("Notes", "ማስታወሻ")} value={drawerOrder.customerNotes ?? "—"} />
                </div>
              </section>

              {canManageBills && drawerOrder.status !== "PENDING_CASHIER" && (
                <button
                  type="button"
                  onClick={() => openOrderBill(drawerOrder)}
                  className="w-full h-11 rounded-lg bg-ember text-ember-foreground text-sm font-semibold inline-flex items-center justify-center gap-2"
                >
                  <Icons.ReceiptText className="size-4" />
                  {drawerOrder.receipt
                    ? t("View Payment", "ክፍያ ተመልከት")
                    : canGenerateReceipt(drawerOrder)
                      ? t("Print Receipt", "ደረሰኝ አትም")
                      : t("View order bill", "የትዕዛዝ ሂሳብ ተመልከት")}
                </button>
              )}
              {canManageBills && orderHasManualDeliveryStations(drawerOrder) && (
                <button
                  type="button"
                  onClick={() => openTicketPreview(drawerOrder)}
                  className="w-full h-11 rounded-lg border border-border text-sm font-semibold inline-flex items-center justify-center gap-2 hover:bg-surface-2"
                >
                  <Icons.Ticket className="size-4" /> {t("Reprint KDS Ticket", "የ KDS ቲኬት እንደገና አትም")}
                </button>
              )}
              {(canManageBills || isWaiter) && (
                <Link
                  to="/app/pos"
                  className="w-full h-11 rounded-lg border border-border text-sm font-semibold inline-flex items-center justify-center gap-2 hover:bg-surface-2"
                >
                  <Icons.Store className="size-4" /> {t("Open in POS", "በ POS ክፈት")}
                </Link>
              )}
              {canRequestReturnOrder(drawerOrder) && (
                <button
                  type="button"
                  onClick={() => openReturnOrder(drawerOrder)}
                  className="w-full h-11 rounded-lg border border-border text-sm font-semibold inline-flex items-center justify-center gap-2 hover:bg-surface-2"
                >
                  <Icons.RotateCcw className="size-4" />
                  {canApproveReturns
                    ? t("Return order", "ትዕዛዝ መልስ")
                    : t("Request return", "መልስ ጠይቅ")}
                </button>
              )}
              {canApproveReturnOrder(drawerOrder) && canApproveReturns && (
                <button
                  type="button"
                  onClick={() => openReturnOrder(drawerOrder)}
                  className="w-full h-11 rounded-lg border border-gold/40 bg-gold/10 text-sm font-semibold inline-flex items-center justify-center gap-2"
                >
                  <Icons.ShieldCheck className="size-4" /> {t("Approve return", "መልስ አፅድቅ")}
                </button>
              )}
            </div>
          </aside>
        </div>
      )}

      {/* Dialogs — void / return / waiter / priority */}
      {voidDialog && (
        <ModalShell>
          <div className="flex items-start gap-3">
            <div className="size-10 rounded-lg bg-destructive/10 text-destructive grid place-items-center shrink-0">
              <Icons.AlertTriangle className="size-5" />
            </div>
            <div>
              <h2 className="font-display font-semibold">
                {t("Request void", "ሰረዛ ጠይቅ")} — {voidDialog.orderNo}
              </h2>
            </div>
          </div>
          <textarea
            ref={reasonRef}
            value={voidReason}
            onChange={(e) => setVoidReason(e.target.value)}
            rows={3}
            placeholder={t("Reason for void", "ሰረዛ መታ መለያ")}
            className="w-full rounded-lg border border-border bg-surface-2 px-3 py-2 text-sm resize-none"
          />
          <div className="flex gap-2 justify-end">
            <button type="button" onClick={() => setVoidDialog(null)} className={`${ACTION_BTN} border border-border`}>
              {t("Cancel", "ሰርዝ")}
            </button>
            <button
              type="button"
              disabled={!voidReason.trim()}
              onClick={submitVoidRequest}
              className={`${ACTION_BTN} bg-destructive text-destructive-foreground disabled:opacity-50`}
            >
              {t("Send void request", "ሰረዛ ጥያቄ ላክ")}
            </button>
          </div>
        </ModalShell>
      )}

      {approveDialog && (
        <ModalShell>
          <h2 className="font-display font-semibold">
            {t("Approve void", "ሰረዛ አፅድቅ")} — {approveDialog.orderNo}
          </h2>
          <div className="rounded-lg bg-surface-2 border border-border p-3 text-sm space-y-2">
            <InfoRow label={t("Requested by", "የጠየቀ")} value={approveDialog.requestedBy} />
            {approveDialog.reason && <div className="text-xs text-destructive">{approveDialog.reason}</div>}
            <label className="flex items-start gap-2 text-xs text-muted-foreground">
              <input
                type="checkbox"
                className="mt-0.5"
                checked={voidReusablePackaged}
                onChange={(e) => setVoidReusablePackaged(e.target.checked)}
              />
              <span>
                {t(
                  "Reusable packaged item — reverse stock back to department",
                  "እንደገና የሚሸጥ የታሸገ እቃ — ክምችት ወደ ክፍል ይመለስ",
                )}
              </span>
            </label>
          </div>
          <div className="flex gap-2 justify-end flex-wrap">
            <button
              type="button"
              onClick={() => {
                setApproveDialog(null);
                setVoidReusablePackaged(false);
              }}
              className={`${ACTION_BTN} border border-border`}
            >
              {t("Cancel", "ሰርዝ")}
            </button>
            <button
              type="button"
              onClick={() => rejectVoid(approveDialog.orderId)}
              className={`${ACTION_BTN} border border-destructive text-destructive`}
            >
              {t("Reject", "ውድቅ አድርግ")}
            </button>
            <button
              type="button"
              onClick={() => approveVoid(approveDialog.orderId)}
              className={`${ACTION_BTN} bg-destructive text-destructive-foreground`}
            >
              {t("Confirm void", "ሰረዛ አርጋግጥ")}
            </button>
          </div>
        </ModalShell>
      )}

      {returnDialog && (
        <ModalShell>
          <h2 className="font-display font-semibold">
            {canApproveReturns
              ? returnDialog.pending
                ? t("Approve return", "መልስ አፅድቅ")
                : t("Return order", "ትዕዛዝ መልስ")
              : t("Request return", "መልስ ጠይቅ")}{" "}
            — {returnDialog.orderNo}
          </h2>
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
                            onChange={() => setReturnLineQty(index, checked ? 0 : line.qty, line.qty)}
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
            ref={returnReasonRef}
            value={returnReason}
            onChange={(e) => setReturnReason(e.target.value)}
            rows={3}
            placeholder={t("Reason for return", "የመልስ ምክንያት")}
            className="w-full rounded-lg border border-border bg-surface-2 px-3 py-2 text-sm resize-none"
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
          <div className="flex gap-2 justify-end flex-wrap">
            <button type="button" onClick={closeReturnDialog} className={`${ACTION_BTN} border border-border`}>
              {t("Cancel", "ሰርዝ")}
            </button>
            {canApproveReturns && returnDialog.pending ? (
              <button
                type="button"
                onClick={() => rejectReturn(returnDialog.orderId)}
                className={`${ACTION_BTN} border border-border`}
              >
                {t("Reject", "ውድቅ አድርግ")}
              </button>
            ) : null}
            <button
              type="button"
              disabled={!returnReason.trim() || Object.keys(returnQtys).length === 0}
              onClick={submitReturnOrder}
              className={`${ACTION_BTN} bg-ember text-ember-foreground disabled:opacity-50`}
            >
              {canApproveReturns
                ? t("Confirm return", "መልስ አረጋግጥ")
                : t("Send request", "ጥያቄ ላክ")}
            </button>
          </div>
        </ModalShell>
      )}

      {transferOpen && (
        <ModalShell>
          <h2 className="font-display font-semibold">{t("Transfer open bills", "ክፍት ሂሳቦችን አስተላልፍ")}</h2>
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
              {t("From", "ከ")}: <span className="font-semibold">{user?.name}</span>
            </div>
          ) : (
            <label className="block space-y-1">
              <span className="text-xs text-muted-foreground">{t("From waitress", "ከ አስተናጋጅት")}</span>
              <select
                value={transferFrom}
                onChange={(e) => {
                  const nextFrom = e.target.value;
                  setTransferFrom(nextFrom);
                  const bills = openBillsOwnedByWaiter(store.orders, nextFrom);
                  setTransferSelectedIds(new Set(bills.map((order) => order.id)));
                  if (assignedWaiterMatches(transferTo, nextFrom)) {
                    setTransferTo(waiterNames.find((name) => !assignedWaiterMatches(name, nextFrom)) ?? "");
                  }
                }}
                className="h-10 w-full rounded-lg border border-border bg-surface-2 px-3 text-sm"
              >
                {waiterNames.map((name) => (
                  <option key={name} value={name}>
                    {name}
                  </option>
                ))}
              </select>
            </label>
          )}
          <label className="block space-y-1">
            <span className="text-xs text-muted-foreground">{t("To waitress", "ወደ አስተናጋጅት")}</span>
            <select
              value={transferTo}
              onChange={(e) => setTransferTo(e.target.value)}
              className="h-10 w-full rounded-lg border border-border bg-surface-2 px-3 text-sm"
            >
              {waiterNames
                .filter((name) => !assignedWaiterMatches(name, transferSourceWaiter))
                .map((name) => (
                  <option key={name} value={name}>
                    {name}
                  </option>
                ))}
            </select>
          </label>
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
                        className="size-4"
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
          <div className="flex gap-2 justify-end">
            <button type="button" onClick={() => setTransferOpen(false)} className={`${ACTION_BTN} border border-border`}>
              {t("Cancel", "ሰርዝ")}
            </button>
            <button
              type="button"
              disabled={!transferTo || transferSelectedIds.size === 0}
              onClick={submitBillTransfer}
              className={`${ACTION_BTN} bg-ember text-ember-foreground disabled:opacity-50`}
            >
              {isWaiter ? t("Request transfer", "ማስተላለፍ ጠይቅ") : t("Hand over bills", "ሂሳቦችን አስረክብ")}
              {transferSelectedIds.size > 0 ? ` (${transferSelectedIds.size})` : ""}
            </button>
          </div>
        </ModalShell>
      )}

      {waiterDialog && (
        <ModalShell>
          <h2 className="font-display font-semibold">
            {t("Change Waiter", "አስተናጋጅ ቀይር")} — {waiterDialog.orderNo}
          </h2>
          <input
            value={waiterDialog.waiter}
            onChange={(e) => setWaiterDialog({ ...waiterDialog, waiter: e.target.value })}
            className="h-10 w-full rounded-lg border border-border bg-surface-2 px-3 text-sm"
            list="orders-waiter-options"
          />
          <datalist id="orders-waiter-options">
            {waiterNames.map((name) => (
              <option key={name} value={name} />
            ))}
          </datalist>
          <div className="flex gap-2 justify-end">
            <button type="button" onClick={() => setWaiterDialog(null)} className={`${ACTION_BTN} border border-border`}>
              {t("Cancel", "ሰርዝ")}
            </button>
            <button
              type="button"
              onClick={() => {
                store.updateOrderWaiter(waiterDialog.orderId, waiterDialog.waiter);
                setWaiterDialog(null);
              }}
              className={`${ACTION_BTN} bg-foreground text-background`}
            >
              {t("Save", "አስቀምጥ")}
            </button>
          </div>
        </ModalShell>
      )}

      {priorityDialog && (
        <ModalShell>
          <h2 className="font-display font-semibold">
            {t("Change Priority", "ቅድሚያ ቀይር")} — {priorityDialog.orderNo}
          </h2>
          <select
            value={priorityDialog.priority}
            onChange={(e) =>
              setPriorityDialog({ ...priorityDialog, priority: e.target.value as OrderPriority })
            }
            className="h-10 w-full rounded-lg border border-border bg-surface-2 px-3 text-sm"
          >
            {ORDER_PRIORITIES.map((priority) => (
              <option key={priority} value={priority}>
                {priority}
              </option>
            ))}
          </select>
          <div className="flex gap-2 justify-end">
            <button type="button" onClick={() => setPriorityDialog(null)} className={`${ACTION_BTN} border border-border`}>
              {t("Cancel", "ሰርዝ")}
            </button>
            <button
              type="button"
              onClick={() => {
                store.updateOrderPriority(priorityDialog.orderId, priorityDialog.priority);
                setPriorityDialog(null);
              }}
              className={`${ACTION_BTN} bg-foreground text-background`}
            >
              {t("Save", "አስቀምጥ")}
            </button>
          </div>
        </ModalShell>
      )}

      {transferDialog && (
        <ModalShell>
          <h2 className="font-display font-semibold">
            {t("Transfer Table", "ጠረጴዛ አስተላልፍ")} — {transferDialog.orderNo}
          </h2>
          <select
            value={transferDialog.area}
            onChange={(e) => setTransferDialog({ ...transferDialog, area: e.target.value as SeatingArea })}
            className="h-10 w-full rounded-lg border border-border bg-surface-2 px-3 text-sm"
          >
            {SEATING_AREAS.map((area) => (
              <option key={area} value={area}>
                {area}
              </option>
            ))}
          </select>
          <select
            value={transferDialog.tableNumber}
            onChange={(e) => setTransferDialog({ ...transferDialog, tableNumber: e.target.value })}
            className="h-10 w-full rounded-lg border border-border bg-surface-2 px-3 text-sm"
          >
            {store.tables.map((table) => (
              <option key={table.id} value={table.label}>
                {table.area} · {table.label} ({table.status})
              </option>
            ))}
          </select>
          <div className="flex gap-2 justify-end">
            <button type="button" onClick={() => setTransferDialog(null)} className={`${ACTION_BTN} border border-border`}>
              {t("Cancel", "ሰርዝ")}
            </button>
            <button
              type="button"
              onClick={() => {
                if (!user) return;
                const result = store.transferOrderTable(transferDialog.orderId, {
                  tableNumber: transferDialog.tableNumber,
                  area: transferDialog.area,
                  actor: user.name,
                });
                if (!result.ok) showError(result.error ?? "Transfer failed");
                else setTransferDialog(null);
              }}
              className={`${ACTION_BTN} bg-foreground text-background`}
            >
              {t("Transfer", "አስተላልፍ")}
            </button>
          </div>
        </ModalShell>
      )}

      {mergeDialog && (
        <ModalShell>
          <h2 className="font-display font-semibold">{t("Merge Orders", "ትዕዛዞች አዋህድ")}</h2>
          <select
            value={mergeDialog.secondaryId}
            onChange={(e) => setMergeDialog({ ...mergeDialog, secondaryId: e.target.value })}
            className="h-10 w-full rounded-lg border border-border bg-surface-2 px-3 text-sm"
          >
            <option value="">{t("Select order to merge in", "ለማዋሃድ ትዕዛዝ ምረጥ")}</option>
            {scopedOrders
              .filter(
                (order) =>
                  order.id !== mergeDialog.primaryId &&
                  !isFinalOrderStatus(order.status) &&
                  !order.receipt,
              )
              .map((order) => (
                <option key={order.id} value={order.id}>
                  {order.orderNo} · {order.tableNumber} · {formatETB(order.total)}
                </option>
              ))}
          </select>
          <div className="flex gap-2 justify-end">
            <button type="button" onClick={() => setMergeDialog(null)} className={`${ACTION_BTN} border border-border`}>
              {t("Cancel", "ሰርዝ")}
            </button>
            <button
              type="button"
              disabled={!mergeDialog.secondaryId}
              onClick={() => {
                if (!user) return;
                const result = store.mergeOrders(mergeDialog.primaryId, mergeDialog.secondaryId, user.name);
                if (!result.ok) showError(result.error ?? "Merge failed");
                else setMergeDialog(null);
              }}
              className={`${ACTION_BTN} bg-foreground text-background disabled:opacity-50`}
            >
              {t("Merge", "አዋህድ")}
            </button>
          </div>
        </ModalShell>
      )}

      {splitDialog && (() => {
        const order = scopedOrders.find((item) => item.id === splitDialog.orderId);
        if (!order) return null;
        return (
          <ModalShell>
            <h2 className="font-display font-semibold">
              {t("Split Bill", "ሂሳብ ክፈል")} — {order.orderNo}
            </h2>
            <div className="max-h-56 overflow-y-auto space-y-2">
              {order.items.map((item, index) => (
                <label key={`${item.name}-${index}`} className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={splitDialog.selected.has(index)}
                    onChange={() => {
                      setSplitDialog((prev) => {
                        if (!prev) return prev;
                        const next = new Set(prev.selected);
                        if (next.has(index)) next.delete(index);
                        else next.add(index);
                        return { ...prev, selected: next };
                      });
                    }}
                  />
                  <span>
                    {formatQty(item.qty, item.unitLabel)} {orderLineName(item, store.menuItems, lang)}
                  </span>
                </label>
              ))}
            </div>
            <div className="flex gap-2 justify-end">
              <button type="button" onClick={() => setSplitDialog(null)} className={`${ACTION_BTN} border border-border`}>
                {t("Cancel", "ሰርዝ")}
              </button>
              <button
                type="button"
                disabled={splitDialog.selected.size === 0}
                onClick={() => {
                  if (!user) return;
                  const result = store.splitOrderBill(
                    splitDialog.orderId,
                    Array.from(splitDialog.selected),
                    user.name,
                  );
                  if (!result.ok) showError(result.error ?? "Split failed");
                  else {
                    setSplitDialog(null);
                    if (result.newOrder) setDrawerId(result.newOrder.id);
                  }
                }}
                className={`${ACTION_BTN} bg-foreground text-background disabled:opacity-50`}
              >
                {t("Split", "ክፈል")}
              </button>
            </div>
          </ModalShell>
        );
      })()}

      {billOrder && canManageBills && (
        <BillDialog
          order={billOrder}
          cashierName={user?.name ?? "Cashier"}
          onClose={() => setBillOrder(null)}
          onReceipt={(order, receipt, reprint) => setReceiptView({ order, receipt, reprint })}
          onPaid={(order) => {
            if (order.receipt) setReceiptView({ order, receipt: order.receipt });
            setBillOrder(null);
          }}
          onSkippedStock={(items) => setSkippedStockItems(items)}
        />
      )}
      {bulkPayOpen && canManageBills && (
        <ModalShell>
          <h2 className="font-display font-semibold">
            {t("Record payment", "ክፍያ መዝግብ")} — {bulkPayOrders.length}{" "}
            {t("orders", "ትዕዛዞች")}
          </h2>
          <div className="max-h-48 space-y-1 overflow-y-auto rounded-lg border border-border p-2 text-sm">
            {bulkPayOrders.map((order) => (
              <div key={order.id} className="flex items-center justify-between gap-2 px-1 py-1">
                <div className="min-w-0 truncate">
                  <span className="font-mono font-semibold">{order.orderNo}</span>
                  <span className="text-muted-foreground">
                    {" "}
                    · {order.area} {order.tableNumber} · {order.waiter || t("Unassigned", "ያልተመደበ")}
                  </span>
                </div>
                <span className="shrink-0 font-mono font-semibold">
                  {formatETB(order.receipt?.grandTotal ?? order.total)}
                </span>
              </div>
            ))}
          </div>
          <div className="rounded-lg bg-surface-2 border border-border px-3 py-2 text-sm flex items-center justify-between">
            <span className="text-muted-foreground">{t("Total due", "ጠቅላላ የሚከፈል")}</span>
            <span className="font-mono font-semibold">{formatETB(bulkPayDueTotal)}</span>
          </div>
          <label className="block space-y-1">
            <span className="text-xs text-muted-foreground">{t("Collected by waiter", "የሰበሰበ አስተናጋጅ")}</span>
            <select
              value={bulkPayWaiter}
              onChange={(e) => setBulkPayWaiter(e.target.value)}
              className="h-10 w-full rounded-lg border border-border bg-card px-3 text-sm"
            >
              <option value="">{t("Select waiter", "አስተናጋጅ ምረጥ")}</option>
              {waiterNames.map((name) => (
                <option key={name} value={name}>
                  {name}
                </option>
              ))}
            </select>
          </label>
          <label className="block space-y-1">
            <span className="text-xs text-muted-foreground">{t("Payment method", "የክፍያ ዘዴ")}</span>
            <select
              value={bulkPayMethod}
              onChange={(e) => setBulkPayMethod(e.target.value as PaymentMethod)}
              className="h-10 w-full rounded-lg border border-border bg-card px-3 text-sm"
            >
              {PAYMENT_METHODS.filter((method) => method !== "Mixed").map((method) => (
                <option key={method} value={method}>
                  {method}
                </option>
              ))}
            </select>
          </label>
          <label className="block space-y-1">
            <span className="text-xs text-muted-foreground">{t("Amount received", "የተቀበለ መጠን")}</span>
            <input
              type="number"
              min={bulkPayDueTotal}
              step="1"
              value={bulkPayAmount}
              onChange={(e) => setBulkPayAmount(Number(e.target.value) || 0)}
              className="h-10 w-full rounded-lg border border-border bg-card px-3 text-sm font-mono"
            />
          </label>
          <p className="text-xs text-muted-foreground">
            {t(
              "Missing receipts are generated first. Bank verification is done per bill in Order bill.",
              "የጎደሉ ደረሰኞች መጀመሪያ ይፈጠራሉ። የባንክ ማረጋገጫ በእያንዳንዱ ሂሳብ ላይ ነው።",
            )}
          </p>
          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={() => {
                setBulkPayOpen(false);
                setBulkPayIds([]);
              }}
              className={`${ACTION_BTN} border border-border`}
            >
              {t("Cancel", "ሰርዝ")}
            </button>
            <button
              type="button"
              disabled={!bulkPayWaiter.trim() || bulkPayAmount + 0.001 < bulkPayDueTotal}
              onClick={submitBulkPayment}
              className={`${ACTION_BTN} bg-ember text-ember-foreground disabled:opacity-50`}
            >
              {t("Confirm payment", "ክፍያ አረጋግጥ")}
            </button>
          </div>
        </ModalShell>
      )}
      {receiptView && <ReceiptDialog view={receiptView} onClose={() => setReceiptView(null)} />}
      {ticketPreview && (
        <StationTicketPreviewDialog view={ticketPreview} onClose={() => setTicketPreview(null)} />
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
            <button
              type="button"
              onClick={() => setSkippedStockItems([])}
              className="size-6 grid place-items-center rounded-md hover:bg-gold/20"
            >
              <Icons.X className="size-3.5" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-3">
      <span className="text-muted-foreground">{label}</span>
      <span className="text-right font-medium">{value}</span>
    </div>
  );
}

function ModalShell({ children }: { children: ReactNode }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="w-full max-w-md rounded-xl bg-card border border-border shadow-xl p-5 space-y-4">{children}</div>
    </div>
  );
}
