import { useMemo, useState, type FormEvent } from "react";
import * as Icons from "lucide-react";
import { useT } from "@/lib/i18n";
import { activeBranchNames, loadCachedBranches } from "@/lib/branches";
import { CENTRAL_STORE_ASSIGNMENT_OPTIONS, validateStoreRoleAssignment } from "@/lib/staff-management";
import { locationsFromAuthInput, validateAssignedInventoryLocations } from "@/lib/inventory-access";
import { isStoreAssignmentRole, STOCK_LOCATIONS, type CentralStockLocation, type StockLocation } from "@/lib/stock-management";
import { USER_ROLES } from "@/lib/users";
import type { AuthUser, AuthUserInput, UserRole } from "@/lib/auth-context";

const ASSIGNABLE_ROLES = new Set([
  "Storekeeper",
  "Inventory Staff",
  "Procurement Officer",
  "Bartender",
  "Bar Staff",
  "Kitchen Staff",
  "Chef",
  "Butcher House Staff",
  "Butcher Staff",
  "Coffee House Staff",
]);

export type StaffUserModalProps = {
  branch: string;
  authMode: "demo" | "supabase";
  user?: AuthUser;
  onClose: () => void;
  onSave: (input: AuthUserInput) => Promise<string | null>;
};

export function StaffUserModal({ branch, authMode, user, onClose, onSave }: StaffUserModalProps) {
  const t = useT();
  const branchOptions = useMemo(() => {
    const configured = activeBranchNames(loadCachedBranches());
    const current = (user?.branch ?? branch).trim();
    if (current && !configured.includes(current)) return [...configured, current].sort((a, b) => a.localeCompare(b));
    return configured;
  }, [branch, user?.branch]);
  const [form, setForm] = useState<AuthUserInput>({
    email: user?.email ?? "",
    name: user?.name ?? "",
    role: user?.role ?? "Waiter",
    branch: user?.branch ?? branch,
    staffSalesAll:
      user?.role === "Administrator" || Boolean(user?.role?.toLowerCase().includes("manager")),
    assignedStore: user?.assignedStore,
    assignedInventoryLocations: user?.assignedInventoryLocations,
    password: authMode === "supabase" && user ? "" : user?.password ?? "",
  });
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  function toggleLocation(location: StockLocation) {
    const current = new Set(form.assignedInventoryLocations ?? []);
    if (current.has(location)) current.delete(location);
    else current.add(location);
    const next = [...current] as StockLocation[];
    const central = next.find((loc): loc is CentralStockLocation => loc === "Store 1" || loc === "Store 2");
    setForm({
      ...form,
      assignedInventoryLocations: next.length ? next : undefined,
      assignedStore: isStoreAssignmentRole(form.role) ? central ?? form.assignedStore : form.assignedStore,
    });
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError("");
    const assignedStore = isStoreAssignmentRole(form.role)
      ? form.assignedStore ?? "Store 1"
      : form.assignedStore;
    const assignedInventoryLocations = locationsFromAuthInput({
      role: form.role,
      assignedStore,
      assignedInventoryLocations: form.assignedInventoryLocations,
    });
    const payload: AuthUserInput = {
      ...form,
      staffSalesAll:
        form.role === "Administrator" || form.role.toLowerCase().includes("manager"),
      assignedStore,
      assignedInventoryLocations: assignedInventoryLocations.length ? assignedInventoryLocations : undefined,
    };
    const storeAssignmentError = validateStoreRoleAssignment(payload.role, payload.assignedStore);
    if (storeAssignmentError) {
      setError(storeAssignmentError);
      return;
    }
    const locationAssignmentError = validateAssignedInventoryLocations(
      payload.role,
      payload.assignedInventoryLocations,
    );
    if (locationAssignmentError) {
      setError(locationAssignmentError);
      return;
    }
    setSaving(true);
    try {
      const err = await onSave(payload);
      if (err) setError(err);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 bg-foreground/40 backdrop-blur-sm grid place-items-center p-4">
      <div className="surface-card max-w-md w-full !p-5 sm:!p-6 max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between mb-5">
          <h3 className="font-display text-xl font-semibold">{user ? t("Edit login account", "መለያ አስተካክል") : t("Create login account", "መለያ ይፍጠሩ")}</h3>
          <button type="button" onClick={onClose} className="size-9 grid place-items-center rounded-lg hover:bg-surface-2">
            <Icons.X className="size-4" />
          </button>
        </div>

        <form onSubmit={submit} className="space-y-4">
          <div>
            <label className="text-xs text-muted-foreground">{t("Full name", "ሙሉ ስም")}</label>
            <input
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              className="w-full mt-1 h-10 px-3 rounded-lg border border-border bg-card text-sm focus:outline-none focus:ring-2 focus:ring-ring/40"
              autoFocus
            />
          </div>

          {authMode === "supabase" && (
            <div>
              <label className="text-xs text-muted-foreground">{t("Supabase Auth email", "የSupabase ማረጋገጫ ኢሜይል")}</label>
              <input
                type="email"
                value={form.email ?? ""}
                onChange={(e) => setForm({ ...form, email: e.target.value })}
                placeholder={user ? t("Existing Auth email", "ያለው የማረጋገጫ ኢሜይል") : t("Auto-generated if blank", "ባዶ ከሆነ በራስ ይፈጠራል")}
                className="w-full mt-1 h-10 px-3 rounded-lg border border-border bg-card text-sm focus:outline-none focus:ring-2 focus:ring-ring/40"
              />
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-muted-foreground">{t("System role", "የስርዓት ሚና")}</label>
              <select
                value={form.role}
                onChange={(e) => {
                  const role = e.target.value as UserRole;
                  if (isStoreAssignmentRole(role)) {
                    const assignedStore = form.assignedStore ?? "Store 1";
                    setForm({
                      ...form,
                      role,
                      assignedStore,
                      assignedInventoryLocations: [assignedStore],
                    });
                    return;
                  }
                  setForm({
                    ...form,
                    role,
                    assignedStore: undefined,
                    assignedInventoryLocations: ASSIGNABLE_ROLES.has(role) ? form.assignedInventoryLocations : undefined,
                  });
                }}
                className="w-full mt-1 h-10 px-3 rounded-lg border border-border bg-card text-sm focus:outline-none"
              >
                {USER_ROLES.map((role) => (
                  <option key={role} value={role}>{role}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-xs text-muted-foreground">{t("Branch", "ቅርንጫፍ")}</label>
              {branchOptions.length > 0 ? (
                <select
                  value={form.branch}
                  onChange={(e) => setForm({ ...form, branch: e.target.value })}
                  className="w-full mt-1 h-10 px-3 rounded-lg border border-border bg-card text-sm focus:outline-none focus:ring-2 focus:ring-ring/40"
                >
                  {branchOptions.map((name) => (
                    <option key={name} value={name}>
                      {name}
                    </option>
                  ))}
                </select>
              ) : (
                <input
                  value={form.branch}
                  onChange={(e) => setForm({ ...form, branch: e.target.value })}
                  className="w-full mt-1 h-10 px-3 rounded-lg border border-border bg-card text-sm focus:outline-none focus:ring-2 focus:ring-ring/40"
                />
              )}
            </div>
          </div>

          {isStoreAssignmentRole(form.role) && (
            <div>
              <label className="text-xs text-muted-foreground">{t("Primary assigned store", "ዋና የተመደበ ስቶር")}</label>
              <select
                value={form.assignedStore ?? "Store 1"}
                onChange={(e) => {
                  const assignedStore = e.target.value as CentralStockLocation;
                  setForm({
                    ...form,
                    assignedStore,
                    assignedInventoryLocations: [assignedStore],
                  });
                }}
                className="w-full mt-1 h-10 px-3 rounded-lg border border-border bg-card text-sm focus:outline-none"
              >
                {CENTRAL_STORE_ASSIGNMENT_OPTIONS.map((store) => (
                  <option key={store} value={store}>{store}</option>
                ))}
              </select>
            </div>
          )}

          {ASSIGNABLE_ROLES.has(form.role) && !isStoreAssignmentRole(form.role) ? (
            <div>
              <label className="text-xs text-muted-foreground">{t("Assigned inventory locations", "የተመደቡ የክምችት ቦታዎች")}</label>
              <div className="mt-2 grid grid-cols-1 gap-2">
                {STOCK_LOCATIONS.map((location) => (
                  <label key={location} className="flex items-center gap-2 rounded-lg border border-border px-3 py-2 text-sm">
                    <input
                      type="checkbox"
                      checked={(form.assignedInventoryLocations ?? []).includes(location)}
                      onChange={() => toggleLocation(location)}
                    />
                    <span>{location === "Butcher" ? "Butcher House" : location}</span>
                  </label>
                ))}
              </div>
            </div>
          ) : null}

          <div>
            <label className="text-xs text-muted-foreground">
              {authMode === "supabase" ? t("Login password", "የመግቢያ በይለፍ ቃል") : t("Password", "በይለፍ ቃል")}
            </label>
            <input
              type="password"
              value={form.password}
              onChange={(e) => setForm({ ...form, password: e.target.value })}
              placeholder={
                authMode === "supabase" && user
                  ? t("Leave blank to keep current password", "አሁን ያለውን በይለፍ ቃል ለመጠበቅ ባዶ ይተው")
                  : t("Unique login password", "ልዩ የመግቢያ በይለፍ ቃል")
              }
              className="w-full mt-1 h-10 px-3 rounded-lg border border-border bg-card text-sm font-mono focus:outline-none focus:ring-2 focus:ring-ring/40"
            />
          </div>

          {error && <p className="text-xs text-destructive">{error}</p>}

          <div className="flex gap-2 pt-1">
            <button type="button" onClick={onClose} disabled={saving} className="flex-1 h-10 rounded-lg border border-border bg-card text-sm hover:bg-surface-2">
              {t("Cancel", "ሰርዝ")}
            </button>
            <button type="submit" disabled={saving} className="flex-1 h-10 rounded-lg bg-ember text-ember-foreground text-sm font-semibold">
              {saving ? t("Saving", "እየተቀመጠ") : user ? t("Save changes", "ለውጦችን አስቀምጥ") : t("Create", "ፍጠር")}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
