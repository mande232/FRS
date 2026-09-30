#!/usr/bin/env node
/**
 * EthioPlate print agent
 *
 * Dual mode:
 * 1) Legacy LAN agent — HTTP POST /print → TCP ESC/POS (port 9100)
 * 2) Gateway worker — claims Supabase print_jobs and prints sequentially
 *    via Windows RAW printer or network ESC/POS.
 *
 * Gateway usage (cashier laptop):
 *   set SUPABASE_URL=...
 *   set SUPABASE_ANON_KEY=...
 *   set PRINT_GATEWAY_EMAIL=cashier@...
 *   set PRINT_GATEWAY_PASSWORD=...
 *   set PRINT_GATEWAY_CODE=CASHIER-LAPTOP-01
 *   set PRINT_ADAPTER=windows
 *   set WINDOWS_PRINTER_NAME=XP-80C
 *   npm run print-agent
 *
 * Legacy / network:
 *   POS_PRINT_AGENT_PORT=9101 POS_PRINTER_HOST=192.168.1.50 npm run print-agent
 */

import http from "node:http";
import net from "node:net";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { spawn } from "node:child_process";
import { createClient } from "@supabase/supabase-js";
import { fileURLToPath } from "node:url";

const ROOT_DIR = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_DIR = path.resolve(ROOT_DIR, "..");

function loadEnvFile(filePath) {
  if (!fs.existsSync(filePath)) return;
  const text = fs.readFileSync(filePath, "utf8");
  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (!process.env[key]) process.env[key] = value;
  }
}

loadEnvFile(path.join(PROJECT_DIR, ".env.local"));
loadEnvFile(path.join(PROJECT_DIR, ".env"));

const AGENT_PORT = Number(process.env.POS_PRINT_AGENT_PORT || 9101);
const DEFAULT_HOST = process.env.POS_PRINTER_HOST || "192.168.1.50";
const DEFAULT_PORT = Number(process.env.POS_PRINTER_PORT || 9100);
const TIMEOUT_MS = Number(process.env.POS_PRINT_TIMEOUT_MS || 8000);

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || "";
const SUPABASE_ANON_KEY =
  process.env.SUPABASE_ANON_KEY ||
  process.env.VITE_SUPABASE_ANON_KEY ||
  process.env.VITE_SUPABASE_PUBLISHABLE_KEY ||
  "";
const GATEWAY_EMAIL = process.env.PRINT_GATEWAY_EMAIL || "";
const GATEWAY_PASSWORD = process.env.PRINT_GATEWAY_PASSWORD || "";
const GATEWAY_CODE = (process.env.PRINT_GATEWAY_CODE || "CASHIER-LAPTOP-01").trim().toUpperCase();
const PRINT_ADAPTER = (process.env.PRINT_ADAPTER || "windows").trim().toLowerCase();
const WINDOWS_PRINTER_NAME = process.env.WINDOWS_PRINTER_NAME || "XP-80C";
const HEARTBEAT_MS = Number(process.env.PRINT_HEARTBEAT_MS || 10_000);
/** Fallback poll when Realtime is slow/offline. Keep low — waiter phones depend on this. */
const POLL_MS = Number(process.env.PRINT_POLL_MS || 1_000);
const WORKER_ID = process.env.PRINT_WORKER_ID || `${os.hostname()}-${process.pid}`;

const STATE_DIR = path.join(
  process.env.APPDATA || process.env.HOME || os.tmpdir(),
  "ethioplate-print-agent",
);
const PROCESSED_PATH = path.join(STATE_DIR, "processed.json");
const UNCERTAIN_PATH = path.join(STATE_DIR, "uncertain.json");

const gatewayEnabled = Boolean(SUPABASE_URL && SUPABASE_ANON_KEY && GATEWAY_EMAIL && GATEWAY_PASSWORD);

/** @type {Set<string>} */
let processedIds = new Set();
/** @type {Set<string>} */
let uncertainIds = new Set();
let busy = false;
let gatewayId = null;
let wakeQueue = false;

function ensureStateDir() {
  fs.mkdirSync(STATE_DIR, { recursive: true });
}

