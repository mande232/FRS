import { canApproveOrderReturns, canApproveWaiterBillTransfers, type AuthUser, type UserRole } from "./auth-context.ts";
import { isFinalOrderStatus, type Order, type ProductionStation } from "./demo-data.ts";
import { canApproveReturnOrder, summarizeReturnRequestedLines } from "./orders-ops.ts";
import { ordersWithPendingWaiterTransfer } from "./waiter-bill-transfer.ts";
import { assignedWaiterMatches } from "./waiter-identity.ts";
import type { AppLang } from "./lang-context.ts";
import { orderLineName, selectText } from "./i18n.ts";
import { resolveUserAssignedLocations } from "./inventory-access.ts";
import {
  defaultProductionStations,
  findStation,
  mainBarStation,
  vipBarStation,
} from "./stations.ts";
import type {
  StockLocation,
  StockLocationBalance,
  StockRequestRecord,
  StockTransferRecord,
} from "./stock-management.ts";

export type NotificationTone = "ember" | "gold" | "teff" | "muted";
export type NotificationKind =
  | "cashier-request"
  | "waiter-update"
  | "station-ticket"
  | "void-request"
  | "return-request"
  | "transfer-request"
  | "stock-alert"
  | "stock-request"
  | "stock-transfer";

export type AppNotification = {
  id: string;
  kind: NotificationKind;
  title: string;
  detail: string;
  time: string;
  tone: NotificationTone;
  orderId: string;
  orderNo: string;
  area: string;
  tableNumber: string;
  waiter: string;
  total: number;
  href: string;
  actionLabel?: string;
  voidReason?: string;
  returnReason?: string;
};

function stationByKeywords(stations: readonly ProductionStation[], keywords: string[]) {
  return stations.find((station) => {
    const key = station.toLowerCase();
    return keywords.some((keyword) => key.includes(keyword));
  });
}

function roleStation(
  stations: readonly ProductionStation[],
  preferred: string,
  keywords: string[],
) {
  const exact = findStation(preferred, stations);
  const keyword = stationByKeywords(stations, keywords);
  const target = exact ?? keyword;
  return target ? [target] : [];
}

export type BarOrderScope = "vip" | "main" | "all";

export function isVipSeatingArea(area?: string | null) {
  return area?.trim().toLowerCase().includes("vip") ?? false;
}

export function barScopeFromUser(
  user: Pick<AuthUser, "role" | "assignedInventoryLocations">,
): BarOrderScope {
  const locations = resolveUserAssignedLocations(user);
  const hasVip = locations.includes("VIP Bar");
  const hasMain = locations.includes("Main Bar");
  if (hasVip && !hasMain) return "vip";
  if (hasMain && !hasVip) return "main";
  if (user.role === "Bartender") return "vip";
  if (user.role === "Bar Staff") return "main";
  return "all";
}

export function orderMatchesBarScope(
  order: Pick<Order, "area">,
  scope: BarOrderScope,
  ticketStation?: string,
) {
  if (scope === "all") return true;
  const stationKey = ticketStation?.trim().toLowerCase() ?? "";
  const vipTicket = stationKey.includes("vip") && stationKey.includes("bar");
  const vipOrder = isVipSeatingArea(order.area) || vipTicket;
  return scope === "vip" ? vipOrder : !vipOrder;
}

export function stationsForRole(
  role: UserRole,
  configuredStations: readonly ProductionStation[] = defaultProductionStations(),
): ProductionStation[] {
  const stations = configuredStations.length > 0 ? configuredStations : defaultProductionStations();
  if (role === "Bartender") {
    const vipBar = vipBarStation(stations);
    if (vipBar) return [vipBar];
    const sharedBar = mainBarStation(stations);
    return sharedBar ? [sharedBar] : [];
  }
  if (role === "Bar Staff") {
    const mainBar = mainBarStation(stations);
    if (mainBar) return [mainBar];
    return roleStation(stations, "Main Bar", ["main"]);
  }
  if (role === "Butcher House Staff" || role === "Butcher Staff")
    return roleStation(stations, "Butcher House", ["butcher", "meat", "grill"]);
  if (role === "Coffee House Staff")
    return roleStation(stations, "Coffee House", ["coffee", "buna"]);
  if (role === "Kitchen Staff") return roleStation(stations, "Kitchen", ["kitchen"]);
  if (role === "Chef")
    return stations.filter(
      (station) =>
        !["bar", "drink", "beverage"].some((keyword) => station.toLowerCase().includes(keyword)),
    );
  return [];
}

