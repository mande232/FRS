import { Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import * as Icons from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui-kit";
import { formatETB } from "@/lib/ethiopic";
import { useLang } from "@/lib/lang-context";
import { useT } from "@/lib/i18n";
import type { Order } from "@/lib/demo-data";
import {
  buildOrdersByStatusReport,
  type OpsOrderLifecycle,
  type OpsPaymentLabel,
  type OrdersByStatusRow,
} from "@/lib/orders-by-status-report";
import {
  defaultReportFilters,
  resolveDateRange,
  type ReportDatePreset,
  type ReportFiltersState,
} from "@/lib/reports-query";

const LIFECYCLE_TABS: Array<OpsOrderLifecycle | "All"> = [
  "All",
  "Open",
  "Receipt Generated",
  "Closed",
  "Cancelled",
  "Returned",
];

const PAYMENT_TABS: Array<OpsPaymentLabel | "All"> = ["All", "Paid", "Unpaid", "Partial"];

const DATE_PRESETS: Array<{ id: ReportDatePreset; en: string; am: string }> = [
  { id: "today", en: "Today", am: "ዛሬ" },
  { id: "yesterday", en: "Yesterday", am: "ትናንት" },
  { id: "this_week", en: "This Week", am: "ይህ ሳምንት" },
  { id: "this_month", en: "This Month", am: "ይህ ወር" },
  { id: "custom", en: "Custom", am: "ብጁ" },
];

function money(amount: number) {
  return formatETB(amount);
}

function formatDisplayDate(dateKey: string, lang: "en" | "am") {
  const date = new Date(`${dateKey}T12:00:00`);
  if (Number.isNaN(date.getTime())) return dateKey;
  return date.toLocaleDateString(lang === "am" ? "am-ET" : "en-GB", {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

function lifecycleLabel(value: OpsOrderLifecycle | "All", t: (en: string, am: string) => string) {
  if (value === "All") return t("All", "ሁሉም");
  if (value === "Open") return t("Open", "ክፍት");
  if (value === "Receipt Generated") return t("Receipt Generated", "ደረሰኝ ተፈጥሯል");
  if (value === "Closed") return t("Closed", "ተዘግቷል");
  if (value === "Cancelled") return t("Cancelled", "ተሰርዟል");
  return t("Returned", "ተመልሷል");
}

function paymentLabel(value: OpsPaymentLabel | "All", t: (en: string, am: string) => string) {
  if (value === "All") return t("All", "ሁሉም");
  if (value === "Paid") return t("Paid", "ተከፍሏል");
  if (value === "Unpaid") return t("Unpaid", "አልተከፈለም");
  if (value === "Partial") return t("Partial", "በከፊል");
  return t("Voided", "ተሰርዟል");
}

function Kpi({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone?: "ember" | "teff" | "gold" | "muted";
}) {
  const toneClass =
    tone === "ember"
      ? "border-ember/30 bg-ember/5"
      : tone === "teff"
        ? "border-teff/30 bg-teff/5"
        : tone === "gold"
          ? "border-gold/40 bg-gold/10"
          : "border-border bg-card";
  return (
    <div className={`rounded-xl border p-3 sm:p-4 ${toneClass}`}>
      <div className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
        {label}
      </div>
      <div className="mt-1 font-display text-base font-semibold tabular-nums sm:text-lg">{value}</div>
    </div>
  );
}

export type OrdersByStatusReportViewProps = {
  filters: ReportFiltersState;
  onFiltersChange: (next: ReportFiltersState) => void;
  orders: readonly Order[];
  cashiers: string[];
  waiters: string[];
  areas: string[];
  onExportCsv: () => void;
  onExportXlsx: () => void;
  onPrint: () => void;
};

export function OrdersByStatusReportView({
  filters,
  onFiltersChange,
  orders,
  cashiers,
  waiters,
  areas,
  onExportCsv,
  onExportXlsx,
  onPrint,
}: OrdersByStatusReportViewProps) {
  const t = useT();
  const lang = useLang();
  const [draft, setDraft] = useState(filters);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [lifecycleTab, setLifecycleTab] = useState<OpsOrderLifecycle | "All">("All");
  const [paymentTab, setPaymentTab] = useState<OpsPaymentLabel | "All">("All");
  const [waiterFocus, setWaiterFocus] = useState("All");
  const [search, setSearch] = useState("");
  const [view, setView] = useState<"orders" | "waiters">("orders");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const pageSize = 20;

  useEffect(() => {
    setDraft(filters);
  }, [filters]);

  const data = useMemo(
    () =>
      buildOrdersByStatusReport({
        orders,
        filters,
        lifecycleFilter: lifecycleTab,
        paymentFilter: paymentTab,
        waiterFilter: waiterFocus,
        search,
      }),
    [orders, filters, lifecycleTab, paymentTab, waiterFocus, search],
  );

  const selected = useMemo(
    () => data.orders.find((row) => row.id === selectedId) ?? null,
    [data.orders, selectedId],
  );

  const pageCount = Math.max(1, Math.ceil(data.orders.length / pageSize));
  const activePage = Math.min(page, pageCount);
  const pageRows = data.orders.slice((activePage - 1) * pageSize, activePage * pageSize);

  useEffect(() => {
    setPage(1);
  }, [lifecycleTab, paymentTab, waiterFocus, search, filters.fromDate, filters.toDate]);

  function applyPreset(preset: ReportDatePreset) {
    const range = resolveDateRange(preset, draft.fromDate, draft.toDate);
    const next = { ...filters, preset, ...range };
    setDraft(next);
    onFiltersChange(next);
  }

  function applyFilters() {
    const range = resolveDateRange(draft.preset, draft.fromDate, draft.toDate);
    const next = { ...draft, ...range };
    setDraft(next);
    onFiltersChange(next);
    setFiltersOpen(false);
  }

  function resetFilters() {
    const today = resolveDateRange("today", "", "");
    const next: ReportFiltersState = {
      ...defaultReportFilters(),
      preset: "today",
      ...today,
    };
    setDraft(next);
    onFiltersChange(next);
    setLifecycleTab("All");
    setPaymentTab("All");
    setWaiterFocus("All");
    setSearch("");
  }

  const dateHeadline =
    data.fromDate === data.toDate
      ? formatDisplayDate(data.fromDate, lang)
      : `${data.fromDate} → ${data.toDate}`;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="font-display text-xl font-semibold sm:text-2xl">{t("Orders", "ትዕዛዞች")}</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            {t("View and manage restaurant orders", "የሬስቶራንት ትዕዛዞችን ይመልከቱ እና ያስተዳድሩ")}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link
            to="/app/pos"
            className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-ember px-3 text-sm font-semibold text-ember-foreground"
          >
            <Icons.Plus className="size-4" />
            {t("New POS Order", "አዲስ የ POS ትዕዛዝ")}
          </Link>
          <Button type="button" size="sm" variant="outline" className="gap-1.5" onClick={onExportCsv}>
            <Icons.Download className="size-4" />
            {t("Export", "ላክ")}
          </Button>
          <Button type="button" size="sm" variant="outline" className="gap-1.5" onClick={onExportXlsx}>
            <Icons.FileSpreadsheet className="size-4" />
            XLSX
          </Button>
          <Button type="button" size="sm" variant="outline" className="gap-1.5" onClick={onPrint}>
            <Icons.Printer className="size-4" />
            {t("Print", "አትም")}
          </Button>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        {DATE_PRESETS.map((preset) => (
          <button
            key={preset.id}
            type="button"
            onClick={() => applyPreset(preset.id)}
            className={`h-9 rounded-lg px-3 text-xs font-semibold transition-colors ${
              filters.preset === preset.id
                ? "bg-foreground text-background"
                : "border border-border bg-card text-muted-foreground hover:bg-surface-2 hover:text-foreground"
            }`}
          >
            {t(preset.en, preset.am)}
          </button>
        ))}
        <div className="text-sm font-semibold text-muted-foreground">
          {filters.preset === "today" ? `${t("Today", "ዛሬ")} — ` : null}
          {dateHeadline}
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
        <Kpi label={t("Total Orders", "ጠቅላላ ትዕዛዞች")} value={String(data.totalOrders)} tone="ember" />
        <Kpi label={t("Open", "ክፍት")} value={String(data.openCount)} tone="gold" />
        <Kpi label={t("Closed", "ተዘግቷል")} value={String(data.closedCount)} tone="teff" />
        <Kpi label={t("Total Value", "ጠቅላላ ዋጋ")} value={money(data.totalValue)} />
        <Kpi label={t("Outstanding", "ቀሪ")} value={money(data.outstanding)} tone="gold" />
      </div>

      <div className="flex flex-wrap gap-1.5">
        {LIFECYCLE_TABS.map((tab) => (
          <button
            key={tab}
            type="button"
            onClick={() => setLifecycleTab(tab)}
            className={`h-9 rounded-lg px-3 text-xs font-semibold transition-colors ${
              lifecycleTab === tab
                ? "bg-ember text-ember-foreground"
                : "border border-border bg-card text-muted-foreground hover:bg-surface-2 hover:text-foreground"
            }`}
          >
            {lifecycleLabel(tab, t)} {data.lifecycleCounts[tab]}
          </button>
        ))}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          {t("Payment", "ክፍያ")}
        </span>
        {PAYMENT_TABS.map((tab) => (
          <button
            key={tab}
            type="button"
            onClick={() => setPaymentTab(tab)}
            className={`h-8 rounded-full px-3 text-xs font-semibold transition-colors ${
              paymentTab === tab
                ? "bg-foreground text-background"
                : "border border-border bg-card text-muted-foreground hover:bg-surface-2"
            }`}
          >
            {paymentLabel(tab, t)}
            {tab === "All" ? "" : ` ${data.paymentCounts[tab]}`}
          </button>
        ))}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-[220px] flex-1">
          <Icons.Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder={t("Search order, table, waiter...", "ትዕዛዝ፣ ጠረጴዛ፣ አስተናጋጅ ፈልግ...")}
            className="h-10 w-full rounded-lg border border-border bg-card pl-9 pr-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring/40"
          />
        </div>
        <Button
          type="button"
          size="sm"
          variant="outline"
          className="gap-1.5"
          onClick={() => setFiltersOpen((open) => !open)}
        >
          <Icons.SlidersHorizontal className="size-4" />
          {t("Filters", "ማጣሪያዎች")}
        </Button>
        <div className="inline-flex rounded-lg border border-border bg-card p-1">
          <button
            type="button"
            onClick={() => setView("orders")}
            className={`h-8 rounded-md px-3 text-xs font-semibold ${
              view === "orders" ? "bg-foreground text-background" : "text-muted-foreground"
            }`}
          >
            {t("Orders", "ትዕዛዞች")}
          </button>
          <button
            type="button"
            onClick={() => setView("waiters")}
            className={`h-8 rounded-md px-3 text-xs font-semibold ${
              view === "waiters" ? "bg-foreground text-background" : "text-muted-foreground"
            }`}
          >
            {t("By Waiter", "በአስተናጋጅ")}
          </button>
        </div>
        {waiterFocus !== "All" ? (
          <button
            type="button"
            onClick={() => setWaiterFocus("All")}
            className="inline-flex h-8 items-center gap-1 rounded-full border border-ember/30 bg-ember/10 px-3 text-xs font-semibold text-ember"
          >
            {waiterFocus}
            <Icons.X className="size-3.5" />
          </button>
        ) : null}
      </div>

      {filtersOpen ? (
        <Card className="!p-4">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            <label className="text-sm">
              <span className="text-xs text-muted-foreground">{t("From", "ከ")}</span>
              <input
                type="date"
                value={draft.fromDate}
                onChange={(event) => setDraft({ ...draft, preset: "custom", fromDate: event.target.value })}
                className="mt-1 h-9 w-full rounded-lg border border-border bg-card px-3 text-sm"
              />
            </label>
            <label className="text-sm">
              <span className="text-xs text-muted-foreground">{t("To", "እስከ")}</span>
              <input
                type="date"
                value={draft.toDate}
                onChange={(event) => setDraft({ ...draft, preset: "custom", toDate: event.target.value })}
                className="mt-1 h-9 w-full rounded-lg border border-border bg-card px-3 text-sm"
              />
            </label>
            <FilterSelect
              label={t("Cashier", "ካሸር")}
              value={draft.cashier}
              onChange={(value) => setDraft({ ...draft, cashier: value })}
              options={cashiers}
              allLabel={t("All Cashiers", "ሁሉም ካሸሮች")}
            />
            <FilterSelect
              label={t("Waiter", "አስተናጋጅ")}
              value={draft.waiter}
              onChange={(value) => setDraft({ ...draft, waiter: value })}
              options={waiters}
              allLabel={t("All Waiters", "ሁሉም አስተናጋጆች")}
            />
            <FilterSelect
              label={t("Area", "ክፍል")}
              value={draft.area}
              onChange={(value) => setDraft({ ...draft, area: value })}
              options={areas}
              allLabel={t("All Areas", "ሁሉም ክፍሎች")}
            />
          </div>
          <div className="mt-4 flex flex-wrap gap-2">
            <Button type="button" onClick={applyFilters}>
              {t("Apply", "ተግብር")}
            </Button>
            <Button type="button" variant="outline" onClick={resetFilters}>
              {t("Reset", "እንደነበር መልስ")}
            </Button>
          </div>
        </Card>
      ) : null}

      {data.isEmpty ? (
        <Card className="p-10 text-center">
          <Icons.ClipboardList className="mx-auto mb-3 size-10 text-muted-foreground" />
          <h3 className="font-display text-lg font-semibold">
            {t("No orders for this period.", "ለዚህ ጊዜ ትዕዛዝ የለም።")}
          </h3>
          <p className="mt-2 text-sm text-muted-foreground">
            {t("Create an order in POS to see it here.", "ትዕዛዝ ለማየት ከ POS ይፍጠሩ።")}
          </p>
          <Link
            to="/app/pos"
            className="mt-5 inline-flex h-11 items-center justify-center rounded-lg bg-ember px-5 text-sm font-semibold text-ember-foreground"
          >
            {t("Go to POS", "ወደ POS ሂድ")}
          </Link>
        </Card>
      ) : view === "waiters" ? (
        <Card className="!p-0 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[720px] text-sm">
              <thead className="bg-surface-2 text-xs uppercase tracking-wide text-muted-foreground">
                <tr>
                  <th className="px-4 py-3 text-left">{t("Waiter", "አስተናጋጅ")}</th>
                  <th className="px-4 py-3 text-right">{t("Open Orders", "ክፍት ትዕዛዞች")}</th>
                  <th className="px-4 py-3 text-right">{t("Total Orders", "ጠቅላላ ትዕዛዞች")}</th>
                  <th className="px-4 py-3 text-right">{t("Sales", "ሽያጭ")}</th>
                  <th className="px-4 py-3 text-right">{t("Paid", "የተከፈለ")}</th>
                  <th className="px-4 py-3 text-right">{t("Outstanding", "ቀሪ")}</th>
                </tr>
              </thead>
              <tbody>
                {data.byWaiter.map((row) => (
                  <tr
                    key={row.waiter}
                    className="cursor-pointer border-t border-border hover:bg-surface-2/60"
                    onClick={() => {
                      setWaiterFocus(row.waiter);
                      setView("orders");
                    }}
                  >
                    <td className="px-4 py-2.5 font-semibold">{row.waiter}</td>
                    <td className="px-4 py-2.5 text-right font-mono">{row.openOrders}</td>
                    <td className="px-4 py-2.5 text-right font-mono">{row.totalOrders}</td>
                    <td className="px-4 py-2.5 text-right font-mono">{money(row.sales)}</td>
                    <td className="px-4 py-2.5 text-right font-mono">{money(row.paid)}</td>
                    <td className="px-4 py-2.5 text-right font-mono font-semibold text-ember">
                      {money(row.outstanding)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      ) : (
        <Card className="!p-0 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[980px] text-sm">
              <thead className="bg-surface-2 text-xs uppercase tracking-wide text-muted-foreground">
                <tr>
                  <th className="px-4 py-3 text-left">{t("Order", "ትዕዛዝ")}</th>
                  <th className="px-4 py-3 text-left">{t("Time", "ሰዓት")}</th>
                  <th className="px-4 py-3 text-left">{t("Table", "ጠረጴዛ")}</th>
                  <th className="px-4 py-3 text-left">{t("Waiter", "አስተናጋጅ")}</th>
                  <th className="px-4 py-3 text-right">{t("Items", "እቃዎች")}</th>
                  <th className="px-4 py-3 text-right">{t("Total", "ድምር")}</th>
                  <th className="px-4 py-3 text-right">{t("Paid", "የተከፈለ")}</th>
                  <th className="px-4 py-3 text-right">{t("Balance", "ቀሪ")}</th>
                  <th className="px-4 py-3 text-left">{t("Payment", "ክፍያ")}</th>
                  <th className="px-4 py-3 text-left">{t("Status", "ሁኔታ")}</th>
                </tr>
              </thead>
              <tbody>
                {pageRows.map((row) => (
                  <tr
                    key={row.id}
                    className="cursor-pointer border-t border-border hover:bg-surface-2/60"
                    onClick={() => setSelectedId(row.id)}
                  >
                    <td className="px-4 py-2.5 font-mono font-semibold text-ember">{row.orderNo}</td>
                    <td className="px-4 py-2.5">{row.time}</td>
                    <td className="px-4 py-2.5">{row.table}</td>
                    <td className="px-4 py-2.5">{row.waiter}</td>
                    <td className="px-4 py-2.5 text-right font-mono">{Math.round(row.itemCount)}</td>
                    <td className="px-4 py-2.5 text-right font-mono">{money(row.total)}</td>
                    <td className="px-4 py-2.5 text-right font-mono">{money(row.paid)}</td>
                    <td className="px-4 py-2.5 text-right font-mono font-semibold">{money(row.balance)}</td>
                    <td className="px-4 py-2.5">
                      <PaymentBadge value={row.payment} t={t} />
                    </td>
                    <td className="px-4 py-2.5">
                      <LifecycleBadge value={row.lifecycle} t={t} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border px-4 py-3 text-xs text-muted-foreground">
            <span>
              {t("Showing", "እያሳየ")} {(activePage - 1) * pageSize + (pageRows.length ? 1 : 0)}–
              {(activePage - 1) * pageSize + pageRows.length} {t("of", "ከ")} {data.orders.length}
            </span>
            <div className="flex items-center gap-2">
              <Button
                type="button"
                size="sm"
                variant="outline"
                disabled={activePage <= 1}
                onClick={() => setPage((value) => Math.max(1, value - 1))}
              >
                {t("Prev", "ቀዳሚ")}
              </Button>
              <span>
                {activePage}/{pageCount}
              </span>
              <Button
                type="button"
                size="sm"
                variant="outline"
                disabled={activePage >= pageCount}
                onClick={() => setPage((value) => Math.min(pageCount, value + 1))}
              >
                {t("Next", "ቀጣይ")}
              </Button>
            </div>
          </div>
        </Card>
      )}

      {selected ? (
        <OrderDetailDrawer order={selected} onClose={() => setSelectedId(null)} t={t} />
      ) : null}
    </div>
  );
}

function FilterSelect({
  label,
  value,
  onChange,
  options,
  allLabel,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: string[];
  allLabel: string;
}) {
  return (
    <label className="text-sm">
      <span className="text-xs text-muted-foreground">{label}</span>
      <select
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="mt-1 h-9 w-full rounded-lg border border-border bg-card px-3 text-sm"
      >
        <option value="All">{allLabel}</option>
        {options.map((name) => (
          <option key={name} value={name}>
            {name}
          </option>
        ))}
      </select>
    </label>
  );
}

function PaymentBadge({
  value,
  t,
}: {
  value: OpsPaymentLabel;
  t: (en: string, am: string) => string;
}) {
  const tone =
    value === "Paid"
      ? "text-teff"
      : value === "Partial"
        ? "text-gold-foreground"
        : value === "Voided"
          ? "text-destructive"
          : "text-ember";
  return <span className={`font-semibold ${tone}`}>{paymentLabel(value, t)}</span>;
}

function LifecycleBadge({
  value,
  t,
}: {
  value: OpsOrderLifecycle;
  t: (en: string, am: string) => string;
}) {
  const tone =
    value === "Open"
      ? "text-ember"
      : value === "Receipt Generated"
        ? "text-gold-foreground"
        : value === "Closed"
          ? "text-teff"
          : "text-muted-foreground";
  return <span className={`font-semibold ${tone}`}>{lifecycleLabel(value, t)}</span>;
}

function OrderDetailDrawer({
  order,
  onClose,
  t,
}: {
  order: OrdersByStatusRow;
  onClose: () => void;
  t: (en: string, am: string) => string;
}) {
  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-foreground/40 backdrop-blur-sm">
      <button type="button" className="flex-1 cursor-default" aria-label={t("Close", "ዝጋ")} onClick={onClose} />
      <aside className="flex h-full w-full max-w-md flex-col border-l border-border bg-card shadow-xl">
        <div className="flex items-start justify-between gap-3 border-b border-border p-4">
          <div>
            <div className="font-mono text-lg font-semibold">{order.orderNo}</div>
            <div className="mt-1 text-sm text-muted-foreground">
              {order.table} · {order.time}
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="grid size-8 place-items-center rounded-lg hover:bg-surface-2"
            aria-label={t("Close", "ዝጋ")}
          >
            <Icons.X className="size-4" />
          </button>
        </div>

        <div className="flex-1 space-y-4 overflow-y-auto p-4">
          <div className="grid grid-cols-2 gap-3 text-sm">
            <Info label={t("Table", "ጠረጴዛ")} value={order.table} />
            <Info label={t("Waiter", "አስተናጋጅ")} value={order.waiter} />
            <Info label={t("Opened", "የተከፈተ")} value={order.time} />
            <Info label={t("Cashier", "ካሸር")} value={order.cashier} />
          </div>

          <div>
            <h3 className="mb-2 text-sm font-semibold">{t("Items", "እቃዎች")}</h3>
            <ul className="space-y-1.5 text-sm">
              {order.items.map((item, index) => (
                <li key={`${item.name}-${index}`} className="flex justify-between gap-3">
                  <span>
                    {item.name} × {item.qty}
                  </span>
                  <span className="font-mono">{money(item.amount)}</span>
                </li>
              ))}
            </ul>
          </div>

          <div className="space-y-1.5 border-t border-border pt-3 text-sm">
            <div className="flex justify-between gap-3">
              <span className="text-muted-foreground">{t("Subtotal", "ንዑስ ድምር")}</span>
              <span className="font-mono font-semibold">{money(order.total)}</span>
            </div>
            <div className="flex justify-between gap-3">
              <span className="text-muted-foreground">{t("Paid", "የተከፈለ")}</span>
              <span className="font-mono">{money(order.paid)}</span>
            </div>
            <div className="flex justify-between gap-3">
              <span className="text-muted-foreground">{t("Balance", "ቀሪ")}</span>
              <span className="font-mono font-semibold text-ember">{money(order.balance)}</span>
            </div>
            <div className="flex justify-between gap-3 pt-1">
              <span className="text-muted-foreground">{t("Payment", "ክፍያ")}</span>
              <PaymentBadge value={order.payment} t={t} />
            </div>
            <div className="flex justify-between gap-3">
              <span className="text-muted-foreground">{t("Order", "ትዕዛዝ")}</span>
              <LifecycleBadge value={order.lifecycle} t={t} />
            </div>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-2 border-t border-border p-4">
          <Link
            to="/app/pos"
            search={{ orderId: order.id, mode: "add" }}
            className="inline-flex h-10 items-center justify-center rounded-lg border border-border text-sm font-semibold hover:bg-surface-2"
          >
            {t("Add Items", "እቃ ጨምር")}
          </Link>
          <Link
            to="/app/orders"
            className="inline-flex h-10 items-center justify-center rounded-lg border border-border text-sm font-semibold hover:bg-surface-2"
          >
            {t("Print Receipt", "ደረሰኝ አትም")}
          </Link>
          <Link
            to="/app/payments"
            className="inline-flex h-10 items-center justify-center rounded-lg bg-ember text-sm font-semibold text-ember-foreground"
          >
            {t("Record Payment", "ክፍያ መዝግብ")}
          </Link>
          <Link
            to="/app/orders"
            className="inline-flex h-10 items-center justify-center rounded-lg border border-border text-sm font-semibold hover:bg-surface-2"
          >
            {t("Transfer", "አስተላልፍ")}
          </Link>
          <Link
            to="/app/orders"
            className="inline-flex h-10 items-center justify-center rounded-lg border border-border text-sm font-semibold hover:bg-surface-2"
          >
            {t("Close Order", "ትዕዛዝ ዝጋ")}
          </Link>
          <Link
            to="/app/orders"
            className="inline-flex h-10 items-center justify-center rounded-lg border border-border text-sm font-semibold text-destructive hover:bg-surface-2"
          >
            {t("Cancel", "ሰርዝ")}
          </Link>
        </div>
      </aside>
    </div>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="mt-0.5 font-semibold">{value}</div>
    </div>
  );
}
