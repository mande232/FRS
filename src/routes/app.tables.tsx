import { createFileRoute, Link } from "@tanstack/react-router";
import { memo, useEffect, useMemo, useState } from "react";
import * as Icons from "lucide-react";
import { ReceiptDialog, type ReceiptView } from "@/components/order-bill-dialogs";
import { PageHeader, Chip, Stat } from "@/components/ui-kit";
import { RealtimeBadge } from "@/components/realtime-badge";
import { SEATING_AREAS, type Order, type MenuItem, type SeatingArea, type Table } from "@/lib/demo-data";
import { formatETB } from "@/lib/ethiopic";
import { useAuth } from "@/lib/auth-context";
import { orderLineName, useT } from "@/lib/i18n";
import { useLang } from "@/lib/lang-context";
import { canAddItemsToOrder, canCloseOrderToClearTable, canGenerateReceipt, hasLiveBillBlockingSeat, isOrderCompleted, stillOccupiesTable } from "@/lib/orders-ops";
import { useStore } from "@/lib/store";
import { showError, showSuccess } from "@/lib/toast";
import { assignedWaiterMatches, canonicalWaiterName, waiterCanAccessAssignedTable } from "@/lib/waiter-identity";

export const Route = createFileRoute("/app/tables")({ component: TablesPage });

const STATUSES: Table["status"][] = ["Available", "Occupied", "Reserved", "Bill", "Cleaning"];
const UNASSIGNED_WAITER = "Unassigned";

type WaiterOption = { id: string; name: string; email?: string };

type TableView = Table & {
  activeOrder?: Order;
  tableOrders: Order[];
  displayStatus: string;
  isVirtual?: boolean;
};

function namesMatch(left?: string | null, right?: string | null) {
  return (left ?? "").trim().toLowerCase() === (right ?? "").trim().toLowerCase();
}

const EMPTY_POS_SEARCH = {
  table: undefined as string | undefined,
  area: undefined as string | undefined,
  waiter: undefined as string | undefined,
  orderId: undefined as string | undefined,
  mode: undefined as "create" | "add" | undefined,
};

function tableCreatePosSearch(table: TableView) {
  const waiter =
    table.server?.trim() ||
    table.activeOrder?.waiter?.trim() ||
    table.activeOrder?.orderedByWaiter?.trim() ||
    undefined;
  return {
    table: table.label,
    area: table.area,
    mode: "create" as const,
    orderId: undefined,
    waiter,
  };
}

function tableAddPosSearch(order: Order) {
  return {
    table: order.tableNumber,
    area: order.area,
    mode: "add" as const,
    orderId: order.id,
    waiter: order.waiter?.trim() || undefined,
  };
}

function tableOpenPosSearch(order: Order) {
  return {
    table: order.tableNumber,
    area: order.area,
    mode: undefined as "create" | "add" | undefined,
    orderId: order.id,
    waiter: order.waiter?.trim() || undefined,
  };
}

const STATUS_TONE: Record<string, "teff" | "ember" | "gold" | "muted" | "destructive"> = {
  Available: "teff",
  Seated: "ember",
  "Waiting cashier": "gold",
  "Order sent": "ember",
  "Partly ready": "gold",
  "Ready to serve": "teff",
  "Bill printed": "gold",
  Paid: "teff",
  Reserved: "muted",
  Cleaning: "muted",
};

function tableStatusLabel(status: string, t: (key: string, fallback?: string) => string) {
  switch (status) {
    case "Available":
      return t("Available", "??");
    case "Occupied":
      return t("Occupied", "????");
    case "Reserved":
      return t("Reserved", "????");
    case "Bill":
      return t("Bill", "??? ?????");
    case "Cleaning":
      return t("Cleaning", "???");
    case "Seated":
      return t("Seated", "?????");
    case "Waiting cashier":
      return t("Waiting cashier", "???? ?????");
    case "Order sent":
      return t("Order sent", "???? ????");
    case "Partly ready":
      return t("Partly ready", "???? ???");
    case "Ready to serve":
      return t("Ready to serve", "????? ???");
    case "Bill printed":
      return t("Bill printed", "ሂሳብ ታትሟል");
    case "Paid":
      return t("Paid — clear table", "ተከፍሏል — ጠረጴዛ አፅዳ");
    default:
      return status;
  }
}

function orderStatusLabel(status: string, t: (key: string, fallback?: string) => string) {
  if (status === "PENDING_CASHIER") return t("Waiting cashier", "???? ?????");
  if (status === "NEW") return t("New", "???");
  if (status === "PARTIALLY READY") return t("Partially ready", "???? ???");
  if (status === "READY TO SERVE") return t("Ready to serve", "????? ???");
  if (status === "RECEIPT_GENERATED") return t("Receipt generated", "???? ?????");
  if (status === "CLOSED") return t("Closed", "ተዘግቷል");
  if (status === "CANCELLED") return t("Cancelled", "ተሰርዟል");
  if (status === "RETURNED") return t("Returned", "ተመልሷል");
  return status;
}

