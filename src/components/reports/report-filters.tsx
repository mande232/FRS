import { useEffect, useMemo, useState } from "react";
import * as Icons from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui-kit";
import { useT } from "@/lib/i18n";
import type { ReportFilterKey } from "@/lib/reports-catalog";
import {
  defaultReportFilters,
  resolveDateRange,
  type ReportDatePreset,
  type ReportFiltersState,
} from "@/lib/reports-query";
import { STOCK_LOCATIONS } from "@/lib/stock-management";
import { DateRangePicker } from "@/components/date-range/date-range-picker";
import { type DateRangePreset } from "@/lib/date-time";
import { activeBranchNames, loadCachedBranches } from "@/lib/branches";
import { loadSystemSettings } from "@/lib/system-settings";

const PRESET_STORAGE_KEY = "ethioplate.report-filter-presets";

export type ReportFiltersProps = {
  filterKeys: ReportFilterKey[];
  filters: ReportFiltersState;
  onApply: (filters: ReportFiltersState) => void;
  cashiers?: string[];
  waiters?: string[];
  stations?: string[];
  categories?: string[];
  areas?: string[];
  paymentMethods?: string[];
};

function loadPresets(): Record<string, ReportFiltersState> {
  if (typeof window === "undefined") return {};
  try {
    const raw = window.localStorage.getItem(PRESET_STORAGE_KEY);
    return raw ? (JSON.parse(raw) as Record<string, ReportFiltersState>) : {};
  } catch {
    return {};
  }
}

function savePreset(name: string, filters: ReportFiltersState) {
  const presets = loadPresets();
  presets[name] = filters;
  window.localStorage.setItem(PRESET_STORAGE_KEY, JSON.stringify(presets));
}

