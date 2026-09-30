import { createFileRoute, useNavigate, useSearch } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import * as Icons from "lucide-react";
import type { LucideIcon } from "lucide-react";

import { ApprovalInboxPanel } from "@/components/stock/approval-inbox-panel";
import { BarStockPanel } from "@/components/stock/bar-stock-panel";
import { CoffeeHouseOpsPanel } from "@/components/stock/coffee-house-ops-panel";
import { KitchenOpsPanel } from "@/components/stock/kitchen-ops-panel";
import { DailyConsumptionPanel, resolveDailyConsumptionDepartments } from "@/components/stock/daily-consumption-panel";
import { GoatRegistrationPanel } from "@/components/stock/goat-registration-panel";
import { ReceiveStockPanel } from "@/components/stock/receive-stock-panel";
import { StaffConsumptionDashboardPanel } from "@/components/stock/staff-consumption-dashboard-panel";
import { StockNavTabs } from "@/components/stock/stock-shell";
import { Card, Chip, Stat } from "@/components/ui-kit";
import { StockWorkspaceHeader } from "@/components/stock/stock-workspace-header";
import { countBarStockDrinkItems } from "@/lib/bar-stock-view";
import { findStoreIssueVoucherForRequest } from "@/lib/store-issue-voucher-utils";
import {
  allowedStockTabs,
  assertLocationAccess,
  buildInventoryAccessContext,
  buildInventoryActorContext,
  canManageStockMasterCatalog,
  canManageStockMasterItem,
  canConfirmDepartmentIssueReceipt,
  displayItemStockLocation,
  inventoryPermissionSetForAccess,
  isButcherInventoryWorkspace,
  itemAvailableQuantity,
  itemIncomingQuantity,
  itemMatchesLocationFilter,
  parseStockLocation,
  resolveAuthorizedLocations,
  resolveEffectiveWorkspace,
  stockLocationLabel,
  supportsBarStockView,
  supportsDailyConsumption,
  supportsRecipeBom,
  type InventoryAccessContext,
  type InventoryWorkspace,
  type StockTabId,
} from "@/lib/inventory-access";
import { isKitchenManagedRecipe } from "@/lib/kitchen-ops";
import { useScopedStockModule, type ScopedStockModule } from "@/lib/inventory-scoped-module";
import { useAuth, canManageStaffConsumption } from "@/lib/auth-context";
import type { Supplier } from "@/lib/demo-data";
import { recipeLineFromStockItem, suggestRecipeFromMenuItem } from "@/lib/recipe-suggestions";
import {
  formatDashboardMoney,
  MoneyVisibilityToggle,
  useHideMoney,
} from "@/lib/dashboard-privacy";
import { formatETB } from "@/lib/ethiopic";
import { useT } from "@/lib/i18n";
import { showError, showInfo, showSuccess } from "@/lib/toast";
import {
  createDailyConsumptionDocument,
  postDailyConsumptionDocument as commitDailyConsumption,
  buildDailyConsumptionReport,
  type DailyConsumptionDepartment,
} from "@/lib/daily-consumption";
import {
  buildStockWorkflowTasks,
  requestToDepartmentDocument,
  summarizeStockWorkflowTasks,
  type StockWorkflowTask,
} from "@/lib/stock-workflow-inbox";
import { stationsForRole } from "@/lib/notifications";
import {
  approveDepartmentStockRequestAsActor,
  approvePurchaseOrderAsActor,
  approvePurchaseRequisitionAsActor,
  approveAndPostPhysicalCountAsActor,
  appendImmutableLedgerEntries,
  applyKiklBoneKgPerPlate,
  availableQuantityAtLocation,
  buildApprovalActivityReport,
  buildBatchReport,
  buildConsumptionReport,
  buildCountVarianceReport,
  buildExpiryAlerts,
  buildPosIntegratedReports,
  buildPurchaseOrderReceivingReport,
  buildStockMovementSummary,
  buildStockValuationReport,
  confirmGoodsReceivingVoucherAsActor,
  convertStockQuantity,
  createCancellationReversalVoucher,
  createCancellationReversalVoucherAsActor,
  createDepartmentStockRequest,
  createPhysicalCountSessionAsActor,
  convertDepartmentRequestToIssueVoucherAsActor,
  convertPurchaseRequisitionToPurchaseOrderAsActor,
  dispatchStockTransfer,
  dispatchStoreIssueVoucherAsActor,
  exportRowsToCsv,
  exportRowsToXlsx,
  downloadXlsxBytes,
  inferBeerTier,
  isDraftBeerItem,
  isSpecialBeerItem,
  applySpiritYieldConversions,
  DEFAULT_DOUBLES_PER_BOTTLE,
  spiritYieldForItem,
  INVENTORY_COSTING_METHODS,
  nextInventoryDocumentNumber,
  POS_DEDUCTION_TIMINGS,
  POS_OOS_BEHAVIORS,
  POS_RESERVATION_TRIGGERS,
  isCentralStockLocation,
  isGoatPoolSku,
  isOperationalStockLocation,
  inventoryPermissionSetForRole,
  openInventoryPrintReport,
  OPERATIONAL_STOCK_LOCATIONS,
  quarantineLotsForReturn,
  receiveStockTransfer,
  receiveStoreIssueVoucherAsActor,
  rejectDepartmentStockRequestAsActor,
  resolveDailyDashboardPeriodStart,
  resolvePreferredSourceStore,
  STOCK_EXPENSE_DEPARTMENTS,
  STOCK_ITEM_CATEGORIES,
  STOCK_LOCATIONS,
  STOCK_REQUEST_PRIORITIES,
  STOCK_ADJUSTMENT_REASONS,
  STOCK_UNIT_TYPES,
  toDepartmentStockRequestDocument,
  toStockRequestRecord,
  validateInventoryDocumentApproval,
  type DepartmentStockRequestDocument,
  type GoodsReturnVoucherDocument,
  type GoodsReceivingVoucherDocument,
  type InventoryActorContext,
  type InventoryApprovalHistoryEntry,
  type InventoryCostingMethod,
  type InventorySettingsRecord,
  type LocationStockPolicy,
  type PosDeductionTiming,
  type PosOutOfStockBehavior,
  type PosReservationTrigger,
  type PosStockReservation,
  type PreferredSourcePreference,
  type OperationalStockLocation,
  type PurchaseOrderDocument,
  type PurchaseRequisitionDocument,
  type StockAdjustmentReason,
  type StockAdjustmentVoucherDocument,
  type StockClosingRecord,
  type StockCountSession,
  type StockExpenseDepartment,
  type StockLedgerEntry,
  type StockLot,
  type StockRequestPriority,
  type StockReturnReason,
  type StockTransferLine,
  type StoreIssueVoucherDocument,
  type StoreTransferVoucherDocument,
  type StockLocation,
  type StockManagedItem,
  type StockRecipe,
  type StockRecipeLine,
  type StockUnitType,
} from "@/lib/stock-management";
import { useStore } from "@/lib/store";
import { dateKey, filterSalesAfterDashboardPeriod, filterSalesForOperationalLocations, groupSalesByProduct, summarizeSales } from "@/lib/sales-analytics";

function authorizedLocationOptions(access: InventoryAccessContext | null | undefined): StockLocation[] {
  if (!access) return STOCK_LOCATIONS as StockLocation[];
  const authorized = resolveAuthorizedLocations(access);
  // Return stable references — never spread into a new array here (child effects depend on identity).
  return authorized === "all" ? (STOCK_LOCATIONS as StockLocation[]) : authorized;
}

function defaultStockMasterLocation(access: InventoryAccessContext): StockLocation {
  const central = access.assignedLocations.find(isCentralStockLocation);
  return central ?? "Store 1";
}

function stockMasterLocationOptions(access: InventoryAccessContext): StockLocation[] {
  if (
    access.canViewAllLocations ||
    access.role === "Branch Manager" ||
    access.role === "Store Manager" ||
    access.role === "Administrator" ||
    access.role === "Inventory Administrator"
  ) {
    return STOCK_LOCATIONS as StockLocation[];
  }
  return access.assignedLocations.filter(isCentralStockLocation);
}

export const Route = createFileRoute("/app/stock-management")({
  component: StockManagementPage,
  validateSearch: (search: Record<string, unknown>) => ({
    workspace: typeof search.workspace === "string" ? search.workspace : undefined,
  }),
});

type StockTab = StockTabId;

function money(value: number) {
  return Math.round((Number.isFinite(value) ? value : 0) * 100) / 100;
}

function qty(value: number) {
  return Math.round((Number.isFinite(value) ? value : 0) * 1000) / 1000;
}

function todayKey(date = new Date()) {
  return date.toISOString().slice(0, 10);
}

function nowUserName(name?: string) {
  return name?.trim() || "System User";
}

function normalizeLabel(value: string) {
  return value.trim().toLowerCase();
}

function isManagerRole(role?: string) {
  return role === "Branch Manager" || role === "Administrator" || role === "Supervisor" || role === "Store Manager" || role === "Inventory Administrator";
}

function rolesForStockLocation(location: StockLocation) {
  if (location === "Store 1" || location === "Store 2") {
    return ["Storekeeper", "Inventory Staff", "Procurement Officer", "Branch Manager", "Administrator", "Supervisor"];
  }
  if (location === "Kitchen") {
    return ["Kitchen Staff", "Chef", "Branch Manager", "Administrator", "Supervisor"];
  }
  if (location === "Butcher") {
    return ["Butcher House Staff", "Butcher Staff", "Chef", "Branch Manager", "Administrator", "Supervisor"];
  }
  if (location === "Coffee House") {
    return ["Coffee House Staff", "Branch Manager", "Administrator", "Supervisor"];
  }
  return ["Bartender", "Bar Staff", "Branch Manager", "Administrator", "Supervisor"];
}

function locationMatchesStation(location: StockLocation, station: string) {
  const locationKey = normalizeLabel(location);
  const stationKey = normalizeLabel(station);
  if (locationKey.includes("bar")) return stationKey.includes("bar") || stationKey.includes("beverage") || stationKey.includes("drink");
  if (locationKey.includes("kitchen")) return stationKey.includes("kitchen");
  if (locationKey.includes("butcher") || locationKey.includes("siga")) return stationKey.includes("butcher") || stationKey.includes("meat") || stationKey.includes("grill");
  if (locationKey.includes("coffee")) return stationKey.includes("coffee") || stationKey.includes("buna");
  return false;
}

function receiverCandidatesForLocation(
  location: StockLocation,
  users: Array<{ name: string; role: string }>,
  stations: readonly string[],
) {
  const allowedRoles = new Set(rolesForStockLocation(location));
  return users
    .filter((candidate) => {
      if (allowedRoles.has(candidate.role)) return true;
      const scopedStations = stationsForRole(candidate.role as never, stations);
      return scopedStations.some((station) => locationMatchesStation(location, station));
    })
    .map((candidate) => candidate.name)
    .filter(Boolean)
    .filter((name, index, list) => list.findIndex((item) => item.toLowerCase() === name.toLowerCase()) === index)
    .sort((a, b) => a.localeCompare(b));
}

function refNo(prefix: string) {
  return `${prefix}-${Date.now()}`;
}

function downloadCsv(filename: string, csv: string) {
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}

function emptyItem(preferredLocation: StockLocation = "Store 1"): StockManagedItem {
  const stamp = new Date().toISOString();
  return {
    id: `stk-${Date.now()}`,
    name: "",
    category: "Bar",
    baseUnit: "bottle",
    purchasePrice: 0,
    sellingPrice: 0,
    vipSellingPrice: 0,
    reorderLevel: 0,
    currentStock: 0,
    preferredLocation,
    supplierName: "",
    conversions: [],
    notes: "",
    createdAt: stamp,
    updatedAt: stamp,
  };
}

function emptyRecipe(): StockRecipe {
  return {
    id: `srecipe-${Date.now()}`,
    menuItemName: "",
    category: "Kitchen",
    outputQty: 1,
    outputUnit: "portion",
    preparationStation: "Kitchen",
    stockDeductionLocation: "Kitchen",
    ingredients: [],
    notes: "",
    updatedAt: new Date().toISOString(),
  };
}

function tabButtonClass(active: boolean) {
  return `h-9 px-4 rounded-full text-sm font-medium ${active ? "bg-foreground text-background" : "bg-card border border-border text-muted-foreground hover:text-foreground"}`;
}

const STOCK_TABLE_PAGE_SIZE = 10;

