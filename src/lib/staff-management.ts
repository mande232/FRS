import type { AuthUser } from "@/lib/auth-context";
import type { CentralStockLocation } from "@/lib/stock-management";
import { CENTRAL_STOCK_LOCATIONS, isStoreAssignmentRole } from "@/lib/stock-management";
import { formatTime as formatTimeDisplay, type ResolvedDateTimePreferences } from "@/lib/date-time";
import { loadSystemSettings } from "@/lib/system-settings";

export type StaffTabId =
  | "overview"
  | "staff"
  | "schedule"
  | "attendance"
  | "access";

/** Legacy tab ids still accepted via URL for bookmarks. */
export type LegacyStaffTabId =
  | "directory"
  | "shifts"
  | "roles"
  | "accounts"
  | "performance"
  | "audit";

export const STAFF_TABS: Array<{ id: StaffTabId; labelEn: string; labelAm: string }> = [
  { id: "overview", labelEn: "Overview", labelAm: "አጠቃላይ" },
  { id: "staff", labelEn: "Staff", labelAm: "ሰራተኞች" },
  { id: "schedule", labelEn: "Schedule", labelAm: "መርሐ ግብር" },
  { id: "attendance", labelEn: "Attendance", labelAm: "ተገኝነት" },
  { id: "access", labelEn: "Access & Roles", labelAm: "መዳረሻ እና ሚና" },
];

export function normalizeStaffTab(tab?: string | null): StaffTabId {
  switch (tab) {
    case "directory":
      return "staff";
    case "shifts":
      return "schedule";
    case "roles":
    case "accounts":
      return "access";
    case "performance":
    case "audit":
      return "staff";
    case "overview":
    case "staff":
    case "schedule":
    case "attendance":
    case "access":
      return tab;
    default:
      return "overview";
  }
}

/** Single clear operational status shown in Staff Directory / Overview. */
export type StaffAttendanceStatus =
  | "Working"
  | "On Break"
  | "Late"
  | "Absent"
  | "Shift Completed"
  | "Off Today"
  | "Not Scheduled";

export const STAFF_ATTENDANCE_STATUSES: StaffAttendanceStatus[] = [
  "Working",
  "On Break",
  "Late",
  "Absent",
  "Shift Completed",
  "Off Today",
  "Not Scheduled",
];

export type AccountStatus =
  | "Active"
  | "Disabled"
  | "Locked"
  | "Pending Activation"
  | "Password Reset Required"
  | "Archived";

export type EmploymentStatus = "Active" | "Probation" | "On Leave" | "Suspended" | "Resigned" | "Terminated" | "Archived";

export const WEEKDAY_KEYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"] as const;
export type WeekdayKey = (typeof WEEKDAY_KEYS)[number];

export type StaffScheduleRecord = {
  id: string;
  phone: string;
  shift: string;
  startTime: string;
  endTime: string;
  daysWorked: number;
  status: "On shift" | "Off";
  jobTitle?: string;
  department?: string;
  station?: string;
  inventoryLocation?: string;
  employeeId?: string;
  username?: string;
  employmentStatus?: EmploymentStatus;
  accountStatus?: AccountStatus;
  lastClockIn?: string;
  lastClockOut?: string;
  hireDate?: string;
  /** Days this staff is normally scheduled (Sun–Sat). Empty/undefined = every day. */
  workingDays?: WeekdayKey[];
  onBreak?: boolean;
};

export type StaffMemberOnly = {
  id: string;
  name: string;
  phone?: string;
  branch: string;
  jobTitle?: string;
  department?: string;
  linkedUserId?: string;
  employmentStatus: EmploymentStatus;
};

export type StaffMemberView = {
  id: string;
  name: string;
  avatar: string;
  email?: string;
  role: string;
  branch: string;
  phone: string;
  shift: string;
  startTime: string;
  endTime: string;
  daysWorked: number;
  status: "On shift" | "Off";
  attendanceStatus: StaffAttendanceStatus;
  scheduledToday: boolean;
  jobTitle: string;
  department: string;
  station: string;
  inventoryLocation: string;
  employeeId: string;
  username: string;
  employmentStatus: EmploymentStatus;
  accountStatus: AccountStatus;
  hasLoginAccount: boolean;
  workingDays: WeekdayKey[];
  lastClockIn?: string;
  lastClockOut?: string;
  password?: string;
  staffSalesAll?: boolean;
  onBreak?: boolean;
};

