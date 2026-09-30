import { useEffect, useRef, useState } from "react";
import * as Icons from "lucide-react";
import type { LucideIcon } from "lucide-react";
import type { StockTabId } from "@/lib/inventory-access";
import { useT } from "@/lib/i18n";

export type StockNavTab = {
  key: StockTabId;
  label: string;
  icon: LucideIcon;
  count?: string;
  accent?: "gold" | "teff" | "destructive" | "ember";
};

function countTone(accent?: StockNavTab["accent"]) {
  if (accent === "gold") return "bg-amber-500/15 text-amber-800 dark:text-amber-200";
  if (accent === "destructive") return "bg-destructive/15 text-destructive";
  if (accent === "ember") return "bg-ember/15 text-ember";
  return "bg-surface-2 text-muted-foreground";
}

function TabCard({
  item,
  active,
  onClick,
  compact = false,
}: {
  item: StockNavTab;
  active: boolean;
  onClick: () => void;
  compact?: boolean;
}) {
  const Icon = item.icon;
  const hasCount = item.count && item.count !== "0";

  if (compact) {
    return (
      <button
        type="button"
        onClick={onClick}
        className="flex flex-1 min-w-0 items-center gap-3 rounded-2xl border border-ember bg-ember/10 p-3 text-left ring-1 ring-ember/30"
      >
        <div className="size-11 rounded-xl grid place-items-center shrink-0 bg-ember text-ember-foreground">
          <Icon className="size-5" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="font-semibold text-sm text-foreground truncate">{item.label}</div>
        </div>
        {hasCount ? (
          <span className="min-w-[1.5rem] h-6 px-2 rounded-full text-xs font-semibold inline-grid place-items-center bg-ember text-ember-foreground shrink-0">
            {item.count}
          </span>
        ) : null}
      </button>
    );
  }

  return (
    <button
      type="button"
      onClick={onClick}
      className={[
        "relative rounded-2xl border p-3.5 text-left transition-all duration-200 min-h-[5.25rem]",
        active
          ? "border-ember bg-ember/10 shadow-[var(--shadow-lift)] ring-1 ring-ember/30"
          : "border-border bg-card hover:bg-surface-2 hover:border-foreground/15",
      ].join(" ")}
    >
      <div className="flex items-start justify-between gap-2">
        <div
          className={[
            "size-11 rounded-xl grid place-items-center shrink-0",
            active ? "bg-ember text-ember-foreground" : "bg-surface-2 text-foreground",
          ].join(" ")}
        >
          <Icon className="size-5" />
        </div>
        {hasCount ? (
          <span
            className={`min-w-[1.5rem] h-6 px-2 rounded-full text-xs font-semibold inline-grid place-items-center ${active ? "bg-ember text-ember-foreground" : countTone(item.accent)}`}
          >
            {item.count}
          </span>
        ) : null}
      </div>
      <div className="mt-3 font-semibold text-sm leading-snug text-foreground">{item.label}</div>
    </button>
  );
}

export function StockNavTabs({
  tabs,
  activeTab,
  onSelect,
}: {
  tabs: StockNavTab[];
  activeTab: StockTabId;
  onSelect: (tab: StockTabId) => void;
}) {
  const t = useT();
  const [expanded, setExpanded] = useState(true);
  const skipCollapse = useRef(true);
  const active = tabs.find((item) => item.key === activeTab);

  useEffect(() => {
    if (skipCollapse.current) {
      skipCollapse.current = false;
      return;
    }
    setExpanded(false);
  }, [activeTab]);

  function pickTab(tab: StockTabId) {
    onSelect(tab);
    setExpanded(false);
  }

  if (!active) {
    return (
      <p className="text-sm text-muted-foreground mb-5">
        {t("No modules available for this workspace.", "ለዚህ ቦታ ምንም ሞጁሎች የሉም።")}
      </p>
    );
  }

  if (!expanded) {
    return (
      <div className="mb-5 flex flex-col sm:flex-row gap-2">
        <TabCard item={active} active onClick={() => setExpanded(true)} compact />
        <button
          type="button"
          onClick={() => setExpanded(true)}
          className="h-auto sm:h-full sm:min-w-[9rem] px-4 py-3 rounded-2xl border border-border bg-card text-sm font-medium inline-flex items-center justify-center gap-2 hover:bg-surface-2 shrink-0"
        >
          <Icons.LayoutGrid className="size-4" />
          {t("All modules", "ሁሉም ሞጁሎች")}
        </button>
      </div>
    );
  }

  return (
    <div className="mb-5">
      {activeTab !== "dashboard" ? (
        <div className="flex justify-end mb-3">
          <button
            type="button"
            onClick={() => setExpanded(false)}
            className="text-xs text-muted-foreground hover:text-foreground inline-flex items-center gap-1"
          >
            <Icons.X className="size-3.5" />
            {t("Close picker", "መምረጃ ዝጋ")}
          </button>
        </div>
      ) : null}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6 gap-2.5">
        {tabs.map((item) => (
          <TabCard
            key={item.key}
            item={item}
            active={activeTab === item.key}
            onClick={() => pickTab(item.key)}
          />
        ))}
      </div>
    </div>
  );
}
