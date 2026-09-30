import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState, type ReactNode } from "react";
import * as Icons from "lucide-react";
import { PageHeader, Card, Chip, Stat } from "@/components/ui-kit";
import { RealtimeBadge } from "@/components/realtime-badge";
import type { Supplier } from "@/lib/demo-data";
import { useAuth } from "@/lib/auth-context";
import { formatETB } from "@/lib/ethiopic";
import {
  buildInventoryAccessContext,
  buildInventoryActorContext,
  isManagerInventoryRole,
  resolveEffectiveWorkspace,
  stockLocationLabel,
} from "@/lib/inventory-access";
import { dateKey } from "@/lib/sales-analytics";
import {
  appendImmutableLedgerEntries,
  approvePurchaseOrderAsActor,
  approvePurchaseRequisitionAsActor,
  CENTRAL_STOCK_LOCATIONS,
  confirmGoodsReceivingVoucherAsActor,
  convertPurchaseRequisitionToPurchaseOrderAsActor,
  type CentralStockLocation,
  type GoodsReceivingVoucherDocument,
  type PurchaseOrderDocument,
  type PurchaseRequisitionDocument,
  useStockManagementModule,
} from "@/lib/stock-management";
import {
  applyPurchaseOrderPricing,
  buildGoodsReceivingVoucherDraft,
  buildProcurementQueueRows,
  buildPurchaseRequisitionFromSupplierRequest,
  buildSupplierPayableExpense,
  canCreateSupplierPurchaseRequest,
  canManageSuppliers,
  canPaySupplier,
  supplierHasProcurementRecords,
  type ProcurementQueueRow,
} from "@/lib/supplier-procurement";
import { useStore } from "@/lib/store";
import { useT } from "@/lib/i18n";
import { showError, showSuccess } from "@/lib/toast";

export const Route = createFileRoute("/app/suppliers")({ component: Suppliers });

type StoreFilter = "all" | CentralStockLocation;
type SupplierTab = "suppliers" | "procurement";

function cleanNumber(value: number) {
  return Number.isFinite(value) ? Math.max(0, value) : 0;
}

function todayLabel() {
  return new Date().toLocaleDateString("en-GB");
}

type ProcurementStockItem = {
  sku: string;
  name: string;
  unit: string;
  onHand: number;
  value: number;
  supplier?: string;
};

function stockItemFromManagedItem(item: {
  id: string;
  name: string;
  baseUnit: string;
  currentStock: number;
  purchasePrice: number;
  supplierName?: string;
}): ProcurementStockItem {
  return {
    sku: item.id,
    name: item.name,
    unit: item.baseUnit,
    onHand: item.currentStock,
    value: Math.round(item.currentStock * item.purchasePrice * 100) / 100,
    supplier: item.supplierName,
  };
}

function resolveRecordStore(store?: string | null): CentralStockLocation {
  return store === "Store 2" ? "Store 2" : "Store 1";
}

function supplierIdFromName(name: string, store: CentralStockLocation) {
  const slug =
    name
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "") || String(Date.now());
  return `sup-${store === "Store 2" ? "s2" : "s1"}-${slug}`;
}

function normalizeSupplier(supplier: Supplier): Supplier {
  const name = supplier.name.trim();
  const store = resolveRecordStore(supplier.store);
  return {
    id: supplier.id || supplierIdFromName(name, store),
    name,
    contact: supplier.contact.trim(),
    category: supplier.category.trim() || "Other",
    outstanding: cleanNumber(supplier.outstanding),
    status: supplier.status.trim() || "Active",
    store,
  };
}

function upsertSupplier(suppliers: Supplier[], supplier: Supplier) {
  const next = normalizeSupplier(supplier);
  const existingIndex = suppliers.findIndex(
    (item) =>
      item.id === next.id
      || (item.name.toLowerCase() === next.name.toLowerCase()
        && resolveRecordStore(item.store) === resolveRecordStore(next.store)),
  );
  if (existingIndex === -1) return [next, ...suppliers];
  return suppliers.map((item, index) => (index === existingIndex ? { ...next, id: item.id } : item));
}

function matchesStoreFilter(recordStore: string | undefined, filter: StoreFilter) {
  if (filter === "all") return true;
  return resolveRecordStore(recordStore) === filter;
}