export type ShiftTemplate = {
  id: string;
  name: string;
  code: string;
  startTime: string;
  endTime: string;
  breakMinutes: number;
  lateToleranceMinutes: number;
  branch: string;
  department: string;
  active: boolean;
};

export type StaffQuickFilter =
  | "all"
  | "working"
  | "scheduled_today"
  | "late_absent"
  | "off_today"
  /** @deprecated kept for older saved filter state */
  | "on_shift"
  | "off_duty"
  | "morning"
  | "evening"
  | "no_login"
  | "disabled_account"
  | "unassigned_shift";

export type StaffFiltersState = {
  search: string;
  branch: string;
  department: string;
  station: string;
  jobTitle: string;
  role: string;
  shift: string;
  attendance: string;
  employment: string;
  account: string;
  quick: StaffQuickFilter;
};

export type StaffAuditEntry = {
  id: string;
  action: string;
  staffId: string;
  staffName: string;
  performedBy: string;
  performedByRole: string;
  branch: string;
  previousValue?: string;
  newValue?: string;
  atIso: string;
};

export const DEFAULT_SHIFTS: ShiftTemplate[] = [
  { id: "morning", name: "Morning Shift", code: "MORN", startTime: "07:00", endTime: "15:00", breakMinutes: 30, lateToleranceMinutes: 10, branch: "All", department: "All", active: true },
  { id: "evening", name: "Evening Shift", code: "EVE", startTime: "15:00", endTime: "23:00", breakMinutes: 30, lateToleranceMinutes: 10, branch: "All", department: "All", active: true },
];

const ROLE_DEPARTMENT: Record<string, string> = {
  Waiter: "Service",
  Cashier: "Front of House",
  Bartender: "VIP Bar",
  "Bar Staff": "Main Bar",
  "Kitchen Staff": "Kitchen",
  Chef: "Kitchen",
  Storekeeper: "Store",
  "Store Manager": "Store",
  "Butcher House Staff": "Butcher House",
  "Butcher Staff": "Butcher House",
  "Coffee House Staff": "Coffee House",
  Accountant: "Finance",
  Auditor: "Finance",
};

const ROLE_STATION: Record<string, string> = {
  Waiter: "Main Hall",
  Bartender: "VIP Bar",
  "Bar Staff": "Main Bar",
  "Kitchen Staff": "Kitchen",
  Chef: "Kitchen",
  Storekeeper: "Store 1",
  "Butcher House Staff": "Butcher House",
  "Coffee House Staff": "Coffee House",
};

const ROLE_INVENTORY: Record<string, string> = {
  Bartender: "VIP Bar",
  "Bar Staff": "Main Bar",
  "Kitchen Staff": "Kitchen",
  Chef: "Kitchen",
  Storekeeper: "Store 1",
  "Butcher House Staff": "Butcher",
  "Coffee House Staff": "Coffee House",
};

export const CENTRAL_STORE_ASSIGNMENT_OPTIONS = [...CENTRAL_STOCK_LOCATIONS] as const;

export function defaultInventoryLocationForUser(
  user: Pick<AuthUser, "role" | "assignedStore" | "assignedInventoryLocations">,
): string {
  if (user.assignedInventoryLocations?.length) {
    return user.assignedInventoryLocations.map((loc) => (loc === "Butcher" ? "Butcher House" : loc)).join(", ");
  }
  if (user.assignedStore) return user.assignedStore;
  return ROLE_INVENTORY[user.role] ?? "—";
}

export function validateStoreRoleAssignment(
  role: string,
  assignedStore?: CentralStockLocation,
): string | null {
  if (!isStoreAssignmentRole(role)) return null;
  if (!assignedStore) return "Store roles must be assigned to Store 1 or Store 2.";
  if (!CENTRAL_STOCK_LOCATIONS.includes(assignedStore)) return "Assigned store must be Store 1 or Store 2.";
  return null;
}

