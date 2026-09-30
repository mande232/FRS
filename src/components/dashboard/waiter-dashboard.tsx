import { Link } from "@tanstack/react-router";
import * as Icons from "lucide-react";
import { useMemo, useState, type ComponentType, type ReactNode } from "react";
import { Card, Chip, PageHeader, Stat } from "@/components/ui-kit";
import {
  formatDashboardMoney,
  MoneyVisibilityToggle,
  useHideMoney,
} from "@/lib/dashboard-privacy";
import { isFinalOrderStatus, type Order, type SalesRecord } from "@/lib/demo-data";
import { formatETB } from "@/lib/ethiopic";
import { useAuth } from "@/lib/auth-context";
import { useLang } from "@/lib/lang-context";
import { useStore } from "@/lib/store";
import { EMPTY_MODULE_RECORDS, useModuleRecords } from "@/lib/module-records";
import { getNotificationsForUser } from "@/lib/notifications";
import { latestDashboardCutoff, resolveBranchDashboardPeriodStart, useStockManagementModule } from "@/lib/stock-management";
import { buildDashboardTodaySlice, dateKey, filterSalesAfterDashboardPeriod } from "@/lib/sales-analytics";
import { showError, showSuccess } from "@/lib/toast";
import {
  WAITER_CLOSINGS_MODULE_KEY,
  buildWaiterClosingRecord,
  buildWaiterClosingSheet,
  hasWaiterClosedToday,
  summarizeWaiterDay,
  todayWaiterClosing,
  waiterClosingBlockers,
  type WaiterClosingRecord,
  type WaiterClosingSheet,
  type WaiterDaySummary,
} from "@/lib/waiter-ops";
import { openBillsOwnedByWaiter } from "@/lib/waiter-bill-transfer";
import { assignedWaiterMatches } from "@/lib/waiter-identity";
import { canRequestReturnOrder } from "@/lib/orders-ops";

const EMPTY_POS_SEARCH = {
  table: undefined,
  area: undefined,
  waiter: undefined,
  orderId: undefined,
  mode: undefined,
} as const;

type QuickLink = {
  to: string;
  label: string;
  labelAm: string;
  icon: keyof typeof Icons;
  tone?: "ember" | "default";
  badge?: number;
};

function topSoldByWaiter(sales: readonly SalesRecord[], waiter: string, limit = 5) {
  const rows = new Map<string, { name: string; qty: number; revenue: number }>();
  for (const row of sales) {
    if (row.waiter.trim().toLowerCase() !== waiter.trim().toLowerCase()) continue;
    const key = row.productId || row.productName;
    const current = rows.get(key) ?? { name: row.productName, qty: 0, revenue: 0 };
    current.qty += row.qty;
    current.revenue += row.revenue;
    rows.set(key, current);
  }
  return Array.from(rows.values())
    .sort((a, b) => b.revenue - a.revenue)
    .slice(0, limit);
}

function orderStatusTone(order: Order): "ember" | "gold" | "teff" | "muted" {
  if (order.paymentStatus === "Paid") return "teff";
  if (order.status === "PENDING_CASHIER") return "ember";
  if (order.paymentStatus === "Partially Paid") return "gold";
  return "muted";
}

function formatQty(qty: number) {
  return Number.isInteger(qty) ? String(qty) : qty.toLocaleString(undefined, { maximumFractionDigits: 3 });
}

function tableLabel(area: string, tableNumber: string) {
  const table = tableNumber.trim();
  const zone = area.trim();
  if (!zone || zone.toLowerCase() === table.toLowerCase()) return table || zone;
  return `${zone} ${table}`.trim();
}

function ModalShell({
  children,
  onClose,
}: {
  children: ReactNode;
  onClose: () => void;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 p-0 sm:items-center sm:p-4">
      <button type="button" className="absolute inset-0" aria-label="Close" onClick={onClose} />
      <div className="relative z-10 flex max-h-[92vh] w-full max-w-md flex-col overflow-hidden rounded-t-2xl border border-border bg-card shadow-xl sm:rounded-xl">
        {children}
      </div>
    </div>
  );
}

