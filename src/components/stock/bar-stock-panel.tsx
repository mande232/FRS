import { useEffect, useMemo, useState } from "react";
import * as Icons from "lucide-react";

import { Button, buttonVariants } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Card, Chip, Stat } from "@/components/ui-kit";
import { cn } from "@/lib/utils";
import {
  buildBarStockDailyReceivedMap,
  buildBarStockReport,
  buildBarStockSnapshot,
  buildBeerCategorySummaries,
  canExpandBarStockGroup,
  getBarStockReceivedForDate,
  isBeerCategoryGroup,
  resolveBarStockSearch,
  sortBarStockGroupItems,
  sumBarStockDisplayMetrics,
  type BarStockDailyReceivedSummary,
  type BarStockGroupRollup,
  type BarStockItemMetrics,
  type BarStockReceivedLine,
  type BarStockReportKind,
  type BarStockReportRow,
  type BarStockSnapshot,
  type BarStockSortKey,
} from "@/lib/bar-stock-view";
import { formatEthiopic } from "@/lib/ethiopic";
import { stockLocationLabel } from "@/lib/inventory-access";
import { useCalendar, useLang, type AppCalendar } from "@/lib/lang-context";
import { useT } from "@/lib/i18n";
import type { SalesRecord } from "@/lib/demo-data";
import type {
  StockClosingRecord,
  StockLedgerEntry,
  StockLocation,
  StockLocationBalance,
  StockManagedItem,
} from "@/lib/stock-management";

const EXPANDED_STORAGE_PREFIX = "ethioplate.bar-stock.expanded";

const BEER_REPORT_OPTIONS: Array<{ kind: BarStockReportKind; label: string }> = [
  { kind: "special-summary", label: "Special Beer Summary" },
  { kind: "draft-summary", label: "Draft Beer Summary" },
  { kind: "normal-summary", label: "Normal Beer Summary" },
  { kind: "brand-performance", label: "Beer Brand Performance" },
  { kind: "inventory-valuation", label: "Beer Inventory Valuation" },
  { kind: "sales-report", label: "Beer Sales Report" },
];

const VIP_REPORT_OPTIONS: Array<{ kind: BarStockReportKind; label: string }> = [
  { kind: "whisky-summary", label: "Whisky Sold Summary" },
  { kind: "spirit-category-summary", label: "Sold by Category" },
  { kind: "spirit-brand-performance", label: "Sold Brand Performance" },
  { kind: "spirit-inventory-valuation", label: "Sold — Remaining Stock" },
  { kind: "spirit-sales-report", label: "Spirit Sales Report" },
];

function defaultReportKind(workspace: StockLocation): BarStockReportKind {
  return workspace === "VIP Bar" ? "whisky-summary" : "special-summary";
}

function reportRowHasPourMetrics(row: BarStockReportRow) {
  return (
    row.soldDoubleShots != null ||
    row.soldSingleShots != null ||
    row.remainingDoubles != null
  );
}

function reportRowToMetrics(row: BarStockReportRow): BarStockItemMetrics {
  return {
    itemId: row.label,
    itemName: row.label,
    category: "Whisky",
    unit: row.unit,
    stock: row.opening,
    inTransit: 0,
    newEntered: row.received,
    total: row.total,
    sold: row.sold,
    damageWastage: row.damageWastage,
    staffConsumption: row.staffConsumption,
    left: row.left,
    onHand: row.left,
    soldBottles: row.soldBottles,
    soldDoubleShots: row.soldDoubleShots,
    soldSingleShots: row.soldSingleShots,
    remainingDoubles: row.remainingDoubles,
    remainingSingles: row.remainingSingles,
    bottleVolumeMl: row.bottleVolumeMl,
  };
}

const SORTABLE_COLUMNS: Array<{ key: BarStockSortKey; label: string; labelAm: string }> = [
  { key: "name", label: "Category", labelAm: "ምድብ" },
  { key: "opening", label: "Opening", labelAm: "መክፈቻ" },
  { key: "received", label: "Received", labelAm: "የተቀበለ" },
  { key: "total", label: "Total", labelAm: "ጠቅላላ" },
  { key: "sold", label: "Sold", labelAm: "ተሸጠ" },
  { key: "damageWastage", label: "Damage / Wastage", labelAm: "ጉዳት / ብክነት" },
  { key: "staffConsumption", label: "Staff consumption", labelAm: "የሰራተኛ ፍጆታ" },
  { key: "left", label: "Left", labelAm: "ቀርቷል" },
];

function qty(value: number) {
  const rounded = Math.round((Number.isFinite(value) ? value : 0) * 1000) / 1000;
  return Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(1);
}

function money(value: number) {
  return `${value.toLocaleString(undefined, { maximumFractionDigits: 0 })} ETB`;
}

function pluralUnit(unit: string, count: number) {
  if (unit.toLowerCase() === "bottle") return count === 1 ? "Bottle" : "Bottles";
  return unit;
}

function hasSpiritPourMetrics(row: Pick<BarStockItemMetrics, "soldDoubleShots" | "soldSingleShots" | "remainingDoubles">) {
  return (
    row.soldDoubleShots != null ||
    row.soldSingleShots != null ||
    row.remainingDoubles != null
  );
}

