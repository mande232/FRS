import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState, type ComponentType } from "react";
import * as Icons from "lucide-react";
import { PageHeader, Chip } from "@/components/ui-kit";
import {
  isFinalOrderStatus,
  type ProductionStation,
  type StationTicketStatus,
} from "@/lib/demo-data";
import { useStore } from "@/lib/store";
import { useAuth } from "@/lib/auth-context";
import { orderLineName, useT } from "@/lib/i18n";
import { useLang } from "@/lib/lang-context";
import { stationsForRole } from "@/lib/notifications";
import { aliasLegacyStation, sameStation, stationIconName, uniqueStations } from "@/lib/stations";
import { showError, showSuccess } from "@/lib/toast";
import {
  createDepartmentStockRequest,
  pickPreferredSourceStore,
  stationToOperationalLocation,
  suggestDepartmentRestockQuantity,
  toStockRequestRecord,
  useStockManagementModule,
  type OperationalStockLocation,
  type StockUnitType,
} from "@/lib/stock-management";

export const Route = createFileRoute("/app/kds")({ component: StationDisplay });

const NEXT_STATUS: Record<StationTicketStatus, StationTicketStatus> = {
  NEW: "PREPARING",
  PREPARING: "READY",
  READY: "READY",
  UNAVAILABLE: "UNAVAILABLE",
  CANCELLED: "CANCELLED",
};

const STATUS_RANK: Record<StationTicketStatus, number> = {
  NEW: 0,
  PREPARING: 1,
  READY: 2,
  UNAVAILABLE: 3,
  CANCELLED: 4,
};

function formatQty(qty: number, unitLabel?: string) {
  const value = qty.toLocaleString(undefined, { maximumFractionDigits: 3 });
  return unitLabel ? `${value} ${unitLabel}` : value;
}

function canShowAllKdsTab(role: string | undefined) {
  return (
    role === "Administrator" ||
    role === "Branch Manager" ||
    role === "Supervisor" ||
    role === "Cashier"
  );
}

function useElapsed(sentAt: string) {
  const [, setTick] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setTick((n) => n + 1), 30_000);
    return () => clearInterval(id);
  }, []);
  const diffMs = Date.now() - new Date(sentAt).getTime();
  if (isNaN(diffMs) || diffMs < 0) return sentAt;
  const mins = Math.floor(diffMs / 60_000);
  if (mins < 60) return `${mins}m`;
  return `${Math.floor(mins / 60)}h ${mins % 60}m`;
}

// ─── New Order Card ───────────────────────────────────────────────────────────