export function defaultStaffSchedule(user: AuthUser): StaffScheduleRecord {
  return {
    id: user.id,
    phone: "",
    shift: "Morning",
    startTime: "07:00",
    endTime: "15:00",
    daysWorked: 0,
    status: "Off",
    jobTitle: user.role,
    department: ROLE_DEPARTMENT[user.role] ?? "General",
    station: ROLE_STATION[user.role] ?? "—",
    inventoryLocation: defaultInventoryLocationForUser(user),
    employeeId: user.id.slice(0, 8).toUpperCase(),
    username: user.name.split(/\s+/)[0]?.toLowerCase() ?? user.id,
    employmentStatus: "Active",
    accountStatus: "Active",
  };
}

export function defaultStaffFilters(): StaffFiltersState {
  return {
    search: "",
    branch: "All",
    department: "All",
    station: "All",
    jobTitle: "All",
    role: "All",
    shift: "All",
    attendance: "All",
    employment: "All",
    account: "All",
    quick: "all",
  };
}

function dateTimePrefs(): Partial<ResolvedDateTimePreferences> {
  try {
    return loadSystemSettings().calendar;
  } catch {
    return undefined;
  }
}

export function formatHmTo12h(hm: string, prefs = dateTimePrefs()) {
  const [h, m] = hm.split(":").map(Number);
  if (!Number.isFinite(h) || !Number.isFinite(m)) return hm;
  const date = new Date(2000, 0, 1, h, m);
  return formatTimeDisplay(date, prefs);
}

export function formatShiftRange(start: string, end: string, prefs = dateTimePrefs()) {
  return `${formatHmTo12h(start, prefs)}–${formatHmTo12h(end, prefs)}`;
}

function parseHmMinutes(hm: string): number | null {
  const [hRaw, mRaw] = hm.split(":");
  const h = Number(hRaw);
  const m = Number(mRaw);
  if (!Number.isFinite(h) || !Number.isFinite(m)) return null;
  return h * 60 + m;
}

export function isSameCalendarDay(iso: string | undefined, now = new Date()): boolean {
  if (!iso) return false;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return false;
  return (
    d.getFullYear() === now.getFullYear() &&
    d.getMonth() === now.getMonth() &&
    d.getDate() === now.getDate()
  );
}

export function weekdayKey(date = new Date()): WeekdayKey {
  return WEEKDAY_KEYS[date.getDay()] ?? "Mon";
}

export function hasAssignedShift(member: Pick<StaffMemberView, "shift" | "startTime" | "endTime">): boolean {
  const shift = member.shift?.trim();
  if (!shift || shift.toLowerCase() === "unassigned") return false;
  return Boolean(parseHmMinutes(member.startTime) != null && parseHmMinutes(member.endTime) != null);
}

export function isScheduledToday(
  member: Pick<StaffMemberView, "shift" | "startTime" | "endTime" | "workingDays" | "employmentStatus">,
  now = new Date(),
): boolean {
  if (
    member.employmentStatus === "Terminated" ||
    member.employmentStatus === "Resigned" ||
    member.employmentStatus === "Archived"
  ) {
    return false;
  }
  if (!hasAssignedShift(member)) return false;
  const days = member.workingDays;
  if (!days || days.length === 0) return true;
  return days.includes(weekdayKey(now));
}

/**
 * One clear restaurant-ops status from schedule + clock data.
 * After shift end: Completed / Absent — never a vague "Off Duty".
 */
