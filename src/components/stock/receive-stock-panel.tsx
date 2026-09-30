import { useMemo } from "react";
import * as Icons from "lucide-react";

import { Card, Chip } from "@/components/ui-kit";
import type { StockTabId } from "@/lib/inventory-access";
import { useT } from "@/lib/i18n";
import type { StockWorkflowTask } from "@/lib/stock-workflow-inbox";

export function ReceiveStockPanel({
  tasks,
  onReceive,
  onOpenTab,
}: {
  tasks: StockWorkflowTask[];
  onReceive: (task: StockWorkflowTask) => void;
  onOpenTab: (tab: StockTabId) => void;
}) {
  const t = useT();
  const receiveTasks = useMemo(() => tasks.filter((row) => row.bucket === "receive"), [tasks]);
  const issueTasks = useMemo(
    () => receiveTasks.filter((row) => row.documentType === "Store Issue Voucher"),
    [receiveTasks],
  );
  const transferTasks = useMemo(
    () => receiveTasks.filter((row) => row.documentType === "Store Transfer Voucher"),
    [receiveTasks],
  );

  return (
    <div className="space-y-4">
      <Card>
        <div className="flex items-start gap-3">
          <div className="size-10 rounded-xl bg-teff/15 text-teff grid place-items-center shrink-0">
            <Icons.PackageCheck className="size-5" />
          </div>
          <div>
            <h3 className="font-display text-lg font-semibold">{t("Receive Stock", "ክምችት ተቀበል")}</h3>
          </div>
        </div>
      </Card>

      <ReceiveSection
        title={t("Issue vouchers in transit", "በመንገድ ላይ ያሉ የመስጫ ቫውቸሮች")}
        tasks={issueTasks}
        onReceive={onReceive}
        onOpenTab={onOpenTab}
        emptyLabel={t("No issue vouchers awaiting receipt.", "መቀበያ የሚጠብቁ የመስጫ ቫውቸሮች የሉም።")}
      />
      <ReceiveSection
        title={t("Transfer vouchers in transit", "በመንገድ ላይ ያሉ የዝውውር ቫውቸሮች")}
        tasks={transferTasks}
        onReceive={onReceive}
        onOpenTab={onOpenTab}
        emptyLabel={t("No transfer vouchers awaiting receipt.", "መቀበያ የሚጠብቁ የዝውውር ቫውቸሮች የሉም።")}
      />
    </div>
  );
}

function ReceiveSection({
  title,
  tasks,
  onReceive,
  onOpenTab,
  emptyLabel,
}: {
  title: string;
  tasks: StockWorkflowTask[];
  onReceive: (task: StockWorkflowTask) => void;
  onOpenTab: (tab: StockTabId) => void;
  emptyLabel: string;
}) {
  const t = useT();
  return (
    <Card>
      <div className="flex items-center justify-between mb-4">
        <h3 className="font-display text-lg font-semibold">{title}</h3>
        <Chip tone="teff">{tasks.length}</Chip>
      </div>
      <div className="space-y-3">
        {tasks.map((task) => (
          <div key={task.id} className="rounded-xl border border-emerald-500/30 bg-emerald-500/5 p-3 space-y-2">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <div className="font-mono font-medium">{task.referenceNo}</div>
                <div className="text-xs text-muted-foreground">{task.subtitle}</div>
              </div>
              <Chip>{task.status}</Chip>
            </div>
            {task.lines && task.lines.length > 0 ? (
              <div className="space-y-1 rounded-lg border border-border/70 bg-card/70 px-3 py-2">
                {task.lines.map((line) => (
                  <div key={line.id} className="flex items-center justify-between gap-3 text-sm">
                    <span className="min-w-0 truncate">{line.name}</span>
                    <span className="shrink-0 text-right font-mono">
                      {line.receivedQuantity > 0 ? (
                        <>
                          <span className="font-semibold">
                            {line.receivedQuantity} {line.unit}
                          </span>
                          <span className="ml-1 text-[11px] text-muted-foreground">{t("received", "ተቀብሏል")}</span>
                          {line.sentQuantity > 0 && line.sentQuantity !== line.receivedQuantity ? (
                            <span className="block text-[11px] text-muted-foreground">
                              {t("Sent", "ተልኳል")} {line.sentQuantity} {line.unit}
                            </span>
                          ) : null}
                        </>
                      ) : (
                        <>
                          <span className="font-semibold">
                            {line.sentQuantity} {line.unit}
                          </span>
                          <span className="ml-1 text-[11px] text-muted-foreground">{t("to receive", "ለመቀበል")}</span>
                        </>
                      )}
                    </span>
                  </div>
                ))}
              </div>
            ) : task.itemSummary ? (
              <div className="text-sm text-muted-foreground">{task.itemSummary}</div>
            ) : null}
            <div className="flex flex-wrap gap-2 justify-end">
              {task.canAct ? (
                <button
                  type="button"
                  onClick={() => onReceive(task)}
                  className="h-9 px-3 rounded-lg bg-ember text-ember-foreground text-xs font-semibold"
                >
                  {t("Confirm receipt", "መቀበያ አረጋግጥ")}
                </button>
              ) : (
                <span className="text-xs text-muted-foreground self-center">{t("Awaiting authorized receiver", "የተፈቀደ ተቀባይ ይጠበቃል")}</span>
              )}
              <button
                type="button"
                onClick={() => onOpenTab(task.sourceTab)}
                className="h-9 px-3 rounded-lg border border-border bg-card text-xs font-medium hover:bg-surface-2"
              >
                {t("Open document", "ሰነድ ክፈት")}
              </button>
            </div>
          </div>
        ))}
        {tasks.length === 0 ? <div className="text-sm text-muted-foreground">{emptyLabel}</div> : null}
      </div>
    </Card>
  );
}
