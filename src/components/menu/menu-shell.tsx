import { useEffect, useMemo, useState } from "react";
import * as Icons from "lucide-react";
import { RealtimeBadge } from "@/components/realtime-badge";
import { MenuFiltersPanel } from "@/components/menu/menu-filters";
import { MenuItemDrawer } from "@/components/menu/menu-item-drawer";
import { MenuItemModal } from "@/components/menu/menu-item-modal";
import {
  buildPaginationSteps,
  downloadTextFile,
  MENU_TABS,
  StationIcon,
  type MenuTabId,
} from "@/components/menu/menu-shared";
import { Card, Chip, PageHeader } from "@/components/ui-kit";
import { useAuth } from "@/lib/auth-context";
import type { RestaurantProfile } from "@/lib/brand";
import type { MenuItem, ProductionStation } from "@/lib/demo-data";
import { formatETB } from "@/lib/ethiopic";
import { menuItemName, useT } from "@/lib/i18n";
import { useLang } from "@/lib/lang-context";
import {
  analyzeMenuItem,
  computeMenuSummary,
  computeStationSummaries,
  defaultMenuFilters,
  exportMenuCsv,
  filterMenuItems,
  type MenuFiltersState,
  type MenuItemInsight,
} from "@/lib/menu-analytics";
import { isConfiguredStation, stationTone } from "@/lib/stations";
import { showError, showSuccess } from "@/lib/toast";
import type { BackendRealtimeStatus } from "@/lib/supabase/pos-backend";
import type { StockLocationBalance, StockLot, StockManagedItem, StockRecipe } from "@/lib/stock-management";

type ChipTone = "default" | "ember" | "teff" | "gold" | "muted" | "destructive";
type StoreSlice = {
  menuItems: MenuItem[];
  menuCategories: string[];
  menuStations: ProductionStation[];
  restaurantProfile: RestaurantProfile;
  realtimeStatus: BackendRealtimeStatus;
  saveMenuItem: (item: MenuItem) => void;
  publishMenuChanges: () => Promise<{ ok: boolean; error?: string }>;
  removeMenuItem: (id: string) => void;
  addMenuCategory: (category: string) => void;
  renameMenuCategory: (from: string, to: string) => void;
  removeMenuCategory: (category: string) => void;
};
type StockSlice = {
  items: StockManagedItem[];
  recipes: StockRecipe[];
  balances: StockLocationBalance[];
  lots?: StockLot[];
};

const PAGE_SIZE = 20;

function useMenuPermissions(role: string | undefined) {
  const readOnly = role === "Cashier" || role === "Auditor";
  const canManage =
    role === "Branch Manager" ||
    role === "Administrator" ||
    role === "Inventory Administrator" ||
    role === "Store Manager" ||
    role === "Supervisor";
  const canPublish = canManage;
  const canBulkEdit = canManage;
  return { readOnly, canManage, canPublish, canBulkEdit };
}

export type MenuShellProps = {
  store: StoreSlice;
  stock: StockSlice;
};