function PourSoldBreakdown({
  row,
  muted = false,
}: {
  row: BarStockItemMetrics;
  muted?: boolean;
}) {
  const t = useT();
  const bottles = row.soldBottles ?? 0;
  const doubles = row.soldDoubleShots ?? 0;
  const singles = row.soldSingleShots ?? 0;
  const lines = [
    bottles > 0 ? { key: "bottle", label: t("Bottle", "ጠርሙስ"), value: bottles } : null,
    singles > 0 ? { key: "single", label: t("Single", "ነጠላ"), value: singles } : null,
    doubles > 0 ? { key: "double", label: t("Double", "ድርብ"), value: doubles } : null,
  ].filter((line): line is { key: string; label: string; value: number } => line != null);

  if (lines.length === 0) {
    return <span className={`font-mono tabular-nums ${muted ? "" : "text-ember"}`}>{qty(row.sold)}</span>;
  }

  const showBottleTotal =
    row.sold > 0 &&
    (doubles > 0 || singles > 0 || Math.abs(row.sold - bottles) > 0.001);

  return (
    <div className="flex flex-col gap-1.5 min-w-[7.5rem] py-0.5 items-end">
      {lines.map((line) => (
        <div key={line.key} className="flex items-baseline justify-end gap-2 text-xs leading-snug w-full">
          <span className="text-muted-foreground whitespace-nowrap shrink-0">{line.label}</span>
          <span className={`font-mono tabular-nums font-semibold whitespace-nowrap ${muted ? "text-muted-foreground" : "text-ember"}`}>
            {qty(line.value)}
          </span>
        </div>
      ))}
      {showBottleTotal ? (
        <div className="border-t border-border/50 pt-1 text-[10px] text-muted-foreground text-right leading-tight whitespace-nowrap w-full">
          {t("≈ {n} bottles total", "≈ {n} ጠርሙስ ጠቅላላ").replace("{n}", qty(row.sold))}
        </div>
      ) : null}
    </div>
  );
}

function PourLeftBreakdown({
  row,
  muted = false,
}: {
  row: BarStockItemMetrics;
  muted?: boolean;
}) {
  const t = useT();
  const doubles = row.remainingDoubles ?? 0;
  const singles = row.remainingSingles ?? 0;
  const valueClass = muted ? "text-muted-foreground" : "text-foreground";

  return (
    <div className="flex flex-col gap-1.5 min-w-[7.5rem] py-0.5 items-end">
      <div className={`text-sm leading-tight whitespace-nowrap ${valueClass}`}>
        <span className="font-mono tabular-nums font-semibold">{qty(row.left)}</span>
        <span className="text-xs text-muted-foreground ml-1.5">{t("bottles", "ጠርሙስ")}</span>
      </div>
      {doubles > 0 ? (
        <div className="text-xs leading-tight whitespace-nowrap">
          <span className="font-mono tabular-nums font-medium">{qty(doubles)}</span>
          <span className="text-muted-foreground ml-1.5">{t("doubles left", "ድርብ ቀርቷል")}</span>
        </div>
      ) : null}
      {singles > 0 ? (
        <div className="text-xs leading-tight whitespace-nowrap">
          <span className="font-mono tabular-nums font-medium">{qty(singles)}</span>
          <span className="text-muted-foreground ml-1.5">{t("singles left", "ነጠላ ቀርቷል")}</span>
        </div>
      ) : null}
      {row.bottleVolumeMl ? (
        <div className="text-[10px] text-muted-foreground leading-tight whitespace-nowrap">
          {row.bottleVolumeMl} ml / {t("bottle", "ጠርሙስ")}
        </div>
      ) : null}
    </div>
  );
}

function dateToKey(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function parseDateKey(key: string) {
  const [year, month, day] = key.split("-").map(Number);
  return new Date(year!, month! - 1, day);
}

function formatDisplayDate(date: Date, lang: "en" | "am", calendar: AppCalendar) {
  if (calendar === "ethiopian") {
    return formatEthiopic(date, lang);
  }
  return date.toLocaleDateString(lang === "am" ? "am-ET" : "en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

function formatTimeLabel(value?: string) {
  if (!value || value.length < 16) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });
}

function usePersistedExpandedGroups(workspace: StockLocation) {
  const storageKey = `${EXPANDED_STORAGE_PREFIX}.${workspace}`;

  const [expanded, setExpanded] = useState<Set<string>>(() => {
    if (typeof window === "undefined") return new Set();
    try {
      const raw = window.localStorage.getItem(storageKey);
      if (raw) return new Set(JSON.parse(raw) as string[]);
    } catch {
      // ignore invalid persisted state
    }
    return new Set();
  });

  useEffect(() => {
    window.localStorage.setItem(storageKey, JSON.stringify([...expanded]));
  }, [expanded, storageKey]);

  const toggle = (groupId: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(groupId)) next.delete(groupId);
      else next.add(groupId);
      return next;
    });
  };

  return { expanded, toggle, setExpanded };
}

