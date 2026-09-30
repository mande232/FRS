import { useCallback, useEffect, useMemo, useState } from "react";
import * as Icons from "lucide-react";
import { Link } from "@tanstack/react-router";
import { useAuth } from "@/lib/auth-context";
import { useT } from "@/lib/i18n";
import {
  loadPrintGatewaySnapshot,
  subscribePrintJobs,
  type PrintGatewaySnapshot,
} from "@/lib/print-gateway";
import {
  isPrintGatewayMode,
  listPrintJobs,
  retryFailedPrintJob,
  type PrintJob,
  type PrintJobStatus,
} from "@/lib/print-jobs";
import { loadPosPrinterSettings } from "@/lib/pos-printer";
import { isSupabaseConfigured } from "@/lib/supabase/client";
import { showError, showSuccess } from "@/lib/toast";

const OPERATOR_ROLES = new Set([
  "Administrator",
  "Branch Manager",
  "Supervisor",
  "Cashier",
]);

type JobsView = "status" | "queue" | "failed";

const QUEUE_STATUSES: PrintJobStatus[] = ["QUEUED", "CLAIMED", "PRINTING"];

function formatTime(value?: string) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
}

function jobTitle(job: PrintJob) {
  const order = job.payload.orderNo ?? job.orderId ?? job.id;
  const station = job.payload.station?.trim();
  return station ? `${order} · ${station}` : order;
}

function jobKindLabel(job: PrintJob, t: (en: string, am: string) => string) {
  if (job.jobType === "STATION_BONO") return t("Bono", "ቦኖ");
  if (job.jobType === "CUSTOMER_RECEIPT") return t("Receipt", "ደረሰኝ");
  if (job.jobType === "REPRINT") return t("Reprint", "እንደገና ህትመት");
  return t("Test", "ሙከራ");
}

function PrintJobPreview({
  job,
  onClose,
}: {
  job: PrintJob;
  onClose: () => void;
}) {
  const t = useT();
  const paperWidth = job.payload.paperWidth ?? loadPosPrinterSettings().paperWidth ?? "80mm";
  const text = job.payload.text?.trim() || t("No print content stored for this job.", "ለዚህ ስራ የህትመት ይዘት አልተቀመጠም።");

  return (
    <div className="fixed inset-0 z-[60] grid place-items-center bg-foreground/50 p-4 backdrop-blur-sm">
      <div className="surface-card max-h-[90vh] w-full max-w-md overflow-hidden !p-0">
        <div className="flex items-start justify-between gap-3 border-b border-border p-4">
          <div className="min-w-0">
            <h3 className="font-display text-lg font-semibold">{t("Print preview", "የህትመት ቅድመ እይታ")}</h3>
            <p className="mt-0.5 truncate text-xs text-muted-foreground">
              {jobTitle(job)} · {jobKindLabel(job, t)}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="grid size-8 place-items-center rounded-lg hover:bg-surface-2"
            aria-label={t("Close", "ዝጋ")}
          >
            <Icons.X className="size-4" />
          </button>
        </div>
        <div className="max-h-[70vh] overflow-y-auto bg-surface-2/40 p-4">
          <div className="rounded-lg border border-border bg-white p-3 shadow-inner">
            <pre
              className="mx-auto max-w-full whitespace-pre-wrap text-black leading-[1.35]"
              style={{
                width: paperWidth === "58mm" ? "58mm" : "80mm",
                fontSize: paperWidth === "58mm" ? "11pt" : "12pt",
                fontFamily:
                  'ui-monospace, "Courier New", Consolas, "Noto Sans Ethiopic", Nyala, monospace',
              }}
            >
              {text}
            </pre>
          </div>
        </div>
        <div className="flex justify-end border-t border-border p-3">
          <button
            type="button"
            onClick={onClose}
            className="h-9 rounded-lg border border-border px-4 text-sm font-semibold hover:bg-surface-2"
          >
            {t("Close", "ዝጋ")}
          </button>
        </div>
      </div>
    </div>
  );
}

