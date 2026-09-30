import { isSupabaseConfigured, requireSupabase } from "./supabase/client.ts";
import { loadPosPrinterSettings, resolvedPrinterMode } from "./pos-printer.ts";

export type PrintJobStatus =
  | "QUEUED"
  | "CLAIMED"
  | "PRINTING"
  | "PRINTED"
  | "FAILED"
  | "CANCELLED";

export type PrintJobType = "STATION_BONO" | "CUSTOMER_RECEIPT" | "REPRINT" | "TEST";

export type PrintJobPayload = {
  text: string;
  station?: string;
  paperWidth?: "58mm" | "80mm";
  orderNo?: string;
  tableNumber?: string;
  area?: string;
  meta?: Record<string, unknown>;
};

export type PrintJob = {
  id: string;
  orderId?: string;
  printerId?: string;
  gatewayId: string;
  jobType: PrintJobType;
  status: PrintJobStatus;
  payload: PrintJobPayload;
  attemptCount: number;
  maxAttempts: number;
  requestedBy?: string;
  claimedBy?: string;
  claimedAt?: string;
  printedAt?: string;
  failedAt?: string;
  errorMessage?: string;
  reprintOf?: string;
  reprintReason?: string;
  idempotencyKey: string;
  createdAt: string;
  updatedAt: string;
};

export type PrintGateway = {
  id: string;
  code: string;
  name: string;
  branch: string;
  status: "ONLINE" | "OFFLINE" | "DEGRADED";
  lastSeenAt?: string;
  claimedByUserId?: string;
  createdAt: string;
  updatedAt: string;
};

export type PrinterRecord = {
  id: string;
  name: string;
  printerType: string;
  connectionType: "bluetooth" | "network" | "windows";
  stationId?: string;
  gatewayId: string;
  paperWidth: "58mm" | "80mm";
  status: "ONLINE" | "OFFLINE" | "DEGRADED";
  lastSeenAt?: string;
};

const DEFAULT_GATEWAY_CODE = "CASHIER-LAPTOP-01";
const DEFAULT_GATEWAY_ID = "gw-cashier-laptop-01";
const DEFAULT_PRINTER_ID = "prt-main-receipt";

type PrintJobRow = {
  id: string;
  order_id: string | null;
  printer_id: string | null;
  gateway_id: string;
  job_type: PrintJobType;
  status: PrintJobStatus;
  payload: PrintJobPayload | null;
  attempt_count: number;
  max_attempts: number;
  requested_by: string | null;
  claimed_by: string | null;
  claimed_at: string | null;
  printed_at: string | null;
  failed_at: string | null;
  error_message: string | null;
  reprint_of: string | null;
  reprint_reason: string | null;
  idempotency_key: string;
  created_at: string;
  updated_at: string;
};

type GatewayRow = {
  id: string;
  code: string;
  name: string;
  branch: string;
  status: PrintGateway["status"];
  last_seen_at: string | null;
  claimed_by_user_id: string | null;
  created_at: string;
  updated_at: string;
};

type PrinterRow = {
  id: string;
  name: string;
  printer_type: string;
  connection_type: PrinterRecord["connectionType"];
  station_id: string | null;
  gateway_id: string;
  paper_width: "58mm" | "80mm";
  status: PrinterRecord["status"];
  last_seen_at: string | null;
};

