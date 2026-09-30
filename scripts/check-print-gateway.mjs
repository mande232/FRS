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
const supabase = createClient(env.VITE_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

async function check(table) {
  const { error, count } = await supabase.from(table).select("*", { count: "exact", head: true });
  if (error) return { table, ok: false, error: error.message };
  return { table, ok: true, count: count ?? 0 };
}

const tables = await Promise.all([
  check("print_gateways"),
  check("printers"),
  check("print_jobs"),
  check("print_job_events"),
]);
console.log(JSON.stringify(tables, null, 2));

const { data: claimFn, error: claimErr } = await supabase.rpc("claim_next_print_job", {
  p_gateway_id: "00000000-0000-0000-0000-000000000000",
  p_worker_id: "health-check",
});
console.log(
  JSON.stringify(
    {
      claim_rpc: claimErr
        ? { ok: false, error: claimErr.message, code: claimErr.code }
        : { ok: true, data: claimFn },
    },
    null,
    2,
  ),
);
