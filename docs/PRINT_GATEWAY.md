# Cashier laptop print gateway

Multiple waiter phones create orders in the POS app. Only the **cashier Windows laptop** talks to the Bluetooth XPrinter.

```
Waiters / Cashier POS  →  Supabase (orders + print_jobs)
                                ↓ Realtime + poll
                     Cashier laptop print agent
                                ↓ Windows RAW / TCP
                            XPrinter
```

## 1. Database

Apply migration:

- `supabase/migrations/035_print_gateway_queue.sql`

This creates `print_gateways`, `printers`, `print_jobs`, `print_job_events`, claim/heartbeat RPCs, and RLS.

Default seed:

- Gateway code: `CASHIER-LAPTOP-01`
- Printer: `Main Receipt Printer`

## 2. POS app settings (every device)

Open **POS Printer** settings:

1. Mode → **Cashier print gateway**
2. Gateway code → `CASHIER-LAPTOP-01` (must match the agent)
3. Save

Waiter phones must **not** use Bluetooth mode. They only enqueue jobs.

## 3. XPrinter on the cashier Windows laptop

1. Pair the XPrinter via Windows Bluetooth (Settings → Bluetooth).
2. Install it as a Windows printer (often “Generic / Text Only” or the XPrinter driver).
3. Note the exact printer name from **Devices and Printers** (example: `XP-80C`).
4. Prefer **RAW** / passthrough so ESC/POS bytes reach the printer unchanged.

Do **not** pair the printer to waiter phones.

## 4. Print agent environment

On the cashier laptop, in the project folder (or a dedicated startup script):

```bat
set SUPABASE_URL=https://YOUR_PROJECT.supabase.co
set SUPABASE_ANON_KEY=YOUR_ANON_OR_PUBLISHABLE_KEY
set PRINT_GATEWAY_EMAIL=cashier@your-branch.local
set PRINT_GATEWAY_PASSWORD=********
set PRINT_GATEWAY_CODE=CASHIER-LAPTOP-01
set PRINT_ADAPTER=windows
set WINDOWS_PRINTER_NAME=XP-80C
npm run print-agent
```

Optional:

| Variable | Default | Purpose |
|----------|---------|---------|
| `PRINT_ADAPTER` | `windows` | `windows` or `network` |
| `POS_PRINTER_HOST` | `192.168.1.50` | TCP host when adapter=`network` |
| `POS_PRINTER_PORT` | `9100` | TCP port |
| `POS_PRINT_AGENT_PORT` | `9101` | Legacy HTTP `/print` listener |
| `PRINT_HEARTBEAT_MS` | `10000` | Gateway heartbeat |
| `PRINT_POLL_MS` | `1000` | Safety poll for missed Realtime events (keep ≤1000 for waiter phones) |
| `PRINT_WORKER_ID` | hostname-pid | Claim identity |

Use a **Cashier / Branch Manager / Admin** staff account for `PRINT_GATEWAY_EMAIL` (must pass `is_print_operator()`). Never put the Supabase **service role** key in the web app.

## 5. Start the agent

```bash
npm run print-agent
```

Health check: `http://127.0.0.1:9101/health`

The agent:

- Signs in to Supabase
- Heartbeats the gateway
- Subscribes to `print_jobs` for its gateway
- Claims jobs atomically (`claim_next_print_job`)
- Prints **one at a time**
- Marks PRINTED / FAILED
- Remembers processed job IDs under `%APPDATA%\ethioplate-print-agent\`

## 6. Auto-start on Windows

### Task Scheduler (recommended)

1. Open Task Scheduler → Create Task.
2. General: “Run whether user is logged on or not” (or “only when logged on”), Run with highest privileges if needed.
3. Triggers: At log on / At startup.
4. Actions → Start a program:
   - Program: `cmd.exe`
   - Arguments: `/c cd /d D:\ethioPlate_pro && set SUPABASE_URL=... && set SUPABASE_ANON_KEY=... && set PRINT_GATEWAY_EMAIL=... && set PRINT_GATEWAY_PASSWORD=... && set PRINT_GATEWAY_CODE=CASHIER-LAPTOP-01 && set PRINT_ADAPTER=windows && set WINDOWS_PRINTER_NAME=XP-80C && npm run print-agent`
5. Settings: restart on failure every 1 minute.

Or put a `.bat` with those `set` lines + `npm run print-agent` in the user’s Startup folder:

`%APPDATA%\Microsoft\Windows\Start Menu\Programs\Startup`

## 7. Cashier UI

On POS (cashier/manager), the printer badge shows:

- Online / Offline
- Queue depth
- Failed count
- Recent jobs with **Retry** / **Reprint**

Orders are never cancelled because printing failed.

## 8. What gets queued

When mode is **gateway**:

- Station Bono tickets → `STATION_BONO` jobs (one per station slip)
- Customer receipts → `CUSTOMER_RECEIPT` jobs

Reprints create a **new** job with `reprint_of` set.

## 9. Recovery behavior

| Event | Behavior |
|-------|----------|
| Agent offline | Orders succeed; jobs stay `QUEUED` |
| Realtime miss | Poll every few seconds |
| Duplicate Realtime | Local processed-ID set skips reprint |
| Print error after start | Job `FAILED` + uncertain marker (no blind requeue) |
| Laptop restart | Reload processed IDs, heartbeat, claim pending |

## 10. Security / RLS summary

- Staff can insert `QUEUED` jobs and read queue status.
- Only print operators (Cashier / Manager / Admin / Supervisor) claim/complete via RPCs.
- Waiters cannot mark jobs `PRINTED`.
- No service-role key in browser code.

## 11. Remaining limitations

- Gateway mode ESC/POS encoding in the agent is UTF-8 text + basic cut; Ethiopic raster still runs best when the Windows driver / printer accepts the payload. For complex Amharic bitmaps, prefer generating bytes in the app later and storing them in `payload`.
- Multi-station physical printers (Kitchen / Bar / VIP) are schema-ready via `printers.station_id` but v1 routes all jobs to the main gateway printer.
- Uncertain jobs after a crash need cashier Retry/Reprint review.

## 12. Future improvements

- Per-station printer routing
- Store pre-encoded ESC/POS bytes in `payload`
- Dedicated gateway service user with scoped JWT claims
- Signed agent installers / Windows service wrapper
