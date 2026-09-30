#!/usr/bin/env node
/**
 * Create one Administrator user in Supabase Auth + profiles.
 *
 * Usage:
 *   node scripts/seed-admin.mjs
 *
 * Requires in .env.local (or env):
 *   VITE_SUPABASE_URL
 *   SUPABASE_SERVICE_ROLE_KEY
 *
 * Default login:
 *   Password: admin123
 */

import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { createClient } from "@supabase/supabase-js";

const ADMIN_EMAIL = "admin@ethioplate.local";
const ADMIN_PASSWORD = "admin123";
const ADMIN = {
  name: "System Administrator",
  role: "Administrator",
  branch: "Bole",
  avatar: "SA",
  staff_sales_all: true,
};

function loadEnvFile(path) {
  if (!existsSync(path)) return;
  const text = readFileSync(path, "utf8");
  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    const value = trimmed.slice(eq + 1).trim();
    if (!process.env[key]) process.env[key] = value;
  }
}

loadEnvFile(join(process.cwd(), ".env.local"));

const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !serviceRoleKey) {
  console.error("Missing VITE_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in .env.local");
  process.exit(1);
}

const admin = createClient(supabaseUrl, serviceRoleKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

async function findExistingAdmin() {
  const { data: profiles, error } = await admin
    .from("profiles")
    .select("id,email,name,role")
    .eq("role", "Administrator")
    .eq("active", true)
    .limit(5);

  if (error) throw error;
  return profiles ?? [];
}

async function main() {
  const existing = await findExistingAdmin();
  if (existing.length > 0) {
    console.log("Administrator already exists:");
    for (const row of existing) {
      console.log(` - ${row.name} (${row.email}) [${row.id}]`);
    }
    console.log(`\nUse password: ${ADMIN_PASSWORD} if this is the seeded admin.`);
    return;
  }

  const { data, error } = await admin.auth.admin.createUser({
    email: ADMIN_EMAIL,
    password: ADMIN_PASSWORD,
    email_confirm: true,
    user_metadata: {
      ...ADMIN,
      login_password: ADMIN_PASSWORD,
    },
  });

  if (error) throw error;
  if (!data.user) throw new Error("Supabase did not return the created user.");

  const { error: passwordError } = await admin.rpc("set_staff_login_password", {
    user_id_input: data.user.id,
    password_input: ADMIN_PASSWORD,
  });

  if (passwordError) {
    throw new Error(
      `User created but password-only login failed. Run migrations 002/003 first. ${passwordError.message}`,
    );
  }

  const { error: profileError } = await admin
    .from("profiles")
    .update({
      role: "Administrator",
      branch: ADMIN.branch,
      staff_sales_all: true,
      active: true,
    })
    .eq("id", data.user.id);

  if (profileError) throw profileError;

  console.log("Administrator created successfully.");
  console.log(`  Name:     ${ADMIN.name}`);
  console.log(`  Email:    ${ADMIN_EMAIL}`);
  console.log(`  Password: ${ADMIN_PASSWORD}`);
  console.log(`  User id:  ${data.user.id}`);
  console.log("\nLog in on the app using only the password: admin123");
}

main().catch((error) => {
  console.error("Failed to seed admin:", error.message || error);
  process.exit(1);
});