export function WaiterClosingBillModal({
  restaurantName,
  branchName,
  waiterName,
  summary,
  sheet,
  frozen,
  hideMoney,
  onClose,
}: {
  restaurantName: string;
  branchName: string;
  waiterName: string;
  summary: WaiterDaySummary;
  sheet: WaiterClosingSheet;
  frozen: boolean;
  hideMoney: boolean;
  onClose: () => void;
}) {
  const lang = useLang();
  const t = (en: string, am: string) => (lang === "am" ? am : en);
  const money = (value: number) => (hideMoney ? "*****" : formatETB(value));
  const heading = restaurantName.trim() || "Ethio Plate";
  const tableGroups = sheet.tables.map((table) => {
    const label = tableLabel(table.area, table.tableNumber);
    const orders = sheet.orders.filter(
      (order) => order.area === table.area && order.tableNumber === table.tableNumber,
    );
    const items = new Map<string, { name: string; qty: number; amount: number }>();
    for (const order of orders) {
      for (const line of order.items) {
        const key = line.name.trim().toLowerCase();
        const current = items.get(key) ?? { name: line.name, qty: 0, amount: 0 };
        current.qty += line.qty;
        current.amount += line.amount;
        items.set(key, current);
      }
    }
    return { key: `${table.area}-${table.tableNumber}`, label, total: table.total, items: [...items.values()] };
  });

  return (
    <ModalShell onClose={onClose}>
      <div className="flex items-start justify-between gap-3 border-b border-border px-4 py-3">
        <div>
          <h2 className="font-display text-lg font-semibold">
            {frozen ? t("Closed day sheet", "የተዘጋ የቀን ሉህ") : t("Day sales sheet", "የቀን ሽያጭ ሉህ")}
          </h2>
          <p className="text-sm text-muted-foreground">
            {waiterName} · {sheet.date}
          </p>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="size-8 grid place-items-center rounded-lg hover:bg-surface-2"
        >
          <Icons.X className="size-4" />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto px-4 py-4">
        <div className="text-center">
          <div className="text-sm font-semibold">{heading}</div>
          <div className="text-sm text-muted-foreground">{branchName}</div>
          <div className="mt-1 text-sm font-medium">
            {frozen ? t("Closed", "ተዘግቷል") : t("Live", "ቀጥታ")}
          </div>
        </div>

        <div className="mt-4 grid grid-cols-2 gap-2">
          <div className="rounded-xl bg-surface-2 px-3 py-3">
            <div className="text-xs text-muted-foreground">{t("Collected", "የተሰበሰበ")}</div>
            <div className="mt-1 font-mono text-lg font-semibold">{money(summary.collectedSales)}</div>
          </div>
          <div className="rounded-xl bg-surface-2 px-3 py-3">
            <div className="text-xs text-muted-foreground">{t("Open bills", "ክፍት ሂሳቦች")}</div>
            <div className="mt-1 font-mono text-lg font-semibold">{money(summary.openBillValue)}</div>
            <div className="text-xs text-muted-foreground">{summary.openBills}</div>
          </div>
        </div>

        {tableGroups.length === 0 ? (
          <p className="mt-6 text-center text-sm text-muted-foreground">
            {t("No sales yet.", "ገና ሽያጭ የለም።")}
          </p>
        ) : (
          <div className="mt-5 space-y-4">
            {tableGroups.map((group) => (
              <div key={group.key}>
                <div className="flex items-baseline justify-between gap-2 border-b border-border pb-1">
                  <div className="font-display text-base font-semibold">{group.label}</div>
                  <div className="font-mono text-base font-semibold">{money(group.total)}</div>
                </div>
                <div className="mt-2 space-y-1.5">
                  {group.items.map((line) => (
                    <div key={line.name} className="flex justify-between gap-3 text-sm">
                      <span className="min-w-0">
                        {formatQty(line.qty)} {line.name}
                      </span>
                      <span className="shrink-0 font-mono">{money(line.amount)}</span>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="border-t border-border p-3">
        <button
          type="button"
          onClick={onClose}
          className="h-11 w-full rounded-xl border border-border text-sm font-semibold hover:bg-surface-2"
        >
          {t("Close", "ዝጋ")}
        </button>
      </div>
    </ModalShell>
  );
}

export function WaiterDashboard() {
  const { user, users } = useAuth();
  const lang = useLang();
  const t = (en: string, am: string) => (lang === "am" ? am : en);
  const store = useStore();
  const stockModule = useStockManagementModule();
  const { hidden: hideMoney, toggle: toggleHideMoney } = useHideMoney();
  const { records: waiterClosings, setRecords: setWaiterClosings } =
    useModuleRecords<WaiterClosingRecord>(WAITER_CLOSINGS_MODULE_KEY, EMPTY_MODULE_RECORDS);
  const [closingNote, setClosingNote] = useState("");
  const [closingBusy, setClosingBusy] = useState(false);
  const [transferOpen, setTransferOpen] = useState(false);
  const [transferTo, setTransferTo] = useState("");
  const [transferSelectedIds, setTransferSelectedIds] = useState<Set<string>>(new Set());
  const [transferBusy, setTransferBusy] = useState(false);
  const [closingBillOpen, setClosingBillOpen] = useState(false);
  const [returnOrder, setReturnOrder] = useState<Order | null>(null);
  const [returnReason, setReturnReason] = useState("");
  const [returnBusy, setReturnBusy] = useState(false);

  const todayClosing = useMemo(() => {
    if (!user) return null;
    return todayWaiterClosing(waiterClosings, user.name);
  }, [user, waiterClosings]);

  const closedToday = Boolean(user && hasWaiterClosedToday(waiterClosings, user.name));
  const branchPeriodStart = useMemo(
    () => resolveBranchDashboardPeriodStart(stockModule.closings),
    [stockModule.closings],
  );
  // Branch cash-up/closing resets every waiter's "today" KPIs; personal close still applies too.
  const sessionAfter = latestDashboardCutoff(
    branchPeriodStart,
    closedToday ? todayClosing?.closedAt : undefined,
  );

  const waiterSalesSlice = useMemo(() => {
    if (!user) {
      return buildDashboardTodaySlice([], [], [], stockModule.closings);
    }
    const mine = store.salesRecords.filter(
      (row) => row.waiter.trim().toLowerCase() === user.name.trim().toLowerCase(),
    );
    return buildDashboardTodaySlice(mine, [], [], stockModule.closings);
  }, [stockModule.closings, store.salesRecords, user]);

  const waiterDay = useMemo(() => {
    if (!user) return null;
    const summary = summarizeWaiterDay(
      store.orders,
      store.salesRecords,
      user.name,
      undefined,
      sessionAfter,
    );
    // Collected sales always follow the shared cash-up cutoff (same as cashier dashboard).
    return {
      ...summary,
      date: waiterSalesSlice.today,
      collectedSales: waiterSalesSlice.summary.revenue,
      collectedReceipts: waiterSalesSlice.summary.receipts,
      itemsSold: waiterSalesSlice.summary.qty,
    };
  }, [store.orders, store.salesRecords, user, sessionAfter, waiterSalesSlice]);

  const liveSheet = useMemo(() => {
    if (!user || !waiterDay) return null;
    return buildWaiterClosingSheet(
      store.orders,
      user.name,
      waiterDay.date,
      sessionAfter,
      store.salesRecords,
    );
  }, [store.orders, store.salesRecords, user, waiterDay, sessionAfter]);

  const displaySheet = useMemo(() => {
    if (closedToday && todayClosing?.sheet) return todayClosing.sheet;
    if (closedToday && user && waiterDay) {
      // Closed-day view: full day snapshot (not the post-close empty session).
      return buildWaiterClosingSheet(store.orders, user.name, waiterDay.date, undefined, store.salesRecords);
    }
    return liveSheet;
  }, [closedToday, todayClosing, liveSheet, store.orders, store.salesRecords, user, waiterDay]);

  const openBills = useMemo(() => {
    if (!user) return [];
    return openBillsOwnedByWaiter(store.orders, user.name);
  }, [store.orders, user]);

  const mySalesToday = useMemo(() => {
    if (!user) return [];
    const mine = store.salesRecords.filter(
      (row) =>
        row.date === (waiterSalesSlice.today || dateKey()) &&
        row.waiter.trim().toLowerCase() === user.name.trim().toLowerCase(),
    );
    // Prefer personal close cutoff when later; otherwise cash-up period from the shared slice.
    const cutoff = sessionAfter ?? waiterSalesSlice.periodStart;
    return filterSalesAfterDashboardPeriod(mine, cutoff);
  }, [store.salesRecords, user, waiterSalesSlice, sessionAfter]);

  const modalSummary: WaiterDaySummary | null = useMemo(() => {
    if (!waiterDay) return null;
    if (closedToday && todayClosing) {
      return {
        waiter: todayClosing.waiter,
        date: todayClosing.date,
        ordersCreated: todayClosing.ordersCreated,
        openBills: todayClosing.openBillsAtClose,
        openBillValue: todayClosing.openBillValue,
        grossSales: todayClosing.grossSales,
        collectedSales: todayClosing.collectedSales,
        collectedReceipts: todayClosing.sheet?.servedCount ?? waiterDay.collectedReceipts,
        voidsReturns: todayClosing.voidsReturns,
        itemsSold: todayClosing.sheet?.items.reduce((sum, line) => sum + line.qty, 0) ?? waiterDay.itemsSold,
      };
    }
    return waiterDay;
  }, [closedToday, todayClosing, waiterDay]);

  const topItems = useMemo(
    () => (user ? topSoldByWaiter(mySalesToday, user.name) : []),
    [mySalesToday, user],
  );

  const otherWaiters = useMemo(() => {
    if (!user) return [];
    return users
      .filter((staff) => staff.role === "Waiter" && !assignedWaiterMatches(staff.name, user))
      .map((staff) => staff.name)
      .sort((a, b) => a.localeCompare(b));
  }, [user, users]);

  if (!user || !waiterDay) return null;

  const money = (value: number) => formatDashboardMoney(value, hideMoney);
  const firstName = user.name.split(" ")[0] ?? user.name;

  const notifications = getNotificationsForUser(
    user,
    store.orders,
    stockModule.balances,
    stockModule.requests,
    stockModule.transfers,
    store.menuStations,
    store.menuItems,
    lang,
  );
  const alertCount = notifications.filter((item) => item.tone === "ember").length;

  const readyCount = store.orders.filter(
    (order) =>
      !isFinalOrderStatus(order.status) &&
      (assignedWaiterMatches(order.waiter, user) || assignedWaiterMatches(order.orderedByWaiter, user)) &&
      order.stationTickets.some((ticket) => ticket.status === "READY"),
  ).length;

  const quickLinks: QuickLink[] = [
    {
      to: "/app/tables",
      label: "Tables",
      labelAm: "ጠረጴዛዎች",
      icon: "LayoutGrid",
    },
    {
      to: "/app/orders",
      label: "Orders",
      labelAm: "ትዕዛዞች",
      icon: "ClipboardList",
      badge: openBills.length || undefined,
    },
    {
      to: "/app/staff-sales",
      label: "My sales",
      labelAm: "ሽያጬ",
      icon: "Wallet",
    },
    {
      to: "/app/notifications",
      label: "Alerts",
      labelAm: "ማሳወቂያ",
      icon: "BellRing",
      badge: alertCount || undefined,
      tone: alertCount > 0 ? "ember" : "default",
    },
    {
      to: "/app/qr-scanner",
      label: "QR scan",
      labelAm: "QR ስካን",
      icon: "ScanQrCode",
    },
    {
      to: "/app/reservations",
      label: "Reservations",
      labelAm: "ቦታ ማስያዝ",
      icon: "CalendarClock",
    },
  ];

  function submitWaiterClosing() {
    const blockers = waiterClosingBlockers(store.orders, user.name);
    if (blockers.length > 0) {
      showError(
        t(
          "Transfer or settle open bills before closing.",
          "ከመዝጋት በፊት ክፍት ሂሳቦችን ያስተላልፉ ወይም ይክፈሉ።",
        ),
      );
      return;
    }
    if (closedToday) {
      showError(t("Already closed for today.", "ለዛሬ አስቀድሞ ተዘግቷል።"));
      return;
    }
    setClosingBusy(true);
    try {
      const sheet = buildWaiterClosingSheet(
        store.orders,
        user.name,
        waiterDay.date,
        undefined,
        store.salesRecords,
      );
      const record = buildWaiterClosingRecord(waiterDay, closingNote, sheet);
      setWaiterClosings((prev) => {
        const without = prev.filter((row) => row.id !== record.id);
        return [record, ...without];
      });
      setClosingNote("");
      showSuccess(t("Daily closing saved.", "ዕለታዊ መዝጊያ ተቀምጧል።"));
    } finally {
      setClosingBusy(false);
    }
  }

  function openBillTransfer() {
    setTransferTo(otherWaiters[0] ?? "");
    setTransferSelectedIds(new Set(openBills.map((order) => order.id)));
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
    if (!transferTo.trim()) {
      showError(t("Select a waiter.", "አስተናጋጅ ይምረጡ።"));
      return;
    }
    const selected = [...transferSelectedIds];
    if (selected.length === 0) {
      showError(t("Select at least one bill.", "ቢያንስ አንድ ሂሳብ ይምረጡ።"));
      return;
    }
    setTransferBusy(true);
    try {
      const result = store.requestWaiterBillTransfer(user.name, transferTo, user.name, selected);
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
    } finally {
      setTransferBusy(false);
    }
  }

  function openReturn(order: Order) {
    if (!canRequestReturnOrder(order)) return;
    setReturnOrder(order);
    setReturnReason("");
  }

  function submitReturn() {
    if (!user || !returnOrder) return;
    if (!returnReason.trim()) {
      showError(t("Enter a return reason.", "የመልስ ምክንያት ያስገቡ።"));
      return;
    }
    setReturnBusy(true);
    try {
      const returnLines = returnOrder.items.map((line, index) => ({ index, qty: line.qty }));
      store.requestReturnOrder(returnOrder.id, user.name, returnReason.trim(), returnLines);
      showSuccess(t("Return request sent to manager.", "የመልስ ጥያቄ ለሥራ አስኪያጅ ተልኳል።"));
      setReturnOrder(null);
      setReturnReason("");
    } finally {
      setReturnBusy(false);
    }
  }

  return (
    <div className="min-w-0 space-y-3 pb-6">
      <PageHeader
        title={`${t("Good evening", "እንኳን ደህና ዋሉ")}, ${firstName}`}
        subtitle={user.branch}
        action={
          <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row sm:items-center">
            <MoneyVisibilityToggle hidden={hideMoney} onToggle={toggleHideMoney} t={t} />
            <button
              type="button"
              onClick={() => setClosingBillOpen(true)}
              className="inline-flex h-9 w-full items-center justify-center gap-2 rounded-lg border border-border bg-card px-3 text-sm font-medium hover:bg-surface-2 sm:w-auto"
            >
              <Icons.Receipt className="size-4" />
              {t("Day sales sheet", "የቀን ሽያጭ ሉህ")}
            </button>
            <Link
              to="/app/pos"
              search={EMPTY_POS_SEARCH}
              className="inline-flex h-9 w-full items-center justify-center gap-2 rounded-lg bg-ember px-3 text-sm font-medium text-ember-foreground shadow-[var(--shadow-glow)] sm:w-auto"
            >
              <Icons.PlusCircle className="size-4" />
              {t("New order / POS", "አዲስ ትዕዛዝ / POS")}
            </Link>
          </div>
        }
      />

      <div className="grid grid-cols-2 gap-2 sm:gap-3 xl:grid-cols-4">
        <Stat
          label={t("Collected", "የተሰበሰበ")}
          value={money(waiterDay.collectedSales)}
          tone="ember"
          icon="Wallet"
        />
        <Stat
          label={t("Open bills", "ክፍት ሂሳቦች")}
          value={`${waiterDay.openBills} · ${money(waiterDay.openBillValue)}`}
          tone="gold"
          icon="Receipt"
          to="/app/pos"
          search={EMPTY_POS_SEARCH}
        />
        <Stat
          label={t("Orders", "ትዕዛዞች")}
          value={String(waiterDay.ordersCreated)}
          hint={`${waiterDay.itemsSold} ${t("items", "እቃዎች")}`}
          tone="teff"
          icon="ClipboardList"
          to="/app/orders"
        />
        <button
          type="button"
          onClick={() => setClosingBillOpen(true)}
          className="surface-card group min-w-0 overflow-hidden !p-2.5 text-left transition-all duration-200 hover:-translate-y-0.5 hover:border-ember/35 hover:shadow-[var(--shadow-lift)] sm:!p-3"
        >
          <div className="flex items-start justify-between gap-2 min-w-0">
            <div className="min-w-0 flex-1">
              <div className="text-[11px] uppercase tracking-wide text-muted-foreground sm:text-xs">
                {t("Day sales sheet", "የቀን ሽያጭ ሉህ")}
              </div>
              <div className="mt-0.5 font-display text-lg font-semibold sm:text-xl">
                {closedToday ? t("Closed", "ተዘግቷል") : t("Live", "ቀጥታ")}
              </div>
              <div className="mt-0.5 text-[11px] text-muted-foreground sm:text-xs">
                {readyCount > 0
                  ? `${readyCount} ${t("ready", "ዝግጁ")}`
                  : t("Open receipt", "ደረሰኝ ክፈት")}
              </div>
            </div>
            <div className="grid size-7 shrink-0 place-items-center rounded-lg bg-ember/10 text-ember sm:size-8">
              <Icons.FileText className="size-3.5 sm:size-4" />
            </div>
          </div>
        </button>
      </div>

      <section>
        <h2 className="mb-2 text-sm font-semibold">{t("Quick access", "ፈጣን መዳረሻ")}</h2>
        <div className="grid grid-cols-3 gap-2 sm:grid-cols-6">
          {quickLinks.map((link) => {
            const Icon = Icons[link.icon] as ComponentType<{ className?: string }>;
            return (
              <Link
                key={link.to}
                to={link.to}
                className={`relative flex min-h-16 flex-col items-center justify-center gap-1.5 rounded-xl border px-2 py-3 text-center transition hover:bg-surface-2 sm:min-h-[4.5rem] ${
                  link.tone === "ember"
                    ? "border-ember/30 bg-ember/10 text-ember"
                    : "border-border bg-card"
                }`}
              >
                {link.badge ? (
                  <span className="absolute right-1.5 top-1.5 inline-flex min-w-5 items-center justify-center rounded-full bg-ember px-1.5 text-[10px] font-semibold text-ember-foreground">
                    {link.badge}
                  </span>
                ) : null}
                <Icon className="size-4 sm:size-5" />
                <span className="text-[11px] font-medium leading-tight sm:text-xs">
                  {t(link.label, link.labelAm)}
                </span>
              </Link>
            );
          })}
        </div>
      </section>

      <div className="grid gap-3 lg:grid-cols-2 lg:items-start">
      <Card className="!p-0 overflow-hidden">
        <div className="flex items-center justify-between gap-2 border-b border-border px-3 py-2.5 sm:px-4">
          <h2 className="font-display text-base font-semibold">
            {t("My open bills", "የእኔ ክፍት ሂሳቦች")}
          </h2>
          <div className="flex items-center gap-2">
            {openBills.length > 0 ? (
              <button
                type="button"
                onClick={openBillTransfer}
                className="inline-flex h-8 items-center gap-1 rounded-lg border border-border px-2.5 text-xs font-medium hover:bg-surface-2"
              >
                <Icons.ArrowRightLeft className="size-3.5" />
                {t("Transfer", "አስተላልፍ")}
              </button>
            ) : null}
            <Chip tone={openBills.length > 0 ? "gold" : "muted"}>{openBills.length}</Chip>
          </div>
        </div>
        <div className="divide-y divide-border">
          {openBills.slice(0, 8).map((order) => (
            <div
              key={order.id}
              className="flex items-center gap-3 px-3 py-3 sm:px-4"
            >
              <Link
                to="/app/pos"
                search={{ ...EMPTY_POS_SEARCH, orderId: order.id }}
                className="flex min-w-0 flex-1 items-center gap-3 transition hover:opacity-90"
              >
                <div className="grid size-11 shrink-0 place-items-center rounded-xl bg-surface-2 font-display text-sm font-semibold">
                  {order.tableNumber}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <span className="truncate font-mono text-sm font-semibold">{order.orderNo}</span>
                    <Chip tone={orderStatusTone(order)}>{order.paymentStatus}</Chip>
                    {order.returnRequestedBy ? (
                      <Chip tone="gold">{t("Return pending", "መልስ እየጠበቀ")}</Chip>
                    ) : null}
                  </div>
                  <div className="mt-0.5 truncate text-xs text-muted-foreground">
                    {order.area}
                    {order.stationTickets.some((ticket) => ticket.status === "READY")
                      ? ` · ${t("Ready", "ዝግጁ")}`
                      : ""}
                  </div>
                </div>
                <div className="shrink-0 text-right">
                  <div className="font-mono text-sm font-semibold">{money(order.total)}</div>
                </div>
              </Link>
              {canRequestReturnOrder(order) ? (
                <button
                  type="button"
                  onClick={() => openReturn(order)}
                  className="inline-flex h-9 shrink-0 items-center gap-1 rounded-lg border border-border px-2.5 text-xs font-medium hover:bg-surface-2"
                >
                  <Icons.RotateCcw className="size-3.5" />
                  {t("Return", "መልስ")}
                </button>
              ) : null}
            </div>
          ))}
          {openBills.length === 0 && (
            <div className="px-3 py-8 text-center text-sm text-muted-foreground sm:px-4">
              {t("No open bills.", "ክፍት ሂሳብ የለም።")}
            </div>
          )}
        </div>
        {openBills.length > 8 ? (
          <div className="border-t border-border p-2">
            <Link
              to="/app/orders"
              className="flex h-10 items-center justify-center rounded-lg text-sm font-medium text-ember hover:bg-ember/5"
            >
              {t("View all orders", "ሁሉንም ትዕዛዞች ይመልከቱ")}
            </Link>
          </div>
        ) : null}
      </Card>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-1">
        <Card className="min-w-0 !p-0 overflow-hidden">
          <div className="flex items-center justify-between gap-2 border-b border-border px-3 py-2.5 sm:px-4">
            <h2 className="font-display text-base font-semibold">
              {t("My sales today", "የዛሬ ሽያጬ")}
            </h2>
            <Link to="/app/staff-sales" className="text-xs font-medium text-ember hover:underline">
              {t("Details", "ዝርዝር")}
            </Link>
          </div>
          <div className="grid grid-cols-2 gap-2 p-3 sm:p-4">
            <div className="rounded-xl bg-surface-2 p-3">
              <div className="text-[11px] text-muted-foreground">{t("Collected", "የተሰበሰበ")}</div>
              <div className="mt-1 break-words font-mono text-sm font-semibold">
                {money(waiterDay.collectedSales)}
              </div>
            </div>
            <div className="rounded-xl bg-surface-2 p-3">
              <div className="text-[11px] text-muted-foreground">{t("Receipts", "ደረሰኞች")}</div>
              <div className="mt-1 font-mono text-sm font-semibold">{waiterDay.collectedReceipts}</div>
            </div>
            <div className="rounded-xl bg-surface-2 p-3">
              <div className="text-[11px] text-muted-foreground">{t("Gross ordered", "ጠቅላላ ትዕዛዝ")}</div>
              <div className="mt-1 break-words font-mono text-sm font-semibold">
                {money(waiterDay.grossSales)}
              </div>
            </div>
            <div className="rounded-xl bg-surface-2 p-3">
              <div className="text-[11px] text-muted-foreground">{t("Voids / returns", "ሰርዞች / መልሶች")}</div>
              <div className="mt-1 break-words font-mono text-sm font-semibold">
                {money(waiterDay.voidsReturns)}
              </div>
            </div>
          </div>
          {topItems.length > 0 ? (
            <div className="border-t border-border px-3 py-2 sm:px-4">
              <div className="mb-1.5 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                {t("Top items", "ከፍተኛ እቃዎች")}
              </div>
              <div className="space-y-1.5">
                {topItems.map((item) => (
                  <div key={item.name} className="flex items-center justify-between gap-2 text-sm">
                    <span className="min-w-0 truncate">{item.name}</span>
                    <span className="shrink-0 font-mono text-xs text-muted-foreground">
                      {item.qty} · {money(item.revenue)}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          ) : null}
        </Card>

        <Card className="min-w-0">
          <div className="mb-3 flex items-center justify-between gap-2">
            <h2 className="font-display text-base font-semibold">
              {t("Daily closing", "ዕለታዊ መዝጊያ")}
            </h2>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setClosingBillOpen(true)}
                className="text-xs font-medium text-ember hover:underline"
              >
                {t("Sheet", "ሉህ")}
              </button>
              <Chip tone={closedToday ? "teff" : "gold"}>
                {closedToday ? t("Closed", "ተዘግቷል") : t("Pending", "እየጠበቀ")}
              </Chip>
            </div>
          </div>

          {closedToday && todayClosing ? (
            <div className="space-y-2 text-sm">
              <div className="flex justify-between gap-2">
                <span className="text-muted-foreground">{t("Closed at", "የተዘጋበት ሰዓት")}</span>
                <span className="font-mono text-xs">
                  {new Date(todayClosing.closedAt).toLocaleTimeString()}
                </span>
              </div>
              <div className="flex justify-between gap-2">
                <span className="text-muted-foreground">{t("Collected sales", "የተሰበሰበ ሽያጭ")}</span>
                <span className="font-mono font-semibold">{money(todayClosing.collectedSales)}</span>
              </div>
              <div className="flex justify-between gap-2">
                <span className="text-muted-foreground">{t("Orders", "ትዕዛዞች")}</span>
                <span className="font-mono font-semibold">{todayClosing.ordersCreated}</span>
              </div>
            </div>
          ) : (
            <div className="space-y-3">
              {waiterDay.openBills > 0 ? (
                <p className="text-xs text-muted-foreground">
                  {t(
                    `${waiterDay.openBills} open bill(s)`,
                    `${waiterDay.openBills} ክፍት ሂሳብ(ዎች)`,
                  )}
                </p>
              ) : null}
              <input
                value={closingNote}
                onChange={(event) => setClosingNote(event.target.value)}
                placeholder={t("Optional note", "አማራጭ ማስታወሻ")}
                className="h-11 w-full rounded-xl border border-border bg-card px-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring/40"
              />
              <div className="grid grid-cols-1 gap-2 min-[380px]:grid-cols-2">
                <button
                  type="button"
                  onClick={openBillTransfer}
                  disabled={waiterDay.openBills === 0 || otherWaiters.length === 0}
                  className="inline-flex h-11 items-center justify-center gap-1.5 rounded-xl border border-border px-3 text-sm font-medium hover:bg-surface-2 disabled:opacity-40"
                >
                  <Icons.ArrowRightLeft className="size-4" />
                  {t("Transfer bills", "ሂሳቦችን አስተላልፍ")}
                </button>
                <button
                  type="button"
                  onClick={submitWaiterClosing}
                  disabled={closingBusy || waiterDay.openBills > 0}
                  className="inline-flex h-11 items-center justify-center gap-1.5 rounded-xl bg-ember px-3 text-sm font-semibold text-ember-foreground disabled:opacity-40"
                >
                  <Icons.Lock className="size-4" />
                  {t("Close my day", "ቀኔን ዝጋ")}
                </button>
              </div>
            </div>
          )}
        </Card>
      </div>
      </div>

      {/* Alerts */}
      <Card className="!p-0 overflow-hidden">
        <div className="flex items-center justify-between gap-2 border-b border-border px-3 py-2.5 sm:px-4">
          <h2 className="font-display text-base font-semibold">
            {t("My alerts", "የእኔ ማሳወቂያዎች")}
          </h2>
          <Link to="/app/notifications" className="text-xs font-medium text-ember hover:underline">
            {t("All", "ሁሉም")}
          </Link>
        </div>
        <div className="divide-y divide-border">
          {notifications.slice(0, 4).map((item) => (
            <Link
              key={item.id}
              to={item.href}
              className="flex items-start gap-3 px-3 py-3 transition hover:bg-surface-2 active:bg-accent sm:px-4"
            >
              <div className="mt-0.5 grid size-9 shrink-0 place-items-center rounded-lg bg-ember/10 text-ember">
                <Icons.BellRing className="size-4" />
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-1.5">
                  <span className="text-sm font-semibold">{item.title}</span>
                  <Chip tone={item.tone}>{item.orderNo}</Chip>
                </div>
              </div>
              <Icons.ChevronRight className="mt-1 size-4 shrink-0 text-muted-foreground" />
            </Link>
          ))}
          {notifications.length === 0 && (
            <div className="px-3 py-8 text-center text-sm text-muted-foreground sm:px-4">
              {t("No alerts.", "ማሳወቂያ የለም።")}
            </div>
          )}
        </div>
      </Card>

      {transferOpen ? (
        <div className="fixed inset-0 z-50 grid place-items-center bg-foreground/40 p-4 backdrop-blur-sm">
          <div className="surface-card w-full max-w-md space-y-4 !p-5">
            <div className="flex items-start justify-between gap-3">
              <h3 className="font-display text-lg font-semibold">
                {t("Transfer open bills", "ክፍት ሂሳቦችን አስተላልፍ")}
              </h3>
              <button
                type="button"
                onClick={() => setTransferOpen(false)}
                className="grid size-8 place-items-center rounded-lg hover:bg-surface-2"
                aria-label={t("Close", "ዝጋ")}
              >
                <Icons.X className="size-4" />
              </button>
            </div>
            <p className="text-sm text-muted-foreground">
              {t(
                "This sends a transfer request to the cashier or manager. Bills stay with you until they approve.",
                "ይህ የማስተላለፊያ ጥያቄ ለካሸር ወይም ሥራ አስኪያጅ ይልካል። እስኪያፀድቁ ድረስ ሂሳቦቹ ከእርስዎ ጋር ይቆያሉ።",
              )}
            </p>
            <div className="text-sm">
              {t("From", "ከ")}: <span className="font-semibold">{user.name}</span>
            </div>
            <div>
              <label className="text-xs text-muted-foreground">{t("To waiter", "ወደ አስተናጋጅ")}</label>
              <select
                value={transferTo}
                onChange={(event) => setTransferTo(event.target.value)}
                className="mt-1 h-11 w-full rounded-xl border border-border bg-card px-3 text-sm"
              >
                {otherWaiters.length === 0 ? (
                  <option value="">{t("No other waiters", "ሌላ አስተናጋጅ የለም")}</option>
                ) : (
                  otherWaiters.map((name) => (
                    <option key={name} value={name}>
                      {name}
                    </option>
                  ))
                )}
              </select>
            </div>
            <div className="max-h-48 space-y-1 overflow-y-auto rounded-xl border border-border p-2">
              {openBills.length === 0 ? (
                <div className="py-4 text-center text-sm text-muted-foreground">
                  {t("No open bills.", "ክፍት ሂሳብ የለም።")}
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
                        if (transferSelectedIds.size === openBills.length) {
                          setTransferSelectedIds(new Set());
                        } else {
                          setTransferSelectedIds(new Set(openBills.map((order) => order.id)));
                        }
                      }}
                    >
                      {transferSelectedIds.size === openBills.length
                        ? t("Clear", "አጽዳ")
                        : t("Select all", "ሁሉንም ምረጥ")}
                    </button>
                  </div>
                  {openBills.map((order) => {
                    const checked = transferSelectedIds.has(order.id);
                    const pending = Boolean(order.waiterTransferRequestedTo);
                    return (
                      <label
                        key={order.id}
                        className={`flex cursor-pointer items-center gap-2 rounded-lg px-2 py-1.5 text-sm hover:bg-surface-2 ${
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
                        <span className="font-mono text-xs">{money(order.total)}</span>
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
                className="h-11 flex-1 rounded-xl border border-border text-sm font-medium hover:bg-surface-2"
              >
                {t("Cancel", "ሰርዝ")}
              </button>
              <button
                type="button"
                onClick={submitBillTransfer}
                disabled={transferBusy || !transferTo || transferSelectedIds.size === 0}
                className="h-11 flex-1 rounded-xl bg-ember text-sm font-semibold text-ember-foreground disabled:opacity-40"
              >
                {t("Request transfer", "ማስተላለፍ ጠይቅ")}
                {transferSelectedIds.size > 0 ? ` (${transferSelectedIds.size})` : ""}
              </button>
            </div>
          </div>
        </div>
      ) : null}
      {returnOrder ? (
        <div className="fixed inset-0 z-50 grid place-items-center bg-foreground/40 p-4 backdrop-blur-sm">
          <div className="surface-card w-full max-w-md space-y-4 !p-5">
            <div className="flex items-start justify-between gap-3">
              <h3 className="font-display text-lg font-semibold">
                {t("Return order", "ትዕዛዝ መልስ")} · {returnOrder.orderNo}
              </h3>
              <button
                type="button"
                onClick={() => setReturnOrder(null)}
                className="grid size-8 place-items-center rounded-lg hover:bg-surface-2"
                aria-label={t("Close", "ዝጋ")}
              >
                <Icons.X className="size-4" />
              </button>
            </div>
            <p className="text-sm text-muted-foreground">
              {t(
                "This sends a return request to the manager. The bill stays until they approve.",
                "ይህ የመልስ ጥያቄ ለሥራ አስኪያጅ ይልካል። እስኪያፀድቁ ድረስ ሂሳቡ ይቆያል።",
              )}
            </p>
            <div>
              <label className="text-xs text-muted-foreground">{t("Reason", "ምክንያት")}</label>
              <textarea
                value={returnReason}
                onChange={(event) => setReturnReason(event.target.value)}
                rows={3}
                className="mt-1 w-full rounded-xl border border-border bg-card px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring/40"
                placeholder={t("Why is this order being returned?", "ይህ ትዕዛዝ ለምን ይመለሳል?")}
              />
            </div>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setReturnOrder(null)}
                className="h-11 flex-1 rounded-xl border border-border text-sm font-medium hover:bg-surface-2"
              >
                {t("Cancel", "ሰርዝ")}
              </button>
              <button
                type="button"
                onClick={submitReturn}
                disabled={returnBusy || !returnReason.trim()}
                className="h-11 flex-1 rounded-xl bg-ember text-sm font-semibold text-ember-foreground disabled:opacity-40"
              >
                {t("Request return", "መልስ ጠይቅ")}
              </button>
            </div>
          </div>
        </div>
      ) : null}
      {closingBillOpen && modalSummary ? (
        <WaiterClosingBillModal
          restaurantName={store.restaurantProfile?.name ?? ""}
          branchName={user.branch}
          waiterName={user.name}
          summary={modalSummary}
          sheet={
            displaySheet ??
            buildWaiterClosingSheet(
              store.orders,
              user.name,
              waiterDay.date,
              sessionAfter,
              store.salesRecords,
            )
          }
          frozen={closedToday}
          hideMoney={hideMoney}
          onClose={() => setClosingBillOpen(false)}
        />
      ) : null}
    </div>
  );
}
