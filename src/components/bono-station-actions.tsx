import { useState } from "react";
import * as Icons from "lucide-react";
import { isFinalOrderStatus, type Order } from "@/lib/demo-data";
import { useT } from "@/lib/i18n";
import { orderHasManualDeliveryStations } from "@/lib/orders-ops";
import { useAuth } from "@/lib/auth-context";
import { useStore } from "@/lib/store";
import { showError, showSuccess } from "@/lib/toast";

const VOID_REASONS = [
  "CUSTOMER CANCELLED",
  "WRONG ORDER",
  "WAIT TOO LONG",
  "DO NOT PREPARE",
] as const;

export function BonoStationActions({
  order,
  onPreview,
  compact = false,
}: {
  order: Order;
  onPreview?: () => void;
  compact?: boolean;
}) {
  const t = useT();
  const store = useStore();
  const { user } = useAuth();
  const [voidOpen, setVoidOpen] = useState(false);
  const [voidReason, setVoidReason] = useState("CUSTOMER CANCELLED");
  const canManage =
    user?.role === "Cashier" || user?.role === "Branch Manager" || user?.role === "Administrator";
  /** Waiters print Bono once at create time; open-bill reprint is cashier/manager only. */
  const canPrint = canManage;
  const canVoid =
    canManage &&
    !isFinalOrderStatus(order.status) &&
    order.status !== "PENDING_CASHIER" &&
    !order.voidRequestedBy &&
    orderHasManualDeliveryStations(order);
  if ((!onPreview || !canPrint) && !canVoid && !order.voidRequestedBy) return null;

  const btn = compact
    ? "inline-flex h-8 items-center gap-1.5 rounded-md border border-border bg-card px-2.5 text-xs font-semibold hover:bg-surface-2"
    : "inline-flex min-h-10 items-center justify-center gap-2 rounded-lg border border-border px-3 text-sm font-semibold hover:bg-surface-2";

  function submitVoid() {
    const reason = voidReason.trim() || "CUSTOMER CANCELLED";
    const result = store.voidBonoStationTickets(order.id, user?.name ?? "Staff", reason);
    if (!result.ok) {
      showError(result.error ?? t("Could not void Bono tickets", "የቦኖ ትኬቶችን መሰረዝ አልተቻለም"));
      return;
    }
    showSuccess(t("Bono voided. VOID ticket printed.", "ቦኖ ተሰርዟል። የሰረዛ ቲኬት ታትሟል።"));
    setVoidOpen(false);
  }

  return (
    <>
      <div className={`flex flex-wrap gap-1.5 ${compact ? "" : "w-full"}`}>
        {onPreview && canPrint ? (
          <button type="button" onClick={onPreview} className={btn}>
            <Icons.Ticket className="size-3.5" />
            {t("Print bono", "ቦኖ አትም")}
            {order.bonoPrintCount && order.bonoPrintCount > 0
              ? ` · #${order.bonoPrintCount + 1}`
              : ""}
          </button>
        ) : null}
        {canVoid ? (
          <button
            type="button"
            onClick={() => {
              setVoidReason("CUSTOMER CANCELLED");
              setVoidOpen(true);
            }}
            className={`${btn} border-destructive/30 text-destructive hover:bg-destructive/10`}
          >
            <Icons.Ban className="size-3.5" />
            {t("Void", "ሰርዝ")}
          </button>
        ) : null}
        {order.voidRequestedBy && !isFinalOrderStatus(order.status) ? (
          <span className={`${btn} border-destructive/30 bg-destructive/10 text-destructive`}>
            {t("Void pending", "ሰረዛ እየጠበቀ")}
          </span>
        ) : null}
      </div>

      {voidOpen ? (
        <div className="fixed inset-0 z-50 grid place-items-center bg-foreground/40 p-4 backdrop-blur-sm">
          <div className="surface-card w-full max-w-md space-y-4 !p-6">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h3 className="font-display text-xl font-semibold">
                  {t("Void printed Bono", "የታተመ ቦኖ ሰርዝ")}
                </h3>
                <p className="mt-1 text-xs text-muted-foreground">
                  {order.orderNo} ·{" "}
                  {t(
                    "Stops this paper order. The waitress should not collect these items.",
                    "ይህን የወረቀት ትዕዛዝ ያቆማል። አስተናጋጅቱ እነዚህን እቃዎች መውሰድ የለባትም።",
                  )}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setVoidOpen(false)}
                className="grid size-8 place-items-center rounded-lg hover:bg-surface-2"
                aria-label={t("Close", "ዝጋ")}
              >
                <Icons.X className="size-4" />
              </button>
            </div>

            <div className="flex flex-wrap gap-1.5">
              {VOID_REASONS.map((reason) => (
                <button
                  key={reason}
                  type="button"
                  onClick={() => setVoidReason(reason)}
                  className={`h-9 rounded-lg border px-3 text-xs font-bold uppercase ${
                    voidReason.toUpperCase() === reason
                      ? "border-foreground bg-foreground text-background"
                      : "border-border bg-card hover:bg-surface-2"
                  }`}
                >
                  {reason}
                </button>
              ))}
            </div>

            <input
              value={voidReason}
              onChange={(event) => setVoidReason(event.target.value)}
              placeholder={t("Void reason", "የሰረዛ ምክንያት")}
              className="h-10 w-full rounded-lg border border-border bg-card px-3 text-sm uppercase"
            />

            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setVoidOpen(false)}
                className="h-10 rounded-lg border border-border px-4 text-sm font-semibold hover:bg-surface-2"
              >
                {t("Cancel", "ሰርዝ")}
              </button>
              <button
                type="button"
                onClick={submitVoid}
                disabled={!voidReason.trim()}
                className="ml-auto h-10 rounded-lg bg-destructive px-4 text-sm font-semibold text-destructive-foreground disabled:opacity-40"
              >
                {t("Print VOID & stop", "VOID አትም እና አቁም")}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
