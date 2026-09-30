/**
 * Seed floor tables into Supabase dining_tables.
 * Main Hall 1–27, Rooftop 28–56, VIP 1–7, VVIP1 & VVIP2.
 *
 * Usage: node scripts/seed-dining-tables.mjs
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createClient } from "@supabase/supabase-js";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function loadEnvFile(filePath) {
  if (!fs.existsSync(filePath)) return {};
  const env = {};
  for (const line of fs.readFileSync(filePath, "utf8").split(/\r?\n/)) {
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

const env = {
  ...loadEnvFile(path.join(ROOT, ".env")),
  ...loadEnvFile(path.join(ROOT, ".env.local")),
};

const url = env.VITE_SUPABASE_URL || env.SUPABASE_URL;
const key = env.SUPABASE_SERVICE_ROLE_KEY || env.VITE_SUPABASE_PUBLISHABLE_KEY || env.VITE_SUPABASE_ANON_KEY;
if (!url || !key) {
  console.error("Missing VITE_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env.local");
  process.exit(1);
}

function buildFloorTables() {
  const rows = [];
  for (let n = 1; n <= 27; n += 1) {
    rows.push({
      id: `tbl-main-${n}`,
      label: String(n),
      seats: 4,
      area: "Main Hall",
      status: "Available",
      guests: null,
      server: null,
      open_min: null,
      total: null,
      active: true,
      updated_at: new Date().toISOString(),
    });
  }
  for (let n = 28; n <= 56; n += 1) {
    rows.push({
      id: `tbl-roof-${n}`,
      label: String(n),
      seats: 4,
      area: "Rooftop",
      status: "Available",
      guests: null,
      server: null,
      open_min: null,
      total: null,
      active: true,
      updated_at: new Date().toISOString(),
    });
  }
  for (let n = 1; n <= 7; n += 1) {
    rows.push({
      id: `tbl-vip-${n}`,
      label: String(n),
      seats: 6,
      area: "VIP",
      status: "Available",
      guests: null,
      server: null,
      open_min: null,
      total: null,
      active: true,
      updated_at: new Date().toISOString(),
    });
  }
  for (const label of ["VVIP1", "VVIP2"]) {
    rows.push({
      id: `tbl-${label.toLowerCase()}`,
      label,
      seats: 8,
      area: "VVIP",
      status: "Available",
      guests: null,
      server: null,
      open_min: null,
      total: null,
      active: true,
      updated_at: new Date().toISOString(),
    });
  }
  return rows;
}

const tables = buildFloorTables();
const supabase = createClient(url, key, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const { count: before, error: beforeErr } = await supabase
  .from("dining_tables")
  .select("*", { count: "exact", head: true })
  .eq("active", true);
if (beforeErr) {
  console.error(beforeErr.message);
  process.exit(1);
}

const { error: upsertErr } = await supabase.from("dining_tables").upsert(tables, {
  onConflict: "id",
});
if (upsertErr) {
  console.error(upsertErr.message);
  process.exit(1);
}

const { data: afterRows, error: afterErr } = await supabase
  .from("dining_tables")
  .select("area, label")
  .eq("active", true)
  .in(
    "id",
    tables.map((row) => row.id),
  );
if (afterErr) {
  console.error(afterErr.message);
  process.exit(1);
}

const byArea = {};
for (const row of afterRows ?? []) {
  byArea[row.area] = (byArea[row.area] ?? 0) + 1;
}

const seedIds = new Set(tables.map((row) => row.id));
const { data: allActive, error: listErr } = await supabase
  .from("dining_tables")
  .select("id,area,label")
  .eq("active", true);
if (listErr) {
  console.error(listErr.message);
  process.exit(1);
}
const extras = (allActive ?? []).filter((row) => !seedIds.has(row.id));
if (extras.length > 0) {
  const { error: deactivateErr } = await supabase
    .from("dining_tables")
    .update({ active: false, updated_at: new Date().toISOString() })
    .in(
      "id",
      extras.map((row) => row.id),
    );
  if (deactivateErr) {
    console.error(deactivateErr.message);
    process.exit(1);
  }
}

console.log(`active_before=${before ?? 0}`);
console.log(`seeded=${tables.length}`);
console.log("by_area=", byArea);
console.log(`deactivated_extras=${extras.length}`);
console.log("ok");
