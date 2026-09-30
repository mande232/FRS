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

const { count: before, error: countErr } = await supabase
  .from("inventory_ledger")
  .select("*", { count: "exact", head: true });
if (countErr) {
  console.error(countErr.message);
  process.exit(1);
}

console.log(`rows_before=${before ?? 0}`);

const { data: removed, error: rpcErr } = await supabase.rpc("clear_inventory_ledger");
if (!rpcErr) {
  const { count: after } = await supabase
    .from("inventory_ledger")
    .select("*", { count: "exact", head: true });
  console.log(`deleted=${removed ?? before ?? 0}`);
  console.log(`rows_after=${after ?? 0}`);
  process.exit(0);
}

const { error: delErr, count } = await supabase
  .from("inventory_ledger")
  .delete({ count: "exact" })
  .neq("id", "");
if (!delErr) {
  const { count: after } = await supabase
    .from("inventory_ledger")
    .select("*", { count: "exact", head: true });
  console.log(`deleted=${count ?? "unknown"}`);
  console.log(`rows_after=${after ?? 0}`);
  process.exit(0);
}

console.error(delErr.message);
console.error("");
console.error("Ledger is append-only. Run this in the Supabase SQL Editor, then re-run:");
console.error("  node scripts/clear-inventory-ledger.mjs");
console.error("");
console.error(fs.readFileSync("scripts/clear-inventory-ledger.sql", "utf8"));
process.exit(1);
