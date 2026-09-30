import { createContext, useContext } from "react";
import type { CentralStockLocation, StockLocation } from "./stock-management.ts";

export type UserRole =
  | "Administrator"
  | "Inventory Administrator"
  | "Branch Manager"
  | "Store Manager"
  | "Supervisor"
  | "Cashier"
  | "Waiter"
  | "Kitchen Staff"
  | "Bar Staff"
  | "Bartender"
  | "Butcher Staff"
  | "Butcher House Staff"
  | "Coffee House Staff"
  | "Department Manager"
  | "Inventory Staff"
  | "Storekeeper"
  | "Reception"
  | "Hotel Staff"
  | "Procurement Officer"
  | "Chef"
  | "Event Coordinator"
  | "Accountant"
  | "Auditor";

export interface AuthUser {
  id: string;
  email?: string;
  name: string;
  role: UserRole;
  branch: string;
  staffSalesAll?: boolean;
  assignedStore?: CentralStockLocation;
  assignedInventoryLocations?: StockLocation[];
  avatar: string; // initials
  password: string; // demo only — plain text
}

export type AuthUserInput = {
  email?: string;
  name: string;
  role: UserRole;
  branch: string;
  staffSalesAll?: boolean;
  assignedStore?: CentralStockLocation;
  assignedInventoryLocations?: StockLocation[];
  password: string;
};

export type AuthUserMutationResult = { ok: true; user: AuthUser } | { ok: false; error: string };

/** Roles that can approve/post/reverse staff consumption and breakage. */
export const STAFF_CONSUMPTION_MANAGER_ROLES: UserRole[] = [
  "Administrator",
  "Branch Manager",
  "Supervisor",
  "Department Manager",
  "Store Manager",
  "Inventory Administrator",
];

/** Every signed-in role can open Staff Consumption and submit their own records. */
export function canAccessStaffConsumption(_role?: UserRole | string | null) {
  return true;
}

export function canManageStaffConsumption(role?: UserRole | string | null) {
  return Boolean(role && STAFF_CONSUMPTION_MANAGER_ROLES.includes(role as UserRole));
}

/** Roles that can approve (or directly post) an order return. */
export const ORDER_RETURN_APPROVER_ROLES: UserRole[] = [
  "Administrator",
  "Branch Manager",
  "Supervisor",
  "Cashier",
];

export function canApproveOrderReturns(role?: UserRole | string | null) {
  return Boolean(role && ORDER_RETURN_APPROVER_ROLES.includes(role as UserRole));
}

/** Same roles approve waiter open-bill handoffs. */
export function canApproveWaiterBillTransfers(role?: UserRole | string | null) {
  return canApproveOrderReturns(role);
}

