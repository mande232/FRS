import type { InventoryAccessContext, InventoryWorkspace } from "@/lib/inventory-access";
import {
  shouldShowWorkspaceSelector,
  stockLocationLabel,
  workspaceLabel,
  workspaceOptions,
} from "@/lib/inventory-access";
import { useT } from "@/lib/i18n";
import { Chip } from "@/components/ui-kit";
import { RealtimeBadge } from "@/components/realtime-badge";
import type { BackendRealtimeStatus } from "@/lib/supabase/pos-backend";

export type StockWorkspaceHeaderProps = {
  access: InventoryAccessContext;
  workspace: InventoryWorkspace;
  onWorkspaceChange: (workspace: InventoryWorkspace) => void;
  realtimeStatus: BackendRealtimeStatus;
  lastSyncAt?: string | null;
  actions?: React.ReactNode;
};

export function StockWorkspaceHeader({
  access,
  workspace,
  onWorkspaceChange,
  realtimeStatus,
  lastSyncAt,
  actions,
}: StockWorkspaceHeaderProps) {
  const t = useT();
  const options = workspaceOptions(access);
  const showSelector = shouldShowWorkspaceSelector(access);

  return (
    <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
      <div>
        <div className="text-xs uppercase tracking-wider text-muted-foreground">
          {t("Stock Management", "የክምችት አስተዳደር")}
        </div>
        <h2 className="font-display text-2xl font-semibold mt-1">
          {workspace === "all"
            ? t("All Locations", "ሁሉም ቦታዎች")
            : `${stockLocationLabel(workspace)} ${t("Workspace", "የስራ ቦታ")}`}
        </h2>
        <div className="flex items-center gap-2 mt-2 flex-wrap">
          <RealtimeBadge status={realtimeStatus} lastSyncAt={lastSyncAt} />
          <Chip>{access.branch}</Chip>
          {!showSelector && workspace !== "all" ? (
            <Chip>{stockLocationLabel(workspace)}</Chip>
          ) : null}
        </div>
      </div>
      <div className="flex items-center gap-2 flex-wrap">
        {showSelector ? (
          <label className="text-sm">
            <span className="sr-only">{t("Inventory Workspace", "የክምችት የስራ ቦታ")}</span>
            <select
              value={workspace}
              onChange={(event) => onWorkspaceChange(event.target.value as InventoryWorkspace)}
              className="h-10 min-w-[180px] px-3 rounded-lg border border-border bg-card text-sm"
            >
              {options.map((option) => (
                <option key={option} value={option}>
                  {workspaceLabel(option)}
                </option>
              ))}
            </select>
          </label>
        ) : null}
        {actions}
      </div>
    </div>
  );
}
