import { useMemo, useState } from "react";
import * as Icons from "lucide-react";

import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Card, Chip, Stat } from "@/components/ui-kit";
import {
  buildCoffeeHouseWorkspaceReport,
  COFFEE_BEANS_SKU,
  COFFEE_HOUSE_RAW_STOCK,
  DEFAULT_COFFEE_BEANS_KG_PER_CUP,
  defaultYieldForCoffeeHouseSku,
  estimateCupsFromKg,
  estimateKgFromCups,
  GINGER_SKU,
  MILK_SKU,
  NUTS_SKU,
  TEA_LEAVES_SKU,
  type CoffeeHouseRawSkuId,
  type DailyConsumptionDocument,
} from "@/lib/daily-consumption";
import type { SalesRecord } from "@/lib/demo-data";
import {
  formatDashboardMoney,
  MoneyVisibilityToggle,
  useHideMoney,
} from "@/lib/dashboard-privacy";
import { useT } from "@/lib/i18n";
import type { StockLocationBalance, StockManagedItem, StockRecipe } from "@/lib/stock-management";

function qty(value: number) {
  return Math.round((Number.isFinite(value) ? value : 0) * 1000) / 1000;
}

type CalcMode = "cups_to_kg" | "kg_to_cups";

function skuLabel(t: (en: string, am: string) => string, sku: string) {
  switch (sku) {
    case COFFEE_BEANS_SKU:
      return t("Coffee beans", "የቡና ፍሬ");
    case TEA_LEAVES_SKU:
      return t("Tea leaves", "የሻይ ቅጠል");
    case GINGER_SKU:
      return t("Ginger (Keshir)", "ዝንጅብል (ቄሽር)");
    case NUTS_SKU:
      return t("Nuts (Lewuz)", "ለውዝ");
    case MILK_SKU:
      return t("Milk", "ወተት");
    default:
      return sku;
  }
}

