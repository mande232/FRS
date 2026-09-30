import { useEffect, useMemo, useState } from "react";
import * as Icons from "lucide-react";
import { Link } from "@tanstack/react-router";
import { DateRangePicker } from "@/components/date-range/date-range-picker";
import { RealtimeBadge } from "@/components/realtime-badge";
import { StaffFiltersPanel } from "@/components/staff/staff-filters";
import { StaffMemberDrawer } from "@/components/staff/staff-member-drawer";
import {
  buildPaginationSteps,
  downloadTextFile,
  readInitialStaffTab,
  staffInitials,
} from "@/components/staff/staff-shared";
import { StaffUserModal } from "@/components/staff/staff-user-modal";
import { Card, Chip, PageHeader, Stat } from "@/components/ui-kit";
import type { AuthUser, AuthUserInput } from "@/lib/auth-context";
import { defaultDateRangeValue, formatDateTime } from "@/lib/date-time";
import { useT } from "@/lib/i18n";
import { showError, showSuccess } from "@/lib/toast";
import { activeBranchNames, loadCachedBranches } from "@/lib/branches";
import { loadSystemSettings } from "@/lib/system-settings";
import {
  STAFF_TABS,
  WEEKDAY_KEYS,
  appendStaffAudit,
  accountLabel,
  accountStatusTone,
  attendanceStatusTone,
  buildStaffDirectory,
  computeStaffSummary,
  defaultStaffFilters,
  defaultStaffSchedule,
  exportStaffCsv,
  filterStaffMembers,
  formatShiftRange,
  hasAssignedShift,
  loadJobTitles,
  loadShiftTemplates,
  loadStaffAudit,
  normalizeStaffTab,
  PERMISSION_ACTIONS,
  PERMISSION_MODULES,
  resolveOperationalAttendanceStatus,
  saveShiftTemplates,
  type ShiftTemplate,
  type StaffFiltersState,
  type StaffMemberOnly,
  type StaffMemberView,
  type StaffScheduleRecord,
  type StaffTabId,
  type WeekdayKey,
} from "@/lib/staff-management";
import { USER_ROLES } from "@/lib/users";
import type { BackendRealtimeStatus } from "@/lib/supabase/pos-backend";

const PAGE_SIZE = 12;
const SHIFTS = ["Morning", "Evening", "All day"];

type StaffShellProps = {
  initialTab?: StaffTabId;
  branch: string;
  currentUserId: string;
  currentUserName: string;
  currentUserRole: string;
  users: AuthUser[];
  authMode: "demo" | "supabase";
  realtimeStatus: BackendRealtimeStatus;
  lastSyncAt: string;
  scheduleMetadata: StaffScheduleRecord[];
  staffOnly: StaffMemberOnly[];
  onSaveScheduleMetadata: (records: StaffScheduleRecord[]) => void;
  onSaveStaffOnly: (records: StaffMemberOnly[]) => void;
  addUser: (input: AuthUserInput) => Promise<{ ok: true; user: AuthUser } | { ok: false; error: string }>;
  updateUser: (id: string, input: AuthUserInput) => Promise<{ ok: true; user: AuthUser } | { ok: false; error: string }>;
  removeUser: (id: string) => Promise<{ ok: true } | { ok: false; error: string }>;
};

function useStaffPermissions(role: string) {
  const canManage =
    role === "Administrator" || role === "Branch Manager" || role === "Department Manager" || role === "Supervisor";
  const canManageAccounts = role === "Administrator" || role === "Branch Manager";
  const canManageRoles = role === "Administrator";
  return { canManage, canManageAccounts, canManageRoles };
}

