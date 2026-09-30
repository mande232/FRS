/** Verify.ET bank payment verification helpers — see https://verify.et/docs/api */
import type { OrderPayment, PaymentMethod } from "@/lib/demo-data";

export type VerifyEtBank =
  | "cbe"
  | "boa"
  | "telebirr"
  | "mpesa"
  | "cbebirr"
  | "dashen"
  | "awash"
  | "siinqee"
  | "kaafiebirr";

export type PaymentVerificationStatus =
  | "idle"
  | "verifying"
  | "verified"
  | "failed"
  | "recorded_unverified"
  | "unavailable";

export type PaymentVerificationResult = {
  status: PaymentVerificationStatus;
  requestId?: string;
  bank?: string;
  amount?: number;
  currency?: string;
  senderName?: string;
  receiverName?: string;
  referenceNumber?: string;
  message?: string;
  settlementMatched?: boolean;
  verifiedAt?: string;
};

export type BankFieldConfig = {
  referenceLabel: string;
  referenceAmLabel: string;
  referencePlaceholder: string;
  accountSuffix?: { label: string; amLabel: string; maxLength: number; placeholder: string };
  phone?: { label: string; amLabel: string; placeholder: string };
};

export const BANK_FIELD_CONFIG: Record<VerifyEtBank, BankFieldConfig> = {
  cbe: {
    referenceLabel: "Reference number",
    referenceAmLabel: "የማጣቀሻ ቁጥር",
    referencePlaceholder: "e.g. FT1234567890",
    accountSuffix: {
      label: "Account suffix (last 8 digits)",
      amLabel: "የመለያ መጨረሻ (8 አሃዝ)",
      maxLength: 8,
      placeholder: "12345678",
    },
  },
  telebirr: {
    referenceLabel: "Transaction number",
    referenceAmLabel: "የግብይት ቁጥር",
    referencePlaceholder: "e.g. DET8FJGUJ4",
  },
  dashen: {
    referenceLabel: "Reference number",
    referenceAmLabel: "የማጣቀሻ ቁጥር",
    referencePlaceholder: "e.g. DSH123456",
  },
  boa: {
    referenceLabel: "Reference number",
    referenceAmLabel: "የማጣቀሻ ቁጥር",
    referencePlaceholder: "e.g. BOA789012",
  },
  cbebirr: {
    referenceLabel: "Receipt number",
    referenceAmLabel: "የደረሰኝ ቁጥር",
    referencePlaceholder: "e.g. CB1234567",
    phone: {
      label: "Phone (251XXXXXXXXX)",
      amLabel: "ስልክ (251XXXXXXXXX)",
      placeholder: "251XXXXXXXXX",
    },
  },
  awash: {
    referenceLabel: "Receipt URL or token",
    referenceAmLabel: "የደረሰኝ URL ወይም ቶከን",
    referencePlaceholder: "e.g. AWH-TOKEN-123",
  },
  mpesa: {
    referenceLabel: "Transaction number",
    referenceAmLabel: "የግብይት ቁጥር",
    referencePlaceholder: "e.g. SG12ABC456",
  },
  siinqee: {
    referenceLabel: "Receipt URL or token",
    referenceAmLabel: "የደረሰኝ URL ወይም ቶከን",
    referencePlaceholder: "e.g. SQ-TOKEN-789",
  },
  kaafiebirr: {
    referenceLabel: "Receipt URL or token",
    referenceAmLabel: "የደረሰኝ URL ወይም ቶከን",
    referencePlaceholder: "e.g. KE-TOKEN-456",
    phone: {
      label: "Phone (optional)",
      amLabel: "ስልክ (አማራጭ)",
      placeholder: "09xxxxxxxx",
    },
  },
};

const PAYMENT_TO_BANK: Record<string, VerifyEtBank> = {
  CBE: "cbe",
  Telebirr: "telebirr",
  "CBE Birr": "cbebirr",
  Dashen: "dashen",
  BOA: "boa",
  Awash: "awash",
  MPESA: "mpesa",
  Siinqee: "siinqee",
  "Kaafi Ebirr": "kaafiebirr",
};

