import type { ReactNode } from "react";
import * as Icons from "lucide-react";
import { Chip } from "@/components/ui-kit";
import { formatDateTime } from "@/lib/date-time";
import { useT } from "@/lib/i18n";
import type { SectionMeta } from "@/lib/system-settings";

export function SettingsField({
  label,
  children,
  hint,
}: {
  label: string;
  children: ReactNode;
  hint?: string;
}) {
  return (
    <label className="block min-w-0 space-y-1">
      <span className="text-xs text-muted-foreground">{label}</span>
      {children}
      {hint && <span className="text-[11px] text-muted-foreground block">{hint}</span>}
    </label>
  );
}

export function SettingsInput({
  value,
  onChange,
  type = "text",
  placeholder,
  disabled,
}: {
  value: string | number;
  onChange: (value: string) => void;
  type?: string;
  placeholder?: string;
  disabled?: boolean;
}) {
  return (
    <input
      type={type}
      value={value}
      disabled={disabled}
      placeholder={placeholder}
      onChange={(event) => onChange(event.target.value)}
      className="w-full h-10 px-3 rounded-lg border border-border bg-card text-sm focus:outline-none focus:ring-2 focus:ring-ring/40 disabled:opacity-60"
    />
  );
}

export function SettingsSelect({
  value,
  onChange,
  options,
  disabled,
}: {
  value: string;
  onChange: (value: string) => void;
  options: Array<{ value: string; label: string }>;
  disabled?: boolean;
}) {
  return (
    <select
      value={value}
      disabled={disabled}
      onChange={(event) => onChange(event.target.value)}
      className="w-full h-10 px-3 rounded-lg border border-border bg-card text-sm focus:outline-none disabled:opacity-60"
    >
      {options.map((option) => (
        <option key={option.value} value={option.value}>{option.label}</option>
      ))}
    </select>
  );
}

export function SettingLine({ label, value }: { label: string; value: string }) {
  return (
    <li className="flex justify-between gap-3 py-2 border-b border-border last:border-0 min-w-0">
      <span className="text-muted-foreground truncate">{label}</span>
      <span className="font-medium text-right shrink-0">{value}</span>
    </li>
  );
}

export function ToggleRow({
  label,
  enabled,
  onChange,
  disabled,
}: {
  label: string;
  enabled: boolean;
  onChange?: (next: boolean) => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      disabled={disabled || !onChange}
      onClick={() => onChange?.(!enabled)}
      className="w-full flex items-center justify-between gap-3 p-3 rounded-lg bg-surface-2 text-left disabled:opacity-60"
    >
      <span className="text-sm font-medium min-w-0">{label}</span>
      <span className={`w-9 h-5 rounded-full p-0.5 transition-colors shrink-0 ${enabled ? "bg-ember" : "bg-border"}`}>
        <span className={`block size-4 rounded-full bg-background transition-transform ${enabled ? "translate-x-4" : ""}`} />
      </span>
    </button>
  );
}

export function SectionFooter({
  dirty,
  canSave,
  errors,
  meta,
  onSave,
  onReset,
  saving,
}: {
  dirty: boolean;
  canSave: boolean;
  errors: string[];
  meta?: SectionMeta;
  onSave: () => void;
  onReset: () => void;
  saving?: boolean;
}) {
  const t = useT();

  return (
    <div className="sticky bottom-0 z-10 -mx-4 sm:-mx-5 px-4 sm:px-5 py-3 border-t border-border bg-background/95 backdrop-blur">
      {errors.length > 0 && (
        <div className="mb-2 rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {errors.map((error) => <div key={error}>{error}</div>)}
        </div>
      )}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
          {dirty ? <Chip tone="gold">{t("Unsaved changes", "ያልተቀመጡ ለውጦች")}</Chip> : <Chip tone="teff">{t("Saved", "ተቀምጧል")}</Chip>}
          {meta && (
            <span>
              {t("Last updated", "የመጨረሻ ማዘመን")}: {formatDateTime(meta.updatedAt)} · {meta.updatedBy} ({meta.updatedByRole})
            </span>
          )}
        </div>
        <div className="flex gap-2">
          <button type="button" onClick={onReset} disabled={!canSave || saving} className="h-10 px-4 rounded-lg border border-border bg-card text-sm disabled:opacity-50">
            {t("Reset", "ዳግም አስጀምር")}
          </button>
          <button type="button" onClick={onSave} disabled={!canSave || !dirty || saving || errors.length > 0} className="h-10 px-4 rounded-lg bg-ember text-ember-foreground text-sm font-semibold inline-flex items-center gap-2 disabled:opacity-50">
            <Icons.Save className="size-4" />
            {saving ? t("Saving…", "በማስቀመጥ…") : t("Save", "አስቀምጥ")}
          </button>
        </div>
      </div>
    </div>
  );
}

export function ComingSoonBlock({ title }: { title: string }) {
  const t = useT();
  return (
    <div className="rounded-xl border border-dashed border-border p-8 text-center">
      <Icons.Construction className="size-8 mx-auto text-muted-foreground mb-3" />
      <h3 className="font-display font-semibold">{t(title)}</h3>
    </div>
  );
}
