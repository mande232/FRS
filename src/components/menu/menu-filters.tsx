import * as Icons from "lucide-react";
import {
  defaultMenuFilters,
  type MenuFiltersState,
  type MenuQuickFilter,
} from "@/lib/menu-analytics";
import type { ProductionStation } from "@/lib/demo-data";
import { useT } from "@/lib/i18n";

const QUICK_FILTERS: Array<{ id: MenuQuickFilter; labelEn: string; labelAm: string }> = [
  { id: "all", labelEn: "All", labelAm: "ሁሉም" },
  { id: "active", labelEn: "Active", labelAm: "ንቁ" },
  { id: "available", labelEn: "Available", labelAm: "ይገኛል" },
  { id: "out_of_stock", labelEn: "Out of stock", labelAm: "አልቋል" },
  { id: "price_issues", labelEn: "Price issues", labelAm: "የዋጋ ችግር" },
  { id: "missing_station", labelEn: "Needs station", labelAm: "ጣቢያ ያስፈልጋል" },
];

export type MenuFiltersPanelProps = {
  filters: MenuFiltersState;
  onChange: (next: MenuFiltersState) => void;
  categories: readonly string[];
  stations: readonly ProductionStation[];
  resultCount: number;
  expanded?: boolean;
  onToggleExpanded?: () => void;
};

export function MenuFiltersPanel({
  filters,
  onChange,
  categories,
  stations,
  resultCount,
  expanded = false,
  onToggleExpanded,
}: MenuFiltersPanelProps) {
  const t = useT();

  function patch(partial: Partial<MenuFiltersState>) {
    onChange({ ...filters, ...partial });
  }

  return (
    <div className="sticky top-0 z-20 -mx-1 px-1 py-2 bg-background/95 backdrop-blur border-b border-border mb-3 space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative flex-1 min-w-[160px]">
          <Icons.Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
          <input
            value={filters.search}
            onChange={(event) => patch({ search: event.target.value })}
            placeholder={t("Search menu…", "ምናሌ ይፈልጉ…")}
            className="h-10 w-full pl-9 pr-3 rounded-lg bg-card border border-border text-sm focus:outline-none focus:ring-2 focus:ring-ring/40"
          />
        </div>
        <select
          value={filters.category}
          onChange={(event) => patch({ category: event.target.value })}
          className="h-10 px-2 rounded-lg border border-border bg-card text-sm"
        >
          <option value="All">{t("Category", "ምድብ")}</option>
          {categories.filter((category) => category !== "All").map((category) => (
            <option key={category} value={category}>{category}</option>
          ))}
        </select>
        <select
          value={filters.station}
          onChange={(event) => patch({ station: event.target.value })}
          className="h-10 px-2 rounded-lg border border-border bg-card text-sm"
        >
          <option value="All">{t("Station", "ጣቢያ")}</option>
          {stations.map((station) => (
            <option key={station} value={station}>{station}</option>
          ))}
        </select>
        {onToggleExpanded && (
          <button
            type="button"
            onClick={onToggleExpanded}
            className={`h-10 px-3 rounded-lg border text-sm inline-flex items-center gap-1.5 ${
              expanded ? "border-foreground bg-foreground text-background" : "border-border bg-card hover:bg-surface-2"
            }`}
          >
            <Icons.SlidersHorizontal className="size-3.5" />
            {t("More", "ተጨማሪ")}
          </button>
        )}
        <button
          type="button"
          onClick={() => onChange(defaultMenuFilters())}
          className="h-10 px-3 rounded-lg text-sm text-muted-foreground hover:text-foreground"
        >
          {t("Reset", "ዳግም")}
        </button>
        <span className="text-sm text-muted-foreground sm:ml-auto">
          <span className="font-semibold text-foreground">{resultCount}</span> {t("items", "እቃዎች")}
        </span>
      </div>

      <div className="flex gap-1.5 overflow-x-auto pb-0.5 -mx-1 px-1">
        {QUICK_FILTERS.map((quick) => (
          <button
            key={quick.id}
            type="button"
            onClick={() => patch({ quick: quick.id })}
            className={`shrink-0 h-8 px-3 rounded-lg text-xs font-medium border transition-colors ${
              filters.quick === quick.id
                ? "border-foreground bg-foreground text-background"
                : "border-border bg-card text-muted-foreground hover:text-foreground"
            }`}
          >
            {t(quick.labelEn, quick.labelAm)}
          </button>
        ))}
      </div>

      {expanded && (
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4 pt-1">
          <label className="text-xs space-y-1">
            <span className="text-muted-foreground">{t("Item type", "የእቃ አይነት")}</span>
            <select
              value={filters.itemType}
              onChange={(event) => patch({ itemType: event.target.value })}
              className="w-full h-9 px-2 rounded-lg border border-border bg-card text-sm"
            >
              <option value="All">{t("All", "ሁሉም")}</option>
              <option value="Direct Stock">{t("Direct Stock", "ቀጥተኛ ክምችት")}</option>
              <option value="Recipe Item">{t("Recipe Item", "የምግብ አዘገጃጀት")}</option>
            </select>
          </label>
          <label className="text-xs space-y-1">
            <span className="text-muted-foreground">{t("Diet", "አመጋገብ")}</span>
            <select
              value={filters.diet}
              onChange={(event) => patch({ diet: event.target.value })}
              className="w-full h-9 px-2 rounded-lg border border-border bg-card text-sm"
            >
              <option value="All">{t("All", "ሁሉም")}</option>
              <option value="Veg">{t("Vegetarian", "አትክልታማ")}</option>
              <option value="Non-Veg">{t("Non-Veg", "የሥጋ")}</option>
            </select>
          </label>
          <label className="text-xs space-y-1">
            <span className="text-muted-foreground">{t("Min price", "ዝቅተኛ ዋጋ")}</span>
            <input
              type="number"
              value={filters.priceMin}
              onChange={(event) => patch({ priceMin: event.target.value })}
              className="w-full h-9 px-2 rounded-lg border border-border bg-card text-sm font-mono"
            />
          </label>
          <label className="text-xs space-y-1">
            <span className="text-muted-foreground">{t("Max price", "ከፍተኛ ዋጋ")}</span>
            <input
              type="number"
              value={filters.priceMax}
              onChange={(event) => patch({ priceMax: event.target.value })}
              className="w-full h-9 px-2 rounded-lg border border-border bg-card text-sm font-mono"
            />
          </label>
        </div>
      )}
    </div>
  );
}
