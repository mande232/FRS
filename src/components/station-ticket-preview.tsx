import { useEffect, useMemo, useState } from "react";
import * as Icons from "lucide-react";
import type { Order } from "@/lib/demo-data";
import { useT } from "@/lib/i18n";
import { useCalendar, useLang } from "@/lib/lang-context";
import { useAuth } from "@/lib/auth-context";
import { collectManualDeliveryTicketViews, printKitchenTickets } from "@/lib/orders-ops";
import { loadPosPrinterSettings } from "@/lib/pos-printer";
import { bonoTicketsToPrint, type BonoPreviewTicket } from "@/lib/station-ticket-print";
import { useStore } from "@/lib/store";
import { showError, showSuccess } from "@/lib/toast";

export type StationTicketPreviewView = {
  orders: Order[];
};

/**
 * Keep an intentional "new lines only" print payload from add-to-bill.
 * Otherwise prefer the live store order for copy counts, but never expand a
 * delta preview into the full historical bill.
 */
function resolvePrintOrders(viewOrders: Order[], liveOrders: Order[]): Order[] {
  return viewOrders.map((order) => {
    const live = liveOrders.find((row) => row.id === order.id);
    if (!live) return order;
    const isPartialNewLines =
      order.stationTickets.length === 0 &&
      order.items.length > 0 &&
      order.items.length < (live.items?.length ?? 0);
    if (isPartialNewLines) {
      return {
        ...live,
        items: order.items,
        stationTickets: [],
        bonoPrintCount: live.bonoPrintCount,
        bonoLastPrintedBy: live.bonoLastPrintedBy,
      };
    }
    return live;
  });
}

function TicketCard({ ticket }: { ticket: BonoPreviewTicket }) {
  const paperWidth = loadPosPrinterSettings().paperWidth === "58mm" ? "58mm" : "80mm";
  return (
    <div className="rounded-lg border border-border bg-white p-2 shadow-inner">
      <pre
        className="mx-auto max-w-full whitespace-pre-wrap text-black leading-[1.35]"
        style={{
          width: paperWidth,
          fontSize: paperWidth === "58mm" ? "11pt" : "12pt",
          fontFamily:
            'ui-monospace, "Courier New", Consolas, "Noto Sans Ethiopic", Nyala, monospace',
        }}
      >
        {ticket.text}
      </pre>
    </div>
  );
}

