import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import type { PaymentVerificationResult } from "../verify-et";

const verifyPayloadSchema = z.object({
  bank: z.enum([
    "cbe",
    "boa",
    "telebirr",
    "mpesa",
    "cbebirr",
    "dashen",
    "awash",
    "siinqee",
    "kaafiebirr",
  ]),
  reference: z.string().trim().min(3).max(80),
  accountSuffix: z.string().trim().regex(/^\d{8}$/).optional(),
  phoneNumber: z.string().trim().optional(),
  settlementAccount: z.string().trim().optional(),
  expectedAmount: z.number().nonnegative().optional(),
  orderNo: z.string().trim().optional(),
});

type VerifyInput = z.infer<typeof verifyPayloadSchema>;

function getVerifyEtApiKey() {
  return (
    process.env.VERIFY_ET_API_KEY ||
    process.env.VITE_VERIFY_ET_API_KEY ||
    ""
  ).trim();
}

function getDefaultSettlementAccount() {
  return (process.env.VERIFY_ET_SETTLEMENT_ACCOUNT || "").trim() || undefined;
}

function buildUpstreamBody(data: VerifyInput) {
  const body: Record<string, string> = { bank: data.bank };
  const reference = data.reference.trim();
  if (data.bank === "telebirr" || data.bank === "mpesa") {
    body.transactionNumber = reference;
  } else if (data.bank === "cbe" || data.bank === "boa" || data.bank === "dashen") {
    body.referenceNumber = reference;
    if (data.bank === "cbe" && data.accountSuffix) {
      body.accountSuffix = data.accountSuffix;
      body.suffix = data.accountSuffix;
    }
  } else if (data.bank === "cbebirr") {
    body.receiptNumber = reference;
    if (data.phoneNumber) body.phoneNumber = data.phoneNumber;
  } else {
    body.reference = reference;
  }
  if (data.phoneNumber && (data.bank === "telebirr" || data.bank === "mpesa" || data.bank === "kaafiebirr")) {
    body.phoneNumber = data.phoneNumber;
  }
  const settlement = data.settlementAccount || getDefaultSettlementAccount();
  if (settlement) body.settlementAccount = settlement;
  return body;
}

async function pollVerificationStatus(apiKey: string, requestId: string, attempts = 6) {
  for (let i = 0; i < attempts; i++) {
    await new Promise((resolve) => setTimeout(resolve, 1500));
    const response = await fetch(`https://verify.et/api/verify/${requestId}`, {
      headers: { "x-api-key": apiKey },
    });
    const json = (await response.json()) as {
      success?: boolean;
      message?: string;
      data?: {
        processingStatus?: string;
        status?: string;
        verified?: boolean;
        completedAt?: string;
      };
    };
    const processing = json.data?.processingStatus;
    if (processing === "completed" || json.data?.verified) {
      return json;
    }
    if (processing === "failed" || json.data?.status === "failed") {
      return json;
    }
  }
  return null;
}

function normalizeResult(
  envelope: {
    success?: boolean;
    message?: string;
    requestId?: string;
    data?: unknown;
    verification?: {
      requestId?: string;
      processingStatus?: string;
      status?: string;
      verified?: boolean;
    };
  },
  expectedAmount?: number,
): PaymentVerificationResult {
  const requestId = envelope.requestId || envelope.verification?.requestId;
  const rows = Array.isArray(envelope.data) ? envelope.data : [];
  const first = (rows[0] ?? null) as
    | {
        verified?: boolean;
        status?: string;
        amount?: number | string;
        currency?: string;
        senderName?: string;
        receiverName?: string;
        referenceNumber?: string;
        transactionNumber?: string;
        receiptNumber?: string;
        bank?: string;
        settlementAccountMatch?: { matched?: boolean };
      }
    | null;

  if (first?.verified || first?.status === "success" || envelope.verification?.verified) {
    const amount = first?.amount != null ? Number(first.amount) : undefined;
    if (
      expectedAmount != null &&
      amount != null &&
      Number.isFinite(amount) &&
      Math.abs(amount - expectedAmount) > 1
    ) {
      return {
        status: "failed",
        requestId,
        bank: first?.bank,
        amount,
        currency: first?.currency,
        senderName: first?.senderName,
        receiverName: first?.receiverName,
        referenceNumber:
          first?.referenceNumber || first?.transactionNumber || first?.receiptNumber,
        message: `Verified amount ${amount} does not match bill ${expectedAmount}.`,
        settlementMatched: first?.settlementAccountMatch?.matched,
        verifiedAt: new Date().toISOString(),
      };
    }
    return {
      status: "verified",
      requestId,
      bank: first?.bank,
      amount,
      currency: first?.currency,
      senderName: first?.senderName,
      receiverName: first?.receiverName,
      referenceNumber:
        first?.referenceNumber || first?.transactionNumber || first?.receiptNumber,
      message: envelope.message || "Transaction verified successfully.",
      settlementMatched: first?.settlementAccountMatch?.matched,
      verifiedAt: new Date().toISOString(),
    };
  }

  return {
    status: "failed",
    requestId,
    message: envelope.message || "Verification did not succeed.",
  };
}

export const verifyBankPayment = createServerFn({ method: "POST" })
  .validator(verifyPayloadSchema)
  .handler(async ({ data }): Promise<PaymentVerificationResult> => {
    const apiKey = getVerifyEtApiKey();
    if (!apiKey) {
      return {
        status: "unavailable",
        message:
          "Verify.ET API key is not configured (VERIFY_ET_API_KEY). Record the receipt number without live verification.",
        referenceNumber: data.reference,
      };
    }

    const body = buildUpstreamBody(data);
    const idempotencyKey = `ethioplate-${data.orderNo || "order"}-${data.bank}-${data.reference}`.slice(
      0,
      120,
    );

    try {
      const response = await fetch("https://verify.et/api/verify?waitMs=8000", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": apiKey,
          "Idempotency-Key": idempotencyKey,
        },
        body: JSON.stringify(body),
      });

      const json = (await response.json()) as {
        success?: boolean;
        message?: string;
        requestId?: string;
        data?: unknown;
        verification?: {
          requestId?: string;
          processingStatus?: string;
          status?: string;
          verified?: boolean;
        };
        links?: { statusUrl?: string };
      };

      if (response.status === 202 && json.requestId) {
        const polled = await pollVerificationStatus(apiKey, json.requestId);
        if (polled) {
          return normalizeResult(
            {
              ...polled,
              requestId: json.requestId,
              data: Array.isArray((polled as { data?: unknown }).data)
                ? (polled as { data: unknown }).data
                : json.data,
            },
            data.expectedAmount,
          );
        }
        return {
          status: "failed",
          requestId: json.requestId,
          message: json.message || "Verification is still pending. Try again shortly.",
        };
      }

      if (!response.ok) {
        return {
          status: "failed",
          requestId: json.requestId,
          message: json.message || `Verify.ET error (${response.status}).`,
          referenceNumber: data.reference,
        };
      }

      return normalizeResult(json, data.expectedAmount);
    } catch (error) {
      return {
        status: "failed",
        message: error instanceof Error ? error.message : "Verify.ET request failed.",
        referenceNumber: data.reference,
      };
    }
  });