export function isOperationalDashboardRole(role: UserRole) {
  return [
    "Waiter",
    "Kitchen Staff",
    "Bartender",
    "Bar Staff",
    "Storekeeper",
    "Inventory Staff",
    "Procurement Officer",
    "Store Manager",
    "Inventory Administrator",
    "Butcher House Staff",
    "Butcher Staff",
    "Coffee House Staff",
    "Chef",
  ].includes(role);
}

function waiterTitle(order: Order, lang: AppLang) {
  if (order.status === "PENDING_CASHIER") return selectText(lang, "Waiting for cashier", "ካሸርን እየጠበቀ");
  if (order.status === "READY TO SERVE") return selectText(lang, "Ready to serve", "ለማቅረብ ዝግጁ");
  if (order.status === "PARTIALLY READY") return selectText(lang, "Partially ready", "በከፊል ዝግጁ");
  if (order.paymentStatus === "Paid") return selectText(lang, "Bill paid, still open", "ተከፍሏል፣ ሂሳቡ ክፍት ነው");
  return selectText(lang, "Open bill", "ክፍት ሂሳብ");
}

function waiterTone(order: Order): NotificationTone {
  if (order.status === "PENDING_CASHIER") return "gold";
  if (order.status === "READY TO SERVE") return "teff";
  if (order.status === "PARTIALLY READY") return "gold";
  if (order.paymentStatus === "Paid") return "teff";
  return "ember";
}

function formatLineQty(qty: number, unitLabel?: string) {
  const value = qty.toLocaleString(undefined, { maximumFractionDigits: 3 });
  return unitLabel ? `${value} ${unitLabel}` : `${value}x`;
}

function sameLocation(a?: string | null, b?: string | null) {
  return a?.trim().toLowerCase() === b?.trim().toLowerCase();
}

function formatTransferCounterparty(request: StockRequestRecord | StockTransferRecord) {
  if ("requestingDepartment" in request) {
    return `${request.requestedSourceStore} → ${request.requestingDepartment}`;
  }
  return `${request.sourceLocation} → ${request.destinationLocation}`;
}

function isStockManagerRole(role: UserRole) {
  return ["Administrator", "Inventory Administrator", "Branch Manager", "Store Manager", "Supervisor", "Accountant", "Auditor"].includes(role);
}

function locationsForRoleStations(role: UserRole, configuredStations: readonly ProductionStation[]) {
  return stationsForRole(role, configuredStations)
    .map((station) => {
      const key = station.toLowerCase();
      if (key.includes("vip")) return "VIP Bar" as StockLocation;
      if (key.includes("bar")) return "Main Bar" as StockLocation;
      if (key.includes("kitchen")) return "Kitchen" as StockLocation;
      if (key.includes("butcher")) return "Butcher" as StockLocation;
      if (key.includes("coffee")) return "Coffee House" as StockLocation;
      return null;
    })
    .filter((loc): loc is StockLocation => Boolean(loc));
}

function resolveNotificationLocations(user: AuthUser, configuredStations: readonly ProductionStation[]) {
  const assignedLocations = resolveUserAssignedLocations(user);
  const stationLocations = locationsForRoleStations(user.role, configuredStations);
  const scopedLocations = assignedLocations.length > 0 ? assignedLocations : [...stationLocations];
  return {
    canSeeAllAssigned: isStockManagerRole(user.role),
    scopedLocations,
    allowedLocations:
      isStockManagerRole(user.role)
        ? null
        : scopedLocations.length > 0
          ? new Set<StockLocation>(scopedLocations)
          : new Set<StockLocation>(),
  };
}

