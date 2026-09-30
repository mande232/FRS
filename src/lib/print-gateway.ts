import {
  defaultPrintGatewayCode,
  fetchGatewayQueueStats,
  fetchPrintGatewayByCode,
  gatewayLooksOnline,
  listPrintJobs,
  subscribePrintJobs,
  type PrintGateway,
  type PrintJob,
} from "./print-jobs.ts";

export type PrintGatewaySnapshot = {
  gateway: PrintGateway | null;
  online: boolean;
  queued: number;
  failed: number;
  printing: number;
  waiting: number;
  lastPrintedAt?: string;
  recentJobs: PrintJob[];
};

export async function loadPrintGatewaySnapshot(): Promise<PrintGatewaySnapshot> {
  const gateway = await fetchPrintGatewayByCode(defaultPrintGatewayCode());
  const stats = await fetchGatewayQueueStats(gateway?.id);
  const recentJobs = gateway
    ? await listPrintJobs({ gatewayId: gateway.id, limit: 30 })
    : [];
  const online = gatewayLooksOnline(gateway);
  return {
    gateway,
    online,
    queued: stats.queued,
    failed: stats.failed,
    printing: stats.printing,
    waiting: stats.queued + stats.failed + stats.printing,
    lastPrintedAt: stats.lastPrintedAt,
    recentJobs,
  };
}

export { subscribePrintJobs, defaultPrintGatewayCode };
