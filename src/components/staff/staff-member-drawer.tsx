import type { ReactNode } from "react";
import * as Icons from "lucide-react";
import { Chip } from "@/components/ui-kit";
import { formatDateTime } from "@/lib/date-time";
import { useT } from "@/lib/i18n";
import { loadSystemSettings } from "@/lib/system-settings";
import {
  accountLabel,
  accountStatusTone,
  attendanceStatusTone,
  formatShiftRange,
  type StaffMemberView,
} from "@/lib/staff-management";

export type StaffMemberDrawerProps = {
  member: StaffMemberView;
  authMode: "demo" | "supabase";
  canManage: boolean;
  canManageAccounts?: boolean;
  showAudit?: boolean;
  auditEntries?: Array<{ id: string; action: string; atIso: string; performedBy: string }>;
  onClose: () => void;
  onSaveSchedule: (member: StaffMemberView) => void;
  onClockToggle: (member: StaffMemberView) => void;
  onEditStaff?: () => void;
  onManageSchedule?: () => void;
  onManageAccess?: () => void;
  onViewFullProfile?: () => void;
  onEditAccount?: () => void;
  onDisableAccount?: () => void;
};

export function StaffMemberDrawer({
  member,
  authMode,
  canManage,
  canManageAccounts,
  showAudit,
  auditEntries = [],
  onClose,
  onSaveSchedule,
  onClockToggle,
  onEditStaff,
  onManageSchedule,
  onManageAccess,
  onViewFullProfile,
  onEditAccount,
  onDisableAccount,
}: StaffMemberDrawerProps) {
  const t = useT();
  const prefs = loadSystemSettings().calendar;
  const shiftLabel = hasShift(member)
    ? formatShiftRange(member.startTime, member.endTime, prefs)
    : t("No shift today", "ዛሬ ሽፍት የለም");

  return (
    <>
      <div className="fixed inset-0 z-40 bg-foreground/30 backdrop-blur-[1px]" onClick={onClose} aria-hidden="true" />
      <aside className="fixed inset-y-0 right-0 z-50 w-full max-w-lg bg-card border-l border-border shadow-xl flex flex-col animate-in slide-in-from-right duration-200">
        <div className="flex items-start justify-between gap-3 p-4 border-b border-border shrink-0">
          <div className="flex items-center gap-3 min-w-0">
            <div className="size-12 rounded-full bg-gradient-to-br from-ember to-teff grid place-items-center text-ember-foreground font-semibold shrink-0">
              {member.avatar}
            </div>
            <div className="min-w-0">
              <h2 className="font-display text-lg font-semibold truncate">{member.name}</h2>
              <p className="text-sm text-muted-foreground truncate">
                {member.jobTitle}
                {member.station && member.station !== "—" ? ` · ${member.station}` : ""}
              </p>
              <div className="flex flex-wrap gap-1 mt-1.5">
                <Chip tone={attendanceStatusTone(member.attendanceStatus)}>{member.attendanceStatus}</Chip>
                <Chip tone="muted">{member.employmentStatus}</Chip>
              </div>
            </div>
          </div>
          <button type="button" onClick={onClose} className="size-9 grid place-items-center rounded-lg hover:bg-surface-2 shrink-0">
            <Icons.X className="size-4" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-5">
          <DrawerSection title={t("Today’s Shift", "የዛሬ ሽፍት")}>
            <Field label={t("Shift", "ሽፍት")} value={member.shift || t("Unassigned", "አልተመደበም")} />
            <Field label={t("Hours", "ሰዓት")} value={shiftLabel} />
            <Field
              label={t("Clock-in", "ግባት")}
              value={member.lastClockIn ? formatDateTime(member.lastClockIn, prefs) : "—"}
            />
            <Field
              label={t("Clock-out", "ውጣት")}
              value={member.lastClockOut ? formatDateTime(member.lastClockOut, prefs) : "—"}
            />
            <Field label={t("Attendance", "ተገኝነት")} value={member.attendanceStatus} />
            {canManage && (
              <button
                type="button"
                onClick={() => onClockToggle(member)}
                className={`mt-2 h-9 px-4 rounded-lg text-sm font-medium border ${
                  member.status === "On shift"
                    ? "border-destructive/40 text-destructive hover:bg-destructive/5"
                    : "border-teff/40 text-teff hover:bg-teff/5"
                }`}
              >
                {member.status === "On shift" ? t("Clock out", "ውጣ") : t("Clock in", "ግባ")}
              </button>
            )}
          </DrawerSection>

          <DrawerSection title={t("Employment", "ቅጥር")}>
            <Field label={t("Employee ID", "የሰራተኛ መለያ")} value={member.employeeId} />
            <Field label={t("Job title", "የስራ መደብ")} value={member.jobTitle} />
            <Field label={t("Branch", "ቅርንጫፍ")} value={member.branch} />
            <Field label={t("Station", "ጣቢያ")} value={member.station} />
            <Field label={t("Department", "ክፍል")} value={member.department} />
            <Field label={t("Phone", "ስልክ")} value={member.phone || t("Not set", "አልተመዘገበም")} />
          </DrawerSection>

          <DrawerSection title={t("System Access", "የስርዓት መዳረሻ")}>
            <Field label={t("Login account", "የመግቢያ መለያ")} value={accountLabel(member)} />
            <Field label={t("System role", "የስርዓት ሚና")} value={member.hasLoginAccount ? member.role : t("None", "የለም")} />
            <Field
              label={t("Permissions", "ፈቃዶች")}
              value={
                member.hasLoginAccount
                  ? t("Based on system role", "በስርዓት ሚና ላይ የተመሰረተ")
                  : t("No system access", "የስርዓት መዳረሻ የለም")
              }
            />
            {member.hasLoginAccount && (
              <div className="flex flex-wrap gap-2 mt-1">
                <Chip tone={accountStatusTone(member.accountStatus)}>{member.accountStatus}</Chip>
                <Chip tone="muted">{authMode === "supabase" ? t("Email login", "በኢሜይል") : t("Password / PIN", "በይለፍ ቃል / PIN")}</Chip>
              </div>
            )}
          </DrawerSection>

          {canManage && (
            <DrawerSection title={t("Actions", "እርምጃዎች")}>
              <div className="grid grid-cols-2 gap-2">
                {onEditStaff && (
                  <ActionButton icon={Icons.Pencil} label={t("Edit Staff", "ሰራተኛ አስተካክል")} onClick={onEditStaff} />
                )}
                {onViewFullProfile && (
                  <ActionButton icon={Icons.UserRound} label={t("Full Profile", "ሙሉ መገለጫ")} onClick={onViewFullProfile} />
                )}
                {onManageSchedule && (
                  <ActionButton icon={Icons.CalendarDays} label={t("Manage Schedule", "መርሐ ግብር")} onClick={onManageSchedule} />
                )}
                {onManageAccess && (
                  <ActionButton icon={Icons.KeyRound} label={t("Manage Access", "መዳረሻ")} onClick={onManageAccess} />
                )}
                {canManageAccounts && onEditAccount && member.hasLoginAccount && (
                  <ActionButton icon={Icons.Shield} label={t("Edit Account", "መለያ አስተካክል")} onClick={onEditAccount} />
                )}
                {canManageAccounts && onDisableAccount && member.hasLoginAccount && (
                  <ActionButton icon={Icons.ShieldOff} label={t("Disable Account", "መለያ አሰናክል")} onClick={onDisableAccount} danger />
                )}
              </div>
            </DrawerSection>
          )}

          {showAudit && (
            <DrawerSection title={t("Recent activity", "የቅርብ እንቅስቃሴ")}>
              {auditEntries.length === 0 ? (
                <p className="text-sm text-muted-foreground">{t("No recent activity.", "የቅርብ እንቅስቃሴ የለም።")}</p>
              ) : (
                <ul className="space-y-2">
                  {auditEntries.slice(0, 8).map((entry) => (
                    <li key={entry.id} className="rounded-lg border border-border px-3 py-2 text-xs">
                      <div className="font-medium">{entry.action}</div>
                      <div className="text-muted-foreground mt-0.5">
                        {formatDateTime(entry.atIso, prefs)} · {entry.performedBy}
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </DrawerSection>
          )}
        </div>

        {canManage && (
          <div className="p-4 border-t border-border shrink-0 flex gap-2">
            <button type="button" onClick={onClose} className="flex-1 h-10 rounded-lg border border-border bg-card text-sm hover:bg-surface-2">
              {t("Close", "ዝጋ")}
            </button>
            <button type="button" onClick={() => onSaveSchedule(member)} className="flex-1 h-10 rounded-lg bg-ember text-ember-foreground text-sm font-semibold">
              {t("Done", "ጨርስ")}
            </button>
          </div>
        )}
      </aside>
    </>
  );
}

function hasShift(member: StaffMemberView) {
  return Boolean(member.shift?.trim()) && member.startTime && member.endTime;
}

function DrawerSection({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section>
      <h3 className="text-xs uppercase tracking-wider text-muted-foreground font-semibold mb-2">{title}</h3>
      <div className="space-y-2 rounded-xl border border-border bg-surface-2/40 p-3">{children}</div>
    </section>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-start justify-between gap-3 text-sm">
      <span className="text-muted-foreground shrink-0">{label}</span>
      <span className="font-medium text-right">{value}</span>
    </div>
  );
}

function ActionButton({
  icon: Icon,
  label,
  onClick,
  danger,
}: {
  icon: typeof Icons.Pencil;
  label: string;
  onClick: () => void;
  danger?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`h-10 px-3 rounded-lg text-xs border inline-flex items-center justify-center gap-1.5 ${
        danger
          ? "border-destructive/30 text-destructive hover:bg-destructive/5"
          : "border-border hover:bg-card"
      }`}
    >
      <Icon className="size-3.5" />
      {label}
    </button>
  );
}