/** Nav routes each role can access */
export const ROLE_NAV: Record<string, string[]> = {
  "Branch Manager": [
    "/app",
    "/app/notifications",
    "/app/pos",
    "/app/tables",
    "/app/orders",
    "/app/reservations",
    "/app/room",
    "/app/digital-menu",
    "/app/menu",
    "/app/recipes",
    "/app/stock-management",
    "/app/suppliers",
    "/app/customers",
    "/app/staff",
    "/app/staff-sales",
    "/app/staff-consumption",
    "/app/system-users",
    "/app/events",
    "/app/catering",
    "/app/payments",
    "/app/reports",
    "/app/printer-settings",
    "/app/settings",
  ],
  Administrator: [
    "/app",
    "/app/notifications",
    "/app/pos",
    "/app/tables",
    "/app/orders",
    "/app/reservations",
    "/app/room",
    "/app/digital-menu",
    "/app/menu",
    "/app/recipes",
    "/app/stock-management",
    "/app/suppliers",
    "/app/customers",
    "/app/staff",
    "/app/staff-sales",
    "/app/staff-consumption",
    "/app/system-users",
    "/app/events",
    "/app/catering",
    "/app/payments",
    "/app/reports",
    "/app/printer-settings",
    "/app/settings",
  ],
  "Inventory Administrator": [
    "/app",
    "/app/notifications",
    "/app/stock-management",
    "/app/suppliers",
    "/app/staff-consumption",
    "/app/reports",
    "/app/settings",
  ],
  "Store Manager": [
    "/app",
    "/app/notifications",
    "/app/stock-management",
    "/app/suppliers",
    "/app/staff-consumption",
    "/app/reports",
  ],
  "Department Manager": [
    "/app",
    "/app/notifications",
    "/app/stock-management",
    "/app/recipes",
    "/app/staff-sales",
    "/app/staff-consumption",
  ],
  Auditor: [
    "/app",
    "/app/notifications",
    "/app/stock-management",
    "/app/reports",
    "/app/payments",
    "/app/suppliers",
  ],
  Supervisor: [
    "/app",
    "/app/notifications",
    "/app/pos",
    "/app/tables",
    "/app/orders",
    "/app/reservations",
    "/app/room",
    "/app/digital-menu",
    "/app/menu",
    "/app/recipes",
    "/app/stock-management",
    "/app/suppliers",
    "/app/customers",
    "/app/staff",
    "/app/staff-sales",
    "/app/staff-consumption",
    "/app/system-users",
    "/app/events",
    "/app/catering",
    "/app/payments",
    "/app/reports",
    "/app/printer-settings",
    "/app/settings",
  ],
  Cashier: [
    "/app",
    "/app/notifications",
    "/app/pos",
    "/app/tables",
    "/app/orders",
    "/app/receipts",
    "/app/payments",
    "/app/staff-sales",
    "/app/printer-settings",
  ],
  Waiter: [
    "/app",
    "/app/notifications",
    "/app/pos",
    "/app/qr-scanner",
    "/app/tables",
    "/app/orders",
    "/app/staff-sales",
    "/app/reservations",
    "/app/digital-menu",
    "/app/printer-settings",
  ],
  "Kitchen Staff": ["/app", "/app/notifications",  "/app/stock-management", "/app/staff-sales"],
  Bartender: ["/app", "/app/notifications",  "/app/pos", "/app/orders", "/app/stock-management", "/app/staff-sales"],
  "Bar Staff": ["/app", "/app/notifications",  "/app/pos", "/app/orders", "/app/stock-management", "/app/staff-sales"],
  "Butcher House Staff": ["/app", "/app/notifications",  "/app/stock-management", "/app/staff-sales"],
  "Butcher Staff": ["/app", "/app/notifications",  "/app/stock-management", "/app/staff-sales"],
  "Coffee House Staff": ["/app", "/app/notifications",  "/app/stock-management", "/app/staff-sales"],
  Storekeeper: ["/app", "/app/notifications", "/app/stock-management", "/app/suppliers"],
  "Inventory Staff": ["/app", "/app/notifications", "/app/stock-management", "/app/suppliers"],
  "Procurement Officer": ["/app", "/app/notifications", "/app/suppliers", "/app/stock-management"],
  Reception: ["/app", "/app/notifications", "/app/reservations", "/app/customers", "/app/staff-sales"],
  "Hotel Staff": ["/app", "/app/notifications", "/app/reservations", "/app/room", "/app/customers", "/app/staff-sales"],
  Chef: ["/app", "/app/notifications",  "/app/recipes", "/app/stock-management", "/app/staff-sales"],
  "Event Coordinator": [
    "/app",
    "/app/notifications",
    "/app/events",
    "/app/catering",
    "/app/reservations",
  ],
  Accountant: ["/app", "/app/notifications", "/app/payments", "/app/reports", "/app/staff-sales", "/app/suppliers", "/app/stock-management"],
};

for (const routes of Object.values(ROLE_NAV)) {
  if (!routes.includes("/app/staff-consumption")) {
    routes.push("/app/staff-consumption");
  }
}

const KDS_NAV_ROLES: UserRole[] = [
  "Administrator",
  "Branch Manager",
  "Supervisor",
  "Cashier",
  "Kitchen Staff",
  "Chef",
  "Bartender",
  "Bar Staff",
  "Butcher House Staff",
  "Butcher Staff",
  "Coffee House Staff",
];
for (const role of KDS_NAV_ROLES) {
  const routes = ROLE_NAV[role];
  if (!routes.includes("/app/kds")) routes.push("/app/kds");
  if (!routes.includes("/app/kds-history")) routes.push("/app/kds-history");
}

