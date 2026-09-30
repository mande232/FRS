import { useMemo, useState, type ReactNode } from "react";
import * as Icons from "lucide-react";

import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { CoffeeHouseOpsPanel } from "@/components/stock/coffee-house-ops-panel";
import { KitchenOpsPanel } from "@/components/stock/kitchen-ops-panel";
import { Card, Chip } from "@/components/ui-kit";
import {
  buildCoffeeHousePosCupSummary,
  buildDailyConsumptionTableRows,
  COFFEE_BEANS_SKU,
  DAILY_CONSUMPTION_DEPARTMENTS,
  isDailyConsumptionDepartment,
  TEA_LEAVES_SKU,
  type DailyConsumptionDepartment,
  type DailyConsumptionDocument,
  type DailyConsumptionLine,
} from "@/lib/daily-consumption";
import type { SalesRecord } from "@/lib/demo-data";
import { stockLocationLabel } from "@/lib/inventory-access";
import { buildKitchenWorkspaceReport } from "@/lib/kitchen-ops";
import { useT } from "@/lib/i18n";
import { showError, showSuccess } from "@/lib/toast";
import type { StockLedgerEntry, StockLocationBalance, StockManagedItem, StockRecipe } from "@/lib/stock-management";

function qty(value: number) {
  return Math.round((Number.isFinite(value) ? value : 0) * 1000) / 1000;
}

function money(value: number) {
  return Math.round((Number.isFinite(value) ? value : 0) * 100) / 100;
}

