import { Card, Chip, Stat } from "@/components/ui-kit";
import { StaffConsumptionDashboardPanel } from "@/components/stock/staff-consumption-dashboard-panel";
import type { InventoryAccessContext, InventoryWorkspace } from "@/lib/inventory-access";
import { canViewInventoryValue, stockLocationLabel } from "@/lib/inventory-access";
import { formatETB } from "@/lib/ethiopic";
import { useT } from "@/lib/i18n";
import { isCentralStockLocation, isOperationalStockLocation, type StockDashboardSummary, type StockLocation } from "@/lib/stock-management";

function valueOrDash(access: InventoryAccessContext, value: number, location?: StockLocation) {
  if (!canViewInventoryValue(access, location)) return "—";
  return formatETB(value);
}

export function StockDashboardAllPanel({
  access,
  dashboard,
  onSelectLocation,
  showStaffConsumptionDetail = false,
}: {
  access: InventoryAccessContext;
  dashboard: StockDashboardSummary;
  onSelectLocation: (location: StockLocation) => void;
  showStaffConsumptionDetail?: boolean;
}) {
  const t = useT();
  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 xl:grid-cols-4 gap-4">
        <Stat label={t("Total inventory value", "የክምችት ጠቅላላ ዋጋ")} value={valueOrDash(access, dashboard.totalInventoryValue)} icon="Wallet" tone="ember" />
        <Stat label={t("Low stock items", "ዝቅተኛ ዕቃዎች")} value={String(dashboard.lowStockItems.length)} icon="AlertTriangle" tone="gold" />
        <Stat label={t("Pending requests", "በመጠባበቅ ላይ ያሉ ጥያቄዎች")} value={String(dashboard.pendingStockRequests)} icon="Inbox" />
        <Stat label={t("Awaiting receipt", "መቀበያ በመጠባበቅ")} value={String(dashboard.pendingTransferReceipts)} icon="Truck" />
      </div>
      <div className="grid grid-cols-2 xl:grid-cols-4 gap-4">
        <Stat label={t("Store 1 value", "የስቶር 1 ዋጋ")} value={valueOrDash(access, dashboard.store1StockValue, "Store 1")} icon="Warehouse" />
        <Stat label={t("Store 2 value", "የስቶር 2 ዋጋ")} value={valueOrDash(access, dashboard.store2StockValue, "Store 2")} icon="Warehouse" />
        <Stat label={t("Department value", "የክፍል ዋጋ")} value={valueOrDash(access, dashboard.departmentStockValue)} icon="Boxes" />
        <Stat label={t("Expiring items", "ጊዜያቸው የሚያልቁ")} value={String(dashboard.expiringItems)} icon="Timer" tone="destructive" />
      </div>
      {showStaffConsumptionDetail ? (
        <StaffConsumptionDashboardPanel access={access} dashboard={dashboard} detail />
      ) : null}
      <Card className="!p-0 overflow-hidden">
        <div className="px-4 py-3 border-b border-border font-semibold">{t("Location comparison", "የቦታ ንጽጽር")}</div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm min-w-[900px]">
            <thead className="bg-surface-2 text-xs uppercase text-muted-foreground">
              <tr>
                <th className="text-left px-4 py-3">{t("Location", "ቦታ")}</th>
                <th className="text-right px-4 py-3">{t("Items", "እቃዎች")}</th>
                <th className="text-right px-4 py-3">{t("Value", "ዋጋ")}</th>
                <th className="text-right px-4 py-3">{t("Low", "ዝቅ")}</th>
                <th className="text-right px-4 py-3">{t("Out", "አልቋል")}</th>
                <th className="text-right px-4 py-3">{t("Requests", "ጥያቄዎች")}</th>
                <th className="text-right px-4 py-3">{t("Awaiting", "በመጠባበቅ")}</th>
              </tr>
            </thead>
            <tbody>
              {dashboard.locationComparison.map((row) => (
                <tr key={row.location} className="border-t border-border hover:bg-surface-2/60">
                  <td className="px-4 py-3">
                    <button type="button" onClick={() => onSelectLocation(row.location)} className="font-medium text-left hover:underline">
                      {stockLocationLabel(row.location)}
                    </button>
                  </td>
                  <td className="px-4 py-3 text-right font-mono">{row.totalItems}</td>
                  <td className="px-4 py-3 text-right font-mono">{valueOrDash(access, row.inventoryValue, row.location)}</td>
                  <td className="px-4 py-3 text-right font-mono">{row.lowStock}</td>
                  <td className="px-4 py-3 text-right font-mono">{row.outOfStock}</td>
                  <td className="px-4 py-3 text-right font-mono">{row.pendingRequests}</td>
                  <td className="px-4 py-3 text-right font-mono">{row.awaitingReceipt}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}

export function StockDashboardStorePanel({
  access,
  workspace,
  dashboard,
}: {
  access: InventoryAccessContext;
  workspace: Extract<InventoryWorkspace, "Store 1" | "Store 2">;
  dashboard: StockDashboardSummary;
}) {
  const t = useT();
  const movement = dashboard.mostIssuedItems;
  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 xl:grid-cols-4 gap-4">
        <Stat label={t("Inventory value", "የክምችት ዋጋ")} value={valueOrDash(access, dashboard.totalInventoryValue, workspace)} icon="Wallet" tone="ember" />
        <Stat label={t("Low stock", "ዝቅተኛ ክምችት")} value={String(dashboard.lowStockItems.length)} icon="AlertTriangle" tone="gold" />
        <Stat label={t("Goods received today", "ዛሬ የተቀበሉ")} value={valueOrDash(access, dashboard.todayPurchases, workspace)} icon="PackagePlus" />
        <Stat label={t("Pending requests", "በመጠባበቅ ላይ")} value={String(dashboard.pendingStockRequests)} icon="Inbox" />
      </div>
      <div className="grid xl:grid-cols-2 gap-4">
        <Card>
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-display text-lg font-semibold">{t("Most issued items", "በብዛት የወጡ እቃዎች")}</h3>
            <Chip tone="teff">{movement.length}</Chip>
          </div>
          <div className="space-y-2">
            {movement.map((row) => (
              <div key={row.itemName} className="rounded-lg bg-surface-2 p-3 flex items-center justify-between gap-3">
                <div className="font-medium">{row.itemName}</div>
                <div className="text-right font-mono text-sm">{row.quantity}</div>
              </div>
            ))}
            {movement.length === 0 && <div className="text-sm text-muted-foreground">{t("No store issues recorded today.", "ዛሬ ከስቶር የወጡ እቃዎች አልተመዘገቡም።")}</div>}
          </div>
        </Card>
        <Card>
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-display text-lg font-semibold">{t("Low stock alerts", "የእቃ እርምጃ ማስጠንቀቂያ")}</h3>
            <Chip tone="gold">{dashboard.lowStockItems.length}</Chip>
          </div>
          <div className="space-y-2">
            {dashboard.lowStockItems.slice(0, 8).map((row) => (
              <div key={`${row.itemId}-${row.location}`} className="rounded-lg bg-surface-2 p-3 flex items-center justify-between gap-3">
                <div>
                  <div className="font-medium">{row.itemName}</div>
                  <div className="text-xs text-muted-foreground">{stockLocationLabel(row.location)}</div>
                </div>
                <div className="font-mono text-sm">{row.quantity} {row.unit}</div>
              </div>
            ))}
          </div>
        </Card>
      </div>
    </div>
  );
}

export function StockDashboardDepartmentPanel({
  access,
  workspace,
  dashboard,
  showStaffConsumptionDetail = false,
}: {
  access: InventoryAccessContext;
  workspace: InventoryWorkspace;
  dashboard: StockDashboardSummary;
  showStaffConsumptionDetail?: boolean;
}) {
  const t = useT();
  const location = workspace === "all" ? undefined : workspace;
  const isProductionDept = workspace === "Kitchen" || workspace === "Coffee House";
  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 xl:grid-cols-4 gap-4">
        <Stat label={t("Inventory value", "የክምችት ዋጋ")} value={valueOrDash(access, dashboard.totalInventoryValue, location)} icon="Wallet" tone="ember" />
        {isProductionDept ? (
          <Stat label={t("Today's consumption", "የዛሬ መጠቀም")} value={String(dashboard.todayDailyConsumption)} icon="UtensilsCrossed" />
        ) : (
          <Stat label={t("Today's POS consumption", "የዛሬ POS ቅነጥታ")} value={String(dashboard.todaySalesDeductions)} icon="MinusCircle" />
        )}
        <Stat label={t("Recipe consumption", "የአዘገጃጀት ቅነጥታ")} value={String(dashboard.todayRecipeConsumption)} icon="ChefHat" />
        <Stat label={t("Today's wastage", "የዛሬ ብክነት")} value={valueOrDash(access, dashboard.todayWastage, location)} icon="Trash2" tone="destructive" />
      </div>
      <StaffConsumptionDashboardPanel access={access} dashboard={dashboard} detail={showStaffConsumptionDetail} />
      {isProductionDept ? (
        <div className="grid grid-cols-2 xl:grid-cols-4 gap-4">
          <Stat label={t("Low stock", "ዝቅተኛ ክምችት")} value={String(dashboard.lowStockItems.length)} icon="AlertTriangle" tone="gold" />
          <Stat label={t("Pending requests", "በመጠባበቅ ላይ")} value={String(dashboard.pendingStockRequests)} icon="Inbox" />
          <Stat label={t("Total consumption", "ጠቅላላ መጠቀም")} value={String(dashboard.todayConsumption)} icon="TrendingDown" />
          <Stat label={t("Out of stock", "አልቋል")} value={String(dashboard.outOfStockItems.length)} icon="CircleAlert" tone="destructive" />
        </div>
      ) : null}
      <div className="grid xl:grid-cols-2 gap-4">
        <Card>
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-display text-lg font-semibold">{isProductionDept ? t("Most consumed ingredients", "በብዛት የተጠቀሙ ንጥረ ነገሮች") : t("Most consumed items", "በብዛት የተጠቀሙ እቃዎች")}</h3>
            <Chip tone="teff">{dashboard.topSellingItems.length}</Chip>
          </div>
          <div className="space-y-2">
            {dashboard.topSellingItems.map((row) => (
              <div key={row.itemName} className="rounded-lg bg-surface-2 p-3 flex items-center justify-between gap-3">
                <div className="font-medium">{row.itemName}</div>
                <div className="font-mono text-sm">{row.quantity}</div>
              </div>
            ))}
          </div>
        </Card>
        <Card>
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-display text-lg font-semibold">{t("Requires attention", "ትኩረት የሚፈልጉ")}</h3>
            <Chip tone="gold">{dashboard.lowStockItems.length + dashboard.outOfStockItems.length}</Chip>
          </div>
          <div className="space-y-2">
            {dashboard.outOfStockItems.slice(0, 5).map((row) => (
              <div key={`${row.itemId}-oos`} className="rounded-lg bg-destructive/10 p-3 flex justify-between gap-3">
                <span>{row.itemName}</span>
                <span className="text-xs">{t("Out of stock", "አልቋል")}</span>
              </div>
            ))}
            {dashboard.lowStockItems.slice(0, 5).map((row) => (
              <div key={`${row.itemId}-low`} className="rounded-lg bg-surface-2 p-3 flex justify-between gap-3">
                <span>{row.itemName}</span>
                <span className="font-mono text-sm">{row.quantity}</span>
              </div>
            ))}
          </div>
        </Card>
      </div>
    </div>
  );
}

export function StockDashboardPanel({
  access,
  workspace,
  dashboard,
  onSelectLocation,
  showStaffConsumptionDetail = false,
}: {
  access: InventoryAccessContext;
  workspace: InventoryWorkspace;
  dashboard: StockDashboardSummary;
  onSelectLocation: (location: StockLocation) => void;
  showStaffConsumptionDetail?: boolean;
}) {
  if (workspace === "all") {
    return (
      <StockDashboardAllPanel
        access={access}
        dashboard={dashboard}
        onSelectLocation={onSelectLocation}
        showStaffConsumptionDetail={showStaffConsumptionDetail}
      />
    );
  }
  if (isCentralStockLocation(workspace)) {
    return <StockDashboardStorePanel access={access} workspace={workspace} dashboard={dashboard} />;
  }
  if (isOperationalStockLocation(workspace)) {
    return (
      <StockDashboardDepartmentPanel
        access={access}
        workspace={workspace}
        dashboard={dashboard}
        showStaffConsumptionDetail={showStaffConsumptionDetail}
      />
    );
  }
  return (
    <StockDashboardAllPanel
      access={access}
      dashboard={dashboard}
      onSelectLocation={onSelectLocation}
      showStaffConsumptionDetail={showStaffConsumptionDetail}
    />
  );
}
