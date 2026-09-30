import { useEffect, useMemo, useState } from "react";
import * as Icons from "lucide-react";
import { Card } from "@/components/ui-kit";
import { useT } from "@/lib/i18n";
import { useLang } from "@/lib/lang-context";
import {
  defaultDateRangeValue,
  formatDateRangeLabel,
  resolveDateRange,
  toIsoDateKey,
  type DateRangePreset,
  type DateRangeValue,
  type ResolvedDateTimePreferences,
} from "@/lib/date-time";

const QUICK_PRESETS: Array<{ id: DateRangePreset; labelEn: string; labelAm: string }> = [
  { id: "today", labelEn: "Today", labelAm: "ዛሬ" },
  { id: "yesterday", labelEn: "Yesterday", labelAm: "ትላንት" },
  { id: "this_week", labelEn: "This Week", labelAm: "ይህ ሳምንት" },
  { id: "last_week", labelEn: "Last Week", labelAm: "ያለፈ ሳምንት" },
  { id: "this_month", labelEn: "This Month", labelAm: "ይህ ወር" },
  { id: "last_month", labelEn: "Last Month", labelAm: "ያለፈ ወር" },
  { id: "this_year", labelEn: "This Year", labelAm: "ይህ ዓመት" },
];

export type DateRangePickerProps = {
  value: DateRangeValue;
  onChange: (next: DateRangeValue) => void;
  preferences?: Partial<ResolvedDateTimePreferences>;
  className?: string;
  compact?: boolean;
};

export function DateRangePicker({ value, onChange, preferences, className = "", compact = false }: DateRangePickerProps) {
  const t = useT();
  const lang = useLang();
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState(value);

  useEffect(() => {
    setDraft(value);
  }, [value]);

  const label = useMemo(
    () => formatDateRangeLabel(value, preferences, lang),
    [value, preferences, lang],
  );

  function applyDraft() {
    const resolved = resolveDateRange(
      draft.preset,
      draft.fromDate,
      draft.toDate,
      new Date(),
      preferences?.firstDayOfWeek ?? 1,
    );
    onChange({
      mode: draft.preset === "custom" ? "calendar" : "quick",
      preset: draft.preset,
      fromDate: resolved.fromDate,
      toDate: resolved.toDate,
    });
    setOpen(false);
  }

  function resetToday() {
    const today = defaultDateRangeValue();
    setDraft(today);
    onChange(today);
    setOpen(false);
  }

  function selectQuickPreset(preset: DateRangePreset) {
    const resolved = resolveDateRange(
      preset,
      draft.fromDate,
      draft.toDate,
      new Date(),
      preferences?.firstDayOfWeek ?? 1,
    );
    const next: DateRangeValue = {
      mode: "quick",
      preset,
      fromDate: resolved.fromDate,
      toDate: resolved.toDate,
    };
    setDraft(next);
    onChange(next);
    setOpen(false);
  }

  return (
    <div className={`relative ${className}`}>
      <button
        type="button"
        onClick={() => setOpen((current) => !current)}
        className={`inline-flex items-center gap-2 rounded-lg border border-border bg-card hover:bg-surface-2 transition-colors ${
          compact ? "h-9 px-3 text-sm" : "h-10 px-3 text-sm"
        }`}
      >
        <Icons.CalendarDays className="size-4 text-muted-foreground shrink-0" />
        <span className="truncate max-w-[240px]">{label}</span>
        <Icons.ChevronDown className="size-4 text-muted-foreground shrink-0" />
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} aria-hidden="true" />
          <Card className="absolute left-0 top-full z-50 mt-2 w-[min(100vw-2rem,420px)] !p-3 shadow-lg">
            <div className="flex rounded-lg border border-border overflow-hidden mb-3">
              {(["quick", "calendar"] as const).map((mode) => (
                <button
                  key={mode}
                  type="button"
                  onClick={() =>
                    setDraft((current) => ({
                      ...current,
                      mode,
                      preset: mode === "calendar" ? "custom" : current.preset === "custom" ? "today" : current.preset,
                    }))
                  }
                  className={`flex-1 h-9 text-sm font-medium ${
                    draft.mode === mode ? "bg-foreground text-background" : "bg-card text-muted-foreground"
                  }`}
                >
                  {mode === "quick" ? t("Quick Dates", "ፈጣን ቀኖች") : t("Calendar", "ቀን መቁጠሪያ")}
                </button>
              ))}
            </div>

            {draft.mode === "quick" ? (
              <div className="grid grid-cols-2 gap-1.5">
                {QUICK_PRESETS.map((preset) => (
                  <button
                    key={preset.id}
                    type="button"
                    onClick={() => selectQuickPreset(preset.id)}
                    className={`h-9 px-2 rounded-lg text-sm border ${
                      draft.preset === preset.id ? "border-foreground bg-foreground text-background" : "border-border bg-card"
                    }`}
                  >
                    {t(preset.labelEn, preset.labelAm)}
                  </button>
                ))}
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-2">
                <label className="text-xs space-y-1">
                  <span className="text-muted-foreground">{t("Start date", "መጀመሪያ ቀን")}</span>
                  <input
                    type="date"
                    value={draft.fromDate}
                    max={draft.toDate || undefined}
                    onChange={(event) =>
                      setDraft((current) => ({
                        ...current,
                        mode: "calendar",
                        preset: "custom",
                        fromDate: event.target.value,
                      }))
                    }
                    className="w-full h-9 px-2 rounded-lg border border-border bg-card text-sm"
                  />
                </label>
                <label className="text-xs space-y-1">
                  <span className="text-muted-foreground">{t("End date", "መጨረሻ ቀን")}</span>
                  <input
                    type="date"
                    value={draft.toDate}
                    min={draft.fromDate || undefined}
                    onChange={(event) =>
                      setDraft((current) => ({
                        ...current,
                        mode: "calendar",
                        preset: "custom",
                        toDate: event.target.value,
                      }))
                    }
                    className="w-full h-9 px-2 rounded-lg border border-border bg-card text-sm"
                  />
                </label>
              </div>
            )}

            <div className="mt-3 flex flex-wrap gap-2 justify-end">
              <button
                type="button"
                onClick={() => {
                  const today = defaultDateRangeValue();
                  setDraft(today);
                }}
                className="h-9 px-3 rounded-lg text-sm text-muted-foreground"
              >
                {t("Clear", "አጽዳ")}
              </button>
              <button type="button" onClick={resetToday} className="h-9 px-3 rounded-lg border border-border bg-card text-sm">
                {t("Reset to Today", "ወደ ዛሬ ዳግም አስጀምር")}
              </button>
              <button type="button" onClick={() => setOpen(false)} className="h-9 px-3 rounded-lg border border-border bg-card text-sm">
                {t("Cancel", "ሰርዝ")}
              </button>
              {draft.mode === "calendar" ? (
                <button type="button" onClick={applyDraft} className="h-9 px-3 rounded-lg bg-ember text-ember-foreground text-sm font-semibold">
                  {t("Apply", "ተግብር")}
                </button>
              ) : null}
            </div>
          </Card>
        </>
      )}
    </div>
  );
}

export function isoToday() {
  return toIsoDateKey(new Date());
}