function SectionCard({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  return (
    <Card>
      <div className="mb-4">
        <h3 className="font-display text-lg font-semibold">{title}</h3>
      </div>
      {children}
    </Card>
  );
}

export function DailyConsumptionPanel({
  department,
  departmentOptions,
  balances,
  items,
  history,
  salesRecords = [],
  recipes = [],
  ledger = [],
  onPost,
  userName,
  canApprove,
}: {
  department: DailyConsumptionDepartment;
  departmentOptions: DailyConsumptionDepartment[];
  balances: StockLocationBalance[];
  items: StockManagedItem[];
  history: DailyConsumptionDocument[];
  salesRecords?: SalesRecord[];
  recipes?: StockRecipe[];
  ledger?: StockLedgerEntry[];
  onPost: (input: {
    department: DailyConsumptionDepartment;
    consumptionDate: string;
    shift?: string;
    approvedBy?: string;
    notes?: string;
    lines: Array<{ itemId: string; consumedQuantity: number; notes?: string }>;
  }) => void;
  userName: string;
  canApprove: boolean;
}) {
  const t = useT();
  const [consumptionDate, setConsumptionDate] = useState(new Date().toISOString().slice(0, 10));
  const [shift, setShift] = useState("");
  const [approvedBy, setApprovedBy] = useState("");
  const [notes, setNotes] = useState("");
  const [selectedDepartment, setSelectedDepartment] = useState(department);
  const [consumedByItem, setConsumedByItem] = useState<Record<string, string>>({});
  const [viewDoc, setViewDoc] = useState<DailyConsumptionDocument | null>(null);

  const tableRows = useMemo(() => {
    const draftLines = Object.entries(consumedByItem)
      .filter(([, value]) => Number(value) > 0)
      .map(([itemId, value]) => ({ itemId, consumedQuantity: Number(value) }));
    return buildDailyConsumptionTableRows({
      department: selectedDepartment,
      items,
      balances,
      draftLines,
    });
  }, [selectedDepartment, items, balances, consumedByItem]);

  const allRows = useMemo(
    () =>
      buildDailyConsumptionTableRows({
        department: selectedDepartment,
        items,
        balances,
      }),
    [selectedDepartment, items, balances],
  );

  const posCupSummary = useMemo(() => {
    if (selectedDepartment !== "Coffee House") return null;
    return buildCoffeeHousePosCupSummary({
      salesRecords,
      date: consumptionDate,
      recipes,
    });
  }, [selectedDepartment, salesRecords, consumptionDate, recipes]);

  const kitchenReport = useMemo(() => {
    if (selectedDepartment !== "Kitchen") return null;
    return buildKitchenWorkspaceReport({
      salesRecords,
      balances,
      items,
      ledger,
      dailyConsumptions: history,
      recipes,
      date: consumptionDate,
    });
  }, [selectedDepartment, salesRecords, balances, items, ledger, history, recipes, consumptionDate]);

  const lowStockWarnings = tableRows.filter((row) => row.consumedQuantity > 0 && row.lowStock);
  const overStockWarnings = tableRows.filter(
    (row) => row.consumedQuantity > 0 && row.consumedQuantity > row.quantityBefore + 0.0001,
  );

  function setConsumed(itemId: string, value: string) {
    setConsumedByItem((prev) => ({ ...prev, [itemId]: value }));
  }

  function applySuggestedFromSales() {
    if (posCupSummary) {
      const next: Record<string, string> = { ...consumedByItem };
      let applied = 0;
      for (const [itemId, suggested] of Object.entries(posCupSummary.suggestedByItemId)) {
        if (!(suggested > 0)) continue;
        if (!allRows.some((row) => row.itemId === itemId)) continue;
        next[itemId] = String(suggested);
        applied += 1;
      }
      if (applied === 0) {
        showError(
          t(
            "No coffee/tea cup sales mapped to stock for this date.",
            "ለዚህ ቀን ወደ ክምችት የሚዛመድ የቡና/ሻይ ኩባያ ሽያጭ የለም።",
          ),
        );
        return;
      }
      setConsumedByItem(next);
      showSuccess(
        t(
          `Filled consumed kg from ${posCupSummary.totalCups} POS cups.`,
          `ከ ${posCupSummary.totalCups} POS ኩባያዎች የተጠቀመ ኪ.ግ ተሞልቷል።`,
        ),
      );
      return;
    }

    if (kitchenReport) {
      const next: Record<string, string> = { ...consumedByItem };
      let applied = 0;
      for (const [itemId, suggested] of Object.entries(kitchenReport.suggestedDcByItemId)) {
        if (!(suggested > 0)) continue;
        if (!allRows.some((row) => row.itemId === itemId)) continue;
        next[itemId] = String(suggested);
        applied += 1;
      }
      if (applied === 0) {
        showError(
          t(
            "No Kitchen recipe gap to post (already covered by POS or no mapped sales).",
            "ለማለጠፍ የኩሽና አዘገጃጀት ክፍተት የለም (በPOS ተሸፍኗል ወይም የተገናኘ ሽያጭ የለም)።",
          ),
        );
        return;
      }
      setConsumedByItem(next);
      showSuccess(
        t(
          `Filled DC from recipe sales gap (${kitchenReport.totalPlates} plates).`,
          `ከአዘገጃጀት ሽያጭ ክፍተት ዕለታዊ መጠቀም ተሞልቷል (${kitchenReport.totalPlates} ሳህን)።`,
        ),
      );
    }
  }

  function handlePost() {
    const lines = Object.entries(consumedByItem)
      .map(([itemId, value]) => ({
        itemId,
        consumedQuantity: Number(value),
      }))
      .filter((line) => Number.isFinite(line.consumedQuantity) && line.consumedQuantity > 0);

    if (lines.length === 0) {
      showError(t("Enter consumed quantity for at least one item.", "ለቢያንስ አንድ እቃ የተጠቀመ ብዛት ያስገቡ።"));
      return;
    }

    if (overStockWarnings.length > 0) {
      showError(
        t(
          `Consumed quantity exceeds available stock for ${overStockWarnings[0]?.itemName}.`,
          `የተጠቀመው ብዛት ለ ${overStockWarnings[0]?.itemName} ከሚገኝ ክምችት በላይ ነው።`,
        ),
      );
      return;
    }

    onPost({
      department: selectedDepartment,
      consumptionDate,
      shift: shift.trim() || undefined,
      approvedBy: canApprove ? approvedBy.trim() || userName : undefined,
      notes: notes.trim() || undefined,
      lines,
    });
    setConsumedByItem({});
    setNotes("");
  }

  const postedHistory = history
    .filter((doc) => doc.department === selectedDepartment)
    .sort((a, b) => b.consumptionDate.localeCompare(a.consumptionDate) || b.consumptionNumber.localeCompare(a.consumptionNumber));

  return (
    <div className="space-y-4">
      {selectedDepartment === "Coffee House" ? (
        <CoffeeHouseOpsPanel
          compact
          salesRecords={salesRecords}
          balances={balances}
          items={items}
          dailyConsumptions={history}
          recipes={recipes}
          date={consumptionDate}
          onDateChange={setConsumptionDate}
        />
      ) : null}

      {selectedDepartment === "Kitchen" ? (
        <KitchenOpsPanel
          compact
          salesRecords={salesRecords}
          balances={balances}
          items={items}
          ledger={ledger}
          dailyConsumptions={history}
          recipes={recipes}
          date={consumptionDate}
          onDateChange={setConsumptionDate}
        />
      ) : null}

      <SectionCard title={t("Daily Consumption", "ዕለታዊ ቁሳቁስ መጠቀም")}>
        <div className="grid md:grid-cols-2 xl:grid-cols-4 gap-3 mb-4">
          {departmentOptions.length > 1 ? (
            <label className="text-sm space-y-1">
              <span className="text-muted-foreground">{t("Department", "ክፍል")}</span>
              <select
                className="w-full h-10 rounded-lg border bg-background px-3"
                value={selectedDepartment}
                onChange={(event) => {
                  const next = event.target.value;
                  if (isDailyConsumptionDepartment(next)) setSelectedDepartment(next);
                }}
              >
                {departmentOptions.map((option) => (
                  <option key={option} value={option}>
                    {stockLocationLabel(option)}
                  </option>
                ))}
              </select>
            </label>
          ) : (
            <label className="text-sm space-y-1">
              <span className="text-muted-foreground">{t("Department", "ክፍል")}</span>
              <div className="h-10 flex items-center px-3 rounded-lg border bg-surface-2/40 font-medium">
                {stockLocationLabel(selectedDepartment)}
              </div>
            </label>
          )}
          <label className="text-sm space-y-1">
            <span className="text-muted-foreground">{t("Date", "ቀን")}</span>
            <input
              type="date"
              className="w-full h-10 rounded-lg border bg-background px-3"
              value={consumptionDate}
              onChange={(event) => setConsumptionDate(event.target.value)}
            />
          </label>
          <label className="text-sm space-y-1">
            <span className="text-muted-foreground">{t("Shift (optional)", "መደብ (አማራጭ)")}</span>
            <input
              className="w-full h-10 rounded-lg border bg-background px-3"
              value={shift}
              onChange={(event) => setShift(event.target.value)}
              placeholder={t("Morning / Evening", "ጠዋት / ማታ")}
            />
          </label>
          <label className="text-sm space-y-1">
            <span className="text-muted-foreground">{t("Prepared by", "ያዘጋጀ")}</span>
            <div className="h-10 flex items-center px-3 rounded-lg border bg-surface-2/40">{userName}</div>
          </label>
          {canApprove ? (
            <label className="text-sm space-y-1 md:col-span-2">
              <span className="text-muted-foreground">{t("Approved by (optional)", "ያፀደቀ (አማራጭ)")}</span>
              <input
                className="w-full h-10 rounded-lg border bg-background px-3"
                value={approvedBy}
                onChange={(event) => setApprovedBy(event.target.value)}
                placeholder={userName}
              />
            </label>
          ) : null}
        </div>

        {posCupSummary ? (
          <div className="mb-4 rounded-lg border border-border bg-surface-2/30 p-3 flex flex-wrap items-center justify-between gap-2">
            <div>
              <div className="font-medium">{t("Prefill consumed kg from POS", "ከPOS የተጠቀመ ኪ.ግ ሙላ")}</div>
              <div className="text-xs text-muted-foreground">
                {t(
                  `${posCupSummary.totalCups} cups · suggested beans ${qty(posCupSummary.suggestedByItemId[COFFEE_BEANS_SKU] ?? 0)} kg · tea ${qty(posCupSummary.suggestedByItemId[TEA_LEAVES_SKU] ?? 0)} kg · ginger ${qty(posCupSummary.suggestedByItemId["stk-ginger"] ?? 0)} kg · nuts ${qty(posCupSummary.suggestedByItemId["stk-nuts"] ?? 0)} kg · milk ${qty(posCupSummary.suggestedByItemId["stk-milk"] ?? 0)} L`,
                  `${posCupSummary.totalCups} ኩባያ · ቡና ${qty(posCupSummary.suggestedByItemId[COFFEE_BEANS_SKU] ?? 0)} ኪ.ግ · ሻይ ${qty(posCupSummary.suggestedByItemId[TEA_LEAVES_SKU] ?? 0)} ኪ.ግ · ዝንጅብል ${qty(posCupSummary.suggestedByItemId["stk-ginger"] ?? 0)} ኪ.ግ · ለውዝ ${qty(posCupSummary.suggestedByItemId["stk-nuts"] ?? 0)} ኪ.ግ · ወተት ${qty(posCupSummary.suggestedByItemId["stk-milk"] ?? 0)} ሊትር`,
                )}
              </div>
            </div>
            <button
              type="button"
              onClick={applySuggestedFromSales}
              className="h-9 px-3 rounded-lg border border-border bg-card text-sm hover:bg-surface-2 inline-flex items-center gap-2"
            >
              <Icons.ClipboardList className="size-4" />
              {t("Apply from sales", "ከሽያጭ ሙላ")}
            </button>
          </div>
        ) : null}

        {kitchenReport ? (
          <div className="mb-4 rounded-lg border border-border bg-surface-2/30 p-3 flex flex-wrap items-center justify-between gap-2">
            <div>
              <div className="font-medium">{t("Prefill DC gap from recipes", "ከአዘገጃጀት የዕለታዊ ክፍተት ሙላ")}</div>
              <div className="text-xs text-muted-foreground">
                {t(
                  `${kitchenReport.totalPlates} plates · ${Object.keys(kitchenReport.suggestedDcByItemId).length} items still need DC after POS`,
                  `${kitchenReport.totalPlates} ሳህን · ከPOS በኋላ ${Object.keys(kitchenReport.suggestedDcByItemId).length} እቃዎች ዕለታዊ ይፈልጋሉ`,
                )}
              </div>
            </div>
            <button
              type="button"
              onClick={applySuggestedFromSales}
              className="h-9 px-3 rounded-lg border border-border bg-card text-sm hover:bg-surface-2 inline-flex items-center gap-2"
            >
              <Icons.ClipboardList className="size-4" />
              {t("Apply from recipes", "ከአዘገጃጀት ሙላ")}
            </button>
          </div>
        ) : null}

        {(lowStockWarnings.length > 0 || overStockWarnings.length > 0) && (
          <div className="mb-4 space-y-2">
            {overStockWarnings.map((row) => (
              <div key={`over-${row.itemId}`} className="rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm">
                {t(`${row.itemName}: consumed ${row.consumedQuantity} exceeds available ${row.quantityBefore} ${row.unit}.`, `${row.itemName}: የተጠቀመ ${row.consumedQuantity} ከሚገኝ ${row.quantityBefore} ${row.unit} በላይ ነው።`)}
              </div>
            ))}
            {lowStockWarnings.map((row) => (
              <div key={`low-${row.itemId}`} className="rounded-lg border border-gold/40 bg-gold/10 px-3 py-2 text-sm">
                {t(`${row.itemName} will fall to reorder level (${row.reorderLevel} ${row.unit}).`, `${row.itemName} ወደ የመደገፊያ ደረጃ (${row.reorderLevel} ${row.unit}) ይወርዳል።`)}
              </div>
            ))}
          </div>
        )}

        <div className="overflow-x-auto rounded-lg border border-border">
          <table className="w-full text-sm">
            <thead className="bg-surface-2 text-xs uppercase tracking-wider text-muted-foreground">
              <tr>
                <th className="text-left px-3 py-2">{t("Item", "እቃ")}</th>
                <th className="text-right px-3 py-2">{t("Current", "አሁን")}</th>
                <th className="text-left px-3 py-2">{t("Unit", "አሃድ")}</th>
                <th className="text-right px-3 py-2">{t("Reorder", "መደገፊያ")}</th>
                <th className="text-right px-3 py-2">{t("From sales", "ከሽያጭ")}</th>
                <th className="text-right px-3 py-2">{t("Consumed", "ተጠቀመ")}</th>
                <th className="text-right px-3 py-2">{t("Remaining", "ቀርቷል")}</th>
              </tr>
            </thead>
            <tbody>
              {allRows.map((row) => (
                <ConsumptionRow
                  key={row.itemId}
                  row={row}
                  value={consumedByItem[row.itemId] ?? ""}
                  suggested={
                    posCupSummary?.suggestedByItemId[row.itemId] ??
                    kitchenReport?.suggestedDcByItemId[row.itemId]
                  }
                  onChange={setConsumed}
                  t={t}
                />
              ))}
              {allRows.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-3 py-8 text-center text-muted-foreground">
                    {t("No stock on hand at this department.", "በዚህ ክፍል ባለ እጅ ክምችት የለም።")}
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>

        <label className="text-sm space-y-1 block mt-4">
          <span className="text-muted-foreground">{t("Remarks", "ማስታወሻ")}</span>
          <textarea
            className="w-full min-h-[4rem] rounded-lg border bg-background px-3 py-2"
            value={notes}
            onChange={(event) => setNotes(event.target.value)}
          />
        </label>

        <div className="mt-4 flex justify-end">
          <button
            type="button"
            onClick={handlePost}
            className="h-10 px-4 rounded-lg bg-ember text-ember-foreground text-sm font-semibold inline-flex items-center gap-2"
          >
            <Icons.ClipboardCheck className="size-4" />
            {t("Post daily consumption", "ዕለታዊ ቁሳቁስ መጠቀም ለጥፍ")}
          </button>
        </div>
      </SectionCard>

      <SectionCard title={t("Consumption history", "የመጠቀም ታሪክ")}>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-surface-2 text-xs uppercase tracking-wider text-muted-foreground">
              <tr>
                <th className="text-left px-3 py-2">{t("Date", "ቀን")}</th>
                <th className="text-left px-3 py-2">{t("Reference", "ማጣቀሻ")}</th>
                <th className="text-right px-3 py-2">{t("Items", "እቃዎች")}</th>
                <th className="text-right px-3 py-2">{t("Qty", "ብዛት")}</th>
                <th className="text-left px-3 py-2">{t("Posted by", "ለጣፈ")}</th>
                <th className="text-right px-3 py-2">{t("Actions", "እርምጃ")}</th>
              </tr>
            </thead>
            <tbody>
              {postedHistory.map((doc) => (
                <tr key={doc.id} className="border-t border-border hover:bg-surface-2/60">
                  <td className="px-3 py-2">{doc.consumptionDate}</td>
                  <td className="px-3 py-2 font-medium">{doc.consumptionNumber}</td>
                  <td className="px-3 py-2 text-right font-mono">{doc.lines.filter((line) => line.consumedQuantity > 0).length}</td>
                  <td className="px-3 py-2 text-right font-mono">{qty(doc.totalConsumedQuantity)}</td>
                  <td className="px-3 py-2">{doc.postedBy ?? doc.preparedBy}</td>
                  <td className="px-3 py-2 text-right">
                    <button type="button" onClick={() => setViewDoc(doc)} className="text-xs text-ember hover:underline">
                      {t("View", "አሳይ")}
                    </button>
                  </td>
                </tr>
              ))}
              {postedHistory.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-3 py-8 text-center text-muted-foreground">
                    {t("No posted daily consumption yet.", "ገና የተለጠፈ ዕለታዊ መጠቀም የለም።")}
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </SectionCard>

      <Dialog open={Boolean(viewDoc)} onOpenChange={(open) => !open && setViewDoc(null)}>
        <DialogContent className="max-w-lg">
          {viewDoc ? (
            <>
              <DialogHeader>
                <DialogTitle>
                  {viewDoc.consumptionNumber} · {stockLocationLabel(viewDoc.department)} · {viewDoc.consumptionDate}
                </DialogTitle>
              </DialogHeader>
              <div className="flex flex-wrap gap-2 mb-2">
                <Chip tone="teff">{t("Posted", "ተለጥፏል")}</Chip>
                {viewDoc.shift ? <Chip tone="muted">{viewDoc.shift}</Chip> : null}
              </div>
              <div className="overflow-x-auto rounded-lg border border-border">
                <table className="w-full text-sm">
                  <thead className="bg-surface-2 text-xs uppercase text-muted-foreground">
                    <tr>
                      <th className="text-left px-3 py-2">{t("Item", "እቃ")}</th>
                      <th className="text-right px-3 py-2">{t("Before", "ከዚህ በፊት")}</th>
                      <th className="text-right px-3 py-2">{t("Consumed", "ተጠቀመ")}</th>
                      <th className="text-right px-3 py-2">{t("After", "ከዚህ በኋላ")}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {viewDoc.lines
                      .filter((line) => line.consumedQuantity > 0)
                      .map((line) => (
                        <tr key={line.id} className="border-t border-border">
                          <td className="px-3 py-2">{line.itemName}</td>
                          <td className="px-3 py-2 text-right font-mono">{qty(line.quantityBefore)}</td>
                          <td className="px-3 py-2 text-right font-mono">{qty(line.consumedQuantity)}</td>
                          <td className="px-3 py-2 text-right font-mono">{qty(line.quantityAfter)}</td>
                        </tr>
                      ))}
                  </tbody>
                </table>
              </div>
              {viewDoc.notes ? <p className="mt-3 text-sm text-muted-foreground">{viewDoc.notes}</p> : null}
              <DialogFooter className="mt-4 gap-2">
                <button type="button" onClick={() => window.print()} className="h-9 px-3 rounded-lg border border-border text-sm">
                  {t("Print", "አትም")}
                </button>
                <button type="button" onClick={() => setViewDoc(null)} className="h-9 px-3 rounded-lg border border-border text-sm">
                  {t("Close", "ዝጋ")}
                </button>
              </DialogFooter>
            </>
          ) : null}
        </DialogContent>
      </Dialog>
    </div>
  );
}

function ConsumptionRow({
  row,
  value,
  suggested,
  onChange,
  t,
}: {
  row: DailyConsumptionLine;
  value: string;
  suggested?: number;
  onChange: (itemId: string, value: string) => void;
  t: (en: string, am: string) => string;
}) {
  const consumed = Number(value || 0);
  const remaining = qty(row.quantityBefore - (Number.isFinite(consumed) ? consumed : 0));
  const isLow = consumed > 0 && remaining <= row.reorderLevel;
  const isOver = consumed > row.quantityBefore + 0.0001;

  return (
    <tr className={`border-t border-border ${isOver ? "bg-destructive/5" : isLow ? "bg-gold/5" : ""}`}>
      <td className="px-3 py-2">
        <div className="font-medium">{row.itemName}</div>
      </td>
      <td className="px-3 py-2 text-right font-mono">{qty(row.quantityBefore)}</td>
      <td className="px-3 py-2">{row.unit}</td>
      <td className="px-3 py-2 text-right font-mono">{row.reorderLevel}</td>
      <td className="px-3 py-2 text-right font-mono text-muted-foreground">
        {suggested != null && suggested > 0 ? qty(suggested) : "—"}
      </td>
      <td className="px-3 py-2 text-right">
        <input
          type="number"
          min="0"
          step="0.001"
          className="w-24 h-8 rounded border bg-background px-2 text-right font-mono"
          value={value}
          onChange={(event) => onChange(row.itemId, event.target.value)}
          aria-label={t(`Consumed ${row.itemName}`, `ተጠቀመ ${row.itemName}`)}
        />
      </td>
      <td className="px-3 py-2 text-right font-mono">{remaining}</td>
    </tr>
  );
}

export function resolveDailyConsumptionDepartments(
  workspace: string,
  assignedLocations: string[],
): DailyConsumptionDepartment[] {
  if (workspace === "Kitchen" || workspace === "Coffee House") {
    return [workspace];
  }
  const fromAssigned = assignedLocations.filter(isDailyConsumptionDepartment);
  if (fromAssigned.length > 0) return fromAssigned;
  return [...DAILY_CONSUMPTION_DEPARTMENTS];
}
