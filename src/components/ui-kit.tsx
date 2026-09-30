import type { ReactNode } from "react";
import { Link } from "@tanstack/react-router";
import * as Icons from "lucide-react";
import { useT } from "@/lib/i18n";

export function PageHeader({ title, subtitle, action }: { title: string; subtitle?: string; action?: ReactNode }) {
  const t = useT();
  return (
    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 sm:gap-3 mb-3 sm:mb-4 min-w-0">
      <div className="min-w-0">
        <h1 className="font-display text-xl sm:text-2xl font-semibold tracking-normal leading-snug break-words">{t(title)}</h1>
        {subtitle && <p className="text-muted-foreground mt-0.5 text-sm leading-snug line-clamp-2">{t(subtitle)}</p>}
      </div>
      {action}
    </div>
  );
}

export function Card({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <div className={`surface-card p-3 sm:p-4 ${className}`}>{children}</div>;
}

export function Stat({
  label,
  value,
  hint,
  tone = "default",
  icon,
  to,
  search,
}: {
  label: string;
  value: string;
  hint?: string;
  tone?: "default" | "ember" | "teff" | "gold" | "destructive";
  icon?: keyof typeof Icons;
  to?: string;
  search?: Record<string, unknown>;
}) {
  const t = useT();
  const toneClass =
    tone === "ember" ? "bg-ember/10 text-ember"
    : tone === "teff" ? "bg-teff/10 text-teff"
    : tone === "gold" ? "bg-gold/20 text-gold-foreground"
    : tone === "destructive" ? "bg-destructive/10 text-destructive"
    : "bg-accent text-accent-foreground";
  const Cmp = icon ? (Icons[icon] as React.ComponentType<{ className?: string }>) : null;
  const body = (
    <div className="flex items-start justify-between gap-2 min-w-0">
      <div className="min-w-0 flex-1">
          <div className="text-[11px] sm:text-xs uppercase tracking-wide text-muted-foreground leading-snug">{t(label)}</div>
          <div className="font-display text-lg sm:text-xl font-semibold mt-0.5 leading-snug break-words tracking-normal">{value}</div>
          {hint && <div className="text-[11px] sm:text-xs text-muted-foreground mt-0.5 leading-snug line-clamp-2">{t(hint)}</div>}
      </div>
      {Cmp && (
        <div className={`size-7 sm:size-8 rounded-lg grid place-items-center shrink-0 transition-transform duration-200 ${toneClass} ${to ? "group-hover:scale-110" : ""}`}>
          <Cmp className="size-3.5 sm:size-4" />
        </div>
      )}
    </div>
  );

  if (to) {
    return (
      <Link
        to={to}
        search={search}
        className="surface-card block !p-2.5 sm:!p-3 min-w-0 overflow-hidden group transition-all duration-200 hover:-translate-y-0.5 hover:border-ember/35 hover:shadow-[var(--shadow-lift)] active:translate-y-0 active:scale-[0.99] focus:outline-none focus-visible:ring-2 focus-visible:ring-ember/40"
      >
        {body}
      </Link>
    );
  }

  return (
    <Card className="!p-2.5 sm:!p-3 min-w-0 overflow-hidden">
      {body}
    </Card>
  );
}

export function Chip({ children, tone = "default" }: { children: ReactNode; tone?: "default" | "ember" | "teff" | "gold" | "muted" | "destructive" }) {
  const t = useT();
  const map = {
    default: "bg-accent text-accent-foreground",
    ember: "bg-ember/15 text-ember",
    teff: "bg-teff/15 text-teff",
    gold: "bg-gold/25 text-gold-foreground",
    muted: "bg-surface-2 text-muted-foreground",
    destructive: "bg-destructive/15 text-destructive",
  } as const;
  return <span className={`inline-flex items-center gap-1 px-2 h-6 rounded-full text-xs font-medium ${map[tone]}`}>{typeof children === "string" ? t(children) : children}</span>;
}
