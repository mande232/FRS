import { useEffect, useMemo, useState, type ReactNode } from "react";
import * as Icons from "lucide-react";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Card, Chip, Stat } from "@/components/ui-kit";
import {
  formatDashboardMoney,
  MoneyVisibilityToggle,
  useHideMoney,
} from "@/lib/dashboard-privacy";
import { showError, showSuccess } from "@/lib/toast";
import type { MenuItem, SalesRecord } from "@/lib/demo-data";
import {
  buildGoatRegistrationReport,
  canModifyGoatRegistration,
  cancelGoatRegistration,
  getGoatRegistrationUsage,
  listGoatTypes,
  normalizeGoatRegistrations,
  persistGoatRegistrationChange,
  refreshGoatRegistrationStatuses,
  registerGoatDirectPurchase,
  updateGoatRegistration,
  type GoatRegistration,
  type GoatRegistrationPersistActions,
  type GoatRegistrationReportRow,
} from "@/lib/goat-butcher";
import { useT } from "@/lib/i18n";
import {
  resolveKiklBoneKgPerPlate,
  type StockLedgerEntry,
  type StockLot,
  type StockManagedItem,
  type StockRecipe,
} from "@/lib/stock-management";

type GoatRegistrationPanelProps = {
  items: StockManagedItem[];
  ledger: StockLedgerEntry[];
  lots: StockLot[];
  allLots: StockLot[];
  registrations: GoatRegistration[];
  salesRecords: SalesRecord[];
  menuItems?: MenuItem[];
  recipes: StockRecipe[];
  userName: string;
  actions: GoatRegistrationPersistActions;
  onKiklYieldChange: (boneKgPerPlate: number) => void;
};

type StatusFilter = "all" | "active" | "depleted";

type FormState = {
  goatType: string;
  supplierName: string;
  purchasePrice: string;
  frontLegKg: string;
  backLegKg: string;
  insidePartsKg: string;
  boneKg: string;
  wasteKg: string;
  notes: string;
};

type GoatTableRow = {
  registration: GoatRegistration;
  usage: ReturnType<typeof getGoatRegistrationUsage>;
  remainingKg: number;
  editable: boolean;
  metrics?: GoatRegistrationReportRow;
};

const GOAT_TABLE_PAGE_SIZE = 10;

const EMPTY_FORM = (goatType: string): FormState => ({
  goatType,
  supplierName: "",
  purchasePrice: "",
  frontLegKg: "",
  backLegKg: "",
  insidePartsKg: "",
  boneKg: "",
  wasteKg: "",
  notes: "",
});

function qty(value: number) {
  return Math.round((Number.isFinite(value) ? value : 0) * 1000) / 1000;
}

function formFromRegistration(registration: GoatRegistration): FormState {
  return {
    goatType: registration.goatType,
    supplierName: registration.supplierName ?? "",
    purchasePrice: String(registration.purchasePrice),
    frontLegKg: String(registration.frontLegKg),
    backLegKg: String(registration.backLegKg),
    insidePartsKg: String(registration.insidePartsKg),
    boneKg: String(registration.boneKg),
    wasteKg: String(registration.wasteKg),
    notes: registration.notes ?? "",
  };
}

function formToInput(form: FormState, userName: string) {
  return {
    goatType: form.goatType,
    supplierName: form.supplierName,
    purchasePrice: Number(form.purchasePrice),
    frontLegKg: Number(form.frontLegKg || 0),
    backLegKg: Number(form.backLegKg || 0),
    insidePartsKg: Number(form.insidePartsKg || 0),
    boneKg: Number(form.boneKg || 0),
    wasteKg: Number(form.wasteKg || 0),
    registeredBy: userName,
    notes: form.notes,
  };
}

function statusTone(status: GoatRegistration["status"]): "teff" | "gold" | "muted" | "destructive" {
  if (status === "active") return "teff";
  if (status === "depleted") return "gold";
  if (status === "cancelled") return "destructive";
  return "muted";
}

function DetailField({
  label,
  value,
}: {
  label: string;
  value: ReactNode;
}) {
  return (
    <div className="rounded-lg border border-border bg-surface-2/40 p-3">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="mt-1 text-sm font-medium">{value}</div>
    </div>
  );
}

