import { createFileRoute, Link } from "@tanstack/react-router";
import * as Icons from "lucide-react";
import { useState } from "react";
import { Card, Chip, PageHeader, Stat } from "@/components/ui-kit";
import { RealtimeBadge } from "@/components/realtime-badge";
import { useAuth } from "@/lib/auth-context";
import { formatETB } from "@/lib/ethiopic";
import { useLang } from "@/lib/lang-context";
import {
  getNotificationsForUser,
  type AppNotification,
} from "@/lib/notifications";
import { useStore } from "@/lib/store";
import { summarizeReturnRequestedLines } from "@/lib/orders-ops";
import { useStockManagementModule } from "@/lib/stock-management";

export const Route = createFileRoute("/app/notifications")({ component: NotificationsPage });

const TONE: Record<AppNotification["tone"], "ember" | "gold" | "teff" | "muted"> = {
  ember: "ember",
  gold: "gold",
  teff: "teff",
  muted: "muted",
};

function NotificationsPage() {
  const { user } = useAuth();
  const lang = useLang();
  const t = (en: string, am: string) => (lang === "am" ? am : en);
  const store = useStore();
  const stockModule = useStockManagementModule();
  const [voidDialog, setVoidDialog] = useState<{ orderId: string; orderNo: string; requestedBy: string; reason?: string } | null>(null);
  const [returnDialog, setReturnDialog] = useState<{ orderId: string; orderNo: string; requestedBy: string; reason?: string } | null>(null);
  const [restorePackagedStock, setRestorePackagedStock] = useState(false);
  if (!user) return null;
  const currentUser = user;

  const notifications = getNotificationsForUser(
    currentUser,
    store.orders,
    stockModule.balances,
    stockModule.requests,
    stockModule.transfers,
    store.menuStations,
    store.menuItems,
    lang,
  );
  const newCount = notifications.filter((item) => item.tone === "ember").length;
  const waiterCount = notifications.filter((item) => item.kind === "waiter-update").length;
  const cashierCount = notifications.filter((item) => item.kind === "cashier-request").length;
  const stockCount = notifications.filter((item) => item.kind === "stock-alert").length;
  const stockActionCount = notifications.filter((item) => item.kind === "stock-request" || item.kind === "stock-transfer").length;
  const returnCount = notifications.filter((item) => item.kind === "return-request").length;

  function handleAction(item: AppNotification) {
    if (item.kind === "void-request") {
      const order = store.orders.find((o) => o.id === item.orderId);
      setVoidDialog({ orderId: item.orderId, orderNo: item.orderNo, requestedBy: order?.voidRequestedBy ?? "", reason: item.voidReason });
      return;
    }

    if (item.kind === "return-request") {
      const order = store.orders.find((o) => o.id === item.orderId);
      setRestorePackagedStock(false);
      setReturnDialog({
        orderId: item.orderId,
        orderNo: item.orderNo,
        requestedBy: order?.returnRequestedBy ?? "",
        reason: order?.returnReason,
      });
      return;
    }

    if (item.kind === "cashier-request") {
      store.acceptWaiterOrder(item.orderId, currentUser.name);
    }
  }

  return (
    <div className="space-y-5">
      <PageHeader
        title={t("Notifications", "ማሳወቂያዎች")}
        action={
          <div className="flex flex-wrap items-center gap-2">
            <RealtimeBadge status={store.realtimeStatus} lastSyncAt={store.lastRealtimeSyncAt} />
            <Link
              to={
                currentUser.role === "Waiter"
                  ? "/app/pos"
                  : currentUser.role === "Cashier" || currentUser.role === "Branch Manager"
                    ? "/app/pos"
                    : "/app"
              }
              className="h-10 px-4 rounded-lg bg-ember text-ember-foreground text-sm font-medium inline-flex items-center gap-2"
            >
              <Icons.ExternalLink className="size-4" /> {t("Open work page", "የሥራ ገጽ ክፈት")}
            </Link>
          </div>
        }
      />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat
          label={t("New alerts", "አዲስ ማሳወቂያዎች")}
          value={String(newCount)}

          tone="ember"
          icon="BellRing"
        />
        <Stat
          label={t("Waiter updates", "የአስተናጋጅ ዝማኔዎች")}
          value={String(waiterCount)}

          tone="teff"
          icon="UserCheck"
        />
        <Stat
          label={t("Cashier queue", "የካሸር ወረፋ")}
          value={String(cashierCount)}

          icon="ReceiptText"
        />
        <Stat
          label={t("Low stock alerts", "ዝቅተኛ ክምችት ማሳወቂያዎች")}
          value={String(stockCount)}

          tone="gold"
          icon="Warehouse"
        />
        <Stat
          label={t("Stock actions", "የክምችት እርምጃዎች")}
          value={String(stockActionCount)}

          tone="ember"
          icon="ArrowLeftRight"
        />
        <Stat
          label={t("Return requests", "የመልስ ጥያቄዎች")}
          value={String(returnCount)}
          tone="destructive"
          icon="RotateCcw"
        />
      </div>

      <Card className="!p-0 overflow-hidden">
        <div className="p-4 border-b border-border flex items-center justify-between gap-3">
          <div>
            <h2 className="font-display text-lg font-semibold">{t("Inbox", "ገቢ ማሳወቂያዎች")}</h2>
          </div>
          <Chip tone={notifications.length > 0 ? "ember" : "teff"}>
            {notifications.length} {t("active", "ንቁ")}
          </Chip>
        </div>

        <div className="divide-y divide-border">
          {notifications.map((item) => (
            <NotificationRow
              key={item.id}
              item={item}
              onAction={() => handleAction(item)}
              onReject={
                item.kind === "void-request"
                  ? () => {
                      store.rejectVoidOrder(item.orderId, currentUser.name);
                    }
                  : item.kind === "return-request"
                    ? () => {
                        store.rejectReturnOrder(item.orderId);
                      }
                    : undefined
              }
              t={t}
            />
          ))}

          {notifications.length === 0 && (
            <div className="py-14 px-4 text-center">
              <div className="mx-auto size-12 rounded-xl bg-teff/10 text-teff grid place-items-center mb-3">
                <Icons.CheckCircle2 className="size-6" />
              </div>
              <div className="font-display text-lg font-semibold">
                {t("No notifications", "ማሳወቂያ የለም")}
              </div>
            </div>
          )}
        </div>
      </Card>

      {returnDialog && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-md rounded-xl bg-card border border-border shadow-xl p-5 space-y-4">
            <div className="flex items-start gap-3">
              <div className="size-10 rounded-lg bg-gold/15 text-gold-foreground grid place-items-center shrink-0">
                <Icons.RotateCcw className="size-5" />
              </div>
              <div>
                <h2 className="font-display font-semibold">{t("Approve return", "መልስ አፅድቅ")} — {returnDialog.orderNo}</h2>
              </div>
            </div>
            <div className="rounded-lg bg-surface-2 border border-border p-3 space-y-2 text-sm">
              <div className="flex justify-between gap-3">
                <span className="text-muted-foreground text-xs">{t("Requested by", "የጠየቀ")}</span>
                <span className="font-medium">{returnDialog.requestedBy}</span>
              </div>
              {returnDialog.reason && (
                <div className="flex flex-col gap-1">
                  <span className="text-muted-foreground text-xs">{t("Reason", "ምክንያት")}</span>
                  <span className="rounded-md bg-gold/10 border border-gold/20 px-3 py-2 text-xs leading-relaxed">
                    {returnDialog.reason}
                  </span>
                </div>
              )}
              {(() => {
                const order = store.orders.find((row) => row.id === returnDialog.orderId);
                const summary = order
                  ? summarizeReturnRequestedLines(order.items, order.returnRequestedLines)
                  : undefined;
                if (!summary) return null;
                return (
                  <div className="flex flex-col gap-1">
                    <span className="text-muted-foreground text-xs">{t("Items requested", "የተጠየቁ እቃዎች")}</span>
                    <span className="rounded-md border border-border bg-card px-3 py-2 text-xs leading-relaxed">
                      {summary}
                    </span>
                  </div>
                );
              })()}
            </div>
            <label className="flex items-start gap-2 text-xs text-muted-foreground">
              <input
                type="checkbox"
                className="mt-0.5"
                checked={restorePackagedStock}
                onChange={(e) => setRestorePackagedStock(e.target.checked)}
              />
              <span>
                {t(
                  "Restore packaged stock to department (beer/bottle style returns)",
                  "የታሸገ ክምችት ወደ ክፍል ይመለስ",
                )}
              </span>
            </label>
            <div className="flex gap-2 justify-end">
              <button
                onClick={() => setReturnDialog(null)}
                className="h-9 px-4 rounded-lg border border-border text-sm hover:bg-surface-2 transition-colors"
              >
                {t("Cancel", "ሰርዝ")}
              </button>
              <button
                onClick={() => {
                  store.rejectReturnOrder(returnDialog.orderId);
                  setReturnDialog(null);
                }}
                className="h-9 px-4 rounded-lg border border-destructive text-destructive text-sm font-medium hover:bg-destructive/10 transition-colors inline-flex items-center gap-2"
              >
                <Icons.X className="size-4" /> {t("Reject", "ውድቅ አድርግ")}
              </button>
              <button
                onClick={() => {
                  const order = store.orders.find((row) => row.id === returnDialog.orderId);
                  const result = store.approveReturnOrder(returnDialog.orderId, currentUser.name, {
                    restorePackagedStock,
                    reason: returnDialog.reason,
                    returnLines: order?.returnRequestedLines,
                  });
                  if (!result.ok) return;
                  setReturnDialog(null);
                  setRestorePackagedStock(false);
                }}
                className="h-9 px-4 rounded-lg bg-ember text-ember-foreground text-sm font-medium hover:bg-ember/90 transition-colors inline-flex items-center gap-2"
              >
                <Icons.ShieldCheck className="size-4" /> {t("Confirm return", "መልስ አረጋግጥ")}
              </button>
            </div>
          </div>
        </div>
      )}

      {voidDialog && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-md rounded-xl bg-card border border-border shadow-xl p-5 space-y-4">
            <div className="flex items-start gap-3">
              <div className="size-10 rounded-lg bg-destructive/10 text-destructive grid place-items-center shrink-0">
                <Icons.ShieldAlert className="size-5" />
              </div>
              <div>
                <h2 className="font-display font-semibold">{t("Approve void", "ሰረዛ አፅድቅ")} — {voidDialog.orderNo}</h2>
              </div>
            </div>
            <div className="rounded-lg bg-surface-2 border border-border p-3 space-y-2 text-sm">
              <div className="flex justify-between gap-3">
                <span className="text-muted-foreground text-xs">{t("Requested by", "የጠየቀ")}</span>
                <span className="font-medium">{voidDialog.requestedBy}</span>
              </div>
              {voidDialog.reason && (
                <div className="flex flex-col gap-1">
                  <span className="text-muted-foreground text-xs">{t("Reason", "ምክንያት")}</span>
                  <span className="rounded-md bg-destructive/10 border border-destructive/20 px-3 py-2 text-xs text-destructive leading-relaxed">
                    {voidDialog.reason}
                  </span>
                </div>
              )}
            </div>
            <div className="flex gap-2 justify-end">
              <button
                onClick={() => setVoidDialog(null)}
                className="h-9 px-4 rounded-lg border border-border text-sm hover:bg-surface-2 transition-colors"
              >
                {t("Cancel", "ሰርዝ")}
              </button>
              <button
                onClick={() => { store.rejectVoidOrder(voidDialog.orderId, currentUser.name); setVoidDialog(null); }}
                className="h-9 px-4 rounded-lg border border-destructive text-destructive text-sm font-medium hover:bg-destructive/10 transition-colors inline-flex items-center gap-2"
              >
                <Icons.X className="size-4" /> {t("Reject", "ውድቅ አድርግ")}
              </button>
              <button
                onClick={() => { store.approveVoidOrder(voidDialog.orderId, currentUser.name); setVoidDialog(null); }}
                className="h-9 px-4 rounded-lg bg-destructive text-destructive-foreground text-sm font-medium hover:bg-destructive/90 transition-colors inline-flex items-center gap-2"
              >
                <Icons.ShieldCheck className="size-4" /> {t("Confirm void", "ሰረዛ አርጋግጥ")}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function NotificationRow({
  item,
  onAction,
  onReject,
  t,
}: {
  item: AppNotification;
  onAction: () => void;
  onReject?: () => void;
  t: (en: string, am: string) => string;
}) {
  const Icon =
    item.kind === "cashier-request"
      ? Icons.ReceiptText
      : item.kind === "void-request"
        ? Icons.ShieldAlert
        : item.kind === "return-request"
          ? Icons.RotateCcw
        : item.kind === "stock-alert"
          ? Icons.Warehouse
          : Icons.UserCheck;

  return (
    <div className="p-4 hover:bg-surface-2/60 transition-colors">
      <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-center">
        <div className="flex items-start gap-3 min-w-0">
          <div
            className={`size-10 rounded-lg grid place-items-center shrink-0 ${
              item.tone === "ember"
                ? "bg-ember/10 text-ember"
                : item.tone === "gold"
                  ? "bg-gold/25 text-gold-foreground"
                  : item.tone === "teff"
                    ? "bg-teff/10 text-teff"
                    : "bg-surface-2 text-muted-foreground"
            }`}
          >
            <Icon className="size-5" />
          </div>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="text-base font-semibold leading-tight">{item.title}</h3>
              {item.orderNo ? <Chip tone={TONE[item.tone]}>{item.orderNo}</Chip> : null}
            </div>
            <p
              className={`mt-2 leading-snug ${
                item.kind === "cashier-request"
                  ? "text-base font-semibold text-foreground"
                  : "text-sm text-muted-foreground"
              }`}
            >
              {item.detail}
            </p>
            {item.kind === "cashier-request" && (
              <div className="mt-3 grid gap-2 sm:grid-cols-2">
                {item.waiter ? (
                  <div className="rounded-lg border border-ember/20 bg-ember/5 px-3 py-2">
                    <div className="text-[11px] uppercase tracking-wide text-muted-foreground">
                      {t("Waiter", "አስተናጋጅ")}
                    </div>
                    <div className="mt-1 text-sm font-semibold text-foreground">{item.waiter}</div>
                  </div>
                ) : null}
                {item.area || item.tableNumber ? (
                  <div className="rounded-lg border border-border bg-surface-2/60 px-3 py-2">
                    <div className="text-[11px] uppercase tracking-wide text-muted-foreground">
                      {t("Table / Area", "ጠረጴዛ / ቦታ")}
                    </div>
                    <div className="mt-1 text-sm font-semibold text-foreground">
                      {[item.area, item.tableNumber].filter(Boolean).join(" ")}
                    </div>
                  </div>
                ) : null}
              </div>
            )}
            {item.kind === "void-request" && item.voidReason && (
              <div className="mt-2 rounded-md bg-destructive/10 border border-destructive/20 px-3 py-2 text-xs text-destructive">
                <span className="font-semibold">{t("Reason", "ምክንያት")}:</span> {item.voidReason}
              </div>
            )}
            {item.kind === "return-request" && item.returnReason && (
              <div className="mt-2 rounded-md bg-gold/10 border border-gold/20 px-3 py-2 text-xs">
                <span className="font-semibold">{t("Reason", "ምክንያት")}:</span> {item.returnReason}
              </div>
            )}
            <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
              {item.kind !== "cashier-request" && (item.area || item.tableNumber) ? <span>{item.area} {item.tableNumber}</span> : null}
              {item.waiter && item.kind !== "cashier-request" ? <span>{item.kind === "stock-alert" ? t("Supplier", "አቅራቢ") : t("Waiter", "አስተናጋጅ")}: {item.waiter}</span> : null}
              <span>{t("Time", "ሰዓት")}: {item.time}</span>
              <span className="font-mono">{formatETB(item.total)}</span>
            </div>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2 lg:justify-end">
          {item.kind === "void-request" ? (
            <>
              <button
                onClick={() => onReject?.()}
                className="h-9 px-3 rounded-lg border border-destructive text-destructive text-xs font-semibold inline-flex items-center gap-2 hover:bg-destructive/10 transition-colors"
              >
                <Icons.X className="size-3.5" /> {t("Reject", "ውድቅ አድርግ")}
              </button>
              <button
                onClick={onAction}
                className="h-9 px-3 rounded-lg bg-destructive text-destructive-foreground text-xs font-semibold inline-flex items-center gap-2 hover:bg-destructive/90 transition-colors"
              >
                <Icons.ShieldCheck className="size-3.5" /> {t("Approve void", "ሰረዛ አፅድቅ")}
              </button>
            </>
          ) : item.kind === "return-request" ? (
            <>
              <button
                onClick={() => onReject?.()}
                className="h-9 px-3 rounded-lg border border-destructive text-destructive text-xs font-semibold inline-flex items-center gap-2 hover:bg-destructive/10 transition-colors"
              >
                <Icons.X className="size-3.5" /> {t("Reject", "ውድቅ አድርግ")}
              </button>
              <button
                onClick={onAction}
                className="h-9 px-3 rounded-lg bg-ember text-ember-foreground text-xs font-semibold inline-flex items-center gap-2 hover:bg-ember/90 transition-colors"
              >
                <Icons.ShieldCheck className="size-3.5" /> {t("Approve return", "መልስ አፅድቅ")}
              </button>
            </>
          ) : (
            item.actionLabel && (
              <button
                onClick={onAction}
                className="h-9 px-3 rounded-lg bg-ember text-ember-foreground text-xs font-semibold inline-flex items-center gap-2 hover:bg-ember/90"
              >
                <Icons.Send className="size-3.5" />
                {item.actionLabel}
              </button>
            )
          )}
          <Link
            to={item.href}
            className="h-9 px-3 rounded-lg border border-border bg-card text-xs font-medium inline-flex items-center gap-2 hover:bg-surface-2"
          >
            <Icons.ArrowRight className="size-3.5" /> {t("Open", "ክፈት")}
          </Link>
        </div>
      </div>
    </div>
  );
}
