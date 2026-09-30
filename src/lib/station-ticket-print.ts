import type { Order, OrderLine } from "./demo-data.ts";
import { formatDate } from "./date-time.ts";
import { menuItemAmharicName } from "./menu-i18n.ts";
import { enqueueStationBonoJobs } from "./print-jobs.ts";
import { loadPosPrinterSettings, printPosText, resolvedPrinterMode } from "./pos-printer.ts";
import {
  bonoLabel,
  resolveBonoLang,
  translateBonoPreference,
  translateBonoUnit,
  type BonoLang,
} from "./station-ticket-i18n.ts";
import { loadSystemSettings } from "./system-settings.ts";
import { showError, showSuccess } from "./toast.ts";

export type StationTicketPrintKind = "ticket" | "return" | "void";

/** Only the fields the bono needs, so callers can pass the store's menu without a wider import. */
export type BonoMenuName = { id: string; name_en: string; name_am?: string };

export type StationTicketPrintOptions = {
  kind?: StationTicketPrintKind;
  reason?: string;
  station?: string;
  printedAt?: Date;
  /** Defaults to the saved UI language. */
  lang?: BonoLang;
  /** Source for Amharic dish names; without it items print under their stored name. */
  menuItems?: readonly BonoMenuName[];
  /** 1-based Bono copy number shown on the slip (BONO #1 / REPRINT #2). */
  printCopy?: number;
  /** Prefer the app calendar toggle when set; otherwise system calendar settings. */
  calendar?: "gregorian" | "ethiopian";
  /** Cashier reprint: include already-printed / preparing slips. */
  reprint?: boolean;
};

const RULE = "----------------------------";
/** Marks modifier lines as children of the item above; ASCII keeps text mode fast. */
export const PREFERENCE_BULLET = ">";

export const BUTCHER_PREFERENCES = [
  "NO FAT",
  "SMALL CUT",
  "MEDIUM CUT",
  "LARGE CUT",
  "REMOVE BONE",
] as const;

export const KITCHEN_PREFERENCES = [
  "NO SALT",
  "NO ONION",
  "NO SPICE",
  "EXTRA SPICY",
  "WELL DONE",
  "MEDIUM",
  "RARE",
  "EXTRA SAUCE",
  "NO SAUCE",
  "NO OIL",
  "LESS OIL",
] as const;

const BUTCHER_SET = new Set<string>(BUTCHER_PREFERENCES);
const KITCHEN_SET = new Set<string>(KITCHEN_PREFERENCES);

export function isButcherStation(station: string) {
  const key = station.toLowerCase();
  return key.includes("butcher") || key.includes("meat") || key.includes("grill");
}

export function isKitchenStation(station: string) {
  return station.toLowerCase().includes("kitchen");
}

function isBonoStation(station: string) {
  return Boolean(station.trim());
}

export function bonoStationLabel(station: string, lang: BonoLang = "en") {
  const raw = station.trim();
  if (lang === "am") {
    const key = raw.toLowerCase();
    if (isButcherStation(raw)) return bonoLabel("butcher", lang);
    if (isKitchenStation(raw)) return bonoLabel("kitchen", lang);
    if (key.includes("coffee")) return "ቡና ቤት";
    if (key.includes("vip")) return "ቪአይፒ ባር";
    if (key.includes("bar")) return "ዋና ባር";
  }
  if (isButcherStation(raw)) return bonoLabel("butcher", lang);
  if (isKitchenStation(raw)) return bonoLabel("kitchen", lang);
  return raw.toUpperCase() || bonoLabel("station", lang);
}

export function preferencesForStation(station: string): readonly string[] {
  if (isButcherStation(station)) return BUTCHER_PREFERENCES;
  if (isKitchenStation(station)) return KITCHEN_PREFERENCES;
  return [];
}

export function normalizePreference(value: string) {
  return value.trim().replace(/\s+/g, " ").toUpperCase();
}

