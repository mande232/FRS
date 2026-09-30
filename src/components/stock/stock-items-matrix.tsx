import { Card } from "@/components/ui-kit";
import type { InventoryAccessContext } from "@/lib/inventory-access";
import { canViewInventoryValue, stockLocationLabel } from "@/lib/inventory-access";
import { formatETB } from "@/lib/ethiopic";
import { useT } from "@/lib/i18n";
import { STOCK_LOCATIONS, type StockLocation, type StockLocationBalance, type StockManagedItem } from "@/lib/stock-management";

export function StockItemsMatrix({
  access,
  items,
  balances,
}: {
  access: InventoryAccessContext;
  items: StockManagedItem[];
  balances: StockLocationBalance[];
}) {
  const t = useT();
  const showAllLocations = access.canViewAllLocations;
  const visibleLocations: StockLocation[] = showAllLocations
    ? [...STOCK_LOCATIONS]
    : access.assignedLocations;

  const rows = items.map((item) => {
    const byLocation = Object.fromEntries(
      visibleLocations.map((location) => {
        const row = balances.find((balance) => balance.itemId === item.id && balance.location === location);
        return [location, row?.quantity ?? 0];
      }),
    ) as Record<StockLocation, number>;
    const total = visibleLocations.reduce((sum, location) => sum + (byLocation[location] ?? 0), 0);
    return { item, byLocation, total };
  });

  return (
    <Card className="!p-0 overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full text-sm min-w-[960px]">
          <thead className="bg-surface-2 text-xs uppercase text-muted-foreground">
            <tr>
              <th className="text-left px-4 py-3">{t("Item", "እቃ")}</th>
              <th className="text-left px-4 py-3">{t("Category", "ምድብ")}</th>
              {visibleLocations.map((location) => (
                <th key={location} className="text-right px-4 py-3">{stockLocationLabel(location)}</th>
              ))}
              {showAllLocations ? <th className="text-right px-4 py-3">{t("Total", "ጠቅላላ")}</th> : null}
              {canViewInventoryValue(access) ? (
                <>
                  <th className="text-right px-4 py-3">{t("WAC", "ክብደት ዋጋ")}</th>
                  <th className="text-right px-4 py-3">{t("Value", "ዋጋ")}</th>
                </>
              ) : null}
            </tr>
          </thead>
          <tbody>
            {rows.map(({ item, byLocation, total }) => {
              const primaryBalance = balances.find((row) => row.itemId === item.id);
              const value = (primaryBalance?.unitCost ?? item.purchasePrice) * total;
              return (
                <tr key={item.id} className="border-t border-border">
                  <td className="px-4 py-3 font-medium">{item.name}</td>
                  <td className="px-4 py-3 text-muted-foreground">{item.category}</td>
                  {visibleLocations.map((location) => (
                    <td key={location} className="px-4 py-3 text-right font-mono">{byLocation[location] ?? 0}</td>
                  ))}
                  {showAllLocations ? <td className="px-4 py-3 text-right font-mono">{total}</td> : null}
                  {canViewInventoryValue(access) ? (
                    <>
                      <td className="px-4 py-3 text-right font-mono">{formatETB(item.purchasePrice)}</td>
                      <td className="px-4 py-3 text-right font-mono">{formatETB(value)}</td>
                    </>
                  ) : null}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </Card>
  );
}
