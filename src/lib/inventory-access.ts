import type { AuthUser } from "./auth-context.ts";
import {
  CENTRAL_STOCK_LOCATIONS,
  OPERATIONAL_STOCK_LOCATIONS,
  STOCK_LOCATIONS,
  inventoryPermissionSetForActor,
  inventoryPermissionSetForRole,
  isCentralStockLocation,
  isGoatPoolSku,
  isOperationalStockLocation,
  isStoreAssignmentRole,
  parseCentralStockLocation,
  resolveAssignedStoreForUser,
  type CentralStockLocation,
  type InventoryActorContext,
  type InventoryPermissionSet,
  type OperationalStockLocation,
  type StockLedgerEntry,
  type StockLocation,
  type StockLocationBalance,
} from "./stock-management.ts";

export type InventoryWorkspace = "all" | StockLocation;

export type InventoryPermissionFlags = {
  viewInventoryValue: boolean;
  canApproveRequests: boolean;
  canDispatchTransfers: boolean;
  canConfirmReceipts: boolean;
  canReceivePurchases: boolean;
  canApproveAdjustments: boolean;
  readOnly: boolean;
};

export type InventoryAccessContext = {
  userId: string;
  userName: string;
  role: string;
  branch: string;
  assignedLocations: StockLocation[];
  canViewAllLocations: boolean;
  permissions: InventoryPermissionFlags;
};

export type StockNavGroup = "overview" | "workflow" | "purchasing" | "distribution" | "control" | "recipes" | "admin";

export type StockTabId =
  | "dashboard"
  | "bar-stock"
  | "items"
  | "goat-processing"
  | "approval-inbox"
  | "receive-stock"
  | "requisitions"
  | "purchase-orders"
  | "grv"
  | "department-requests"
  | "issue-vouchers"
  | "store-transfer-vouchers"
  | "goods-returns"
  | "adjustment-vouchers"
  | "physical-counts"
  | "document-history"
  | "expenses"
  | "recipes"
  | "closing"
  | "daily-consumption"
  | "reports"
  | "settings";

const MANAGER_ROLES = new Set([
  "Administrator",
  "Inventory Administrator",
  "Branch Manager",
  "Supervisor",
  "Store Manager",
]);

const VALUE_VIEW_ROLES = new Set([
  "Administrator",
  "Inventory Administrator",
  "Branch Manager",
  "Store Manager",
  "Supervisor",
  "Procurement Officer",
  "Inventory Staff",
  "Storekeeper",
  "Accountant",
  "Auditor",
]);

const ROLE_DEFAULT_LOCATIONS: Record<string, StockLocation[]> = {
  Bartender: ["VIP Bar"],
  "Bar Staff": ["Main Bar"],
  "Kitchen Staff": ["Kitchen"],
  Chef: ["Kitchen"],
  "Butcher House Staff": ["Butcher"],
  "Butcher Staff": ["Butcher"],
  "Coffee House Staff": ["Coffee House"],
  Storekeeper: ["Store 1"],
  "Inventory Staff": ["Store 1"],
  "Procurement Officer": ["Store 1"],
};

const DISPLAY_LABELS: Record<StockLocation, string> = {
  "Store 1": "Store 1",
  "Store 2": "Store 2",
  "Main Bar": "Main Bar",
  "VIP Bar": "VIP Bar",
  Kitchen: "Kitchen",
  Butcher: "Butcher House",
  "Coffee House": "Coffee House",
};

export function stockLocationLabel(location: StockLocation | string): string {
  return DISPLAY_LABELS[location as StockLocation] ?? location;
}

export function parseStockLocation(value?: string | null): StockLocation | null {
  const normalized = value?.trim();
  if (!normalized) return null;
  if (normalized === "Butcher House") return "Butcher";
  if ((STOCK_LOCATIONS as readonly string[]).includes(normalized)) return normalized as StockLocation;
  return null;
}

export function resolveUserAssignedLocations(
  user: Pick<AuthUser, "role" | "assignedStore" | "assignedInventoryLocations">,
  inventoryLocation?: string,
): StockLocation[] {
  if (user.assignedInventoryLocations?.length) {
    return [...new Set(user.assignedInventoryLocations)];
  }
  const assignedStore = resolveAssignedStoreForUser(user, inventoryLocation);
  if (assignedStore) return [assignedStore];
  const parsed = parseStockLocation(inventoryLocation);
  if (parsed) return [parsed];
  if (MANAGER_ROLES.has(user.role)) return [...STOCK_LOCATIONS];
  return ROLE_DEFAULT_LOCATIONS[user.role] ?? [];
}

