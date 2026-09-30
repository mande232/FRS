import { DEMO_USERS, type AuthUser, type UserRole } from "./auth-context";

export const USERS_STORAGE_KEY = "bl_users";

export const USER_ROLES: UserRole[] = [
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

export function makeAvatar(name: string): string {
  return name
    .trim()
    .split(/\s+/)
    .map((part) => part[0] ?? "")
    .join("")
    .slice(0, 2)
    .toUpperCase() || "??";
}

export function loadUsers(): AuthUser[] {
  if (typeof window === "undefined") return DEMO_USERS;
  try {
    const raw = localStorage.getItem(USERS_STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as AuthUser[];
      if (Array.isArray(parsed) && parsed.length > 0) return parsed;
    }
  } catch {
    /* ignore */
  }
  return DEMO_USERS;
}

export function saveUsers(users: AuthUser[]) {
  if (typeof window === "undefined") return;
  localStorage.setItem(USERS_STORAGE_KEY, JSON.stringify(users));
}

export function findUserByPassword(password: string, users: AuthUser[]): AuthUser | null {
  if (!password.trim()) return null;
  return users.find((u) => u.password === password) ?? null;
}

export type NewAuthUser = {
  name: string;
  role: UserRole;
  branch: string;
  staffSalesAll?: boolean;
  password: string;
};