export function resolveOperationalAttendanceStatus(
  member: Pick<
    StaffMemberView,
    | "status"
    | "shift"
    | "startTime"
    | "endTime"
    | "workingDays"
    | "employmentStatus"
    | "lastClockIn"
    | "lastClockOut"
    | "onBreak"
  >,
  now = new Date(),
  lateToleranceMinutes = 10,
): StaffAttendanceStatus {
  if (member.employmentStatus === "On Leave") return "Off Today";
  if (
    member.employmentStatus === "Terminated" ||
    member.employmentStatus === "Resigned" ||
    member.employmentStatus === "Archived"
  ) {
    return "Not Scheduled";
  }

  if (!isScheduledToday(member, now)) {
    return hasAssignedShift(member) ? "Off Today" : "Not Scheduled";
  }

  if (member.status === "On shift") {
    return member.onBreak ? "On Break" : "Working";
  }

  const start = parseHmMinutes(member.startTime);
  const end = parseHmMinutes(member.endTime);
  if (start == null || end == null) return "Not Scheduled";

  const nowMin = now.getHours() * 60 + now.getMinutes();
  const overnight = end <= start;
  const clockedInToday = isSameCalendarDay(member.lastClockIn, now);
  const clockedOutToday = isSameCalendarDay(member.lastClockOut, now);
  const clockOutAfterIn =
    clockedInToday &&
    clockedOutToday &&
    member.lastClockIn &&
    member.lastClockOut &&
    new Date(member.lastClockOut).getTime() >= new Date(member.lastClockIn).getTime();

  const withinShift = overnight
    ? nowMin >= start || nowMin < end
    : nowMin >= start && nowMin < end;
  const afterShift = overnight ? nowMin >= end && nowMin < start : nowMin >= end;
  const beforeShift = !withinShift && !afterShift;

  if (clockOutAfterIn) return "Shift Completed";

  if (clockedInToday && !clockedOutToday) {
    // Clocked in but schedule status flipped Off — treat as completed if past end, else working
    return afterShift ? "Shift Completed" : "Working";
  }

  if (beforeShift) return "Off Today";

  if (withinShift) {
    if (!clockedInToday) {
      const lateAfter = start + lateToleranceMinutes;
      if (overnight) {
        // Late only after start on the evening side
        if (nowMin >= start && nowMin > lateAfter) return "Late";
        if (nowMin < end) return "Late"; // early morning of overnight without clock-in
        return "Off Today";
      }
      return nowMin > lateAfter ? "Late" : "Off Today";
    }
    return "Working";
  }

  // After scheduled end
  if (!clockedInToday) return "Absent";
  return "Shift Completed";
}

function buildViewFields(
  base: Omit<StaffMemberView, "attendanceStatus" | "scheduledToday">,
): StaffMemberView {
  const scheduledToday = isScheduledToday(base);
  const attendanceStatus = resolveOperationalAttendanceStatus(base);
  return { ...base, scheduledToday, attendanceStatus };
}

export function mergeStaffMember(user: AuthUser, metadata?: Partial<StaffScheduleRecord>): StaffMemberView {
  const base = defaultStaffSchedule(user);
  const record = { ...base, ...metadata, id: user.id };
  const workingDays = (record.workingDays?.length ? record.workingDays : [...WEEKDAY_KEYS]) as WeekdayKey[];

  return buildViewFields({
    id: user.id,
    name: user.name,
    avatar: user.avatar,
    email: user.email,
    role: user.role,
    branch: user.branch,
    phone: record.phone,
    shift: record.shift,
    startTime: record.startTime,
    endTime: record.endTime,
    daysWorked: record.daysWorked,
    status: record.status,
    jobTitle: record.jobTitle ?? user.role,
    department: record.department ?? ROLE_DEPARTMENT[user.role] ?? "General",
    station: record.station ?? ROLE_STATION[user.role] ?? "—",
    inventoryLocation: record.inventoryLocation ?? defaultInventoryLocationForUser(user),
    employeeId: record.employeeId ?? user.id.slice(0, 8).toUpperCase(),
    username: record.username ?? user.name.split(/\s+/)[0]?.toLowerCase() ?? user.id,
    employmentStatus: record.employmentStatus ?? "Active",
    accountStatus: record.accountStatus ?? "Active",
    hasLoginAccount: true,
    workingDays,
    lastClockIn: record.lastClockIn,
    lastClockOut: record.lastClockOut,
    password: user.password,
    staffSalesAll: user.staffSalesAll,
    onBreak: record.onBreak,
  });
}