export function buildInventoryPermissionFlags(role: string, permissionSet: InventoryPermissionSet): InventoryPermissionFlags {
  return {
    viewInventoryValue: VALUE_VIEW_ROLES.has(role),
    canApproveRequests: permissionSet.canApproveRequests,
    canDispatchTransfers: permissionSet.canDispatchTransfers,
    canConfirmReceipts: permissionSet.canConfirmReceipts,
    canReceivePurchases: permissionSet.canReceivePurchases,
    canApproveAdjustments: permissionSet.canApproveAdjustments,
    readOnly: permissionSet.readOnly,
  };
}

export function buildInventoryAccessContext(
  user: AuthUser,
  inventoryLocation?: string,
): InventoryAccessContext {
  const assignedLocations = resolveUserAssignedLocations(user, inventoryLocation);
  const actor: InventoryActorContext = {
    userName: user.name,
    role: user.role,
    assignedStore: user.assignedStore ?? resolveAssignedStoreForUser(user, inventoryLocation),
    allowedLocations: assignedLocations.length === 1 ? assignedLocations : undefined,
  };
  const permissionSet = inventoryPermissionSetForActor(actor);
  const canViewAllLocations = MANAGER_ROLES.has(user.role) || permissionSet.canViewAllLocations;
  return {
    userId: user.id,
    userName: user.name,
    role: user.role,
    branch: user.branch,
    assignedLocations: canViewAllLocations ? [...STOCK_LOCATIONS] : assignedLocations,
    canViewAllLocations,
    permissions: buildInventoryPermissionFlags(user.role, permissionSet),
  };
}

export function buildInventoryActorContext(access: InventoryAccessContext): InventoryActorContext {
  const central = access.assignedLocations.find((loc): loc is CentralStockLocation => isCentralStockLocation(loc));
  return {
    userName: access.userName,
    role: access.role,
    assignedStore: central,
    allowedLocations: access.canViewAllLocations ? undefined : access.assignedLocations,
  };
}

export function resolveAuthorizedLocations(access: InventoryAccessContext): StockLocation[] | "all" {
  if (access.canViewAllLocations) return "all";
  return access.assignedLocations;
}

export function isManagerInventoryRole(role: string): boolean {
  return MANAGER_ROLES.has(role);
}

export function isDepartmentInventoryUser(access: InventoryAccessContext): boolean {
  if (access.canViewAllLocations) return false;
  return access.assignedLocations.every((loc) => isOperationalStockLocation(loc));
}

export function isCentralStoreUser(access: InventoryAccessContext): boolean {
  if (access.canViewAllLocations) return false;
  return access.assignedLocations.every((loc) => isCentralStockLocation(loc));
}

/**
 * Department issue vouchers: only the destination department confirms receipt.
 * Store keepers and branch-wide managers must not post TRANSFER_IN for VIP/Main Bar/etc.
 */
export function canConfirmDepartmentIssueReceipt(
  access: InventoryAccessContext,
  destination: StockLocation,
): boolean {
  if (!access.permissions.canConfirmReceipts) return false;
  if (!isOperationalStockLocation(destination)) return false;
  if (access.canViewAllLocations || isCentralStoreUser(access)) return false;
  return access.assignedLocations.includes(destination);
}

/** Roles allowed to create/edit/delete stock master items across stores. */
const STOCK_MASTER_MANAGER_ROLES = new Set([
  "Branch Manager",
  "Administrator",
  "Inventory Administrator",
  "Store Manager",
]);

/** Store 1 / Store 2 keepers and branch-level managers may manage the stock catalog. */
export function canManageStockMasterCatalog(access: InventoryAccessContext): boolean {
  if (access.permissions.readOnly) return false;
  if (STOCK_MASTER_MANAGER_ROLES.has(access.role)) return true;
  return isCentralStoreUser(access) && access.assignedLocations.length > 0;
}

/**
 * Store keepers may only edit items belonging to their store (preferredLocation).
 * Branch managers may edit any catalog item.
 */
export function canManageStockMasterItem(
  access: InventoryAccessContext,
  item: { id?: string; preferredLocation: StockLocation },
): boolean {
  if (item.id && isGoatPoolSku(item.id)) return false;
  if (!canManageStockMasterCatalog(access)) return false;
  if (STOCK_MASTER_MANAGER_ROLES.has(access.role)) return true;
  return (
    isCentralStockLocation(item.preferredLocation) &&
    access.assignedLocations.includes(item.preferredLocation)
  );
}

