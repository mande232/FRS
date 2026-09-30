import process from "node:process";
import { createClient, type SupabaseClient, type User } from "@supabase/supabase-js";

import type { AuthUser, AuthUserInput, UserRole } from "../auth-context";
import { locationsFromAuthInput, validateAssignedInventoryLocations } from "../inventory-access";
import { validateStoreRoleAssignment } from "../staff-management";
import { isStoreAssignmentRole } from "../stock-management";
import {
  assignmentFromProfileRow,
  assignmentToProfileColumns,
} from "./profile-assignment";

const STAFF_ROLES: UserRole[] = [
  "Administrator",
  "Inventory Administrator",
  "Branch Manager",
  "Store Manager",
  "Supervisor",
  "Cashier",
  "Waiter",
  "Kitchen Staff",
  "Bar Staff",
  "Bartender",
  "Butcher Staff",
  "Butcher House Staff",
  "Coffee House Staff",
  "Department Manager",
  "Inventory Staff",
  "Storekeeper",
  "Reception",
  "Hotel Staff",
  "Procurement Officer",
  "Chef",
  "Event Coordinator",
  "Accountant",
  "Auditor",
];

type ProfileRow = {
  id: string;
  email: string | null;
  name: string | null;
  role: string | null;
  branch: string | null;
  avatar: string | null;
  active: boolean | null;
  staff_sales_all: boolean | null;
  assigned_store?: string | null;
  assigned_inventory_locations?: string[] | null;
};

type StaffMutationInput = AuthUserInput & {
  accessToken: string;
};

type StaffUpdateInput = StaffMutationInput & {
  id: string;
};

type StaffDeleteInput = {
  id: string;
  accessToken: string;
};

function readBooleanLike(value: unknown) {
  if (value === true || value === 1) return true;
  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase();
    return normalized === "true" || normalized === "1" || normalized === "yes" || normalized === "on";
  }
  return false;
}

function serverEnv(name: string) {
  return process.env[name] || (import.meta.env as Record<string, string | undefined>)[name];
}

export function getSupabaseAdmin(): SupabaseClient {
  const supabaseUrl = serverEnv("SUPABASE_URL") || serverEnv("VITE_SUPABASE_URL");
  const serviceRoleKey =
    serverEnv("SUPABASE_SERVICE_ROLE_KEY") ||
    serverEnv("SUPABASE_SERVICE_KEY") ||
    serverEnv("SUPABASE_SERVICE_ROLE");

  if (!supabaseUrl) {
    throw new Error("Supabase URL is not configured on the server.");
  }
  if (!serviceRoleKey) {
    throw new Error(
      "Set SUPABASE_SERVICE_ROLE_KEY in the server environment, then restart the app to manage staff Auth users.",
    );
  }

  return createClient(supabaseUrl, serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
}

function makeAvatar(name: string): string {
  return (
    name
      .trim()
      .split(/\s+/)
      .map((part) => part[0] ?? "")
      .join("")
      .slice(0, 2)
      .toUpperCase() || "??"
  );
}

function slugifyEmailPart(value: string): string {
  const slug = value
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, ".")
    .replace(/^\.+|\.+$/g, "")
    .slice(0, 40);

  return slug || "staff";
}

function generatedStaffEmail(name: string): string {
  const suffix = globalThis.crypto?.randomUUID?.().slice(0, 8) ?? `${Date.now()}`;
  return `${slugifyEmailPart(name)}.${suffix}@staff.ethio-plate.local`;
}

function isUserRole(value: unknown): value is UserRole {
  return typeof value === "string" && STAFF_ROLES.includes(value as UserRole);
}

function isManagementRole(role?: string | null) {
  return role === "Branch Manager" || role === "Administrator";
}

function profileToAuthUser(row: ProfileRow, fallback?: User): AuthUser {
  const metadata = (fallback?.user_metadata ?? {}) as Record<string, unknown>;
  const name =
    row.name ||
    (typeof metadata.name === "string" ? metadata.name : "") ||
    fallback?.email?.split("@")[0] ||
    "Staff";
  const roleValue = row.role || metadata.role;
  const role = isUserRole(roleValue) ? roleValue : "Waiter";
  const branch =
    row.branch || (typeof metadata.branch === "string" ? metadata.branch : "") || "Bole";
  const assignment = assignmentFromProfileRow(row, metadata, role);

  return {
    id: row.id,
    email: row.email || fallback?.email || undefined,
    name,
    role,
    branch,
    staffSalesAll: row.staff_sales_all ?? readBooleanLike(metadata.staff_sales_all ?? metadata.staffSalesAll),
    ...assignment,
    avatar: row.avatar || makeAvatar(name),
    password: "",
  };
}

