import { useEffect, useMemo, useState } from "react";
import * as Icons from "lucide-react";
import { Chip } from "@/components/ui-kit";
import { verifyBankPayment } from "@/lib/api/verify-et.functions";
import {
  BANK_PAYMENT_METHODS,
  type MixedBankPaymentEntry,
  PAYMENT_METHODS,
  type Order,
  type OrderPayment,
  type OrderReceipt,
  type PaymentMethod,
} from "@/lib/demo-data";
import { formatETB, formatEthiopic } from "@/lib/ethiopic";
import { useAuth } from "@/lib/auth-context";
import { orderLineName, useT } from "@/lib/i18n";
import { canGenerateReceipt } from "@/lib/orders-ops";
import { loadPosPrinterSettings, printPosText, resolvedPrinterMode } from "@/lib/pos-printer";
import { enqueueCustomerReceiptJob } from "@/lib/print-jobs";
import { translateBonoUnit } from "@/lib/station-ticket-i18n";
import { type AppLang, useCalendar, useLang } from "@/lib/lang-context";
import { useStore } from "@/lib/store";
import { showError, showSuccess } from "@/lib/toast";
import {
  findUsedBankPaymentReference,
  getBankFieldConfig,
  isBankVerifyReady,
  markBankReferenceVerified,
  mapPaymentMethodToVerifyBank,
  paymentMethodRequiresBankReceipt,
  type PaymentVerificationResult,
} from "@/lib/verify-et";

export type ReceiptView = { order: Order; receipt: OrderReceipt; reprint?: boolean };

function formatOrderQty(qty: number, unitLabel?: string, lang: AppLang = "en") {
  const value = qty.toLocaleString(undefined, { maximumFractionDigits: 3 });
  if (!unitLabel) return value;
  const unit = lang === "am" ? translateBonoUnit(unitLabel.trim().toUpperCase(), "am") : unitLabel;
  return `${value} ${unit}`;
}

function formatReceiptAmount(value: number) {
  return value.toFixed(2);
}

const RECEIPT_LABELS: Record<AppLang, Record<string, string>> = {
  en: {
    reprint: "REPRINT",
    order: "ORDER",
    table: "TABLE",
    date: "DATE",
    total: "TOTAL",
    paid: "PAID",
    change: "CHANGE",
    tip: "TIP",
    waiter: "WAITER",
    unpaid: "UNPAID",
  },
  am: {
    reprint: "ድግግሞሽ",
    order: "ትዕዛዝ",
    table: "ጠረጴዛ",
    date: "ቀን",
    total: "ጠቅላላ",
    paid: "የተከፈለ",
    change: "ምላሽ",
    tip: "ጉርሻ",
    waiter: "አስተናጋጅ",
    unpaid: "ያልተከፈለ",
  },
};

type ReceiptTextOptions = {
  reprint?: boolean;
  lang?: AppLang;
  /** Source for Amharic dish names; without it items print under their stored name. */
  menuItems?: readonly { id: string; name_en: string; name_am?: string }[];
};

function centerOnRule(value: string, ruleLength: number) {
  return value.padStart(Math.floor((ruleLength + value.length) / 2));
}

/** Amharic receipts print in Amharic: the ESC/POS path rasterises Ethiopic text. */
function customerReceiptText(
  order: Order,
  receipt: OrderReceipt,
  options: ReceiptTextOptions = {},
) {
  const lang: AppLang = options.lang === "am" ? "am" : "en";
  const label = RECEIPT_LABELS[lang];
  const rule = "------------------------------------------";
  const heading = receipt.restaurantName?.trim() || "Fiker Bar and Restaurant";
  const lines = [
    rule,
    centerOnRule(heading, rule.length),
    options.reprint ? centerOnRule(label.reprint, rule.length) : "",
    rule,
    `${label.order}: ${order.orderNo}`,
    `${label.table}: ${order.area} ${order.tableNumber}`,
    `${label.date}: ${receipt.generatedAt}`,
    rule,
  ].filter(Boolean);
  for (const item of order.items) {
    const name = orderLineName(item, options.menuItems ?? [], lang);
    lines.push(
      `${formatOrderQty(item.qty, item.unitLabel, lang)} ${lang === "am" ? name : name.toUpperCase()}`,
    );
    lines.push(`  ${formatReceiptAmount((item.unitPrice ?? 0) * item.qty)}`);
  }
  lines.push(rule, `${label.total}: ${formatReceiptAmount(receipt.grandTotal)}`);
  if (order.payment) {
    lines.push(`${label.paid}: ${formatReceiptAmount(order.payment.amountReceived)}`);
    if (order.payment.changeAmount > 0) {
      lines.push(`${label.change}: ${formatReceiptAmount(order.payment.changeAmount)}`);
    }
    if ((order.payment.tipAmount ?? 0) > 0) {
      lines.push(`${label.tip}: ${formatReceiptAmount(order.payment.tipAmount ?? 0)}`);
    }
    if (order.payment.collectedByWaiter) {
      lines.push(`${label.waiter}: ${order.payment.collectedByWaiter.toUpperCase()}`);
    }
  } else {
    lines.push(label.unpaid);
  }
  lines.push(rule);
  return lines.join("\n");
}

function escapeReceiptHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function printCustomerReceiptDocument(text: string, paperWidth = "80mm") {
  if (typeof window === "undefined") return;
  const frame = document.createElement("iframe");
  frame.setAttribute("aria-hidden", "true");
  frame.style.position = "fixed";
  frame.style.left = "-10000px";
  frame.style.top = "0";
  frame.style.width = paperWidth;
  frame.style.height = "297mm";
  frame.style.border = "0";
  frame.srcdoc = `<!doctype html>
<html>
  <head>
    <title>Receipt</title>
    <style>
      @page { size: ${paperWidth} auto; margin: 0; }
      html, body {
        width: ${paperWidth};
        margin: 0;
        padding: 0;
        background: #fff;
        color: #000;
        font-family: "Noto Sans Ethiopic", "Nyala", "Abyssinica SIL", "Courier New", ui-monospace, Consolas, monospace;
        font-size: 14pt;
        line-height: 1.35;
      }
      pre { margin: 0; padding: 4mm 3mm; white-space: pre-wrap; font-family: inherit; }
    </style>
  </head>
  <body><pre>${escapeReceiptHtml(text)}</pre></body>
</html>`;
  let done = false;
  function printFrame() {
    if (done) return;
    const view = frame.contentWindow;
    if (!view) return;
    done = true;
    view.focus();
    view.print();
    window.setTimeout(() => frame.remove(), 1000);
  }
  frame.addEventListener("load", printFrame);
  document.body.appendChild(frame);
  window.setTimeout(printFrame, 400);
}

