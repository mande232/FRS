import { useMemo, useState } from "react";
import * as Icons from "lucide-react";
import type { MenuItem, ProductionStation } from "@/lib/demo-data";
import { isButcherStation } from "@/lib/menu-analytics";
import { useT } from "@/lib/i18n";
import { isConfiguredStation } from "@/lib/stations";
import {
  GOAT_LIMB_SKU,
  isGoatPoolSku,
  spiritYieldForItem,
  stationToOperationalLocation,
  type StockLot,
  type StockManagedItem,
} from "@/lib/stock-management";

function isSpiritCategory(category: string) {
  const key = category.trim().toLowerCase();
  return key === "spirits" || key === "spirit" || key === "whisky";
}

function isProductionStation(
  station: string,
  stations: readonly ProductionStation[],
): station is ProductionStation {
  return isConfiguredStation(station, stations);
}

function cleanPositive(value: number, fallback: number) {
  return Number.isFinite(value) && value > 0 ? value : fallback;
}

function isButcherHouseStock(stock: { id: string; preferredLocation: string; baseUnit: string }) {
  if (isGoatPoolSku(stock.id)) return true;
  return stock.preferredLocation === "Butcher" && stock.baseUnit === "kg";
}

function defaultButcherKgStockSku(
  stockItems: Array<{ id: string; preferredLocation: string; baseUnit: string }>,
  current?: string,
) {
  if (current && stockItems.some((row) => row.id === current && isButcherHouseStock(row))) {
    return current;
  }
  if (stockItems.some((row) => row.id === GOAT_LIMB_SKU)) return GOAT_LIMB_SKU;
  return stockItems.find((row) => isButcherHouseStock(row))?.id;
}

function butcherOnHandQty(
  stockId: string,
  location: string,
  balances?: Array<{ itemId: string; location: string; quantity: number }>,
  lots?: Array<Pick<StockLot, "itemId" | "location" | "quantity" | "status">>,
) {
  if (isGoatPoolSku(stockId) && lots && lots.length > 0) {
    const hasLots = lots.some((lot) => lot.itemId === stockId);
    if (hasLots) {
      return Math.round(
        (lots
          .filter(
            (lot) =>
              lot.itemId === stockId &&
              lot.location === "Butcher" &&
              lot.status === "Available",
          )
          .reduce((sum, lot) => sum + lot.quantity, 0) +
          Number.EPSILON) *
          1000,
      ) / 1000;
    }
  }
  return balances?.find((row) => row.itemId === stockId && row.location === location)?.quantity ?? 0;
}

export type MenuItemModalProps = {
  item?: MenuItem;
  categories: string[];
  stations: readonly ProductionStation[];
  stockItems: Array<Pick<StockManagedItem, "id" | "name" | "baseUnit" | "preferredLocation" | "conversions" | "bottleVolumeMl">>;
  /** Per-location stock balances used to show department on-hand quantities in the linked-stock dropdown. */
  balances?: Array<{ itemId: string; location: string; quantity: number }>;
  /** Goat pool left kg comes from butcher lots (same source as Goat processing). */
  lots?: Array<Pick<StockLot, "itemId" | "location" | "quantity" | "status">>;
  onClose: () => void;
  onSave: (m: MenuItem) => void;
};