function GoatTablePagination({
  page,
  totalPages,
  totalItems,
  pageSize,
  onPageChange,
  t,
}: {
  page: number;
  totalPages: number;
  totalItems: number;
  pageSize: number;
  onPageChange: (page: number) => void;
  t: (en: string, am: string) => string;
}) {
  const start = totalItems === 0 ? 0 : (page - 1) * pageSize + 1;
  const end = Math.min(page * pageSize, totalItems);

  return (
    <div className="flex items-center justify-between gap-3 border-t border-border px-4 py-3 text-sm">
      <div className="text-muted-foreground">
        {t(`Showing ${start}-${end} of ${totalItems}`, `${start}-${end} ከ ${totalItems}`)}
      </div>
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => onPageChange(Math.max(1, page - 1))}
          disabled={page <= 1}
          className="h-8 px-3 rounded-lg border border-border bg-card disabled:opacity-50"
        >
          {t("Prev", "ቀዳሚ")}
        </button>
        <div className="text-muted-foreground min-w-[88px] text-center">
          {t(`Page ${page} / ${totalPages}`, `ገጽ ${page} / ${totalPages}`)}
        </div>
        <button
          type="button"
          onClick={() => onPageChange(Math.min(totalPages, page + 1))}
          disabled={page >= totalPages}
          className="h-8 px-3 rounded-lg border border-border bg-card disabled:opacity-50"
        >
          {t("Next", "ቀጣይ")}
        </button>
      </div>
    </div>
  );
}

function RegistrationFormFields({
  value,
  onChange,
  goatTypes,
  t,
}: {
  value: FormState;
  onChange: (next: FormState) => void;
  goatTypes: string[];
  t: (en: string, am: string) => string;
}) {
  return (
    <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
      <label className="text-sm space-y-1">
        <span className="text-muted-foreground">{t("Goat type", "የፍየል አይነት")}</span>
        <select
          className="w-full h-10 rounded-lg border bg-background px-3"
          value={value.goatType}
          onChange={(event) => onChange({ ...value, goatType: event.target.value })}
        >
          {goatTypes.map((type) => (
            <option key={type} value={type}>
              {type}
            </option>
          ))}
        </select>
      </label>
      <label className="text-sm space-y-1">
        <span className="text-muted-foreground">{t("Supplier (optional)", "አቅራቢ (አማራጭ)")}</span>
        <input
          className="w-full h-10 rounded-lg border bg-background px-3"
          value={value.supplierName}
          onChange={(event) => onChange({ ...value, supplierName: event.target.value })}
        />
      </label>
      <label className="text-sm space-y-1">
        <span className="text-muted-foreground">{t("Purchase price (ETB)", "የግዢ ዋጋ (ብር)")}</span>
        <input
          type="number"
          min="0"
          step="0.01"
          required
          className="w-full h-10 rounded-lg border bg-background px-3"
          value={value.purchasePrice}
          onChange={(event) => onChange({ ...value, purchasePrice: event.target.value })}
        />
      </label>
      <label className="text-sm space-y-1">
        <span className="text-muted-foreground">{t("Front leg (kg)", "የፊት እግር (kg)")}</span>
        <input
          type="number"
          min="0"
          step="0.001"
          className="w-full h-10 rounded-lg border bg-background px-3"
          value={value.frontLegKg}
          onChange={(event) => onChange({ ...value, frontLegKg: event.target.value })}
        />
      </label>
      <label className="text-sm space-y-1">
        <span className="text-muted-foreground">{t("Back leg (kg)", "የኋላ እግር (kg)")}</span>
        <input
          type="number"
          min="0"
          step="0.001"
          className="w-full h-10 rounded-lg border bg-background px-3"
          value={value.backLegKg}
          onChange={(event) => onChange({ ...value, backLegKg: event.target.value })}
        />
      </label>
      <label className="text-sm space-y-1">
        <span className="text-muted-foreground">{t("Inside parts (kg)", "የውስጥ ክፍሎች (kg)")}</span>
        <input
          type="number"
          min="0"
          step="0.001"
          className="w-full h-10 rounded-lg border bg-background px-3"
          value={value.insidePartsKg}
          onChange={(event) => onChange({ ...value, insidePartsKg: event.target.value })}
        />
      </label>
      <label className="text-sm space-y-1">
        <span className="text-muted-foreground">{t("Bones (kg)", "ለክል አጥንት (kg)")}</span>
        <input
          type="number"
          min="0"
          step="0.001"
          className="w-full h-10 rounded-lg border bg-background px-3"
          value={value.boneKg}
          onChange={(event) => onChange({ ...value, boneKg: event.target.value })}
        />
      </label>
      <label className="text-sm space-y-1">
        <span className="text-muted-foreground">{t("Waste / trim (kg)", "ከባድ / ቁራጭ (kg)")}</span>
        <input
          type="number"
          min="0"
          step="0.001"
          className="w-full h-10 rounded-lg border bg-background px-3"
          value={value.wasteKg}
          onChange={(event) => onChange({ ...value, wasteKg: event.target.value })}
        />
      </label>
      <label className="text-sm space-y-1 md:col-span-2 lg:col-span-3">
        <span className="text-muted-foreground">{t("Notes", "ማስታወሻ")}</span>
        <input
          className="w-full h-10 rounded-lg border bg-background px-3"
          value={value.notes}
          onChange={(event) => onChange({ ...value, notes: event.target.value })}
        />
      </label>
    </div>
  );
}