function NewTicketCard({
  order,
  ticket,
  onAccept,
  isVoidPending,
}: {
  order: ReturnType<typeof useStore>["orders"][number];
  ticket: ReturnType<typeof useStore>["orders"][number]["stationTickets"][number];
  onAccept: () => void;
  isVoidPending?: boolean;
}) {
  const t = useT();
  const lang = useLang();
  const store = useStore();
  const elapsed = useElapsed(ticket.sentAt);

  return (
    <div className={`w-full surface-card !p-0 overflow-hidden animate-in fade-in slide-in-from-top-2 duration-300 ${isVoidPending ? "ring-2 ring-destructive/60 opacity-75" : "ring-2 ring-ember/60"}`}>
      {/* Void pending banner */}
      {isVoidPending && (
        <div className="flex items-center gap-2 px-4 py-2 bg-destructive/10 border-b border-destructive/20">
          <Icons.Lock className="size-3.5 text-destructive shrink-0" />
          <span className="text-xs font-semibold text-destructive">{t("Void pending — locked", "ሰረዛ እየጠበቀ — ተቆልፏል")}</span>
          {order.voidRequestedBy && <span className="text-xs text-destructive/70 ml-auto">{order.voidRequestedBy}</span>}
        </div>
      )}
      {/* Header */}
      <div className={`flex items-center justify-between px-4 py-3 border-b ${isVoidPending ? "bg-destructive/5 border-destructive/20" : "bg-ember/10 border-ember/20"}`}>
        <div>
          <p className="text-[11px] font-mono text-muted-foreground">{order.orderNo}</p>
          <p className="text-lg font-bold leading-tight">{order.tableNumber}</p>
          <p className="text-xs text-muted-foreground">{order.area}</p>
        </div>
        <div className="flex flex-col items-end gap-1">
          {isVoidPending
            ? <Chip tone="destructive"><Icons.Lock className="size-3" />{t("Locked", "ተቆልፏል")}</Chip>
            : <span className="text-[10px] uppercase tracking-widest font-bold text-ember animate-pulse">{t("New", "አዲስ")}</span>
          }
          <span className={`text-2xl font-mono font-bold ${isVoidPending ? "text-destructive/60" : "text-ember"}`}>{elapsed}</span>
        </div>
      </div>
      {/* Waiter row */}
      <div className="flex items-center gap-2 px-4 py-2 border-b border-border/50 bg-surface-2/40">
        <Icons.User className="size-3.5 text-muted-foreground shrink-0" />
        <span className="text-xs text-muted-foreground">{t("Waiter", "አስተናጋጅ")}:</span>
        <span className="text-xs font-semibold">{order.waiter}</span>
      </div>
      {/* Items */}
      <ul className="px-4 py-3 space-y-2">
        {ticket.items.map((item) => (
          <li key={`${ticket.id}-${item.menuItemId ?? item.name}`} className="flex items-center gap-3">
            <span className={`min-w-10 h-10 rounded-lg grid place-items-center font-bold text-sm shrink-0 px-1 ${isVoidPending ? "bg-destructive/10 border border-destructive/20 text-destructive/60" : "bg-ember/10 border border-ember/20 text-ember"}`}>
              {formatQty(item.qty, item.unitLabel)}
            </span>
            <span className="font-semibold text-base leading-snug flex-1">
              {orderLineName(item, store.menuItems, lang)}
            </span>
          </li>
        ))}
      </ul>
      {/* Action */}
      <div className="px-4 pb-4 space-y-2">
        <button
          onClick={onAccept}
          disabled={isVoidPending}
          className="w-full min-h-14 rounded-xl font-bold inline-flex items-center justify-center gap-2 transition-all text-base disabled:cursor-not-allowed disabled:opacity-40 disabled:bg-muted disabled:text-muted-foreground bg-ember text-ember-foreground shadow-[var(--shadow-glow)] hover:opacity-90 active:scale-[0.98]"
        >
          {isVoidPending ? <Icons.Lock className="size-5" /> : <Icons.Hand className="size-5" />}
          {isVoidPending
            ? t("Awaiting void decision", "የሰረዛ ውሳኔ እየጠበቀ")
            : t("Accept order", "ትዕዛዝ ተቀበል")}
        </button>
      </div>
    </div>
  );
}

// ─── Accepted Card ────────────────────────────────────────────────────────────

