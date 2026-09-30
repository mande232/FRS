import { isFinalOrderStatus, type ExpenseRecord, type Order, type PaymentLedgerEntry, type SalesRecord } from "@/lib/demo-data";
import {
  resolveDateRange as resolveCalendarDateRange,
  type DateRangePreset,
} from "@/lib/date-time";
import {
  dateKey,
  filterExpensesByDate,
  filterPaymentsByDate,
  filterSalesByDate,
  groupExpensesByCategory,
  groupPaymentsByHour,
  groupSalesByCategory,
  groupSalesByDate,
  groupSalesByHour,
  groupSalesByProduct,
  groupSalesByStation,
  groupSalesByWeek,
  weekStartKeyFromDateKey,
  summarizeSalesWithPayments,
  type SalesSummary,
} from "@/lib/sales-analytics";
import { displayPaymentStatus } from "@/lib/orders-ops";
import {
  buildApprovalActivityReport,
  buildConsumptionReport,
  buildCountVarianceReport,
  buildExpiryAlerts,
  buildPosIntegratedReports,
  buildPurchaseOrderReceivingReport,
  buildStockDashboardSummary,
  buildStockMovementSummary,
  buildStockValuationReport,
  DEFAULT_INVENTORY_SETTINGS,
  type GoodsReceivingVoucherDocument,
  type InventoryApprovalHistoryEntry,
  type InventorySettingsRecord,
  type LocationStockPolicy,
  type PosShiftSession,
  type PosStockReservation,
  type PurchaseOrderDocument,
  type StockCountSession,
  type StockLedgerEntry,
  type StockLot,
  type StockManagedItem,
  type StockRequestRecord,
  type StockTransferRecord,
} from "@/lib/stock-management";

export type ReportDatePreset = DateRangePreset;

export type ReportFiltersState = {
  preset: ReportDatePreset;
  fromDate: string;
  toDate: string;
  branch: string;
  shift: string;
  cashier: string;
  waiter: string;
  department: string;
  station: string;
  area: string;
  table: string;
  category: string;
  paymentMethod: string;
  paymentStatus: string;
  orderStatus: string;
  inventoryLocation: string;
  search: string;
};

export type ReportKpi = {
  id: string;
  labelEn: string;
  labelAm: string;
  value: string;
  hintEn?: string;
  hintAm?: string;
  tone?: "default" | "ember" | "teff" | "gold" | "destructive";
  filterHint?: string;
};

export type ReportChartPoint = { label: string; value: number; secondary?: number };

export type ReportTableColumn = { key: string; labelEn: string; labelAm: string; align?: "left" | "right" };

export type ReportTableRow = Record<string, string | number> & { id: string; href?: string };

export type ReportQueryResult = {
  kpis: ReportKpi[];
  chartTitleEn: string;
  chartTitleAm: string;
  chart: ReportChartPoint[];
  columns: ReportTableColumn[];
  rows: ReportTableRow[];
  enabled: boolean;
  emptyMessageEn: string;
  emptyMessageAm: string;
};

export type ReportQueryInput = {
  reportId: string;
  filters: ReportFiltersState;
  salesRecords: SalesRecord[];
  expenseRecords: ExpenseRecord[];
  payments: PaymentLedgerEntry[];
  orders: Order[];
  stockItems: StockManagedItem[];
  ledger: StockLedgerEntry[];
  lots: StockLot[];
  counts: StockCountSession[];
  purchaseOrders: PurchaseOrderDocument[];
  goodsReceiving: GoodsReceivingVoucherDocument[];
  requests: StockRequestRecord[];
  transfers: StockTransferRecord[];
  locationPolicies?: LocationStockPolicy[];
  inventorySettings?: InventorySettingsRecord;
  posReservations: PosStockReservation[];
  posShiftSessions: PosShiftSession[];
  documentsForApproval: Array<{
    documentType: string;
    documentNumber: string;
    approvalHistory: InventoryApprovalHistoryEntry[];
  }>;
};

function pad(n: number) {
  return String(n).padStart(2, "0");
}

