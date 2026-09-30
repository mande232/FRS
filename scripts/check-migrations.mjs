#!/usr/bin/env node
import { readdirSync, existsSync } from "node:fs";
import { join } from "node:path";

const dir = join(process.cwd(), "supabase", "migrations");
const required = [
  "014_immutable_stock_ledger.sql",
  "015_normalized_inventory.sql",
  "016_pos_inventory_settings_and_audit.sql",
];

if (!existsSync(dir)) {
  console.error("Missing supabase/migrations directory");
  process.exit(1);
}

const present = new Set(readdirSync(dir));
const missing = required.filter((name) => !present.has(name));
if (missing.length > 0) {
  console.error("Missing migrations:", missing.join(", "));
  process.exit(1);
}

console.log("Migration files present:");
for (const name of required) console.log(` - ${name}`);
console.log("Apply with: supabase db push   (or run these SQL files in the Supabase SQL editor)");