function Suppliers() {
  const { user } = useAuth();
  const store = useStore();
  const stockModule = useStockManagementModule();
  const t = useT();
  const access = useMemo(() => (user ? buildInventoryAccessContext(user) : null), [user]);
  const actorContext = useMemo(
    () => (access ? buildInventoryActorContext(access) : { userName: "System", role: "Unknown" }),
    [access],
  );
  const canViewAllStores = Boolean(user && isManagerInventoryRole(user.role));
  const defaultStore = useMemo<CentralStockLocation>(() => {
    const workspace = access ? resolveEffectiveWorkspace(access) : "Store 1";
    if (workspace === "Store 1" || workspace === "Store 2") return workspace;
    return "Store 1";
  }, [access]);
  const [storeFilter, setStoreFilter] = useState<StoreFilter>(canViewAllStores ? "all" : defaultStore);
  const effectiveStoreFilter: StoreFilter = canViewAllStores ? storeFilter : defaultStore;
  const activeStore: CentralStockLocation = effectiveStoreFilter === "all" ? defaultStore : effectiveStoreFilter;

  const suppliers = useMemo(
    () => store.suppliers.filter((s) => matchesStoreFilter(s.store, effectiveStoreFilter)),
    [store.suppliers, effectiveStoreFilter],
  );
  const stockItems = useMemo<ProcurementStockItem[]>(
    () => stockModule.items.map((item) => stockItemFromManagedItem(item)),
    [stockModule.items],
  );
  const procurementRows = useMemo(
    () =>
      buildProcurementQueueRows({
        requisitions: stockModule.purchaseRequisitions,
        purchaseOrders: stockModule.purchaseOrders,
        storeFilter: effectiveStoreFilter,
        actor: actorContext,
      }),
    [stockModule.purchaseRequisitions, stockModule.purchaseOrders, effectiveStoreFilter, actorContext],
  );
  const canCreatePurchaseRequest = stockModule.items.length > 0 && Boolean(user && canCreateSupplierPurchaseRequest(user.role));
  const canPay = Boolean(user && canPaySupplier(user.role));
  const canManageSupplierRecords = Boolean(user && canManageSuppliers(user.role));

  const [tab, setTab] = useState<SupplierTab>("suppliers");
  const [showRequest, setShowRequest] = useState<Supplier | null>(null);
  const [showAddSupplier, setShowAddSupplier] = useState(false);
  const [createPoFor, setCreatePoFor] = useState<PurchaseRequisitionDocument | null>(null);
  const [receiveFor, setReceiveFor] = useState<PurchaseOrderDocument | null>(null);

  const orderedSuppliers = useMemo(
    () => [...suppliers].sort((a, b) => a.name.localeCompare(b.name)),
    [suppliers],
  );
  const payable = suppliers.reduce((sum, row) => sum + row.outstanding, 0);
  const openProcurement = procurementRows.filter((row) => row.nextAction !== "none").length;
  const pendingApproval = procurementRows.filter((row) => row.nextAction === "approve_requisition" || row.nextAction === "approve_po").length;
  const activeSupplier = orderedSuppliers.find((supplier) => supplier.status === "Active") ?? null;

  function submitPurchaseRequest(input: {
    supplier: Supplier;
    sku: string;
    qty: number;
    unitCost: number;
    store: CentralStockLocation;
  }) {
    try {
      const item = stockModule.items.find((row) => row.id === input.sku);
      if (!item) throw new Error(t("Selected stock item was not found.", "የተመረጠው የክምችት እቃ አልተገኘም።"));
      const currentQty =
        stockModule.balances.find((row) => row.itemId === item.id && row.location === input.store)?.quantity ?? 0;
      const requisition = buildPurchaseRequisitionFromSupplierRequest({
        item,
        requestingStore: input.store,
        requestedQuantity: input.qty,
        requestedBy: user?.name ?? "System",
        requiredDate: dateKey(),
        currentStockAtStore: currentQty,
        reason: `Supplier request: ${input.supplier.name}`,
        notes: `Unit cost quote ${input.unitCost} ETB`,
        existingRequisitionNumbers: stockModule.purchaseRequisitions.map((row) => row.requisitionNumber),
      });
      stockModule.savePurchaseRequisition(requisition);
      setTab("procurement");
      showSuccess(
        t(
          "Purchase requisition submitted. A different authorized user must approve before PO creation.",
          "የግዢ ጥያቄ ተልኳል። PO ከመፍጠር በፊት ሌላ የተፈቀደ ተጠቃሚ ማፅደቅ አለበት።",
        ),
      );
    } catch (err) {
      showError(err instanceof Error ? err.message : t("Could not submit purchase requisition.", "የግዢ ጥያቄ ሊቀርብ አልቻለም።"));
    }
  }

  function approveRequisition(requisition: PurchaseRequisitionDocument) {
    try {
      const approved = approvePurchaseRequisitionAsActor(
        requisition,
        actorContext,
        requisition.lines.map((line) => ({ lineId: line.id, approvedQuantity: line.requestedQuantity })),
      );
      stockModule.savePurchaseRequisition(approved);
      showSuccess(t("Purchase requisition approved.", "የግዢ ጥያቄ ተፈቅዷል።"));
    } catch (err) {
      showError(err instanceof Error ? err.message : t("Could not approve requisition.", "ጥያቄው ሊፈቀድ አልቻለም።"));
    }
  }

  function createPurchaseOrder(requisition: PurchaseRequisitionDocument, supplierName: string, unitCost: number) {
    try {
      const po = convertPurchaseRequisitionToPurchaseOrderAsActor(requisition, supplierName, actorContext);
      const priced = applyPurchaseOrderPricing(po, Object.fromEntries(po.lines.map((line) => [line.itemId, unitCost])));
      stockModule.savePurchaseOrder(priced);
      stockModule.savePurchaseRequisition({
        ...requisition,
        status: "Converted to Purchase Order",
        approvalHistory: [
          {
            id: `hist-${Date.now()}`,
            action: "Converted",
            actedBy: user?.name ?? "System",
            actedAt: new Date().toISOString(),
            notes: priced.purchaseOrderNumber,
          },
          ...requisition.approvalHistory,
        ],
      });
      showSuccess(
        t(
          "Purchase order created. A different authorized user must approve it before GRV.",
          "የግዢ ትዕዛዝ ተፈጥሯል። ከGRV በፊት ሌላ ተጠቃሚ ማፅደቅ አለበት።",
        ),
      );
    } catch (err) {
      showError(err instanceof Error ? err.message : t("Could not create purchase order.", "የግዢ ትዕዛዝ ሊፈጠር አልቻለም።"));
    }
  }

  function approvePurchaseOrder(order: PurchaseOrderDocument) {
    try {
      const approved = approvePurchaseOrderAsActor(order, actorContext);
      stockModule.savePurchaseOrder(approved);
      showSuccess(t("Purchase order approved. Store can now confirm GRV.", "የግዢ ትዕዛዝ ተፈቅዷል። ስቶር አሁን GRV መረጋገጥ ይችላል።"));
    } catch (err) {
      showError(err instanceof Error ? err.message : t("Could not approve purchase order.", "የግዢ ትዕዛዝ ሊፈቀድ አልቻለም።"));
    }
  }

  function confirmGrv(order: PurchaseOrderDocument, input: {
    itemId: string;
    receivedQuantity: number;
    rejectedQuantity: number;
    freeQuantity: number;
    unitCost: number;
    batchNumber?: string;
    expiryDate?: string;
  }) {
    try {
      const voucher = buildGoodsReceivingVoucherDraft({
        purchaseOrder: order,
        itemId: input.itemId,
        receivedQuantity: input.receivedQuantity,
        rejectedQuantity: input.rejectedQuantity,
        freeQuantity: input.freeQuantity,
        unitCost: input.unitCost,
        receivingDate: dateKey(),
        receivedBy: user?.name ?? "System",
        createdBy: user?.name ?? "System",
        batchNumber: input.batchNumber,
        expiryDate: input.expiryDate,
        existingGrvNumbers: stockModule.goodsReceivingVouchers.map((row) => row.grvNumber),
      });
      const result = confirmGoodsReceivingVoucherAsActor(
        voucher,
        stockModule.items,
        stockModule.ledger,
        stockModule.purchaseOrders,
        actorContext,
        { settings: stockModule.settings, lots: stockModule.lots },
      );
      stockModule.setItems(result.items);
      stockModule.setLedger((prev) => appendImmutableLedgerEntries(prev, result.ledgerEntries));
      stockModule.setPurchaseOrders(result.purchaseOrders);
      stockModule.saveLots(result.lots);
      stockModule.saveGoodsReceivingVoucher(result.voucher);
      const expense = buildSupplierPayableExpense({ grv: result.voucher, supplierName: order.supplier });
      store.setExpenseRecords((prev) =>
        prev.some((row) => row.id === expense.id) ? prev : [expense, ...prev],
      );
      const supplier = suppliers.find((row) => row.name === order.supplier);
      if (supplier) {
        store.updateSupplier({
          ...supplier,
          outstanding: Math.round((supplier.outstanding + expense.amount) * 100) / 100,
        });
      }
      showSuccess(t("Goods receiving voucher confirmed and supplier payable recorded.", "የዕቃ መቀበያ ቫውቸር ተረጋግጧል እና የአቅራቢ መክፈያ ተመዝግቧል።"));
    } catch (err) {
      showError(err instanceof Error ? err.message : t("Could not confirm GRV.", "GRV ሊረጋገጥ አልቻለም።"));
    }
  }

  function paySupplier(id: string) {
    if (!canPay) {
      showError(t("Only manager or finance roles can clear supplier payables.", "የአቅራቢ መክፈያ ለማጽዳት የማኔጅመንት ወይም የፋይናንስ ሚናዎች ብቻ ነው።"));
      return;
    }
    const supplier = suppliers.find((row) => row.id === id);
    if (supplier) store.updateSupplier({ ...supplier, outstanding: 0 });
  }

  function deleteSupplier(id: string) {
    const supplier = suppliers.find((row) => row.id === id);
    if (!supplier) return;
    const hasRecords = supplierHasProcurementRecords({
      supplierName: supplier.name,
      legacyPurchaseOrders: store.purchaseOrders,
      purchaseOrders: stockModule.purchaseOrders,
    });
    if (hasRecords) {
      showError(
        t(
          "This supplier has purchase orders and cannot be deleted yet.",
          "ይህ አቅራቢ የግዢ ትዕዛዞች አሉት፣ አሁን መሰረዝ አይቻልም።",
        ),
      );
      return;
    }
    if (!window.confirm(t(`Delete supplier "${supplier.name}"?`, `አቅራቢ "${supplier.name}" ይሰረዝ?`))) return;
    store.removeSupplier(id);
  }


  return (
    <div>
      <PageHeader
        title={t("Suppliers & Procurement", "አቅራቢዎች እና ግዢ")}
        action={
          <div className="flex items-center gap-2 flex-wrap">
            <RealtimeBadge status={store.realtimeStatus} lastSyncAt={store.lastRealtimeSyncAt} />
            {canViewAllStores ? (
              <select
                value={storeFilter}
                onChange={(e) => setStoreFilter(e.target.value as StoreFilter)}
                className="h-10 px-3 rounded-lg border border-border bg-card text-sm"
              >
                <option value="all">{t("All stores", "ሁሉም ስቶሮች")}</option>
                {CENTRAL_STOCK_LOCATIONS.map((location) => (
                  <option key={location} value={location}>{stockLocationLabel(location)}</option>
                ))}
              </select>
            ) : (
              <Chip>{stockLocationLabel(defaultStore)}</Chip>
            )}
            <button
              onClick={() => setShowAddSupplier(true)}
              className="h-10 px-4 rounded-lg border border-border bg-card text-sm font-medium inline-flex items-center gap-2 hover:bg-surface-2"
            >
              <Icons.UserPlus className="size-4" /> {t("Add supplier", "አቅራቢ ያክሉ")}
            </button>
            <button
              disabled={!activeSupplier || !canCreatePurchaseRequest}
              onClick={() => activeSupplier && setShowRequest(activeSupplier)}
              className="h-10 px-4 rounded-lg bg-ember text-ember-foreground text-sm font-medium inline-flex items-center gap-2 disabled:opacity-40 disabled:cursor-not-allowed"
            >
              <Icons.Plus className="size-4" /> {t("New purchase request", "አዲስ የግዢ ጥያቄ")}
            </button>
          </div>
        }
      />

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <Stat label={t("Active suppliers", "ንቁ አቅራቢዎች")} value={`${suppliers.filter((row) => row.status === "Active").length}`} icon="Users" />
        <Stat label={t("Open procurement", "ክፍት ግዢ")} value={`${openProcurement}`} tone="ember" icon="FileText" />
        <Stat label={t("Awaiting approval", "ማፅደቅን ይጠብቃል")} value={`${pendingApproval}`} tone="gold" icon="PackageCheck" />
        <Stat label={t("Total payable", "ጠቅላላ የሚከፈል")} value={formatETB(payable)} tone="teff" icon="Wallet" />
      </div>

      <div className="flex items-center gap-2 mb-5 flex-wrap">
        {([
          ["suppliers", t("Suppliers", "አቅራቢዎች")],
          ["procurement", t("Procurement", "ግዢ")],
        ] as const).map(([tabKey, label]) => (
          <button
            key={tabKey}
            onClick={() => setTab(tabKey)}
            className={`h-9 px-4 rounded-full text-sm font-medium ${tab === tabKey ? "bg-foreground text-background" : "bg-card border border-border text-muted-foreground hover:text-foreground"}`}
          >
            {label}
          </button>
        ))}
      </div>

      {tab === "suppliers" && (
        <Card className="!p-0 overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-surface-2 text-xs uppercase tracking-wider text-muted-foreground">
              <tr>
                <th className="text-left px-4 py-3">{t("Supplier", "አቅራቢ")}</th>
                <th className="text-left px-4 py-3">{t("Store", "ስቶር")}</th>
                <th className="text-left px-4 py-3">{t("Category", "ምድብ")}</th>
                <th className="text-left px-4 py-3">{t("Contact", "መገናኛ")}</th>
                <th className="text-right px-4 py-3">{t("Outstanding", "የቀረ")}</th>
                <th className="text-left px-4 py-3">{t("Status", "ሁኔታ")}</th>
                <th className="text-right px-4 py-3"></th>
              </tr>
            </thead>
            <tbody>
              {orderedSuppliers.map((s) => (
                <tr key={s.id} className="border-t border-border hover:bg-surface-2/60">
                  <td className="px-4 py-3 font-medium">{s.name}</td>
                  <td className="px-4 py-3 text-muted-foreground">{stockLocationLabel(resolveRecordStore(s.store))}</td>
                  <td className="px-4 py-3 text-muted-foreground">{s.category}</td>
                  <td className="px-4 py-3 font-mono text-xs">{s.contact}</td>
                  <td className="px-4 py-3 text-right font-mono">{formatETB(s.outstanding)}</td>
                  <td className="px-4 py-3"><Chip tone={s.status === "Active" ? "teff" : "destructive"}>{s.status}</Chip></td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2 justify-end">
                      {s.outstanding > 0 && canPay && (
                        <button onClick={() => paySupplier(s.id)} className="h-7 px-2 rounded-md bg-teff/10 text-teff text-xs font-medium hover:bg-teff/20 transition-colors">
                          {t("Pay", "ክፈል")}
                        </button>
                      )}
                      <button
                        disabled={!canCreatePurchaseRequest || s.status !== "Active"}
                        onClick={() => setShowRequest(s)}
                        className="h-7 px-2 rounded-md text-xs text-ember hover:underline disabled:opacity-40 disabled:no-underline"
                      >
                        {t("Request purchase", "ግዢ ጠይቅ")}
                      </button>
                      {canManageSupplierRecords && (
                        <button onClick={() => deleteSupplier(s.id)} className="h-7 px-2 rounded-md text-xs text-destructive hover:bg-destructive/10 transition-colors">
                          {t("Delete", "ሰርዝ")}
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {orderedSuppliers.length === 0 && (
            <div className="border-t border-border py-12 text-center text-sm text-muted-foreground">
              {t("No suppliers", "አቅራቢዎች የሉም")}
            </div>
          )}
        </Card>
      )}

      {tab === "procurement" && (
        <Card className="!p-0 overflow-hidden">
          {/* <div className="px-4 py-3 border-b border-border text-sm text-muted-foreground">
            {t("Active procurement uses Stock Management requisitions, purchase orders, and GRV. Counts sync with Stock Management tabs.", "ንቁ ግዢ የStock Management ጥያቄዎች፣ PO እና GRV ይጠቀማል። ቆጠራዎች ከStock Management ትሮች ጋር ይዛመዳሉ።")}
          </div> */}
          <table className="w-full text-sm">
            <thead className="bg-surface-2 text-xs uppercase tracking-wider text-muted-foreground">
              <tr>
                <th className="text-left px-4 py-3">{t("Document", "ሰነድ")}</th>
                <th className="text-left px-4 py-3">{t("Type", "አይነት")}</th>
                <th className="text-left px-4 py-3">{t("Supplier", "አቅራቢ")}</th>
                <th className="text-left px-4 py-3">{t("Store", "ስቶር")}</th>
                <th className="text-left px-4 py-3">{t("Item", "እቃ")}</th>
                <th className="text-right px-4 py-3">{t("Qty", "ብዛት")}</th>
                <th className="text-left px-4 py-3">{t("Status", "ሁኔታ")}</th>
                <th className="px-4 py-3"></th>
              </tr>
            </thead>
            <tbody>
              {procurementRows.map((row) => (
                <ProcurementRowActions
                  key={row.id}
                  row={row}
                  t={t}
                  onApproveRequisition={approveRequisition}
                  onCreatePo={(requisition) => setCreatePoFor(requisition)}
                  onApprovePo={approvePurchaseOrder}
                  onReceive={(order) => setReceiveFor(order)}
                />
              ))}
            </tbody>
          </table>
          {procurementRows.length === 0 && (
            <div className="border-t border-border py-12 text-center text-sm text-muted-foreground">
              {t("No procurement documents", "የግዢ ሰነዶች የሉም")}
            </div>
          )}
        </Card>
      )}

      {showRequest && (
        <NewPurchaseRequestModal
          supplier={showRequest}
          stock={stockItems}
          store={resolveRecordStore(showRequest.store) || activeStore}
          onClose={() => setShowRequest(null)}
          onSave={(input) => {
            submitPurchaseRequest({ ...input, supplier: showRequest });
            setShowRequest(null);
          }}
        />
      )}
      {createPoFor && (
        <CreatePoModal
          requisition={createPoFor}
          suppliers={orderedSuppliers}
          defaultSupplier={orderedSuppliers[0]?.name ?? ""}
          onClose={() => setCreatePoFor(null)}
          onSave={(supplierName, unitCost) => {
            createPurchaseOrder(createPoFor, supplierName, unitCost);
            setCreatePoFor(null);
          }}
        />
      )}
      {receiveFor && (
        <ReceiveGrvModal
          order={receiveFor}
          onClose={() => setReceiveFor(null)}
          onSave={(input) => {
            confirmGrv(receiveFor, input);
            setReceiveFor(null);
          }}
        />
      )}
      {showAddSupplier && (
        <AddSupplierModal
          store={activeStore}
          canChooseStore={canViewAllStores}
          onClose={() => setShowAddSupplier(false)}
          onSave={(s) => {
            store.setSuppliers((prev) => upsertSupplier(prev, s));
            if (canViewAllStores && s.store) setStoreFilter(resolveRecordStore(s.store));
            setShowAddSupplier(false);
          }}
        />
      )}
    </div>
  );
}

function ProcurementRowActions({
  row,
  t,
  onApproveRequisition,
  onCreatePo,
  onApprovePo,
  onReceive,
}: {
  row: ProcurementQueueRow;
  t: (en: string, am?: string) => string;
  onApproveRequisition: (requisition: PurchaseRequisitionDocument) => void;
  onCreatePo: (requisition: PurchaseRequisitionDocument) => void;
  onApprovePo: (order: PurchaseOrderDocument) => void;
  onReceive: (order: PurchaseOrderDocument) => void;
}) {
  return (
    <tr className="border-t border-border hover:bg-surface-2/60">
      <td className="px-4 py-3 font-mono text-xs">{row.documentNumber}</td>
      <td className="px-4 py-3 text-muted-foreground">{row.kind === "requisition" ? t("Requisition", "ጥያቄ") : t("PO", "PO")}</td>
      <td className="px-4 py-3">{row.supplier}</td>
      <td className="px-4 py-3 text-muted-foreground">{stockLocationLabel(row.store)}</td>
      <td className="px-4 py-3">{row.itemName}</td>
      <td className="px-4 py-3 text-right font-mono">{row.quantity} {row.unit}</td>
      <td className="px-4 py-3"><Chip tone="gold">{row.status}</Chip></td>
      <td className="px-4 py-3 text-right">
        {row.nextAction === "approve_requisition" && row.requisition && (
          <button onClick={() => onApproveRequisition(row.requisition!)} className="h-7 px-2 rounded-md bg-ember/10 text-ember text-xs font-medium">{t("Approve", "አጽድቅ")}</button>
        )}
        {row.nextAction === "create_po" && row.requisition && (
          <button onClick={() => onCreatePo(row.requisition!)} className="h-7 px-2 rounded-md bg-ember/10 text-ember text-xs font-medium">{t("Create PO", "PO ፍጠር")}</button>
        )}
        {row.nextAction === "approve_po" && row.purchaseOrder && (
          <button onClick={() => onApprovePo(row.purchaseOrder!)} className="h-7 px-2 rounded-md bg-ember/10 text-ember text-xs font-medium">{t("Approve PO", "PO አጽድቅ")}</button>
        )}
        {row.nextAction === "receive_grv" && row.purchaseOrder && (
          <button onClick={() => onReceive(row.purchaseOrder!)} className="h-7 px-2 rounded-md bg-teff/10 text-teff text-xs font-medium">{t("Confirm GRV", "GRV አረጋግጥ")}</button>
        )}
        {row.nextAction === "none" && row.pendingHint && (
          <span className="text-[11px] text-muted-foreground italic">{row.pendingHint}</span>
        )}
      </td>
    </tr>
  );
}

function NewPurchaseRequestModal({
  supplier,
  stock,
  store,
  onClose,
  onSave,
}: {
  supplier: Supplier;
  stock: ProcurementStockItem[];
  store: CentralStockLocation;
  onClose: () => void;
  onSave: (input: { sku: string; qty: number; unitCost: number; store: CentralStockLocation }) => void;
}) {
  const t = useT();
  const [sku, setSku] = useState(stock[0]?.sku ?? "");
  const [qty, setQty] = useState(10);
  const [unitCost, setUnitCost] = useState(stock[0] ? Math.max(stock[0].value / Math.max(stock[0].onHand, 1), 0) : 0);
  const stockItem = stock.find((row) => row.sku === sku);
  const canSubmit = Boolean(stockItem && qty > 0 && unitCost >= 0);

  return (
    <ModalShell title={`${t("New purchase request", "አዲስ የግዢ ጥያቄ")} — ${supplier.name}`} onClose={onClose}>
      <div className="space-y-3 mb-5">
        <InfoBox label={t("Receive into", "ወደ")} value={stockLocationLabel(store)} />
        <SelectField label={t("Item", "እቃ")} value={sku} onChange={setSku} options={stock.map((row) => ({ value: row.sku, label: `${row.name} - ${row.sku}` }))} />
        <div className="grid grid-cols-2 gap-3">
          <NumberField label={`${t("Quantity", "ብዛት")} (${stockItem?.unit ?? t("unit", "እቃ")})`} value={qty} onChange={setQty} />
          <NumberField label={t("Unit cost (ETB)", "የአንዱ ዋጋ (ብር)")} value={unitCost} onChange={setUnitCost} />
        </div>
        <InfoBox label={t("Request total", "ጠቅላላ ጥያቄ")} value={formatETB(cleanNumber(qty) * cleanNumber(unitCost))} />
      </div>
      <ModalActions onClose={onClose} onSubmit={() => canSubmit && onSave({ sku, qty, unitCost, store })} submitLabel={t("Submit requisition", "ጥያቄ አስገባ")} disabled={!canSubmit} />
    </ModalShell>
  );
}

function CreatePoModal({
  requisition,
  suppliers,
  defaultSupplier,
  onClose,
  onSave,
}: {
  requisition: PurchaseRequisitionDocument;
  suppliers: Supplier[];
  defaultSupplier: string;
  onClose: () => void;
  onSave: (supplierName: string, unitCost: number) => void;
}) {
  const t = useT();
  const line = requisition.lines[0];
  const [supplier, setSupplier] = useState(defaultSupplier);
  const [unitCost, setUnitCost] = useState(0);
  const canSubmit = Boolean(supplier && unitCost >= 0 && line);

  return (
    <ModalShell title={t("Create purchase order", "የግዢ ትዕዛዝ ፍጠር")} onClose={onClose}>
      <div className="space-y-3 mb-5">
        <InfoBox label={t("Requisition", "ጥያቄ")} value={requisition.requisitionNumber} />
        <InfoBox label={t("Item", "እቃ")} value={line ? `${line.itemName} · ${line.approvedQuantity || line.requestedQuantity} ${line.unit}` : "-"} />
        <SelectField label={t("Supplier", "አቅራቢ")} value={supplier} onChange={setSupplier} options={suppliers.map((row) => ({ value: row.name, label: row.name }))} />
        <NumberField label={t("Unit cost (ETB)", "የአንዱ ዋጋ (ብር)")} value={unitCost} onChange={setUnitCost} />
      </div>
      <ModalActions onClose={onClose} onSubmit={() => canSubmit && onSave(supplier, unitCost)} submitLabel={t("Create PO", "PO ፍጠር")} disabled={!canSubmit} />
    </ModalShell>
  );
}

function ReceiveGrvModal({
  order,
  onClose,
  onSave,
}: {
  order: PurchaseOrderDocument;
  onClose: () => void;
  onSave: (input: {
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
  const line = order.lines[0];
  const [receivedQuantity, setReceivedQuantity] = useState(line?.orderedQuantity ?? 0);
  const [rejectedQuantity, setRejectedQuantity] = useState(0);
  const [freeQuantity, setFreeQuantity] = useState(0);
  const [unitCost, setUnitCost] = useState(line?.unitPrice ?? 0);
  const [batchNumber, setBatchNumber] = useState("");
  const [expiryDate, setExpiryDate] = useState("");
  const canSubmit = Boolean(line && receivedQuantity > 0 && unitCost >= 0);

  return (
    <ModalShell title={t("Confirm GRV", "GRV አረጋግጥ")} onClose={onClose}>
      <div className="space-y-3 mb-5">
        <InfoBox label={t("Purchase order", "የግዢ ትዕዛዝ")} value={order.purchaseOrderNumber} />
        <InfoBox label={t("Supplier", "አቅራቢ")} value={order.supplier} />
        <InfoBox label={t("Item", "እቃ")} value={line ? `${line.itemName} · ${line.orderedQuantity} ${line.unit}` : "-"} />
        <div className="grid grid-cols-2 gap-3">
          <NumberField label={t("Received qty", "የተቀበለ ብዛት")} value={receivedQuantity} onChange={setReceivedQuantity} />
          <NumberField label={t("Rejected qty", "የተቀደመ ብዛት")} value={rejectedQuantity} onChange={setRejectedQuantity} />
          <NumberField label={t("Free qty", "ነጻ ብዛት")} value={freeQuantity} onChange={setFreeQuantity} />
          <NumberField label={t("Unit cost", "የአንዱ ዋጋ")} value={unitCost} onChange={setUnitCost} />
        </div>
        <TextField label={t("Batch number", "ባች ቁጥር")} value={batchNumber} onChange={setBatchNumber} />
        <TextField label={t("Expiry date", "ጊዜው የሚያልፍበት")} value={expiryDate} onChange={setExpiryDate} />
      </div>
      <ModalActions
        onClose={onClose}
        onSubmit={() => line && canSubmit && onSave({ itemId: line.itemId, receivedQuantity, rejectedQuantity, freeQuantity, unitCost, batchNumber, expiryDate })}
        submitLabel={t("Confirm GRV", "GRV አረጋግጥ")}
        disabled={!canSubmit}
      />
    </ModalShell>
  );
}

function AddSupplierModal({
  store: defaultStore,
  canChooseStore,
  onClose,
  onSave,
}: {
  store: CentralStockLocation;
  canChooseStore: boolean;
  onClose: () => void;
  onSave: (s: Supplier) => void;
}) {
  const t = useT();
  const [form, setForm] = useState({ name: "", contact: "", category: "Other", outstanding: 0, status: "Active", store: defaultStore });
  function submit() {
    if (!form.name) return;
    onSave(normalizeSupplier({ id: supplierIdFromName(form.name, form.store), ...form }));
  }
  return (
    <ModalShell title={t("Add Supplier", "አቅራቢ ያክሉ")} onClose={onClose}>
      <div className="space-y-3 mb-5">
        <TextField label={t("Name", "ስም")} value={form.name} onChange={(value) => setForm({ ...form, name: value })} />
        <TextField label={t("Contact / Phone", "መገናኛ / ስልክ")} value={form.contact} onChange={(value) => setForm({ ...form, contact: value })} />
        <TextField label={t("Category", "ምድብ")} value={form.category} onChange={(value) => setForm({ ...form, category: value })} />
        {canChooseStore ? (
          <SelectField label={t("Store", "ስቶር")} value={form.store} onChange={(value) => setForm({ ...form, store: value as CentralStockLocation })} options={CENTRAL_STOCK_LOCATIONS.map((location) => ({ value: location, label: stockLocationLabel(location) }))} />
        ) : (
          <InfoBox label={t("Store", "ስቶር")} value={stockLocationLabel(form.store)} />
        )}
      </div>
      <ModalActions onClose={onClose} onSubmit={submit} submitLabel={t("Add", "አክል")} disabled={!form.name.trim()} />
    </ModalShell>
  );
}

function ModalShell({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) {
  return (
    <div className="fixed inset-0 z-50 bg-foreground/40 backdrop-blur-sm grid place-items-center p-4">
      <div className="surface-card max-w-md w-full !p-6">
        <div className="flex items-center justify-between mb-5">
          <h3 className="font-display text-xl font-semibold">{title}</h3>
          <button onClick={onClose} className="size-8 grid place-items-center rounded-lg hover:bg-surface-2"><Icons.X className="size-4" /></button>
        </div>
        {children}
      </div>
    </div>
  );
}

function ModalActions({ onClose, onSubmit, submitLabel, disabled }: { onClose: () => void; onSubmit: () => void; submitLabel: string; disabled?: boolean }) {
  const t = useT();
  return (
    <div className="flex gap-2">
      <button onClick={onClose} className="flex-1 h-10 rounded-lg border border-border bg-card text-sm hover:bg-surface-2">{t("Cancel", "ሰርዝ")}</button>
      <button disabled={disabled} onClick={onSubmit} className="flex-1 h-10 rounded-lg bg-ember text-ember-foreground text-sm font-semibold disabled:opacity-40">{submitLabel}</button>
    </div>
  );
}

function InfoBox({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg bg-surface-2 px-3 py-2 text-sm">
      <span className="text-muted-foreground">{label}: </span>
      <span className="font-medium">{value}</span>
    </div>
  );
}

function SelectField({ label, value, onChange, options }: { label: string; value: string; onChange: (value: string) => void; options: Array<{ value: string; label: string }> }) {
  return (
    <div>
      <label className="text-xs text-muted-foreground">{label}</label>
      <select value={value} onChange={(e) => onChange(e.target.value)} className="w-full mt-1 h-9 px-3 rounded-lg border border-border bg-card text-sm focus:outline-none">
        {options.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
      </select>
    </div>
  );
}

function NumberField({ label, value, onChange }: { label: string; value: number; onChange: (value: number) => void }) {
  return (
    <div>
      <label className="text-xs text-muted-foreground">{label}</label>
      <input type="number" min={0} value={value} onChange={(e) => onChange(Number(e.target.value))} className="w-full mt-1 h-9 px-3 rounded-lg border border-border bg-card text-sm font-mono focus:outline-none focus:ring-2 focus:ring-ring/40" />
    </div>
  );
}

function TextField({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
  return (
    <div>
      <label className="text-xs text-muted-foreground">{label}</label>
      <input value={value} onChange={(e) => onChange(e.target.value)} className="w-full mt-1 h-9 px-3 rounded-lg border border-border bg-card text-sm focus:outline-none focus:ring-2 focus:ring-ring/40" />
    </div>
  );
}
