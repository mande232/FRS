import { AlertTriangle, Loader2, Radio, WifiOff, type LucideIcon } from "lucide-react";
import { Chip } from "@/components/ui-kit";
import { useLang } from "@/lib/lang-context";
import { selectText } from "@/lib/i18n";
import type { BackendRealtimeStatus } from "@/lib/supabase/pos-backend";

type RealtimeBadgeProps = {
  status: BackendRealtimeStatus;
  lastSyncAt?: string;
  className?: string;
  compact?: boolean;
};

const META: Record<
  BackendRealtimeStatus,
  {
    labelEn: string;
    labelAm: string;
    tone: "teff" | "gold" | "muted" | "destructive";
    icon: LucideIcon;
    spin?: boolean;
  }
> = {
  connected: { labelEn: "Live", labelAm: "ቀጥታ", tone: "teff", icon: Radio },
  connecting: { labelEn: "Connecting", labelAm: "በመገናኘት ላይ", tone: "gold", icon: Loader2, spin: true },
  disabled: { labelEn: "Local", labelAm: "አካባቢ", tone: "muted", icon: WifiOff },
  error: { labelEn: "Realtime issue", labelAm: "የቀጥታ ስህተት", tone: "destructive", icon: AlertTriangle },
};

export function RealtimeBadge({ status, lastSyncAt, className = "", compact = false }: RealtimeBadgeProps) {
  const lang = useLang();
  const meta = META[status];
  const Icon = meta.icon;
  const live = status === "connected" || status === "connecting";
  const label = selectText(lang, live && compact ? "Live" : meta.labelEn, live && compact ? "ቀጥታ" : meta.labelAm);
  const title =
    status === "connected" && lastSyncAt
      ? selectText(lang, `Live. Last update ${lastSyncAt}.`, `ቀጥታ። የመጨረሻው ማሻሻያ ${lastSyncAt} ነበር።`)
      : label;

  if (compact) {
    const dot =
      status === "connected"
        ? "bg-emerald-500"
        : status === "connecting"
          ? "bg-amber-500 animate-pulse"
          : status === "error"
            ? "bg-red-500"
            : "bg-muted-foreground";
    return (
      <span className={`inline-flex items-center gap-1.5 text-sm font-medium ${className}`} title={title}>
        <span className={`size-2 rounded-full ${dot}`} />
        <span>{label}</span>
      </span>
    );
  }

  return (
    <span className={className} title={title}>
      <Chip tone={meta.tone}>
        <Icon className={`size-3.5 ${meta.spin ? "animate-spin" : ""}`} />
        <span>{label}</span>
        {status === "connected" && lastSyncAt && (
          <span className="hidden md:inline text-[11px] opacity-80">
            {selectText(lang, `Synced ${lastSyncAt}`, `ተመሳሰለ ${lastSyncAt}`)}
          </span>
        )}
      </Chip>
    </span>
  );
}