export function filterPreferencesForStation(preferences: readonly string[] | undefined, station: string) {
  const values = (preferences ?? []).map(normalizePreference).filter(Boolean);
  if (values.length === 0) return [];
  if (isButcherStation(station)) {
    return values.filter((value) => BUTCHER_SET.has(value) || !KITCHEN_SET.has(value));
  }
  if (isKitchenStation(station)) {
    return values.filter((value) => KITCHEN_SET.has(value) || !BUTCHER_SET.has(value));
  }
  return values;
}

function isWeightUnit(unitLabel?: string) {
  const key = (unitLabel ?? "").trim().toLowerCase();
  return key === "kg" || key === "kilo" || key === "kilogram" || key === "g" || key === "gram";
}

function formatClock(date: Date) {
  return date.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" });
}

function centerOnRule(value: string) {
  const text = value.trim();
  if (!text) return text;
  const pad = Math.max(0, Math.floor((RULE.length - text.length) / 2));
  return `${" ".repeat(pad)}${text}`;
}

function bonoDateLabel(printedAt: Date, options: StationTicketPrintOptions, lang: BonoLang) {
  const prefs = loadSystemSettings().calendar;
  const calendarSystem =
    options.calendar === "ethiopian" || options.calendar === "gregorian"
      ? options.calendar
      : prefs.calendarSystem;
  return formatDate(printedAt, { ...prefs, calendarSystem }, lang);
}

function tableLabel(order: Pick<Order, "tableNumber">, lang: BonoLang = "en") {
  const raw = order.tableNumber.trim() || "—";
  const table = raw.toUpperCase();
  const bare = table.startsWith("TABLE") ? table.slice(5).trim() : table;
  return `${bonoLabel("table", lang)}: ${bare}`.trim();
}

/** Table on the left, clock pushed to the right edge of the rule. */
function metaRow(left: string, right: string) {
  const gap = RULE.length - left.length - right.length;
  return `${left}${" ".repeat(Math.max(1, gap))}${right}`;
}

function headerTitle(station: string, kind: StationTicketPrintKind, lang: BonoLang = "en") {
  const label = bonoStationLabel(station, lang);
  if (kind === "return") return `${bonoLabel("return", lang)} - ${label}`;
  if (kind === "void") return bonoLabel("void", lang);
  return label;
}

function itemName(item: OrderLine, lang: BonoLang = "en", menuItems: readonly BonoMenuName[] = []) {
  if (lang === "am") {
    const key = item.name.trim().toLowerCase();
    const match =
      menuItems.find((menu) => item.menuItemId && menu.id === item.menuItemId) ??
      menuItems.find((menu) => menu.name_en.trim().toLowerCase() === key);
    const amharic = menuItemAmharicName({
      id: match?.id ?? item.menuItemId,
      name_en: match?.name_en ?? item.name,
      name: item.name,
      name_am: match?.name_am,
    });
    if (amharic) return amharic;
  }
  return item.name.trim().toUpperCase();
}

function itemCountLabel(item: OrderLine, lang: BonoLang = "en") {
  if (isWeightUnit(item.unitLabel)) return "1x";
  const qty = Number.isInteger(item.qty) ? String(item.qty) : item.qty.toLocaleString(undefined, { maximumFractionDigits: 3 });
  const unit = item.unitLabel?.trim();
  if (unit) {
    return `${qty} ${translateBonoUnit(unit.toUpperCase(), lang)}`;
  }
  return `${qty}x`;
}

function weightLabel(item: OrderLine, lang: BonoLang = "en") {
  if (!isWeightUnit(item.unitLabel)) return null;
  const qty = Number.isInteger(item.qty) ? String(item.qty) : item.qty.toLocaleString(undefined, { maximumFractionDigits: 3 });
  const unit = (item.unitLabel ?? "KG").toUpperCase();
  return `${qty} ${translateBonoUnit(unit, lang)}`;
}