function AcceptedCard({
  order,
  ticket,
  onSendReady,
  onMarkUnavailable,
  onRecordWastage,
  onRequestVoid,
  isVoidPending,
}: {
  order: ReturnType<typeof useStore>["orders"][number];
  ticket: ReturnType<typeof useStore>["orders"][number]["stationTickets"][number];
  onSendReady: () => void;
  onMarkUnavailable: () => void;
  onRecordWastage: () => void;
  onRequestVoid: () => void;
  isVoidPending?: boolean;
}) {
  const t = useT();
  const lang = useLang();
  const store = useStore();
  const elapsed = useElapsed(ticket.sentAt);

  return (
    <div className={`w-full surface-card !p-0 overflow-hidden animate-in fade-in duration-300 ${isVoidPending ? "ring-2 ring-destructive/60 opacity-75" : "ring-1 ring-gold/30"}`}>
      {/* Void pending banner */}
      {isVoidPending && (
        <div className="flex items-center gap-2 px-4 py-2 bg-destructive/10 border-b border-destructive/20">
          <Icons.Lock className="size-3.5 text-destructive shrink-0" />
          <span className="text-xs font-semibold text-destructive">{t("Void pending — locked", "ሰረዛ እየጠበቀ — ተቆልፏል")}</span>
          {order.voidRequestedBy && <span className="text-xs text-destructive/70 ml-auto">{order.voidRequestedBy}</span>}
        </div>
      )}
      {/* Header */}
      <div className={`flex items-center justify-between px-4 py-3 border-b ${isVoidPending ? "bg-destructive/5 border-destructive/20" : "bg-gold/10 border-gold/20"}`}>
        <div>
          <p className="text-[11px] font-mono text-muted-foreground">{order.orderNo}</p>
          <p className="text-lg font-bold leading-tight">{order.tableNumber}</p>
          <p className="text-xs text-muted-foreground">{order.area}</p>
        </div>
        <div className="flex flex-col items-end gap-1">
          {isVoidPending
            ? <Chip tone="destructive"><Icons.Lock className="size-3" />{t("Locked", "ተቆልፏል")}</Chip>
            : <Chip tone="gold">{t("Preparing", "ስራእ ላይ")}</Chip>
          }
          <span className={`text-2xl font-mono font-bold ${isVoidPending ? "text-destructive/60" : "text-gold-foreground"}`}>{elapsed}</span>
        </div>
      </div>
      {/* Waiter row */}
      <div className="flex items-center gap-2 px-4 py-2 border-b border-border/50 bg-surface-2/40">
        <Icons.User className="size-3.5 text-muted-foreground shrink-0" />
        <span className="text-xs text-muted-foreground">{t("Waiter", "አስተናጋጅ")}:</span>
        <span className="text-xs font-semibold">{order.waiter}</span>
      </div>
      {/* Items */}
      <ul className="px-4 py-3 space-y-2">
        {ticket.items.map((item) => (
          <li key={`exp-${ticket.id}-${item.menuItemId ?? item.name}`} className="flex items-center gap-3">
            <span className={`min-w-10 h-10 rounded-lg grid place-items-center font-bold text-sm shrink-0 px-1 ${isVoidPending ? "bg-destructive/10 border border-destructive/20 text-destructive/60" : "bg-gold/10 border border-gold/20 text-gold-foreground"}`}>
              {formatQty(item.qty, item.unitLabel)}
            </span>
            <span className="font-semibold text-base leading-snug flex-1">
              {orderLineName(item, store.menuItems, lang)}
            </span>
          </li>
        ))}
      </ul>
      {/* Actions */}
      <div className="px-4 pb-4 space-y-2">
        <button
          onClick={onSendReady}
          disabled={isVoidPending}
          className="w-full min-h-14 rounded-xl font-bold inline-flex items-center justify-center gap-2 transition-all text-base disabled:cursor-not-allowed disabled:opacity-40 disabled:bg-muted disabled:text-muted-foreground bg-teff text-teff-foreground hover:opacity-90 active:scale-[0.98]"
        >
          {isVoidPending ? <Icons.Lock className="size-5" /> : <Icons.CheckCircle2 className="size-5" />}
          {isVoidPending
            ? t("Awaiting void decision", "የሰረዛ ውሳኔ እየጠበቀ")
            : t("Done – send ready", "ተጠናቋል – ዝግጁ ላክ")}
        </button>
        {!isVoidPending && (
          <div className="grid grid-cols-3 gap-2">
            <button
              type="button"
              onClick={onMarkUnavailable}
              className="min-h-10 rounded-lg border border-border text-xs font-semibold hover:bg-surface-2 inline-flex items-center justify-center gap-1 px-2"
            >
              <Icons.Ban className="size-3.5 shrink-0" />
              {t("Unavailable", "አልተገኘም")}
            </button>
            <button
              type="button"
              onClick={onRecordWastage}
              className="min-h-10 rounded-lg border border-border text-xs font-semibold hover:bg-surface-2 inline-flex items-center justify-center gap-1 px-2"
            >
              <Icons.Trash2 className="size-3.5 shrink-0" />
              {t("Wastage", "ብክነት")}
            </button>
            <button
              type="button"
              onClick={onRequestVoid}
              className="min-h-10 rounded-lg border border-destructive/40 text-destructive text-xs font-semibold hover:bg-destructive/10 inline-flex items-center justify-center gap-1 px-2"
            >
              <Icons.XCircle className="size-3.5 shrink-0" />
              {t("Void req.", "ሰረዛ ጠይቅ")}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Ready Card ───────────────────────────────────────────────────────────────

function ReadyCard({
  order,
  ticket,
}: {
  order: ReturnType<typeof useStore>["orders"][number];
  ticket: ReturnType<typeof useStore>["orders"][number]["stationTickets"][number];
}) {
  const t = useT();
  const elapsed = useElapsed(ticket.sentAt);

  return (
    <div className="w-full surface-card !p-0 overflow-hidden ring-1 ring-teff/40 animate-in fade-in zoom-in-95 duration-300">
      <div className="flex items-center justify-between px-4 py-3 bg-teff/10 border-b border-teff/20">
        <div>
          <p className="text-[11px] font-mono text-muted-foreground">{order.orderNo}</p>
          <p className="text-lg font-bold leading-tight">{order.tableNumber}</p>
          <p className="text-xs text-muted-foreground">{order.area}</p>
        </div>
        <div className="flex flex-col items-end gap-1">
          <Chip tone="teff">
            <Icons.CheckCircle2 className="size-3" />
            {t("Ready", "ዝግጁ")}
          </Chip>
          <span className="text-2xl font-mono font-bold text-teff">{elapsed}</span>
        </div>
      </div>
      <div className="flex items-center gap-2 px-4 py-3">
        <Icons.UtensilsCrossed className="size-4 text-teff shrink-0" />
        <span className="text-sm font-semibold text-teff">{ticket.items.length} {t("items ready to serve", "ዕቃዎች ለማቀረብ ዝግጁ")}</span>
      </div>
    </div>
  );
}

// ─── Station Column ───────────────────────────────────────────────────────────

function StationColumn({
  currentStation,
  activeOrders,
  onAdvance,
  onMarkUnavailable,
  onRecordWastage,
  onRequestVoid,
  onRequestStock,
}: {
  currentStation: ProductionStation;
  activeOrders: ReturnType<typeof useStore>["orders"];
  onAdvance: (orderId: string, ticketId: string, status: StationTicketStatus) => void;
  onMarkUnavailable: (orderId: string, ticketId: string) => void;
  onRecordWastage: (orderId: string, ticketId: string) => void;
  onRequestVoid: (orderId: string) => void;
  onRequestStock: (station: ProductionStation) => void;
}) {
  const t = useT();
  const StationIcon =
    (Icons as unknown as Record<string, ComponentType<{ className?: string }>>)[
      stationIconName(currentStation)
    ] ?? Icons.Circle;

  const stationTickets = activeOrders
    .flatMap((order) =>
      order.stationTickets
        .filter(
          (ticket) =>
            ticket.status !== "CANCELLED" &&
            ticket.status !== "UNAVAILABLE" &&
            (sameStation(ticket.station, currentStation) ||
              ticket.items.some((item) => sameStation(item.station, currentStation))),
        )
        .map((ticket) => ({ order, ticket })),
    )
    .sort(
      (a, b) =>
        STATUS_RANK[a.ticket.status] - STATUS_RANK[b.ticket.status] ||
        a.ticket.sentAt.localeCompare(b.ticket.sentAt),
    );

  const newTickets = stationTickets.filter(({ ticket }) => ticket.status === "NEW");
  const acceptedTickets = stationTickets.filter(({ ticket }) => ticket.status === "PREPARING");
  const readyTickets = stationTickets.filter(({ ticket }) => ticket.status === "READY");

  const voidLockedOrders = activeOrders.filter(
    (order) =>
      order.voidRequestedBy &&
      order.stationTickets.some((tk) => sameStation(tk.station, currentStation)),
  );

  return (
    <section className="flex flex-col gap-3 min-w-64 w-80 lg:w-96">
      {/* Station header */}
      <div className="flex items-center justify-between gap-2 px-0.5">
        <h3 className="inline-flex items-center gap-2 font-display text-base font-semibold">
          <StationIcon className="size-4 text-muted-foreground shrink-0" />
          <span className="truncate">{currentStation}</span>
        </h3>
        <div className="flex items-center gap-1 shrink-0">
          <button
            type="button"
            onClick={() => onRequestStock(currentStation)}
            className="min-h-10 px-2.5 rounded-lg border border-border text-[11px] font-semibold hover:bg-surface-2 inline-flex items-center gap-1"
          >
            <Icons.PackagePlus className="size-3.5" />
            {t("Stock", "ክምችት")}
          </button>
          {newTickets.length > 0 && (
            <Chip tone="ember">
              <span className="size-1.5 rounded-full bg-ember animate-pulse" />
              {newTickets.length}
            </Chip>
          )}
          {acceptedTickets.length > 0 && <Chip tone="gold">{acceptedTickets.length}</Chip>}
          {readyTickets.length > 0 && <Chip tone="teff">{readyTickets.length}</Chip>}
        </div>
      </div>

      {/* Void-pending banner — only for this station */}
      {voidLockedOrders.map((order) => (
        <div key={order.id} className="rounded-xl border border-destructive/30 bg-destructive/5 px-3 py-2.5 flex items-start gap-2">
          <Icons.Lock className="size-3.5 text-destructive shrink-0 mt-0.5" />
          <div className="text-xs">
            <span className="font-semibold text-destructive">{order.orderNo}</span>
            <span className="text-destructive/70 ml-1">{t("awaiting void approval", "የሰረዛ ማረጋገጫ እየጠበቀ")}</span>
            {order.voidReason && <p className="text-destructive/60 italic mt-0.5 truncate max-w-[220px]">"{order.voidReason}"</p>}
          </div>
        </div>
      ))}

      {/* NEW – large cards */}
      {newTickets.map(({ order, ticket }) => (
        <NewTicketCard
          key={ticket.id}
          order={order}
          ticket={ticket}
          isVoidPending={!!order.voidRequestedBy}
          onAccept={() => onAdvance(order.id, ticket.id, ticket.status)}
        />
      ))}

      {/* ACCEPTED – cards */}
      {acceptedTickets.length > 0 && (
        <div className="w-full space-y-2">
          <div className="flex items-center gap-2 px-0.5">
            <Icons.ClipboardList className="size-3.5 text-gold-foreground shrink-0" />
            <span className="text-[11px] font-semibold text-gold-foreground uppercase tracking-wider">
              {t("Accepted", "ተቀባይነት አግኝቷል")} · {acceptedTickets.length}
            </span>
          </div>
          {acceptedTickets.map(({ order, ticket }) => (
            <AcceptedCard
              key={ticket.id}
              order={order}
              ticket={ticket}
              isVoidPending={!!order.voidRequestedBy}
              onSendReady={() => onAdvance(order.id, ticket.id, ticket.status)}
              onMarkUnavailable={() => onMarkUnavailable(order.id, ticket.id)}
              onRecordWastage={() => onRecordWastage(order.id, ticket.id)}
              onRequestVoid={() => onRequestVoid(order.id)}
            />
          ))}
        </div>
      )}

      {/* READY – compact cards */}
      {readyTickets.length > 0 && (
        <div className="w-full space-y-2">
          <div className="flex items-center gap-2 px-0.5">
            <Icons.CheckCircle2 className="size-3.5 text-teff shrink-0" />
            <span className="text-[11px] font-semibold text-teff uppercase tracking-wider">
              {t("Ready", "ዝግጁ")} · {readyTickets.length}
            </span>
          </div>
          {readyTickets.map(({ order, ticket }) => (
            <ReadyCard key={ticket.id} order={order} ticket={ticket} />
          ))}
        </div>
      )}

      {stationTickets.length === 0 && (
        <div className="w-full rounded-xl border-2 border-dashed border-border py-10 text-center text-sm text-muted-foreground">
          {t("No orders here", "እዚህ ትዕዛዝ የለም")}
        </div>
      )}
    </section>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

function StationDisplay() {
  const store = useStore();
  const stockModule = useStockManagementModule();
  const { user } = useAuth();
  const t = useT();
  const liveStations = uniqueStations([
    ...store.menuStations,
    ...store.orders.flatMap((order) =>
      order.stationTickets.map((ticket) => aliasLegacyStation(ticket.station)),
    ),
  ]);
  const roleStations = user ? stationsForRole(user.role, liveStations) : [];
  const showAllTab = canShowAllKdsTab(user?.role);
  const stationOptions =
    showAllTab || roleStations.length === 0
      ? liveStations
      : roleStations;
  const [station, setStation] = useState<"All" | ProductionStation>(() =>
    showAllTab ? "All" : (stationOptions[0] ?? store.menuStations[0] ?? "All"),
  );
  const [restockStation, setRestockStation] = useState<ProductionStation | null>(null);
  const [restockItemId, setRestockItemId] = useState("");
  const [restockQty, setRestockQty] = useState(1);
  const stations = station === "All" ? stationOptions : [station];
  const tabOptions = showAllTab ? (["All", ...stationOptions] as const) : stationOptions;
  const showStationTabs = tabOptions.length > 1;

  const department = restockStation
    ? (stationToOperationalLocation(restockStation) || "Kitchen")
    : "Kitchen";
  const departmentLowStock = stockModule.balances.filter(
    (row) => row.location === department && row.quantity <= row.reorderLevel,
  );

  const activeOrders = store.orders.filter(
    (order) =>
      !isFinalOrderStatus(order.status) &&
      order.status !== "PENDING_CASHIER" &&
      order.status !== "READY TO SERVE",
  );

  const newTicketCount = activeOrders.reduce(
    (sum, order) => sum + order.stationTickets.filter((tk) => tk.status === "NEW").length,
    0,
  );
  const activeTicketCount = activeOrders.reduce(
    (sum, order) => sum + order.stationTickets.filter((tk) => tk.status === "PREPARING").length,
    0,
  );
  const readyTicketCount = activeOrders.reduce(
    (sum, order) => sum + order.stationTickets.filter((tk) => tk.status === "READY").length,
    0,
  );
  const newCountByStation = stationOptions.reduce(
    (counts, item) => {
      counts[item] = activeOrders.reduce(
        (sum, order) =>
          sum +
          order.stationTickets.filter(
            (tk) =>
              tk.status === "NEW" &&
              (sameStation(tk.station, item) ||
                tk.items.some((row) => sameStation(row.station, item))),
          ).length,
        0,
      );
      return counts;
    },
    {} as Record<ProductionStation, number>,
  );

  useEffect(() => {
    if (!user) return;
    if (showAllTab) setStation("All");
    else setStation(stationOptions[0] ?? store.menuStations[0] ?? "All");
    // Reset default tab when the signed-in role changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps -- intentional: only on role/login
  }, [user?.role]);

  useEffect(() => {
    if (showAllTab) {
      if (station !== "All" && !stationOptions.includes(station)) setStation("All");
      return;
    }
    if (station === "All" || !stationOptions.includes(station)) {
      setStation(stationOptions[0] ?? store.menuStations[0] ?? "All");
    }
  }, [station, stationOptions, showAllTab, store.menuStations]);


  function advance(orderId: string, ticketId: string, status: StationTicketStatus) {
    store.updateStationTicket(orderId, ticketId, NEXT_STATUS[status]);
    if (NEXT_STATUS[status] === "READY") {
      const order = store.orders.find((o) => o.id === orderId);
      if (order) {
        const allReady = order.stationTickets.every(
          (tk) => tk.id === ticketId ? true : tk.status === "READY",
        );
        void allReady;
      }
    }
  }

  function markUnavailable(orderId: string, ticketId: string) {
    if (!user) return;
    store.reportStationTicketUnavailable(orderId, ticketId, user.name, "Item unavailable at station");
  }

  function recordWastage(orderId: string, ticketId: string) {
    if (!user) {
      showError(t("Sign in to record wastage.", "ብክነት ለመመዝገብ ይግቡ።"));
      return;
    }
    const order = store.orders.find((row) => row.id === orderId);
    const ticket = order?.stationTickets.find((row) => row.id === ticketId);
    const label = ticket
      ? `${order?.orderNo ?? ""} · ${ticket.items.map((item) => item.name).join(", ")}`
      : orderId;
    if (
      !window.confirm(
        t(
          `Record wastage and cancel this ticket?\n${label}`,
          `ብክነት ይመዝገብ እና ይህ ትኬት ይሰረዝ?\n${label}`,
        ),
      )
    ) {
      return;
    }
    const result = store.recordStationTicketWastage(orderId, ticketId, user.name, "Station wastage");
    if (!result.ok) {
      showError(result.error || t("Could not record wastage.", "ብክነት ሊመዘገብ አልቻለም።"));
      return;
    }
    if (result.alreadyDeducted) {
      showSuccess(
        t(
          "Ticket cancelled. Stock was already deducted — counted as wastage.",
          "ትኬቱ ተሰርዟል። ክምችት አስቀድሞ ተቀንሶ ነበር — እንደ ብክነት ይቆጠራል።",
        ),
      );
      return;
    }
    if ((result.wasteEntryCount ?? 0) > 0) {
      showSuccess(t("Wastage recorded and ticket cancelled.", "ብክነት ተመዝግቧል እና ትኬቱ ተሰርዟል።"));
      return;
    }
    showSuccess(
      t(
        "Ticket cancelled. No linked stock item found to write off.",
        "ትኬቱ ተሰርዟል። ለመቀነስ የተገናኘ የክምችት እቃ አልተገኘም።",
      ),
    );
  }

  function requestVoid(orderId: string) {
    if (!user) return;
    store.requestVoidOrder(orderId, user.name, "Requested from KDS shortage");
  }

  function openStationRestock(currentStation: ProductionStation) {
    const dept = stationToOperationalLocation(currentStation) || "Kitchen";
    const low = stockModule.balances.filter(
      (row) => row.location === dept && row.quantity <= row.reorderLevel,
    );
    setRestockStation(currentStation);
    setRestockItemId(low[0]?.itemId || stockModule.items[0]?.id || "");
    setRestockQty(Math.max(1, low[0] ? suggestDepartmentRestockQuantity(low[0]) : 1));
  }

  function submitStationRestock() {
    if (!user || !restockStation || !restockItemId || !(restockQty > 0)) return;
    const item = stockModule.items.find((row) => row.id === restockItemId);
    if (!item) return;
    const dept = (stationToOperationalLocation(restockStation) || "Kitchen") as OperationalStockLocation;
    const availableQuantityAtDepartment =
      stockModule.balances.find((row) => row.itemId === item.id && row.location === dept)?.availableQuantity
      ?? stockModule.balances.find((row) => row.itemId === item.id && row.location === dept)?.quantity
      ?? 0;
    const document = createDepartmentStockRequest({
      requestingDepartment: dept,
      requestedSourceStore: pickPreferredSourceStore(stockModule.balances, item.id),
      priority: availableQuantityAtDepartment <= 0 ? "Urgent" : "Normal",
      reason: "KDS station replenishment",
      requiredDate: new Date().toISOString().slice(0, 10),
      requestedBy: user.name,
      notes: `Requested from KDS ${restockStation}`,
      lines: [{
        itemId: item.id,
        itemName: item.name,
        availableQuantityAtDepartment,
        requestedQuantity: restockQty,
        unit: item.baseUnit as StockUnitType,
      }],
    });
    stockModule.saveRequest(toStockRequestRecord(document));
    setRestockStation(null);
  }

  return (
    <div className="flex flex-col gap-5">
      <PageHeader
        title={t("Station Tickets", "የጣቢያ ቲኬቶች")}
        action={
          <div className="flex flex-wrap items-center gap-2">
            <Link
              to="/app/kds-history"
              className="inline-flex items-center gap-2 min-h-9 px-3 rounded-xl border border-border bg-card text-sm font-semibold text-muted-foreground hover:bg-surface-2 hover:text-foreground transition-colors"
            >
              <Icons.History className="size-4" />
              {t("Order History", "የትዕዛዝ ታሪክ")}
            </Link>
            <Chip tone={newTicketCount > 0 ? "ember" : "muted"}>
              <span className={`size-1.5 rounded-full ${newTicketCount > 0 ? "bg-ember animate-pulse" : "bg-muted-foreground/40"}`} />
              {newTicketCount} {t("new", "አዲስ")}
            </Chip>
            <Chip tone={activeTicketCount > 0 ? "gold" : "muted"}>
              {activeTicketCount} {t("active", "ንቁ")}
            </Chip>
            <Chip tone={readyTicketCount > 0 ? "teff" : "muted"}>
              {readyTicketCount} {t("ready", "ዝግጁ")}
            </Chip>
          </div>
        }
      />

      {/* Alert banner */}
      {newTicketCount > 0 && (
        <div className="flex items-start gap-3 rounded-xl border border-ember/30 bg-ember/10 px-4 py-3 text-sm">
          <Icons.BellRing className="mt-0.5 size-4 shrink-0 text-ember" />
          <div>
            <div className="font-semibold">{t("New station order received", "አዲስ የጣቢያ ትዕዛዝ ደርሷል")}</div>
          </div>
        </div>
      )}

      {/* Station filter tabs — hidden when user has only one station */}
      {showStationTabs && (
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 md:flex md:flex-wrap">
          {tabOptions.map((option) => {
          const Icon =
            option === "All"
              ? Icons.ListChecks
              : ((Icons as unknown as Record<string, ComponentType<{ className?: string }>>)[
                  stationIconName(option)
                ] ?? Icons.Circle);
          const isActive = station === option;
          return (
            <button
              key={option}
              onClick={() => setStation(option as "All" | ProductionStation)}
              className={`inline-flex min-h-10 flex-1 items-center justify-center gap-2 rounded-xl px-4 text-sm font-semibold transition-all ${
                isActive
                  ? "bg-foreground text-background shadow-sm"
                  : "border border-border bg-card text-muted-foreground hover:bg-surface-2 hover:text-foreground"
              }`}
            >
              <Icon className="size-4 shrink-0" />
              <span className="truncate">{option === "All" ? t("All", "ሁሉም") : option}</span>
              {option !== "All" && newCountByStation[option as ProductionStation] > 0 && (
                <span className="ml-0.5 grid h-5 min-w-5 place-items-center rounded-full bg-ember px-1 text-[10px] font-bold text-ember-foreground">
                  {newCountByStation[option as ProductionStation]}
                </span>
              )}
            </button>
          );
        })}
        </div>
      )}

      {/* Station columns */}
      <div className="flex flex-wrap gap-4 items-start overflow-x-auto pb-2 pl-1">
        {stations.map((currentStation) => (
          <StationColumn
            key={currentStation}
            currentStation={currentStation}
            activeOrders={activeOrders}
            onAdvance={advance}
            onMarkUnavailable={markUnavailable}
            onRecordWastage={recordWastage}
            onRequestVoid={requestVoid}
            onRequestStock={openStationRestock}
          />
        ))}
      </div>

      {restockStation && (
        <div className="fixed inset-0 z-50 bg-foreground/40 backdrop-blur-sm grid place-items-center p-4">
          <div className="surface-card max-w-md w-full !p-5 space-y-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h3 className="font-display text-lg font-semibold">{t("Request stock", "ክምችት ጠይቅ")}</h3>
                <p className="text-xs text-muted-foreground mt-0.5">{restockStation} · {department}</p>
              </div>
              <button type="button" onClick={() => setRestockStation(null)} className="size-8 grid place-items-center rounded-lg hover:bg-surface-2">
                <Icons.X className="size-4" />
              </button>
            </div>
            <div>
              <label className="text-xs text-muted-foreground">{t("Item", "እቃ")}</label>
              <select
                value={restockItemId}
                onChange={(event) => {
                  setRestockItemId(event.target.value);
                  const bal = stockModule.balances.find(
                    (row) => row.itemId === event.target.value && row.location === department,
                  );
                  if (bal) setRestockQty(Math.max(1, suggestDepartmentRestockQuantity(bal)));
                }}
                className="w-full mt-1 h-11 px-3 rounded-lg border border-border bg-card text-sm"
              >
                {(departmentLowStock.length > 0 ? departmentLowStock : stockModule.balances.filter((row) => row.location === department)).map((row) => (
                  <option key={`${row.itemId}-${row.location}`} value={row.itemId}>
                    {row.itemName} ({row.availableQuantity ?? row.quantity} {row.unit})
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-xs text-muted-foreground">{t("Requested quantity", "የተጠየቀ ብዛት")}</label>
              <input
                type="number"
                min={1}
                value={restockQty}
                onChange={(event) => setRestockQty(Number(event.target.value))}
                className="w-full mt-1 h-11 px-3 rounded-lg border border-border bg-card text-sm font-mono"
              />
            </div>
            <div className="flex gap-2">
              <button type="button" onClick={() => setRestockStation(null)} className="flex-1 h-11 rounded-lg border border-border text-sm hover:bg-surface-2">{t("Cancel", "ሰርዝ")}</button>
              <button type="button" onClick={submitStationRestock} className="flex-1 h-11 rounded-lg bg-ember text-ember-foreground text-sm font-semibold">{t("Submit request", "ጥያቄ ላክ")}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