async function sendReceiptToPrinter(args: {
  order: Order;
  receipt: OrderReceipt;
  reprint?: boolean;
  lang: AppLang;
  menuItems: readonly { id: string; name_en: string; name_am?: string }[];
  requestedBy: string;
}) {
  const text = customerReceiptText(args.order, args.receipt, {
    reprint: args.reprint,
    lang: args.lang,
    menuItems: args.menuItems,
  });
  const settings = loadPosPrinterSettings();
  const mode = resolvedPrinterMode(settings);
  if (mode === "gateway") {
    const queued = await enqueueCustomerReceiptJob({
      orderId: args.order.id,
      orderNo: args.order.orderNo,
      tableNumber: args.order.tableNumber,
      area: args.order.area,
      text,
      printCount: args.receipt.printCount ?? 1,
      requestedBy: args.requestedBy,
      branch: undefined,
    });
    if (!queued.ok) {
      showError(
        queued.error
          ? `Could not queue receipt: ${queued.error}`
          : "Could not queue receipt for the printer.",
      );
      return;
    }
    showSuccess(args.reprint ? "Reprint queued." : "Receipt queued for printing.");
    return;
  }
  if (mode === "bluetooth" || mode === "network") {
    try {
      await printPosText(text);
    } catch (error) {
      showError(
        error instanceof Error ? error.message : "Receipt printing failed. Check Printer Settings.",
      );
    }
    return;
  }
  printCustomerReceiptDocument(text);
}

function parseStoredDateTime(value?: string) {
  if (!value) return null;
  const match = value.match(/^(\d{2})\/(\d{2})\/(\d{4})\s+(.+)$/);
  if (!match) return null;
  const [, day, month, year, time] = match;
  const parsed = new Date(`${year}-${month}-${day}T00:00:00`);
  if (Number.isNaN(parsed.getTime())) return null;
  return { date: parsed, time };
}

function formatReceiptDateTime(value: string, lang: AppLang, calendar: "gregorian" | "ethiopian") {
  const parsed = parseStoredDateTime(value);
  if (!parsed) return value;
  const dateLabel =
    calendar === "ethiopian"
      ? formatEthiopic(parsed.date, lang)
      : parsed.date.toLocaleDateString(lang === "am" ? "am-ET" : "en-GB", {
          day: "numeric",
          month: "short",
          year: "numeric",
        });
  return `${dateLabel} ${parsed.time}`;
}

function uniqueNames(names: readonly string[]) {
  const seen = new Set<string>();
  return names.reduce<string[]>((items, name) => {
    const value = name.trim();
    const key = value.toLowerCase();
    if (!value || seen.has(key)) return items;
    seen.add(key);
    return [...items, value];
  }, []);
}

const PAYMENT_AM_LABELS: Partial<Record<PaymentMethod, string>> = {
  Cash: "ጥሬ ገንዘብ",
  Mixed: "ቅልቅል",
  Telebirr: "ቴሌብር",
  "CBE Birr": "ሲቢኢ ብር",
};

function paymentMethodLabel(method: PaymentMethod, t: (en: string, am: string) => string) {
  return t(method, PAYMENT_AM_LABELS[method] ?? method);
}

function bankVerificationStatus(
  verification: PaymentVerificationResult | null | undefined,
): OrderPayment["verificationStatus"] {
  return verification?.status === "verified" ? "verified" : "recorded_unverified";
}

function duplicateReferenceMessage(
  conflict: NonNullable<ReturnType<typeof findUsedBankPaymentReference>>,
  t: (en: string, am: string) => string,
) {
  if (conflict.source === "verified_session") {
    return t(
      "This reference was already verified in this session.",
      "ይህ ማጣቀሻ ቁጥር በዚህ ክፍለ ጊዜ ቀድሞ ተረጋግጧል።",
    );
  }
  return t(
    `This reference is already used on paid order ${conflict.orderNo ?? conflict.orderId ?? ""}.`,
    `ይህ ማጣቀሻ ቁጥር በ${conflict.orderNo ?? conflict.orderId ?? "ተከፍሎ"} ትዕዛዝ ላይ ቀድሞ ጥቅም ላይ ውሏል።`,
  );
}

