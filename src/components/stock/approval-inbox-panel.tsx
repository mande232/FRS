import { useMemo, useState } from "react";
import * as Icons from "lucide-react";

import { Card, Chip } from "@/components/ui-kit";
import type { StockTabId } from "@/lib/inventory-access";
import { useT } from "@/lib/i18n";
import {
  summarizeStockWorkflowTasks,
  type StockWorkflowBucket,
  type StockWorkflowTask,
} from "@/lib/stock-workflow-inbox";

const BUCKET_LABELS: Record<StockWorkflowBucket, [string, string]> = {
  approve: ["Needs approval", "ፈቃድ ያስፈልጋል"],
  dispatch: ["Needs dispatch", "መላክ ያስፈልጋል"],
  receive: ["Needs receipt", "መቀበያ ያስፈልጋል"],
  convert: ["Ready to fulfill", "ለመሙላት ዝግጁ"],
};

function actionLabel(task: StockWorkflowTask, t: ReturnType<typeof useT>) {
  if (task.action === "approve") return t("Approve", "አፅድቅ");
  if (task.action === "dispatch") return t("Dispatch", "ላክ");
  if (task.action === "receive") return t("Confirm receipt", "መቀበያ አረጋግጥ");
  if (task.action === "convert-issue") return t("Create issue voucher", "የመስጫ ቫውቸር ፍጠር");
  return t("Open", "ክፈት");
}

export function ApprovalInboxPanel({
  tasks,
  onAction,
  onOpenTab,
}: {
  tasks: StockWorkflowTask[];
  onAction: (task: StockWorkflowTask) => void;
  onOpenTab: (tab: StockTabId) => void;
}) {
  const t = useT();
  const [filter, setFilter] = useState<StockWorkflowBucket | "ALL">("ALL");
  const summary = useMemo(() => summarizeStockWorkflowTasks(tasks), [tasks]);
  const filtered = useMemo(
    () => (filter === "ALL" ? tasks : tasks.filter((row) => row.bucket === filter)),
    [filter, tasks],
  );

  const filters: Array<{ key: StockWorkflowBucket | "ALL"; label: string; count: number }> = [
    { key: "ALL", label: t("All tasks", "ሁሉም ተግባሮች"), count: summary.total },
    { key: "approve", label: t(BUCKET_LABELS.approve[0], BUCKET_LABELS.approve[1]), count: summary.approve },
    { key: "dispatch", label: t(BUCKET_LABELS.dispatch[0], BUCKET_LABELS.dispatch[1]), count: summary.dispatch },
    { key: "receive", label: t(BUCKET_LABELS.receive[0], BUCKET_LABELS.receive[1]), count: summary.receive },
    { key: "convert", label: t(BUCKET_LABELS.convert[0], BUCKET_LABELS.convert[1]), count: summary.convert },
  ];

  return (
    <div className="space-y-4">
      <Card>
        <div className="grid grid-cols-2 xl:grid-cols-5 gap-3">
          {filters.map((row) => (
            <button
              key={row.key}
              type="button"
              onClick={() => setFilter(row.key)}
              className={`rounded-xl border p-3 text-left transition-colors ${
                filter === row.key ? "border-ember bg-ember/10" : "border-border bg-card hover:bg-surface-2"
              }`}
            >
              <div className="text-xs text-muted-foreground">{row.label}</div>
              <div className="font-display text-2xl font-semibold mt-1">{row.count}</div>
            </button>
          ))}
        </div>
      </Card>

      <Card className="!p-0 overflow-hidden">
        <div className="overflow-auto">
          <table className="w-full text-sm">
            <thead className="bg-surface-2 text-xs uppercase tracking-wider text-muted-foreground">
              <tr>
                <th className="text-left px-3 py-2">{t("Task", "ተግባር")}</th>
                <th className="text-left px-3 py-2">{t("Document", "ሰነድ")}</th>
                <th className="text-left px-3 py-2">{t("Details", "ዝርዝር")}</th>
                <th className="text-left px-3 py-2">{t("Status", "ሁኔታ")}</th>
                <th className="text-right px-3 py-2">{t("Action", "እርምጃ")}</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((task) => (
                <tr key={task.id} className="border-t border-border">
                  <td className="px-3 py-3 align-top">
                    <Chip tone={task.bucket === "receive" ? "teff" : task.bucket === "dispatch" ? "gold" : "ember"}>
                      {t(BUCKET_LABELS[task.bucket][0], BUCKET_LABELS[task.bucket][1])}
                    </Chip>
                  </td>
                  <td className="px-3 py-3 align-top">
                    <div className="font-mono font-medium">{task.referenceNo}</div>
                    <div className="text-xs text-muted-foreground mt-1">{task.documentType}</div>
                  </td>
                  <td className="px-3 py-3 align-top">
                    <div>{task.subtitle}</div>
                    {task.itemSummary ? (
                      <div className="text-xs text-muted-foreground mt-1 line-clamp-2">{task.itemSummary}</div>
                    ) : null}
                    <div className="text-xs text-muted-foreground mt-1">
                      {task.createdBy} · {task.createdAt.slice(0, 10)}
                    </div>
                  </td>
                  <td className="px-3 py-3 align-top">{task.status}</td>
                  <td className="px-3 py-3 align-top text-right space-x-2">
                    {task.canAct ? (
                      <button
                        type="button"
                        onClick={() => onAction(task)}
                        className="h-9 px-3 rounded-lg bg-ember text-ember-foreground text-xs font-semibold"
                      >
                        {actionLabel(task, t)}
                      </button>
                    ) : null}
                    <button
                      type="button"
                      onClick={() => onOpenTab(task.sourceTab)}
                      className="h-9 px-3 rounded-lg border border-border bg-card text-xs font-medium hover:bg-surface-2"
                    >
                      {t("Open", "ክፈት")}
                    </button>
                  </td>
                </tr>
              ))}
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-3 py-10 text-center text-muted-foreground">
                    <Icons.Inbox className="size-8 mx-auto mb-2 opacity-40" />
                    {t("No pending workflow tasks for this workspace.", "ለዚህ ቦታ በመጠባበቅ ላይ ያሉ ተግባሮች የሉም።")}
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