export function canViewInventoryValue(access: InventoryAccessContext, location?: StockLocation): boolean {
  if (!access.permissions.viewInventoryValue) return false;
  if (!location) return true;
  return locationIsAuthorized(access, location);
}

export function locationIsAuthorized(access: InventoryAccessContext, location: StockLocation): boolean {
  const authorized = resolveAuthorizedLocations(access);
  if (authorized === "all") return true;
  return authorized.includes(location);
}

export function assertLocationAccess(access: InventoryAccessContext, location: StockLocation): void {
  if (!locationIsAuthorized(access, location)) {
    throw new Error(`You are not authorized to access ${stockLocationLabel(location)} inventory.`);
  }
}

export function resolveEffectiveWorkspace(
  access: InventoryAccessContext,
  workspace?: InventoryWorkspace | null,
): InventoryWorkspace {
  const authorized = resolveAuthorizedLocations(access);
  if (authorized !== "all" && authorized.length === 1) return authorized[0]!;
  if (workspace && workspace !== "all" && locationIsAuthorized(access, workspace)) return workspace;
  if (access.canViewAllLocations) return workspace ?? "all";
  if (authorized.length > 0) return authorized[0]!;
  return "all";
}

export function workspaceLocations(workspace: InventoryWorkspace): StockLocation[] | "all" {
  if (workspace === "all") return "all";
  return [workspace];
}

export function workspaceLabel(workspace: InventoryWorkspace): string {
  if (workspace === "all") return "All Locations";
  return stockLocationLabel(workspace);
}

export function workspaceOptions(access: InventoryAccessContext): InventoryWorkspace[] {
  const authorized = resolveAuthorizedLocations(access);
  if (authorized === "all") return ["all", ...STOCK_LOCATIONS];
  if (authorized.length <= 1) return authorized.length ? [authorized[0]!] : [];
  return authorized;
}

export function shouldShowWorkspaceSelector(access: InventoryAccessContext): boolean {
  const authorized = resolveAuthorizedLocations(access);
  if (authorized === "all") return true;
  return authorized.length > 1;
}

/** Store 1 / Store 2 rows for department request availability (not workspace-scoped). */
export function filterCentralStoreBalances(balances: StockLocationBalance[]): StockLocationBalance[] {
  return balances.filter((row) => isCentralStockLocation(row.location));
}

export function scopeBalances(
  access: InventoryAccessContext,
  balances: StockLocationBalance[],
  workspace: InventoryWorkspace = "all",
): StockLocationBalance[] {
  const locations = workspaceLocations(workspace);
  const authorized = resolveAuthorizedLocations(access);
  return balances.filter((row) => {
    if (authorized !== "all" && !authorized.includes(row.location)) return false;
    if (locations !== "all" && !locations.includes(row.location)) return false;
    return true;
  });
}

export function scopeLedger(
  access: InventoryAccessContext,
  ledger: StockLedgerEntry[],
  workspace: InventoryWorkspace = "all",
): StockLedgerEntry[] {
  const locations = workspaceLocations(workspace);
  const authorized = resolveAuthorizedLocations(access);
  return ledger.filter((entry) => {
    const entryLocations = [entry.location, entry.fromLocation, entry.toLocation].filter(Boolean) as StockLocation[];
    const matchesWorkspace =
      locations === "all" || entryLocations.some((loc) => locations.includes(loc)) || entryLocations.length === 0;
    const matchesAuth =
      authorized === "all" || entryLocations.some((loc) => authorized.includes(loc)) || entryLocations.length === 0;
    return matchesWorkspace && matchesAuth;
  });
}

export function scopeByLocationField<T>(
  access: InventoryAccessContext,
  rows: T[],
  pick: (row: T) => StockLocation | undefined,
  workspace: InventoryWorkspace = "all",
): T[] {
  const locations = workspaceLocations(workspace);
  const authorized = resolveAuthorizedLocations(access);
  return rows.filter((row) => {
    const loc = pick(row);
    if (!loc) return authorized === "all";
    if (authorized !== "all" && !authorized.includes(loc)) return false;
    if (locations !== "all" && !locations.includes(loc)) return false;
    return true;
  });
}