export function ReportFiltersPanel({
  filterKeys,
  filters,
  onApply,
  cashiers = [],
  waiters = [],
  stations = [],
  categories = [],
  areas = [],
  paymentMethods = [],
}: ReportFiltersProps) {
  const t = useT();
  const [draft, setDraft] = useState(filters);
  const [presetName, setPresetName] = useState("");

  useEffect(() => {
    setDraft(filters);
  }, [filters]);

  const show = useMemo(() => new Set(filterKeys), [filterKeys]);
  const branchOptions = useMemo(() => activeBranchNames(loadCachedBranches()), []);

  function update<K extends keyof ReportFiltersState>(key: K, value: ReportFiltersState[K]) {
    setDraft((current) => ({ ...current, [key]: value }));
  }

  function apply() {
    const next = { ...draft, ...resolveDateRange(draft.preset, draft.fromDate, draft.toDate) };
    setDraft(next);
    onApply(next);
  }

  function reset() {
    const next = defaultReportFilters();
    setDraft(next);
    onApply(next);
  }

  function saveCurrentPreset() {
    const name = presetName.trim();
    if (!name) return;
    savePreset(name, draft);
    setPresetName("");
  }

  function applyDateRange(next: {
    mode: "quick" | "calendar";
    preset: DateRangePreset;
    fromDate: string;
    toDate: string;
  }) {
    const range = resolveDateRange(next.preset as ReportDatePreset, next.fromDate, next.toDate);
    const updated: ReportFiltersState = {
      ...draft,
      preset: next.preset as ReportDatePreset,
      fromDate: range.fromDate,
      toDate: range.toDate,
    };
    setDraft(updated);
    onApply(updated);
  }

  return (
    <Card className="!p-3 sm:!p-4 border-border/80">
      <div className="flex flex-wrap items-end gap-3">
        {show.has("dateRange") && (
          <div className="min-w-[200px]">
            <label className="text-xs text-muted-foreground block mb-1">{t("Date range", "የቀን ክልል")}</label>
            <DateRangePicker
              compact
              preferences={loadSystemSettings().calendar}
              value={{
                mode: draft.preset === "custom" ? "calendar" : "quick",
                preset: draft.preset as DateRangePreset,
                fromDate: draft.fromDate,
                toDate: draft.toDate,
              }}
              onChange={applyDateRange}
            />
          </div>
        )}

        {show.has("branch") && (
          <div>
            <label className="text-xs text-muted-foreground">{t("Branch", "ቅርንጫፍ")}</label>
            <select
              value={draft.branch}
              onChange={(event) => update("branch", event.target.value)}
              className="mt-1 h-9 rounded-lg border border-border bg-card px-3 text-sm"
            >
              <option value="All">{t("All branches", "ሁሉም ቅርንጫፎች")}</option>
              {branchOptions.map((name) => (
                <option key={name} value={name}>
                  {name}
                </option>
              ))}
            </select>
          </div>
        )}

        {show.has("shift") && (
          <div>
            <label className="text-xs text-muted-foreground">{t("Shift", "ሽፍት")}</label>
            <select
              value={draft.shift}
              onChange={(event) => update("shift", event.target.value)}
              className="mt-1 h-9 rounded-lg border border-border bg-card px-3 text-sm"
            >
              <option value="All">{t("All shifts", "ሁሉም ሽፍቶች")}</option>
            </select>
          </div>
        )}

        {show.has("cashier") && (
          <div>
            <label className="text-xs text-muted-foreground">{t("Cashier", "ካሸር")}</label>
            <select
              value={draft.cashier}
              onChange={(event) => update("cashier", event.target.value)}
              className="mt-1 h-9 rounded-lg border border-border bg-card px-3 text-sm min-w-[120px]"
            >
              <option value="All">{t("All", "ሁሉም")}</option>
              {cashiers.map((name) => (
                <option key={name} value={name}>
                  {name}
                </option>
              ))}
            </select>
          </div>
        )}

        {show.has("waiter") && (
          <div>
            <label className="text-xs text-muted-foreground">{t("Waiter", "አስተናጋጅ")}</label>
            <select
              value={draft.waiter}
              onChange={(event) => update("waiter", event.target.value)}
              className="mt-1 h-9 rounded-lg border border-border bg-card px-3 text-sm min-w-[120px]"
            >
              <option value="All">{t("All", "ሁሉም")}</option>
              {waiters.map((name) => (
                <option key={name} value={name}>
                  {name}
                </option>
              ))}
            </select>
          </div>
        )}

        {show.has("station") && (
          <div>
            <label className="text-xs text-muted-foreground">{t("Station", "ጣቢያ")}</label>
            <select
              value={draft.station}
              onChange={(event) => update("station", event.target.value)}
              className="mt-1 h-9 rounded-lg border border-border bg-card px-3 text-sm min-w-[120px]"
            >
              <option value="All">{t("All", "ሁሉም")}</option>
              {stations.map((name) => (
                <option key={name} value={name}>
                  {name}
                </option>
              ))}
            </select>
          </div>
        )}

        {show.has("category") && (
          <div>
            <label className="text-xs text-muted-foreground">{t("Category", "ምድብ")}</label>
            <select
              value={draft.category}
              onChange={(event) => update("category", event.target.value)}
              className="mt-1 h-9 rounded-lg border border-border bg-card px-3 text-sm min-w-[120px]"
            >
              <option value="All">{t("All", "ሁሉም")}</option>
              {categories.map((name) => (
                <option key={name} value={name}>
                  {name}
                </option>
              ))}
            </select>
          </div>
        )}

        {show.has("area") && (
          <div>
            <label className="text-xs text-muted-foreground">{t("Area", "ክፍል")}</label>
            <select
              value={draft.area}
              onChange={(event) => update("area", event.target.value)}
              className="mt-1 h-9 rounded-lg border border-border bg-card px-3 text-sm min-w-[120px]"
            >
              <option value="All">{t("All", "ሁሉም")}</option>
              {areas.map((name) => (
                <option key={name} value={name}>
                  {name}
                </option>
              ))}
            </select>
          </div>
        )}

        {show.has("paymentMethod") && (
          <div>
            <label className="text-xs text-muted-foreground">{t("Payment method", "የክፍያ ዘዴ")}</label>
            <select
              value={draft.paymentMethod}
              onChange={(event) => update("paymentMethod", event.target.value)}
              className="mt-1 h-9 rounded-lg border border-border bg-card px-3 text-sm min-w-[120px]"
            >
              <option value="All">{t("All", "ሁሉም")}</option>
              {paymentMethods.map((name) => (
                <option key={name} value={name}>
                  {name}
                </option>
              ))}
            </select>
          </div>
        )}

        {show.has("paymentStatus") && (
          <div>
            <label className="text-xs text-muted-foreground">{t("Payment status", "የክፍያ ሁኔታ")}</label>
            <select
              value={draft.paymentStatus}
              onChange={(event) => update("paymentStatus", event.target.value)}
              className="mt-1 h-9 rounded-lg border border-border bg-card px-3 text-sm"
            >
              <option value="All">{t("All", "ሁሉም")}</option>
              <option value="Settled">{t("Settled", "ተጠናቋል")}</option>
              <option value="Pending">{t("Pending", "በመጠባበቅ")}</option>
              <option value="Void">{t("Void", "የተሰረዘ")}</option>
            </select>
          </div>
        )}

        {show.has("orderStatus") && (
          <div>
            <label className="text-xs text-muted-foreground">{t("Order status", "የትዕዛዝ ሁኔታ")}</label>
            <select
              value={draft.orderStatus}
              onChange={(event) => update("orderStatus", event.target.value)}
              className="mt-1 h-9 rounded-lg border border-border bg-card px-3 text-sm"
            >
              <option value="All">{t("All", "ሁሉም")}</option>
              <option value="CLOSED">{t("Closed", "የተዘገ")}</option>
              <option value="CANCELLED">{t("Cancelled", "ተሰርዟል")}</option>
              <option value="RETURNED">{t("Returned", "ተመለሰ")}</option>
            </select>
          </div>
        )}

        {show.has("inventoryLocation") && (
          <div>
            <label className="text-xs text-muted-foreground">{t("Location", "ቦታ")}</label>
            <select
              value={draft.inventoryLocation}
              onChange={(event) => update("inventoryLocation", event.target.value)}
              className="mt-1 h-9 rounded-lg border border-border bg-card px-3 text-sm min-w-[140px]"
            >
              <option value="All">{t("All locations", "ሁሉም ቦታዎች")}</option>
              {STOCK_LOCATIONS.map((location) => (
                <option key={location} value={location}>
                  {location}
                </option>
              ))}
            </select>
          </div>
        )}

        <div className="min-w-[160px] flex-1">
          <label className="text-xs text-muted-foreground">{t("Search table", "جدول ፈልግ")}</label>
          <input
            value={draft.search}
            onChange={(event) => update("search", event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") apply();
            }}
            placeholder={t("Search rows…", "መስመሮችን ፈልግ…")}
            className="mt-1 h-9 w-full rounded-lg border border-border bg-card px-3 text-sm"
          />
        </div>

        <div className="flex flex-wrap items-center gap-2 pb-0.5">
          <Button type="button" size="sm" onClick={apply}>
            {t("Apply", "ተግብር")}
          </Button>
          <Button type="button" size="sm" variant="outline" onClick={reset}>
            {t("Reset", "እንደገና")}
          </Button>
          <div className="flex items-center gap-1">
            <input
              value={presetName}
              onChange={(event) => setPresetName(event.target.value)}
              placeholder={t("Preset name", "የቅድመ-ቅንብር ስም")}
              className="h-9 w-28 rounded-lg border border-border bg-card px-2 text-xs"
            />
            <Button type="button" size="sm" variant="outline" onClick={saveCurrentPreset} className="gap-1">
              <Icons.Bookmark className="size-3.5" />
              {t("Save", "አስቀምጥ")}
            </Button>
          </div>
        </div>
      </div>
    </Card>
  );
}