export function GoatRegistrationPanel({
  items,
  ledger,
  lots,
  allLots,
  registrations,
  salesRecords,
  menuItems = [],
  recipes,
  userName,
  actions,
  onKiklYieldChange,
}: GoatRegistrationPanelProps) {
  const t = useT();
  const { hidden: hideMoney, toggle: toggleHideMoney } = useHideMoney();
  const money = (value: number) => formatDashboardMoney(value, hideMoney);
  const goatTypes = useMemo(() => listGoatTypes(), []);
  const kiklBoneKgPerPlate = useMemo(() => resolveKiklBoneKgPerPlate(recipes), [recipes]);
  const [kiklYieldDraft, setKiklYieldDraft] = useState(String(kiklBoneKgPerPlate));
  const [form, setForm] = useState<FormState>(() => EMPTY_FORM(goatTypes[0] ?? "Local"));
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [showNewForm, setShowNewForm] = useState(true);
  const [editing, setEditing] = useState<GoatRegistration | null>(null);
  const [editForm, setEditForm] = useState<FormState | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<GoatRegistration | null>(null);
  const [detailRow, setDetailRow] = useState<GoatTableRow | null>(null);
  const [page, setPage] = useState(1);

  useEffect(() => {
    setKiklYieldDraft(String(kiklBoneKgPerPlate));
  }, [kiklBoneKgPerPlate]);

  useEffect(() => {
    setPage(1);
  }, [search, statusFilter]);

  const normalizedRegistrations = useMemo(
    () => normalizeGoatRegistrations(registrations),
    [registrations],
  );

  const refreshedRegistrations = useMemo(
    () => refreshGoatRegistrationStatuses(normalizedRegistrations, lots),
    [normalizedRegistrations, lots],
  );

  const report = useMemo(
    () =>
      buildGoatRegistrationReport({
        registrations: refreshedRegistrations,
        lots,
        ledger,
        salesRecords,
        items,
        menuItems,
      }),
    [refreshedRegistrations, lots, ledger, salesRecords, items, menuItems],
  );

  const reportById = useMemo(
    () => new Map(report.rows.map((row) => [row.registration.id, row])),
    [report.rows],
  );

  const tableRows = useMemo(() => {
    const query = search.trim().toLowerCase();
    return [...refreshedRegistrations]
      .filter((registration) => registration.status !== "cancelled")
      .sort((a, b) => b.registeredAt.localeCompare(a.registeredAt))
      .filter((registration) => statusFilter === "all" || registration.status === statusFilter)
      .filter((registration) => {
        if (!query) return true;
        return [
          registration.documentNo,
          registration.referenceNo,
          registration.goatType,
          registration.supplierName,
          registration.registeredBy,
          registration.notes,
        ]
          .filter(Boolean)
          .some((value) => String(value).toLowerCase().includes(query));
      })
      .map((registration) => {
        const metrics = reportById.get(registration.id);
        const usage = getGoatRegistrationUsage(ledger, registration.referenceNo);
        const remainingKg = metrics
          ? qty(metrics.remainingLimbKg + metrics.remainingInsideKg + metrics.remainingBoneKg)
          : qty(registration.limbKg + registration.insidePartsKg + registration.boneKg);
        return {
          registration,
          usage,
          remainingKg,
          editable: registration.status !== "cancelled" && canModifyGoatRegistration(ledger, registration.referenceNo),
          metrics,
        } satisfies GoatTableRow;
      });
  }, [refreshedRegistrations, statusFilter, search, reportById, ledger]);

  const totalPages = Math.max(1, Math.ceil(tableRows.length / GOAT_TABLE_PAGE_SIZE));
  const paginatedRows = useMemo(() => {
    const start = (page - 1) * GOAT_TABLE_PAGE_SIZE;
    return tableRows.slice(start, start + GOAT_TABLE_PAGE_SIZE);
  }, [tableRows, page]);

  useEffect(() => {
    if (page > totalPages) setPage(totalPages);
  }, [page, totalPages]);

  function persistChange(input: Parameters<typeof persistGoatRegistrationChange>[1]) {
    persistGoatRegistrationChange(actions, input);
  }

  function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    try {
      const result = registerGoatDirectPurchase(
        formToInput(form, userName),
        items,
        registrations,
        ledger,
        allLots,
      );
      const nextRegistrations = refreshGoatRegistrationStatuses(
        [result.registration, ...registrations.filter((row) => row.id !== result.registration.id)],
        result.lots,
      );
      persistChange({
        ledgerEntries: result.ledgerEntries,
        items: result.items,
        lots: result.lots,
        registrations: nextRegistrations,
        addedGoatItems: result.addedGoatItems,
      });
      setForm(EMPTY_FORM(goatTypes[0] ?? "Local"));
      showSuccess(t("Goat registered at Butcher House.", "ፍየል በቁራኛ ቤት ተመዝግቧል።"));
    } catch (submitError) {
      showError(submitError instanceof Error ? submitError.message : "Registration failed.");
    }
  }

  function openEdit(registration: GoatRegistration) {
    setEditing(registration);
    setEditForm(formFromRegistration(registration));
  }

  function handleEditSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (!editing || !editForm) return;
    try {
      const result = updateGoatRegistration(
        editing,
        formToInput(editForm, userName),
        items,
        registrations,
        ledger,
        allLots,
      );
      persistChange({
        ledgerEntries: result.ledgerEntries,
        items: result.items,
        lots: result.lots,
        registrations: result.registrations,
        addedGoatItems: result.addedGoatItems,
      });
      setEditing(null);
      setEditForm(null);
      showSuccess(t("Goat registration updated.", "የፍየል ምዝገባ ተዘምኗል።"));
    } catch (submitError) {
      showError(submitError instanceof Error ? submitError.message : "Update failed.");
    }
  }

  function confirmDelete() {
    if (!deleteTarget) return;
    try {
      const result = cancelGoatRegistration(
        deleteTarget,
        items,
        registrations,
        ledger,
        allLots,
        userName,
      );
      persistChange({
        ledgerEntries: result.ledgerEntries,
        items: result.items,
        lots: result.lots,
        registrations: result.registrations,
        addedGoatItems: result.addedGoatItems,
      });
      setDeleteTarget(null);
      showSuccess(t("Goat registration removed.", "የፍየል ምዝገባ ተሰርዟል።"));
    } catch (submitError) {
      showError(submitError instanceof Error ? submitError.message : "Delete failed.");
    }
  }

  function handleSaveKiklYield() {
    const nextKg = Number(kiklYieldDraft);
    if (!Number.isFinite(nextKg) || nextKg <= 0) {
      showError(t("Enter a bone yield greater than zero.", "ከዜሮ በላይ የአጥንት መጠን ያስገቡ።"));
      return;
    }
    try {
      onKiklYieldChange(nextKg);
      showSuccess(t("Kikl recipe yield saved.", "የክል አዘገጅ መጠን ተቀምጧል።"));
    } catch (saveError) {
      showError(saveError instanceof Error ? saveError.message : "Could not save Kikl yield.");
    }
  }

  return (
    <div className="space-y-5">
      <Card>
        <div className="flex flex-wrap items-start justify-between gap-3 mb-4">
          <div>
            <h3 className="font-display text-lg font-semibold">{t("Goat processing", "የፍየል ማቀናበር")}</h3>
          </div>
          <MoneyVisibilityToggle hidden={hideMoney} onToggle={toggleHideMoney} t={t} />
        </div>

        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5 mb-5">
          <Stat label={t("Registered goats", "የተመዘገቡ ፍየሎች")} value={String(report.totalRegisteredGoats)} icon="Beef" />
          <Stat label={t("Limb left", "የቀረ እግር")} value={`${qty(report.totalRemainingLimbKg)} kg`} icon="Scale" />
          <Stat label={t("Inside left", "የቀረ ውስጥ")} value={`${qty(report.totalRemainingInsideKg)} kg`} icon="Package" />
          <Stat label={t("Bone left", "የቀረ አጥንት")} value={`${qty(report.totalRemainingBoneKg)} kg`} icon="Bone" />
          <Stat label={t("Goat sales", "የፍየል ሽያጭ")} value={money(report.totalSalesBirr)} icon="Banknote" />
        </div>

        {report.poolSummaries.length > 0 ? (
          <div className="mb-5">
            <h4 className="text-sm font-semibold mb-3">{t("Pool summary", "የጭማቂ ማጠቃለያ")}</h4>
            <div className="grid gap-3 sm:grid-cols-3">
              {report.poolSummaries.map((pool) => (
                <div key={pool.poolSku} className="rounded-lg border border-border bg-surface-2/40 p-4">
                  <div className="text-sm font-medium">{pool.poolName}</div>
                  <div className="mt-2 grid grid-cols-2 gap-2 text-xs">
                    <div>
                      <span className="text-muted-foreground">{t("Left", "ቀርቷል")}</span>
                      <div className="font-mono text-sm">{qty(pool.remainingKg)} kg</div>
                    </div>
                    <div>
                      <span className="text-muted-foreground">{t("Sold", "ተሸጠ")}</span>
                      <div className="font-mono text-sm">{qty(pool.soldKg)} kg</div>
                    </div>
                    <div className="col-span-2">
                      <span className="text-muted-foreground">{t("Sales", "ሽያጭ")}</span>
                      <div className="font-mono text-sm">{money(pool.salesBirr)}</div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        ) : null}

        <div className="rounded-lg border border-border bg-surface-2/40 p-4">
          <div className="flex flex-wrap items-end gap-3">
            <label className="text-sm space-y-1 min-w-[10rem]">
              <span className="text-muted-foreground">{t("Kikl bone use (kg/plate)", "ለክል አጥንት (kg/ሳህን)")}</span>
              <input
                type="number"
                min="0.001"
                step="0.001"
                className="w-full h-10 rounded-lg border bg-background px-3"
                value={kiklYieldDraft}
                onChange={(event) => setKiklYieldDraft(event.target.value)}
              />
            </label>
            <button
              type="button"
              onClick={handleSaveKiklYield}
              disabled={qty(Number(kiklYieldDraft)) === kiklBoneKgPerPlate}
              className="h-10 px-4 rounded-lg border border-border bg-card text-sm font-medium inline-flex items-center gap-2 disabled:opacity-50"
            >
              <Icons.Save className="size-4" />
              {t("Save recipe yield", "የእቃ አዘገጅ መጠን አስቀምጥ")}
            </button>
          </div>
        </div>
      </Card>

      <Card>
        <button
          type="button"
          onClick={() => setShowNewForm((open) => !open)}
          className="w-full flex items-center justify-between gap-3 text-left"
        >
          <div>
            <h3 className="font-display text-lg font-semibold">{t("Register new goat", "አዲስ ፍየል ይመዝግቡ")}</h3>
          </div>
          <Icons.ChevronDown className={`size-5 shrink-0 transition-transform ${showNewForm ? "rotate-180" : ""}`} />
        </button>
        {showNewForm ? (
          <form onSubmit={handleSubmit} className="mt-4 space-y-4 border-t border-border pt-4">
            <RegistrationFormFields value={form} onChange={setForm} goatTypes={goatTypes} t={t} />
            <div className="flex justify-end">
              <button
                type="submit"
                className="h-10 px-4 rounded-lg bg-ember text-ember-foreground text-sm font-medium inline-flex items-center gap-2"
              >
                <Icons.Plus className="size-4" />
                {t("Register goat", "ፍየል ይመዝግቡ")}
              </button>
            </div>
          </form>
        ) : null}
      </Card>

      <Card className="!p-0 overflow-hidden">
        <div className="border-b border-border bg-surface-2/40 p-4 space-y-3">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h3 className="font-display text-lg font-semibold">{t("Registered goats", "የተመዘገቡ ፍየሎች")}</h3>
            </div>
            <Chip tone="muted">
              {tableRows.length}
            </Chip>
          </div>
          <div className="grid gap-3 md:grid-cols-[1fr_12rem]">
            <label className="text-sm space-y-1">
              <span className="text-muted-foreground">{t("Search", "ፈልግ")}</span>
              <div className="relative">
                <Icons.Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
                <input
                  className="w-full h-10 rounded-lg border bg-background pl-9 pr-3"
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  placeholder={t("Document, supplier, type, notes…", "ሰነድ፣ አቅራቢ፣ አይነት፣ ማስታወሻ…")}
                />
              </div>
            </label>
            <label className="text-sm space-y-1">
              <span className="text-muted-foreground">{t("Status", "ሁኔታ")}</span>
              <select
                className="w-full h-10 rounded-lg border bg-background px-3"
                value={statusFilter}
                onChange={(event) => setStatusFilter(event.target.value as StatusFilter)}
              >
                <option value="all">{t("All statuses", "ሁሉም ሁኔታዎች")}</option>
                <option value="active">{t("Active", "ንቁ")}</option>
                <option value="depleted">{t("Depleted", "ተጠናቀቀ")}</option>
              </select>
            </label>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-surface-2 text-xs uppercase tracking-wider text-muted-foreground">
              <tr>
                <th className="text-left px-3 py-2">{t("Document", "ሰነድ")}</th>
                <th className="text-left px-3 py-2">{t("Goat", "ፍየል")}</th>
                <th className="text-right px-3 py-2">{t("Price", "ዋጋ")}</th>
                <th className="text-left px-3 py-2">{t("Unit", "አሃድ")}</th>
                <th className="text-right px-3 py-2">{t("Limb", "እግር")}</th>
                <th className="text-right px-3 py-2">{t("Inside", "ውስጥ")}</th>
                <th className="text-right px-3 py-2">{t("Bone", "አጥንት")}</th>
                <th className="text-right px-3 py-2">{t("Waste", "ቁራጭ")}</th>
                <th className="text-right px-3 py-2">{t("Sold", "ተሸጠ")}</th>
                <th className="text-right px-3 py-2">{t("Sales", "ሽያጭ")}</th>
                <th className="text-right px-3 py-2">{t("Stock", "ክምችት")}</th>
                <th className="text-left px-3 py-2">{t("Status", "ሁኔታ")}</th>
                <th className="text-right px-3 py-2">{t("Actions", "እርምጃ")}</th>
              </tr>
            </thead>
            <tbody>
              {paginatedRows.map((row) => {
                const { registration, usage, remainingKg, editable } = row;
                return (
                <tr
                  key={registration.id}
                  className="border-t border-border hover:bg-surface-2/60 cursor-pointer"
                  onClick={() => setDetailRow(row)}
                >
                  <td className="px-3 py-2">
                    <div className="font-medium">{registration.documentNo}</div>
                    <div className="text-xs text-muted-foreground">{registration.registeredAt.slice(0, 10)}</div>
                  </td>
                  <td className="px-3 py-2">
                    <div>{registration.goatType}</div>
                    <div className="text-xs text-muted-foreground truncate max-w-[10rem]">
                      {registration.supplierName || "—"}
                    </div>
                  </td>
                  <td className="px-3 py-2 text-right font-mono whitespace-nowrap">{money(registration.purchasePrice)}</td>
                  <td className="px-3 py-2 font-mono text-muted-foreground whitespace-nowrap">kg</td>
                  <td className="px-3 py-2 text-right font-mono whitespace-nowrap">{qty(registration.limbKg)}</td>
                  <td className="px-3 py-2 text-right font-mono whitespace-nowrap">{qty(registration.insidePartsKg)}</td>
                  <td className="px-3 py-2 text-right font-mono whitespace-nowrap">{qty(registration.boneKg)}</td>
                  <td className="px-3 py-2 text-right font-mono whitespace-nowrap">{qty(registration.wasteKg)}</td>
                  <td className="px-3 py-2 text-right font-mono whitespace-nowrap">{qty(usage.soldTotalKg)}</td>
                  <td className="px-3 py-2 text-right font-mono whitespace-nowrap">
                    {money(row.metrics?.salesBirr ?? 0)}
                  </td>
                  <td className="px-3 py-2 text-right font-mono whitespace-nowrap">{remainingKg}</td>
                  <td className="px-3 py-2">
                    <Chip tone={statusTone(registration.status)}>
                      {registration.status === "active"
                        ? t("Active", "ንቁ")
                        : registration.status === "depleted"
                          ? t("Depleted", "ተጠናቀቀ")
                          : t("Cancelled", "ተሰርዟል")}
                    </Chip>
                  </td>
                  <td className="px-3 py-2 text-right">
                    {editable ? (
                      <div className="flex items-center justify-end gap-2">
                        <button
                          type="button"
                          onClick={(event) => {
                            event.stopPropagation();
                            openEdit(registration);
                          }}
                          className="text-xs text-ember hover:underline inline-flex items-center gap-1"
                        >
                          <Icons.Pencil className="size-3.5" />
                          {t("Edit", "ቀይር")}
                        </button>
                        <button
                          type="button"
                          onClick={(event) => {
                            event.stopPropagation();
                            setDeleteTarget(registration);
                          }}
                          className="text-xs text-destructive hover:underline inline-flex items-center gap-1"
                        >
                          <Icons.Trash2 className="size-3.5" />
                          {t("Delete", "ሰርዝ")}
                        </button>
                      </div>
                    ) : (
                      <span
                        className="text-xs text-muted-foreground"
                        title={t("Meat already sold or consumed", "ሥጋ ቀድሞውኑ ተሸጧል ወይም ተጠቅሟል")}
                      >
                        {t("Locked", "ተቆልፏል")}
                      </span>
                    )}
                  </td>
                </tr>
                );
              })}
              {tableRows.length === 0 ? (
                <tr>
                  <td colSpan={13} className="px-3 py-8 text-center text-muted-foreground">
                    {t("No goat registrations match your filters.", "ማጣሪያዎትን የሚያሟሉ የፍየል ምዝገባዎች የሉም።")}
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
        <GoatTablePagination
          page={page}
          totalPages={totalPages}
          totalItems={tableRows.length}
          pageSize={GOAT_TABLE_PAGE_SIZE}
          onPageChange={setPage}
          t={t}
        />
      </Card>

      <Dialog open={Boolean(detailRow)} onOpenChange={(open) => !open && setDetailRow(null)}>
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
          {detailRow ? (
            <>
              <DialogHeader>
                <DialogTitle>{detailRow.registration.documentNo}</DialogTitle>
                <DialogDescription>{detailRow.registration.referenceNo}</DialogDescription>
              </DialogHeader>
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                <DetailField label={t("Registered", "ተመዝግቧል")} value={detailRow.registration.registeredAt.slice(0, 16).replace("T", " ")} />
                <DetailField label={t("Registered by", "ያመዘገበ")} value={detailRow.registration.registeredBy} />
                <DetailField label={t("Status", "ሁኔታ")} value={
                  <Chip tone={statusTone(detailRow.registration.status)}>
                    {detailRow.registration.status === "active"
                      ? t("Active", "ንቁ")
                      : detailRow.registration.status === "depleted"
                        ? t("Depleted", "ተጠናቀቀ")
                        : t("Cancelled", "ተሰርዟል")}
                  </Chip>
                } />
                <DetailField label={t("Goat type", "የፍየል አይነት")} value={detailRow.registration.goatType} />
                <DetailField label={t("Supplier", "አቅራቢ")} value={detailRow.registration.supplierName || "—"} />
                <DetailField label={t("Purchase price", "የግዢ ዋጋ")} value={money(detailRow.registration.purchasePrice)} />
                <DetailField label={t("Front leg (kg)", "የፊት እግር (kg)")} value={qty(detailRow.registration.frontLegKg)} />
                <DetailField label={t("Back leg (kg)", "የኋላ እግር (kg)")} value={qty(detailRow.registration.backLegKg)} />
                <DetailField label={t("Inside parts (kg)", "የውስጥ ክፍሎች (kg)")} value={qty(detailRow.registration.insidePartsKg)} />
                <DetailField label={t("Bone (kg)", "አጥንት (kg)")} value={qty(detailRow.registration.boneKg)} />
                <DetailField label={t("Waste (kg)", "ቁራጭ (kg)")} value={qty(detailRow.registration.wasteKg)} />
                <DetailField label={t("Location", "ቦታ")} value={detailRow.registration.location} />
              </div>
              {detailRow.metrics ? (
                <div className="mt-4 space-y-3">
                  <h4 className="text-sm font-semibold">{t("Stock movement", "የክምችት እንቅስቃሴ")}</h4>
                  <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                    <DetailField label={t("Sold limb (kg)", "የተሸጠ እግር (kg)")} value={qty(detailRow.metrics.soldLimbKg)} />
                    <DetailField label={t("Sold inside (kg)", "የተሸጠ ውስጥ (kg)")} value={qty(detailRow.metrics.soldInsideKg)} />
                    <DetailField label={t("Sold bone (kg)", "የተሸጠ አጥንት (kg)")} value={qty(detailRow.metrics.soldBoneKg)} />
                    <DetailField label={t("Left limb (kg)", "የቀረ እግር (kg)")} value={qty(detailRow.metrics.remainingLimbKg)} />
                    <DetailField label={t("Left inside (kg)", "የቀረ ውስጥ (kg)")} value={qty(detailRow.metrics.remainingInsideKg)} />
                    <DetailField label={t("Left bone (kg)", "የቀረ አጥንት (kg)")} value={qty(detailRow.metrics.remainingBoneKg)} />
                    <DetailField label={t("Consumption cost", "የተጠቀመ ዋጋ")} value={money(detailRow.metrics.consumptionCost)} />
                    <DetailField label={t("Attributed sales", "ተመደበ ሽያጭ")} value={money(detailRow.metrics.salesBirr)} />
                  </div>
                </div>
              ) : null}
              {detailRow.registration.notes ? (
                <div className="mt-4 rounded-lg border border-border bg-surface-2/40 p-3">
                  <div className="text-xs text-muted-foreground">{t("Notes", "ማስታወሻ")}</div>
                  <p className="mt-1 text-sm">{detailRow.registration.notes}</p>
                </div>
              ) : null}
              <DialogFooter className="mt-4">
                {detailRow.editable ? (
                  <>
                    <button
                      type="button"
                      onClick={() => {
                        openEdit(detailRow.registration);
                        setDetailRow(null);
                      }}
                      className="h-10 px-4 rounded-lg border border-border bg-card text-sm font-medium inline-flex items-center gap-2"
                    >
                      <Icons.Pencil className="size-4" />
                      {t("Edit", "ቀይር")}
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setDeleteTarget(detailRow.registration);
                        setDetailRow(null);
                      }}
                      className="h-10 px-4 rounded-lg bg-destructive text-destructive-foreground text-sm font-medium inline-flex items-center gap-2"
                    >
                      <Icons.Trash2 className="size-4" />
                      {t("Delete", "ሰርዝ")}
                    </button>
                  </>
                ) : null}
                <button
                  type="button"
                  onClick={() => setDetailRow(null)}
                  className="h-10 px-4 rounded-lg border border-border bg-card text-sm font-medium"
                >
                  {t("Close", "ዝጋ")}
                </button>
              </DialogFooter>
            </>
          ) : null}
        </DialogContent>
      </Dialog>

      <Dialog open={Boolean(editing)} onOpenChange={(open) => !open && (setEditing(null), setEditForm(null))}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{t("Edit goat registration", "የፍየል ምዝገባ ቀይር")}</DialogTitle>
            {editing ? (
              <DialogDescription>{`${editing.documentNo} · ${editing.referenceNo}`}</DialogDescription>
            ) : null}
          </DialogHeader>
          {editForm ? (
            <form onSubmit={handleEditSubmit} className="space-y-4">
              <RegistrationFormFields value={editForm} onChange={setEditForm} goatTypes={goatTypes} t={t} />
              <DialogFooter>
                <button
                  type="button"
                  onClick={() => {
                    setEditing(null);
                    setEditForm(null);
                  }}
                  className="h-10 px-4 rounded-lg border border-border bg-card text-sm font-medium"
                >
                  {t("Cancel", "ሰርዝ")}
                </button>
                <button
                  type="submit"
                  className="h-10 px-4 rounded-lg bg-ember text-ember-foreground text-sm font-medium inline-flex items-center gap-2"
                >
                  <Icons.Save className="size-4" />
                  {t("Save changes", "ለውጦችን አስቀምጥ")}
                </button>
              </DialogFooter>
            </form>
          ) : null}
        </DialogContent>
      </Dialog>

      <Dialog open={Boolean(deleteTarget)} onOpenChange={(open) => !open && setDeleteTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("Delete goat registration?", "የፍየል ምዝገባ ይሰረዝ?")}</DialogTitle>
          </DialogHeader>
          <DialogFooter>
            <button
              type="button"
              onClick={() => setDeleteTarget(null)}
              className="h-10 px-4 rounded-lg border border-border bg-card text-sm font-medium"
            >
              {t("Keep", "አቆይ")}
            </button>
            <button
              type="button"
              onClick={confirmDelete}
              className="h-10 px-4 rounded-lg bg-destructive text-destructive-foreground text-sm font-medium inline-flex items-center gap-2"
            >
              <Icons.Trash2 className="size-4" />
              {t("Delete registration", "ምዝገባ ሰርዝ")}
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}