export function linePreferencesForPrint(
  item: OrderLine,
  station: string,
  options: StationTicketPrintOptions = {},
) {
  const prefs = filterPreferencesForStation(item.preferences, station);
  const note = item.note?.trim();
  const extra =
    options.kind === "return" && options.reason?.trim()
      ? options.reason.split(/[,\n]/).map(normalizePreference).filter(Boolean)
      : [];
  const values = [...prefs, ...(note ? [normalizePreference(note)] : []), ...extra];
  const lang = resolveBonoLang(options.lang);
  return [...new Set(values)].map((value) => translateBonoPreference(value, lang));
}

export function bonoTicketsToPrint(
  order: Order,
  options: StationTicketPrintOptions = {},
): Array<{ station: string; items: OrderLine[]; ticketId?: string }> {
  const kind = options.kind ?? "ticket";
  const requested = options.station?.trim().toLowerCase();

  const fromTickets = order.stationTickets.filter((ticket) => {
    if (!isBonoStation(ticket.station)) return false;
    if (requested && ticket.station.toLowerCase() !== requested) return false;
    if (kind === "return" || kind === "void") {
      return ticket.status !== "CANCELLED";
    }
    if (ticket.status === "CANCELLED" || ticket.status === "UNAVAILABLE") {
      return false;
    }
    if (kind === "ticket") {
      if (options.reprint) {
        // Active station work only — do not re-print finished READY rounds.
        return ticket.status === "NEW" || ticket.status === "PREPARING";
      }
      // First print / add-on: only fresh unprinted NEW slips.
      return ticket.status === "NEW" && !ticket.bonoPrinted;
    }
    return true;
  });

  if (fromTickets.length > 0) {
    return mergeTicketsByStation(
      fromTickets.map((ticket) => ({
        station: ticket.station,
        items: [...ticket.items],
        ticketId: ticket.id,
      })),
    );
  }

  // Tickets exist but none qualify (already printed / finished) — do not
  // dump prior rounds back onto paper.
  if (order.stationTickets.length > 0) {
    return [];
  }

  // Items-only payload (add-on / new-lines preview with stationTickets cleared).
  const byStation = new Map<string, OrderLine[]>();
  for (const item of order.items) {
    const station = item.station || "Kitchen";
    if (!isBonoStation(station)) continue;
    if (requested && station.toLowerCase() !== requested) continue;
    const rows = byStation.get(station) ?? [];
    rows.push(item);
    byStation.set(station, rows);
  }
  return [...byStation.entries()].map(([station, items]) => ({ station, items }));
}

function mergeTicketsByStation(
  tickets: Array<{ station: string; items: OrderLine[]; ticketId?: string }>,
) {
  const byStation = new Map<string, { station: string; items: OrderLine[]; ticketId?: string }>();
  for (const ticket of tickets) {
    const key = ticket.station.trim().toLowerCase();
    const existing = byStation.get(key);
    if (!existing) {
      byStation.set(key, {
        station: ticket.station,
        items: [...ticket.items],
        ticketId: ticket.ticketId,
      });
      continue;
    }
    existing.items.push(...ticket.items);
    if (ticket.ticketId) existing.ticketId = ticket.ticketId;
  }
  return [...byStation.values()];
}

function copyLabel(order: Order, options: StationTicketPrintOptions, lang: BonoLang) {
  const copy =
    options.printCopy ??
    (typeof order.bonoPrintCount === "number" && order.bonoPrintCount > 0
      ? order.bonoPrintCount
      : 1);
  if (copy <= 1) return `${bonoLabel("bono", lang)} #${copy}`;
  return `${bonoLabel("reprint", lang)} #${copy}`;
}

