import type { User } from "@supabase/supabase-js";
import type { AuthUser, UserRole } from "../auth-context";
import { makeAvatar, USER_ROLES } from "../users";
import { assignmentFromProfileRow } from "./profile-assignment";
import { supabase } from "./client";

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

const PROFILE_SELECT =
  "id,email,name,role,branch,avatar,active,staff_sales_all,assigned_store,assigned_inventory_locations";

type ResolvedStaffLogin = ProfileRow & {
  email: string;
};

function readBooleanLike(value: unknown) {
  if (value === true || value === 1) return true;
  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase();
    return normalized === "true" || normalized === "1" || normalized === "yes" || normalized === "on";
  }
  return false;
}

function isUserRole(value: unknown): value is UserRole {
  return typeof value === "string" && USER_ROLES.includes(value as UserRole);
}

function profileToAuthUser(row: ProfileRow, fallback?: User): AuthUser {
  const meta = (fallback?.user_metadata ?? {}) as Record<string, unknown>;
  const name = row.name || (typeof meta.name === "string" ? meta.name : "") || fallback?.email?.split("@")[0] || "Staff";
  const roleValue = row.role || meta.role;
  const role = isUserRole(roleValue) ? roleValue : "Waiter";
  const branch = row.branch || (typeof meta.branch === "string" ? meta.branch : "") || "Bole";
  const assignment = assignmentFromProfileRow(row, meta, role);

  return {
    id: row.id,
    email: row.email || fallback?.email || undefined,
    name,
    role,
    branch,
    staffSalesAll: row.staff_sales_all ?? readBooleanLike(meta.staff_sales_all ?? meta.staffSalesAll),
    ...assignment,
    avatar: row.avatar || makeAvatar(name),
    password: "",
  };
}

export async function loadSupabaseAuthUser(user: User | null | undefined): Promise<AuthUser | null> {
  if (!user || !supabase) return null;

  const { data, error } = await supabase
    .from("profiles")
    .select(PROFILE_SELECT)
    .eq("id", user.id)
    .maybeSingle();

  if (error) throw error;

  if (data) return profileToAuthUser(data as ProfileRow, user);

  const metadata = (user.user_metadata ?? {}) as Record<string, unknown>;
  const name = typeof metadata.name === "string" ? metadata.name : user.email?.split("@")[0] || "Staff";
  const role = isUserRole(metadata.role) ? metadata.role : "Waiter";
  const assignment = assignmentFromProfileRow({}, metadata, role);
  return {
    id: user.id,
    email: user.email,
    name,
    role,
    branch: typeof metadata.branch === "string" ? metadata.branch : "Bole",
    staffSalesAll: readBooleanLike(metadata.staff_sales_all ?? metadata.staffSalesAll),
    ...assignment,
    avatar: typeof metadata.avatar === "string" ? metadata.avatar : makeAvatar(name),
    password: "",
  };
}

export async function listSupabaseProfiles(): Promise<AuthUser[]> {
  if (!supabase) return [];

  const { data, error } = await supabase
    .from("profiles")
    .select(PROFILE_SELECT)
    .eq("active", true)
    .order("name", { ascending: true });

  if (error) throw error;
  return ((data ?? []) as ProfileRow[]).map((row) => profileToAuthUser(row));
}

export async function resolveSupabasePasswordLogin(password: string): Promise<ResolvedStaffLogin | null> {
  if (!supabase) return null;

  const { data, error } = await supabase.rpc("resolve_staff_login", {
    password_input: password,
  });

  if (error) throw error;

  const rows = Array.isArray(data) ? data as ResolvedStaffLogin[] : [];
  return rows[0] ?? null;
}