export function MenuItemModal({
  item,
  categories,
  stations,
  stockItems,
  balances,
  lots,
  onClose,
  onSave,
}: MenuItemModalProps) {
  const t = useT();
  const initialStation =
    item && isProductionStation(item.station, stations) ? item.station : (stations[0] ?? "");
  const initialButcherMode = isButcherStation(initialStation);
  const initialKgMode = initialButcherMode && (item?.pricingMode ?? "kg") === "kg";
  const [form, setForm] = useState<MenuItem>(
    item
      ? {
          ...item,
          station: initialStation,
          stockDeductionLocation:
            initialKgMode || isGoatPoolSku(item.stockSku ?? "")
              ? "Butcher"
              : item.stockDeductionLocation,
        }
      : {
          id: `m${Date.now()}`,
          name_en: "",
          name_am: "",
          category: categories[0] ?? "Mains",
          price: 0,
          vipPrice: undefined,
          cost: 0,
          station: initialStation,
          emoji: "",
          pricingMode: initialButcherMode ? "kg" : "unit",
          unitLabel: initialButcherMode ? "kg" : "Plate",
          defaultQty: initialButcherMode ? 1 : undefined,
          qtyStep: initialButcherMode ? 0.25 : undefined,
          stockSku: initialButcherMode ? defaultButcherKgStockSku(stockItems) : undefined,
          stockDeductionLocation: initialButcherMode ? "Butcher" : undefined,
          stockDeductionRule: initialButcherMode ? "direct" : undefined,
        },
  );
  const butcherMode = isButcherStation(form.station);
  const butcherKgMode = butcherMode && form.pricingMode === "kg";

  // POS deducts from the department (deduction location / station), never from
  // Store 1/2, so label the linked-stock options with the department and its on-hand qty.
  const deductionDepartment = butcherKgMode
    ? "Butcher"
    : form.stockDeductionLocation || stationToOperationalLocation(form.station) || null;

  const butcherStockItems = useMemo(
    () => stockItems.filter((stock) => isButcherHouseStock(stock)),
    [stockItems],
  );

  const spiritMode = isSpiritCategory(form.category);
  const linkableStockItems = butcherKgMode
    ? butcherStockItems
    : spiritMode
      ? stockItems.filter(
          (stock) =>
            stock.baseUnit === "bottle" &&
            (stock.preferredLocation === "VIP Bar" || stock.category === "Whisky"),
        )
      : stockItems;

  const stockOptions = useMemo(
    () =>
      linkableStockItems.map((stock) => {
        if (!deductionDepartment) {
          return { id: stock.id, label: `${stock.name} (${stock.baseUnit})` };
        }
        const deptQty = butcherOnHandQty(stock.id, deductionDepartment, balances, lots);
        return {
          id: stock.id,
          label: `${stock.name} (${stock.baseUnit} · ${deductionDepartment}: ${deptQty})`,
        };
      }),
    [linkableStockItems, balances, lots, deductionDepartment],
  );

  const categoryOptions = useMemo(() => {
    const base = categories.filter(Boolean);
    if (!base.some((row) => row.trim().toLowerCase() === "whisky")) base.push("Whisky");
    return base;
  }, [categories]);

  const linkedStock = form.stockSku ? stockItems.find((row) => row.id === form.stockSku) : undefined;
  const yieldHint = linkedStock
    ? spiritYieldForItem({ baseUnit: linkedStock.baseUnit, conversions: linkedStock.conversions ?? [] })
    : null;

  function submit() {
    if (!form.name_en.trim()) return;
    if (!form.category.trim()) return;
    if (!stations.length || !isProductionStation(form.station, stations)) return;
    const nextButcherMode = isButcherStation(form.station);
    const kgMode = nextButcherMode && form.pricingMode === "kg";
    const nextSpirit = isSpiritCategory(form.category);
    const linkedSku = kgMode
      ? defaultButcherKgStockSku(stockItems, form.stockSku) || form.stockSku || undefined
      : form.stockSku || undefined;
    onSave({
      ...form,
      name_en: form.name_en.trim(),
      name_am: form.name_am.trim(),
      category: form.category.trim(),
      station: form.station,
      price: Math.max(0, form.price),
      vipPrice: nextSpirit
        ? undefined
        : form.vipPrice !== undefined
          ? Math.max(0, form.vipPrice)
          : undefined,
      singlePrice:
        nextSpirit && form.singlePrice !== undefined && form.singlePrice !== null
          ? Math.max(0, form.singlePrice)
          : nextSpirit
            ? undefined
            : form.singlePrice,
      doublePrice:
        nextSpirit && form.doublePrice !== undefined && form.doublePrice !== null
          ? Math.max(0, form.doublePrice)
          : nextSpirit
            ? undefined
            : form.doublePrice,
      halfBottlePrice:
        nextSpirit && form.halfBottlePrice !== undefined && form.halfBottlePrice !== null
          ? Math.max(0, form.halfBottlePrice)
          : nextSpirit && form.price > 0
            ? Math.round((form.price / 2) * 100) / 100
            : nextSpirit
              ? undefined
              : form.halfBottlePrice,
      cost: Math.max(0, form.cost),
      pricingMode: kgMode ? "kg" : "unit",
      unitLabel: kgMode ? "kg" : nextSpirit ? "Bottle" : (form.unitLabel?.trim() || undefined),
      defaultQty: kgMode ? cleanPositive(form.defaultQty ?? 1, 1) : undefined,
      qtyStep: kgMode ? cleanPositive(form.qtyStep ?? 0.25, 0.25) : undefined,
      stockSku: linkedSku,
      stockDeductionLocation: kgMode || (linkedSku && isGoatPoolSku(linkedSku))
        ? "Butcher"
        : nextSpirit
          ? form.stockDeductionLocation || "VIP Bar"
          : form.stockDeductionLocation || undefined,
      stockDeductionRule: form.stockDeductionRule || (linkedSku ? "direct" : undefined),
      sellingUnit: form.sellingUnit?.trim() || form.unitLabel?.trim() || undefined,
      minimumStock: form.minimumStock != null ? Math.max(0, form.minimumStock) : undefined,
      outOfStockBehavior: form.outOfStockBehavior || undefined,
    });
  }

  function selectStation(station: string) {
    const nextButcherMode = isButcherStation(station);
    setForm({
      ...form,
      station,
      pricingMode: nextButcherMode ? (form.pricingMode ?? "kg") : "unit",
      unitLabel: nextButcherMode ? (form.pricingMode === "unit" ? (form.unitLabel ?? "Plate") : "kg") : (form.unitLabel ?? "Plate"),
      defaultQty: nextButcherMode && form.pricingMode !== "unit" ? (form.defaultQty ?? 1) : undefined,
      qtyStep: nextButcherMode && form.pricingMode !== "unit" ? (form.qtyStep ?? 0.25) : undefined,
      veg: nextButcherMode ? false : form.veg,
      stockSku: nextButcherMode
        ? defaultButcherKgStockSku(stockItems, form.stockSku)
        : form.stockSku,
      stockDeductionLocation: nextButcherMode ? "Butcher" : form.stockDeductionLocation,
      stockDeductionRule: nextButcherMode ? (form.stockDeductionRule ?? "direct") : form.stockDeductionRule,
    });
  }

  return (
    <div className="fixed inset-0 z-50 bg-foreground/40 backdrop-blur-sm grid place-items-center p-4">
      <div className="surface-card max-w-lg w-full !p-6 max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between mb-5">
          <h3 className="font-display text-xl font-semibold">{item ? t("Edit item", "እቃ አስተካክል") : t("Add item", "እቃ ያክሉ")}</h3>
          <button
            onClick={onClose}
            className="size-8 grid place-items-center rounded-lg hover:bg-surface-2"
          >
            <Icons.X className="size-4" />
          </button>
        </div>

        <div className="grid grid-cols-2 gap-3 mb-5">
          <div className="col-span-2 sm:col-span-1">
            <label className="text-xs text-muted-foreground">{t("Name (English)", "ስም (እንግሊዝኛ)")}</label>
            <input
              value={form.name_en}
              onChange={(event) => setForm({ ...form, name_en: event.target.value })}
              className="w-full mt-1 h-9 px-3 rounded-lg border border-border bg-card text-sm focus:outline-none focus:ring-2 focus:ring-ring/40"
            />
          </div>
          <div className="col-span-2 sm:col-span-1">
            <label className="text-xs text-muted-foreground">{t("Name (AM)", "ስም (አማርኛ)")}</label>
            <input
              value={form.name_am}
              onChange={(event) => setForm({ ...form, name_am: event.target.value })}
              className="w-full mt-1 h-9 px-3 rounded-lg border border-border bg-card text-sm focus:outline-none focus:ring-2 focus:ring-ring/40"
            />
          </div>
          <div>
            <label className="text-xs text-muted-foreground">{t("Category", "ምድብ")}</label>
            <select
              value={form.category}
              onChange={(event) => {
                const category = event.target.value;
                const nextSpirit = isSpiritCategory(category);
                setForm((current) => ({
                  ...current,
                  category,
                  stockDeductionLocation: nextSpirit ? "VIP Bar" : current.stockDeductionLocation,
                  stockDeductionRule: nextSpirit ? "direct" : current.stockDeductionRule,
                  unitLabel: nextSpirit ? "Bottle" : current.unitLabel,
                  vipPrice: nextSpirit ? undefined : current.vipPrice,
                }));
              }}
              className="w-full mt-1 h-9 px-3 rounded-lg border border-border bg-card text-sm focus:outline-none"
            >
              {categoryOptions.map((category) => (
                <option key={category}>{category}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="text-xs text-muted-foreground">{t("Production station", "የምርት ጣቢያ")}</label>
            <select
              value={form.station}
              onChange={(event) => selectStation(event.target.value)}
              className="w-full mt-1 h-9 px-3 rounded-lg border border-border bg-card text-sm focus:outline-none"
            >
              {stations.map((station) => (
                <option key={station}>{station}</option>
              ))}
            </select>
          </div>
          {butcherMode && (
            <div className="col-span-2">
              <label className="text-xs text-muted-foreground">{t("Pricing mode", "የዋጋ አይነት")}</label>
              <div className="mt-1 flex rounded-lg border border-border overflow-hidden">
                {(["kg", "unit"] as const).map((mode) => (
                  <button
                    key={mode}
                    type="button"
                    onClick={() => setForm({
                      ...form,
                      pricingMode: mode,
                      unitLabel: mode === "kg" ? "kg" : "Plate",
                      defaultQty: mode === "kg" ? (form.defaultQty ?? 1) : undefined,
                      qtyStep: mode === "kg" ? (form.qtyStep ?? 0.25) : undefined,
                      stockSku: mode === "kg" ? defaultButcherKgStockSku(stockItems, form.stockSku) : form.stockSku,
                      stockDeductionLocation: mode === "kg" ? "Butcher" : form.stockDeductionLocation,
                      stockDeductionRule: mode === "kg" ? (form.stockDeductionRule ?? "direct") : form.stockDeductionRule,
                    })}
                    className={`flex-1 h-9 text-sm font-medium transition-colors ${
                      form.pricingMode === mode
                        ? "bg-foreground text-background"
                        : "bg-card text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    {mode === "kg" ? t("By kg", "በኪ.ግ") : t("By plate", "በሳህን")}
                  </button>
                ))}
              </div>
            </div>
          )}
          <div>
            <label className="text-xs text-muted-foreground">
              {spiritMode
                ? t("Bottle price (ETB)", "የጠርሙስ ዋጋ (ብር)")
                : butcherMode && form.pricingMode === "kg"
                  ? t("Price per kg (ETB)", "ዋጋ በኪ.ግ (ብር)")
                  : t("Price (ETB)", "ዋጋ (ብር)")}
            </label>
            <input
              type="number"
              min={0}
              value={form.price}
              onChange={(event) => setForm({ ...form, price: Number(event.target.value) })}
              className="w-full mt-1 h-9 px-3 rounded-lg border border-border bg-card text-sm font-mono focus:outline-none focus:ring-2 focus:ring-ring/40"
            />
          </div>
          {spiritMode ? (
            <>
              <div>
                <label className="text-xs text-muted-foreground">{t("Single shot price (ETB)", "ነጠላ ሾት ዋጋ (ብር)")}</label>
                <input
                  type="number"
                  min={0}
                  value={form.singlePrice ?? ""}
                  placeholder={t("Leave blank if not sold", "ካልተሸጠ ባዶ ይተዉ")}
                  onChange={(event) =>
                    setForm({
                      ...form,
                      singlePrice: event.target.value === "" ? undefined : Number(event.target.value),
                      unitLabel: "Bottle",
                    })
                  }
                  className="w-full mt-1 h-9 px-3 rounded-lg border border-border bg-card text-sm font-mono focus:outline-none focus:ring-2 focus:ring-ring/40"
                />
              </div>
              <div>
                <label className="text-xs text-muted-foreground">{t("Double shot price (ETB)", "ድርብ ሾት ዋጋ (ብር)")}</label>
                <input
                  type="number"
                  min={0}
                  value={form.doublePrice ?? ""}
                  placeholder={t("Leave blank if not sold", "ካልተሸጠ ባዶ ይተዉ")}
                  onChange={(event) =>
                    setForm({
                      ...form,
                      doublePrice: event.target.value === "" ? undefined : Number(event.target.value),
                      unitLabel: "Bottle",
                    })
                  }
                  className="w-full mt-1 h-9 px-3 rounded-lg border border-border bg-card text-sm font-mono focus:outline-none focus:ring-2 focus:ring-ring/40"
                />
              </div>
              <div>
                <label className="text-xs text-muted-foreground">{t("Half bottle price (ETB)", "ግማሽ ጠርሙስ ዋጋ (ብር)")}</label>
                <input
                  type="number"
                  min={0}
                  value={form.halfBottlePrice ?? ""}
                  placeholder={t("Defaults to half of bottle price", "ነባሪ፡ የጠርሙስ ዋጋ ግማሽ")}
                  onChange={(event) =>
                    setForm({
                      ...form,
                      halfBottlePrice: event.target.value === "" ? undefined : Number(event.target.value),
                      unitLabel: "Bottle",
                    })
                  }
                  className="w-full mt-1 h-9 px-3 rounded-lg border border-border bg-card text-sm font-mono focus:outline-none focus:ring-2 focus:ring-ring/40"
                />
              </div>
              {yieldHint ? (
                <div className="col-span-2 text-xs text-muted-foreground rounded-lg border border-border bg-surface-2/50 px-3 py-2">
                  {t(
                    `Linked stock yield: 1 bottle = ${yieldHint.doublesPerBottle} doubles / ${yieldHint.singlesPerBottle} singles${linkedStock?.bottleVolumeMl ? ` · ${linkedStock.bottleVolumeMl} ml` : ""}. Edit yield on stock master.`,
                    `የተገናኘ ክምችት: 1 ጠርሙስ = ${yieldHint.doublesPerBottle} ድርብ / ${yieldHint.singlesPerBottle} ነጠላ${linkedStock?.bottleVolumeMl ? ` · ${linkedStock.bottleVolumeMl} ml` : ""}። ውጤቱን በክምችት ዝርዝር ያስተካክሉ።`,
                  )}
                </div>
              ) : (
                <div className="col-span-2 text-xs text-muted-foreground">
                  {t("Link a whisky stock SKU to show doubles-per-bottle yield.", "ድርብ በጠርሙስ ለማሳየት የዊስኪ ክምችት SKU ያገናኙ።")}
                </div>
              )}
            </>
          ) : (
            <div>
              <label className="text-xs text-muted-foreground">{t("VIP Price (ETB)", "VIP ዋጋ (ብር)")}</label>
              <input
                type="number"
                min={0}
                value={form.vipPrice ?? ""}
                placeholder={t("Same as regular", "እንደ መደበኛ")}
                onChange={(event) => setForm({ ...form, vipPrice: event.target.value === "" ? undefined : Number(event.target.value) })}
                className="w-full mt-1 h-9 px-3 rounded-lg border border-border bg-card text-sm font-mono focus:outline-none focus:ring-2 focus:ring-ring/40"
              />
            </div>
          )}
          {(!butcherMode || form.pricingMode === "unit") && !spiritMode && (
            <div>
              <label className="text-xs text-muted-foreground">{t("Unit label", "የመለኪያ ስም")}</label>
              <select
                value={["Plate", "Bottle", "Double Shot", "Glass", "Cup", "Bowl"].includes(form.unitLabel ?? "") ? (form.unitLabel ?? "Plate") : "__custom"}
                onChange={(event) => {
                  if (event.target.value !== "__custom") setForm({ ...form, unitLabel: event.target.value });
                  else setForm({ ...form, unitLabel: "" });
                }}
                className="w-full mt-1 h-9 px-3 rounded-lg border border-border bg-card text-sm focus:outline-none"
              >
                {["Plate", "Bottle", "Double Shot", "Glass", "Cup", "Bowl"].map((opt) => (
                  <option key={opt} value={opt}>{opt}</option>
                ))}
                <option value="__custom">{t("Custom…", "ሌላ…")}</option>
              </select>
              {!["Plate", "Bottle", "Double Shot", "Glass", "Cup", "Bowl"].includes(form.unitLabel ?? "") && (
                <input
                  value={form.unitLabel ?? ""}
                  placeholder={t("e.g. Tray, Jug", "ለምሳሌ Tray, Jug")}
                  onChange={(event) => setForm({ ...form, unitLabel: event.target.value || undefined })}
                  className="w-full mt-1 h-9 px-3 rounded-lg border border-border bg-card text-sm focus:outline-none focus:ring-2 focus:ring-ring/40"
                />
              )}
            </div>
          )}
          <div>
            <label className="text-xs text-muted-foreground">{t("Short code", "አጭር ኮድ")}</label>
            <input
              value={form.emoji}
              placeholder={t("e.g. AF, TJ, MW", "ለምሳሌ AF, TJ, MW")}
              onChange={(event) => setForm({ ...form, emoji: event.target.value })}
              className="w-full mt-1 h-9 px-3 rounded-lg border border-border bg-card text-sm focus:outline-none focus:ring-2 focus:ring-ring/40"
            />
          </div>
          {butcherMode && (
            <>
              <div>
                <label className="text-xs text-muted-foreground">{t("Cost (ETB)", "ዋጋ (ብር)")}</label>
                <input
                  type="number"
                  min={0}
                  value={form.cost}
                  onChange={(event) => setForm({ ...form, cost: Number(event.target.value) })}
                  className="w-full mt-1 h-9 px-3 rounded-lg border border-border bg-card text-sm font-mono focus:outline-none focus:ring-2 focus:ring-ring/40"
                />
              </div>
              {form.pricingMode === "kg" && (
                <>
                  <div>
                    <label className="text-xs text-muted-foreground">{t("Default kg", "መደበኛ ኪ.ግ")}</label>
                    <input
                      type="number"
                      min={0.01}
                      step={0.01}
                      value={form.defaultQty ?? 1}
                      onChange={(event) => setForm({ ...form, defaultQty: Number(event.target.value) })}
                      className="w-full mt-1 h-9 px-3 rounded-lg border border-border bg-card text-sm font-mono focus:outline-none focus:ring-2 focus:ring-ring/40"
                    />
                  </div>
                  <div>
                    <label className="text-xs text-muted-foreground">{t("Kg step", "ኪ.ግ እርምጃ")}</label>
                    <input
                      type="number"
                      min={0.01}
                      step={0.01}
                      value={form.qtyStep ?? 0.25}
                      onChange={(event) => setForm({ ...form, qtyStep: Number(event.target.value) })}
                      className="w-full mt-1 h-9 px-3 rounded-lg border border-border bg-card text-sm font-mono focus:outline-none focus:ring-2 focus:ring-ring/40"
                    />
                  </div>
                  <div className="col-span-2">
                    <label className="text-xs text-muted-foreground">{t("Linked inventory stock", "የተገናኘ የክምችት እቃ")}</label>
                    <select
                      value={form.stockSku ?? ""}
                      onChange={(event) =>
                        setForm({
                          ...form,
                          stockSku: event.target.value || undefined,
                          stockDeductionLocation: "Butcher",
                          stockDeductionRule: "direct",
                        })
                      }
                      className="w-full mt-1 h-9 px-3 rounded-lg border border-border bg-card text-sm focus:outline-none"
                    >
                      <option value="">{t("No inventory stock", "የክምችት እቃ የለም")}</option>
                      {stockOptions.map((s) => (
                        <option key={s.id} value={s.id}>{s.label}</option>
                      ))}
                    </select>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {t(
                        "Goat limb kg is deducted only from Butcher House stock.",
                        "የፍየል እግር ኪ.ግ ከቁራኛ ቤት ክምችት ብቻ ይቀነሳል።",
                      )}
                    </p>
                  </div>
                </>
              )}
            </>
          )}
          {!butcherMode && (
            <>
              <div className="col-span-2">
                <label className="text-xs text-muted-foreground">{t("Linked stock item", "የተገናኘ የክምችት እቃ")}</label>
                <select
                  value={form.stockSku ?? ""}
                  onChange={(event) => setForm({ ...form, stockSku: event.target.value || undefined })}
                  className="w-full mt-1 h-9 px-3 rounded-lg border border-border bg-card text-sm focus:outline-none"
                >
                  <option value="">{t("None (name match only)", "የለም (በስም ብቻ)")}</option>
                  {stockOptions.map((s) => (
                    <option key={s.id} value={s.id}>{s.label}</option>
                  ))}
                </select>
              </div>
              <div className="col-span-2 flex items-center gap-2 pt-1">
                <input
                  type="checkbox"
                  id="veg"
                  checked={form.veg ?? false}
                  onChange={(event) => setForm({ ...form, veg: event.target.checked })}
                  className="size-4 rounded"
                />
                <label htmlFor="veg" className="text-sm">
                  {t("Vegetarian", "አትክልታማ")}
                </label>
              </div>
            </>
          )}

          <div className="col-span-2 mt-2 rounded-xl border border-border bg-surface-2/40 p-3 space-y-3">
            <div className="text-sm font-semibold">{t("POS inventory controls", "የPOS ክምችት ቁጥጥር")}</div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs text-muted-foreground">{t("Deduction rule", "የቅነሳ ደንብ")}</label>
                <select
                  value={form.stockDeductionRule ?? (form.stockSku ? "direct" : "recipe")}
                  onChange={(event) => setForm({ ...form, stockDeductionRule: event.target.value as "direct" | "recipe" })}
                  className="w-full mt-1 h-11 px-3 rounded-lg border border-border bg-card text-sm focus:outline-none"
                  disabled={butcherKgMode}
                >
                  <option value="direct">{t("Direct stock SKU", "ቀጥተኛ የክምችት SKU")}</option>
                  <option value="recipe">{t("Recipe / BOM", "የምግብ አዘገጃጀት")}</option>
                </select>
              </div>
              <div>
                <label className="text-xs text-muted-foreground">{t("Stock deduction location", "የክምችት ቅነሳ ቦታ")}</label>
                <select
                  value={butcherKgMode ? "Butcher" : (form.stockDeductionLocation ?? "")}
                  onChange={(event) => setForm({ ...form, stockDeductionLocation: event.target.value || undefined })}
                  className="w-full mt-1 h-11 px-3 rounded-lg border border-border bg-card text-sm focus:outline-none"
                  disabled={butcherKgMode}
                >
                  <option value="">{t("From station mapping", "ከጣቢያ ካርታ")}</option>
                  {["Main Bar", "VIP Bar", "Kitchen", "Butcher", "Coffee House"].map((location) => (
                    <option key={location} value={location}>{location}</option>
                  ))}
                </select>
                {butcherKgMode ? (
                  <p className="mt-1 text-xs text-muted-foreground">
                    {t("Locked to Butcher House for kg sales.", "ለኪ.ግ ሽያጭ በቁራኛ ቤት ብቻ ተቆልፏል።")}
                  </p>
                ) : null}
              </div>
              <div>
                <label className="text-xs text-muted-foreground">{t("Selling unit", "የሽያጭ መለኪያ")}</label>
                <input
                  value={form.sellingUnit ?? form.unitLabel ?? ""}
                  onChange={(event) => setForm({ ...form, sellingUnit: event.target.value || undefined })}
                  className="w-full mt-1 h-11 px-3 rounded-lg border border-border bg-card text-sm focus:outline-none"
                  placeholder={form.unitLabel || "Plate"}
                />
              </div>
              <div>
                <label className="text-xs text-muted-foreground">{t("Minimum stock", "ዝቅተኛ ክምችት")}</label>
                <input
                  type="number"
                  min={0}
                  value={form.minimumStock ?? 0}
                  onChange={(event) => setForm({ ...form, minimumStock: Math.max(0, Number(event.target.value) || 0) })}
                  className="w-full mt-1 h-11 px-3 rounded-lg border border-border bg-card text-sm font-mono focus:outline-none"
                />
              </div>
              <div className="col-span-2">
                <label className="text-xs text-muted-foreground">{t("Out-of-stock behavior", "ከክምችት ውጭ ባህሪ")}</label>
                <select
                  value={form.outOfStockBehavior ?? ""}
                  onChange={(event) => setForm({
                    ...form,
                    outOfStockBehavior: (event.target.value || undefined) as MenuItem["outOfStockBehavior"],
                  })}
                  className="w-full mt-1 h-11 px-3 rounded-lg border border-border bg-card text-sm focus:outline-none"
                >
                  <option value="">{t("Use inventory default", "የክምችት ነባሪ ተጠቀም")}</option>
                  <option value="block">{t("Block sale", "ሽያጭ አግድ")}</option>
                  <option value="warn_manager">{t("Warn / manager override", "አስጠንቅቅ / አስተዳዳሪ")}</option>
                  <option value="allow_negative_authorized">{t("Allow negative (authorized)", "አሉታዊ ፍቀድ (ፈቃድ ያለው)")}</option>
                  <option value="auto_unavailable">{t("Auto unavailable", "ራስ-ሰር አይገኝም")}</option>
                </select>
              </div>
            </div>
          </div>
        </div>

        <div className="flex gap-2">
          <button
            onClick={onClose}
            className="flex-1 min-h-12 rounded-lg border border-border bg-card text-sm hover:bg-surface-2"
          >
            {t("Cancel", "ሰርዝ")}
          </button>
          <button
            onClick={submit}
            className="flex-1 min-h-12 rounded-lg bg-ember text-ember-foreground text-sm font-semibold"
          >
            {t("Save", "አስቀምጥ")}
          </button>
        </div>
      </div>
    </div>
  );
}
