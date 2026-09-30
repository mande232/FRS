import * as Icons from "lucide-react";
import { Chip } from "@/components/ui-kit";
import { formatETB } from "@/lib/ethiopic";
import { menuItemName, useT } from "@/lib/i18n";
import { useLang } from "@/lib/lang-context";
import type { MenuItemInsight } from "@/lib/menu-analytics";
import { isButcherStation } from "@/lib/menu-analytics";
import { stationTone } from "@/lib/stations";
import { StationIcon } from "@/components/menu/menu-shared";

type ChipTone = "default" | "ember" | "teff" | "gold" | "muted" | "destructive";

export type MenuItemDrawerProps = {
  insight: MenuItemInsight | null;
  onClose: () => void;
  onEdit?: () => void;
  readOnly?: boolean;
};

function availabilityTone(status: MenuItemInsight["availability"]): ChipTone {
  if (status === "Available") return "teff";
  if (status === "Low Stock") return "gold";
  if (status === "Out of Stock") return "destructive";
  return "muted";
}

export function MenuItemDrawer({ insight, onClose, onEdit, readOnly }: MenuItemDrawerProps) {
  const t = useT();
  const lang = useLang();
  if (!insight) return null;

  const { item, itemType, grossProfit, marginPct, availability, priceIssues, routingIssues, recipe, recipeStatus, stockQty } = insight;
  const deductionLocation = item.stockDeductionLocation || item.station;

  return (
    <>
      <div className="fixed inset-0 z-40 bg-foreground/30" onClick={onClose} aria-hidden="true" />
      <aside className="fixed inset-y-0 right-0 z-50 w-full max-w-lg bg-card border-l border-border shadow-xl flex flex-col">
        <header className="flex items-start justify-between gap-3 p-4 border-b border-border shrink-0">
          <div className="flex items-start gap-3 min-w-0">
            <div className="size-12 rounded-lg bg-surface-2 grid place-items-center text-lg font-semibold shrink-0">
              {item.emoji || item.name_en.slice(0, 2).toUpperCase()}
            </div>
            <div className="min-w-0">
              <h2 className="font-display text-lg font-semibold truncate">{menuItemName(item, lang)}</h2>
              <p className="text-sm text-muted-foreground truncate">{item.emoji || item.id}</p>
              <div className="flex flex-wrap gap-1.5 mt-2">
                <Chip tone={stationTone(item.station) as ChipTone}>
                  <StationIcon station={item.station as never} className="size-3" />
                  {item.station}
                </Chip>
                <Chip tone={availabilityTone(availability)}>{availability}</Chip>
                <Chip tone="muted">{itemType}</Chip>
              </div>
            </div>
          </div>
          <button type="button" onClick={onClose} className="size-8 grid place-items-center rounded-lg hover:bg-surface-2 shrink-0">
            <Icons.X className="size-4" />
          </button>
        </header>

        <div className="flex-1 overflow-y-auto p-4 space-y-5">
          <section>
            <h3 className="text-xs uppercase tracking-wider text-muted-foreground mb-2">{t("General", "አጠቃላይ")}</h3>
            <dl className="grid grid-cols-2 gap-x-3 gap-y-2 text-sm">
              <div><dt className="text-muted-foreground text-xs">{t("Category", "ምድብ")}</dt><dd>{item.category}</dd></div>
              <div><dt className="text-muted-foreground text-xs">{t("Diet", "አመጋገብ")}</dt><dd>{item.veg ? t("Vegetarian", "አትክልታማ") : t("Standard", "መደበኛ")}</dd></div>
              <div className="col-span-2"><dt className="text-muted-foreground text-xs">{t("English name", "እንግሊዝኛ ስም")}</dt><dd>{item.name_en}</dd></div>
              {item.name_am && (
                <div className="col-span-2"><dt className="text-muted-foreground text-xs">{t("Amharic name", "አማርኛ ስም")}</dt><dd>{item.name_am}</dd></div>
              )}
            </dl>
          </section>

          <section>
            <h3 className="text-xs uppercase tracking-wider text-muted-foreground mb-2">{t("Pricing", "ዋጋ")}</h3>
            <dl className="grid grid-cols-2 gap-x-3 gap-y-2 text-sm">
              <div>
                <dt className="text-muted-foreground text-xs">{t("Selling price", "የሽያጭ ዋጋ")}</dt>
                <dd className="font-mono font-semibold">
                  {formatETB(item.price)}
                  {(item.pricingMode === "kg" || isButcherStation(item.station)) && (
                    <span className="text-xs font-sans text-muted-foreground ml-1">{t("per kg", "በኪ.ግ")}</span>
                  )}
                </dd>
              </div>
              <div><dt className="text-muted-foreground text-xs">{t("Cost", "ወጪ")}</dt><dd className="font-mono">{formatETB(item.cost)}</dd></div>
              <div><dt className="text-muted-foreground text-xs">{t("Gross profit", "የድምጽ ትርፍ")}</dt><dd className="font-mono">{formatETB(grossProfit)}</dd></div>
              <div><dt className="text-muted-foreground text-xs">{t("Margin", "ትርፍ")}</dt><dd className="font-mono">{marginPct.toFixed(1)}%</dd></div>
              {item.vipPrice != null && (
                <div><dt className="text-muted-foreground text-xs">{t("VIP price", "VIP ዋጋ")}</dt><dd className="font-mono">{formatETB(item.vipPrice)}</dd></div>
              )}
            </dl>
            {priceIssues.length > 0 && (
              <div className="mt-2 rounded-lg border border-gold/40 bg-gold/10 p-2 text-xs">
                {t("Price review:", "የዋጋ ምርመራ፦")} {priceIssues.join(", ")}
              </div>
            )}
          </section>

          <section>
            <h3 className="text-xs uppercase tracking-wider text-muted-foreground mb-2">{t("Production routing", "የምርት ማስተላለፊያ")}</h3>
            <dl className="grid grid-cols-2 gap-x-3 gap-y-2 text-sm">
              <div><dt className="text-muted-foreground text-xs">{t("Primary station", "ዋና ጣቢያ")}</dt><dd>{item.station}</dd></div>
              <div><dt className="text-muted-foreground text-xs">{t("Deduction location", "የቅነሳ ቦታ")}</dt><dd>{deductionLocation}</dd></div>
              <div><dt className="text-muted-foreground text-xs">{t("Deduction rule", "የቅነሳ ደንብ")}</dt><dd>{item.stockDeductionRule ?? (item.stockSku ? "direct" : "recipe")}</dd></div>
            </dl>
            {routingIssues.length > 0 && (
              <div className="mt-2 rounded-lg border border-destructive/30 bg-destructive/10 p-2 text-xs text-destructive">
                {routingIssues.join(", ")}
              </div>
            )}
          </section>

          <section>
            <h3 className="text-xs uppercase tracking-wider text-muted-foreground mb-2">{t("Inventory", "ክምችት")}</h3>
            <dl className="grid grid-cols-2 gap-x-3 gap-y-2 text-sm">
              <div><dt className="text-muted-foreground text-xs">{t("Stock SKU", "SKU")}</dt><dd>{item.stockSku ?? "—"}</dd></div>
              <div><dt className="text-muted-foreground text-xs">{t("Selling unit", "የሽያጭ መለኪያ")}</dt><dd>{item.sellingUnit ?? item.unitLabel ?? "—"}</dd></div>
              <div><dt className="text-muted-foreground text-xs">{t("Available qty", "የሚገኝ ብዛት")}</dt><dd className="font-mono">{stockQty != null ? stockQty : "—"}</dd></div>
              <div><dt className="text-muted-foreground text-xs">{t("Min stock", "ዝቅተኛ ክምችት")}</dt><dd className="font-mono">{item.minimumStock ?? "—"}</dd></div>
            </dl>
          </section>

          {recipe && (
            <section>
              <h3 className="text-xs uppercase tracking-wider text-muted-foreground mb-2">
                {t("Recipe", "የምግብ አዘገጃጀት")} ({recipeStatus})
              </h3>
              <ul className="space-y-1.5 text-sm">
                {recipe.ingredients.map((ingredient, index) => (
                  <li key={`${ingredient.itemId}-${index}`} className="flex justify-between gap-2 rounded-lg border border-border px-2 py-1.5">
                    <span className="truncate">{ingredient.itemName}</span>
                    <span className="font-mono text-muted-foreground shrink-0">
                      {ingredient.quantity} {ingredient.unit}
                      {ingredient.stockDeductionLocation ? ` · ${ingredient.stockDeductionLocation}` : ""}
                    </span>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </div>

        {!readOnly && onEdit && (
          <footer className="p-4 border-t border-border shrink-0 flex gap-2">
            <button
              type="button"
              onClick={onEdit}
              className="flex-1 h-11 rounded-lg bg-ember text-ember-foreground text-sm font-semibold inline-flex items-center justify-center gap-2"
            >
              <Icons.Pencil className="size-4" />
              {t("Edit item", "እቃ አስተካክል")}
            </button>
          </footer>
        )}
      </aside>
    </>
  );
}
