import { Link } from "@tanstack/react-router";
import * as Icons from "lucide-react";
import { useMemo, type ComponentType } from "react";
import { Card, Chip } from "@/components/ui-kit";
import {
  formatDashboardMoney,
  MoneyVisibilityToggle,
  useHideMoney,
} from "@/lib/dashboard-privacy";
import { isFinalOrderStatus } from "@/lib/demo-data";
import { useAuth } from "@/lib/auth-context";
import { useLang } from "@/lib/lang-context";
import { useStore } from "@/lib/store";
import { getNotificationsForUser } from "@/lib/notifications";
import { useStockManagementModule } from "@/lib/stock-management";
import { buildDashboardTodaySlice } from "@/lib/sales-analytics";

type QuickLink = {
  to: string;
  label: string;
  labelAm: string;
  icon: keyof typeof Icons;
  badge?: number;
};

const EMPTY_POS_SEARCH = {
  table: undefined,
  area: undefined,
  waiter: undefined,
  orderId: undefined,
  mode: undefined,
} as const;

export function CashierDashboard() {
  const { user } = useAuth();
  const lang = useLang();
  const t = (en: string, am: string) => (lang === "am" ? am : en);
  const store = useStore();
  const stockModule = useStockManagementModule();
  const { hidden: hideMoney, toggle: toggleHideMoney } = useHideMoney();

  const summary = useMemo(
    () =>
      buildDashboardTodaySlice(
        store.salesRecords,
        store.expenseRecords,
        store.payments,
        stockModule.closings,
      ).summary,
    [stockModule.closings, store.expenseRecords, store.payments, store.salesRecords],
  );

  if (!user) return null;

  const money = (value: number) => formatDashboardMoney(value, hideMoney);
  const firstName = user.name.split(" ")[0] ?? user.name;
  const openOrders = store.orders.filter((order) => !isFinalOrderStatus(order.status));
  const unpaidOrders = openOrders.filter((order) => order.paymentStatus !== "Paid");
  const pendingCashier = openOrders.filter((order) => order.status === "PENDING_CASHIER");
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

  const quickLinks: QuickLink[] = [
    { to: "/app/orders", label: "Orders", labelAm: "ትዕዛዞች", icon: "ClipboardList", badge: openOrders.length || undefined },
    { to: "/app/tables", label: "Tables", labelAm: "ጠረጴዛ", icon: "LayoutGrid" },
    { to: "/app/payments", label: "Payments", labelAm: "ክፍያ", icon: "Wallet" },
    { to: "/app/receipts", label: "Receipts", labelAm: "ደረሰኝ", icon: "Receipt" },
    { to: "/app/kds", label: "Stations", labelAm: "ጣቢያ", icon: "ChefHat" },
    {
      to: "/app/notifications",
      label: "Alerts",
      labelAm: "ማሳወቂያ",
      icon: "BellRing",
      badge: alertCount || undefined,
    },
  ];

  return (
    <div className="mx-auto min-w-0 max-w-3xl space-y-3 pb-6">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 className="font-display text-2xl font-semibold leading-tight tracking-normal">
            {firstName}
          </h1>
          <p className="text-xs text-muted-foreground">{user.branch}</p>
        </div>
        <MoneyVisibilityToggle
          hidden={hideMoney}
          onToggle={toggleHideMoney}
          t={t}
          className="!w-auto shrink-0"
        />
      </div>

      <Link
        to="/app/pos"
        search={EMPTY_POS_SEARCH}
        className="flex min-h-14 w-full items-center justify-center gap-2 rounded-2xl bg-ember px-4 text-base font-semibold text-ember-foreground shadow-[var(--shadow-glow)] transition active:scale-[0.99]"
      >
        <Icons.Receipt className="size-5" />
        {t("Open POS", "POS ክፈት")}
      </Link>

      <div className="grid grid-cols-2 gap-2">
        <div className="rounded-2xl border border-border bg-card p-3">
          <div className="text-[11px] text-muted-foreground">{t("Sales", "ሽያጭ")}</div>
          <div className="mt-1 break-words font-mono text-base font-semibold">
            {money(summary.revenue)}
          </div>
        </div>
        <Link
          to="/app/pos"
          search={EMPTY_POS_SEARCH}
          className="rounded-2xl border border-border bg-card p-3 transition hover:bg-surface-2 active:scale-[0.99]"
        >
          <div className="text-[11px] text-muted-foreground">{t("Unpaid", "ያልተከፈለ")}</div>
          <div className="mt-1 font-display text-xl font-semibold leading-none">
            {unpaidOrders.length}
          </div>
        </Link>
        <Link
          to="/app/orders"
          className="rounded-2xl border border-border bg-card p-3 transition hover:bg-surface-2 active:scale-[0.99]"
        >
          <div className="text-[11px] text-muted-foreground">{t("Open", "ክፍት")}</div>
          <div className="mt-1 font-display text-xl font-semibold leading-none">
            {openOrders.length}
          </div>
        </Link>
        <Link
          to="/app/pos"
          search={EMPTY_POS_SEARCH}
          className="rounded-2xl border border-border bg-card p-3 transition hover:bg-surface-2 active:scale-[0.99]"
        >
          <div className="text-[11px] text-muted-foreground">{t("Pending", "በመጠባበቅ")}</div>
          <div className="mt-1 font-display text-xl font-semibold leading-none">
            {pendingCashier.length}
          </div>
        </Link>
      </div>

      <div className="grid grid-cols-3 gap-2">
        {quickLinks.map((link) => {
          const Icon = Icons[link.icon] as ComponentType<{ className?: string }>;
          return (
            <Link
              key={link.to}
              to={link.to}
              className="relative flex min-h-[4.5rem] flex-col items-center justify-center gap-1.5 rounded-2xl border border-border bg-card px-2 py-3 text-center transition active:scale-[0.98]"
            >
              {link.badge ? (
                <span className="absolute right-1.5 top-1.5 inline-flex min-w-5 items-center justify-center rounded-full bg-ember px-1.5 text-[10px] font-semibold text-ember-foreground">
                  {link.badge}
                </span>
              ) : null}
              <Icon className="size-5" />
              <span className="text-[11px] font-medium leading-tight">
                {t(link.label, link.labelAm)}
              </span>
            </Link>
          );
        })}
      </div>

      <Card className="!p-0 overflow-hidden">
        <div className="flex items-center justify-between gap-2 border-b border-border px-3 py-2.5">
          <h2 className="font-display text-base font-semibold">
            {t("Unpaid bills", "ያልተከፈሉ ሂሳቦች")}
          </h2>
          <Chip tone={unpaidOrders.length > 0 ? "gold" : "muted"}>{unpaidOrders.length}</Chip>
        </div>
        <div className="divide-y divide-border">
          {unpaidOrders.slice(0, 8).map((order) => (
            <Link
              key={order.id}
              to="/app/pos"
              search={{ ...EMPTY_POS_SEARCH, orderId: order.id }}
              className="flex items-center gap-3 px-3 py-3 transition hover:bg-surface-2 active:bg-accent"
            >
              <div className="grid size-10 shrink-0 place-items-center rounded-xl bg-surface-2 font-display text-sm font-semibold">
                {order.tableNumber}
              </div>
              <div className="min-w-0 flex-1">
                <div className="truncate font-mono text-sm font-semibold">{order.orderNo}</div>
                <div className="truncate text-xs text-muted-foreground">
                  {order.area}
                  {order.waiter ? ` · ${order.waiter}` : ""}
                </div>
              </div>
              <div className="shrink-0 text-right">
                <div className="font-mono text-sm font-semibold">{money(order.total)}</div>
                <Chip tone={order.status === "PENDING_CASHIER" ? "ember" : "muted"}>
                  {order.paymentStatus}
                </Chip>
              </div>
            </Link>
          ))}
          {unpaidOrders.length === 0 && (
            <div className="px-3 py-8 text-center text-sm text-muted-foreground">
              {t("No unpaid bills.", "ያልተከፈለ ሂሳብ የለም።")}
            </div>
          )}
        </div>
      </Card>

      <Card className="!p-0 overflow-hidden">
        <div className="flex items-center justify-between gap-2 border-b border-border px-3 py-2.5">
          <h2 className="font-display text-base font-semibold">{t("Alerts", "ማሳወቂያዎች")}</h2>
          <Link to="/app/notifications" className="text-xs font-medium text-ember">
            {t("All", "ሁሉም")}
          </Link>
        </div>
        <div className="divide-y divide-border">
          {notifications.slice(0, 4).map((item) => (
            <Link
              key={item.id}
              to={item.href}
              className="flex items-center gap-3 px-3 py-3 transition hover:bg-surface-2 active:bg-accent"
            >
              <div className="grid size-9 shrink-0 place-items-center rounded-lg bg-ember/10 text-ember">
                <Icons.BellRing className="size-4" />
              </div>
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm font-semibold">{item.title}</div>
                <div className="truncate text-xs text-muted-foreground">
                  {item.orderNo}
                  {item.tableNumber ? ` · ${item.area} ${item.tableNumber}` : ""}
                </div>
              </div>
              <Icons.ChevronRight className="size-4 shrink-0 text-muted-foreground" />
            </Link>
          ))}
          {notifications.length === 0 && (
            <div className="px-3 py-8 text-center text-sm text-muted-foreground">
              {t("No alerts.", "ማሳወቂያ የለም።")}
            </div>
          )}
        </div>
      </Card>
    </div>
  );
}
