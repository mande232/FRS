import { useNavigate } from "@tanstack/react-router";

import { Card, Chip, Stat } from "@/components/ui-kit";
import type { InventoryAccessContext } from "@/lib/inventory-access";
import { canViewInventoryValue } from "@/lib/inventory-access";
import { formatETB } from "@/lib/ethiopic";
import { useT } from "@/lib/i18n";
import type { StockDashboardSummary } from "@/lib/stock-management";

function formatCost(access: InventoryAccessContext, value: number) {
  if (!canViewInventoryValue(access)) return "—";
  return formatETB(value);
}

function formatTime(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

export function StaffConsumptionDashboardPanel({
  access,
  dashboard,
  detail = false,
}: {
  access: InventoryAccessContext;
  dashboard: StockDashboardSummary;
  detail?: boolean;
}) {
  const t = useT();
  const navigate = useNavigate();
  const summary = dashboard.staffConsumption;

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 xl:grid-cols-4 gap-4">
        <Stat
          label={t("Staff consumption today", "የዛሬ የሰራተኛ መጠቀም")}
          value={String(summary.todayRecords)}
          icon="Users"
          tone="teff"
        />
        <Stat
          label={t("Staff items consumed", "የተጠቀሙ ዕቃዎች")}
          value={String(summary.todayQuantity)}
          icon="UtensilsCrossed"
        />
        <Stat
          label={t("Staff consumption cost", "የሰራተኛ መጠቀም ወጪ")}
          value={formatCost(access, summary.todayCost)}
          icon="BadgeDollarSign"
        />
        <Stat label={t("Staff revenue", "የሰራተኛ ገቢ")} value={formatETB(0)} icon="CircleOff" />
      </div>

      <div className="grid xl:grid-cols-2 gap-4">
        <Card>
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-display text-lg font-semibold">
              {t("Top staff consumption items", "በብዛት የተጠቀሙ የሰራተኛ ዕቃዎች")}
            </h3>
            <Chip tone="teff">{summary.topItems.length}</Chip>
          </div>
          <div className="space-y-2">
            {summary.topItems.map((row) => (
              <div key={row.itemName} className="rounded-lg bg-surface-2 p-3 flex items-center justify-between gap-3">
                <div className="font-medium">{row.itemName}</div>
                <div className="text-right">
                  <div className="font-mono text-sm">{row.quantity}</div>
                  <div className="text-xs text-muted-foreground">{formatCost(access, row.totalCost)}</div>
                </div>
              </div>
            ))}
            {summary.topItems.length === 0 && (
              <div className="text-sm text-muted-foreground">
                {t("No staff consumption recorded for this department today.", "ለዚህ ክፍል ዛሬ የሰራተኛ መጠቀም አልተመዘገበም።")}
              </div>
            )}
          </div>
        </Card>

        {detail ? (
          <Card>
            <div className="flex items-center justify-between mb-4 gap-3">
              <h3 className="font-display text-lg font-semibold">{t("By staff member", "በሰራተኛ")}</h3>
              <button
                type="button"
                onClick={() => navigate({ to: "/app/staff-consumption" })}
                className="text-sm font-medium text-ember hover:underline"
              >
                {t("Open staff consumption", "የሰራተኛ መጠቀም ክፈት")}
              </button>
            </div>
            <div className="space-y-2">
              {summary.byStaff.map((row) => (
                <div key={row.staffMemberId} className="rounded-lg bg-surface-2 p-3 flex items-center justify-between gap-3">
                  <div>
                    <div className="font-medium">{row.staffMemberName}</div>
                    <div className="text-xs text-muted-foreground">
                      {row.records} {t("records", "መዝገቦች")} · {row.quantity} {t("items", "ዕቃዎች")}
                    </div>
                  </div>
                  <div className="font-mono text-sm">{formatCost(access, row.cost)}</div>
                </div>
              ))}
              {summary.byStaff.length === 0 && (
                <div className="text-sm text-muted-foreground">
                  {t("No staff consumption by member yet today.", "ዛሬ በሰራተኛ መጠቀም አልተመዘገበም።")}
                </div>
              )}
            </div>
          </Card>
        ) : (
          <Card>
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-display text-lg font-semibold">{t("Recent staff consumption", "የቅርብ ጊዜ የሰራተኛ መጠቀም")}</h3>
              <Chip tone="muted">{summary.recentRecords.length}</Chip>
            </div>
            <div className="space-y-2">
              {summary.recentRecords.slice(0, 5).map((row) => (
                <div key={row.referenceNo} className="rounded-lg bg-surface-2 p-3">
                  <div className="flex items-center justify-between gap-3">
                    <div className="font-medium">{row.staffMemberName}</div>
                    <div className="text-xs text-muted-foreground">{formatTime(row.recordedAt)}</div>
                  </div>
                  <div className="text-sm text-muted-foreground mt-1">
                    {row.lines.map((line) => `${line.itemName} ×${line.quantity}`).join(", ")}
                  </div>
                </div>
              ))}
              {summary.recentRecords.length === 0 && (
                <div className="text-sm text-muted-foreground">
                  {t("No staff consumption recorded for this department today.", "ለዚህ ክፍል ዛሬ የሰራተኛ መጠቀም አልተመዘገበም።")}
                </div>
              )}
            </div>
          </Card>
        )}
      </div>

      {detail && summary.recentRecords.length > 0 ? (
        <Card className="!p-0 overflow-hidden">
          <div className="px-4 py-3 border-b border-border font-semibold">
            {t("Recent staff consumption records", "የቅርብ ጊዜ የሰራተኛ መጠቀም መዝገቦች")}
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm min-w-[760px]">
              <thead className="bg-surface-2 text-xs uppercase text-muted-foreground">
                <tr>
                  <th className="text-left px-4 py-3">{t("Time", "ሰዓት")}</th>
                  <th className="text-left px-4 py-3">{t("Reference", "ማጣቀሻ")}</th>
                  <th className="text-left px-4 py-3">{t("Staff", "ሰራተኛ")}</th>
                  <th className="text-left px-4 py-3">{t("Type", "አይነት")}</th>
                  <th className="text-left px-4 py-3">{t("Items", "ዕቃዎች")}</th>
                  <th className="text-right px-4 py-3">{t("Qty", "ብዛት")}</th>
                  <th className="text-right px-4 py-3">{t("Cost", "ወጪ")}</th>
                  <th className="text-left px-4 py-3">{t("Recorded by", "መዘገበው")}</th>
                </tr>
              </thead>
              <tbody>
                {summary.recentRecords.map((row) => (
                  <tr key={row.referenceNo} className="border-t border-border">
                    <td className="px-4 py-3">{formatTime(row.recordedAt)}</td>
                    <td className="px-4 py-3 font-mono text-xs">{row.referenceNo}</td>
                    <td className="px-4 py-3">{row.staffMemberName}</td>
                    <td className="px-4 py-3">{row.consumptionType}</td>
                    <td className="px-4 py-3">
                      {row.lines.map((line) => `${line.itemName} (${line.quantity})`).join(", ")}
                    </td>
                    <td className="px-4 py-3 text-right font-mono">{row.totalQuantity}</td>
                    <td className="px-4 py-3 text-right font-mono">{formatCost(access, row.totalInventoryCost)}</td>
                    <td className="px-4 py-3 text-muted-foreground">{row.recordedBy}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      ) : null}
    </div>
  );
}
