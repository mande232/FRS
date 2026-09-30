import { useMemo, useState } from "react";
import * as Icons from "lucide-react";

import { Card, Chip, Stat } from "@/components/ui-kit";
import type { DailyConsumptionDocument } from "@/lib/daily-consumption";
import type { SalesRecord } from "@/lib/demo-data";
import {
  formatDashboardMoney,
  MoneyVisibilityToggle,
  useHideMoney,
} from "@/lib/dashboard-privacy";
import { useT } from "@/lib/i18n";
import { buildKitchenWorkspaceReport } from "@/lib/kitchen-ops";
import type {
  StockLedgerEntry,
  StockLocationBalance,
  StockManagedItem,
  StockRecipe,
} from "@/lib/stock-management";

function qty(value: number) {
  return Math.round((Number.isFinite(value) ? value : 0) * 1000) / 1000;
}

export function KitchenOpsPanel({
  salesRecords,
  balances,
  items,
  ledger,
  dailyConsumptions,
  recipes = [],
  date,
  onDateChange,
  compact = false,
  onOpenRecipes,
}: {
  salesRecords: SalesRecord[];
  balances: StockLocationBalance[];
  items: StockManagedItem[];
  ledger: StockLedgerEntry[];
  dailyConsumptions: DailyConsumptionDocument[];
  recipes?: StockRecipe[];
  date: string;
  onDateChange?: (date: string) => void;
  compact?: boolean;
  onOpenRecipes?: () => void;
}) {
  const t = useT();
  const { hidden: hideMoney, toggle: toggleHideMoney } = useHideMoney();
  const money = (value: number) => formatDashboardMoney(value, hideMoney);
  const [reportDate, setReportDate] = useState(date);
  const activeDate = onDateChange ? date : reportDate;

  const report = useMemo(
    () =>
      buildKitchenWorkspaceReport({
        salesRecords,
        balances,
        items,
        ledger,
        dailyConsumptions,
        recipes,
        date: activeDate,
      }),
    [salesRecords, balances, items, ledger, dailyConsumptions, recipes, activeDate],
  );

  function changeDate(next: string) {
    if (onDateChange) onDateChange(next);
    else setReportDate(next);
  }

  return (
    <div className="space-y-4">
      <Card>
        <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
          <h3 className="font-display text-lg font-semibold">{t("Kitchen sales & stock", "የኩሽና ሽያጭ እና ክምችት")}</h3>
          <div className="flex flex-wrap items-center gap-2">
            {onOpenRecipes ? (
              <button
                type="button"
                onClick={onOpenRecipes}
                className="inline-flex h-9 items-center gap-2 rounded-lg border border-border bg-card px-3 text-sm font-medium hover:bg-surface-2"
              >
                <Icons.BookOpen className="size-4" />
                {t("Recipe / BOM", "የእርስ እና ንጥረ ነገር")}
              </button>
            ) : null}
            {/* <MoneyVisibilityToggle hidden={hideMoney} onToggle={toggleHideMoney} t={t} /> */}
            <input
              type="date"
              className="h-9 rounded-lg border bg-background px-3 text-sm"
              value={activeDate}
              onChange={(event) => changeDate(event.target.value)}
            />
          </div>
        </div>

        <div className="grid grid-cols-2 xl:grid-cols-5 gap-3">
          <Stat label={t("Plates sold", "የተሸጡ ሳህኖች")} value={String(qty(report.totalPlates))} icon="UtensilsCrossed" />
          <Stat label={t("Sales", "ሽያጭ")} value={money(report.totalRevenue)} icon="Wallet" tone="gold" />
          <Stat label={t("With recipe", "ከአዘገጃጀት ጋር")} value={String(qty(report.mappedPlates))} icon="BookOpen" tone="teff" />
          <Stat label={t("No recipe", "ያለ አዘገጃጀት")} value={String(qty(report.unmappedPlates))} icon="AlertTriangle" tone="gold" />
          <Stat label={t("Recipes used", "ጥቅም ላይ የዋሉ")} value={String(report.recipeCountUsed)} icon="Layers" />
        </div>
      </Card>

      <Card>
        <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
          <h4 className="font-semibold">{t("Stock check vs recipe sales", "ክምችት ከአዘገጃጀት ሽያጭ ጋር")}</h4>
          <Chip tone="teff">{report.stockRows.length}</Chip>
        </div>
        <div className="overflow-x-auto rounded-lg border border-border">
          <table className="w-full text-sm">
            <thead className="bg-surface-2 text-xs uppercase tracking-wider text-muted-foreground">
              <tr>
                <th className="text-left px-3 py-2">{t("Item", "እቃ")}</th>
                <th className="text-right px-3 py-2">{t("On hand", "ባለ እጅ")}</th>
                <th className="text-right px-3 py-2">{t("From recipes", "ከአዘገጃጀት")}</th>
                <th className="text-right px-3 py-2">{t("POS deducted", "የPOS ቅነሳ")}</th>
                <th className="text-right px-3 py-2">{t("Posted DC", "የተለጠፈ")}</th>
                <th className="text-right px-3 py-2">{t("vs POS", "ከPOS")}</th>
                <th className="text-left px-3 py-2">{t("Track", "ክትትል")}</th>
              </tr>
            </thead>
            <tbody>
              {report.stockRows.map((row) => {
                const varianceTone =
                  Math.abs(row.varianceVsPos) < 0.001
                    ? "text-muted-foreground"
                    : row.varianceVsPos > 0
                      ? "text-destructive"
                      : "text-teff";
                const trackLabel =
                  row.tracking === "pos"
                    ? t("POS", "POS")
                    : row.tracking === "daily_consumption"
                      ? t("DC", "ዕለታዊ")
                      : row.tracking === "both"
                        ? t("Both", "ሁለቱም")
                        : t("—", "—");
                return (
                  <tr key={row.itemId} className="border-t border-border">
                    <td className="px-3 py-2">
                      <div className="font-medium">{row.itemName}</div>
                      <div className="text-xs text-muted-foreground">{row.unit}</div>
                    </td>
                    <td className="px-3 py-2 text-right font-mono">{qty(row.onHand)}</td>
                    <td className="px-3 py-2 text-right font-mono">{qty(row.suggestedFromRecipes)}</td>
                    <td className="px-3 py-2 text-right font-mono">{qty(row.posDeducted)}</td>
                    <td className="px-3 py-2 text-right font-mono">{qty(row.dcPosted)}</td>
                    <td className={`px-3 py-2 text-right font-mono ${varianceTone}`}>{qty(row.varianceVsPos)}</td>
                    <td className="px-3 py-2 text-xs text-muted-foreground">{trackLabel}</td>
                  </tr>
                );
              })}
              {report.stockRows.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-3 py-8 text-center text-muted-foreground">
                    {t("No Kitchen stock or recipe usage for this date.", "ለዚህ ቀን የኩሽና ክምችት ወይም አዘገጃጀት አጠቃቀም የለም።")}
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </Card>

      {!compact ? (
        <Card>
          <div className="flex items-center justify-between mb-3">
            <h4 className="font-semibold">{t("POS plates detail", "የPOS ሳህን ዝርዝር")}</h4>
            <Chip tone="muted">{report.plates.length}</Chip>
          </div>
          <div className="overflow-x-auto rounded-lg border border-border">
            <table className="w-full text-sm">
              <thead className="bg-surface-2 text-xs uppercase tracking-wider text-muted-foreground">
                <tr>
                  <th className="text-left px-3 py-2">{t("Dish", "ምግብ")}</th>
                  <th className="text-right px-3 py-2">{t("Plates", "ሳህን")}</th>
                  <th className="text-right px-3 py-2">{t("Sales", "ሽያጭ")}</th>
                  <th className="text-left px-3 py-2">{t("Recipe", "አዘገጃጀት")}</th>
                </tr>
              </thead>
              <tbody>
                {report.plates.map((line) => (
                  <tr key={`${line.productId ?? ""}-${line.productName}`} className="border-t border-border">
                    <td className="px-3 py-2 font-medium">{line.productName}</td>
                    <td className="px-3 py-2 text-right font-mono">{qty(line.qty)}</td>
                    <td className="px-3 py-2 text-right font-mono">{money(line.revenue)}</td>
                    <td className="px-3 py-2 text-xs">
                      {line.hasRecipe ? (
                        <span className="text-teff">{t("Mapped", "ተገናኝቷል")}</span>
                      ) : (
                        <span className="text-destructive">{t("Missing BOM", "አዘገጃጀት የለም")}</span>
                      )}
                    </td>
                  </tr>
                ))}
                {report.plates.length === 0 ? (
                  <tr>
                    <td colSpan={4} className="px-3 py-8 text-center text-muted-foreground">
                      {t("No Kitchen POS sales for this date.", "ለዚህ ቀን የኩሽና POS ሽያጭ የለም።")}
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        </Card>
      ) : null}
    </div>
  );
}