export function scopeByTransferEndpoints<T>(
  access: InventoryAccessContext,
  rows: T[],
  pickSource: (row: T) => StockLocation | undefined,
  pickDestination: (row: T) => StockLocation | undefined,
  workspace: InventoryWorkspace = "all",
): T[] {
  const locations = workspaceLocations(workspace);
  const authorized = resolveAuthorizedLocations(access);
  return rows.filter((row) => {
    const source = pickSource(row);
    const destination = pickDestination(row);
    const endpoints = [source, destination].filter(Boolean) as StockLocation[];
    if (endpoints.length === 0) return authorized === "all";
    const matchesAuth = authorized === "all" || endpoints.some((loc) => authorized.includes(loc));
    const matchesWorkspace = locations === "all" || endpoints.some((loc) => locations.includes(loc));
    return matchesAuth && matchesWorkspace;
  });
}

export const DEPARTMENT_STOCK_TABS: StockTabId[] = [
  "dashboard",
  "approval-inbox",
  "receive-stock",
  "items",
  "department-requests",
  "issue-vouchers",
  "store-transfer-vouchers",
  "goods-returns",
  "daily-consumption",
  "physical-counts",
  "closing",
  "reports",
];

/** Butcher House: goat registration + operational documents only (no store purchasing / generic catalog). */
export const BUTCHER_STOCK_TABS: StockTabId[] = [
  "goat-processing",
  "approval-inbox",
  "receive-stock",
  "department-requests",
  "issue-vouchers",
  "store-transfer-vouchers",
  "physical-counts",
  "adjustment-vouchers",
];

export const CENTRAL_STORE_TABS: StockTabId[] = [
  "dashboard",
  "approval-inbox",
  "receive-stock",
  "items",
  "requisitions",
  "purchase-orders",
  "grv",
  "department-requests",
  "issue-vouchers",
  "store-transfer-vouchers",
  "goods-returns",
  "adjustment-vouchers",
  "physical-counts",
  "document-history",
  "expenses",
  "closing",
  "reports",
  "settings",
];

export const MANAGER_STOCK_TABS: StockTabId[] = [
  "dashboard",
  "approval-inbox",
  "receive-stock",
  "items",
  "requisitions",
  "purchase-orders",
  "grv",
  "department-requests",
  "issue-vouchers",
  "store-transfer-vouchers",
  "goods-returns",
  "adjustment-vouchers",
  "physical-counts",
  "daily-consumption",
  "document-history",
  "expenses",
  "recipes",
  "closing",
  "reports",
  "settings",
];

export function isButcherInventoryWorkspace(
  access: InventoryAccessContext,
  workspace: InventoryWorkspace = "all",
): boolean {
  if (workspace === "Butcher") return true;
  if (access.canViewAllLocations) return false;
  return access.assignedLocations.length === 1 && access.assignedLocations[0] === "Butcher";
}

export function supportsDailyConsumption(workspace: InventoryWorkspace): boolean {
  return workspace === "all" || workspace === "Kitchen" || workspace === "Coffee House";
}

/** Kitchen (and all-locations managers) can view/create Recipe / BOM. */
export function supportsRecipeBom(workspace: InventoryWorkspace): boolean {
  return workspace === "all" || workspace === "Kitchen";
}

export function supportsBarStockView(workspace: InventoryWorkspace): boolean {
  return workspace === "Main Bar" || workspace === "VIP Bar";
}

export function allowedStockTabs(
  access: InventoryAccessContext,
  workspace: InventoryWorkspace = "all",
): StockTabId[] {
  if (isButcherInventoryWorkspace(access, workspace)) {
    return [...BUTCHER_STOCK_TABS];
  }

  let tabs: StockTabId[];
  if (access.canViewAllLocations) tabs = [...MANAGER_STOCK_TABS];
  else if (isDepartmentInventoryUser(access)) tabs = [...DEPARTMENT_STOCK_TABS];
  else if (isCentralStoreUser(access)) tabs = [...CENTRAL_STORE_TABS];
  else tabs = [...DEPARTMENT_STOCK_TABS];

  if (!supportsDailyConsumption(workspace)) {
    tabs = tabs.filter((tab) => tab !== "daily-consumption");
  }

  if (!supportsBarStockView(workspace)) {
    tabs = tabs.filter((tab) => tab !== "bar-stock");
  }

  if (supportsRecipeBom(workspace) && !tabs.includes("recipes")) {
    tabs = [...tabs, "recipes"];
  }

  return tabs;
}