export function mergeStaffOnly(member: StaffMemberOnly, metadata?: Partial<StaffScheduleRecord>): StaffMemberView {
  const id = member.id;
  const record = {
    ...defaultStaffSchedule({ id, name: member.name, role: "Waiter", branch: member.branch, avatar: "??", password: "" }),
    ...metadata,
    id,
  };
  const workingDays = (record.workingDays?.length ? record.workingDays : [...WEEKDAY_KEYS]) as WeekdayKey[];
  return buildViewFields({
    id,
    name: member.name,
    avatar: member.name.split(/\s+/).map((p) => p[0]).join("").slice(0, 2).toUpperCase(),
    role: "—",
    branch: member.branch,
    phone: member.phone ?? record.phone,
    shift: record.shift,
    startTime: record.startTime,
    endTime: record.endTime,
    daysWorked: record.daysWorked,
    status: record.status,
    jobTitle: member.jobTitle ?? record.jobTitle ?? "Staff",
    department: member.department ?? record.department ?? "General",
    station: record.station ?? "—",
    inventoryLocation: record.inventoryLocation ?? "—",
    employeeId: record.employeeId ?? id.slice(0, 8).toUpperCase(),
    username: record.username ?? member.name.split(/\s+/)[0]?.toLowerCase() ?? id,
    employmentStatus: member.employmentStatus,
    accountStatus: member.linkedUserId ? (record.accountStatus ?? "Active") : "Pending Activation",
    hasLoginAccount: Boolean(member.linkedUserId),
    workingDays,
    lastClockIn: record.lastClockIn,
    lastClockOut: record.lastClockOut,
    onBreak: record.onBreak,
  });
}

export function buildStaffDirectory(
  users: readonly AuthUser[],
  metadata: readonly StaffScheduleRecord[],
  staffOnly: readonly StaffMemberOnly[] = [],
): StaffMemberView[] {
  const metadataById = new Map(metadata.map((row) => [row.id, row]));
  const linked = new Set(staffOnly.map((row) => row.linkedUserId).filter(Boolean));

  const fromUsers = users.map((user) => mergeStaffMember(user, metadataById.get(user.id)));
  const fromStaffOnly = staffOnly
    .filter((row) => !row.linkedUserId || !linked.has(row.linkedUserId))
    .map((row) => mergeStaffOnly(row, metadataById.get(row.id)));

  return [...fromUsers, ...fromStaffOnly].sort((a, b) => a.name.localeCompare(b.name));
}

export function computeStaffSummary(staff: readonly StaffMemberView[]) {
  const scheduledToday = staff.filter((row) => row.scheduledToday).length;
  const workingNow = staff.filter((row) => row.attendanceStatus === "Working" || row.attendanceStatus === "On Break").length;
  const lateAbsent = staff.filter((row) => row.attendanceStatus === "Late" || row.attendanceStatus === "Absent").length;
  const completedShifts = staff.filter((row) => row.attendanceStatus === "Shift Completed").length;
  const offToday = staff.filter((row) => row.attendanceStatus === "Off Today" || row.attendanceStatus === "Not Scheduled").length;
  const noLogin = staff.filter((row) => !row.hasLoginAccount).length;
  const unassigned = staff.filter((row) => !hasAssignedShift(row)).length;
  return {
    total: staff.length,
    scheduledToday,
    workingNow,
    lateAbsent,
    completedShifts,
    offToday,
    noLogin,
    unassigned,
    /** Legacy aliases used by older UI fragments */
    onShift: workingNow,
    offDuty: staff.length - workingNow,
    morning: staff.filter((row) => row.shift === "Morning").length,
    evening: staff.filter((row) => row.shift === "Evening").length,
    unassignedShift: unassigned,
    activeAccounts: staff.filter((row) => row.hasLoginAccount && row.accountStatus === "Active").length,
    disabledAccounts: staff.filter((row) => row.accountStatus === "Disabled" || row.accountStatus === "Archived").length,
  };
}

