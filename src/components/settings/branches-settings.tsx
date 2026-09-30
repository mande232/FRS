import { useEffect, useMemo, useState } from "react";
import * as Icons from "lucide-react";
import { SettingsField, SettingsInput, SettingsSelect, ToggleRow } from "@/components/settings/settings-shared";
import { Chip } from "@/components/ui-kit";
import { useAuth } from "@/lib/auth-context";
import {
  BRANCHES_MODULE_KEY,
  activeBranchNames,
  branchRecordId,
  cacheBranches,
  defaultBranchRecord,
  ensureSeedBranches,
  normalizeBranchRecord,
  upsertBranchRecord,
  validateBranchRecord,
  type BranchRecord,
} from "@/lib/branches";
import { useLang } from "@/lib/lang-context";
import { EMPTY_MODULE_RECORDS, useModuleRecords } from "@/lib/module-records";
import { CENTRAL_STOCK_LOCATIONS } from "@/lib/stock-management";

type BranchesSettingsProps = {
  canEdit: boolean;
  seed?: { name?: string; address?: string; phone?: string; timezone?: string };
};

function emptyDraft(seedName = "New Branch"): BranchRecord {
  return defaultBranchRecord(seedName, {
    isHeadquarters: false,
    active: true,
  });
}

export function BranchesSettings({ canEdit, seed }: BranchesSettingsProps) {
  const lang = useLang();
  const { user } = useAuth();
  const t = (en: string, am: string) => (lang === "am" ? am : en);

  const { records, setRecords } = useModuleRecords<BranchRecord>(BRANCHES_MODULE_KEY, EMPTY_MODULE_RECORDS);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [draft, setDraft] = useState<BranchRecord | null>(null);
  const [creating, setCreating] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const branches = useMemo(
    () =>
      ensureSeedBranches(records, {
        name: seed?.name || user?.branch || "Main",
        address: seed?.address,
        phone: seed?.phone,
        timezone: seed?.timezone,
      }).sort((a, b) => {
        if (a.isHeadquarters !== b.isHeadquarters) return a.isHeadquarters ? -1 : 1;
        return a.name.localeCompare(b.name);
      }),
    [records, seed, user?.branch],
  );

  useEffect(() => {
    cacheBranches(branches);
  }, [branches]);

  useEffect(() => {
    if (records.length === 0 && branches.length > 0) {
      setRecords(branches);
    }
  }, [records.length, branches, setRecords]);

  useEffect(() => {
    if (!selectedId && branches[0]) {
      setSelectedId(branches[0].id);
      setDraft(normalizeBranchRecord(branches[0], branches[0].name));
      setCreating(false);
    }
  }, [branches, selectedId]);

  const errors = draft ? validateBranchRecord(draft, branches) : [];
  const dirty =
    !!draft &&
    (creating ||
      JSON.stringify(draft) !==
        JSON.stringify(branches.find((row) => row.id === draft.id) ?? null));

  function selectBranch(row: BranchRecord) {
    setSelectedId(row.id);
    setDraft(normalizeBranchRecord(row, row.name));
    setCreating(false);
    setMessage(null);
  }

  function startCreate() {
    if (!canEdit) return;
    const next = emptyDraft(t("New Branch", "አዲስ ቅርንጫፍ"));
    setCreating(true);
    setSelectedId(next.id);
    setDraft(next);
    setMessage(null);
  }

  function updateDraft(patch: Partial<BranchRecord>) {
    setDraft((current) => (current ? normalizeBranchRecord({ ...current, ...patch }, current.name) : current));
  }

  function updateAdjustments(patch: Partial<BranchRecord["adjustments"]>) {
    setDraft((current) =>
      current
        ? normalizeBranchRecord(
            { ...current, adjustments: { ...current.adjustments, ...patch } },
            current.name,
          )
        : current,
    );
  }

  function saveDraft() {
    if (!canEdit || !draft || errors.length > 0) return;
    const next = normalizeBranchRecord(
      {
        ...draft,
        id: creating ? branchRecordId(draft.name) : draft.id,
        updatedAtIso: new Date().toISOString(),
        updatedBy: user?.name ?? user?.email ?? "Admin",
      },
      draft.name,
    );
    const merged = upsertBranchRecord(branches, next);
    setRecords(merged);
    cacheBranches(merged);
    setSelectedId(next.id);
    setDraft(next);
    setCreating(false);
    setMessage(t("Branch saved.", "ቅርንጫፍ ተቀምጧል።"));
  }

  function deactivateSelected() {
    if (!canEdit || !draft || creating) return;
    if (draft.isHeadquarters) {
      setMessage(t("Set another HQ before deactivating this branch.", "ይህን ከማቦዘን በፊት ሌላ ዋና ቅርንጫፍ ይምረጡ።"));
      return;
    }
    const next = normalizeBranchRecord({ ...draft, active: false }, draft.name);
    const merged = upsertBranchRecord(branches, next);
    setRecords(merged);
    cacheBranches(merged);
    setDraft(next);
    setMessage(t("Branch deactivated.", "ቅርንጫፍ ቦዝኗል።"));
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="text-sm text-muted-foreground">
            {t(
              "Set up each location, then adjust tax, receipt, inventory, and printer behaviour per branch.",
              "እያንዳንዱን ቦታ ያዋቅሩ፣ ከዚያ በቅርንጫፍ ታክስ፣ ደረሰኝ፣ ክምችት እና አታሚ ያስተካክሉ።",
            )}
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            {activeBranchNames(branches).length} {t("active", "ንቁ")} · {branches.length}{" "}
            {t("total", "ጠቅላላ")}
          </p>
        </div>
        {canEdit ? (
          <button
            type="button"
            onClick={startCreate}
            className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-ember px-3 text-sm font-semibold text-ember-foreground"
          >
            <Icons.Plus className="size-4" />
            {t("Add branch", "ቅርንጫፍ ጨምር")}
          </button>
        ) : null}
      </div>

      <div className="grid gap-4 lg:grid-cols-[220px_minmax(0,1fr)]">
        <div className="space-y-1">
          {branches.map((row) => {
            const active = selectedId === row.id;
            return (
              <button
                key={row.id}
                type="button"
                onClick={() => selectBranch(row)}
                className={`flex w-full items-start gap-2 rounded-lg px-3 py-2.5 text-left text-sm transition ${
                  active ? "bg-foreground text-background" : "bg-surface-2 hover:bg-surface-2/80"
                }`}
              >
                <Icons.MapPin className="mt-0.5 size-4 shrink-0 opacity-80" />
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-medium">{row.name}</span>
                  <span className={`block text-[11px] ${active ? "opacity-80" : "text-muted-foreground"}`}>
                    {row.code}
                    {row.isHeadquarters ? ` · ${t("HQ", "ዋና")}` : ""}
                    {!row.active ? ` · ${t("Off", "ጠፍቷል")}` : ""}
                  </span>
                </span>
              </button>
            );
          })}
        </div>

        {draft ? (
          <div className="space-y-4 rounded-xl border border-border p-3 sm:p-4">
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="font-display text-base font-semibold">
                {creating ? t("New branch", "አዲስ ቅርንጫፍ") : draft.name}
              </h3>
              {draft.isHeadquarters ? <Chip tone="teff">{t("Headquarters", "ዋና ቅርንጫፍ")}</Chip> : null}
              {draft.active ? (
                <Chip tone="teff">{t("Active", "ንቁ")}</Chip>
              ) : (
                <Chip tone="muted">{t("Inactive", "ቦዝኗል")}</Chip>
              )}
              {dirty ? <Chip tone="gold">{t("Unsaved", "ያልተቀመጠ")}</Chip> : null}
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <SettingsField label={t("Branch name", "የቅርንጫፍ ስም")}>
                <SettingsInput
                  value={draft.name}
                  disabled={!canEdit}
                  onChange={(v) => updateDraft({ name: v })}
                />
              </SettingsField>
              <SettingsField label={t("Code", "ኮድ")} hint={t("Short code for receipts", "ለደረሰኝ አጭር ኮድ")}>
                <SettingsInput
                  value={draft.code}
                  disabled={!canEdit}
                  onChange={(v) => updateDraft({ code: v.toUpperCase() })}
                />
              </SettingsField>
              <SettingsField label={t("City", "ከተማ")}>
                <SettingsInput value={draft.city} disabled={!canEdit} onChange={(v) => updateDraft({ city: v })} />
              </SettingsField>
              <SettingsField label={t("Phone", "ስልክ")}>
                <SettingsInput value={draft.phone} disabled={!canEdit} onChange={(v) => updateDraft({ phone: v })} />
              </SettingsField>
              <SettingsField label={t("Address", "አድራሻ")}>
                <SettingsInput
                  value={draft.address}
                  disabled={!canEdit}
                  onChange={(v) => updateDraft({ address: v })}
                />
              </SettingsField>
              <SettingsField label={t("Timezone", "የሰዓት ቀጠና")}>
                <SettingsInput
                  value={draft.timezone}
                  disabled={!canEdit}
                  onChange={(v) => updateDraft({ timezone: v })}
                />
              </SettingsField>
            </div>

            <div className="space-y-2">
              <ToggleRow
                label={t("Active branch", "ንቁ ቅርንጫፍ")}
                enabled={draft.active}
                onChange={canEdit ? (v) => updateDraft({ active: v }) : undefined}
              />
              <ToggleRow
                label={t("Headquarters", "ዋና ቅርንጫፍ")}
                enabled={draft.isHeadquarters}
                onChange={canEdit ? (v) => updateDraft({ isHeadquarters: v }) : undefined}
              />
            </div>

            <div className="border-t border-border pt-3">
              <h4 className="mb-1 font-semibold text-sm">
                {t("Branch adjustments", "የቅርንጫፍ ማስተካከያዎች")}
              </h4>
              <p className="mb-3 text-xs text-muted-foreground">
                {t(
                  "Leave overrides blank to use restaurant-wide Settings. These apply only to this location.",
                  "ባዶ ከተው የምግብ ቤት አጠቃላይ ቅንብሮችን ይጠቀማል። እነዚህ ለዚህ ቦታ ብቻ ናቸው።",
                )}
              </p>

              <div className="grid gap-3 sm:grid-cols-2">
                <SettingsField
                  label={t("Receipt prefix override", "የደረሰኝ ቅድመ-ቅጥያ")}
                  hint={t("Blank = global prefix", "ባዶ = አጠቃላይ ቅድመ-ቅጥያ")}
                >
                  <SettingsInput
                    value={draft.adjustments.receiptPrefix}
                    disabled={!canEdit}
                    placeholder={draft.code}
                    onChange={(v) => updateAdjustments({ receiptPrefix: v.toUpperCase() })}
                  />
                </SettingsField>
                <SettingsField label={t("Default inventory store", "ነባሪ የክምችት ስቶር")}>
                  <SettingsSelect
                    value={draft.adjustments.inventoryStore}
                    disabled={!canEdit}
                    onChange={(v) =>
                      updateAdjustments({
                        inventoryStore: v as BranchRecord["adjustments"]["inventoryStore"],
                      })
                    }
                    options={CENTRAL_STOCK_LOCATIONS.map((store) => ({ value: store, label: store }))}
                  />
                </SettingsField>
                <SettingsField
                  label={t("VAT % override", "VAT % ማስተካከያ")}
                  hint={t("Blank = global VAT", "ባዶ = አጠቃላይ VAT")}
                >
                  <SettingsInput
                    type="number"
                    value={draft.adjustments.vatRateOverride ?? ""}
                    disabled={!canEdit}
                    placeholder={t("Use global", "አጠቃላይ")}
                    onChange={(v) =>
                      updateAdjustments({
                        vatRateOverride: v.trim() === "" ? null : Number(v),
                      })
                    }
                  />
                </SettingsField>
                <SettingsField
                  label={t("Service charge % override", "የአገልግሎት ክፍያ %")}
                  hint={t("Blank = global rate", "ባዶ = አጠቃላይ መጠን")}
                >
                  <SettingsInput
                    type="number"
                    value={draft.adjustments.serviceChargeRateOverride ?? ""}
                    disabled={!canEdit}
                    placeholder={t("Use global", "አጠቃላይ")}
                    onChange={(v) =>
                      updateAdjustments({
                        serviceChargeRateOverride: v.trim() === "" ? null : Number(v),
                      })
                    }
                  />
                </SettingsField>
              </div>

              <div className="mt-3 space-y-2">
                <ToggleRow
                  label={t("Share menu with headquarters", "ሜኑ ከዋና ቅርንጫፍ ጋር")}
                  enabled={draft.adjustments.shareMenuWithHq}
                  onChange={canEdit ? (v) => updateAdjustments({ shareMenuWithHq: v }) : undefined}
                />
                <ToggleRow
                  label={t("Share inventory master with HQ", "ክምችት ከዋና ቅርንጫፍ ጋር")}
                  enabled={draft.adjustments.shareInventoryWithHq}
                  onChange={canEdit ? (v) => updateAdjustments({ shareInventoryWithHq: v }) : undefined}
                />
                <ToggleRow
                  label={t("Use branch printer settings", "የቅርንጫፍ አታሚ ቅንብር")}
                  enabled={draft.adjustments.useBranchPrinter}
                  onChange={canEdit ? (v) => updateAdjustments({ useBranchPrinter: v }) : undefined}
                />
              </div>

              <div className="mt-3">
                <SettingsField label={t("Operations notes", "የስራ ማስታወሻ")}>
                  <textarea
                    value={draft.adjustments.opsNotes}
                    disabled={!canEdit}
                    rows={3}
                    onChange={(e) => updateAdjustments({ opsNotes: e.target.value })}
                    className="w-full rounded-lg border border-border bg-card px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring/40 disabled:opacity-60"
                    placeholder={t(
                      "Opening hours, manager contact, local cash rules…",
                      "የመክፈቻ ሰዓት፣ የአስተዳዳሪ ስልክ፣ የአካባቢ ጥሬ ገንዘብ ደንብ…",
                    )}
                  />
                </SettingsField>
              </div>
            </div>

            {errors.length > 0 ? (
              <div className="rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
                {errors.map((error) => (
                  <div key={error}>{error}</div>
                ))}
              </div>
            ) : null}

            {message ? <p className="text-sm text-muted-foreground">{message}</p> : null}

            {canEdit ? (
              <div className="flex flex-wrap gap-2 border-t border-border pt-3">
                <button
                  type="button"
                  onClick={saveDraft}
                  disabled={!dirty || errors.length > 0}
                  className="inline-flex h-10 items-center gap-2 rounded-lg bg-ember px-4 text-sm font-semibold text-ember-foreground disabled:opacity-50"
                >
                  <Icons.Save className="size-4" />
                  {t("Save branch", "ቅርንጫፍ አስቀምጥ")}
                </button>
                {!creating && draft.active ? (
                  <button
                    type="button"
                    onClick={deactivateSelected}
                    className="h-10 rounded-lg border border-border bg-card px-4 text-sm"
                  >
                    {t("Deactivate", "አቦዝን")}
                  </button>
                ) : null}
              </div>
            ) : null}
          </div>
        ) : null}
      </div>
    </div>
  );
}