export function stockTabNavGroup(tab: StockTabId): StockNavGroup {
  if (tab === "goat-processing") return "overview";
  if (["dashboard", "items"].includes(tab)) return "overview";
  if (["approval-inbox", "receive-stock"].includes(tab)) return "workflow";
  if (["requisitions", "purchase-orders", "grv"].includes(tab)) return "purchasing";
  if (["department-requests", "issue-vouchers", "store-transfer-vouchers", "goods-returns"].includes(tab)) return "distribution";
  if (["adjustment-vouchers", "physical-counts", "daily-consumption", "closing"].includes(tab)) return "control";
  if (tab === "recipes") return "recipes";
  return "admin";
}

export function validateAssignedInventoryLocations(
  role: string,
  locations?: StockLocation[],
): string | null {
  if (!locations?.length) {
    if (isStoreAssignmentRole(role)) return "Store roles must be assigned to at least one central store.";
    if (ROLE_DEFAULT_LOCATIONS[role]) return "This role requires at least one inventory location assignment.";
    return null;
  }
  for (const loc of locations) {
    if (!(STOCK_LOCATIONS as readonly string[]).includes(loc)) return `Invalid inventory location: ${loc}`;
  }
  if (isStoreAssignmentRole(role)) {
    const hasCentral = locations.some((loc) => isCentralStockLocation(loc));
    if (!hasCentral) return "Store roles must include Store 1 and/or Store 2.";
    const hasOperational = locations.some((loc) => isOperationalStockLocation(loc));
    if (hasOperational) return "Store roles cannot be assigned to operational departments.";
  }
  return null;
}

export function locationsFromAuthInput(input: {
  role: string;
  assignedStore?: CentralStockLocation;
  assignedInventoryLocations?: StockLocation[];
}): StockLocation[] {
  if (input.assignedInventoryLocations?.length) return [...new Set(input.assignedInventoryLocations)];
  if (input.assignedStore) return [input.assignedStore];
  return [];
}

export function operationalLocationForRole(role: string): OperationalStockLocation | null {
  const defaults = ROLE_DEFAULT_LOCATIONS[role];
  const match = defaults?.find((loc): loc is OperationalStockLocation => isOperationalStockLocation(loc));
  return match ?? null;
}

export function inventoryPermissionSetForAccess(access: InventoryAccessContext): InventoryPermissionSet {
  return inventoryPermissionSetForActor(buildInventoryActorContext(access));
}

/** Locations where an item currently has a balance row (scoped balances expected). */
export function itemBalanceLocations(itemId: string, balances: StockLocationBalance[]): StockLocation[] {
  return Array.from(
    new Set(balances.filter((row) => row.itemId === itemId).map((row) => row.location)),
  ).sort((a, b) => a.localeCompare(b));
}

export function itemAvailableQuantity(
  itemId: string,
  balances: StockLocationBalance[],
  location?: StockLocation | "ALL",
): number {
  return balances
    .filter(
      (row) =>
        row.itemId === itemId &&
        (location === undefined || location === "ALL" || row.location === location),
    )
    .reduce((sum, row) => sum + (row.availableQuantity ?? row.quantity), 0);
}

export function itemIncomingQuantity(
  itemId: string,
  balances: StockLocationBalance[],
  location?: StockLocation | "ALL",
): number {
  return balances
    .filter(
      (row) =>
        row.itemId === itemId &&
        (location === undefined || location === "ALL" || row.location === location),
    )
    .reduce((sum, row) => sum + (row.incomingQuantity ?? 0), 0);
}

/**
 * Catalog preferredLocation stays on the warehouse for purchasing.
 * Department users should see where *their* stock sits after issue/receive.
 */
export function displayItemStockLocation(
  item: { id: string; preferredLocation: StockLocation },
  balances: StockLocationBalance[],
  access: InventoryAccessContext | null | undefined,
  workspace: InventoryWorkspace = "all",
): string {
  if (!access || access.canViewAllLocations) return item.preferredLocation;
  if (workspace !== "all") return workspace;
  const locs = itemBalanceLocations(item.id, balances);
  if (locs.length > 0) return locs.join(", ");
  const assignedOps = access.assignedLocations.filter(isOperationalStockLocation);
  return assignedOps[0] ?? access.assignedLocations[0] ?? item.preferredLocation;
}

export function itemMatchesLocationFilter(
  item: { id: string; preferredLocation: StockLocation },
  balances: StockLocationBalance[],
  locationFilter: string,
  departmentScoped: boolean,
): boolean {
  if (locationFilter === "ALL") return true;
  if (!departmentScoped) return item.preferredLocation === locationFilter;
  return itemBalanceLocations(item.id, balances).includes(locationFilter as StockLocation);
}