export function CoffeeHouseOpsPanel({
  salesRecords,
  balances,
  items,
  dailyConsumptions,
  recipes = [],
  date,
  onDateChange,
  compact = false,
}: {
  salesRecords: SalesRecord[];
  balances: StockLocationBalance[];
  items: StockManagedItem[];
  dailyConsumptions: DailyConsumptionDocument[];
  recipes?: StockRecipe[];
  date: string;
  onDateChange?: (date: string) => void;
  compact?: boolean;
}) {
  const t = useT();
  const { hidden: hideMoney, toggle: toggleHideMoney } = useHideMoney();
  const money = (value: number) => formatDashboardMoney(value, hideMoney);
  const [reportDate, setReportDate] = useState(date);
  const [calcOpen, setCalcOpen] = useState(false);
  const activeDate = onDateChange ? date : reportDate;

  const report = useMemo(
    () =>
      buildCoffeeHouseWorkspaceReport({
        salesRecords,
        balances,
        items,
        dailyConsumptions,
        date: activeDate,
        recipes,
      }),
    [salesRecords, balances, items, dailyConsumptions, activeDate, recipes],
  );

  function changeDate(next: string) {
    if (onDateChange) onDateChange(next);
    else setReportDate(next);
  }

  const [calcSku, setCalcSku] = useState<CoffeeHouseRawSkuId>(COFFEE_BEANS_SKU);
  const [calcMode, setCalcMode] = useState<CalcMode>("cups_to_kg");
  const [yieldDraft, setYieldDraft] = useState(String(DEFAULT_COFFEE_BEANS_KG_PER_CUP));
  const [inputDraft, setInputDraft] = useState("10");

  const activeRow = report.stockRows.find((row) => row.itemId === calcSku);
  const unit = activeRow?.unit ?? (calcSku === MILK_SKU ? "liter" : "kg");
  const yieldPerCup = Number(yieldDraft);
  const inputValue = Number(inputDraft);
  const calcResult =
    calcMode === "cups_to_kg"
      ? {
          label: t(`Needed (${unit})`, `ያስፈልጋል (${unit})`),
          value: estimateKgFromCups(inputValue, yieldPerCup),
          unit,
        }
      : {
          label: t("cups possible", "ሊሸጡ የሚችሉ ኩባያዎች"),
          value: estimateCupsFromKg(inputValue, yieldPerCup),
          unit: t("cups", "ኩባያ"),
        };

  const stockCheck =
    calcMode === "cups_to_kg"
      ? {
          ok: (activeRow?.onHandKg ?? 0) + 0.0001 >= calcResult.value,
          message: t(
            `On hand ${qty(activeRow?.onHandKg ?? 0)} ${unit} · need ${qty(calcResult.value)} ${unit}`,
            `ባለ እጅ ${qty(activeRow?.onHandKg ?? 0)} ${unit} · ያስፈልጋል ${qty(calcResult.value)} ${unit}`,
          ),
        }
      : {
          ok: true,
          message: t(
            `From ${qty(inputValue)} ${unit} at ${qty(yieldPerCup)} ${unit}/cup → ${qty(calcResult.value)} cups`,
            `ከ ${qty(inputValue)} ${unit} በ ${qty(yieldPerCup)} ${unit}/ኩባያ → ${qty(calcResult.value)} ኩባያ`,
          ),
        };

  function openCalculator(sku: CoffeeHouseRawSkuId = COFFEE_BEANS_SKU) {
    const row = report.stockRows.find((line) => line.itemId === sku);
    setCalcSku(sku);
    setCalcMode("cups_to_kg");
    setYieldDraft(String(row?.kgPerCup || defaultYieldForCoffeeHouseSku(sku)));
    const cups = report.pos.cups
      .filter((line) => line.stockItemId === sku)
      .reduce((sum, line) => sum + line.qty, 0);
    setInputDraft(String(qty(cups > 0 ? cups : 10)));
    setCalcOpen(true);
  }

  function selectSku(next: CoffeeHouseRawSkuId) {
    setCalcSku(next);
    const row = report.stockRows.find((line) => line.itemId === next);
    setYieldDraft(String(row?.kgPerCup || defaultYieldForCoffeeHouseSku(next)));
    if (calcMode === "kg_to_cups") {
      setInputDraft(String(row?.onHandKg ?? 0));
    }
  }

  function useOnHandInCalculator() {
    setCalcMode("kg_to_cups");
    setInputDraft(String(activeRow?.onHandKg ?? 0));
    setYieldDraft(String(activeRow?.kgPerCup || Number(yieldDraft) || defaultYieldForCoffeeHouseSku(calcSku)));
  }

  function useSoldCupsInCalculator() {
    const cups = report.pos.cups
      .filter((line) => line.stockItemId === calcSku)
      .reduce((sum, line) => sum + line.qty, 0);
    setCalcMode("cups_to_kg");
    setInputDraft(String(qty(cups)));
    setYieldDraft(String(activeRow?.kgPerCup || Number(yieldDraft) || defaultYieldForCoffeeHouseSku(calcSku)));
  }

  return (
    <div className="space-y-4">
      <Card>
        <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
          <h3 className="font-display text-lg font-semibold">{t("Coffee House sales & stock", "የቡና ቤት ሽያጭ እና ክምችት")}</h3>
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => openCalculator(COFFEE_BEANS_SKU)}
              className="inline-flex h-9 items-center gap-2 rounded-lg border border-border bg-card px-3 text-sm font-medium hover:bg-surface-2"
            >
              <Icons.Calculator className="size-4" />
              {t("Calculator", "ካልኩሌተር")}
            </button>
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
          <Stat label={t("Cups sold", "የተሸጡ ኩባያዎች")} value={String(qty(report.totalCups))} icon="CupSoda" />
          <Stat label={t("Sales", "ሽያጭ")} value={money(report.totalRevenue)} icon="Wallet" tone="gold" />
          <Stat label={t("Beans", "ቡና")} value={`${qty(report.beansOnHand)} kg`} icon="Coffee" />
          <Stat label={t("Ginger", "ዝንጅብል")} value={`${qty(report.gingerOnHand)} kg`} icon="Flower2" />
          <Stat label={t("Milk", "ወተት")} value={`${qty(report.milkOnHand)} L`} icon="Milk" />
        </div>
      </Card>

      <Card>
        <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
          <h4 className="font-semibold">{t("Stock check vs sales", "ክምችት ከሽያጭ ጋር")}</h4>
          <div className="flex items-center gap-2">
            <Chip tone="teff">{report.stockRows.length}</Chip>
            <button
              type="button"
              onClick={() => openCalculator(COFFEE_BEANS_SKU)}
              className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-border bg-card px-2.5 text-xs hover:bg-surface-2"
            >
              <Icons.Calculator className="size-3.5" />
              {t("Open calculator", "ካልኩሌተር ክፈት")}
            </button>
          </div>
        </div>
        <div className="overflow-x-auto rounded-lg border border-border">
          <table className="w-full text-sm">
            <thead className="bg-surface-2 text-xs uppercase tracking-wider text-muted-foreground">
              <tr>
                <th className="text-left px-3 py-2">{t("Item", "እቃ")}</th>
                <th className="text-right px-3 py-2">{t("On hand", "ባለ እጅ")}</th>
                <th className="text-right px-3 py-2">{t("From sales", "ከሽያጭ")}</th>
                <th className="text-right px-3 py-2">{t("Posted DC", "የተለጠፈ")}</th>
                <th className="text-right px-3 py-2">{t("Variance", "ልዩነት")}</th>
                <th className="text-right px-3 py-2">{t("Cups left", "ቀሪ ኩባያ")}</th>
                <th className="text-right px-3 py-2">{t("Check", "አስላ")}</th>
              </tr>
            </thead>
            <tbody>
              {report.stockRows.map((row) => {
                const varianceTone =
                  Math.abs(row.varianceSuggestedVsPosted) < 0.001
                    ? "text-muted-foreground"
                    : row.varianceSuggestedVsPosted > 0
                      ? "text-destructive"
                      : "text-teff";
                return (
                  <tr key={row.itemId} className="border-t border-border">
                    <td className="px-3 py-2">
                      <div className="font-medium">{row.itemName}</div>
                      <div className="text-xs text-muted-foreground">
                        {qty(row.kgPerCup)} {row.unit}/{t("cup", "ኩባያ")}
                      </div>
                    </td>
                    <td className="px-3 py-2 text-right font-mono">
                      {qty(row.onHandKg)} <span className="text-muted-foreground text-xs">{row.unit}</span>
                    </td>
                    <td className="px-3 py-2 text-right font-mono">{qty(row.suggestedKg)}</td>
                    <td className="px-3 py-2 text-right font-mono">{qty(row.postedKg)}</td>
                    <td className={`px-3 py-2 text-right font-mono ${varianceTone}`}>
                      {qty(row.varianceSuggestedVsPosted)}
                    </td>
                    <td className="px-3 py-2 text-right font-mono">{qty(row.cupsPossible)}</td>
                    <td className="px-3 py-2 text-right">
                      <button
                        type="button"
                        onClick={() => openCalculator(row.itemId as CoffeeHouseRawSkuId)}
                        className="inline-flex h-8 items-center gap-1 rounded-lg border border-border px-2 text-xs hover:bg-surface-2"
                        title={t("Check with calculator", "በካልኩሌተር አስላ")}
                      >
                        <Icons.Calculator className="size-3.5" />
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Card>

      {!compact ? (
        <Card>
          <div className="flex items-center justify-between mb-3">
            <h4 className="font-semibold">{t("POS cups detail", "የPOS ኩባያ ዝርዝር")}</h4>
            <Chip tone="muted">{report.pos.cups.length}</Chip>
          </div>
          <div className="overflow-x-auto rounded-lg border border-border">
            <table className="w-full text-sm">
              <thead className="bg-surface-2 text-xs uppercase tracking-wider text-muted-foreground">
                <tr>
                  <th className="text-left px-3 py-2">{t("Drink", "መጠጥ")}</th>
                  <th className="text-right px-3 py-2">{t("Cups", "ኩባያ")}</th>
                  <th className="text-right px-3 py-2">{t("Sales", "ሽያጭ")}</th>
                  <th className="text-right px-3 py-2">{t("Yield/cup", "ምርት/ኩባያ")}</th>
                  <th className="text-right px-3 py-2">{t("Suggested", "የተጠቆመ")}</th>
                  <th className="text-left px-3 py-2">{t("Maps to", "ወደ")}</th>
                </tr>
              </thead>
              <tbody>
                {report.pos.cups.map((line) => (
                  <tr key={`${line.productId ?? ""}-${line.productName}`} className="border-t border-border">
                    <td className="px-3 py-2 font-medium">{line.productName}</td>
                    <td className="px-3 py-2 text-right font-mono">{qty(line.qty)}</td>
                    <td className="px-3 py-2 text-right font-mono">{money(line.revenue)}</td>
                    <td className="px-3 py-2 text-right font-mono">{line.yieldKgPerCup > 0 ? qty(line.yieldKgPerCup) : "—"}</td>
                    <td className="px-3 py-2 text-right font-mono">{line.suggestedKg > 0 ? qty(line.suggestedKg) : "—"}</td>
                    <td className="px-3 py-2 text-muted-foreground text-xs">
                      {line.stockItemId ? skuLabel(t, line.stockItemId) : t("Unmapped", "ያልተገናኘ")}
                    </td>
                  </tr>
                ))}
                {report.pos.cups.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="px-3 py-8 text-center text-muted-foreground">
                      {t("No Coffee House POS sales for this date.", "ለዚህ ቀን የቡና ቤት POS ሽያጭ የለም።")}
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        </Card>
      ) : null}

      <Dialog open={calcOpen} onOpenChange={setCalcOpen}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Icons.Calculator className="size-5" />
              {t("Cups ↔ stock calculator", "ኩባያ ↔ ክምችት ካልኩሌተር")}
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-3 py-1">
            <div className="flex flex-wrap gap-2">
              {COFFEE_HOUSE_RAW_STOCK.map((raw) => {
                const row = report.stockRows.find((line) => line.itemId === raw.id);
                return (
                  <button
                    key={raw.id}
                    type="button"
                    onClick={() => selectSku(raw.id)}
                    className={`h-8 px-3 rounded-lg border text-xs ${calcSku === raw.id ? "bg-ember text-ember-foreground border-ember" : "bg-card border-border"}`}
                  >
                    {skuLabel(t, raw.id)} · {qty(row?.onHandKg ?? 0)} {row?.unit ?? raw.defaultUnit}
                  </button>
                );
              })}
            </div>

            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => setCalcMode("cups_to_kg")}
                className={`h-8 px-3 rounded-lg border text-xs ${calcMode === "cups_to_kg" ? "bg-surface-2 border-border font-semibold" : "bg-card border-border"}`}
              >
                {t("Cups → stock", "ኩባያ → ክምችት")}
              </button>
              <button
                type="button"
                onClick={() => setCalcMode("kg_to_cups")}
                className={`h-8 px-3 rounded-lg border text-xs ${calcMode === "kg_to_cups" ? "bg-surface-2 border-border font-semibold" : "bg-card border-border"}`}
              >
                {t("Stock → cups", "ክምችት → ኩባያ")}
              </button>
            </div>

            <div className="grid sm:grid-cols-2 gap-3">
              <label className="text-sm space-y-1">
                <span className="text-muted-foreground">
                  {calcMode === "cups_to_kg" ? t("Cups", "ኩባያዎች") : t(`On hand (${unit})`, `ባለ እጅ (${unit})`)}
                </span>
                <input
                  type="number"
                  min="0"
                  step="0.001"
                  className="w-full h-10 rounded-lg border bg-background px-3 font-mono"
                  value={inputDraft}
                  onChange={(event) => setInputDraft(event.target.value)}
                />
              </label>
              <label className="text-sm space-y-1">
                <span className="text-muted-foreground">
                  {t(`Yield (${unit} per cup)`, `ምርት (${unit} በኩባያ)`)}
                </span>
                <input
                  type="number"
                  min="0"
                  step="0.001"
                  className="w-full h-10 rounded-lg border bg-background px-3 font-mono"
                  value={yieldDraft}
                  onChange={(event) => setYieldDraft(event.target.value)}
                />
              </label>
            </div>

            <div className="flex flex-wrap gap-2">
              <button type="button" onClick={useSoldCupsInCalculator} className="h-8 px-3 rounded-lg border border-border text-xs hover:bg-surface-2">
                {t("Use sold cups", "የተሸጡ ኩባያዎችን ተጠቀም")}
              </button>
              <button type="button" onClick={useOnHandInCalculator} className="h-8 px-3 rounded-lg border border-border text-xs hover:bg-surface-2">
                {t("Use on-hand stock", "ባለ እጅ ክምችት ተጠቀም")}
              </button>
            </div>

            <div className={`rounded-lg border px-3 py-3 ${stockCheck.ok ? "border-border bg-surface-2/40" : "border-destructive/40 bg-destructive/10"}`}>
              <div className="text-xs text-muted-foreground mb-1">{calcResult.label}</div>
              <div className="font-display text-2xl font-semibold font-mono">
                {qty(calcResult.value)} <span className="text-base font-sans text-muted-foreground">{calcResult.unit}</span>
              </div>
              <div className="text-xs mt-2">{stockCheck.message}</div>
            </div>
          </div>

          <DialogFooter>
            <button
              type="button"
              onClick={() => setCalcOpen(false)}
              className="h-9 px-4 rounded-lg border border-border bg-card text-sm hover:bg-surface-2"
            >
              {t("Close", "ዝጋ")}
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