function CategoryMetricsCells({
  row,
  bold = false,
  muted = false,
  summaryRow = false,
}: {
  row: BarStockItemMetrics;
  bold?: boolean;
  muted?: boolean;
  vipPourLayout?: boolean;
  summaryRow?: boolean;
}) {
  const cellClass = bold ? "font-semibold text-foreground" : muted ? "text-muted-foreground" : "";
  const spiritPours = hasSpiritPourMetrics(row);
  const showPourStacks = spiritPours && !summaryRow;

  return (
    <>
      <td className={`px-3 py-2.5 text-right font-mono text-sm tabular-nums whitespace-nowrap ${cellClass}`}>{qty(row.stock)}</td>
      <td className={`px-3 py-2.5 text-right font-mono text-sm tabular-nums whitespace-nowrap ${cellClass}`}>{qty(row.newEntered)}</td>
      <td className={`px-3 py-2.5 text-right font-mono text-sm tabular-nums whitespace-nowrap ${cellClass}`}>{qty(row.total)}</td>
      <td className={`px-3 py-3 text-right align-top ${cellClass} ${showPourStacks ? "min-w-[8.5rem]" : ""}`}>
        {showPourStacks ? (
          <PourSoldBreakdown row={row} muted={muted} />
        ) : (
          <span className={`font-mono text-sm tabular-nums ${muted ? "" : "text-ember"}`}>{qty(row.sold)}</span>
        )}
      </td>
      <td className={`px-3 py-2.5 text-right font-mono text-sm tabular-nums whitespace-nowrap ${cellClass}`}>
        {qty(row.damageWastage ?? 0)}
      </td>
      <td className={`px-3 py-2.5 text-right font-mono text-sm tabular-nums whitespace-nowrap ${cellClass}`}>
        {qty(row.staffConsumption ?? 0)}
      </td>
      <td className={`px-3 py-3 text-right align-top ${cellClass} ${showPourStacks ? "min-w-[8.5rem]" : ""}`}>
        {showPourStacks ? (
          <PourLeftBreakdown row={row} muted={muted} />
        ) : (
          <span className="font-mono text-sm tabular-nums">{qty(row.left)}</span>
        )}
      </td>
    </>
  );
}

function SortableHeader({
  label,
  sortKey,
  activeSort,
  onSort,
  align = "right",
  subtitle,
}: {
  label: string;
  sortKey: BarStockSortKey;
  activeSort: BarStockSortKey;
  onSort: (key: BarStockSortKey) => void;
  align?: "left" | "right";
  subtitle?: string;
}) {
  const active = activeSort === sortKey;
  return (
    <th className={`${align === "left" ? "text-left px-4" : "text-right px-3"} py-2.5 font-medium align-bottom`}>
      <button
        type="button"
        onClick={() => onSort(sortKey)}
        className={`inline-flex flex-col gap-0.5 hover:text-foreground ${align === "left" ? "items-start text-left" : "items-end text-right ml-auto"} ${active ? "text-foreground" : ""}`}
      >
        <span className="inline-flex items-center gap-1 whitespace-nowrap">
          <span>{label}</span>
          {active ? <Icons.ArrowDown className="size-3.5 opacity-70 shrink-0" /> : null}
        </span>
        {subtitle ? (
          <span className="text-[10px] font-normal leading-tight text-muted-foreground whitespace-nowrap">
            {subtitle}
          </span>
        ) : null}
      </button>
    </th>
  );
}

function GroupSection({
  group,
  expanded,
  onToggle,
  highlightItemIds,
  sortKey,
  vipPourLayout = false,
}: {
  group: BarStockGroupRollup;
  expanded: boolean;
  onToggle: () => void;
  highlightItemIds: Set<string>;
  sortKey: BarStockSortKey;
  vipPourLayout?: boolean;
}) {
  const t = useT();
  const expandable = canExpandBarStockGroup(group);
  const sortedItems = useMemo(() => sortBarStockGroupItems(group.items, sortKey), [group.items, sortKey]);
  const isBeerGroup = isBeerCategoryGroup(group);

  return (
    <>
      <tr className={`border-t border-border ${isBeerGroup ? "bg-surface-2/90" : "bg-surface-2/70"}`}>
        <td className="px-4 py-3 sticky left-0 z-[1] bg-inherit">
          <div className="flex items-center gap-2 min-w-0">
            {expandable ? (
              <button
                type="button"
                onClick={onToggle}
                className="inline-flex items-center gap-2 font-semibold hover:text-ember text-left min-w-0"
              >
                {expanded ? <Icons.ChevronDown className="size-4 shrink-0" /> : <Icons.ChevronRight className="size-4 shrink-0" />}
                {isBeerGroup ? <Icons.Beer className="size-4 shrink-0 text-ember" /> : null}
                <span className="truncate">{t(group.label, group.label)}</span>
              </button>
            ) : (
              <span className="inline-flex items-center gap-2 font-semibold min-w-0">
                {isBeerGroup ? <Icons.Beer className="size-4 shrink-0 text-ember" /> : null}
                <span className="truncate">{t(group.label, group.label)}</span>
              </span>
            )}
            {group.kind === "special-beer" ? <Chip tone="gold">{t("Special", "ልዩ")}</Chip> : null}
            {group.kind === "draft-beer" ? <Chip tone="ember">{t("Draft", "ድራፍት")}</Chip> : null}
            {group.kind === "normal-beer" ? <Chip tone="teff">{t("Normal", "መደበኛ")}</Chip> : null}
            {group.kind === "weyn" ? <Chip tone="muted">{t("Weyn", "ወይን")}</Chip> : null}
            {expandable ? (
              <span className="text-xs text-muted-foreground shrink-0">
                {group.items.length} {t("brands", "ምርቶች")}
              </span>
            ) : null}
          </div>
        </td>
        <CategoryMetricsCells row={group.metrics} bold summaryRow={vipPourLayout} />
      </tr>
      {expanded && expandable
        ? sortedItems.map((item, index) => {
            const highlighted = highlightItemIds.has(item.itemId);
            return (
              <tr
                key={item.itemId}
                className={`border-t border-border/60 hover:bg-surface-2/50 ${index % 2 === 1 ? "bg-surface-2/20" : ""} ${highlighted ? "bg-amber-500/10 ring-1 ring-inset ring-amber-500/30" : ""}`}
              >
                <td className="px-4 py-2.5 pl-12 sticky left-0 z-[1] bg-inherit">
                  <div className={`font-medium ${highlighted ? "text-amber-900 dark:text-amber-100" : ""}`}>{item.itemName}</div>
                  {!isBeerGroup ? <div className="text-xs text-muted-foreground">{item.category}</div> : null}
                </td>
                <CategoryMetricsCells row={item} muted vipPourLayout={vipPourLayout} />
              </tr>
            );
          })
        : null}
    </>
  );
}