function normalizeStaffInput(input: AuthUserInput) {
  const name = input.name.trim();
  const branch = input.branch.trim() || "Bole";
  const password = input.password.trim();
  const email = input.email?.trim().toLowerCase();
  const assignedInventoryLocations = locationsFromAuthInput(input);
  const assignedStore = isStoreAssignmentRole(input.role)
    ? input.assignedStore ??
      (assignedInventoryLocations.find((loc) => loc === "Store 1" || loc === "Store 2") as
        | "Store 1"
        | "Store 2"
        | undefined)
    : undefined;

  if (!name) throw new Error("Name is required.");
  if (!STAFF_ROLES.includes(input.role)) throw new Error("Choose a valid staff role.");
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))
    throw new Error("Enter a valid email address.");

  const storeAssignmentError = validateStoreRoleAssignment(input.role, assignedStore);
  if (storeAssignmentError) throw new Error(storeAssignmentError);
  const locationAssignmentError = validateAssignedInventoryLocations(
    input.role,
    assignedInventoryLocations.length ? assignedInventoryLocations : undefined,
  );
  if (locationAssignmentError) throw new Error(locationAssignmentError);

  return {
    email,
    name,
    role: input.role,
    branch,
    staffSalesAll: input.staffSalesAll ?? false,
    assignedStore,
    assignedInventoryLocations: assignedInventoryLocations.length ? assignedInventoryLocations : undefined,
    password,
    avatar: makeAvatar(name),
  };
}

async function assertManager(admin: SupabaseClient, accessToken: string) {
  if (!accessToken) throw new Error("You must be signed in to manage system users.");

  const { data: authData, error: authError } = await admin.auth.getUser(accessToken);
  if (authError || !authData.user) throw new Error("Your session could not be verified.");

  const { data: profile, error: profileError } = await admin
    .from("profiles")
    .select("id,role,active")
    .eq("id", authData.user.id)
    .maybeSingle();

  if (profileError) throw profileError;
  if (!profile?.active || !isManagementRole(profile.role)) {
    throw new Error("Only Branch Managers or Administrators can manage system users.");
  }

  return authData.user;
}

async function fetchProfile(admin: SupabaseClient, id: string, fallback?: User): Promise<AuthUser> {
  const { data, error } = await admin
    .from("profiles")
    .select("id,email,name,role,branch,avatar,active,staff_sales_all,assigned_store,assigned_inventory_locations")
    .eq("id", id)
    .maybeSingle();

  if (error) throw error;
  if (!data) throw new Error("The staff profile was not created.");

  return profileToAuthUser(data as ProfileRow, fallback);
}

async function syncProfileAssignment(
  admin: SupabaseClient,
  id: string,
  staff: ReturnType<typeof normalizeStaffInput>,
) {
  const columns = assignmentToProfileColumns(staff);
  const { error } = await admin
    .from("profiles")
    .update({
      assigned_store: columns.assigned_store,
      assigned_inventory_locations: columns.assigned_inventory_locations,
      updated_at: new Date().toISOString(),
    })
    .eq("id", id);
  if (error) throw error;
}

async function assertCanRemoveOrDowngradeManager(
  admin: SupabaseClient,
  id: string,
  nextRole?: UserRole,
) {
  const { data: target, error: targetError } = await admin
    .from("profiles")
    .select("id,role")
    .eq("id", id)
    .maybeSingle();

  if (targetError) throw targetError;
  if (!target) throw new Error("User not found.");
  if (!isManagementRole(target.role)) return;
  if (nextRole && isManagementRole(nextRole)) return;

  const { count, error: countError } = await admin
    .from("profiles")
    .select("id", { count: "exact", head: true })
    .eq("active", true)
    .in("role", ["Branch Manager", "Administrator"])
    .neq("id", id);

  if (countError) throw countError;
  if (!count) throw new Error("At least one manager account is required.");
}

async function assertLoginPasswordAvailable(
  admin: SupabaseClient,
  password: string,
  exceptUserId?: string,
) {
  const { data, error } = await admin.rpc("resolve_staff_login", {
    password_input: password,
  });

  if (error) {
    throw new Error(
      "Password-only login is not enabled yet. Run supabase/migrations/003_staff_auth_admin.sql.",
    );
  }

  const rows = Array.isArray(data) ? (data as Array<{ id: string }>) : [];
  const existing = rows.find((row) => row.id !== exceptUserId);
  if (existing) throw new Error("That password is already in use.");
}

