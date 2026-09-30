import { createFileRoute } from "@tanstack/react-router";
import { useMemo } from "react";
import { ReportShell } from "@/components/reports/report-shell";
import { useStore } from "@/lib/store";
import { useStockManagementModule } from "@/lib/stock-management";

export const Route = createFileRoute("/app/reports")({ component: ReportsRoute });

function ReportsRoute() {
  const store = useStore();
  const stock = useStockManagementModule();

  const documentsForApproval = useMemo(
    () =>
      [
        ...stock.purchaseOrders,
        ...stock.purchaseRequisitions,
        ...stock.goodsReceivingVouchers,
        ...stock.storeIssueVouchers,
        ...stock.storeTransferVouchers,
        ...stock.stockAdjustmentVouchers,
        ...stock.counts.map((count) => ({
          id: count.id,
          documentType: "Physical Count",
          documentNumber: count.countSessionNumber,
          approvalHistory: count.approvalHistory,
        })),
      ].map((doc) => ({
        documentType: "documentType" in doc ? String(doc.documentType) : "Inventory",
        documentNumber:
          "documentNumber" in doc
            ? doc.documentNumber
            : "countSessionNumber" in doc
              ? doc.countSessionNumber
              : doc.id,
        approvalHistory: doc.approvalHistory ?? [],
      })),
    [
      stock.counts,
      stock.goodsReceivingVouchers,
      stock.purchaseOrders,
      stock.purchaseRequisitions,
      stock.stockAdjustmentVouchers,
      stock.storeIssueVouchers,
      stock.storeTransferVouchers,
    ],
  );

  return (
    <ReportShell
      realtimeStatus={store.realtimeStatus}
      queryInput={{
        salesRecords: store.salesRecords,
        expenseRecords: store.expenseRecords,
        payments: store.payments,
        orders: store.orders,
        stockItems: stock.items,
        ledger: stock.ledger,
        lots: stock.lots,
        counts: stock.counts,
        purchaseOrders: stock.purchaseOrders,
        goodsReceiving: stock.goodsReceivingVouchers,
        requests: stock.requests,
        transfers: stock.transfers,
        locationPolicies: stock.locationPolicies,
        inventorySettings: stock.settings,
        posReservations: stock.posReservations,
        posShiftSessions: stock.posShiftSessions,
        documentsForApproval,
      }}
    />
  );
}
