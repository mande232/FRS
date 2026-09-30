import { createFileRoute, Link } from "@tanstack/react-router";
import * as Icons from "lucide-react";
import { useState, useMemo, useRef, useEffect } from "react";
import { Bar, BarChart, CartesianGrid, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { WaiterDashboard } from "@/components/dashboard/waiter-dashboard";
import { CashierDashboard } from "@/components/dashboard/cashier-dashboard";
import { Card, Chip, PageHeader, Stat } from "@/components/ui-kit";
import {
  formatDashboardMoney,
  MoneyVisibilityToggle,
  useHideMoney,
} from "@/lib/dashboard-privacy";
import { BRANCHES, isFinalOrderStatus } from "@/lib/demo-data";
import { useAuth } from "@/lib/auth-context";
import { useLang } from "@/lib/lang-context";
import { useStore } from "@/lib/store";
import { assignedWaiterMatches } from "@/lib/waiter-identity";
import { resolveBranchDashboardPeriodStart, useStockManagementModule } from "@/lib/stock-management";
import { isOrderToday } from "@/lib/orders-ops";
import {
  barScopeFromUser,
  getNotificationsForUser,
  isOperationalDashboardRole,
  orderMatchesBarScope,
  stationsForRole,
} from "@/lib/notifications";
import { resolveUserAssignedLocations } from "@/lib/inventory-access";
import { orderLineName } from "@/lib/i18n";
import { EMPTY_MODULE_RECORDS, useModuleRecords } from "@/lib/module-records";
import { showError, showSuccess } from "@/lib/toast";
import {
  WAITER_CLOSINGS_MODULE_KEY,
  buildWaiterClosingRecord,
  hasWaiterClosedToday,
  summarizeWaiterDay,
  todayWaiterClosing,
  waiterClosingBlockers,
  type WaiterClosingRecord,
} from "@/lib/waiter-ops";
import {
  buildDashboardTodaySlice,
  dateKey,
  filterExpensesByDate,
  filterPaymentsAfterDashboardPeriod,
  filterPaymentsByDate,
  filterSalesAfterDashboardPeriod,
  filterSalesByDate,
  filterSalesForOperationalLocations,
  groupSalesByHour,
  groupPaymentsByHour,
  groupSalesByProduct,
  groupSalesByStation,
  paymentDateKey,
  summarizeSales,
  summarizeSalesWithPayments,
} from "@/lib/sales-analytics";

export const Route = createFileRoute("/app/")({ component: Dashboard });

const EMPTY_POS_SEARCH = {
  table: undefined,
  area: undefined,
  waiter: undefined,
  orderId: undefined,
  mode: undefined,
} as const;

function useLazyVisible(rootMargin = "100px") {
  const ref = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      ([entry]) => { if (entry.isIntersecting) { setVisible(true); observer.disconnect(); } },
      { rootMargin }
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [rootMargin]);
  return { ref, visible };
}

function LazySection({ children, className }: { children: React.ReactNode; className?: string }) {
  const { ref, visible } = useLazyVisible();
  return (
    <div ref={ref} className={className}>
      {visible ? children : <div className="h-28 rounded-xl bg-surface-2 animate-pulse" />}
    </div>
  );
}

function groupSalesByStaff(records: Array<{ waiter: string; revenue: number; qty: number }>) {
  const rows = new Map<string, { name: string; revenue: number; qty: number }>();
  records.forEach((record) => {
    const name = record.waiter.trim() || "Unassigned";
    const current = rows.get(name) ?? { name, revenue: 0, qty: 0 };
    current.revenue += record.revenue;
    current.qty += record.qty;
    rows.set(name, current);
  });
  return Array.from(rows.values()).sort((a, b) => b.revenue - a.revenue);
}

function CashierHome() {
  const [isMobile, setIsMobile] = useState(() =>
    typeof window !== "undefined" ? window.matchMedia("(max-width: 1023px)").matches : true,
  );

  useEffect(() => {
    const media = window.matchMedia("(max-width: 1023px)");
    const onChange = () => setIsMobile(media.matches);
    onChange();
    media.addEventListener("change", onChange);
    return () => media.removeEventListener("change", onChange);
  }, []);

  return isMobile ? <CashierDashboard /> : <MainDashboard />;
}

function Dashboard() {
  const { user } = useAuth();

  if (user && user.role === "Waiter") {
    return <WaiterDashboard />;
  }

  if (user && user.role === "Cashier") {
    // One dashboard only — mounting both mobile+desktop used to run stock hooks twice.
    return <CashierHome />;
  }

  if (user && isOperationalDashboardRole(user.role)) {
    return <OperationsDashboard />;
  }

  return <MainDashboard />;
}