async function setLoginPassword(admin: SupabaseClient, id: string, password: string) {
  const { error } = await admin.rpc("set_staff_login_password", {
    user_id_input: id,
    password_input: password,
  });

  if (error) {
    throw new Error(
      "Staff Auth user was saved, but password-only login was not updated. Run supabase/migrations/003_staff_auth_admin.sql.",
    );
  }
}

export async function createStaffAuthUser(input: StaffMutationInput): Promise<AuthUser> {
  const admin = getSupabaseAdmin();
  await assertManager(admin, input.accessToken);

  const staff = normalizeStaffInput(input);
  if (!staff.password) throw new Error("Password is required.");
  if (staff.password.length < 6) throw new Error("Password must be at least 6 characters.");
  await assertLoginPasswordAvailable(admin, staff.password);

  const email = staff.email || generatedStaffEmail(staff.name);
  const assignmentColumns = assignmentToProfileColumns(staff);
  const { data, error } = await admin.auth.admin.createUser({
    email,
    password: staff.password,
    email_confirm: true,
    user_metadata: {
      name: staff.name,
      role: staff.role,
      branch: staff.branch,
      staff_sales_all: staff.staffSalesAll,
      avatar: staff.avatar,
      assigned_store: assignmentColumns.assigned_store,
      assigned_inventory_locations: assignmentColumns.assigned_inventory_locations,
    },
  });

  if (error) throw new Error(error.message);
  if (!data.user) throw new Error("Supabase did not return the created Auth user.");

  await setLoginPassword(admin, data.user.id, staff.password);
  await syncProfileAssignment(admin, data.user.id, staff);
  return fetchProfile(admin, data.user.id, data.user);
}

export async function updateStaffAuthUser(input: StaffUpdateInput): Promise<AuthUser> {
  const admin = getSupabaseAdmin();
  const currentUser = await assertManager(admin, input.accessToken);
  const staff = normalizeStaffInput(input);

  await assertCanRemoveOrDowngradeManager(admin, input.id, staff.role);

  const { data: existingUser, error: existingError } = await admin.auth.admin.getUserById(input.id);
  if (existingError) throw new Error(existingError.message);
  if (!existingUser.user) throw new Error("User not found.");

  const assignmentColumns = assignmentToProfileColumns(staff);
  const nextMetadata = {
    ...(existingUser.user.user_metadata ?? {}),
    name: staff.name,
    role: staff.role,
    branch: staff.branch,
    staff_sales_all: staff.staffSalesAll,
    avatar: staff.avatar,
    assigned_store: assignmentColumns.assigned_store,
    assigned_inventory_locations: assignmentColumns.assigned_inventory_locations,
  };

  const updatePayload: Parameters<typeof admin.auth.admin.updateUserById>[1] = {
    user_metadata: nextMetadata,
  };

  if (staff.email && staff.email !== existingUser.user.email) {
    updatePayload.email = staff.email;
    updatePayload.email_confirm = true;
  }
  if (staff.password) {
    if (staff.password.length < 6) throw new Error("Password must be at least 6 characters.");
    await assertLoginPasswordAvailable(admin, staff.password, input.id);
    updatePayload.password = staff.password;
  }

  const { data, error } = await admin.auth.admin.updateUserById(input.id, updatePayload);
  if (error) throw new Error(error.message);

  if (staff.password) await setLoginPassword(admin, input.id, staff.password);
  await syncProfileAssignment(admin, input.id, staff);

  const updated = await fetchProfile(admin, input.id, data.user ?? existingUser.user);
  if (currentUser.id === input.id) {
    return { ...updated, role: staff.role };
  }
  return updated;
}

export async function deactivateStaffAuthUser(input: StaffDeleteInput): Promise<{ ok: true }> {
  const admin = getSupabaseAdmin();
  const currentUser = await assertManager(admin, input.accessToken);

  if (currentUser.id === input.id) throw new Error("You cannot remove your own account.");
  await assertCanRemoveOrDowngradeManager(admin, input.id);

  const { error } = await admin
    .from("profiles")
    .update({
      active: false,
      login_password_hash: null,
    })
    .eq("id", input.id);

  if (error) throw error;
  return { ok: true };
}
