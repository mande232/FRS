import { createFileRoute, useSearch } from "@tanstack/react-router";
import { StaffShell } from "@/components/staff/staff-shell";
import { useAuth } from "@/lib/auth-context";
import { EMPTY_MODULE_RECORDS, useModuleRecords } from "@/lib/module-records";
import { normalizeStaffTab, type StaffMemberOnly, type StaffScheduleRecord } from "@/lib/staff-management";
import { useStore } from "@/lib/store";

export const Route = createFileRoute("/app/staff")({
  validateSearch: (search: Record<string, unknown>) => ({
    tab: typeof search.tab === "string" ? search.tab : undefined,
  }),
  component: StaffRoute,
});

function StaffRoute() {
  const { tab: tabParam } = useSearch({ from: "/app/staff" });
  const initialTab = normalizeStaffTab(tabParam);
  const { user, users, authMode, addUser, updateUser, removeUser } = useAuth();
  const store = useStore();
  const { records: scheduleMetadata, setRecords: setScheduleMetadata } = useModuleRecords<StaffScheduleRecord>("staff", EMPTY_MODULE_RECORDS);
  const { records: staffOnly, setRecords: setStaffOnly } = useModuleRecords<StaffMemberOnly>("staff-members", EMPTY_MODULE_RECORDS);

  if (!user) return null;

  return (
    <StaffShell
      initialTab={initialTab}
      branch={user.branch}
      currentUserId={user.id}
      currentUserName={user.name}
      currentUserRole={user.role}
      users={users}
      authMode={authMode}
      realtimeStatus={store.realtimeStatus}
      lastSyncAt={store.lastRealtimeSyncAt}
      scheduleMetadata={scheduleMetadata}
      staffOnly={staffOnly}
      onSaveScheduleMetadata={setScheduleMetadata}
      onSaveStaffOnly={setStaffOnly}
      addUser={addUser}
      updateUser={updateUser}
      removeUser={removeUser}
    />
  );
}