function MainDashboard() {
  const { user } = useAuth();
  const lang = useLang();
  const t = (en: string, am: string) => (lang === "am" ? am : en);
  const store = useStore();
  const stockModule = useStockManagementModule();
  const [dashTab, setDashTab] = useState<"all" | "sales" | "stock" | "floor">("all");
  const { hidden: hideMoney, toggle: toggleHideMoney } = useHideMoney();
  const money = (value: number) => formatDashboardMoney(value, hideMoney);

  if (!user) return null;

  const todaySlice = buildDashboardTodaySlice(
    store.salesRecords,
    store.expenseRecords,
    store.payments,
    stockModule.closings,
  );
  const dailySales = todaySlice.sales;
  const dailySummary = todaySlice.summary;
  // Calendar today only — match Orders page; closing reset applies to sales KPIs, not order count.
  const todayOrders = store.orders.filter((order) => isOrderToday(order));
  const topItems = groupSalesByProduct(dailySales);
  const topStations = groupSalesByStation(dailySales);
  const topStaff = groupSalesByStaff(dailySales);
  const orderCount = todayOrders.length || dailySummary.receipts || 1;
  const averageOrderValue = dailySummary.revenue / orderCount;
  const firstName = user?.name.split(" ")[0] ?? t("there", "እዚህ");
  const activeOrders = store.orders.filter((order) => !isFinalOrderStatus(order.status));
  const showSales = dashTab === "all" || dashTab === "sales";
  const showStock = dashTab === "all" || dashTab === "stock";
  const showFloor = dashTab === "all" || dashTab === "floor";

  const tabs = [
    { id: "all" as const, label: t("All", "ሁሉም"), icon: Icons.LayoutGrid },
    { id: "sales" as const, label: t("Sales", "ሽያጭ"), icon: Icons.TrendingUp },
    { id: "stock" as const, label: t("Stock", "ክምችት"), icon: Icons.Package },
    { id: "floor" as const, label: t("Floor", "ወለል"), icon: Icons.ClipboardList },
  ];

  return (
    <div className="min-w-0 space-y-3">
      <PageHeader
        title={`${t("Good evening", " እንደምን ዋሉ")}, ${firstName}`}
        action={
          <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row">
            <MoneyVisibilityToggle hidden={hideMoney} onToggle={toggleHideMoney} t={t} />
            <Link
              to="/app/reports"
              className="inline-flex h-9 w-full items-center justify-center gap-2 rounded-lg border border-border bg-card px-3 text-sm font-medium hover:bg-surface-2 sm:w-auto"
            >
              <Icons.BarChart3 className="size-4" />
              {t("Reports", "ሪፖርቶች")}
            </Link>
            <Link
              to="/app/pos"
              search={EMPTY_POS_SEARCH}
              className="inline-flex h-9 w-full items-center justify-center gap-2 rounded-lg bg-ember px-3 text-sm font-medium text-ember-foreground shadow-[var(--shadow-glow)] transition-transform active:scale-[0.98] sm:w-auto"
            >
              <Icons.Plus className="size-4" />
              {t("New Order", "አዲስ ትዕዛዝ")}
            </Link>
          </div>
        }
      />

      <div className="-mx-1 flex gap-1.5 overflow-x-auto px-1 pb-0.5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {tabs.map((tab) => {
          const Icon = tab.icon;
          const active = dashTab === tab.id;
          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => setDashTab(tab.id)}
              className={`inline-flex h-8 shrink-0 items-center gap-1.5 rounded-full border px-3 text-xs font-medium transition-all ${
                active
                  ? "border-ember bg-ember text-ember-foreground shadow-[var(--shadow-soft)]"
                  : "border-border bg-card text-muted-foreground hover:bg-surface-2 hover:text-foreground"
              }`}
            >
              <Icon className="size-3.5" />
              {tab.label}
            </button>
          );
        })}
      </div>

      {/* Sales KPIs */}
      {showSales ? (
      <div className="grid grid-cols-2 gap-2 sm:gap-3 xl:grid-cols-4">
        <Stat
          label={t("Today's Sales", "የዛሬ ሽያጭ")}
          value={money(dailySummary.revenue)}
          tone="ember"
          icon="TrendingUp"
          to="/app/reports"
        />
        <Stat
          label={t("Orders", "ትዕዛዞች")}
          value={String(todayOrders.length)}
          tone="teff"
          icon="ShoppingBag"
          to="/app/orders"
        />
        <Stat
          label={t("Profit", "ትርፍ")}
          value={money(dailySummary.profit)}
          tone="gold"
          icon="BadgeDollarSign"
          to="/app/reports"
        />
        <Stat
          label={t("AOV", "አማካኝ የትዕዛዝ ዋጋ")}
          value={money(averageOrderValue)}
          icon="Receipt"
          to="/app/payments"
        />
      </div>
      ) : null}

      {/* Stock KPIs */}
      {showStock ? (
      <LazySection>
      <div className="grid grid-cols-2 gap-2 sm:gap-3 xl:grid-cols-4">
        <Stat
          label={t("Inventory Value", "የክምችት ዋጋ")}
          value={money(stockModule.dashboard.totalInventoryValue)}
          tone="ember"
          icon="Wallet"
          to="/app/stock-management"
        />
        <Stat
          label={t("Low Stock Items", "ዝቅተኛ ክምችት")}
          value={String(stockModule.dashboard.lowStockItems.length)}
          tone="gold"
          icon="AlertTriangle"
          to="/app/stock-management"
        />
        <Stat
          label={t("Negative Stock", "አሉታዊ ክምችት")}
          value={String(stockModule.dashboard.negativeStockItems.length)}
          tone="destructive"
          icon="CircleAlert"
          to="/app/stock-management"
        />
        <Stat
          label={t("Today's Purchases", "ዛሬ ግዢዎች")}
          value={money(stockModule.dashboard.todayPurchases)}
          tone="teff"
          icon="PackagePlus"
          to="/app/stock-management"
        />
      </div>
      </LazySection>
      ) : null}

      {/* Stock detail cards */}
      {showStock ? (
      <LazySection>
      <div className="grid gap-3 xl:grid-cols-2">
        <Card className="min-w-0">
          <div className="mb-2.5 flex items-center justify-between gap-2">
            <div className="min-w-0">
              <h3 className="font-display text-base font-semibold">{t("Low stock alerts", "ዝቅተኛ ክምችት ማስጠንቀቂያ")}</h3>
            </div>
            <Link to="/app/stock-management" search={{ workspace: "all" }} className="shrink-0 text-[11px] font-medium text-ember hover:underline">
              {t("Manage stock →", "ክምችት ያስተዳድሩ →")}
            </Link>
          </div>
          <div className="space-y-1.5">
            {stockModule.dashboard.lowStockItems.slice(0, 6).map((row) => (
              <Link
                key={`${row.itemId}-${row.location}`}
                to="/app/stock-management"
                search={{ workspace: "all" }}
                className="flex items-center justify-between gap-2 rounded-lg bg-surface-2 px-2.5 py-2 transition-all hover:bg-accent active:scale-[0.99]"
              >
                <div className="min-w-0 flex-1">
                  <div className="truncate font-medium text-sm">{row.itemName}</div>
                  <div className="text-[11px] text-muted-foreground">{row.location} · {row.category}</div>
                </div>
                <div className="shrink-0 text-right">
                  <div className="font-mono text-sm font-semibold">{row.quantity} <span className="text-[11px] font-normal text-muted-foreground">{row.unit}</span></div>
                  <div className="text-[11px] text-muted-foreground">{t("Reorder", "ዳግም ትዕዛዝ")}: {row.reorderLevel}</div>
                </div>
              </Link>
            ))}
            {stockModule.dashboard.lowStockItems.length === 0 && (
              <div className="grid h-16 place-items-center rounded-lg bg-surface-2 text-sm text-muted-foreground">
                {t("No low stock.", "ዝቅተኛ ክምችት የለም።")}
              </div>
            )}
          </div>
        </Card>

        <Card className="min-w-0">
          <div className="mb-2.5 flex items-center justify-between gap-2">
            <div className="min-w-0">
              <h3 className="font-display text-base font-semibold">{t("Top selling stock", "ምርጥ የሚሸጡ ክምችቶች")}</h3>
            </div>
            <Chip tone="teff">{stockModule.dashboard.topSellingItems.length}</Chip>
          </div>
          <div className="space-y-1.5">
            {stockModule.dashboard.topSellingItems.slice(0, 6).map((row, index) => (
              <Link
                key={row.itemName}
                to="/app/stock-management"
                search={{ workspace: "all" }}
                className="flex items-center gap-2 rounded-lg bg-surface-2 px-2.5 py-2 transition-all hover:bg-accent active:scale-[0.99]"
              >
                <span className="grid size-6 shrink-0 place-items-center rounded-md bg-card text-[11px] font-semibold">
                  {index + 1}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-medium">{row.itemName}</div>
                </div>
                <div className="shrink-0 font-mono text-sm font-semibold">{row.quantity}</div>
              </Link>
            ))}
            {stockModule.dashboard.topSellingItems.length === 0 && (
              <div className="grid h-16 place-items-center rounded-lg bg-surface-2 text-sm text-muted-foreground">
                {t("No data.", "ውሂብ የለም።")}
              </div>
            )}
          </div>
        </Card>
      </div>
      </LazySection>
      ) : null}

      {/* Revenue chart + Quick actions */}
      {showSales ? (
      <LazySection>
      <div className="grid gap-3 lg:grid-cols-[minmax(0,2fr)_minmax(240px,1fr)]">
        <RevenueChart t={t} hideMoney={hideMoney} />

        <Card className="min-w-0">
          <h3 className="mb-2.5 font-display text-base font-semibold">{t("Quick actions", "ፈጣን እርምጃዎች")}</h3>
          <div className="grid grid-cols-1 gap-1.5 sm:grid-cols-2 lg:grid-cols-1">
            <Link to="/app/pos" search={EMPTY_POS_SEARCH} className="flex items-center gap-2.5 rounded-lg bg-ember p-2.5 text-ember-foreground transition-all hover:opacity-90 active:scale-[0.99]">
              <div className="grid size-8 shrink-0 place-items-center rounded-md bg-white/20"><Icons.Plus className="size-3.5" /></div>
              <div className="text-sm font-semibold">{t("New Order", "አዲስ ትዕዛዝ")}</div>
            </Link>
            <Link to="/app/orders" className="flex items-center gap-2.5 rounded-lg bg-surface-2 p-2.5 transition-all hover:bg-accent active:scale-[0.99]">
              <div className="grid size-8 shrink-0 place-items-center rounded-md bg-card"><Icons.ClipboardList className="size-3.5" /></div>
              <div className="text-sm font-semibold">{t("Orders", "ትዕዛዞች")}</div>
            </Link>
            <Link to="/app/stock-management" search={{ workspace: "all" }} className="flex items-center gap-2.5 rounded-lg bg-surface-2 p-2.5 transition-all hover:bg-accent active:scale-[0.99]">
              <div className="grid size-8 shrink-0 place-items-center rounded-md bg-card"><Icons.Package className="size-3.5" /></div>
              <div className="text-sm font-semibold">{t("Stock", "ክምችት")}</div>
            </Link>
            <Link to="/app/reports" className="flex items-center gap-2.5 rounded-lg bg-surface-2 p-2.5 transition-all hover:bg-accent active:scale-[0.99]">
              <div className="grid size-8 shrink-0 place-items-center rounded-md bg-card"><Icons.BarChart2 className="size-3.5" /></div>
              <div className="text-sm font-semibold">{t("Reports", "ሪፖርቶች")}</div>
            </Link>
            <Link to="/app/payments" className="flex items-center gap-2.5 rounded-lg bg-surface-2 p-2.5 transition-all hover:bg-accent active:scale-[0.99] sm:col-span-1">
              <div className="grid size-8 shrink-0 place-items-center rounded-md bg-card"><Icons.CreditCard className="size-3.5" /></div>
              <div className="text-sm font-semibold">{t("Payments", "ክፍያዎች")}</div>
            </Link>
          </div>
        </Card>
      </div>
      </LazySection>
      ) : null}

      {showSales ? (
      <LazySection>
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        <Card className="min-w-0 border-ember/20 bg-gradient-to-br from-ember/5 via-card to-card">
          <div className="mb-2.5 flex items-center justify-between gap-2">
            <div className="min-w-0">
              <h3 className="font-display text-base font-semibold">{t("Top sold stations", "ምርጥ የተሸጡ ጣቢያዎች")}</h3>
            </div>
            <Chip tone="ember">{topStations.length}</Chip>
          </div>
          <ul className="space-y-1.5">
            {topStations.slice(0, 5).map((station, index) => (
              <li key={station.key} className="flex items-center gap-2 rounded-lg bg-surface-2 px-2 py-1.5 transition-colors hover:bg-accent sm:bg-transparent sm:hover:bg-surface-2 sm:p-1.5">
                <span className="grid size-6 shrink-0 place-items-center rounded-md bg-card text-[11px] font-semibold sm:bg-surface-2">
                  {index + 1}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-medium">{station.key}</div>
                  <div className="text-[11px] text-muted-foreground">{station.qty} {t("items sold", "እቃዎች ተሸጡ")}</div>
                </div>
                <div className="shrink-0 text-right font-mono text-sm">{money(station.revenue)}</div>
              </li>
            ))}
          </ul>
        </Card>

        <Card className="min-w-0 border-teff/20 bg-gradient-to-br from-teff/5 via-card to-card">
          <div className="mb-2.5 flex items-center justify-between gap-2">
            <div className="min-w-0">
              <h3 className="font-display text-base font-semibold">{t("Top sold menu items", "ምርጥ የተሸጡ ምናሌ እቃዎች")}</h3>
            </div>
            <Chip tone="teff">{topItems.length}</Chip>
          </div>
          <ul className="space-y-1.5">
            {topItems.slice(0, 5).map((item, index) => (
              <li key={`dashboard-top-item-${item.productId ?? item.productName}`} className="flex items-center gap-2 rounded-lg bg-surface-2 px-2 py-1.5 transition-colors hover:bg-accent sm:bg-transparent sm:hover:bg-surface-2 sm:p-1.5">
                <span className="grid size-6 shrink-0 place-items-center rounded-md bg-card text-[11px] font-semibold sm:bg-surface-2">
                  {index + 1}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-medium">{item.productName}</div>
                  <div className="text-[11px] text-muted-foreground">{item.station} · {item.qty} {t("sold", "ተሸጠ")}</div>
                </div>
                <div className="shrink-0 text-right font-mono text-sm">{money(item.revenue)}</div>
              </li>
            ))}
          </ul>
        </Card>

        <Card className="min-w-0 border-gold/20 bg-gradient-to-br from-gold/5 via-card to-card md:col-span-2 xl:col-span-1">
          <div className="mb-2.5 flex items-center justify-between gap-2">
            <div className="min-w-0">
              <h3 className="font-display text-base font-semibold">{t("Top sales staff", "ምርጥ የሽያጭ ሰራተኞች")}</h3>
            </div>
            <Chip tone="gold">{topStaff.length}</Chip>
          </div>
          <ul className="space-y-1.5">
            {topStaff.slice(0, 5).map((staff, index) => (
              <li key={staff.name} className="flex items-center gap-2 rounded-lg bg-surface-2 px-2 py-1.5 transition-colors hover:bg-accent sm:bg-transparent sm:hover:bg-surface-2 sm:p-1.5">
                <span className="grid size-6 shrink-0 place-items-center rounded-md bg-card text-[11px] font-semibold sm:bg-surface-2">
                  {index + 1}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-medium">{staff.name}</div>
                  <div className="text-[11px] text-muted-foreground">{staff.qty} {t("items sold", "እቃዎች ተሸጡ")}</div>
                </div>
                <div className="shrink-0 text-right font-mono text-sm">{money(staff.revenue)}</div>
              </li>
            ))}
          </ul>
        </Card>
      </div>
      </LazySection>
      ) : null}

      {showFloor ? (
      <LazySection>
      <div className="grid gap-3 lg:grid-cols-[minmax(0,2fr)_minmax(240px,1fr)]">
        <Card className="min-w-0 overflow-hidden">
          <div className="mb-2.5 flex items-baseline justify-between gap-2">
            <h3 className="font-display text-base font-semibold">{t("Active orders", "ንቁ ትዕዛዞች")}</h3>
            <Link to="/app/orders" className="shrink-0 text-[11px] font-medium text-ember hover:underline">
              {t("View all →", "ሁሉንም ይመልከቱ →")} ({activeOrders.length})
            </Link>
          </div>
          <div className="space-y-1.5">
            {activeOrders.slice(0, 5).map((order) => (
                <Link
                  key={order.id}
                  to="/app/orders"
                  className="block min-w-0 rounded-lg bg-surface-2 px-2.5 py-2 transition-all hover:bg-accent active:scale-[0.99]"
                >
                  <div className="flex min-w-0 flex-col justify-between gap-1.5 sm:flex-row sm:items-center sm:gap-3">
                    <div className="flex min-w-0 items-center gap-2">
                      <Chip
                        tone={
                          order.source === "Room"
                            ? "gold"
                            : order.source === "QR"
                              ? "ember"
                              : "teff"
                        }
                      >
                        {order.source === "Room" && lang === "am" ? "ክፍል" : order.source}
                      </Chip>
                      <span className="truncate font-mono text-sm font-semibold">{order.ref}</span>
                    </div>
                    <div className="flex shrink-0 items-center justify-between gap-3 text-[11px] sm:justify-end">
                      <span className="font-mono text-muted-foreground">{order.openedMin}m</span>
                      <span className="font-mono font-semibold">{money(order.total)}</span>
                    </div>
                  </div>
                  <div className="mt-1 overflow-hidden text-[11px] text-muted-foreground [display:-webkit-box] [-webkit-box-orient:vertical] [-webkit-line-clamp:2] sm:[-webkit-line-clamp:1]">
                    {order.items.map((item) => `${item.qty}x ${orderLineName(item, store.menuItems, lang)}`).join(" - ")}
                  </div>
                </Link>
              ))}
            {activeOrders.length === 0 && (
              <div className="grid h-16 place-items-center rounded-lg bg-surface-2 text-sm text-muted-foreground">
                {t("No orders.", "ትዕዛዞች የሉም።")}
              </div>
            )}
          </div>
        </Card>

        <Card className="min-w-0">
          <h3 className="mb-2.5 font-display text-base font-semibold">{t("Branches", "ቅርንጫፎች")}</h3>
          <div className="grid gap-1.5 sm:grid-cols-2 lg:grid-cols-1">
            {BRANCHES.map((branch) => (
              <div
                key={branch.id}
                className="flex min-w-0 items-center justify-between gap-2 rounded-lg bg-surface-2 px-2.5 py-2 transition-colors hover:bg-accent lg:bg-transparent lg:hover:bg-surface-2 lg:px-2 lg:py-1.5"
              >
                <div className="min-w-0">
                  <div className="text-sm font-medium">{branch.name}</div>
                  <div className="truncate text-[11px] text-muted-foreground">
                    {branch.city} - {branch.outlets} {t("outlets", "መሸጫ ቦታዎች")}
                  </div>
                </div>
                <div className="shrink-0 text-right font-mono text-sm">
                  {money(branch.sales)}
                </div>
              </div>
            ))}
          </div>
        </Card>
      </div>
      </LazySection>
      ) : null}
    </div>
  );
}