export function filterStaffMembers(staff: readonly StaffMemberView[], filters: StaffFiltersState): StaffMemberView[] {
  const query = filters.search.trim().toLowerCase();
  return staff.filter((row) => {
    if (filters.branch !== "All" && row.branch !== filters.branch) return false;
    if (filters.department !== "All" && row.department !== filters.department) return false;
    if (filters.station !== "All" && row.station !== filters.station) return false;
    if (filters.jobTitle !== "All" && row.jobTitle !== filters.jobTitle) return false;
    if (filters.role !== "All" && row.role !== filters.role) return false;
    if (filters.shift !== "All" && row.shift !== filters.shift) return false;
    if (filters.employment !== "All" && row.employmentStatus !== filters.employment) return false;
    if (filters.account === "No Account") {
      if (row.hasLoginAccount) return false;
    } else if (filters.account !== "All" && row.accountStatus !== filters.account) {
      return false;
    }
    if (filters.attendance !== "All" && row.attendanceStatus !== filters.attendance) return false;

    if (query) {
      const haystack = [row.name, row.employeeId, row.phone, row.email ?? "", row.username, row.role, row.jobTitle, row.station].join(" ").toLowerCase();
      if (!haystack.includes(query)) return false;
    }

    switch (filters.quick) {
      case "working":
      case "on_shift":
        if (row.attendanceStatus !== "Working" && row.attendanceStatus !== "On Break") return false;
        break;
      case "scheduled_today":
        if (!row.scheduledToday) return false;
        break;
      case "late_absent":
        if (row.attendanceStatus !== "Late" && row.attendanceStatus !== "Absent") return false;
        break;
      case "off_today":
      case "off_duty":
        if (row.attendanceStatus !== "Off Today" && row.attendanceStatus !== "Not Scheduled") return false;
        break;
      case "morning":
        if (row.shift !== "Morning") return false;
        break;
      case "evening":
        if (row.shift !== "Evening") return false;
        break;
      case "no_login":
        if (row.hasLoginAccount) return false;
        break;
      case "disabled_account":
        if (row.accountStatus !== "Disabled" && row.accountStatus !== "Archived") return false;
        break;
      case "unassigned_shift":
        if (hasAssignedShift(row)) return false;
        break;
      default:
        break;
    }
    return true;
  });
}

export function exportStaffCsv(staff: readonly StaffMemberView[]) {
  const headers = ["name", "employeeId", "jobTitle", "role", "branch", "department", "shift", "phone", "email", "accountStatus"];
  const rows = staff.map((row) =>
    [row.name, row.employeeId, row.jobTitle, row.role, row.branch, row.department, row.shift, row.phone, row.email ?? "", row.accountStatus]
      .map((cell) => `"${String(cell).replace(/"/g, '""')}"`)
      .join(","),
  );
  return [headers.join(","), ...rows].join("\n");
}

export function loadStaffAudit(): StaffAuditEntry[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem("ethioplate.staff-audit");
    return raw ? (JSON.parse(raw) as StaffAuditEntry[]) : [];
  } catch {
    return [];
  }
}

export function appendStaffAudit(entry: Omit<StaffAuditEntry, "id" | "atIso">) {
  if (typeof window === "undefined") return;
  const next: StaffAuditEntry = {
    ...entry,
    id: `staff-audit-${Date.now()}`,
    atIso: new Date().toISOString(),
  };
  const log = [next, ...loadStaffAudit()].slice(0, 300);
  window.localStorage.setItem("ethioplate.staff-audit", JSON.stringify(log));
}

export type JobTitle = {
  id: string;
  name: string;
  description: string;
  department: string;
  defaultStation: string;
  defaultShift: string;
  active: boolean;
};

