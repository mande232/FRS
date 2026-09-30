import { Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import * as Icons from "lucide-react";
import { Bar, BarChart, CartesianGrid, XAxis, YAxis } from "recharts";
import { Button } from "@/components/ui/button";
import { ChartContainer, ChartTooltip, ChartTooltipContent } from "@/components/ui/chart";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card } from "@/components/ui-kit";
import { formatETB } from "@/lib/ethiopic";
import { useLang } from "@/lib/lang-context";
import { useT } from "@/lib/i18n";
import {
  buildPeriodSalesReport,
  type DailySalesItemRow,
  type DailySalesOrderRow,
} from "@/lib/daily-sales-report";
import type { Order, SalesRecord } from "@/lib/demo-data";
import {
  defaultReportFilters,
  resolveDateRange,
  type ReportFiltersState,
} from "@/lib/reports-query";
import { activeBranchNames, loadCachedBranches } from "@/lib/branches";
import { weekStartKeyFromDateKey } from "@/lib/sales-analytics";

export type SalesPeriod = "day" | "week" | "month";

type SortKey = "product" | "qty" | "sales";

function shiftDateKey(date: string, days: number) {
  const next = new Date(`${date}T12:00:00`);
  next.setDate(next.getDate() + days);
  const y = next.getFullYear();
  const m = String(next.getMonth() + 1).padStart(2, "0");
  const d = String(next.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function monthStartKey(date: string) {
  return `${date.slice(0, 7)}-01`;
}

function monthEndKey(date: string) {
  const next = new Date(`${date.slice(0, 7)}-01T12:00:00`);
  next.setMonth(next.getMonth() + 1);
  next.setDate(0);
  const y = next.getFullYear();
  const m = String(next.getMonth() + 1).padStart(2, "0");
  const d = String(next.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function shiftMonthKey(date: string, months: number) {
  const next = new Date(`${monthStartKey(date)}T12:00:00`);
  next.setMonth(next.getMonth() + months);
  const y = next.getFullYear();
  const m = String(next.getMonth() + 1).padStart(2, "0");
  return `${y}-${m}-01`;
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

function formatShortDate(dateKey: string, lang: "en" | "am") {
  const date = new Date(`${dateKey}T12:00:00`);
  if (Number.isNaN(date.getTime())) return dateKey;
  return date.toLocaleDateString(lang === "am" ? "am-ET" : "en-GB", {
    month: "short",
    day: "numeric",
  });
}

function formatMonthLabel(dateKey: string, lang: "en" | "am") {
  const date = new Date(`${monthStartKey(dateKey)}T12:00:00`);
  if (Number.isNaN(date.getTime())) return dateKey.slice(0, 7);
  return date.toLocaleDateString(lang === "am" ? "am-ET" : "en-GB", {
    month: "long",
    year: "numeric",
  });
}

function periodCopy(period: SalesPeriod, t: (en: string, am: string) => string) {
  if (period === "week") {
    return {
      title: t("Weekly Sales", "የሳምንት ሽያጭ"),
      subtitle: t("Sales activity for the selected week", "ለተመረጠው ሳምንት የሽያጭ እንቅስቃሴ"),
      chartTitle: t("Sales by Day", "በቀን ሽያጭ"),
      chartEmpty: t("No daily sales yet.", "ዕለታዊ ሽያጭ ገና የለም።"),
      jumpLabel: t("This week", "ይህ ሳምንት"),
      prevAria: t("Previous week", "ቀዳሚ ሳምንት"),
      nextAria: t("Next week", "ቀጣይ ሳምንት"),
    };
  }
  if (period === "month") {
    return {
      title: t("Monthly Sales", "የወር ሽያጭ"),
      subtitle: t("Sales activity for the selected month", "ለተመረጠው ወር የሽያጭ እንቅስቃሴ"),
      chartTitle: t("Sales by Day", "በቀን ሽያጭ"),
      chartEmpty: t("No daily sales yet.", "ዕለታዊ ሽያጭ ገና የለም።"),
      jumpLabel: t("This month", "ይህ ወር"),
      prevAria: t("Previous month", "ቀዳሚ ወር"),
      nextAria: t("Next month", "ቀጣይ ወር"),
    };
  }
  return {
    title: t("Daily Sales", "የዕለት ሽያጭ"),
    subtitle: t("Sales activity for the selected day", "ለተመረጠው ቀን የሽያጭ እንቅስቃሴ"),
    chartTitle: t("Sales by Hour", "በሰዓት ሽያጭ"),
    chartEmpty: t("No hourly sales yet.", "የሰዓት ሽያጭ ገና የለም።"),
    jumpLabel: t("Today", "ዛሬ"),
    prevAria: t("Previous day", "ቀዳሚ ቀን"),
    nextAria: t("Next day", "ቀጣይ ቀን"),
  };
}

function money(amount: number) {
  return formatETB(amount);
}

function KpiCard({
  label,
  value,
  tone,
  prominent,
}: {
  label: string;
  value: string;
  tone?: "ember" | "teff" | "gold" | "muted";
  prominent?: boolean;
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
    <div
      className={`rounded-xl border p-4 ${toneClass} ${prominent ? "shadow-sm" : ""}`}
    >
      <div className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
        {label}
      </div>
      <div
        className={`mt-1 font-display font-semibold tabular-nums tracking-normal ${
          prominent ? "text-base sm:text-lg" : "text-sm sm:text-base"
        }`}
      >
        {value}
      </div>
    </div>
  );
}

export type DailySalesReportViewProps = {
  period?: SalesPeriod;
  filters: ReportFiltersState;
  onFiltersChange: (next: ReportFiltersState) => void;
  orders: readonly Order[];
  salesRecords: readonly SalesRecord[];
  cashiers: string[];
  waiters: string[];
  stations: string[];
  categories: string[];
  areas: string[];
  onExportCsv: () => void;
  onExportXlsx: () => void;
  onPrint: () => void;
};

export function DailySalesReportView({
  period = "day",
  filters,
  onFiltersChange,
  orders,
  salesRecords,
  cashiers,
  waiters,
  stations,
  categories,
  areas,
  onExportCsv,
  onExportXlsx,
  onPrint,
}: DailySalesReportViewProps) {
  const t = useT();
  const lang = useLang();
  const copy = periodCopy(period, t);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [draft, setDraft] = useState(filters);
  const [tab, setTab] = useState("items");
  const [itemSearch, setItemSearch] = useState("");
  const [sortKey, setSortKey] = useState<SortKey>("qty");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");

  useEffect(() => {
    setDraft(filters);
  }, [filters]);

  const today = resolveDateRange("today", "", "").fromDate;
  const thisWeek = resolveDateRange("this_week", "", "");
  const thisMonth = resolveDateRange("this_month", "", "");

  const fromDate =
    period === "day"
      ? filters.fromDate || filters.toDate || today
      : period === "week"
        ? weekStartKeyFromDateKey(filters.fromDate || today)
        : monthStartKey(filters.fromDate || today);
  const toDate =
    period === "day"
      ? fromDate
      : period === "week"
        ? fromDate === thisWeek.fromDate
          ? today
          : shiftDateKey(fromDate, 6)
        : fromDate === thisMonth.fromDate
          ? today
          : monthEndKey(fromDate);

  const isCurrentPeriod =
    period === "day"
      ? fromDate === today
      : period === "week"
        ? fromDate === thisWeek.fromDate
        : fromDate === thisMonth.fromDate;

  const canGoNext =
    period === "day"
      ? fromDate < today
      : period === "week"
        ? fromDate < thisWeek.fromDate
        : fromDate < thisMonth.fromDate;

  const branchOptions = useMemo(() => activeBranchNames(loadCachedBranches()), []);

  const data = useMemo(
    () =>
      buildPeriodSalesReport({
        fromDate,
        toDate,
        orders,
        salesRecords,
        filters: { ...filters, fromDate, toDate },
      }),
    [filters, fromDate, orders, salesRecords, toDate],
  );

  function setPeriodRange(nextFrom: string, nextTo: string, preset?: ReportFiltersState["preset"]) {
    const next: ReportFiltersState = {
      ...filters,
      preset: preset ?? "custom",
      fromDate: nextFrom,
      toDate: nextTo,
    };
    setDraft(next);
    onFiltersChange(next);
  }

  function goPrev() {
    if (period === "day") {
      const day = shiftDateKey(fromDate, -1);
      setPeriodRange(day, day, day === today ? "today" : "custom");
      return;
    }
    if (period === "week") {
      const start = shiftDateKey(fromDate, -7);
      setPeriodRange(start, shiftDateKey(start, 6), start === thisWeek.fromDate ? "this_week" : "custom");
      return;
    }
    const start = shiftMonthKey(fromDate, -1);
    setPeriodRange(start, monthEndKey(start), start === thisMonth.fromDate ? "this_month" : "custom");
  }

  function goNext() {
    if (!canGoNext) return;
    if (period === "day") {
      const day = shiftDateKey(fromDate, 1);
      setPeriodRange(day, day, day === today ? "today" : "custom");
      return;
    }
    if (period === "week") {
      const start = shiftDateKey(fromDate, 7);
      setPeriodRange(start, shiftDateKey(start, 6), start === thisWeek.fromDate ? "this_week" : "custom");
      return;
    }
    const start = shiftMonthKey(fromDate, 1);
    setPeriodRange(start, monthEndKey(start), start === thisMonth.fromDate ? "this_month" : "custom");
  }

  function jumpToCurrent() {
    if (period === "day") {
      setPeriodRange(today, today, "today");
      return;
    }
    if (period === "week") {
      setPeriodRange(thisWeek.fromDate, thisWeek.toDate, "this_week");
      return;
    }
    setPeriodRange(thisMonth.fromDate, thisMonth.toDate, "this_month");
  }

  function setCustomDay(day: string) {
    if (period === "day") {
      setPeriodRange(day, day, day === today ? "today" : "custom");
      return;
    }
    if (period === "week") {
      const start = weekStartKeyFromDateKey(day);
      setPeriodRange(start, shiftDateKey(start, 6), start === thisWeek.fromDate ? "this_week" : "custom");
      return;
    }
    const start = monthStartKey(day);
    setPeriodRange(start, monthEndKey(start), start === thisMonth.fromDate ? "this_month" : "custom");
  }

  function applyFilters() {
    const next = {
      ...draft,
      preset: "custom" as const,
      fromDate,
      toDate,
    };
    setDraft(next);
    onFiltersChange(next);
    setFiltersOpen(false);
  }

  function resetFilters() {
    const base = defaultReportFilters();
    const next: ReportFiltersState = {
      ...base,
      preset: period === "day" ? "today" : period === "week" ? "this_week" : "this_month",
      fromDate,
      toDate,
    };
    setDraft(next);
    onFiltersChange(next);
  }

  function toggleSort(key: SortKey) {
    if (sortKey === key) {
      setSortDir((dir) => (dir === "asc" ? "desc" : "asc"));
      return;
    }
    setSortKey(key);
    setSortDir(key === "product" ? "asc" : "desc");
  }

  const filteredItems = useMemo(() => {
    const q = itemSearch.trim().toLowerCase();
    let rows = data.items;
    if (q) {
      rows = rows.filter(
        (row) =>
          row.product.toLowerCase().includes(q) ||
          row.category.toLowerCase().includes(q) ||
          row.station.toLowerCase().includes(q),
      );
    }
    const sorted = [...rows].sort((a, b) => {
      const dir = sortDir === "asc" ? 1 : -1;
      if (sortKey === "product") return a.product.localeCompare(b.product) * dir;
      if (sortKey === "qty") return (a.qty - b.qty) * dir;
      return (a.sales - b.sales) * dir;
    });
    return sorted;
  }, [data.items, itemSearch, sortDir, sortKey]);

  const itemsFooterQty = filteredItems.reduce((sum, row) => sum + row.qty, 0);
  const itemsFooterSales = filteredItems.reduce((sum, row) => sum + row.sales, 0);

  const periodLabel =
    period === "day"
      ? formatDisplayDate(fromDate, lang)
      : period === "week"
        ? `${formatShortDate(fromDate, lang)} – ${formatShortDate(toDate, lang)}`
        : formatMonthLabel(fromDate, lang);

  const emptyMessage =
    period === "week"
      ? t(`No sales recorded for this week.`, `ለዚህ ሳምንት ሽያጭ አልተመዘገበም።`)
      : period === "month"
        ? t(`No sales recorded for ${formatMonthLabel(fromDate, lang)}.`, `ለ ${formatMonthLabel(fromDate, lang)} ሽያጭ አልተመዘገበም።`)
        : t(
            `No sales recorded for ${formatDisplayDate(fromDate, lang)}.`,
            `ለ ${formatDisplayDate(fromDate, lang)} ሽያጭ አልተመዘገበም።`,
          );

  const headerProps = {
    copy,
    periodLabel,
    isCurrentPeriod,
    canGoNext,
    filtersOpen,
    setFiltersOpen,
    goPrev,
    goNext,
    jumpToCurrent,
    setCustomDay,
    fromDate,
    today,
    onExportCsv,
    onExportXlsx,
    onPrint,
    t,
  };

  if (data.isEmpty) {
    return (
      <div className="space-y-4">
        <PeriodSalesHeader {...headerProps} />
        <FilterDrawer
          open={filtersOpen}
          draft={draft}
          setDraft={setDraft}
          branchOptions={branchOptions}
          cashiers={cashiers}
          waiters={waiters}
          stations={stations}
          categories={categories}
          areas={areas}
          onApply={applyFilters}
          onReset={resetFilters}
          t={t}
        />
        <Card className="p-10 text-center">
          <Icons.ClipboardList className="mx-auto mb-3 size-10 text-muted-foreground" />
          <h3 className="font-display text-lg font-semibold">{emptyMessage}</h3>
          <p className="mx-auto mt-2 max-w-md text-sm text-muted-foreground">
            {t(
              "Once orders are created, their sales will appear here automatically.",
              "ትዕዛዞች ሲፈጠሩ ሽያጮቻቸው እዚህ በራስ-ሰር ይታያሉ።",
            )}
          </p>
          <Link
            to="/app/pos"
            className="mt-5 inline-flex h-11 items-center justify-center rounded-lg bg-ember px-5 text-sm font-semibold text-ember-foreground"
          >
            {t("Go to POS", "ወደ POS ሂድ")}
          </Link>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <PeriodSalesHeader {...headerProps} />

      <FilterDrawer
        open={filtersOpen}
        draft={draft}
        setDraft={setDraft}
        branchOptions={branchOptions}
        cashiers={cashiers}
        waiters={waiters}
        stations={stations}
        categories={categories}
        areas={areas}
        onApply={applyFilters}
        onReset={resetFilters}
        t={t}
      />

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
        <KpiCard
          label={t("Total Sales", "ጠቅላላ ሽያጭ")}
          value={money(data.totalSales)}
          tone="ember"
          prominent
        />
        <KpiCard label={t("Paid", "የተከፈለ")} value={money(data.paid)} tone="teff" prominent />
        <KpiCard label={t("Unpaid", "ያልተከፈለ")} value={money(data.unpaid)} tone="gold" prominent />
        <KpiCard label={t("Orders", "ትዕዛዞች")} value={String(data.orderCount)} />
        <KpiCard
          label={t("Items Sold", "የተሸጡ እቃዎች")}
          value={String(Math.round(data.itemsSoldQty))}
        />
      </div>

      <Tabs value={tab} onValueChange={setTab} className="space-y-3">
        <TabsList className="h-10 w-full justify-start gap-1 bg-surface-2 p-1 sm:w-auto">
          <TabsTrigger value="summary" className="px-4">
            {t("Summary", "ማጠቃለያ")}
          </TabsTrigger>
          <TabsTrigger value="items" className="px-4">
            {t("Items Sold", "የተሸጡ እቃዎች")}
          </TabsTrigger>
          <TabsTrigger value="orders" className="px-4">
            {t("Orders", "ትዕዛዞች")}
          </TabsTrigger>
        </TabsList>

        <TabsContent value="summary" className="space-y-4">
          <div className="grid gap-4 lg:grid-cols-2">
            <Card className="!p-4">
              <h3 className="font-display text-sm font-semibold">{t("Sales", "ሽያጭ")}</h3>
              <dl className="mt-3 space-y-2 text-sm">
                <SummaryRow label={t("Gross Sales", "ጠቅላላ ሽያጭ")} value={money(data.totalSales)} />
                <SummaryRow label={t("Paid", "የተከፈለ")} value={money(data.paid)} />
                <SummaryRow label={t("Outstanding", "ቀሪ")} value={money(data.unpaid)} />
                <SummaryRow label={t("Orders", "ትዕዛዞች")} value={String(data.orderCount)} />
                <SummaryRow
                  label={t("Items Sold", "የተሸጡ እቃዎች")}
                  value={String(Math.round(data.itemsSoldQty))}
                />
              </dl>
            </Card>
            <Card className="!p-4">
              <h3 className="font-display text-sm font-semibold">
                {t("Payment Status", "የክፍያ ሁኔታ")}
              </h3>
              <div className="mt-3 overflow-x-auto">
                <table className="w-full text-sm">
                  <tbody>
                    <PaymentStatusRow
                      label={t("Paid Orders", "የተከፈሉ ትዕዛዞች")}
                      count={data.paymentStatus.paidOrders.count}
                      amount={money(data.paymentStatus.paidOrders.amount)}
                    />
                    <PaymentStatusRow
                      label={t("Unpaid Orders", "ያልተከፈሉ ትዕዛዞች")}
                      count={data.paymentStatus.unpaidOrders.count}
                      amount={money(data.paymentStatus.unpaidOrders.amount)}
                    />
                    <PaymentStatusRow
                      label={t("Partial Orders", "በከፊል የተከፈሉ")}
                      count={data.paymentStatus.partialOrders.count}
                      amount={`${money(data.paymentStatus.partialOrders.amount)} ${t("outstanding", "ቀሪ")}`}
                    />
                  </tbody>
                </table>
              </div>
            </Card>
          </div>

          <Card className="!p-4">
            <h3 className="mb-2 font-display text-sm font-semibold">{copy.chartTitle}</h3>
            {data.trend.length > 0 ? (
              <ChartContainer
                className="h-40 w-full"
                config={{
                  value: {
                    label: t("Sales", "ሽያጭ"),
                    color: "var(--ember)",
                  },
                }}
              >
                <BarChart data={data.trend} margin={{ left: 0, right: 8, top: 4, bottom: 0 }}>
                  <CartesianGrid vertical={false} strokeDasharray="3 3" />
                  <XAxis dataKey="label" tickLine={false} axisLine={false} tickMargin={6} tick={{ fontSize: 11 }} />
                  <YAxis tickLine={false} axisLine={false} width={48} tick={{ fontSize: 10 }} />
                  <ChartTooltip cursor={false} content={<ChartTooltipContent indicator="dot" />} />
                  <Bar dataKey="value" fill="var(--color-value)" radius={[3, 3, 0, 0]} />
                </BarChart>
              </ChartContainer>
            ) : (
              <p className="py-6 text-center text-sm text-muted-foreground">{copy.chartEmpty}</p>
            )}
          </Card>
        </TabsContent>

        <TabsContent value="items">
          <Card className="!p-0 overflow-hidden">
            <div className="flex flex-wrap items-center gap-2 border-b border-border p-3">
              <div className="relative min-w-[200px] flex-1">
                <Icons.Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                <input
                  value={itemSearch}
                  onChange={(event) => setItemSearch(event.target.value)}
                  placeholder={t("Search products...", "ምርቶችን ፈልግ...")}
                  className="h-10 w-full rounded-lg border border-border bg-card pl-9 pr-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring/40"
                />
              </div>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[640px] text-sm">
                <thead className="bg-surface-2 text-xs uppercase tracking-wide text-muted-foreground">
                  <tr>
                    <SortableTh
                      label={t("Product", "ምርት")}
                      active={sortKey === "product"}
                      dir={sortDir}
                      onClick={() => toggleSort("product")}
                    />
                    <th className="px-4 py-3 text-left">{t("Category", "ምድብ")}</th>
                    <th className="px-4 py-3 text-left">{t("Station", "ጣቢያ")}</th>
                    <SortableTh
                      label={t("Qty Sold", "የተሸጠ ብዛት")}
                      active={sortKey === "qty"}
                      dir={sortDir}
                      align="right"
                      onClick={() => toggleSort("qty")}
                    />
                    <SortableTh
                      label={t("Sales", "ሽያጭ")}
                      active={sortKey === "sales"}
                      dir={sortDir}
                      align="right"
                      onClick={() => toggleSort("sales")}
                    />
                  </tr>
                </thead>
                <tbody>
                  {filteredItems.map((row) => (
                    <ItemRow key={row.id} row={row} />
                  ))}
                </tbody>
              </table>
            </div>
            <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border bg-surface-2/50 px-4 py-3 text-sm font-semibold">
              <span>
                {t("Total Items Sold", "ጠቅላላ የተሸጡ እቃዎች")}: {Math.round(itemsFooterQty)}
              </span>
              <span>
                {t("Total Sales", "ጠቅላላ ሽያጭ")}: {money(itemsFooterSales)}
              </span>
            </div>
          </Card>
        </TabsContent>

        <TabsContent value="orders">
          <Card className="!p-0 overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[880px] text-sm">
                <thead className="bg-surface-2 text-xs uppercase tracking-wide text-muted-foreground">
                  <tr>
                    <th className="px-4 py-3 text-left">{t("Order", "ትዕዛዝ")}</th>
                    <th className="px-4 py-3 text-left">{t("Time", "ሰዓት")}</th>
                    <th className="px-4 py-3 text-left">{t("Table", "ጠረጴዛ")}</th>
                    <th className="px-4 py-3 text-left">{t("Waiter", "አስተናጋጅ")}</th>
                    <th className="px-4 py-3 text-left">{t("Cashier", "ካሸር")}</th>
                    <th className="px-4 py-3 text-right">{t("Total", "ድምር")}</th>
                    <th className="px-4 py-3 text-right">{t("Paid", "የተከፈለ")}</th>
                    <th className="px-4 py-3 text-right">{t("Balance", "ቀሪ")}</th>
                    <th className="px-4 py-3 text-left">{t("Status", "ሁኔታ")}</th>
                  </tr>
                </thead>
                <tbody>
                  {data.orders.map((row) => (
                    <OrderRow key={row.id} row={row} t={t} />
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}

function PeriodSalesHeader({
  copy,
  periodLabel,
  isCurrentPeriod,
  canGoNext,
  filtersOpen,
  setFiltersOpen,
  goPrev,
  goNext,
  jumpToCurrent,
  setCustomDay,
  fromDate,
  today,
  onExportCsv,
  onExportXlsx,
  onPrint,
  t,
}: {
  copy: ReturnType<typeof periodCopy>;
  periodLabel: string;
  isCurrentPeriod: boolean;
  canGoNext: boolean;
  filtersOpen: boolean;
  setFiltersOpen: (open: boolean) => void;
  goPrev: () => void;
  goNext: () => void;
  jumpToCurrent: () => void;
  setCustomDay: (day: string) => void;
  fromDate: string;
  today: string;
  onExportCsv: () => void;
  onExportXlsx: () => void;
  onPrint: () => void;
  t: (en: string, am: string) => string;
}) {
  return (
    <div className="space-y-3">
      <div>
        <h2 className="font-display text-xl font-semibold sm:text-2xl">{copy.title}</h2>
        <p className="mt-1 text-sm text-muted-foreground">{copy.subtitle}</p>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <div className="inline-flex items-center gap-1 rounded-xl border border-border bg-card p-1">
          <button
            type="button"
            onClick={goPrev}
            className="grid size-9 place-items-center rounded-lg hover:bg-surface-2"
            aria-label={copy.prevAria}
          >
            <Icons.ChevronLeft className="size-4" />
          </button>
          <div className="min-w-[180px] px-2 text-center text-sm font-semibold">
            {isCurrentPeriod ? copy.jumpLabel : null}
            {isCurrentPeriod ? " — " : null}
            {periodLabel}
          </div>
          <button
            type="button"
            onClick={goNext}
            disabled={!canGoNext}
            className="grid size-9 place-items-center rounded-lg hover:bg-surface-2 disabled:opacity-40"
            aria-label={copy.nextAria}
          >
            <Icons.ChevronRight className="size-4" />
          </button>
        </div>

        <Button
          type="button"
          size="sm"
          variant={isCurrentPeriod ? "default" : "outline"}
          onClick={jumpToCurrent}
        >
          {copy.jumpLabel}
        </Button>
        <label className="inline-flex h-9 items-center gap-2 rounded-lg border border-border bg-card px-3 text-sm">
          <span className="text-muted-foreground">{t("Custom", "ብጁ")}</span>
          <input
            type="date"
            value={fromDate}
            max={today}
            onChange={(event) => {
              if (event.target.value) setCustomDay(event.target.value);
            }}
            className="bg-transparent text-sm focus:outline-none"
          />
        </label>

        <Button
          type="button"
          size="sm"
          variant="outline"
          className="gap-1.5"
          onClick={() => setFiltersOpen(!filtersOpen)}
        >
          <Icons.SlidersHorizontal className="size-4" />
          {t("Filters", "ማጣሪያዎች")}
        </Button>

        <div className="ml-auto flex flex-wrap gap-2">
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
    </div>
  );
}

function FilterDrawer({
  open,
  draft,
  setDraft,
  branchOptions,
  cashiers,
  waiters,
  stations,
  categories,
  areas,
  onApply,
  onReset,
  t,
}: {
  open: boolean;
  draft: ReportFiltersState;
  setDraft: (next: ReportFiltersState) => void;
  branchOptions: string[];
  cashiers: string[];
  waiters: string[];
  stations: string[];
  categories: string[];
  areas: string[];
  onApply: () => void;
  onReset: () => void;
  t: (en: string, am: string) => string;
}) {
  if (!open) return null;

  function update<K extends keyof ReportFiltersState>(key: K, value: ReportFiltersState[K]) {
    setDraft({ ...draft, [key]: value });
  }

  return (
    <Card className="!p-4">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <FilterSelect
          label={t("Branch", "ቅርንጫፍ")}
          value={draft.branch}
          onChange={(value) => update("branch", value)}
          options={branchOptions}
          allLabel={t("All branches", "ሁሉም ቅርንጫፎች")}
        />
        <FilterSelect
          label={t("Cashier", "ካሸር")}
          value={draft.cashier}
          onChange={(value) => update("cashier", value)}
          options={cashiers}
          allLabel={t("All", "ሁሉም")}
        />
        <FilterSelect
          label={t("Waiter", "አስተናጋጅ")}
          value={draft.waiter}
          onChange={(value) => update("waiter", value)}
          options={waiters}
          allLabel={t("All", "ሁሉም")}
        />
        <FilterSelect
          label={t("Station", "ጣቢያ")}
          value={draft.station}
          onChange={(value) => update("station", value)}
          options={stations}
          allLabel={t("All", "ሁሉም")}
        />
        <FilterSelect
          label={t("Category", "ምድብ")}
          value={draft.category}
          onChange={(value) => update("category", value)}
          options={categories}
          allLabel={t("All", "ሁሉም")}
        />
        <FilterSelect
          label={t("Area", "ክፍል")}
          value={draft.area}
          onChange={(value) => update("area", value)}
          options={areas}
          allLabel={t("All", "ሁሉም")}
        />
      </div>
      <div className="mt-4 flex flex-wrap gap-2">
        <Button type="button" onClick={onApply}>
          {t("Apply", "ተግብር")}
        </Button>
        <Button type="button" variant="outline" onClick={onReset}>
          {t("Reset", "እንደነበር መልስ")}
        </Button>
      </div>
    </Card>
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
    <div>
      <label className="text-xs text-muted-foreground">{label}</label>
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
    </div>
  );
}

function SummaryRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-3 border-b border-border/60 py-1.5 last:border-0">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="font-mono font-semibold">{value}</dd>
    </div>
  );
}

function PaymentStatusRow({
  label,
  count,
  amount,
}: {
  label: string;
  count: number;
  amount: string;
}) {
  return (
    <tr className="border-b border-border/60 last:border-0">
      <td className="py-2 pr-3">{label}</td>
      <td className="py-2 pr-3 text-right font-mono">{count}</td>
      <td className="py-2 text-right font-mono font-semibold">{amount}</td>
    </tr>
  );
}

function SortableTh({
  label,
  active,
  dir,
  align = "left",
  onClick,
}: {
  label: string;
  active: boolean;
  dir: "asc" | "desc";
  align?: "left" | "right";
  onClick: () => void;
}) {
  return (
    <th className={`px-4 py-3 ${align === "right" ? "text-right" : "text-left"}`}>
      <button
        type="button"
        onClick={onClick}
        className={`inline-flex items-center gap-1 font-semibold uppercase tracking-wide ${
          active ? "text-foreground" : "text-muted-foreground"
        }`}
      >
        {label}
        {active ? (
          dir === "asc" ? (
            <Icons.ArrowUp className="size-3.5" />
          ) : (
            <Icons.ArrowDown className="size-3.5" />
          )
        ) : (
          <Icons.ArrowUpDown className="size-3.5 opacity-50" />
        )}
      </button>
    </th>
  );
}

function ItemRow({ row }: { row: DailySalesItemRow }) {
  return (
    <tr className="border-t border-border hover:bg-surface-2/60">
      <td className="px-4 py-2.5 font-medium">{row.product}</td>
      <td className="px-4 py-2.5 text-muted-foreground">{row.category}</td>
      <td className="px-4 py-2.5 text-muted-foreground">{row.station}</td>
      <td className="px-4 py-2.5 text-right font-mono">{row.qty}</td>
      <td className="px-4 py-2.5 text-right font-mono">{money(row.sales)}</td>
    </tr>
  );
}

function OrderRow({
  row,
  t,
}: {
  row: DailySalesOrderRow;
  t: (en: string, am: string) => string;
}) {
  const statusLabel =
    row.status === "Paid"
      ? t("Paid", "ተከፍሏል")
      : row.status === "Partial"
        ? t("Partial", "በከፊል")
        : t("Unpaid", "አልተከፈለም");
  const statusClass =
    row.status === "Paid"
      ? "text-teff"
      : row.status === "Partial"
        ? "text-gold-foreground"
        : "text-ember";

  return (
    <tr className="border-t border-border hover:bg-surface-2/60">
      <td className="px-4 py-2.5">
        <Link to="/app/orders" className="font-mono font-semibold text-ember hover:underline">
          {row.orderNo}
        </Link>
      </td>
      <td className="px-4 py-2.5">{row.time}</td>
      <td className="px-4 py-2.5">{row.table}</td>
      <td className="px-4 py-2.5">{row.waiter}</td>
      <td className="px-4 py-2.5">{row.cashier}</td>
      <td className="px-4 py-2.5 text-right font-mono">{money(row.total)}</td>
      <td className="px-4 py-2.5 text-right font-mono">{money(row.paid)}</td>
      <td className="px-4 py-2.5 text-right font-mono">{money(row.balance)}</td>
      <td className={`px-4 py-2.5 font-semibold ${statusClass}`}>{statusLabel}</td>
    </tr>
  );
}
