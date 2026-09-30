import type { ReactNode } from "react";
import { useState } from "react";
import * as Icons from "lucide-react";
import { useT } from "@/lib/i18n";

export type PaymentsTabId =
  | "overview"
  | "transactions"
  | "pending"
  | "partial"
  | "refunds"
  | "voids"
  | "reconciliation"
  | "shift"
  | "analytics";

type TabDefinition = {
  id: PaymentsTabId;
  label: [string, string];
  icon: keyof typeof Icons;
};

const TABS: TabDefinition[] = [
  { id: "overview", label: ["Overview", "አጠቃላይ እይታ"], icon: "LayoutDashboard" },
  { id: "transactions", label: ["Transactions", "ግብይቶች"], icon: "ReceiptText" },
  { id: "pending", label: ["Pending", "በመጠባበቅ ላይ"], icon: "Clock3" },
  { id: "partial", label: ["Partial", "በከፊል"], icon: "CircleDotDashed" },
  { id: "refunds", label: ["Refunds", "ተመላሽ"], icon: "Undo2" },
  { id: "voids", label: ["Voids", "ስረዛዎች"], icon: "Ban" },
  { id: "reconciliation", label: ["Reconciliation", "ማስታረቅ"], icon: "Scale" },
  { id: "shift", label: ["Shift Settlement", "የሽፍት ማጠናቀቂያ"], icon: "BriefcaseBusiness" },
  { id: "analytics", label: ["Analytics", "ትንታኔ"], icon: "ChartNoAxesCombined" },
];

export type PaymentsShellProps = {
  tabs: Partial<Record<PaymentsTabId, ReactNode>>;
  defaultTab?: PaymentsTabId;
  activeTab?: PaymentsTabId;
  onTabChange?: (tab: PaymentsTabId) => void;
};

export function PaymentsShell({
  tabs,
  defaultTab = "overview",
  activeTab,
  onTabChange,
}: PaymentsShellProps) {
  const t = useT();
  const [internalTab, setInternalTab] = useState(defaultTab);
  const selectedTab = activeTab ?? internalTab;

  function selectTab(tab: PaymentsTabId) {
    if (activeTab === undefined) setInternalTab(tab);
    onTabChange?.(tab);
  }

  return (
    <div className="min-w-0">
      <div className="mb-4 overflow-x-auto rounded-xl border border-border bg-card p-1.5">
        <div className="flex min-w-max gap-1" role="tablist" aria-label={t("Payments workspace", "የክፍያ የስራ ቦታ")}>
          {TABS.map((tab) => {
            const Icon = Icons[tab.icon] as React.ComponentType<{ className?: string }>;
            const selected = selectedTab === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                role="tab"
                aria-selected={selected}
                onClick={() => selectTab(tab.id)}
                className={`h-10 rounded-lg px-3 text-sm font-medium inline-flex items-center gap-2 transition-colors ${
                  selected
                    ? "bg-foreground text-background shadow-sm"
                    : "text-muted-foreground hover:bg-surface-2 hover:text-foreground"
                }`}
              >
                <Icon className="size-4" />
                {t(tab.label[0], tab.label[1])}
              </button>
            );
          })}
        </div>
      </div>
      <div role="tabpanel" className="min-w-0">
        {tabs[selectedTab] ?? (
          <div className="surface-card p-8 text-center text-sm text-muted-foreground">
            {t("No content is available for this tab.", "ለዚህ ትር ይዘት የለም።")}
          </div>
        )}
      </div>
    </div>
  );
}
