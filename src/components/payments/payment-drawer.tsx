import { Link } from "@tanstack/react-router";
import * as Icons from "lucide-react";
import type { Order, PaymentLedgerEntry } from "@/lib/demo-data";
import { formatETB } from "@/lib/ethiopic";
import { useT } from "@/lib/i18n";
import { buildOrderTimeline, displayPaymentStatus } from "@/lib/orders-ops";
import { Chip } from "@/components/ui-kit";

const STATUS_TONE: Record<string, "teff" | "gold" | "destructive" | "muted"> = {
  Settled: "teff",
  Pending: "gold",
  Void: "destructive",
};

export type PaymentDrawerProps = {
  payment: PaymentLedgerEntry | null;
  order?: Order;
  onClose: () => void;
};

export function PaymentDrawer({ payment, order, onClose }: PaymentDrawerProps) {
  const t = useT();
  if (!payment) return null;

  const timeline = order ? buildOrderTimeline(order) : [];
  const receipt = order?.receipt;

  return (
    <div className="fixed inset-0 z-50">
      <button type="button" className="absolute inset-0 bg-foreground/40 backdrop-blur-sm" onClick={onClose} aria-label={t("Close", "Close")} />
      <aside className="absolute inset-y-0 right-0 flex w-full max-w-md flex-col border-l border-border bg-card shadow-xl">
        <div className="flex items-center justify-between border-b border-border px-4 py-3">
          <div>
            <h3 className="font-display text-lg font-semibold">{t("Payment detail", "የክፍያ ዝርዝር")}</h3>
            <p className="font-mono text-xs text-muted-foreground">{payment.receiptNumber ?? payment.ref}</p>
          </div>
          <button type="button" onClick={onClose} className="grid size-8 place-items-center rounded-lg hover:bg-surface-2">
            <Icons.X className="size-4" />
          </button>
        </div>

        <div className="flex-1 space-y-4 overflow-y-auto p-4">
          <section className="rounded-xl border border-border p-3 text-sm">
            <div className="mb-2 font-semibold">{t("General", "አጠቃላይ")}</div>
            <dl className="space-y-2">
              <div className="flex justify-between gap-3">
                <dt className="text-muted-foreground">{t("Method", "ዘዴ")}</dt>
                <dd>{payment.method}</dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt className="text-muted-foreground">{t("Status", "ሁኔታ")}</dt>
                <dd><Chip tone={STATUS_TONE[payment.status] ?? "muted"}>{payment.status}</Chip></dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt className="text-muted-foreground">{t("Table", "ጠረጴዛ")}</dt>
                <dd className="font-mono">{payment.table}</dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt className="text-muted-foreground">{t("Amount", "መጠን")}</dt>
                <dd className="font-mono font-semibold">{formatETB(payment.amount)}</dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt className="text-muted-foreground">{t("Received", "የተቀበለ")}</dt>
                <dd className="font-mono">{formatETB(payment.amountReceived ?? payment.amount)}</dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt className="text-muted-foreground">{t("Change", "ቀሪ")}</dt>
                <dd className="font-mono">{formatETB(payment.changeAmount ?? 0)}</dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt className="text-muted-foreground">{t("Waiter", "አስተናጋጅ")}</dt>
                <dd>{payment.collectedByWaiter ?? "—"}</dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt className="text-muted-foreground">{t("Cashier", "ካሸር")}</dt>
                <dd>{payment.receivedByCashier ?? payment.cashier}</dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt className="text-muted-foreground">{t("Closed by", "የተዘጋ በ")}</dt>
                <dd>{payment.closedByCashier ?? payment.cashier}</dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt className="text-muted-foreground">{t("Time", "ሰዓት")}</dt>
                <dd className="text-xs">{payment.paymentReceivedAt ?? payment.time}</dd>
              </div>
            </dl>
          </section>

          {order && (
            <>
              <section className="rounded-xl border border-border p-3 text-sm">
                <div className="mb-2 flex items-center justify-between gap-2">
                  <div className="font-semibold">{t("Order lines", "የትዕዛዝ መስመሮች")}</div>
                  <Chip tone="muted">{displayPaymentStatus(order)}</Chip>
                </div>
                <ul className="space-y-2">
                  {order.items.map((item) => (
                    <li key={item.id} className="flex justify-between gap-3 text-xs">
                      <span>{item.qty}× {item.name}</span>
                      <span className="font-mono">{formatETB(item.qty * (item.unitPrice ?? 0))}</span>
                    </li>
                  ))}
                </ul>
                <div className="mt-3 flex justify-between border-t border-dashed border-border pt-2 font-semibold">
                  <span>{t("Order total", "የትዕዛዝ ጠቅላላ")}</span>
                  <span className="font-mono">{formatETB(order.total)}</span>
                </div>
              </section>

              {receipt && (
                <section className="rounded-xl border border-border p-3 text-sm">
                  <div className="mb-2 font-semibold">{t("Receipt breakdown", "የደረሰኝ ብልድ")}</div>
                  <dl className="space-y-1.5 text-xs">
                    <div className="flex justify-between"><dt className="text-muted-foreground">{t("Subtotal", "ንዑስ ድምር")}</dt><dd className="font-mono">{formatETB(receipt.subtotal)}</dd></div>
                    <div className="flex justify-between"><dt className="text-muted-foreground">{t("VAT", "VAT")}</dt><dd className="font-mono">{formatETB(receipt.vat)}</dd></div>
                    <div className="flex justify-between"><dt className="text-muted-foreground">{t("Service", "አገልግሎት")}</dt><dd className="font-mono">{formatETB(receipt.serviceCharge)}</dd></div>
                    <div className="flex justify-between border-t border-dashed border-border pt-2 font-semibold"><dt>{t("Grand total", "ጠቅላላ")}</dt><dd className="font-mono">{formatETB(receipt.grandTotal)}</dd></div>
                  </dl>
                </section>
              )}

              <section className="rounded-xl border border-border p-3 text-sm">
                <div className="mb-2 font-semibold">{t("Timeline", "የጊዜ መስመር")}</div>
                <ol className="space-y-2">
                  {timeline.map((event, index) => (
                    <li key={`${event.label}-${index}`} className="flex gap-2 text-xs">
                      <span className="mt-1 size-1.5 shrink-0 rounded-full bg-ember" />
                      <div>
                        <div className="font-medium">{event.label}</div>
                        {event.at ? <div className="text-muted-foreground">{event.at}</div> : null}
                        {event.user ? <div className="text-muted-foreground">{event.user}</div> : null}
                      </div>
                    </li>
                  ))}
                </ol>
              </section>
            </>
          )}
        </div>

        <div className="border-t border-border p-4">
          <div className="flex gap-2">
            {order ? (
              <Link
                to="/app/orders"
                className="inline-flex h-10 flex-1 items-center justify-center gap-2 rounded-lg border border-border bg-card text-sm font-medium hover:bg-surface-2"
              >
                <Icons.ClipboardList className="size-4" />
                {t("Open order", "ትዕዛዝ ክፈት")}
              </Link>
            ) : null}
            <Link
              to="/app/pos"
              className="inline-flex h-10 flex-1 items-center justify-center gap-2 rounded-lg bg-ember text-ember-foreground text-sm font-semibold"
            >
              <Icons.Wallet className="size-4" />
              {t("Go to POS", "ወደ POS")}
            </Link>
          </div>
        </div>
      </aside>
    </div>
  );
}