export function BillDialog({
  order,
  cashierName,
  onClose,
  onReceipt,
  onPaid,
  onSkippedStock,
}: {
  order: Order;
  cashierName: string;
  onClose: () => void;
  onReceipt: (order: Order, receipt: OrderReceipt, reprint?: boolean) => void;
  onPaid: (order: Order) => void;
  onSkippedStock: (items: string[]) => void;
}) {
  const store = useStore();
  const { users } = useAuth();
  const t = useT();
  const lang = useLang();
  const currentOrder = store.orders.find((item) => item.id === order.id) ?? order;
  const receipt = currentOrder.receipt;
  const amountDue = receipt?.grandTotal ?? currentOrder.total;
  const receiptReady = canGenerateReceipt(currentOrder);
  const managerOptions = useMemo(
    () =>
      uniqueNames(
        users
          .filter((staffUser) => staffUser.role === "Branch Manager")
          .map((staffUser) => staffUser.name),
      ).sort((a, b) => a.localeCompare(b)),
    [users],
  );
  const waiterPaymentOptions = useMemo(
    () =>
      uniqueNames([
        currentOrder.waiter,
        ...users
          .filter((staffUser) => staffUser.role === "Waiter")
          .map((staffUser) => staffUser.name),
      ]).sort((a, b) => a.localeCompare(b)),
    [currentOrder.waiter, users],
  );
  const [method, setMethod] = useState<PaymentMethod>("Cash");
  const [collectedByWaiter, setCollectedByWaiter] = useState(currentOrder.waiter);
  const [receivedByCashier, setReceivedByCashier] = useState(cashierName);
  const [amountReceived, setAmountReceived] = useState(Math.ceil(amountDue / 10) * 10);
  const [manualTipAmount, setManualTipAmount] = useState(0);
  const [keepAsTip, setKeepAsTip] = useState(false);
  const [managerName, setManagerName] = useState(managerOptions[0] ?? cashierName);

  // --- Single-bank state (used for direct bank selection, not Mixed) ---
  const [bankPaymentReference, setBankPaymentReference] = useState("");
  const [accountSuffix, setAccountSuffix] = useState("");
  const [payerPhone, setPayerPhone] = useState("");
  const [verification, setVerification] = useState<PaymentVerificationResult | null>(null);
  const [verifying, setVerifying] = useState(false);
  const [verifyError, setVerifyError] = useState<string | null>(null);

  // --- Multi-bank state (used for Mixed mode) ---
  type MixedEntryState = {
    reference: string;
    accountSuffix: string;
    phone: string;
    verification: PaymentVerificationResult | null;
    verifying: boolean;
    verifyError: string | null;
  };
  const freshEntry = (): MixedEntryState => ({
    reference: "",
    accountSuffix: "",
    phone: "",
    verification: null,
    verifying: false,
    verifyError: null,
  });
  const [mixedEntries, setMixedEntries] = useState<Record<string, MixedEntryState>>({});
  const mixedSelected = Object.keys(mixedEntries) as PaymentMethod[];

  const extraAmount = Math.max(0, amountReceived - amountDue);
  const requestedTip = Math.max(0, manualTipAmount);
  const tip = keepAsTip ? extraAmount : Math.min(requestedTip, extraAmount);
  const change = Math.max(0, extraAmount - tip);
  const requiredAmount = amountDue + (keepAsTip ? 0 : requestedTip);
  const isMixed = method === "Mixed";
  const needsBankReceipt = isMixed ? mixedSelected.length > 0 : paymentMethodRequiresBankReceipt(method);
  const bankConfig = !isMixed ? getBankFieldConfig(method) : null;

  useEffect(() => {
    if (!managerOptions.includes(managerName)) {
      setManagerName(managerOptions[0] ?? cashierName);
    }
  }, [cashierName, managerName, managerOptions]);

  useEffect(() => {
    setVerification(null);
    setVerifyError(null);
  }, [method, bankPaymentReference, accountSuffix, payerPhone]);

  useEffect(() => {
    setBankPaymentReference("");
    setAccountSuffix("");
    setPayerPhone("");
    setVerification(null);
    setVerifyError(null);
    if (!isMixed) setMixedEntries({});
  }, [method]);

  function toggleMixedBank(bm: PaymentMethod) {
    setMixedEntries((prev) => {
      if (bm in prev) {
        const next = { ...prev };
        delete next[bm];
        return next;
      }
      return { ...prev, [bm]: freshEntry() };
    });
  }

  function referenceAlreadyUsed(method: PaymentMethod, reference: string) {
    return findUsedBankPaymentReference(store.orders, method, reference, currentOrder.id);
  }

  function updateMixedEntry(bm: string, patch: Partial<MixedEntryState>) {
    setMixedEntries((prev) => {
      const entry = prev[bm];
      if (!entry) return prev;
      const updated = { ...entry, ...patch };
      if (patch.reference !== undefined || patch.accountSuffix !== undefined || patch.phone !== undefined) {
        updated.verification = null;
        updated.verifyError = null;
      }
      return { ...prev, [bm]: updated };
    });
  }

  function updateTipAmount(value: number) {
    const next = Math.max(0, Number.isFinite(value) ? value : 0);
    setKeepAsTip(false);
    setManualTipAmount(next);
    setAmountReceived((current) => Math.max(current, amountDue + next));
    setVerification(null);
    setVerifyError(null);
    setMixedEntries((current) =>
      Object.fromEntries(
        Object.entries(current).map(([key, entry]) => [
          key,
          { ...entry, verification: null, verifyError: null },
        ]),
      ),
    );
  }

  async function verifyPaymentReceipt(bankMethod?: PaymentMethod) {
    if (isMixed && bankMethod) {
      const entry = mixedEntries[bankMethod];
      if (!entry || !isBankVerifyReady(bankMethod, entry.reference, entry.accountSuffix)) return;
      if (entry.verification?.status === "verified") return;
      const conflict = referenceAlreadyUsed(bankMethod, entry.reference);
      if (conflict) {
        updateMixedEntry(bankMethod, {
          verifyError: duplicateReferenceMessage(conflict, t),
        });
        return;
      }
      const bank = mapPaymentMethodToVerifyBank(bankMethod);
      if (!bank) return;
      const suffix = entry.accountSuffix.replace(/\D/g, "");
      updateMixedEntry(bankMethod, { verifying: true, verifyError: null });
      try {
        const result = await verifyBankPayment({
          data: {
            bank,
            reference: entry.reference.trim(),
            accountSuffix: suffix || undefined,
            phoneNumber: entry.phone.trim() || undefined,
            expectedAmount: requiredAmount,
            orderNo: currentOrder.orderNo,
          },
        });
        if (result.status === "unavailable") {
          updateMixedEntry(bankMethod, {
            verifying: false,
            verification: { ...result, status: "recorded_unverified", referenceNumber: entry.reference.trim() },
          });
        } else if (result.status === "verified") {
          markBankReferenceVerified(bankMethod, entry.reference);
          updateMixedEntry(bankMethod, { verifying: false, verification: result });
        } else {
          updateMixedEntry(bankMethod, {
            verifying: false,
            verification: result,
            verifyError: result.message || "Verification failed.",
          });
        }
      } catch (error) {
        updateMixedEntry(bankMethod, {
          verifying: false,
          verification: null,
          verifyError: error instanceof Error ? error.message : "Verification failed.",
        });
      }
      return;
    }

    if (!needsBankReceipt || !isBankVerifyReady(method, bankPaymentReference, accountSuffix)) return;
    if (verification?.status === "verified") return;
    const conflict = referenceAlreadyUsed(method, bankPaymentReference);
    if (conflict) {
      setVerifyError(duplicateReferenceMessage(conflict, t));
      return;
    }
    const bank = mapPaymentMethodToVerifyBank(method);
    if (!bank) return;
    const suffix = accountSuffix.replace(/\D/g, "");
    setVerifying(true);
    setVerifyError(null);
    try {
      const result = await verifyBankPayment({
        data: {
          bank,
          reference: bankPaymentReference.trim(),
          accountSuffix: suffix || undefined,
          phoneNumber: payerPhone.trim() || undefined,
          expectedAmount: requiredAmount,
          orderNo: currentOrder.orderNo,
        },
      });
      if (result.status === "unavailable") {
        setVerification({
          ...result,
          status: "recorded_unverified",
          referenceNumber: bankPaymentReference.trim(),
          message:
            result.message ||
            "Live verification unavailable. Receipt number will be saved with the payment.",
        });
        setVerifyError(null);
      } else if (result.status === "verified") {
        markBankReferenceVerified(method, bankPaymentReference);
        setVerification(result);
        if (result.amount != null && Number.isFinite(result.amount)) {
          setAmountReceived(Math.max(requiredAmount, Number(result.amount)));
        }
      } else {
        setVerification(result);
        setVerifyError(result.message || "Verification failed.");
      }
    } catch (error) {
      setVerification(null);
      setVerifyError(error instanceof Error ? error.message : "Verification failed.");
    } finally {
      setVerifying(false);
    }
  }

  function generateReceipt() {
    const generated = store.generateReceipt(currentOrder.id, { generatedBy: cashierName });
    if (!generated) return;
    const viewOrder: Order = {
      ...currentOrder,
      status: "RECEIPT_GENERATED",
      paymentStatus: "Unpaid",
      receipt: generated,
      receiptNumber: generated.receiptNumber,
      receiptGeneratedAt: generated.generatedAt,
      receiptGeneratedBy: generated.generatedBy,
      lockedForEditing: true,
      total: generated.grandTotal,
    };
    setAmountReceived(Math.ceil(generated.grandTotal / 10) * 10);
    onReceipt(viewOrder, generated);
  }

  function previewReceipt() {
    if (!receipt) return;
    onReceipt(currentOrder, receipt);
  }

  async function printReceipt() {
    const result = store.recordReceiptPrint(currentOrder.id);
    if (!result) return;
    const viewOrder: Order = { ...currentOrder, receipt: result.receipt };
    onReceipt(viewOrder, result.receipt, result.reprint);
    try {
      await sendReceiptToPrinter({
        order: viewOrder,
        receipt: result.receipt,
        reprint: result.reprint,
        lang,
        menuItems: store.menuItems,
        requestedBy: cashierName,
      });
    } catch (error) {
      showError(
        error instanceof Error ? error.message : "Could not print receipt.",
      );
    }
  }

  async function closeBill() {
    if (!receipt) return;
    if (!(amountReceived >= requiredAmount && collectedByWaiter.trim() && receivedByCashier.trim())) return;

    // --- Mixed multi-bank path ---
    if (isMixed && mixedSelected.length > 0) {
      const mixedPayments: MixedBankPaymentEntry[] = mixedSelected.map((m) => {
        const e = mixedEntries[m];
        return {
          method: m,
          bankPaymentReference: e.reference.trim(),
          bankAccountSuffix: e.accountSuffix.trim() || undefined,
          bankPaymentPhone: e.phone.trim() || undefined,
          verificationStatus: bankVerificationStatus(e.verification),
          verificationRequestId: e.verification?.requestId,
          verificationBank: e.verification?.bank,
          verificationAmount: e.verification?.amount,
          verificationMessage: e.verification?.message,
          verifiedAt: e.verification?.verifiedAt,
        };
      });

      const first = mixedPayments[0];
      const result = store.closeOrderPayment(currentOrder.id, {
        method: "Mixed",
        collectedByWaiter,
        receivedByCashier,
        amountReceived,
        keepAsTip,
        tipAmount: tip,
        closedByCashier: receivedByCashier,
        bankPaymentReference: first?.bankPaymentReference,
        bankAccountSuffix: first?.bankAccountSuffix,
        bankPaymentPhone: first?.bankPaymentPhone,
        verificationStatus: first?.verificationStatus,
        verificationRequestId: first?.verificationRequestId,
        verificationBank: first?.verificationBank,
        verificationAmount: first?.verificationAmount,
        verificationMessage: first?.verificationMessage,
        verifiedAt: first?.verifiedAt,
        mixedBankPayments: mixedPayments,
      });
      if (result && receipt) {
        const { payment, skippedItems } = result;
        if (skippedItems.length > 0) onSkippedStock(skippedItems);
        const paidReceipt: OrderReceipt = { ...receipt, paymentStatus: "Paid" };
        const paidOrder: Order = {
          ...currentOrder,
          status: "CLOSED",
          paymentStatus: "Paid",
          receipt: paidReceipt,
          payment,
        };
        onPaid(paidOrder);
      }
      return;
    }

    // --- Single bank / Cash path ---
    const verificationStatus: OrderPayment["verificationStatus"] = needsBankReceipt
      ? bankVerificationStatus(verification)
      : "skipped";
    const result = store.closeOrderPayment(currentOrder.id, {
      method,
      collectedByWaiter,
      receivedByCashier,
      amountReceived,
      keepAsTip,
      tipAmount: tip,
      closedByCashier: receivedByCashier,
      bankPaymentReference: needsBankReceipt ? bankPaymentReference.trim() : undefined,
      bankAccountSuffix: needsBankReceipt ? accountSuffix.trim() || undefined : undefined,
      bankPaymentPhone: needsBankReceipt ? payerPhone.trim() || undefined : undefined,
      verificationStatus,
      verificationRequestId: verification?.requestId,
      verificationBank: verification?.bank,
      verificationAmount: verification?.amount,
      verificationMessage: verification?.message,
      verifiedAt: verification?.verifiedAt,
    });
    if (result && receipt) {
      const { payment, skippedItems } = result;
      if (skippedItems.length > 0) onSkippedStock(skippedItems);
      const paidReceipt: OrderReceipt = { ...receipt, paymentStatus: "Paid" };
      const paidOrder: Order = {
        ...currentOrder,
        status: "CLOSED",
        paymentStatus: "Paid",
        receipt: paidReceipt,
        payment,
        paymentReceivedAt: payment.paymentReceivedAt,
        closedByCashier: payment.closedByCashier,
      };
      onPaid(paidOrder);
    }
  }

  return (
    <div className="fixed inset-0 z-50 bg-foreground/40 backdrop-blur-sm grid place-items-center p-4">
      <div className="surface-card max-w-2xl w-full !p-6 max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-display text-xl font-semibold">{t("Order bill", "የትዕዛዝ ሂሳብ")}</h3>
          <button
            onClick={onClose}
            className="size-8 grid place-items-center rounded-lg hover:bg-surface-2"
          >
            <Icons.X className="size-4" />
          </button>
        </div>
        <div className="rounded-xl bg-surface-2 p-4 mb-4">
          <div className="text-xs text-muted-foreground">
            {order.orderNo} · {order.area} · {order.tableNumber}
          </div>
          <div className="font-display text-3xl font-semibold mt-1">{formatETB(amountDue)}</div>
            <div className="grid grid-cols-2 gap-2 mt-3 text-xs text-muted-foreground">
              <div>
                {t("Ordered by", "ያዘዘው")} <span className="text-foreground">{currentOrder.orderedByWaiter}</span>
              </div>
              <div>
                {t("Entered by", "ያስገባው")}{" "}
                <span className="text-foreground">
                  {currentOrder.enteredByCashier === "Pending cashier"
                    ? t("Pending cashier", "ካሸር እየተጠበቀ")
                    : currentOrder.enteredByCashier}
                </span>
              </div>
            </div>
        </div>

        <div className="rounded-xl border border-border bg-card p-4 mb-4">
          <div className="flex items-start justify-between gap-4">
            <div>
              <div className="font-display font-semibold">{t("Receipt generation", "የደረሰኝ መፍጠር")}</div>
            </div>
            {receipt ? <Chip tone="teff">{t("Generated", "ተፈጥሯል")}</Chip> : <Chip tone="gold">{t("Unpaid", "ያልተከፈለ")}</Chip>}
          </div>

          {receipt ? (
            <div className="mt-3 grid sm:grid-cols-2 gap-3 text-xs">
              <div className="rounded-lg bg-surface-2 p-3">
                <span className="block text-muted-foreground">{t("Receipt number", "የደረሰኝ ቁጥር")}</span>
                <span className="font-mono font-semibold">{receipt.receiptNumber}</span>
              </div>
              <div className="rounded-lg bg-surface-2 p-3">
                <span className="block text-muted-foreground">{t("Generated", "ተፈጥሯል")}</span>
                <span>
                  {receipt.generatedAt} by {receipt.generatedBy}
                </span>
              </div>
              <div className="rounded-lg bg-surface-2 p-3">
                <span className="block text-muted-foreground">{t("Payment status", "የክፍያ ሁኔታ")}</span>
                <span>
                  {t(
                    currentOrder.paymentStatus,
                    currentOrder.paymentStatus === "Unpaid" ? "ያልተከፈለ" : "ተከፍሏል",
                  )}
                </span>
              </div>
              <div className="rounded-lg bg-surface-2 p-3">
                <span className="block text-muted-foreground">{t("Editing lock", "የማስተካከያ መቆለፊያ")}</span>
                <span>
                  {currentOrder.lockedForEditing === false
                    ? t("Manager authorized", "በሥራ አስኪያጅ ተፈቅዷል")
                    : t("Locked after receipt", "ከደረሰኙ በኋላ ተቆልፏል")}
                </span>
              </div>
            </div>
          ) : receiptReady ? (
            <button
              onClick={generateReceipt}
              className="mt-4 h-10 px-4 rounded-lg bg-ember text-ember-foreground text-sm font-semibold inline-flex items-center gap-2 shadow-[var(--shadow-glow)]"
            >
              <Icons.ReceiptText className="size-4" /> {t("Generate Receipt", "ደረሰኝ ፍጠር")}
            </button>
          ) : (
            <button
              type="button"
              disabled
              className="mt-4 h-10 px-4 rounded-lg bg-muted text-muted-foreground text-sm font-semibold inline-flex items-center gap-2 cursor-not-allowed"
            >
              <Icons.Clock className="size-4" /> {t("Order not processed", "ትዕዛዝ አልተከናወነም")}
            </button>
          )}

          {receipt && (
            <div className="mt-4 flex flex-wrap gap-2">
              <button
                onClick={previewReceipt}
                className="h-9 px-3 rounded-lg border border-border bg-card text-sm font-medium inline-flex items-center gap-2 hover:bg-surface-2"
              >
                <Icons.Eye className="size-4" /> {t("Preview receipt", "የደረሰኝ ቅድመ እይታ")}
              </button>
              <button
                onClick={printReceipt}
                className="h-9 px-3 rounded-lg bg-foreground text-background text-sm font-medium inline-flex items-center gap-2"
              >
                <Icons.Printer className="size-4" />{" "}
                {receipt.printCount > 0 ? t("Reprint receipt", "ደረሰኙን እንደገና አትም") : t("Print receipt", "ደረሰኙን አትም")}
              </button>
              {currentOrder.lockedForEditing !== false ? (
                <div className="flex items-center gap-2 ml-auto">
                  <select
                    value={managerName}
                    onChange={(e) => setManagerName(e.target.value)}
                    className="h-9 px-3 rounded-lg border border-border bg-card text-xs focus:outline-none"
                  >
                    {(managerOptions.length ? managerOptions : [managerName]).map((name) => (
                      <option key={name} value={name}>
                        {name}
                      </option>
                    ))}
                  </select>
                  <button
                    onClick={() => store.authorizeReceiptChanges(currentOrder.id, managerName)}
                    className="h-9 px-3 rounded-lg border border-border text-xs font-medium inline-flex items-center gap-1.5 hover:bg-surface-2"
                  >
                    <Icons.Unlock className="size-3.5" /> {t("Manager authorize", "በሥራ አስኪያጅ አስፈቅድ")}
                  </button>
                </div>
              ) : (
                <div className="ml-auto h-9 px-3 rounded-lg bg-teff/10 text-teff text-xs font-medium inline-flex items-center gap-1.5">
                  <Icons.Unlock className="size-3.5" /> {t("Authorized by", "ያስፈቀደው")}{" "}
                  {currentOrder.managerAuthorizedChangesBy}
                </div>
              )}
            </div>
          )}
        </div>

        <div className="mb-4">
          <div className="text-xs text-muted-foreground mb-2">{t("Payment method", "የክፍያ ዘዴ")}</div>
          <div className="grid grid-cols-3 gap-2">
            {PAYMENT_METHODS.map((option) => (
              <button
                key={option}
                onClick={() => setMethod(option)}
                disabled={!receipt}
                className={`h-10 rounded-xl border text-xs font-medium transition-colors disabled:opacity-40 ${method === option ? "border-ember bg-ember/10 text-ember" : "border-border bg-card hover:bg-surface-2"}`}
              >
                {paymentMethodLabel(option, t)}
              </button>
            ))}
          </div>
        </div>

        {isMixed && (
          <div className="rounded-xl border border-border bg-card p-4 mb-4 space-y-3">
            <div className="font-display font-semibold text-sm">{t("Mixed payment — Cash + Bank", "ቅልቅል ክፍያ — ጥሬ ገንዘብ + ባንክ")}</div>
            <div className="grid grid-cols-3 gap-2">
              {BANK_PAYMENT_METHODS.map((bm) => (
                <button
                  key={bm}
                  onClick={() => toggleMixedBank(bm)}
                  className={`h-9 rounded-lg border text-xs font-medium transition-colors ${bm in mixedEntries ? "border-ember bg-ember/10 text-ember" : "border-border bg-surface-2 hover:bg-surface-2/80"}`}
                >
                  {paymentMethodLabel(bm, t)}
                </button>
              ))}
            </div>
          </div>
        )}

        {isMixed && mixedSelected.map((bm) => {
          const entry = mixedEntries[bm];
          const cfg = getBankFieldConfig(bm);
          if (!entry || !cfg) return null;
          return (
            <div key={bm} className="rounded-xl border border-border bg-card p-4 mb-3 space-y-3">
              <div className="flex items-center justify-between">
                <div className="font-display font-semibold text-sm">{paymentMethodLabel(bm, t)}</div>
                {entry.verification?.status === "verified" && <Chip tone="teff">{t("Verified", "ተረጋግጧል")}</Chip>}
                {entry.verification?.status === "recorded_unverified" && <Chip tone="gold">{t("Saved", "ተመዝግቧል")}</Chip>}
              </div>
              <div>
                <label className="text-xs text-muted-foreground">{t(cfg.referenceLabel, cfg.referenceAmLabel)}</label>
                <input
                  value={entry.reference}
                  disabled={!receipt}
                  onChange={(e) => updateMixedEntry(bm, { reference: e.target.value })}
                  placeholder={cfg.referencePlaceholder}
                  className="w-full mt-1 h-10 px-3 rounded-lg border border-border bg-card text-sm font-mono focus:outline-none focus:ring-2 focus:ring-ring/40 disabled:opacity-50"
                />
              </div>
              {cfg.accountSuffix && (
                <div>
                  <label className="text-xs text-muted-foreground">{t(cfg.accountSuffix.label, cfg.accountSuffix.amLabel)}</label>
                  <input
                    value={entry.accountSuffix}
                    disabled={!receipt}
                    maxLength={cfg.accountSuffix.maxLength}
                    onChange={(e) =>
                      updateMixedEntry(bm, {
                        accountSuffix: e.target.value.replace(/\D/g, "").slice(0, cfg.accountSuffix!.maxLength),
                      })
                    }
                    placeholder={cfg.accountSuffix.placeholder}
                    className="w-full mt-1 h-10 px-3 rounded-lg border border-border bg-card text-sm font-mono focus:outline-none focus:ring-2 focus:ring-ring/40 disabled:opacity-50"
                  />
                </div>
              )}
              {cfg.phone && (
                <div>
                  <label className="text-xs text-muted-foreground">{t(cfg.phone.label, cfg.phone.amLabel)}</label>
                  <input
                    value={entry.phone}
                    disabled={!receipt}
                    onChange={(e) => updateMixedEntry(bm, { phone: e.target.value })}
                    placeholder={cfg.phone.placeholder}
                    className="w-full mt-1 h-10 px-3 rounded-lg border border-border bg-card text-sm focus:outline-none focus:ring-2 focus:ring-ring/40 disabled:opacity-50"
                  />
                </div>
              )}
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  disabled={
                    !receipt ||
                    !isBankVerifyReady(bm, entry.reference, entry.accountSuffix) ||
                    entry.verifying ||
                    entry.verification?.status === "verified" ||
                    Boolean(referenceAlreadyUsed(bm, entry.reference))
                  }
                  onClick={() => void verifyPaymentReceipt(bm)}
                  className="h-9 px-3 rounded-lg border border-border bg-card text-sm font-medium inline-flex items-center gap-2 hover:bg-surface-2 disabled:opacity-40"
                >
                  <Icons.ShieldCheck className="size-4" />
                  {entry.verifying ? t("Verifying…", "እየተረጋገጠ…") : t("Verify (optional)", "አረጋግጥ (አማራጭ)")}
                </button>
                <button
                  type="button"
                  onClick={() => toggleMixedBank(bm)}
                  className="h-9 px-3 rounded-lg border border-border text-xs font-medium inline-flex items-center gap-1.5 hover:bg-surface-2 text-muted-foreground"
                >
                  <Icons.X className="size-3.5" /> {t("Remove", "አስወግድ")}
                </button>
              </div>
              {entry.verification?.status === "verified" && (
                <div className="rounded-lg bg-teff/10 text-teff px-3 py-2 text-xs space-y-1">
                  <div>{entry.verification.message}</div>
                  {entry.verification.amount != null && (
                    <div>
                      {t("Verified amount", "የተረጋገጠ መጠን")}: {formatETB(entry.verification.amount)}
                      {entry.verification.senderName ? ` · ${entry.verification.senderName}` : ""}
                    </div>
                  )}
                </div>
              )}
              {(entry.verifyError ||
                entry.verification?.status === "failed" ||
                referenceAlreadyUsed(bm, entry.reference)) && (
                <div className="rounded-lg bg-destructive/10 text-destructive px-3 py-2 text-xs">
                  {entry.verifyError ||
                    entry.verification?.message ||
                    duplicateReferenceMessage(referenceAlreadyUsed(bm, entry.reference)!, t)}
                </div>
              )}
            </div>
          );
        })}

        {!isMixed && needsBankReceipt && bankConfig && (
          <div className="rounded-xl border border-border bg-card p-4 mb-4 space-y-3">
            <div>
              <div className="font-display font-semibold">{t("Bank payment receipt", "የባንክ ክፍያ ደረሰኝ")}</div>
            </div>
            <div>
              <label className="text-xs text-muted-foreground">
                {t(bankConfig.referenceLabel, bankConfig.referenceAmLabel)}
              </label>
              <input
                value={bankPaymentReference}
                disabled={!receipt}
                onChange={(e) => setBankPaymentReference(e.target.value)}
                placeholder={bankConfig.referencePlaceholder}
                className="w-full mt-1 h-10 px-3 rounded-lg border border-border bg-card text-sm font-mono focus:outline-none focus:ring-2 focus:ring-ring/40 disabled:opacity-50"
              />
            </div>
            {bankConfig.accountSuffix && (
              <div>
                <label className="text-xs text-muted-foreground">
                  {t(bankConfig.accountSuffix.label, bankConfig.accountSuffix.amLabel)}
                </label>
                <input
                  value={accountSuffix}
                  disabled={!receipt}
                  maxLength={bankConfig.accountSuffix.maxLength}
                  onChange={(e) =>
                    setAccountSuffix(
                      e.target.value.replace(/\D/g, "").slice(0, bankConfig.accountSuffix!.maxLength),
                    )
                  }
                  placeholder={bankConfig.accountSuffix.placeholder}
                  className="w-full mt-1 h-10 px-3 rounded-lg border border-border bg-card text-sm font-mono focus:outline-none focus:ring-2 focus:ring-ring/40 disabled:opacity-50"
                />
              </div>
            )}
            {bankConfig.phone && (
              <div>
                <label className="text-xs text-muted-foreground">
                  {t(bankConfig.phone.label, bankConfig.phone.amLabel)}
                </label>
                <input
                  value={payerPhone}
                  disabled={!receipt}
                  onChange={(e) => setPayerPhone(e.target.value)}
                  placeholder={bankConfig.phone.placeholder}
                  className="w-full mt-1 h-10 px-3 rounded-lg border border-border bg-card text-sm focus:outline-none focus:ring-2 focus:ring-ring/40 disabled:opacity-50"
                />
              </div>
            )}
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                disabled={
                  !receipt ||
                  !isBankVerifyReady(method, bankPaymentReference, accountSuffix) ||
                  verifying ||
                  verification?.status === "verified" ||
                  Boolean(referenceAlreadyUsed(method, bankPaymentReference))
                }
                onClick={() => void verifyPaymentReceipt()}
                className="h-9 px-3 rounded-lg border border-border bg-card text-sm font-medium inline-flex items-center gap-2 hover:bg-surface-2 disabled:opacity-40"
              >
                <Icons.ShieldCheck className="size-4" />
                {verifying
                  ? t("Verifying…", "እየተረጋገጠ…")
                  : t("Verify (optional)", "አረጋግጥ (አማራጭ)")}
              </button>
              {verification?.status === "verified" && (
                <Chip tone="teff">{t("Verified", "ተረጋግጧል")}</Chip>
              )}
              {verification?.status === "recorded_unverified" && (
                <Chip tone="gold">{t("Saved without live verify", "ያለ ቀጥተኛ ማረጋገጫ ተመዝግቧል")}</Chip>
              )}
            </div>
            {verification?.status === "verified" && (
              <div className="rounded-lg bg-teff/10 text-teff px-3 py-2 text-xs space-y-1">
                <div>{verification.message}</div>
                {verification.amount != null && (
                  <div>
                    {t("Verified amount", "የተረጋገጠ መጠን")}: {formatETB(verification.amount)}
                    {verification.senderName ? ` · ${verification.senderName}` : ""}
                  </div>
                )}
                {verification.requestId && (
                  <div className="font-mono opacity-80">ID {verification.requestId}</div>
                )}
              </div>
            )}
            {(verifyError ||
              verification?.status === "failed" ||
              referenceAlreadyUsed(method, bankPaymentReference)) && (
              <div className="rounded-lg bg-destructive/10 text-destructive px-3 py-2 text-xs">
                {verifyError ||
                  verification?.message ||
                  duplicateReferenceMessage(referenceAlreadyUsed(method, bankPaymentReference)!, t)}
              </div>
            )}
          </div>
        )}

        <div className="grid sm:grid-cols-2 gap-3 mb-4">
          <div>
            <label className="text-xs text-muted-foreground">{t("Collected by waiter", "በአስተናጋጅ የተሰበሰበ")}</label>
            <select
              value={collectedByWaiter}
              onChange={(e) => setCollectedByWaiter(e.target.value)}
              className="w-full mt-1 h-10 px-3 rounded-lg border border-border bg-card text-sm focus:outline-none"
            >
              {waiterPaymentOptions.map((name) => (
                <option key={name} value={name}>
                  {name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="text-xs text-muted-foreground">{t("Received by cashier", "በካሸር የተቀበለ")}</label>
            <input
              value={receivedByCashier}
              onChange={(e) => setReceivedByCashier(e.target.value)}
              className="w-full mt-1 h-10 px-3 rounded-lg border border-border bg-card text-sm focus:outline-none focus:ring-2 focus:ring-ring/40"
            />
          </div>
          <div>
            <label className="text-xs text-muted-foreground">{t("Amount received", "የተቀበለው መጠን")}</label>
            <input
              type="number"
              min={0}
              value={amountReceived}
              disabled={!receipt}
              onChange={(e) => setAmountReceived(Number(e.target.value))}
              className="w-full mt-1 h-10 px-3 rounded-lg border border-border bg-card text-sm font-mono focus:outline-none focus:ring-2 focus:ring-ring/40 disabled:opacity-50"
            />
          </div>
          <div>
            <label className="text-xs text-muted-foreground">{t("Add waiter tip", "የአስተናጋጅ ጥቅማጥቅም ጨምር")}</label>
            <input
              type="number"
              min={0}
              step={1}
              value={manualTipAmount}
              disabled={!receipt || keepAsTip}
              onChange={(e) => updateTipAmount(Number(e.target.value))}
              className="w-full mt-1 h-10 px-3 rounded-lg border border-border bg-card text-sm font-mono focus:outline-none focus:ring-2 focus:ring-ring/40 disabled:opacity-50"
            />
            <div className="mt-1.5 flex gap-1">
              {[5, 10, 15].map((percent) => (
                <button
                  key={percent}
                  type="button"
                  disabled={!receipt}
                  onClick={() => updateTipAmount(Math.round(amountDue * percent) / 100)}
                  className="h-7 flex-1 rounded-md border border-border bg-card text-[11px] font-semibold hover:bg-surface-2 disabled:opacity-40"
                >
                  {percent}%
                </button>
              ))}
            </div>
          </div>
          <div>
            <label className="text-xs text-muted-foreground">{t("Payment time", "የክፍያ ሰዓት")}</label>
            <div className="w-full mt-1 h-10 px-3 rounded-lg border border-border bg-surface-2 text-sm flex items-center">
              {t("Recorded on confirmation", "በማረጋገጫ ተመዝግቧል")}
            </div>
          </div>
        </div>

        {extraAmount > 0 ? (
          <label className="mb-3 flex items-start gap-2 text-xs text-muted-foreground">
            <input
              type="checkbox"
              className="mt-0.5"
              checked={keepAsTip}
              onChange={(e) => {
                setKeepAsTip(e.target.checked);
                if (e.target.checked) setManualTipAmount(0);
              }}
            />
            <span>
              {t(
                "Keep extra as waiter tip (do not return change)",
                "ተጨማሪውን እንደ የአስተናጋጅ ጥቅማጥቅም ያቆዩ (ተመላሽ አይመልሱ)",
              )}
            </span>
          </label>
        ) : null}

        <div className="rounded-lg bg-surface-2 p-3 mb-4 space-y-1 text-sm">
          <div className="flex justify-between">
            <span className="text-muted-foreground">{t("Grand total", "ጠቅላላ ድምር")}</span>
            <span className="font-mono">{formatETB(amountDue)}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">{t("Amount received", "የተቀበለው መጠን")}</span>
            <span className="font-mono">{formatETB(amountReceived)}</span>
          </div>
          <div className="flex justify-between font-semibold">
            <span>{t("Change amount", "ተመላሽ መጠን")}</span>
            <span className="font-mono">{formatETB(change)}</span>
          </div>
          {tip > 0 ? (
            <div className="flex justify-between font-semibold text-gold-foreground">
              <span>{t("Waiter tip", "የአስተናጋጅ ጥቅማጥቅም")}</span>
              <span className="font-mono">{formatETB(tip)}</span>
            </div>
          ) : null}
        </div>

        <button
          onClick={() => void closeBill()}
          disabled={
            !receipt ||
            amountReceived < requiredAmount ||
            !collectedByWaiter.trim() ||
            !receivedByCashier.trim()
          }
          className="w-full h-11 rounded-lg bg-ember text-ember-foreground font-semibold shadow-[var(--shadow-glow)] inline-flex items-center justify-center gap-2 disabled:opacity-40"
        >
          <Icons.CheckCircle2 className="size-4" /> {t("Record payment and close bill", "ክፍያውን መዝግብ እና ሂሳቡን ዝጋ")}
        </button>
      </div>
    </div>
  );
}

export function ReceiptDialog({ view, onClose }: { view: ReceiptView; onClose: () => void }) {
  const { order: initialOrder, reprint } = view;
  const t = useT();
  const lang = useLang();
  const calendar = useCalendar();
  const store = useStore();
  const { user } = useAuth();
  const [printing, setPrinting] = useState(false);
  const liveOrder = store.orders.find((row) => row.id === initialOrder.id) ?? initialOrder;
  const order = liveOrder;
  const receipt = liveOrder.receipt ?? view.receipt;
  const displayReceiptDate = formatReceiptDateTime(receipt.generatedAt, lang, calendar);
  const unpaid = !order.payment || order.paymentStatus === "Unpaid";

  async function printReceipt() {
    const result = store.recordReceiptPrint(order.id);
    if (!result) return;
    setPrinting(true);
    try {
      await sendReceiptToPrinter({
        order: { ...order, receipt: result.receipt },
        receipt: result.receipt,
        reprint: result.reprint,
        lang,
        menuItems: store.menuItems,
        requestedBy: user?.name ?? t("Waiter", "አስተናጋጅ"),
      });
    } catch (error) {
      showError(error instanceof Error ? error.message : t("Could not print receipt.", "ደረሰኝ ማተም አልተቻለም።"));
    } finally {
      setPrinting(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 bg-foreground/40 backdrop-blur-sm grid place-items-center p-4">
      <div className="surface-card max-w-lg w-full !p-6 max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h3 className="font-display text-xl font-semibold">{t("Customer receipt", "የደንበኛ ደረሰኝ")}</h3>
            <p className="text-xs text-muted-foreground">
              {t("Show this bill to the customer.", "ይህን ሂሳብ ለደንበኛው ያሳዩ።")}
            </p>
          </div>
          <button
            onClick={onClose}
            className="size-8 grid place-items-center rounded-lg hover:bg-surface-2"
          >
            <Icons.X className="size-4" />
          </button>
        </div>
        <div className="font-mono text-[13px] leading-5 bg-white text-black rounded-xl border-2 border-dashed border-black/40 p-5 shadow-inner max-w-[320px] mx-auto [font-family:'Noto_Sans_Ethiopic','Nyala','Abyssinica_SIL',ui-monospace,Consolas,monospace]">
          {(reprint || (receipt.printCount ?? 0) > 1) && (
            <div className="text-center border border-black py-1 mb-3 font-bold tracking-widest text-[11px]">
              {t("REPRINT", "እንደገና አትም")}
            </div>
          )}
          <div className="text-center border-b-2 border-black pb-3 mb-3">
            <div className="font-black text-lg tracking-wide">
              {receipt.restaurantName?.trim() || "Fiker Bar and Restaurant"}
            </div>
            {receipt.branchName ? (
              <div className="mt-1 text-[11px]">{receipt.branchName}</div>
            ) : null}
          </div>

          <div className="space-y-0.5 text-[12px] mb-3">
            <div className="flex justify-between gap-3">
              <span>{t("Order", "ትዕዛዝ")}</span>
              <span className="font-semibold">{order.orderNo}</span>
            </div>
            <div className="flex justify-between gap-3">
              <span>{t("Table", "ጠረጴዛ")}</span>
              <span className="font-semibold">{order.area} · {order.tableNumber}</span>
            </div>
            <div className="flex justify-between gap-3">
              <span>{t("Waiter", "አስተናጋጅ")}</span>
              <span className="font-semibold">{order.waiter}</span>
            </div>
            <div className="flex justify-between gap-3">
              <span>{t("Date", "ቀን")}</span>
              <span>{displayReceiptDate}</span>
            </div>
          </div>

          <div className="grid grid-cols-[1fr_40px_72px] gap-2 border-y border-dashed border-black py-1 font-semibold text-[11px] uppercase tracking-wide">
            <span>{t("Item", "እቃ")}</span>
            <span className="text-right">{t("Qty", "ብዛት")}</span>
            <span className="text-right">{t("Price", "ዋጋ")}</span>
          </div>
          <div className="space-y-1 py-2">
            {order.items.map((item, index) => (
              <div
                key={`${item.menuItemId ?? item.name}-${item.station}-${index}`}
                className="grid grid-cols-[1fr_40px_72px] gap-2"
              >
                <span className="break-words">{orderLineName(item, store.menuItems, lang)}</span>
                <span className="text-right">{formatOrderQty(item.qty, item.unitLabel, lang)}</span>
                <span className="text-right font-semibold">
                  {formatReceiptAmount((item.unitPrice ?? 0) * item.qty)}
                </span>
              </div>
            ))}
          </div>

          <div className="mt-2 flex justify-between gap-4 border-t-2 border-black pt-3 font-black text-base">
            <span>{t("TOTAL", "ጠቅላላ")}</span>
            <span>{formatReceiptAmount(receipt.grandTotal)}</span>
          </div>
          {order.payment ? (
            <div className="mt-3 space-y-0.5 border-t border-dashed border-black pt-2 text-[12px]">
              <div className="flex justify-between gap-3">
                <span>{t("Paid", "ተከፍሏል")}</span>
                <span className="font-semibold">{formatReceiptAmount(order.payment.amountReceived)}</span>
              </div>
              {order.payment.changeAmount > 0 ? (
                <div className="flex justify-between gap-3">
                  <span>{t("Change", "ተመላሽ")}</span>
                  <span className="font-semibold">{formatReceiptAmount(order.payment.changeAmount)}</span>
                </div>
              ) : null}
              {(order.payment.tipAmount ?? 0) > 0 ? (
                <div className="flex justify-between gap-3">
                  <span>{t("Tip", "ጥቅማጥቅም")}</span>
                  <span className="font-semibold">{formatReceiptAmount(order.payment.tipAmount ?? 0)}</span>
                </div>
              ) : null}
              {order.payment.collectedByWaiter ? (
                <div className="flex justify-between gap-3">
                  <span>{t("Waiter", "አስተናጋጅ")}</span>
                  <span>{order.payment.collectedByWaiter}</span>
                </div>
              ) : null}
            </div>
          ) : (
            <div className="mt-3 border-t border-dashed border-black pt-2 text-center text-[11px] font-semibold uppercase tracking-wide">
              {t("Unpaid", "ያልተከፈለ")}
            </div>
          )}
        </div>
        {unpaid ? (
          <p className="mt-3 text-center text-xs text-muted-foreground">
            {t("Take this to the cashier for payment.", "ክፍያውን ለካሸር ይውሰዱ።")}
          </p>
        ) : null}
        <div className="mt-4 grid grid-cols-1 gap-2 sm:grid-cols-2">
          <button
            type="button"
            onClick={() => void printReceipt()}
            disabled={printing}
            className="h-10 rounded-lg bg-foreground text-background text-sm font-semibold inline-flex items-center justify-center gap-2 disabled:opacity-50"
          >
            <Icons.Printer className="size-4" />
            {printing ? t("Printing…", "በማተም…") : t("Print for customer", "ለደንበኛ አትም")}
          </button>
          <button
            onClick={onClose}
            className="h-10 rounded-lg bg-ember text-ember-foreground text-sm font-semibold"
          >
            {t("Done", "ተጠናቋል")}
          </button>
        </div>
      </div>
    </div>
  );
}
