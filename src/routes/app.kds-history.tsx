import { createFileRoute, Link } from "@tanstack/react-router";
import { useState, useMemo } from "react";
import * as Icons from "lucide-react";
import { PageHeader, Chip } from "@/components/ui-kit";
import { isFinalOrderStatus, type Order } from "@/lib/demo-data";
import { useStore } from "@/lib/store";
import { useAuth } from "@/lib/auth-context";
import { useT } from "@/lib/i18n";
import { stationsForRole } from "@/lib/notifications";

export const Route = createFileRoute("/app/kds-history")({ component: KdsHistory });

type SortKey = "sentAt" | "tableNumber" | "orderNo" | "status" | "items";
type SortDir = "asc" | "desc";

const STATUS_TONE: Record<string, "teff" | "muted" | "ember" | "gold"> = {
  "CLOSED": "teff",
  "CANCELLED": "ember",
  "RECEIPT_GENERATED": "gold",
  "READY TO SERVE": "teff",
};

function statusLabel(status: Order["status"], t: ReturnType<typeof useT>) {
  if (status === "CLOSED") return t("Closed", "ተዘጋ");
  if (status === "CANCELLED") return t("Cancelled", "ተሰርዟል");
  if (status === "RECEIPT_GENERATED") return t("Receipt", "ደረሰኝ");
  if (status === "READY TO SERVE") return t("Ready to serve", "ለማቅረብ ዝግጁ");
  return status;
}

function compare(a: Order, b: Order, key: SortKey, dir: SortDir): number {
  let av: string | number = "";
  let bv: string | number = "";
  if (key === "sentAt") { av = a.sentAt ?? ""; bv = b.sentAt ?? ""; }
  else if (key === "tableNumber") { av = a.tableNumber; bv = b.tableNumber; }
  else if (key === "orderNo") { av = a.orderNo; bv = b.orderNo; }
  else if (key === "status") { av = a.status; bv = b.status; }
  else if (key === "items") { av = a.items.length; bv = b.items.length; }
  const result = av < bv ? -1 : av > bv ? 1 : 0;
  return dir === "asc" ? result : -result;
}

function SortTh({
  label, sortKey, current, dir, onSort,
}: {
  label: string;
  sortKey: SortKey;
  current: SortKey;
  dir: SortDir;
  onSort: (k: SortKey) => void;
}) {
  const active = current === sortKey;
  return (
    <th
      className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-muted-foreground cursor-pointer select-none hover:text-foreground transition-colors whitespace-nowrap"
      onClick={() => onSort(sortKey)}
    >
      <span className="inline-flex items-center gap-1">
        {label}
        {active ? (
          dir === "asc"
            ? <Icons.ChevronUp className="size-3" />
            : <Icons.ChevronDown className="size-3" />
        ) : (
          <Icons.ChevronsUpDown className="size-3 opacity-40" />
        )}
      </span>
    </th>
  );
}

