import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import * as Icons from "lucide-react";
import { BillDialog, ReceiptDialog, type ReceiptView } from "@/components/order-bill-dialogs";
import { Card, Chip, PageHeader, Stat } from "@/components/ui-kit";
import { formatETB } from "@/lib/ethiopic";
import { useAuth } from "@/lib/auth-context";
import type { Order } from "@/lib/demo-data";
import { useT } from "@/lib/i18n";
import {
  canGenerateReceipt,
  displayPaymentStatus,
  orderOutstandingAmount,
  summarizeWaiterUnpaid,
} from "@/lib/orders-ops";
import { dateKey, dateKeyFromDateTime } from "@/lib/sales-analytics";
import { orderFromStoredReceipt, type StoredReceipt } from "@/lib/stored-receipts";
import { useStore } from "@/lib/store";

export const Route = createFileRoute("/app/receipts")({ component: ReceiptsPage });

const PAGE_SIZE = 15;

function receiptDateKey(stored: StoredReceipt) {
  return (
    dateKeyFromDateTime(stored.receipt.generatedAt) ??
    dateKeyFromDateTime(stored.storedAt) ??
    dateKey()
  );
}

function paymentStatusTone(status: string) {
  if (status === "Paid") return "teff" as const;
  if (status === "Partially Paid") return "gold" as const;
  return "muted" as const;
}