function loadJsonSet(filePath) {
  try {
    const raw = JSON.parse(fs.readFileSync(filePath, "utf8"));
    return new Set(Array.isArray(raw) ? raw.map(String) : []);
  } catch {
    return new Set();
  }
}

function saveJsonSet(filePath, set) {
  ensureStateDir();
  fs.writeFileSync(filePath, JSON.stringify([...set].slice(-500), null, 2));
}

function markProcessed(jobId) {
  processedIds.add(jobId);
  uncertainIds.delete(jobId);
  saveJsonSet(PROCESSED_PATH, processedIds);
  saveJsonSet(UNCERTAIN_PATH, uncertainIds);
}

function markUncertain(jobId) {
  uncertainIds.add(jobId);
  saveJsonSet(UNCERTAIN_PATH, uncertainIds);
}

function cors(res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, X-Printer-Host, X-Printer-Port");
  res.setHeader("Access-Control-Allow-Private-Network", "true");
}

function send(res, status, body) {
  cors(res);
  res.writeHead(status, { "Content-Type": "text/plain; charset=utf-8" });
  res.end(body);
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on("data", (chunk) => chunks.push(chunk));
    req.on("end", () => resolve(Buffer.concat(chunks)));
    req.on("error", reject);
  });
}

function tcpPrint(host, port, payload) {
  return new Promise((resolve, reject) => {
    const socket = net.createConnection({ host, port }, () => {
      socket.write(payload, (error) => {
        if (error) {
          socket.destroy();
          reject(error);
          return;
        }
        socket.end();
      });
    });
    socket.setTimeout(TIMEOUT_MS);
    socket.on("timeout", () => {
      socket.destroy();
      reject(new Error(`Printer timeout ${host}:${port}`));
    });
    socket.on("error", reject);
    socket.on("close", () => resolve());
  });
}

/** ESC/POS text → bytes (ASCII + Latin-1 fallback for simple tickets). */
function textToEscPos(text) {
  const init = Buffer.from([0x1b, 0x40]);
  const body = Buffer.from(String(text ?? "").replace(/\r\n/g, "\n").replace(/\r/g, "\n"), "utf8");
  const feed = Buffer.from([0x0a, 0x0a, 0x0a]);
  const cut = Buffer.from([0x1d, 0x56, 0x00]);
  return Buffer.concat([init, body, feed, cut]);
}

function listWindowsPrinters() {
  return new Promise((resolve) => {
    if (process.platform !== "win32") {
      resolve([]);
      return;
    }
    const child = spawn(
      "powershell.exe",
      ["-NoProfile", "-Command", "Get-Printer | Select-Object -ExpandProperty Name"],
      { windowsHide: true },
    );
    let stdout = "";
    child.stdout.on("data", (chunk) => {
      stdout += String(chunk);
    });
    child.on("error", () => resolve([]));
    child.on("close", () => {
      const names = stdout
        .split(/\r?\n/)
        .map((line) => line.trim())
        .filter(Boolean);
      resolve(names);
    });
  });
}