// Recharts can't read CSS vars, so we use fixed oklch-derived hex equivalents
const CHART_EMBER = "#b84a2a";
const CHART_GOLD  = "#c49a2a";
const CHART_TEFF  = "#3a7a52";
const CHART_MUTED = "#c8b89a";

function RevenueChart({ t, hideMoney }: { t: (en: string, am: string) => string; hideMoney: boolean }) {
  const store = useStore();
  const money = (value: number) => formatDashboardMoney(value, hideMoney);

  // Build sorted list of all dates that have any data
  const availableDates = useMemo(() => {
    const set = new Set<string>();
    store.salesRecords.forEach((r) => set.add(r.date));
    store.expenseRecords.forEach((r) => set.add(r.date));
    store.payments.forEach((p) => {
      const d = paymentDateKey(p);
      if (d) set.add(d);
    });
    return [...set].sort().reverse(); // newest first
  }, [store.salesRecords, store.expenseRecords, store.payments]);

  const today = dateKey();
  const [selectedDate, setSelectedDate] = useState(today);

  // Always render the selected calendar day — never coerce to another day that has rows.
  const date = selectedDate || today;
  const timelineDates = useMemo(() => {
    const set = new Set<string>([today, ...availableDates]);
    return [...set].sort().reverse();
  }, [availableDates, today]);
  const dateIndex = timelineDates.indexOf(date);
  const canGoOlder = dateIndex >= 0 && dateIndex < timelineDates.length - 1;
  const canGoNewer = dateIndex > 0;

  function stepDate(dir: 1 | -1) {
    // dir +1 = older, -1 = newer (timelineDates is newest-first).
    const next = timelineDates[dateIndex + dir];
    if (next) setSelectedDate(next);
  }

  const stockModule = useStockManagementModule();
  const periodStart =
    date === today ? resolveBranchDashboardPeriodStart(stockModule.closings, today) : null;
  const sales = filterSalesAfterDashboardPeriod(filterSalesByDate(store.salesRecords, date), periodStart);
  const expenses = filterExpensesByDate(store.expenseRecords, date);
  const payments = filterPaymentsAfterDashboardPeriod(filterPaymentsByDate(store.payments, date), periodStart);
  const summary = summarizeSalesWithPayments(sales, expenses, payments);

  const revenueKey = t("Revenue", "ገቢ");
  const hourlyData = useMemo(() => {
    const salesHours   = groupSalesByHour(sales);
    const paymentHours = groupPaymentsByHour(payments);
    const source = salesHours.length > 0 ? salesHours : paymentHours;
    return source.map((row) => ({ hour: row.h, [revenueKey]: Math.round(row.sales) }));
  }, [sales, payments, revenueKey]);

  const summaryBars = [
    { label: t("Revenue", "ገቢ"),  value: Math.round(summary.revenue),  fill: CHART_EMBER },
    { label: t("Expenses", "ወጪ"), value: Math.round(summary.totalExpense), fill: CHART_GOLD },
    { label: t("Profit", "ትርፍ"),  value: Math.round(summary.profit),   fill: CHART_TEFF },
  ];

  const isToday = date === today;

  return (
    <Card className="min-w-0">
      <div className="mb-2.5 flex flex-wrap items-center justify-between gap-2">
        <div>
          <h3 className="font-display text-base font-semibold">
            {t("Revenue overview", "የገቢ አጠቃላይ እይታ")}
          </h3>
        </div>
        <div className="flex items-center gap-2">
          {isToday && (
            <Chip tone="teff">
              <span className="size-1.5 rounded-full bg-teff animate-pulse" />
              {t("Live", "ቀጥታ")}
            </Chip>
          )}
          {!isToday && (
            <button
              type="button"
              onClick={() => setSelectedDate(today)}
              className="h-8 px-2.5 rounded-lg border border-border bg-card text-xs font-medium hover:bg-surface-2 transition-colors"
            >
              {t("Today", "ዛሬ")}
            </button>
          )}
          <div className="flex items-center rounded-lg border border-border bg-card overflow-hidden">
            <button
              type="button"
              onClick={() => stepDate(1)}
              disabled={!canGoOlder}
              className="h-8 w-8 grid place-items-center text-muted-foreground hover:bg-surface-2 disabled:opacity-30 disabled:cursor-not-allowed transition-colors border-r border-border"
              aria-label={t("Previous day", "የቀደመው ቀን")}
            >
              <Icons.ChevronLeft className="size-3.5" />
            </button>
            <input
              type="date"
              value={date}
              max={today}
              onChange={(e) => e.target.value && setSelectedDate(e.target.value)}
              className="h-8 px-2 text-xs bg-transparent focus:outline-none cursor-pointer w-[7.5rem]"
            />
            <button
              type="button"
              onClick={() => stepDate(-1)}
              disabled={!canGoNewer}
              className="h-8 w-8 grid place-items-center text-muted-foreground hover:bg-surface-2 disabled:opacity-30 disabled:cursor-not-allowed transition-colors border-l border-border"
              aria-label={t("Next day", "የሚቀጥለው ቀን")}
            >
              <Icons.ChevronRight className="size-3.5" />
            </button>
          </div>
        </div>
      </div>

      {/* Summary totals bar chart */}
      <div className="h-28 sm:h-32">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={summaryBars} barCategoryGap="30%">
            <CartesianGrid vertical={false} stroke={CHART_MUTED} strokeOpacity={0.3} />
            <XAxis dataKey="label" tick={{ fontSize: 11, fill: CHART_MUTED }} axisLine={false} tickLine={false} />
            <YAxis hide />
            <Tooltip
              cursor={{ fill: CHART_MUTED, fillOpacity: 0.12 }}
              formatter={(value: number) => [money(value), ""]}
              contentStyle={{ fontSize: 12, borderRadius: 8, border: "1px solid #e5d9cc", background: "#fff" }}
            />
            <Bar dataKey="value" radius={[6, 6, 0, 0]}>
              {summaryBars.map((entry) => <Cell key={entry.label} fill={entry.fill} />)}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>

      {/* Hourly sparkline */}
      {hourlyData.length > 0 && (
        <div className="h-24 mt-3">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={hourlyData} barCategoryGap="20%">
              <CartesianGrid vertical={false} stroke={CHART_MUTED} strokeOpacity={0.25} />
              <XAxis dataKey="hour" tick={{ fontSize: 10, fill: CHART_MUTED }} axisLine={false} tickLine={false} />
              <YAxis hide />
              <Tooltip
                cursor={{ fill: CHART_MUTED, fillOpacity: 0.12 }}
                formatter={(value: number) => [money(value), revenueKey]}
                contentStyle={{ fontSize: 12, borderRadius: 8, border: "1px solid #e5d9cc", background: "#fff" }}
              />
              <Bar dataKey={revenueKey} fill={CHART_EMBER} radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* Summary row */}
      <div className="mt-3 grid grid-cols-3 gap-1.5 border-t border-border pt-3 sm:gap-2">
        {summaryBars.map((row) => (
          <button
            key={row.label}
            type="button"
            className="rounded-lg bg-surface-2 px-2 py-2 text-left transition-all hover:bg-accent active:scale-[0.98] sm:px-3"
            title={row.label}
          >
            <div className="mb-1 flex items-center gap-1.5">
              <span className="size-2 shrink-0 rounded-full" style={{ background: row.fill }} />
              <span className="truncate text-[10px] text-muted-foreground sm:text-[11px]">{row.label}</span>
            </div>
            <div className="font-mono text-xs font-semibold sm:text-sm">{money(row.value)}</div>
          </button>
        ))}
      </div>
    </Card>
  );
}

function OperationsDashboard() {
  const { user } = useAuth();
  const lang = useLang();
  const t = (en: string, am: string) => (lang === "am" ? am : en);
  const store = useStore();
  const { hidden: hideMoney, toggle: toggleHideMoney } = useHideMoney();
  const stockModule = useStockManagementModule();
  const { records: waiterClosings, setRecords: setWaiterClosings } =
    useModuleRecords<WaiterClosingRecord>(WAITER_CLOSINGS_MODULE_KEY, EMPTY_MODULE_RECORDS);
  const [closingNote, setClosingNote] = useState("");
  const [closingBusy, setClosingBusy] = useState(false);

  const waiterDay = useMemo(() => {
    if (!user || user.role !== "Waiter") return null;
    return summarizeWaiterDay(store.orders, store.salesRecords, user.name);
  }, [store.orders, store.salesRecords, user]);

  const todayClosing = useMemo(() => {
    if (!user || user.role !== "Waiter") return null;
    return todayWaiterClosing(waiterClosings, user.name);
  }, [user, waiterClosings]);

  if (!user) return null;

  const money = (value: number) => formatDashboardMoney(value, hideMoney);
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
  const stations = stationsForRole(user.role, store.menuStations);
  const isWaiter = user.role === "Waiter";
  const closedToday = isWaiter ? hasWaiterClosedToday(waiterClosings, user.name) : false;

  function submitWaiterClosing() {
    if (!user || !waiterDay) return;
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
      const record = buildWaiterClosingRecord(waiterDay, closingNote);
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
  const isWarehouseInventoryRole = [
    "Storekeeper",
    "Inventory Staff",
    "Procurement Officer",
    "Store Manager",
    "Inventory Administrator",
  ].includes(user.role);
  const isProductionLocationRole = [
    "Kitchen Staff",
    "Bartender",
    "Bar Staff",
    "Coffee House Staff",
    "Butcher House Staff",
    "Butcher Staff",
    "Chef",
  ].includes(user.role);
  const assignedLocations = resolveUserAssignedLocations(user);
  const scopedStockValue = assignedLocations.length > 0
    ? stockModule.balances
        .filter((row) => assignedLocations.includes(row.location))
        .reduce((sum, row) => sum + row.inventoryValue, 0)
    : stockModule.dashboard.totalInventoryValue;
  const stockValueLabel = assignedLocations.includes("VIP Bar")
    ? t("VIP Bar stock value", "የVIP ባር ክምችት ዋጋ")
    : assignedLocations.includes("Main Bar")
      ? t("Main Bar stock value", "የሜይን ባር ክምችት ዋጋ")
      : user.role === "Bartender"
        ? t("VIP Bar stock value", "የVIP ባር ክምችት ዋጋ")
        : user.role === "Bar Staff"
          ? t("Main Bar stock value", "የሜይን ባር ክምችት ዋጋ")
          : t("My stock value", "የእኔ ክምችት ዋጋ");
  const newAlerts = notifications.filter((item) => item.tone === "ember").length;
  const myOpenOrders = store.orders.filter(
    (order) =>
      !isFinalOrderStatus(order.status) &&
      (assignedWaiterMatches(order.waiter, user) ||
        assignedWaiterMatches(order.orderedByWaiter, user)),
  );
  const openStockRequests = notifications.filter((item) => item.kind === "stock-request").length;
  const openStockTransfers = notifications.filter((item) => item.kind === "stock-transfer").length;
  const scopedBalances = assignedLocations.length > 0
    ? stockModule.balances.filter((row) => assignedLocations.includes(row.location))
    : stockModule.balances;
  const scopedLowStock = scopedBalances.filter(
    (row) => (row.availableQuantity ?? row.quantity) <= row.reorderLevel,
  ).length;
  const barScope = barScopeFromUser(user);
  const stationOrders = store.orders.filter(
    (order) =>
      !isFinalOrderStatus(order.status) &&
      order.status !== "PENDING_CASHIER" &&
      orderMatchesBarScope(order, barScope) &&
      order.stationTickets.some(
        (ticket) =>
          stations.includes(ticket.station) &&
          ticket.status !== "READY" &&
          ticket.status !== "CANCELLED" &&
          ticket.status !== "UNAVAILABLE" &&
          orderMatchesBarScope(order, barScope, ticket.station),
      ),
  );

  const today = dateKey();
  const departmentLocations =
    assignedLocations.length > 0
      ? assignedLocations
      : stations
          .map((station) => {
            const key = station.toLowerCase();
            if (key.includes("vip")) return "VIP Bar";
            if (key.includes("butcher")) return "Butcher";
            if (key.includes("coffee")) return "Coffee House";
            if (key.includes("kitchen")) return "Kitchen";
            if (key.includes("bar")) return "Main Bar";
            return null;
          })
          .filter((loc): loc is string => Boolean(loc));
  const periodStart = resolveBranchDashboardPeriodStart(stockModule.closings, today);
  const departmentSalesToday = filterSalesAfterDashboardPeriod(
    filterSalesForOperationalLocations(store.salesRecords, departmentLocations, today),
    periodStart,
  );
  const departmentSalesSummary = summarizeSales(departmentSalesToday);
  const departmentTopItems = groupSalesByProduct(departmentSalesToday).slice(0, 6);
  const departmentPosDeductionsToday = stockModule.ledger
    .filter(
      (entry) =>
        entry.date === today &&
        departmentLocations.includes(String(entry.location)) &&
        (entry.type === "POS_CONSUMPTION" || entry.type === "RECIPE_CONSUMPTION") &&
        (!periodStart || (entry.transactionAt || `${entry.date}T00:00:00.000Z`) > periodStart),
    )
    .reduce((sum, entry) => sum + entry.quantity, 0);

  return (
    <div className="min-w-0 space-y-3">
      <PageHeader
        title={`${t("Good evening", "እንኳን ደህና ዋሉ")}, ${user.name.split(" ")[0]}`}
        action={
          <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row">
            <MoneyVisibilityToggle hidden={hideMoney} onToggle={toggleHideMoney} t={t} />
            <Link
              to="/app/notifications"
              className="inline-flex h-9 w-full items-center justify-center gap-2 rounded-lg bg-ember px-3 text-sm font-medium text-ember-foreground shadow-[var(--shadow-glow)] sm:w-auto"
            >
              <Icons.BellRing className="size-4" />
              {t("Notifications", "ማሳወቂያዎች")}
            </Link>
          </div>
        }
      />

      <div className="grid grid-cols-2 gap-2 sm:gap-3 xl:grid-cols-4">
        <Stat
          label={t("New alerts", "አዲስ ማሳወቂያዎች")}
          value={String(newAlerts)}
          tone="ember"
          icon="BellRing"
          to="/app/notifications"
        />
        {isWaiter && waiterDay ? (
          <>
            <Stat
              label={t("My sales today", "የዛሬ ሽያጬ")}
              value={money(waiterDay.collectedSales)}
              tone="ember"
              icon="Wallet"
              to="/app/pos"
              search={EMPTY_POS_SEARCH}
            />
            <Stat
              label={t("Orders today", "የዛሬ ትዕዛዞች")}
              value={String(waiterDay.ordersCreated)}
              tone="teff"
              icon="ClipboardList"
              to="/app/orders"
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
              label={t("Daily closing", "ዕለታዊ መዝጊያ")}
              value={closedToday ? t("Done", "ተጠናቋል") : t("Open", "ክፍት")}
              tone={closedToday ? "teff" : "muted"}
              icon="Lock"
            />
          </>
        ) : isWarehouseInventoryRole ? (
          <>
            <Stat
              label={stockValueLabel}
              value={money(scopedStockValue)}
              tone="ember"
              icon="Wallet"
              to="/app/stock-management"
            />
            <Stat
              label={t("Low stock", "ዝቅተኛ ክምችት")}
              value={String(scopedLowStock)}
              tone="gold"
              icon="AlertTriangle"
              to="/app/stock-management"
            />
            <Stat
              label={t("Open requests", "ክፍት ጥያቄዎች")}
              value={String(openStockRequests)}
              tone="teff"
              icon="ClipboardList"
              to="/app/stock-management"
            />
            <Stat
              label={t("Open transfers", "ክፍት ዝውውሮች")}
              value={String(openStockTransfers)}
              icon="ArrowRightLeft"
              to="/app/stock-management"
            />
          </>
        ) : (
          <>
            {isProductionLocationRole ? (
              <>
                <Stat
                  label={t("Total sales", "ጠቅላላ ሽያጭ")}
                  value={money(departmentSalesSummary.revenue)}
                  tone="ember"
                  icon="TrendingUp"
                  to="/app/stock-management"
                />
                <Stat
                  label={t("Items sold today", "ዛሬ የተሸጡ ዕቃዎች")}
                  value={String(departmentSalesSummary.qty)}
                  tone="teff"
                  icon="ShoppingBag"
                  to="/app/stock-management"
                />
                <Stat
                  label={t("Stock deducted", "የተቀነሰ ክምችት")}
                  value={String(departmentPosDeductionsToday)}
                  tone="gold"
                  icon="MinusCircle"
                  to="/app/stock-management"
                />
                <Stat
                  label={stockValueLabel}
                  value={money(scopedStockValue)}
                  icon="Wallet"
                  to="/app/stock-management"
                />
              </>
            ) : (
              <>
                <Stat
                  label={t("Station tickets", "የጣቢያ ቲኬቶች")}
                  value={String(stationOrders.length)}
                  tone="gold"
                  icon="ChefHat"
                  to="/app/kds"
                />
                <Stat
                  label={t("Unpaid", "ያልተከፈለ")}
                  value={String(store.orders.filter((order) => !isFinalOrderStatus(order.status) && order.paymentStatus !== "Paid").length)}
                  tone="teff"
                  icon="Wallet"
                  to="/app/pos"
                  search={EMPTY_POS_SEARCH}
                />
                <Stat
                  label={t("Orders", "ትዕዛዞች")}
                  value={String(store.orders.filter((order) => !isFinalOrderStatus(order.status)).length)}
                  icon="ClipboardList"
                  to="/app/orders"
                />
                <Stat
                  label={stockValueLabel}
                  value={money(scopedStockValue)}
                  tone="ember"
                  icon="Wallet"
                  to="/app/stock-management"
                />
              </>
            )}
          </>
        )}
      </div>

      {isProductionLocationRole ? (
        <div className="grid gap-3 lg:grid-cols-2">
          <Card className="min-w-0 !p-0 overflow-hidden">
            <div className="flex items-center justify-between gap-2 border-b border-border p-3">
              <div className="min-w-0">
                <h3 className="font-display text-base font-semibold">{t("Today's sales", "የዛሬ ሽያጭ")}</h3>
              </div>
              <Chip tone="teff">{money(departmentSalesSummary.revenue)}</Chip>
            </div>
            <div className="divide-y divide-border">
              {departmentTopItems.map((row) => (
                <div key={row.productId ?? row.productName} className="flex items-center justify-between gap-3 p-3">
                  <div className="min-w-0">
                    <div className="truncate font-medium text-sm">{row.productName}</div>
                    <div className="text-[11px] text-muted-foreground">{row.station} · {row.qty} {t("sold", "ተሽጧል")}</div>
                  </div>
                  <div className="shrink-0 font-mono text-sm">{money(row.revenue)}</div>
                </div>
              ))}
              {departmentTopItems.length === 0 && (
                <div className="p-6 text-center text-sm text-muted-foreground">
                  {t("No sales.", "ሽያጭ የለም።")}
                </div>
              )}
            </div>
          </Card>
          <Card className="min-w-0">
              <div className="mb-2.5 flex items-baseline justify-between gap-2">
              <h3 className="font-display text-base font-semibold">{t("Station tickets", "የጣቢያ ቲኬቶች")}</h3>
              <Link to="/app/kds" className="shrink-0 text-[11px] font-medium text-ember hover:underline">
                {t("Open KDS →", "KDS ክፈት →")}
              </Link>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div className="rounded-lg bg-surface-2 p-3">
                <div className="text-[11px] text-muted-foreground">{t("Open tickets", "ክፍት ቲኬቶች")}</div>
                <div className="mt-1 font-display text-xl font-semibold">{stationOrders.length}</div>
              </div>
              <div className="rounded-lg bg-surface-2 p-3">
                <div className="text-[11px] text-muted-foreground">{t("Low stock", "ዝቅተኛ ክምችት")}</div>
                <div className="mt-1 font-display text-xl font-semibold">{scopedLowStock}</div>
              </div>
              <div className="rounded-lg bg-surface-2 p-3">
                <div className="text-[11px] text-muted-foreground">{t("Stock deducted", "የተቀነሰ ክምችት")}</div>
                <div className="mt-1 font-display text-xl font-semibold">{departmentPosDeductionsToday}</div>
              </div>
              <div className="rounded-lg bg-surface-2 p-3">
                <div className="text-[11px] text-muted-foreground">{t("Sold today", "ዛሬ የተሸጠ")}</div>
                <div className="mt-1 font-display text-xl font-semibold">{departmentSalesSummary.qty}</div>
              </div>
            </div>
          </Card>
        </div>
      ) : null}

      <div className="grid gap-3 lg:grid-cols-[minmax(0,2fr)_minmax(240px,1fr)]">
        <Card className="min-w-0 !p-0 overflow-hidden">
          <div className="flex items-center justify-between gap-2 border-b border-border p-3">
            <div className="min-w-0">
              <h3 className="font-display text-base font-semibold">{t("My notifications", "የእኔ ማሳወቂያዎች")}</h3>
            </div>
            <Chip tone={notifications.length > 0 ? "ember" : "teff"}>
              {notifications.length} {t("active", "ንቁ")}
            </Chip>
          </div>

          <div className="divide-y divide-border">
            {notifications.slice(0, 6).map((item) => (
              <Link
                key={item.id}
                to={item.href}
                className="flex flex-col gap-2 p-3 transition-colors hover:bg-surface-2 sm:flex-row sm:items-center sm:justify-between active:bg-accent"
              >
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <span className="font-semibold text-sm">{item.title}</span>
                    <Chip tone={item.tone}>{item.orderNo}</Chip>
                  </div>
                  <div className="mt-0.5 truncate text-xs text-muted-foreground">{item.detail}</div>
                  <div className="mt-0.5 text-[11px] text-muted-foreground">
                    {item.area} {item.tableNumber} - {t("Waiter", "አስተናጋጅ")}: {item.waiter} - {t("Time", "ሰዓት")}: {item.time}
                  </div>
                </div>
                <span className="inline-flex h-8 items-center justify-center gap-1.5 rounded-md border border-border bg-card px-2.5 text-xs font-medium">
                  <Icons.ArrowRight className="size-3.5" /> {t("Open", "ክፈት")}
                </span>
              </Link>
            ))}

            {notifications.length === 0 && (
              <div className="p-6 text-center text-sm text-muted-foreground">
                {t("No notifications.", "ማሳወቂያ የለም።")}
              </div>
            )}
          </div>
        </Card>

        <Card className="min-w-0">
          <h3 className="mb-2.5 font-display text-base font-semibold">{t("Quick actions", "ፈጣን እርምጃዎች")}</h3>
          <div className="grid grid-cols-1 gap-1.5 sm:grid-cols-3 lg:grid-cols-1">
            <Link
              to="/app/notifications"
              className="inline-flex h-9 w-full items-center gap-2 rounded-lg border border-border bg-card px-3 text-sm font-medium transition-all hover:bg-surface-2 active:scale-[0.99]"
            >
              <Icons.BellRing className="size-3.5" /> {t("Notifications", "ማሳወቂያዎች")}
            </Link>
            <Link
              to={isWaiter ? "/app/pos" : "/app/stock-management"}
              search={isWaiter ? EMPTY_POS_SEARCH : { workspace: "all" }}
              className="inline-flex h-9 w-full items-center gap-2 rounded-lg bg-ember px-3 text-sm font-medium text-ember-foreground transition-all active:scale-[0.99]"
            >
              {isWaiter ? (
                <Icons.Receipt className="size-3.5" />
              ) : (
                <Icons.Package className="size-3.5" />
              )}
              {isWaiter
                ? t("Create order", "ትዕዛዝ ፍጠር")
                : t("Stock workspace", "የክምችት ቦታ")}
            </Link>
            <Link
              to={isWarehouseInventoryRole ? "/app/suppliers" : "/app/orders"}
              className="inline-flex h-9 w-full items-center gap-2 rounded-lg border border-border bg-card px-3 text-sm font-medium transition-all hover:bg-surface-2 active:scale-[0.99]"
            >
              {isWarehouseInventoryRole ? (
                <>
                  <Icons.Truck className="size-3.5" /> {t("Suppliers", "አቅራቢዎች")}
                </>
              ) : (
                <>
                  <Icons.ClipboardList className="size-3.5" /> {t("Orders", "ትዕዛዞች")}
                </>
              )}
            </Link>
            {isProductionLocationRole ? (
              <Link
                to="/app/stock-management"
                search={{ workspace: "all" }}
                className="inline-flex h-9 w-full items-center gap-2 rounded-lg border border-border bg-card px-3 text-sm font-medium transition-all hover:bg-surface-2 active:scale-[0.99]"
              >
                <Icons.Package className="size-3.5" /> {t("Stock", "ክምችት")}
              </Link>
            ) : null}
          </div>
        </Card>
      </div>

      {isWaiter && waiterDay ? (
        <div className="grid gap-3 lg:grid-cols-2">
          <Card className="min-w-0 overflow-hidden">
            <div className="mb-2.5 flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-baseline gap-2">
                <h3 className="font-display text-base font-semibold">
                  {t("My sales today", "የዛሬ ሽያጬ")}
                </h3>
                <Chip tone="ember">{waiterDay.collectedReceipts}</Chip>
              </div>
              <MoneyVisibilityToggle
                hidden={hideMoney}
                onToggle={toggleHideMoney}
                t={t}
                className="!w-auto"
              />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div className="rounded-lg border border-border bg-surface-2/50 p-3">
                <div className="text-[11px] text-muted-foreground">{t("Collected", "የተሰበሰበ")}</div>
                <div className="mt-1 font-mono text-base font-semibold">{money(waiterDay.collectedSales)}</div>
              </div>
              <div className="rounded-lg border border-border bg-surface-2/50 p-3">
                <div className="text-[11px] text-muted-foreground">{t("Gross ordered", "ጠቅላላ ትዕዛዝ")}</div>
                <div className="mt-1 font-mono text-base font-semibold">{money(waiterDay.grossSales)}</div>
              </div>
              <div className="rounded-lg border border-border bg-surface-2/50 p-3">
                <div className="text-[11px] text-muted-foreground">{t("Items sold", "የተሸጡ እቃዎች")}</div>
                <div className="mt-1 font-mono text-base font-semibold">{waiterDay.itemsSold}</div>
              </div>
              <div className="rounded-lg border border-border bg-surface-2/50 p-3">
                <div className="text-[11px] text-muted-foreground">{t("Voids / returns", "ሰርዞች / መልሶች")}</div>
                <div className="mt-1 font-mono text-base font-semibold">{money(waiterDay.voidsReturns)}</div>
              </div>
            </div>
          </Card>

          <Card className="min-w-0 overflow-hidden">
            <div className="mb-2.5 flex items-baseline justify-between gap-2">
              <h3 className="font-display text-base font-semibold">
                {t("Daily closing", "ዕለታዊ መዝጊያ")}
              </h3>
              <Chip tone={closedToday ? "teff" : "gold"}>
                {closedToday ? t("Closed", "ተዘግቷል") : t("Pending", "እየጠበቀ")}
              </Chip>
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
                <p className="text-xs text-muted-foreground">
                  {waiterDay.openBills > 0
                    ? t(
                        `${waiterDay.openBills} open bill(s) must be transferred or paid first.`,
                        `${waiterDay.openBills} ክፍት ሂሳብ(ዎች) መጀመሪያ መተላለፍ ወይም መከፈል አለባቸው።`,
                      )
                    : t(
                        "Confirm your day totals and close your shift.",
                        "የቀንዎን ድምር አረጋግጠው ሺፍትዎን ይዝጉ።",
                      )}
                </p>
                <input
                  value={closingNote}
                  onChange={(event) => setClosingNote(event.target.value)}
                  placeholder={t("Optional note", "አማራጭ ማስታወሻ")}
                  className="h-10 w-full rounded-lg border border-border bg-card px-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring/40"
                />
                <div className="flex flex-wrap gap-2">
                  <Link
                    to="/app/pos"
                    search={EMPTY_POS_SEARCH}
                    className="inline-flex h-10 items-center gap-1.5 rounded-lg border border-border px-3 text-sm font-medium hover:bg-surface-2"
                  >
                    <Icons.ArrowRightLeft className="size-3.5" />
                    {t("Transfer bills", "ሂሳቦችን አስተላልፍ")}
                  </Link>
                  <button
                    type="button"
                    onClick={submitWaiterClosing}
                    disabled={closingBusy || waiterDay.openBills > 0}
                    className="inline-flex h-10 flex-1 items-center justify-center gap-1.5 rounded-lg bg-ember px-3 text-sm font-semibold text-ember-foreground disabled:opacity-40"
                  >
                    <Icons.Lock className="size-3.5" />
                    {t("Close my day", "ቀኔን ዝጋ")}
                  </button>
                </div>
              </div>
            )}
          </Card>

          <Card className="min-w-0 overflow-hidden lg:col-span-2">
            <div className="mb-2.5 flex items-baseline justify-between gap-2">
              <h3 className="font-display text-base font-semibold">
                {t("My open bills", "የእኔ ክፍት ሂሳቦች")}
              </h3>
              <Chip tone={myOpenOrders.length > 0 ? "gold" : "muted"}>{myOpenOrders.length}</Chip>
            </div>
            <div className="space-y-2">
              {myOpenOrders.slice(0, 6).map((order) => (
                <Link
                  key={order.id}
                  to="/app/pos"
                  search={{ ...EMPTY_POS_SEARCH, orderId: order.id }}
                  className="block rounded-lg border border-border bg-surface-2/60 p-3 hover:bg-accent"
                >
                  <div className="flex items-center justify-between gap-2">
                    <div className="min-w-0">
                      <div className="truncate font-mono text-sm font-semibold">{order.orderNo}</div>
                      <div className="text-[11px] text-muted-foreground">
                        {order.area} {order.tableNumber} · {money(order.total)}
                      </div>
                    </div>
                    <Chip tone="muted">{order.paymentStatus}</Chip>
                  </div>
                </Link>
              ))}
              {myOpenOrders.length === 0 && (
                <div className="grid h-16 place-items-center rounded-lg bg-surface-2 text-sm text-muted-foreground">
                  {t("No open bills.", "ክፍት ሂሳብ የለም።")}
                </div>
              )}
            </div>
          </Card>
        </div>
      ) : null}
    </div>
  );
}