export function buildStationBonoText(
  order: Order,
  station: string,
  items: OrderLine[],
  options: StationTicketPrintOptions = {},
) {
  const kind = options.kind ?? "ticket";
  const lang = resolveBonoLang(options.lang);
  const printedAt = options.printedAt ?? new Date();
  const title = headerTitle(station, kind, lang);
  const dateLabel = bonoDateLabel(printedAt, options, lang);
  const waiter = (order.waiter || order.orderedByWaiter || "").trim();
  const lines = [
    RULE,
    centerOnRule(title),
    centerOnRule(dateLabel),
    RULE,
    metaRow(tableLabel(order, lang), formatClock(printedAt)),
  ];
  if (waiter) lines.push(`${bonoLabel("waiter", lang)}: ${waiter.toUpperCase()}`);
  if (kind === "ticket") lines.push(copyLabel(order, options, lang));
  lines.push("");

  if (items.length === 0) {
    lines.push(bonoLabel("noItems", lang));
  } else {
    items.forEach((item, index) => {
      lines.push(`${index + 1}. ${itemCountLabel(item, lang)} ${itemName(item, lang, options.menuItems)}`);
      const weight = weightLabel(item, lang);
      if (weight) lines.push(`   ${weight}`);
      for (const pref of linePreferencesForPrint(item, station, options)) {
        lines.push(`   ${PREFERENCE_BULLET} ${pref}`);
      }
      lines.push("");
    });
    if (lines[lines.length - 1] === "") lines.pop();
  }

  if (kind === "void") {
    lines.push("");
    lines.push(
      options.reason?.trim()
        ? translateBonoPreference(normalizePreference(options.reason), lang)
        : bonoLabel("customerCancelled", lang),
    );
    lines.push(bonoLabel("doNotPrepare", lang));
  }

  lines.push(RULE);
  return lines.join("\n");
}

export function buildStationBonoHtml(
  order: Order,
  station: string,
  items: OrderLine[],
  options: StationTicketPrintOptions = {},
) {
  const kind = options.kind ?? "ticket";
  const lang = resolveBonoLang(options.lang);
  const printedAt = options.printedAt ?? new Date();
  const title = headerTitle(station, kind, lang);
  const dateLabel = bonoDateLabel(printedAt, options, lang);
  const itemBlocks = items
    .map((item, index) => {
      const prefs = linePreferencesForPrint(item, station, options)
        .map(
          (pref) =>
            `<div class="pref">${escapeHtml(PREFERENCE_BULLET)} ${escapeHtml(pref)}</div>`,
        )
        .join("");
      const weight = weightLabel(item, lang);
      return `<div class="item">
        <div class="name">${index + 1}. ${escapeHtml(itemCountLabel(item, lang))} ${escapeHtml(itemName(item, lang, options.menuItems))}</div>
        ${weight ? `<div class="weight">${escapeHtml(weight)}</div>` : ""}
        ${prefs}
      </div>`;
    })
    .join("");

  const voidReason = options.reason?.trim()
    ? normalizePreference(options.reason)
    : bonoLabel("customerCancelled", lang);
  const extra =
    kind === "void"
      ? `<div class="alert">${escapeHtml(voidReason)}<br/>${escapeHtml(bonoLabel("doNotPrepare", lang))}</div>`
      : "";

  const waiter = (order.waiter || order.orderedByWaiter || "").trim();
  const waiterRow = waiter
    ? `<div class="waiter">${escapeHtml(bonoLabel("waiter", lang))}: ${escapeHtml(waiter.toUpperCase())}</div>`
    : "";
  const copyRow =
    kind === "ticket"
      ? `<div class="copy">${escapeHtml(copyLabel(order, options, lang))}</div>`
      : "";

  return `<section class="ticket">
    <div class="rule"></div>
    <div class="title" style="text-align:center">${escapeHtml(title)}</div>
    <div class="date" style="text-align:center">${escapeHtml(dateLabel)}</div>
    <div class="rule"></div>
    <div class="meta"><span>${escapeHtml(tableLabel(order, lang))}</span><span>${escapeHtml(formatClock(printedAt))}</span></div>
    ${waiterRow}
    ${copyRow}
    <div class="items">${itemBlocks || `<div class="empty">${escapeHtml(bonoLabel("noItems", lang))}</div>`}</div>
    ${extra}
    <div class="rule"></div>
  </section>`;
}

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