const RAW_PRINTER_HELPER_CS = `
using System;
using System.IO;
using System.Runtime.InteropServices;
public class RawPrinterHelper {
  [StructLayout(LayoutKind.Sequential, CharSet=CharSet.Ansi)]
  public class DOCINFOA {
    [MarshalAs(UnmanagedType.LPStr)] public string pDocName;
    [MarshalAs(UnmanagedType.LPStr)] public string pOutputFile;
    [MarshalAs(UnmanagedType.LPStr)] public string pDataType;
  }
  [DllImport("winspool.Drv", EntryPoint="OpenPrinterA", SetLastError=true)]
  public static extern bool OpenPrinter(string src, out IntPtr hPrinter, IntPtr pd);
  [DllImport("winspool.Drv", EntryPoint="ClosePrinter", SetLastError=true)]
  public static extern bool ClosePrinter(IntPtr hPrinter);
  [DllImport("winspool.Drv", EntryPoint="StartDocPrinterA", SetLastError=true)]
  public static extern bool StartDocPrinter(IntPtr hPrinter, int level, [In] DOCINFOA di);
  [DllImport("winspool.Drv", EntryPoint="EndDocPrinter", SetLastError=true)]
  public static extern bool EndDocPrinter(IntPtr hPrinter);
  [DllImport("winspool.Drv", EntryPoint="StartPagePrinter", SetLastError=true)]
  public static extern bool StartPagePrinter(IntPtr hPrinter);
  [DllImport("winspool.Drv", EntryPoint="EndPagePrinter", SetLastError=true)]
  public static extern bool EndPagePrinter(IntPtr hPrinter);
  [DllImport("winspool.Drv", EntryPoint="WritePrinter", SetLastError=true)]
  public static extern bool WritePrinter(IntPtr hPrinter, IntPtr pBytes, int dwCount, out int dwWritten);
  public static void SendBytes(string printerName, string filePath) {
    IntPtr hPrinter;
    if (!OpenPrinter(printerName, out hPrinter, IntPtr.Zero)) throw new Exception("OpenPrinter failed for " + printerName);
    try {
      DOCINFOA di = new DOCINFOA();
      di.pDocName = "EthioPlate";
      di.pDataType = "RAW";
      if (!StartDocPrinter(hPrinter, 1, di)) throw new Exception("StartDocPrinter failed");
      try {
        if (!StartPagePrinter(hPrinter)) throw new Exception("StartPagePrinter failed");
        try {
          byte[] bytes = File.ReadAllBytes(filePath);
          IntPtr pUnmanaged = Marshal.AllocCoTaskMem(bytes.Length);
          Marshal.Copy(bytes, 0, pUnmanaged, bytes.Length);
          try {
            int written;
            if (!WritePrinter(hPrinter, pUnmanaged, bytes.Length, out written)) throw new Exception("WritePrinter failed");
          } finally { Marshal.FreeCoTaskMem(pUnmanaged); }
        } finally { EndPagePrinter(hPrinter); }
      } finally { EndDocPrinter(hPrinter); }
    } finally { ClosePrinter(hPrinter); }
  }
}
`;

/** One long-lived PowerShell so we do not recompile C# / spawn a process per job (major latency). */
let printWorker = null;
let printWorkerBuffer = "";
/** @type {{resolve:(v?:unknown)=>void, reject:(e:Error)=>void, binPath:string}[]} */
let printWaiters = [];
let printWorkerStarting = null;

function resetPrintWorker(error) {
  const waiters = printWaiters;
  printWaiters = [];
  printWorkerBuffer = "";
  printWorker = null;
  printWorkerStarting = null;
  for (const waiter of waiters) {
    try {
      fs.unlinkSync(waiter.binPath);
    } catch {
      /* ignore */
    }
    waiter.reject(error instanceof Error ? error : new Error(String(error || "print worker stopped")));
  }
}

function ensurePrintWorker() {
  if (printWorker && printWorker.stdin.writable) return Promise.resolve();
  if (printWorkerStarting) return printWorkerStarting;

  printWorkerStarting = new Promise((resolve, reject) => {
    const script = `
$ErrorActionPreference = 'Stop'
Add-Type -TypeDefinition @'
${RAW_PRINTER_HELPER_CS}
'@
[Console]::Out.WriteLine('READY')
[Console]::Out.Flush()
while ($true) {
  $line = [Console]::In.ReadLine()
  if ($null -eq $line) { break }
  if ($line -eq 'EXIT') { break }
  try {
    $req = $line | ConvertFrom-Json
    [RawPrinterHelper]::SendBytes([string]$req.printer, [string]$req.file)
    [Console]::Out.WriteLine('OK')
  } catch {
    $msg = $_.Exception.Message -replace '[\\r\\n]+',' '
    [Console]::Out.WriteLine(('ERR:' + $msg))
  }
  [Console]::Out.Flush()
}
`;
    const child = spawn(
      "powershell.exe",
      ["-NoProfile", "-ExecutionPolicy", "Bypass", "-Command", script],
      { windowsHide: true, stdio: ["pipe", "pipe", "pipe"] },
    );
    printWorker = child;
    let ready = false;
    const readyTimer = setTimeout(() => {
      if (!ready) {
        child.kill();
        resetPrintWorker(new Error("Windows print worker failed to start"));
        reject(new Error("Windows print worker failed to start"));
      }
    }, 20_000);

    child.stdout.setEncoding("utf8");
    child.stdout.on("data", (chunk) => {
      printWorkerBuffer += String(chunk);
      let idx;
      while ((idx = printWorkerBuffer.indexOf("\n")) >= 0) {
        const line = printWorkerBuffer.slice(0, idx).replace(/\r$/, "");
        printWorkerBuffer = printWorkerBuffer.slice(idx + 1);
        if (!ready) {
          if (line === "READY") {
            ready = true;
            clearTimeout(readyTimer);
            printWorkerStarting = null;
            console.log("[gateway] Windows print worker ready (persistent PowerShell)");
            resolve();
          }
          continue;
        }
        const waiter = printWaiters.shift();
        if (!waiter) continue;
        try {
          fs.unlinkSync(waiter.binPath);
        } catch {
          /* ignore */
        }
        if (line === "OK") waiter.resolve();
        else {
          const message = line.startsWith("ERR:") ? line.slice(4) : line || "print worker error";
          waiter.reject(new Error(message));
        }
      }
    });
    child.stderr.on("data", (chunk) => {
      console.warn(`[gateway] print worker stderr: ${String(chunk).trim()}`);
    });
    child.on("error", (error) => {
      clearTimeout(readyTimer);
      resetPrintWorker(error);
      if (!ready) reject(error);
    });
    child.on("close", (code) => {
      clearTimeout(readyTimer);
      const err = new Error(`Windows print worker exited (code ${code ?? "?"})`);
      resetPrintWorker(err);
      if (!ready) reject(err);
    });
  });

  return printWorkerStarting;
}