function requestAudienceMatch(
  user: AuthUser,
  request: StockRequestRecord,
  allowedLocations: Set<StockLocation> | null,
) {
  if (isStockManagerRole(user.role)) return true;
  return (
    sameLocation(user.name, request.requestedBy) ||
    sameLocation(user.name, request.reviewedBy) ||
    allowedLocations?.has(request.requestingDepartment) ||
    allowedLocations?.has(request.requestedSourceStore)
  );
}

/** Only statuses that still need someone to act — completed/history rows must not linger. */
const ACTIONABLE_STOCK_REQUEST_STATUSES = new Set([
  "Submitted",
  "Under Review",
]);

const ACTIONABLE_STOCK_TRANSFER_STATUSES = new Set([
  "Pending Approval",
  "Approved",
  "Partially Approved",
  "Prepared",
  "Dispatched",
  "Partially Received",
]);

function transferAudienceMatch(
  user: AuthUser,
  transfer: StockTransferRecord,
  allowedLocations: Set<StockLocation> | null,
) {
  if (isStockManagerRole(user.role)) return true;
  return (
    sameLocation(user.name, transfer.requestedBy) ||
    sameLocation(user.name, transfer.approvedBy) ||
    sameLocation(user.name, transfer.sentBy) ||
    sameLocation(user.name, transfer.receivedBy) ||
    allowedLocations?.has(transfer.sourceLocation) ||
    allowedLocations?.has(transfer.destinationLocation)
  );
}