export const DEFAULT_JOB_TITLES: JobTitle[] = [
  { id: "branch-manager", name: "Branch Manager", description: "Branch operations lead", department: "Management", defaultStation: "—", defaultShift: "Morning", active: true },
  { id: "cashier", name: "Cashier", description: "Front-of-house payments", department: "Front of House", defaultStation: "POS", defaultShift: "Morning", active: true },
  { id: "waiter", name: "Waiter", description: "Table service", department: "Service", defaultStation: "Main Hall", defaultShift: "Morning", active: true },
  { id: "bartender", name: "Bartender", description: "Bar service", department: "VIP Bar", defaultStation: "VIP Bar", defaultShift: "Evening", active: true },
  { id: "kitchen", name: "Kitchen Staff", description: "Kitchen production", department: "Kitchen", defaultStation: "Kitchen", defaultShift: "Morning", active: true },
  { id: "chef", name: "Chef", description: "Kitchen lead", department: "Kitchen", defaultStation: "Kitchen", defaultShift: "Morning", active: true },
  { id: "storekeeper", name: "Storekeeper", description: "Inventory control", department: "Store", defaultStation: "Store 1", defaultShift: "Morning", active: true },
  { id: "butcher", name: "Butcher", description: "Butcher house", department: "Butcher House", defaultStation: "Butcher House", defaultShift: "Morning", active: true },
  { id: "coffee", name: "Coffee House Staff", description: "Coffee service", department: "Coffee House", defaultStation: "Coffee House", defaultShift: "Morning", active: true },
  { id: "events", name: "Event Coordinator", description: "Events and catering", department: "Events", defaultStation: "—", defaultShift: "All day", active: true },
  { id: "cleaner", name: "Cleaner", description: "Cleaning and hygiene", department: "Facilities", defaultStation: "—", defaultShift: "Evening", active: true },
  { id: "accountant", name: "Accountant", description: "Finance and reporting", department: "Finance", defaultStation: "—", defaultShift: "Morning", active: true },
  { id: "security", name: "Security", description: "Premises security", department: "Security", defaultStation: "—", defaultShift: "Evening", active: true },
];

export const PERMISSION_MODULES = [
  "Dashboard", "POS", "Orders", "Tables", "KDS", "Payments", "Refunds", "Voids", "Discounts",
  "Menu", "Pricing", "Inventory", "Goods Receiving", "Stock Requests", "Transfers", "Stock Counts",
  "Reports", "Staff", "Settings", "Audit Logs",
] as const;

export const PERMISSION_ACTIONS = [
  "View", "Create", "Edit", "Approve", "Cancel", "Void", "Export", "Delete Draft", "Manage Settings",
] as const;

export function loadShiftTemplates(): ShiftTemplate[] {
  if (typeof window === "undefined") return DEFAULT_SHIFTS;
  try {
    const raw = window.localStorage.getItem("ethioplate.staff-shifts");
    return raw ? (JSON.parse(raw) as ShiftTemplate[]) : DEFAULT_SHIFTS;
  } catch {
    return DEFAULT_SHIFTS;
  }
}

export function saveShiftTemplates(templates: ShiftTemplate[]) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem("ethioplate.staff-shifts", JSON.stringify(templates));
}

export function loadJobTitles(): JobTitle[] {
  if (typeof window === "undefined") return DEFAULT_JOB_TITLES;
  try {
    const raw = window.localStorage.getItem("ethioplate.job-titles");
    return raw ? (JSON.parse(raw) as JobTitle[]) : DEFAULT_JOB_TITLES;
  } catch {
    return DEFAULT_JOB_TITLES;
  }
}

export function daysWorkedLabel(days: number, t: (en: string, am?: string) => string) {
  if (days <= 0) return t("No attendance data", "የተገኝነት መረጃ የለም");
  return `${days} ${t("days", "ቀናት")}`;
}

export function accountStatusTone(status: AccountStatus): "teff" | "muted" | "destructive" | "gold" {
  if (status === "Active") return "teff";
  if (status === "Disabled" || status === "Archived") return "muted";
  if (status === "Locked") return "destructive";
  return "gold";
}

export function attendanceStatusTone(status: StaffAttendanceStatus): "teff" | "muted" | "destructive" | "gold" | "ember" {
  if (status === "Working") return "teff";
  if (status === "Late" || status === "Absent") return "destructive";
  if (status === "On Break" || status === "Shift Completed") return "gold";
  if (status === "Off Today") return "ember";
  return "muted";
}

export function accountLabel(member: Pick<StaffMemberView, "hasLoginAccount" | "accountStatus">): string {
  if (!member.hasLoginAccount) return "No Account";
  if (member.accountStatus === "Active") return "Account Active";
  return member.accountStatus;
}