function windowsRawPrint(printerName, bytes) {
  return ensurePrintWorker().then(
    () =>
      new Promise((resolve, reject) => {
        ensureStateDir();
        const binPath = path.join(STATE_DIR, `job-${Date.now()}-${Math.random().toString(36).slice(2, 7)}.bin`);
        fs.writeFileSync(binPath, bytes);
        const payload = `${JSON.stringify({ printer: printerName, file: binPath })}\n`;
        printWaiters.push({
          resolve,
          reject: (error) => {
            void listWindowsPrinters().then((names) => {
              const available = names.length ? names.join(", ") : "(none found)";
              reject(
                new Error(
                  `${error.message}. Set WINDOWS_PRINTER_NAME in .env.local to an installed printer. Available: ${available}`,
                ),
              );
            });
          },
          binPath,
        });
        try {
          printWorker.stdin.write(payload);
        } catch (error) {
          printWaiters.pop();
          try {
            fs.unlinkSync(binPath);
          } catch {
            /* ignore */
          }
          resetPrintWorker(error);
          reject(error instanceof Error ? error : new Error(String(error)));
        }
      }),
  );
}

async function printPayload(payload) {
  const text = typeof payload?.text === "string" ? payload.text : "";
  if (!text.trim()) throw new Error("Empty print payload");
  const bytes = Buffer.isBuffer(payload?.bytes)
    ? payload.bytes
    : textToEscPos(text);

  if (PRINT_ADAPTER === "network") {
    await tcpPrint(DEFAULT_HOST, DEFAULT_PORT, bytes);
    return;
  }
  if (process.platform !== "win32") {
    throw new Error("Windows RAW adapter requires Windows. Set PRINT_ADAPTER=network for TCP.");
  }
  await windowsRawPrint(WINDOWS_PRINTER_NAME, bytes);
}

// --- HTTP legacy server ----------------------------------------------------

const server = http.createServer(async (req, res) => {
  cors(res);

  if (req.method === "OPTIONS") {
    res.writeHead(204);
    res.end();
    return;
  }

  if (req.method === "GET" && (req.url === "/" || req.url === "/health")) {
    send(
      res,
      200,
      `ok ethioplate-print-agent gateway=${gatewayEnabled ? GATEWAY_CODE : "off"} adapter=${PRINT_ADAPTER} default=${DEFAULT_HOST}:${DEFAULT_PORT}\n`,
    );
    return;
  }

  if (req.method === "POST" && req.url?.startsWith("/print")) {
    try {
      const body = await readBody(req);
      if (!body.length) {
        send(res, 400, "Empty print body\n");
        return;
      }
      const host = String(req.headers["x-printer-host"] || DEFAULT_HOST).trim();
      const port = Number(req.headers["x-printer-port"] || DEFAULT_PORT);
      if (!host || !Number.isFinite(port) || port <= 0) {
        send(res, 400, "Invalid printer host/port\n");
        return;
      }
      await tcpPrint(host, port, body);
      console.log(`[print] ${body.length} bytes -> ${host}:${port}`);
      send(res, 200, "printed\n");
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error(`[print] failed: ${message}`);
      send(res, 502, `${message}\n`);
    }
    return;
  }

  send(res, 404, "Not found. POST /print with raw ESC/POS bytes.\n");
});