export function StaffShell(props: StaffShellProps) {
  const t = useT();
  const prefs = loadSystemSettings().calendar;
  const permissions = useStaffPermissions(props.currentUserRole);

  const [tab, setTab] = useState<StaffTabId>(() => normalizeStaffTab(props.initialTab ?? readInitialStaffTab()));
  const [dateRange, setDateRange] = useState(defaultDateRangeValue);
  const [filters, setFilters] = useState<StaffFiltersState>(() => defaultStaffFilters());
  const [filtersExpanded, setFiltersExpanded] = useState(false);
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState<StaffMemberView | null>(null);
  const [showMoreActions, setShowMoreActions] = useState(false);
  const [showAddAccount, setShowAddAccount] = useState(false);
  const [editingAccount, setEditingAccount] = useState<AuthUser | null>(null);
  const [showAddStaff, setShowAddStaff] = useState(false);
  const [scheduleSection, setScheduleSection] = useState<"assignments" | "templates">("assignments");
  const [accessSection, setAccessSection] = useState<"accounts" | "roles">("accounts");
  const [auditTick, setAuditTick] = useState(0);
  const [removingId, setRemovingId] = useState<string | null>(null);
  const [shiftTemplates, setShiftTemplates] = useState<ShiftTemplate[]>(() => loadShiftTemplates());
  const [editingShift, setEditingShift] = useState<ShiftTemplate | null>(null);

  const staff = useMemo(
    () => buildStaffDirectory(props.users, props.scheduleMetadata, props.staffOnly),
    [props.users, props.scheduleMetadata, props.staffOnly],
  );

  const summary = useMemo(() => computeStaffSummary(staff), [staff]);
  const filtered = useMemo(() => filterStaffMembers(staff, filters), [staff, filters]);
  const auditLog = useMemo(() => loadStaffAudit(), [auditTick, tab]);

  const branches = useMemo(() => ["All", ...new Set(staff.map((row) => row.branch))], [staff]);
  const stations = useMemo(() => ["All", ...new Set(staff.map((row) => row.station).filter(Boolean))], [staff]);
  const jobTitles = useMemo(() => ["All", ...new Set(staff.map((row) => row.jobTitle))], [staff]);
  const shifts = useMemo(() => ["All", ...SHIFTS], []);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const currentPage = Math.min(page, totalPages);
  const pageRows = useMemo(() => {
    const start = (currentPage - 1) * PAGE_SIZE;
    return filtered.slice(start, start + PAGE_SIZE);
  }, [filtered, currentPage]);
  const pageSteps = useMemo(() => buildPaginationSteps(currentPage, totalPages), [currentPage, totalPages]);

  const overviewRows = useMemo(() => {
    const priority = (status: StaffMemberView["attendanceStatus"]) => {
      if (status === "Late" || status === "Absent") return 0;
      if (status === "Working" || status === "On Break") return 1;
      if (status === "Shift Completed") return 2;
      return 3;
    };
    return [...staff]
      .sort((a, b) => priority(a.attendanceStatus) - priority(b.attendanceStatus) || a.name.localeCompare(b.name))
      .slice(0, 8);
  }, [staff]);

  useEffect(() => setPage(1), [filters, tab]);
  useEffect(() => setPage((p) => Math.min(Math.max(1, p), totalPages)), [totalPages]);
  useEffect(() => {
    if (props.initialTab) setTab(normalizeStaffTab(props.initialTab));
  }, [props.initialTab]);
  useEffect(() => {
    if (!selected) return;
    const fresh = staff.find((row) => row.id === selected.id);
    if (fresh) setSelected(fresh);
  }, [staff]); // eslint-disable-line react-hooks/exhaustive-deps -- refresh drawer from rebuilt directory

  function upsertSchedule(record: StaffScheduleRecord) {
    const next = props.scheduleMetadata.some((row) => row.id === record.id)
      ? props.scheduleMetadata.map((row) => (row.id === record.id ? record : row))
      : [...props.scheduleMetadata, record];
    props.onSaveScheduleMetadata(next);
  }

  function syncUserAssignedStore(user: AuthUser, input: AuthUserInput) {
    const locations = input.assignedInventoryLocations ?? (input.assignedStore ? [input.assignedStore] : []);
    if (!locations.length) return;
    const existing = props.scheduleMetadata.find((row) => row.id === user.id);
    upsertSchedule({
      ...(existing ?? defaultStaffSchedule(user)),
      id: user.id,
      inventoryLocation: locations.map((loc) => (loc === "Butcher" ? "Butcher House" : loc)).join(", "),
    });
  }

  function clockToggle(member: StaffMemberView) {
    const nowIso = new Date().toISOString();
    const onShift = member.status !== "On shift";
    const nextRecord: StaffScheduleRecord = {
      id: member.id,
      phone: member.phone,
      shift: member.shift,
      startTime: member.startTime,
      endTime: member.endTime,
      daysWorked: onShift ? member.daysWorked : member.daysWorked + 1,
      status: onShift ? "On shift" : "Off",
      jobTitle: member.jobTitle,
      department: member.department,
      station: member.station,
      inventoryLocation: member.inventoryLocation,
      employeeId: member.employeeId,
      username: member.username,
      employmentStatus: member.employmentStatus,
      accountStatus: member.accountStatus,
      workingDays: member.workingDays,
      lastClockIn: onShift ? nowIso : member.lastClockIn,
      lastClockOut: onShift ? member.lastClockOut : nowIso,
    };
    upsertSchedule(nextRecord);
    appendStaffAudit({
      action: onShift ? "Clock-In" : "Clock-Out",
      staffId: member.id,
      staffName: member.name,
      performedBy: props.currentUserName,
      performedByRole: props.currentUserRole,
      branch: member.branch,
      newValue: onShift ? "On shift" : "Off",
    });
    showSuccess(onShift ? t("Clocked in.", "ተገብቷል።") : t("Clocked out.", "ወጥቷል።"));
    setAuditTick((value) => value + 1);
    if (selected?.id === member.id) {
      const nextView: StaffMemberView = {
        ...member,
        status: nextRecord.status,
        daysWorked: nextRecord.daysWorked,
        lastClockIn: nextRecord.lastClockIn,
        lastClockOut: nextRecord.lastClockOut,
        scheduledToday: member.scheduledToday,
        attendanceStatus: "Working",
      };
      nextView.attendanceStatus = resolveOperationalAttendanceStatus(nextView);
      setSelected(nextView);
    }
  }

  function applyOverviewFilter(quick: StaffFiltersState["quick"], targetTab: StaffTabId = "staff") {
    setFilters((current) => ({ ...current, quick }));
    setTab(targetTab);
  }

  function handleExport() {
    const csv = exportStaffCsv(filtered);
    downloadTextFile(`staff-directory-${new Date().toISOString().slice(0, 10)}.csv`, csv, "text/csv");
    showSuccess(t("Staff directory exported.", "የሰራተኞች ዝርዝር ተላከ።"));
    setShowMoreActions(false);
  }

  async function handleDisableAccount(id: string) {
    setRemovingId(id);
    try {
      const result = await props.removeUser(id);
      if (!result.ok) showError(result.error);
      else {
        showSuccess(t("Account access revoked (deactivated). Historical records preserved.", "የመለያ መዳረሻ ተሰርዟል። ታሪካዊ መዝገቦች ተጠብቀዋል።"));
        setAuditTick((value) => value + 1);
        appendStaffAudit({
          action: "Account Disabled",
          staffId: id,
          staffName: staff.find((row) => row.id === id)?.name ?? id,
          performedBy: props.currentUserName,
          performedByRole: props.currentUserRole,
          branch: props.branch,
        });
        if (selected?.id === id) setSelected(null);
      }
    } finally {
      setRemovingId(null);
    }
  }

  const selectedAudit = useMemo(
    () => (selected ? auditLog.filter((entry) => entry.staffId === selected.id) : []),
    [auditLog, selected],
  );

  return (
    <div>
      <PageHeader
        title={t("Staff Management", "የሰራተኞች አስተዳደር")}
        action={
          <div className="flex flex-wrap items-center gap-2">
            <DateRangePicker value={dateRange} onChange={setDateRange} preferences={prefs} compact />
            <RealtimeBadge status={props.realtimeStatus} lastSyncAt={props.lastSyncAt} />
            <Link to="/app/notifications" className="size-10 grid place-items-center rounded-lg border border-border bg-card hover:bg-surface-2">
              <Icons.Bell className="size-4" />
            </Link>
            <div className="h-10 px-3 rounded-lg border border-border bg-card text-sm inline-flex items-center gap-2">
              <div className="size-7 rounded-full bg-gradient-to-br from-ember to-teff grid place-items-center text-ember-foreground text-[10px] font-semibold">
                {staffInitials(props.currentUserName)}
              </div>
              <span className="hidden sm:inline max-w-[120px] truncate">{props.currentUserName}</span>
            </div>
          </div>
        }
      />

      <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
        <p className="text-sm text-muted-foreground max-w-xl">
          {t(
            "Who works here, who is working now, and who is scheduled today.",
            "ማን ይሰራል፣ አሁን ማን በስራ ላይ ነው፣ ዛሬ ማን ታቅዷል።",
          )}
        </p>
        <div className="flex flex-wrap items-center gap-2 relative">
          {permissions.canManage && (
            <button
              type="button"
              onClick={() => setShowAddStaff(true)}
              className="h-10 px-4 rounded-lg bg-ember text-ember-foreground text-sm font-semibold inline-flex items-center gap-1.5"
            >
              <Icons.Plus className="size-4" /> {t("Add Staff", "ሰራተኛ ጨምር")}
            </button>
          )}
          <button
            type="button"
            onClick={() => setShowMoreActions((open) => !open)}
            className="h-10 px-3 rounded-lg border border-border bg-card text-sm hover:bg-surface-2 inline-flex items-center gap-1.5"
          >
            <Icons.MoreHorizontal className="size-4" />
            {t("More", "ተጨማሪ")}
          </button>
          {showMoreActions && (
            <>
              <div className="fixed inset-0 z-30" onClick={() => setShowMoreActions(false)} aria-hidden="true" />
              <div className="absolute right-0 top-11 z-40 w-56 rounded-xl border border-border bg-card shadow-lg py-1 text-sm">
                {permissions.canManageAccounts && (
                  <MoreAction
                    icon={Icons.KeyRound}
                    label={t("Create login account", "መለያ ፍጠር")}
                    onClick={() => {
                      setShowAddAccount(true);
                      setTab("access");
                      setAccessSection("accounts");
                      setShowMoreActions(false);
                    }}
                  />
                )}
                <MoreAction
                  icon={Icons.CalendarDays}
                  label={t("Build schedule", "መርሐ ግብር")}
                  onClick={() => {
                    setTab("schedule");
                    setScheduleSection("assignments");
                    setShowMoreActions(false);
                  }}
                />
                <MoreAction icon={Icons.Download} label={t("Export staff", "ሰራተኞችን ላክ")} onClick={handleExport} />
                {permissions.canManageRoles && (
                  <MoreAction
                    icon={Icons.Shield}
                    label={t("Manage roles", "ሚናዎችን አስተዳድር")}
                    onClick={() => {
                      setTab("access");
                      setAccessSection("roles");
                      setShowMoreActions(false);
                    }}
                  />
                )}
              </div>
            </>
          )}
        </div>
      </div>

      <div className="flex gap-1 overflow-x-auto pb-2 mb-4 border-b border-border scrollbar-thin">
        {STAFF_TABS.map((item) => (
          <button
            key={item.id}
            type="button"
            onClick={() => setTab(item.id)}
            className={`shrink-0 h-9 px-3 rounded-lg text-sm font-medium transition-colors ${
              tab === item.id ? "bg-ember text-ember-foreground" : "text-muted-foreground hover:bg-surface-2"
            }`}
          >
            {t(item.labelEn, item.labelAm)}
          </button>
        ))}
      </div>

      {(tab === "overview" || tab === "staff" || tab === "attendance") && (
        <StaffFiltersPanel
          filters={filters}
          onChange={setFilters}
          branches={branches}
          jobTitles={jobTitles}
          shifts={shifts}
          stations={stations}
          expanded={filtersExpanded}
          onToggleExpanded={() => setFiltersExpanded((v) => !v)}
        />
      )}

      {tab === "overview" && (
        <div className="space-y-4">
          <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-5 gap-3">
            <OverviewCard label={t("Total Staff", "ጠቅላላ ሰራተኞች")} value={`${summary.total}`} onClick={() => applyOverviewFilter("all")} />
            <OverviewCard label={t("Scheduled Today", "ዛሬ የታቀዱ")} value={`${summary.scheduledToday}`} tone="gold" onClick={() => applyOverviewFilter("scheduled_today")} />
            <OverviewCard label={t("Working Now", "አሁን በስራ ላይ")} value={`${summary.workingNow}`} tone="teff" onClick={() => applyOverviewFilter("working")} />
            <OverviewCard label={t("Late / Absent", "ዘግይተው / አልመጡም")} value={`${summary.lateAbsent}`} onClick={() => applyOverviewFilter("late_absent")} />
            <OverviewCard label={t("No Login Account", "መለያ የሌላቸው")} value={`${summary.noLogin}`} onClick={() => applyOverviewFilter("no_login")} />
          </div>

          <div className="grid sm:grid-cols-2 gap-3">
            <Card className="!p-4 flex items-center justify-between">
              <div>
                <div className="text-xs uppercase tracking-wide text-muted-foreground">{t("Completed shifts", "የተጠናቀቁ ሽፍቶች")}</div>
                <div className="font-display text-2xl font-semibold mt-1">{summary.completedShifts}</div>
              </div>
              <Chip tone="gold">{t("Today", "ዛሬ")}</Chip>
            </Card>
            <Card className="!p-4 flex items-center justify-between">
              <div>
                <div className="text-xs uppercase tracking-wide text-muted-foreground">{t("Unassigned staff", "ሽፍት ያልተመደቡ")}</div>
                <div className="font-display text-2xl font-semibold mt-1">{summary.unassigned}</div>
              </div>
              <button type="button" onClick={() => applyOverviewFilter("unassigned_shift")} className="text-xs text-ember hover:underline">
                {t("View", "እይ")}
              </button>
            </Card>
          </div>

          <Card>
            <div className="flex items-center justify-between gap-2 mb-3">
              <h3 className="font-display font-semibold">{t("Today’s floor", "የዛሬ ወለል")}</h3>
              <button type="button" onClick={() => setTab("staff")} className="text-xs text-ember hover:underline">
                {t("Open staff directory", "የሰራተኞች ዝርዝር ክፈት")}
              </button>
            </div>
            {overviewRows.length === 0 ? (
              <EmptyState message={t("No staff records yet.", "እስካሁን የሰራተኛ መዝገብ የለም።")} />
            ) : (
              <div className="space-y-2">
                {overviewRows.map((member) => (
                  <button
                    key={member.id}
                    type="button"
                    onClick={() => setSelected(member)}
                    className="w-full flex items-center justify-between gap-3 rounded-lg border border-border px-3 py-2.5 text-left hover:bg-surface-2"
                  >
                    <div className="min-w-0">
                      <div className="font-medium truncate">{member.name}</div>
                      <div className="text-xs text-muted-foreground truncate">
                        {member.jobTitle} · {member.station || member.branch} ·{" "}
                        {hasAssignedShift(member)
                          ? formatShiftRange(member.startTime, member.endTime, prefs)
                          : t("No shift today", "ዛሬ ሽፍት የለም")}
                      </div>
                    </div>
                    <Chip tone={attendanceStatusTone(member.attendanceStatus)}>{member.attendanceStatus}</Chip>
                  </button>
                ))}
              </div>
            )}
          </Card>
        </div>
      )}

      {tab === "staff" && (
        <StaffDirectoryTable
          rows={pageRows}
          prefs={prefs}
          canManage={permissions.canManage}
          onOpen={(row) => setSelected(row)}
          onClock={clockToggle}
          pagination={{
            currentPage,
            totalPages,
            pageSteps,
            start: filtered.length === 0 ? 0 : (currentPage - 1) * PAGE_SIZE + 1,
            end: Math.min(currentPage * PAGE_SIZE, filtered.length),
            total: filtered.length,
            onPage: setPage,
          }}
        />
      )}

      {tab === "schedule" && (
        <div className="space-y-4">
          <div className="flex flex-wrap gap-1 rounded-lg border border-border p-0.5 bg-card w-fit">
            <SectionTab active={scheduleSection === "assignments"} onClick={() => setScheduleSection("assignments")}>
              {t("Staff assignments", "የሰራተኛ ምደባ")}
            </SectionTab>
            <SectionTab active={scheduleSection === "templates"} onClick={() => setScheduleSection("templates")}>
              {t("Shift templates", "የሽፍት አብነቶች")}
            </SectionTab>
          </div>

          {scheduleSection === "assignments" ? (
            <div className="grid md:grid-cols-3 gap-4">
              {SHIFTS.map((shift) => {
                const members = staff.filter((member) => member.shift === shift);
                return (
                  <Card key={shift}>
                    <h3 className="font-display font-semibold mb-3">{t(`${shift} shift`, shift)}</h3>
                    <div className="space-y-2">
                      {members.map((member) => (
                        <button
                          key={member.id}
                          type="button"
                          onClick={() => setSelected(member)}
                          className="w-full flex items-center justify-between p-2 rounded-lg bg-surface-2 hover:bg-surface-2/80 text-left"
                        >
                          <div className="flex items-center gap-2 min-w-0">
                            <div className="size-8 rounded-full bg-gradient-to-br from-ember to-teff grid place-items-center text-ember-foreground text-xs font-semibold shrink-0">
                              {member.avatar || staffInitials(member.name)}
                            </div>
                            <div className="min-w-0">
                              <div className="text-sm font-medium truncate">{member.name}</div>
                              <div className="text-xs text-muted-foreground truncate">
                                {formatShiftRange(member.startTime, member.endTime, prefs)} · {member.station}
                              </div>
                            </div>
                          </div>
                          <Chip tone={attendanceStatusTone(member.attendanceStatus)}>{member.attendanceStatus}</Chip>
                        </button>
                      ))}
                      {members.length === 0 && (
                        <p className="text-xs text-muted-foreground py-4 text-center">{t("No staff assigned", "ሰራተኛ አልተመደበም")}</p>
                      )}
                    </div>
                  </Card>
                );
              })}
            </div>
          ) : (
            <div className="grid md:grid-cols-2 gap-4">
              {shiftTemplates.map((shift) => (
                <Card key={shift.id}>
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <h3 className="font-display font-semibold">{shift.name}</h3>
                      <p className="text-xs text-muted-foreground mt-0.5">{shift.code} · {shift.department}</p>
                    </div>
                    <Chip tone={shift.active ? "teff" : "muted"}>{shift.active ? t("Active", "ንቁ") : t("Inactive", "እንቅስቃሴ የለውም")}</Chip>
                  </div>
                  <p className="text-lg font-display font-semibold mt-3">{formatShiftRange(shift.startTime, shift.endTime, prefs)}</p>
                  <ul className="text-xs text-muted-foreground mt-2 space-y-1">
                    <li>{t("Break", "እረፍት")}: {shift.breakMinutes} {t("min", "ደቂቃ")}</li>
                    <li>{t("Late tolerance", "ዘግይቶ መምጣት")}: {shift.lateToleranceMinutes} {t("min", "ደቂቃ")}</li>
                  </ul>
                  {permissions.canManage && (
                    <button type="button" onClick={() => setEditingShift(shift)} className="mt-3 h-8 px-3 rounded-lg text-xs border border-border hover:bg-surface-2">
                      {t("Edit shift", "ሽፍት አስተካክል")}
                    </button>
                  )}
                </Card>
              ))}
            </div>
          )}
        </div>
      )}

      {tab === "attendance" && (
        <Card className="!p-0 overflow-hidden">
          <div className="overflow-x-auto hidden md:block">
            <table className="w-full text-sm min-w-[880px]">
              <thead className="bg-surface-2 text-xs uppercase tracking-wider text-muted-foreground">
                <tr>
                  <th className="text-left px-4 py-3">{t("Staff", "ሰራተኛ")}</th>
                  <th className="text-left px-4 py-3">{t("Scheduled", "ታቅዷል")}</th>
                  <th className="text-left px-4 py-3">{t("Clock-in", "ግባት")}</th>
                  <th className="text-left px-4 py-3">{t("Clock-out", "ውጣት")}</th>
                  <th className="text-left px-4 py-3">{t("Status", "ሁኔታ")}</th>
                  <th className="px-4 py-3" />
                </tr>
              </thead>
              <tbody>
                {pageRows.map((member) => (
                  <tr key={member.id} className="border-t border-border hover:bg-surface-2/60 cursor-pointer" onClick={() => setSelected(member)}>
                    <td className="px-4 py-3 font-medium">{member.name}</td>
                    <td className="px-4 py-3 text-muted-foreground">
                      {hasAssignedShift(member) ? formatShiftRange(member.startTime, member.endTime, prefs) : t("No shift today", "ዛሬ ሽፍት የለም")}
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">{member.lastClockIn ? formatDateTime(member.lastClockIn, prefs) : "—"}</td>
                    <td className="px-4 py-3 text-muted-foreground">{member.lastClockOut ? formatDateTime(member.lastClockOut, prefs) : "—"}</td>
                    <td className="px-4 py-3"><Chip tone={attendanceStatusTone(member.attendanceStatus)}>{member.attendanceStatus}</Chip></td>
                    <td className="px-4 py-3 text-right" onClick={(e) => e.stopPropagation()}>
                      {permissions.canManage && (
                        <button type="button" onClick={() => clockToggle(member)} className="h-8 px-3 rounded-lg text-xs border border-border hover:bg-surface-2">
                          {member.status === "On shift" ? t("Clock out", "ውጣ") : t("Clock in", "ግባ")}
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="md:hidden divide-y divide-border">
            {pageRows.map((member) => (
              <button key={member.id} type="button" onClick={() => setSelected(member)} className="w-full text-left p-4 space-y-2 hover:bg-surface-2">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <div className="font-medium">{member.name}</div>
                    <div className="text-xs text-muted-foreground">{member.jobTitle}</div>
                  </div>
                  <Chip tone={attendanceStatusTone(member.attendanceStatus)}>{member.attendanceStatus}</Chip>
                </div>
                <div className="text-xs text-muted-foreground">
                  {hasAssignedShift(member) ? formatShiftRange(member.startTime, member.endTime, prefs) : t("No shift today", "ዛሬ ሽፍት የለም")}
                </div>
              </button>
            ))}
          </div>
          {pageRows.length === 0 && <EmptyState message={t("No attendance rows for this filter.", "ለዚህ ማጣሪያ የተገኝነት የለም።")} />}
        </Card>
      )}

      {tab === "access" && (
        <div className="space-y-4">
          <div className="flex flex-wrap gap-1 rounded-lg border border-border p-0.5 bg-card w-fit">
            <SectionTab active={accessSection === "accounts"} onClick={() => setAccessSection("accounts")}>
              {t("System accounts", "የስርዓት መለያዎች")}
            </SectionTab>
            <SectionTab active={accessSection === "roles"} onClick={() => setAccessSection("roles")}>
              {t("Roles & permissions", "ሚናዎች እና ፈቃዶች")}
            </SectionTab>
          </div>

          {accessSection === "accounts" ? (
            <Card className="!p-0 overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-sm min-w-[820px]">
                  <thead className="bg-surface-2 text-xs uppercase tracking-wider text-muted-foreground">
                    <tr>
                      <th className="text-left px-4 py-3">{t("User", "ተጠቃሚ")}</th>
                      <th className="text-left px-4 py-3">{t("System role", "ሚና")}</th>
                      <th className="text-left px-4 py-3">{t("Branch", "ቅርንጫፍ")}</th>
                      <th className="text-left px-4 py-3">{t("Account status", "ሁኔታ")}</th>
                      <th className="text-left px-4 py-3">{props.authMode === "supabase" ? t("Email", "ኢሜይል") : t("Sign-in", "መግቢያ")}</th>
                      <th className="text-right px-4 py-3">{t("Actions", "እርምጃ")}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {props.users.map((u) => {
                      const view = staff.find((row) => row.id === u.id);
                      return (
                        <tr key={u.id} className="border-t border-border">
                          <td className="px-4 py-3">
                            <div className="flex items-center gap-2">
                              <div className="size-8 rounded-full bg-gradient-to-br from-ember to-teff grid place-items-center text-ember-foreground text-[10px] font-semibold">{u.avatar}</div>
                              <div>
                                <div className="font-medium">{u.name}</div>
                                {u.id === props.currentUserId && <div className="text-[10px] text-muted-foreground">{t("You", "እርስዎ")}</div>}
                              </div>
                            </div>
                          </td>
                          <td className="px-4 py-3"><Chip tone={u.role === "Branch Manager" ? "ember" : "muted"}>{u.role}</Chip></td>
                          <td className="px-4 py-3 text-muted-foreground">{u.branch}</td>
                          <td className="px-4 py-3"><Chip tone={accountStatusTone(view?.accountStatus ?? "Active")}>{view?.accountStatus ?? "Active"}</Chip></td>
                          <td className="px-4 py-3 font-mono text-xs">
                            {props.authMode === "supabase" ? (u.email ?? t("No email", "ኢሜይል የለም")) : "••••••"}
                          </td>
                          <td className="px-4 py-3">
                            <div className="flex items-center justify-end gap-2">
                              {permissions.canManageAccounts && (
                                <button type="button" onClick={() => setEditingAccount(u)} className="h-8 px-3 rounded-lg text-xs border border-border hover:bg-surface-2">
                                  {t("Edit", "አስተካክል")}
                                </button>
                              )}
                              {permissions.canManageAccounts && u.id !== props.currentUserId && (
                                <button
                                  type="button"
                                  onClick={() => handleDisableAccount(u.id)}
                                  disabled={removingId === u.id}
                                  className="h-8 px-3 rounded-lg text-xs border border-destructive/30 text-destructive hover:bg-destructive/5"
                                >
                                  {removingId === u.id ? t("Disabling", "እየተሰናከለ") : t("Disable", "አሰናክል")}
                                </button>
                              )}
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              {props.users.length === 0 && <EmptyState message={t("No system accounts yet.", "እስካሁን የስርዓት መለያ የለም።")} />}
            </Card>
          ) : (
            <div className="space-y-4">
              <Card>
                <h3 className="font-display font-semibold mb-2">{t("System roles", "የስርዓት ሚናዎች")}</h3>
                <div className="flex flex-wrap gap-2">
                  {USER_ROLES.map((role) => (
                    <Chip key={role} tone={role.includes("Manager") || role === "Administrator" ? "ember" : "muted"}>{role}</Chip>
                  ))}
                </div>
              </Card>
              <Card className="!p-0 overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full text-xs min-w-[900px]">
                    <thead className="bg-surface-2 uppercase text-muted-foreground">
                      <tr>
                        <th className="text-left px-3 py-2 sticky left-0 bg-surface-2">{t("Module", "ሞዱል")}</th>
                        {PERMISSION_ACTIONS.slice(0, 6).map((action) => (
                          <th key={action} className="px-2 py-2 text-center">{action}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {PERMISSION_MODULES.slice(0, 12).map((module) => (
                        <tr key={module} className="border-t border-border">
                          <td className="px-3 py-2 font-medium sticky left-0 bg-card">{module}</td>
                          {PERMISSION_ACTIONS.slice(0, 6).map((action) => (
                            <td key={action} className="px-2 py-2 text-center text-muted-foreground">
                              {module === "Staff" || module === "Settings" ? (action === "View" || action === "Edit" ? "✓" : "—") : action === "View" ? "✓" : "—"}
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </Card>
            </div>
          )}
        </div>
      )}

      {selected && (
        <StaffMemberDrawer
          member={selected}
          authMode={props.authMode}
          canManage={permissions.canManage}
          canManageAccounts={permissions.canManageAccounts}
          showAudit={permissions.canManageRoles}
          auditEntries={selectedAudit}
          onClose={() => setSelected(null)}
          onSaveSchedule={() => setSelected(null)}
          onClockToggle={clockToggle}
          onEditStaff={() => {
            setSelected(null);
            setShowAddStaff(true);
          }}
          onManageSchedule={() => {
            setSelected(null);
            setTab("schedule");
            setScheduleSection("assignments");
          }}
          onManageAccess={() => {
            if (selected.hasLoginAccount) {
              const user = props.users.find((u) => u.id === selected.id);
              if (user) setEditingAccount(user);
            } else {
              setShowAddAccount(true);
              setTab("access");
              setAccessSection("accounts");
            }
          }}
          onViewFullProfile={() => {
            /* drawer already shows the profile */
          }}
          onEditAccount={selected.hasLoginAccount ? () => {
            const user = props.users.find((u) => u.id === selected.id);
            if (user) setEditingAccount(user);
          } : undefined}
          onDisableAccount={
            permissions.canManageAccounts && selected.hasLoginAccount && selected.id !== props.currentUserId
              ? () => handleDisableAccount(selected.id)
              : undefined
          }
        />
      )}

      {showAddAccount && (
        <StaffUserModal
          branch={props.branch}
          authMode={props.authMode}
          onClose={() => setShowAddAccount(false)}
          onSave={async (input) => {
            const result = await props.addUser(input);
            if (!result.ok) { showError(result.error); return result.error; }
            syncUserAssignedStore(result.user, input);
            appendStaffAudit({
              action: "Account Created",
              staffId: result.user.id,
              staffName: result.user.name,
              performedBy: props.currentUserName,
              performedByRole: props.currentUserRole,
              branch: result.user.branch,
            });
            showSuccess(`${result.user.name} ${t("account created.", "መለያ ተፈጥሯል።")}`);
            setAuditTick((value) => value + 1);
            setShowAddAccount(false);
            return null;
          }}
        />
      )}

      {editingAccount && (
        <StaffUserModal
          branch={props.branch}
          authMode={props.authMode}
          user={editingAccount}
          onClose={() => setEditingAccount(null)}
          onSave={async (input) => {
            const result = await props.updateUser(editingAccount.id, input);
            if (!result.ok) { showError(result.error); return result.error; }
            syncUserAssignedStore(result.user, input);
            appendStaffAudit({
              action: "Account Updated",
              staffId: result.user.id,
              staffName: result.user.name,
              performedBy: props.currentUserName,
              performedByRole: props.currentUserRole,
              branch: result.user.branch,
            });
            showSuccess(`${result.user.name} ${t("updated.", "ተሻሽሏል።")}`);
            setAuditTick((value) => value + 1);
            setEditingAccount(null);
            return null;
          }}
        />
      )}

      {showAddStaff && (
        <AddStaffWizard
          branch={props.branch}
          authMode={props.authMode}
          jobTitles={loadJobTitles()}
          shifts={shiftTemplates}
          onClose={() => setShowAddStaff(false)}
          onCreateStaffOnly={(member, schedule) => {
            props.onSaveStaffOnly([...props.staffOnly, member]);
            upsertSchedule(schedule);
            appendStaffAudit({
              action: "Staff Created",
              staffId: member.id,
              staffName: member.name,
              performedBy: props.currentUserName,
              performedByRole: props.currentUserRole,
              branch: member.branch,
            });
            showSuccess(t("Staff member added.", "ሰራተኛ ተጨምሯል።"));
            setAuditTick((value) => value + 1);
            setShowAddStaff(false);
            setTab("staff");
          }}
          onCreateWithAccount={async (member, schedule, accountInput) => {
            const result = await props.addUser(accountInput);
            if (!result.ok) { showError(result.error); return; }
            props.onSaveStaffOnly([...props.staffOnly, { ...member, linkedUserId: result.user.id }]);
            upsertSchedule({
              ...schedule,
              id: result.user.id,
              inventoryLocation: accountInput.assignedStore ?? defaultStaffSchedule(result.user).inventoryLocation,
            });
            appendStaffAudit({
              action: "Staff Created",
              staffId: result.user.id,
              staffName: result.user.name,
              performedBy: props.currentUserName,
              performedByRole: props.currentUserRole,
              branch: result.user.branch,
            });
            showSuccess(t("Staff member and login account created.", "ሰራተኛ እና መለያ ተፈጥረዋል።"));
            setAuditTick((value) => value + 1);
            setShowAddStaff(false);
            setTab("staff");
          }}
        />
      )}

      {editingShift && permissions.canManage && (
        <ShiftEditModal
          shift={editingShift}
          onClose={() => setEditingShift(null)}
          onSave={(next) => {
            const updated = shiftTemplates.map((row) => (row.id === next.id ? next : row));
            setShiftTemplates(updated);
            saveShiftTemplates(updated);
            setEditingShift(null);
            showSuccess(t("Shift updated.", "ሽፍት ተሻሽሏል።"));
          }}
        />
      )}
    </div>
  );
}

function OverviewCard({
  label,
  value,
  tone = "default",
  onClick,
}: {
  label: string;
  value: string;
  tone?: "default" | "teff" | "gold";
  onClick: () => void;
}) {
  return (
    <button type="button" onClick={onClick} className="surface-card !p-3 text-left hover:border-ember/35 hover:-translate-y-0.5 transition-all">
      <Stat label={label} value={value} tone={tone} />
    </button>
  );
}

function SectionTab({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`px-3 h-8 rounded-md text-xs font-medium ${active ? "bg-ember text-ember-foreground" : "text-muted-foreground hover:bg-surface-2"}`}
    >
      {children}
    </button>
  );
}

function MoreAction({ icon: Icon, label, onClick }: { icon: typeof Icons.Download; label: string; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} className="w-full px-3 py-2.5 text-left hover:bg-surface-2 inline-flex items-center gap-2">
      <Icon className="size-4 text-muted-foreground" />
      {label}
    </button>
  );
}

function EmptyState({ message }: { message: string }) {
  return <div className="py-12 text-center text-sm text-muted-foreground">{message}</div>;
}

function StaffDirectoryTable({
  rows,
  prefs,
  canManage,
  onOpen,
  onClock,
  pagination,
}: {
  rows: StaffMemberView[];
  prefs: ReturnType<typeof loadSystemSettings>["calendar"];
  canManage: boolean;
  onOpen: (row: StaffMemberView) => void;
  onClock: (row: StaffMemberView) => void;
  pagination?: {
    currentPage: number;
    totalPages: number;
    pageSteps: Array<number | "ellipsis">;
    start: number;
    end: number;
    total: number;
    onPage: (page: number) => void;
  };
}) {
  const t = useT();

  return (
    <div className="space-y-3">
      <Card className="!p-0 overflow-hidden hidden md:block">
        <div className="overflow-x-auto">
          <table className="w-full text-sm min-w-[900px]">
            <thead className="bg-surface-2 text-xs uppercase tracking-wider text-muted-foreground">
              <tr>
                <th className="text-left px-4 py-3">{t("Staff", "ሰራተኛ")}</th>
                <th className="text-left px-4 py-3">{t("Role", "ሚና")}</th>
                <th className="text-left px-4 py-3">{t("Branch / Station", "ቅርንጫፍ / ጣቢያ")}</th>
                <th className="text-left px-4 py-3">{t("Today’s Shift", "የዛሬ ሽፍት")}</th>
                <th className="text-left px-4 py-3">{t("Attendance", "ተገኝነት")}</th>
                <th className="text-left px-4 py-3">{t("Account", "መለያ")}</th>
                <th className="text-right px-4 py-3">{t("Actions", "እርምጃ")}</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((member) => (
                <tr key={member.id} className="border-t border-border hover:bg-surface-2/60 cursor-pointer" onClick={() => onOpen(member)}>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-3">
                      <div className="size-9 rounded-full bg-gradient-to-br from-ember to-teff grid place-items-center text-ember-foreground text-xs font-semibold shrink-0">
                        {member.avatar || staffInitials(member.name)}
                      </div>
                      <div className="min-w-0">
                        <div className="font-medium truncate">{member.name}</div>
                        <div className="text-[10px] text-muted-foreground">{member.employmentStatus}</div>
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-3">{member.jobTitle}</td>
                  <td className="px-4 py-3 text-muted-foreground">
                    <div>{member.branch}</div>
                    <div className="text-xs">{member.station || "—"}</div>
                  </td>
                  <td className="px-4 py-3 text-muted-foreground whitespace-nowrap">
                    {hasAssignedShift(member)
                      ? formatShiftRange(member.startTime, member.endTime, prefs)
                      : t("No shift today", "ዛሬ ሽፍት የለም")}
                  </td>
                  <td className="px-4 py-3">
                    <Chip tone={attendanceStatusTone(member.attendanceStatus)}>{member.attendanceStatus}</Chip>
                  </td>
                  <td className="px-4 py-3">
                    <Chip tone={member.hasLoginAccount ? accountStatusTone(member.accountStatus) : "gold"}>
                      {accountLabel(member)}
                    </Chip>
                  </td>
                  <td className="px-4 py-3 text-right" onClick={(e) => e.stopPropagation()}>
                    <div className="inline-flex items-center gap-1">
                      {canManage && (
                        <button type="button" onClick={() => onClock(member)} className="h-8 px-3 rounded-lg text-xs border border-border hover:bg-surface-2">
                          {member.status === "On shift" ? t("Out", "ውጣ") : t("In", "ግባ")}
                        </button>
                      )}
                      <button type="button" onClick={() => onOpen(member)} className="h-8 px-3 rounded-lg text-xs border border-border hover:bg-surface-2">
                        {t("Open", "ክፈት")}
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {rows.length === 0 && <EmptyState message={t("No staff found", "ሰራተኞች የሉም")} />}
        {pagination && pagination.totalPages > 1 && (
          <PaginationBar pagination={pagination} ofLabel={t("of", "ከ")} />
        )}
      </Card>

      <div className="md:hidden space-y-2">
        {rows.map((member) => (
          <Card key={member.id} className="!p-3">
            <button type="button" onClick={() => onOpen(member)} className="w-full text-left space-y-2">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="font-medium truncate">{member.name}</div>
                  <div className="text-xs text-muted-foreground">{member.jobTitle}</div>
                </div>
                <Chip tone={attendanceStatusTone(member.attendanceStatus)}>{member.attendanceStatus}</Chip>
              </div>
              <div className="text-xs text-muted-foreground">
                {member.station || member.branch} ·{" "}
                {hasAssignedShift(member)
                  ? formatShiftRange(member.startTime, member.endTime, prefs)
                  : t("No shift today", "ዛሬ ሽፍት የለም")}
              </div>
              <Chip tone={member.hasLoginAccount ? accountStatusTone(member.accountStatus) : "gold"}>
                {accountLabel(member)}
              </Chip>
            </button>
            {canManage && (
              <div className="mt-2 flex justify-end">
                <button type="button" onClick={() => onClock(member)} className="h-8 px-3 rounded-lg text-xs border border-border hover:bg-surface-2">
                  {member.status === "On shift" ? t("Clock out", "ውጣ") : t("Clock in", "ግባ")}
                </button>
              </div>
            )}
          </Card>
        ))}
        {rows.length === 0 && <EmptyState message={t("No staff found", "ሰራተኞች የሉም")} />}
        {pagination && pagination.totalPages > 1 && (
          <Card className="!p-3">
            <PaginationBar pagination={pagination} ofLabel={t("of", "ከ")} />
          </Card>
        )}
      </div>
    </div>
  );
}

function PaginationBar({
  pagination,
  ofLabel,
}: {
  pagination: {
    currentPage: number;
    totalPages: number;
    pageSteps: Array<number | "ellipsis">;
    start: number;
    end: number;
    total: number;
    onPage: (page: number) => void;
  };
  ofLabel: string;
}) {
  return (
    <div className="flex items-center justify-between gap-3 border-t border-border px-4 py-3">
      <span className="text-xs text-muted-foreground">{pagination.start}–{pagination.end} {ofLabel} {pagination.total}</span>
      <div className="flex items-center gap-1">
        <button type="button" disabled={pagination.currentPage === 1} onClick={() => pagination.onPage(pagination.currentPage - 1)} className="size-8 grid place-items-center rounded-lg border border-border disabled:opacity-40">
          <Icons.ChevronLeft className="size-4" />
        </button>
        {pagination.pageSteps.map((step, index) =>
          step === "ellipsis" ? (
            <span key={`e-${index}`} className="px-1 text-muted-foreground">…</span>
          ) : (
            <button key={step} type="button" onClick={() => pagination.onPage(step)} className={`size-8 rounded-lg text-xs border ${step === pagination.currentPage ? "bg-ember text-ember-foreground border-ember" : "border-border"}`}>
              {step}
            </button>
          ),
        )}
        <button type="button" disabled={pagination.currentPage === pagination.totalPages} onClick={() => pagination.onPage(pagination.currentPage + 1)} className="size-8 grid place-items-center rounded-lg border border-border disabled:opacity-40">
          <Icons.ChevronRight className="size-4" />
        </button>
      </div>
    </div>
  );
}

function AddStaffWizard({
  branch,
  authMode,
  jobTitles,
  shifts,
  onClose,
  onCreateStaffOnly,
  onCreateWithAccount,
}: {
  branch: string;
  authMode: "demo" | "supabase";
  jobTitles: ReturnType<typeof loadJobTitles>;
  shifts: ShiftTemplate[];
  onClose: () => void;
  onCreateStaffOnly: (member: StaffMemberOnly, schedule: StaffScheduleRecord) => void;
  onCreateWithAccount: (member: StaffMemberOnly, schedule: StaffScheduleRecord, account: AuthUserInput) => Promise<void>;
}) {
  const t = useT();
  const [step, setStep] = useState(1);
  const [needsAccess, setNeedsAccess] = useState<boolean | null>(null);
  const [saving, setSaving] = useState(false);
  const branchOptions = useMemo(() => {
    const configured = activeBranchNames(loadCachedBranches());
    if (branch.trim() && !configured.includes(branch.trim())) {
      return [...configured, branch.trim()].sort((a, b) => a.localeCompare(b));
    }
    return configured;
  }, [branch]);
  const firstJob = jobTitles[0];
  const firstShift = shifts[0];
  const [form, setForm] = useState({
    name: "",
    phone: "",
    jobTitle: firstJob?.name ?? "Waiter",
    branch,
    employmentStatus: "Active" as StaffMemberOnly["employmentStatus"],
    station: firstJob?.defaultStation ?? "Main Hall",
    department: firstJob?.department ?? "Service",
    shiftId: firstShift?.id ?? "morning",
    workingDays: ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat"] as WeekdayKey[],
    email: "",
    username: "",
    role: "Waiter" as AuthUserInput["role"],
    password: "",
    accountStatus: "Active",
  });

  const selectedShift = shifts.find((s) => s.id === form.shiftId) ?? firstShift;

  function toggleDay(day: WeekdayKey) {
    setForm((current) => {
      const has = current.workingDays.includes(day);
      return {
        ...current,
        workingDays: has ? current.workingDays.filter((d) => d !== day) : [...current.workingDays, day],
      };
    });
  }

  function buildPayload() {
    const id = `staff-${Date.now()}`;
    const member: StaffMemberOnly = {
      id,
      name: form.name.trim(),
      phone: form.phone,
      branch: form.branch,
      jobTitle: form.jobTitle,
      department: form.department,
      employmentStatus: form.employmentStatus,
    };
    const schedule: StaffScheduleRecord = {
      id,
      phone: form.phone,
      shift: selectedShift?.name.includes("Evening") ? "Evening" : selectedShift?.name.includes("Morning") ? "Morning" : "All day",
      startTime: selectedShift?.startTime ?? "07:00",
      endTime: selectedShift?.endTime ?? "15:00",
      daysWorked: 0,
      status: "Off",
      jobTitle: form.jobTitle,
      department: form.department,
      station: form.station,
      employeeId: id.slice(0, 8).toUpperCase(),
      username: form.username || form.name.trim().split(/\s+/)[0]?.toLowerCase() || id,
      employmentStatus: form.employmentStatus,
      accountStatus: needsAccess ? "Active" : "Pending Activation",
      workingDays: form.workingDays,
    };
    return { member, schedule };
  }

  async function submit() {
    if (!form.name.trim()) return;
    setSaving(true);
    const { member, schedule } = buildPayload();
    try {
      if (needsAccess) {
        await onCreateWithAccount(member, schedule, {
          name: form.name.trim(),
          role: form.role,
          branch: form.branch,
          email: form.email || undefined,
          password: form.password || "changeme",
        });
      } else {
        onCreateStaffOnly(member, schedule);
      }
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 bg-foreground/40 backdrop-blur-sm grid place-items-center p-4">
      <div className="surface-card max-w-lg w-full !p-6 max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h3 className="font-display text-xl font-semibold">{t("Add Staff", "ሰራተኛ ጨምር")}</h3>
            <p className="text-xs text-muted-foreground">{t("Step", "ደረጃ")} {step} / 3</p>
          </div>
          <button type="button" onClick={onClose} className="size-9 grid place-items-center rounded-lg hover:bg-surface-2"><Icons.X className="size-4" /></button>
        </div>

        <div className="flex gap-1 mb-5">
          {[1, 2, 3].map((n) => (
            <div key={n} className={`h-1.5 flex-1 rounded-full ${step >= n ? "bg-ember" : "bg-border"}`} />
          ))}
        </div>

        {step === 1 && (
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">{t("Staff information", "የሰራተኛ መረጃ")}</p>
            <WizardField label={t("Full name", "ሙሉ ስም")} value={form.name} onChange={(v) => setForm({ ...form, name: v })} />
            <WizardField label={t("Phone", "ስልክ")} value={form.phone} onChange={(v) => setForm({ ...form, phone: v })} />
            <WizardSelect
              label={t("Job title", "የስራ መደብ")}
              value={form.jobTitle}
              options={jobTitles.map((j) => j.name)}
              onChange={(v) => {
                const job = jobTitles.find((j) => j.name === v);
                setForm({
                  ...form,
                  jobTitle: v,
                  department: job?.department ?? form.department,
                  station: job?.defaultStation && job.defaultStation !== "—" ? job.defaultStation : form.station,
                });
              }}
            />
            {branchOptions.length > 0 ? (
              <WizardSelect
                label={t("Branch", "ቅርንጫፍ")}
                value={form.branch}
                options={branchOptions}
                onChange={(v) => setForm({ ...form, branch: v })}
              />
            ) : (
              <WizardField label={t("Branch", "ቅርንጫፍ")} value={form.branch} onChange={(v) => setForm({ ...form, branch: v })} />
            )}
            <WizardSelect
              label={t("Employment status", "የቅጥር ሁኔታ")}
              value={form.employmentStatus}
              options={["Active", "Probation", "On Leave", "Suspended"]}
              onChange={(v) => setForm({ ...form, employmentStatus: v as StaffMemberOnly["employmentStatus"] })}
            />
          </div>
        )}

        {step === 2 && (
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">{t("Work assignment", "የስራ ምደባ")}</p>
            <WizardField label={t("Station / Department", "ጣቢያ / ክፍል")} value={form.station} onChange={(v) => setForm({ ...form, station: v })} />
            <WizardField label={t("Department", "ክፍል")} value={form.department} onChange={(v) => setForm({ ...form, department: v })} />
            <WizardSelect
              label={t("Default shift", "ነባሪ ሽፍት")}
              value={form.shiftId}
              options={shifts.map((s) => s.id)}
              optionLabels={Object.fromEntries(shifts.map((s) => [s.id, `${s.name} (${s.startTime}–${s.endTime})`]))}
              onChange={(v) => setForm({ ...form, shiftId: v })}
            />
            <div>
              <label className="text-xs text-muted-foreground">{t("Working days", "የስራ ቀናት")}</label>
              <div className="mt-2 flex flex-wrap gap-1.5">
                {WEEKDAY_KEYS.map((day) => (
                  <button
                    key={day}
                    type="button"
                    onClick={() => toggleDay(day)}
                    className={`h-8 px-2.5 rounded-lg text-xs border ${
                      form.workingDays.includes(day)
                        ? "bg-ember text-ember-foreground border-ember"
                        : "border-border bg-card text-muted-foreground"
                    }`}
                  >
                    {day}
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}

        {step === 3 && (
          <div className="space-y-3">
            <p className="text-sm font-medium">{t("Does this staff member need access to the system?", "ይህ ሰራተኛ የስርዓት መዳረሻ ያስፈልገዋል?")}</p>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setNeedsAccess(false)}
                className={`h-11 rounded-lg border text-sm font-medium ${needsAccess === false ? "border-ember bg-ember/10 text-ember" : "border-border"}`}
              >
                {t("No — staff only", "አይ — ሰራተኛ ብቻ")}
              </button>
              <button
                type="button"
                onClick={() => setNeedsAccess(true)}
                className={`h-11 rounded-lg border text-sm font-medium ${needsAccess === true ? "border-ember bg-ember/10 text-ember" : "border-border"}`}
              >
                {t("Yes — create login", "አዎ — መለያ ፍጠር")}
              </button>
            </div>
            {needsAccess && (
              <div className="space-y-3 pt-2">
                <WizardField
                  label={authMode === "supabase" ? t("Email", "ኢሜይል") : t("Username / email", "ተጠቃሚ ስም / ኢሜይል")}
                  value={form.email}
                  onChange={(v) => setForm({ ...form, email: v, username: v.split("@")[0] ?? v })}
                />
                <WizardSelect label={t("System role", "ሚና")} value={form.role} options={USER_ROLES} onChange={(v) => setForm({ ...form, role: v as AuthUserInput["role"] })} />
                <WizardField label={t("Temporary password", "ጊዜያዊ በይለፍ ቃል")} value={form.password} onChange={(v) => setForm({ ...form, password: v })} type="password" />
                <p className="text-xs text-muted-foreground">
                  {t("Permissions follow the selected system role.", "ፈቃዶች ከተመረጠው የስርዓት ሚና ይከተላሉ።")}
                </p>
              </div>
            )}
            {needsAccess === false && (
              <p className="text-xs text-muted-foreground rounded-lg border border-border bg-surface-2 px-3 py-2">
                {t(
                  "They will appear in Staff, Schedule, and Attendance without an app login.",
                  "ያለ መተግበሪያ መግቢያ በሰራተኞች፣ መርሐ ግብር እና ተገኝነት ይታያሉ።",
                )}
              </p>
            )}
          </div>
        )}

        <div className="flex gap-2 mt-6">
          {step > 1 && (
            <button type="button" onClick={() => setStep((s) => s - 1)} className="flex-1 h-10 rounded-lg border border-border">
              {t("Back", "ተመለስ")}
            </button>
          )}
          {step < 3 ? (
            <button
              type="button"
              onClick={() => setStep((s) => s + 1)}
              disabled={step === 1 && !form.name.trim()}
              className="flex-1 h-10 rounded-lg bg-ember text-ember-foreground font-semibold disabled:opacity-50"
            >
              {t("Next", "ቀጣይ")}
            </button>
          ) : (
            <button
              type="button"
              onClick={submit}
              disabled={saving || needsAccess === null || (needsAccess && authMode === "supabase" && !form.email.trim())}
              className="flex-1 h-10 rounded-lg bg-ember text-ember-foreground font-semibold disabled:opacity-50"
            >
              {saving ? t("Creating", "እየተፈጠረ") : t("Complete setup", "ማዋቀር ጨርስ")}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

function ShiftEditModal({
  shift,
  onClose,
  onSave,
}: {
  shift: ShiftTemplate;
  onClose: () => void;
  onSave: (shift: ShiftTemplate) => void;
}) {
  const t = useT();
  const [draft, setDraft] = useState(shift);
  return (
    <div className="fixed inset-0 z-50 bg-foreground/40 grid place-items-center p-4">
      <div className="surface-card max-w-md w-full !p-6">
        <h3 className="font-display text-lg font-semibold mb-4">{t("Edit shift", "ሽፍት አስተካክል")}</h3>
        <div className="space-y-3">
          <WizardField label={t("Name", "ስም")} value={draft.name} onChange={(v) => setDraft({ ...draft, name: v })} />
          <div className="grid grid-cols-2 gap-3">
            <WizardField label={t("Start", "መጀመሪያ")} value={draft.startTime} onChange={(v) => setDraft({ ...draft, startTime: v })} type="time" />
            <WizardField label={t("End", "መጨረሻ")} value={draft.endTime} onChange={(v) => setDraft({ ...draft, endTime: v })} type="time" />
          </div>
        </div>
        <div className="flex gap-2 mt-4">
          <button type="button" onClick={onClose} className="flex-1 h-10 rounded-lg border border-border">{t("Cancel", "ሰርዝ")}</button>
          <button type="button" onClick={() => onSave(draft)} className="flex-1 h-10 rounded-lg bg-ember text-ember-foreground font-semibold">{t("Save", "አስቀምጥ")}</button>
        </div>
      </div>
    </div>
  );
}

function WizardField({ label, value, onChange, type = "text" }: { label: string; value: string; onChange: (v: string) => void; type?: string }) {
  return (
    <div>
      <label className="text-xs text-muted-foreground">{label}</label>
      <input type={type} value={value} onChange={(e) => onChange(e.target.value)} className="w-full mt-1 h-10 px-3 rounded-lg border border-border bg-card text-sm focus:outline-none focus:ring-2 focus:ring-ring/40" />
    </div>
  );
}

function WizardSelect({
  label,
  value,
  options,
  optionLabels,
  onChange,
}: {
  label: string;
  value: string;
  options: string[];
  optionLabels?: Record<string, string>;
  onChange: (v: string) => void;
}) {
  return (
    <div>
      <label className="text-xs text-muted-foreground">{label}</label>
      <select value={value} onChange={(e) => onChange(e.target.value)} className="w-full mt-1 h-10 px-3 rounded-lg border border-border bg-card text-sm">
        {options.map((option) => (
          <option key={option} value={option}>{optionLabels?.[option] ?? option}</option>
        ))}
      </select>
    </div>
  );
}