export function collectBonoPrintJobs(orders: readonly Order[], options: StationTicketPrintOptions = {}) {
  return orders.flatMap((order) => {
    const printCopy =
      options.printCopy ??
      (typeof order.bonoPrintCount === "number" ? order.bonoPrintCount + 1 : 1);
    const orderOptions = { ...options, printCopy };
    return bonoTicketsToPrint(order, orderOptions).map((ticket) => ({
      order,
      station: ticket.station,
      items: ticket.items,
      ticketId: ticket.ticketId ?? `${order.id}-${ticket.station}`,
      text: buildStationBonoText(order, ticket.station, ticket.items, orderOptions),
      html: buildStationBonoHtml(order, ticket.station, ticket.items, orderOptions),
      printCopy,
    }));
  });
}

export type BonoPrintResult = {
  ok: boolean;
  printed: number;
  queued?: number;
  error?: string;
  viaGateway?: boolean;
};

/**
 * Renders the bono in an off-screen iframe instead of a popup window so the
 * browser print dialog is not suppressed by popup blockers.
 * Layout matches the POS test receipt: monospace pre text, paper-width page.
 */
function printBonoDocument(html: string, paperWidth: string) {
  const frame = document.createElement("iframe");
  frame.setAttribute("aria-hidden", "true");
  // Kept off-screen at full paper size: a zero-sized frame lays the ticket out
  // at zero width and the printer receives clipped text.
  frame.style.position = "fixed";
  frame.style.left = "-10000px";
  frame.style.top = "0";
  frame.style.width = paperWidth;
  frame.style.height = "297mm";
  frame.style.border = "0";
  // Content must exist before the frame enters the DOM, otherwise it loads
  // about:blank first and printing falls through to the host page.
  frame.srcdoc = html;

  let done = false;
  function printFrame() {
    if (done) return;
    const view = frame.contentWindow;
    if (!view || !frame.contentDocument?.querySelector(".receipt")) return;
    done = true;
    view.focus();
    view.print();
    window.setTimeout(() => frame.remove(), 1000);
  }

  frame.addEventListener("load", printFrame);
  document.body.appendChild(frame);
  window.setTimeout(printFrame, 400);
  window.setTimeout(() => {
    if (!done) frame.remove();
  }, 10000);
}

function escapeReceiptPre(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}

function jobRequestedBy(orders: readonly Order[]) {
  for (const order of orders) {
    const name = (order.waiter || order.orderedByWaiter || order.enteredByCashier || "").trim();
    if (name) return name;
  }
  return undefined;
}

