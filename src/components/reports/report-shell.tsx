import { Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import * as Icons from "lucide-react";
import { Bar, BarChart, CartesianGrid, XAxis, YAxis } from "recharts";
import { Button } from "@/components/ui/button";
import { ChartContainer, ChartTooltip, ChartTooltipContent } from "@/components/ui/chart";
import { RealtimeBadge } from "@/components/realtime-badge";
import { Card, Chip, PageHeader, Stat } from "@/components/ui-kit";
import { useAuth } from "@/lib/auth-context";
import { useLang } from "@/lib/lang-context";
import { selectText, useT } from "@/lib/i18n";
import {
  defaultReportForCategory,
  findCategory,
  findReport,
  quickReports,
  REPORT_CATEGORIES,
  reportsForCategory,
  searchReports,
  type ReportCategoryId,
  type ReportDef,
} from "@/lib/reports-catalog";
import {
  defaultFiltersForReport,
  defaultReportFilters,
  resolveDateRange,
  runReportQuery,
  type ReportFiltersState,
  type ReportQueryInput,
  type ReportTableRow,
} from "@/lib/reports-query";
import {
  downloadXlsxBytes,
  exportRowsToCsv,
  exportRowsToXlsx,
  openInventoryPrintReport,
} from "@/lib/stock-management";
import { ReportFiltersPanel } from "@/components/reports/report-filters";
import { DailySalesReportView } from "@/components/reports/daily-sales-report";
import { OrdersByStatusReportView } from "@/components/reports/orders-by-status-report";
import { buildPeriodSalesReport } from "@/lib/daily-sales-report";
import { buildOrdersByStatusReport } from "@/lib/orders-by-status-report";
import { formatETB } from "@/lib/ethiopic";

const PAGE_SIZE = 15;

function downloadTextFile(filename: string, content: string, type: string) {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.style.display = "none";
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

function usePagedRows(rows: readonly ReportTableRow[], pageSize: number) {
  const [page, setPage] = useState(1);
  const pageCount = Math.max(1, Math.ceil(rows.length / pageSize));
  const activePage = Math.min(page, pageCount);
  const start = (activePage - 1) * pageSize;
  const pageRows = rows.slice(start, start + pageSize);

  useEffect(() => {
    setPage((current) => Math.min(current, pageCount));
  }, [pageCount, rows.length]);

  return { page: activePage, pageCount, pageRows, setPage, from: rows.length ? start + 1 : 0, to: start + pageRows.length };
}

export type ReportShellProps = {
  queryInput: Omit<ReportQueryInput, "reportId" | "filters">;
  initialCategory?: ReportCategoryId;
  initialReportId?: string;
  lastSyncAt?: string;
  realtimeStatus: import("@/lib/supabase/pos-backend").BackendRealtimeStatus;
};

export function ReportShell({
  queryInput,
  initialCategory = "executive",
  initialReportId,
  lastSyncAt,
  realtimeStatus,
}: ReportShellProps) {
  const t = useT();
  const lang = useLang();
  const { user } = useAuth();
  const [category, setCategory] = useState<ReportCategoryId>(initialCategory);
  const initialReport = initialReportId ?? defaultReportForCategory(initialCategory).id;
  const [reportId, setReportId] = useState(initialReport);
  const [filters, setFilters] = useState<ReportFiltersState>(() => defaultFiltersForReport(initialReport));
  const [generatedAt, setGeneratedAt] = useState(() => new Date().toLocaleString());
  const [kpiFilter, setKpiFilter] = useState<string | null>(null);
  const [reportSearch, setReportSearch] = useState("");
  const [showDisabled, setShowDisabled] = useState(false);

  const report = useMemo(() => findReport(reportId), [reportId]);
  const activeCategory = useMemo(() => findCategory(category), [category]);
  const categoryReports = useMemo(() => {
    const list = reportsForCategory(category);
    return showDisabled ? list : list.filter((entry) => entry.enabled || entry.id === reportId);
  }, [category, reportId, showDisabled]);
  const categoryEnabledCount = useMemo(
    () => reportsForCategory(category).filter((entry) => entry.enabled).length,
    [category],
  );
  const shortcuts = useMemo(() => quickReports(), []);
  const searchHits = useMemo(() => searchReports(reportSearch), [reportSearch]);
  const searching = reportSearch.trim().length > 0;

  const filterOptions = useMemo(() => {
    const cashiers = new Set<string>();
    const waiters = new Set<string>();
    const stations = new Set<string>();
    const categories = new Set<string>();
    const areas = new Set<string>();
    const paymentMethods = new Set<string>();
    for (const row of queryInput.salesRecords) {
      if (row.cashier) cashiers.add(row.cashier);
      if (row.waiter) waiters.add(row.waiter);
      if (row.station) stations.add(row.station);
      if (row.category) categories.add(row.category);
      if (row.area) areas.add(row.area);
    }
    for (const payment of queryInput.payments) {
      if (payment.method) paymentMethods.add(payment.method);
      const cashier = payment.receivedByCashier || payment.closedByCashier || payment.cashier;
      if (cashier) cashiers.add(cashier);
      if (payment.collectedByWaiter) waiters.add(payment.collectedByWaiter);
    }
    for (const order of queryInput.orders) {
      if (order.waiter) waiters.add(order.waiter);
      if (order.area) areas.add(order.area);
      if (order.enteredByCashier) cashiers.add(order.enteredByCashier);
    }
    return {
      cashiers: [...cashiers].sort(),
      waiters: [...waiters].sort(),
      stations: [...stations].sort(),
      categories: [...categories].sort(),
      areas: [...areas].sort(),
      paymentMethods: [...paymentMethods].sort(),
    };
  }, [queryInput.orders, queryInput.payments, queryInput.salesRecords]);

  const result = useMemo(() => {
    const scopedFilters = kpiFilter ? { ...filters, search: kpiFilter } : filters;
    return runReportQuery({
      ...queryInput,
      reportId,
      filters: scopedFilters,
    });
  }, [filters, kpiFilter, queryInput, reportId]);

  const { page, pageCount, pageRows, setPage, from, to } = usePagedRows(result.rows, PAGE_SIZE);
  const dateRange = resolveDateRange(filters.preset, filters.fromDate, filters.toDate);

  useEffect(() => {
    setGeneratedAt(new Date().toLocaleString());
  }, [filters, reportId]);

  function selectCategory(next: ReportCategoryId) {
    setCategory(next);
    setReportSearch("");
    const nextReport = defaultReportForCategory(next);
    setReportId(nextReport.id);
    setFilters(defaultFiltersForReport(nextReport.id));
    setKpiFilter(null);
  }

  function selectReport(next: ReportDef) {
    setCategory(next.category);
    setReportId(next.id);
    setFilters(defaultFiltersForReport(next.id));
    setKpiFilter(null);
    setReportSearch("");
  }

  function buildExportRows() {
    if (
      reportId === "daily-sales" ||
      reportId === "weekly-sales" ||
      reportId === "monthly-sales"
    ) {
      const period =
        reportId === "weekly-sales" ? "week" : reportId === "monthly-sales" ? "month" : "day";
      const sales = buildPeriodSalesReport({
        fromDate: dateRange.fromDate,
        toDate: dateRange.toDate,
        orders: queryInput.orders,
        salesRecords: queryInput.salesRecords,
        filters,
      });
      const reportTitle =
        period === "week"
          ? selectText(lang, "Weekly Sales", "የሳምንት ሽያጭ")
          : period === "month"
            ? selectText(lang, "Monthly Sales", "የወር ሽያጭ")
            : selectText(lang, "Daily Sales", "የዕለት ሽያጭ");
      const meta = [
        [selectText(lang, "Report", "ሪፖርት"), reportTitle],
        [selectText(lang, "Generated", "ተፈጥሯል"), generatedAt],
        [selectText(lang, "User", "ተጠቃሚ"), user?.name ?? "—"],
        [
          selectText(lang, "Date range", "የቀን ክልል"),
          period === "day" ? dateRange.fromDate : `${dateRange.fromDate} → ${dateRange.toDate}`,
        ],
        [selectText(lang, "Branch", "ቅርንጫፍ"), filters.branch],
        [],
        [selectText(lang, "Total Sales", "ጠቅላላ ሽያጭ"), formatETB(sales.totalSales)],
        [selectText(lang, "Paid", "የተከፈለ"), formatETB(sales.paid)],
        [selectText(lang, "Unpaid", "ያልተከፈለ"), formatETB(sales.unpaid)],
        [selectText(lang, "Orders", "ትዕዛዞች"), String(sales.orderCount)],
        [selectText(lang, "Items Sold", "የተሸጡ እቃዎች"), String(Math.round(sales.itemsSoldQty))],
        [],
      ];
      const headers = [
        selectText(lang, "Product", "ምርት"),
        selectText(lang, "Category", "ምድብ"),
        selectText(lang, "Station", "ጣቢያ"),
        selectText(lang, "Qty Sold", "ብዛት"),
        selectText(lang, "Sales", "ሽያጭ"),
      ];
      const rows = sales.items.map((row) => [
        row.product,
        row.category,
        row.station,
        String(row.qty),
        String(row.sales),
      ]);
      return { meta, headers, rows };
    }

    if (reportId === "orders-by-status") {
      const data = buildOrdersByStatusReport({ orders: queryInput.orders, filters });
      const meta = [
        [selectText(lang, "Report", "ሪፖርት"), selectText(lang, "Orders", "ትዕዛዞች")],
        [selectText(lang, "Generated", "ተፈጥሯል"), generatedAt],
        [selectText(lang, "User", "ተጠቃሚ"), user?.name ?? "—"],
        [selectText(lang, "Date range", "የቀን ክልል"), `${dateRange.fromDate} → ${dateRange.toDate}`],
        [],
        [selectText(lang, "Total Orders", "ጠቅላላ ትዕዛዞች"), String(data.totalOrders)],
        [selectText(lang, "Open", "ክፍት"), String(data.openCount)],
        [selectText(lang, "Closed", "ተዘግቷል"), String(data.closedCount)],
        [selectText(lang, "Total Value", "ጠቅላላ ዋጋ"), formatETB(data.totalValue)],
        [selectText(lang, "Outstanding", "ቀሪ"), formatETB(data.outstanding)],
        [],
      ];
      const headers = [
        selectText(lang, "Order", "ትዕዛዝ"),
        selectText(lang, "Time", "ሰዓት"),
        selectText(lang, "Table", "ጠረጴዛ"),
        selectText(lang, "Waiter", "አስተናጋጅ"),
        selectText(lang, "Items", "እቃዎች"),
        selectText(lang, "Total", "ድምር"),
        selectText(lang, "Paid", "የተከፈለ"),
        selectText(lang, "Balance", "ቀሪ"),
        selectText(lang, "Payment", "ክፍያ"),
        selectText(lang, "Status", "ሁኔታ"),
      ];
      const rows = data.orders.map((row) => [
        row.orderNo,
        row.time,
        row.table,
        row.waiter,
        String(Math.round(row.itemCount)),
        String(row.total),
        String(row.paid),
        String(row.balance),
        row.payment,
        row.lifecycle,
      ]);
      return { meta, headers, rows };
    }

    const meta = [
      [selectText(lang, "Report", "ሪፖርት"), selectText(lang, report.titleEn, report.titleAm)],
      [selectText(lang, "Generated", "ተፈጥሯል"), generatedAt],
      [selectText(lang, "User", "ተጠቃሚ"), user?.name ?? "—"],
      [selectText(lang, "Date range", "የቀን ክልል"), `${dateRange.fromDate} → ${dateRange.toDate}`],
      [selectText(lang, "Branch", "ቅርንጫፍ"), filters.branch],
      [],
    ];
    const headers = result.columns.map((column) => selectText(lang, column.labelEn, column.labelAm));
    const rows = result.rows.map((row) =>
      result.columns.map((column) => {
        const value = row[column.key];
        return value == null ? "" : String(value);
      }),
    );
    return { meta, headers, rows };
  }

  function exportCsv() {
    const { meta, headers, rows } = buildExportRows();
    const csv = exportRowsToCsv(
      headers,
      rows.map((row) => row),
    );
    const metaText = meta.map((line) => line.join(",")).join("\n");
    downloadTextFile(`${report.id}-${dateRange.fromDate}.csv`, `${metaText}\n${csv}`, "text/csv;charset=utf-8");
  }

  async function exportXlsx() {
    const { meta, headers, rows } = buildExportRows();
    const sheetRows = [...meta.map((line) => line.map(String)), headers, ...rows];
    const bytes = await exportRowsToXlsx(report.titleEn.slice(0, 31), headers, rows);
    void sheetRows;
    downloadXlsxBytes(`${report.id}-${dateRange.fromDate}.xlsx`, bytes);
  }

  function printReport() {
    const { headers, rows } = buildExportRows();
    openInventoryPrintReport(
      selectText(lang, report.titleEn, report.titleAm),
      headers,
      rows.map((row) => row),
    );
  }

  const IconForCategory = (iconName: string) =>
    (Icons as unknown as Record<string, React.ComponentType<{ className?: string }>>)[iconName] ?? Icons.FileText;

  const reportPickerList = searching
    ? showDisabled
      ? searchHits
      : searchHits.filter((entry) => entry.enabled || entry.id === reportId)
    : categoryReports;

  return (
    <div className="min-w-0 space-y-4">
      <PageHeader
        title={t("Reports & Analytics", "ሪፖርቶች እና ትንታኔ")}
        action={
          <div className="flex flex-wrap items-center gap-2">
            <RealtimeBadge status={realtimeStatus} lastSyncAt={lastSyncAt} />
            <Chip tone="muted">
              {t("Generated", "ተፈጥሯል")}: {generatedAt}
            </Chip>
            <Button type="button" size="sm" variant="outline" onClick={exportCsv} className="gap-1.5">
              <Icons.Download className="size-4" />
              CSV
            </Button>
            <Button type="button" size="sm" variant="outline" onClick={() => void exportXlsx()} className="gap-1.5">
              <Icons.FileSpreadsheet className="size-4" />
              XLSX
            </Button>
            <Button type="button" size="sm" variant="outline" onClick={printReport} className="gap-1.5">
              <Icons.Printer className="size-4" />
              {t("Print", "አትም")}
            </Button>
          </div>
        }
      />

      <Card className="!p-3">
        <div className="relative">
          <Icons.Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <input
            value={reportSearch}
            onChange={(e) => setReportSearch(e.target.value)}
            className="h-11 w-full rounded-xl border border-border bg-card pl-10 pr-10 text-sm focus:outline-none focus:ring-2 focus:ring-ring/40"
            placeholder={t(
              "Search reports (daily sales, stock, payments…)",
              "ሪፖርቶችን ፈልግ (የዕለት ሽያጭ፣ ክምችት፣ ክፍያ…)",
            )}
          />
          {reportSearch ? (
            <button
              type="button"
              onClick={() => setReportSearch("")}
              className="absolute right-2 top-1/2 grid size-7 -translate-y-1/2 place-items-center rounded-md text-muted-foreground hover:bg-surface-2"
              aria-label={t("Clear search", "ፍለጋ አጽዳ")}
            >
              <Icons.X className="size-3.5" />
            </button>
          ) : null}
        </div>

        <div className="mt-3 flex gap-1.5 overflow-x-auto pb-0.5">
          {shortcuts.map((entry) => {
            const selected = entry.id === reportId;
            return (
              <button
                key={entry.id}
                type="button"
                onClick={() => selectReport(entry)}
                className={`h-9 shrink-0 rounded-lg px-3 text-xs font-semibold transition-colors ${
                  selected
                    ? "bg-ember text-ember-foreground"
                    : "border border-border bg-card text-muted-foreground hover:bg-surface-2 hover:text-foreground"
                }`}
              >
                {selectText(lang, entry.titleEn, entry.titleAm)}
              </button>
            );
          })}
        </div>
      </Card>

      <div className="grid gap-4 lg:grid-cols-[280px_minmax(0,1fr)]">
        <aside className="min-w-0 space-y-3">
          <Card className="!p-2">
            <div className="mb-1.5 px-2 pt-1 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
              {t("Categories", "ምድቦች")}
            </div>
            <div className="max-h-[min(42vh,320px)] space-y-0.5 overflow-y-auto overscroll-contain lg:max-h-none">
              {REPORT_CATEGORIES.map((entry) => {
                const Icon = IconForCategory(entry.icon);
                const selected = !searching && category === entry.id;
                const enabledCount = reportsForCategory(entry.id).filter((row) => row.enabled).length;
                return (
                  <button
                    key={entry.id}
                    type="button"
                    onClick={() => selectCategory(entry.id)}
                    className={`flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-sm transition-colors ${
                      selected
                        ? "bg-foreground text-background"
                        : "text-muted-foreground hover:bg-surface-2 hover:text-foreground"
                    }`}
                  >
                    <Icon className="size-4 shrink-0" />
                    <span className="min-w-0 flex-1 truncate">
                      {selectText(lang, entry.titleEn, entry.titleAm)}
                    </span>
                    <span
                      className={`rounded-md px-1.5 py-0.5 text-[10px] font-semibold tabular-nums ${
                        selected ? "bg-background/15 text-background" : "bg-surface-2 text-muted-foreground"
                      }`}
                    >
                      {enabledCount}
                    </span>
                  </button>
                );
              })}
            </div>
          </Card>

          <Card className="!p-2">
            <div className="mb-1.5 flex items-center justify-between gap-2 px-2 pt-1">
              <div className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                {searching
                  ? t("Search results", "የፍለጋ ውጤቶች")
                  : selectText(lang, activeCategory.titleEn, activeCategory.titleAm)}
              </div>
              <button
                type="button"
                onClick={() => setShowDisabled((value) => !value)}
                className="text-[10px] font-semibold text-muted-foreground hover:text-foreground"
              >
                {showDisabled ? t("Ready only", "ዝግጁ ብቻ") : t("Show all", "ሁሉን አሳይ")}
              </button>
            </div>
            <div className="max-h-[min(48vh,420px)] space-y-1 overflow-y-auto overscroll-contain pr-0.5">
              {reportPickerList.map((entry) => {
                const selected = entry.id === reportId;
                const categoryTitle = findCategory(entry.category);
                return (
                  <button
                    key={entry.id}
                    type="button"
                    disabled={!entry.enabled && entry.id !== reportId}
                    onClick={() => selectReport(entry)}
                    className={`w-full rounded-lg border px-2.5 py-2 text-left transition-colors ${
                      selected
                        ? "border-ember/40 bg-ember/10"
                        : entry.enabled
                          ? "border-transparent hover:border-border hover:bg-surface-2"
                          : "border-dashed border-border opacity-60"
                    }`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <div className="truncate text-sm font-semibold">
                          {selectText(lang, entry.titleEn, entry.titleAm)}
                        </div>
                        <div className="mt-0.5 line-clamp-2 text-[11px] text-muted-foreground">
                          {searching
                            ? selectText(lang, categoryTitle.titleEn, categoryTitle.titleAm)
                            : selectText(lang, entry.descriptionEn, entry.descriptionAm)}
                        </div>
                      </div>
                      {!entry.enabled ? (
                        <Chip tone="gold">{t("Soon", "በቅርብ")}</Chip>
                      ) : null}
                    </div>
                  </button>
                );
              })}
              {reportPickerList.length === 0 ? (
                <div className="px-2 py-6 text-center text-xs text-muted-foreground">
                  {searching
                    ? t("No reports match that search.", "ከዚያ ፍለጋ ጋር የሚዛመድ ሪፖርት የለም።")
                    : t("No ready reports in this category.", "በዚህ ምድብ ዝግጁ ሪፖርት የለም።")}
                </div>
              ) : null}
            </div>
            {!searching ? (
              <div className="mt-1 px-2 pb-1 text-[10px] text-muted-foreground">
                {t(
                  `${categoryEnabledCount} ready in this category`,
                  `በዚህ ምድብ ${categoryEnabledCount} ዝግጁ`,
                )}
              </div>
            ) : null}
          </Card>
        </aside>

        <div className="min-w-0 space-y-4">
          {reportId === "daily-sales" ||
          reportId === "weekly-sales" ||
          reportId === "monthly-sales" ||
          reportId === "orders-by-status" ? null : (
          <Card className="!p-3">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div className="min-w-0">
                <div className="text-[11px] font-medium text-muted-foreground">
                  {selectText(lang, activeCategory.titleEn, activeCategory.titleAm)}
                  <span className="mx-1.5 text-border">/</span>
                  {selectText(lang, report.titleEn, report.titleAm)}
                </div>
                <h2 className="mt-0.5 font-display text-lg font-semibold">
                  {selectText(lang, report.titleEn, report.titleAm)}
                </h2>
                <p className="mt-1 text-xs text-muted-foreground">
                  {selectText(lang, report.descriptionEn, report.descriptionAm)}
                </p>
                <p className="mt-1 text-xs text-muted-foreground">
                  {dateRange.fromDate} → {dateRange.toDate}
                  {filters.branch !== "All" ? ` · ${filters.branch}` : ""}
                </p>
              </div>
              {!report.enabled ? <Chip tone="gold">{t("Coming soon", "በቅርብ ይመጣል")}</Chip> : null}
            </div>
          </Card>
          )}

          {reportId === "daily-sales" ||
          reportId === "weekly-sales" ||
          reportId === "monthly-sales" ? (
            <DailySalesReportView
              period={
                reportId === "weekly-sales"
                  ? "week"
                  : reportId === "monthly-sales"
                    ? "month"
                    : "day"
              }
              filters={filters}
              onFiltersChange={(next) => {
                setFilters(next);
                setKpiFilter(null);
              }}
              orders={queryInput.orders}
              salesRecords={queryInput.salesRecords}
              cashiers={filterOptions.cashiers}
              waiters={filterOptions.waiters}
              stations={filterOptions.stations}
              categories={filterOptions.categories}
              areas={filterOptions.areas}
              onExportCsv={exportCsv}
              onExportXlsx={() => void exportXlsx()}
              onPrint={printReport}
            />
          ) : reportId === "orders-by-status" ? (
            <OrdersByStatusReportView
              filters={filters}
              onFiltersChange={(next) => {
                setFilters(next);
                setKpiFilter(null);
              }}
              orders={queryInput.orders}
              cashiers={filterOptions.cashiers}
              waiters={filterOptions.waiters}
              areas={filterOptions.areas}
              onExportCsv={exportCsv}
              onExportXlsx={() => void exportXlsx()}
              onPrint={printReport}
            />
          ) : (
          <>
          <ReportFiltersPanel
            filterKeys={report.filters}
            filters={filters}
            onApply={(next) => {
              setFilters(next);
              setKpiFilter(null);
            }}
            {...filterOptions}
          />

          {!result.enabled ? (
            <Card className="p-10 text-center">
              <Icons.Construction className="mx-auto mb-3 size-10 text-gold-foreground" />
              <div className="font-display text-base font-semibold">
                {t("This report is coming soon", "ይህ ሪፖርት በቅርብ ይመጣል")}
              </div>
              <p className="mt-1 text-sm text-muted-foreground">
                {t("Pick another report from the list on the left.", "ከግራ ዝርዝር ሌላ ሪፖርት ይምረጡ።")}
              </p>
            </Card>
          ) : (
            <>
              {result.kpis.length > 0 && (
                <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-4">
                  {result.kpis.map((kpi) => (
                    <button
                      key={kpi.id}
                      type="button"
                      onClick={() => setKpiFilter((current) => (current === kpi.id ? null : kpi.labelEn))}
                      className="text-left"
                    >
                      <Stat
                        label={selectText(lang, kpi.labelEn, kpi.labelAm)}
                        value={kpi.value}
                        tone={kpi.tone}
                      />
                    </button>
                  ))}
                </div>
              )}

              <Card className="!p-4">
                <h3 className="mb-3 font-display text-sm font-semibold">
                  {selectText(lang, result.chartTitleEn, result.chartTitleAm)}
                </h3>
                {result.chart.length > 0 ? (
                  <ChartContainer
                    className="h-56 w-full"
                    config={{
                      value: {
                        label: selectText(lang, result.chartTitleEn, result.chartTitleAm),
                        color: "var(--ember)",
                      },
                    }}
                  >
                    <BarChart data={result.chart} margin={{ left: 0, right: 8, top: 8, bottom: 8 }}>
                      <CartesianGrid vertical={false} strokeDasharray="3 3" />
                      <XAxis
                        dataKey="label"
                        tickLine={false}
                        axisLine={false}
                        tickMargin={8}
                        interval={0}
                        angle={-20}
                        textAnchor="end"
                        height={50}
                      />
                      <YAxis tickLine={false} axisLine={false} tickMargin={8} width={56} tick={{ fontSize: 11 }} />
                      <ChartTooltip
                        cursor={false}
                        content={<ChartTooltipContent indicator="dot" />}
                      />
                      <Bar dataKey="value" fill="var(--color-value)" radius={[4, 4, 0, 0]} />
                    </BarChart>
                  </ChartContainer>
                ) : (
                  <div className="py-10 text-center text-sm text-muted-foreground">
                    {selectText(lang, result.emptyMessageEn, result.emptyMessageAm)}
                  </div>
                )}
              </Card>

              <Card className="!p-0 overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[640px] text-sm">
                    <thead className="bg-surface-2 text-xs uppercase tracking-wide text-muted-foreground">
                      <tr>
                        {result.columns.map((column) => (
                          <th
                            key={column.key}
                            className={`px-4 py-3 ${column.align === "right" ? "text-right" : "text-left"}`}
                          >
                            {selectText(lang, column.labelEn, column.labelAm)}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {pageRows.map((row) => (
                        <tr key={row.id} className="border-t border-border hover:bg-surface-2/60">
                          {result.columns.map((column, index) => {
                            const value = row[column.key];
                            const cell = (
                              <td
                                key={column.key}
                                className={`px-4 py-2.5 ${column.align === "right" ? "text-right font-mono" : "text-left"}`}
                              >
                                {value}
                              </td>
                            );
                            if (index === 0 && row.href) {
                              return (
                                <td key={column.key} className="px-4 py-2.5">
                                  <Link to={row.href} className="font-medium text-ember hover:underline">
                                    {value}
                                  </Link>
                                </td>
                              );
                            }
                            return cell;
                          })}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                {result.rows.length === 0 ? (
                  <div className="py-10 text-center text-sm text-muted-foreground">
                    {selectText(lang, result.emptyMessageEn, result.emptyMessageAm)}
                  </div>
                ) : (
                  <div className="flex flex-col gap-3 border-t border-border px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
                    <div className="text-xs text-muted-foreground">
                      {t(`Showing ${from}-${to} of ${result.rows.length}`, `Showing ${from}-${to} of ${result.rows.length}`)}
                    </div>
                    <div className="flex items-center gap-2">
                      <Button type="button" size="sm" variant="outline" disabled={page <= 1} onClick={() => setPage((p) => Math.max(1, p - 1))}>
                        {t("Previous", "Previous")}
                      </Button>
                      <span className="text-xs text-muted-foreground">
                        {t(`Page ${page} of ${pageCount}`, `Page ${page} of ${pageCount}`)}
                      </span>
                      <Button type="button" size="sm" variant="outline" disabled={page >= pageCount} onClick={() => setPage((p) => Math.min(pageCount, p + 1))}>
                        {t("Next", "Next")}
                      </Button>
                    </div>
                  </div>
                )}
              </Card>
            </>
          )}
          </>
          )}
        </div>
      </div>
    </div>
  );
}