function KdsHistory() {
  const store = useStore();
  const { user } = useAuth();
  const t = useT();
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | Order["status"]>("all");
  const [sortKey, setSortKey] = useState<SortKey>("sentAt");
  const [sortDir, setSortDir] = useState<SortDir>("desc");
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const PAGE_SIZE = 10;

  const isManager = user?.role === "Branch Manager";
  const userStations = user ? stationsForRole(user.role, store.menuStations) : [];

  const completedOrders = useMemo(
    () =>
      store.orders.filter(
        (o) =>
          (isFinalOrderStatus(o.status) || o.status === "RECEIPT_GENERATED" || o.status === "READY TO SERVE") &&
          (isManager || userStations.length === 0 ||
            o.stationTickets.some((tk) => userStations.includes(tk.station))),
      ),
    [store.orders, isManager, userStations],
  );

  const statuses = useMemo(
    () => Array.from(new Set(completedOrders.map((o) => o.status))),
    [completedOrders],
  );

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return completedOrders
      .filter((o) => {
        if (statusFilter !== "all" && o.status !== statusFilter) return false;
        if (!q) return true;
        return (
          o.orderNo.toLowerCase().includes(q) ||
          o.tableNumber.toLowerCase().includes(q) ||
          o.waiter.toLowerCase().includes(q) ||
          o.area.toLowerCase().includes(q)
        );
      })
      .sort((a, b) => compare(a, b, sortKey, sortDir));
  }, [completedOrders, search, statusFilter, sortKey, sortDir]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const paginated = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  function handleSort(key: SortKey) {
    if (key === sortKey) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else { setSortKey(key); setSortDir("asc"); }
    setPage(1);
  }

  function handleSearch(v: string) { setSearch(v); setPage(1); }
  function handleFilter(v: "all" | Order["status"]) { setStatusFilter(v); setPage(1); }

  return (
    <div className="flex flex-col gap-5">
      <PageHeader
        title={t("Order History", "የትዕዛዝ ታሪክ")}
        action={
          <Link
            to="/app/kds"
            className="inline-flex items-center gap-2 min-h-10 px-4 rounded-xl border border-border bg-card text-sm font-semibold text-muted-foreground hover:bg-surface-2 hover:text-foreground transition-colors"
          >
            <Icons.ChefHat className="size-4" />
            {t("Back to Stations", "ወደ ጣቢያዎች ተመለስ")}
          </Link>
        }
      />

      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-48">
          <Icons.Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground pointer-events-none" />
          <input
            type="text"
            value={search}
            onChange={(e) => handleSearch(e.target.value)}
            placeholder={t("Search order, table, waiter…", "ትዕዛዝ፣ ጠረጴዛ፣ አስተናጋጅ ፈልግ…")}
            className="w-full h-10 pl-9 pr-3 rounded-xl border border-border bg-card text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
          />
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <button
            onClick={() => handleFilter("all")}
            className={`h-9 px-3 rounded-xl text-xs font-semibold transition-colors ${statusFilter === "all" ? "bg-foreground text-background" : "border border-border bg-card text-muted-foreground hover:bg-surface-2 hover:text-foreground"}`}
          >
            {t("All", "ሁሉም")} <span className="ml-1 opacity-60">{completedOrders.length}</span>
          </button>
          {statuses.map((s) => (
            <button
              key={s}
              onClick={() => handleFilter(s)}
              className={`h-9 px-3 rounded-xl text-xs font-semibold transition-colors ${statusFilter === s ? "bg-foreground text-background" : "border border-border bg-card text-muted-foreground hover:bg-surface-2 hover:text-foreground"}`}
            >
              {statusLabel(s, t)}
            </button>
          ))}
        </div>
      </div>

      {/* Summary chips */}
      <div className="flex flex-wrap gap-2">
        <Chip tone="teff">
          <Icons.CheckCircle2 className="size-3" />
          {completedOrders.filter((o) => o.status === "CLOSED").length} {t("closed", "ተዘጋ")}
        </Chip>
        <Chip tone="gold">
          {completedOrders.filter((o) => o.status === "RECEIPT_GENERATED").length} {t("receipt", "ደረሰኝ")}
        </Chip>
        <Chip tone="ember">
          {completedOrders.filter((o) => o.status === "CANCELLED").length} {t("cancelled", "ተሰርዟል")}
        </Chip>
        <Chip tone="muted">
          {completedOrders.filter((o) => o.status === "READY TO SERVE").length} {t("ready to serve", "ለማቅረብ ዝግጁ")}
        </Chip>
      </div>

      {/* Table */}
      <div className="surface-card !p-0 overflow-hidden">
        {filtered.length === 0 ? (
          <div className="p-12 text-center text-sm text-muted-foreground">
            <Icons.ClipboardX className="size-8 mx-auto mb-3 opacity-30" />
            {t("No completed orders found.", "የተጠናቀቁ ትዕዛዞች አልተገኙም።")}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm border-collapse">
              <thead className="border-b border-border bg-surface-2/50">
                <tr>
                  <SortTh label={t("Order", "ትዕዛዝ")} sortKey="orderNo" current={sortKey} dir={sortDir} onSort={handleSort} />
                  <SortTh label={t("Table", "ጠረጴዛ")} sortKey="tableNumber" current={sortKey} dir={sortDir} onSort={handleSort} />
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-muted-foreground whitespace-nowrap">
                    {t("Waiter", "አስተናጋጅ")}
                  </th>
                  <SortTh label={t("Items", "ዕቃዎች")} sortKey="items" current={sortKey} dir={sortDir} onSort={handleSort} />
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-muted-foreground whitespace-nowrap">
                    {t("Stations", "ጣቢያዎች")}
                  </th>
                  <SortTh label={t("Time", "ጊዜ")} sortKey="sentAt" current={sortKey} dir={sortDir} onSort={handleSort} />
                  <SortTh label={t("Status", "ሁኔታ")} sortKey="status" current={sortKey} dir={sortDir} onSort={handleSort} />
                  <th className="w-10" />
                </tr>
              </thead>
              <tbody className="divide-y divide-border/50">
                {paginated.map((order) => {
                  const relevantTickets = order.stationTickets.filter(
                    (tk) => isManager || userStations.length === 0 || userStations.includes(tk.station),
                  );
                  const ready = relevantTickets.filter((tk) => tk.status === "READY").length;
                  const total = relevantTickets.length;
                  const isExpanded = expandedId === order.id;
                  return (
                    <>
                      <tr
                        key={order.id}
                        className={`hover:bg-surface-2/60 transition-colors cursor-pointer ${isExpanded ? "bg-surface-2/40" : ""}`}
                        onClick={() => setExpandedId(isExpanded ? null : order.id)}
                      >
                        <td className="px-4 py-3 font-mono text-xs text-muted-foreground whitespace-nowrap">
                          {order.orderNo}
                        </td>
                        <td className="px-4 py-3 font-semibold whitespace-nowrap">
                          {order.tableNumber}
                          <div className="text-xs font-normal text-muted-foreground">{order.area}</div>
                        </td>
                        <td className="px-4 py-3 text-muted-foreground whitespace-nowrap">{order.waiter}</td>
                        <td className="px-4 py-3 text-center font-semibold">{order.items.length}</td>
                        <td className="px-4 py-3 whitespace-nowrap">
                          <span className="text-xs text-muted-foreground">
                            {ready}/{total} {t("ready", "ዝግጁ")}
                          </span>
                        </td>
                        <td className="px-4 py-3 font-mono text-xs text-muted-foreground whitespace-nowrap">
                          {order.sentAt}
                        </td>
                        <td className="px-4 py-3">
                          <Chip tone={STATUS_TONE[order.status] ?? "muted"}>
                            {statusLabel(order.status, t)}
                          </Chip>
                        </td>
                        <td className="px-4 py-3 text-center">
                          <Icons.ChevronDown
                            className={`size-4 text-muted-foreground transition-transform duration-200 inline-block ${isExpanded ? "rotate-180" : ""}`}
                          />
                        </td>
                      </tr>
                      {isExpanded && (
                        <tr key={`${order.id}-detail`} className="bg-surface-2/30 animate-in fade-in duration-200">
                          <td colSpan={8} className="px-6 py-4">
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                              {/* Order meta */}
                              <div className="space-y-2 text-xs text-muted-foreground">
                                <div className="grid grid-cols-2 gap-x-4 gap-y-1.5">
                                  <span>{t("Cashier", "ካሸር")}</span>
                                  <span className="text-foreground font-medium">{order.enteredByCashier}</span>
                                  <span>{t("Source", "ምንጭ")}</span>
                                  <span className="text-foreground font-medium">{order.source}</span>
                                  {order.cancelledAt && (
                                    <>
                                      <span>{t("Cancelled at", "የተሰረዘበት ጊዜ")}</span>
                                      <span className="text-ember font-medium">{order.cancelledAt}</span>
                                    </>
                                  )}
                                  {order.cancelledBy && (
                                    <>
                                      <span>{t("Cancelled by", "የሰረዘው")}</span>
                                      <span className="text-ember font-medium">{order.cancelledBy}</span>
                                    </>
                                  )}
                                  {order.receipt && (
                                    <>
                                      <span>{t("Receipt #", "ደረሰኝ #")}</span>
                                      <span className="text-foreground font-mono">{order.receipt.receiptNumber}</span>
                                      <span>{t("Total", "ጠቅላላ")}</span>
                                      <span className="text-foreground font-semibold">{order.receipt.grandTotal.toLocaleString()} {order.receipt.currency ?? "ETB"}</span>
                                    </>
                                  )}
                                </div>
                              </div>
                              {/* Items list */}
                              <div>
                                <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">
                                  {t("Items", "ዕቃዎች")}
                                </div>
                                <ul className="space-y-1.5">
                                  {order.items
                                    .filter((item) => isManager || userStations.length === 0 || userStations.includes(item.station))
                                    .map((item, i) => (
                                      <li key={`${order.id}-item-${i}`} className="flex items-center gap-2 text-sm">
                                        <span className="size-7 rounded-lg bg-surface-2 grid place-items-center font-display font-semibold text-xs shrink-0">
                                          {item.qty}
                                        </span>
                                        <span className="font-medium leading-tight">{item.name}</span>
                                        <span className="ml-auto text-xs text-muted-foreground shrink-0">{item.station}</span>
                                      </li>
                                    ))}
                                </ul>
                              </div>
                            </div>
                          </td>
                        </tr>
                      )}
                    </>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div className="flex items-center justify-between gap-4">
        <span className="text-xs text-muted-foreground">
          {filtered.length} {t("of", "ከ")} {completedOrders.length} {t("orders", "ትዕዛዞች")}
        </span>
        <div className="flex items-center gap-1">
          <button
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            disabled={page === 1}
            className="size-8 rounded-lg border border-border bg-card flex items-center justify-center text-muted-foreground hover:bg-surface-2 hover:text-foreground disabled:opacity-40 disabled:pointer-events-none transition-colors"
          >
            <Icons.ChevronLeft className="size-4" />
          </button>
          {Array.from({ length: totalPages }, (_, i) => i + 1).map((p) => (
            <button
              key={p}
              onClick={() => setPage(p)}
              className={`size-8 rounded-lg border text-xs font-semibold transition-colors ${
                p === page
                  ? "bg-foreground text-background border-foreground"
                  : "border-border bg-card text-muted-foreground hover:bg-surface-2 hover:text-foreground"
              }`}
            >
              {p}
            </button>
          ))}
          <button
            onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
            disabled={page === totalPages}
            className="size-8 rounded-lg border border-border bg-card flex items-center justify-center text-muted-foreground hover:bg-surface-2 hover:text-foreground disabled:opacity-40 disabled:pointer-events-none transition-colors"
          >
            <Icons.ChevronRight className="size-4" />
          </button>
        </div>
      </div>
    </div>
  );
}