export function getNotificationsForUser(
  user: AuthUser,
  orders: Order[],
  stock: readonly StockLocationBalance[] = [],
  requests: readonly StockRequestRecord[] = [],
  transfers: readonly StockTransferRecord[] = [],
  configuredStations: readonly ProductionStation[] = defaultProductionStations(),
  menuItems: readonly { id: string; name_en: string; name_am?: string }[] = [],
  lang: AppLang = "en",
): AppNotification[] {
  const notifications: AppNotification[] = [];
  const role = user.role;
  const isManager = role === "Branch Manager";
  const isCashier = role === "Cashier" || isManager;

  if (isManager) {
    orders
      .filter((order) => order.voidRequestedBy && !isFinalOrderStatus(order.status))
      .forEach((order) => {
        notifications.push({
          id: `void-${order.id}`,
          kind: "void-request",
          title: selectText(lang, "Void order requested", "ትዕዛዝ መሰረዝ ተጠይቋል"),
          detail: selectText(
            lang,
            `${order.voidRequestedBy} requested to void order ${order.orderNo} (${order.area} ${order.tableNumber})${order.voidReason ? `: "${order.voidReason}"` : "."}`,
            `${order.voidRequestedBy} ትዕዛዝ ${order.orderNo} (${order.area} ${order.tableNumber}) እንዲሰረዝ ጠይቋል${order.voidReason ? `፦ "${order.voidReason}"` : "።"}`,
          ),
          time: order.voidRequestedAt ?? order.sentAt,
          tone: "ember",
          orderId: order.id,
          orderNo: order.orderNo,
          area: order.area,
          tableNumber: order.tableNumber,
          waiter: order.waiter,
          total: order.total,
          href: "/app/orders",
          actionLabel: selectText(lang, "Review & approve", "ይገምግሙ እና ያፅድቁ"),
          voidReason: order.voidReason,
        });
      });
  }

  if (canApproveOrderReturns(role) || role === "Branch Manager") {
    orders
      .filter((order) => canApproveReturnOrder(order))
      .forEach((order) => {
        const itemSummary = summarizeReturnRequestedLines(order.items, order.returnRequestedLines);
        notifications.push({
          id: `return-${order.id}`,
          kind: "return-request",
          title: selectText(lang, "Order return requested", "የትዕዛዝ መልስ ተጠይቋል"),
          detail: selectText(
            lang,
            `${order.returnRequestedBy} requested to return ${order.orderNo} (${order.area} ${order.tableNumber})${itemSummary ? ` — ${itemSummary}` : ""}${order.returnReason ? `: "${order.returnReason}"` : "."}`,
            `${order.returnRequestedBy} ${order.orderNo} (${order.area} ${order.tableNumber}) እንዲመለስ ጠይቋል${itemSummary ? ` — ${itemSummary}` : ""}${order.returnReason ? `፦ "${order.returnReason}"` : "።"}`,
          ),
          time: order.returnRequestedAt ?? order.sentAt,
          tone: "ember",
          orderId: order.id,
          orderNo: order.orderNo,
          area: order.area,
          tableNumber: order.tableNumber,
          waiter: order.waiter,
          total: order.total,
          href: "/app/orders",
          actionLabel: selectText(lang, "Review & approve", "ይገምግሙ እና ያፅድቁ"),
          returnReason: order.returnReason,
        });
      });
  }

  if (canApproveWaiterBillTransfers(role)) {
    const pending = ordersWithPendingWaiterTransfer(orders);
    const groups = new Map<string, Order[]>();
    for (const order of pending) {
      const from = order.waiter.trim();
      const to = order.waiterTransferRequestedTo?.trim() || "";
      const key = `${from.toLowerCase()}=>${to.toLowerCase()}`;
      const list = groups.get(key) ?? [];
      list.push(order);
      groups.set(key, list);
    }
    for (const [key, group] of groups) {
      const [from, to] = key.split("=>");
      const first = group[0];
      if (!first || !from || !to) continue;
      notifications.push({
        id: `transfer-${key}`,
        kind: "transfer-request",
        title: selectText(lang, "Bill transfer requested", "የሂሳብ ማስተላለፍ ተጠይቋል"),
        detail: selectText(
          lang,
          `${first.waiterTransferRequestedBy || first.waiter} requested ${group.length} open bill(s) from ${first.waiter} to ${first.waiterTransferRequestedTo}.`,
          `${first.waiterTransferRequestedBy || first.waiter} ${group.length} ክፍት ሂሳብ ከ ${first.waiter} ወደ ${first.waiterTransferRequestedTo} እንዲተላለፍ ጠይቋል።`,
        ),
        time: first.waiterTransferRequestedAt ?? first.sentAt,
        tone: "ember",
        orderId: first.id,
        orderNo: first.orderNo,
        area: first.area,
        tableNumber: first.tableNumber,
        waiter: first.waiter,
        total: group.reduce((sum, order) => sum + order.total, 0),
        href: "/app/orders",
        actionLabel: selectText(lang, "Review & approve", "ይገምግሙ እና ያፅድቁ"),
      });
    }
  }

  if (isCashier) {
    orders
      .filter((order) => order.status === "PENDING_CASHIER")
      .forEach((order) => {
        notifications.push({
          id: `cashier-${order.id}`,
          kind: "cashier-request",
          title: selectText(lang, "Waiter order waiting", "የአስተናጋጅ ትዕዛዝ እየተጠበቀ"),
          detail: selectText(
            lang,
            `${order.waiter} sent ${order.items.length} item${order.items.length === 1 ? "" : "s"} for cashier acceptance.`,
            `${order.waiter} ${order.items.length} እቃ${order.items.length === 1 ? "" : "ዎች"} ለካሸር ማረጋገጫ ላከ።`,
          ),
          time: order.requestedAt ?? order.sentAt,
          tone: "ember",
          orderId: order.id,
          orderNo: order.orderNo,
          area: order.area,
          tableNumber: order.tableNumber,
          waiter: order.waiter,
          total: order.total,
          href: "/app/pos",
          actionLabel: selectText(lang, "Accept and send", "ተቀብለህ ላክ"),
        });
      });
  }

  if (["Storekeeper", "Inventory Staff", "Procurement Officer", "Accountant", "Branch Manager", "Administrator", "Inventory Administrator", "Store Manager", "Supervisor", "Chef", "Cashier", "Kitchen Staff", "Bartender", "Bar Staff", "Butcher House Staff", "Butcher Staff", "Coffee House Staff"].includes(role)) {
    const { allowedLocations } = resolveNotificationLocations(user, configuredStations);

    stock
      .filter((item) => item.quantity <= item.reorderLevel)
      .filter((item) => {
        if (!allowedLocations) return true;
        return allowedLocations.has(item.location);
      })
      .forEach((item) => {
        notifications.push({
          id: `stock-${item.itemId}-${item.location}`,
          kind: "stock-alert",
          title: selectText(lang, "Low stock alert", "ዝቅተኛ ክምችት ማስጠንቀቂያ"),
          detail: selectText(
            lang,
            `${item.itemName} at ${item.location} has ${item.availableQuantity ?? item.quantity} ${item.unit} sellable (reorder ${item.reorderLevel}). Store request from POS.`,
            `${item.itemName} በ ${item.location} ${item.availableQuantity ?? item.quantity} ${item.unit} ሊሸጥ የሚችል ቀርቷል (መደገፊያ ${item.reorderLevel}). ከPOS ጥያቄ ይላኩ።`,
          ),
          time: selectText(lang, "Inventory", "ክምችት"),
          tone: item.quantity <= 0 ? "ember" : "gold",
          orderId: "",
          orderNo: item.itemId,
          area: item.location,
          tableNumber: item.unit,
          waiter: "-",
          total: item.inventoryValue,
          href: role === "Cashier" || role === "Waiter" ? "/app/pos" : "/app/stock-management",
          actionLabel: selectText(lang, "Open stock", "ክምችት ክፈት"),
        });
      });

    requests
      .filter((request) => ACTIONABLE_STOCK_REQUEST_STATUSES.has(request.status))
      .filter((request) => requestAudienceMatch(user, request, allowedLocations))
      .forEach((request) => {
        const submitted = request.status === "Submitted";
        notifications.push({
          id: `stock-request-${request.id}-${request.status}`,
          kind: "stock-request",
          title: submitted
            ? selectText(lang, "Department stock request submitted", "የክፍል ክምችት ጥያቄ ቀርቧል")
            : selectText(lang, "Department stock request needs review", "የክፍል ክምችት ጥያቄ ግምገማ ይፈልጋል"),
          detail: selectText(
            lang,
            `${request.requestedBy} · ${request.requestNumber} · ${formatTransferCounterparty(request)} · ${request.status}.`,
            `${request.requestedBy} · ${request.requestNumber} · ${formatTransferCounterparty(request)} · ${request.status}.`,
          ),
          time: request.updatedAt ?? request.createdAt,
          tone: "ember",
          orderId: request.id,
          orderNo: request.requestNumber,
          area: request.requestingDepartment,
          tableNumber: request.requestedSourceStore,
          waiter: request.requestedBy,
          total: request.lines.reduce((sum, line) => sum + line.requestedQuantity, 0),
          href: "/app/stock-management",
          actionLabel: selectText(lang, "Review request", "ጥያቄውን ይመልከቱ"),
        });
      });

    transfers
      .filter((transfer) => ACTIONABLE_STOCK_TRANSFER_STATUSES.has(transfer.status))
      .filter((transfer) => transferAudienceMatch(user, transfer, allowedLocations))
      .forEach((transfer) => {
        const isPending = ["Pending Approval", "Approved", "Partially Approved", "Prepared"].includes(transfer.status);
        const isMoving = ["Dispatched", "Partially Received"].includes(transfer.status);
        notifications.push({
          id: `stock-transfer-${transfer.id}-${transfer.status}`,
          kind: "stock-transfer",
          title: isPending
            ? selectText(lang, "Stock transfer waiting action", "የክምችት ዝውውር እርምጃ ይጠብቃል")
            : isMoving
              ? selectText(lang, "Stock transfer in progress", "የክምችት ዝውውር በሂደት ላይ ነው")
              : selectText(lang, "Stock transfer needs action", "የክምችት ዝውውር እርምጃ ይፈልጋል"),
          detail: selectText(
            lang,
            `${transfer.transferNumber} · ${formatTransferCounterparty(transfer)} · ${transfer.status}.`,
            `${transfer.transferNumber} · ${formatTransferCounterparty(transfer)} · ${transfer.status}.`,
          ),
          time: transfer.receivedAt ?? transfer.dispatchedAt ?? transfer.sourceReservedAt ?? transfer.transferDate,
          tone: isPending ? "gold" : "ember",
          orderId: transfer.id,
          orderNo: transfer.transferNumber,
          area: transfer.sourceLocation,
          tableNumber: transfer.destinationLocation,
          waiter: transfer.sentBy || transfer.requestedBy || "-",
          total: transfer.lines.reduce((sum, line) => sum + line.sentQuantity + line.requestedQuantity, 0),
          href: "/app/stock-management",
          actionLabel: selectText(lang, "Open transfer", "ዝውውሩን ክፈት"),
        });
      });
  }

  const stationRoles = stationsForRole(role, configuredStations);
  if (stationRoles.length > 0) {
    const barScope = barScopeFromUser(user);
    orders
      .filter((order) => !isFinalOrderStatus(order.status) && order.status !== "PENDING_CASHIER")
      .forEach((order) => {
        order.stationTickets
          .filter(
            (ticket) =>
              (ticket.status === "NEW" || ticket.status === "PREPARING") &&
              stationRoles.some((station) => station.toLowerCase() === ticket.station.toLowerCase()) &&
              orderMatchesBarScope(order, barScope, ticket.station),
          )
          .forEach((ticket) => {
            notifications.push({
              id: `station-${order.id}-${ticket.id}-${ticket.status}`,
              kind: "station-ticket",
              title:
                ticket.status === "NEW"
                  ? selectText(lang, `New ${ticket.station} ticket`, `አዲስ ${ticket.station} ቲኬት`)
                  : selectText(lang, `${ticket.station} preparing`, `${ticket.station} እየተዘጋጀ`),
              detail: `${order.orderNo} · ${order.area} ${order.tableNumber} · ${ticket.items
                .map((item) => `${formatLineQty(item.qty, item.unitLabel)} ${orderLineName(item, menuItems, lang)}`)
                .join(", ")}`,
              time: ticket.sentAt,
              tone: ticket.status === "NEW" ? "ember" : "gold",
              orderId: order.id,
              orderNo: order.orderNo,
              area: order.area,
              tableNumber: order.tableNumber,
              waiter: order.waiter,
              total: order.total,
              href: "/app/kds",
              actionLabel: selectText(lang, "Open station tickets", "የጣቢያ ቲኬቶችን ክፈት"),
            });
          });
      });
  }

  if (role === "Waiter") {
    orders
      .filter(
        (order) =>
          !isFinalOrderStatus(order.status) &&
          (assignedWaiterMatches(order.waiter, user) ||
            assignedWaiterMatches(order.orderedByWaiter, user)),
      )
      .forEach((order) => {
        notifications.push({
          id: `waiter-${order.id}-${order.status}`,
          kind: "waiter-update",
          title: waiterTitle(order, lang),
          detail: `${order.area} ${order.tableNumber} - ${order.items
            .map((item) => `${formatLineQty(item.qty, item.unitLabel)} ${orderLineName(item, menuItems, lang)}`)
            .join(", ")}`,
          time:
            order.status === "PENDING_CASHIER"
              ? (order.requestedAt ?? order.sentAt)
              : (order.stationSentAt ?? order.sentAt),
          tone: waiterTone(order),
          orderId: order.id,
          orderNo: order.orderNo,
          area: order.area,
          tableNumber: order.tableNumber,
          waiter: order.waiter,
          total: order.total,
          href: "/app/pos",
        });
      });
  }

  return notifications.sort((a, b) => {
    const rank = (item: AppNotification) => {
      if (item.kind === "return-request") return 0;
      if (item.kind === "transfer-request" || item.kind === "void-request") return 1;
      if (item.tone === "ember") return 2;
      return 3;
    };
    const byKind = rank(a) - rank(b);
    if (byKind !== 0) return byKind;
    return a.time.localeCompare(b.time);
  });
}