server.listen(AGENT_PORT, "0.0.0.0", () => {
  console.log(`EthioPlate print agent listening on http://0.0.0.0:${AGENT_PORT}`);
  console.log(`Default TCP printer ${DEFAULT_HOST}:${DEFAULT_PORT}`);
  if (gatewayEnabled) {
    console.log(`Gateway mode ON code=${GATEWAY_CODE} adapter=${PRINT_ADAPTER}`);
  } else {
    const missing = [
      !SUPABASE_URL && "VITE_SUPABASE_URL",
      !SUPABASE_ANON_KEY && "VITE_SUPABASE_PUBLISHABLE_KEY",
      !GATEWAY_EMAIL && "PRINT_GATEWAY_EMAIL",
      !GATEWAY_PASSWORD && "PRINT_GATEWAY_PASSWORD",
    ].filter(Boolean);
    console.log(`Gateway mode OFF (missing ${missing.join(", ")})`);
    console.log("Add those to .env.local, then restart npm run print-agent.");
  }
});

// --- Gateway worker --------------------------------------------------------

async function runGatewayWorker() {
  processedIds = loadJsonSet(PROCESSED_PATH);
  uncertainIds = loadJsonSet(UNCERTAIN_PATH);

  const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: { persistSession: false, autoRefreshToken: true },
  });

  const { data: authData, error: authError } = await supabase.auth.signInWithPassword({
    email: GATEWAY_EMAIL,
    password: GATEWAY_PASSWORD,
  });
  if (authError) throw authError;
  console.log(`[gateway] signed in as ${authData.user?.email}`);

  const { data: gatewayRow, error: gatewayError } = await supabase
    .from("print_gateways")
    .select("*")
    .eq("code", GATEWAY_CODE)
    .single();
  if (gatewayError) throw gatewayError;
  gatewayId = gatewayRow.id;
  console.log(`[gateway] bound to ${gatewayRow.name} (${gatewayRow.id})`);
  console.log(`[gateway] Windows printer name="${WINDOWS_PRINTER_NAME}" adapter=${PRINT_ADAPTER}`);
  if (PRINT_ADAPTER === "windows") {
    const names = await listWindowsPrinters();
    console.log(`[gateway] installed printers: ${names.join(" | ") || "(none)"}`);
    if (!names.includes(WINDOWS_PRINTER_NAME)) {
      console.warn(
        `[gateway] "${WINDOWS_PRINTER_NAME}" is not installed. Pair the XPrinter in Windows Bluetooth, add it as a printer, then set WINDOWS_PRINTER_NAME to that exact name.`,
      );
    }
  }

  async function heartbeat(printerStatus = "ONLINE") {
    const { error } = await supabase.rpc("heartbeat_print_gateway", {
      p_gateway_code: GATEWAY_CODE,
      p_status: "ONLINE",
      p_printer_status: printerStatus,
    });
    if (error) console.warn(`[gateway] heartbeat failed: ${error.message}`);
  }

  async function processOne() {
    if (busy) return;
    busy = true;
    try {
      while (true) {
        const { data: job, error } = await supabase.rpc("claim_next_print_job", {
          p_gateway_id: gatewayId,
          p_worker_id: WORKER_ID,
        });
        if (error) {
          console.error(`[gateway] claim failed: ${error.message}`);
          break;
        }
        if (!job) break;

        if (processedIds.has(job.id)) {
          console.warn(`[gateway] skip already-processed ${job.id}`);
          await supabase.rpc("complete_print_job", { p_job_id: job.id });
          continue;
        }
        if (uncertainIds.has(job.id)) {
          console.warn(`[gateway] skip uncertain ${job.id} — cashier must review`);
          await supabase.rpc("fail_print_job", {
            p_job_id: job.id,
            p_error: "UNCERTAIN_STATE_NEEDS_REVIEW",
            p_requeue: false,
          });
          continue;
        }

        console.log(`[gateway] printing ${job.id} (${job.job_type})`);
        const started = Date.now();
        await supabase.rpc("mark_print_job_printing", { p_job_id: job.id });
        markUncertain(job.id);
        try {
          await printPayload(job.payload);
          markProcessed(job.id);
          await supabase.rpc("complete_print_job", { p_job_id: job.id });
          console.log(`[gateway] printed ${job.id} in ${Date.now() - started}ms`);
          await heartbeat("ONLINE");
        } catch (printError) {
          const message = printError instanceof Error ? printError.message : String(printError);
          console.error(`[gateway] print failed ${job.id}: ${message}`);
          // Physical result unknown if we may have partially printed — keep uncertain, don't auto-requeue blindly
          await supabase.rpc("fail_print_job", {
            p_job_id: job.id,
            p_error: message.slice(0, 500),
            p_requeue: false,
          });
          await heartbeat("OFFLINE");
          break;
        }
      }
    } finally {
      busy = false;
      if (wakeQueue) {
        wakeQueue = false;
        void processOne();
      }
    }
  }

  function requestProcess() {
    if (busy) {
      wakeQueue = true;
      return;
    }
    void processOne();
  }

  await heartbeat(PRINT_ADAPTER === "windows" ? "ONLINE" : "ONLINE");
  if (PRINT_ADAPTER === "windows") {
    try {
      await ensurePrintWorker();
    } catch (error) {
      console.warn(
        `[gateway] print worker warmup failed: ${error instanceof Error ? error.message : error}`,
      );
    }
  }
  console.log(`[gateway] ONLINE — poll every ${POLL_MS}ms (Realtime wakes instantly when subscribed)`);
  requestProcess();

  setInterval(() => {
    void heartbeat();
  }, HEARTBEAT_MS);

  setInterval(() => {
    requestProcess();
  }, POLL_MS);

  let realtimeChannel = null;
  let realtimeReconnectTimer = null;

  function attachRealtime() {
    if (realtimeReconnectTimer) {
      clearTimeout(realtimeReconnectTimer);
      realtimeReconnectTimer = null;
    }
    if (realtimeChannel) {
      void supabase.removeChannel(realtimeChannel);
      realtimeChannel = null;
    }
    realtimeChannel = supabase
      .channel(`agent-print-jobs-${gatewayId}-${Date.now()}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "print_jobs",
          filter: `gateway_id=eq.${gatewayId}`,
        },
        () => {
          console.log("[gateway] realtime: new job");
          requestProcess();
        },
      )
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "print_jobs",
          filter: `gateway_id=eq.${gatewayId}`,
        },
        (payload) => {
          if (payload.new?.status === "QUEUED") requestProcess();
        },
      )
      .subscribe((status) => {
        console.log(`[gateway] realtime ${status}`);
        if (status === "SUBSCRIBED") requestProcess();
        if (status === "CHANNEL_ERROR" || status === "TIMED_OUT" || status === "CLOSED") {
          console.warn("[gateway] Realtime down — using fast poll until it reconnects");
          if (!realtimeReconnectTimer) {
            realtimeReconnectTimer = setTimeout(() => {
              realtimeReconnectTimer = null;
              attachRealtime();
            }, 3_000);
          }
        }
      });
  }

  attachRealtime();

  process.on("SIGINT", async () => {
    console.log("[gateway] shutting down");
    if (realtimeChannel) await supabase.removeChannel(realtimeChannel);
    try {
      printWorker?.stdin?.write("EXIT\n");
    } catch {
      /* ignore */
    }
    printWorker?.kill();
    process.exit(0);
  });
}

if (gatewayEnabled) {
  runGatewayWorker().catch((error) => {
    console.error("[gateway] fatal:", error instanceof Error ? error.message : error);
  });
}

const __filename = fileURLToPath(import.meta.url);
void __filename;
