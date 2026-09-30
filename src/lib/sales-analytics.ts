import type {
  ExpenseRecord,
  MenuItem,
  Order,
  OrderLine,
  OrderPayment,
  PaymentLedgerEntry,
  SalesRecord,
} from "./demo-data.ts";
import type { InventoryWorkspace } from "./inventory-access.ts";
import { resolveDailyDashboardPeriodStart, stationToOperationalLocation } from "./stock-management.ts";

export type SalesSummary = {
  receipts: number;
  qty: number;
  revenue: number;
  productExpense: number;
  operatingExpense: number;
  totalExpense: number;
  profit: number;
};

export type ProductSalesRow = {
  productId?: string;
  productName: string;
  category: string;
  station: string;
  qty: number;
  revenue: number;
  expense: number;
  profit: number;
  margin: number;
};

export type GroupedMoneyRow = {
  key: string;
  qty: number;
  revenue: number;
  expense: number;
  profit: number;
};

export type HourlySalesRow = {
  h: string;
  sales: number;
};

function pad(value: number) {
  return String(value).padStart(2, "0");
}

export function dateKey(date = new Date()) {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

export function monthKey(date = new Date()) {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}`;
}

export function monthFromDateKey(date: string) {
  return date.slice(0, 7);
}

export function dateKeyFromDateTime(value?: string) {
  if (!value) return null;
  const trimmed = value.trim();
  // Date-only keys are already local business dates — do not shift via UTC parsing.
  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) return trimmed;

  const gb = trimmed.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  if (gb) return `${gb[3]}-${pad(Number(gb[2]))}-${pad(Number(gb[1]))}`;

  // ISO timestamps (with Z or offset) must use the restaurant's local calendar day.
  const parsed = new Date(trimmed);
  return Number.isNaN(parsed.getTime()) ? null : dateKey(parsed);
}

export function activeReportDate(
  salesRecords: SalesRecord[],
  expenseRecords: ExpenseRecord[],
  payments: PaymentLedgerEntry[] = [],
  today = dateKey(),
) {
  const dates = Array.from(
    new Set([
      ...salesRecords.map((record) => record.date),
      ...expenseRecords.map((record) => record.date),
      ...payments.flatMap((payment) => {
        const date = paymentDateKey(payment);
        return date ? [date] : [];
      }),
    ]),
  ).sort();
  return dates.includes(today) ? today : (dates.at(-1) ?? today);
}

export function activeReportMonth(
  salesRecords: SalesRecord[],
  expenseRecords: ExpenseRecord[],
  payments: PaymentLedgerEntry[] = [],
  thisMonth = monthKey(),
) {
  const months = Array.from(
    new Set([
      ...salesRecords.map((record) => record.month),
      ...expenseRecords.map((record) => record.month),
      ...payments.flatMap((payment) => {
        const date = paymentDateKey(payment);
        return date ? [monthFromDateKey(date)] : [];
      }),
    ]),
  ).sort();
  return months.includes(thisMonth) ? thisMonth : (months.at(-1) ?? thisMonth);
}

export function summarizeSales(
  records: SalesRecord[],
  expenses: ExpenseRecord[] = [],
): SalesSummary {
  const receipts = new Set(records.map((record) => record.receiptNumber)).size;
  const qty = records.reduce((sum, record) => sum + record.qty, 0);
  const revenue = records.reduce((sum, record) => sum + record.revenue, 0);
  const productExpense = records.reduce((sum, record) => sum + record.expense, 0);
  const operatingExpense = expenses.reduce((sum, record) => sum + record.amount, 0);
  const totalExpense = productExpense + operatingExpense;

  return {
    receipts,
    qty,
    revenue,
    productExpense,
    operatingExpense,
    totalExpense,
    profit: revenue - totalExpense,
  };
}

export function summarizeSalesWithPayments(
  records: SalesRecord[],
  expenses: ExpenseRecord[] = [],
  payments: PaymentLedgerEntry[] = [],
): SalesSummary {
  const summary = summarizeSales(records, expenses);
  const settled = payments.filter((payment) => payment.status === "Settled" && payment.amount > 0);
  if (records.length > 0 || settled.length === 0) return summary;

  const revenue = settled.reduce((sum, payment) => sum + payment.amount, 0);
  const receipts = new Set(
    settled.map((payment) => payment.receiptNumber ?? payment.ref ?? payment.id),
  ).size;
  return {
    ...summary,
    receipts,
    revenue,
    totalExpense: summary.operatingExpense,
    profit: revenue - summary.operatingExpense,
  };
}

export function filterSalesByDate(records: SalesRecord[], date: string) {
  return records.filter((record) => record.date === date);
}

/** Sales whose station maps to one of the given operational stock locations (VIP Bar, Main Bar, etc.). */
export function filterSalesForOperationalLocations(
  records: SalesRecord[],
  locations: readonly string[],
  date?: string,
): SalesRecord[] {
  const allowed = new Set(locations.map((loc) => loc.trim()).filter(Boolean));
  if (allowed.size === 0) return [];

  return records.filter((record) => {
    if (date && record.date !== date) return false;
    const mapped = stationToOperationalLocation(record.station);
    return mapped != null && allowed.has(mapped);
  });
}

export function salesRecordTimestamp(record: Pick<SalesRecord, "date" | "time">): string {
  if (record.time && record.time.length >= 19 && record.time.includes("T")) return record.time;
  if (record.time && /^\d{1,2}:\d{2}/.test(record.time)) {
    const parts = record.time.split(":");
    const hh = String(Number(parts[0])).padStart(2, "0");
    const mm = String(Number(parts[1])).padStart(2, "0");
    return `${record.date}T${hh}:${mm}:00.000Z`;
  }
  return `${record.date}T00:00:00.000Z`;
}

/** Keep sales after Daily Stock Closing reset (or all rows when periodStart is null). */
export function filterSalesAfterDashboardPeriod(
  records: SalesRecord[],
  periodStart: string | null,
): SalesRecord[] {
  if (!periodStart) return records;
  return records.filter((record) => salesRecordTimestamp(record) > periodStart);
}

export function paymentTimestamp(payment: PaymentLedgerEntry): string {
  const raw = payment.paymentReceivedAt ?? payment.time ?? "";
  if (raw.length >= 19 && raw.includes("T")) return raw;
  if (/^\d{1,2}:\d{2}/.test(raw)) {
    const parts = raw.split(":");
    const hh = String(Number(parts[0])).padStart(2, "0");
    const mm = String(Number(parts[1])).padStart(2, "0");
    const day = paymentDateKey(payment) ?? dateKey();
    return `${day}T${hh}:${mm}:00.000Z`;
  }
  const day = paymentDateKey(payment);
  return day ? `${day}T00:00:00.000Z` : `${dateKey()}T00:00:00.000Z`;
}

/** Keep payments after Daily Closing reset (or all rows when periodStart is null). */
export function filterPaymentsAfterDashboardPeriod(
  payments: PaymentLedgerEntry[],
  periodStart: string | null,
): PaymentLedgerEntry[] {
  if (!periodStart) return payments;
  return payments.filter((payment) => paymentTimestamp(payment) > periodStart);
}

/**
 * Dashboard "today" slice: calendar today only, then reset after daily closing.
 * Never falls back to a previous business day.
 */
export function buildDashboardTodaySlice(
  salesRecords: SalesRecord[],
  expenseRecords: ExpenseRecord[],
  payments: PaymentLedgerEntry[],
  closings: Array<{ date: string; location: string; closedAt?: string }> = [],
  options: {
    workspace?: InventoryWorkspace;
    assignedLocations?: readonly string[];
    today?: string;
  } = {},
) {
  const today = options.today ?? dateKey();
  const workspace = options.workspace ?? "all";
  // Always use branch-wide closing so one daily close resets dashboards for every role/location.
  const periodStart = resolveDailyDashboardPeriodStart(closings, "all", today);
  const scopedSales =
    workspace !== "all"
      ? filterSalesForOperationalLocations(salesRecords, [workspace], today)
      : options.assignedLocations && options.assignedLocations.length > 0
        ? filterSalesForOperationalLocations(salesRecords, options.assignedLocations, today)
        : filterSalesByDate(salesRecords, today);
  const sales = filterSalesAfterDashboardPeriod(scopedSales, periodStart);
  const expenses = filterExpensesByDate(expenseRecords, today);
  const dailyPayments = filterPaymentsByDate(payments, today);
  const settledPayments = filterPaymentsAfterDashboardPeriod(dailyPayments, periodStart);
  return {
    today,
    periodStart,
    sales,
    expenses,
    payments: settledPayments,
    summary: summarizeSalesWithPayments(sales, expenses, settledPayments),
  };
}

export function computeDashboardTodaySalesRevenue(
  salesRecords: SalesRecord[],
  closings: Array<{ date: string; location: string; closedAt?: string }>,
  workspace: InventoryWorkspace = "all",
  options: {
    assignedLocations?: readonly string[];
    today?: string;
  } = {},
) {
  return buildDashboardTodaySlice(salesRecords, [], [], closings, {
    workspace,
    assignedLocations: options.assignedLocations,
    today: options.today,
  }).summary.revenue;
}

export function filterSalesByMonth(records: SalesRecord[], month: string) {
  return records.filter((record) => record.month === month);
}

export function filterExpensesByDate(records: ExpenseRecord[], date: string) {
  return records.filter((record) => record.date === date);
}

export function filterExpensesByMonth(records: ExpenseRecord[], month: string) {
  return records.filter((record) => record.month === month);
}

export function paymentDateKey(payment: PaymentLedgerEntry) {
  if (payment.reportDate && /^\d{4}-\d{2}-\d{2}$/.test(payment.reportDate.trim())) {
    return payment.reportDate.trim();
  }
  return (
    dateKeyFromDateTime(payment.paymentReceivedAt) ??
    dateKeyFromDateTime(payment.time) ??
    dateKeyFromDateTime(payment.ref)
  );
}

export function filterPaymentsByDate(payments: PaymentLedgerEntry[], date: string) {
  return payments.filter(
    (payment) => payment.status === "Settled" && paymentDateKey(payment) === date,
  );
}

export function filterPaymentsByMonth(payments: PaymentLedgerEntry[], month: string) {
  return payments.filter((payment) => {
    const date = paymentDateKey(payment);
    return payment.status === "Settled" && date?.startsWith(month);
  });
}

export function groupSalesByProduct(records: SalesRecord[]): ProductSalesRow[] {
  const rows = new Map<string, ProductSalesRow>();

  records.forEach((record) => {
    const key = record.productId ?? record.productName;
    const current = rows.get(key) ?? {
      productId: record.productId,
      productName: record.productName,
      category: record.category,
      station: record.station,
      qty: 0,
      revenue: 0,
      expense: 0,
      profit: 0,
      margin: 0,
    };
    current.qty += record.qty;
    current.revenue += record.revenue;
    current.expense += record.expense;
    current.profit += record.profit;
    current.margin = current.revenue > 0 ? current.profit / current.revenue : 0;
    rows.set(key, current);
  });

  return Array.from(rows.values()).sort((a, b) => b.revenue - a.revenue);
}

export function weekStartKeyFromDateKey(value: string) {
  const date = new Date(`${value}T12:00:00`);
  const day = date.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  date.setDate(date.getDate() + diff);
  return dateKey(date);
}

export function groupSalesByDate(records: SalesRecord[]): GroupedMoneyRow[] {
  return groupSales(records, (record) => record.date).sort((a, b) => a.key.localeCompare(b.key));
}

export function groupSalesByWeek(records: SalesRecord[]): GroupedMoneyRow[] {
  return groupSales(records, (record) => weekStartKeyFromDateKey(record.date)).sort((a, b) =>
    a.key.localeCompare(b.key),
  );
}

export function groupSalesByMonth(records: SalesRecord[]): GroupedMoneyRow[] {
  return groupSales(records, (record) => record.month).sort((a, b) => a.key.localeCompare(b.key));
}

export function groupSalesByStation(records: SalesRecord[]): GroupedMoneyRow[] {
  return groupSales(records, (record) => record.station).sort((a, b) => b.revenue - a.revenue);
}

export function groupSalesByCategory(records: SalesRecord[]): GroupedMoneyRow[] {
  return groupSales(records, (record) => record.category).sort((a, b) => b.revenue - a.revenue);
}

export function groupExpensesByCategory(records: ExpenseRecord[]) {
  const rows = new Map<string, { category: string; amount: number; count: number }>();
  records.forEach((record) => {
    const current = rows.get(record.category) ?? { category: record.category, amount: 0, count: 0 };
    current.amount += record.amount;
    current.count += 1;
    rows.set(record.category, current);
  });
  return Array.from(rows.values()).sort((a, b) => b.amount - a.amount);
}

function hourFromRecordTime(value: string) {
  const match = value.match(/(\d{1,2}):(\d{2})\s*(AM|PM)?/i);
  if (!match) return "00:00";
  let hour = Number(match[1]);
  const period = match[3]?.toUpperCase();
  if (period === "PM" && hour < 12) hour += 12;
  if (period === "AM" && hour === 12) hour = 0;
  return `${pad(hour)}:00`;
}

export function groupSalesByHour(records: SalesRecord[]): HourlySalesRow[] {
  const rows = new Map<string, HourlySalesRow>();
  records.forEach((record) => {
    const h = hourFromRecordTime(record.time);
    const current = rows.get(h) ?? { h, sales: 0 };
    current.sales += record.revenue;
    rows.set(h, current);
  });
  return Array.from(rows.values()).sort((a, b) => a.h.localeCompare(b.h));
}

export function groupPaymentsByHour(payments: PaymentLedgerEntry[]): HourlySalesRow[] {
  const rows = new Map<string, HourlySalesRow>();
  payments
    .filter((payment) => payment.status === "Settled")
    .forEach((payment) => {
      const h = hourFromRecordTime(payment.paymentReceivedAt ?? payment.time ?? "");
      const current = rows.get(h) ?? { h, sales: 0 };
      current.sales += payment.amount;
      rows.set(h, current);
    });
  return Array.from(rows.values()).sort((a, b) => a.h.localeCompare(b.h));
}

export function groupPaymentsByDate(payments: PaymentLedgerEntry[]): GroupedMoneyRow[] {
  const rows = new Map<string, GroupedMoneyRow>();
  payments
    .filter((payment) => payment.status === "Settled")
    .forEach((payment) => {
      const key = paymentDateKey(payment);
      if (!key) return;
      const current = rows.get(key) ?? { key, qty: 0, revenue: 0, expense: 0, profit: 0 };
      current.qty += 1;
      current.revenue += payment.amount;
      current.profit += payment.amount;
      rows.set(key, current);
    });
  return Array.from(rows.values()).sort((a, b) => a.key.localeCompare(b.key));
}

export function inferSpiritPourUnitLabel(
  line: Pick<OrderLine, "unitLabel" | "unitPrice">,
  menuItem?: MenuItem,
): string | undefined {
  const label = line.unitLabel?.trim();
  const category = menuItem?.category?.trim().toLowerCase() ?? "";
  const isSpirit =
    category === "spirits" ||
    category === "spirit" ||
    category === "whisky" ||
    menuItem?.doublePrice != null ||
    menuItem?.singlePrice != null;
  if (!isSpirit) return label;
  if (label && label.toLowerCase() !== "bottle") return label;
  const price = line.unitPrice ?? menuItem?.price ?? 0;
  if (menuItem?.doublePrice != null && Math.abs(price - menuItem.doublePrice) < 0.01) return "Double Shot";
  if (menuItem?.singlePrice != null && Math.abs(price - menuItem.singlePrice) < 0.01) return "Single Shot";
  const halfPrice =
    menuItem?.halfBottlePrice ??
    (menuItem?.price != null && menuItem.price > 0 ? Math.round((menuItem.price / 2) * 100) / 100 : null);
  if (halfPrice != null && Math.abs(price - halfPrice) < 0.01) return "Half Bottle";
  return label ?? menuItem?.unitLabel ?? "Bottle";
}

export function buildSalesRecordsFromOrder(
  order: Order,
  payment: OrderPayment,
  menuItems: MenuItem[],
  closedAt: string,
  date = dateKey(),
): SalesRecord[] {
  const month = monthFromDateKey(date);

  return order.items.map((line, index) => {
    const menuItem =
      menuItems.find((item) => item.id === line.menuItemId) ??
      menuItems.find((item) => item.name_en === line.name);
    const unitPrice = line.unitPrice ?? menuItem?.price ?? 0;
    const unitCost = menuItem?.cost ?? 0;
    const revenue = unitPrice * line.qty;
    const expense = unitCost * line.qty;

    return {
      id: `sr-${order.id}-${index}`,
      date,
      month,
      time: closedAt,
      orderId: order.id,
      orderNo: order.orderNo,
      receiptNumber: payment.receiptNumber,
      productId: line.menuItemId,
      productName: line.name,
      category: menuItem?.category ?? "Uncategorized",
      station: line.station,
      qty: line.qty,
      unitPrice,
      unitCost,
      revenue,
      expense,
      profit: revenue - expense,
      unitLabel: inferSpiritPourUnitLabel(line, menuItem),
      area: order.area,
      tableNumber: order.tableNumber,
      waiter: order.waiter,
      cashier: payment.receivedByCashier,
      paymentMethod: payment.method,
    };
  });
}

function groupSales(
  records: SalesRecord[],
  keyFor: (record: SalesRecord) => string,
): GroupedMoneyRow[] {
  const rows = new Map<string, GroupedMoneyRow>();
  records.forEach((record) => {
    const key = keyFor(record);
    const current = rows.get(key) ?? { key, qty: 0, revenue: 0, expense: 0, profit: 0 };
    current.qty += record.qty;
    current.revenue += record.revenue;
    current.expense += record.expense;
    current.profit += record.profit;
    rows.set(key, current);
  });
  return Array.from(rows.values());
}