function ReceiptsPage() {
  const store = useStore();
  const { user, users } = useAuth();
  const t = useT();
  const [tab, setTab] = useState<"stored" | "create">("stored");
  const [waiterFilter, setWaiterFilter] = useState("all");
  const [dateFilter, setDateFilter] = useState(() => dateKey());
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [receiptView, setReceiptView] = useState<ReceiptView | null>(null);
  const [billOrder, setBillOrder] = useState<Order | null>(null);
  const [skippedStockItems, setSkippedStockItems] = useState<string[]>([]);
  const [creatingId, setCreatingId] = useState<string | null>(null);
  const [createError, setCreateError] = useState("");
  const canManageBills = user?.role === "Cashier" || user?.role === "Branch Manager";

  const storedReceipts = useMemo(
    () =>
      [...store.storedReceipts].sort((a, b) => {
        const aTime = a.receipt.generatedAt || a.storedAt;
        const bTime = b.receipt.generatedAt || b.storedAt;
        return bTime.localeCompare(aTime);
      }),
    [store.storedReceipts],
  );

  const pendingOrders = useMemo(
    () =>
      store.orders
        .filter(canGenerateReceipt)
        .sort((a, b) => (b.sentAt || "").localeCompare(a.sentAt || "")),
    [store.orders],
  );

  const waiterOptions = useMemo(() => {
    const fromStored = storedReceipts.map((row) => row.waiter);
    const fromStaff = users
      .filter((staff) => ["Waiter", "Cashier", "Bartender", "Bar Staff"].includes(staff.role))
      .map((staff) => staff.name);
    return Array.from(new Set([...fromStored, ...fromStaff].filter(Boolean))).sort((a, b) =>
      a.localeCompare(b),
    );
  }, [storedReceipts, users]);

  const availableDates = useMemo(() => {
    const keys = storedReceipts
      .map((row) => receiptDateKey(row))
      .filter((value): value is string => Boolean(value));
    return Array.from(new Set(keys)).sort().reverse();
  }, [storedReceipts]);

  const filtered = useMemo(() => {
    const query = search.trim().toLowerCase();
    return storedReceipts.filter((row) => {
      const dateKeyValue = receiptDateKey(row);
      if (waiterFilter !== "all" && row.waiter !== waiterFilter) return false;
      if (dateFilter && dateKeyValue !== dateFilter) return false;
      if (!query) return true;
      return (
        row.orderNo.toLowerCase().includes(query) ||
        row.receipt.receiptNumber.toLowerCase().includes(query) ||
        row.ref.toLowerCase().includes(query) ||
        row.waiter.toLowerCase().includes(query) ||
        `${row.area} ${row.tableNumber}`.toLowerCase().includes(query)
      );
    });
  }, [dateFilter, search, storedReceipts, waiterFilter]);

  const receiptPayment = (row: StoredReceipt) => {
    const live = store.orders.find((order) => order.id === row.orderId);
    return {
      status: live ? displayPaymentStatus(live) : row.paymentStatus,
      payment: live?.payment ?? row.payment,
      total: row.receipt.grandTotal,
    };
  };
  const paidRows = filtered.filter((row) => receiptPayment(row).status === "Paid");
  const unpaidRows = filtered.filter((row) => receiptPayment(row).status !== "Paid");
  const paidAmount = paidRows.reduce((sum, row) => sum + row.receipt.grandTotal, 0);
  const unpaidAmount = unpaidRows.reduce((sum, row) => sum + row.receipt.grandTotal, 0);
  const unpaidCount = unpaidRows.length;
  const totalWaiterChange = paidRows.reduce((sum, row) => {
    const payment = receiptPayment(row).payment;
    return sum + (payment?.changeAmount ?? 0) + (payment?.tipAmount ?? 0);
  }, 0);
  const waiterChangeRows = useMemo(() => {
    const byWaiter = new Map<string, { waiter: string; change: number; tip: number; bills: number }>();
    paidRows.forEach((row) => {
      const payment = receiptPayment(row).payment;
      const waiter = payment?.collectedByWaiter || row.waiter || t("Unassigned", "ያልተመደበ");
      const current = byWaiter.get(waiter) ?? { waiter, change: 0, tip: 0, bills: 0 };
      current.change += payment?.changeAmount ?? 0;
      current.tip += payment?.tipAmount ?? 0;
      current.bills += 1;
      byWaiter.set(waiter, current);
    });
    return Array.from(byWaiter.values()).sort((a, b) => b.change + b.tip - (a.change + a.tip));
  }, [paidRows, store.orders, t]);
  const waiterUnpaid = useMemo(() => {
    const live = summarizeWaiterUnpaid(store.orders);
    const counted = new Set(
      store.orders.filter((order) => orderOutstandingAmount(order) > 0).map((order) => order.id),
    );
    const byWaiter = new Map(live.map((row) => [row.waiter, { ...row }]));
    for (const row of storedReceipts) {
      if (counted.has(row.orderId)) continue;
      const liveOrder = store.orders.find((order) => order.id === row.orderId);
      const status = liveOrder ? displayPaymentStatus(liveOrder) : row.paymentStatus;
      if (status === "Paid" || status === "Refunded") continue;
      const waiter = (liveOrder?.waiter || row.waiter || "Unassigned").trim() || "Unassigned";
      const current = byWaiter.get(waiter) ?? { waiter, bills: 0, amount: 0 };
      current.bills += 1;
      current.amount += row.receipt.grandTotal;
      byWaiter.set(waiter, current);
    }
    return Array.from(byWaiter.values()).sort((a, b) => b.amount - a.amount);
  }, [storedReceipts, store.orders]);
  const unpaidExpectedTotal = waiterUnpaid.reduce((sum, row) => sum + row.amount, 0);
  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const currentPage = Math.min(page, pageCount);
  const pageRows = filtered.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);

  function openStored(row: StoredReceipt) {
    const order = store.orders.find((item) => item.id === row.orderId) ?? orderFromStoredReceipt(row);
    const receipt = order.receipt ?? row.receipt;
    setReceiptView({
      order: { ...order, receipt },
      receipt,
      reprint: receipt.printCount > 0,
    });
  }

  function createReceipt(orderId: string) {
    setCreateError("");
    setCreatingId(orderId);
    try {
      const order = store.orders.find((item) => item.id === orderId);
      const generatedBy = user?.name?.trim() || "Cashier";
      const receipt = store.generateReceipt(orderId, { generatedBy });
      if (!receipt || !order) {
        setCreateError(t("Order is not ready for receipt yet.", "ትዕዛዙ ለደረሰኝ እስካሁን አልተዘጋጀም።"));
        return;
      }
      setReceiptView({
        order: {
          ...order,
          receipt,
          status: "RECEIPT_GENERATED",
          paymentStatus: "Unpaid",
          receiptNumber: receipt.receiptNumber,
          receiptGeneratedAt: receipt.generatedAt,
          receiptGeneratedBy: receipt.generatedBy,
          total: receipt.grandTotal,
        },
        receipt,
      });
      setTab("stored");
      setDateFilter(dateKeyFromDateTime(receipt.generatedAt) ?? dateKey());
      setPage(1);
    } finally {
      setCreatingId(null);
    }
  }

  function takePayment(row: StoredReceipt) {
    if (!canManageBills) return;
    const live = store.orders.find((order) => order.id === row.orderId);
    const order = live
      ? { ...live, receipt: live.receipt ?? row.receipt }
      : orderFromStoredReceipt(row);
    const status = displayPaymentStatus(order);
    if (status === "Paid" || status === "Refunded") {
      setReceiptView({ order: { ...order, receipt: order.receipt ?? row.receipt }, receipt: order.receipt ?? row.receipt });
      return;
    }
    setBillOrder(order);
  }

  return (
    <div className="min-w-0 space-y-3">
      <PageHeader title={t("Receipts", "ደረሰኞች")} />

      <div className="flex items-center gap-2 flex-wrap">
        <button
          type="button"
          onClick={() => setTab("stored")}
          className={`h-9 px-4 rounded-full text-sm font-medium ${
            tab === "stored" ? "bg-foreground text-background" : "bg-card border border-border text-muted-foreground"
          }`}
        >
          {t("Stored receipts", "የተከማቹ ደረሰኞች")}
        </button>
        <button
          type="button"
          onClick={() => setTab("create")}
          className={`h-9 px-4 rounded-full text-sm font-medium inline-flex items-center gap-1.5 ${
            tab === "create" ? "bg-ember text-ember-foreground" : "bg-card border border-border text-muted-foreground"
          }`}
        >
          <Icons.Plus className="size-3.5" />
          {t("Create receipt", "ደረሰኝ ፍጠር")}
          {pendingOrders.length > 0 ? (
            <span className="rounded-full bg-background/20 px-1.5 text-[10px]">{pendingOrders.length}</span>
          ) : null}
        </button>
      </div>

      {tab === "create" ? (
        <Card className="min-w-0 space-y-3">
          <div>
            <h3 className="font-display text-lg font-semibold">{t("Orders ready for receipt", "ለደረሰኝ ዝግጁ ትዕዛዞች")}</h3>
          </div>
          {createError ? <p className="text-sm text-destructive">{createError}</p> : null}
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead>
                <tr className="border-b border-border text-left text-xs text-muted-foreground">
                  <th className="px-3 py-2 font-medium">{t("Order", "ትዕዛዝ")}</th>
                  <th className="px-3 py-2 font-medium">{t("Waiter", "አስተናጋጅ")}</th>
                  <th className="px-3 py-2 font-medium">{t("Table", "ጠረጴዛ")}</th>
                  <th className="px-3 py-2 font-medium">{t("Status", "ሁኔታ")}</th>
                  <th className="px-3 py-2 text-right font-medium">{t("Total", "ጠቅላላ")}</th>
                  <th className="px-3 py-2 font-medium" />
                </tr>
              </thead>
              <tbody>
                {pendingOrders.map((order) => (
                  <tr key={order.id} className="border-b border-border/70 last:border-0">
                    <td className="px-3 py-2.5">
                      <div className="font-medium">{order.orderNo}</div>
                      <div className="text-xs text-muted-foreground">{order.ref}</div>
                    </td>
                    <td className="px-3 py-2.5">{order.waiter || order.orderedByWaiter || "—"}</td>
                    <td className="px-3 py-2.5">
                      {order.area} {order.tableNumber}
                    </td>
                    <td className="px-3 py-2.5">
                      <Chip tone="muted">{order.status}</Chip>
                    </td>
                    <td className="px-3 py-2.5 text-right font-mono font-semibold">{formatETB(order.total)}</td>
                    <td className="px-3 py-2.5">
                      <button
                        type="button"
                        disabled={creatingId === order.id}
                        onClick={() => createReceipt(order.id)}
                        className="inline-flex h-8 items-center gap-1.5 rounded-md bg-ember px-2.5 text-xs font-semibold text-ember-foreground disabled:opacity-40"
                      >
                        <Icons.Receipt className="size-3.5" />
                        {creatingId === order.id
                          ? t("Saving…", "እየተቀመጠ…")
                          : t("Generate & store", "ፍጠር እና አስቀምጥ")}
                      </button>
                    </td>
                  </tr>
                ))}
                {pendingOrders.length === 0 && (
                  <tr>
                    <td colSpan={6} className="px-3 py-10 text-center text-sm text-muted-foreground">
                      {t("No orders", "ትዕዛዞች የሉም")}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </Card>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-2 sm:gap-3 xl:grid-cols-5">
            <Stat
              label={t("Bills paid", "የተከፈሉ ሂሳቦች")}
              value={`${paidRows.length}`}
              tone="teff"
              icon="BadgeCheck"
            />
            <Stat
              label={t("Paid total", "የተከፈለ ጠቅላላ")}
              value={formatETB(paidAmount)}
              tone="teff"
              icon="Wallet"
            />
            <Stat
              label={t("Bills not paid", "ያልተከፈሉ ሂሳቦች")}
              value={`${unpaidCount}`}
              tone="destructive"
              icon="CircleAlert"
            />
            <Stat
              label={t("Unpaid total", "ያልተከፈለ ጠቅላላ")}
              value={formatETB(unpaidAmount)}
              tone="gold"
              icon="Receipt"
            />
            <Stat
              label={t("Waiter change / tip", "የአስተናጋጅ ተመላሽ / ጥቅማጥቅም")}
              value={formatETB(totalWaiterChange)}
              tone="ember"
              icon="HandCoins"
            />
          </div>

          {waiterUnpaid.length > 0 ? (
            <Card className="min-w-0 overflow-x-auto">
              <div className="flex items-center justify-between gap-3 px-3 py-2">
                <div className="text-sm font-semibold">{t("Amount expected from waiters", "ከአስተናጋጆች የሚጠበቀው መጠን")}</div>
                <div className="font-mono text-sm font-semibold">{formatETB(unpaidExpectedTotal)}</div>
              </div>
              <table className="min-w-full text-sm">
                <thead>
                  <tr className="border-y border-border text-left text-xs text-muted-foreground">
                    <th className="px-3 py-2 font-medium">{t("Waiter", "አስተናጋጅ")}</th>
                    <th className="px-3 py-2 text-right font-medium">{t("Unpaid bills", "ያልተከፈሉ ሂሳቦች")}</th>
                    <th className="px-3 py-2 text-right font-medium">{t("Amount expected", "የሚጠበቀው መጠን")}</th>
                  </tr>
                </thead>
                <tbody>
                  {waiterUnpaid.map((row) => (
                    <tr key={row.waiter} className="border-b border-border/70 last:border-0">
                      <td className="px-3 py-2 font-medium">
                        {row.waiter === "Unassigned" ? t("Unassigned", "ያልተመደበ") : row.waiter}
                      </td>
                      <td className="px-3 py-2 text-right font-mono">{row.bills}</td>
                      <td className="px-3 py-2 text-right font-mono font-semibold">{formatETB(row.amount)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </Card>
          ) : null}

          {waiterChangeRows.length > 0 ? (
            <Card className="min-w-0 overflow-x-auto">
              <div className="px-3 py-2 text-sm font-semibold">{t("Change / tip by waiter", "ተመላሽ / ጥቅማጥቅም በአስተናጋጅ")}</div>
              <table className="min-w-full text-sm">
                <thead>
                  <tr className="border-y border-border text-left text-xs text-muted-foreground">
                    <th className="px-3 py-2 font-medium">{t("Waiter", "አስተናጋጅ")}</th>
                    <th className="px-3 py-2 text-right font-medium">{t("Paid bills", "የተከፈሉ ሂሳቦች")}</th>
                    <th className="px-3 py-2 text-right font-medium">{t("Change", "ተመላሽ")}</th>
                    <th className="px-3 py-2 text-right font-medium">{t("Tip", "ጥቅማጥቅም")}</th>
                    <th className="px-3 py-2 text-right font-medium">{t("Total", "ጠቅላላ")}</th>
                  </tr>
                </thead>
                <tbody>
                  {waiterChangeRows.map((row) => (
                    <tr key={row.waiter} className="border-b border-border/70 last:border-0">
                      <td className="px-3 py-2 font-medium">{row.waiter}</td>
                      <td className="px-3 py-2 text-right font-mono">{row.bills}</td>
                      <td className="px-3 py-2 text-right font-mono">{formatETB(row.change)}</td>
                      <td className="px-3 py-2 text-right font-mono">{formatETB(row.tip)}</td>
                      <td className="px-3 py-2 text-right font-mono font-semibold">{formatETB(row.change + row.tip)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </Card>
          ) : null}

          <Card className="min-w-0 space-y-3">
            <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
              <label className="space-y-1">
                <span className="text-xs font-medium text-muted-foreground">{t("Date", "ቀን")}</span>
                <input
                  type="date"
                  value={dateFilter}
                  onChange={(event) => {
                    setDateFilter(event.target.value);
                    setPage(1);
                  }}
                  className="h-9 w-full rounded-lg border border-border bg-card px-3 text-sm"
                />
              </label>
              <label className="space-y-1">
                <span className="text-xs font-medium text-muted-foreground">{t("Waiter / staff", "አስተናጋጅ / ሰራተኛ")}</span>
                <select
                  value={waiterFilter}
                  onChange={(event) => {
                    setWaiterFilter(event.target.value);
                    setPage(1);
                  }}
                  className="h-9 w-full rounded-lg border border-border bg-card px-3 text-sm"
                >
                  <option value="all">{t("All waiters", "ሁሉም አስተናጋጆች")}</option>
                  {waiterOptions.map((name) => (
                    <option key={name} value={name}>
                      {name}
                    </option>
                  ))}
                </select>
              </label>
              <label className="space-y-1 sm:col-span-2">
                <span className="text-xs font-medium text-muted-foreground">{t("Search", "ፈልግ")}</span>
                <div className="relative">
                  <Icons.Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                  <input
                    value={search}
                    onChange={(event) => {
                      setSearch(event.target.value);
                      setPage(1);
                    }}
                    placeholder={t("Receipt no, order no, table...", "ደረሰኝ ቁጥር፣ ትዕዛዝ፣ ጠረጴዛ...")}
                    className="h-9 w-full rounded-lg border border-border bg-card pl-9 pr-3 text-sm"
                  />
                </div>
              </label>
            </div>

            {availableDates.length > 0 ? (
              <div className="flex flex-wrap gap-1.5">
                <button
                  type="button"
                  onClick={() => {
                    setDateFilter("");
                    setPage(1);
                  }}
                  className={`rounded-full border px-2.5 py-1 text-xs ${
                    !dateFilter ? "border-ember bg-ember text-ember-foreground" : "border-border bg-card"
                  }`}
                >
                  {t("All dates", "ሁሉም ቀናት")}
                </button>
                {availableDates.slice(0, 7).map((day) => (
                  <button
                    key={day}
                    type="button"
                    onClick={() => {
                      setDateFilter(day);
                      setPage(1);
                    }}
                    className={`rounded-full border px-2.5 py-1 text-xs ${
                      dateFilter === day ? "border-ember bg-ember text-ember-foreground" : "border-border bg-card"
                    }`}
                  >
                    {day}
                  </button>
                ))}
              </div>
            ) : null}
          </Card>

          <Card className="min-w-0 overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead>
                <tr className="border-b border-border text-left text-xs text-muted-foreground">
                  <th className="px-3 py-2 font-medium">{t("Receipt", "ደረሰኝ")}</th>
                  <th className="px-3 py-2 font-medium">{t("Order", "ትዕዛዝ")}</th>
                  <th className="px-3 py-2 font-medium">{t("Generated", "ተፈጥሯል")}</th>
                  <th className="px-3 py-2 font-medium">{t("Waiter", "አስተናጋጅ")}</th>
                  <th className="px-3 py-2 font-medium">{t("Table", "ጠረጴዛ")}</th>
                  <th className="px-3 py-2 text-right font-medium">{t("Total", "ጠቅላላ")}</th>
                  <th className="px-3 py-2 text-right font-medium">{t("Change / Tip", "ተመላሽ / ጥቅማጥቅም")}</th>
                  <th className="px-3 py-2 font-medium">{t("Payment", "ክፍያ")}</th>
                  <th className="px-3 py-2 font-medium" />
                </tr>
              </thead>
              <tbody>
                {pageRows.map((row) => {
                  const liveOrder = store.orders.find((order) => order.id === row.orderId);
                  const paymentLabel = liveOrder
                    ? displayPaymentStatus(liveOrder)
                    : row.paymentStatus;
                  const payment = liveOrder?.payment ?? row.payment;
                  const changeOrTip = (payment?.changeAmount ?? 0) + (payment?.tipAmount ?? 0);
                  return (
                    <tr key={row.id} className="border-b border-border/70 last:border-0">
                      <td className="px-3 py-2.5 font-mono text-xs">{row.receipt.receiptNumber}</td>
                      <td className="px-3 py-2.5">
                        <div className="font-medium">{row.orderNo}</div>
                        <div className="text-xs text-muted-foreground">{row.ref}</div>
                      </td>
                      <td className="px-3 py-2.5 text-xs text-muted-foreground">
                        <div>{row.receipt.generatedAt}</div>
                        <div>{row.receipt.generatedBy}</div>
                      </td>
                      <td className="px-3 py-2.5">{row.waiter}</td>
                      <td className="px-3 py-2.5">
                        {row.area} {row.tableNumber}
                      </td>
                      <td className="px-3 py-2.5 text-right font-mono font-semibold">
                        {formatETB(row.receipt.grandTotal)}
                      </td>
                      <td className="px-3 py-2.5 text-right font-mono text-xs">
                        {changeOrTip > 0 ? (
                          <div>
                            <div className="font-semibold">{formatETB(changeOrTip)}</div>
                            <div className="text-muted-foreground">
                              {(payment?.tipAmount ?? 0) > 0
                                ? t("Tip", "ጥቅማጥቅም")
                                : t("Change", "ተመላሽ")}
                            </div>
                          </div>
                        ) : (
                          "—"
                        )}
                      </td>
                      <td className="px-3 py-2.5">
                        <Chip tone={paymentStatusTone(paymentLabel)}>{paymentLabel}</Chip>
                        {row.returnReason && (
                          <div className="mt-0.5 text-xs text-destructive">{t("Returned", "ተመላሽ")}: {row.returnReason}</div>
                        )}
                      </td>
                      <td className="px-3 py-2.5">
                        <div className="flex flex-wrap items-center gap-1.5">
                          {canManageBills &&
                          liveOrder &&
                          paymentLabel !== "Paid" &&
                          paymentLabel !== "Refunded" ? (
                            <button
                              type="button"
                              onClick={() => takePayment(row)}
                              className="inline-flex h-8 items-center gap-1.5 rounded-md bg-ember px-2.5 text-xs font-semibold text-ember-foreground"
                            >
                              <Icons.Wallet className="size-3.5" />
                              {t("Take payment", "ክፍያ ፈጽም")}
                            </button>
                          ) : null}
                          <button
                            type="button"
                            onClick={() => openStored(row)}
                            className="inline-flex h-8 items-center gap-1.5 rounded-md border border-border bg-card px-2.5 text-xs font-medium hover:bg-surface-2"
                          >
                            <Icons.Eye className="size-3.5" />
                            {t("View", "ይመልከቱ")}
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
                {pageRows.length === 0 && (
                  <tr>
                    <td colSpan={9} className="px-3 py-10 text-center text-sm text-muted-foreground">
                      {t("No receipts", "ደረሰኞች የሉም")}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>

            {filtered.length > PAGE_SIZE ? (
              <div className="flex items-center justify-between border-t border-border px-3 py-2 text-xs text-muted-foreground">
                <span>
                  {t("Page", "ገጽ")} {currentPage} / {pageCount}
                </span>
                <div className="flex gap-1">
                  <button
                    type="button"
                    disabled={currentPage <= 1}
                    onClick={() => setPage((value) => Math.max(1, value - 1))}
                    className="rounded-md border border-border px-2 py-1 disabled:opacity-40"
                  >
                    {t("Prev", "ቀዳሚ")}
                  </button>
                  <button
                    type="button"
                    disabled={currentPage >= pageCount}
                    onClick={() => setPage((value) => Math.min(pageCount, value + 1))}
                    className="rounded-md border border-border px-2 py-1 disabled:opacity-40"
                  >
                    {t("Next", "ቀጣይ")}
                  </button>
                </div>
              </div>
            ) : null}
          </Card>
        </>
      )}

      {billOrder && canManageBills ? (
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
      ) : null}
      {receiptView ? <ReceiptDialog view={receiptView} onClose={() => setReceiptView(null)} /> : null}
      {skippedStockItems.length > 0 ? (
        <div className="fixed bottom-4 right-4 z-50 max-w-sm rounded-xl border border-gold/40 bg-gold/10 px-4 py-3 text-sm shadow-lg">
          <div className="flex items-start justify-between gap-3">
            <div>
              <div className="font-semibold">{t("Stock not deducted", "ክምችት አልተቀነሰም")}</div>
              <div className="mt-1 text-xs text-muted-foreground">{skippedStockItems.join(", ")}</div>
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
      ) : null}
    </div>
  );
}