/** One paper Bono per fulfillment station (Kitchen, Butcher, Bar, VIP, Coffee). */
export function printKitchenTickets(
  orders: readonly Order[],
  options: StationTicketPrintOptions = {},
): BonoPrintResult {
  if (typeof window === "undefined") return { ok: false, printed: 0, error: "Printing is unavailable." };
  const printOptions = { ...options, printedAt: options.printedAt ?? new Date() };
  const jobs = collectBonoPrintJobs(orders, printOptions);
  if (jobs.length === 0) {
    return { ok: false, printed: 0, error: "No station Bono tickets to print." };
  }

  const settings = loadPosPrinterSettings();
  const mode = resolvedPrinterMode(settings);
  const paperWidth = settings.paperWidth === "58mm" ? "58mm" : "80mm";
  const narrow = paperWidth === "58mm";
  const fontPt = narrow ? 11 : 12;
  const receiptWidthPx = narrow ? 260 : 360;

  if (mode === "gateway") {
    const batchKey = printOptions.printedAt.toISOString().slice(0, 16);
    void (async () => {
      const result = await enqueueStationBonoJobs(
        jobs.map((job) => ({
          orderId: job.order.id,
          orderNo: job.order.orderNo,
          tableNumber: job.order.tableNumber,
          area: job.order.area,
          ticketId: job.ticketId,
          station: job.station,
          text: job.text,
          batchKey,
        })),
        jobRequestedBy(orders),
      );
      if (!result.ok) {
        showError(
          result.error
            ? `Order saved. Print queue failed: ${result.error}`
            : "Order saved. Could not queue tickets for the cashier printer.",
        );
        return;
      }
      showSuccess(
        result.queued === 1
          ? "Order submitted. Ticket queued for printing."
          : `Order submitted. ${result.queued} tickets queued for printing.`,
      );
    })();
    return { ok: true, printed: 0, queued: jobs.length, viaGateway: true };
  }

  // Same compact receipt layout as Printer Settings → Test print (not oversized KDS type).
  const slipBody = jobs
    .map((job) => `<pre class="receipt">${escapeReceiptPre(job.text)}</pre>`)
    .join('<div class="cut"></div>');

  if (mode === "bluetooth" || mode === "network") {
    // Print each station slip separately so the waitress can hand one slip per station.
    void (async () => {
      try {
        for (const job of jobs) {
          const handled = await printPosText(job.text);
          if (!handled) break;
        }
      } catch (error) {
        showError(
          error instanceof Error
            ? error.message
            : "Ticket printing failed. Check Printer Settings.",
        );
      }
    })();
    return { ok: true, printed: jobs.length };
  }

  printBonoDocument(
    `<!doctype html>
<html>
  <head>
    <title>Station Bono</title>
    <style>
      @page { size: ${paperWidth} auto; margin: 0; }
      * { box-sizing: border-box; }
      html, body {
        width: ${paperWidth};
        margin: 0;
        padding: 0;
        background: #fff;
        color: #000;
        font-family: ui-monospace, "Courier New", Consolas, "Noto Sans Ethiopic", "Nyala", monospace;
        -webkit-print-color-adjust: exact;
        print-color-adjust: exact;
      }
      .sheet { padding: 4mm 2mm; }
      .receipt {
        width: ${receiptWidthPx}px;
        max-width: 100%;
        margin: 0 auto 8mm;
        padding: 0;
        font-size: ${fontPt}pt;
        line-height: 1.35;
        white-space: pre-wrap;
        word-break: break-word;
        page-break-inside: avoid;
        break-inside: avoid;
      }
      .cut {
        height: 0;
        margin: 0 0 6mm;
        border: 0;
        page-break-after: always;
        break-after: page;
      }
      .cut:last-child { display: none; }
    </style>
  </head>
  <body>
    <div class="sheet">${slipBody}</div>
  </body>
</html>`,
    paperWidth,
  );
  return { ok: true, printed: jobs.length };
}

export type BonoPreviewItem = {
  name: string;
  qtyLabel: string;
  weightLabel?: string;
  preferences: string[];
};

export type BonoPreviewTicket = {
  orderId: string;
  station: string;
  tableLabel: string;
  timeLabel: string;
  kind: StationTicketPrintKind;
  items: BonoPreviewItem[];
  reason?: string;
  text: string;
};

export function collectBonoPreviewTickets(
  orders: readonly Order[],
  options: StationTicketPrintOptions = {},
): BonoPreviewTicket[] {
  const printedAt = options.printedAt ?? new Date();
  const lang = resolveBonoLang(options.lang);
  return collectBonoPrintJobs(orders, { ...options, printedAt }).map((job) => ({
    orderId: job.order.id,
    station: job.station,
    tableLabel: tableLabel(job.order, lang),
    timeLabel: formatClock(printedAt),
    kind: options.kind ?? "ticket",
    reason: options.reason,
    text: job.text,
    items: job.items.map((item) => ({
      name: itemName(item, lang, options.menuItems),
      qtyLabel: itemCountLabel(item, lang),
      weightLabel: weightLabel(item, lang) ?? undefined,
      preferences: linePreferencesForPrint(item, job.station, options),
    })),
  }));
}