function BeerCategoryDashboard({
  summaries,
}: {
  summaries: ReturnType<typeof buildBeerCategorySummaries>;
}) {
  const t = useT();

  if (summaries.length === 0) return null;

  return (
    <div className="grid md:grid-cols-2 gap-4">
      {summaries.map((summary) => (
        <Card key={summary.id} className="border border-border/80">
          <div className="flex items-center gap-2 mb-4">
            <Icons.Beer className="size-5 text-ember" />
            <h3 className="font-display text-lg font-semibold">{t(summary.label, summary.label)}</h3>
            <Chip tone={summary.kind === "special-beer" ? "gold" : "teff"}>
              {pluralUnit(summary.unit, summary.totalBottles)}
            </Chip>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <Stat
              label={t("Total bottles", "ጠቅላላ ጠርሙስ")}
              value={qty(summary.totalBottles)}
              icon="Package"
              tone={summary.kind === "special-beer" ? "gold" : "teff"}
            />
            <Stat
              label={t("Sold today", "ዛሬ ተሸጠ")}
              value={qty(summary.soldToday)}
              icon="TrendingUp"
              tone="ember"
            />
            <Stat
              label={t("Inventory value", "የክምችት ዋጋ")}
              value={money(summary.inventoryValue)}
              icon="Wallet"
              tone="default"
            />
          </div>
        </Card>
      ))}
    </div>
  );
}

function ReceivedLineRow({ line }: { line: BarStockReceivedLine }) {
  const t = useT();
  const timeLabel = formatTimeLabel(line.transactionAt);

  return (
    <tr className="border-t border-border/60 hover:bg-surface-2/40 align-top">
      <td className="px-4 py-3">
        <div className="font-medium">{line.itemName}</div>
        <div className="text-xs text-muted-foreground">
          {line.category ?? t("Drink", "መጠጥ")}
          {timeLabel ? ` · ${timeLabel}` : ""}
        </div>
        {line.notes ? <div className="text-xs text-muted-foreground mt-1 line-clamp-2">{line.notes}</div> : null}
      </td>
      <td className="px-3 py-3 text-sm">{line.fromLocation ?? "—"}</td>
      <td className="px-3 py-3 text-sm font-mono">{line.referenceNo ?? "—"}</td>
      <td className="px-3 py-3 text-right font-mono tabular-nums">
        {qty(line.quantity)} <span className="text-xs text-muted-foreground">{line.unit}</span>
      </td>
      <td className="px-3 py-3 text-right font-mono tabular-nums">{money(line.totalCost)}</td>
      <td className="px-4 py-3 text-sm">
        <div>{line.receivedBy ?? line.enteredBy}</div>
        {line.approvedBy ? (
          <div className="text-xs text-muted-foreground">
            {t("Approved", "ተፈቅዷል")}: {line.approvedBy}
          </div>
        ) : null}
      </td>
    </tr>
  );
}