export function StationTicketPreviewDialog({
  view,
  onClose,
}: {
  view: StationTicketPreviewView;
  onClose: () => void;
}) {
  const t = useT();
  const lang = useLang();
  const calendar = useCalendar();
  const store = useStore();
  const { user } = useAuth();
  const { menuItems } = store;
  const printableOrders = useMemo(
    () => resolvePrintOrders(view.orders, store.orders),
    [view.orders, store.orders],
  );
  const isNewLinesOnly = useMemo(
    () =>
      view.orders.some(
        (order) =>
          order.stationTickets.length === 0 &&
          order.items.length > 0 &&
          store.orders.some(
            (live) => live.id === order.id && order.items.length < live.items.length,
          ),
      ),
    [view.orders, store.orders],
  );
  const reprint =
    !isNewLinesOnly && printableOrders.some((order) => (order.bonoPrintCount ?? 0) > 0);
  const printOptions = useMemo(
    () => ({ menuItems, lang, calendar, reprint }),
    [menuItems, lang, calendar, reprint],
  );
  const tickets = collectManualDeliveryTicketViews(printableOrders, printOptions);
  const paperLabel = loadPosPrinterSettings().paperWidth;
  const orderIds = useMemo(() => view.orders.map((order) => order.id), [view.orders]);

  const ordersExistLocally = useMemo(
    () =>
      orderIds.length > 0 &&
      orderIds.every(
        (id) =>
          store.orders.some((order) => order.id === id) ||
          view.orders.some((order) => order.id === id),
      ),
    [orderIds, store.orders, view.orders],
  );

  const [persistState, setPersistState] = useState<"checking" | "ready" | "failed">(
    ordersExistLocally ? "ready" : "checking",
  );
  const [persistError, setPersistError] = useState<string | null>(null);
  const [syncHint, setSyncHint] = useState(false);
  const [printing, setPrinting] = useState(false);

  useEffect(() => {
    let active = true;
    setPersistError(null);

    if (!ordersExistLocally) {
      setPersistState("checking");
    } else {
      // Bill already created — unlock print immediately while remote sync finishes.
      setPersistState("ready");
      setSyncHint(true);
    }

    void store.ensureOrdersPersisted(orderIds, { waitForRemoteMs: 900 }).then((result) => {
      if (!active) return;
      if (result.ok) {
        setPersistState("ready");
        setPersistError(null);
        setSyncHint(false);
        return;
      }
      // Only block print when the bill itself is missing.
      if (!ordersExistLocally) {
        setPersistState("failed");
        setPersistError(
          result.error ||
            t(
              "Order is not saved yet. Bono cannot print until the bill is created.",
              "ትዕዛዙ ገና አልተቀመጠም። ሂሳቡ እስኪፈጠር ድረስ ቦኖ ማተም አይቻልም።",
            ),
        );
        return;
      }
      setPersistState("ready");
      setSyncHint(false);
    });

    return () => {
      active = false;
    };
  }, [orderIds, ordersExistLocally, store, t]);

  async function handlePrint() {
    if (printing) return;
    setPrinting(true);
    try {
      const persist = await store.ensureOrdersPersisted(orderIds, { waitForRemoteMs: 600 });
      if (!persist.ok && !ordersExistLocally) {
        setPersistState("failed");
        const message =
          persist.error ||
          t(
            "Order is not saved yet. Bono cannot print until the bill is created.",
            "ትዕዛዙ ገና አልተቀመጠም። ሂሳቡ እስኪፈጠር ድረስ ቦኖ ማተም አይቻልም።",
          );
        setPersistError(message);
        showError(message);
        return;
      }
      setPersistState("ready");
      setPersistError(null);
      setSyncHint(false);

      // Print exactly the preview payload — never swap in the full live bill
      // (that re-printed every prior round when adding items).
      const printable = resolvePrintOrders(view.orders, store.orders);
      if (printable.length === 0) {
        showError(
          t(
            "Order is not saved yet. Bono cannot print until the bill is created.",
            "ትዕዛዙ ገና አልተቀመጠም። ሂሳቡ እስኪፈጠር ድረስ ቦኖ ማተም አይቻልም።",
          ),
        );
        return;
      }

      const result = printKitchenTickets(printable, printOptions);
      if (!result.ok) {
        showError(result.error ?? t("Bono could not be printed.", "ቦኖ ማተም አልተቻለም።"));
        return;
      }
      const actor = user?.name?.trim() || "Staff";
      for (const order of printable) {
        if (!store.orders.some((row) => row.id === order.id)) continue;
        const jobs = bonoTicketsToPrint(order, printOptions);
        store.recordBonoPrint(
          order.id,
          actor,
          jobs.map((job) => job.ticketId).filter((id): id is string => Boolean(id)),
        );
      }
      showSuccess(
        result.viaGateway
          ? t(
              "Ticket queued for the cashier printer.",
              "ትኬቱ ለካሸር አታሚ ተሰልፏል።",
            )
          : t(
              `${result.printed} station slip(s) printed — give each to the waitress.`,
              `${result.printed} የጣቢያ ወረቀት ታትሟል — እያንዳንዱን ለአስተናጋጅቱ ይስጡ።`,
            ),
      );
      onClose();
    } finally {
      setPrinting(false);
    }
  }

  const canPrint = tickets.length > 0 && persistState === "ready" && !printing;

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-foreground/40 p-4 backdrop-blur-sm">
      <div className="surface-card max-h-[90vh] w-full max-w-md overflow-y-auto !p-6">
        <div className="mb-4 flex items-center justify-between gap-3">
          <div>
            <h3 className="font-display text-xl font-semibold">
              {t("Station slips", "የጣቢያ ወረቀቶች")}
            </h3>
            <p className="mt-1 text-xs text-muted-foreground">
              {t(
                `Print these ${paperLabel} slips and give them to the waitress for each station.`,
                `እነዚህን ${paperLabel} ወረቀቶች አትመው ለእያንዳንዱ ጣቢያ ለአስተናጋጅቱ ይስጡ።`,
              )}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="grid size-8 place-items-center rounded-lg hover:bg-surface-2"
          >
            <Icons.X className="size-4" />
          </button>
        </div>

        {persistState === "checking" ? (
          <div className="mb-3 rounded-lg border border-border bg-surface-2 px-3 py-2 text-xs text-muted-foreground">
            {t("Creating order…", "ትዕዛዝ በመፍጠር ላይ…")}
          </div>
        ) : null}
        {persistState === "ready" && syncHint ? (
          <div className="mb-3 rounded-lg border border-border bg-surface-2 px-3 py-2 text-xs text-muted-foreground">
            {t("Order created — you can print now.", "ትዕዛዙ ተፈጥሯል — አሁን ማተም ይችላሉ።")}
          </div>
        ) : null}
        {persistState === "failed" && persistError ? (
          <div className="mb-3 rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-xs text-destructive">
            {persistError}
          </div>
        ) : null}

        {tickets.length === 0 ? (
          <div className="rounded-xl border border-border bg-surface-2 px-4 py-8 text-center text-sm text-muted-foreground">
            {t("No station Bono slips for this order.", "ለዚህ ትዕዛዝ የጣቢያ ቦኖ የለም።")}
          </div>
        ) : (
          <div className="space-y-3">
            {tickets.map((ticket, index) => (
              <TicketCard key={`${ticket.orderId}-${ticket.station}-${index}`} ticket={ticket} />
            ))}
          </div>
        )}

        <div className="mt-4 flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => void handlePrint()}
            disabled={!canPrint}
            className="inline-flex h-10 flex-1 items-center justify-center gap-2 rounded-lg bg-ember px-4 text-sm font-semibold text-ember-foreground shadow-[var(--shadow-glow)] disabled:opacity-40"
          >
            <Icons.Printer className="size-4" />
            {printing
              ? t("Printing…", "በማተም ላይ…")
              : persistState === "checking"
                ? t("Creating…", "በመፍጠር ላይ…")
                : reprint
                  ? t("Reprint slips", "ወረቀቶችን እንደገና አትም")
                  : t("Print slips", "ወረቀቶችን አትም")}
          </button>
          {persistState === "failed" ? (
            <button
              type="button"
              onClick={() => {
                setPersistState(ordersExistLocally ? "ready" : "checking");
                setPersistError(null);
                void store.ensureOrdersPersisted(orderIds, { waitForRemoteMs: 900 }).then((result) => {
                  if (result.ok || ordersExistLocally) {
                    setPersistState("ready");
                    return;
                  }
                  setPersistState("failed");
                  setPersistError(result.error || t("Save failed.", "ማስቀመጥ አልተሳካም።"));
                });
              }}
              className="inline-flex h-10 items-center justify-center rounded-lg border border-border px-4 text-sm font-semibold hover:bg-surface-2"
            >
              {t("Retry", "እንደገና")}
            </button>
          ) : null}
          <button
            type="button"
            onClick={onClose}
            className="inline-flex h-10 items-center justify-center rounded-lg border border-border px-4 text-sm font-semibold hover:bg-surface-2"
          >
            {t("Close", "ዝጋ")}
          </button>
        </div>
      </div>
    </div>
  );
}