export function paymentMethodRequiresBankReceipt(method: PaymentMethod): boolean {
  return method in PAYMENT_TO_BANK;
}

export function mapPaymentMethodToVerifyBank(method: PaymentMethod): VerifyEtBank | null {
  return PAYMENT_TO_BANK[method] ?? null;
}

export function getBankFieldConfig(method: PaymentMethod): BankFieldConfig | null {
  const bank = PAYMENT_TO_BANK[method];
  return bank ? BANK_FIELD_CONFIG[bank] : null;
}

export function isBankVerifyReady(method: PaymentMethod, reference: string, accountSuffix = ""): boolean {
  if (!reference.trim()) return false;
  const cfg = getBankFieldConfig(method);
  if (cfg?.accountSuffix) {
    return accountSuffix.replace(/\D/g, "").length === cfg.accountSuffix.maxLength;
  }
  return true;
}

const verifiedReferenceKeys = new Set<string>();
const VERIFIED_REFS_STORAGE_KEY = "ethioplate.verified-bank-refs";

function readPersistedVerifiedRefs(): Set<string> {
  if (typeof window === "undefined") return new Set();
  try {
    const raw = window.localStorage.getItem(VERIFIED_REFS_STORAGE_KEY);
    if (!raw) return new Set();
    const rows = JSON.parse(raw) as string[];
    return new Set(Array.isArray(rows) ? rows : []);
  } catch {
    return new Set();
  }
}

function rememberVerifiedReferenceKey(key: string) {
  verifiedReferenceKeys.add(key);
  if (typeof window === "undefined") return;
  const persisted = readPersistedVerifiedRefs();
  persisted.add(key);
  window.localStorage.setItem(VERIFIED_REFS_STORAGE_KEY, JSON.stringify([...persisted]));
}

export function normalizeBankPaymentReference(reference: string) {
  return reference.trim().replace(/\s+/g, "").toUpperCase();
}

export function bankPaymentReferenceKey(method: PaymentMethod, reference: string): string | null {
  const bank = mapPaymentMethodToVerifyBank(method);
  const normalized = normalizeBankPaymentReference(reference);
  if (!bank || !normalized) return null;
  return `${bank}:${normalized}`;
}

export type UsedBankPaymentReference = {
  source: "verified_session" | "paid_order";
  method: PaymentMethod;
  orderId?: string;
  orderNo?: string;
};

export function markBankReferenceVerified(method: PaymentMethod, reference: string) {
  const key = bankPaymentReferenceKey(method, reference);
  if (key) rememberVerifiedReferenceKey(key);
}

export function findUsedBankPaymentReference(
  orders: ReadonlyArray<{ id: string; orderNo: string; paymentStatus: string; payment?: OrderPayment | null }>,
  method: PaymentMethod,
  reference: string,
  excludeOrderId?: string,
): UsedBankPaymentReference | null {
  const key = bankPaymentReferenceKey(method, reference);
  if (!key) return null;

  if (verifiedReferenceKeys.has(key) || readPersistedVerifiedRefs().has(key)) {
    return { source: "verified_session", method };
  }

  for (const order of orders) {
    if (excludeOrderId && order.id === excludeOrderId) continue;
    if (order.paymentStatus !== "Paid" || !order.payment) continue;

    const entries =
      order.payment.mixedBankPayments?.length
        ? order.payment.mixedBankPayments.map((entry) => ({
            method: entry.method,
            reference: entry.bankPaymentReference,
          }))
        : order.payment.bankPaymentReference && order.payment.method !== "Cash"
          ? [{ method: order.payment.method, reference: order.payment.bankPaymentReference }]
          : [];

    for (const entry of entries) {
      if (bankPaymentReferenceKey(entry.method, entry.reference) === key) {
        return {
          source: "paid_order",
          method: entry.method,
          orderId: order.id,
          orderNo: order.orderNo,
        };
      }
    }
  }

  return null;
}