function toDateKey(date: Date) {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

function addDays(date: Date, days: number) {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}

/** Shared with DateRangePicker so presets/custom ranges stay consistent. */
export function resolveDateRange(
  preset: ReportDatePreset,
  fromDate: string,
  toDate: string,
  today = new Date(),
) {
  const resolved = resolveCalendarDateRange(preset, fromDate, toDate, today, 1);
  return { fromDate: resolved.fromDate, toDate: resolved.toDate };
}

export function defaultReportFilters(): ReportFiltersState {
  const today = dateKey();
  return {
    preset: "this_month",
    fromDate: `${today.slice(0, 8)}01`,
    toDate: today,
    branch: "All",
    shift: "All",
    cashier: "All",
    waiter: "All",
    department: "All",
    station: "All",
    area: "All",
    table: "All",
    category: "All",
    paymentMethod: "All",
    paymentStatus: "All",
    orderStatus: "All",
    inventoryLocation: "All",
    search: "",
  };
}

/** Suggested date preset when opening a period report. */
export function defaultFiltersForReport(reportId: string): ReportFiltersState {
  const base = defaultReportFilters();
  if (reportId === "daily-sales" || reportId === "daily-ops-summary") {
    const range = resolveDateRange("today", base.fromDate, base.toDate);
    return { ...base, preset: "today", ...range };
  }
  if (reportId === "orders-by-status" || reportId === "active-orders") {
    const range = resolveDateRange("today", base.fromDate, base.toDate);
    return { ...base, preset: "today", ...range };
  }
  if (reportId === "weekly-sales") {
    const range = resolveDateRange("this_week", base.fromDate, base.toDate);
    return { ...base, preset: "this_week", ...range };
  }
  if (reportId === "monthly-sales") {
    const range = resolveDateRange("this_month", base.fromDate, base.toDate);
    return { ...base, preset: "this_month", ...range };
  }
  return base;
}

function receiptCountByKey(records: SalesRecord[], keyFor: (record: SalesRecord) => string) {
  const counts = new Map<string, Set<string>>();
  for (const record of records) {
    const key = keyFor(record);
    const receipts = counts.get(key) ?? new Set<string>();
    receipts.add(record.receiptNumber);
    counts.set(key, receipts);
  }
  return counts;
}

function formatWeekRange(weekStart: string) {
  const end = toDateKey(addDays(new Date(`${weekStart}T12:00:00`), 6));
  return `${weekStart.slice(5)} – ${end.slice(5)}`;
}

function productSalesTableRows(
  sales: SalesRecord[],
  filters: ReportFiltersState,
): ReportQueryResult["rows"] {
  return applySearch(
    groupSalesByProduct(sales).map((row, index) => ({
      id: `p-${index}`,
      product: row.productName,
      category: row.category,
      station: row.station,
      qty: row.qty,
      revenue: Number(row.revenue.toFixed(2)),
      profit: Number(row.profit.toFixed(2)),
    })),
    filters.search,
  );
}

const PRODUCT_SALES_COLUMNS: ReportQueryResult["columns"] = [
  { key: "product", labelEn: "Product", labelAm: "ምርት" },
  { key: "category", labelEn: "Category", labelAm: "ምድብ" },
  { key: "station", labelEn: "Station", labelAm: "ጣቢያ" },
  { key: "qty", labelEn: "Qty", labelAm: "ብዛት", align: "right" },
  { key: "revenue", labelEn: "Revenue", labelAm: "ገቢ", align: "right" },
  { key: "profit", labelEn: "Profit", labelAm: "ትርፍ", align: "right" },
];

function eachDateKey(fromDate: string, toDate: string) {
  const keys: string[] = [];
  const cursor = new Date(`${fromDate}T12:00:00`);
  const end = new Date(`${toDate}T12:00:00`);
  while (cursor <= end) {
    keys.push(toDateKey(cursor));
    cursor.setDate(cursor.getDate() + 1);
  }
  return keys;
}

function inDateRange(date: string, fromDate: string, toDate: string) {
  return date >= fromDate && date <= toDate;
}

function filterSales(records: SalesRecord[], filters: ReportFiltersState, fromDate: string, toDate: string) {
  return records.filter((row) => {
    if (!inDateRange(row.date, fromDate, toDate)) return false;
    if (filters.station !== "All" && row.station !== filters.station) return false;
    if (filters.category !== "All" && row.category !== filters.category) return false;
    if (filters.cashier !== "All" && row.cashier !== filters.cashier) return false;
    if (filters.waiter !== "All" && row.waiter !== filters.waiter) return false;
    if (filters.area !== "All" && row.area !== filters.area) return false;
    if (filters.table !== "All" && row.tableNumber !== filters.table) return false;
    return true;
  });
}

function filterPayments(payments: PaymentLedgerEntry[], filters: ReportFiltersState, fromDate: string, toDate: string) {
  return payments.filter((payment) => {
    const raw = payment.paymentReceivedAt ?? payment.time ?? "";
    const date = raw.match(/^(\d{4}-\d{2}-\d{2})/)?.[1] ?? (raw.includes("/") ? null : raw.slice(0, 10));
    // fallback: include if no parseable date when range is current month-wide? Better use paymentDateKey logic via filterPaymentsByDate per day
    void date;
    if (filters.paymentMethod !== "All" && payment.method !== filters.paymentMethod) return false;
    if (filters.paymentStatus !== "All") {
      const mapped =
        filters.paymentStatus === "Settled"
          ? payment.status === "Settled"
          : filters.paymentStatus === "Pending"
            ? payment.status === "Pending"
            : filters.paymentStatus === "Void"
              ? payment.status === "Void"
              : true;
      if (!mapped) return false;
    }
    if (filters.cashier !== "All") {
      const cashier = payment.receivedByCashier || payment.closedByCashier || payment.cashier;
      if (cashier !== filters.cashier) return false;
    }
    if (filters.waiter !== "All" && (payment.collectedByWaiter || "") !== filters.waiter) return false;
    return true;
  });
}

function paymentsInRange(payments: PaymentLedgerEntry[], fromDate: string, toDate: string) {
  const days = eachDateKey(fromDate, toDate);
  const set = new Set<string>();
  const out: PaymentLedgerEntry[] = [];
  for (const day of days) {
    for (const payment of filterPaymentsByDate(payments, day)) {
      if (!set.has(payment.id)) {
        set.add(payment.id);
        out.push(payment);
      }
    }
  }
  return out;
}

function expensesInRange(expenses: ExpenseRecord[], fromDate: string, toDate: string) {
  const days = eachDateKey(fromDate, toDate);
  return days.flatMap((day) => filterExpensesByDate(expenses, day));
}

function salesInRange(sales: SalesRecord[], fromDate: string, toDate: string) {
  const days = eachDateKey(fromDate, toDate);
  return days.flatMap((day) => filterSalesByDate(sales, day));
}

function moneyKpi(id: string, labelEn: string, labelAm: string, amount: number, tone?: ReportKpi["tone"], hintEn?: string, hintAm?: string): ReportKpi {
  return {
    id,
    labelEn,
    labelAm,
    value: formatPlain(amount),
    tone,
    hintEn,
    hintAm,
  };
}

function formatPlain(amount: number) {
  return `ETB ${amount.toLocaleString(undefined, { maximumFractionDigits: 2 })}`;
}

function countKpi(id: string, labelEn: string, labelAm: string, count: number, tone?: ReportKpi["tone"]): ReportKpi {
  return { id, labelEn, labelAm, value: String(count), tone };
}

function summaryKpis(summary: SalesSummary): ReportKpi[] {
  const aov = summary.receipts > 0 ? summary.revenue / summary.receipts : 0;
  return [
    moneyKpi("gross", "Gross Sales", "ጠቅላላ ሽያጭ", summary.revenue, "ember"),
    moneyKpi("net", "Net Profit", "ተጣራ ትርፍ", summary.profit, "teff"),
    countKpi("orders", "Orders / Receipts", "ትዕዛዞች / ደረሰኞች", summary.receipts, "gold"),
    countKpi("qty", "Products Sold", "የተሸጡ እቃዎች", Math.round(summary.qty)),
    moneyKpi("aov", "Average Order Value", "አማካኝ የትዕዛዝ ዋጋ", aov),
    moneyKpi("cogs", "Product Cost", "የምርት ወጪ", summary.productExpense),
    moneyKpi("opex", "Operating Expense", "የስራ ወጪ", summary.operatingExpense),
    moneyKpi("expense", "Total Expense", "ጠቅላላ ወጪ", summary.totalExpense, "destructive"),
  ];
}

function comingSoon(reportId: string): ReportQueryResult {
  return {
    kpis: [],
    chartTitleEn: "Coming soon",
    chartTitleAm: "በቅርብ ይመጣል",
    chart: [],
    columns: [],
    rows: [],
    enabled: false,
    emptyMessageEn: `Report "${reportId}" is listed in the catalog and will be wired in a later phase.`,
    emptyMessageAm: `ሪፖርት "${reportId}" በካታሎግ ውስጥ አለ እና በሚቀጥለው ደረጃ ይገናኛል።`,
  };
}

function applySearch(rows: ReportTableRow[], search: string) {
  const q = search.trim().toLowerCase();
  if (!q) return rows;
  return rows.filter((row) => Object.values(row).some((value) => String(value).toLowerCase().includes(q)));
}

export function runReportQuery(input: ReportQueryInput): ReportQueryResult {
  const { fromDate, toDate } = resolveDateRange(input.filters.preset, input.filters.fromDate, input.filters.toDate);
  const filters = { ...input.filters, fromDate, toDate };
  const sales = filterSales(salesInRange(input.salesRecords, fromDate, toDate), filters, fromDate, toDate);
  const expenses = expensesInRange(input.expenseRecords, fromDate, toDate);
  const payments = filterPayments(paymentsInRange(input.payments, fromDate, toDate), filters, fromDate, toDate);
  const summary = summarizeSalesWithPayments(sales, expenses, payments);
  const id = input.reportId;

  if (id === "daily-sales") {
    const hourly = sales.length > 0 ? groupSalesByHour(sales) : groupPaymentsByHour(payments);
    return {
      enabled: true,
      kpis: summaryKpis(summary),
      chartTitleEn: "Sales by hour",
      chartTitleAm: "በሰዓት ሽያጭ",
      chart: hourly.map((row) => ({ label: row.h, value: row.sales })),
      columns: PRODUCT_SALES_COLUMNS,
      rows: productSalesTableRows(sales, filters),
      emptyMessageEn: "No sales for this day.",
      emptyMessageAm: "ለዚህ ቀን ሽያጭ የለም።",
    };
  }

  if (id === "weekly-sales") {
    const byDay = groupSalesByDate(sales);
    const receiptsByDay = receiptCountByKey(sales, (record) => record.date);
    return {
      enabled: true,
      kpis: summaryKpis(summary),
      chartTitleEn: "Daily sales this week",
      chartTitleAm: "የሳምንቱ ዕለታዊ ሽያጭ",
      chart: byDay.map((row) => ({
        label: row.key.slice(5),
        value: row.revenue,
        secondary: row.profit,
      })),
      columns: [
        { key: "date", labelEn: "Date", labelAm: "ቀን" },
        { key: "receipts", labelEn: "Receipts", labelAm: "ደረሰኞች", align: "right" },
        { key: "qty", labelEn: "Qty", labelAm: "ብዛት", align: "right" },
        { key: "revenue", labelEn: "Revenue", labelAm: "ገቢ", align: "right" },
        { key: "profit", labelEn: "Profit", labelAm: "ትርፍ", align: "right" },
      ],
      rows: applySearch(
        byDay.map((row) => ({
          id: row.key,
          date: row.key,
          receipts: receiptsByDay.get(row.key)?.size ?? 0,
          qty: Math.round(row.qty),
          revenue: Number(row.revenue.toFixed(2)),
          profit: Number(row.profit.toFixed(2)),
        })),
        filters.search,
      ),
      emptyMessageEn: "No sales for this week.",
      emptyMessageAm: "ለዚህ ሳምንት ሽያጭ የለም።",
    };
  }

  if (id === "monthly-sales") {
    const byDay = groupSalesByDate(sales);
    const byWeek = groupSalesByWeek(sales);
    const receiptsByWeek = receiptCountByKey(sales, (record) => weekStartKeyFromDateKey(record.date));
    return {
      enabled: true,
      kpis: summaryKpis(summary),
      chartTitleEn: "Daily sales this month",
      chartTitleAm: "የወሩ ዕለታዊ ሽያጭ",
      chart: byDay.map((row) => ({
        label: row.key.slice(8),
        value: row.revenue,
        secondary: row.profit,
      })),
      columns: [
        { key: "week", labelEn: "Week", labelAm: "ሳምንት" },
        { key: "receipts", labelEn: "Receipts", labelAm: "ደረሰኞች", align: "right" },
        { key: "qty", labelEn: "Qty", labelAm: "ብዛት", align: "right" },
        { key: "revenue", labelEn: "Revenue", labelAm: "ገቢ", align: "right" },
        { key: "profit", labelEn: "Profit", labelAm: "ትርፍ", align: "right" },
      ],
      rows: applySearch(
        byWeek.map((row) => ({
          id: row.key,
          week: formatWeekRange(row.key),
          receipts: receiptsByWeek.get(row.key)?.size ?? 0,
          qty: Math.round(row.qty),
          revenue: Number(row.revenue.toFixed(2)),
          profit: Number(row.profit.toFixed(2)),
        })),
        filters.search,
      ),
      emptyMessageEn: "No sales for this month.",
      emptyMessageAm: "ለዚህ ወር ሽያጭ የለም።",
    };
  }

  if (
    id === "business-summary" ||
    id === "daily-ops-summary" ||
    id === "revenue-profitability" ||
    id === "revenue-report" ||
    id === "gross-profit" ||
    id === "net-profit" ||
    id === "cogs" ||
    id === "profit-loss"
  ) {
    const byDate = sales.length > 0 ? groupSalesByDate(sales) : [];
    const chart = byDate.map((row) => ({ label: row.key.slice(5), value: row.revenue, secondary: row.profit }));
    return {
      enabled: true,
      kpis: summaryKpis(summary),
      chartTitleEn: "Revenue by day",
      chartTitleAm: "በቀን ገቢ",
      chart,
      columns: PRODUCT_SALES_COLUMNS,
      rows: productSalesTableRows(sales, filters),
      emptyMessageEn: "No sales in this range.",
      emptyMessageAm: "በዚህ ክልል ሽያጭ የለም።",
    };
  }

  if (id === "expenses-report" || id === "purchase-cost") {
    const scopedExpenses =
      id === "purchase-cost" ? expenses.filter((row) => row.category.toLowerCase().includes("purchase")) : expenses;
    const rows = groupExpensesByCategory(scopedExpenses);
    return {
      enabled: true,
      kpis: [
        moneyKpi("total", "Total Expense", "ጠቅላላ ወጪ", scopedExpenses.reduce((s, r) => s + r.amount, 0), "destructive"),
        countKpi("lines", "Expense Lines", "የወጪ መስመሮች", scopedExpenses.length),
        countKpi("categories", "Categories", "ምድቦች", rows.length, "gold"),
      ],
      chartTitleEn: "Expense by category",
      chartTitleAm: "በምድብ ወጪ",
      chart: rows.map((row) => ({ label: row.category, value: row.amount })),
      columns: [
        { key: "category", labelEn: "Category", labelAm: "ምድብ" },
        { key: "count", labelEn: "Count", labelAm: "ብዛት", align: "right" },
        { key: "amount", labelEn: "Amount", labelAm: "መጠን", align: "right" },
      ],
      rows: applySearch(
        rows.map((row) => ({
          id: row.category,
          category: row.category,
          count: row.count,
          amount: Number(row.amount.toFixed(2)),
        })),
        filters.search,
      ),
      emptyMessageEn: "No expenses in this range.",
      emptyMessageAm: "በዚህ ክልል ወጪ የለም።",
    };
  }

  if (id === "sales-by-hour") {
    const hourly = sales.length > 0 ? groupSalesByHour(sales) : groupPaymentsByHour(payments);
    return {
      enabled: true,
      kpis: summaryKpis(summary).slice(0, 4),
      chartTitleEn: "Sales by hour",
      chartTitleAm: "በሰዓት ሽያጭ",
      chart: hourly.map((row) => ({ label: row.h, value: row.sales })),
      columns: [
        { key: "hour", labelEn: "Hour", labelAm: "ሰዓት" },
        { key: "sales", labelEn: "Sales", labelAm: "ሽያጭ", align: "right" },
      ],
      rows: applySearch(
        hourly.map((row) => ({ id: row.h, hour: row.h, sales: Number(row.sales.toFixed(2)) })),
        filters.search,
      ),
      emptyMessageEn: "No hourly sales data.",
      emptyMessageAm: "የሰዓት ሽያጭ የለም።",
    };
  }

  if (id === "sales-by-station" || id === "station-sales" || id === "station-performance") {
    const rows = groupSalesByStation(sales);
    return {
      enabled: true,
      kpis: summaryKpis(summary).slice(0, 4),
      chartTitleEn: "Sales by station",
      chartTitleAm: "በጣቢያ ሽያጭ",
      chart: rows.map((row) => ({ label: row.key, value: row.revenue })),
      columns: [
        { key: "station", labelEn: "Station", labelAm: "ጣቢያ" },
        { key: "qty", labelEn: "Qty", labelAm: "ብዛት", align: "right" },
        { key: "revenue", labelEn: "Revenue", labelAm: "ገቢ", align: "right" },
        { key: "profit", labelEn: "Profit", labelAm: "ትርፍ", align: "right" },
      ],
      rows: applySearch(
        rows.map((row) => ({
          id: row.key,
          station: row.key,
          qty: row.qty,
          revenue: Number(row.revenue.toFixed(2)),
          profit: Number(row.profit.toFixed(2)),
          href: "/app/pos",
        })),
        filters.search,
      ),
      emptyMessageEn: "No station sales.",
      emptyMessageAm: "የጣቢያ ሽያጭ የለም።",
    };
  }

  if (id === "sales-by-category") {
    const rows = groupSalesByCategory(sales);
    return {
      enabled: true,
      kpis: summaryKpis(summary).slice(0, 4),
      chartTitleEn: "Sales by category",
      chartTitleAm: "በምድብ ሽያጭ",
      chart: rows.map((row) => ({ label: row.key, value: row.revenue })),
      columns: [
        { key: "category", labelEn: "Category", labelAm: "ምድብ" },
        { key: "qty", labelEn: "Qty", labelAm: "ብዛት", align: "right" },
        { key: "revenue", labelEn: "Revenue", labelAm: "ገቢ", align: "right" },
      ],
      rows: applySearch(
        rows.map((row) => ({
          id: row.key,
          category: row.key,
          qty: row.qty,
          revenue: Number(row.revenue.toFixed(2)),
        })),
        filters.search,
      ),
      emptyMessageEn: "No category sales.",
      emptyMessageAm: "የምድብ ሽያጭ የለም።",
    };
  }

  if (id === "sales-by-item") {
    const rows = groupSalesByProduct(sales);
    return {
      enabled: true,
      kpis: summaryKpis(summary).slice(0, 4),
      chartTitleEn: "Top items",
      chartTitleAm: "ከፍተኛ እቃዎች",
      chart: rows.slice(0, 8).map((row) => ({ label: row.productName.slice(0, 16), value: row.revenue })),
      columns: [
        { key: "product", labelEn: "Item", labelAm: "እቃ" },
        { key: "station", labelEn: "Station", labelAm: "ጣቢያ" },
        { key: "qty", labelEn: "Qty", labelAm: "ብዛት", align: "right" },
        { key: "revenue", labelEn: "Revenue", labelAm: "ገቢ", align: "right" },
        { key: "margin", labelEn: "Margin %", labelAm: "ህዳግ %", align: "right" },
      ],
      rows: applySearch(
        rows.map((row, index) => ({
          id: `item-${index}`,
          product: row.productName,
          station: row.station,
          qty: row.qty,
          revenue: Number(row.revenue.toFixed(2)),
          margin: Number((row.margin * 100).toFixed(1)),
        })),
        filters.search,
      ),
      emptyMessageEn: "No item sales.",
      emptyMessageAm: "የእቃ ሽያጭ የለም።",
    };
  }

  if (id === "sales-by-area" || id === "sales-by-area-report") {
    const map = new Map<string, { key: string; qty: number; revenue: number }>();
    sales.forEach((row) => {
      const key = row.area || "Unassigned";
      const current = map.get(key) ?? { key, qty: 0, revenue: 0 };
      current.qty += row.qty;
      current.revenue += row.revenue;
      map.set(key, current);
    });
    const rows = Array.from(map.values()).sort((a, b) => b.revenue - a.revenue);
    return {
      enabled: true,
      kpis: summaryKpis(summary).slice(0, 4),
      chartTitleEn: "Sales by area",
      chartTitleAm: "በክፍል ሽያጭ",
      chart: rows.map((row) => ({ label: row.key, value: row.revenue })),
      columns: [
        { key: "area", labelEn: "Area", labelAm: "ክፍል" },
        { key: "qty", labelEn: "Qty", labelAm: "ብዛት", align: "right" },
        { key: "revenue", labelEn: "Revenue", labelAm: "ገቢ", align: "right" },
      ],
      rows: applySearch(
        rows.map((row) => ({ id: row.key, area: row.key, qty: row.qty, revenue: Number(row.revenue.toFixed(2)) })),
        filters.search,
      ),
      emptyMessageEn: "No area sales.",
      emptyMessageAm: "የክፍል ሽያጭ የለም።",
    };
  }

  if (id === "sales-by-waiter" || id === "waiter-performance" || id === "staff-sales") {
    const integrated = buildPosIntegratedReports({
      orders: input.orders,
      ledger: input.ledger,
      posReservations: input.posReservations,
      fromDate,
      toDate,
    });
    const rows = integrated.salesByWaiter;
    return {
      enabled: true,
      kpis: [
        moneyKpi("sales", "Waiter Sales", "የአስተናጋጅ ሽያጭ", rows.reduce((s, r) => s + r.sales, 0), "ember"),
        countKpi("waiters", "Waiters", "አስተናጋጆች", rows.length, "teff"),
        countKpi("orders", "Orders", "ትዕዛዞች", rows.reduce((s, r) => s + r.orders, 0)),
      ],
      chartTitleEn: "Waiter ranking",
      chartTitleAm: "የአስተናጋጅ ደረጃ",
      chart: rows.slice(0, 8).map((row) => ({ label: row.key, value: row.sales })),
      columns: [
        { key: "waiter", labelEn: "Waiter", labelAm: "አስተናጋጅ" },
        { key: "orders", labelEn: "Orders", labelAm: "ትዕዛዞች", align: "right" },
        { key: "sales", labelEn: "Sales", labelAm: "ሽያጭ", align: "right" },
      ],
      rows: applySearch(
        rows.map((row) => ({
          id: row.key,
          waiter: row.key,
          orders: row.orders,
          sales: Number(row.sales.toFixed(2)),
          href: "/app/staff-sales",
        })),
        filters.search,
      ),
      emptyMessageEn: "No waiter sales.",
      emptyMessageAm: "የአስተናጋጅ ሽያጭ የለም።",
    };
  }

  if (id === "sales-by-cashier" || id === "cashier-performance") {
    const integrated = buildPosIntegratedReports({
      orders: input.orders,
      ledger: input.ledger,
      posReservations: input.posReservations,
      fromDate,
      toDate,
    });
    const rows = integrated.salesByCashier;
    return {
      enabled: true,
      kpis: [
        moneyKpi("sales", "Cashier Sales", "የካሸር ሽያጭ", rows.reduce((s, r) => s + r.sales, 0), "ember"),
        countKpi("cashiers", "Cashiers", "ካሸሮች", rows.length),
      ],
      chartTitleEn: "Cashier ranking",
      chartTitleAm: "የካሸር ደረጃ",
      chart: rows.slice(0, 8).map((row) => ({ label: row.key, value: row.sales })),
      columns: [
        { key: "cashier", labelEn: "Cashier", labelAm: "ካሸር" },
        { key: "orders", labelEn: "Orders", labelAm: "ትዕዛዞች", align: "right" },
        { key: "sales", labelEn: "Sales", labelAm: "ሽያጭ", align: "right" },
      ],
      rows: applySearch(
        rows.map((row) => ({
          id: row.key,
          cashier: row.key,
          orders: row.orders,
          sales: Number(row.sales.toFixed(2)),
        })),
        filters.search,
      ),
      emptyMessageEn: "No cashier sales.",
      emptyMessageAm: "የካሸር ሽያጭ የለም።",
    };
  }

  // Orders reports
  if (id === "orders-by-status" || id === "active-orders" || id === "closed-orders" || id === "cancelled-orders" || id === "returned-orders") {
    let scoped = input.orders;
    if (id === "active-orders") scoped = scoped.filter((order) => !isFinalOrderStatus(order.status));
    if (id === "closed-orders") scoped = scoped.filter((order) => order.status === "CLOSED");
    if (id === "cancelled-orders") scoped = scoped.filter((order) => order.status === "CANCELLED");
    if (id === "returned-orders") scoped = scoped.filter((order) => order.status === "RETURNED");
    if (filters.orderStatus !== "All") scoped = scoped.filter((order) => order.status === filters.orderStatus);
    if (filters.waiter !== "All") scoped = scoped.filter((order) => order.waiter === filters.waiter);
    if (filters.area !== "All") scoped = scoped.filter((order) => order.area === filters.area);

    const byStatus = new Map<string, number>();
    scoped.forEach((order) => byStatus.set(order.status, (byStatus.get(order.status) ?? 0) + 1));
    const statusRows = Array.from(byStatus.entries()).map(([status, count]) => ({ status, count }));

    return {
      enabled: true,
      kpis: [
        countKpi("total", "Orders", "ትዕዛዞች", scoped.length, "ember"),
        countKpi("active", "Active", "ንቁ", scoped.filter((o) => !isFinalOrderStatus(o.status)).length, "gold"),
        countKpi("closed", "Closed", "የተዘጉ", scoped.filter((o) => o.status === "CLOSED").length, "teff"),
        moneyKpi("value", "Order Value", "የትዕዛዝ ዋጋ", scoped.reduce((s, o) => s + o.total, 0)),
      ],
      chartTitleEn: "Orders by status",
      chartTitleAm: "በሁኔታ ትዕዛዞች",
      chart: statusRows.map((row) => ({ label: row.status, value: row.count })),
      columns: [
        { key: "orderNo", labelEn: "Order", labelAm: "ትዕዛዝ" },
        { key: "status", labelEn: "Status", labelAm: "ሁኔታ" },
        { key: "payment", labelEn: "Payment", labelAm: "ክፍያ" },
        { key: "table", labelEn: "Table", labelAm: "ጠረጴዛ" },
        { key: "waiter", labelEn: "Waiter", labelAm: "አስተናጋጅ" },
        { key: "total", labelEn: "Total", labelAm: "ድምር", align: "right" },
      ],
      rows: applySearch(
        scoped.map((order) => ({
          id: order.id,
          orderNo: order.orderNo,
          status: order.status,
          payment: displayPaymentStatus(order),
          table: `${order.area} ${order.tableNumber}`,
          waiter: order.waiter,
          total: Number(order.total.toFixed(2)),
          href: "/app/orders",
        })),
        filters.search,
      ),
      emptyMessageEn: "No orders match this report.",
      emptyMessageAm: "ከዚህ ሪፖርት ጋር የሚዛመድ ትዕዛዝ የለም።",
    };
  }

  // Payments reports
  if (id === "payment-summary" || id === "payment-method-breakdown" || id === "payment-transactions") {
    const settled = payments.filter((p) => p.status === "Settled");
    const pending = payments.filter((p) => p.status === "Pending");
    const voided = payments.filter((p) => p.status === "Void");
    const methodMap = new Map<string, { amount: number; count: number }>();
    settled.forEach((payment) => {
      const current = methodMap.get(payment.method) ?? { amount: 0, count: 0 };
      current.amount += payment.amount;
      current.count += 1;
      methodMap.set(payment.method, current);
    });
    const methods = Array.from(methodMap.entries()).map(([method, data]) => ({ method, ...data }));
    const list = id === "payment-transactions" ? payments : settled;
    return {
      enabled: true,
      kpis: [
        moneyKpi("collected", "Total Collected", "ጠቅላላ የተሰበሰበ", settled.reduce((s, p) => s + p.amount, 0), "teff"),
        countKpi("tx", "Transactions", "ግብይቶች", payments.length),
        moneyKpi("pending", "Pending Amount", "በመጠባበቅ", pending.reduce((s, p) => s + p.amount, 0), "gold"),
        moneyKpi("voided", "Voided Amount", "የተሰረዘ", voided.reduce((s, p) => s + p.amount, 0), "destructive"),
      ],
      chartTitleEn: "Payment methods",
      chartTitleAm: "የክፍያ ዘዴዎች",
      chart: methods.map((row) => ({ label: row.method, value: row.amount })),
      columns: [
        { key: "ref", labelEn: "Ref", labelAm: "ማጣቀሻ" },
        { key: "method", labelEn: "Method", labelAm: "ዘዴ" },
        { key: "status", labelEn: "Status", labelAm: "ሁኔታ" },
        { key: "table", labelEn: "Table", labelAm: "ጠረጴዛ" },
        { key: "cashier", labelEn: "Cashier", labelAm: "ካሸር" },
        { key: "amount", labelEn: "Amount", labelAm: "መጠን", align: "right" },
      ],
      rows: applySearch(
        list.map((payment) => ({
          id: payment.id,
          ref: payment.receiptNumber ?? payment.ref,
          method: payment.method,
          status: payment.status,
          table: payment.table,
          cashier: payment.receivedByCashier || payment.cashier,
          amount: Number(payment.amount.toFixed(2)),
          href: "/app/payments",
        })),
        filters.search,
      ),
      emptyMessageEn: "No payments in this range.",
      emptyMessageAm: "በዚህ ክልል ክፍያ የለም።",
    };
  }

  if (id === "unpaid-orders" || id === "partial-payments") {
    const waiting = input.orders.filter((order) => {
      if (!order.receipt) return false;
      const status = displayPaymentStatus(order);
      if (id === "partial-payments") return status === "Partially Paid";
      return status === "Unpaid" || status === "Partially Paid";
    });
    return {
      enabled: true,
      kpis: [
        countKpi("count", "Pending receipts", "በመጠባበቅ ደረሰኞች", waiting.length, "gold"),
        moneyKpi("due", "Outstanding", "ቀሪ", waiting.reduce((s, o) => s + (o.receipt?.grandTotal ?? o.total), 0), "ember"),
      ],
      chartTitleEn: "Outstanding by area",
      chartTitleAm: "በክፍል ቀሪ",
      chart: Object.entries(
        waiting.reduce((acc, order) => {
          acc[order.area] = (acc[order.area] ?? 0) + (order.receipt?.grandTotal ?? order.total);
          return acc;
        }, {} as Record<string, number>),
      ).map(([label, value]) => ({ label, value })),
      columns: [
        { key: "orderNo", labelEn: "Order", labelAm: "ትዕዛዝ" },
        { key: "table", labelEn: "Table", labelAm: "ጠረጴዛ" },
        { key: "status", labelEn: "Payment", labelAm: "ክፍያ" },
        { key: "total", labelEn: "Total", labelAm: "ድምር", align: "right" },
      ],
      rows: applySearch(
        waiting.map((order) => ({
          id: order.id,
          orderNo: order.orderNo,
          table: `${order.area} ${order.tableNumber}`,
          status: displayPaymentStatus(order),
          total: Number((order.receipt?.grandTotal ?? order.total).toFixed(2)),
          href: "/app/pos",
        })),
        filters.search,
      ),
      emptyMessageEn: "No pending payments.",
      emptyMessageAm: "በመጠባበቅ ያለ ክፍያ የለም።",
    };
  }

  if (id === "refunds-report" || id === "voids-report" || id === "voids-refunds-audit") {
    const refunds = input.orders.filter((order) => order.status === "RETURNED" || order.returnedAt);
    const voids = input.orders.filter((order) => order.status === "CANCELLED" || order.voidRequestedAt);
    const rows = id === "refunds-report" ? refunds : id === "voids-report" ? voids : [...refunds, ...voids];
    return {
      enabled: true,
      kpis: [
        countKpi("refunds", "Returns", "ተመላሾች", refunds.length, "gold"),
        countKpi("voids", "Voids", "ስረዛዎች", voids.length, "destructive"),
        moneyKpi("value", "Affected value", "ተጽዕኖ ዋጋ", rows.reduce((s, o) => s + o.total, 0)),
      ],
      chartTitleEn: "Exceptions",
      chartTitleAm: "ልዩነቶች",
      chart: [
        { label: "Returns", value: refunds.length },
        { label: "Voids", value: voids.length },
      ],
      columns: [
        { key: "orderNo", labelEn: "Order", labelAm: "ትዕዛዝ" },
        { key: "status", labelEn: "Status", labelAm: "ሁኔታ" },
        { key: "waiter", labelEn: "Waiter", labelAm: "አስተናጋጅ" },
        { key: "total", labelEn: "Total", labelAm: "ድምር", align: "right" },
      ],
      rows: applySearch(
        rows.map((order) => ({
          id: order.id,
          orderNo: order.orderNo,
          status: order.status,
          waiter: order.waiter,
          total: Number(order.total.toFixed(2)),
          href: "/app/orders",
        })),
        filters.search,
      ),
      emptyMessageEn: "No voids or returns.",
      emptyMessageAm: "ስረዛ ወይም ተመላሽ የለም።",
    };
  }

  if (id === "cash-reconciliation" || id === "shift-settlement-report") {
    const sessions = input.posShiftSessions;
    const open = sessions.filter((s) => s.status === "Open");
    const closed = sessions.filter((s) => s.status === "Closed");
    return {
      enabled: true,
      kpis: [
        countKpi("open", "Open shifts", "ክፍት ሽፍቶች", open.length, open.length ? "gold" : "teff"),
        countKpi("closed", "Closed shifts", "የተዘጉ ሽፍቶች", closed.length),
        moneyKpi(
          "pack",
          "Last close sales",
          "የመጨረሻ መዝጋት ሽያጭ",
          closed.at(-1)?.closePack?.salesTotal ?? 0,
          "ember",
        ),
      ],
      chartTitleEn: "Shift sessions",
      chartTitleAm: "የሽፍት ክፍለ ጊዜዎች",
      chart: [
        { label: "Open", value: open.length },
        { label: "Closed", value: closed.length },
      ],
      columns: [
        { key: "id", labelEn: "Session", labelAm: "ክፍለ ጊዜ" },
        { key: "status", labelEn: "Status", labelAm: "ሁኔታ" },
        { key: "openedBy", labelEn: "Opened by", labelAm: "የከፈተ" },
        { key: "sales", labelEn: "Sales", labelAm: "ሽያጭ", align: "right" },
      ],
      rows: applySearch(
        sessions.map((session) => ({
          id: session.id,
          status: session.status,
          openedBy: session.openedBy,
          sales: Number((session.closePack?.salesTotal ?? 0).toFixed(2)),
          href: "/app/payments",
        })),
        filters.search,
      ),
      emptyMessageEn: "No shift sessions yet. Open a shift from Payments.",
      emptyMessageAm: "እስካሁን ሽፍት የለም። ከክፍያዎች ሽፍት ይክፈቱ።",
    };
  }

  // Inventory reports
  const settings = input.inventorySettings ?? DEFAULT_INVENTORY_SETTINGS;
  const policies = input.locationPolicies ?? [];
  const dashboard = buildStockDashboardSummary(
    input.stockItems,
    input.ledger,
    input.requests,
    input.transfers,
    input.counts,
    policies,
    settings,
    input.lots,
  );
  const valuation = buildStockValuationReport(
    input.stockItems,
    input.ledger,
    input.lots,
    settings,
    input.transfers,
    policies,
  );

  if (id === "stock-balance" || id === "inventory-valuation" || id === "department-stock" || id === "store-1-stock" || id === "store-2-stock") {
    let rows = valuation;
    if (id === "store-1-stock") rows = rows.filter((row) => String(row.location) === "Store 1");
    if (id === "store-2-stock") rows = rows.filter((row) => String(row.location) === "Store 2");
    if (id === "department-stock") {
      rows = rows.filter((row) => !String(row.location).startsWith("Store"));
    }
    if (filters.inventoryLocation !== "All") {
      rows = rows.filter((row) => String(row.location) === filters.inventoryLocation);
    }
    return {
      enabled: true,
      kpis: [
        moneyKpi("value", "Inventory Value", "የክምችት ዋጋ", dashboard.totalInventoryValue, "ember"),
        countKpi("low", "Low Stock", "ዝቅተኛ", dashboard.lowStockItems.length, "gold"),
        countKpi("out", "Out of Stock", "ያለቀ", dashboard.negativeStockItems.filter((i) => i.quantity <= 0).length, "destructive"),
        countKpi("skus", "SKU rows", "የSKU መስመሮች", rows.length),
      ],
      chartTitleEn: "Value by location",
      chartTitleAm: "በቦታ ዋጋ",
      chart: Object.entries(
        rows.reduce((acc, row) => {
          const key = String(row.location);
          acc[key] = (acc[key] ?? 0) + row.inventoryValue;
          return acc;
        }, {} as Record<string, number>),
      ).map(([label, value]) => ({ label, value })),
      columns: [
        { key: "item", labelEn: "Item", labelAm: "እቃ" },
        { key: "location", labelEn: "Location", labelAm: "ቦታ" },
        { key: "qty", labelEn: "Qty", labelAm: "ብዛት", align: "right" },
        { key: "value", labelEn: "Value", labelAm: "ዋጋ", align: "right" },
      ],
      rows: applySearch(
        rows.map((row, index) => ({
          id: `${row.itemId}-${row.location}-${index}`,
          item: row.itemName,
          location: String(row.location),
          qty: row.quantity,
          value: Number(row.inventoryValue.toFixed(2)),
          href: "/app/stock-management",
        })),
        filters.search,
      ),
      emptyMessageEn: "No stock balances.",
      emptyMessageAm: "የክምችት ቀሪ የለም።",
    };
  }

  if (id === "low-stock" || id === "out-of-stock" || id === "negative-stock") {
    const rows =
      id === "low-stock"
        ? dashboard.lowStockItems
        : id === "negative-stock"
          ? dashboard.negativeStockItems
          : dashboard.lowStockItems.filter((row) => row.quantity <= 0);
    return {
      enabled: true,
      kpis: [
        countKpi("count", "Items", "እቃዎች", rows.length, "destructive"),
        moneyKpi("value", "Inventory Value", "የክምችት ዋጋ", dashboard.totalInventoryValue),
      ],
      chartTitleEn: "Alert items",
      chartTitleAm: "ማስጠንቀቂያ እቃዎች",
      chart: rows.slice(0, 8).map((row) => ({ label: row.itemName.slice(0, 14), value: Math.max(row.quantity, 0) })),
      columns: [
        { key: "item", labelEn: "Item", labelAm: "እቃ" },
        { key: "location", labelEn: "Location", labelAm: "ቦታ" },
        { key: "qty", labelEn: "Qty", labelAm: "ብዛት", align: "right" },
        { key: "reorder", labelEn: "Reorder", labelAm: "ዳግም ትዕዛዝ", align: "right" },
      ],
      rows: applySearch(
        rows.map((row, index) => ({
          id: `${row.itemId}-${index}`,
          item: row.itemName,
          location: String(row.location),
          qty: row.quantity,
          reorder: row.reorderLevel,
          href: "/app/stock-management",
        })),
        filters.search,
      ),
      emptyMessageEn: "No stock alerts.",
      emptyMessageAm: "የክምችት ማስጠንቀቂያ የለም።",
    };
  }

  if (id === "stock-ledger" || id === "item-movement" || id === "wastage" || id === "wastage-by-station" || id === "department-consumption") {
    const movement = buildStockMovementSummary(input.ledger, fromDate, toDate);
    const consumption = buildConsumptionReport(input.ledger, fromDate, toDate);
    const ledgerRows =
      id === "wastage" || id === "wastage-by-station"
        ? input.ledger.filter((entry) => entry.type.toLowerCase().includes("waste") || entry.type.toLowerCase().includes("wastage"))
        : input.ledger.filter((entry) => inDateRange(entry.date, fromDate, toDate));
    return {
      enabled: true,
      kpis: [
        countKpi("moves", "Movements", "እንቅስቃሴዎች", movement.length),
        countKpi("consume", "Consumption lines", "የፍጆታ መስመሮች", consumption.length, "ember"),
        moneyKpi("cost", "Ledger cost", "የመዝገብ ወጪ", ledgerRows.reduce((s, r) => s + (r.totalCost ?? 0), 0)),
      ],
      chartTitleEn: "Movement by type",
      chartTitleAm: "በአይነት እንቅስቃሴ",
      chart: movement.slice(0, 8).map((row) => ({ label: row.type, value: Number(row.quantity) })),
      columns: [
        { key: "date", labelEn: "Date", labelAm: "ቀን" },
        { key: "type", labelEn: "Type", labelAm: "አይነት" },
        { key: "item", labelEn: "Item", labelAm: "እቃ" },
        { key: "location", labelEn: "Location", labelAm: "ቦታ" },
        { key: "qty", labelEn: "Qty", labelAm: "ብዛት", align: "right" },
      ],
      rows: applySearch(
        ledgerRows.slice(0, 500).map((entry) => ({
          id: entry.id,
          date: entry.date,
          type: entry.type,
          item: entry.itemName,
          location: String(entry.location),
          qty: entry.quantity,
          href: "/app/stock-management",
        })),
        filters.search,
      ),
      emptyMessageEn: "No stock movements.",
      emptyMessageAm: "የክምችት እንቅስቃሴ የለም።",
    };
  }

  if (id === "expiry") {
    const alerts = buildExpiryAlerts(input.lots);
    return {
      enabled: true,
      kpis: [countKpi("lots", "Expiring lots", "ለማብቃት የቀረቡ", alerts.length, "gold")],
      chartTitleEn: "Expiring lots",
      chartTitleAm: "ማብቂያ",
      chart: alerts.slice(0, 8).map((row) => ({ label: String(row.itemName ?? "Lot").slice(0, 14), value: 1 })),
      columns: [
        { key: "item", labelEn: "Item", labelAm: "እቃ" },
        { key: "lot", labelEn: "Lot", labelAm: "ሎት" },
        { key: "expiry", labelEn: "Expiry", labelAm: "ማብቂያ" },
      ],
      rows: applySearch(
        alerts.map((row, index) => ({
          id: `lot-${index}`,
          item: String(row.itemName ?? ""),
          lot: String(row.lotNumber ?? row.id ?? ""),
          expiry: String(row.expiryDate ?? ""),
        })),
        filters.search,
      ),
      emptyMessageEn: "No expiry alerts.",
      emptyMessageAm: "የማብቂያ ማስጠንቀቂያ የለም።",
    };
  }

  if (id === "count-variance") {
    const rows = buildCountVarianceReport(input.counts);
    return {
      enabled: true,
      kpis: [countKpi("rows", "Variance rows", "የልዩነት መስመሮች", rows.length)],
      chartTitleEn: "Count variance",
      chartTitleAm: "የቁጥር ልዩነት",
      chart: rows.slice(0, 8).map((row) => ({ label: String(row.itemName ?? "Item").slice(0, 14), value: Number(row.variance ?? 0) })),
      columns: [
        { key: "item", labelEn: "Item", labelAm: "እቃ" },
        { key: "variance", labelEn: "Variance", labelAm: "ልዩነት", align: "right" },
      ],
      rows: applySearch(
        rows.map((row, index) => ({
          id: `var-${index}`,
          item: String(row.itemName ?? ""),
          variance: Number(row.variance ?? 0),
        })),
        filters.search,
      ),
      emptyMessageEn: "No count variances.",
      emptyMessageAm: "የቁጥር ልዩነት የለም።",
    };
  }

  if (id === "stock-requests") {
    return {
      enabled: true,
      kpis: [countKpi("req", "Requests", "ጥያቄዎች", input.requests.length, "gold")],
      chartTitleEn: "Requests",
      chartTitleAm: "ጥያቄዎች",
      chart: [{ label: "Requests", value: input.requests.length }],
      columns: [
        { key: "number", labelEn: "Request", labelAm: "ጥያቄ" },
        { key: "status", labelEn: "Status", labelAm: "ሁኔታ" },
        { key: "department", labelEn: "Department", labelAm: "ክፍል" },
      ],
      rows: applySearch(
        input.requests.map((row) => ({
          id: row.id,
          number: row.requestNumber,
          status: row.status,
          department: String(row.requestingDepartment),
          href: "/app/stock-management",
        })),
        filters.search,
      ),
      emptyMessageEn: "No stock requests.",
      emptyMessageAm: "የክምችት ጥያቄ የለም።",
    };
  }

  if (id === "stock-transfers") {
    return {
      enabled: true,
      kpis: [countKpi("tr", "Transfers", "ዝውውሮች", input.transfers.length)],
      chartTitleEn: "Transfers",
      chartTitleAm: "ዝውውሮች",
      chart: [{ label: "Transfers", value: input.transfers.length }],
      columns: [
        { key: "number", labelEn: "Transfer", labelAm: "ዝውውር" },
        { key: "status", labelEn: "Status", labelAm: "ሁኔታ" },
        { key: "from", labelEn: "From", labelAm: "ከ" },
        { key: "to", labelEn: "To", labelAm: "ወደ" },
      ],
      rows: applySearch(
        input.transfers.map((row) => ({
          id: row.id,
          number: row.transferNumber,
          status: row.status,
          from: String(row.sourceLocation),
          to: String(row.destinationLocation),
          href: "/app/stock-management",
        })),
        filters.search,
      ),
      emptyMessageEn: "No transfers.",
      emptyMessageAm: "ዝውውር የለም።",
    };
  }

  if (id === "goods-receiving" || id === "purchase-receiving" || id === "purchase-orders") {
    const receiving = buildPurchaseOrderReceivingReport(input.purchaseOrders, input.goodsReceiving);
    return {
      enabled: true,
      kpis: [
        countKpi("po", "Purchase orders", "የግዢ ትዕዛዞች", input.purchaseOrders.length),
        countKpi("grn", "Goods receipts", "መቀበያዎች", input.goodsReceiving.length, "teff"),
      ],
      chartTitleEn: "Purchasing activity",
      chartTitleAm: "የግዢ እንቅስቃሴ",
      chart: [
        { label: "POs", value: input.purchaseOrders.length },
        { label: "GRNs", value: input.goodsReceiving.length },
      ],
      columns: [
        { key: "document", labelEn: "Document", labelAm: "ሰነድ" },
        { key: "status", labelEn: "Status", labelAm: "ሁኔታ" },
        { key: "supplier", labelEn: "Supplier", labelAm: "አቅራቢ" },
      ],
      rows: applySearch(
        (receiving.length
          ? receiving
          : input.purchaseOrders.map((po) => ({
              purchaseOrderNumber: po.purchaseOrderNumber,
              status: po.status,
              supplier: po.supplier,
            }))
        ).map((row, index) => ({
          id: `po-${index}`,
          document: String("purchaseOrderNumber" in row ? row.purchaseOrderNumber : row.documentNumber ?? ""),
          status: String(row.status ?? ""),
          supplier: String("supplier" in row ? row.supplier : ""),
          href: "/app/suppliers",
        })),
        filters.search,
      ),
      emptyMessageEn: "No purchasing documents.",
      emptyMessageAm: "የግዢ ሰነድ የለም።",
    };
  }

  if (id === "approval-history") {
    const rows = buildApprovalActivityReport(input.documentsForApproval);
    return {
      enabled: true,
      kpis: [countKpi("events", "Approval events", "የማጽደቅ ክስተቶች", rows.length)],
      chartTitleEn: "Approvals",
      chartTitleAm: "ማጽደቆች",
      chart: [{ label: "Events", value: rows.length }],
      columns: [
        { key: "document", labelEn: "Document", labelAm: "ሰነድ" },
        { key: "action", labelEn: "Action", labelAm: "እርምጃ" },
        { key: "by", labelEn: "By", labelAm: "በ" },
        { key: "at", labelEn: "At", labelAm: "ጊዜ" },
      ],
      rows: applySearch(
        rows.map((row, index) => ({
          id: `ap-${index}`,
          document: String(row.documentNumber ?? ""),
          action: String(row.action ?? ""),
          by: String(row.actedBy ?? ""),
          at: String(row.actedAt ?? ""),
        })),
        filters.search,
      ),
      emptyMessageEn: "No approval history.",
      emptyMessageAm: "የማጽደቅ ታሪክ የለም።",
    };
  }

  return comingSoon(id);
}
