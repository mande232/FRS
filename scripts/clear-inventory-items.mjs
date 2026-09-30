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
  .from("inventory_items")
  .select("*", { count: "exact", head: true });
if (countErr) {
  console.error(countErr.message);
  process.exit(1);
}

console.log(`rows_before=${before ?? 0}`);

const { error: delErr, count } = await supabase
  .from("inventory_items")
  .delete({ count: "exact" })
  .neq("id", "");
if (delErr) {
  console.error(delErr.message);
  process.exit(1);
}

const { count: after, error: afterErr } = await supabase
  .from("inventory_items")
  .select("*", { count: "exact", head: true });
if (afterErr) {
  console.error(afterErr.message);
  process.exit(1);
}

console.log(`deleted=${count ?? "unknown"}`);
console.log(`rows_after=${after ?? 0}`);