export function MenuShell({ store, stock }: MenuShellProps) {
  const t = useT();
  const lang = useLang();
  const { user } = useAuth();
  const permissions = useMenuPermissions(user?.role);

  const [tab, setTab] = useState<MenuTabId>("items");
  const [filters, setFilters] = useState<MenuFiltersState>(() => defaultMenuFilters());
  const [filtersExpanded, setFiltersExpanded] = useState(false);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(PAGE_SIZE);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [drawerInsight, setDrawerInsight] = useState<MenuItemInsight | null>(null);
  const [editing, setEditing] = useState<MenuItem | null>(null);
  const [showAdd, setShowAdd] = useState(false);
  const [newCategory, setNewCategory] = useState("");
  const [showPosPreview, setShowPosPreview] = useState(false);
  const [draftPending, setDraftPending] = useState(false);

  const items = store.menuItems;
  const categories = store.menuCategories;
  const stations = store.menuStations;

  const insights = useMemo(
    () =>
      items.map((item) =>
        analyzeMenuItem(item, stations, stock.recipes, stock.items, stock.balances, stock.lots ?? []),
      ),
    [items, stations, stock.recipes, stock.items, stock.balances, stock.lots],
  );

  const insightMap = useMemo(() => new Map(insights.map((row) => [row.item.id, row])), [insights]);

  const summary = useMemo(
    () => computeMenuSummary(items, categories, stations, insights),
    [items, categories, stations, insights],
  );

  const stationSummaries = useMemo(
    () =>
      computeStationSummaries(
        items,
        stations,
        stock.recipes,
        stock.items,
        stock.balances,
        stock.lots ?? [],
      ),
    [items, stations, stock.recipes, stock.items, stock.balances, stock.lots],
  );

  const filtered = useMemo(
    () => filterMenuItems(insights, filters, lang),
    [insights, filters, lang],
  );

  const issueCount = summary.routingProblems + summary.priceIssueCount;
  const hasPriceIssues = summary.priceIssueCount > 0;

  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const currentPage = Math.min(page, totalPages);
  const pageItems = useMemo(() => {
    const start = (currentPage - 1) * pageSize;
    return filtered.slice(start, start + pageSize);
  }, [filtered, currentPage, pageSize]);
  const pageSteps = useMemo(() => buildPaginationSteps(currentPage, totalPages), [currentPage, totalPages]);
  const startRow = filtered.length === 0 ? 0 : (currentPage - 1) * pageSize + 1;
  const endRow = Math.min(currentPage * pageSize, filtered.length);

  useEffect(() => {
    setPage(1);
  }, [filters, tab, pageSize]);

  useEffect(() => {
    setPage((current) => Math.min(Math.max(current, 1), totalPages));
  }, [totalPages]);

  function save(item: MenuItem) {
    const selectedStation = isConfiguredStation(item.station, stations)
      ? item.station
      : (stations[0] ?? item.station);
    store.saveMenuItem({ ...item, station: selectedStation });
    setEditing(null);
    setShowAdd(false);
    setDraftPending(true);
    showSuccess(t("Saving to database…", "ወደ ዳታቤዝ በመቀመጥ ላይ…"));
  }

  function remove(id: string) {
    if (window.confirm(t("Delete this menu item?", "ይህን የምናሌ እቃ ሰርዝ?"))) {
      store.removeMenuItem(id);
      setDraftPending(true);
    }
  }

  function addCategory() {
    const value = newCategory.trim();
    if (!value) return;
    store.addMenuCategory(value);
    setNewCategory("");
    setDraftPending(true);
  }

  function editCategory(category: string) {
    const next = window.prompt(t("Rename category", "ምድብ እንደገና ይሰይሙ"), category)?.trim();
    if (!next || next === category) return;
    store.renameMenuCategory(category, next);
    setDraftPending(true);
  }

  function deleteCategory(category: string) {
    if (!window.confirm(t(`Delete category "${category}" and its menu items?`, `ምድብ "${category}" እና እቃዎቹን ሰርዝ?`))) return;
    store.removeMenuCategory(category);
    if (filters.category === category) setFilters((current) => ({ ...current, category: "All" }));
    setDraftPending(true);
  }

  function toggleSelect(id: string) {
    setSelectedIds((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleSelectAll() {
    if (selectedIds.size === pageItems.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(pageItems.map((row) => row.item.id)));
    }
  }

  function applyBulkStation() {
    if (!permissions.canBulkEdit || selectedIds.size === 0) return;
    const station = window.prompt(t("Assign production station", "የምርት ጣቢያ"), stations[0])?.trim();
    if (!station || !isConfiguredStation(station, stations)) return;
    for (const id of selectedIds) {
      const item = items.find((row) => row.id === id);
      if (item) store.saveMenuItem({ ...item, station });
    }
    setSelectedIds(new Set());
    setDraftPending(true);
  }

  function exportCsv(scope: "all" | "filtered" | "selected") {
    const rows =
      scope === "selected"
        ? items.filter((item) => selectedIds.has(item.id))
        : scope === "filtered"
          ? filtered.map((row) => row.item)
          : items;
    downloadTextFile(`menu-export-${Date.now()}.csv`, exportMenuCsv(rows), "text/csv;charset=utf-8");
  }

  function filterByStation(station: ProductionStation) {
    setTab("items");
    setFilters((current) => ({ ...current, station, quick: "all" }));
  }

  function publishMenu() {
    if (summary.routingProblems > 0) {
      showError(t("Fix routing problems before publishing.", "ከመሰራጨት በፊት የማስተላለፊያ ችግሮችን ያስተካክሉ።"));
      return;
    }
    void store.publishMenuChanges().then((result) => {
      if (!result.ok) {
        showError(
          result.error
            ? t(
                `Could not publish menu to the database.\n\n${result.error}`,
                `ምናሌን ወደ ዳታቤዝ ማሰራጨት አልተቻለም።\n\n${result.error}`,
              )
            : t("Could not publish menu to the database.", "ምናሌን ወደ ዳታቤዝ ማሰራጨት አልተቻለም።"),
        );
        return;
      }
      setDraftPending(false);
      showSuccess(t("Menu published.", "ምናሌ ተሰራጭቷል።"));
    });
  }

  return (
    <div>
      <PageHeader
        title={t("Menu", "ምናሌ")}
        action={
          <div className="flex flex-wrap items-center gap-2">
            <RealtimeBadge status={store.realtimeStatus} lastSyncAt={summary.lastUpdated} />
            {draftPending && permissions.canPublish && (
              <Chip tone="gold">{t("Unpublished", "ያልተሰራጨ")}</Chip>
            )}
            {!permissions.readOnly && permissions.canManage && (
              <button
                type="button"
                onClick={() => setShowAdd(true)}
                className="h-10 px-4 rounded-lg bg-ember text-ember-foreground text-sm font-semibold inline-flex items-center gap-1.5"
              >
                <Icons.Plus className="size-4" /> {t("Add item", "እቃ ያክሉ")}
              </button>
            )}
            {!permissions.readOnly && permissions.canPublish && (
              <button
                type="button"
                onClick={publishMenu}
                className="h-10 px-4 rounded-lg bg-foreground text-background text-sm font-semibold"
              >
                {t("Publish", "አሰራጭ")}
              </button>
            )}
            <button
              type="button"
              onClick={() => setShowPosPreview(true)}
              className="h-10 px-3 rounded-lg border border-border bg-card text-sm"
            >
              {t("Preview", "ቅድመ-እይታ")}
            </button>
          </div>
        }
      />

      <div className="grid grid-cols-3 gap-2 mb-4">
        <button
          type="button"
          onClick={() => {
            setTab("items");
            setFilters((current) => ({ ...current, quick: "active" }));
          }}
          className="rounded-lg border border-border bg-card p-3 text-left hover:bg-surface-2"
        >
          <div className="text-xs text-muted-foreground">{t("Active", "ንቁ")}</div>
          <div className="font-display text-2xl font-semibold">{summary.activeItems}</div>
        </button>
        <button
          type="button"
          onClick={() => {
            setTab("items");
            setFilters((current) => ({ ...current, quick: "out_of_stock" }));
          }}
          className="rounded-lg border border-border bg-card p-3 text-left hover:bg-surface-2"
        >
          <div className="text-xs text-muted-foreground">{t("Unavailable", "አይገኝም")}</div>
          <div className="font-display text-2xl font-semibold">{summary.unavailableItems}</div>
        </button>
        <button
          type="button"
          onClick={() => {
            setTab("items");
            setFilters((current) => ({
              ...current,
              quick: hasPriceIssues ? "price_issues" : "missing_station",
            }));
          }}
          className="rounded-lg border border-border bg-card p-3 text-left hover:bg-surface-2"
        >
          <div className="text-xs text-muted-foreground">{t("Issues", "ችግሮች")}</div>
          <div className={`font-display text-2xl font-semibold ${issueCount ? "text-destructive" : ""}`}>
            {issueCount}
          </div>
        </button>
      </div>

      <div className="flex gap-1 overflow-x-auto pb-2 mb-3 border-b border-border">
        {MENU_TABS.map((entry) => (
          <button
            key={entry.id}
            type="button"
            onClick={() => setTab(entry.id)}
            className={`shrink-0 h-9 px-4 rounded-lg text-sm font-medium transition-colors ${
              tab === entry.id
                ? "bg-foreground text-background"
                : "text-muted-foreground hover:text-foreground hover:bg-surface-2"
            }`}
          >
            {t(entry.labelEn, entry.labelAm)}
          </button>
        ))}
      </div>

      {tab === "items" && (
        <>
          <div className="flex gap-1.5 overflow-x-auto mb-3 pb-0.5">
            <button
              type="button"
              onClick={() => setFilters((current) => ({ ...current, station: "All" }))}
              className={`shrink-0 h-8 px-3 rounded-lg text-xs font-medium border ${
                filters.station === "All"
                  ? "border-foreground bg-foreground text-background"
                  : "border-border bg-card text-muted-foreground"
              }`}
            >
              {t("All stations", "ሁሉም ጣቢያዎች")}
            </button>
            {stationSummaries.map((stat) => (
              <button
                key={stat.station}
                type="button"
                onClick={() => filterByStation(stat.station)}
                className={`shrink-0 h-8 px-3 rounded-lg text-xs font-medium border inline-flex items-center gap-1.5 ${
                  filters.station === stat.station
                    ? "border-foreground bg-foreground text-background"
                    : "border-border bg-card text-muted-foreground hover:text-foreground"
                }`}
              >
                <StationIcon station={stat.station} className="size-3.5" />
                {stat.station}
                <span className="opacity-70">{stat.total}</span>
              </button>
            ))}
          </div>

          <MenuFiltersPanel
            filters={filters}
            onChange={setFilters}
            categories={categories}
            stations={stations}
            resultCount={filtered.length}
            expanded={filtersExpanded}
            onToggleExpanded={() => setFiltersExpanded((value) => !value)}
          />

          {selectedIds.size > 0 && permissions.canBulkEdit && (
            <div className="mb-3 flex flex-wrap items-center gap-2 rounded-lg border border-border bg-surface-2/60 px-3 py-2 text-sm">
              <span>
                {selectedIds.size} {t("selected", "ተመርጠዋል")}
              </span>
              <button
                type="button"
                onClick={applyBulkStation}
                className="h-8 px-2 rounded border border-border bg-card text-xs"
              >
                {t("Change station", "ጣቢያ ቀይር")}
              </button>
              <button
                type="button"
                onClick={() => exportCsv("selected")}
                className="h-8 px-2 rounded border border-border bg-card text-xs"
              >
                {t("Export", "ላክ")}
              </button>
              <button
                type="button"
                onClick={() => setSelectedIds(new Set())}
                className="h-8 px-2 text-xs text-muted-foreground"
              >
                {t("Clear", "አጽዳ")}
              </button>
            </div>
          )}

          <div className="space-y-2 lg:hidden">
            {pageItems.map((row) => {
              const item = row.item;
              const itemStation = isConfiguredStation(item.station, stations)
                ? item.station
                : (stations[0] ?? item.station);
              return (
                <div key={item.id} className="rounded-xl border border-border bg-card p-3">
                  <button type="button" onClick={() => setDrawerInsight(row)} className="w-full text-left">
                    <div className="flex items-start gap-3">
                      <span className="size-11 rounded-lg bg-surface-2 grid place-items-center text-sm font-semibold shrink-0">
                        {item.emoji || item.name_en.slice(0, 2).toUpperCase()}
                      </span>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0">
                            <div className="font-semibold truncate">{menuItemName(item, lang)}</div>
                            <div className="text-xs text-muted-foreground truncate">
                              {item.category} · {itemStation}
                            </div>
                          </div>
                          <div className="font-mono font-semibold shrink-0">{formatETB(item.price)}</div>
                        </div>
                        <div className="mt-2 flex flex-wrap items-center gap-1.5">
                          <Chip
                            tone={
                              row.availability === "Available"
                                ? "teff"
                                : row.availability === "Out of Stock"
                                  ? "destructive"
                                  : "gold"
                            }
                          >
                            {row.availability}
                          </Chip>
                          {row.priceIssues.length > 0 && <Chip tone="gold">{t("Price", "ዋጋ")}</Chip>}
                        </div>
                      </div>
                    </div>
                  </button>
                  {!permissions.readOnly && (
                    <div className="mt-2 flex justify-end gap-1 border-t border-border pt-2">
                      <button
                        type="button"
                        onClick={() => setEditing(item)}
                        className="size-8 grid place-items-center rounded-lg border border-border"
                      >
                        <Icons.Pencil className="size-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={() => remove(item.id)}
                        className="size-8 grid place-items-center rounded-lg border border-border text-destructive"
                      >
                        <Icons.Trash2 className="size-3.5" />
                      </button>
                    </div>
                  )}
                </div>
              );
            })}
            {filtered.length === 0 && (
              <div className="text-center text-muted-foreground py-10 text-sm">
                {t("No menu items match", "ምንም የሚመሳሰሉ ምናሌ እቃዎች የሉም")}
              </div>
            )}
          </div>

          <Card className="!p-0 overflow-hidden hidden lg:block">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-surface-2 text-xs uppercase tracking-wider text-muted-foreground sticky top-0 z-10">
                  <tr>
                    {!permissions.readOnly && (
                      <th className="px-3 py-2.5 w-10">
                        <input
                          type="checkbox"
                          checked={pageItems.length > 0 && selectedIds.size === pageItems.length}
                          onChange={toggleSelectAll}
                          className="size-4"
                        />
                      </th>
                    )}
                    <th className="text-left px-3 py-2.5">{t("Item", "እቃ")}</th>
                    <th className="text-left px-3 py-2.5">{t("Category", "ምድብ")}</th>
                    <th className="text-left px-3 py-2.5">{t("Station", "ጣቢያ")}</th>
                    <th className="text-right px-3 py-2.5">{t("Price", "ዋጋ")}</th>
                    <th className="text-left px-3 py-2.5">{t("Status", "ሁኔታ")}</th>
                    <th className="px-3 py-2.5" />
                  </tr>
                </thead>
                <tbody>
                  {pageItems.map((row) => {
                    const item = row.item;
                    const itemStation = isConfiguredStation(item.station, stations)
                      ? item.station
                      : (stations[0] ?? item.station);
                    return (
                      <tr
                        key={item.id}
                        className="border-t border-border hover:bg-surface-2/60 cursor-pointer"
                        onClick={() => setDrawerInsight(row)}
                      >
                        {!permissions.readOnly && (
                          <td className="px-3 py-2.5" onClick={(event) => event.stopPropagation()}>
                            <input
                              type="checkbox"
                              checked={selectedIds.has(item.id)}
                              onChange={() => toggleSelect(item.id)}
                              className="size-4"
                            />
                          </td>
                        )}
                        <td className="px-3 py-2.5">
                          <div className="flex items-center gap-2 min-w-[180px]">
                            <span className="size-9 rounded-lg bg-surface-2 grid place-items-center text-xs font-semibold shrink-0">
                              {item.emoji || item.name_en.slice(0, 2).toUpperCase()}
                            </span>
                            <div className="min-w-0">
                              <div className="font-medium truncate">{menuItemName(item, lang)}</div>
                              {item.name_am && lang !== "am" ? (
                                <div className="text-xs text-muted-foreground truncate">{item.name_am}</div>
                              ) : null}
                            </div>
                          </div>
                        </td>
                        <td className="px-3 py-2.5 text-muted-foreground">{item.category}</td>
                        <td className="px-3 py-2.5">
                          <Chip tone={stationTone(itemStation) as ChipTone}>
                            <StationIcon station={itemStation} className="size-3" /> {itemStation}
                          </Chip>
                        </td>
                        <td className="px-3 py-2.5 text-right font-mono font-semibold">
                          {formatETB(item.price)}
                          {row.priceIssues.length > 0 && (
                            <Icons.AlertTriangle className="inline size-3 text-gold ml-1" />
                          )}
                        </td>
                        <td className="px-3 py-2.5">
                          <Chip
                            tone={
                              row.availability === "Available"
                                ? "teff"
                                : row.availability === "Out of Stock"
                                  ? "destructive"
                                  : "gold"
                            }
                          >
                            {row.availability}
                          </Chip>
                        </td>
                        <td className="px-3 py-2.5" onClick={(event) => event.stopPropagation()}>
                          {!permissions.readOnly && (
                            <div className="flex items-center gap-1 justify-end">
                              <button
                                type="button"
                                onClick={() => setEditing(item)}
                                className="size-8 grid place-items-center rounded-lg hover:bg-surface-2"
                                title={t("Edit", "አስተካክል")}
                              >
                                <Icons.Pencil className="size-3.5" />
                              </button>
                              <button
                                type="button"
                                onClick={() => remove(item.id)}
                                className="size-8 grid place-items-center rounded-lg hover:bg-destructive/10 hover:text-destructive"
                              >
                                <Icons.Trash2 className="size-3.5" />
                              </button>
                            </div>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            {filtered.length === 0 && (
              <div className="text-center text-muted-foreground py-10 text-sm">
                {t("No menu items match", "ምንም የሚመሳሰሉ ምናሌ እቃዎች የሉም")}
              </div>
            )}
          </Card>

          {filtered.length > 0 && (
            <div className="mt-3 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex items-center gap-3 text-sm text-muted-foreground">
                <span>
                  {t("Showing", "የሚታዩ")}{" "}
                  <span className="font-medium text-foreground">
                    {startRow}-{endRow}
                  </span>{" "}
                  {t("of", "ከ")} <span className="font-medium text-foreground">{filtered.length}</span>
                </span>
                <select
                  value={pageSize}
                  onChange={(event) => setPageSize(Number(event.target.value))}
                  className="h-8 px-2 rounded border border-border bg-card text-xs"
                >
                  {[10, 20, 50].map((size) => (
                    <option key={size} value={size}>
                      {size} / {t("page", "ገጽ")}
                    </option>
                  ))}
                </select>
              </div>
              {totalPages > 1 && (
                <div className="flex flex-wrap items-center justify-end gap-1">
                  <button
                    type="button"
                    onClick={() => setPage((current) => Math.max(1, current - 1))}
                    disabled={currentPage === 1}
                    className="inline-flex size-8 items-center justify-center rounded-lg border border-border disabled:opacity-50"
                  >
                    <Icons.ChevronLeft className="size-4" />
                  </button>
                  {pageSteps.map((step, index) =>
                    step === "ellipsis" ? (
                      <span
                        key={`ellipsis-${index}`}
                        className="inline-flex size-8 items-center justify-center text-muted-foreground"
                      >
                        <Icons.MoreHorizontal className="size-4" />
                      </span>
                    ) : (
                      <button
                        key={step}
                        type="button"
                        onClick={() => setPage(step)}
                        className={`inline-flex size-8 items-center justify-center rounded-lg border text-sm ${
                          step === currentPage
                            ? "border-primary bg-primary text-primary-foreground"
                            : "border-border hover:bg-surface-2"
                        }`}
                      >
                        {step}
                      </button>
                    ),
                  )}
                  <button
                    type="button"
                    onClick={() => setPage((current) => Math.min(totalPages, current + 1))}
                    disabled={currentPage === totalPages}
                    className="inline-flex size-8 items-center justify-center rounded-lg border border-border disabled:opacity-50"
                  >
                    <Icons.ChevronRight className="size-4" />
                  </button>
                </div>
              )}
            </div>
          )}
        </>
      )}

      {tab === "categories" && (
        <Card>
          <div className="flex items-start justify-between gap-3 mb-4">
            <h3 className="font-display font-semibold">{t("Categories", "ምድቦች")}</h3>
            <Chip tone="muted">{summary.totalCategories}</Chip>
          </div>
          {!permissions.readOnly && permissions.canManage && (
            <div className="flex gap-2 mb-3">
              <input
                value={newCategory}
                onChange={(event) => setNewCategory(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter") addCategory();
                }}
                placeholder={t("New category…", "አዲስ ምድብ…")}
                className="flex-1 h-10 px-3 rounded-lg border border-border bg-card text-sm"
              />
              <button
                type="button"
                onClick={addCategory}
                className="h-10 px-4 rounded-lg bg-foreground text-background text-sm font-medium"
              >
                {t("Add", "አክል")}
              </button>
            </div>
          )}
          <div className="space-y-2">
            {categories
              .filter((category) => category !== "All")
              .map((category) => {
                const count = items.filter((item) => item.category === category).length;
                return (
                  <div
                    key={category}
                    className="flex items-center justify-between gap-3 rounded-lg border border-border px-3 py-2.5"
                  >
                    <button
                      type="button"
                      className="text-left min-w-0"
                      onClick={() => {
                        setTab("items");
                        setFilters((current) => ({ ...current, category, quick: "all" }));
                      }}
                    >
                      <div className="font-medium">{category}</div>
                      <div className="text-xs text-muted-foreground">
                        {count} {t("items", "እቃዎች")}
                      </div>
                    </button>
                    {!permissions.readOnly && permissions.canManage && (
                      <div className="flex items-center gap-1">
                        <button
                          type="button"
                          onClick={() => editCategory(category)}
                          className="size-8 grid place-items-center rounded-lg hover:bg-surface-2"
                        >
                          <Icons.Pencil className="size-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={() => deleteCategory(category)}
                          className="size-8 grid place-items-center rounded-lg hover:bg-destructive/10 hover:text-destructive"
                        >
                          <Icons.Trash2 className="size-3.5" />
                        </button>
                      </div>
                    )}
                  </div>
                );
              })}
          </div>
        </Card>
      )}

      {tab === "export" && (
        <Card>
          <h3 className="font-display font-semibold mb-2">{t("Export menu", "ምናሌ ላክ")}</h3>
          <p className="text-sm text-muted-foreground mb-4">
            {t(
              "Download your menu as CSV for backup or editing.",
              "ምናሌዎን ለመጠባበቂያ ወይም ለማስተካከል እንደ CSV ያውርዱ።",
            )}
          </p>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => exportCsv("all")}
              className="h-10 px-4 rounded-lg bg-foreground text-background text-sm font-medium"
            >
              {t("Export all", "ሁሉንም ላክ")}
            </button>
            <button
              type="button"
              onClick={() => exportCsv("filtered")}
              className="h-10 px-4 rounded-lg border border-border bg-card text-sm"
            >
              {t("Export filtered", "የተጣሩትን ላክ")}
            </button>
          </div>
        </Card>
      )}

      <MenuItemDrawer
        insight={drawerInsight}
        onClose={() => setDrawerInsight(null)}
        readOnly={permissions.readOnly}
        onEdit={
          drawerInsight && !permissions.readOnly
            ? () => {
                setEditing(drawerInsight.item);
                setDrawerInsight(null);
              }
            : undefined
        }
      />

      {(editing || showAdd) && !permissions.readOnly && (
        <MenuItemModal
          item={editing ?? undefined}
          categories={categories.filter((category) => category !== "All")}
          stations={stations}
          stockItems={stock.items}
          balances={stock.balances}
          lots={stock.lots}
          onClose={() => {
            setEditing(null);
            setShowAdd(false);
          }}
          onSave={save}
        />
      )}

      {showPosPreview && (
        <div className="fixed inset-0 z-50 bg-foreground/40 backdrop-blur-sm grid place-items-center p-4">
          <div className="surface-card max-w-4xl w-full max-h-[90vh] overflow-y-auto !p-5">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-display text-xl font-semibold">{t("POS Preview", "POS ቅድመ-እይታ")}</h3>
              <button
                type="button"
                onClick={() => setShowPosPreview(false)}
                className="size-8 grid place-items-center rounded-lg hover:bg-surface-2"
              >
                <Icons.X className="size-4" />
              </button>
            </div>
            <div className="flex gap-2 mb-4 overflow-x-auto">
              {categories
                .filter((category) => category !== "All")
                .map((category) => (
                  <Chip key={category} tone="muted">
                    {category}
                  </Chip>
                ))}
            </div>
            <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {items.slice(0, 24).map((item) => {
                const row = insightMap.get(item.id);
                return (
                  <div key={item.id} className="rounded-lg border border-border p-3 bg-card">
                    <div className="flex items-center gap-2 mb-2">
                      <span className="size-10 rounded-lg bg-surface-2 grid place-items-center text-sm font-semibold">
                        {item.emoji || item.name_en.slice(0, 2)}
                      </span>
                      <div className="min-w-0">
                        <div className="font-medium truncate">{menuItemName(item, lang)}</div>
                        <div className="font-mono text-sm">{formatETB(item.price)}</div>
                      </div>
                    </div>
                    {row && row.availability !== "Available" && (
                      <Chip tone="destructive">{row.availability}</Chip>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