function TablesPage() {
  const store = useStore();
  const { user, users } = useAuth();
  const t = useT();
  const [area, setArea] = useState("All");
  const [selected, setSelected] = useState<TableView | null>(null);
  const [showWalkIn, setShowWalkIn] = useState(false);
  const [showAddTable, setShowAddTable] = useState(false);
  const isWaiter = user?.role === "Waiter";
  const waiterName = user?.name?.trim() ?? "";
  const canManageTables =
    user?.role === "Cashier" ||
    user?.role === "Branch Manager" ||
    user?.role === "Administrator" ||
    user?.role === "Supervisor";
  const canManageBills = canManageTables;
  const [waiterFilter, setWaiterFilter] = useState("All");
  const [showAssignTables, setShowAssignTables] = useState(false);
  const [receiptView, setReceiptView] = useState<ReceiptView | null>(null);
  const areaFilters = useMemo(
    () => (store.tableAreas.length > 1 ? store.tableAreas : ["All"]),
    [store.tableAreas],
  );
  const waiters = useMemo<WaiterOption[]>(
    () =>
      users
        .filter((systemUser) => systemUser.role === "Waiter")
        .map((systemUser) => ({
          id: systemUser.id,
          name: systemUser.name,
          email: systemUser.email,
        }))
        .sort((a, b) => a.name.localeCompare(b.name)),
    [users],
  );

  const floorOccupancyOrders = useMemo(
    () => store.orders.filter((order) => stillOccupiesTable(order)),
    [store.orders],
  );
  const occupyingBySeat = useMemo(() => {
    const map = new Map<string, Order[]>();
    for (const order of floorOccupancyOrders) {
      const key = `${order.area.trim().toLowerCase()}::${order.tableNumber.trim().toLowerCase()}`;
      const list = map.get(key);
      if (list) list.push(order);
      else map.set(key, [order]);
    }
    return map;
  }, [floorOccupancyOrders]);
  const tableViews = useMemo(
    () => buildTableViews(store.tables, floorOccupancyOrders),
    [store.tables, floorOccupancyOrders],
  );
  const filtered = useMemo(() => {
    let rows = area === "All" ? tableViews : tableViews.filter((table) => table.area === area);
    if (isWaiter && user) {
      const account = waiters.find((waiter) => waiter.id === user.id) ?? {
        name: user.name,
        email: user.email,
      };
      const identity = { name: user.name, email: user.email ?? account.email };
      rows = rows.filter((table) =>
        waiterCanAccessAssignedTable(identity, table, floorOccupancyOrders),
      );
    } else if (waiterFilter !== "All") {
      if (waiterFilter === UNASSIGNED_WAITER) {
        rows = rows.filter((table) => !(table.activeOrder?.waiter || table.server));
      } else {
        const selectedWaiter = waiters.find((waiter) => waiter.name === waiterFilter);
        rows = rows.filter(
          (table) =>
            assignedWaiterMatches(table.server, selectedWaiter ?? waiterFilter) ||
            assignedWaiterMatches(table.activeOrder?.waiter, selectedWaiter ?? waiterFilter),
        );
      }
    }
    return rows;
  }, [area, floorOccupancyOrders, tableViews, waiterFilter, isWaiter, user, waiters]);

  const displayCounts = useMemo(() => {
    const source = isWaiter ? filtered : tableViews;
    return {
      available: source.filter((table) => table.displayStatus === "Available").length,
      seated: source.filter(
        (table) =>
          table.displayStatus === "Seated" ||
          table.displayStatus === "Waiting cashier" ||
          table.displayStatus === "Order sent" ||
          table.displayStatus === "Partly ready" ||
          table.displayStatus === "Ready to serve",
      ).length,
      bill: source.filter((table) => table.displayStatus === "Bill printed" || table.displayStatus === "Paid").length,
      cleaning: source.filter((table) => table.displayStatus === "Cleaning").length,
    };
  }, [filtered, isWaiter, tableViews]);

  useEffect(() => {
    if (!areaFilters.includes(area)) setArea("All");
  }, [area, areaFilters]);

  useEffect(() => {
    setSelected((current) => {
      if (!current) return null;
      return tableViews.find((row) => row.id === current.id) ?? null;
    });
  }, [tableViews]);

  function closeTableModal() {
    setSelected(null);
  }

  function generateOrShowReceipt(order: Order) {
    if (order.receipt) {
      setReceiptView({ order, receipt: order.receipt });
      return;
    }
    if (!canGenerateReceipt(order)) {
      showError(
        t(
          "Order is not ready for a customer receipt yet.",
          "ትዕዛዙ ለደንበኛ ደረሰኝ ገና ዝግጁ አይደለም።",
        ),
      );
      return;
    }
    const generated = store.generateReceipt(order.id, {
      generatedBy: user?.name ?? t("Waiter", "አስተናጋጅ"),
    });
    if (!generated) {
      showError(t("Could not generate receipt.", "ደረሰኝ መፍጠር አልተቻለም።"));
      return;
    }
    const nextOrder: Order = {
      ...order,
      status: "RECEIPT_GENERATED",
      paymentStatus: "Unpaid",
      receipt: generated,
      receiptNumber: generated.receiptNumber,
      receiptGeneratedAt: generated.generatedAt,
      receiptGeneratedBy: generated.generatedBy,
      lockedForEditing: true,
      total: generated.grandTotal,
    };
    setReceiptView({ order: nextOrder, receipt: generated });
    showSuccess(t("Customer receipt ready.", "የደንበኛ ደረሰኝ ዝግጁ ነው።"));
  }

  const counts = displayCounts;

  function addTable(table: Table) {
    if (!canManageTables) return;
    const label = table.label.trim();
    const area = table.area.trim().toLowerCase();
    const duplicate = store.tables.some(
      (existing) =>
        existing.area.trim().toLowerCase() === area &&
        existing.label.trim().toLowerCase() === label.toLowerCase(),
    );
    if (duplicate) {
      showError(
        t("Table number already exists", "የጠረጴዛ ቁጥር አስቀድሞ አለ") +
          `: ${table.area} ${label}`,
      );
      return;
    }
    store.addTable(table);
    setShowAddTable(false);
  }

  function occupyingOrdersForSeat(table: Pick<Table, "area" | "label">) {
    return (
      occupyingBySeat.get(`${table.area.trim().toLowerCase()}::${table.label.trim().toLowerCase()}`) ??
      []
    );
  }

  function markAvailable(table: Table) {
    if (!canManageTables) return;
    // Same path as Clear table: stamp tableClearedAt so waiter remove/reassign works.
    const result = store.clearCompletedTable(table.id, user?.name);
    if (!result.ok) {
      showError(result.error ?? t("Could not clear this table.", "ይህን ጠረጴዛ ማፅዳት አልተቻለም።"));
      return;
    }
    setSelected(null);
    showSuccess(
      t(
        "Table marked available. Waiter assignment kept.",
        "ጠረጴዛው ይገኛል ተብሏል። የአስተናጋጅ ምደባ ተጠብቋል።",
      ),
    );
  }

  function closeCompletedTable(table: TableView) {
    const occupying = occupyingOrdersForSeat(table);
    if (!canCloseOrderToClearTable(occupying.length ? occupying : table.tableOrders, table.status)) {
      showError(t("This table is already available.", "ይህ ጠረጴዛ አስቀድሞ ይገኛል።"));
      return;
    }
    const result = store.clearCompletedTable(table.id, user?.name);
    if (!result.ok) {
      showError(result.error ?? t("Could not clear this table.", "ይህን ጠረጴዛ ማፅዳት አልተቻለም።"));
      return;
    }
    setSelected(null);
    showSuccess(
      t(
        "Table cleared. Waiter stays assigned — they can take a new order here.",
        "ጠረጴዛው ተፀዳ። አስተናጋጁ ተመድቦ ይቆያል — እዚህ አዲስ ትዕዛዝ መውሰድ ይችላሉ።",
      ),
    );
  }

  function assignTablesToWaiter(waiterName: string, tableIds: string[], clearOthers: boolean) {
    if (!canManageTables) return;
    const assignedName =
      waiterName === UNASSIGNED_WAITER ? undefined : canonicalWaiterName(waiterName, waiters) || undefined;
    const result = store.assignTablesToWaiter(assignedName, tableIds, clearOthers);
    if (!result.ok) {
      showError(result.error);
      return;
    }
    setShowAssignTables(false);
    showSuccess(
      t("Table assignment saved.", "የጠረጴዛ ምደባ ተቀምጧል።"),
    );
  }

  function updateTable(updated: Table) {
    if (!canManageTables) return;
    const label = updated.label.trim();
    const area = updated.area.trim().toLowerCase();
    const duplicate = store.tables.some(
      (existing) =>
        existing.id !== updated.id &&
        existing.area.trim().toLowerCase() === area &&
        existing.label.trim().toLowerCase() === label.toLowerCase(),
    );
    if (duplicate) {
      showError(
        t("Table number already exists", "የጠረጴዛ ቁጥር አስቀድሞ አለ") +
          `: ${updated.area} ${label}`,
      );
      return;
    }
    const previous = store.tables.find((row) => row.id === updated.id);
    const prevServer = previous?.server?.trim() || "";
    const nextServer = updated.server?.trim() || "";
    if (prevServer && nextServer && !namesMatch(prevServer, nextServer)) {
      const hasOpenOrder = store.orders.some(
        (order) =>
          stillOccupiesTable(order) &&
          !isOrderCompleted(order) &&
          namesMatch(order.area, updated.area) &&
          namesMatch(order.tableNumber, updated.label),
      );
      if (hasOpenOrder) {
        showError(
          t(
            "This table has an open order for the current waiter. Clear the table before assigning another.",
            "ይህ ጠረጴዛ ለአሁኑ አስተናጋጅ ክፍት ትዕዛዝ አለው። ሌላ ከመመደብዎ በፊት ጠረጴዛውን ያፅዱ።",
          ),
        );
        return;
      }
    }
    if (!namesMatch(prevServer, nextServer)) {
      const hasOpenOrder = store.orders.some(
        (order) =>
          stillOccupiesTable(order) &&
          !isOrderCompleted(order) &&
          namesMatch(order.area, updated.area) &&
          namesMatch(order.tableNumber, updated.label),
      );
      if (hasOpenOrder) {
        showError(
          t(
            "Clear open orders on this table before changing waiter assignment.",
            "ከአስተናጋጅ ምደባ ለውጥ በፊት ክፍት ትዕዛዞችን ያፅዱ።",
          ),
        );
        return;
      }
    }
    store.updateTable({
      ...updated,
      server: nextServer
        ? canonicalWaiterName(nextServer, waiters) || nextServer
        : undefined,
    });
    setSelected(null);
  }

  function deleteTable(table: Table) {
    if (!canManageTables) return;
    if (!window.confirm(t("Delete table", "???? ???") + ` "${table.label}"?`)) return;
    store.removeTable(table.id);
    if (selected?.id === table.id) setSelected(null);
  }

  const availableTables = tableViews.filter(
    (table) => table.displayStatus === "Available" && !table.activeOrder && !table.isVirtual,
  );

  return (
    <div>
      <PageHeader
        title={t("Tables", "ጠረጴዛዎች")}
        action={
          <div className="flex flex-wrap items-center gap-2">
            <RealtimeBadge status={store.realtimeStatus} lastSyncAt={store.lastRealtimeSyncAt} />
            <Link
              to="/app/reservations"
              className="h-10 px-3 rounded-lg border border-border bg-card text-sm hover:bg-surface-2 inline-flex items-center gap-2"
            >
              <Icons.CalendarClock className="size-4" /> {t("Reservations", "?? ????")}
            </Link>
            <Link
              to="/app/digital-menu"
              className="h-10 px-3 rounded-lg border border-border bg-card text-sm hover:bg-surface-2 inline-flex items-center gap-2"
            >
              <Icons.QrCode className="size-4" /> {t("Digital Menu", "???? ??")}
            </Link>
            <Link
              to="/app/pos"
              search={EMPTY_POS_SEARCH}
              className="h-10 px-4 rounded-lg bg-ember text-ember-foreground text-sm font-medium inline-flex items-center gap-2"
            >
              <Icons.Plus className="size-4" /> {t("New POS order", "??? POS ????")}
            </Link>
            <Link
              to="/app/orders"
              className="h-10 px-4 rounded-lg border border-border bg-card text-sm font-medium inline-flex items-center gap-2 hover:bg-surface-2"
            >
              <Icons.ClipboardList className="size-4" /> {t("Orders", "?????")}
            </Link>
          </div>
        }
      />

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
        <Stat label={t("Available", "??")} value={`${counts.available}`} tone="teff" icon="CircleCheck" />
        <Stat label={t("Seated / Open", "????? / ???")} value={`${counts.seated}`} tone="ember" icon="Users" />
        <Stat label={t("Bill printed", "??? ????")} value={`${counts.bill}`} tone="gold" icon="Receipt" />
        <Stat label={t("Cleaning", "???")} value={`${counts.cleaning}`} icon="Sparkles" />
      </div>

      <div className="flex items-center justify-between gap-3 mb-5 flex-wrap">
        <div className="flex items-center gap-2 flex-wrap">
          {areaFilters.map((option) => (
            <button
              key={option}
              onClick={() => setArea(option)}
            className={`h-10 px-4 rounded-lg text-sm font-semibold transition-colors ${area === option ? "bg-foreground text-background" : "bg-card border border-border text-muted-foreground hover:text-foreground hover:bg-surface-2"}`}
            >
              {option}
            </button>
          ))}
          {!isWaiter && (
            <select
              value={waiterFilter}
              onChange={(event) => setWaiterFilter(event.target.value)}
              className="h-10 px-3 rounded-lg border border-border bg-card text-sm"
              title={t("Filter by waiter", "??????? ???")}
            >
              <option value="All">{t("All waiters", "??? ???????")}</option>
              <option value={UNASSIGNED_WAITER}>{t("Unassigned", "??????")}</option>
              {waiters.map((waiter) => (
                <option key={waiter.id} value={waiter.name}>
                  {waiter.name}
                </option>
              ))}
            </select>
          )}
        </div>
        {canManageTables && (
          <div className="flex items-center gap-2 flex-wrap">
            <button
              onClick={() => setShowAssignTables(true)}
              className="h-10 px-4 rounded-lg border border-border bg-card text-sm font-medium inline-flex items-center gap-2 hover:bg-surface-2"
            >
              <Icons.UserCheck className="size-4" /> {t("Assign tables", "??????? ???")}
            </button>
            <button
              onClick={() => setShowWalkIn(true)}
              className="h-10 px-4 rounded-lg border border-border bg-card text-sm font-medium inline-flex items-center gap-2 hover:bg-surface-2"
            >
              <Icons.UserPlus className="size-4" /> {t("Seat walk-in", "?? ?? ???? ???? ?????")}
            </button>
            <button
              onClick={() => setShowAddTable(true)}
              className="h-10 px-4 rounded-lg border border-border bg-card text-sm font-medium inline-flex items-center gap-2 hover:bg-surface-2"
            >
              <Icons.Table2 className="size-4" /> {t("Add table", "???? ???")}
            </button>
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
        {filtered.map((table) => (
          <TableCard
            key={`${table.area}-${table.label}`}
            table={table}
            occupyingOrders={occupyingOrdersForSeat(table)}
            menuItems={store.menuItems}
            isWaiter={isWaiter}
            canManageBills={canManageBills}
            canManageTables={canManageTables}
            onSelect={() => setSelected(table)}
            onDelete={() => deleteTable(table)}
            onMarkAvailable={() => markAvailable(table)}
            onCloseOrder={() => closeCompletedTable(table)}
            onGenerateReceipt={generateOrShowReceipt}
          />
        ))}
      </div>

      {filtered.length === 0 && (
        <div className="rounded-lg border-2 border-dashed border-border py-12 text-center text-sm text-muted-foreground space-y-3">
          <p>
            {isWaiter
              ? t(
                  "No tables assigned to you yet. Ask a cashier to open Assign tables, pick your waiter account, then select your seats.",
                  "እስካሁን የተመደበልዎ ጠረጴዛ የለም። ካሸር Assign tables ክፍት አድርጎ የእርስዎን የአስተናጋጅ መለያ መርጦ ጠረጴዛዎችን እንዲመርጥ ይጠይቁ።",
                )
              : t("No tables", "ጠረጴዛ የለም")}
          </p>
          {isWaiter && (waiterName || user?.email) ? (
            <p className="text-xs">
              {t("Signed in as", "የገቡበት ስም")}:{" "}
              <span className="font-medium text-foreground">{waiterName || user?.email}</span>
              {user?.email ? (
                <span className="text-muted-foreground"> ({user.email})</span>
              ) : null}
            </p>
          ) : null}
          {isWaiter ? (
            <Link
              to="/app/pos"
              search={{
                table: undefined,
                area: undefined,
                waiter: undefined,
                orderId: undefined,
                mode: undefined,
              }}
              className="inline-flex h-10 items-center gap-2 rounded-lg bg-ember px-4 text-sm font-semibold text-ember-foreground"
            >
              <Icons.Plus className="size-4" /> {t("Open POS", "POS ክፈት")}
            </Link>
          ) : null}
        </div>
      )}

      {selected && (
        <TableModal
          table={selected}
          occupyingOrders={occupyingOrdersForSeat(selected)}
          waiters={waiters}
          isWaiter={isWaiter}
          canManageBills={canManageBills}
          canManageTables={canManageTables}
          onClose={closeTableModal}
          onSave={updateTable}
          onDelete={() => deleteTable(selected)}
          onMarkAvailable={() => markAvailable(selected)}
          onCloseOrder={() => closeCompletedTable(selected)}
          onGenerateReceipt={generateOrShowReceipt}
        />
      )}

      {receiptView && <ReceiptDialog view={receiptView} onClose={() => setReceiptView(null)} />}

      {showWalkIn && canManageTables && (
        <WalkInModal
          tables={availableTables}
          waiters={waiters}
          onClose={() => setShowWalkIn(false)}
          onSave={(tableId, guests, waiter) => {
            const target = store.tables.find((table) => table.id === tableId);
            if (target)
              store.updateTable({
                ...target,
                status: "Occupied",
                guests,
                server: waiter,
                openMin: 0,
                total: 0,
              });
            setShowWalkIn(false);
          }}
        />
      )}

      {showAddTable && canManageTables && (
        <AddTableModal
          areas={areaFilters.filter((option) => option !== "All")}
          existingSeats={store.tables.map((table) => ({
            area: table.area,
            label: table.label,
          }))}
          onClose={() => setShowAddTable(false)}
          onSave={addTable}
        />
      )}

      {showAssignTables && canManageTables && (
        <AssignTablesModal
          tables={tableViews.filter((table) => !table.isVirtual)}
          waiters={waiters}
          areas={areaFilters}
          onClose={() => setShowAssignTables(false)}
          onSave={assignTablesToWaiter}
        />
      )}
    </div>
  );
}

function buildTableViews(tables: Table[], floorOrders: Order[]): TableView[] {
  const views = tables.map((table) => {
    const tableOrders = floorOrders.filter((order) => {
      if (!namesMatch(order.area, table.area) || !namesMatch(order.tableNumber, table.label)) {
        return false;
      }
      if (order.tableClearedAt) return false;
      // Cleared seats stay free even if the unpaid bill is still open for cashier.
      if (table.status === "Available") return false;
      return true;
    });
    const activeOrder = tableOrders.find((order) => !isOrderCompleted(order)) ?? tableOrders[0];
    return withDisplayStatus(table, activeOrder, false, tableOrders);
  });

  const missingOrderTables = floorOrders
    .filter(
      (order) =>
        !isOrderCompleted(order) &&
        !order.tableClearedAt &&
        !tables.some(
          (table) => namesMatch(table.area, order.area) && namesMatch(table.label, order.tableNumber),
        ),
    )
    .map((order) =>
      withDisplayStatus(
        {
          id: `order-${order.id}`,
          label: order.tableNumber,
          seats: 4,
          area: order.area,
          status: order.status === "RECEIPT_GENERATED" ? "Bill" : "Occupied",
          guests: undefined,
          server: order.waiter,
          openMin: order.openedMin,
          total: order.total,
        },
        order,
        true,
        [order],
      ),
    );

  return [...views, ...missingOrderTables].sort((a, b) => {
    const aRank = SEATING_AREAS.indexOf(a.area as SeatingArea);
    const bRank = SEATING_AREAS.indexOf(b.area as SeatingArea);
    if (aRank !== bRank) {
      if (aRank === -1) return 1;
      if (bRank === -1) return -1;
      return aRank - bRank;
    }
    if (a.area !== b.area) return a.area.localeCompare(b.area);
    return a.label.localeCompare(b.label, undefined, { numeric: true });
  });
}

function withDisplayStatus(
  table: Table,
  activeOrder?: Order,
  isVirtual = false,
  tableOrders: Order[] = activeOrder ? [activeOrder] : [],
): TableView {
  if (activeOrder) {
    if (isOrderCompleted(activeOrder))
      return { ...table, status: "Bill", activeOrder, tableOrders, displayStatus: "Paid", isVirtual };
    if (activeOrder.status === "RECEIPT_GENERATED")
      return { ...table, status: "Bill", activeOrder, tableOrders, displayStatus: "Bill printed", isVirtual };
    if (activeOrder.status === "PENDING_CASHIER")
      return {
        ...table,
        status: "Occupied",
        activeOrder,
        tableOrders,
        displayStatus: "Waiting cashier",
        isVirtual,
      };
    if (activeOrder.status === "READY TO SERVE")
      return {
        ...table,
        status: "Occupied",
        activeOrder,
        tableOrders,
        displayStatus: "Ready to serve",
        isVirtual,
      };
    if (activeOrder.status === "PARTIALLY READY")
      return {
        ...table,
        status: "Occupied",
        activeOrder,
        tableOrders,
        displayStatus: "Partly ready",
        isVirtual,
      };
    return { ...table, status: "Occupied", activeOrder, tableOrders, displayStatus: "Order sent", isVirtual };
  }
  if (table.status === "Occupied") return { ...table, tableOrders, displayStatus: "Seated", isVirtual };
  return { ...table, tableOrders, displayStatus: table.status, isVirtual };
}

const TableCard = memo(function TableCard({
  table,
  occupyingOrders,
  menuItems,
  isWaiter,
  canManageBills,
  canManageTables,
  onSelect,
  onDelete,
  onMarkAvailable,
  onCloseOrder,
  onGenerateReceipt,
}: {
  table: TableView;
  occupyingOrders: Order[];
  menuItems: readonly MenuItem[];
  isWaiter: boolean;
  canManageBills: boolean;
  canManageTables: boolean;
  onSelect: () => void;
  onDelete: () => void;
  onMarkAvailable: () => void;
  onCloseOrder: () => void;
  onGenerateReceipt: (order: Order) => void;
}) {
  const t = useT();
  const lang = useLang();
  const orders = table.tableOrders.length > 0 ? table.tableOrders : table.activeOrder ? [table.activeOrder] : [];
  const order = orders[0];
  const addableOrder = orders.find((row) => canAddItemsToOrder(row));
  const receiptOrder = orders.find((row) => row.receipt || canGenerateReceipt(row));
  const canAdd = Boolean(addableOrder);
  const canReceipt = Boolean(receiptOrder);
  const canClose = canCloseOrderToClearTable(
    occupyingOrders.length > 0 ? occupyingOrders : orders,
    table.status,
  );
  const previewItems = orders.flatMap((row) => row.items).slice(0, 4);
  const extraItems = Math.max(0, orders.reduce((sum, row) => sum + row.items.length, 0) - previewItems.length);
  const tableTotal = orders.reduce((sum, row) => sum + (row.receipt?.grandTotal ?? row.total), 0);
  const readyStations =
    order?.stationTickets.filter((ticket) => ticket.status === "READY").length ?? 0;
  const totalStations = order?.stationTickets.length ?? 0;
  const tone = STATUS_TONE[table.displayStatus] ?? "muted";
  // Waiters: one open bill per table — after the first order, only Add items.
  const canCreate =
    orders.length === 0 &&
    table.status !== "Cleaning" &&
    table.status !== "Reserved";
  const borderClass =
    table.displayStatus === "Available"
      ? "border-teff/30 bg-teff/5"
      : table.displayStatus === "Paid"
        ? "border-teff/40 bg-teff/10"
        : table.displayStatus === "Bill printed"
          ? "border-gold/50 bg-gold/10"
          : table.displayStatus === "Cleaning"
            ? "border-border bg-card opacity-80"
            : table.displayStatus === "Reserved"
              ? "border-foreground/20 bg-surface-2"
              : "border-ember/40 bg-ember/5";

  return (
    <div
      onClick={onSelect}
      className={`rounded-lg border-2 p-4 ${borderClass} hover:shadow-[var(--shadow-soft)] hover:-translate-y-0.5 transition-all cursor-pointer`}
    >
      <div className="flex items-start justify-between gap-2">
        <div>
          <div className="font-display text-2xl font-semibold leading-tight">{table.label}</div>
          <div className="text-xs text-muted-foreground">
            {table.area} - {table.seats} {t("seats", "መቀመጫ")}
          </div>
        </div>
        <div className="flex flex-col items-end gap-1">
          <Chip tone={tone}>{tableStatusLabel(table.displayStatus, t)}</Chip>
          {orders.length > 1 ? (
            <span className="text-[11px] font-medium text-muted-foreground">
              {orders.length} {t("orders", "ትዕዛዞች")}
            </span>
          ) : null}
        </div>
      </div>

      {orders.length > 0 ? (
        <div className="mt-4 space-y-2 text-xs">
          {orders.slice(0, 2).map((row) => (
            <div key={row.id} className="flex justify-between gap-3">
              <span className="font-mono text-muted-foreground">{row.orderNo}</span>
              <span>{orderStatusLabel(row.status, t)}</span>
            </div>
          ))}
          {orders.length > 2 ? (
            <div className="text-muted-foreground">
              +{orders.length - 2} {t("more orders", "ተጨማሪ ትዕዛዞች")}
            </div>
          ) : null}
          {previewItems.length > 0 ? (
            <div className="space-y-1 rounded-lg border border-border/70 bg-card/70 px-2.5 py-2">
              {previewItems.map((item, index) => (
                <div
                  key={`${item.menuItemId ?? item.name}-${index}`}
                  className="flex justify-between gap-2"
                >
                  <span className="min-w-0 truncate">{orderLineName(item, menuItems, lang)}</span>
                  <span className="shrink-0 font-mono">×{item.qty}</span>
                </div>
              ))}
              {extraItems > 0 ? (
                <div className="text-muted-foreground">+{extraItems} {t("more items", "ተጨማሪ እቃዎች")}</div>
              ) : null}
            </div>
          ) : null}
          <div className="flex justify-between gap-3 font-semibold">
            <span className="text-muted-foreground">{t("Total", "ጠቅላላ")}</span>
            <span className="font-mono">{formatETB(tableTotal)}</span>
          </div>
          {!isWaiter && order ? (
            <>
              <div className="flex justify-between gap-3">
                <span className="text-muted-foreground">{t("Waiter", "አስተናጋጅ")}</span>
                <span>{order.waiter}</span>
              </div>
              <div className="flex justify-between gap-3">
                <span className="text-muted-foreground">{t("Stations", "ጣቢያዎች")}</span>
                <span>
                  {readyStations}/{totalStations} {t("ready", "ዝግጁ")}
                </span>
              </div>
            </>
          ) : null}
        </div>
      ) : (
        <div className="mt-4 space-y-2 text-xs">
          {(table.server || table.status === "Occupied") && (
            <div className="flex justify-between">
              <span className="text-muted-foreground">{t("Waiter", "አስተናጋጅ")}</span>
              <span>{table.server || t("Unassigned", "ያልተመደበ")}</span>
            </div>
          )}
          {table.status === "Occupied" && (
            <>
              {table.guests !== undefined && (
                <div className="flex justify-between">
                  <span className="text-muted-foreground">{t("Guests", "እንግዶች")}</span>
                  <span>{table.guests}</span>
                </div>
              )}
              <div className="text-muted-foreground">
                {isWaiter
                  ? t("Tap for details, or create an order.", "ዝርዝር ለማየት ይጫኑ፣ ወይም ትዕዛዝ ይፍጠሩ።")
                  : t("Waiting for cashier order entry.", "የካሸር ትዕዛዝ ግቤት እየተጠበቀ")}
              </div>
            </>
          )}
          {table.status === "Reserved" && (
            <div className="text-muted-foreground">{t("Reserved table.", "የተያዘ ጠረጴዛ።")}</div>
          )}
          {table.status === "Cleaning" && (
            <div className="text-muted-foreground">
              {t("Needs cleaning before the next guest.", "ከሚቀጥለው እንግዳ በፊት ማጽዳት ያስፈልጋል።")}
            </div>
          )}
          {table.status === "Available" && (
            <div className="text-muted-foreground">
              {table.server
                ? t("Assigned — ready for seating.", "ተመድቧል — ለመቀመጥ ዝግጁ።")
                : t("Ready for seating.", "ለመቀመጥ ዝግጁ።")}
            </div>
          )}
        </div>
      )}

      <div className="mt-4 flex flex-wrap items-center gap-2" onClick={(event) => event.stopPropagation()}>
        {isWaiter ? (
          <>
            {canCreate ? (
              <Link
                to="/app/pos"
                search={tableCreatePosSearch(table)}
                className="flex-1 min-w-[7.5rem] h-9 rounded-lg bg-ember text-ember-foreground text-xs font-semibold inline-flex items-center justify-center gap-1.5"
              >
                <Icons.Plus className="size-3.5" /> {t("Create order", "ትዕዛዝ ፍጠር")}
              </Link>
            ) : null}
            {orders.length > 0 ? (
              canAdd && addableOrder ? (
                <Link
                  to="/app/pos"
                  search={tableAddPosSearch(addableOrder)}
                  className="flex-1 min-w-[7.5rem] h-9 rounded-lg border border-ember/40 bg-ember/10 text-ember text-xs font-semibold inline-flex items-center justify-center gap-1.5"
                >
                  <Icons.UtensilsCrossed className="size-3.5" /> {t("Add items", "እቃዎች አክል")}
                </Link>
              ) : (
                <span
                  className="flex-1 min-w-[7.5rem] h-9 rounded-lg border border-border bg-card text-xs font-medium text-muted-foreground inline-flex items-center justify-center gap-1.5"
                  title={t("Bill is locked for adding items", "ለእቃ መጨመር ሂሳቡ ተቆልፏል")}
                >
                  <Icons.UtensilsCrossed className="size-3.5" /> {t("Add items", "እቃዎች አክል")}
                </span>
              )
            ) : null}
            {orders.length > 0 ? (
              <button
                type="button"
                onClick={() => (receiptOrder ? onGenerateReceipt(receiptOrder) : onSelect())}
                disabled={!canReceipt}
                className="flex-1 min-w-[7.5rem] h-9 rounded-lg bg-foreground text-background text-xs font-semibold inline-flex items-center justify-center gap-1.5 disabled:opacity-50"
              >
                <Icons.Receipt className="size-3.5" />
                {receiptOrder?.receipt
                  ? t("Show receipt", "ደረሰኝ አሳይ")
                  : t("Generate receipt", "ደረሰኝ ፍጠር")}
              </button>
            ) : null}
            {canClose ? (
              <button
                type="button"
                onClick={onCloseOrder}
                className="flex-1 min-w-[7.5rem] h-9 rounded-lg bg-teff text-teff-foreground text-xs font-semibold inline-flex items-center justify-center gap-1.5"
              >
                <Icons.CheckCircle2 className="size-3.5" /> {t("Clear table", "ጠረጴዛ አፅዳ")}
              </button>
            ) : null}
            <button
              type="button"
              onClick={onSelect}
              className="h-9 px-3 rounded-lg border border-border bg-card text-xs font-medium inline-flex items-center justify-center hover:bg-surface-2"
            >
              {t("Details", "ዝርዝር")}
            </button>
          </>
        ) : order ? (
          <>
            {canManageBills && (
              <Link
                to="/app/pos"
                search={tableOpenPosSearch(order)}
                className="flex-1 h-9 rounded-lg bg-foreground text-background text-xs font-semibold inline-flex items-center justify-center gap-1.5"
              >
                <Icons.Wallet className="size-3.5" />{" "}
                {order.receipt ? t("Take payment", "ክፍያ ፈጽም") : t("Open bill", "ሂሳብ ክፈት")}
              </Link>
            )}
            {canClose ? (
              <button
                type="button"
                onClick={onCloseOrder}
                className="h-9 px-3 rounded-lg bg-teff text-teff-foreground text-xs font-semibold inline-flex items-center justify-center gap-1.5"
              >
                <Icons.CheckCircle2 className="size-3.5" /> {t("Clear table", "ጠረጴዛ አፅዳ")}
              </button>
            ) : null}
            <Link
              to="/app/orders"
              className="h-9 px-3 rounded-lg border border-border bg-card text-xs font-medium inline-flex items-center justify-center hover:bg-surface-2"
            >
              {canManageBills ? t("Orders", "ትዕዛዞች") : t("View status", "ሁኔታ ይመልከቱ")}
            </Link>
          </>
        ) : table.status === "Cleaning" ? (
          canManageTables ? (
            <button
              onClick={onMarkAvailable}
              className="flex-1 h-9 rounded-lg bg-teff text-teff-foreground text-xs font-semibold inline-flex items-center justify-center gap-1.5"
            >
              <Icons.CheckCircle2 className="size-3.5" /> {t("Mark available", "ይገኛል አድርግ")}
            </button>
          ) : (
            <span className="flex-1 h-9 rounded-lg border border-border bg-card text-xs font-medium text-muted-foreground inline-flex items-center justify-center">
              {t("Cleaning", "ማጽዳት")}
            </span>
          )
        ) : (
          <Link
            to="/app/pos"
            search={tableCreatePosSearch(table)}
            className="flex-1 h-9 rounded-lg bg-ember text-ember-foreground text-xs font-semibold inline-flex items-center justify-center gap-1.5"
          >
            <Icons.Plus className="size-3.5" /> {t("Create order", "ትዕዛዝ ፍጠር")}
          </Link>
        )}

        {canManageTables && !order && !table.isVirtual && (
          <button
            onClick={onDelete}
            className="size-9 grid place-items-center rounded-lg border border-border hover:bg-destructive/10 hover:text-destructive"
            title={t("Delete table", "ጠረጴዛ ሰርዝ")}
          >
            <Icons.Trash2 className="size-3.5" />
          </button>
        )}
      </div>
    </div>
  );
});


function WaiterTableSheet({
  table,
  occupyingOrders,
  onClose,
  onCloseOrder,
  onGenerateReceipt,
}: {
  table: TableView;
  occupyingOrders: Order[];
  onClose: () => void;
  onCloseOrder: () => void;
  onGenerateReceipt: (order: Order) => void;
}) {
  const t = useT();
  const lang = useLang();
  const store = useStore();
  const orders = table.tableOrders.length > 0 ? table.tableOrders : table.activeOrder ? [table.activeOrder] : [];
  const tableTotal = orders.reduce((sum, row) => sum + (row.receipt?.grandTotal ?? row.total), 0);
  const canCreate =
    orders.length === 0 &&
    table.status !== "Cleaning" &&
    table.status !== "Reserved";
  const canClose = canCloseOrderToClearTable(
    occupyingOrders.length > 0 ? occupyingOrders : orders,
    table.status,
  );
  const itemCount = orders.reduce((sum, row) => sum + row.items.length, 0);

  return (
    <div
      className="fixed inset-0 z-50 bg-foreground/40 backdrop-blur-sm grid place-items-center p-4"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div
        className="surface-card max-w-xl w-full !p-6 max-h-[90vh] overflow-y-auto"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3 mb-4">
          <div>
            <h3 className="font-display text-xl font-semibold">{table.label}</h3>
            <div className="text-sm text-muted-foreground">
              {table.area} · {tableStatusLabel(table.displayStatus, t)}
            </div>
          </div>
          <button
            type="button"
            onClick={(event) => {
              event.preventDefault();
              event.stopPropagation();
              onClose();
            }}
            className="size-11 grid place-items-center rounded-lg hover:bg-surface-2"
            aria-label={t("Close", "ዝጋ")}
          >
            <Icons.X className="size-4" />
          </button>
        </div>

        {orders.length > 0 ? (
          <div className="mb-4 grid grid-cols-3 gap-2 rounded-xl border border-border bg-surface-2 p-3 text-sm">
            <div>
              <div className="text-[11px] text-muted-foreground">{t("Orders", "ትዕዛዞች")}</div>
              <div className="font-semibold">{orders.length}</div>
            </div>
            <div>
              <div className="text-[11px] text-muted-foreground">{t("Items", "እቃዎች")}</div>
              <div className="font-semibold">{itemCount}</div>
            </div>
            <div>
              <div className="text-[11px] text-muted-foreground">{t("Table total", "የጠረጴዛ ጠቅላላ")}</div>
              <div className="font-mono font-semibold">{formatETB(tableTotal)}</div>
            </div>
          </div>
        ) : (
          <div className="mb-4 rounded-xl border border-dashed border-border bg-surface-2 px-4 py-6 text-center text-sm text-muted-foreground">
            {t("No open orders on this table yet.", "በዚህ ጠረጴዛ እስካሁን ክፍት ትዕዛዝ የለም።")}
          </div>
        )}

        <div className="space-y-4">
          {orders.map((row) => {
            const canAdd = canAddItemsToOrder(row);
            const canReceipt = Boolean(row.receipt || canGenerateReceipt(row));
            return (
              <div key={row.id} className="space-y-3 rounded-xl border border-border p-3">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <div className="font-mono text-sm font-semibold">{row.orderNo}</div>
                    <div className="text-xs text-muted-foreground">
                      {orderStatusLabel(row.status, t)} · {row.paymentStatus === "Unpaid"
                        ? t("Unpaid", "ያልተከፈለ")
                        : row.paymentStatus === "Partially Paid"
                          ? t("Partially paid", "በከፊል የተከፈለ")
                          : t("Paid", "ተከፍሏል")}
                    </div>
                  </div>
                  <div className="font-mono text-sm font-semibold">
                    {formatETB(row.receipt?.grandTotal ?? row.total)}
                  </div>
                </div>
                {row.receipt ? (
                  <div className="text-xs text-muted-foreground">
                    {t("Receipt", "ደረሰኝ")} · <span className="font-mono">{row.receipt.receiptNumber}</span>
                  </div>
                ) : null}

                <div>
                  <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    {t("Ordered items", "የታዘዙ እቃዎች")}
                  </div>
                  <div className="space-y-1.5">
                    {row.items.map((item, index) => (
                      <div
                        key={`${row.id}-${item.menuItemId ?? item.name}-${index}`}
                        className="flex items-start justify-between gap-3 rounded-lg border border-border bg-card px-3 py-2 text-sm"
                      >
                        <div className="min-w-0">
                          <div className="font-medium truncate">
                            {orderLineName(item, store.menuItems, lang)}
                          </div>
                          <div className="text-[11px] text-muted-foreground">
                            {item.station}
                            {item.preferences?.length ? ` · ${item.preferences.join(", ")}` : ""}
                            {item.note ? ` · ${item.note}` : ""}
                          </div>
                        </div>
                        <div className="shrink-0 text-right">
                          <div className="font-mono text-xs">×{item.qty}</div>
                          <div className="font-mono text-xs font-semibold">
                            {formatETB((item.unitPrice ?? 0) * item.qty)}
                          </div>
                        </div>
                      </div>
                    ))}
                    {row.items.length === 0 && (
                      <p className="text-sm text-muted-foreground">
                        {t("No items on this order yet.", "በዚህ ትዕዛዝ እስካሁን እቃ የለም።")}
                      </p>
                    )}
                  </div>
                </div>

                {row.stationTickets.length > 0 && (
                  <div className="space-y-2">
                    <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                      {t("Stations", "ጣቢያዎች")}
                    </div>
                    {row.stationTickets.map((ticket) => (
                      <div
                        key={ticket.id}
                        className="flex items-center justify-between rounded-lg border border-border bg-card px-3 py-2 text-sm"
                      >
                        <span>{ticket.station}</span>
                        <Chip
                          tone={
                            ticket.status === "READY"
                              ? "teff"
                              : ticket.status === "PREPARING"
                                ? "gold"
                                : "ember"
                          }
                        >
                          {ticket.status}
                        </Chip>
                      </div>
                    ))}
                  </div>
                )}

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {canAdd ? (
                    <Link
                      to="/app/pos"
                      search={tableAddPosSearch(row)}
                      className="h-10 rounded-lg bg-ember text-ember-foreground text-sm font-semibold inline-flex items-center justify-center gap-2"
                    >
                      <Icons.UtensilsCrossed className="size-4" /> {t("Add items", "እቃዎች አክል")}
                    </Link>
                  ) : (
                    <span className="h-10 rounded-lg border border-border bg-card text-sm font-medium text-muted-foreground inline-flex items-center justify-center gap-2">
                      <Icons.UtensilsCrossed className="size-4" /> {t("Add items", "እቃዎች አክል")}
                    </span>
                  )}
                  <button
                    type="button"
                    onClick={() => onGenerateReceipt(row)}
                    disabled={!canReceipt}
                    className="h-10 rounded-lg bg-foreground text-background text-sm font-semibold inline-flex items-center justify-center gap-2 disabled:opacity-50"
                  >
                    <Icons.Receipt className="size-4" />
                    {row.receipt
                      ? t("Show receipt", "ደረሰኝ አሳይ")
                      : t("Generate receipt", "ደረሰኝ ፍጠር")}
                  </button>
                </div>
              </div>
            );
          })}
        </div>

        {canClose ? (
          <>
            <button
              type="button"
              onClick={onCloseOrder}
              className="mt-4 h-11 w-full rounded-lg bg-teff text-teff-foreground text-sm font-semibold inline-flex items-center justify-center gap-2"
            >
              <Icons.CheckCircle2 className="size-4" /> {t("Clear table", "ጠረጴዛ አፅዳ")}
            </button>
            <p className="mt-2 text-center text-xs text-muted-foreground">
              {t(
                "Clears the seat now. Cashier can take the waiter bill later.",
                "መቀመጫውን አሁን ያፀዳል። ካሸር የአስተናጋጅ ሂሳቡን በኋላ መውሰድ ይችላል።",
              )}
            </p>
          </>
        ) : null}

        {canCreate ? (
          <Link
            to="/app/pos"
            search={tableCreatePosSearch(table)}
            className="mt-4 h-11 w-full rounded-lg bg-ember text-ember-foreground text-sm font-semibold inline-flex items-center justify-center gap-2"
          >
            <Icons.Plus className="size-4" /> {t("Create order", "ትዕዛዝ ፍጠር")}
          </Link>
        ) : null}
      </div>
    </div>
  );
}

function TableModal({
  table,
  occupyingOrders,
  waiters,
  isWaiter,
  canManageBills,
  canManageTables,
  onClose,
  onSave,
  onDelete,
  onMarkAvailable,
  onCloseOrder,
  onGenerateReceipt,
}: {
  table: TableView;
  occupyingOrders: Order[];
  waiters: WaiterOption[];
  isWaiter: boolean;
  canManageBills: boolean;
  canManageTables: boolean;
  onClose: () => void;
  onSave: (table: Table) => void;
  onDelete: () => void;
  onMarkAvailable: () => void;
  onCloseOrder: () => void;
  onGenerateReceipt: (order: Order) => void;
}) {
  const t = useT();
  const lang = useLang();
  const store = useStore();
  const [draft, setDraft] = useState<Table>({ ...table });
  const orders = table.tableOrders.length > 0 ? table.tableOrders : table.activeOrder ? [table.activeOrder] : [];
  const order = orders[0];
  const selectedWaiter = draft.server ?? UNASSIGNED_WAITER;
  const selectedWaiterIsSystemUser = waiters.some((waiter) => waiter.name === selectedWaiter);
  const showOrderDetails = orders.length > 0;
  const showWaiterActions = isWaiter || showOrderDetails;
  const canClose = canCloseOrderToClearTable(
    occupyingOrders.length > 0 ? occupyingOrders : orders,
    table.status,
  );
  const lockedWaiter = table.server?.trim() || "";
  const hasOpenFloorOrder = occupyingOrders.length > 0;
  const canRemoveWaiter = Boolean(lockedWaiter) && !hasOpenFloorOrder;

  if (isWaiter) {
    return (
      <WaiterTableSheet
        table={table}
        occupyingOrders={occupyingOrders}
        onClose={onClose}
        onCloseOrder={onCloseOrder}
        onGenerateReceipt={onGenerateReceipt}
      />
    );
  }

  return (
    <div
      className="fixed inset-0 z-50 bg-foreground/40 backdrop-blur-sm grid place-items-center p-4"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div
        className="surface-card max-w-lg w-full !p-6 max-h-[90vh] overflow-y-auto"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-5">
          <div>
            <h3 className="font-display text-xl font-semibold">{table.label}</h3>
            <div className="text-sm text-muted-foreground">
              {table.area} - {tableStatusLabel(table.displayStatus, t)}
            </div>
          </div>
          <button
            type="button"
            onClick={(event) => {
              event.preventDefault();
              event.stopPropagation();
              onClose();
            }}
            className="size-11 grid place-items-center rounded-lg hover:bg-surface-2"
            aria-label={t("Close", "ዝጋ")}
          >
            <Icons.X className="size-4" />
          </button>
        </div>

        {showOrderDetails ? (
          <div className="space-y-4">
            {orders.map((row) => {
              const canAdd = canAddItemsToOrder(row);
              const canReceipt = Boolean(row.receipt || canGenerateReceipt(row));
              return (
                <div key={row.id} className="space-y-3 rounded-xl border border-border p-3">
                  <div className="rounded-lg bg-surface-2 p-3 text-sm space-y-2">
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">{t("Order", "ትዕዛዝ")}</span>
                      <span className="font-mono">{row.orderNo}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">{t("Order status", "የትዕዛዝ ሁኔታ")}</span>
                      <span>{orderStatusLabel(row.status, t)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">{t("Payment status", "የክፍያ ሁኔታ")}</span>
                      <span>
                        {row.paymentStatus === "Unpaid"
                          ? t("Unpaid", "ያልተከፈለ")
                          : row.paymentStatus === "Partially Paid"
                            ? t("Partially paid", "በከፊል የተከፈለ")
                            : t("Paid", "ተከፍሏል")}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">{t("Waiter", "አስተናጋጅ")}</span>
                      <span>{row.waiter}</span>
                    </div>
                    <div className="flex justify-between font-semibold">
                      <span className="text-muted-foreground">{t("Total", "ጠቅላላ")}</span>
                      <span className="font-mono">
                        {formatETB(row.receipt?.grandTotal ?? row.total)}
                      </span>
                    </div>
                    {row.receipt && (
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">{t("Receipt", "ደረሰኝ")}</span>
                        <span className="font-mono">{row.receipt.receiptNumber}</span>
                      </div>
                    )}
                  </div>

                  <div>
                    <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                      {t("Ordered items", "የታዘዙ እቃዎች")}
                    </div>
                    <div className="space-y-1.5">
                      {row.items.map((item, index) => (
                        <div
                          key={`${row.id}-${item.menuItemId ?? item.name}-${index}`}
                          className="flex items-start justify-between gap-3 rounded-lg border border-border bg-card px-3 py-2 text-sm"
                        >
                          <div className="min-w-0">
                            <div className="font-medium truncate">
                              {orderLineName(item, store.menuItems, lang)}
                            </div>
                            <div className="text-[11px] text-muted-foreground">
                              {item.station}
                              {item.preferences?.length
                                ? ` · ${item.preferences.join(", ")}`
                                : ""}
                              {item.note ? ` · ${item.note}` : ""}
                            </div>
                          </div>
                          <div className="shrink-0 text-right">
                            <div className="font-mono text-xs">×{item.qty}</div>
                            <div className="font-mono text-xs font-semibold">
                              {formatETB((item.unitPrice ?? 0) * item.qty)}
                            </div>
                          </div>
                        </div>
                      ))}
                      {row.items.length === 0 && (
                        <p className="text-sm text-muted-foreground">
                          {t("No items on this order yet.", "በዚህ ትዕዛዝ እስካሁን እቃ የለም።")}
                        </p>
                      )}
                    </div>
                  </div>

                  {row.stationTickets.length > 0 && (
                    <div className="space-y-2">
                      <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                        {t("Stations", "ጣቢያዎች")}
                      </div>
                      {row.stationTickets.map((ticket) => (
                        <div
                          key={ticket.id}
                          className="flex items-center justify-between rounded-lg border border-border bg-card px-3 py-2 text-sm"
                        >
                          <span>{ticket.station}</span>
                          <Chip
                            tone={
                              ticket.status === "READY"
                                ? "teff"
                                : ticket.status === "PREPARING"
                                  ? "gold"
                                  : "ember"
                            }
                          >
                            {ticket.status}
                          </Chip>
                        </div>
                      ))}
                    </div>
                  )}

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    {isWaiter || canAdd ? (
                      canAdd ? (
                        <Link
                          to="/app/pos"
                            search={tableAddPosSearch(row)}
                          className="h-10 rounded-lg bg-ember text-ember-foreground text-sm font-semibold inline-flex items-center justify-center gap-2"
                        >
                          <Icons.UtensilsCrossed className="size-4" /> {t("Add items", "እቃዎች አክል")}
                        </Link>
                      ) : isWaiter ? (
                        <span className="h-10 rounded-lg border border-border bg-card text-sm font-medium text-muted-foreground inline-flex items-center justify-center gap-2">
                          <Icons.UtensilsCrossed className="size-4" /> {t("Add items", "እቃዎች አክል")}
                        </span>
                      ) : null
                    ) : null}
                    {(isWaiter || canManageBills) && (
                      <button
                        type="button"
                        onClick={() => onGenerateReceipt(row)}
                        disabled={!canReceipt}
                        className="h-10 rounded-lg bg-foreground text-background text-sm font-semibold inline-flex items-center justify-center gap-2 disabled:opacity-50"
                      >
                        <Icons.Receipt className="size-4" />
                        {row.receipt
                          ? t("Show receipt", "ደረሰኝ አሳይ")
                          : t("Generate receipt", "ደረሰኝ ፍጠር")}
                      </button>
                    )}
                    {canManageBills && (
                      <Link
                        to="/app/pos"
                        search={tableOpenPosSearch(row)}
                        className="h-10 rounded-lg border border-border bg-card text-sm font-medium inline-flex items-center justify-center gap-2 hover:bg-surface-2"
                      >
                        <Icons.Wallet className="size-4" />{" "}
                        {row.receipt ? t("Take payment", "ክፍያ ፈጽም") : t("Open in POS", "በPOS ክፈት")}
                      </Link>
                    )}
                    <Link
                      to="/app/orders"
                      className="h-10 rounded-lg border border-border bg-card text-sm font-medium inline-flex items-center justify-center gap-2 hover:bg-surface-2"
                    >
                      <Icons.ClipboardList className="size-4" /> {t("View status", "ሁኔታ ይመልከቱ")}
                    </Link>
                  </div>
                </div>
              );
            })}

            {canClose ? (
              <button
                type="button"
                onClick={onCloseOrder}
                className="h-11 w-full rounded-lg bg-teff text-teff-foreground text-sm font-semibold inline-flex items-center justify-center gap-2"
              >
                <Icons.CheckCircle2 className="size-4" /> {t("Clear table", "ጠረጴዛ አፅዳ")}
              </button>
            ) : null}

            {isWaiter && !order && (
              <Link
                to="/app/pos"
                search={tableCreatePosSearch(table)}
                className="h-10 w-full rounded-lg bg-ember text-ember-foreground text-sm font-semibold inline-flex items-center justify-center gap-2"
              >
                <Icons.Plus className="size-4" /> {t("Create order", "ትዕዛዝ ፍጠር")}
              </Link>
            )}
          </div>
        ) : canManageTables && !isWaiter ? (
          <div className="space-y-4">
            <div>
              <label className="text-xs text-muted-foreground">{t("Table status", "የጠረጴዛ ሁኔታ")}</label>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 mt-2">
                {STATUSES.map((status) => (
                  <button
                    key={status}
                    onClick={() => setDraft((prev) => ({ ...prev, status }))}
                    className={`h-9 rounded-lg text-xs font-medium border transition-colors ${draft.status === status ? "border-ember bg-ember/10 text-ember" : "border-border hover:bg-surface-2"}`}
                  >
                    {tableStatusLabel(status, t)}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label className="text-xs text-muted-foreground">{t("Assigned waiter", "የተመደበ አስተናጋጅ")}</label>
              {lockedWaiter ? (
                <div className="mt-1 space-y-2">
                  <div className="flex items-center justify-between gap-2 rounded-lg border border-border bg-surface-2 px-3 py-2.5">
                    <div>
                      <div className="text-sm font-semibold">{lockedWaiter}</div>
                      <div className="text-[11px] text-muted-foreground">
                        {t("Locked to this waiter", "ለዚህ አስተናጋጅ ተቆልፏል")}
                      </div>
                    </div>
                    <Chip tone="ember">{t("Locked", "ተቆልፏል")}</Chip>
                  </div>
                  <button
                    type="button"
                    disabled={!canRemoveWaiter}
                    onClick={() => {
                      if (!canRemoveWaiter) return;
                      const next = {
                        ...table,
                        server: undefined,
                        guests: undefined,
                        openMin: undefined,
                        total: undefined,
                      };
                      setDraft(next);
                      onSave(next);
                    }}
                    className="h-9 w-full rounded-lg border border-destructive/30 text-destructive text-xs font-semibold hover:bg-destructive/5 disabled:opacity-40"
                  >
                    {t("Remove waiter from table", "አስተናጋጁን ከጠረጴዛ አስወግድ")}
                  </button>
                  {!canRemoveWaiter ? (
                    <div className="space-y-2">
                      <p className="text-[11px] text-muted-foreground">
                        {t(
                          "Clear open orders on this table before removing the waiter. Then you can assign someone else.",
                          "ከአስተናጋጁ በፊት ክፍት ትዕዛዞችን ያፅዱ። ከዚያ ሌላ አስተናጋጅ መመደብ ይችላሉ።",
                        )}
                      </p>
                      {canClose ? (
                        <button
                          type="button"
                          onClick={onCloseOrder}
                          className="h-9 w-full rounded-lg bg-teff text-teff-foreground text-xs font-semibold inline-flex items-center justify-center gap-2"
                        >
                          <Icons.CheckCircle2 className="size-3.5" /> {t("Clear table", "ጠረጴዛ አፅዳ")}
                        </button>
                      ) : null}
                    </div>
                  ) : (
                    <p className="text-[11px] text-muted-foreground">
                      {t(
                        "Remove the current waiter first. You cannot switch to another waiter from the selector.",
                        "መጀመሪያ አሁኑን አስተናጋጅ ያስወግዱ። ከመምረጫ በቀጥታ ወደ ሌላ አስተናጋጅ መቀየር አይቻልም።",
                      )}
                    </p>
                  )}
                </div>
              ) : (
                <>
                  <select
                    value={selectedWaiter}
                    onChange={(event) =>
                      setDraft((prev) => ({
                        ...prev,
                        server: event.target.value === UNASSIGNED_WAITER ? undefined : event.target.value,
                      }))
                    }
                    className="w-full mt-1 h-10 px-3 rounded-lg border border-border bg-card text-sm focus:outline-none"
                  >
                    <option value={UNASSIGNED_WAITER}>{t("Unassigned", "ያልተመደበ")}</option>
                    {!selectedWaiterIsSystemUser && selectedWaiter !== UNASSIGNED_WAITER && (
                      <option value={selectedWaiter}>{selectedWaiter}</option>
                    )}
                    {waiters.map((waiter) => (
                      <option key={waiter.id} value={waiter.name}>
                        {waiter.name}
                      </option>
                    ))}
                  </select>
                  <p className="mt-1 text-[11px] text-muted-foreground">
                    {t(
                      "Assign an empty table to a waiter. Once assigned, the table stays locked until you remove that waiter.",
                      "ባዶ ጠረጴዛ ለአስተናጋጅ ይመድቡ። ከተመደበ በኋላ አስተናጋጁን እስከሚያስወግዱ ድረስ ተቆልፎ ይቆያል።",
                    )}
                  </p>
                </>
              )}
            </div>

            {(draft.status === "Occupied" || draft.status === "Bill") && (
              <div>
                <label className="text-xs text-muted-foreground">{t("Guests", "እንግዶች")}</label>
                <input
                  type="number"
                  min={1}
                  max={table.seats}
                  value={draft.guests ?? 1}
                  onChange={(event) =>
                    setDraft((prev) => ({ ...prev, guests: Number(event.target.value) }))
                  }
                  className="w-full mt-1 h-9 px-3 rounded-lg border border-border bg-card text-sm focus:outline-none focus:ring-2 focus:ring-ring/40"
                />
              </div>
            )}

            <div className="flex gap-2">
              <button
                onClick={onClose}
                className="flex-1 h-10 rounded-lg border border-border bg-card text-sm hover:bg-surface-2"
              >
                {t("Cancel", "ሰርዝ")}
              </button>
              <button
                onClick={() => onSave(draft)}
                className="flex-1 h-10 rounded-lg bg-ember text-ember-foreground text-sm font-semibold"
              >
                {t("Save", "አስቀምጥ")}
              </button>
            </div>

            <div className="flex gap-2 border-t border-border pt-4">
              {table.status === "Cleaning" && (
                <button
                  onClick={onMarkAvailable}
                  className="flex-1 h-10 rounded-lg bg-teff text-teff-foreground text-sm font-semibold"
                >
                  {t("Mark available", "ይገኛል አድርግ")}
                </button>
              )}
              {!table.isVirtual && (
                <button
                  onClick={onDelete}
                  className="flex-1 h-10 rounded-lg border border-destructive/30 text-destructive text-sm font-medium hover:bg-destructive/5"
                >
                  {t("Delete table", "ጠረጴዛ ሰርዝ")}
                </button>
              )}
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="rounded-lg bg-surface-2 p-4 text-sm space-y-2">
              <div className="flex justify-between">
                <span className="text-muted-foreground">{t("Status", "ሁኔታ")}</span>
                <span>{tableStatusLabel(table.displayStatus, t)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">{t("Seats", "መቀመጫ")}</span>
                <span>{table.seats}</span>
              </div>
              {table.server && (
                <div className="flex justify-between">
                  <span className="text-muted-foreground">{t("Waiter", "አስተናጋጅ")}</span>
                  <span>{table.server}</span>
                </div>
              )}
            </div>
            {showWaiterActions &&
              orders.length === 0 &&
              table.status !== "Cleaning" &&
              table.status !== "Reserved" && (
              <Link
                to="/app/pos"
                search={tableCreatePosSearch(table)}
                className="h-10 w-full rounded-lg bg-ember text-ember-foreground text-sm font-semibold inline-flex items-center justify-center gap-2"
              >
                <Icons.Plus className="size-4" /> {t("Create order", "ትዕዛዝ ፍጠር")}
              </Link>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function WalkInModal({
  tables,
  waiters,
  onClose,
  onSave,
}: {
  tables: TableView[];
  waiters: WaiterOption[];
  onClose: () => void;
  onSave: (id: string, guests: number, waiter: string) => void;
}) {
  const t = useT();
  const [tableId, setTableId] = useState(tables[0]?.id ?? "");
  const [guests, setGuests] = useState(2);
  const [waiter, setWaiter] = useState(waiters[0]?.name ?? UNASSIGNED_WAITER);

  return (
    <div className="fixed inset-0 z-50 bg-foreground/40 backdrop-blur-sm grid place-items-center p-4">
      <div className="surface-card max-w-sm w-full !p-6">
        <div className="flex items-center justify-between mb-5">
          <h3 className="font-display text-xl font-semibold">{t("Seat walk-in", "?? ?? ???? ???? ?????")}</h3>
          <button
            onClick={onClose}
            className="size-11 grid place-items-center rounded-lg hover:bg-surface-2"
          >
            <Icons.X className="size-4" />
          </button>
        </div>
        {tables.length === 0 ? (
          <p className="mb-5 text-sm text-muted-foreground">{t("No tables", "?????? ???")}</p>
        ) : (
          <div className="space-y-3 mb-5">
            <div>
              <label className="text-xs text-muted-foreground">{t("Table", "????")}</label>
              <select
                value={tableId}
                onChange={(event) => setTableId(event.target.value)}
                className="w-full mt-1 h-9 px-3 rounded-lg border border-border bg-card text-sm focus:outline-none"
              >
                {tables.map((table) => (
                  <option key={table.id} value={table.id}>
                    {table.area} - {table.label} ({table.seats} seats)
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-xs text-muted-foreground">{t("Guests", "?????")}</label>
              <input
                type="number"
                min={1}
                value={guests}
                onChange={(event) => setGuests(Number(event.target.value))}
                className="w-full mt-1 h-9 px-3 rounded-lg border border-border bg-card text-sm focus:outline-none focus:ring-2 focus:ring-ring/40"
              />
            </div>
            <div>
              <label className="text-xs text-muted-foreground">{t("Waiter", "??????")}</label>
              <select
                value={waiter}
                onChange={(event) => setWaiter(event.target.value)}
                className="w-full mt-1 h-9 px-3 rounded-lg border border-border bg-card text-sm focus:outline-none"
              >
                {waiters.length > 0 ? (
                  waiters.map((option) => (
                    <option key={option.id} value={option.name}>
                      {option.name}
                    </option>
                  ))
                ) : (
                  <option value={UNASSIGNED_WAITER}>{t("No waiter accounts", "??????? ????? ???")}</option>
                )}
              </select>
            </div>
          </div>
        )}
        <div className="flex gap-2">
          <button
            onClick={onClose}
            className="flex-1 h-10 rounded-lg border border-border bg-card text-sm hover:bg-surface-2"
          >
            {t("Cancel", "???")}
          </button>
          <button
            onClick={() => onSave(tableId, guests, waiter)}
            disabled={tables.length === 0}
            className="flex-1 h-10 rounded-lg bg-ember text-ember-foreground text-sm font-semibold disabled:opacity-40"
          >
            {t("Seat", "?????")}
          </button>
        </div>
      </div>
    </div>
  );
}

function AddTableModal({
  areas,
  existingSeats,
  onClose,
  onSave,
}: {
  areas: string[];
  existingSeats: { area: string; label: string }[];
  onClose: () => void;
  onSave: (table: Table) => void;
}) {
  const t = useT();
  const [form, setForm] = useState<Table>({
    id: `tbl-${Date.now()}`,
    label: "",
    seats: 4,
    area: areas[0] ?? SEATING_AREAS[0],
    status: "Available",
  });
  const [error, setError] = useState("");

  const normalizedExisting = useMemo(
    () =>
      new Set(
        existingSeats
          .map(
            (seat) =>
              `${seat.area.trim().toLowerCase()}::${seat.label.trim().toLowerCase()}`,
          )
          .filter((key) => !key.startsWith("::") && !key.endsWith("::")),
      ),
    [existingSeats],
  );

  function submit() {
    const label = form.label.trim();
    const area = form.area.trim();
    if (!label || form.seats < 1) return;
    if (normalizedExisting.has(`${area.toLowerCase()}::${label.toLowerCase()}`)) {
      setError(
        t(
          `Table "${label}" already exists in ${area}.`,
          `ጠረጴዛ "${label}" በ ${area} አስቀድሞ አለ።`,
        ),
      );
      return;
    }
    setError("");
    onSave({
      ...form,
      label,
      area,
    });
  }

  return (
    <div className="fixed inset-0 z-50 bg-foreground/40 backdrop-blur-sm grid place-items-center p-4">
      <div className="surface-card max-w-md w-full !p-6">
        <div className="flex items-center justify-between mb-5">
          <h3 className="font-display text-xl font-semibold">{t("Add table", "ጠረጴዛ ጨምር")}</h3>
          <button
            onClick={onClose}
            className="size-11 grid place-items-center rounded-lg hover:bg-surface-2"
          >
            <Icons.X className="size-4" />
          </button>
        </div>
        <div className="space-y-3 mb-5">
          <div>
            <label className="text-xs text-muted-foreground">{t("Table number", "የጠረጴዛ ቁጥር")}</label>
            <input
              value={form.label}
              onChange={(event) => {
                setError("");
                setForm((prev) => ({ ...prev, label: event.target.value }));
              }}
              placeholder={t("e.g. RT-06", "ለምሳሌ RT-06")}
              className={`w-full mt-1 h-9 px-3 rounded-lg border bg-card text-sm focus:outline-none focus:ring-2 focus:ring-ring/40 ${
                error ? "border-destructive" : "border-border"
              }`}
            />
            {error ? <p className="mt-1 text-xs text-destructive">{error}</p> : null}
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-muted-foreground">{t("Seats", "መቀመጫዎች")}</label>
              <input
                type="number"
                min={1}
                value={form.seats}
                onChange={(event) =>
                  setForm((prev) => ({ ...prev, seats: Number(event.target.value) }))
                }
                className="w-full mt-1 h-9 px-3 rounded-lg border border-border bg-card text-sm focus:outline-none focus:ring-2 focus:ring-ring/40"
              />
            </div>
            <div>
              <label className="text-xs text-muted-foreground">{t("Area", "አካባቢ")}</label>
              <input
                list="table-area-options"
                value={form.area}
                onChange={(event) => setForm((prev) => ({ ...prev, area: event.target.value }))}
                className="w-full mt-1 h-9 px-3 rounded-lg border border-border bg-card text-sm focus:outline-none focus:ring-2 focus:ring-ring/40"
              />
              <datalist id="table-area-options">
                {areas.map((option) => (
                  <option key={option} value={option} />
                ))}
              </datalist>
            </div>
          </div>
          <div>
            <label className="text-xs text-muted-foreground">{t("Initial status", "መጀመሪያ ሁኔታ")}</label>
            <select
              value={form.status}
              onChange={(event) =>
                setForm((prev) => ({ ...prev, status: event.target.value as Table["status"] }))
              }
              className="w-full mt-1 h-9 px-3 rounded-lg border border-border bg-card text-sm focus:outline-none"
            >
              {STATUSES.map((status) => (
                <option key={status}>{status}</option>
              ))}
            </select>
          </div>
        </div>
        <div className="flex gap-2">
          <button
            onClick={onClose}
            className="flex-1 h-10 rounded-lg border border-border bg-card text-sm hover:bg-surface-2"
          >
            {t("Cancel", "ሰርዝ")}
          </button>
          <button
            onClick={submit}
            className="flex-1 h-10 rounded-lg bg-ember text-ember-foreground text-sm font-semibold"
          >
            {t("Save table", "ጠረጴዛ አስቀምጥ")}
          </button>
        </div>
      </div>
    </div>
  );
}

function AssignTablesModal({
  tables,
  waiters,
  areas,
  onClose,
  onSave,
}: {
  tables: TableView[];
  waiters: WaiterOption[];
  areas: string[];
  onClose: () => void;
  onSave: (waiterName: string, tableIds: string[], clearOthers: boolean) => void;
}) {
  const t = useT();
  const [waiterName, setWaiterName] = useState(waiters[0]?.name ?? UNASSIGNED_WAITER);
  const [area, setArea] = useState("All");
  const [selectedIds, setSelectedIds] = useState<string[]>(() => {
    const initialWaiter = waiters[0]?.name;
    if (!initialWaiter) return [];
    return tables
      .filter((table) => assignedWaiterMatches(table.server, { name: initialWaiter }))
      .map((table) => table.id);
  });
  const [replaceExisting, setReplaceExisting] = useState(true);

  const visible = useMemo(() => {
    const rows = area === "All" ? tables : tables.filter((table) => table.area === area);
    return [...rows].sort(
      (a, b) => a.area.localeCompare(b.area) || a.label.localeCompare(b.label, undefined, { numeric: true }),
    );
  }, [tables, area]);

  useEffect(() => {
    if (waiterName === UNASSIGNED_WAITER) {
      setSelectedIds([]);
      return;
    }
    // Only re-seed when the waiter changes — not on every tables refresh,
    // otherwise checkbox selections reset while the user is picking tables.
    setSelectedIds(
      tables
        .filter((table) => assignedWaiterMatches(table.server, { name: waiterName }))
        .map((table) => table.id),
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps -- intentionally waiter-only
  }, [waiterName]);

  function tableLockedToOther(table: TableView) {
    const owner = table.server?.trim() || "";
    if (!owner) return false;
    if (assignedWaiterMatches(owner, { name: waiterName })) return false;
    // Empty seats can be claimed/reassigned; only an active open bill locks the seat.
    return tableHasOpenOrder(table);
  }

  function tableHasOpenOrder(table: TableView) {
    const orders = table.tableOrders.length > 0 ? table.tableOrders : table.activeOrder ? [table.activeOrder] : [];
    return orders.some((order) => hasLiveBillBlockingSeat(order));
  }

  function toggle(id: string) {
    const table = tables.find((row) => row.id === id);
    if (!table) return;
    if (tableLockedToOther(table)) {
      showError(
        t(
          "This table has an open order for another waiter. Clear that bill before reassigning.",
          "ይህ ጠረጴዛ ለሌላ አስተናጋጅ ክፍት ትዕዛዝ አለው። ከመመደብዎ በፊት ያንን ሂሳብ ያፅዱ።",
        ),
      );
      return;
    }
    if (!selectedIds.includes(id) && tableHasOpenOrder(table) && !assignedWaiterMatches(table.server, { name: waiterName })) {
      showError(
        t(
          "Clear open orders on this table before assigning a waiter.",
          "አስተናጋጅ ከመመደብዎ በፊት ክፍት ትዕዛዞችን ያፅዱ።",
        ),
      );
      return;
    }
    setSelectedIds((current) =>
      current.includes(id) ? current.filter((item) => item !== id) : [...current, id],
    );
  }

  function selectVisible() {
    setSelectedIds((current) => {
      const next = new Set(current);
      for (const table of visible) {
        if (tableLockedToOther(table)) continue;
        if (tableHasOpenOrder(table) && !assignedWaiterMatches(table.server, { name: waiterName })) continue;
        next.add(table.id);
      }
      return [...next];
    });
  }

  function clearVisible() {
    const visibleIds = new Set(visible.map((table) => table.id));
    setSelectedIds((current) => current.filter((id) => !visibleIds.has(id)));
  }

  return (
    <div className="fixed inset-0 z-50 bg-foreground/40 backdrop-blur-sm grid place-items-center p-4">
      <div className="surface-card max-w-lg w-full !p-6 max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h3 className="font-display text-xl font-semibold">{t("Assign tables", "ጠረጴዛዎችን መድብ")}</h3>
            <p className="text-xs text-muted-foreground mt-1">
              {t(
                "Tables stay locked to their waiter. To move a table, remove the current waiter first when it has no open order.",
                "ጠረጴዛዎች ለአስተናጋጃቸው ተቆልፈው ይቆያሉ። ለማንቀሳቀስ፣ ክፍት ትዕዛዝ ሳይኖር መጀመሪያ አሁኑን አስተናጋጅ ያስወግዱ።",
              )}
            </p>
          </div>
          <button type="button" onClick={onClose} className="size-11 grid place-items-center rounded-lg hover:bg-surface-2">
            <Icons.X className="size-4" />
          </button>
        </div>

        <div className="space-y-3 mb-4">
          <div>
            <label className="text-xs text-muted-foreground">{t("Waiter", "አስተናጋጅ")}</label>
            <select
              value={waiterName}
              onChange={(event) => setWaiterName(event.target.value)}
              className="w-full mt-1 h-10 px-3 rounded-lg border border-border bg-card text-sm"
            >
              {waiters.length > 0 ? (
                waiters.map((waiter) => (
                  <option key={waiter.id} value={waiter.name}>
                    {waiter.email ? `${waiter.name} (${waiter.email})` : waiter.name}
                  </option>
                ))
              ) : (
                <option value={UNASSIGNED_WAITER}>{t("No waiter accounts", "የአስተናጋጅ መለያ የለም")}</option>
              )}
            </select>
          </div>

          <div className="flex flex-wrap gap-1.5">
            {areas.map((option) => (
              <button
                key={option}
                type="button"
                onClick={() => setArea(option)}
                className={`min-h-11 px-3 rounded-lg text-xs font-medium border ${
                  area === option ? "bg-foreground text-background border-foreground" : "border-border hover:bg-surface-2"
                }`}
              >
                {option}
              </button>
            ))}
          </div>

          <div className="flex flex-wrap gap-2 text-xs">
            <button type="button" onClick={selectVisible} className="min-h-11 px-3 rounded-lg border border-border hover:bg-surface-2">
              {t("Select free / mine", "ባዶ / የእኔን ምረጥ")}
            </button>
            <button type="button" onClick={clearVisible} className="min-h-11 px-3 rounded-lg border border-border hover:bg-surface-2">
              {t("Clear visible", "የታዩትን አጽዳ")}
            </button>
            <span className="self-center text-muted-foreground">
              {selectedIds.length} {t("selected", "ተመርጠዋል")}
            </span>
          </div>

          <label className="flex items-start gap-2 text-xs text-muted-foreground">
            <input
              type="checkbox"
              checked={replaceExisting}
              onChange={(event) => setReplaceExisting(event.target.checked)}
              className="mt-0.5"
            />
            <span>
              {t(
                "Replace this waiter's previous table list with the selection below (cannot drop tables that still have open orders).",
                "የዚህ አስተናጋጅ ቀደም ያሉ ጠረጴዛዎችን በዚህ ምርጫ ይተኩ (ክፍት ትዕዛዝ ያላቸውን ማውረድ አይቻልም)።",
              )}
            </span>
          </label>

          <div className="max-h-64 overflow-y-auto rounded-lg border border-border divide-y divide-border">
            {visible.length === 0 ? (
              <p className="p-4 text-sm text-muted-foreground text-center">{t("No tables", "ጠረጴዛ የለም")}</p>
            ) : (
              visible.map((table) => {
                const checked = selectedIds.includes(table.id);
                const locked = tableLockedToOther(table);
                const blockedByOrder = tableHasOpenOrder(table) && !assignedWaiterMatches(table.server, { name: waiterName }) && !locked;
                const disabled = locked || blockedByOrder;
                return (
                  <label
                    key={table.id}
                    className={`flex items-center gap-3 px-3 py-2.5 text-sm ${
                      disabled ? "cursor-not-allowed opacity-70" : "cursor-pointer hover:bg-surface-2"
                    } ${checked ? "bg-ember/5" : ""}`}
                  >
                    <input
                      type="checkbox"
                      checked={checked}
                      disabled={disabled}
                      onChange={() => toggle(table.id)}
                    />
                    <div className="min-w-0 flex-1">
                      <div className="font-medium truncate">
                        {table.label}
                        <span className="text-muted-foreground font-normal"> · {table.area}</span>
                      </div>
                      <div className="text-[11px] text-muted-foreground">
                        {locked
                          ? `${t("Locked to", "ተቆልፏል ለ")}: ${table.server}`
                          : table.server
                            ? `${t("Currently", "አሁን")}: ${table.server}`
                            : t("Unassigned", "ያልተመደበ")}
                        {blockedByOrder ? ` · ${t("Has open order", "ክፍት ትዕዛዝ አለው")}` : ""}
                      </div>
                    </div>
                    <Chip tone={locked ? "gold" : STATUS_TONE[table.displayStatus] ?? "muted"}>
                      {locked ? t("Locked", "ተቆልፏል") : tableStatusLabel(table.displayStatus, t)}
                    </Chip>
                  </label>
                );
              })
            )}
          </div>
        </div>

        <div className="flex gap-2">
          <button type="button" onClick={onClose} className="flex-1 h-10 rounded-lg border border-border text-sm hover:bg-surface-2">
            {t("Cancel", "ሰርዝ")}
          </button>
          <button
            type="button"
            disabled={!waiters.length}
            onClick={() => onSave(waiterName, selectedIds, replaceExisting)}
            className="flex-1 h-10 rounded-lg bg-ember text-ember-foreground text-sm font-semibold disabled:opacity-40"
          >
            {t("Save assignment", "ምደባ አስቀምጥ")}
          </button>
        </div>
      </div>
    </div>
  );
}

