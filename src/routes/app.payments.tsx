import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import * as Icons from "lucide-react";
import { Bar, BarChart, CartesianGrid, Cell, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { PaymentDrawer } from "@/components/payments/payment-drawer";
import { PaymentsShell } from "@/components/payments/payments-shell";
import { PageHeader, Card, Chip, Stat } from "@/components/ui-kit";
import { formatETB } from "@/lib/ethiopic";
import { isFinalOrderStatus, type PaymentLedgerEntry } from "@/lib/demo-data";
import { useAuth } from "@/lib/auth-context";
import { useT } from "@/lib/i18n";
import { showSuccess } from "@/lib/toast";
import { displayPaymentStatus } from "@/lib/orders-ops";
import { useStore } from "@/lib/store";
import { dateKey, filterPaymentsByDate, groupPaymentsByDate, groupPaymentsByHour } from "@/lib/sales-analytics";
import {
  buildPosShiftClosePack,
  closePosShiftSession,
  openPosShiftSession,
  OPERATIONAL_STOCK_LOCATIONS,
  useStockManagementModule,
  type StockLocation,
} from "@/lib/stock-management";

export const Route = createFileRoute("/app/payments")({ component: Payments });

const STATUS_TONE: Record<string, "teff" | "gold" | "destructive" | "muted"> = {
  Settled: "teff",
  Pending: "gold",
  Void: "destructive",
};

const METHOD_ICONS: Record<string, string> = {
  Telebirr: "Smartphone",
  "CBE Birr": "Smartphone",
  Cash: "Banknote",
  Card: "CreditCard",
  Mixed: "WalletCards",
};

const VAT_RATE = 0.15;
const SERVICE_CHARGE_RATE = 0.1;
const PAYMENTS_PAGE_SIZE = 10;
const CHART_COLORS = ["#c45c26", "#2f6f4e", "#b8860b", "#4a5568", "#7c3aed", "#0ea5e9"];

function paidAmount(payment: PaymentLedgerEntry) {
  return payment.amountReceived ?? payment.amount;
}

function paymentStatusLabel(status: string, t: ReturnType<typeof useT>) {
  if (status === "Settled") return t("Settled", "ተጠናቅቋል");
  if (status === "Pending") return t("Pending", "በመጠባበቅ ላይ");
  return t("Void", "የተሰረዘ");
}

function paymentMethodLabel(method: string, t: ReturnType<typeof useT>) {
  if (method === "Telebirr") return t("Telebirr", "ቴሌብር");
  if (method === "CBE Birr") return t("CBE Birr", "ሲቢኢ ብር");
  if (method === "Cash") return t("Cash", "ጥሬ ገንዘብ");
  if (method === "Mixed") return t("Mixed", "ድብልቅ");
  return method;
}

function estimateReceiptParts(total: number) {
  const subtotal = total / (1 + VAT_RATE + SERVICE_CHARGE_RATE);
  return {
    subtotal,
    vat: subtotal * VAT_RATE,
    service: subtotal * SERVICE_CHARGE_RATE,
  };
}

function Payments() {
  const store = useStore();
  const stockModule = useStockManagementModule();
  const { user } = useAuth();
  const t = useT();
  const payments = store.payments;
  const [filter, setFilter] = useState("All");
  const [showCashUp, setShowCashUp] = useState(false);
  const [search, setSearch] = useState("");
  const [methodFilter, setMethodFilter] = useState("ALL");
  const [page, setPage] = useState(1);
  const [selectedPaymentId, setSelectedPaymentId] = useState<string | null>(null);

  const settled = payments.filter((payment) => payment.status === "Settled");
  const voided = payments.filter((payment) => payment.status === "Void");
  const pendingPayments = payments.filter((payment) => payment.status === "Pending");
  const waitingReceipts = store.orders.filter(
    (order) => order.receipt && order.paymentStatus !== "Paid" && !isFinalOrderStatus(order.status),
  );
  const partialOrders = store.orders.filter((order) => displayPaymentStatus(order) === "Partially Paid");
  const refundOrders = store.orders.filter((order) => order.status === "RETURNED" || Boolean(order.returnedAt));
  const voidOrders = store.orders.filter((order) => order.status === "CANCELLED" || Boolean(order.voidRequestedAt));
  const waitingTotal = waitingReceipts.reduce((sum, order) => sum + (order.receipt?.grandTotal ?? order.total), 0);
  const totalSettled = settled.reduce((sum, payment) => sum + payment.amount, 0);

  const cashPayments = settled.filter((payment) => payment.method === "Cash");
  const cashDrawer = cashPayments.reduce((sum, payment) => sum + payment.amount, 0);
  const cashReceived = cashPayments.reduce((sum, payment) => sum + paidAmount(payment), 0);
  const cashChange = cashPayments.reduce((sum, payment) => sum + (payment.changeAmount ?? 0), 0);
  const digitalSales = settled.filter((payment) => payment.method !== "Cash").reduce((sum, payment) => sum + payment.amount, 0);

  const methodBreakdown = settled.reduce((acc, payment) => {
    acc[payment.method] = (acc[payment.method] ?? 0) + payment.amount;
    return acc;
  }, {} as Record<string, number>);

  const receiptByOrderId = new Map(store.orders.map((order) => [order.id, order.receipt]));
  const orderById = new Map(store.orders.map((order) => [order.id, order]));
  const receiptTotals = settled.reduce(
    (acc, payment) => {
      const receipt = payment.orderId ? receiptByOrderId.get(payment.orderId) : undefined;
      if (receipt) {
        acc.subtotal += receipt.subtotal;
        acc.vat += receipt.vat;
        acc.service += receipt.serviceCharge;
      } else {
        const estimate = estimateReceiptParts(payment.amount);
        acc.subtotal += estimate.subtotal;
        acc.vat += estimate.vat;
        acc.service += estimate.service;
      }
      return acc;
    },
    { subtotal: 0, vat: 0, service: 0 },
  );

  const selectedPayment = selectedPaymentId ? payments.find((payment) => payment.id === selectedPaymentId) ?? null : null;
  const selectedOrder = selectedPayment?.orderId ? orderById.get(selectedPayment.orderId) : undefined;

  const today = new Date().toISOString().slice(0, 10);
  const todayPayments = filterPaymentsByDate(payments, today);
  const hourlyChart = groupPaymentsByHour(todayPayments.filter((payment) => payment.status === "Settled"));
  const dailyChart = groupPaymentsByDate(settled).slice(-7).map((row) => ({ label: row.key.slice(5), value: row.revenue }));
  const methodChart = Object.entries(methodBreakdown).map(([name, value]) => ({ name, value }));

  const openShift = stockModule.posShiftSessions.find((session) => session.status === "Open");

  function settle(id: string) {
    store.setPayments(payments.map((payment) => (payment.id === id ? { ...payment, status: "Settled" } : payment)));
    showSuccess(t("Payment settled successfully.", "ክፍያው በትክክል ተጠናቋል።"));
  }

  function voidPay(id: string) {
    store.setPayments(payments.map((payment) => (payment.id === id ? { ...payment, status: "Void" } : payment)));
    showSuccess(t("Payment voided successfully.", "ክፍያው በትክክል ተሰርዟል።"));
  }

  const filteredPayments = useMemo(() => {
    const query = search.trim().toLowerCase();
    return payments.filter((payment) => {
      const matchesStatus = filter === "All" ? true : payment.status === filter;
      const matchesMethod = methodFilter === "ALL" ? true : payment.method === methodFilter;
      const matchesSearch =
        !query ||
        [
          payment.receiptNumber ?? payment.ref,
          payment.table,
          payment.cashier,
          payment.collectedByWaiter ?? "",
          payment.receivedByCashier ?? "",
          payment.closedByCashier ?? "",
          payment.method,
        ].some((value) => value.toLowerCase().includes(query));
      return matchesStatus && matchesMethod && matchesSearch;
    });
  }, [filter, methodFilter, payments, search]);

  const methodOptions = useMemo(() => Array.from(new Set(payments.map((payment) => payment.method))), [payments]);
  const pageCount = Math.max(1, Math.ceil(filteredPayments.length / PAYMENTS_PAGE_SIZE));
  const activePage = Math.min(page, pageCount);
  const pagedPayments = useMemo(
    () => filteredPayments.slice((activePage - 1) * PAYMENTS_PAGE_SIZE, activePage * PAYMENTS_PAGE_SIZE),
    [activePage, filteredPayments],
  );

  useEffect(() => {
    setPage(1);
  }, [filter, methodFilter, search]);

  useEffect(() => {
    if (page > pageCount) setPage(pageCount);
  }, [page, pageCount]);

  function openShiftSession() {
    if (!user) return;
    if (openShift) {
      showSuccess(t("A shift is already open.", "አንድ ሽፍት አስቀድሞ ክፍት ነው።"));
      return;
    }
    const session = openPosShiftSession({
      openedBy: user.name,
      balances: stockModule.balances,
      notes: "POS shift opening snapshot",
    });
    stockModule.savePosShiftSession(session);
    showSuccess(t("Shift opened with department stock snapshot.", "ሽፍት በክፍል ክምችት ቅጽበታዊ ምስል ተከፍቷል።"));
  }

  function closeCashUp(pack?: ReturnType<typeof buildPosShiftClosePack>) {
    setShowCashUp(false);
    if (pack) {
      const closedAt = new Date().toISOString();
      const businessDate = pack.date || dateKey();
      // Always persist closings so dashboard "today sales" resets even with zero stock consumption.
      const departments =
        pack.consumptionByDepartment.length > 0
          ? pack.consumptionByDepartment
          : OPERATIONAL_STOCK_LOCATIONS.map((location) => ({
              location,
              quantity: 0,
              value: 0,
            }));
      for (const dept of departments) {
        stockModule.saveClosing({
          id: `close-${pack.id}-${dept.location}`,
          date: businessDate,
          location: dept.location as StockLocation,
          openingStock: 0,
          stockReceived: 0,
          salesDeduction: dept.quantity,
          wasteDamage: 0,
          manualAdjustment: 0,
          closingStock: 0,
          difference: 0,
          createdBy: pack.closedBy,
          closedAt,
          notes: `Shift close pack ${pack.id}: sales ${pack.salesTotal}, voids ${pack.voidCount}, wastage ${pack.wastageValue}, blocked sales ${pack.negativeStockAttempts}`,
        });
      }
      const currentOpen = stockModule.posShiftSessions.find((session) => session.status === "Open");
      if (currentOpen) {
        stockModule.savePosShiftSession(closePosShiftSession(currentOpen, pack.closedBy, pack));
      } else {
        const opened = openPosShiftSession({
          openedBy: pack.closedBy,
          balances: stockModule.balances,
          notes: "Auto-opened at cash-up",
        });
        stockModule.savePosShiftSession(closePosShiftSession(opened, pack.closedBy, pack));
      }
    }
    showSuccess(t("Cash-up closed successfully. Today's sales reset on all dashboards.", "የቀን መዝጊያው በትክክል ተጠናቋል። የዛሬ ሽያጭ በሁሉም ዳሽቦርዶች ተቀይሯል።"));
  }

  function renderLedgerTable(rows: PaymentLedgerEntry[], emptyMessage: string) {
    return (
      <Card className="!p-0 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[1180px] text-sm">
            <thead className="bg-surface-2 text-xs uppercase tracking-wider text-muted-foreground">
              <tr>
                <th className="px-4 py-3 text-left">{t("Receipt / time", "ደረሰኝ / ሰዓት")}</th>
                <th className="px-4 py-3 text-left">{t("Table", "ጠረጴዛ")}</th>
                <th className="px-4 py-3 text-left">{t("Method", "ዘዴ")}</th>
                <th className="px-4 py-3 text-right">{t("Bill total", "ሂሳብ ጠቅላላ")}</th>
                <th className="px-4 py-3 text-right">{t("Customer paid", "ደንበኛ የከፈለው")}</th>
                <th className="px-4 py-3 text-right">{t("Change", "ቀሪ")}</th>
                <th className="px-4 py-3 text-left">{t("Collected by waiter", "በአገልጋይ የተሰበሰበ")}</th>
                <th className="px-4 py-3 text-left">{t("Received by cashier", "በካሸር የተቀበለ")}</th>
                <th className="px-4 py-3 text-left">{t("Closed by", "የተዘጋ በ")}</th>
                <th className="px-4 py-3 text-left">{t("Status", "ሁኔታ")}</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody>
              {rows.map((payment) => {
                const iconName = METHOD_ICONS[payment.method] ?? "Wallet";
                const Icon = (Icons as unknown as Record<string, React.ComponentType<{ className?: string }>>)[iconName];
                return (
                  <tr key={payment.id} className="border-t border-border hover:bg-surface-2/60">
                    <td className="px-4 py-3">
                      <button type="button" onClick={() => setSelectedPaymentId(payment.id)} className="text-left">
                        <div className="font-mono text-xs font-semibold text-ember hover:underline">{payment.receiptNumber ?? payment.ref}</div>
                        <div className="text-xs text-muted-foreground">{payment.paymentReceivedAt ?? payment.time}</div>
                      </button>
                    </td>
                    <td className="px-4 py-3 font-mono text-sm">{payment.table}</td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1.5">
                        {Icon && <Icon className="size-3.5 text-muted-foreground" />}
                        <span>{paymentMethodLabel(payment.method, t)}</span>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-right font-mono font-semibold">{formatETB(payment.amount)}</td>
                    <td className="px-4 py-3 text-right font-mono">{formatETB(paidAmount(payment))}</td>
                    <td className="px-4 py-3 text-right font-mono">{formatETB(payment.changeAmount ?? 0)}</td>
                    <td className="px-4 py-3">{payment.collectedByWaiter ?? <span className="text-destructive">{t("Missing", "ይጎድላል")}</span>}</td>
                    <td className="px-4 py-3">{payment.receivedByCashier ?? payment.cashier}</td>
                    <td className="px-4 py-3">{payment.closedByCashier ?? payment.cashier}</td>
                    <td className="px-4 py-3"><Chip tone={STATUS_TONE[payment.status] ?? "muted"}>{paymentStatusLabel(payment.status, t)}</Chip></td>
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-end gap-1">
                        {payment.status === "Pending" && (
                          <button onClick={() => settle(payment.id)} className="h-7 rounded-md bg-teff/10 px-2 text-xs font-medium text-teff hover:bg-teff/20">{t("Settle", "አጠናቅቅ")}</button>
                        )}
                        {payment.status === "Settled" && (
                          <button onClick={() => voidPay(payment.id)} className="h-7 rounded-md px-2 text-xs text-muted-foreground hover:bg-destructive/5 hover:text-destructive">{t("Void", "ሰርዝ")}</button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        {rows.length === 0 && <div className="py-10 text-center text-sm text-muted-foreground">{emptyMessage}</div>}
      </Card>
    );
  }

  function renderOrderQueue(
    orders: typeof store.orders,
    emptyMessage: string,
    actionLabel: [string, string],
  ) {
    return (
      <Card className="!p-0 overflow-hidden">
        {orders.length > 0 ? (
          <div className="divide-y divide-border">
            {orders.map((order) => {
              const receipt = order.receipt;
              return (
                <div key={order.id} className="grid items-center gap-3 px-5 py-3 text-sm md:grid-cols-[1.3fr_1fr_1fr_auto]">
                  <div>
                    <div className="font-mono font-semibold">{receipt?.receiptNumber ?? order.orderNo}</div>
                    <div className="text-xs text-muted-foreground">{order.status} · {displayPaymentStatus(order)}</div>
                  </div>
                  <div>
                    <div className="font-medium">{order.area} {order.tableNumber}</div>
                    <div className="text-xs text-muted-foreground">{t("Waiter", "አገልጋይ")}: {order.waiter}</div>
                  </div>
                  <div className="font-mono font-semibold">{formatETB(receipt?.grandTotal ?? order.total)}</div>
                  <div className="flex gap-2">
                    <Link to="/app/pos" className="inline-flex h-8 items-center justify-center gap-1.5 rounded-lg bg-ember px-3 text-xs font-semibold text-ember-foreground">
                      <Icons.Wallet className="size-3.5" /> {t(actionLabel[0], actionLabel[1])}
                    </Link>
                    <Link to="/app/orders" className="inline-flex h-8 items-center justify-center gap-1.5 rounded-lg border border-border bg-card px-3 text-xs font-medium">
                      <Icons.ClipboardList className="size-3.5" /> {t("Orders", "ትዕዛዞች")}
                    </Link>
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <div className="flex items-center justify-center gap-2 px-5 py-8 text-sm text-muted-foreground">
            <Icons.CheckCircle2 className="size-4 text-teff" /> {emptyMessage}
          </div>
        )}
      </Card>
    );
  }

  return (
    <div className="min-w-0">
      <PageHeader
        title={t("Payments Ops Center", "የክፍያ ክወና ማዕከል")}
        action={
          <div className="flex flex-wrap items-center gap-2">
            {openShift ? (
              <Chip tone="teff">{t("Shift open", "ሽፍት ክፍት")} · {openShift.openedBy}</Chip>
            ) : (
              <button type="button" onClick={openShiftSession} className="inline-flex min-h-11 items-center gap-2 rounded-lg border border-border bg-card px-4 text-sm font-medium hover:bg-surface-2">
                <Icons.Play className="size-4" /> {t("Open shift", "ሽፍት ክፈት")}
              </button>
            )}
            <button type="button" onClick={() => setShowCashUp(true)} className="inline-flex min-h-11 items-center gap-2 rounded-lg bg-ember px-4 text-sm font-medium text-ember-foreground">
              <Icons.Calculator className="size-4" /> {t("Cash-up", "የቀን መዝጊያ")}
            </button>
          </div>
        }
      />

      <PaymentsShell
        tabs={{
          overview: (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
                <Stat label={t("Paid receipts", "የተከፈሉ ደረሰኞች")} value={formatETB(totalSettled)} tone="teff" icon="CheckCircle" />
                <Stat label={t("Awaiting payment", "ክፍያ ይጠብቃል")} value={formatETB(waitingTotal)} tone="gold" icon="Clock" />
                <Stat label={t("Cash drawer", "የገንዘብ ሳጥን")} value={formatETB(cashDrawer)} tone="ember" icon="Banknote" />
                <Stat label={t("Change given", "የተመለሰ ቀሪ")} value={formatETB(cashChange)} icon="RefreshCcw" />
              </div>
              <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_320px]">
                <Card>
                  <h3 className="mb-3 font-display font-semibold">{t("Generated receipts awaiting payment", "ክፍያ የሚጠብቁ ደረሰኞች")}</h3>
                  {renderOrderQueue(waitingReceipts.slice(0, 5), t("No receipts", "ደረሰኞች የሉም"), ["Take payment", "ክፍያ ይቀበሉ"])}
                </Card>
                <Card>
                  <h3 className="mb-3 font-display font-semibold">{t("By method", "በዘዴ")}</h3>
                  <div className="mx-auto h-52 w-full max-w-[260px]">
                    {methodChart.length > 0 ? (
                      <ResponsiveContainer width="100%" height="100%">
                        <PieChart>
                          <Pie data={methodChart} dataKey="value" nameKey="name" innerRadius={48} outerRadius={78} paddingAngle={2}>
                            {methodChart.map((entry, index) => (
                              <Cell key={entry.name} fill={CHART_COLORS[index % CHART_COLORS.length]} />
                            ))}
                          </Pie>
                          <Tooltip formatter={(value) => formatETB(Number(value))} />
                        </PieChart>
                      </ResponsiveContainer>
                    ) : (
                      <div className="grid h-full place-items-center text-sm text-muted-foreground">{t("No payments", "ክፍያዎች የሉም")}</div>
                    )}
                  </div>
                </Card>
              </div>
            </div>
          ),
          transactions: (
            <div className="space-y-4">
              <Card>
                <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                  <div className="xl:col-span-2">
                    <label className="text-xs text-muted-foreground">{t("Search ledger", "መዝገቡን ፈልግ")}</label>
                    <input value={search} onChange={(event) => setSearch(event.target.value)} className="mt-1 h-9 w-full rounded-lg border border-border bg-card px-3 text-sm" />
                  </div>
                  <div>
                    <label className="text-xs text-muted-foreground">{t("Method", "ዘዴ")}</label>
                    <select value={methodFilter} onChange={(event) => setMethodFilter(event.target.value)} className="mt-1 h-9 w-full rounded-lg border border-border bg-card px-3 text-sm">
                      <option value="ALL">{t("All methods", "ሁሉም ዘዴዎች")}</option>
                      {methodOptions.map((method) => <option key={method} value={method}>{paymentMethodLabel(method, t)}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="text-xs text-muted-foreground">{t("Matched rows", "የተገኙ መስመሮች")}</label>
                    <input value={String(filteredPayments.length)} disabled className="mt-1 h-9 w-full rounded-lg border border-border bg-card px-3 text-sm opacity-70" />
                  </div>
                </div>
              </Card>
              <div className="flex flex-wrap gap-2">
                {["All", "Settled", "Pending", "Void"].map((option) => (
                  <button key={option} onClick={() => setFilter(option)} className={`h-9 rounded-full px-4 text-sm font-medium transition-colors ${filter === option ? "bg-foreground text-background" : "border border-border bg-card text-muted-foreground hover:text-foreground"}`}>{t(option, option === "All" ? "ሁሉም" : option === "Settled" ? "ተጠናቋል" : option === "Pending" ? "በመጠባበቅ ላይ" : "የተሰረዘ")}</button>
                ))}
              </div>
              {renderLedgerTable(pagedPayments, t("No transactions", "ግብይቶች የሉም"))}
              <div className="flex items-center justify-between gap-3 text-sm">
                <div className="text-muted-foreground">
                  Showing {filteredPayments.length === 0 ? 0 : (activePage - 1) * PAYMENTS_PAGE_SIZE + 1}-{Math.min(activePage * PAYMENTS_PAGE_SIZE, filteredPayments.length)} of {filteredPayments.length}
                </div>
                <div className="flex items-center gap-2">
                  <button onClick={() => setPage(Math.max(1, activePage - 1))} disabled={activePage <= 1} className="h-8 rounded-lg border border-border bg-card px-3 disabled:opacity-50">Prev</button>
                  <div className="min-w-[88px] text-center text-muted-foreground">Page {activePage} / {pageCount}</div>
                  <button onClick={() => setPage(Math.min(pageCount, activePage + 1))} disabled={activePage >= pageCount} className="h-8 rounded-lg border border-border bg-card px-3 disabled:opacity-50">Next</button>
                </div>
              </div>
            </div>
          ),
          pending: (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4 md:grid-cols-3">
                <Stat label={t("Pending receipts", "በመጠባበቅ ደረሰኞች")} value={String(waitingReceipts.length)} tone="gold" icon="Clock" />
                <Stat label={t("Outstanding", "ቀሪ")} value={formatETB(waitingTotal)} tone="ember" icon="Wallet" />
                <Stat label={t("Ledger pending", "መዝገብ በመጠባበቅ")} value={String(pendingPayments.length)} icon="ReceiptText" />
              </div>
              {renderOrderQueue(waitingReceipts, t("No receipts", "ደረሰኞች የሉም"), ["Take payment", "ክፍያ ይቀበሉ"])}
            </div>
          ),
          partial: (
            <div className="space-y-4">
              <Stat label={t("Partially paid orders", "በከፊል የተከፈሉ")} value={String(partialOrders.length)} tone="gold" icon="CircleDotDashed" />
              {renderOrderQueue(partialOrders, t("No orders", "ትዕዛዞች የሉም"), ["Complete payment", "ክፍያ አጠናቅቅ"])}
            </div>
          ),
          refunds: (
            <div className="space-y-4">
              <Stat label={t("Return orders", "የተመለሱ ትዕዛዞች")} value={String(refundOrders.length)} tone="gold" icon="Undo2" />
              {renderOrderQueue(refundOrders, t("No orders", "ትዕዛዞች የሉም"), ["Review in Orders", "ከትዕዛዞች ይመልከቱ"])}
            </div>
          ),
          voids: (
            <div className="space-y-4">
              <Stat label={t("Void / cancelled orders", "የተሰረዙ ትዕዛዞች")} value={String(voidOrders.length)} tone="destructive" icon="Ban" />
              {renderOrderQueue(voidOrders, t("No orders", "ትዕዛዞች የሉም"), ["Review in Orders", "ከትዕዛዞች ይመልከቱ"])}
            </div>
          ),
          reconciliation: (
            <div className="grid gap-4 xl:grid-cols-2">
              <Card>
                <h3 className="mb-3 font-display font-semibold">{t("Cash drawer", "የገንዘብ ሳጥን")}</h3>
                <ul className="space-y-2 text-sm">
                  <li className="flex justify-between gap-3"><span className="text-muted-foreground">{t("Cash bills", "የገንዘብ ብልቶች")}</span><span className="font-mono">{formatETB(cashDrawer)}</span></li>
                  <li className="flex justify-between gap-3"><span className="text-muted-foreground">{t("Cash received", "የተቀበለ ገንዘብ")}</span><span className="font-mono">{formatETB(cashReceived)}</span></li>
                  <li className="flex justify-between gap-3"><span className="text-muted-foreground">{t("Change given", "የተመለሰ ቀሪ")}</span><span className="font-mono">{formatETB(cashChange)}</span></li>
                  <li className="flex justify-between gap-3 border-t border-dashed border-border pt-2"><span className="font-medium">{t("Expected drawer", "የሚጠበቀው ሳጥን")}</span><span className="font-mono font-semibold">{formatETB(cashReceived - cashChange)}</span></li>
                  <li className="flex justify-between gap-3"><span className="text-muted-foreground">{t("Digital settled", "ዲጂታል የተዘጋ")}</span><span className="font-mono">{formatETB(digitalSales)}</span></li>
                </ul>
                <button type="button" onClick={() => setShowCashUp(true)} className="mt-4 inline-flex h-10 w-full items-center justify-center gap-2 rounded-lg bg-ember text-sm font-semibold text-ember-foreground">
                  <Icons.Calculator className="size-4" /> {t("Run cash-up", "የቀን መዝጊያ አሂድ")}
                </button>
              </Card>
              <Card>
                <h3 className="mb-3 font-display font-semibold">{t("VAT & service estimate", "የVAT እና አገልግሎት ግምት")}</h3>
                <ul className="space-y-2 text-sm">
                  <li className="flex justify-between gap-3"><span className="text-muted-foreground">{t("Sales subtotal", "የሽያጭ ንዑስ ድምር")}</span><span className="font-mono">{formatETB(receiptTotals.subtotal)}</span></li>
                  <li className="flex justify-between gap-3"><span className="text-muted-foreground">{t("VAT 15%", "VAT 15%")}</span><span className="font-mono">{formatETB(receiptTotals.vat)}</span></li>
                  <li className="flex justify-between gap-3"><span className="text-muted-foreground">{t("Service charge", "የአገልግሎት ክፍያ")}</span><span className="font-mono">{formatETB(receiptTotals.service)}</span></li>
                  <li className="flex justify-between gap-3 border-t border-dashed border-border pt-2"><span className="font-medium">{t("Paid total", "የተከፈለ ጠቅላላ")}</span><span className="font-mono font-semibold">{formatETB(totalSettled)}</span></li>
                </ul>
              </Card>
            </div>
          ),
          shift: (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4 md:grid-cols-3">
                <Stat label={t("Open shifts", "ክፍት ሽፍቶች")} value={String(stockModule.posShiftSessions.filter((session) => session.status === "Open").length)} tone={openShift ? "gold" : "teff"} icon="BriefcaseBusiness" />
                <Stat label={t("Closed shifts", "የተዘጉ ሽፍቶች")} value={String(stockModule.posShiftSessions.filter((session) => session.status === "Closed").length)} icon="CheckCircle" />
                <Stat label={t("Voided ledger rows", "የተሰረዙ መስመሮች")} value={String(voided.length)} tone="destructive" icon="Ban" />
              </div>
              <Card className="!p-0 overflow-hidden">
                <div className="divide-y divide-border">
                  {stockModule.posShiftSessions.map((session) => (
                    <div key={session.id} className="grid gap-3 px-5 py-3 text-sm md:grid-cols-[1.2fr_1fr_1fr_auto]">
                      <div>
                        <div className="font-mono font-semibold">{session.id}</div>
                        <div className="text-xs text-muted-foreground">{session.openedAt} · {session.openedBy}</div>
                      </div>
                      <div><Chip tone={session.status === "Open" ? "gold" : "teff"}>{session.status}</Chip></div>
                      <div className="font-mono">{formatETB(session.closePack?.salesTotal ?? 0)}</div>
                      <button type="button" onClick={() => setShowCashUp(true)} className="inline-flex h-8 items-center justify-center rounded-lg border border-border bg-card px-3 text-xs font-medium">
                        {t("Close shift", "ሽፍት ዝጋ")}
                      </button>
                    </div>
                  ))}
                  {stockModule.posShiftSessions.length === 0 && (
                    <div className="px-5 py-8 text-sm text-muted-foreground">{t("No shifts", "ሽፍቶች የሉም")}</div>
                  )}
                </div>
              </Card>
            </div>
          ),
          analytics: (
            <div className="grid gap-4 xl:grid-cols-2">
              <Card>
                <h3 className="mb-3 font-display font-semibold">{t("Today's payments by hour", "የዛሬ ክፍያዎች በሰዓት")}</h3>
                <div className="h-56">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={hourlyChart}>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} />
                      <XAxis dataKey="h" tick={{ fontSize: 11 }} />
                      <YAxis tick={{ fontSize: 11 }} width={48} />
                      <Tooltip formatter={(value) => formatETB(Number(value))} />
                      <Bar dataKey="sales" fill="#c45c26" radius={[4, 4, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </Card>
              <Card>
                <h3 className="mb-3 font-display font-semibold">{t("Settled payments (7 days)", "የተዘጉ ክፍያዎች (7 ቀናት)")}</h3>
                <div className="h-56">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={dailyChart}>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} />
                      <XAxis dataKey="label" tick={{ fontSize: 11 }} />
                      <YAxis tick={{ fontSize: 11 }} width={48} />
                      <Tooltip formatter={(value) => formatETB(Number(value))} />
                      <Bar dataKey="value" fill="#2f6f4e" radius={[4, 4, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </Card>
            </div>
          ),
        }}
      />

      <PaymentDrawer payment={selectedPayment} order={selectedOrder} onClose={() => setSelectedPaymentId(null)} />

      {showCashUp && (
        <CashUpModal
          payments={payments}
          orders={store.orders}
          ledger={stockModule.ledger}
          reservations={stockModule.posReservations}
          negativeSaleAttempts={stockModule.posNegativeSaleAttempts}
          closedBy={user?.name || "Cashier"}
          onClose={closeCashUp}
        />
      )}
    </div>
  );
}

function CashUpModal({
  payments,
  orders,
  ledger,
  reservations,
  negativeSaleAttempts = [],
  closedBy,
  onClose,
}: {
  payments: PaymentLedgerEntry[];
  orders: ReturnType<typeof useStore>["orders"];
  ledger: ReturnType<typeof useStockManagementModule>["ledger"];
  reservations: ReturnType<typeof useStockManagementModule>["posReservations"];
  negativeSaleAttempts?: ReturnType<typeof useStockManagementModule>["posNegativeSaleAttempts"];
  closedBy: string;
  onClose: (pack?: ReturnType<typeof buildPosShiftClosePack>) => void;
}) {
  const [counted, setCounted] = useState(0);
  const t = useT();
  const today = dateKey();
  const pack = useMemo(
    () => buildPosShiftClosePack({
      date: today,
      closedBy,
      orders,
      payments,
      ledger,
      posReservations: reservations,
      negativeSaleAttempts,
    }),
    [closedBy, ledger, negativeSaleAttempts, orders, payments, reservations, today],
  );
  const cashPayments = payments.filter((payment) => payment.method === "Cash" && payment.status === "Settled");
  const cashReceived = cashPayments.reduce((sum, payment) => sum + paidAmount(payment), 0);
  const changeGiven = cashPayments.reduce((sum, payment) => sum + (payment.changeAmount ?? 0), 0);
  const expectedCash = cashReceived - changeGiven;
  const digitalSales = payments.filter((payment) => payment.method !== "Cash" && payment.status === "Settled").reduce((sum, payment) => sum + payment.amount, 0);
  const diff = counted - expectedCash;

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-foreground/40 p-4 backdrop-blur-sm">
      <div className="surface-card max-h-[90vh] w-full max-w-lg overflow-y-auto !p-6">
        <div className="mb-5 flex items-center justify-between">
          <h3 className="font-display text-xl font-semibold">{t("End-of-shift Cash-up", "የሽፍት መጨረሻ መዝጊያ")}</h3>
          <button type="button" onClick={() => onClose()} className="grid size-8 place-items-center rounded-lg hover:bg-surface-2"><Icons.X className="size-4" /></button>
        </div>
        <div className="mb-4 space-y-2 rounded-xl bg-surface-2 p-4 text-sm">
          <div className="flex justify-between"><span className="text-muted-foreground">{t("Cash received", "የተቀበለ ገንዘብ")}</span><span className="font-mono">{formatETB(cashReceived)}</span></div>
          <div className="flex justify-between"><span className="text-muted-foreground">{t("Change given", "የተመለሰ ቀሪ")}</span><span className="font-mono">{formatETB(changeGiven)}</span></div>
          <div className="flex justify-between border-t border-dashed border-border pt-2"><span className="font-medium">{t("Expected cash drawer", "የሚጠበቀው ገንዘብ ሳጥን")}</span><span className="font-mono font-semibold">{formatETB(expectedCash)}</span></div>
          <div className="flex justify-between"><span className="text-muted-foreground">{t("Digital settled", "ዲጂታል የተዘጋ")}</span><span className="font-mono">{formatETB(digitalSales)}</span></div>
        </div>
        <div className="mb-4 space-y-2 rounded-xl border border-border p-4 text-sm">
          <div className="mb-1 font-semibold">{t("Department stock pack", "የክፍል ክምችት ጥቅል")}</div>
          <div className="flex justify-between"><span className="text-muted-foreground">{t("Sales total", "ጠቅላላ ሽያጭ")}</span><span className="font-mono">{formatETB(pack.salesTotal)}</span></div>
          <div className="flex justify-between"><span className="text-muted-foreground">{t("Consumption value", "የፍጆታ ዋጋ")}</span><span className="font-mono">{formatETB(pack.consumptionValue)}</span></div>
          <div className="flex justify-between"><span className="text-muted-foreground">{t("Wastage value", "የብክነት ዋጋ")}</span><span className="font-mono">{formatETB(pack.wastageValue)}</span></div>
          <div className="flex justify-between"><span className="text-muted-foreground">{t("Voids / refunds", "ሰረዛ / መልስ")}</span><span className="font-mono">{pack.voidCount} / {pack.refundCount}</span></div>
          <div className="flex justify-between"><span className="text-muted-foreground">{t("Unclosed orders", "ያልተዘጉ ትዕዛዞች")}</span><span className="font-mono">{pack.unclosedOrders}</span></div>
          <div className="flex justify-between"><span className="text-muted-foreground">{t("Reserved qty", "ሪዘርቭ ብዛት")}</span><span className="font-mono">{pack.reservedQty}</span></div>
          <div className="flex justify-between"><span className="text-muted-foreground">{t("Blocked sale attempts", "የታገዱ የሽያጭ ሙከራዎች")}</span><span className="font-mono">{pack.negativeStockAttempts}</span></div>
          {pack.consumptionByDepartment.length > 0 && (
            <ul className="mt-2 space-y-1 border-t border-dashed border-border pt-2">
              {pack.consumptionByDepartment.map((row) => (
                <li key={row.location} className="flex justify-between gap-3 text-xs">
                  <span className="truncate text-muted-foreground">{row.location}</span>
                  <span className="shrink-0 font-mono">{row.quantity} · {formatETB(row.value)}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
        <div className="mb-4">
          <label className="text-xs text-muted-foreground">{t("Counted cash (ETB)", "የተቆጠረ ገንዘብ (ብር)")}</label>
          <input
            type="number"
            value={counted}
            onChange={(event) => setCounted(Number(event.target.value))}
            className="mt-1 h-11 w-full rounded-lg border border-border bg-card px-3 font-mono text-sm focus:outline-none focus:ring-2 focus:ring-ring/40"
          />
        </div>
        {counted > 0 && (
          <div className={`mb-4 flex justify-between rounded-lg p-3 text-sm font-semibold ${diff === 0 ? "bg-teff/10 text-teff" : diff > 0 ? "bg-gold/10 text-gold-foreground" : "bg-destructive/10 text-destructive"}`}>
            <span>{diff === 0 ? t("Balanced", "ተመጣጣኝ") : diff > 0 ? t("Over", "ተሻለ") : t("Short", "አጭር")}</span>
            <span className="font-mono">{diff >= 0 ? "+" : ""}{formatETB(diff)}</span>
          </div>
        )}
        <div className="flex gap-2">
          <button type="button" onClick={() => onClose()} className="h-11 flex-1 rounded-lg border border-border bg-card text-sm hover:bg-surface-2">{t("Cancel", "ሰርዝ")}</button>
          <button type="button" onClick={() => onClose(pack)} className="inline-flex h-11 flex-1 items-center justify-center gap-2 rounded-lg bg-ember text-sm font-semibold text-ember-foreground">
            <Icons.CheckCircle2 className="size-4" /> {t("Close shift", "ሽፍቱን ዝጋ")}
          </button>
        </div>
      </div>
    </div>
  );
}