function jobFromRow(row: PrintJobRow): PrintJob {
  return {
    id: row.id,
    orderId: row.order_id ?? undefined,
    printerId: row.printer_id ?? undefined,
    gatewayId: row.gateway_id,
    jobType: row.job_type,
    status: row.status,
    payload: row.payload ?? { text: "" },
    attemptCount: row.attempt_count,
    maxAttempts: row.max_attempts,
    requestedBy: row.requested_by ?? undefined,
    claimedBy: row.claimed_by ?? undefined,
    claimedAt: row.claimed_at ?? undefined,
    printedAt: row.printed_at ?? undefined,
    failedAt: row.failed_at ?? undefined,
    errorMessage: row.error_message ?? undefined,
    reprintOf: row.reprint_of ?? undefined,
    reprintReason: row.reprint_reason ?? undefined,
    idempotencyKey: row.idempotency_key,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function gatewayFromRow(row: GatewayRow): PrintGateway {
  return {
    id: row.id,
    code: row.code,
    name: row.name,
    branch: row.branch,
    status: row.status,
    lastSeenAt: row.last_seen_at ?? undefined,
    claimedByUserId: row.claimed_by_user_id ?? undefined,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function printerFromRow(row: PrinterRow): PrinterRecord {
  return {
    id: row.id,
    name: row.name,
    printerType: row.printer_type,
    connectionType: row.connection_type,
    stationId: row.station_id ?? undefined,
    gatewayId: row.gateway_id,
    paperWidth: row.paper_width,
    status: row.status,
    lastSeenAt: row.last_seen_at ?? undefined,
  };
}

export function isPrintGatewayMode() {
  return resolvedPrinterMode() === "gateway";
}

export function defaultPrintGatewayCode() {
  return loadPosPrinterSettings().gatewayCode?.trim() || DEFAULT_GATEWAY_CODE;
}

function newJobId(prefix: string) {
  const stamp = new Date().toISOString().slice(0, 10).replaceAll("-", "");
  const rand = Math.random().toString(36).slice(2, 8).toUpperCase();
  return `PJ-${stamp}-${prefix}-${rand}`;
}

async function resolveGatewayAndPrinter(branch?: string): Promise<{
  gateway: PrintGateway;
  printer: PrinterRecord;
}> {
  const client = requireSupabase();
  const code = defaultPrintGatewayCode();
  const { data: gatewayRow, error: gatewayError } = await client
    .from("print_gateways")
    .select("*")
    .eq("code", code)
    .maybeSingle();
  if (gatewayError) throw gatewayError;

  let gateway = gatewayRow ? gatewayFromRow(gatewayRow as GatewayRow) : null;
  if (!gateway) {
    const seed: GatewayRow = {
      id: DEFAULT_GATEWAY_ID,
      code,
      name: "Cashier Laptop",
      branch: branch?.trim() || "Main",
      status: "OFFLINE",
      last_seen_at: null,
      claimed_by_user_id: null,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
    const { data, error } = await client.from("print_gateways").upsert(seed).select("*").single();
    if (error) throw error;
    gateway = gatewayFromRow(data as GatewayRow);
  }

  const { data: printerRows, error: printerError } = await client
    .from("printers")
    .select("*")
    .eq("gateway_id", gateway.id)
    .order("created_at", { ascending: true })
    .limit(1);
  if (printerError) throw printerError;

  let printer = printerRows?.[0] ? printerFromRow(printerRows[0] as PrinterRow) : null;
  if (!printer) {
    const seed: PrinterRow = {
      id: DEFAULT_PRINTER_ID,
      name: "Main Receipt Printer",
      printer_type: "thermal",
      connection_type: "windows",
      station_id: null,
      gateway_id: gateway.id,
      paper_width: loadPosPrinterSettings().paperWidth,
      status: "OFFLINE",
      last_seen_at: null,
    };
    const { data, error } = await client.from("printers").upsert(seed).select("*").single();
    if (error) throw error;
    printer = printerFromRow(data as PrinterRow);
  }

  return { gateway, printer };
}

export type EnqueuePrintJobInput = {
  orderId?: string;
  jobType: PrintJobType;
  payload: PrintJobPayload;
  idempotencyKey: string;
  requestedBy?: string;
  reprintOf?: string;
  reprintReason?: string;
  branch?: string;
};

export async function enqueuePrintJob(
  input: EnqueuePrintJobInput,
): Promise<{ ok: true; job: PrintJob; created: boolean } | { ok: false; error: string }> {
  if (!isSupabaseConfigured) {
    return { ok: false, error: "Supabase is not configured for print jobs." };
  }
  try {
    const client = requireSupabase();
    const { gateway, printer } = await resolveGatewayAndPrinter(input.branch);

    const { data: existing, error: existingError } = await client
      .from("print_jobs")
      .select("*")
      .eq("idempotency_key", input.idempotencyKey)
      .maybeSingle();
    if (existingError) throw existingError;
    if (existing) {
      return { ok: true, job: jobFromRow(existing as PrintJobRow), created: false };
    }

    const row = {
      id: newJobId(input.jobType === "STATION_BONO" ? "BONO" : "RCPT"),
      order_id: input.orderId ?? null,
      printer_id: printer.id,
      gateway_id: gateway.id,
      job_type: input.jobType,
      status: "QUEUED" as const,
      payload: {
        ...input.payload,
        paperWidth: input.payload.paperWidth ?? printer.paperWidth,
      },
      attempt_count: 0,
      max_attempts: 5,
      requested_by: input.requestedBy ?? null,
      reprint_of: input.reprintOf ?? null,
      reprint_reason: input.reprintReason ?? null,
      idempotency_key: input.idempotencyKey,
      updated_at: new Date().toISOString(),
    };

    const { data, error } = await client.from("print_jobs").insert(row).select("*").single();
    if (error) {
      // Concurrent insert with same idempotency key
      if (String(error.code) === "23505") {
        const { data: again } = await client
          .from("print_jobs")
          .select("*")
          .eq("idempotency_key", input.idempotencyKey)
          .maybeSingle();
        if (again) return { ok: true, job: jobFromRow(again as PrintJobRow), created: false };
      }
      throw error;
    }

    const job = jobFromRow(data as PrintJobRow);
    await client.from("print_job_events").insert({
      job_id: job.id,
      gateway_id: job.gatewayId,
      printer_id: job.printerId ?? null,
      order_id: job.orderId ?? null,
      event_type: "PRINT_JOB_CREATED",
      actor: input.requestedBy ?? null,
      detail: input.jobType,
      meta: { idempotency_key: input.idempotencyKey },
    });

    return { ok: true, job, created: true };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

export type StationBonoEnqueueItem = {
  orderId: string;
  orderNo?: string;
  tableNumber?: string;
  area?: string;
  ticketId: string;
  station: string;
  text: string;
  batchKey?: string;
};

export async function enqueueStationBonoJobs(
  items: StationBonoEnqueueItem[],
  requestedBy?: string,
  branch?: string,
): Promise<{ ok: boolean; queued: number; error?: string; jobs: PrintJob[] }> {
  const jobs: PrintJob[] = [];
  for (const item of items) {
    const batch = item.batchKey ?? new Date().toISOString().slice(0, 16);
    const result = await enqueuePrintJob({
      orderId: item.orderId,
      jobType: "STATION_BONO",
      requestedBy,
      branch,
      idempotencyKey: `bono:${item.orderId}:${item.ticketId}:${batch}`,
      payload: {
        text: item.text,
        station: item.station,
        orderNo: item.orderNo,
        tableNumber: item.tableNumber,
        area: item.area,
        meta: { ticketId: item.ticketId },
      },
    });
    if (!result.ok) return { ok: false, queued: jobs.length, error: result.error, jobs };
    jobs.push(result.job);
  }
  return { ok: true, queued: jobs.length, jobs };
}

export async function enqueueCustomerReceiptJob(input: {
  orderId: string;
  orderNo?: string;
  tableNumber?: string;
  area?: string;
  text: string;
  printCount: number;
  requestedBy?: string;
  branch?: string;
}) {
  return enqueuePrintJob({
    orderId: input.orderId,
    jobType: "CUSTOMER_RECEIPT",
    requestedBy: input.requestedBy,
    branch: input.branch,
    idempotencyKey: `receipt:${input.orderId}:${input.printCount}`,
    payload: {
      text: input.text,
      orderNo: input.orderNo,
      tableNumber: input.tableNumber,
      area: input.area,
      meta: { printCount: input.printCount },
    },
  });
}

export async function enqueueTestPrintJob(input?: { requestedBy?: string; branch?: string; text?: string }) {
  const stamp = Date.now();
  return enqueuePrintJob({
    jobType: "TEST",
    requestedBy: input?.requestedBy,
    branch: input?.branch,
    idempotencyKey: `test:${stamp}`,
    payload: {
      text:
        input?.text ??
        [
          "----------------------------",
          "      POS PRINTER TEST",
          "----------------------------",
          `Queued: ${new Date(stamp).toLocaleString("en-GB")}`,
          "Cashier print gateway",
          "PRINTER READY",
          "----------------------------",
        ].join("\n"),
      meta: { test: true },
    },
  });
}

export async function requestReprint(input: {
  originalJobId: string;
  reason: string;
  requestedBy: string;
  branch?: string;
}) {
  if (!isSupabaseConfigured) return { ok: false as const, error: "Supabase is not configured." };
  try {
    const client = requireSupabase();
    const { data: original, error } = await client
      .from("print_jobs")
      .select("*")
      .eq("id", input.originalJobId)
      .single();
    if (error) throw error;
    const source = jobFromRow(original as PrintJobRow);
    const result = await enqueuePrintJob({
      orderId: source.orderId,
      jobType: "REPRINT",
      requestedBy: input.requestedBy,
      branch: input.branch,
      reprintOf: source.id,
      reprintReason: input.reason,
      idempotencyKey: `reprint:${source.id}:${Date.now()}`,
      payload: source.payload,
    });
    if (result.ok) {
      await client.from("print_job_events").insert({
        job_id: result.job.id,
        gateway_id: result.job.gatewayId,
        printer_id: result.job.printerId ?? null,
        order_id: result.job.orderId ?? null,
        event_type: "REPRINT_REQUESTED",
        actor: input.requestedBy,
        detail: input.reason,
        meta: { reprint_of: source.id },
      });
    }
    return result;
  } catch (error) {
    return { ok: false as const, error: error instanceof Error ? error.message : String(error) };
  }
}

export async function listPrintJobs(filters?: {
  status?: PrintJobStatus | PrintJobStatus[];
  gatewayId?: string;
  limit?: number;
}) {
  if (!isSupabaseConfigured) return [] as PrintJob[];
  const client = requireSupabase();
  let query = client.from("print_jobs").select("*").order("created_at", { ascending: false });
  if (filters?.gatewayId) query = query.eq("gateway_id", filters.gatewayId);
  if (filters?.status) {
    const statuses = Array.isArray(filters.status) ? filters.status : [filters.status];
    query = query.in("status", statuses);
  }
  query = query.limit(filters?.limit ?? 50);
  const { data, error } = await query;
  if (error) throw error;
  return (data as PrintJobRow[]).map(jobFromRow);
}

export async function retryFailedPrintJob(jobId: string) {
  if (!isSupabaseConfigured) throw new Error("Supabase is not configured.");
  const client = requireSupabase();
  const { data: existing, error: loadError } = await client
    .from("print_jobs")
    .select("*")
    .eq("id", jobId)
    .maybeSingle();
  if (loadError) throw loadError;
  if (!existing) throw new Error("Print job not found.");
  const job = jobFromRow(existing as PrintJobRow);
  if (job.status !== "FAILED") {
    throw new Error("Only failed print jobs can be retried from the print gateway.");
  }
  const { data, error } = await client.rpc("retry_failed_print_job", { p_job_id: jobId });
  if (error) throw error;
  return jobFromRow(data as PrintJobRow);
}

export async function fetchPrintGatewayByCode(code = defaultPrintGatewayCode()) {
  if (!isSupabaseConfigured) return null;
  const client = requireSupabase();
  const { data, error } = await client.from("print_gateways").select("*").eq("code", code).maybeSingle();
  if (error) throw error;
  return data ? gatewayFromRow(data as GatewayRow) : null;
}

export async function fetchGatewayQueueStats(gatewayId?: string) {
  if (!isSupabaseConfigured) {
    return { queued: 0, failed: 0, printing: 0, lastPrintedAt: undefined as string | undefined };
  }
  const client = requireSupabase();
  let id = gatewayId;
  if (!id) {
    const gateway = await fetchPrintGatewayByCode();
    id = gateway?.id;
  }
  if (!id) return { queued: 0, failed: 0, printing: 0, lastPrintedAt: undefined };

  const [{ count: queued }, { count: failed }, { count: printing }, last] = await Promise.all([
    client.from("print_jobs").select("*", { count: "exact", head: true }).eq("gateway_id", id).eq("status", "QUEUED"),
    client.from("print_jobs").select("*", { count: "exact", head: true }).eq("gateway_id", id).eq("status", "FAILED"),
    client
      .from("print_jobs")
      .select("*", { count: "exact", head: true })
      .eq("gateway_id", id)
      .in("status", ["CLAIMED", "PRINTING"]),
    client
      .from("print_jobs")
      .select("printed_at")
      .eq("gateway_id", id)
      .eq("status", "PRINTED")
      .order("printed_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
  ]);

  return {
    queued: queued ?? 0,
    failed: failed ?? 0,
    printing: printing ?? 0,
    lastPrintedAt: (last.data as { printed_at?: string } | null)?.printed_at ?? undefined,
  };
}

export function subscribePrintJobs(
  gatewayId: string,
  onChange: () => void,
): () => void {
  if (!isSupabaseConfigured) return () => undefined;
  const client = requireSupabase();
  const channel = client
    .channel(`print-jobs-${gatewayId}`)
    .on(
      "postgres_changes",
      { event: "*", schema: "public", table: "print_jobs", filter: `gateway_id=eq.${gatewayId}` },
      () => onChange(),
    )
    .on(
      "postgres_changes",
      { event: "*", schema: "public", table: "print_gateways", filter: `id=eq.${gatewayId}` },
      () => onChange(),
    )
    .subscribe();
  return () => {
    void client.removeChannel(channel);
  };
}

export function gatewayLooksOnline(gateway: PrintGateway | null | undefined, maxAgeMs = 45_000) {
  if (!gateway || gateway.status === "OFFLINE") return false;
  if (!gateway.lastSeenAt) return false;
  const age = Date.now() - new Date(gateway.lastSeenAt).getTime();
  return Number.isFinite(age) && age <= maxAgeMs && gateway.status !== "OFFLINE";
}