export const DEMO_USERS: AuthUser[] = [
  {
    id: "u1",
    name: "Liya Demeke",
    role: "Branch Manager",
    branch: "Bole",
    avatar: "LD",
    password: "manager123",
  },
  {
    id: "u2",
    name: "Genet Tilahun",
    role: "Cashier",
    branch: "Bole",
    avatar: "GT",
    password: "cashier123",
  },
  {
    id: "u3",
    name: "Hanna Tadesse",
    role: "Waiter",
    branch: "Bole",
    avatar: "HT",
    password: "waiter123",
  },
  {
    id: "u4",
    name: "Chef Tewodros",
    role: "Kitchen Staff",
    branch: "Bole",
    assignedInventoryLocations: ["Kitchen"],
    avatar: "CT",
    password: "kitchen123",
  },
  {
    id: "u5",
    name: "Mulugeta Asfaw",
    role: "Bartender",
    branch: "Bole",
    assignedInventoryLocations: ["VIP Bar"],
    avatar: "MA",
    password: "bar123",
  },
  {
    id: "u5b",
    name: "Tilahun Bekele",
    role: "Bar Staff",
    branch: "Bole",
    assignedInventoryLocations: ["Main Bar"],
    avatar: "TB",
    password: "mainbar123",
  },
  {
    id: "u6",
    name: "Abel Tesfaye",
    role: "Storekeeper",
    branch: "Bole",
    assignedStore: "Store 1",
    assignedInventoryLocations: ["Store 1"],
    avatar: "AT",
    password: "store123",
  },
  {
    id: "u7",
    name: "Yonas Mulu",
    role: "Procurement Officer",
    branch: "Bole",
    assignedStore: "Store 2",
    assignedInventoryLocations: ["Store 2"],
    avatar: "YM",
    password: "procure123",
  },
  {
    id: "u8",
    name: "Selam Abebe",
    role: "Chef",
    branch: "Bole",
    avatar: "SA",
    password: "chef123",
  },
  {
    id: "u9",
    name: "Daniel Bekele",
    role: "Event Coordinator",
    branch: "Bole",
    avatar: "DB",
    password: "events123",
  },
  {
    id: "u10",
    name: "Tigist Alemu",
    role: "Accountant",
    branch: "Bole",
    avatar: "TA",
    password: "account123",
  },
  {
    id: "u11",
    name: "Bereket Alemu",
    role: "Butcher House Staff",
    branch: "Bole",
    assignedInventoryLocations: ["Butcher"],
    avatar: "BA",
    password: "butcher123",
  },
  {
    id: "u12",
    name: "Marta Yohannes",
    role: "Coffee House Staff",
    branch: "Bole",
    avatar: "MY",
    password: "coffee123",
  },
  {
    id: "u13",
    name: "Helen Girma",
    role: "Store Manager",
    branch: "Bole",
    avatar: "HG",
    password: "storemgr123",
  },
  {
    id: "u14",
    name: "Samuel Kebede",
    role: "Inventory Administrator",
    branch: "Bole",
    avatar: "SK",
    password: "invadmin123",
  },
  {
    id: "u15",
    name: "Rahel Desta",
    role: "Auditor",
    branch: "Bole",
    avatar: "RD",
    password: "audit123",
  },
  {
    id: "u16",
    name: "Kidist Hailu",
    role: "Department Manager",
    branch: "Bole",
    avatar: "KH",
    password: "deptmgr123",
  },
  {
    id: "u17",
    name: "Dawit Mekonnen",
    role: "Storekeeper",
    branch: "Bole",
    assignedStore: "Store 2",
    assignedInventoryLocations: ["Store 2"],
    avatar: "DM",
    password: "store2123",
  },
];

export const AuthContext = createContext<{
  user: AuthUser | null;
  users: AuthUser[];
  authMode: "demo" | "supabase";
  loading: boolean;
  login: (user: AuthUser) => void;
  signInWithPassword: (email: string, password: string) => Promise<AuthUserMutationResult>;
  signInWithPasswordOnly: (password: string) => Promise<AuthUserMutationResult>;
  logout: () => void;
  addUser: (input: AuthUserInput) => Promise<AuthUserMutationResult>;
  updateUser: (id: string, input: AuthUserInput) => Promise<AuthUserMutationResult>;
  removeUser: (id: string) => Promise<{ ok: true } | { ok: false; error: string }>;
}>({
  user: null,
  users: DEMO_USERS,
  authMode: "demo",
  loading: false,
  login: () => {},
  signInWithPassword: async () => ({ ok: false, error: "Not available" }),
  signInWithPasswordOnly: async () => ({ ok: false, error: "Not available" }),
  logout: () => {},
  addUser: async () => ({ ok: false, error: "Not available" }),
  updateUser: async () => ({ ok: false, error: "Not available" }),
  removeUser: async () => ({ ok: false, error: "Not available" }),
});

export const useAuth = () => useContext(AuthContext);