function DailyReceivedPanel({
  receivedMap,
  selectedDate,
  onSelectDate,
  todayKey,
}: {
  receivedMap: Map<string, BarStockDailyReceivedSummary>;
  selectedDate: Date;
  onSelectDate: (date: Date) => void;
  todayKey: string;
}) {
  const t = useT();
  const lang = useLang();
  const calendarPref = useCalendar();
  const [calendarOpen, setCalendarOpen] = useState(false);
  const selectedKey = dateToKey(selectedDate);
  const selectedSummary = getBarStockReceivedForDate(receivedMap, selectedKey);
  const todaySummary = getBarStockReceivedForDate(receivedMap, todayKey);
  const receivedDates = useMemo(() => new Set(receivedMap.keys()), [receivedMap]);
  const recentDates = useMemo(
    () => [...receivedMap.keys()].sort((a, b) => b.localeCompare(a)).slice(0, 7),
    [receivedMap],
  );

  return (
    <Card className="overflow-hidden p-0 w-full border border-border/80">
      <div className="px-4 py-3 border-b border-border bg-surface-2/30 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <h3 className="font-display text-lg font-semibold">{t("Daily received from stock", "ከክምችት ዕለታዊ ግባ")}</h3>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button
            type="button"
            variant={selectedKey === todayKey ? "default" : "outline"}
            size="sm"
            onClick={() => onSelectDate(parseDateKey(todayKey))}
          >
            {t("Today", "ዛሬ")}
          </Button>
          <Popover open={calendarOpen} onOpenChange={setCalendarOpen}>
            <PopoverTrigger
              type="button"
              className={cn(buttonVariants({ variant: "outline", size: "sm" }), "gap-2")}
            >
              <Icons.CalendarDays className="size-4" />
              {formatDisplayDate(selectedDate, lang, calendarPref)}
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0" align="end">
              <Calendar
                mode="single"
                selected={selectedDate}
                onSelect={(date) => {
                  if (!date) return;
                  onSelectDate(date);
                  setCalendarOpen(false);
                }}
                modifiers={{
                  received: (date) => receivedDates.has(dateToKey(date)),
                }}
                modifiersClassNames={{
                  received: "bg-ember/15 text-ember font-semibold ring-1 ring-ember/30",
                }}
                initialFocus
              />
            </PopoverContent>
          </Popover>
        </div>
      </div>

      <div className="grid lg:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)] gap-0 divide-y lg:divide-y-0 lg:divide-x divide-border">
        <div className="p-4 space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <Stat
              label={t("Selected day", "የተመረጠ ቀን")}
              value={qty(selectedSummary?.totalQuantity ?? 0)}
              icon="PackageCheck"
              tone="teff"
            />
            <Stat
              label={t("Today received", "ዛሬ የተቀበለ")}
              value={qty(todaySummary?.totalQuantity ?? 0)}
              icon="Truck"
              tone="ember"
            />
          </div>

          <div>
            <div className="text-xs font-medium mb-2">{t("Recent receipt days", "የቅርብ ግባ ቀናት")}</div>
            <div className="flex flex-wrap gap-2">
              {recentDates.length > 0 ? (
                recentDates.map((date) => {
                  const summary = receivedMap.get(date);
                  return (
                    <button
                      key={date}
                      type="button"
                      onClick={() => onSelectDate(parseDateKey(date))}
                      className={`rounded-lg border px-3 py-2 text-left text-sm transition-colors ${
                        date === selectedKey
                          ? "border-ember bg-ember/10 text-ember"
                          : "border-border bg-card hover:bg-surface-2"
                      }`}
                    >
                      <div className="font-medium">{formatDisplayDate(parseDateKey(date), lang, calendarPref)}</div>
                      <div className="text-xs text-muted-foreground">
                        {qty(summary?.totalQuantity ?? 0)} · {summary?.itemCount ?? 0} {t("items", "እቃዎች")}
                      </div>
                    </button>
                  );
                })
              ) : (
                <div className="text-sm text-muted-foreground">{t("No receipts yet.", "ግባ የለም።")}</div>
              )}
            </div>
          </div>
        </div>

        <div className="p-0 min-w-0">
          <div className="px-4 py-3 border-b border-border flex items-center justify-between gap-3">
            <div className="font-medium">{formatDisplayDate(selectedDate, lang, calendarPref)}</div>
            {selectedSummary ? <Chip tone="ember">{qty(selectedSummary.totalQuantity)}</Chip> : null}
          </div>

          <div className="overflow-x-auto max-h-[360px] overflow-y-auto">
            <table className="w-full min-w-[760px] text-sm">
              <thead className="bg-surface-2/80 text-muted-foreground sticky top-0 z-10">
                <tr>
                  <th className="text-left px-4 py-2.5 font-medium">{t("Item", "እቃ")}</th>
                  <th className="text-left px-3 py-2.5 font-medium">{t("From store", "ከስቶር")}</th>
                  <th className="text-left px-3 py-2.5 font-medium">{t("Reference", "ማጣቀሻ")}</th>
                  <th className="text-right px-3 py-2.5 font-medium">{t("Qty", "ብዛት")}</th>
                  <th className="text-right px-3 py-2.5 font-medium">{t("Value", "ዋጋ")}</th>
                  <th className="text-left px-4 py-2.5 font-medium">{t("Received by", "ተቀባይ")}</th>
                </tr>
              </thead>
              <tbody>
                {selectedSummary?.lines.map((line) => (
                  <ReceivedLineRow key={line.id} line={line} />
                ))}
                {!selectedSummary ? (
                  <tr>
                    <td colSpan={6} className="px-4 py-10 text-center text-muted-foreground">
                      {t("No receipts.", "ግባ የለም።")}
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </Card>
  );
}

function BarStockReportPanel({
  snapshot,
  items,
  reportKind,
  vipPourLayout = false,
}: {
  snapshot: BarStockSnapshot;
  items: StockManagedItem[];
  reportKind: BarStockReportKind;
  vipPourLayout?: boolean;
}) {
  const t = useT();
  const report = useMemo(() => buildBarStockReport(snapshot, items, reportKind), [snapshot, items, reportKind]);
  if (!report) {
    return (
      <div className="text-sm text-muted-foreground py-6 text-center">
        {vipPourLayout
          ? t("No completed spirit sales in this period.", "በዚህ ጊዜ የተጠናቀቀ የመጠጥ ሽያጭ የለም።")
          : t("No data.", "ውሂብ የለም።")}
      </div>
    );
  }

  const summaryRowKinds: BarStockReportKind[] = ["special-summary", "normal-summary", "draft-summary", "whisky-summary"];
  const categorySummaryKinds: BarStockReportKind[] = ["spirit-category-summary"];

  function renderSoldCell(row: BarStockReportRow, isSummaryRow: boolean) {
    const showPour = reportRowHasPourMetrics(row) && !isSummaryRow;
    if (showPour) {
      return <PourSoldBreakdown row={reportRowToMetrics(row)} />;
    }
    return <span className="font-mono tabular-nums text-ember">{qty(row.sold)}</span>;
  }

  function renderLeftCell(row: BarStockReportRow, isSummaryRow: boolean) {
    const showPour = reportRowHasPourMetrics(row) && !isSummaryRow;
    if (showPour) {
      return <PourLeftBreakdown row={reportRowToMetrics(row)} />;
    }
    return <span className="font-mono tabular-nums">{qty(row.left)}</span>;
  }

  function isGroupHeaderRow(index: number) {
    if (summaryRowKinds.includes(reportKind) && index === 0) return true;
    if (!categorySummaryKinds.includes(reportKind)) return false;
    const row = report.rows[index];
    if (!row) return false;
    return snapshot.groups.some((group) => group.label === row.label && group.metrics.stock === row.opening);
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[1080px] text-sm border-collapse">
        <thead className="bg-surface-2/60 text-muted-foreground">
          <tr>
            <th className="text-left px-4 py-2.5 font-medium align-bottom">{t("Item / category", "እቃ / ምድብ")}</th>
            <th className="text-right px-3 py-2.5 font-medium whitespace-nowrap align-bottom">{t("Opening", "መክፈቻ")}</th>
            <th className="text-right px-3 py-2.5 font-medium whitespace-nowrap align-bottom">{t("Received", "የተቀበለ")}</th>
            <th className="text-right px-3 py-2.5 font-medium whitespace-nowrap align-bottom">{t("Total", "ጠቅላላ")}</th>
            <th className="text-right px-3 py-2.5 font-medium align-bottom">
              <div>{t("Sold", "ተሸጠ")}</div>
              {vipPourLayout ? (
                <div className="text-[10px] font-normal text-muted-foreground leading-tight">
                  {t("Bottle · Single · Double", "ጠርሙስ · ነጠላ · ድርብ")}
                </div>
              ) : null}
            </th>
            <th className="text-right px-3 py-2.5 font-medium whitespace-nowrap align-bottom">
              {t("Damage / Wastage", "ጉዳት / ብክነት")}
            </th>
            <th className="text-right px-3 py-2.5 font-medium whitespace-nowrap align-bottom">
              {t("Staff consumption", "የሰራተኛ ፍጆታ")}
            </th>
            <th className="text-right px-3 py-2.5 font-medium align-bottom">
              <div>{t("Left", "ቀርቷል")}</div>
              {vipPourLayout ? (
                <div className="text-[10px] font-normal text-muted-foreground leading-tight">
                  {t("Bottles & remaining pours", "ጠርሙስ እና ቀሪ ሾቶች")}
                </div>
              ) : null}
            </th>
            <th className="text-right px-4 py-2.5 font-medium whitespace-nowrap align-bottom">{t("Value", "ዋጋ")}</th>
          </tr>
        </thead>
        <tbody>
          {report.rows.map((row, index) => {
            const isSummaryRow = isGroupHeaderRow(index);
            return (
              <tr
                key={`${row.label}-${index}`}
                className={`border-t border-border/60 ${isSummaryRow ? "bg-surface-2/80 font-semibold" : ""}`}
              >
                <td className="px-4 py-2.5">{row.label}</td>
                <td className="px-3 py-2.5 text-right font-mono tabular-nums whitespace-nowrap">{qty(row.opening)}</td>
                <td className="px-3 py-2.5 text-right font-mono tabular-nums whitespace-nowrap">{qty(row.received)}</td>
                <td className="px-3 py-2.5 text-right font-mono tabular-nums whitespace-nowrap">{qty(row.total)}</td>
                <td className={`px-3 py-2.5 text-right align-top ${!isSummaryRow && reportRowHasPourMetrics(row) ? "min-w-[8.5rem]" : ""}`}>
                  {renderSoldCell(row, isSummaryRow)}
                </td>
                <td className="px-3 py-2.5 text-right font-mono tabular-nums whitespace-nowrap">{qty(row.damageWastage)}</td>
                <td className="px-3 py-2.5 text-right font-mono tabular-nums whitespace-nowrap">{qty(row.staffConsumption)}</td>
                <td className={`px-3 py-2.5 text-right align-top ${!isSummaryRow && reportRowHasPourMetrics(row) ? "min-w-[8.5rem]" : ""}`}>
                  {renderLeftCell(row, isSummaryRow)}
                </td>
                <td className="px-4 py-2.5 text-right font-mono tabular-nums whitespace-nowrap">{money(row.inventoryValue)}</td>
              </tr>
            );
          })}
          <tr className="border-t border-border bg-surface-2/90 font-semibold">
            <td className="px-4 py-2.5">{t(report.totals.label, "ጠቅላላ")}</td>
            <td className="px-3 py-2.5 text-right font-mono tabular-nums">{qty(report.totals.opening)}</td>
            <td className="px-3 py-2.5 text-right font-mono tabular-nums">{qty(report.totals.received)}</td>
            <td className="px-3 py-2.5 text-right font-mono tabular-nums">{qty(report.totals.total)}</td>
            <td className="px-3 py-2.5 text-right font-mono tabular-nums text-ember">{qty(report.totals.sold)}</td>
            <td className="px-3 py-2.5 text-right font-mono tabular-nums">{qty(report.totals.damageWastage)}</td>
            <td className="px-3 py-2.5 text-right font-mono tabular-nums">{qty(report.totals.staffConsumption)}</td>
            <td className="px-3 py-2.5 text-right font-mono tabular-nums">{qty(report.totals.left)}</td>
            <td className="px-4 py-2.5 text-right font-mono tabular-nums">{money(report.totals.inventoryValue)}</td>
          </tr>
        </tbody>
      </table>
    </div>
  );
}

export function BarStockPanel({
  workspace,
  items,
  balances,
  ledger,
  closings,
  salesRecords,
  embedded = false,
}: {
  workspace: StockLocation;
  items: StockManagedItem[];
  balances: StockLocationBalance[];
  ledger: StockLedgerEntry[];
  closings: StockClosingRecord[];
  salesRecords: SalesRecord[];
  embedded?: boolean;
}) {
  const t = useT();
  const [search, setSearch] = useState("");
  const [sortKey, setSortKey] = useState<BarStockSortKey>("name");
  const [reportKind, setReportKind] = useState<BarStockReportKind>(() => defaultReportKind(workspace));
  const [showReports, setShowReports] = useState(false);
  const [selectedReceivedDate, setSelectedReceivedDate] = useState(() => new Date());
  const { expanded, toggle, setExpanded } = usePersistedExpandedGroups(workspace);

  const reportOptions = workspace === "VIP Bar" ? VIP_REPORT_OPTIONS : BEER_REPORT_OPTIONS;

  useEffect(() => {
    setReportKind(defaultReportKind(workspace));
  }, [workspace]);

  const snapshot = useMemo(
    () =>
      buildBarStockSnapshot({
        items,
        balances,
        ledger,
        closings,
        workspace,
        salesRecords,
      }),
    [items, balances, ledger, closings, workspace, salesRecords],
  );

  const searchResult = useMemo(
    () => resolveBarStockSearch(snapshot?.groups ?? [], search),
    [snapshot?.groups, search],
  );

  const beerSummaries = useMemo(
    () => (snapshot ? buildBeerCategorySummaries(snapshot, items) : []),
    [snapshot, items],
  );

  const expandableGroupIds = useMemo(
    () => (snapshot?.groups ?? []).filter(canExpandBarStockGroup).map((group) => group.id),
    [snapshot?.groups],
  );

  const tableTotals = useMemo(
    () => sumBarStockDisplayMetrics(searchResult.groups.map((group) => group.metrics)),
    [searchResult.groups],
  );

  const receivedMap = useMemo(
    () => buildBarStockDailyReceivedMap({ items, balances, ledger, workspace }),
    [items, balances, ledger, workspace],
  );

  const todayKey = useMemo(() => dateToKey(new Date()), []);

  const searchExpandKey = [...searchResult.expandGroupIds].sort().join("|");

  useEffect(() => {
    if (!search.trim()) return;
    const ids = searchExpandKey ? searchExpandKey.split("|") : [];
    if (ids.length === 0) return;
    setExpanded((prev) => {
      const next = new Set(prev);
      let changed = false;
      for (const id of ids) {
        if (!next.has(id)) {
          next.add(id);
          changed = true;
        }
      }
      return changed ? next : prev;
    });
  }, [search, searchExpandKey, setExpanded]);

  if (!snapshot) return null;

  const visibleGroups = searchResult.groups;
  const itemCount = snapshot.groups.reduce((sum, group) => sum + group.items.length, 0);
  const vipPourLayout = workspace === "VIP Bar";

  return (
    <div className="space-y-5 w-full">
      {!embedded && snapshot.dailyPeriodStart ? (
        <Card className="border border-amber-500/30 bg-amber-500/10">
          <div className="text-sm text-amber-900 dark:text-amber-200">
            {t("Daily closing completed.", "ዕለታዊ መዝጊያ ተጠናቋል።")}
          </div>
        </Card>
      ) : null}

      {workspace === "Main Bar" ? <BeerCategoryDashboard summaries={beerSummaries} /> : null}

      <DailyReceivedPanel
        receivedMap={receivedMap}
        selectedDate={selectedReceivedDate}
        onSelectDate={setSelectedReceivedDate}
        todayKey={todayKey}
      />

      <Card className="overflow-hidden p-0 w-full border border-border/80">
        <div className="px-4 py-3 border-b border-border space-y-3 bg-surface-2/30">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <h3 className="font-display text-lg font-semibold">
                {t("Bar stock", "የባር ክምችት")} · {stockLocationLabel(workspace)}
              </h3>
            </div>
            <Chip tone="ember">
              {itemCount} {t("items", "እቃዎች")}
            </Chip>
          </div>

          <div className="flex flex-col gap-3 xl:flex-row xl:items-center">
            <div className="relative flex-1 min-w-0">
              <Icons.Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
              <input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder={t("Search brand or category", "ምርት ወይም ምድብ ፈልግ")}
                className="w-full h-10 pl-9 pr-3 rounded-lg border border-border bg-card text-sm focus:outline-none focus:ring-2 focus:ring-ember/30"
              />
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => setExpanded(new Set(expandableGroupIds))}
                className="h-10 px-3 rounded-lg border border-border bg-card text-sm hover:bg-surface-2"
              >
                {t("Expand all", "ሁሉንም አስፋ")}
              </button>
              <button
                type="button"
                onClick={() => setExpanded(new Set())}
                className="h-10 px-3 rounded-lg border border-border bg-card text-sm hover:bg-surface-2"
              >
                {t("Collapse all", "ሁሉንም ሰብስብ")}
              </button>
              <button
                type="button"
                onClick={() => setShowReports((prev) => !prev)}
                className="h-10 px-4 rounded-lg border border-border bg-card text-sm hover:bg-surface-2 whitespace-nowrap"
              >
                {showReports ? t("Hide reports", "ሪፖርቶችን ደብቅ") : t("Reports", "ሪፖርቶች")}
              </button>
            </div>
          </div>
        </div>

        <div className="overflow-x-auto w-full max-h-[min(70vh,720px)] overflow-y-auto">
          <table className="w-full min-w-[1080px] text-sm border-collapse">
            <thead className="bg-surface-2/95 text-muted-foreground sticky top-0 z-20 shadow-[0_1px_0_0_hsl(var(--border))]">
              <tr>
                <SortableHeader
                  label={t("Category", "ምድብ")}
                  sortKey="name"
                  activeSort={sortKey}
                  onSort={setSortKey}
                  align="left"
                />
                {SORTABLE_COLUMNS.filter((column) => column.key !== "name").map((column) => (
                  <SortableHeader
                    key={column.key}
                    sortKey={column.key}
                    activeSort={sortKey}
                    onSort={setSortKey}
                    label={t(column.label, column.labelAm)}
                    subtitle={
                      !vipPourLayout
                        ? undefined
                        : column.key === "sold"
                          ? t("Bottle · Single · Double", "ጠርሙስ · ነጠላ · ድርብ")
                          : column.key === "left"
                            ? t("Bottles & remaining pours", "ጠርሙስ እና ቀሪ ሾቶች")
                            : undefined
                    }
                  />
                ))}
              </tr>
            </thead>
            <tbody>
              {visibleGroups.map((group) => (
                <GroupSection
                  key={group.id}
                  group={group}
                  expanded={expanded.has(group.id) || searchResult.expandGroupIds.has(group.id)}
                  onToggle={() => toggle(group.id)}
                  highlightItemIds={searchResult.highlightItemIds}
                  sortKey={sortKey}
                  vipPourLayout={vipPourLayout}
                />
              ))}
              {visibleGroups.length === 0 ? (
                <tr>
                  <td colSpan={8} className="px-4 py-12 text-center text-muted-foreground">
                    {search.trim()
                      ? t("No matches.", "ምንም አልተገኘም።")
                      : t("No stock.", "ክምችት የለም።")}
                  </td>
                </tr>
              ) : (
                <tr className="border-t-2 border-border bg-surface-2/95 font-semibold sticky bottom-0">
                  <td className="px-4 py-3 sticky left-0 z-[1] bg-inherit">{t("Grand total", "ጠቅላላ ድምር")}</td>
                  <CategoryMetricsCells row={tableTotals} bold summaryRow />
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>

      {showReports ? (
        <Card className="w-full">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between mb-4">
            <div>
              <h3 className="font-display text-lg font-semibold">
                {workspace === "VIP Bar"
                  ? t("Spirit reports", "የመጠጥ ሪፖርቶች")
                  : t("Beer reports", "የቢራ ሪፖርቶች")}
              </h3>
            </div>
            <select
              value={reportKind}
              onChange={(event) => setReportKind(event.target.value as BarStockReportKind)}
              className="h-10 px-3 rounded-lg border border-border bg-card text-sm focus:outline-none min-w-[220px]"
            >
              {reportOptions.map((option) => (
                <option key={option.kind} value={option.kind}>
                  {t(option.label, option.label)}
                </option>
              ))}
            </select>
          </div>
          <BarStockReportPanel
            snapshot={snapshot}
            items={items}
            reportKind={reportKind}
            vipPourLayout={vipPourLayout}
          />
        </Card>
      ) : null}
    </div>
  );
}

export type { BarStockSnapshot };
