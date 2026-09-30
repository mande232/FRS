import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import * as Icons from "lucide-react";
import { PageHeader, Card, Chip, Stat } from "@/components/ui-kit";
import { RECIPES, type Recipe } from "@/lib/demo-data";
import { formatETB } from "@/lib/ethiopic";
import { useModuleRecords } from "@/lib/module-records";
import { useStockManagementModule } from "@/lib/stock-management";
import { selectText, useT } from "@/lib/i18n";
import { useLang } from "@/lib/lang-context";

export const Route = createFileRoute("/app/recipes")({ component: Recipes });

type Ingredient = { name: string; qty: number; unit: string; cost: number };

const CATEGORY_OPTIONS = ["Mains", "Starters", "Breakfast", "Drinks", "Desserts"] as const;

function Recipes() {
  const t = useT();
  const lang = useLang();
  const stockModule = useStockManagementModule();
  const { records: recipes, setRecords: setRecipes } = useModuleRecords<Recipe>(
    "recipes",
    RECIPES.map((r) => ({ ...r })),
  );
  const [selected, setSelected] = useState<Recipe | null>(null);
  const [showAdd, setShowAdd] = useState(false);

  const avgMargin = recipes.length
    ? recipes.reduce((sum, recipe) => sum + (recipe.salePrice > 0 ? ((recipe.salePrice - recipe.totalCost) / recipe.salePrice) * 100 : 0), 0) / recipes.length
    : 0;
  const highCost = recipes.filter((recipe) => recipe.salePrice > 0 && recipe.totalCost / recipe.salePrice > 0.4);

  return (
    <div>
      <PageHeader
        title={t("Recipes & Food Cost", "የአሰራር እና የምግብ ወጪ")}
        subtitle={t(
          `${recipes.length} recipes · avg margin ${avgMargin.toFixed(1)}%`,
          `${recipes.length} የአሰራር አዘገጃጀቶች · አማካይ ማርጅን ${avgMargin.toFixed(1)}%`,
        )}
        action={
          <button
            onClick={() => setShowAdd(true)}
            className="h-10 px-4 rounded-lg bg-ember text-ember-foreground text-sm font-medium inline-flex items-center gap-2"
          >
            <Icons.Plus className="size-4" />
            {t("Add recipe", "አዲስ አሰራር")}
          </button>
        }
      />

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        <Stat label={t("Recipes", "አሰራሮች")} value={`${recipes.length}`} icon="BookOpen" />
        <Stat label={t("Avg margin", "አማካይ ማርጅን")} value={`${avgMargin.toFixed(1)}%`} tone="teff" icon="TrendingUp" />
        <Stat label={t("High food cost", "ከፍተኛ የምግብ ወጪ")} value={`${highCost.length}`} tone="gold" icon="AlertTriangle" hint={t(">40% cost ratio", ">40% የወጪ መጠን")} />
        <Stat label={t("Target food cost", "የወጪ መደበኛ ግብ")} value="≤35%" icon="Target" />
      </div>

      <div className="grid lg:grid-cols-2 gap-4">
        {recipes.map((recipe) => {
          const margin = recipe.salePrice > 0 ? ((recipe.salePrice - recipe.totalCost) / recipe.salePrice) * 100 : 0;
          const costRatio = recipe.salePrice > 0 ? (recipe.totalCost / recipe.salePrice) * 100 : 0;
          return (
            <div
              key={recipe.id}
              className="surface-card !p-5 cursor-pointer hover:shadow-[var(--shadow-lift)] hover:-translate-y-0.5 transition-all rounded-2xl"
              onClick={() => setSelected(recipe)}
            >
              <div className="flex items-start justify-between mb-3">
                <div>
                  <h3 className="font-display text-lg font-semibold">
                    {selectText(lang, recipe.name_en, recipe.name_am)}
                  </h3>
                  <div className="text-xs text-muted-foreground">
                    {recipe.category} · {t("yield", "ውጤት")} {recipe.yieldQty} {recipe.yieldUnit}
                  </div>
                </div>
                <Chip tone={margin >= 65 ? "teff" : margin >= 50 ? "gold" : "destructive"}>
                  {margin.toFixed(0)}% {t("margin", "ማርጅን")}
                </Chip>
              </div>
              <div className="grid grid-cols-3 gap-3 text-center mb-3">
                <div className="rounded-lg bg-surface-2 p-2">
                  <div className="text-xs text-muted-foreground">{t("Ingredients", "ንጥረ ነገሮች")}</div>
                  <div className="font-semibold">{recipe.ingredients.length}</div>
                </div>
                <div className="rounded-lg bg-surface-2 p-2">
                  <div className="text-xs text-muted-foreground">{t("Cost", "ወጪ")}</div>
                  <div className="font-semibold font-mono">{formatETB(recipe.totalCost)}</div>
                </div>
                <div className="rounded-lg bg-surface-2 p-2">
                  <div className="text-xs text-muted-foreground">{t("Sale price", "የሽያጭ ዋጋ")}</div>
                  <div className="font-semibold font-mono">{formatETB(recipe.salePrice)}</div>
                </div>
              </div>
              <div className="space-y-1">
                <div className="flex justify-between text-xs text-muted-foreground">
                  <span>{t("Food cost ratio", "የምግብ ወጪ መጠን")}</span>
                  <span>{costRatio.toFixed(1)}%</span>
                </div>
                <div className="h-2 rounded-full bg-surface-2 overflow-hidden">
                  <div
                    className={`h-full rounded-full transition-all ${costRatio > 40 ? "bg-destructive" : costRatio > 30 ? "bg-gold" : "bg-teff"}`}
                    style={{ width: `${Math.min(costRatio, 100)}%` }}
                  />
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {selected && (
        <RecipeEditor
          recipe={selected}
          stockItems={stockModule.items}
          onClose={() => setSelected(null)}
          onSave={(recipe) => {
            setRecipes((prev) => prev.map((item) => (item.id === recipe.id ? recipe : item)));
            setSelected(null);
          }}
          onDelete={(id) => {
            setRecipes((prev) => prev.filter((item) => item.id !== id));
            setSelected(null);
          }}
        />
      )}
      {showAdd && (
        <RecipeEditor
          stockItems={stockModule.items}
          onClose={() => setShowAdd(false)}
          onSave={(recipe) => {
            setRecipes((prev) => [...prev, recipe]);
            setShowAdd(false);
          }}
        />
      )}
    </div>
  );
}

function RecipeEditor({
  recipe,
  stockItems,
  onClose,
  onSave,
  onDelete,
}: {
  recipe?: Recipe;
  stockItems: Array<{ id: string; name: string; baseUnit: string }>;
  onClose: () => void;
  onSave: (r: Recipe) => void;
  onDelete?: (id: string) => void;
}) {
  const t = useT();
  const blank: Recipe = {
    id: `rec${Date.now()}`,
    name_en: "",
    name_am: "",
    category: "Mains",
    yieldQty: 1,
    yieldUnit: "portion",
    ingredients: [],
    totalCost: 0,
    salePrice: 0,
  };
  const [r, setR] = useState<Recipe>(recipe ? { ...recipe, ingredients: recipe.ingredients.map((ingredient) => ({ ...ingredient })) } : blank);

  const totalCost = r.ingredients.reduce((sum, ingredient) => sum + ingredient.cost, 0);
  const margin = r.salePrice > 0 ? ((r.salePrice - totalCost) / r.salePrice) * 100 : 0;

  function addIngredient() {
    setR((prev) => ({ ...prev, ingredients: [...prev.ingredients, { name: "", qty: 0, unit: "kg", cost: 0 }] }));
  }

  function updateIng(idx: number, field: keyof Ingredient, value: string | number) {
    setR((prev) => ({
      ...prev,
      ingredients: prev.ingredients.map((ingredient, i) => (i === idx ? { ...ingredient, [field]: value } : ingredient)),
    }));
  }

  function removeIng(idx: number) {
    setR((prev) => ({ ...prev, ingredients: prev.ingredients.filter((_, i) => i !== idx) }));
  }

  function submit() {
    if (!r.name_en) return;
    onSave({ ...r, totalCost });
  }

  return (
    <div className="fixed inset-0 z-50 bg-foreground/40 backdrop-blur-sm grid place-items-center p-4">
      <div className="surface-card max-w-2xl w-full !p-6 max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between mb-5">
          <h3 className="font-display text-xl font-semibold">{recipe ? t("Edit Recipe", "አሰራር አስተካክል") : t("New Recipe", "አዲስ አሰራር")}</h3>
          <button onClick={onClose} className="size-8 grid place-items-center rounded-lg hover:bg-surface-2">
            <Icons.X className="size-4" />
          </button>
        </div>

        <div className="grid grid-cols-2 gap-3 mb-5">
          <div>
            <label className="text-xs text-muted-foreground">{t("Name (English)", "ስም (እንግሊዝኛ)")}</label>
            <input
              value={r.name_en}
              onChange={(e) => setR({ ...r, name_en: e.target.value })}
              className="w-full mt-1 h-9 px-3 rounded-lg border border-border bg-card text-sm focus:outline-none focus:ring-2 focus:ring-ring/40"
            />
          </div>
          <div>
            <label className="text-xs text-muted-foreground">{t("Name (አማርኛ)", "ስም (አማርኛ)")}</label>
            <input
              value={r.name_am}
              onChange={(e) => setR({ ...r, name_am: e.target.value })}
              className="w-full mt-1 h-9 px-3 rounded-lg border border-border bg-card text-sm focus:outline-none focus:ring-2 focus:ring-ring/40"
            />
          </div>
          <div>
            <label className="text-xs text-muted-foreground">{t("Category", "ምድብ")}</label>
            <select
              value={r.category}
              onChange={(e) => setR({ ...r, category: e.target.value })}
              className="w-full mt-1 h-9 px-3 rounded-lg border border-border bg-card text-sm focus:outline-none"
            >
              {CATEGORY_OPTIONS.map((category) => (
                <option key={category} value={category}>
                  {category}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="text-xs text-muted-foreground">{t("Sale price (ETB)", "የሽያጭ ዋጋ (ብር)")}</label>
            <input
              type="number"
              min={0}
              value={r.salePrice}
              onChange={(e) => setR({ ...r, salePrice: Number(e.target.value) })}
              className="w-full mt-1 h-9 px-3 rounded-lg border border-border bg-card text-sm font-mono focus:outline-none focus:ring-2 focus:ring-ring/40"
            />
          </div>
        </div>

        <div className="mb-3 flex items-center justify-between">
          <div className="text-xs text-muted-foreground uppercase tracking-wider">{t("Bill of Materials", "የንጥረ-ነገሮች ዝርዝር")}</div>
          <button
            onClick={addIngredient}
            className="h-7 px-3 rounded-lg bg-ember/10 text-ember text-xs font-medium hover:bg-ember/20 transition-colors inline-flex items-center gap-1"
          >
            <Icons.Plus className="size-3" />
            {t("Add ingredient", "ንጥረ ነገር ጨምር")}
          </button>
        </div>

        <div className="space-y-2 mb-4">
          {r.ingredients.map((ingredient, idx) => (
            <div key={idx} className="grid grid-cols-[1fr_80px_60px_80px_32px] gap-2 items-center">
              <select
                value={ingredient.name}
                onChange={(e) => updateIng(idx, "name", e.target.value)}
                className="h-8 px-2 rounded-lg border border-border bg-card text-xs focus:outline-none"
              >
                <option value="">{t("Select…", "ይምረጡ…")}</option>
                {stockItems.map((s) => (
                  <option key={s.id} value={s.name}>
                    {s.name}
                  </option>
                ))}
              </select>
              <input
                type="number"
                min={0}
                step={0.01}
                value={ingredient.qty}
                onChange={(e) => updateIng(idx, "qty", Number(e.target.value))}
                placeholder={t("Qty", "መጠን")}
                className="h-8 px-2 rounded-lg border border-border bg-card text-xs font-mono focus:outline-none text-center"
              />
              <input
                value={ingredient.unit}
                onChange={(e) => updateIng(idx, "unit", e.target.value)}
                placeholder={t("Unit", "ክፍል")}
                className="h-8 px-2 rounded-lg border border-border bg-card text-xs focus:outline-none text-center"
              />
              <input
                type="number"
                min={0}
                value={ingredient.cost}
                onChange={(e) => updateIng(idx, "cost", Number(e.target.value))}
                placeholder={t("Cost", "ወጪ")}
                className="h-8 px-2 rounded-lg border border-border bg-card text-xs font-mono focus:outline-none text-center"
              />
              <button
                onClick={() => removeIng(idx)}
                className="size-8 grid place-items-center rounded-lg hover:bg-destructive/10 hover:text-destructive transition-colors"
              >
                <Icons.X className="size-3.5" />
              </button>
            </div>
          ))}
          {r.ingredients.length === 0 && (
            <div className="text-xs text-muted-foreground text-center py-4 border border-dashed border-border rounded-lg">
              {t('No ingredients yet — click "Add ingredient"', 'አሁን ንጥረ ነገር የለም — "ንጥረ ነገር ጨምር" ይጫኑ')}
            </div>
          )}
        </div>

        <div className="grid grid-cols-3 gap-3 mb-5 p-3 rounded-xl bg-surface-2 text-sm text-center">
          <div>
            <div className="text-xs text-muted-foreground">{t("Total cost", "ጠቅላላ ወጪ")}</div>
            <div className="font-semibold font-mono">{formatETB(totalCost)}</div>
          </div>
          <div>
            <div className="text-xs text-muted-foreground">{t("Sale price", "የሽያጭ ዋጋ")}</div>
            <div className="font-semibold font-mono">{formatETB(r.salePrice)}</div>
          </div>
          <div>
            <div className="text-xs text-muted-foreground">{t("Margin", "ማርጅን")}</div>
            <div className={`font-semibold ${margin >= 60 ? "text-teff" : margin >= 40 ? "text-gold-foreground" : "text-destructive"}`}>{margin.toFixed(1)}%</div>
          </div>
        </div>

        <div className="flex gap-2">
          {recipe && onDelete && (
            <button
              onClick={() => onDelete(recipe.id)}
              className="h-10 px-4 rounded-lg border border-destructive/30 text-destructive text-sm hover:bg-destructive/5 transition-colors"
            >
              {t("Delete", "ሰርዝ")}
            </button>
          )}
          <button
            onClick={onClose}
            className="flex-1 h-10 rounded-lg border border-border bg-card text-sm hover:bg-surface-2"
          >
            {t("Cancel", "ሰርዝ")}
          </button>
          <button
            onClick={submit}
            className="flex-1 h-10 rounded-lg bg-ember text-ember-foreground text-sm font-semibold"
          >
            {t("Save recipe", "አሰራር አስቀምጥ")}
          </button>
        </div>
      </div>
    </div>
  );
}
