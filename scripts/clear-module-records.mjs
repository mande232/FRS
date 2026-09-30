import fs from "node:fs";
import { createClient } from "@supabase/supabase-js";

function loadEnvLocal() {
  const text = fs.readFileSync(".env.local", "utf8");
  const env = {};
  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const index = trimmed.indexOf("=");
    if (index < 0) continue;
    const key = trimmed.slice(0, index).trim();
    let value = trimmed.slice(index + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    env[key] = value;
  }
  return env;
}

const env = loadEnvLocal();
const url = env.VITE_SUPABASE_URL;
const key = env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.error("Missing VITE_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env.local");
  process.exit(1);
}

const supabase = createClient(url, key, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const WIPE_MODULE_KEY = "__meta__";
const WIPE_RECORD_ID = "module_records_wipe";
const wipeEpoch = Date.now();

const { count: before, error: countErr } = await supabase
  .from("module_records")
  .select("*", { count: "exact", head: true });
if (countErr) {
  console.error(countErr.message);
  process.exit(1);
}

console.log(`rows_before=${before ?? 0}`);

const { error: delErr, count } = await supabase
  .from("module_records")
  .delete({ count: "exact" })
  .neq("module_key", "");
if (delErr) {
  console.error(delErr.message);
  process.exit(1);
}

const { error: wipeErr } = await supabase.from("module_records").upsert(
  {
    module_key: WIPE_MODULE_KEY,
    record_id: WIPE_RECORD_ID,
    data: { id: WIPE_RECORD_ID, epoch: wipeEpoch },
    position: 0,
    active: true,
    updated_at: new Date().toISOString(),
  },
  { onConflict: "module_key,record_id" },
);
if (wipeErr) {
  console.error(wipeErr.message);
  process.exit(1);
}

const { count: after, error: afterErr } = await supabase
  .from("module_records")
  .select("*", { count: "exact", head: true });
if (afterErr) {
  console.error(afterErr.message);
  process.exit(1);
}

console.log(`deleted=${count ?? "unknown"}`);
console.log(`wipe_epoch=${wipeEpoch}`);
console.log(`rows_after=${after ?? 0} (includes wipe marker)`);
console.log("");
console.log("Deploy/reload the app on EVERY device (hard refresh).");
console.log("Each device will see the wipe epoch, clear bl_module_records_* / pending_sync,");
console.log("and will not re-upload stale cache into the empty table.");