function StockManagementPage() {
  const t = useT();
  const { hidden: hideMoney, toggle: toggleHideMoney } = useHideMoney();
  const money = (value: number) => formatDashboardMoney(value, hideMoney);
  const { user, users } = useAuth();
  const store = useStore();
  const navigate = useNavigate();
  const { workspace: workspaceParam } = useSearch({ from: "/app/stock-management" });
  const access = useMemo(() => (user ? buildInventoryAccessContext(user) : null), [user]);
  const workspace = useMemo(
    () =>
      access
        ? resolveEffectiveWorkspace(
            access,
            (parseStockLocation(workspaceParam) ?? (workspaceParam === "all" ? "all" : null)) as InventoryWorkspace | null,
          )
        : "all",
    [access, workspaceParam],
  );
  const stockModule = useScopedStockModule(
    access ??
      buildInventoryAccessContext({
        id: "guest",
        name: "Guest",
        role: "Waiter",
        branch: "Bole",
        avatar: "G",
        password: "",
      }),
    workspace,
    store.salesRecords,
  );
  const [tab, setTab] = useState<StockTab>("dashboard");
  const [editingItem, setEditingItem] = useState<StockManagedItem | null>(null);
  const [editingRecipe, setEditingRecipe] = useState<StockRecipe | null>(null);
  const [itemSearch, setItemSearch] = useState("");
  const [itemCategoryFilter, setItemCategoryFilter] = useState("ALL");
  const [itemLocationFilter, setItemLocationFilter] = useState("ALL");
  const [itemPage, setItemPage] = useState(1);
  const scopedLocation =
    access && !access.canViewAllLocations && access.assignedLocations.length === 1
      ? access.assignedLocations[0]
      : null;
  const defaultDepartment =
    scopedLocation && isOperationalStockLocation(scopedLocation)
      ? (scopedLocation as OperationalStockLocation)
      : null;
  const isDepartmentScopedUser = Boolean(
    access && !access.canViewAllLocations && access.assignedLocations.every((loc) => isOperationalStockLocation(loc)),
  );
  const isButcherWorkspace = Boolean(access && isButcherInventoryWorkspace(access, workspace));
  const showStaffConsumptionDetail = Boolean(user && canManageStaffConsumption(user.role));
  const showBarStockView = supportsBarStockView(workspace);
  const canManageStockMaster = Boolean(access && canManageStockMasterCatalog(access));
  const actorContext: InventoryActorContext = useMemo(
    () => (access ? buildInventoryActorContext(access) : { userName: "System", role: "Unknown" }),
    [access],
  );
  const actorPermissions = useMemo(
    () => (access ? inventoryPermissionSetForAccess(access) : inventoryPermissionSetForRole(actorContext.role)),
    [access, actorContext.role],
  );
  const workflowTasks = useMemo(
    () =>
      access
        ? buildStockWorkflowTasks({
            access,
            permissions: access.permissions,
            workspace,
            module: {
              purchaseRequisitions: stockModule.purchaseRequisitions,
              purchaseOrders: stockModule.purchaseOrders,
              requests: stockModule.allRequests,
              storeIssueVouchers: stockModule.allStoreIssueVouchers,
              storeTransferVouchers: stockModule.storeTransferVouchers,
              goodsReturnVouchers: stockModule.goodsReturnVouchers,
              counts: stockModule.counts,
            },
          })
        : [],
    [
      access,
      workspace,
      stockModule.purchaseRequisitions,
      stockModule.purchaseOrders,
      stockModule.allRequests,
      stockModule.allStoreIssueVouchers,
      stockModule.storeTransferVouchers,
      stockModule.goodsReturnVouchers,
      stockModule.counts,
    ],
  );
  const workflowSummary = useMemo(() => summarizeStockWorkflowTasks(workflowTasks), [workflowTasks]);
  const receiveWorkflowTasks = useMemo(
    () => workflowTasks.filter((row) => row.bucket === "receive"),
    [workflowTasks],
  );

  function handleWorkflowTask(task: StockWorkflowTask) {
    if (!task.canAct) {
      setTab(task.sourceTab);
      return;
    }
    try {
      if (task.action === "approve") {
        if (task.documentType === "Purchase Requisition") approvePurchaseRequisitionDocument(task.entityId);
        else if (task.documentType === "Purchase Order") approvePurchaseOrderDocument(task.entityId);
        else if (task.documentType === "Department Stock Request") approveDepartmentRequestDocument(task.entityId);
        else if (task.documentType === "Store Transfer Voucher") approveStoreTransferVoucherDocument(task.entityId);
        else if (task.documentType === "Goods Return Voucher") approveAndPostGoodsReturnDocument(task.entityId);
        else if (task.documentType === "Physical Stock Count") approvePhysicalCountDocument(task.entityId);
        else setTab(task.sourceTab);
        return;
      }
      if (task.action === "dispatch") {
        if (task.documentType === "Store Issue Voucher") dispatchIssueVoucherDocument(task.entityId);
        else if (task.documentType === "Store Transfer Voucher") dispatchStoreTransferVoucherDocument(task.entityId);
        return;
      }
      if (task.action === "receive") {
        if (task.documentType === "Store Issue Voucher") receiveIssueVoucherDocument(task.entityId);
        else if (task.documentType === "Store Transfer Voucher") receiveStoreTransferVoucherDocument(task.entityId);
        return;
      }
      if (task.action === "convert-issue") {
        const request =
          stockModule.issueVoucherRequests.find((row) => row.id === task.entityId) ??
          stockModule.allRequests.find((row) => row.id === task.entityId);
        if (!request) {
          showError(
            t(
              "Could not find an approved request to issue. Open Dept Requests and confirm the request is Approved and assigned to your store (Store 1 or Store 2).",
              "ለመስጣት የተፈቀደ ጥያቄ አልተገኘም። የክፍል ጥያቄዎችን ክፈት እና ጥያቄው Approved መሆኑን እና ወደ ትክክለኛው ስቶር መመደቡን ያረጋግጡ።",
            ),
          );
          setTab("department-requests");
          return;
        }
        if (!["Approved", "Partially Approved"].includes(request.status)) {
          showError(
            t(
              "This request is not approved yet. Approve it under Dept Requests first.",
              "ይህ ጥያቄ ገና አልተፈቀደም። በመጀመሪያ በየክፍል ጥያቄዎች ይፍቀዱ።",
            ),
          );
          setTab("department-requests");
          return;
        }
        convertRequestToIssueVoucherDocument(requestToDepartmentDocument(request));
        return;
      }
      setTab(task.sourceTab);
    } catch (error) {
      showError(error instanceof Error ? error.message : t("Could not complete workflow action.", "የሂደት እርምጃ ሊጠናቀቅ አልቻለም።"));
    }
  }

  function setWorkspace(next: InventoryWorkspace) {
    navigate({
      to: "/app/stock-management",
      search: { workspace: next === "all" ? "all" : next },
      replace: true,
    });
  }

  const scopedItems = useMemo(() => {
    if (!access || access.canViewAllLocations) return stockModule.items;
    const allowed = new Set(access.assignedLocations);
    return stockModule.items.filter(
      (item) =>
        allowed.has(item.preferredLocation) ||
        stockModule.balances.some((row) => row.itemId === item.id && allowed.has(row.location)),
    );
  }, [access, stockModule.items, stockModule.balances]);
  const scopedBalances = stockModule.balances;
  const scopedLedger = stockModule.ledger;
  const barStockItemCount = useMemo(
    () => (showBarStockView ? countBarStockDrinkItems(scopedItems, scopedBalances, workspace) : 0),
    [showBarStockView, scopedItems, scopedBalances, workspace],
  );
  const fullLedger = stockModule.fullLedger;
  const scopedClosings = stockModule.closings;
  const dailyConsumptionDepartments = useMemo(
    () => resolveDailyConsumptionDepartments(workspace, access?.assignedLocations ?? []),
    [workspace, access?.assignedLocations],
  );
  const showDailyConsumptionDashboard = supportsDailyConsumption(workspace);
  const showRecipeBom = supportsRecipeBom(workspace);
  const kitchenRecipes = useMemo(
    () => (workspace === "Kitchen" ? stockModule.recipes.filter(isKitchenManagedRecipe) : stockModule.recipes),
    [workspace, stockModule.recipes],
  );

  function deleteStockItem(item: StockManagedItem) {
    if (!access || !canManageStockMasterItem(access, item)) {
      showError(t("You are not allowed to delete this stock item.", "ይህን የክምችት እቃ መሰረዝ አይችሉም።"));
      return;
    }
    if (!window.confirm(t(`Delete stock item "${item.name}"?`, `የክምችት እቃ "${item.name}" ይሰረዝ?`))) return;
    stockModule.deleteItem(item.id);
    if (editingItem?.id === item.id) setEditingItem(null);
  }

  const managedSuppliers = useMemo(
    () => Array.from(new Set(scopedItems.map((item) => item.supplierName?.trim()).filter(Boolean))).sort((a, b) => a!.localeCompare(b!)),
    [scopedItems],
  );

  const stockItemCategories = useMemo(
    () => Array.from(new Set(scopedItems.map((item) => item.category))).sort((a, b) => a.localeCompare(b)),
    [scopedItems],
  );

  const stockItemLocations = useMemo(() => {
    if (isDepartmentScopedUser && access) {
      const authorized = resolveAuthorizedLocations(access);
      const assigned = authorized === "all" ? access.assignedLocations : authorized;
      const inWorkspace =
        workspace === "all" ? assigned : assigned.filter((loc) => loc === workspace);
      return [...inWorkspace].sort((a, b) => a.localeCompare(b));
    }
    return Array.from(new Set(scopedItems.map((item) => item.preferredLocation))).sort((a, b) =>
      a.localeCompare(b),
    );
  }, [access, isDepartmentScopedUser, scopedItems, workspace]);

  const filteredStockItems = useMemo(() => {
    const search = itemSearch.trim().toLowerCase();
    return scopedItems.filter((item) => {
      // Goat pools are created by goat registration — keep them out of stock master.
      if (isGoatPoolSku(item.id)) return false;
      const displayLocation = displayItemStockLocation(item, scopedBalances, access, workspace);
      const matchesSearch =
        !search ||
        [item.name, item.id, item.category, item.preferredLocation, displayLocation, item.supplierName || "", item.baseUnit]
          .some((value) => value.toLowerCase().includes(search));
      const matchesCategory = itemCategoryFilter === "ALL" || item.category === itemCategoryFilter;
      const matchesLocation = itemMatchesLocationFilter(
        item,
        scopedBalances,
        itemLocationFilter,
        isDepartmentScopedUser,
      );
      return matchesSearch && matchesCategory && matchesLocation;
    });
  }, [
    access,
    isDepartmentScopedUser,
    itemCategoryFilter,
    itemLocationFilter,
    itemSearch,
    scopedBalances,
    scopedItems,
    workspace,
  ]);

  const stockItemTotalPages = Math.max(1, Math.ceil(filteredStockItems.length / STOCK_TABLE_PAGE_SIZE));
  const paginatedStockItems = useMemo(() => {
    const start = (itemPage - 1) * STOCK_TABLE_PAGE_SIZE;
    return filteredStockItems.slice(start, start + STOCK_TABLE_PAGE_SIZE);
  }, [filteredStockItems, itemPage]);

  useEffect(() => {
    setItemPage(1);
  }, [itemSearch, itemCategoryFilter, itemLocationFilter]);

  useEffect(() => {
    if (itemPage > stockItemTotalPages) setItemPage(stockItemTotalPages);
  }, [itemPage, stockItemTotalPages]);

  function recordExpense(input: {
    date: string;
    department: StockExpenseDepartment;
    expenseItem: string;
    quantity: number;
    unitPrice: number;
    paymentMethod: string;
    notes?: string;
  }) {
    stockModule.saveLedgerEntry({
      id: `sled-${Date.now()}`,
      type: "EXPENSE",
      date: input.date,
      itemName: input.expenseItem,
      location: input.department,
      quantity: qty(input.quantity),
      unit: "pcs",
      unitPrice: money(input.unitPrice),
      totalCost: money(input.quantity * input.unitPrice),
      paymentMethod: input.paymentMethod,
      enteredBy: nowUserName(user?.name),
      notes: input.notes,
      referenceNo: refNo("EXP"),
    });
    showSuccess(t("Expense saved successfully.", "ወጪው በትክክል ተቀምጧል።"));
  }

  function recordClosing(input: StockClosingRecord) {
    try {
      if (access) assertLocationAccess(access, input.location);
      const closedAt = new Date().toISOString();
      const closing: StockClosingRecord = { ...input, closedAt };
      stockModule.saveClosing(closing);
      stockModule.saveLedgerEntry({
        id: `sled-${Date.now()}`,
        type: "CLOSING",
        date: input.date,
        itemName: `${input.location} closing`,
        location: input.location,
        quantity: qty(input.closingStock),
        unit: "pcs",
        totalCost: 0,
        enteredBy: input.createdBy,
        notes: `difference:${input.difference}`,
        referenceNo: refNo("CLS"),
        transactionAt: closedAt,
      });
      showSuccess(
        t(
          "Daily closing saved. Dashboard daily sales and stock counters have reset for this location.",
          "የዕለቱ መዝጊያ ተቀምጧል። ለዚህ ቦታ የዕለት ሽያጭ እና የክምችት ቆጠራዎች ዳሽቦርድ ላይ ዳግም ተጀምረዋል።",
        ),
      );
    } catch (error) {
      showError(error instanceof Error ? error.message : t("Could not save closing.", "መዝጊያ ሊቀመጥ አልቻለም።"));
    }
  }

  function savePurchaseRequisitionDocument(input: {
    requestingStore: "Store 1" | "Store 2";
    requiredDate: string;
    itemId: string;
    requestedQuantity: number;
    unit: StockUnitType;
    reason: string;
    notes?: string;
  }) {
    const item = stockModule.items.find((row) => row.id === input.itemId);
    if (!item) return showError(t("Selected stock item was not found.", "የተመረጠው የክምችት እቃ አልተገኘም።"));
    const currentQty = scopedBalances.find((row) => row.itemId === item.id && row.location === input.requestingStore)?.quantity ?? 0;
    const requisitionNumber = nextInventoryDocumentNumber(
      "PR",
      stockModule.purchaseRequisitions.map((row) => row.requisitionNumber),
    );
    const doc: PurchaseRequisitionDocument = {
      id: `pr-${Date.now()}`,
      documentType: "Purchase Requisition",
      documentNumber: requisitionNumber,
      requisitionNumber,
      status: "Submitted",
      createdAt: new Date().toISOString(),
      createdBy: nowUserName(user?.name),
      requestingStore: input.requestingStore,
      requiredDate: input.requiredDate,
      requestedBy: nowUserName(user?.name),
      notes: input.notes,
      approvalHistory: [{ id: `hist-${Date.now()}`, action: "Submitted", actedBy: nowUserName(user?.name), actedAt: new Date().toISOString() }],
      lines: [{
        id: `pr-line-${Date.now()}`,
        itemId: item.id,
        itemName: item.name,
        currentStock: currentQty,
        reorderLevel: item.reorderLevel,
        requestedQuantity: input.requestedQuantity,
        approvedQuantity: 0,
        unit: input.unit,
        reason: input.reason,
      }],
    };
    stockModule.savePurchaseRequisition(doc);
    showSuccess(t("Purchase requisition submitted.", "የግዢ ጥያቄው ተልኳል።"));
  }

  function convertRequisitionToPo(requisition: PurchaseRequisitionDocument, supplier: string) {
    try {
      if (!["Approved", "Partially Approved"].includes(requisition.status)) {
        throw new Error(t("Approve the purchase requisition before converting to a purchase order.", "ወደ የግዢ ትዕዛዝ ከመቀየርዎ በፊት የግዢ ጥያቄውን ያፅድቁ።"));
      }
      const po = convertPurchaseRequisitionToPurchaseOrderAsActor(requisition, supplier, actorContext);
      stockModule.savePurchaseOrder(po);
      stockModule.savePurchaseRequisition({
        ...requisition,
        status: "Converted to Purchase Order",
        approvalHistory: [
          { id: `hist-${Date.now()}`, action: "Converted", actedBy: nowUserName(user?.name), actedAt: new Date().toISOString(), notes: po.purchaseOrderNumber },
          ...requisition.approvalHistory,
        ],
      });
      showSuccess(t("Purchase order created. A different user must approve it before GRV.", "የግዢ ትዕዛዝ ተፈጥሯል። ከGRV በፊት ሌላ ተጠቃሚ ማፅደቅ አለበት።"));
    } catch (error) {
      showError(error instanceof Error ? error.message : t("Could not create purchase order.", "የግዢ ትዕዛዝ ሊፈጠር አልቻለም።"));
    }
  }

  function approvePurchaseRequisitionDocument(requisitionId: string) {
    try {
      const requisition = stockModule.purchaseRequisitions.find((row) => row.id === requisitionId);
      if (!requisition) throw new Error(t("Requisition not found.", "ጥያቄው አልተገኘም።"));
      const approved = approvePurchaseRequisitionAsActor(
        requisition,
        actorContext,
        requisition.lines.map((line) => ({ lineId: line.id, approvedQuantity: line.requestedQuantity })),
      );
      stockModule.savePurchaseRequisition(approved);
      showSuccess(t("Purchase requisition approved.", "የግዢ ጥያቄ ተፈቅዷል።"));
    } catch (error) {
      showError(error instanceof Error ? error.message : t("Could not approve requisition.", "ጥያቄው ሊፈቀድ አልቻለም።"));
    }
  }

  function approvePurchaseOrderDocument(orderId: string) {
    try {
      const order = stockModule.purchaseOrders.find((row) => row.id === orderId);
      if (!order) throw new Error(t("Purchase order not found.", "የግዢ ትዕዛዝ አልተገኘም።"));
      const approved = approvePurchaseOrderAsActor(order, actorContext);
      stockModule.savePurchaseOrder(approved);
      showSuccess(t("Purchase order approved. Store can now create a GRV.", "የግዢ ትዕዛዝ ተፈቅዷል። ስቶር አሁን GRV መፍጠር ይችላል።"));
    } catch (error) {
      showError(error instanceof Error ? error.message : t("Could not approve purchase order.", "የግዢ ትዕዛዝ ሊፈቀድ አልቻለም።"));
    }
  }

  function saveGoodsReceivingVoucherDocument(input: {
    purchaseOrderNumber: string;
    receivingDate: string;
    receivedBy: string;
    itemId: string;
    receivedQuantity: number;
    rejectedQuantity: number;
    freeQuantity: number;
    unitCost: number;
    batchNumber?: string;
    expiryDate?: string;
  }) {
    try {
      const po = stockModule.purchaseOrders.find((row) => row.purchaseOrderNumber === input.purchaseOrderNumber);
      if (!po) return showError(t("Purchase order not found.", "የግዢ ትዕዛዝ አልተገኘም።"));
      const line = po.lines.find((row) => row.itemId === input.itemId);
      if (!line) return showError(t("Purchase order line not found.", "የግዢ ትዕዛዝ እቃ መስመር አልተገኘም።"));
      const voucherNo = nextInventoryDocumentNumber(
        "GRV",
        stockModule.goodsReceivingVouchers.map((row) => row.grvNumber),
      );
      const voucher: GoodsReceivingVoucherDocument = {
        id: `grv-${Date.now()}`,
        documentType: "Goods Receiving Voucher",
        documentNumber: voucherNo,
        grvNumber: voucherNo,
        status: "Draft",
        createdAt: new Date().toISOString(),
        createdBy: nowUserName(user?.name),
        purchaseOrderReference: po.purchaseOrderNumber,
        supplier: po.supplier,
        destinationStore: po.destinationStore,
        receivingDate: input.receivingDate,
        receivedBy: input.receivedBy,
        approvalHistory: [{ id: `hist-${Date.now()}`, action: "Created", actedBy: nowUserName(user?.name), actedAt: new Date().toISOString() }],
        lines: [{
          id: `grv-line-${Date.now()}`,
          itemId: line.itemId,
          itemName: line.itemName,
          orderedQuantity: line.orderedQuantity,
          receivedQuantity: input.receivedQuantity,
          rejectedQuantity: input.rejectedQuantity,
          freeQuantity: input.freeQuantity,
          unit: line.unit,
          unitCost: input.unitCost,
          batchNumber: input.batchNumber?.trim() || undefined,
          expiryDate: input.expiryDate || undefined,
        }],
      };
      const result = confirmGoodsReceivingVoucherAsActor(
        voucher,
        stockModule.items,
        fullLedger,
        stockModule.purchaseOrders,
        actorContext,
        { settings: stockModule.settings, lots: stockModule.lots },
      );
      stockModule.setItems(result.items);
      stockModule.setLedger((prev) => appendImmutableLedgerEntries(prev, result.ledgerEntries));
      stockModule.setPurchaseOrders(result.purchaseOrders);
      stockModule.saveLots(result.lots);
      stockModule.saveGoodsReceivingVoucher(result.voucher);
      showSuccess(t("Goods receiving voucher confirmed.", "የዕቃ መቀበያ ቫውቸር ተረጋግጧል።"));
    } catch (error) {
      showError(error instanceof Error ? error.message : t("Could not confirm GRV.", "GRV ሊረጋገጥ አልቻለም።"));
    }
  }

  function convertRequestToIssueVoucherDocument(request: DepartmentStockRequestDocument) {
    try {
      const existingVoucher = findStoreIssueVoucherForRequest(stockModule.allStoreIssueVouchers, {
        id: request.id,
        stockRequestNumber: request.stockRequestNumber,
      });
      if (existingVoucher) {
        if (request.status === "Approved" || request.status === "Partially Approved") {
          stockModule.saveRequest(
            toStockRequestRecord({
              ...request,
              status: "Converted to Issue Voucher",
              convertedIssueVoucherNumber: existingVoucher.issueVoucherNumber,
            }),
          );
        }
        setTab("issue-vouchers");
        showInfo(
          t(
            `Issue voucher ${existingVoucher.issueVoucherNumber} already exists for this request. Open Issue Vouchers and click Dispatch when ready.`,
            `ለዚህ ጥያቄ የመስጫ ቫውቸር ${existingVoucher.issueVoucherNumber} አስቀድሞ አለ። የመስጫ ቫውቸሮችን ክፈት እና ሲዘጋጅ ላክ የተሰኘውን ጠቅ አድርግ።`,
          ),
        );
        return;
      }
      const result = convertDepartmentRequestToIssueVoucherAsActor(
        request,
        actorContext,
        stockModule.allStoreIssueVouchers.map((row) => row.issueVoucherNumber),
      );
      stockModule.saveStoreIssueVoucher(result.voucher);
      stockModule.saveRequest(toStockRequestRecord(result.request));
      setTab("issue-vouchers");
      showSuccess(t("Store issue voucher created. Dispatch when ready.", "የማከማቻ መስጫ ቫውቸር ተፈጥሯል። ሲዘጋጅ ይላኩ።"));
    } catch (error) {
      showError(error instanceof Error ? error.message : t("Could not create issue voucher.", "የመስጫ ቫውቸር ሊፈጠር አልቻለም።"));
    }
  }

  function saveDepartmentStockRequestDocument(input: {
    requestingDepartment: OperationalStockLocation;
    requestedSourceStore: "Store 1" | "Store 2";
    preferredSource?: PreferredSourcePreference;
    priority: StockRequestPriority;
    requiredDate: string;
    itemId: string;
    requestedQuantity: number;
    unit: StockUnitType;
    reason: string;
    notes?: string;
  }) {
    try {
      if (access) assertLocationAccess(access, input.requestingDepartment);
      const item = stockModule.items.find((row) => row.id === input.itemId);
      if (!item) return showError(t("Selected stock item was not found.", "የተመረጠው የክምችት እቃ አልተገኘም።"));
      const availableQuantityAtDepartment =
        stockModule.balances.find((row) => row.itemId === item.id && row.location === input.requestingDepartment)?.quantity ?? 0;
      const store1Qty = availableQuantityAtLocation(stockModule.warehouseBalances, item.id, "Store 1");
      const store2Qty = availableQuantityAtLocation(stockModule.warehouseBalances, item.id, "Store 2");
      if (!(input.requestedQuantity > 0)) {
        return showError(t("Requested quantity must be greater than zero.", "የተጠየቀ ብዛት ከዜሮ በላይ መሆን አለበት።"));
      }
      if (store1Qty <= 0 && store2Qty <= 0) {
        return showError(
          t(
            "Neither Store 1 nor Store 2 has available stock for this item. Preferred location only tags the item — receive goods with GRV into Store 1/2, or post a warehouse adjustment.",
            "ለዚህ እቃ በስቶር 1 ወይም ስቶር 2 ላይ የሚገኝ ክምችት የለም። ነባር ቦታ እቃውን ያመለክታል ብቻ — በGRV ወደ ስቶር 1/2 ይቀበሉ፣ ወይም የመጋዘን ማስተካከያ ይለጥፉ።",
          ),
        );
      }
      const preferred = input.preferredSource ?? input.requestedSourceStore;
      const requestedSourceStore = resolvePreferredSourceStore(stockModule.warehouseBalances, item.id, preferred);
      const sourceQty = availableQuantityAtLocation(stockModule.warehouseBalances, item.id, requestedSourceStore);
      if (sourceQty <= 0) {
        return showError(t(`Preferred source ${requestedSourceStore} has no available stock. Choose another store.`, `ተመራጭ ምንጭ ${requestedSourceStore} የሚገኝ ክምችት የለውም። ሌላ ስቶር ይምረጡ።`));
      }
      const document = createDepartmentStockRequest({
        requestingDepartment: input.requestingDepartment,
        requestedSourceStore,
        priority: input.priority,
        reason: input.reason,
        requiredDate: input.requiredDate,
        requestedBy: nowUserName(user?.name),
        notes: input.notes,
        lines: [{
          itemId: item.id,
          itemName: item.name,
          availableQuantityAtDepartment,
          requestedQuantity: input.requestedQuantity,
          unit: input.unit,
        }],
      });
      stockModule.saveRequest(toStockRequestRecord(document));
      const warning =
        input.requestedQuantity > sourceQty
          ? t(` Submitted with partial availability at ${requestedSourceStore} (${sourceQty} available).`, ` በ${requestedSourceStore} ከፊል ክምችት (${sourceQty} ይገኛል) ተልኳል።`)
          : "";
      showSuccess(t("Department stock request submitted.", "የክፍል የክምችት ጥያቄ ተልኳል።") + warning);
    } catch (error) {
      showError(error instanceof Error ? error.message : t("Could not submit request.", "ጥያቄ ሊላክ አልቻለም።"));
    }
  }

  function approveDepartmentRequestDocument(requestId: string, approvedQuantity?: number, sourceStore?: "Store 1" | "Store 2") {
    try {
      const existing = stockModule.allRequests.find((row) => row.id === requestId);
      if (!existing) throw new Error(t("Request not found.", "ጥያቄው አልተገኘም።"));
      const document = toDepartmentStockRequestDocument(existing);
      const approved = approveDepartmentStockRequestAsActor(
        document,
        actorContext,
        document.lines.map((line) => ({
          lineId: line.id,
          approvedQuantity: approvedQuantity ?? line.requestedQuantity,
        })),
        sourceStore,
      );
      stockModule.saveRequest(toStockRequestRecord(approved));
      setTab("issue-vouchers");
      showSuccess(
        t(
          "Request approved (store stock reserved). Next: create & dispatch a Store Issue Voucher, then the department must confirm receipt before inventory increases.",
          "ጥያቄው ተፈቅዷል (የስቶር ክምችት ተይዟል)። ቀጥሎ፦ የመስጫ ቫውቸር ይፍጠሩ እና ይላኩ፤ ክፍሉ መቀበያ ካረጋገጠ በኋላ ብቻ ክምችት ይጨምራል።",
        ),
      );
    } catch (error) {
      showError(error instanceof Error ? error.message : t("Could not approve request.", "ጥያቄው ሊፈቀድ አልቻለም።"));
    }
  }

  function rejectDepartmentRequestDocument(requestId: string, rejectionReason: string) {
    try {
      const existing = stockModule.requests.find((row) => row.id === requestId);
      if (!existing) throw new Error(t("Request not found.", "ጥያቄው አልተገኘም።"));
      const rejected = rejectDepartmentStockRequestAsActor(
        toDepartmentStockRequestDocument(existing),
        actorContext,
        rejectionReason,
      );
      stockModule.saveRequest(toStockRequestRecord(rejected));
      showSuccess(t("Department stock request rejected.", "የክፍል የክምችት ጥያቄ ተቀባይነት አላገኘም።"));
    } catch (error) {
      showError(error instanceof Error ? error.message : t("Could not reject request.", "ጥያቄው ሊከለከል አልቻለም።"));
    }
  }

  function dispatchIssueVoucherDocument(voucherId: string) {
    try {
      const voucher = stockModule.allStoreIssueVouchers.find((row) => row.id === voucherId);
      if (!voucher) throw new Error(t("Issue voucher not found.", "የመስጫ ቫውቸር አልተገኘም።"));
      const result = dispatchStoreIssueVoucherAsActor(voucher, actorContext, stockModule.items, fullLedger, undefined, stockModule.lots);
      stockModule.saveStoreIssueVoucher(result.voucher);
      stockModule.setLedger((prev) => appendImmutableLedgerEntries(prev, result.ledgerEntries));
      stockModule.saveLots(result.lots);
      showSuccess(t("Issue voucher dispatched. Awaiting department receipt.", "የመስጫ ቫውቸር ተልኳል። የክፍል መቀበያ ይጠበቃል።"));
    } catch (error) {
      showError(error instanceof Error ? error.message : t("Could not dispatch issue voucher.", "የመስጫ ቫውቸር ሊላክ አልቻለም።"));
    }
  }

  function receiveIssueVoucherDocument(voucherId: string) {
    try {
      const voucher = stockModule.allStoreIssueVouchers.find((row) => row.id === voucherId);
      if (!voucher) throw new Error(t("Issue voucher not found.", "የመስጫ ቫውቸር አልተገኘም።"));
      if (!access || !canConfirmDepartmentIssueReceipt(access, voucher.destinationDepartment)) {
        throw new Error(
          t(
            "Only the destination department can confirm receipt of this issue voucher.",
            "ይህን የመስጫ ቫውቸር መቀበያ ማረጋገጥ የሚችለው የመድረሻ ክፍል ብቻ ነው።",
          ),
        );
      }
      const result = receiveStoreIssueVoucherAsActor(voucher, actorContext, stockModule.items, fullLedger, undefined, stockModule.lots);
      stockModule.saveStoreIssueVoucher(result.voucher);
      stockModule.setLedger((prev) => appendImmutableLedgerEntries(prev, result.ledgerEntries));
      stockModule.saveLots(result.lots);
      showSuccess(t("Issue voucher received into department inventory.", "የመስጫ ቫውቸር ወደ ክፍል ክምችት ተቀብሏል።"));
    } catch (error) {
      showError(error instanceof Error ? error.message : t("Could not receive issue voucher.", "የመስጫ ቫውቸር ሊቀበል አልቻለም።"));
    }
  }

  function postDocumentTransferLedger(input: {
    referenceNo: string;
    date: string;
    itemId: string;
    fromLocation: StockLocation;
    toLocation: StockLocation;
    quantity: number;
    unit: StockUnitType;
    approvedBy: string;
    receivedBy: string;
    notes?: string;
  }) {
    const item = stockModule.items.find((row) => row.id === input.itemId);
    if (!item) throw new Error(t("Selected stock item was not found.", "የተመረጠው የክምችት እቃ አልተገኘም።"));
    stockModule.saveLedgerEntry({
      id: `sled-${Date.now()}-out`,
      type: "TRANSFER_OUT",
      date: input.date,
      itemId: item.id,
      itemName: item.name,
      category: item.category,
      location: input.fromLocation,
      fromLocation: input.fromLocation,
      toLocation: input.toLocation,
      quantity: qty(input.quantity),
      unit: input.unit,
      totalCost: money(input.quantity * item.purchasePrice),
      approvedBy: input.approvedBy,
      receivedBy: input.receivedBy,
      enteredBy: nowUserName(user?.name),
      notes: input.notes,
      referenceNo: input.referenceNo,
    });
    stockModule.saveLedgerEntry({
      id: `sled-${Date.now()}-in`,
      type: "TRANSFER_IN",
      date: input.date,
      itemId: item.id,
      itemName: item.name,
      category: item.category,
      location: input.toLocation,
      fromLocation: input.fromLocation,
      toLocation: input.toLocation,
      quantity: qty(input.quantity),
      unit: input.unit,
      totalCost: money(input.quantity * item.purchasePrice),
      approvedBy: input.approvedBy,
      receivedBy: input.receivedBy,
      enteredBy: nowUserName(user?.name),
      notes: input.notes,
      referenceNo: input.referenceNo,
    });
  }

  function saveStoreTransferVoucherDocument(input: {
    sourceLocation: StockLocation;
    destinationLocation: StockLocation;
    itemId: string;
    quantity: number;
    unit: StockUnitType;
    notes?: string;
  }) {
    try {
      if (access) assertLocationAccess(access, input.sourceLocation);
      const item = stockModule.items.find((row) => row.id === input.itemId);
      if (!item) return showError(t("Selected stock item was not found.", "የተመረጠው የክምችት እቃ አልተገኘም።"));
      if (input.sourceLocation === input.destinationLocation) {
        return showError(t("Source and destination must differ.", "መነሻ እና መድረሻ የተለያዩ መሆን አለባቸው።"));
      }
      const voucherNo = nextInventoryDocumentNumber(
        "STV",
        stockModule.storeTransferVouchers.map((row) => row.transferVoucherNumber),
      );
      const doc: StoreTransferVoucherDocument = {
        id: `stv-${Date.now()}`,
        documentType: "Store Transfer Voucher",
        documentNumber: voucherNo,
        transferVoucherNumber: voucherNo,
        status: "Pending Approval",
        createdAt: new Date().toISOString(),
        createdBy: nowUserName(user?.name),
        sourceLocation: input.sourceLocation,
        destinationLocation: input.destinationLocation,
        transferDate: todayKey(),
        notes: input.notes,
        approvalHistory: [
          { id: `hist-${Date.now()}`, action: "Submitted", actedBy: nowUserName(user?.name), actedAt: new Date().toISOString() },
        ],
        lines: [{
          id: `stv-line-${Date.now()}`,
          itemId: item.id,
          itemName: item.name,
          unit: input.unit,
          requestedQuantity: input.quantity,
          approvedQuantity: 0,
          sentQuantity: 0,
          receivedQuantity: 0,
        }],
      };
      stockModule.saveStoreTransferVoucher(doc);
      showSuccess(t("Transfer voucher submitted for approval. Stock is unchanged until dispatch and receipt.", "የዝውውር ቫውቸር ለፈቃድ ተልኳል። ክምችት እስከ መላክ እና መቀበያ ድረስ አይቀየርም።"));
    } catch (error) {
      showError(error instanceof Error ? error.message : t("Could not create transfer voucher.", "የዝውውር ቫውቸር ሊፈጠር አልቻለም።"));
    }
  }

  function approveStoreTransferVoucherDocument(voucherId: string) {
    try {
      const voucher = stockModule.storeTransferVouchers.find((row) => row.id === voucherId);
      if (!voucher) throw new Error(t("Transfer voucher not found.", "የዝውውር ቫውቸር አልተገኘም።"));
      const check = validateInventoryDocumentApproval(actorContext, voucher, "approve", voucher.sourceLocation);
      if (!check.ok) throw new Error(check.error);
      const approved: StoreTransferVoucherDocument = {
        ...voucher,
        status: "Approved",
        approvedBy: nowUserName(user?.name),
        lines: voucher.lines.map((line) => ({ ...line, approvedQuantity: line.requestedQuantity })),
        approvalHistory: [
          { id: `hist-${Date.now()}`, action: "Approved", actedBy: nowUserName(user?.name), actedAt: new Date().toISOString() },
          ...voucher.approvalHistory,
        ],
      };
      stockModule.saveStoreTransferVoucher(approved);
      showSuccess(t("Transfer voucher approved.", "የዝውውር ቫውቸር ተፈቅዷል።"));
    } catch (error) {
      showError(error instanceof Error ? error.message : t("Could not approve transfer.", "ዝውውሩ ሊፈቀድ አልቻለም።"));
    }
  }

  function dispatchStoreTransferVoucherDocument(voucherId: string) {
    try {
      const voucher = stockModule.storeTransferVouchers.find((row) => row.id === voucherId);
      if (!voucher) throw new Error(t("Transfer voucher not found.", "የዝውውር ቫውቸር አልተገኘም።"));
      const asTransfer = {
        id: voucher.id,
        transferNumber: voucher.transferVoucherNumber,
        sourceLocation: voucher.sourceLocation,
        destinationLocation: voucher.destinationLocation,
        transferDate: voucher.transferDate,
        status: voucher.status,
        approvedBy: voucher.approvedBy,
        notes: voucher.notes,
        activity: [] as string[],
        lines: voucher.lines,
      };
      const check = validateInventoryDocumentApproval(actorContext, voucher, "dispatch", voucher.sourceLocation);
      if (!check.ok) throw new Error(check.error);
      const result = dispatchStockTransfer(asTransfer, nowUserName(user?.name), stockModule.items, fullLedger, undefined, stockModule.lots);
      stockModule.setLedger((prev) => appendImmutableLedgerEntries(prev, result.ledgerEntries));
      stockModule.saveLots(result.lots);
      stockModule.saveStoreTransferVoucher({
        ...voucher,
        status: result.transfer.status,
        transferredBy: nowUserName(user?.name),
        lines: result.transfer.lines,
        approvalHistory: [
          { id: `hist-${Date.now()}`, action: "Dispatched", actedBy: nowUserName(user?.name), actedAt: new Date().toISOString() },
          ...voucher.approvalHistory,
        ],
      });
      showSuccess(t("Transfer dispatched. Destination must confirm receipt.", "ዝውውሩ ተልኳል። መድረሻ መቀበያ ማረጋገጥ አለበት።"));
    } catch (error) {
      showError(error instanceof Error ? error.message : t("Could not dispatch transfer.", "ዝውውሩ ሊላክ አልቻለም።"));
    }
  }

  function receiveStoreTransferVoucherDocument(voucherId: string) {
    try {
      const voucher = stockModule.storeTransferVouchers.find((row) => row.id === voucherId);
      if (!voucher) throw new Error(t("Transfer voucher not found.", "የዝውውር ቫውቸር አልተገኘም።"));
      const check = validateInventoryDocumentApproval(
        actorContext,
        { ...voucher, issuedBy: voucher.transferredBy },
        "receive",
        voucher.destinationLocation,
      );
      if (!check.ok) throw new Error(check.error);
      const asTransfer = {
        id: voucher.id,
        transferNumber: voucher.transferVoucherNumber,
        sourceLocation: voucher.sourceLocation,
        destinationLocation: voucher.destinationLocation,
        transferDate: voucher.transferDate,
        status: voucher.status,
        approvedBy: voucher.approvedBy,
        sentBy: voucher.transferredBy,
        notes: voucher.notes,
        activity: [] as string[],
        lines: voucher.lines,
      };
      const result = receiveStockTransfer(asTransfer, nowUserName(user?.name), stockModule.items, fullLedger, undefined, stockModule.lots);
      stockModule.setLedger((prev) => appendImmutableLedgerEntries(prev, result.ledgerEntries));
      stockModule.saveLots(result.lots);
      stockModule.saveStoreTransferVoucher({
        ...voucher,
        status: result.transfer.status,
        receivedBy: nowUserName(user?.name),
        lines: result.transfer.lines,
        approvalHistory: [
          { id: `hist-${Date.now()}`, action: "Received", actedBy: nowUserName(user?.name), actedAt: new Date().toISOString() },
          ...voucher.approvalHistory,
        ],
      });
      showSuccess(t("Transfer received into destination inventory.", "ዝውውሩ ወደ መድረሻ ክምችት ተቀብሏል።"));
    } catch (error) {
      showError(error instanceof Error ? error.message : t("Could not receive transfer.", "ዝውውሩ ሊቀበል አልቻለም።"));
    }
  }

  function saveGoodsReturnVoucherDocument(input: {
    sourceLocation: StockLocation;
    destinationLocation: StockLocation;
    itemId: string;
    quantity: number;
    unit: StockUnitType;
    returnReason: StockReturnReason;
    notes?: string;
  }) {
    try {
      const item = stockModule.items.find((row) => row.id === input.itemId);
      if (!item) return showError(t("Selected stock item was not found.", "የተመረጠው የክምችት እቃ አልተገኘም።"));
      const voucherNo = nextInventoryDocumentNumber(
        "RET",
        stockModule.goodsReturnVouchers.map((row) => row.returnVoucherNumber),
      );
      const lines: StockTransferLine[] = [{
        id: `ret-line-${Date.now()}`,
        itemId: item.id,
        itemName: item.name,
        unit: input.unit,
        requestedQuantity: input.quantity,
        approvedQuantity: 0,
        sentQuantity: 0,
        receivedQuantity: 0,
      }];
      const doc: GoodsReturnVoucherDocument = {
        id: `ret-${Date.now()}`,
        documentType: "Goods Return Voucher",
        documentNumber: voucherNo,
        returnVoucherNumber: voucherNo,
        status: "Submitted",
        createdAt: new Date().toISOString(),
        createdBy: nowUserName(user?.name),
        sourceLocation: input.sourceLocation,
        destinationLocation: input.destinationLocation,
        returnedBy: nowUserName(user?.name),
        returnReason: input.returnReason,
        notes: input.notes,
        approvalHistory: [{ id: `hist-${Date.now()}`, action: "Submitted", actedBy: nowUserName(user?.name), actedAt: new Date().toISOString() }],
        lines,
      };
      stockModule.saveGoodsReturnVoucher(doc);
      showSuccess(t("Return voucher submitted. Another user must approve before stock moves.", "የተመላሽ ቫውቸር ተልኳል። ክምችት ከመንቀሳቀሱ በፊት ሌላ ተጠቃሚ ማፅደቅ አለበት።"));
    } catch (error) {
      showError(error instanceof Error ? error.message : t("Could not create return voucher.", "የተመላሽ ቫውቸር ሊፈጠር አልቻለም።"));
    }
  }

  function approveAndPostGoodsReturnDocument(voucherId: string) {
    try {
      const voucher = stockModule.goodsReturnVouchers.find((row) => row.id === voucherId);
      if (!voucher) throw new Error(t("Return voucher not found.", "የተመላሽ ቫውቸር አልተገኘም።"));
      if (voucher.status !== "Submitted") throw new Error(t("Only submitted returns can be approved.", "የተላኩ ተመላሾች ብቻ ሊፈቀዱ ይችላሉ።"));
      const check = validateInventoryDocumentApproval(actorContext, voucher, "approve", voucher.destinationLocation);
      if (!check.ok) throw new Error(check.error);
      const line = voucher.lines[0];
      if (!line || !voucher.destinationLocation) throw new Error(t("Return voucher is incomplete.", "የተመላሽ ቫውቸር አልተሟላም።"));
      postDocumentTransferLedger({
        referenceNo: voucher.returnVoucherNumber,
        date: todayKey(),
        itemId: line.itemId,
        fromLocation: voucher.sourceLocation,
        toLocation: voucher.destinationLocation,
        quantity: line.requestedQuantity,
        unit: line.unit,
        approvedBy: nowUserName(user?.name),
        receivedBy: nowUserName(user?.name),
        notes: `${voucher.returnReason}${voucher.notes ? ` • ${voucher.notes}` : ""}`,
      });
      const item = stockModule.items.find((row) => row.id === line.itemId);
      if (item) {
        const baseQty = convertStockQuantity(item, line.requestedQuantity, line.unit, item.baseUnit);
        stockModule.saveLots((prev) =>
          quarantineLotsForReturn(prev, line.itemId, voucher.destinationLocation!, baseQty, String(voucher.returnReason)),
        );
      }
      stockModule.saveGoodsReturnVoucher({
        ...voucher,
        status: "Received",
        approvedBy: nowUserName(user?.name),
        receivedBy: nowUserName(user?.name),
        lines: voucher.lines.map((row) => ({
          ...row,
          approvedQuantity: row.requestedQuantity,
          sentQuantity: row.requestedQuantity,
          receivedQuantity: row.requestedQuantity,
        })),
        approvalHistory: [
          { id: `hist-${Date.now()}`, action: "Received", actedBy: nowUserName(user?.name), actedAt: new Date().toISOString() },
          { id: `hist-${Date.now()}-a`, action: "Approved", actedBy: nowUserName(user?.name), actedAt: new Date().toISOString() },
          ...voucher.approvalHistory,
        ],
      });
      showSuccess(t("Return voucher approved and posted.", "የተመላሽ ቫውቸር ተፈቅዶ ተለጥፏል።"));
    } catch (error) {
      showError(error instanceof Error ? error.message : t("Could not post return voucher.", "የተመላሽ ቫውቸር ሊለጠፍ አልቻለም።"));
    }
  }

  function saveDailyConsumptionDocument(input: {
    department: DailyConsumptionDepartment;
    consumptionDate: string;
    shift?: string;
    approvedBy?: string;
    notes?: string;
    lines: Array<{ itemId: string; consumedQuantity: number; notes?: string }>;
  }) {
    try {
      if (access) assertLocationAccess(access, input.department);
      const draft = createDailyConsumptionDocument({
        department: input.department,
        consumptionDate: input.consumptionDate,
        shift: input.shift,
        preparedBy: nowUserName(user?.name),
        approvedBy: input.approvedBy,
        notes: input.notes,
        items: stockModule.items,
        ledger: stockModule.fullLedger,
        lines: input.lines,
        existingNumbers: stockModule.dailyConsumptions.map((row) => row.consumptionNumber),
      });
      const result = commitDailyConsumption({
        document: draft,
        items: stockModule.items,
        ledger: stockModule.fullLedger,
        settings: stockModule.settings,
        lots: stockModule.allLots,
        postedBy: nowUserName(user?.name),  
      });
      stockModule.saveDailyConsumption(result.document);
      stockModule.setLedger((prev) => appendImmutableLedgerEntries(prev, result.ledgerEntries));
      stockModule.saveLots(result.lots);
      const lowStockLines = result.document.lines.filter((line) => line.lowStock);
      if (lowStockLines.length > 0) {
        showInfo(
          t(
            `${lowStockLines.length} item(s) at or below reorder level after posting.`,
            `${lowStockLines.length} እቃ(ዎች) ከመለጠፍ በኋላ በመደገፊያ ደረጃ ወይም በታች ናቸው።`,
          ),
        );
      }
      showSuccess(t("Daily consumption posted.", "ዕለታዊ መጠቀም ተለጥፏል።"));
    } catch (error) {
      showError(error instanceof Error ? error.message : t("Could not post daily consumption.", "ዕለታዊ መጠቀም ሊለጠፍ አልቻለም።"));
    }
  }

  function saveAdjustmentVoucherDocument(input: {
    documentType: StockAdjustmentVoucherDocument["documentType"];
    location: StockLocation;
    itemId: string;
    quantity: number;
    unit: StockUnitType;
    reason: string;
    notes?: string;
  }) {
    try {
      if (access) assertLocationAccess(access, input.location);
      const item = stockModule.items.find((row) => row.id === input.itemId);
      if (!item) return showError(t("Selected stock item was not found.", "የተመረጠው የክምችት እቃ አልተገኘም።"));
      const quantityBefore = scopedBalances.find((row) => row.itemId === item.id && row.location === input.location)?.quantity ?? 0;
      const adjustmentNumber = nextInventoryDocumentNumber(
        input.documentType === "Wastage Voucher" ? "WST" : input.documentType === "Damage Voucher" ? "DMG" : "ADJ",
        stockModule.stockAdjustmentVouchers.map((row) => row.adjustmentNumber),
      );
      const adjustmentQuantity = input.documentType === "Stock Adjustment Voucher" ? input.quantity : -Math.abs(input.quantity);
      const doc: StockAdjustmentVoucherDocument = {
        id: `adj-${Date.now()}`,
        documentType: input.documentType,
        documentNumber: adjustmentNumber,
        adjustmentNumber,
        status: "Posted",
        createdAt: new Date().toISOString(),
        createdBy: nowUserName(user?.name),
        requestedBy: nowUserName(user?.name),
        approvedBy: nowUserName(user?.name),
        postedBy: nowUserName(user?.name),
        notes: input.notes,
        approvalHistory: [{ id: `hist-${Date.now()}`, action: "Posted", actedBy: nowUserName(user?.name), actedAt: new Date().toISOString() }],
        lines: [{
          id: `adj-line-${Date.now()}`,
          itemId: item.id,
          itemName: item.name,
          location: input.location,
          quantityBefore,
          adjustmentQuantity,
          quantityAfter: quantityBefore + adjustmentQuantity,
          unit: input.unit,
          unitCost: item.purchasePrice,
          totalValue: Math.abs(adjustmentQuantity) * item.purchasePrice,
          reason: input.reason,
        }],
      };
      stockModule.saveStockAdjustmentVoucher(doc);
      const ledgerType =
        input.documentType === "Wastage Voucher"
          ? "WASTE"
          : input.documentType === "Damage Voucher"
            ? "DAMAGE"
            : input.documentType === "Stock Count Adjustment"
              ? "STOCK_COUNT_ADJUSTMENT"
              : "ADJUSTMENT";
      stockModule.saveLedgerEntry({
        id: `sled-adj-${Date.now()}`,
        type: ledgerType,
        date: todayKey(),
        itemId: item.id,
        itemName: item.name,
        category: item.category,
        location: input.location,
        quantity: Math.abs(input.quantity),
        unit: input.unit,
        totalCost: Math.abs(input.quantity) * item.purchasePrice,
        enteredBy: nowUserName(user?.name),
        reason: input.documentType === "Stock Adjustment Voucher" ? "Count correction" : input.reason,
        notes: input.notes || input.reason,
        referenceNo: adjustmentNumber,
      });
      showSuccess(t("Adjustment voucher posted.", "የማስተካከያ ቫውቸር ተለጥፏል።"));
    } catch (error) {
      showError(error instanceof Error ? error.message : t("Could not post adjustment.", "ማስተካከያ ሊለጠፍ አልቻለም።"));
    }
  }

  function savePhysicalCountDocument(input: {
    location: StockLocation;
    itemId: string;
    countedQuantity: number;
    blindCount: boolean;
    notes?: string;
  }) {
    try {
      if (access) assertLocationAccess(access, input.location);
      const item = stockModule.items.find((row) => row.id === input.itemId);
      if (!item) return showError(t("Selected stock item was not found.", "የተመረጠው የክምችት እቃ አልተገኘም።"));
      const expectedQuantity = scopedBalances.find((row) => row.itemId === item.id && row.location === input.location)?.quantity ?? 0;
      const count = createPhysicalCountSessionAsActor(
        {
          location: input.location,
          itemId: item.id,
          itemName: item.name,
          unit: item.baseUnit,
          countedQuantity: input.countedQuantity,
          expectedQuantity,
          unitCost: item.purchasePrice,
          blindCount: input.blindCount,
          notes: input.notes,
        },
        actorContext,
      );
      stockModule.saveCount(count);
      showSuccess(t("Physical count submitted for approval.", "የአካል ቆጠራ ለፈቃድ ተልኳል።"));
    } catch (error) {
      showError(error instanceof Error ? error.message : t("Could not submit count.", "ቆጠራ ሊላክ አልቻለም።"));
    }
  }

  function approvePhysicalCountDocument(countId: string) {
    try {
      const session = stockModule.counts.find((row) => row.id === countId);
      if (!session) throw new Error(t("Count session not found.", "የቆጠራ ክፍለ ጊዜ አልተገኘም።"));
      if (access) assertLocationAccess(access, session.location);
      const result = approveAndPostPhysicalCountAsActor(session, actorContext, stockModule.items, fullLedger);
      stockModule.saveCount(result.count);
      if (result.ledgerEntries.length > 0) {
        stockModule.setLedger((prev) => appendImmutableLedgerEntries(prev, result.ledgerEntries));
      }
      showSuccess(t("Physical count approved and posted.", "የአካል ቆጠራ ተፈቅዶ ተለጥፏል።"));
    } catch (error) {
      showError(error instanceof Error ? error.message : t("Could not approve count.", "ቆጠራ ሊፈቀድ አልቻለም።"));
    }
  }

  function reverseDocument(referenceNo: string, type: string) {
    const relatedEntries = fullLedger.filter((entry) => entry.referenceNo === referenceNo);
    if (relatedEntries.length === 0) return showError(t("No ledger entries found for this document.", "ለዚህ ሰነድ የሌጀር መዝገቦች አልተገኙም።"));
    const reversal = createCancellationReversalVoucherAsActor(referenceNo, type as Parameters<typeof createCancellationReversalVoucher>[1], "Manual reversal", relatedEntries, actorContext);
    stockModule.saveCancellationReversal(reversal.voucher);
    stockModule.setLedger((prev) => [...reversal.reversalEntries, ...prev]);
    showSuccess(t("Cancellation reversal voucher created.", "የመሰረዣ ተመላሽ ቫውቸር ተፈጥሯል።"));
  }

  const locationOptions = useMemo(() => authorizedLocationOptions(access), [access]);
  const operationalLocationOptions = useMemo(
    () => locationOptions.filter(isOperationalStockLocation) as OperationalStockLocation[],
    [locationOptions],
  );
  const tabsSource: Array<{
    key: StockTab;
    label: string;
    icon: LucideIcon;
    count?: string;
    accent?: "gold" | "teff" | "destructive" | "ember";
  }> = [
    {
      key: "dashboard",
      label: t("Dashboard", "ዳሽቦርድ"),
      icon: Icons.LayoutDashboard,
      count: showBarStockView ? String(barStockItemCount) : String(stockModule.dashboard.lowStockItems.length),
      accent: stockModule.dashboard.lowStockItems.length > 0 ? "gold" : "teff",
    },
    {
      key: "approval-inbox",
      label: t("Approval Inbox", "የፈቃድ ሳጥን"),
      icon: Icons.Inbox,
      count: String(workflowSummary.actionable),
      accent: workflowSummary.actionable > 0 ? "gold" : "teff",
    },
    {
      key: "receive-stock",
      label: t("Receive Stock", "ክምችት ተቀበል"),
      icon: Icons.PackageCheck,
      count: String(workflowSummary.receive),
      accent: workflowSummary.receive > 0 ? "teff" : undefined,
    },
    {
      key: "items",
      label: t("Stock Master", "የክምችት ማስተዳደር"),
      icon: Icons.Boxes,
      count: String(scopedItems.length),
      accent: "ember",
    },
    {
      key: "goat-processing",
      label: t("Goat Processing", "የፍየል ማቀናበር"),
      icon: Icons.Beef,
      count: String(stockModule.goatRegistrations.length),
      accent: "gold",
    },
    {
      key: "requisitions",
      label: t("Requisitions", "የግዢ ጥያቄዎች"),
      icon: Icons.FileText,
      count: String(stockModule.purchaseRequisitions.length),
    },
    {
      key: "purchase-orders",
      label: t("Purchase Orders", "የግዢ ትዕዛዞች"),
      icon: Icons.FileCheck,
      count: String(stockModule.purchaseOrders.length),
    },
    {
      key: "grv",
      label: t("GRV", "የመቀበያ ቫውቸር"),
      icon: Icons.ClipboardPlus,
      count: String(stockModule.goodsReceivingVouchers.length),
    },
    {
      key: "department-requests",
      label: t("Dept Requests", "የክፍል ጥያቄዎች"),
      icon: Icons.Inbox,
      count: String(stockModule.requests.filter((row) => !["Received", "Rejected", "Cancelled", "Converted to Issue Voucher"].includes(row.status)).length),
    },
    {
      key: "issue-vouchers",
      label: t("Issue Vouchers", "የመስጫ ቫውቸሮች"),
      icon: Icons.FileOutput,
      count: String(stockModule.storeIssueVouchers.length),
    },
    {
      key: "store-transfer-vouchers",
      label: t("Transfer Vouchers", "የዝውውር ቫውቸሮች"),
      icon: Icons.ArrowLeftRight,
      count: String(stockModule.storeTransferVouchers.length),
    },
    {
      key: "goods-returns",
      label: t("Goods Returns", "የእቃ ተመላሾች"),
      icon: Icons.RotateCcw,
      count: String(stockModule.goodsReturnVouchers.length),
    },
    {
      key: "adjustment-vouchers",
      label: t("Adjustment Vouchers", "የማስተካከያ ቫውቸሮች"),
      icon: Icons.FilePenLine,
      count: String(stockModule.stockAdjustmentVouchers.length),
    },
    {
      key: "physical-counts",
      label: t("Physical Counts", "የአካል ቆጠራዎች"),
      icon: Icons.ClipboardList,
      count: String(stockModule.counts.length),
    },
    {
      key: "daily-consumption",
      label: t("Daily Consumption", "ዕለታዊ መጠቀም"),
      icon: Icons.UtensilsCrossed,
      count: String(stockModule.dailyConsumptions.filter((row) => row.status === "Posted").length),
    },
    {
      key: "document-history",
      label: t("Document History", "የሰነድ ታሪክ"),
      icon: Icons.History,
      count: String(stockModule.purchaseRequisitions.length + stockModule.purchaseOrders.length + stockModule.goodsReceivingVouchers.length + stockModule.storeIssueVouchers.length + stockModule.storeTransferVouchers.length + stockModule.goodsReturnVouchers.length + stockModule.stockAdjustmentVouchers.length + stockModule.cancellationReversals.length),
    },
    {
      key: "expenses",
      label: t("Expenses", "ወጪዎች"),
      icon: Icons.BadgeDollarSign,
      count: money(stockModule.dashboard.todayExpenses),
    },
    {
      key: "recipes",
      label: t("Recipe / BOM", "የእርስ እና ንጥረ ነገር"),
      icon: Icons.BookOpen,
      count: String(stockModule.recipes.length),
    },
    {
      key: "closing",
      label: t("Daily Closing", "የዕለት መዝገብ"),
      icon: Icons.ClipboardCheck,
      count: String(stockModule.closings.length),
    },
    {
      key: "reports",
      label: t("Reports", "ሪፖርቶች"),
      icon: Icons.BarChart3,
      count: String(scopedBalances.length),
    },
    {
      key: "settings",
      label: t("Settings", "ቅንብሮች"),
      icon: Icons.Settings2,
      count: stockModule.settings.costingMethod,
    },
  ];

  const tabs = useMemo(() => {
    const allowed = access ? new Set(allowedStockTabs(access, workspace)) : new Set<StockTab>(["dashboard"]);
    return tabsSource.filter((item) => allowed.has(item.key));
  }, [
    access,
    workspace,
    showBarStockView,
    barStockItemCount,
    stockModule.dashboard.lowStockItems.length,
    workflowSummary.actionable,
    workflowSummary.receive,
    scopedItems.length,
    stockModule.goatRegistrations.length,
    stockModule.purchaseRequisitions.length,
    stockModule.purchaseOrders.length,
    stockModule.goodsReceivingVouchers.length,
    stockModule.requests.length,
    stockModule.storeIssueVouchers.length,
    stockModule.storeTransferVouchers.length,
    stockModule.closings.length,
    scopedBalances.length,
    stockModule.settings.costingMethod,
    // tabsSource labels use t(); omit t so this doesn't invalidate every render
    tabsSource.length,
  ]);

  const availableTabKeys = tabs.map((item) => item.key).join("|");

  useEffect(() => {
    const keys = availableTabKeys.split("|").filter(Boolean) as StockTab[];
    if (!keys.includes(tab)) {
      setTab(keys[0] ?? "dashboard");
    }
  }, [tab, availableTabKeys]);

  const activeTabMeta = tabs.find((item) => item.key === tab);

  if (!user || !access) return null;

  return (
    <div>
      <Card className="mb-5">
        <StockWorkspaceHeader
          access={access}
          workspace={workspace}
          onWorkspaceChange={setWorkspace}
          realtimeStatus={store.realtimeStatus}
          lastSyncAt={store.lastRealtimeSyncAt}
          actions={
            <>
              <MoneyVisibilityToggle hidden={hideMoney} onToggle={toggleHideMoney} t={t} />
              {canManageStockMaster ? (
                <button
                  onClick={() => setEditingItem(emptyItem(defaultStockMasterLocation(access)))}
                  className="h-10 px-4 rounded-lg bg-ember text-ember-foreground text-sm font-medium inline-flex items-center gap-2"
                >
                  <Icons.Plus className="size-4" /> {t("Add stock item", "ዕቃ ጨምር")}
                </button>
              ) : null}
            </>
          }
        />
      </Card>

      {stockModule.backendError && (
        <Card className="mb-4 border border-destructive/30 bg-destructive/5">
          <div className="text-sm text-destructive">{stockModule.backendError}</div>
        </Card>
      )}

      <StockNavTabs tabs={tabs} activeTab={tab} onSelect={setTab} />

      {activeTabMeta ? (
        <div className="mb-4 flex justify-end">
          <div className="flex items-center gap-2 flex-wrap shrink-0">
              {!isButcherWorkspace && tab !== "items" ? (
                <button onClick={() => setTab("items")} className="h-9 px-4 rounded-lg border border-border bg-card text-sm hover:bg-surface-2">
                  {t("Open stock master", "የክምችት ዝርዝር ክፈት")}
                </button>
              ) : null}
              {!isButcherWorkspace && tab !== "dashboard" ? (
                <button onClick={() => setTab("dashboard")} className="h-9 px-4 rounded-lg border border-border bg-card text-sm hover:bg-surface-2">
                  {t("Back to dashboard", "ወደ ዳሽቦርድ ተመለስ")}
                </button>
              ) : null}
              {isButcherWorkspace && tab !== "goat-processing" ? (
                <button onClick={() => setTab("goat-processing")} className="h-9 px-4 rounded-lg border border-border bg-card text-sm hover:bg-surface-2">
                  {t("Goat processing", "የፍየል ማቀናበር")}
                </button>
              ) : null}
              {(tab === "items" || tab === "dashboard") && canManageStockMaster && !isButcherWorkspace ? (
                <button onClick={() => setEditingItem(emptyItem(defaultStockMasterLocation(access)))} className="h-9 px-4 rounded-lg bg-ember text-ember-foreground text-sm font-semibold inline-flex items-center gap-2">
                  <Icons.Plus className="size-4" /> {t("Add stock item", "ዕቃ ጨምር")}
                </button>
              ) : null}
              {tab === "recipes" ? (
                <button onClick={() => setEditingRecipe(emptyRecipe())} className="h-9 px-4 rounded-lg bg-ember text-ember-foreground text-sm font-semibold inline-flex items-center gap-2">
                  <Icons.BookPlus className="size-4" /> {t("Add recipe", "አዘገጃጀት ጨምር")}
                </button>
              ) : null}
          </div>
        </div>
      ) : null}

      {tab === "dashboard" && (
        <div className="space-y-5">
          {stockModule.dashboard.dailyPeriodStart ? (
            <Card className="border border-amber-500/30 bg-amber-500/10">
              <div className="text-sm text-amber-900 dark:text-amber-200">
                {t("Daily closing completed.", "ዕለታዊ መዝጊያ ተጠናቋል።")}
              </div>
            </Card>
          ) : null}
          {workflowSummary.total > 0 ? (
            <Card className="border border-ember/30 bg-ember/5">
              <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                <div>
                  <h3 className="font-display text-lg font-semibold">{t("Action required", "እርምጃ ያስፈልጋል")}</h3>
                </div>
                <div className="flex flex-wrap gap-2">
                  <button type="button" onClick={() => setTab("approval-inbox")} className="h-9 px-4 rounded-lg bg-ember text-ember-foreground text-sm font-semibold">
                    {t("Open approval inbox", "የፈቃድ ሳጥን ክፈት")}
                  </button>
                  {workflowSummary.receive > 0 ? (
                    <button type="button" onClick={() => setTab("receive-stock")} className="h-9 px-4 rounded-lg border border-border bg-card text-sm hover:bg-surface-2">
                      {t("Receive stock", "ክምችት ተቀበል")} ({workflowSummary.receive})
                    </button>
                  ) : null}
                </div>
              </div>
            </Card>
          ) : null}
          {showBarStockView && workspace !== "all" ? (
            <BarStockPanel
              embedded
              workspace={workspace}
              items={scopedItems}
              balances={scopedBalances}
              ledger={fullLedger}
              closings={scopedClosings}
              salesRecords={store.salesRecords}
            />
          ) : null}
          {isDepartmentScopedUser ? (
            <>
              {(() => {
                const today = dateKey();
                const locations =
                  workspace !== "all"
                    ? [workspace]
                    : access?.assignedLocations ?? [];
                const periodStart =
                  stockModule.dashboard.dailyPeriodStart ??
                  resolveDailyDashboardPeriodStart(scopedClosings, workspace);
                const deptSales = filterSalesAfterDashboardPeriod(
                  filterSalesForOperationalLocations(store.salesRecords, locations, today),
                  periodStart,
                );
                const deptSummary = summarizeSales(deptSales);
                const topSold = groupSalesByProduct(deptSales).slice(0, 5);
                return (
                  <>
                    <div className="grid grid-cols-2 xl:grid-cols-4 gap-4">
                      <Stat label={t("Total sales", "ጠቅላላ ሽያጭ")} value={money(deptSummary.revenue)} icon="TrendingUp" tone="ember" />
                      <Stat label={t("Items sold today", "ዛሬ የተሸጡ ዕቃዎች")} value={String(deptSummary.qty)} icon="ShoppingBag" tone="teff" />
                      {showDailyConsumptionDashboard ? (
                        <Stat label={t("Today's consumption", "የዛሬ መጠቀም")} value={String(stockModule.dashboard.todayDailyConsumption)} icon="UtensilsCrossed" />
                      ) : (
                        <Stat label={t("Sales deductions", "የሽያጭ ቅነጥታዎች")} value={String(stockModule.dashboard.todaySalesDeductions)} icon="MinusCircle" />
                      )}
                      <Stat label={t("My stock value", "የእኔ ክምችት ዋጋ")} value={money(stockModule.dashboard.totalInventoryValue)} icon="Wallet" tone="gold" />
                    </div>
                    <div className="grid grid-cols-2 xl:grid-cols-4 gap-4">
                      <Stat label={t("Low stock items", "ዝቅተኛ ዕቃዎች")} value={String(stockModule.dashboard.lowStockItems.length)} icon="AlertTriangle" tone="gold" />
                      <Stat label={t("Pending requests", "በመጠባበቅ ላይ ያሉ ጥያቄዎች")} value={String(stockModule.dashboard.pendingStockRequests)} icon="Inbox" />
                      <Stat
                        label={t("Pending physical counts", "በመጠባበቅ ላይ ቆጠራዎች")}
                        value={String(stockModule.counts.filter((row) => row.status !== "Posted").length)}
                        icon="ClipboardList"
                      />
                      <Stat
                        label={t("Daily closing", "ዕለታዊ መዝጊያ")}
                        value={
                          scopedClosings.some((row) => row.date === today && (workspace === "all" || row.location === workspace))
                            ? t("Closed", "ተዘግቷል")
                            : t("Open", "ክፍት")
                        }
                        icon="ClipboardCheck"
                      />
                    </div>
                    {workspace === "Coffee House" ? (
                      <CoffeeHouseOpsPanel
                        salesRecords={store.salesRecords}
                        balances={scopedBalances}
                        items={scopedItems}
                        dailyConsumptions={stockModule.dailyConsumptions}
                        recipes={stockModule.recipes}
                        date={today}
                      />
                    ) : null}
                    {workspace === "Kitchen" ? (
                      <KitchenOpsPanel
                        salesRecords={store.salesRecords}
                        balances={scopedBalances}
                        items={scopedItems}
                        ledger={scopedLedger}
                        dailyConsumptions={stockModule.dailyConsumptions}
                        recipes={kitchenRecipes}
                        date={today}
                        onOpenRecipes={showRecipeBom ? () => setTab("recipes") : undefined}
                      />
                    ) : null}
                    <StaffConsumptionDashboardPanel
                      access={access!}
                      dashboard={stockModule.dashboard}
                      detail={showStaffConsumptionDetail}
                    />
                    <div className="grid xl:grid-cols-[1.5fr_1fr] gap-4">
                      <Card>
                        <div className="flex items-center justify-between mb-4">
                          <h3 className="font-display text-lg font-semibold">{t("Low stock alert", "የእቃ እርምጃ ማስጠንቀቂያ")}</h3>
                          <Chip tone="gold">{stockModule.dashboard.lowStockItems.length}</Chip>
                        </div>
                        <div className="space-y-2">
                          {stockModule.dashboard.lowStockItems.slice(0, 8).map((row) => (
                            <div key={`${row.itemId}-${row.location}`} className="rounded-lg bg-surface-2 p-3 flex items-center justify-between gap-3">
                              <div>
                                <div className="font-medium">{row.itemName}</div>
                                <div className="text-xs text-muted-foreground">{row.location} · {row.category}</div>
                              </div>
                              <div className="text-right">
                                <div className="font-mono text-sm">{row.quantity} {row.unit}</div>
                                <div className="text-xs text-muted-foreground">{t("Reorder", "የመደገፊያ ደረጃ")} {row.reorderLevel}</div>
                              </div>
                            </div>
                          ))}
                          {stockModule.dashboard.lowStockItems.length === 0 && <div className="text-sm text-muted-foreground">{t("No low stock items right now.", "አሁን የእቃ ዝቅተኛ እቃዎች የሉም።")}</div>}
                        </div>
                      </Card>
                      <Card>
                        <div className="flex items-center justify-between mb-4">
                          <h3 className="font-display text-lg font-semibold">{t("Top sold today", "ዛሬ በብዛት የተሸጡ")}</h3>
                          <Chip tone="teff">{topSold.length}</Chip>
                        </div>
                        <div className="space-y-2">
                          {topSold.map((row) => (
                            <div key={row.productId ?? row.productName} className="rounded-lg bg-surface-2 p-3 flex items-center justify-between gap-3">
                              <div>
                                <div className="font-medium">{row.productName}</div>
                                <div className="text-xs text-muted-foreground">{row.qty} {t("sold", "ተሽጧል")}</div>
                              </div>
                              <div className="text-right font-mono text-sm">{money(row.revenue)}</div>
                            </div>
                          ))}
                          {topSold.length === 0 && <div className="text-sm text-muted-foreground">{t("No POS sales for your department since last closing.", "ከመጨረሻው መዝጊያ በኋላ ለክፍልዎ የPOS ሽያጭ የለም።")}</div>}
                        </div>
                      </Card>
                    </div>
                  </>
                );
              })()}
            </>
          ) : (
            <>
              {showDailyConsumptionDashboard ? (
                <div className="grid grid-cols-2 xl:grid-cols-4 gap-4">
                  <Stat label={t("Today's consumption", "የዛሬ መጠቀም")} value={String(stockModule.dashboard.todayDailyConsumption)} icon="UtensilsCrossed" tone="ember" />
                  <Stat label={t("Low stock items", "ዝቅተኛ ዕቃዎች")} value={String(stockModule.dashboard.lowStockItems.length)} icon="AlertTriangle" tone="gold" />
                  <Stat label={t("Pending requests", "በመጠባበቅ ላይ")} value={String(stockModule.dashboard.pendingStockRequests)} icon="Inbox" />
                  <Stat
                    label={t("Daily closing", "ዕለታዊ መዝጊያ")}
                    value={
                      scopedClosings.some((row) => row.date === dateKey() && row.location === workspace)
                        ? t("Closed", "ተዘግቷል")
                        : t("Open", "ክፍት")
                    }
                    icon="ClipboardCheck"
                  />
                </div>
              ) : null}
              {workspace === "Coffee House" ? (
                <CoffeeHouseOpsPanel
                  salesRecords={store.salesRecords}
                  balances={scopedBalances}
                  items={scopedItems}
                  dailyConsumptions={stockModule.dailyConsumptions}
                  recipes={stockModule.recipes}
                  date={dateKey()}
                />
              ) : null}
              {workspace === "Kitchen" ? (
                <KitchenOpsPanel
                  salesRecords={store.salesRecords}
                  balances={scopedBalances}
                  items={scopedItems}
                  ledger={scopedLedger}
                  dailyConsumptions={stockModule.dailyConsumptions}
                  recipes={kitchenRecipes}
                  date={dateKey()}
                  onOpenRecipes={showRecipeBom ? () => setTab("recipes") : undefined}
                />
              ) : null}
              {access && (workspace === "all" || isOperationalStockLocation(workspace)) ? (
                <StaffConsumptionDashboardPanel
                  access={access}
                  dashboard={stockModule.dashboard}
                  detail={showStaffConsumptionDetail}
                />
              ) : null}
              {(() => {
                const today = dateKey();
                const periodStart =
                  stockModule.dashboard.dailyPeriodStart ??
                  resolveDailyDashboardPeriodStart(scopedClosings, workspace);
                const allTodaySales = filterSalesAfterDashboardPeriod(
                  store.salesRecords.filter((row) => row.date === today),
                  periodStart,
                );
                const salesSummary = summarizeSales(allTodaySales);
                return (
                  <>
          <div className="grid grid-cols-2 xl:grid-cols-4 gap-4">
            <Stat label={t("Total sales", "ጠቅላላ ሽያጭ")} value={money(salesSummary.revenue)} icon="TrendingUp" tone="ember" />
            <Stat label={t("Total inventory value", "የክምችት ጠቅላላ ዋጋ")} value={money(stockModule.dashboard.totalInventoryValue)} icon="Wallet" tone="gold" />
            <Stat label={t("Low stock items", "ዝቅተኛ ዕቃዎች")} value={String(stockModule.dashboard.lowStockItems.length)} icon="AlertTriangle" tone="gold" />
            <Stat label={t("Today's purchases", "ዛሬ የተደረጉ ግዢዎች")} value={money(stockModule.dashboard.todayPurchases)} icon="PackagePlus" tone="teff" />
          </div>
          <div className="grid grid-cols-2 xl:grid-cols-4 gap-4">
            <Stat label={t("Sales deductions", "የሽያጭ ቅነጥታዎች")} value={String(stockModule.dashboard.todaySalesDeductions)} icon="MinusCircle" />
            <Stat label={t("Today's expenses", "ዛሬ የተከፈሉ ወጪዎች")} value={money(stockModule.dashboard.todayExpenses)} icon="BadgeDollarSign" />
            <Stat label={t("Stock differences", "የክምችት ልዩነቶች")} value={String(stockModule.dashboard.stockDifferences)} icon="Scale" />
            <Stat label={t("Negative stock", "የእቃ እጥረት")} value={String(stockModule.dashboard.negativeStockItems.length)} icon="CircleAlert" tone="destructive" />
          </div>

          <div className="grid xl:grid-cols-[1.5fr_1fr] gap-4">
            <Card>
              <div className="flex items-center justify-between mb-4">
                <h3 className="font-display text-lg font-semibold">{t("Low stock alert", "የእቃ እርምጃ ማስጠንቀቂያ")}</h3>
                <Chip tone="gold">{stockModule.dashboard.lowStockItems.length}</Chip>
              </div>
              <div className="space-y-2">
                {stockModule.dashboard.lowStockItems.slice(0, 8).map((row) => (
                  <div key={`${row.itemId}-${row.location}`} className="rounded-lg bg-surface-2 p-3 flex items-center justify-between gap-3">
                    <div>
                      <div className="font-medium">{row.itemName}</div>
                      <div className="text-xs text-muted-foreground">{row.location} · {row.category}</div>
                    </div>
                    <div className="text-right">
                      <div className="font-mono text-sm">{row.quantity} {row.unit}</div>
                      <div className="text-xs text-muted-foreground">{t("Reorder", "የመደገፊያ ደረጃ")} {row.reorderLevel}</div>
                    </div>
                  </div>
                ))}
                {stockModule.dashboard.lowStockItems.length === 0 && <div className="text-sm text-muted-foreground">{t("No low stock items right now.", "አሁን የእቃ ዝቅተኛ እቃዎች የሉም።")}</div>}
              </div>
            </Card>
            <Card>
              <div className="flex items-center justify-between mb-4">
                <h3 className="font-display text-lg font-semibold">{t("Top selling items", "የሚሸጡ ምርቶች")}</h3>
                <Chip tone="teff">{stockModule.dashboard.topSellingItems.length}</Chip>
              </div>
              <div className="space-y-2">
                {stockModule.dashboard.topSellingItems.map((row) => (
                  <div key={row.itemName} className="rounded-lg bg-surface-2 p-3 flex items-center justify-between gap-3">
                    <div className="font-medium">{row.itemName}</div>
                    <div className="text-right font-mono text-sm">{row.quantity}</div>
                  </div>
                ))}
                {stockModule.dashboard.topSellingItems.length === 0 && <div className="text-sm text-muted-foreground">{t("No POS sales deductions since last closing.", "ከመጨረሻው መዝጊያ በኋላ የPOS ሽያጭ ቅነጣዎች የሉም።")}</div>}
              </div>
            </Card>
          </div>
                  </>
                );
              })()}
            </>
          )}
        </div>
      )}

      {tab === "goat-processing" && (
        <GoatRegistrationPanel
          items={stockModule.items}
          ledger={stockModule.fullLedger}
          lots={stockModule.lots}
          allLots={stockModule.allLots}
          registrations={stockModule.goatRegistrations}
          salesRecords={store.salesRecords}
          menuItems={store.menuItems}
          recipes={stockModule.recipes}
          userName={nowUserName(user?.name)}
          actions={{
            saveGoatRegistrations: stockModule.saveGoatRegistrations,
            setLedger: stockModule.setLedger,
            saveLots: stockModule.saveLots,
            saveItem: stockModule.saveItem,
          }}
          onKiklYieldChange={(boneKgPerPlate) => {
            const { recipe } = applyKiklBoneKgPerPlate(stockModule.recipes, boneKgPerPlate);
            stockModule.saveRecipe(recipe);
            showSuccess(
              t(
                `Kikl recipe updated: ${boneKgPerPlate} kg bones per plate.`,
                `የክል እቃ አዘገጅ ተዘምኗል: ${boneKgPerPlate} kg አጥንት በሳህን።`,
              ),
            );
          }}
        />
      )}

      {tab === "items" && (
        <Card className="!p-0 overflow-hidden">
          <div className="border-b border-border bg-surface-2/40 p-4">
            <div className="grid md:grid-cols-2 xl:grid-cols-4 gap-3">
              <Input
                label={t("Search stock items", "የክምችት እቃዎችን ፈልግ")}
                value={itemSearch}
                onChange={setItemSearch}
              />
              <Select
                label={t("Category", "ምድብ")}
                value={itemCategoryFilter}
                onChange={setItemCategoryFilter}
                options={[
                  { value: "ALL", label: t("All categories", "ሁሉም ምድቦች") },
                  ...stockItemCategories.map((category) => ({ value: category, label: category })),
                ]}
              />
              <Select
                label={t("Location", "ቦታ")}
                value={itemLocationFilter}
                onChange={setItemLocationFilter}
                options={[
                  { value: "ALL", label: t("All locations", "ሁሉም ቦታዎች") },
                  ...stockItemLocations.map((location) => ({ value: location, label: location })),
                ]}
              />
              <Input
                label={t("Matched items", "የተገኙ እቃዎች")}
                value={String(filteredStockItems.length)}
                onChange={() => {}}
                disabled
              />
            </div>
            <div className="mt-3 flex items-center justify-between gap-3 flex-wrap text-xs text-muted-foreground">
              <div>
                {t(
                  `Showing ${filteredStockItems.length} of ${scopedItems.filter((item) => !isGoatPoolSku(item.id)).length} stock items`,
                  `ከ ${scopedItems.filter((item) => !isGoatPoolSku(item.id)).length} የክምችት እቃዎች ${filteredStockItems.length} እየታዩ ነው`,
                )}
              </div>
              <button
                onClick={() => {
                  setItemSearch("");
                  setItemCategoryFilter("ALL");
                  setItemLocationFilter("ALL");
                }}
                className="h-8 px-3 rounded-lg border border-border bg-card hover:bg-surface-2"
              >
                {t("Clear filters", "ማጣሪያዎችን አጥፋ")}
              </button>
            </div>
          </div>
          <table className="w-full text-sm">
            <thead className="bg-surface-2 text-xs uppercase tracking-wider text-muted-foreground">
              <tr>
                <th className="text-left px-4 py-3">{t("Item", "እቃ")}</th>
                <th className="text-left px-4 py-3">{t("Category", "ምድብ")}</th>
                <th className="text-left px-4 py-3">{t("Unit", "አሃድ")}</th>
                <th className="text-left px-4 py-3">{t("Location", "ቦታ")}</th>
                <th className="text-right px-4 py-3">{t("Purchase", "የግዢ ዋጋ")}</th>
                <th className="text-right px-4 py-3">{t("Sell", "የሽያጭ ዋጋ")}</th>
                <th className="text-right px-4 py-3">{t("VIP", "VIP")}</th>
                <th className="text-right px-4 py-3">{t("Current", "አሁን ያለ")}</th>
                <th className="text-right px-4 py-3">{t("Reorder", "የመደገፊያ ደረጃ")}</th>
                {canManageStockMaster ? <th className="text-right px-4 py-3"></th> : null}
              </tr>
            </thead>
            <tbody>
              {paginatedStockItems.map((item) => (
                <tr key={item.id} className="border-t border-border hover:bg-surface-2/60">
                  <td className="px-4 py-3">
                    <div className="font-medium">{item.name}</div>
                    <div className="text-xs text-muted-foreground">{item.supplierName || "-"}</div>
                  </td>
                  <td className="px-4 py-3">{item.category}</td>
                  <td className="px-4 py-3 font-mono text-muted-foreground">{item.baseUnit}</td>
                  <td className="px-4 py-3">
                    {displayItemStockLocation(item, scopedBalances, access, workspace)}
                  </td>
                  <td className="px-4 py-3 text-right font-mono">
                    {item.purchasePrice > 0 ? (
                      formatETB(item.purchasePrice)
                    ) : (
                      <span
                        className="text-destructive"
                        title={t(
                          "No purchase price set. Inventory value stays ETB 0 until a price is set or a priced GRV is received.",
                          "የግዢ ዋጋ አልተቀመጠም። ዋጋ እስኪቀመጥ ወይም ዋጋ ያለው GRV እስኪቀበል ድረስ የክምችት ዋጋ ብር 0 ይቆያል።",
                        )}
                      >
                        {formatETB(0)} ⚠
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-right font-mono">{formatETB(item.sellingPrice)}</td>
                  <td className="px-4 py-3 text-right font-mono">{item.vipSellingPrice ? formatETB(item.vipSellingPrice) : "-"}</td>
                  <td className="px-4 py-3 text-right font-mono">
                    {(() => {
                      const onHand = itemAvailableQuantity(item.id, scopedBalances);
                      const incoming = itemIncomingQuantity(item.id, scopedBalances);
                      if (incoming > 0) {
                        return (
                          <span title={t("On-hand (in transit after dispatch, not yet received)", "ባለ እጅ (ከመላክ በኋላ በመንገድ ላይ፣ ገና አልተቀበለም)")}>
                            {onHand}
                            <span className="text-muted-foreground"> (+{incoming})</span>
                          </span>
                        );
                      }
                      return onHand;
                    })()}
                  </td>
                  <td className="px-4 py-3 text-right font-mono">{item.reorderLevel}</td>
                  {canManageStockMaster ? (
                    <td className="px-4 py-3 text-right">
                      {canManageStockMasterItem(access, item) ? (
                        <div className="flex items-center justify-end gap-3">
                          <button onClick={() => setEditingItem(item)} className="text-xs text-ember hover:underline">{t("Edit", "ቀይር")}</button>
                          <button onClick={() => deleteStockItem(item)} className="text-xs text-destructive hover:underline">{t("Delete", "ሰርዝ")}</button>
                        </div>
                      ) : null}
                    </td>
                  ) : null}
                </tr>
              ))}
              {filteredStockItems.length === 0 && (
                <tr>
                  <td colSpan={canManageStockMaster ? 10 : 9} className="px-4 py-10 text-center text-muted-foreground">
                    {t("No stock items match your filters.", "ማጣሪያዎትን የሚያሟሉ የክምችት እቃዎች የሉም።")}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
          <TablePagination
            page={itemPage}
            totalPages={stockItemTotalPages}
            totalItems={filteredStockItems.length}
            pageSize={STOCK_TABLE_PAGE_SIZE}
            onPageChange={setItemPage}
          />
        </Card>
      )}

      {tab === "approval-inbox" && (
        <ApprovalInboxPanel
          tasks={workflowTasks}
          onAction={handleWorkflowTask}
          onOpenTab={(next) => setTab(next)}
        />
      )}
      {tab === "receive-stock" && (
        <ReceiveStockPanel
          tasks={receiveWorkflowTasks}
          onReceive={handleWorkflowTask}
          onOpenTab={(next) => setTab(next)}
        />
      )}
      {tab === "requisitions" && (
        <PurchaseRequisitionPanel
          items={stockModule.items}
          requisitions={stockModule.purchaseRequisitions}
          canApprove={actorPermissions.canApproveRequests}
          onSubmit={savePurchaseRequisitionDocument}
          onApprove={approvePurchaseRequisitionDocument}
        />
      )}
      {tab === "purchase-orders" && (
        <PurchaseOrderPanel
          requisitions={stockModule.purchaseRequisitions}
          purchaseOrders={stockModule.purchaseOrders}
          suppliers={store.suppliers}
          canApprove={actorPermissions.canApproveRequests}
          onConvert={convertRequisitionToPo}
          onApproveOrder={approvePurchaseOrderDocument}
        />
      )}
      {tab === "grv" && (
        <GoodsReceivingVoucherPanel
          purchaseOrders={stockModule.purchaseOrders}
          vouchers={stockModule.goodsReceivingVouchers}
          onSubmit={saveGoodsReceivingVoucherDocument}
        />
      )}
      {tab === "department-requests" && (
        <DepartmentStockRequestPanel
          items={stockModule.items}
          balances={stockModule.balances}
          warehouseBalances={stockModule.warehouseBalances}
          issueVouchers={stockModule.storeIssueVouchers}
          requests={stockModule.requests}
          defaultDepartment={defaultDepartment}
          locationOptions={operationalLocationOptions}
          canApprove={actorPermissions.canApproveRequests}
          canReceive={Boolean(access && defaultDepartment && canConfirmDepartmentIssueReceipt(access, defaultDepartment))}
          onSubmit={saveDepartmentStockRequestDocument}
          onApprove={approveDepartmentRequestDocument}
          onReject={rejectDepartmentRequestDocument}
          onReceiveIssue={receiveIssueVoucherDocument}
        />
      )}
      {tab === "issue-vouchers" && (
        <IssueVoucherPanel
          requests={stockModule.issueVoucherRequests}
          vouchers={stockModule.storeIssueVouchers}
          allVouchers={stockModule.allStoreIssueVouchers}
          workspace={workspace}
          canDispatch={actorPermissions.canDispatchTransfers}
          canReceiveAt={(location) => (access ? canConfirmDepartmentIssueReceipt(access, location) : false)}
          onConvert={convertRequestToIssueVoucherDocument}
          onDispatch={dispatchIssueVoucherDocument}
          onReceive={receiveIssueVoucherDocument}
        />
      )}
      {tab === "store-transfer-vouchers" && (
        <StoreTransferVoucherPanel
          items={stockModule.items}
          vouchers={stockModule.storeTransferVouchers}
          sourceLocationOptions={locationOptions}
          destinationLocationOptions={STOCK_LOCATIONS as StockLocation[]}
          canApprove={actorPermissions.canApproveRequests}
          canDispatch={actorPermissions.canDispatchTransfers}
          canReceiveAt={(location) =>
            access
              ? (() => {
                  const authorized = resolveAuthorizedLocations(access);
                  return authorized === "all" || authorized.includes(location);
                })()
              : false
          }
          onSubmit={saveStoreTransferVoucherDocument}
          onApprove={approveStoreTransferVoucherDocument}
          onDispatch={dispatchStoreTransferVoucherDocument}
          onReceive={receiveStoreTransferVoucherDocument}
        />
      )}
      {tab === "goods-returns" && (
        <GoodsReturnVoucherPanel
          items={stockModule.items}
          vouchers={stockModule.goodsReturnVouchers}
          canApprove={actorPermissions.canApproveRequests || actorPermissions.canApproveAdjustments}
          onSubmit={saveGoodsReturnVoucherDocument}
          onApprovePost={approveAndPostGoodsReturnDocument}
        />
      )}
      {tab === "adjustment-vouchers" && (
        <StockAdjustmentVoucherPanel
          items={stockModule.items}
          locationOptions={locationOptions}
          onSubmit={saveAdjustmentVoucherDocument}
        />
      )}
      {tab === "physical-counts" && (
        <PhysicalStockCountPanel
          items={stockModule.items}
          counts={stockModule.counts}
          locationOptions={locationOptions}
          canApprove={actorPermissions.canApproveAdjustments || actorPermissions.canApproveRequests}
          onSubmit={savePhysicalCountDocument}
          onApprove={approvePhysicalCountDocument}
        />
      )}
      {tab === "daily-consumption" && dailyConsumptionDepartments.length > 0 && (
        <DailyConsumptionPanel
          department={dailyConsumptionDepartments[0]}
          departmentOptions={dailyConsumptionDepartments}
          balances={scopedBalances}
          items={scopedItems}
          history={stockModule.dailyConsumptions}
          salesRecords={store.salesRecords}
          recipes={workspace === "Kitchen" ? kitchenRecipes : stockModule.recipes}
          ledger={scopedLedger}
          onPost={saveDailyConsumptionDocument}
          userName={nowUserName(user?.name)}
          canApprove={actorPermissions.canApproveAdjustments || actorPermissions.canApproveRequests}
        />
      )}
      {tab === "document-history" && <DocumentHistoryPanel stockModule={stockModule} onReverse={reverseDocument} />}
      {tab === "expenses" && <ExpensePanel onSubmit={recordExpense} />}
      {tab === "recipes" && (
        <RecipePanel
          items={scopedItems}
          recipes={workspace === "Kitchen" ? kitchenRecipes : stockModule.recipes}
          onEdit={setEditingRecipe}
          onAdd={() => setEditingRecipe(emptyRecipe())}
        />
      )}
      {tab === "closing" && (
        <ClosingPanel
          items={scopedItems}
          ledger={scopedLedger}
          locationOptions={locationOptions}
          onSubmit={recordClosing}
          userName={nowUserName(user?.name)}
        />
      )}
      {tab === "reports" && (
        <ReportsPanel
          balances={scopedBalances}
          ledger={scopedLedger}
          closings={scopedClosings}
          items={scopedItems}
          lots={stockModule.lots}
          settings={stockModule.settings}
          locationPolicies={stockModule.locationPolicies}
          purchaseOrders={stockModule.purchaseOrders}
          goodsReceivingVouchers={stockModule.goodsReceivingVouchers}
          counts={stockModule.counts}
          posReservations={stockModule.posReservations}
          dailyConsumptions={stockModule.dailyConsumptions}
          orders={store.orders}
          documents={[
            ...stockModule.purchaseRequisitions,
            ...stockModule.purchaseOrders,
            ...stockModule.goodsReceivingVouchers,
            ...stockModule.storeIssueVouchers,
            ...stockModule.storeTransferVouchers,
            ...stockModule.goodsReturnVouchers,
          ]}
        />
      )}
      {tab === "settings" && (
        <InventorySettingsPanel
          settings={stockModule.settings}
          items={stockModule.items}
          locationPolicies={stockModule.locationPolicies}
          lots={stockModule.lots}
          userName={nowUserName(user?.name)}
          onSaveSettings={(next) => {
            stockModule.saveInventorySettings(next);
            showSuccess(t("Inventory settings saved.", "የክምችት ቅንብሮች ተቀምጠዋል።"));
          }}
          onSavePolicy={(policy) => {
            stockModule.saveLocationPolicy(policy);
            showSuccess(t("Location reorder policy saved.", "የቦታ ድጋሚ ትዕዛዝ ፖሊሲ ተቀምጧል።"));
          }}
        />
      )}

      {editingItem && access && canManageStockMaster && (
        <StockItemEditor
          item={editingItem}
          locationOptions={stockMasterLocationOptions(access)}
          onClose={() => setEditingItem(null)}
          onSave={(item) => {
            if (!canManageStockMasterItem(access, item)) {
              showError(t("You are not allowed to save this stock item.", "ይህን የክምችት እቃ ማስቀመጥ አይችሉም።"));
              return;
            }
            stockModule.saveItem(item);
            setEditingItem(null);
            showSuccess(t("Stock item saved successfully.", "የክምችት እቃው በትክክል ተቀምጧል።"));
          }}
        />
      )}
      {editingRecipe && (
        <StockRecipeEditor
          recipe={editingRecipe}
          items={scopedItems}
          menuItems={store.menuItems}
          onClose={() => setEditingRecipe(null)}
          onSave={(recipe) => {
            stockModule.saveRecipe(recipe);
            setEditingRecipe(null);
            showSuccess(t("Recipe saved successfully.", "አዘገጃጀቱ በትክክል ተቀምጧል።"));
          }}
        />
      )}
    </div>
  );
}

function SectionCard({ title, children }: { title: string; children: React.ReactNode }) {
  const t = useT();
  return (
    <Card>
      <div className="mb-4">
        <h3 className="font-display text-lg font-semibold">{t(title)}</h3>
      </div>
      {children}
    </Card>
  );
}

function PurchasePanel({ items, suppliers, onSubmit }: { items: StockManagedItem[]; suppliers: Supplier[]; onSubmit: (input: { date: string; supplierName: string; itemId: string; quantity: number; unit: StockUnitType; unitPrice: number; paymentStatus: string; notes?: string }) => void }) {
  const t = useT();
  const supplierOptions = useMemo(
    () => suppliers.map((supplier) => supplier.name).filter(Boolean).sort((a, b) => a.localeCompare(b)),
    [suppliers],
  );
  const [form, setForm] = useState({ date: todayKey(), supplierName: items[0]?.supplierName || supplierOptions[0] || "", itemId: items[0]?.id || "", quantity: 1, unit: (items[0]?.baseUnit || "bottle") as StockUnitType, unitPrice: items[0]?.purchasePrice || 0, paymentStatus: "Pending", notes: "" });
  const item = items.find((row) => row.id === form.itemId);
  useEffect(() => {
    if (!item) return;
    setForm((prev) => {
      const nextSupplier = item.supplierName || prev.supplierName || supplierOptions[0] || "";
      if (prev.supplierName === nextSupplier && prev.unit === item.baseUnit && prev.unitPrice === item.purchasePrice) {
        return prev;
      }
      return {
        ...prev,
        supplierName: nextSupplier,
        unit: item.baseUnit,
        unitPrice: item.purchasePrice,
      };
    });
  }, [item?.baseUnit, item?.id, item?.purchasePrice, item?.supplierName, supplierOptions]);
  const canSubmit = Boolean(form.itemId && form.supplierName.trim() && form.quantity > 0 && form.unitPrice >= 0);
  return (
    <SectionCard title={t("Stock Purchase / Stock In", "የክምችት ግባ / የክምችት መዝገብ")}>
      <div className="grid md:grid-cols-2 xl:grid-cols-4 gap-3">
        <Input label={t("Date", "ቀን")} value={form.date} onChange={(value) => setForm({ ...form, date: value })} type="date" />
        <Select label={t("Supplier", "አቅራቢ")} value={form.supplierName} onChange={(value) => setForm({ ...form, supplierName: value })} options={supplierOptions.map((name) => ({ value: name, label: name }))} />
        <Select label={t("Item", "እቃ")} value={form.itemId} onChange={(value) => setForm({ ...form, itemId: value })} options={items.map((row) => ({ value: row.id, label: row.name }))} />
        <Input label={t("Quantity", "ብዛት")} type="number" value={String(form.quantity)} onChange={(value) => setForm({ ...form, quantity: Number(value) })} />
        <Select label={t("Unit", "እቃ አሃድ")} value={form.unit} onChange={(value) => setForm({ ...form, unit: value as StockUnitType })} options={STOCK_UNIT_TYPES.map((row) => ({ value: row, label: row }))} />
        <Input label={t("Purchase price", "የግዢ ዋጋ")} type="number" value={String(form.unitPrice)} onChange={(value) => setForm({ ...form, unitPrice: Number(value) })} />
        <Select label={t("Payment status", "የክፍያ ሁኔታ")} value={form.paymentStatus} onChange={(value) => setForm({ ...form, paymentStatus: value })} options={["Pending", "Paid", "Partial"].map((row) => ({ value: row, label: row }))} />
        <Input label={t("Total cost", "ጠቅላላ ወጪ")} value={String(money(form.quantity * form.unitPrice))} onChange={() => {}} type="number" disabled />
      </div>
      <TextArea label={t("Notes", "ማስታወሻ")} value={form.notes} onChange={(value) => setForm({ ...form, notes: value })} />
      <div className="mt-4 flex justify-end">
        <button disabled={!canSubmit} onClick={() => onSubmit(form)} className="h-10 px-4 rounded-lg bg-ember text-ember-foreground text-sm font-semibold disabled:opacity-40">{t("Save Purchase", "ግዢ አስቀምጥ")}</button>
      </div>
    </SectionCard>
  );
}

function TransferPanel({ items, users, currentUserName, currentUserRole, stations, onSubmit }: { items: StockManagedItem[]; users: Array<{ name: string; role: string }>; currentUserName: string; currentUserRole?: string; stations: readonly string[]; onSubmit: (input: { date: string; itemId: string; fromLocation: StockLocation; toLocation: StockLocation; quantity: number; unit: StockUnitType; approvedBy: string; receivedBy: string; notes?: string }) => void }) {
  const t = useT();
  const managerOptions = useMemo(
    () => users.filter((candidate) => isManagerRole(candidate.role)).map((candidate) => candidate.name).sort((a, b) => a.localeCompare(b)),
    [users],
  );
  const defaultApprovedBy = isManagerRole(currentUserRole) ? currentUserName : (managerOptions[0] || currentUserName);
  const [form, setForm] = useState({ date: todayKey(), itemId: items[0]?.id || "", fromLocation: "Store 1" as StockLocation, toLocation: "Main Bar" as StockLocation, quantity: 1, unit: (items[0]?.baseUnit || "bottle") as StockUnitType, approvedBy: defaultApprovedBy, receivedBy: "", notes: "" });
  const item = items.find((row) => row.id === form.itemId);
  const receiverOptions = useMemo(
    () => receiverCandidatesForLocation(form.toLocation, users, stations),
    [form.toLocation, stations, users],
  );
  useEffect(() => {
    if (!item) return;
    setForm((prev) => {
      if (prev.unit === item.baseUnit) return prev;
      return { ...prev, unit: item.baseUnit };
    });
  }, [item?.baseUnit, item?.id]);
  useEffect(() => {
    setForm((prev) => {
      if (prev.approvedBy || !defaultApprovedBy) return prev;
      return { ...prev, approvedBy: defaultApprovedBy };
    });
  }, [defaultApprovedBy]);
  useEffect(() => {
    setForm((prev) => {
      const nextReceivedBy = receiverOptions.some((name) => name.toLowerCase() === prev.receivedBy.toLowerCase())
        ? prev.receivedBy
        : (receiverOptions[0] || "");
      if (prev.receivedBy === nextReceivedBy) return prev;
      return { ...prev, receivedBy: nextReceivedBy };
    });
  }, [receiverOptions]);
  const canSubmit = Boolean(
    form.itemId &&
    form.quantity > 0 &&
    form.fromLocation !== form.toLocation &&
    form.approvedBy.trim() &&
    form.receivedBy.trim(),
  );
  return (
    <SectionCard title={t("Stock Transfer", "የክምችት ዝውውር")}>
      <div className="grid md:grid-cols-2 xl:grid-cols-4 gap-3">
        <Input label={t("Date", "ቀን")} type="date" value={form.date} onChange={(value) => setForm({ ...form, date: value })} />
        <Select label={t("Item", "እቃ")} value={form.itemId} onChange={(value) => setForm({ ...form, itemId: value })} options={items.map((row) => ({ value: row.id, label: row.name }))} />
        <Select label={t("From location", "ከዚህ ቦታ")} value={form.fromLocation} onChange={(value) => setForm({ ...form, fromLocation: value as StockLocation })} options={STOCK_LOCATIONS.map((row) => ({ value: row, label: row }))} />
        <Select label={t("To location", "ወደ ቦታ")} value={form.toLocation} onChange={(value) => setForm({ ...form, toLocation: value as StockLocation })} options={STOCK_LOCATIONS.map((row) => ({ value: row, label: row }))} />
        <Input label={t("Quantity", "ብዛት")} type="number" value={String(form.quantity)} onChange={(value) => setForm({ ...form, quantity: Number(value) })} />
        <Select label={t("Unit", "እቃ አሃድ")} value={form.unit} onChange={(value) => setForm({ ...form, unit: value as StockUnitType })} options={STOCK_UNIT_TYPES.map((row) => ({ value: row, label: row }))} />
        <Select label={t("Approved by", "ያፀደቀው") } value={form.approvedBy} onChange={(value) => setForm({ ...form, approvedBy: value })} options={managerOptions.length > 0 ? managerOptions.map((name) => ({ value: name, label: name })) : [{ value: currentUserName, label: currentUserName }]} />
        <Select label={t("Received by", "ተቀባዩ") } value={form.receivedBy} onChange={(value) => setForm({ ...form, receivedBy: value })} options={receiverOptions.length > 0 ? receiverOptions.map((name) => ({ value: name, label: name })) : [{ value: "", label: t("No matching staff", "ተስማሚ ሰራተኛ የለም") }]} />
      </div>
      {form.fromLocation === form.toLocation && <div className="mt-3 text-xs text-destructive">{t("Source and destination locations must be different.", "የመነሻ እና የመድረሻ ቦታዎች መለያየት አለባቸው።")}</div>}
      <TextArea label={t("Notes", "ማስታወሻ")} value={form.notes} onChange={(value) => setForm({ ...form, notes: value })} />
      <div className="mt-4 flex justify-end">
        <button disabled={!canSubmit} onClick={() => onSubmit(form)} className="h-10 px-4 rounded-lg bg-ember text-ember-foreground text-sm font-semibold disabled:opacity-40">{t("Approve Transfer", "ዝውውር አረጋግጥ")}</button>
      </div>
    </SectionCard>
  );
}

function DeductionPanel({ items, onSubmit }: { items: StockManagedItem[]; onSubmit: (input: { date: string; itemId: string; location: StockLocation; quantity: number; unit: StockUnitType; notes?: string }) => void }) {
  const t = useT();
  const [form, setForm] = useState({ date: todayKey(), itemId: items[0]?.id || "", location: "Main Bar" as StockLocation, quantity: 1, unit: (items[0]?.baseUnit || "bottle") as StockUnitType, notes: "" });
  const item = items.find((row) => row.id === form.itemId);
  useEffect(() => {
    if (!item) return;
    setForm((prev) => {
      if (prev.unit === item.baseUnit && prev.location === item.preferredLocation) return prev;
      return { ...prev, unit: item.baseUnit, location: item.preferredLocation };
    });
  }, [item?.baseUnit, item?.id, item?.preferredLocation]);
  return (
    <SectionCard title={t("Manual Sales Deduction", "የእጅ የሽያጭ ቅነጥታ") }>
      <div className="grid md:grid-cols-2 xl:grid-cols-5 gap-3">
        <Input label={t("Date", "ቀን")} type="date" value={form.date} onChange={(value) => setForm({ ...form, date: value })} />
        <Select label={t("Item", "እቃ")} value={form.itemId} onChange={(value) => setForm({ ...form, itemId: value })} options={items.map((row) => ({ value: row.id, label: row.name }))} />
        <Select label={t("Location", "ቦታ")} value={form.location} onChange={(value) => setForm({ ...form, location: value as StockLocation })} options={STOCK_LOCATIONS.map((row) => ({ value: row, label: row }))} />
        <Input label={t("Quantity", "ብዛት")} type="number" value={String(form.quantity)} onChange={(value) => setForm({ ...form, quantity: Number(value) })} />
        <Select label={t("Unit", "እቃ አሃድ")} value={form.unit} onChange={(value) => setForm({ ...form, unit: value as StockUnitType })} options={STOCK_UNIT_TYPES.map((row) => ({ value: row, label: row }))} />
      </div>
      <TextArea label={t("Notes", "ማስታወሻ")} value={form.notes} onChange={(value) => setForm({ ...form, notes: value })} />
      <div className="mt-4 flex justify-end">
        <button onClick={() => onSubmit(form)} className="h-10 px-4 rounded-lg bg-ember text-ember-foreground text-sm font-semibold">{t("Record Deduction", "ቅነጥታ ያስቀምጡ")}</button>
      </div>
    </SectionCard>
  );
}

function AdjustmentPanel({ items, onSubmit }: { items: StockManagedItem[]; onSubmit: (input: { date: string; itemId: string; location: StockLocation; quantity: number; unit: StockUnitType; reason: StockAdjustmentReason; notes?: string }) => void }) {
  const t = useT();
  const [form, setForm] = useState({ date: todayKey(), itemId: items[0]?.id || "", location: "Store 1" as StockLocation, quantity: 1, unit: (items[0]?.baseUnit || "bottle") as StockUnitType, reason: "Broken" as StockAdjustmentReason, notes: "" });
  const item = items.find((row) => row.id === form.itemId);
  useEffect(() => {
    if (!item) return;
    setForm((prev) => ({ ...prev, unit: item.baseUnit, location: item.preferredLocation }));
  }, [item?.id]);
  return (
    <SectionCard title={t("Waste and Adjustment", "ቆሻሻ እና ማስተካከያ")}>
      <div className="grid md:grid-cols-2 xl:grid-cols-6 gap-3">
        <Input label={t("Date", "ቀን")} type="date" value={form.date} onChange={(value) => setForm({ ...form, date: value })} />
        <Select label={t("Item", "እቃ")} value={form.itemId} onChange={(value) => setForm({ ...form, itemId: value })} options={items.map((row) => ({ value: row.id, label: row.name }))} />
        <Select label={t("Location", "ቦታ")} value={form.location} onChange={(value) => setForm({ ...form, location: value as StockLocation })} options={STOCK_LOCATIONS.map((row) => ({ value: row, label: row }))} />
        <Input label={t("Quantity", "ብዛት")} type="number" value={String(form.quantity)} onChange={(value) => setForm({ ...form, quantity: Number(value) })} />
        <Select label={t("Unit", "እቃ አሃድ")} value={form.unit} onChange={(value) => setForm({ ...form, unit: value as StockUnitType })} options={STOCK_UNIT_TYPES.map((row) => ({ value: row, label: row }))} />
        <Select label={t("Reason", "ምክንያት")} value={form.reason} onChange={(value) => setForm({ ...form, reason: value as StockAdjustmentReason })} options={STOCK_ADJUSTMENT_REASONS.map((row) => ({ value: row, label: row }))} />
      </div>
      <TextArea label={t("Notes", "ማስታወሻ")} value={form.notes} onChange={(value) => setForm({ ...form, notes: value })} />
      <div className="mt-4 flex justify-end">
        <button onClick={() => onSubmit(form)} className="h-10 px-4 rounded-lg bg-ember text-ember-foreground text-sm font-semibold">{t("Save Adjustment", "ማስተካከያ አስቀምጥ")}</button>
      </div>
    </SectionCard>
  );
}

function ExpensePanel({ onSubmit }: { onSubmit: (input: { date: string; department: StockExpenseDepartment; expenseItem: string; quantity: number; unitPrice: number; paymentMethod: string; notes?: string }) => void }) {
  const t = useT();
  const [form, setForm] = useState({ date: todayKey(), department: "Kitchen" as StockExpenseDepartment, expenseItem: "", quantity: 1, unitPrice: 0, paymentMethod: "Cash", notes: "" });
  return (
    <SectionCard title={t("Daily Expense Module", "የዕለታዊ ወጪ ሞጁል")}>
      <div className="grid md:grid-cols-2 xl:grid-cols-6 gap-3">
        <Input label={t("Date", "ቀን")} type="date" value={form.date} onChange={(value) => setForm({ ...form, date: value })} />
        <Select label={t("Department", "ክፍል")} value={form.department} onChange={(value) => setForm({ ...form, department: value as StockExpenseDepartment })} options={STOCK_EXPENSE_DEPARTMENTS.map((row) => ({ value: row, label: row }))} />
        <Input label={t("Expense item", "የወጪ እቃ")} value={form.expenseItem} onChange={(value) => setForm({ ...form, expenseItem: value })} />
        <Input label={t("Quantity", "ብዛት")} type="number" value={String(form.quantity)} onChange={(value) => setForm({ ...form, quantity: Number(value) })} />
        <Input label={t("Unit price", "የአንድ ዋጋ")} type="number" value={String(form.unitPrice)} onChange={(value) => setForm({ ...form, unitPrice: Number(value) })} />
        <Input label={t("Payment method", "የክፍያ ዘዴ")} value={form.paymentMethod} onChange={(value) => setForm({ ...form, paymentMethod: value })} />
      </div>
      <TextArea label={t("Notes", "ማስታወሻ")} value={form.notes} onChange={(value) => setForm({ ...form, notes: value })} />
      <div className="mt-4 flex items-center justify-between">
        <div className="text-sm text-muted-foreground">Total: <span className="font-mono text-foreground">{formatETB(money(form.quantity * form.unitPrice))}</span></div>
        <button onClick={() => onSubmit(form)} className="h-10 px-4 rounded-lg bg-ember text-ember-foreground text-sm font-semibold">{t("Save Expense", "ወጪ አስቀምጥ")}</button>
      </div>
    </SectionCard>
  );
}

function RecipePanel({ items, recipes, onEdit, onAdd }: { items: StockManagedItem[]; recipes: StockRecipe[]; onEdit: (recipe: StockRecipe) => void; onAdd: () => void }) {
  const t = useT();
  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <button onClick={onAdd} className="h-10 px-4 rounded-lg bg-ember text-ember-foreground text-sm font-semibold inline-flex items-center gap-2"><Icons.Plus className="size-4" />{t("Add Recipe", "እቃ አዘገጅ")}</button>
      </div>
      <div className="grid lg:grid-cols-2 gap-4">
        {recipes.map((recipe) => (
          <button key={recipe.id} type="button" onClick={() => onEdit(recipe)} className="text-left">
            <Card className="cursor-pointer hover:shadow-[var(--shadow-lift)]">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h3 className="font-display text-lg font-semibold">{recipe.menuItemName}</h3>
                  <p className="text-xs text-muted-foreground">{recipe.category} · {recipe.outputQty} {recipe.outputUnit}</p>
                </div>
                <Chip tone="teff">{recipe.ingredients.length} {t("items", "እቃዎች")}</Chip>
              </div>
              <div className="mt-3 space-y-1 text-sm">
                {recipe.ingredients.slice(0, 4).map((line) => (
                  <div key={line.id} className="flex justify-between gap-3">
                    <span>{line.itemName}</span>
                    <span className="font-mono text-muted-foreground">{line.quantity} {line.unit}</span>
                  </div>
                ))}
              </div>
            </Card>
          </button>
        ))}
      </div>
    </div>
  );
}

function ClosingPanel({
  items,
  ledger,
  onSubmit,
  userName,
  locationOptions = STOCK_LOCATIONS as StockLocation[],
}: {
  items: StockManagedItem[];
  ledger: StockLedgerEntry[];
  onSubmit: (input: StockClosingRecord) => void;
  userName: string;
  locationOptions?: StockLocation[];
}) {
  const t = useT();
  const [date, setDate] = useState(todayKey());
  const [location, setLocation] = useState<StockLocation>(locationOptions[0] ?? "Main Bar");
  const [notes, setNotes] = useState("");
  useEffect(() => {
    if (!locationOptions.includes(location) && locationOptions[0]) setLocation(locationOptions[0]);
  }, [location, locationOptions]);
  const locationEntries = ledger.filter((entry) => entry.date === date && (entry.location === location || entry.toLocation === location || entry.fromLocation === location));
  const stockReceived = locationEntries.filter((entry) => entry.type === "TRANSFER_IN" || entry.type === "PURCHASE_RECEIPT" || (entry.type === "PURCHASE" && entry.location === location)).reduce((sum, entry) => sum + entry.quantity, 0);
  const dailyConsumption = locationEntries.filter((entry) => entry.type === "DAILY_CONSUMPTION").reduce((sum, entry) => sum + entry.quantity, 0);
  const salesDeduction = locationEntries.filter((entry) => entry.type === "MANUAL_DEDUCTION" || entry.type === "POS_CONSUMPTION" || entry.type === "RECIPE_CONSUMPTION").reduce((sum, entry) => sum + entry.quantity, 0);
  const wasteDamage = locationEntries.filter((entry) => entry.type === "WASTE" || entry.type === "DAMAGE").reduce((sum, entry) => sum + entry.quantity, 0);
  const manualAdjustment = locationEntries.filter((entry) => entry.type === "ADJUSTMENT" || entry.type === "STOCK_COUNT_ADJUSTMENT").reduce((sum, entry) => sum + entry.quantity, 0);
  const openingStock = items.filter((item) => item.preferredLocation === location).reduce((sum, item) => sum + item.currentStock, 0);
  const calculatedClosing = qty(openingStock + stockReceived - dailyConsumption - salesDeduction - wasteDamage - manualAdjustment);
  const difference = qty(calculatedClosing - openingStock);
  return (
    <SectionCard title={t("Daily Stock Closing", "ዕለታዊ የክምችት መዝጊያ")}>
      <div className="grid md:grid-cols-2 xl:grid-cols-4 gap-3">
        <Input label={t("Date", "ቀን")} type="date" value={date} onChange={setDate} />
        <Select label={t("Location", "ቦታ")} value={location} onChange={(value) => setLocation(value as StockLocation)} options={locationOptions.map((row) => ({ value: row, label: row }))} />
        <Input label={t("Opening stock", "የመነሻ እቃ")} value={String(openingStock)} onChange={() => {}} disabled />
        <Input label={t("Stock received", "የተቀበለ እቃ")} value={String(stockReceived)} onChange={() => {}} disabled />
        <Input label={t("Daily consumption", "ዕለታዊ መጠቀም")} value={String(dailyConsumption)} onChange={() => {}} disabled />
        <Input label={t("Sales deduction", "የሽያጭ ቅነጥታ")} value={String(salesDeduction)} onChange={() => {}} disabled />
        <Input label={t("Waste / damage", "ቆሻሻ / ጉዳት")} value={String(wasteDamage)} onChange={() => {}} disabled />
        <Input label={t("Manual adjustment", "በእጅ የማስተካከያ")} value={String(manualAdjustment)} onChange={() => {}} disabled />
        <Input label={t("Closing stock", "የመዝጊያ እቃ")} value={String(calculatedClosing)} onChange={() => {}} disabled />
      </div>
      <TextArea label={t("Notes", "ማስታወሻ")} value={notes} onChange={setNotes} />
      <div className="mt-4 flex items-center justify-between">
        <div className="text-sm text-muted-foreground">Difference: <span className="font-mono text-foreground">{difference}</span></div>
        <button
          onClick={() =>
            onSubmit({
              id: `close-${Date.now()}`,
              date,
              location,
              openingStock,
              stockReceived,
              salesDeduction,
              wasteDamage,
              manualAdjustment,
              closingStock: calculatedClosing,
              difference,
              createdBy: userName,
              notes,
            })
          }
          className="h-10 px-4 rounded-lg bg-ember text-ember-foreground text-sm font-semibold"
        >
          {t("Save Closing", "ጠዋታዊ መዝጊያ አስቀምጥ")}
        </button>
      </div>
    </SectionCard>
  );
}

function PurchaseRequisitionPanel({
  items,
  requisitions,
  canApprove,
  onSubmit,
  onApprove,
}: {
  items: StockManagedItem[];
  requisitions: PurchaseRequisitionDocument[];
  canApprove: boolean;
  onSubmit: (input: {
    requestingStore: "Store 1" | "Store 2";
    requiredDate: string;
    itemId: string;
    requestedQuantity: number;
    unit: StockUnitType;
    reason: string;
    notes?: string;
  }) => void;
  onApprove: (requisitionId: string) => void;
}) {
  const t = useT();
  const [form, setForm] = useState({
    requestingStore: "Store 1" as "Store 1" | "Store 2",
    requiredDate: todayKey(),
    itemId: items[0]?.id || "",
    requestedQuantity: 1,
    unit: (items[0]?.baseUnit || "bottle") as StockUnitType,
    reason: "Low stock",
    notes: "",
  });
  const item = items.find((row) => row.id === form.itemId);
  const pending = requisitions.filter((row) => row.status === "Submitted" || row.status === "Under Review");
  useEffect(() => {
    if (!item) return;
    setForm((prev) => ({ ...prev, unit: item.baseUnit }));
  }, [item?.id]);
  return (
    <div className="space-y-4">
      <SectionCard title={t("Purchase Requisition", "የግዢ ጥያቄ")}>
        <div className="grid md:grid-cols-2 xl:grid-cols-3 gap-3">
          <Select label={t("Requesting store", "የሚጠይቀው ስቶር")} value={form.requestingStore} onChange={(value) => setForm({ ...form, requestingStore: value as "Store 1" | "Store 2" })} options={["Store 1", "Store 2"].map((row) => ({ value: row, label: row }))} />
          <Input label={t("Required date", "የሚፈለግበት ቀን")} type="date" value={form.requiredDate} onChange={(value) => setForm({ ...form, requiredDate: value })} />
          <Select label={t("Item", "እቃ")} value={form.itemId} onChange={(value) => setForm({ ...form, itemId: value })} options={items.map((row) => ({ value: row.id, label: row.name }))} />
          <Input label={t("Requested quantity", "የተጠየቀ ብዛት")} type="number" value={String(form.requestedQuantity)} onChange={(value) => setForm({ ...form, requestedQuantity: Number(value) })} />
          <Select label={t("Unit", "አሃድ")} value={form.unit} onChange={(value) => setForm({ ...form, unit: value as StockUnitType })} options={STOCK_UNIT_TYPES.map((row) => ({ value: row, label: row }))} />
          <Input label={t("Reason", "ምክንያት")} value={form.reason} onChange={(value) => setForm({ ...form, reason: value })} />
        </div>
        <TextArea label={t("Notes", "ማስታወሻ")} value={form.notes} onChange={(value) => setForm({ ...form, notes: value })} />
        <div className="mt-4 flex justify-end">
          <button onClick={() => onSubmit(form)} className="h-10 px-4 rounded-lg bg-ember text-ember-foreground text-sm font-semibold">{t("Submit Requisition", "ጥያቄ አስገባ")}</button>
        </div>
      </SectionCard>
      <SectionCard title={t("Pending approval", "ፈቃድ በመጠባበቅ")}>
        <div className="space-y-3">
          {pending.map((row) => (
            <div key={row.id} className="rounded-xl border border-border p-3 flex flex-wrap items-center justify-between gap-2">
              <div>
                <div className="font-mono font-medium">{row.requisitionNumber}</div>
                <div className="text-xs text-muted-foreground">{row.requestingStore} · {row.requestedBy} · {row.status}</div>
              </div>
              {canApprove ? (
                <button onClick={() => onApprove(row.id)} className="h-9 px-3 rounded-lg bg-ember text-ember-foreground text-xs font-semibold">{t("Approve", "አፅድቅ")}</button>
              ) : (
                <Chip>{row.status}</Chip>
              )}
            </div>
          ))}
          {pending.length === 0 && <div className="text-sm text-muted-foreground">{t("No requisitions awaiting approval.", "ፈቃድ የሚጠብቁ ጥያቄዎች የሉም።")}</div>}
        </div>
      </SectionCard>
    </div>
  );
}

function PurchaseOrderPanel({
  requisitions,
  purchaseOrders,
  suppliers,
  canApprove,
  onConvert,
  onApproveOrder,
}: {
  requisitions: PurchaseRequisitionDocument[];
  purchaseOrders: PurchaseOrderDocument[];
  suppliers: Supplier[];
  canApprove: boolean;
  onConvert: (requisition: PurchaseRequisitionDocument, supplier: string) => void;
  onApproveOrder: (orderId: string) => void;
}) {
  const t = useT();
  const supplierOptions = useMemo(
    () => suppliers.map((row) => row.name.trim()).filter(Boolean).sort((a, b) => a.localeCompare(b)),
    [suppliers],
  );
  const convertible = requisitions.filter((row) => row.status === "Approved" || row.status === "Partially Approved");
  const pendingOrders = purchaseOrders.filter((row) => row.status === "Draft" || row.status === "Submitted");
  const [selectedId, setSelectedId] = useState(convertible[0]?.id || "");
  const [supplier, setSupplier] = useState(supplierOptions[0] || "");
  const selected = convertible.find((row) => row.id === selectedId);

  useEffect(() => {
    if (!selected && convertible[0]?.id) {
      setSelectedId(convertible[0].id);
    }
  }, [selected, convertible]);

  useEffect(() => {
    if (supplierOptions.length === 0) {
      if (supplier) setSupplier("");
      return;
    }

    const currentExists = supplierOptions.some((row) => row.toLowerCase() === supplier.toLowerCase());
    if (!currentExists) {
      setSupplier(supplierOptions[0]);
    }
  }, [supplier, supplierOptions]);

  return (
    <div className="space-y-4">
      <SectionCard title={t("Purchase Orders", "የግዢ ትዕዛዞች")}>
        <div className="grid md:grid-cols-2 gap-3">
          <Select label={t("Approved requisition", "የተፈቀደ ጥያቄ")} value={selectedId} onChange={setSelectedId} options={convertible.map((row) => ({ value: row.id, label: `${row.requisitionNumber} • ${row.requestingStore}` }))} />
          <Select label={t("Supplier", "አቅራቢ")} value={supplier} onChange={setSupplier} options={supplierOptions.map((row) => ({ value: row, label: row }))} />
        </div>
        {supplierOptions.length === 0 ? (
          <div className="mt-3 rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 text-sm text-amber-900 dark:text-amber-200">
            {t(
              "No suppliers are available yet. Add a supplier first in Suppliers & Procurement, then create the purchase order.",
              "እስካሁን አቅራቢ የለም። በመጀመሪያ በአቅራቢዎች እና ግዢ ውስጥ አቅራቢ ያክሉ፣ ከዚያ የግዢ ትዕዛዝ ይፍጠሩ።",
            )}
          </div>
        ) : null}
        {selected ? (
          <div className="mt-4 rounded-lg bg-surface-2 p-3 text-sm">
            <div className="font-medium">{selected.requisitionNumber}</div>
            <div className="text-muted-foreground text-xs mt-1">{selected.requestingStore} • {selected.status}</div>
            <div className="mt-2 space-y-1">
              {selected.lines.map((line) => (
                <div key={line.id} className="flex justify-between gap-3">
                  <span>{line.itemName}</span>
                  <span className="font-mono">{line.approvedQuantity || line.requestedQuantity} {line.unit}</span>
                </div>
              ))}
            </div>
          </div>
        ) : null}
        <div className="mt-4 flex justify-end">
          <button disabled={!selected || !supplier} onClick={() => selected && onConvert(selected, supplier)} className="h-10 px-4 rounded-lg bg-ember text-ember-foreground text-sm font-semibold disabled:opacity-40">{t("Create Purchase Order", "የግዢ ትዕዛዝ ፍጠር")}</button>
        </div>
      </SectionCard>
      <SectionCard title={t("PO approval queue", "የPO ፈቃድ ወረፋ")}>
        <div className="space-y-3">
          {pendingOrders.map((order) => (
            <div key={order.id} className="rounded-xl border border-border p-3 flex flex-wrap items-center justify-between gap-2">
              <div>
                <div className="font-mono font-medium">{order.purchaseOrderNumber}</div>
                <div className="text-xs text-muted-foreground">{order.supplier} · {order.preparedBy} · {order.status}</div>
              </div>
              {canApprove ? (
                <button onClick={() => onApproveOrder(order.id)} className="h-9 px-3 rounded-lg bg-ember text-ember-foreground text-xs font-semibold">{t("Approve PO", "PO አፅድቅ")}</button>
              ) : (
                <Chip>{order.status}</Chip>
              )}
            </div>
          ))}
          {pendingOrders.length === 0 && <div className="text-sm text-muted-foreground">{t("No purchase orders awaiting approval.", "ፈቃድ የሚጠብቁ የግዢ ትዕዛዞች የሉም።")}</div>}
        </div>
      </SectionCard>
    </div>
  );
}

function GoodsReceivingVoucherPanel({
  purchaseOrders,
  vouchers = [],
  onSubmit,
}: {
  purchaseOrders: PurchaseOrderDocument[];
  vouchers?: GoodsReceivingVoucherDocument[];
  onSubmit: (input: {
    purchaseOrderNumber: string;
    receivingDate: string;
    receivedBy: string;
    itemId: string;
    receivedQuantity: number;
    rejectedQuantity: number;
    freeQuantity: number;
    unitCost: number;
    batchNumber?: string;
    expiryDate?: string;
  }) => void;
}) {
  const t = useT();
  const availableOrders = purchaseOrders.filter((row) => row.status === "Approved" || row.status === "Partially Received");
  const [purchaseOrderNumber, setPurchaseOrderNumber] = useState(availableOrders[0]?.purchaseOrderNumber || "");
  const selectedOrder = availableOrders.find((row) => row.purchaseOrderNumber === purchaseOrderNumber);
  const selectedLine = selectedOrder?.lines[0];
  const [form, setForm] = useState({
    receivingDate: todayKey(),
    receivedBy: "Storekeeper",
    itemId: selectedLine?.itemId || "",
    receivedQuantity: selectedLine?.orderedQuantity || 0,
    rejectedQuantity: 0,
    freeQuantity: 0,
    unitCost: selectedLine?.unitPrice || 0,
    batchNumber: "",
    expiryDate: "",
  });
  useEffect(() => {
    if (!selectedLine) return;
    setForm((prev) => ({ ...prev, itemId: selectedLine.itemId, receivedQuantity: selectedLine.orderedQuantity, unitCost: selectedLine.unitPrice }));
  }, [selectedLine?.itemId]);
  return (
    <SectionCard title={t("Goods Receiving Voucher", "የዕቃ መቀበያ ቫውቸር")}>
      <div className="grid md:grid-cols-2 xl:grid-cols-4 gap-3">
        <Select label={t("Purchase order", "የግዢ ትዕዛዝ")} value={purchaseOrderNumber} onChange={setPurchaseOrderNumber} options={availableOrders.map((row) => ({ value: row.purchaseOrderNumber, label: `${row.purchaseOrderNumber} • ${row.destinationStore}` }))} />
        <Input label={t("Receiving date", "የመቀበያ ቀን")} type="date" value={form.receivingDate} onChange={(value) => setForm({ ...form, receivingDate: value })} />
        <Input label={t("Received by", "ተቀባይ")} value={form.receivedBy} onChange={(value) => setForm({ ...form, receivedBy: value })} />
        <Select label={t("Item", "እቃ")} value={form.itemId} onChange={(value) => setForm({ ...form, itemId: value })} options={(selectedOrder?.lines || []).map((row) => ({ value: row.itemId, label: row.itemName }))} />
        <Input label={t("Received qty", "የተቀበለ ብዛት")} type="number" value={String(form.receivedQuantity)} onChange={(value) => setForm({ ...form, receivedQuantity: Number(value) })} />
        <Input label={t("Rejected qty", "የተመለሰ ብዛት")} type="number" value={String(form.rejectedQuantity)} onChange={(value) => setForm({ ...form, rejectedQuantity: Number(value) })} />
        <Input label={t("Free qty", "ነፃ ብዛት")} type="number" value={String(form.freeQuantity)} onChange={(value) => setForm({ ...form, freeQuantity: Number(value) })} />
        <Input label={t("Unit cost", "የአንድ ወጪ")} type="number" value={String(form.unitCost)} onChange={(value) => setForm({ ...form, unitCost: Number(value) })} />
        <Input label={t("Batch number", "የባች ቁጥር")} value={form.batchNumber} onChange={(value) => setForm({ ...form, batchNumber: value })} />
        <Input label={t("Expiry date", "ጊዜው የሚያልፍበት")} type="date" value={form.expiryDate} onChange={(value) => setForm({ ...form, expiryDate: value })} />
      </div>
      <div className="mt-4 flex justify-end">
        <button disabled={!purchaseOrderNumber || !form.itemId} onClick={() => onSubmit({ purchaseOrderNumber, ...form })} className="h-10 px-4 rounded-lg bg-ember text-ember-foreground text-sm font-semibold disabled:opacity-40">{t("Confirm GRV", "GRV አረጋግጥ")}</button>
      </div>
      {vouchers.length > 0 ? (
        <div className="mt-5 space-y-2">
          <div className="text-sm font-semibold">{t("Received stock", "የተቀበለ ክምችት")}</div>
          {vouchers.slice(0, 12).map((voucher) => (
            <div key={voucher.id} className="rounded-lg border border-border bg-surface-2/60 p-3 space-y-1">
              <div className="flex items-center justify-between gap-2">
                <span className="font-mono text-sm font-medium">{voucher.grvNumber}</span>
                <Chip>{voucher.status}</Chip>
              </div>
              <div className="text-xs text-muted-foreground">
                {voucher.supplier} · {voucher.destinationStore} · {voucher.receivedBy}
              </div>
              {voucher.lines.map((line) => (
                <div key={line.id} className="flex justify-between text-sm gap-3">
                  <span>{line.itemName}</span>
                  <span className="font-mono font-semibold">
                    {line.receivedQuantity} {line.unit}
                  </span>
                </div>
              ))}
            </div>
          ))}
        </div>
      ) : null}
    </SectionCard>
  );
}

function DepartmentStockRequestPanel({
  items,
  balances,
  warehouseBalances,
  issueVouchers,
  requests,
  defaultDepartment,
  locationOptions,
  canApprove,
  canReceive,
  onSubmit,
  onApprove,
  onReject,
  onReceiveIssue,
}: {
  items: StockManagedItem[];
  balances: Array<{ itemId: string; location: StockLocation; quantity: number; availableQuantity?: number; incomingQuantity?: number }>;
  warehouseBalances: Array<{ itemId: string; location: StockLocation; quantity: number; availableQuantity?: number }>;
  issueVouchers: Array<{
    id: string;
    issueVoucherNumber: string;
    sourceStore: "Store 1" | "Store 2";
    destinationDepartment: OperationalStockLocation;
    status: string;
    lines: Array<{
      id: string;
      itemName: string;
      sentQuantity: number;
      approvedQuantity: number;
      receivedQuantity?: number;
      unit: StockUnitType;
    }>;
  }>;
  requests: Array<{
    id: string;
    requestNumber: string;
    requestingDepartment: OperationalStockLocation;
    requestedSourceStore: "Store 1" | "Store 2";
    lines: Array<{ id: string; itemId: string; itemName: string; availableQuantityAtDepartment: number; requestedQuantity: number; approvedQuantity: number; unit: StockUnitType }>;
    priority: StockRequestPriority;
    reason: string;
    requiredDate: string;
    requestedBy: string;
    reviewedBy?: string;
    rejectionReason?: string;
    notes?: string;
    status: string;
    createdAt: string;
    updatedAt: string;
  }>;
  defaultDepartment: OperationalStockLocation | null;
  locationOptions: OperationalStockLocation[];
  canApprove: boolean;
  canReceive: boolean;
  onSubmit: (input: {
    requestingDepartment: OperationalStockLocation;
    requestedSourceStore: "Store 1" | "Store 2";
    preferredSource?: PreferredSourcePreference;
    priority: StockRequestPriority;
    requiredDate: string;
    itemId: string;
    requestedQuantity: number;
    unit: StockUnitType;
    reason: string;
    notes?: string;
  }) => void;
  onApprove: (requestId: string, approvedQuantity?: number, sourceStore?: "Store 1" | "Store 2") => void;
  onReject: (requestId: string, rejectionReason: string) => void;
  onReceiveIssue: (voucherId: string) => void;
}) {
  const t = useT();
  const departmentChoices = locationOptions.length > 0 ? locationOptions : [...OPERATIONAL_STOCK_LOCATIONS];
  const [form, setForm] = useState({
    requestingDepartment: (defaultDepartment || departmentChoices[0] || "Main Bar") as OperationalStockLocation,
    preferredSource: "Best Available" as PreferredSourcePreference,
    priority: "Normal" as StockRequestPriority,
    requiredDate: todayKey(),
    itemId: items[0]?.id || "",
    requestedQuantity: 1,
    unit: (items[0]?.baseUnit || "bottle") as StockUnitType,
    reason: "Below minimum stock",
    notes: "",
  });
  const item = items.find((row) => row.id === form.itemId);
  const departmentBalance = balances.find((row) => row.itemId === form.itemId && row.location === form.requestingDepartment);
  const departmentQty = departmentBalance?.availableQuantity ?? departmentBalance?.quantity ?? 0;
  const departmentIncoming = departmentBalance?.incomingQuantity ?? 0;
  const store1Qty = availableQuantityAtLocation(warehouseBalances as Parameters<typeof availableQuantityAtLocation>[0], form.itemId, "Store 1");
  const store2Qty = availableQuantityAtLocation(warehouseBalances as Parameters<typeof availableQuantityAtLocation>[0], form.itemId, "Store 2");
  const resolvedSource = resolvePreferredSourceStore(
    warehouseBalances as Parameters<typeof resolvePreferredSourceStore>[0],
    form.itemId,
    form.preferredSource,
  );
  const sourceQty = resolvedSource === "Store 1" ? store1Qty : store2Qty;
  const neitherStoreHasStock = store1Qty <= 0 && store2Qty <= 0;
  useEffect(() => {
    if (!item) return;
    setForm((prev) => ({ ...prev, unit: item.baseUnit }));
  }, [item?.id]);
  useEffect(() => {
    if (defaultDepartment) setForm((prev) => ({ ...prev, requestingDepartment: defaultDepartment }));
  }, [defaultDepartment]);
  const pending = requests.filter((row) => ["Submitted", "Under Review"].includes(row.status));
  const awaitingReceipt = issueVouchers.filter(
    (voucher) =>
      voucher.destinationDepartment === form.requestingDepartment &&
      ["Dispatched", "Partially Received"].includes(voucher.status),
  );

  return (
    <div className="space-y-4">
      <SectionCard title={t("Department Stock Request", "የክፍል የክምችት ጥያቄ")}>
        <div className="grid md:grid-cols-2 xl:grid-cols-3 gap-3">
          <Select label={t("Department", "ክፍል")} value={form.requestingDepartment} onChange={(value) => setForm({ ...form, requestingDepartment: value as OperationalStockLocation })} options={departmentChoices.map((row) => ({ value: row, label: row }))} />
          <Select
            label={t("Preferred source", "ተመራጭ ምንጭ")}
            value={form.preferredSource}
            onChange={(value) => setForm({ ...form, preferredSource: value as PreferredSourcePreference })}
            options={[
              { value: "Best Available", label: t("Best Available", "በጣም የሚገኝ") },
              { value: "Store 1", label: "Store 1" },
              { value: "Store 2", label: "Store 2" },
            ]}
          />
          <Select label={t("Priority", "ቅድሚያ")} value={form.priority} onChange={(value) => setForm({ ...form, priority: value as StockRequestPriority })} options={STOCK_REQUEST_PRIORITIES.map((row) => ({ value: row, label: row }))} />
          <Input label={t("Required date", "የሚያስፈልግበት ቀን")} type="date" value={form.requiredDate} onChange={(value) => setForm({ ...form, requiredDate: value })} />
          <Select label={t("Item", "እቃ")} value={form.itemId} onChange={(value) => setForm({ ...form, itemId: value })} options={items.map((row) => ({ value: row.id, label: row.name }))} />
          <Input
            label={t("Dept available", "የክፍል ይገኝ")}
            value={departmentIncoming > 0 ? `${departmentQty} (+${departmentIncoming} ${t("incoming", "በመንገድ")})` : String(departmentQty)}
            onChange={() => undefined}
          />
          <Input label={t("Store 1 available", "ስቶር 1 ይገኝ")} value={String(store1Qty)} onChange={() => undefined} />
          <Input label={t("Store 2 available", "ስቶር 2 ይገኝ")} value={String(store2Qty)} onChange={() => undefined} />
          <Input label={t("Requested qty", "የተጠየቀ ብዛት")} type="number" value={String(form.requestedQuantity)} onChange={(value) => setForm({ ...form, requestedQuantity: Number(value) })} />
          <Input label={t("Unit", "አሃድ")} value={item?.baseUnit ?? form.unit} onChange={() => undefined} />
          <Input label={t("Reason", "ምክንያት")} value={form.reason} onChange={(value) => setForm({ ...form, reason: value })} />
        </div>
        {neitherStoreHasStock ? (
          <div className="mt-3 rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 text-sm text-amber-900 dark:text-amber-200">
            {t(
              "Store 1 and Store 2 show 0 available. Creating a stock item or menu link does not add warehouse quantity. Log in as Store 1 (Abel) and receive stock via GRV or post a positive adjustment at Store 1.",
              "ስቶር 1 እና ስቶር 2 0 ይታያሉ። የክምችት እቃ መፍጠር ወይም ምናሌ ማገናኘት የመጋዘን ብዛት አይጨምርም። እንደ ስቶር 1 (አቤል) ግባው እና በGRV ይቀበሉ ወይም በስቶር 1 አዎንታዊ ማስተካከያ ይለጥፉ።",
            )}
          </div>
        ) : form.requestedQuantity > sourceQty ? (
          <div className="mt-3 text-sm text-amber-700 dark:text-amber-300">
            {t(`Only ${sourceQty} available at ${resolvedSource}. Request may be partially fulfilled.`, `በ${resolvedSource} ${sourceQty} ብቻ ይገኛል። ጥያቄው በከፊል ሊሟላ ይችላል።`)}
          </div>
        ) : null}
        <TextArea label={t("Notes", "ማስታወሻ")} value={form.notes} onChange={(value) => setForm({ ...form, notes: value })} />
        <div className="mt-4 flex justify-end">
          <button
            disabled={!form.itemId || !(form.requestedQuantity > 0) || neitherStoreHasStock}
            onClick={() =>
              onSubmit({
                ...form,
                unit: item?.baseUnit ?? form.unit,
                requestedSourceStore: resolvedSource,
                preferredSource: form.preferredSource,
              })
            }
            className="h-10 px-4 rounded-lg bg-ember text-ember-foreground text-sm font-semibold disabled:opacity-40"
          >
            {t("Submit Request", "ጥያቄ ላክ")}
          </button>
        </div>
      </SectionCard>

      <SectionCard title={t("Pending store review", "በስቶር ግምገማ ላይ")}>
        <div className="space-y-3">
          {pending.map((request) => {
            const line = request.lines[0];
            const store1 = line ? availableQuantityAtLocation(warehouseBalances as Parameters<typeof availableQuantityAtLocation>[0], line.itemId, "Store 1") : 0;
            const store2 = line ? availableQuantityAtLocation(warehouseBalances as Parameters<typeof availableQuantityAtLocation>[0], line.itemId, "Store 2") : 0;
            return (
            <div key={request.id} className="rounded-xl border border-border p-3 space-y-2">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <div className="font-medium font-mono">{request.requestNumber}</div>
                  <div className="text-xs text-muted-foreground">{request.requestingDepartment} ← {request.requestedSourceStore} · {request.priority} · {request.requestedBy}</div>
                  {line ? (
                    <div className="text-xs text-muted-foreground mt-1">
                      {t("Availability", "ይገኝነት")}: Store 1 {store1} · Store 2 {store2}
                    </div>
                  ) : null}
                </div>
                <Chip>{request.status}</Chip>
              </div>
              {request.lines.map((lineRow) => (
                <div key={lineRow.id} className="flex justify-between text-sm gap-3">
                  <span>{lineRow.itemName}</span>
                  <span className="font-mono">{lineRow.requestedQuantity} {lineRow.unit}</span>
                </div>
              ))}
              {canApprove ? (
                <div className="flex flex-wrap gap-2 justify-end">
                  <button onClick={() => onApprove(request.id, undefined, request.requestedSourceStore)} className="h-9 px-3 rounded-lg bg-ember text-ember-foreground text-xs font-semibold">{t("Approve", "አፅድቅ")}</button>
                  <button
                    onClick={() => {
                      const qtyValue = window.prompt(t("Approved quantity", "የተፈቀደ ብዛት"), String(request.lines[0]?.requestedQuantity ?? 0));
                      if (qtyValue == null) return;
                      onApprove(request.id, Number(qtyValue), request.requestedSourceStore === "Store 1" ? "Store 2" : "Store 1");
                    }}
                    className="h-9 px-3 rounded-lg border border-border bg-card text-xs font-medium"
                  >
                    {t("Partial / swap store", "በከፊል / ስቶር ቀይር")}
                  </button>
                  <button
                    onClick={() => {
                      const reason = window.prompt(t("Rejection reason", "የመከልከል ምክንያት"), "Insufficient stock");
                      if (!reason) return;
                      onReject(request.id, reason);
                    }}
                    className="h-9 px-3 rounded-lg border border-destructive/30 text-destructive text-xs font-medium"
                  >
                    {t("Reject", "ከልክል")}
                  </button>
                </div>
              ) : (
                <div className="text-xs text-muted-foreground">{t("Waiting for store approval.", "የስቶር ፈቃድ በመጠባበቅ ላይ።")}</div>
              )}
            </div>
            );
          })}
          {pending.length === 0 && <div className="text-sm text-muted-foreground">{t("No pending department requests.", "በመጠባበቅ ላይ ያሉ የክፍል ጥያቄዎች የሉም።")}</div>}
        </div>
      </SectionCard>

      {awaitingReceipt.length > 0 ? (
        <SectionCard title={t("Confirm receipt", "መቀበያ አረጋግጥ")}>
          <div className="space-y-3">
            {awaitingReceipt.map((voucher) => (
              <div key={voucher.id} className="rounded-xl border border-emerald-500/30 bg-emerald-500/5 p-3 space-y-2">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <div className="font-medium font-mono">{voucher.issueVoucherNumber}</div>
                    <div className="text-xs text-muted-foreground">{voucher.sourceStore} → {voucher.destinationDepartment}</div>
                  </div>
                  <Chip>{voucher.status}</Chip>
                </div>
                {voucher.lines.map((line) => (
                  <div key={line.id} className="flex justify-between text-sm gap-3">
                    <span>{line.itemName}</span>
                    <span className="font-mono text-right">
                      {(line.receivedQuantity ?? 0) > 0
                        ? `${line.receivedQuantity} ${line.unit} ${t("received", "ተቀብሏል")}`
                        : `${line.sentQuantity || line.approvedQuantity} ${line.unit}`}
                    </span>
                  </div>
                ))}
                {canReceive ? (
                  <div className="flex justify-end">
                    <button onClick={() => onReceiveIssue(voucher.id)} className="h-9 px-3 rounded-lg bg-ember text-ember-foreground text-xs font-semibold">
                      {t("Confirm receipt", "መቀበያ አረጋግጥ")}
                    </button>
                  </div>
                ) : (
                  <div className="text-xs text-muted-foreground">{t("Waiting for department receipt confirmation.", "የክፍል መቀበያ ማረጋገጫ በመጠባበቅ ላይ።")}</div>
                )}
              </div>
            ))}
          </div>
        </SectionCard>
      ) : null}
    </div>
  );
}

function IssueVoucherPanel({
  requests,
  vouchers,
  allVouchers,
  workspace,
  canDispatch,
  canReceiveAt,
  onConvert,
  onDispatch,
  onReceive,
}: {
  requests: Array<{ id: string; requestNumber: string; requestingDepartment: OperationalStockLocation; requestedSourceStore: "Store 1" | "Store 2"; lines: Array<{ id: string; itemId: string; itemName: string; availableQuantityAtDepartment: number; requestedQuantity: number; approvedQuantity: number; unit: StockUnitType }>; priority: "Normal" | "High" | "Urgent"; reason: string; requiredDate: string; requestedBy: string; reviewedBy?: string; rejectionReason?: string; notes?: string; status: string; createdAt: string; updatedAt: string; convertedTransferNumber?: string }>;
  vouchers: StoreIssueVoucherDocument[];
  allVouchers: StoreIssueVoucherDocument[];
  workspace: InventoryWorkspace;
  canDispatch: boolean;
  canReceiveAt: (location: StockLocation) => boolean;
  onConvert: (request: DepartmentStockRequestDocument) => void;
  onDispatch: (voucherId: string) => void;
  onReceive: (voucherId: string) => void;
}) {
  const t = useT();
  const voucherLinks = allVouchers.length > 0 ? allVouchers : vouchers;
  const uniqueVouchers = useMemo(() => {
    const byId = new Map<string, StoreIssueVoucherDocument>();
    const byRequest = new Map<string, StoreIssueVoucherDocument>();
    const rank = (status: string) =>
      ["Received", "Partially Received", "Dispatched", "Prepared", "Approved", "Partially Approved"].indexOf(status);
    for (const voucher of vouchers) {
      byId.set(voucher.id, voucher);
      const related = voucher.relatedStockRequest || voucher.id;
      const existing = byRequest.get(related);
      if (!existing || rank(voucher.status) > rank(existing.status)) {
        byRequest.set(related, voucher);
      }
    }
    // Prefer unique by related request when number/id collisions exist from older clients.
    return [...new Map([...byRequest.values()].map((voucher) => [voucher.id, voucher])).values()];
  }, [vouchers]);
  const approvedRequests = requests;
  const convertibleRequests = useMemo(
    () => approvedRequests.filter((row) => !findStoreIssueVoucherForRequest(voucherLinks, row)),
    [approvedRequests, voucherLinks],
  );
  const storeLabel = workspace === "Store 1" || workspace === "Store 2" ? workspace : t("your store", "ስቶርዎ");
  const [selectedId, setSelectedId] = useState(convertibleRequests[0]?.id || "");
  const selected = convertibleRequests.find((row) => row.id === selectedId);
  useEffect(() => {
    if (!selected && convertibleRequests[0]?.id) {
      setSelectedId(convertibleRequests[0].id);
    }
  }, [selected, convertibleRequests]);
  const existingVoucherForSelected = selected
    ? findStoreIssueVoucherForRequest(voucherLinks, selected)
    : undefined;
  const mappedRequest: DepartmentStockRequestDocument | null = selected
    ? {
        id: selected.id,
        documentType: "Department Stock Request",
        documentNumber: selected.requestNumber,
        stockRequestNumber: selected.requestNumber,
        status: selected.status as DepartmentStockRequestDocument["status"],
        createdAt: selected.createdAt,
        createdBy: selected.requestedBy,
        requestingDepartment: selected.requestingDepartment,
        requestedSourceStore: selected.requestedSourceStore,
        priority: selected.priority,
        reason: selected.reason,
        requiredDate: selected.requiredDate,
        requestedBy: selected.requestedBy,
        reviewedBy: selected.reviewedBy,
        rejectionReason: selected.rejectionReason,
        notes: selected.notes,
        approvalHistory: [],
        lines: selected.lines,
      }
    : null;
  const actionable = uniqueVouchers.filter((row) => ["Approved", "Partially Approved", "Prepared", "Dispatched", "Partially Received"].includes(row.status));
  const receivedVouchers = uniqueVouchers.filter((row) => row.status === "Received" || row.status === "Partially Received");

  return (
    <div className="space-y-4">
      <SectionCard title={t("Store Issue Voucher", "የማከማቻ መስጫ ቫውቸር")}>
        <Select label={t("Approved request", "የተፈቀደ ጥያቄ")} value={selectedId} onChange={setSelectedId} options={convertibleRequests.map((row) => ({ value: row.id, label: `${row.requestNumber} • ${row.requestingDepartment}` }))} />
        {convertibleRequests.length === 0 ? (
          <div className="mt-4 text-sm text-muted-foreground">
            {approvedRequests.length === 0
              ? t("No approved requests.", "የተፈቀዱ ጥያቄዎች የሉም።")
              : t("All approved requests have issue vouchers.", "ሁሉም የተፈቀዱ ጥያቄዎች የመስጫ ቫውቸር አላቸው።")}
          </div>
        ) : null}
        {mappedRequest ? (
          <div className="mt-4 rounded-lg bg-surface-2 p-3 text-sm space-y-1">
            <div className="font-medium">{mappedRequest.stockRequestNumber}</div>
            <div className="text-xs text-muted-foreground">{mappedRequest.requestedSourceStore} → {mappedRequest.requestingDepartment}</div>
            {mappedRequest.lines.map((line) => (
              <div key={line.id} className="flex justify-between gap-3">
                <span>{line.itemName}</span>
                <span className="font-mono">{line.approvedQuantity} {line.unit}</span>
              </div>
            ))}
          </div>
        ) : null}
        {existingVoucherForSelected ? (
          <div className="mt-4 rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 text-sm text-amber-900 dark:text-amber-200">
            {t(`Voucher ${existingVoucherForSelected.issueVoucherNumber} already created.`, `ቫውቸር ${existingVoucherForSelected.issueVoucherNumber} ቀድሞ ተፈጥሯል።`)}
          </div>
        ) : null}
        <div className="mt-4 flex justify-end">
          <button disabled={!mappedRequest || Boolean(existingVoucherForSelected)} onClick={() => mappedRequest && onConvert(mappedRequest)} className="h-10 px-4 rounded-lg bg-ember text-ember-foreground text-sm font-semibold disabled:opacity-40">{t("Create Issue Voucher", "የመስጫ ቫውቸር ፍጠር")}</button>
        </div>
      </SectionCard>

      <SectionCard title={t("Dispatch & receive", "ላክ እና ተቀበል")}>
        <div className="space-y-3">
          {actionable.map((voucher) => (
            <div key={voucher.id} className="rounded-xl border border-border p-3 space-y-2">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <div className="font-medium font-mono">{voucher.issueVoucherNumber}</div>
                  <div className="text-xs text-muted-foreground">{voucher.sourceStore} → {voucher.destinationDepartment} · {voucher.relatedStockRequest || "-"}</div>
                </div>
                <Chip>{voucher.status}</Chip>
              </div>
              {voucher.lines.map((line) => (
                <div key={line.id} className="flex justify-between text-sm gap-3">
                  <span>{line.itemName}</span>
                  <span className="font-mono text-right">
                    {(line.receivedQuantity ?? 0) > 0
                      ? `${line.receivedQuantity} ${line.unit} ${t("received", "ተቀብሏል")}`
                      : `${line.sentQuantity || line.approvedQuantity} ${line.unit}`}
                  </span>
                </div>
              ))}
              <div className="flex flex-wrap gap-2 justify-end">
                {["Approved", "Partially Approved", "Prepared"].includes(voucher.status) && canDispatch ? (
                  <button onClick={() => onDispatch(voucher.id)} className="h-9 px-3 rounded-lg bg-ember text-ember-foreground text-xs font-semibold">{t("Dispatch", "ላክ")}</button>
                ) : null}
                {["Dispatched", "Partially Received"].includes(voucher.status) && canReceiveAt(voucher.destinationDepartment) ? (
                  <button onClick={() => onReceive(voucher.id)} className="h-9 px-3 rounded-lg border border-border bg-card text-xs font-semibold">{t("Confirm receipt", "መቀበያ አረጋግጥ")}</button>
                ) : null}
              </div>
            </div>
          ))}
          {actionable.length === 0 && <div className="text-sm text-muted-foreground">{t("No issue vouchers awaiting dispatch or receipt.", "ለመላክ ወይም ለመቀበል የሚጠብቁ የመስጫ ቫውቸሮች የሉም።")}</div>}
        </div>
      </SectionCard>
      {receivedVouchers.length > 0 ? (
        <SectionCard title={t("Received stock", "የተቀበለ ክምችት")}>
          <div className="space-y-3">
            {receivedVouchers.map((voucher) => (
              <div key={`received-${voucher.id}`} className="rounded-xl border border-border p-3 space-y-2">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="font-mono font-medium">{voucher.issueVoucherNumber}</div>
                  <Chip>{voucher.status}</Chip>
                </div>
                {voucher.lines.map((line) => (
                  <div key={line.id} className="flex justify-between text-sm gap-3">
                    <span>{line.itemName}</span>
                    <span className="font-mono font-semibold">
                      {line.receivedQuantity || line.sentQuantity || line.approvedQuantity} {line.unit}
                    </span>
                  </div>
                ))}
              </div>
            ))}
          </div>
        </SectionCard>
      ) : null}
    </div>
  );
}

function StoreTransferVoucherPanel({
  items,
  vouchers,
  sourceLocationOptions = STOCK_LOCATIONS as StockLocation[],
  destinationLocationOptions = STOCK_LOCATIONS as StockLocation[],
  canApprove,
  canDispatch,
  canReceiveAt,
  onSubmit,
  onApprove,
  onDispatch,
  onReceive,
}: {
  items: StockManagedItem[];
  vouchers: StoreTransferVoucherDocument[];
  sourceLocationOptions?: StockLocation[];
  destinationLocationOptions?: StockLocation[];
  canApprove: boolean;
  canDispatch: boolean;
  canReceiveAt: (location: StockLocation) => boolean;
  onSubmit: (input: { sourceLocation: StockLocation; destinationLocation: StockLocation; itemId: string; quantity: number; unit: StockUnitType; notes?: string }) => void;
  onApprove: (voucherId: string) => void;
  onDispatch: (voucherId: string) => void;
  onReceive: (voucherId: string) => void;
}) {
  const t = useT();
  const defaultSource = sourceLocationOptions[0] ?? "Store 1";
  const defaultDest = destinationLocationOptions.find((loc) => loc !== defaultSource) ?? destinationLocationOptions[0] ?? "Store 2";
  const [form, setForm] = useState({
    sourceLocation: defaultSource as StockLocation,
    destinationLocation: defaultDest as StockLocation,
    itemId: items[0]?.id || "",
    quantity: 1,
    unit: (items[0]?.baseUnit || "bottle") as StockUnitType,
    notes: "",
  });
  const item = items.find((row) => row.id === form.itemId);
  const actionable = vouchers.filter((row) => ["Pending Approval", "Approved", "Partially Approved", "Prepared", "Dispatched", "Partially Received"].includes(row.status));
  useEffect(() => {
    if (!item) return;
    setForm((prev) => ({ ...prev, unit: item.baseUnit }));
  }, [item?.id]);
  useEffect(() => {
    if (!sourceLocationOptions.includes(form.sourceLocation) && sourceLocationOptions[0]) {
      setForm((prev) => ({ ...prev, sourceLocation: sourceLocationOptions[0]! }));
    }
  }, [form.sourceLocation, sourceLocationOptions]);
  return (
    <div className="space-y-4">
      <SectionCard title={t("Store Transfer Voucher", "የስቶር ዝውውር ቫውቸር")}>
        <div className="grid md:grid-cols-2 xl:grid-cols-3 gap-3">
          <Select label={t("Source", "መነሻ")} value={form.sourceLocation} onChange={(value) => setForm({ ...form, sourceLocation: value as StockLocation })} options={sourceLocationOptions.map((row) => ({ value: row, label: row }))} />
          <Select label={t("Destination", "መድረሻ")} value={form.destinationLocation} onChange={(value) => setForm({ ...form, destinationLocation: value as StockLocation })} options={destinationLocationOptions.map((row) => ({ value: row, label: row }))} />
          <Select label={t("Item", "እቃ")} value={form.itemId} onChange={(value) => setForm({ ...form, itemId: value })} options={items.map((row) => ({ value: row.id, label: row.name }))} />
          <Input label={t("Quantity", "ብዛት")} type="number" value={String(form.quantity)} onChange={(value) => setForm({ ...form, quantity: Number(value) })} />
          <Select label={t("Unit", "አሃድ")} value={form.unit} onChange={(value) => setForm({ ...form, unit: value as StockUnitType })} options={STOCK_UNIT_TYPES.map((row) => ({ value: row, label: row }))} />
        </div>
        <TextArea label={t("Notes", "ማስታወሻ")} value={form.notes} onChange={(value) => setForm({ ...form, notes: value })} />
        <div className="mt-4 flex justify-end"><button onClick={() => onSubmit(form)} className="h-10 px-4 rounded-lg bg-ember text-ember-foreground text-sm font-semibold">{t("Submit Transfer", "ዝውውር ላክ")}</button></div>
      </SectionCard>
      <SectionCard title={t("Transfer workflow", "የዝውውር ሂደት")}>
        <div className="space-y-3">
          {actionable.map((voucher) => (
            <div key={voucher.id} className="rounded-xl border border-border p-3 space-y-2">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <div className="font-mono font-medium">{voucher.transferVoucherNumber}</div>
                  <div className="text-xs text-muted-foreground">{voucher.sourceLocation} → {voucher.destinationLocation} · {voucher.createdBy}</div>
                </div>
                <Chip>{voucher.status}</Chip>
              </div>
              {voucher.lines.map((line) => (
                <div key={line.id} className="flex justify-between text-sm gap-3">
                  <span>{line.itemName}</span>
                  <span className="font-mono text-right">
                    {(line.receivedQuantity ?? 0) > 0
                      ? `${line.receivedQuantity} ${line.unit} ${t("received", "ተቀብሏል")}`
                      : `${line.sentQuantity || line.approvedQuantity || line.requestedQuantity} ${line.unit}`}
                  </span>
                </div>
              ))}
              <div className="flex flex-wrap gap-2 justify-end">
                {voucher.status === "Pending Approval" && canApprove ? (
                  <button onClick={() => onApprove(voucher.id)} className="h-9 px-3 rounded-lg bg-ember text-ember-foreground text-xs font-semibold">{t("Approve", "አፅድቅ")}</button>
                ) : null}
                {["Approved", "Partially Approved", "Prepared"].includes(voucher.status) && canDispatch ? (
                  <button onClick={() => onDispatch(voucher.id)} className="h-9 px-3 rounded-lg border border-border bg-card text-xs font-semibold">{t("Dispatch", "ላክ")}</button>
                ) : null}
                {["Dispatched", "Partially Received"].includes(voucher.status) && canReceiveAt(voucher.destinationLocation) ? (
                  <button onClick={() => onReceive(voucher.id)} className="h-9 px-3 rounded-lg border border-border bg-card text-xs font-semibold">{t("Confirm receipt", "መቀበያ አረጋግጥ")}</button>
                ) : null}
              </div>
            </div>
          ))}
          {actionable.length === 0 && <div className="text-sm text-muted-foreground">{t("No open transfer vouchers.", "ክፍት የዝውውር ቫውቸሮች የሉም።")}</div>}
        </div>
      </SectionCard>
    </div>
  );
}

function GoodsReturnVoucherPanel({
  items,
  vouchers,
  canApprove,
  onSubmit,
  onApprovePost,
}: {
  items: StockManagedItem[];
  vouchers: GoodsReturnVoucherDocument[];
  canApprove: boolean;
  onSubmit: (input: { sourceLocation: StockLocation; destinationLocation: StockLocation; itemId: string; quantity: number; unit: StockUnitType; returnReason: StockReturnReason; notes?: string }) => void;
  onApprovePost: (voucherId: string) => void;
}) {
  const t = useT();
  const [form, setForm] = useState({ sourceLocation: "Kitchen" as StockLocation, destinationLocation: "Store 1" as StockLocation, itemId: items[0]?.id || "", quantity: 1, unit: (items[0]?.baseUnit || "bottle") as StockUnitType, returnReason: "Excess stock" as StockReturnReason, notes: "" });
  const item = items.find((row) => row.id === form.itemId);
  const pending = vouchers.filter((row) => row.status === "Submitted");
  useEffect(() => {
    if (!item) return;
    setForm((prev) => ({ ...prev, unit: item.baseUnit }));
  }, [item?.id]);
  return (
    <div className="space-y-4">
      <SectionCard title={t("Goods Return Voucher", "የእቃ ተመላሽ ቫውቸር")}>
        <div className="grid md:grid-cols-2 xl:grid-cols-3 gap-3">
          <Select label={t("From", "ከ")} value={form.sourceLocation} onChange={(value) => setForm({ ...form, sourceLocation: value as StockLocation })} options={STOCK_LOCATIONS.map((row) => ({ value: row, label: row }))} />
          <Select label={t("To store", "ወደ ስቶር")} value={form.destinationLocation} onChange={(value) => setForm({ ...form, destinationLocation: value as StockLocation })} options={["Store 1", "Store 2"].map((row) => ({ value: row, label: row }))} />
          <Select label={t("Item", "እቃ")} value={form.itemId} onChange={(value) => setForm({ ...form, itemId: value })} options={items.map((row) => ({ value: row.id, label: row.name }))} />
          <Input label={t("Quantity", "ብዛት")} type="number" value={String(form.quantity)} onChange={(value) => setForm({ ...form, quantity: Number(value) })} />
          <Select label={t("Unit", "አሃድ")} value={form.unit} onChange={(value) => setForm({ ...form, unit: value as StockUnitType })} options={STOCK_UNIT_TYPES.map((row) => ({ value: row, label: row }))} />
          <Select label={t("Reason", "ምክንያት")} value={form.returnReason} onChange={(value) => setForm({ ...form, returnReason: value as StockReturnReason })} options={["Excess stock", "Wrong item", "Event completed", "Near expiry", "Damaged packaging", "Department closure", "Other"].map((row) => ({ value: row, label: row }))} />
        </div>
        <TextArea label={t("Notes", "ማስታወሻ")} value={form.notes} onChange={(value) => setForm({ ...form, notes: value })} />
        <div className="mt-4 flex justify-end"><button onClick={() => onSubmit(form)} className="h-10 px-4 rounded-lg bg-ember text-ember-foreground text-sm font-semibold">{t("Submit Return", "ተመላሽ ላክ")}</button></div>
      </SectionCard>
      <SectionCard title={t("Returns awaiting approval", "ፈቃድ የሚጠብቁ ተመላሾች")}>
        <div className="space-y-3">
          {pending.map((voucher) => (
            <div key={voucher.id} className="rounded-xl border border-border p-3 flex flex-wrap items-center justify-between gap-2">
              <div>
                <div className="font-mono font-medium">{voucher.returnVoucherNumber}</div>
                <div className="text-xs text-muted-foreground">{voucher.sourceLocation} → {voucher.destinationLocation} · {voucher.returnedBy}</div>
                {voucher.lines.map((line) => (
                  <div key={line.id} className="text-xs font-mono text-muted-foreground">
                    {line.itemName} · {(line.receivedQuantity || line.sentQuantity || line.requestedQuantity)} {line.unit}
                  </div>
                ))}
              </div>
              {canApprove ? (
                <button onClick={() => onApprovePost(voucher.id)} className="h-9 px-3 rounded-lg bg-ember text-ember-foreground text-xs font-semibold">{t("Approve & post", "አፅድቅ እና ለጥፍ")}</button>
              ) : (
                <Chip>{voucher.status}</Chip>
              )}
            </div>
          ))}
          {pending.length === 0 && <div className="text-sm text-muted-foreground">{t("No returns awaiting approval.", "ፈቃድ የሚጠብቁ ተመላሾች የሉም።")}</div>}
        </div>
      </SectionCard>
    </div>
  );
}

function StockAdjustmentVoucherPanel({
  items,
  locationOptions = STOCK_LOCATIONS as StockLocation[],
  onSubmit,
}: {
  items: StockManagedItem[];
  locationOptions?: StockLocation[];
  onSubmit: (input: { documentType: StockAdjustmentVoucherDocument["documentType"]; location: StockLocation; itemId: string; quantity: number; unit: StockUnitType; reason: string; notes?: string }) => void;
}) {
  const t = useT();
  const [form, setForm] = useState({
    documentType: "Stock Adjustment Voucher" as StockAdjustmentVoucherDocument["documentType"],
    location: (locationOptions[0] ?? "Store 1") as StockLocation,
    itemId: items[0]?.id || "",
    quantity: 1,
    unit: (items[0]?.baseUnit || "bottle") as StockUnitType,
    reason: "Manual correction",
    notes: "",
  });
  const item = items.find((row) => row.id === form.itemId);
  useEffect(() => {
    if (!item) return;
    const nextUnit = item.baseUnit;
    const preferredOk = locationOptions.includes(item.preferredLocation);
    setForm((prev) => {
      const nextLocation = preferredOk
        ? item.preferredLocation
        : (locationOptions[0] ?? prev.location);
      if (prev.unit === nextUnit && prev.location === nextLocation) return prev;
      return { ...prev, unit: nextUnit, location: nextLocation };
    });
  }, [item?.baseUnit, item?.id, item?.preferredLocation, locationOptions]);
  return (
    <SectionCard title={t("Stock Adjustment Voucher", "የክምችት ማስተካከያ ቫውቸር")}>
      <div className="grid md:grid-cols-2 xl:grid-cols-3 gap-3">
        <Select label={t("Voucher type", "የቫውቸር አይነት")} value={form.documentType} onChange={(value) => setForm({ ...form, documentType: value as StockAdjustmentVoucherDocument["documentType"] })} options={["Stock Adjustment Voucher", "Wastage Voucher", "Damage Voucher", "Stock Count Adjustment"].map((row) => ({ value: row, label: row }))} />
        <Select label={t("Location", "ቦታ")} value={form.location} onChange={(value) => setForm({ ...form, location: value as StockLocation })} options={locationOptions.map((row) => ({ value: row, label: row }))} />
        <Select label={t("Item", "እቃ")} value={form.itemId} onChange={(value) => setForm({ ...form, itemId: value })} options={items.map((row) => ({ value: row.id, label: row.name }))} />
        <Input label={t("Quantity", "ብዛት")} type="number" value={String(form.quantity)} onChange={(value) => setForm({ ...form, quantity: Number(value) })} />
        <Select label={t("Unit", "አሃድ")} value={form.unit} onChange={(value) => setForm({ ...form, unit: value as StockUnitType })} options={STOCK_UNIT_TYPES.map((row) => ({ value: row, label: row }))} />
        <Input label={t("Reason", "ምክንያት")} value={form.reason} onChange={(value) => setForm({ ...form, reason: value })} />
      </div>
      <TextArea label={t("Notes", "ማስታወሻ")} value={form.notes} onChange={(value) => setForm({ ...form, notes: value })} />
      <div className="mt-4 flex justify-end"><button onClick={() => onSubmit(form)} className="h-10 px-4 rounded-lg bg-ember text-ember-foreground text-sm font-semibold">{t("Post Voucher", "ቫውቸር ለጥፍ")}</button></div>
    </SectionCard>
  );
}

function PhysicalStockCountPanel({
  items,
  counts,
  locationOptions = STOCK_LOCATIONS as StockLocation[],
  canApprove,
  onSubmit,
  onApprove,
}: {
  items: StockManagedItem[];
  counts: StockCountSession[];
  locationOptions?: StockLocation[];
  canApprove: boolean;
  onSubmit: (input: { location: StockLocation; itemId: string; countedQuantity: number; blindCount: boolean; notes?: string }) => void;
  onApprove: (countId: string) => void;
}) {
  const t = useT();
  const [form, setForm] = useState({
    location: (locationOptions[0] ?? items[0]?.preferredLocation ?? "Store 1") as StockLocation,
    itemId: items[0]?.id || "",
    countedQuantity: 0,
    blindCount: true,
    notes: "",
  });
  useEffect(() => {
    if (!locationOptions.includes(form.location) && locationOptions[0]) {
      setForm((prev) => ({ ...prev, location: locationOptions[0]! }));
    }
  }, [form.location, locationOptions]);
  const pending = counts.filter((row) => row.status === "Submitted" || row.status === "Reviewed");
  return (
    <div className="space-y-4">
      <SectionCard
        title={t("Physical Stock Count", "የአካል ክምችት ቆጠራ")}
       
      >
        <div className="grid md:grid-cols-2 xl:grid-cols-3 gap-3">
          <Select label={t("Location", "ቦታ")} value={form.location} onChange={(value) => setForm({ ...form, location: value as StockLocation })} options={locationOptions.map((row) => ({ value: row, label: row }))} />
          <Select label={t("Item", "እቃ")} value={form.itemId} onChange={(value) => setForm({ ...form, itemId: value })} options={items.map((row) => ({ value: row.id, label: row.name }))} />
          <Input label={t("Counted quantity", "የተቆጠረ ብዛት")} type="number" value={String(form.countedQuantity)} onChange={(value) => setForm({ ...form, countedQuantity: Number(value) })} />
          <Select
            label={t("Count mode", "የቆጠራ ሁነታ")}
            value={form.blindCount ? "blind" : "open"}
            onChange={(value) => setForm({ ...form, blindCount: value === "blind" })}
            options={[
              { value: "blind", label: t("Blind (hide system qty)", "ማይታይ (የስርዓት ብዛት ደብቅ)") },
              { value: "open", label: t("Open (show variance later)", "ክፍት (ልዩነት በኋላ)") },
            ]}
          />
        </div>
        <TextArea label={t("Notes", "ማስታወሻ")} value={form.notes} onChange={(value) => setForm({ ...form, notes: value })} />
        <div className="mt-4 flex justify-end">
          <button onClick={() => onSubmit(form)} className="h-10 px-4 rounded-lg bg-ember text-ember-foreground text-sm font-semibold">
            {t("Submit for approval", "ለፈቃድ ላክ")}
          </button>
        </div>
      </SectionCard>

      <SectionCard title={t("Pending count approvals", "በመጠባበቅ ላይ ያሉ ቆጠራዎች")}>
        <SimpleTable
          headers={[t("Session", "ክፍለ ጊዜ"), t("Location", "ቦታ"), t("Item", "እቃ"), t("Counted", "ተቆጥሯል"), t("Expected", "የሚጠበቅ"), t("Status", "ሁኔታ"), t("Action", "እርምጃ")]}
          rows={pending.map((session) => {
            const line = session.lines[0];
            const hideExpected = Boolean(session.blindCount) && session.status !== "Posted";
            return [
              session.countSessionNumber,
              session.location,
              line?.itemName || "-",
              String(line?.countedQuantity ?? 0),
              hideExpected ? "•••" : String(line?.expectedQuantity ?? 0),
              session.status,
              canApprove
                ? "APPROVE"
                : t("Awaiting manager", "አስተዳዳሪ ይጠበቃል"),
            ];
          })}
        />
        {canApprove && pending.length > 0 ? (
          <div className="mt-3 flex flex-wrap gap-2">
            {pending.map((session) => (
              <button
                key={session.id}
                type="button"
                onClick={() => onApprove(session.id)}
                className="h-9 px-3 rounded-lg border border-border bg-card text-sm hover:bg-surface-2"
              >
                {t("Approve & post", "ፍቀድ እና ለጥፍ")} {session.countSessionNumber}
              </button>
            ))}
          </div>
        ) : null}
      </SectionCard>
    </div>
  );
}

function DocumentHistoryPanel({
  stockModule,
  onReverse,
}: {
  stockModule: ScopedStockModule;
  onReverse: (referenceNo: string, type: string) => void;
}) {
  const t = useT();
  const [expanded, setExpanded] = useState<string | null>(null);
  const documents = useMemo(
    () => {
      const rows = [
        ...stockModule.purchaseRequisitions.map((doc) => ({ id: doc.id, type: doc.documentType, number: doc.documentNumber, status: doc.status, createdAt: doc.createdAt, createdBy: doc.createdBy, approvalHistory: doc.approvalHistory as InventoryApprovalHistoryEntry[] })),
        ...stockModule.purchaseOrders.map((doc) => ({ id: doc.id, type: doc.documentType, number: doc.documentNumber, status: doc.status, createdAt: doc.createdAt, createdBy: doc.createdBy, approvalHistory: doc.approvalHistory as InventoryApprovalHistoryEntry[] })),
        ...stockModule.goodsReceivingVouchers.map((doc) => ({ id: doc.id, type: doc.documentType, number: doc.documentNumber, status: doc.status, createdAt: doc.createdAt, createdBy: doc.createdBy, approvalHistory: doc.approvalHistory as InventoryApprovalHistoryEntry[] })),
        ...stockModule.storeIssueVouchers.map((doc) => ({ id: doc.id, type: doc.documentType, number: doc.documentNumber, status: doc.status, createdAt: doc.createdAt, createdBy: doc.createdBy, approvalHistory: doc.approvalHistory as InventoryApprovalHistoryEntry[] })),
        ...stockModule.storeTransferVouchers.map((doc) => ({ id: doc.id, type: doc.documentType, number: doc.documentNumber, status: doc.status, createdAt: doc.createdAt, createdBy: doc.createdBy, approvalHistory: doc.approvalHistory as InventoryApprovalHistoryEntry[] })),
        ...stockModule.goodsReturnVouchers.map((doc) => ({ id: doc.id, type: doc.documentType, number: doc.documentNumber, status: doc.status, createdAt: doc.createdAt, createdBy: doc.createdBy, approvalHistory: doc.approvalHistory as InventoryApprovalHistoryEntry[] })),
        ...stockModule.stockAdjustmentVouchers.map((doc) => ({ id: doc.id, type: doc.documentType, number: doc.documentNumber, status: doc.status, createdAt: doc.createdAt, createdBy: doc.createdBy, approvalHistory: doc.approvalHistory as InventoryApprovalHistoryEntry[] })),
        ...stockModule.dailyConsumptions.map((doc) => ({ id: doc.id, type: doc.documentType, number: doc.documentNumber, status: doc.status, createdAt: doc.createdAt, createdBy: doc.createdBy, approvalHistory: doc.approvalHistory as InventoryApprovalHistoryEntry[], allowReverse: false })),
        ...stockModule.cancellationReversals.map((doc) => ({ id: doc.id, type: doc.documentType, number: doc.documentNumber, status: doc.status, createdAt: doc.createdAt, createdBy: doc.createdBy, approvalHistory: doc.approvalHistory as InventoryApprovalHistoryEntry[] })),
      ];
      const byId = new Map<string, (typeof rows)[number]>();
      for (const row of rows) byId.set(row.id, row);
      return [...byId.values()].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    },
    [stockModule],
  );
  return (
    <SectionCard title={t("Document History", "የሰነድ ታሪክ")}>
      <div className="overflow-auto rounded-lg border border-border">
        <table className="w-full text-sm">
          <thead className="bg-surface-2 text-xs uppercase tracking-wider text-muted-foreground">
            <tr>
              <th className="text-left px-3 py-2">{t("Document", "ሰነድ")}</th>
              <th className="text-left px-3 py-2">{t("Reference", "ማጣቀሻ")}</th>
              <th className="text-left px-3 py-2">{t("Status", "ሁኔታ")}</th>
              <th className="text-left px-3 py-2">{t("Created", "የተፈጠረ")}</th>
              <th className="text-left px-3 py-2">{t("User", "ተጠቃሚ")}</th>
              <th className="text-right px-3 py-2">{t("Action", "እርምጃ")}</th>
            </tr>
          </thead>
          <tbody>
            {documents.map((doc) => {
              const key = doc.id;
              const open = expanded === key;
              return (
                <tr key={key} className="border-t border-border">
                  <td className="px-3 py-2 align-top">{doc.type}</td>
                  <td className="px-3 py-2 align-top font-mono">{doc.number}</td>
                  <td className="px-3 py-2 align-top">{doc.status}</td>
                  <td className="px-3 py-2 align-top">{doc.createdAt.slice(0, 10)}</td>
                  <td className="px-3 py-2 align-top">
                    <div>{doc.createdBy}</div>
                    {open ? (
                      <div className="mt-2 space-y-1 text-xs text-muted-foreground">
                        {(doc.approvalHistory || []).map((entry) => (
                          <div key={entry.id}>
                            <span className="font-medium text-foreground">{entry.action}</span>
                            {" · "}
                            {entry.actedBy}
                            {" · "}
                            {entry.actedAt.slice(0, 19).replace("T", " ")}
                            {entry.notes ? ` · ${entry.notes}` : ""}
                          </div>
                        ))}
                        {(doc.approvalHistory || []).length === 0 && <div>{t("No approval history recorded.", "የፈቃድ ታሪክ አልተመዘገበም።")}</div>}
                      </div>
                    ) : null}
                  </td>
                  <td className="px-3 py-2 align-top text-right space-x-3">
                    <button onClick={() => setExpanded(open ? null : key)} className="text-xs text-ember hover:underline">{open ? t("Hide history", "ታሪክ ደብቅ") : t("History", "ታሪክ")}</button>
                    {"allowReverse" in doc && doc.allowReverse === false ? null : (
                      <button onClick={() => onReverse(doc.number, doc.type)} className="text-xs text-destructive hover:underline">{t("Reverse", "ተመላሽ")}</button>
                    )}
                  </td>
                </tr>
              );
            })}
            {documents.length === 0 && (
              <tr><td colSpan={6} className="px-3 py-8 text-center text-muted-foreground">{t("No documents yet.", "እስካሁን ሰነዶች የሉም።")}</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </SectionCard>
  );
}

function stockLedgerDirection(entry: StockLedgerEntry) {
  if (entry.type === "PURCHASE" || entry.type === "PURCHASE_RECEIPT" || entry.type === "TRANSFER_IN" || entry.type === "STORE_RETURN" || entry.type === "DEPARTMENT_RETURN") return "IN";
  if (entry.type === "TRANSFER_OUT" || entry.type === "MANUAL_DEDUCTION" || entry.type === "POS_CONSUMPTION" || entry.type === "RECIPE_CONSUMPTION" || entry.type === "DAILY_CONSUMPTION" || entry.type === "WASTE" || entry.type === "DAMAGE" || entry.type === "EXPIRY") return "OUT";
  if (entry.type === "ADJUSTMENT") {
    return entry.reason === "Returned" || /increase|add|plus|\+/i.test(entry.notes ?? "") ? "IN" : "OUT";
  }
  return "INFO";
}

function stockLedgerContext(entry: StockLedgerEntry) {
  if (entry.type === "TRANSFER_OUT" || entry.type === "TRANSFER_IN") {
    return `${entry.fromLocation || "-"} → ${entry.toLocation || entry.location}`;
  }
  if (entry.type === "PURCHASE" || entry.type === "PURCHASE_RECEIPT") return `Supplier: ${entry.supplierName || "-"}`;
  if (entry.type === "EXPENSE") return `Department: ${entry.location}`;
  if (entry.type === "CLOSING") return `Closing at ${entry.location}`;
  return `${entry.location}`;
}

function stockLedgerNotes(entry: StockLedgerEntry) {
  return [entry.reason, entry.notes, entry.referenceNo, entry.enteredBy].filter(Boolean).join(" • ");
}

function ReportsPanel({
  balances,
  ledger,
  closings,
  items,
  lots,
  settings,
  locationPolicies,
  purchaseOrders,
  goodsReceivingVouchers,
  counts,
  documents,
  dailyConsumptions = [],
  orders = [],
  posReservations = [],
}: {
  balances: Array<{ itemId: string; itemName: string; category: string; unit: string; location: string; quantity: number; reorderLevel: number; inventoryValue: number }>;
  ledger: StockLedgerEntry[];
  closings: StockClosingRecord[];
  items: StockManagedItem[];
  lots: StockLot[];
  settings: InventorySettingsRecord;
  locationPolicies: LocationStockPolicy[];
  purchaseOrders: PurchaseOrderDocument[];
  goodsReceivingVouchers: GoodsReceivingVoucherDocument[];
  counts: StockCountSession[];
  documents: Array<{ documentType: string; documentNumber: string; approvalHistory: InventoryApprovalHistoryEntry[] }>;
  dailyConsumptions?: import("@/lib/daily-consumption").DailyConsumptionDocument[];
  orders?: Array<{
    id: string;
    orderNo: string;
    status: string;
    total: number;
    waiter: string;
    enteredByCashier?: string;
    paymentStatus?: string;
    cancelledAt?: string;
    returnedAt?: string;
    stockExceptionOutcome?: string;
    items: Array<{ name: string; qty: number; unitPrice?: number; station?: string; finalStation?: string; stockDeductionLocation?: string }>;
  }>;
  posReservations?: PosStockReservation[];
}) {
  const t = useT();
  const [auditSearch, setAuditSearch] = useState("");
  const [auditType, setAuditType] = useState("ALL");
  const [auditLocation, setAuditLocation] = useState("ALL");
  const [dcDepartment, setDcDepartment] = useState<DailyConsumptionDepartment | "ALL">("ALL");
  const [dcFromDate, setDcFromDate] = useState("");
  const [dcToDate, setDcToDate] = useState("");
  const [dcItemId, setDcItemId] = useState("ALL");
  const purchases = ledger.filter((entry) => entry.type === "PURCHASE" || entry.type === "PURCHASE_RECEIPT");
  const transfers = ledger.filter((entry) => entry.type === "TRANSFER_IN" || entry.type === "TRANSFER_OUT");
  const deductions = ledger.filter((entry) => entry.type === "MANUAL_DEDUCTION" || entry.type === "POS_CONSUMPTION" || entry.type === "RECIPE_CONSUMPTION" || entry.type === "DAILY_CONSUMPTION");
  const dailyConsumptionDeductions = ledger.filter((entry) => entry.type === "DAILY_CONSUMPTION");
  const adjustments = ledger.filter((entry) => entry.type === "ADJUSTMENT" || entry.type === "WASTE");
  const expenses = ledger.filter((entry) => entry.type === "EXPENSE");
  const valuation = useMemo(
    () => buildStockValuationReport(items, ledger, lots, settings, [], locationPolicies),
    [items, ledger, lots, settings, locationPolicies],
  );
  const expiryAlerts = useMemo(() => buildExpiryAlerts(lots), [lots]);
  const batchRows = useMemo(() => buildBatchReport(lots), [lots]);
  const poReceiving = useMemo(
    () => buildPurchaseOrderReceivingReport(purchaseOrders, goodsReceivingVouchers),
    [purchaseOrders, goodsReceivingVouchers],
  );
  const approvalActivity = useMemo(() => buildApprovalActivityReport(documents), [documents]);
  const consumption = useMemo(() => buildConsumptionReport(ledger), [ledger]);
  const dailyConsumptionReport = useMemo(
    () =>
      buildDailyConsumptionReport({
        documents: dailyConsumptions,
        ledger,
        fromDate: dcFromDate || undefined,
        toDate: dcToDate || undefined,
        department: dcDepartment,
        itemId: dcItemId === "ALL" ? undefined : dcItemId,
      }),
    [dailyConsumptions, ledger, dcDepartment, dcFromDate, dcToDate, dcItemId],
  );
  const movementSummary = useMemo(() => buildStockMovementSummary(ledger), [ledger]);
  const countVariance = useMemo(() => buildCountVarianceReport(counts), [counts]);
  const posReports = useMemo(
    () => buildPosIntegratedReports({ orders, ledger, posReservations }),
    [orders, ledger, posReservations],
  );
  const auditLocations = useMemo(
    () => Array.from(new Set(ledger.map((entry) => String(entry.location)).filter(Boolean))).sort((a, b) => a.localeCompare(b)),
    [ledger],
  );
  const filteredAuditEntries = useMemo(() => {
    const search = auditSearch.trim().toLowerCase();
    return [...ledger]
      .sort((a, b) => {
        const dateCompare = b.date.localeCompare(a.date);
        if (dateCompare !== 0) return dateCompare;
        return (b.referenceNo || b.id).localeCompare(a.referenceNo || a.id);
      })
      .filter((entry) => (auditType === "ALL" ? true : entry.type === auditType))
      .filter((entry) => (auditLocation === "ALL" ? true : String(entry.location) === auditLocation))
      .filter((entry) => {
        if (!search) return true;
        return [
          entry.itemName,
          entry.location,
          entry.fromLocation,
          entry.toLocation,
          entry.reason,
          entry.notes,
          entry.referenceNo,
          entry.enteredBy,
          entry.supplierName,
        ]
          .filter(Boolean)
          .some((value) => String(value).toLowerCase().includes(search));
      });
  }, [auditLocation, auditSearch, auditType, ledger]);

  const auditTotals = useMemo(() => ({
    inbound: filteredAuditEntries.filter((entry) => stockLedgerDirection(entry) === "IN").length,
    outbound: filteredAuditEntries.filter((entry) => stockLedgerDirection(entry) === "OUT").length,
    adjustments: filteredAuditEntries.filter((entry) => entry.type === "ADJUSTMENT" || entry.type === "WASTE").length,
    closings: filteredAuditEntries.filter((entry) => entry.type === "CLOSING").length,
  }), [filteredAuditEntries]);

  return (
    <div className="space-y-4">
      <SectionCard
        title={t("POS ↔ inventory reports", "የPOS ↔ ክምችት ሪፖርቶች")}
       
      >
        <div className="flex flex-wrap gap-2 mb-3">
          <button
            type="button"
            className="min-h-11 px-3 rounded-lg border border-border bg-card text-sm hover:bg-surface-2"
            onClick={() => downloadCsv("pos-sales-by-station.csv", exportRowsToCsv(
              ["Station", "Qty", "Sales"],
              posReports.salesByStation.map((row) => [row.key, row.quantity, row.sales]),
            ))}
          >
            {t("Sales by station CSV", "በጣቢያ ሽያጭ CSV")}
          </button>
          <button
            type="button"
            className="min-h-11 px-3 rounded-lg border border-border bg-card text-sm hover:bg-surface-2"
            onClick={async () => {
              const bytes = await exportRowsToXlsx(
                "POS Sales",
                ["Station", "Qty", "Sales"],
                posReports.salesByStation.map((row) => [row.key, row.quantity, row.sales]),
              );
              downloadXlsxBytes("pos-sales-by-station.xlsx", bytes);
            }}
          >
            {t("Sales by station Excel", "በጣቢያ ሽያጭ Excel")}
          </button>
          <button
            type="button"
            className="min-h-11 px-3 rounded-lg border border-border bg-card text-sm hover:bg-surface-2"
            onClick={() => downloadCsv("pos-reversals.csv", exportRowsToCsv(
              ["Date", "Type", "Item", "Location", "Qty", "Value", "Ref"],
              posReports.reversals.map((row) => [row.date, row.type, row.itemName, row.location, row.quantity, row.totalCost, row.referenceNo]),
            ))}
          >
            {t("Reversals CSV", "ተመላሾች CSV")}
          </button>
          <button
            type="button"
            className="min-h-11 px-3 rounded-lg border border-border bg-card text-sm hover:bg-surface-2"
            onClick={async () => {
              const bytes = await exportRowsToXlsx(
                "Reversals",
                ["Date", "Type", "Item", "Location", "Qty", "Value", "Ref"],
                posReports.reversals.map((row) => [row.date, row.type, row.itemName, row.location, row.quantity, row.totalCost, row.referenceNo]),
              );
              downloadXlsxBytes("pos-reversals.xlsx", bytes);
            }}
          >
            {t("Reversals Excel", "ተመላሾች Excel")}
          </button>
          <button
            type="button"
            className="min-h-11 px-3 rounded-lg border border-border bg-card text-sm hover:bg-surface-2"
            onClick={() => downloadCsv("pos-voids-refunds.csv", exportRowsToCsv(
              ["Order", "Status", "Total", "Outcome", "Waiter", "Cashier"],
              posReports.voidsCancelsRefunds.map((row) => [row.orderNo, row.status, row.total, row.outcome, row.waiter, row.cashier]),
            ))}
          >
            {t("Voids/refunds CSV", "ሰረዛ/መልስ CSV")}
          </button>
          <button
            type="button"
            className="min-h-11 px-3 rounded-lg border border-border bg-card text-sm hover:bg-surface-2"
            onClick={() => downloadCsv("pos-reserved-stock.csv", exportRowsToCsv(
              ["Order", "Item", "Location", "Qty", "By"],
              posReports.reservedStock.map((row) => [row.orderNo, row.itemName, row.location, row.quantity, row.reservedBy]),
            ))}
          >
            {t("Reserved stock CSV", "ሪዘርቭ ክምችት CSV")}
          </button>
          <button
            type="button"
            className="min-h-11 px-3 rounded-lg border border-border bg-card text-sm hover:bg-surface-2"
            onClick={() => openInventoryPrintReport(
              t("POS inventory summary", "የPOS ክምችት ማጠቃለያ"),
              ["Metric", "Value"],
              [
                [t("Sales total", "ጠቅላላ ሽያጭ"), formatETB(posReports.salesTotal)],
                [t("COGS", "የሽያጭ ወጪ"), formatETB(posReports.cogs)],
                [t("Food & bev %", "የምግብ/መጠጥ %"), `${posReports.foodAndBevCostPercent}%`],
                [t("Reserved lines", "ሪዘርቭ መስመሮች"), String(posReports.reservedStock.length)],
                [t("Voids/refunds", "ሰረዛ/መልስ"), String(posReports.voidsCancelsRefunds.length)],
              ],
            )}
          >
            {t("Print POS summary", "የPOS ማጠቃለያ አትም")}
          </button>
        </div>
        <SimpleTable
          headers={[t("Station / dept", "ጣቢያ / ክፍል"), t("Qty", "ብዛት"), t("Sales", "ሽያጭ")]}
          rows={posReports.salesByStation.slice(0, 8).map((row) => [row.key, String(row.quantity), formatETB(row.sales)])}
        />
      </SectionCard>
      <SectionCard
        title={t("Phase 3 control reports", "የደረጃ 3 ቁጥጥር ሪፖርቶች")}
       
      >
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            className="h-9 px-3 rounded-lg border border-border bg-card text-sm hover:bg-surface-2"
            onClick={() => downloadCsv("stock-valuation.csv", exportRowsToCsv(
              ["Item", "Location", "Qty", "Unit", "Reorder", "Value", "Method"],
              valuation.map((row) => [row.itemName, row.location, row.quantity, row.unit, row.reorderLevel, row.inventoryValue, row.costingMethod]),
            ))}
          >
            {t("Export valuation CSV", "የዋጋ ግምት CSV")}
          </button>
          <button
            type="button"
            className="h-9 px-3 rounded-lg border border-border bg-card text-sm hover:bg-surface-2"
            onClick={() => downloadCsv("expiry-alerts.csv", exportRowsToCsv(
              ["Item", "Location", "Batch", "Expiry", "Qty", "Status", "Alert"],
              expiryAlerts.map((row) => [row.itemName, row.location, row.batchNumber, row.expiryDate || "", row.quantity, row.status, row.alert || ""]),
            ))}
          >
            {t("Export expiry CSV", "ጊዜ ማብቂያ CSV")}
          </button>
          <button
            type="button"
            className="h-9 px-3 rounded-lg border border-border bg-card text-sm hover:bg-surface-2"
            onClick={() => downloadCsv("batch-report.csv", exportRowsToCsv(
              ["Item", "Location", "Batch", "Expiry", "Qty", "Unit cost", "Status"],
              batchRows.map((row) => [row.itemName, row.location, row.batchNumber, row.expiryDate || "", row.quantity, row.unitCost, row.status]),
            ))}
          >
            {t("Export batch CSV", "ባች CSV")}
          </button>
          <button
            type="button"
            className="h-9 px-3 rounded-lg border border-border bg-card text-sm hover:bg-surface-2"
            onClick={() => downloadCsv("po-receiving.csv", exportRowsToCsv(
              ["PO", "Supplier", "Store", "Status", "Ordered", "Received", "GRVs"],
              poReceiving.map((row) => [row.purchaseOrderNumber, row.supplier, row.destinationStore, row.status, row.orderedQty, row.receivedQty, row.grvNumbers]),
            ))}
          >
            {t("Export PO receiving CSV", "PO መቀበያ CSV")}
          </button>
          <button
            type="button"
            className="h-9 px-3 rounded-lg border border-border bg-card text-sm hover:bg-surface-2"
            onClick={() => downloadCsv("approval-activity.csv", exportRowsToCsv(
              ["Document", "Number", "Action", "By", "At", "Notes"],
              approvalActivity.map((row) => [row.documentType, row.documentNumber, row.action, row.actedBy, row.actedAt, row.notes]),
            ))}
          >
            {t("Export approvals CSV", "ፈቃዶች CSV")}
          </button>
        </div>
      </SectionCard>

      <SectionCard
        title={t("Phase 4 ERP reports", "የደረጃ 4 ERP ሪፖርቶች")}
       
      >
        <div className="flex flex-wrap gap-2 mb-4">
          <button
            type="button"
            className="h-9 px-3 rounded-lg border border-border bg-card text-sm hover:bg-surface-2"
            onClick={() => downloadCsv("consumption.csv", exportRowsToCsv(
              ["Date", "Type", "Item", "Location", "Qty", "Cost", "Reference"],
              consumption.map((row) => [row.date, row.type, row.itemName, row.location, row.quantity, row.totalCost, row.referenceNo]),
            ))}
          >
            {t("Export consumption CSV", "ፍጆታ CSV")}
          </button>
          <button
            type="button"
            className="h-9 px-3 rounded-lg border border-border bg-card text-sm hover:bg-surface-2"
            onClick={() => downloadCsv("movement-summary.csv", exportRowsToCsv(
              ["Type", "Count", "Quantity", "Value"],
              movementSummary.map((row) => [row.type, row.count, row.quantity, row.value]),
            ))}
          >
            {t("Export movement CSV", "እንቅስቃሴ CSV")}
          </button>
          <button
            type="button"
            className="h-9 px-3 rounded-lg border border-border bg-card text-sm hover:bg-surface-2"
            onClick={() => downloadCsv("count-variance.csv", exportRowsToCsv(
              ["Session", "Location", "Item", "Expected", "Counted", "Variance", "Value", "Status"],
              countVariance.map((row) => [row.countSessionNumber, row.location, row.itemName, row.expectedQuantity, row.countedQuantity, row.variance, row.varianceValue, row.status]),
            ))}
          >
            {t("Export variance CSV", "ልዩነት CSV")}
          </button>
          <button
            type="button"
            className="h-9 px-3 rounded-lg border border-border bg-card text-sm hover:bg-surface-2"
            onClick={() => openInventoryPrintReport(
              t("Stock valuation", "የክምችት ዋጋ ግምት"),
              ["Item", "Location", "Qty", "Value"],
              valuation.map((row) => [row.itemName, row.location, `${row.quantity} ${row.unit}`, row.inventoryValue]),
            )}
          >
            {t("Print valuation PDF", "ዋጋ ግምት አትም")}
          </button>
          <button
            type="button"
            className="h-9 px-3 rounded-lg border border-border bg-card text-sm hover:bg-surface-2"
            onClick={() => openInventoryPrintReport(
              t("Consumption report", "የፍጆታ ሪፖርት"),
              ["Date", "Type", "Item", "Location", "Qty", "Cost"],
              consumption.map((row) => [row.date, row.type, row.itemName, row.location, row.quantity, row.totalCost]),
            )}
          >
            {t("Print consumption PDF", "ፍጆታ አትም")}
          </button>
        </div>
        <div className="grid xl:grid-cols-2 gap-4">
          <SimpleTable
            headers={[t("Type", "አይነት"), t("Docs", "ሰነዶች"), t("Qty", "ብዛት"), t("Value", "ዋጋ")]}
            rows={movementSummary.map((row) => [row.type, String(row.count), String(row.quantity), formatETB(row.value)])}
          />
          <SimpleTable
            headers={[t("Session", "ክፍለ ጊዜ"), t("Item", "እቃ"), t("Variance", "ልዩነት"), t("Status", "ሁኔታ")]}
            rows={countVariance.map((row) => [row.countSessionNumber, row.itemName, String(row.variance), row.status])}
          />
        </div>
      </SectionCard>

      <div className="grid xl:grid-cols-2 gap-4">
        <SectionCard title={t("Stock valuation", "የክምችት ዋጋ ግምት")}>
          <SimpleTable
            headers={[t("Item", "እቃ"), t("Location", "ቦታ"), t("Qty", "ብዛት"), t("Value", "ዋጋ")]}
            rows={valuation.map((row) => [row.itemName, row.location, `${row.quantity} ${row.unit}`, formatETB(row.inventoryValue)])}
          />
        </SectionCard>
        <SectionCard title={t("Expiry / quarantine alerts", "ጊዜ ማብቂያ / ኳራንቲን")}>
          <SimpleTable
            headers={[t("Item", "እቃ"), t("Batch", "ባች"), t("Expiry", "ጊዜ"), t("Alert", "ማስጠንቀቂያ")]}
            rows={expiryAlerts.map((row) => [row.itemName, row.batchNumber, row.expiryDate || "-", String(row.alert)])}
          />
        </SectionCard>
        <SectionCard title={t("Batch / lot register", "የባች መዝገብ")}>
          <SimpleTable
            headers={[t("Item", "እቃ"), t("Location", "ቦታ"), t("Batch", "ባች"), t("Qty", "ብዛት"), t("Status", "ሁኔታ")]}
            rows={batchRows.map((row) => [row.itemName, row.location, row.batchNumber, `${row.quantity} ${row.unit}`, row.status])}
          />
        </SectionCard>
        <SectionCard title={t("PO receiving status", "የPO መቀበያ ሁኔታ")}>
          <SimpleTable
            headers={[t("PO", "PO"), t("Supplier", "አቅራቢ"), t("Ordered", "ታዘዘ"), t("Received", "ተቀብሏል"), t("Status", "ሁኔታ")]}
            rows={poReceiving.map((row) => [row.purchaseOrderNumber, row.supplier, String(row.orderedQty), String(row.receivedQty), row.status])}
          />
        </SectionCard>
      </div>

      <SectionCard title={t("Current stock by location", "የአሁኑ ክምችት በቦታ")}>
        <SimpleTable
          headers={["Item", "Category", "Location", "Qty", "Value"]}
          rows={balances.map((row) => [row.itemName, row.category, row.location, `${row.quantity} ${row.unit}`, formatETB(row.inventoryValue)])}
        />
      </SectionCard>
      <div className="grid xl:grid-cols-2 gap-4">
        <SectionCard title={t("Purchases report", "የግዢ ሪፖርት")}>
          <SimpleTable headers={[t("Date", "ቀን"), t("Item", "እቃ"), t("Supplier", "አቅራቢ"), t("Qty", "ብዛት"), t("Total", "ጠቅላላ")] } rows={purchases.map((row) => [row.date, row.itemName, row.supplierName || "-", `${row.quantity} ${row.unit}`, formatETB(row.totalCost)])} />
        </SectionCard>
        <SectionCard title={t("Transfers report", "የዝውውር ሪፖርት")}>
          <SimpleTable headers={[t("Date", "ቀን"), t("Item", "እቃ"), t("From", "ከ",), t("To", "ወደ"), t("Qty", "ብዛት")] } rows={transfers.map((row) => [row.date, row.itemName, row.fromLocation || "-", row.toLocation || row.location, `${row.quantity} ${row.unit}`])} />
        </SectionCard>
        <SectionCard title={t("Sales deduction report", "የሽያጭ ቅነጥታ ሪፖርት")}>
          <SimpleTable headers={[t("Date", "ቀን"), t("Item", "እቃ"), t("Location", "ቦታ"), t("Qty", "ብዛት"), t("Cost", "ወጪ")] } rows={deductions.map((row) => [row.date, row.itemName, row.location, `${row.quantity} ${row.unit}`, formatETB(row.totalCost)])} />
        </SectionCard>
        <SectionCard
          title={t("Daily consumption report", "የዕለታዊ መጠቀም ሪፖርት")}
         
        >
          <div className="grid md:grid-cols-2 xl:grid-cols-5 gap-3 mb-4">
            <Select
              label={t("Department", "ክፍል")}
              value={dcDepartment}
              onChange={(value) => setDcDepartment(value as DailyConsumptionDepartment | "ALL")}
              options={[
                { value: "ALL", label: t("All departments", "ሁሉም ክፍሎች") },
                { value: "Kitchen", label: "Kitchen" },
                { value: "Coffee House", label: "Coffee House" },
              ]}
            />
            <Input label={t("From date", "ከቀን")} type="date" value={dcFromDate} onChange={setDcFromDate} />
            <Input label={t("To date", "እስከ ቀን")} type="date" value={dcToDate} onChange={setDcToDate} />
            <Select
              label={t("Item", "እቃ")}
              value={dcItemId}
              onChange={setDcItemId}
              options={[{ value: "ALL", label: t("All items", "ሁሉም እቃዎች") }, ...items.map((row) => ({ value: row.id, label: row.name }))]}
            />
            <div className="flex flex-wrap items-end gap-2">
              <button
                type="button"
                className="h-10 px-3 rounded-lg border border-border bg-card text-sm hover:bg-surface-2"
                onClick={() => downloadCsv("daily-consumption-report.csv", exportRowsToCsv(
                  ["Date", "Department", "Reference", "Item", "Opening", "Consumed", "Transfers", "Adjustments", "Closing", "Unit"],
                  dailyConsumptionReport.map((row) => [
                    row.date,
                    row.department,
                    row.referenceNo,
                    row.itemName,
                    row.openingStock,
                    row.consumed,
                    row.transfersReceived,
                    row.adjustments,
                    row.closingStock,
                    row.unit,
                  ]),
                ))}
              >
                {t("Export Excel", "Excel ላክ")}
              </button>
              <button
                type="button"
                className="h-10 px-3 rounded-lg border border-border bg-card text-sm hover:bg-surface-2"
                onClick={() => openInventoryPrintReport(
                  t("Daily consumption report", "የዕለታዊ መጠቀም ሪፖርት"),
                  ["Date", "Dept", "Ref", "Item", "Opening", "Consumed", "Closing"],
                  dailyConsumptionReport.map((row) => [
                    row.date,
                    row.department,
                    row.referenceNo,
                    row.itemName,
                    row.openingStock,
                    row.consumed,
                    row.closingStock,
                  ]),
                )}
              >
                {t("Export PDF", "PDF ላክ")}
              </button>
            </div>
          </div>
          <SimpleTable
            headers={[
              t("Date", "ቀን"),
              t("Department", "ክፍል"),
              t("Reference", "ማጣቀሻ"),
              t("Item", "እቃ"),
              t("Opening", "መነሻ"),
              t("Consumed", "ተጠቀመ"),
              t("Transfers", "ዝውውር"),
              t("Adjustments", "ማስተካከያ"),
              t("Closing", "መዝጊያ"),
            ]}
            rows={dailyConsumptionReport.map((row) => [
              row.date,
              row.department,
              row.referenceNo,
              row.itemName,
              `${row.openingStock} ${row.unit}`,
              `${row.consumed} ${row.unit}`,
              `${row.transfersReceived} ${row.unit}`,
              `${row.adjustments} ${row.unit}`,
              `${row.closingStock} ${row.unit}`,
            ])}
          />
          {dailyConsumptionDeductions.length > 0 ? (
            <div className="mt-3 text-xs text-muted-foreground">
              {t("Ledger entries", "የሌጀር መዝገቦች")}: {dailyConsumptionDeductions.length}
            </div>
          ) : null}
        </SectionCard>
        <SectionCard title={t("Waste / damage report", "የቆሻሻ/ጉዳት ሪፖርት")}>
          <SimpleTable headers={[t("Date", "ቀን"), t("Item", "እቃ"), t("Reason", "ምክንያት"), t("Location", "ቦታ"), t("Qty", "ብዛት")] } rows={adjustments.map((row) => [row.date, row.itemName, row.reason || row.type, row.location, `${row.quantity} ${row.unit}`])} />
        </SectionCard>
        <SectionCard title={t("Daily expenses report", "ዕለታዊ ወጪ ሪፖርት")}>
          <SimpleTable headers={[t("Date", "ቀን"), t("Department", "ክፍል"), t("Item", "እቃ"), t("Qty", "ብዛት"), t("Total", "ጠቅላላ")] } rows={expenses.map((row) => [row.date, row.location, row.itemName, `${row.quantity} ${row.unit}`, formatETB(row.totalCost)])} />
        </SectionCard>
        <SectionCard title={t("Stock audit report", "የክምችት ኦዲት ሪፖርት")}>
          <SimpleTable headers={[t("Date", "ቀን"), t("Location", "ቦታ"), t("Opening", "መነሻ"), t("Closing", "መዝጊያ"), t("Difference", "ልዩነት")] } rows={closings.map((row) => [row.date, row.location, String(row.openingStock), String(row.closingStock), String(row.difference)])} />
        </SectionCard>
      </div>

      <SectionCard
        title={t("Stock history & audit trail", "የክምችት ታሪክ እና ኦዲት")}
       
      >
        <div className="grid md:grid-cols-2 xl:grid-cols-4 gap-3">
          <Input label={t("Search", "ፈልግ")} value={auditSearch} onChange={setAuditSearch} />
          <Select
            label={t("Transaction type", "የግብይት አይነት")}
            value={auditType}
            onChange={setAuditType}
            options={[{ value: "ALL", label: t("All types", "ሁሉም አይነቶች") }, ...Array.from(new Set(ledger.map((entry) => entry.type))).map((type) => ({ value: type, label: type }))]}
          />
          <Select
            label={t("Location", "ቦታ")}
            value={auditLocation}
            onChange={setAuditLocation}
            options={[{ value: "ALL", label: t("All locations", "ሁሉም ቦታዎች") }, ...auditLocations.map((location) => ({ value: location, label: location }))]}
          />
          <Input label={t("Matched records", "የተገኙ መዝገቦች")} value={String(filteredAuditEntries.length)} onChange={() => {}} disabled />
        </div>

        <div className="grid md:grid-cols-2 xl:grid-cols-4 gap-3 mt-4">
          <div className="rounded-lg bg-surface-2 p-3">
            <div className="text-xs text-muted-foreground">{t("Inbound", "ገቢ")}</div>
            <div className="font-display text-xl font-semibold">{auditTotals.inbound}</div>
          </div>
          <div className="rounded-lg bg-surface-2 p-3">
            <div className="text-xs text-muted-foreground">{t("Outbound", "ወጪ")}</div>
            <div className="font-display text-xl font-semibold">{auditTotals.outbound}</div>
          </div>
          <div className="rounded-lg bg-surface-2 p-3">
            <div className="text-xs text-muted-foreground">{t("Adjustments", "ማስተካከያዎች")}</div>
            <div className="font-display text-xl font-semibold">{auditTotals.adjustments}</div>
          </div>
          <div className="rounded-lg bg-surface-2 p-3">
            <div className="text-xs text-muted-foreground">{t("Closings", "መዝጊያዎች")}</div>
            <div className="font-display text-xl font-semibold">{auditTotals.closings}</div>
          </div>
        </div>

        <div className="mt-4 overflow-auto rounded-lg border border-border">
          <table className="w-full text-sm">
            <thead className="bg-surface-2 text-xs uppercase tracking-wider text-muted-foreground">
              <tr>
                <th className="text-left px-3 py-2">{t("Date", "ቀን")}</th>
                <th className="text-left px-3 py-2">{t("Type", "አይነት")}</th>
                <th className="text-left px-3 py-2">{t("Item", "እቃ")}</th>
                <th className="text-left px-3 py-2">{t("Flow", "እንቅስቃሴ")}</th>
                <th className="text-left px-3 py-2">{t("Quantity", "ብዛት")}</th>
                <th className="text-left px-3 py-2">{t("Context", "አውድ")}</th>
                <th className="text-left px-3 py-2">{t("Audit details", "የኦዲት ዝርዝር")}</th>
              </tr>
            </thead>
            <tbody>
              {filteredAuditEntries.slice(0, 100).map((entry) => {
                const direction = stockLedgerDirection(entry);
                return (
                  <tr key={entry.id} className="border-t border-border align-top">
                    <td className="px-3 py-2 whitespace-nowrap">{entry.date}</td>
                    <td className="px-3 py-2">
                      <div className="font-medium">{entry.type}</div>
                      <div className="text-xs text-muted-foreground">{entry.referenceNo || "-"}</div>
                    </td>
                    <td className="px-3 py-2">
                      <div className="font-medium">{entry.itemName}</div>
                      <div className="text-xs text-muted-foreground">{entry.category || "-"}</div>
                    </td>
                    <td className="px-3 py-2">
                      <span className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-medium ${direction === "IN" ? "bg-emerald-500/10 text-emerald-700" : direction === "OUT" ? "bg-destructive/10 text-destructive" : "bg-surface-2 text-muted-foreground"}`}>
                        {direction}
                      </span>
                    </td>
                    <td className="px-3 py-2 whitespace-nowrap font-mono">{entry.quantity} {entry.unit}</td>
                    <td className="px-3 py-2">{stockLedgerContext(entry)}</td>
                    <td className="px-3 py-2">
                      <div>{stockLedgerNotes(entry) || "-"}</div>
                      {(entry.totalCost || entry.unitPrice) ? (
                        <div className="text-xs text-muted-foreground mt-1">
                          {t("Cost", "ወጪ")}: {formatETB(entry.totalCost)}{entry.unitPrice ? ` • ${t("Unit", "አንድ")}: ${formatETB(entry.unitPrice)}` : ""}
                        </div>
                      ) : null}
                    </td>
                  </tr>
                );
              })}
              {filteredAuditEntries.length === 0 && (
                <tr>
                  <td colSpan={7} className="px-3 py-8 text-center text-muted-foreground">{t("No audit records match your filters.", "ማጣሪያዎትን የሚያሟሉ የኦዲት መዝገቦች የሉም።")}</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        {filteredAuditEntries.length > 100 && (
          <div className="mt-3 text-xs text-muted-foreground">
            {t(`Showing the latest 100 of ${filteredAuditEntries.length} matching audit records.`, `ከ ${filteredAuditEntries.length} ተመሳሳይ የኦዲት መዝገቦች ውስጥ የቅርብ 100 ብቻ እየታዩ ነው።`)}
          </div>
        )}
      </SectionCard>
    </div>
  );
}

function InventorySettingsPanel({
  settings,
  items,
  locationPolicies,
  lots,
  userName,
  onSaveSettings,
  onSavePolicy,
}: {
  settings: InventorySettingsRecord;
  items: StockManagedItem[];
  locationPolicies: LocationStockPolicy[];
  lots: StockLot[];
  userName: string;
  onSaveSettings: (next: InventorySettingsRecord) => void;
  onSavePolicy: (policy: LocationStockPolicy) => void;
}) {
  const t = useT();
  const [costingMethod, setCostingMethod] = useState<InventoryCostingMethod>(settings.costingMethod);
  const [allowNegativeStock, setAllowNegativeStock] = useState(settings.allowNegativeStock);
  const [posReservationTrigger, setPosReservationTrigger] = useState<PosReservationTrigger>(settings.posReservationTrigger ?? "station_accept");
  const [posDeductionTiming, setPosDeductionTiming] = useState<PosDeductionTiming>(settings.posDeductionTiming ?? "item_ready");
  const [posOutOfStockBehavior, setPosOutOfStockBehavior] = useState<PosOutOfStockBehavior>(settings.posOutOfStockBehavior ?? "block");
  const [policyForm, setPolicyForm] = useState({
    itemId: items[0]?.id || "",
    location: "Store 1" as StockLocation,
    minimumStock: 0,
    maximumStock: 100,
    reorderLevel: 10,
    reorderQuantity: 20,
    safetyStock: 5,
  });
  const quarantineCount = lots.filter((lot) => lot.status === "Quarantine").length;
  const selectedItem = items.find((row) => row.id === policyForm.itemId);

  useEffect(() => {
    setCostingMethod(settings.costingMethod);
    setAllowNegativeStock(settings.allowNegativeStock);
    setPosReservationTrigger(settings.posReservationTrigger ?? "station_accept");
    setPosDeductionTiming(settings.posDeductionTiming ?? "item_ready");
    setPosOutOfStockBehavior(settings.posOutOfStockBehavior ?? "block");
  }, [settings.costingMethod, settings.allowNegativeStock, settings.posReservationTrigger, settings.posDeductionTiming, settings.posOutOfStockBehavior]);

  return (
    <div className="space-y-4">
      <SectionCard title={t("Inventory costing", "የክምችት ወጪ ዘዴ")}>
        <div className="grid md:grid-cols-2 xl:grid-cols-3 gap-3">
          <Select
            label={t("Costing method", "የወጪ ዘዴ")}
            value={costingMethod}
            onChange={(value) => setCostingMethod(value as InventoryCostingMethod)}
            options={INVENTORY_COSTING_METHODS.map((method) => ({ value: method, label: method }))}
          />
          <Select
            label={t("Allow negative stock", "አሉታዊ ክምችት ፍቀድ")}
            value={allowNegativeStock ? "yes" : "no"}
            onChange={(value) => setAllowNegativeStock(value === "yes")}
            options={[
              { value: "no", label: t("No", "አይ") },
              { value: "yes", label: t("Yes", "አዎ") },
            ]}
          />
          <Input label={t("Quarantine lots", "የኳራንቲን ባቾች")} value={String(quarantineCount)} onChange={() => {}} disabled />
          <Select
            label={t("POS reservation trigger", "የPOS ሪዘርቭ ጊዜ")}
            value={posReservationTrigger}
            onChange={(value) => setPosReservationTrigger(value as PosReservationTrigger)}
            options={POS_RESERVATION_TRIGGERS.map((row) => ({ value: row, label: row }))}
          />
          <Select
            label={t("POS deduction timing", "የPOS ቅነሳ ጊዜ")}
            value={posDeductionTiming}
            onChange={(value) => setPosDeductionTiming(value as PosDeductionTiming)}
            options={POS_DEDUCTION_TIMINGS.map((row) => ({ value: row, label: row }))}
          />
          <Select
            label={t("POS out-of-stock behavior", "የPOS ከክምችት ውጭ ባህሪ")}
            value={posOutOfStockBehavior}
            onChange={(value) => setPosOutOfStockBehavior(value as PosOutOfStockBehavior)}
            options={POS_OOS_BEHAVIORS.map((row) => ({ value: row, label: row }))}
          />
        </div>
        <div className="mt-4 flex justify-end">
          <button
            type="button"
            className="h-10 px-4 rounded-lg bg-ember text-ember-foreground text-sm font-semibold"
            onClick={() => onSaveSettings({
              id: "inventory-settings",
              costingMethod,
              allowNegativeStock,
              posReservationTrigger,
              posDeductionTiming,
              posOutOfStockBehavior,
              updatedAt: new Date().toISOString(),
              updatedBy: userName,
            })}
          >
            {t("Save settings", "ቅንብሮች አስቀምጥ")}
          </button>
        </div>
      </SectionCard>

      <SectionCard title={t("Location reorder policies", "የቦታ ድጋሚ ትዕዛዝ ፖሊሲ")}>
        <div className="grid md:grid-cols-2 xl:grid-cols-4 gap-3">
          <Select label={t("Item", "እቃ")} value={policyForm.itemId} onChange={(value) => setPolicyForm({ ...policyForm, itemId: value })} options={items.map((row) => ({ value: row.id, label: row.name }))} />
          <Select label={t("Location", "ቦታ")} value={policyForm.location} onChange={(value) => setPolicyForm({ ...policyForm, location: value as StockLocation })} options={STOCK_LOCATIONS.map((row) => ({ value: row, label: row }))} />
          <Input label={t("Minimum", "ዝቅተኛ")} type="number" value={String(policyForm.minimumStock)} onChange={(value) => setPolicyForm({ ...policyForm, minimumStock: Number(value) })} />
          <Input label={t("Maximum", "ከፍተኛ")} type="number" value={String(policyForm.maximumStock)} onChange={(value) => setPolicyForm({ ...policyForm, maximumStock: Number(value) })} />
          <Input label={t("Reorder level", "ድጋሚ ትዕዛዝ ደረጃ")} type="number" value={String(policyForm.reorderLevel)} onChange={(value) => setPolicyForm({ ...policyForm, reorderLevel: Number(value) })} />
          <Input label={t("Reorder qty", "ድጋሚ ትዕዛዝ ብዛት")} type="number" value={String(policyForm.reorderQuantity)} onChange={(value) => setPolicyForm({ ...policyForm, reorderQuantity: Number(value) })} />
          <Input label={t("Safety stock", "የደህንነት ክምችት")} type="number" value={String(policyForm.safetyStock)} onChange={(value) => setPolicyForm({ ...policyForm, safetyStock: Number(value) })} />
        </div>
        <div className="mt-4 flex justify-end">
          <button
            type="button"
            disabled={!selectedItem}
            className="h-10 px-4 rounded-lg bg-ember text-ember-foreground text-sm font-semibold disabled:opacity-40"
            onClick={() => {
              if (!selectedItem) return;
              onSavePolicy({
                id: `policy-${policyForm.itemId}-${policyForm.location}`,
                itemId: selectedItem.id,
                itemName: selectedItem.name,
                location: policyForm.location,
                minimumStock: policyForm.minimumStock,
                maximumStock: policyForm.maximumStock,
                reorderLevel: policyForm.reorderLevel,
                reorderQuantity: policyForm.reorderQuantity,
                safetyStock: policyForm.safetyStock,
                updatedAt: new Date().toISOString(),
              });
            }}
          >
            {t("Save policy", "ፖሊሲ አስቀምጥ")}
          </button>
        </div>
        <div className="mt-4">
          <SimpleTable
            headers={[t("Item", "እቃ"), t("Location", "ቦታ"), t("Reorder", "ድጋሚ"), t("Qty", "ብዛት"), t("Min/Max", "ዝቅ/ከፍ")]}
            rows={locationPolicies.map((row) => [row.itemName, row.location, String(row.reorderLevel), String(row.reorderQuantity), `${row.minimumStock}/${row.maximumStock}`])}
          />
        </div>
      </SectionCard>
    </div>
  );
}

function TablePagination({
  page,
  totalPages,
  totalItems,
  pageSize,
  onPageChange,
}: {
  page: number;
  totalPages: number;
  totalItems: number;
  pageSize: number;
  onPageChange: (page: number) => void;
}) {
  const start = totalItems === 0 ? 0 : (page - 1) * pageSize + 1;
  const end = Math.min(page * pageSize, totalItems);

  return (
    <div className="flex items-center justify-between gap-3 border-t border-border px-4 py-3 text-sm">
      <div className="text-muted-foreground">
        Showing {start}-{end} of {totalItems}
      </div>
      <div className="flex items-center gap-2">
        <button
          onClick={() => onPageChange(Math.max(1, page - 1))}
          disabled={page <= 1}
          className="h-8 px-3 rounded-lg border border-border bg-card disabled:opacity-50"
        >
          Prev
        </button>
        <div className="text-muted-foreground min-w-[88px] text-center">
          Page {page} / {totalPages}
        </div>
        <button
          onClick={() => onPageChange(Math.min(totalPages, page + 1))}
          disabled={page >= totalPages}
          className="h-8 px-3 rounded-lg border border-border bg-card disabled:opacity-50"
        >
          Next
        </button>
      </div>
    </div>
  );
}

function SimpleTable({ headers, rows, pageSize = STOCK_TABLE_PAGE_SIZE }: { headers: string[]; rows: string[][]; pageSize?: number }) {
  const [page, setPage] = useState(1);
  const totalPages = Math.max(1, Math.ceil(rows.length / pageSize));
  const visibleRows = useMemo(() => {
    const start = (page - 1) * pageSize;
    return rows.slice(start, start + pageSize);
  }, [page, pageSize, rows]);

  useEffect(() => {
    setPage(1);
  }, [rows.length, pageSize]);

  useEffect(() => {
    if (page > totalPages) setPage(totalPages);
  }, [page, totalPages]);

  return (
    <div className="overflow-hidden rounded-lg border border-border">
      <div className="overflow-auto">
        <table className="w-full text-sm">
        <thead className="bg-surface-2 text-xs uppercase tracking-wider text-muted-foreground">
          <tr>{headers.map((header) => <th key={header} className="text-left px-3 py-2">{header}</th>)}</tr>
        </thead>
        <tbody>
          {visibleRows.map((row, index) => (
            <tr key={`${row.join("-")}-${index}`} className="border-t border-border">
              {row.map((cell, cellIndex) => <td key={`${cell}-${cellIndex}`} className="px-3 py-2">{cell}</td>)}
            </tr>
          ))}
          {visibleRows.length === 0 && (
            <tr>
              <td colSpan={headers.length} className="px-3 py-8 text-center text-muted-foreground">No records</td>
            </tr>
          )}
        </tbody>
        </table>
      </div>
      <TablePagination
        page={page}
        totalPages={totalPages}
        totalItems={rows.length}
        pageSize={pageSize}
        onPageChange={setPage}
      />
    </div>
  );
}

function StockItemEditor({
  item,
  locationOptions = STOCK_LOCATIONS as StockLocation[],
  onClose,
  onSave,
}: {
  item: StockManagedItem;
  locationOptions?: StockLocation[];
  onClose: () => void;
  onSave: (item: StockManagedItem) => void;
}) {
  const t = useT();
  const [form, setForm] = useState<StockManagedItem>({ ...item, conversions: item.conversions.map((row) => ({ ...row })) });
  const store = useStore();
  const isSpiritStock = form.category === "Whisky" || form.baseUnit === "bottle";
  const yieldInfo = spiritYieldForItem(form);
  const [doublesPerBottle, setDoublesPerBottle] = useState(String(yieldInfo.doublesPerBottle));
  const [bottleVolumeMl, setBottleVolumeMl] = useState(form.bottleVolumeMl ? String(form.bottleVolumeMl) : "");

  function addConversion() {
    setForm((prev) => ({
      ...prev,
      conversions: [...prev.conversions, { id: `conv-${Date.now()}`, label: "", fromUnit: prev.baseUnit, toUnit: prev.baseUnit, multiplier: 1 }],
    }));
  }

  function save() {
    let next = { ...form, beerTier: inferBeerTier(form) };
    if (
      form.category === "Whisky" ||
      (form.baseUnit === "bottle" &&
        Number(doublesPerBottle) > 0 &&
        form.conversions.some((c) => c.toUnit === "double shot" || c.fromUnit === "double shot"))
    ) {
      const doubles = Math.max(1, Math.round(Number(doublesPerBottle) || DEFAULT_DOUBLES_PER_BOTTLE));
      const volume = bottleVolumeMl.trim() === "" ? undefined : Number(bottleVolumeMl);
      next = applySpiritYieldConversions(next, doubles, Number.isFinite(volume) ? volume : undefined);
    } else if (bottleVolumeMl.trim() !== "") {
      const volume = Number(bottleVolumeMl);
      next = { ...next, bottleVolumeMl: Number.isFinite(volume) && volume > 0 ? volume : undefined };
    }
    onSave(next);
  }

  return (
    <ModalShell title="Stock Item Master" onClose={onClose}>
      <div className="grid md:grid-cols-2 gap-3">
        <Input label={t("Item name", "የእቃ ስም")} value={form.name} onChange={(value) => setForm({ ...form, name: value })} />
        <Select label={t("Category", "ምድብ")} value={form.category} onChange={(value) => setForm({ ...form, category: value as StockManagedItem["category"], beerTier: value === "Beer" ? (form.beerTier ?? inferBeerTier({ ...form, category: "Beer" })) : undefined })} options={STOCK_ITEM_CATEGORIES.map((row) => ({ value: row, label: row }))} />
        {form.category === "Beer" ? (
          <Select
            label={t("Beer tier", "የቢራ ደረጃ")}
            value={inferBeerTier(form) ?? "normal"}
            onChange={(value) => setForm({ ...form, beerTier: value as "special" | "normal" | "draft" })}
            options={[
              { value: "special", label: t("Special beer", "ልዩ ቢራ") },
              { value: "draft", label: t("Draft beer", "ድራፍት ቢራ") },
              { value: "normal", label: t("Normal beer", "መደበኛ ቢራ") },
            ]}
            disabled={isSpecialBeerItem(form) || isDraftBeerItem(form)}
          />
        ) : null}
        <Select label={t("Unit type", "የእቃ አይነት")} value={form.baseUnit} onChange={(value) => setForm({ ...form, baseUnit: value as StockUnitType })} options={STOCK_UNIT_TYPES.map((row) => ({ value: row, label: row }))} />
        <Select label={t("Default location", "ነባር ቦታ")} value={form.preferredLocation} onChange={(value) => setForm({ ...form, preferredLocation: value as StockLocation })} options={locationOptions.map((row) => ({ value: row, label: row }))} />
        <Input label={t("Purchase price", "የግዢ ዋጋ")} type="number" value={String(form.purchasePrice)} onChange={(value) => setForm({ ...form, purchasePrice: Number(value) })} />
        <Input label={t("Selling price", "የሽያጭ ዋጋ")} type="number" value={String(form.sellingPrice)} onChange={(value) => setForm({ ...form, sellingPrice: Number(value) })} />
        <Input label={t("VIP selling price", "VIP የሽያጭ ዋጋ")} type="number" value={String(form.vipSellingPrice ?? 0)} onChange={(value) => setForm({ ...form, vipSellingPrice: Number(value) })} />
        <Input label={t("Reorder level", "የመደገፊያ ደረጃ")} type="number" value={String(form.reorderLevel)} onChange={(value) => setForm({ ...form, reorderLevel: Number(value) })} />
        <Input label={t("Opening stock (read-only)", "መክፈቻ ክምችት (ለማንበብ ብቻ)")} type="number" value={String(form.currentStock)} onChange={() => undefined} />
        {(form.category === "Whisky" || isSpiritStock) && (
          <>
            <Input
              label={t("Doubles per bottle", "ድርብ በጠርሙስ")}
              type="number"
              value={doublesPerBottle}
              onChange={setDoublesPerBottle}
            />
            <Input
              label={t("Bottle volume (ml)", "የጠርሙስ መጠን (ml)")}
              type="number"
              value={bottleVolumeMl}
              onChange={setBottleVolumeMl}
            />
            <div className="md:col-span-2 text-xs text-muted-foreground">
              {t(
                `1 bottle = ${Math.max(1, Math.round(Number(doublesPerBottle) || DEFAULT_DOUBLES_PER_BOTTLE))} doubles / ${Math.max(1, Math.round(Number(doublesPerBottle) || DEFAULT_DOUBLES_PER_BOTTLE)) * 2} singles`,
                `1 ጠርሙስ = ${Math.max(1, Math.round(Number(doublesPerBottle) || DEFAULT_DOUBLES_PER_BOTTLE))} ድርብ / ${Math.max(1, Math.round(Number(doublesPerBottle) || DEFAULT_DOUBLES_PER_BOTTLE)) * 2} ነጠላ`,
              )}
            </div>
          </>
        )}
        <div className="md:col-span-2 text-xs text-muted-foreground">
          {t("Quantity changes only through approved inventory documents (GRV, issue, transfer, adjustment, POS).", "ብዛት የሚቀየረው በተፈቀዱ የክምችት ሰነዶች ብቻ ነው (GRV፣ መስጫ፣ ዝውውር፣ ማስተካከያ፣ POS)።")}
        </div>
        <Select
          label="Supplier"
          value={form.supplierName || ""}
          onChange={(value) => setForm({ ...form, supplierName: value })}
          options={store.suppliers.map((s) => ({ value: s.name, label: s.name }))}
        />
      </div>
      <TextArea label={t("Notes", "ማስታወሻ")} value={form.notes || ""} onChange={(value) => setForm({ ...form, notes: value })} />
      <div className="mt-4 flex items-center justify-between">
        <div className="text-sm font-medium">Conversion Rules</div>
        <button onClick={addConversion} className="h-8 px-3 rounded-lg bg-ember/10 text-ember text-xs font-medium">{t("Add rule", "ደንብ ጨምር")}</button>
      </div>
      <div className="space-y-2 mt-2">
        {form.conversions.map((row, index) => (
          <div key={row.id} className="grid grid-cols-[1fr_120px_120px_120px_32px] gap-2 items-center">
            <input value={row.label} onChange={(e) => setForm((prev) => ({ ...prev, conversions: prev.conversions.map((item, i) => i === index ? { ...item, label: e.target.value } : item) }))} className="h-9 px-3 rounded-lg border border-border bg-card text-sm" />
            <select value={row.fromUnit} onChange={(e) => setForm((prev) => ({ ...prev, conversions: prev.conversions.map((item, i) => i === index ? { ...item, fromUnit: e.target.value as StockUnitType } : item) }))} className="h-9 px-3 rounded-lg border border-border bg-card text-sm">{STOCK_UNIT_TYPES.map((unit) => <option key={unit}>{unit}</option>)}</select>
            <select value={row.toUnit} onChange={(e) => setForm((prev) => ({ ...prev, conversions: prev.conversions.map((item, i) => i === index ? { ...item, toUnit: e.target.value as StockUnitType } : item) }))} className="h-9 px-3 rounded-lg border border-border bg-card text-sm">{STOCK_UNIT_TYPES.map((unit) => <option key={unit}>{unit}</option>)}</select>
            <input type="number" value={row.multiplier} onChange={(e) => setForm((prev) => ({ ...prev, conversions: prev.conversions.map((item, i) => i === index ? { ...item, multiplier: Number(e.target.value) } : item) }))} className="h-9 px-3 rounded-lg border border-border bg-card text-sm" />
            <button onClick={() => setForm((prev) => ({ ...prev, conversions: prev.conversions.filter((_, i) => i !== index) }))} className="size-8 rounded-lg hover:bg-surface-2"><Icons.X className="size-4 mx-auto" /></button>
          </div>
        ))}
      </div>
      <div className="mt-5 flex justify-end gap-2">
        <button onClick={onClose} className="h-10 px-4 rounded-lg border border-border bg-card text-sm">{t("Cancel", "ሰርዝ")}</button>
        <button onClick={save} className="h-10 px-4 rounded-lg bg-ember text-ember-foreground text-sm font-semibold">{t("Save Item", "እቃ አስቀምጥ")}</button>
      </div>
    </ModalShell>
  );
}

function StockRecipeEditor({
  recipe,
  items,
  menuItems = [],
  onClose,
  onSave,
}: {
  recipe: StockRecipe;
  items: StockManagedItem[];
  menuItems?: import("@/lib/demo-data").MenuItem[];
  onClose: () => void;
  onSave: (recipe: StockRecipe) => void;
}) {
  const t = useT();
  const [form, setForm] = useState<StockRecipe>({ ...recipe, ingredients: recipe.ingredients.map((row) => ({ ...row })) });
  const [selectedMenuId, setSelectedMenuId] = useState(() => {
    const match = menuItems.find((item) => item.name_en.trim().toLowerCase() === recipe.menuItemName.trim().toLowerCase());
    return match?.id ?? "";
  });
  const [relatedStockItems, setRelatedStockItems] = useState<StockManagedItem[]>(() => {
    const match = menuItems.find((item) => item.name_en.trim().toLowerCase() === recipe.menuItemName.trim().toLowerCase());
    if (!match) return [];
    return suggestRecipeFromMenuItem({ menuItem: match, stockItems: items }).relatedStockItems;
  });

  const sortedMenuItems = useMemo(
    () =>
      [...menuItems]
        .filter((item) => {
          const station = (item.station ?? "").toLowerCase();
          const location = (item.stockDeductionLocation ?? "").toLowerCase();
          return station.includes("kitchen") || location === "kitchen";
        })
        .sort((a, b) => a.name_en.localeCompare(b.name_en)),
    [menuItems],
  );

  const [pickItemId, setPickItemId] = useState("");

  const availableStockItems = useMemo(
    () =>
      items
        .filter((item) => item.active !== false)
        .filter((item) => !form.ingredients.some((line) => line.itemId === item.id))
        .sort((a, b) => a.name.localeCompare(b.name)),
    [items, form.ingredients],
  );

  function applyMenuItem(menuId: string) {
    setSelectedMenuId(menuId);
    const menuItem = menuItems.find((item) => item.id === menuId);
    if (!menuItem) return;
    const replacingDish =
      !form.menuItemName.trim() ||
      form.menuItemName.trim().toLowerCase() !== menuItem.name_en.trim().toLowerCase() ||
      form.ingredients.length === 0;
    const suggestion = suggestRecipeFromMenuItem({
      menuItem,
      stockItems: items,
      keepExistingIngredients: replacingDish ? [] : form.ingredients,
    });
    setRelatedStockItems(suggestion.relatedStockItems);
    setPickItemId("");
    setForm((prev) => ({
      ...prev,
      menuItemName: suggestion.menuItemName,
      category: suggestion.category,
      preparationStation: suggestion.preparationStation,
      stockDeductionLocation: suggestion.stockDeductionLocation,
      outputQty: suggestion.outputQty,
      outputUnit: suggestion.outputUnit,
      ingredients: suggestion.ingredients,
    }));
  }

  function addIngredient(itemId?: string) {
    const chosenId = itemId || pickItemId || availableStockItems[0]?.id;
    if (!chosenId) return;
    const item = items.find((row) => row.id === chosenId);
    if (!item) return;
    setForm((prev) => {
      if (prev.ingredients.some((line) => line.itemId === item.id)) return prev;
      return {
        ...prev,
        ingredients: [
          ...prev.ingredients,
          recipeLineFromStockItem(item, 0, prev.stockDeductionLocation ?? "Kitchen"),
        ],
      };
    });
    setPickItemId("");
  }

  function addMultipleSuggested() {
    const toAdd = relatedStockItems.filter(
      (item) => !form.ingredients.some((line) => line.itemId === item.id),
    );
    if (toAdd.length === 0) return;
    setForm((prev) => ({
      ...prev,
      ingredients: [
        ...prev.ingredients,
        ...toAdd.map((item) =>
          recipeLineFromStockItem(item, 0, prev.stockDeductionLocation ?? "Kitchen"),
        ),
      ],
    }));
  }

  return (
    <ModalShell title={t("Recipe / BOM", "የእርስ እና ንጥረ ነገር")} onClose={onClose}>
      <div className="grid md:grid-cols-2 gap-3">
        <div>
          <label className="text-xs text-muted-foreground">{t("Menu item", "የምናሌ እቃ")}</label>
          <select
            value={selectedMenuId}
            onChange={(event) => applyMenuItem(event.target.value)}
            className="w-full mt-1 h-10 px-3 rounded-lg border border-border bg-card text-sm"
          >
            <option value="">{t("Select menu item…", "የምናሌ እቃ ይምረጡ…")}</option>
            {sortedMenuItems.map((item) => (
              <option key={item.id} value={item.id}>
                {item.name_en}
                {item.unitLabel ? ` · ${item.unitLabel}` : ""}
                {item.station ? ` · ${item.station}` : ""}
              </option>
            ))}
          </select>
        </div>
        <Input label={t("Recipe name", "የአዘገጃጀት ስም")} value={form.menuItemName} onChange={(value) => setForm({ ...form, menuItemName: value })} />
        <Input label={t("Category", "ምድብ")} value={form.category} onChange={(value) => setForm({ ...form, category: value })} />
        <Input label={t("Output qty", "የውጤት ብዛት")} type="number" value={String(form.outputQty)} onChange={(value) => setForm({ ...form, outputQty: Number(value) })} />
        <Input label={t("Output unit", "የውጤት አሃድ")} value={form.outputUnit} onChange={(value) => setForm({ ...form, outputUnit: value })} />
        <Input label={t("Prep station", "የዝግጅት ጣቢያ")} value={form.preparationStation || "Kitchen"} onChange={(value) => setForm({ ...form, preparationStation: value })} />
        <Select
          label={t("Stock location", "የክምችት ቦታ")}
          value={form.stockDeductionLocation || "Kitchen"}
          onChange={(value) => setForm({ ...form, stockDeductionLocation: value as StockRecipe["stockDeductionLocation"] })}
          options={[
            { value: "Kitchen", label: "Kitchen" },
            { value: "Butcher", label: "Butcher" },
            { value: "Coffee House", label: "Coffee House" },
            { value: "Main Bar", label: "Main Bar" },
            { value: "VIP Bar", label: "VIP Bar" },
          ]}
        />
        <Input
          label={t("Wastage %", "ብክነት %")}
          type="number"
          value={String(form.wastageAllowance ?? 0)}
          onChange={(value) => setForm({ ...form, wastageAllowance: Number(value) })}
        />
      </div>
      <TextArea label={t("Notes", "ማስታወሻ")} value={form.notes || ""} onChange={(value) => setForm({ ...form, notes: value })} />

      {relatedStockItems.length > 0 ? (
        <div className="mt-4">
          <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
            <div className="text-sm font-medium">{t("Suggested ingredients", "የተጠቆሙ ንጥረ ነገሮች")}</div>
            <button
              type="button"
              onClick={addMultipleSuggested}
              className="h-8 px-3 rounded-lg border border-border text-xs hover:bg-surface-2"
            >
              {t("Add all suggested", "ሁሉንም ጨምር")}
            </button>
          </div>
          <div className="flex flex-wrap gap-2">
            {relatedStockItems.map((item) => {
              const added = form.ingredients.some((line) => line.itemId === item.id);
              return (
                <button
                  key={item.id}
                  type="button"
                  disabled={added}
                  onClick={() => addIngredient(item.id)}
                  className={`h-8 px-3 rounded-lg border text-xs ${added ? "opacity-40 cursor-not-allowed border-border" : "border-border bg-card hover:bg-surface-2"}`}
                >
                  {item.name} <span className="text-muted-foreground">({item.baseUnit})</span>
                </button>
              );
            })}
          </div>
        </div>
      ) : null}

      <div className="mt-4 flex flex-wrap items-center justify-between gap-2">
        <div className="text-sm font-medium">
          {t("Ingredients", "ንጥረ ነገሮች")}
          <span className="ml-2 text-xs text-muted-foreground font-normal">
            ({form.ingredients.length})
          </span>
        </div>
      </div>

      <div className="mt-2 flex flex-wrap gap-2 items-center">
        <select
          value={pickItemId}
          onChange={(event) => setPickItemId(event.target.value)}
          className="h-9 min-w-[14rem] flex-1 px-3 rounded-lg border border-border bg-card text-sm"
        >
          <option value="">{t("Choose stock item…", "የክምችት እቃ ይምረጡ…")}</option>
          {availableStockItems.map((item) => (
            <option key={item.id} value={item.id}>
              {item.name} ({item.baseUnit})
            </option>
          ))}
        </select>
        <button
          type="button"
          onClick={() => addIngredient(pickItemId || undefined)}
          disabled={availableStockItems.length === 0}
          className="h-9 px-4 rounded-lg bg-ember text-ember-foreground text-sm font-semibold disabled:opacity-40"
        >
          {t("Add ingredient", "እቃ አክል")}
        </button>
      </div>

      <div className="space-y-2 mt-3">
        {form.ingredients.map((line, index) => {
          const stock = items.find((item) => item.id === line.itemId);
          const unit = stock?.baseUnit ?? line.unit;
          return (
            <div key={line.id} className="grid grid-cols-[1fr_110px_90px_32px] gap-2 items-center">
              <select
                value={line.itemId}
                onChange={(e) => {
                  const selected = items.find((item) => item.id === e.target.value);
                  if (!selected) return;
                  setForm((prev) => {
                    const duplicate = prev.ingredients.some(
                      (row, i) => i !== index && row.itemId === selected.id,
                    );
                    if (duplicate) return prev;
                    return {
                      ...prev,
                      ingredients: prev.ingredients.map((row, i) =>
                        i === index
                          ? {
                              ...row,
                              itemId: selected.id,
                              itemName: selected.name,
                              unit: selected.baseUnit,
                              stockDeductionLocation:
                                row.stockDeductionLocation ?? prev.stockDeductionLocation ?? "Kitchen",
                            }
                          : row,
                      ),
                    };
                  });
                }}
                className="h-9 px-3 rounded-lg border border-border bg-card text-sm"
              >
                {items
                  .filter(
                    (item) =>
                      item.id === line.itemId ||
                      !form.ingredients.some((row) => row.itemId === item.id),
                  )
                  .map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.name} ({item.baseUnit})
                    </option>
                  ))}
              </select>
              <input
                type="number"
                min="0"
                step="0.001"
                value={line.quantity}
                onChange={(e) =>
                  setForm((prev) => ({
                    ...prev,
                    ingredients: prev.ingredients.map((row, i) =>
                      i === index ? { ...row, quantity: Number(e.target.value) } : row,
                    ),
                  }))
                }
                className="h-9 px-3 rounded-lg border border-border bg-card text-sm font-mono"
              />
              <div className="h-9 px-3 rounded-lg border border-border bg-surface-2/50 text-sm flex items-center font-mono text-muted-foreground">
                {unit}
              </div>
              <button
                type="button"
                onClick={() =>
                  setForm((prev) => ({
                    ...prev,
                    ingredients: prev.ingredients.filter((_, i) => i !== index),
                  }))
                }
                className="size-8 rounded-lg hover:bg-surface-2"
              >
                <Icons.X className="size-4 mx-auto" />
              </button>
            </div>
          );
        })}
        {form.ingredients.length === 0 ? (
          <div className="text-sm text-muted-foreground py-4 text-center">
            {t("Select a menu item to suggest ingredients, or add multiple stock items below.", "ንጥረ ነገር ለመጠቆም የምናሌ እቃ ይምረጡ፣ ወይም ከታች ብዙ እቃዎችን ያክሉ።")}
          </div>
        ) : null}
      </div>
      <div className="mt-5 flex justify-end gap-2">
        <button onClick={onClose} className="h-10 px-4 rounded-lg border border-border bg-card text-sm">{t("Cancel", "ሰርዝ")}</button>
        <button
          onClick={() =>
            onSave({
              ...form,
              updatedAt: new Date().toISOString(),
              ingredients: form.ingredients.map((line) => {
                const stock = items.find((item) => item.id === line.itemId);
                return {
                  ...line,
                  itemName: stock?.name || line.itemName,
                  unit: stock?.baseUnit || line.unit,
                };
              }) as StockRecipeLine[],
            })
          }
          className="h-10 px-4 rounded-lg bg-ember text-ember-foreground text-sm font-semibold"
        >
          {t("Save Recipe", "የምግብ አዘገጅ አስቀምጥ")}
        </button>
      </div>
    </ModalShell>
  );
}

function ModalShell({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <div className="fixed inset-0 z-50 bg-foreground/40 backdrop-blur-sm grid place-items-center p-4">
      <div className="surface-card max-w-4xl w-full !p-6 max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between mb-5">
          <h3 className="font-display text-xl font-semibold">{title}</h3>
          <button onClick={onClose} className="size-8 grid place-items-center rounded-lg hover:bg-surface-2"><Icons.X className="size-4" /></button>
        </div>
        {children}
      </div>
    </div>
  );
}

function Input({ label, value, onChange, type = "text", disabled = false }: { label: string; value: string; onChange: (value: string) => void; type?: string; disabled?: boolean }) {
  return (
    <div>
      <label className="text-xs text-muted-foreground">{label}</label>
      <input type={type} value={value} disabled={disabled} onChange={(e) => onChange(e.target.value)} className="w-full mt-1 h-10 px-3 rounded-lg border border-border bg-card text-sm focus:outline-none focus:ring-2 focus:ring-ring/40 disabled:opacity-60" />
    </div>
  );
}

function Select({ label, value, onChange, options, disabled }: { label: string; value: string; onChange: (value: string) => void; options: Array<{ value: string; label: string }>; disabled?: boolean }) {
  return (
    <div>
      <label className="text-xs text-muted-foreground">{label}</label>
      <select value={value} disabled={disabled} onChange={(e) => onChange(e.target.value)} className="w-full mt-1 h-10 px-3 rounded-lg border border-border bg-card text-sm focus:outline-none disabled:opacity-60 disabled:cursor-not-allowed">
        {options.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
      </select>
    </div>
  );
}

function TextArea({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
  return (
    <div className="mt-3">
      <label className="text-xs text-muted-foreground">{label}</label>
      <textarea value={value} onChange={(e) => onChange(e.target.value)} rows={3} className="w-full mt-1 px-3 py-2 rounded-lg border border-border bg-card text-sm focus:outline-none focus:ring-2 focus:ring-ring/40" />
    </div>
  );
}
