import { useMemo } from "react";
import type { SalesRecord } from "@/lib/demo-data";
import type { InventoryAccessContext, InventoryWorkspace } from "@/lib/inventory-access";
import {
  filterCentralStoreBalances,
  scopeBalances,
  scopeByLocationField,
  scopeByTransferEndpoints,
  scopeLedger,
  resolveAuthorizedLocations,
} from "@/lib/inventory-access";
import {
  buildStockDashboardSummary,
  collectVoucherTransferMovements,
  isOperationalStockLocation,
  useStockManagementModule,
  type CentralStockLocation,
  type GoodsReceivingVoucherDocument,
  type OperationalStockLocation,
  type PurchaseOrderDocument,
  type PurchaseRequisitionDocument,
  type StockClosingRecord,
  type StockCountSession,
  type StockLedgerEntry,
  type StockLocation,
  type StockLot,
  type StockRequestRecord,
  type StockTransferRecord,
  type StoreIssueVoucherDocument,
  type StoreTransferVoucherDocument,
} from "@/lib/stock-management";
import { computeDashboardTodaySalesRevenue } from "@/lib/sales-analytics";
import { filterRequestsForIssueVoucher } from "@/lib/store-issue-voucher-utils";

export function useScopedStockModule(
  access: InventoryAccessContext,
  workspace: InventoryWorkspace,
  salesRecords: SalesRecord[] = [],
) {
  const module = useStockManagementModule();

  const balances = useMemo(
    () => scopeBalances(access, module.balances, workspace),
    [access, module.balances, workspace],
  );

  const warehouseBalances = useMemo(
    () => filterCentralStoreBalances(module.balances),
    [module.balances],
  );

  const fullLedger = module.ledger;

  const ledger = useMemo(
    () => scopeLedger(access, module.ledger, workspace),
    [access, module.ledger, workspace],
  );

  const requests = useMemo(
    () =>
      scopeByTransferEndpoints(
        access,
        module.requests,
        (row) => row.requestedSourceStore as CentralStockLocation,
        (row) => row.requestingDepartment as OperationalStockLocation,
        workspace,
      ),
    [access, module.requests, workspace],
  );

  const issueVoucherRequests = useMemo(
    () =>
      filterRequestsForIssueVoucher(
        resolveAuthorizedLocations(access),
        module.requests,
        workspace,
      ),
    [access, module.requests, workspace],
  );

  const storeIssueVouchers = useMemo(
    () =>
      scopeByTransferEndpoints(
        access,
        module.storeIssueVouchers,
        (row) => row.sourceStore,
        (row) => row.destinationDepartment,
        workspace,
      ),
    [access, module.storeIssueVouchers, workspace],
  );

  const storeTransferVouchers = useMemo(
    () =>
      scopeByTransferEndpoints(
        access,
        module.storeTransferVouchers,
        (row) => row.sourceLocation,
        (row) => row.destinationLocation,
        workspace,
      ),
    [access, module.storeTransferVouchers, workspace],
  );

  const purchaseRequisitions = useMemo(
    () =>
      scopeByLocationField(
        access,
        module.purchaseRequisitions,
        (row) => row.requestingStore as StockLocation,
        workspace,
      ),
    [access, module.purchaseRequisitions, workspace],
  );

  const purchaseOrders = useMemo(
    () =>
      scopeByLocationField(
        access,
        module.purchaseOrders,
        (row) => row.destinationStore as StockLocation,
        workspace,
      ),
    [access, module.purchaseOrders, workspace],
  );

  const goodsReceivingVouchers = useMemo(
    () =>
      scopeByLocationField(
        access,
        module.goodsReceivingVouchers,
        (row) => row.destinationStore as StockLocation,
        workspace,
      ),
    [access, module.goodsReceivingVouchers, workspace],
  );

  const closings = useMemo(
    () => scopeByLocationField(access, module.closings, (row) => row.location, workspace),
    [access, module.closings, workspace],
  );

  const counts = useMemo(
    () => scopeByLocationField(access, module.counts, (row) => row.location, workspace),
    [access, module.counts, workspace],
  );

  const transfers = useMemo(
    () =>
      scopeByTransferEndpoints(
        access,
        module.transfers,
        (row) => row.sourceLocation,
        (row) => row.destinationLocation,
        workspace,
      ),
    [access, module.transfers, workspace],
  );

  const lots = useMemo(
    () => scopeByLocationField(access, module.lots, (row) => row.location, workspace),
    [access, module.lots, workspace],
  );

  const goodsReturnVouchers = useMemo(
    () =>
      scopeByTransferEndpoints(
        access,
        module.goodsReturnVouchers,
        (row) => row.sourceLocation,
        (row) => row.destinationLocation,
        workspace,
      ),
    [access, module.goodsReturnVouchers, workspace],
  );

  const stockAdjustmentVouchers = useMemo(
    () =>
      module.stockAdjustmentVouchers.filter((row) => {
        const lineLocations = row.lines.map((line) => line.location);
        const authorized = resolveAuthorizedLocations(access);
        const locations = workspace === "all" ? "all" : [workspace];
        const matchesAuth =
          authorized === "all" || lineLocations.some((loc) => authorized.includes(loc));
        const matchesWorkspace =
          locations === "all" || lineLocations.some((loc) => locations.includes(loc));
        return matchesAuth && matchesWorkspace;
      }),
    [access, module.stockAdjustmentVouchers, workspace],
  );

  const cancellationReversals = useMemo(
    () =>
      module.cancellationReversals.filter((row) => {
        const entryLocations = row.ledgerEntries
          .flatMap((entry) => [entry.location, entry.fromLocation, entry.toLocation])
          .filter(Boolean) as StockLocation[];
        const authorized = resolveAuthorizedLocations(access);
        const locations = workspace === "all" ? "all" : [workspace];
        const matchesAuth =
          authorized === "all" || entryLocations.some((loc) => authorized.includes(loc)) || entryLocations.length === 0;
        const matchesWorkspace =
          locations === "all" || entryLocations.some((loc) => locations.includes(loc)) || entryLocations.length === 0;
        return matchesAuth && matchesWorkspace;
      }),
    [access, module.cancellationReversals, workspace],
  );

  const voucherMovements = useMemo(
    () =>
      collectVoucherTransferMovements(
        module.storeIssueVouchers,
        module.storeTransferVouchers,
        module.transfers,
      ),
    [module.storeIssueVouchers, module.storeTransferVouchers, module.transfers],
  );

  const scopedVoucherMovements = useMemo(
    () =>
      scopeByTransferEndpoints(
        access,
        voucherMovements,
        (row) => row.sourceLocation,
        (row) => row.destinationLocation,
        workspace,
      ),
    [access, voucherMovements, workspace],
  );

  const todaySalesRevenue = useMemo(
    () =>
      computeDashboardTodaySalesRevenue(salesRecords, module.closings, workspace, {
        assignedLocations: access.assignedLocations,
      }),
    [salesRecords, module.closings, workspace, access.assignedLocations],
  );

  const dailyConsumptions = useMemo(
    () =>
      scopeByLocationField(
        access,
        module.dailyConsumptions,
        (row) => row.department as StockLocation,
        workspace,
      ),
    [access, module.dailyConsumptions, workspace],
  );

  const operationalAssignedLocations = useMemo(() => {
    const authorized = resolveAuthorizedLocations(access);
    if (authorized === "all") return [] as OperationalStockLocation[];
    return authorized.filter((location): location is OperationalStockLocation => isOperationalStockLocation(location));
  }, [access]);

  const dashboard = useMemo(
    () =>
      buildStockDashboardSummary(
        module.items,
        ledger,
        requests,
        scopedVoucherMovements,
        counts,
        module.locationPolicies,
        module.settings,
        lots,
        workspace,
        module.posReservations,
        closings,
        todaySalesRevenue,
        module.staffConsumptions,
        operationalAssignedLocations,
      ),
    [
      module.items,
      ledger,
      requests,
      scopedVoucherMovements,
      counts,
      module.locationPolicies,
      module.settings,
      lots,
      workspace,
      module.posReservations,
      closings,
      todaySalesRevenue,
      module.staffConsumptions,
      operationalAssignedLocations,
    ],
  );

  return {
    ...module,
    balances,
    warehouseBalances,
    fullLedger,
    allLots: module.lots,
    ledger,
    requests,
    issueVoucherRequests,
    allRequests: module.requests,
    storeIssueVouchers,
    allStoreIssueVouchers: module.storeIssueVouchers,
    storeTransferVouchers,
    purchaseRequisitions,
    purchaseOrders,
    goodsReceivingVouchers,
    closings,
    counts,
    transfers,
    lots,
    goodsReturnVouchers,
    stockAdjustmentVouchers,
    cancellationReversals,
    dailyConsumptions,
    dashboard,
  };
}

export type ScopedStockModule = ReturnType<typeof useScopedStockModule>;