export function PrintGatewayBadge() {
  const t = useT();
  const { user } = useAuth();
  const [snapshot, setSnapshot] = useState<PrintGatewaySnapshot | null>(null);
  const [open, setOpen] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [view, setView] = useState<JobsView>("status");
  const [viewJobs, setViewJobs] = useState<PrintJob[] | null>(null);
  const [previewJob, setPreviewJob] = useState<PrintJob | null>(null);
  const [loadingView, setLoadingView] = useState(false);

  const canSee =
    Boolean(user && OPERATOR_ROLES.has(user.role)) &&
    isSupabaseConfigured &&
    isPrintGatewayMode();

  const refresh = useCallback(async () => {
    if (!canSee) return;
    try {
      const next = await loadPrintGatewaySnapshot();
      setSnapshot(next);
      return next;
    } catch {
      // Keep last good snapshot; agent may be offline.
      return null;
    }
  }, [canSee]);

  const loadViewJobs = useCallback(
    async (nextView: JobsView, gatewayId?: string) => {
      const id = gatewayId ?? snapshot?.gateway?.id;
      if (!id) {
        setViewJobs([]);
        return;
      }
      if (nextView === "status") {
        setViewJobs(null);
        return;
      }
      setLoadingView(true);
      try {
        const status = nextView === "queue" ? QUEUE_STATUSES : ("FAILED" as PrintJobStatus);
        const jobs = await listPrintJobs({ gatewayId: id, status, limit: 50 });
        setViewJobs(jobs);
      } catch (error) {
        showError(error instanceof Error ? error.message : t("Could not load jobs.", "ስራዎችን መጫን አልተቻለም።"));
        setViewJobs([]);
      } finally {
        setLoadingView(false);
      }
    },
    [snapshot?.gateway?.id, t],
  );

  useEffect(() => {
    if (!canSee) return;
    void refresh();
    const timer = window.setInterval(() => {
      if (document.visibilityState === "hidden") return;
      void refresh();
    }, 60_000);
    return () => window.clearInterval(timer);
  }, [canSee, refresh]);

  useEffect(() => {
    if (!canSee || !snapshot?.gateway?.id) return;
    let timer: number | null = null;
    const unsubscribe = subscribePrintJobs(snapshot.gateway.id, () => {
      if (timer) window.clearTimeout(timer);
      timer = window.setTimeout(() => {
        timer = null;
        void refresh().then((next) => {
          if (view !== "status") void loadViewJobs(view, next?.gateway?.id ?? snapshot.gateway?.id);
        });
      }, 2_500);
    });
    return () => {
      if (timer) window.clearTimeout(timer);
      unsubscribe?.();
    };
  }, [canSee, loadViewJobs, refresh, snapshot?.gateway?.id, view]);

  const online = snapshot?.online ?? false;
  const waiting = snapshot?.waiting ?? 0;
  const failed = snapshot?.failed ?? 0;
  const queued = snapshot?.queued ?? 0;

  const displayedJobs = useMemo(() => {
    if (view === "status") return snapshot?.recentJobs ?? [];
    return viewJobs ?? [];
  }, [snapshot?.recentJobs, view, viewJobs]);

  if (!canSee) return null;

  async function selectView(next: JobsView) {
    setView(next);
    if (next === "status") {
      setViewJobs(null);
      await refresh();
      return;
    }
    await loadViewJobs(next);
  }

  async function retryJob(job: PrintJob) {
    if (job.status !== "FAILED") {
      showError(t("Only failed print jobs can be sent to the printer.", "ወደ አታሚ መላክ የሚቻለው ያልተሳኩ ስራዎች ብቻ ናቸው።"));
      return;
    }
    setBusyId(job.id);
    try {
      await retryFailedPrintJob(job.id);
      showSuccess(t("Print job re-queued.", "የህትመት ስራ እንደገና ተሰልፏል።"));
      await refresh();
      if (view !== "status") await loadViewJobs(view);
    } catch (error) {
      showError(error instanceof Error ? error.message : t("Retry failed.", "እንደገና መሞከር አልተሳካም።"));
    } finally {
      setBusyId(null);
    }
  }

  const cardBase =
    "rounded-lg border p-2 text-center transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40";
  const cardIdle = "border-border bg-card hover:bg-surface-2";
  const cardActive = "border-ember/40 bg-ember/10 ring-1 ring-ember/20";

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={`inline-flex h-9 items-center gap-1.5 rounded-lg border px-2.5 text-xs font-medium ${
          online
            ? "border-border bg-card text-foreground"
            : "border-destructive/40 bg-destructive/10 text-destructive"
        }`}
        title={t("Printer gateway status", "የአታሚ ጌትዌይ ሁኔታ")}
      >
        <span className={`size-2 rounded-full ${online ? "bg-teff" : "bg-destructive"}`} />
        <Icons.Printer className="size-3.5" />
        <span className="hidden sm:inline">{online ? t("Online", "መስመር ላይ") : t("Offline", "ከመስመር ውጭ")}</span>
        {waiting > 0 && (
          <span className="rounded-md bg-foreground/10 px-1.5 py-0.5 font-mono">{waiting}</span>
        )}
      </button>

      {open && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-foreground/40 p-4 backdrop-blur-sm">
          <div className="surface-card flex max-h-[85vh] w-full max-w-lg flex-col overflow-hidden !p-0">
            <div className="flex items-start justify-between gap-3 border-b border-border p-4">
              <div>
                <h3 className="font-display text-lg font-semibold">{t("Print gateway", "የህትመት ጌትዌይ")}</h3>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  {snapshot?.gateway?.name ?? t("Cashier Laptop", "የካሸር ላፕቶፕ")} ·{" "}
                  {snapshot?.gateway?.code ?? "CASHIER-LAPTOP-01"}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="grid size-8 place-items-center rounded-lg hover:bg-surface-2"
              >
                <Icons.X className="size-4" />
              </button>
            </div>

            <div className="space-y-3 border-b border-border p-4">
              <div className="grid grid-cols-3 gap-2">
                <button
                  type="button"
                  onClick={() => void selectView("status")}
                  className={`${cardBase} ${view === "status" ? cardActive : cardIdle}`}
                >
                  <div className="text-[11px] text-muted-foreground">{t("Status", "ሁኔታ")}</div>
                  <div className={`text-sm font-semibold ${online ? "text-teff" : "text-destructive"}`}>
                    {online ? t("Online", "መስመር ላይ") : t("Offline", "ከመስመር ውጭ")}
                  </div>
                </button>
                <button
                  type="button"
                  onClick={() => void selectView("queue")}
                  className={`${cardBase} ${view === "queue" ? cardActive : cardIdle}`}
                >
                  <div className="text-[11px] text-muted-foreground">{t("Queue", "ወረፋ")}</div>
                  <div className="font-mono text-sm font-semibold">{queued}</div>
                </button>
                <button
                  type="button"
                  onClick={() => void selectView("failed")}
                  className={`${cardBase} ${view === "failed" ? cardActive : cardIdle}`}
                >
                  <div className="text-[11px] text-muted-foreground">{t("Failed", "ያልተሳካ")}</div>
                  <div className={`font-mono text-sm font-semibold ${failed ? "text-destructive" : ""}`}>
                    {failed}
                  </div>
                </button>
              </div>
              <div className="text-xs text-muted-foreground">
                {t("Last print", "የመጨረሻ ህትመት")}: {formatTime(snapshot?.lastPrintedAt)}
              </div>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => {
                    void refresh().then(() => {
                      if (view !== "status") void loadViewJobs(view);
                    });
                  }}
                  className="h-9 rounded-lg border border-border bg-card px-3 text-sm"
                >
                  {t("Refresh", "አድስ")}
                </button>
                <Link
                  to="/app/printer-settings"
                  className="inline-flex h-9 items-center rounded-lg border border-border bg-card px-3 text-sm"
                  onClick={() => setOpen(false)}
                >
                  {t("Printer settings", "የአታሚ ቅንብሮች")}
                </Link>
              </div>
              {!online && (
                <p className="text-xs text-destructive">
                  {t(
                    "Start the print agent on the cashier laptop and confirm the XPrinter is connected in Windows.",
                    "በካሸር ላፕቶፕ ላይ የህትመት ኤጀንትን ያስጀምሩ እና XPrinter በWindows እንደተገናኘ ያረጋግጡ።",
                  )}
                </p>
              )}
            </div>

            <div className="flex-1 space-y-2 overflow-y-auto p-4">
              <div className="mb-1 text-xs font-medium text-muted-foreground">
                {view === "queue"
                  ? t("Queued jobs", "በወረፋ ላይ ያሉ ስራዎች")
                  : view === "failed"
                    ? t("Failed jobs — retry to print", "ያልተሳኩ ስራዎች — ለማተም እንደገና ይሞክሩ")
                    : t("Recent jobs", "የቅርብ ጊዜ ስራዎች")}
              </div>
              {view === "status" || view === "queue" ? (
                <p className="mb-2 text-[11px] text-muted-foreground">
                  {t(
                    "Manual print from this panel is only available for failed jobs.",
                    "ከዚህ ፓነል በእጅ ማተም የሚቻለው ያልተሳኩ ስራዎች ብቻ ናቸው።",
                  )}
                </p>
              ) : null}
              {loadingView && (
                <div className="py-6 text-center text-sm text-muted-foreground">
                  {t("Loading…", "በመጫን ላይ…")}
                </div>
              )}
              {!loadingView && displayedJobs.length === 0 && (
                <div className="py-6 text-center text-sm text-muted-foreground">
                  {view === "queue"
                    ? t("Queue is empty.", "ወረፋው ባዶ ነው።")
                    : view === "failed"
                      ? t("No failed jobs.", "ያልተሳኩ ስራዎች የሉም።")
                      : t("No print jobs yet.", "እስካሁን የህትመት ስራ የለም።")}
                </div>
              )}
              {!loadingView &&
                displayedJobs.map((job) => (
                  <div key={job.id} className="space-y-1.5 rounded-lg border border-border p-3 text-sm">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <div className="truncate font-medium">{jobTitle(job)}</div>
                        <div className="truncate font-mono text-[11px] text-muted-foreground">{job.id}</div>
                        <div className="text-[11px] text-muted-foreground">{jobKindLabel(job, t)}</div>
                      </div>
                      <span
                        className={`shrink-0 text-[11px] font-semibold ${
                          job.status === "PRINTED"
                            ? "text-teff"
                            : job.status === "FAILED"
                              ? "text-destructive"
                              : "text-muted-foreground"
                        }`}
                      >
                        {job.status}
                      </span>
                    </div>
                    {job.errorMessage && (
                      <div className="text-xs text-destructive">{job.errorMessage}</div>
                    )}
                    <div className="flex flex-wrap gap-1.5 pt-1">
                      {job.payload.text?.trim() ? (
                        <button
                          type="button"
                          onClick={() => setPreviewJob(job)}
                          className="inline-flex h-8 items-center gap-1 rounded-md border border-border px-2 text-xs hover:bg-surface-2"
                        >
                          <Icons.Eye className="size-3.5" />
                          {t("Preview", "ቅድመ እይታ")}
                        </button>
                      ) : null}
                      {job.status === "FAILED" ? (
                        <button
                          type="button"
                          disabled={busyId === job.id}
                          onClick={() => void retryJob(job)}
                          className="inline-flex h-8 items-center gap-1 rounded-md bg-ember px-2 text-xs font-semibold text-ember-foreground disabled:opacity-50"
                        >
                          <Icons.Printer className="size-3.5" />
                          {t("Print failed job", "ያልተሳካውን አትም")}
                        </button>
                      ) : null}
                    </div>
                  </div>
                ))}
            </div>
          </div>
        </div>
      )}

      {previewJob ? <PrintJobPreview job={previewJob} onClose={() => setPreviewJob(null)} /> : null}
    </>
  );
}
