import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import * as Icons from "lucide-react";
import { DateRangePicker } from "@/components/date-range/date-range-picker";
import { RealtimeBadge } from "@/components/realtime-badge";
import { PageHeader, Card, Chip, Stat } from "@/components/ui-kit";
import { CATERING_JOBS } from "@/lib/demo-data";
import { formatETB } from "@/lib/ethiopic";
import { useAuth, type AuthUser } from "@/lib/auth-context";
import { useT } from "@/lib/i18n";
import { defaultDateRangeValue, isDateInResolvedRange, resolveDateRange } from "@/lib/date-time";
import { loadSystemSettings } from "@/lib/system-settings";
import { useStore } from "@/lib/store";
import { useModuleRecords } from "@/lib/module-records";
import { showSuccess } from "@/lib/toast";

export const Route = createFileRoute("/app/catering")({ component: Catering });

type Job = (typeof CATERING_JOBS)[number] & { driverId?: string };
type StaffOption = { id: string; name: string };

const STATUS_CYCLE: Record<string, string> = {
  Quotation: "Confirmed",
  Confirmed: "Packing",
  Packing: "Delivered",
};
const STATUS_TONE: Record<string, "ember" | "gold" | "teff" | "muted"> = {
  Quotation: "muted",
  Confirmed: "teff",
  Packing: "gold",
  Delivered: "muted",
};

function jobStatusLabel(status: string, t: ReturnType<typeof useT>) {
  if (status === "Quotation") return t("Quotation", "ዋጋ ጥያቄ");
  if (status === "Confirmed") return t("Confirmed", "ተረጋግጧል");
  if (status === "Packing") return t("Packing", "እየተሸገገ");
  return t("Delivered", "ተላልፏል");
}
const CATERING_DISPATCH_ROLES: AuthUser["role"][] = [
  "Event Coordinator",
  "Storekeeper",
  "Branch Manager",
];
const LEGACY_STAFF_PREFIX = "legacy:";
const CATERING_PAGE_SIZE = 8;

function staffOptions(users: AuthUser[], roles: AuthUser["role"][]) {
  const roleSet = new Set(roles);
  return users
    .filter((user) => roleSet.has(user.role))
    .map((user) => ({ id: user.id, name: user.name.trim() }))
    .filter((user) => user.name)
    .sort((a, b) => a.name.localeCompare(b.name));
}

function legacyStaffId(name: string) {
  return `${LEGACY_STAFF_PREFIX}${name}`;
}

function selectionOptions(options: StaffOption[], currentName?: string, currentId?: string) {
  const name = currentName?.trim() ?? "";
  if (!name) return options;
  if (options.some((option) => option.id === currentId || option.name === name)) return options;
  return [{ id: currentId || legacyStaffId(name), name }, ...options];
}

function selectedStaffId(options: StaffOption[], currentName?: string, currentId?: string) {
  const name = currentName?.trim() ?? "";
  if (currentId && options.some((option) => option.id === currentId)) return currentId;
  const matched = options.find((option) => option.name === name);
  if (matched) return matched.id;
  return name ? currentId || legacyStaffId(name) : "";
}

function staffFromSelection(options: StaffOption[], selection: string) {
  const matched = options.find((option) => option.id === selection);
  if (matched) return { id: matched.id, name: matched.name };
  if (selection.startsWith(LEGACY_STAFF_PREFIX)) {
    return { id: "", name: selection.slice(LEGACY_STAFF_PREFIX.length) };
  }
  return { id: "", name: "" };
}

function cleanNumber(value: number) {
  return Number.isFinite(value) ? Math.max(0, value) : 0;
}

function normalizeJob(job: Job): Job {
  return {
    ...job,
    id: job.id,
    client: job.client.trim(),
    event: job.event.trim(),
    date: job.date.trim(),
    guests: cleanNumber(job.guests),
    location: job.location.trim(),
    value: cleanNumber(job.value),
    driver: job.driver.trim(),
    driverId: job.driverId?.trim() || undefined,
    vehicle: job.vehicle.trim(),
    items: job.items.map((item) => item.trim()).filter(Boolean),
    notes: job.notes.trim(),
  };
}

function upsertJob(records: Job[], job: Job) {
  const next = normalizeJob(job);
  return records.some((record) => record.id === next.id)
    ? records.map((record) => (record.id === next.id ? next : record))
    : [...records, next];
}

function Catering() {
  const {
    records: jobs,
    setRecords: setJobs,
  } = useModuleRecords<Job>(
    "catering_jobs",
    CATERING_JOBS.map((j) => ({ ...j })),
  );
  const { users } = useAuth();
  const store = useStore();
  const t = useT();
  const dispatchStaff = useMemo(() => staffOptions(users, CATERING_DISPATCH_ROLES), [users]);
  const [selected, setSelected] = useState<Job | null>(null);
  const [showAdd, setShowAdd] = useState(false);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("ALL");
  const [page, setPage] = useState(1);
  const [dateRange, setDateRange] = useState(defaultDateRangeValue);
  const datePrefs = loadSystemSettings().calendar;
  const resolvedRange = useMemo(() => resolveDateRange(dateRange, datePrefs), [dateRange, datePrefs]);

  const pipeline = jobs.reduce((s, j) => s + j.value, 0);
  const confirmed = jobs.filter((j) => j.status === "Confirmed" || j.status === "Packing").length;
  const canCreateJob = dispatchStaff.length > 0;
  const filteredJobs = useMemo(() => {
    const query = search.trim().toLowerCase();
    return jobs.filter((job) => {
      const matchesSearch =
        !query ||
        [job.client, job.event, job.location, job.driver, job.vehicle, ...job.items, job.notes]
          .filter(Boolean)
          .some((value) => value.toLowerCase().includes(query));
      const matchesStatus = statusFilter === "ALL" || job.status === statusFilter;
      const matchesDate = isDateInResolvedRange(job.date, resolvedRange);
      return matchesSearch && matchesStatus && matchesDate;
    });
  }, [jobs, search, statusFilter, resolvedRange]);
  const totalPages = Math.max(1, Math.ceil(filteredJobs.length / CATERING_PAGE_SIZE));
  const paginatedJobs = useMemo(
    () => filteredJobs.slice((page - 1) * CATERING_PAGE_SIZE, page * CATERING_PAGE_SIZE),
    [filteredJobs, page],
  );

  useEffect(() => {
    if (page > totalPages) setPage(totalPages);
  }, [page, totalPages]);

  function advance(id: string) {
    setJobs((prev) =>
      prev.map((j) =>
        j.id === id && STATUS_CYCLE[j.status]
          ? normalizeJob({ ...j, status: STATUS_CYCLE[j.status] })
          : j,
      ),
    );
    showSuccess(t("Catering job updated.", "የውጭ ስራው ተዘምኗል።"));
  }

  function cancel(id: string) {
    setJobs((prev) => prev.filter((j) => j.id !== id));
    showSuccess(t("Catering job removed.", "የውጭ ስራው ተሰርዟል።"));
  }

  return (
    <div>
      <PageHeader
        title={t("Catering & Offsite", "የውጭ አገልግሎት እና ከሱቅ ውጪ")}
        action={
          <div className="flex flex-wrap items-center justify-end gap-2">
            <DateRangePicker value={dateRange} onChange={setDateRange} preferences={datePrefs} compact />
            <RealtimeBadge status={store.realtimeStatus} lastSyncAt={store.lastRealtimeSyncAt} />
            {!canCreateJob && (
              <Link
                to="/app/staff"
                search={{ tab: "accounts" }}
                className="h-10 px-3 rounded-lg border border-border bg-card text-sm hover:bg-surface-2 inline-flex items-center gap-2"
              >
                <Icons.UserPlus className="size-4" />
                {t("Staff Management", "የሰራተኞች አስተዳደር")}
              </Link>
            )}
            <button
              onClick={() => setShowAdd(true)}
              disabled={!canCreateJob}
              title={
                canCreateJob
                  ? undefined
                  : t("Create dispatch staff login accounts in Staff Management first.", "መጀመሪያ በሰራተኞች አስተዳደር ውስጥ የመላኪያ ሰራተኞች መለያ ይፍጠሩ።")
              }
              className={`h-10 px-4 rounded-lg text-sm font-medium inline-flex items-center gap-2 ${canCreateJob ? "bg-ember text-ember-foreground" : "bg-surface-2 text-muted-foreground cursor-not-allowed"}`}
            >
              <Icons.Plus className="size-4" /> {t("New job", "አዲስ ስራ")}
            </button>
          </div>
        }
      />

      <Card className="mb-4">
        <div className="grid md:grid-cols-2 xl:grid-cols-3 gap-3">
          <div>
            <label className="text-xs text-muted-foreground">{t("Search jobs", "ስራዎችን ፈልግ")}</label>
            <input
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setPage(1);
              }}
              className="w-full mt-1 h-9 px-3 rounded-lg border border-border bg-card text-sm"
            />
          </div>
          <div>
            <label className="text-xs text-muted-foreground">{t("Status", "ሁኔታ")}</label>
            <select
              value={statusFilter}
              onChange={(e) => {
                setStatusFilter(e.target.value);
                setPage(1);
              }}
              className="w-full mt-1 h-9 px-3 rounded-lg border border-border bg-card text-sm"
            >
              <option value="ALL">{t("All statuses", "ሁሉም ሁኔታዎች")}</option>
              {["Quotation", "Confirmed", "Packing", "Delivered"].map((status) => (
                <option key={status} value={status}>{status}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="text-xs text-muted-foreground">{t("Matched jobs", "የተገኙ ስራዎች")}</label>
            <input value={String(filteredJobs.length)} disabled className="w-full mt-1 h-9 px-3 rounded-lg border border-border bg-card text-sm opacity-70" />
          </div>
        </div>
      </Card>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        <Stat label={t("Pipeline", "በሂደት ላይ")} value={formatETB(pipeline)} tone="ember" icon="UtensilsCrossed" />
        <Stat label={t("Active jobs", "ንቁ ስራዎች")} value={`${confirmed}`} tone="teff" icon="Truck" />
        <Stat
          label={t("Packing now", "አሁን እየተሸገገ")}
          value={`${jobs.filter((j) => j.status === "Packing").length}`}
          tone="gold"
          icon="Package"
        />
        <Stat
          label={t("Quotations", "ዋጋ ጥያቄዎች")}
          value={`${jobs.filter((j) => j.status === "Quotation").length}`}
          icon="FileText"
        />
      </div>

      <div className="grid lg:grid-cols-2 gap-4">
        {paginatedJobs.map((j) => (
          <Card key={j.id} className="!p-5">
            <div className="flex items-start justify-between gap-3 mb-3">
              <div>
                <h3 className="font-display text-lg font-semibold">{j.client}</h3>
                <div className="text-sm text-muted-foreground">{j.event}</div>
                <div className="text-xs text-muted-foreground mt-0.5">
                  {j.date} - {j.location} - {j.guests} {t("guests", "እንግዶች")}
                </div>
              </div>
              <Chip tone={STATUS_TONE[j.status] ?? "muted"}>{jobStatusLabel(j.status, t)}</Chip>
            </div>

            <div className="grid grid-cols-2 gap-3 mb-3 text-sm">
              <div className="rounded-lg bg-surface-2 p-3">
                <div className="text-xs text-muted-foreground">{t("Value", "ዋጋ")}</div>
                <div className="font-display font-semibold mt-0.5">
                  {formatETB(j.value).replace("ETB ", "")}
                </div>
              </div>
              <div className="rounded-lg bg-surface-2 p-3">
                <div className="text-xs text-muted-foreground">{t("Vehicle", "ተሽከርካሪ")}</div>
                <div className="font-semibold mt-0.5">{j.vehicle || "-"}</div>
              </div>
            </div>

            {j.driver && (
              <div className="flex items-center gap-2 text-xs text-muted-foreground mb-3">
                <Icons.User className="size-3.5" /> {t("Assigned", "ተመድቧል")}: {j.driver}
              </div>
            )}

            <div className="mb-3">
              <div className="text-xs text-muted-foreground mb-1">{t("Packing list", "የማሸጊያ ዝርዝር")}</div>
              <div className="flex flex-wrap gap-1">
                {j.items.map((item, i) => (
                  <Chip key={i} tone="muted">
                    {item}
                  </Chip>
                ))}
              </div>
            </div>

            {j.notes && (
              <div className="text-xs text-muted-foreground bg-surface-2 rounded-lg px-3 py-2 mb-3 italic">
                "{j.notes}"
              </div>
            )}

            <div className="flex items-center gap-2">
              <button
                onClick={() => setSelected(j)}
                className="flex-1 h-9 rounded-lg border border-border bg-card text-sm hover:bg-surface-2 inline-flex items-center justify-center gap-1.5"
              >
                <Icons.Pencil className="size-4" /> Edit
              </button>
              {STATUS_CYCLE[j.status] && (
                <button
                  onClick={() => advance(j.id)}
                  className="flex-1 h-9 rounded-lg bg-ember/10 text-ember text-sm font-medium hover:bg-ember/20 transition-colors inline-flex items-center justify-center gap-1.5"
                >
                  <Icons.ArrowRight className="size-4" /> {jobStatusLabel(STATUS_CYCLE[j.status], t)}
                </button>
              )}
              <button
                onClick={() => cancel(j.id)}
                className="size-9 grid place-items-center rounded-lg border border-border hover:bg-destructive/5 hover:text-destructive transition-colors"
              >
                <Icons.Trash2 className="size-4" />
              </button>
            </div>
          </Card>
        ))}
        {filteredJobs.length === 0 && (
          <div className="col-span-2 text-center py-16 text-muted-foreground text-sm">
            <Icons.UtensilsCrossed className="size-10 mx-auto mb-3 opacity-30" />
            {t("No jobs", "ስራዎች የሉም")}
          </div>
        )}
      </div>

      <div className="mt-4 flex items-center justify-between gap-3 text-sm">
        <div className="text-muted-foreground">
          Showing {filteredJobs.length === 0 ? 0 : (page - 1) * CATERING_PAGE_SIZE + 1}-{Math.min(page * CATERING_PAGE_SIZE, filteredJobs.length)} of {filteredJobs.length}
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => setPage(Math.max(1, page - 1))} disabled={page <= 1} className="h-8 px-3 rounded-lg border border-border bg-card disabled:opacity-50">Prev</button>
          <div className="min-w-[88px] text-center text-muted-foreground">Page {page} / {totalPages}</div>
          <button onClick={() => setPage(Math.min(totalPages, page + 1))} disabled={page >= totalPages} className="h-8 px-3 rounded-lg border border-border bg-card disabled:opacity-50">Next</button>
        </div>
      </div>

      {showAdd && (
        <JobModal
          staff={dispatchStaff}
          onClose={() => setShowAdd(false)}
          onSave={(j) => {
            setJobs((prev) => upsertJob(prev, j));
            setShowAdd(false);
            showSuccess(t("Catering job created successfully.", "የውጭ ስራው በትክክል ተፈጥሯል።"));
          }}
        />
      )}
      {selected && (
        <JobModal
          job={selected}
          staff={dispatchStaff}
          onClose={() => setSelected(null)}
          onSave={(j) => {
            setJobs((prev) => upsertJob(prev, j));
            setSelected(null);
            showSuccess(t("Catering job updated successfully.", "የውጭ ስራው በትክክል ተዘምኗል።"));
          }}
        />
      )}
    </div>
  );
}

function JobModal({
  job,
  staff,
  onClose,
  onSave,
}: {
  job?: Job;
  staff: StaffOption[];
  onClose: () => void;
  onSave: (j: Job) => void;
}) {
  const defaultStaff = staff[0];
  const t = useT();
  const blank: Job = {
    id: `cj${Date.now()}`,
    client: "",
    event: "",
    date: "",
    guests: 50,
    location: "",
    status: "Quotation",
    value: 0,
    driver: defaultStaff?.name ?? "",
    driverId: defaultStaff?.id,
    vehicle: "",
    items: [],
    notes: "",
  };
  const [form, setForm] = useState<Job>(job ? { ...job } : blank);
  const [itemInput, setItemInput] = useState("");
  const staffForSelection = useMemo(
    () => selectionOptions(staff, form.driver, form.driverId),
    [staff, form.driver, form.driverId],
  );
  const staffValue = selectedStaffId(staffForSelection, form.driver, form.driverId);
  const canSave = Boolean(
    form.client.trim() && form.event.trim() && form.date.trim() && form.driver.trim(),
  );

  function selectStaff(selection: string) {
    const selected = staffFromSelection(staffForSelection, selection);
    setForm({ ...form, driverId: selected.id || undefined, driver: selected.name });
  }

  function addItem() {
    if (!itemInput.trim()) return;
    setForm((prev) => ({ ...prev, items: [...prev.items, itemInput.trim()] }));
    setItemInput("");
  }

  function submit() {
    if (!canSave) return;
    onSave(form);
  }

  return (
    <div className="fixed inset-0 z-50 bg-foreground/40 backdrop-blur-sm grid place-items-center p-4">
      <div className="surface-card max-w-lg w-full !p-6 max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between mb-5">
          <h3 className="font-display text-xl font-semibold">
            {job ? t("Edit Job", "ስራ አስተካክል") : t("New Catering Job", "አዲስ የውጭ ስራ")}
          </h3>
          <button
            onClick={onClose}
            className="size-8 grid place-items-center rounded-lg hover:bg-surface-2"
          >
            <Icons.X className="size-4" />
          </button>
        </div>
        <div className="grid grid-cols-2 gap-3 mb-4">
          <div className="col-span-2">
            <label className="text-xs text-muted-foreground">{t("Client", "ደንበኛ")}</label>
            <input
              value={form.client}
              onChange={(e) => setForm({ ...form, client: e.target.value })}
              className="w-full mt-1 h-9 px-3 rounded-lg border border-border bg-card text-sm focus:outline-none focus:ring-2 focus:ring-ring/40"
            />
          </div>
          <div>
            <label className="text-xs text-muted-foreground">{t("Event", "ዝግጅት")}</label>
            <input
              value={form.event}
              onChange={(e) => setForm({ ...form, event: e.target.value })}
              className="w-full mt-1 h-9 px-3 rounded-lg border border-border bg-card text-sm focus:outline-none focus:ring-2 focus:ring-ring/40"
            />
          </div>
          <div>
            <label className="text-xs text-muted-foreground">{t("Date", "ቀን")}</label>
            <input
              value={form.date}
              onChange={(e) => setForm({ ...form, date: e.target.value })}
              placeholder="e.g. Hidar 20"
              className="w-full mt-1 h-9 px-3 rounded-lg border border-border bg-card text-sm focus:outline-none focus:ring-2 focus:ring-ring/40"
            />
          </div>
          <div>
            <label className="text-xs text-muted-foreground">{t("Location", "ቦታ")}</label>
            <input
              value={form.location}
              onChange={(e) => setForm({ ...form, location: e.target.value })}
              className="w-full mt-1 h-9 px-3 rounded-lg border border-border bg-card text-sm focus:outline-none focus:ring-2 focus:ring-ring/40"
            />
          </div>
          <div>
            <label className="text-xs text-muted-foreground">{t("Guests", "እንግዶች")}</label>
            <input
              type="number"
              value={form.guests}
              onChange={(e) => setForm({ ...form, guests: Number(e.target.value) })}
              className="w-full mt-1 h-9 px-3 rounded-lg border border-border bg-card text-sm font-mono focus:outline-none focus:ring-2 focus:ring-ring/40"
            />
          </div>
          <div>
            <label className="text-xs text-muted-foreground">{t("Value (ETB)", "ዋጋ (ብር)")}</label>
            <input
              type="number"
              value={form.value}
              onChange={(e) => setForm({ ...form, value: Number(e.target.value) })}
              className="w-full mt-1 h-9 px-3 rounded-lg border border-border bg-card text-sm font-mono focus:outline-none focus:ring-2 focus:ring-ring/40"
            />
          </div>
          <div>
            <label className="text-xs text-muted-foreground">{t("Dispatch staff", "የሚልኩ ሰራተኛ")}</label>
            <select
              value={staffValue}
              onChange={(e) => selectStaff(e.target.value)}
              className="w-full mt-1 h-9 px-3 rounded-lg border border-border bg-card text-sm focus:outline-none"
            >
              {staffForSelection.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="text-xs text-muted-foreground">{t("Vehicle", "ተሽከርካሪ")}</label>
            <select
              value={form.vehicle}
              onChange={(e) => setForm({ ...form, vehicle: e.target.value })}
              className="w-full mt-1 h-9 px-3 rounded-lg border border-border bg-card text-sm focus:outline-none"
            >
              <option value="">{t("None", "የለም")}</option>
              {["Truck-01", "Van-02", "Van-03"].map((v) => (
                <option key={v} value={v}>
                  {v}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="text-xs text-muted-foreground">{t("Status", "ሁኔታ")}</label>
            <select
              value={form.status}
              onChange={(e) => setForm({ ...form, status: e.target.value })}
              className="w-full mt-1 h-9 px-3 rounded-lg border border-border bg-card text-sm focus:outline-none"
            >
              {["Quotation", "Confirmed", "Packing", "Delivered"].map((s) => (
                <option key={s} value={s}>
                  {t(s, s === "Quotation" ? "ዋጋ ጥያቄ" : s === "Confirmed" ? "ተረጋግጧል" : s === "Packing" ? "እየተሸገገ" : "ተላልፏል")}
                </option>
              ))}
            </select>
          </div>
        </div>
        <div className="mb-4">
          <label className="text-xs text-muted-foreground">{t("Packing list", "የማሸጊያ ዝርዝር")}</label>
          <div className="flex gap-2 mt-1">
            <input
              value={itemInput}
              onChange={(e) => setItemInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  addItem();
                }
              }}
              placeholder={t("e.g. Doro Wat x 100", "ለምሳሌ፣ ዶሮ ወጥ x 100")}
              className="flex-1 h-9 px-3 rounded-lg border border-border bg-card text-sm focus:outline-none focus:ring-2 focus:ring-ring/40"
            />
            <button
              onClick={addItem}
              className="h-9 px-3 rounded-lg bg-ember/10 text-ember text-sm hover:bg-ember/20"
            >
              <Icons.Plus className="size-4" />
            </button>
          </div>
          {form.items.length > 0 && (
            <div className="flex flex-wrap gap-1 mt-2">
              {form.items.map((item, i) => (
                <span
                  key={i}
                  className="inline-flex items-center gap-1 px-2 h-6 rounded-full text-xs bg-surface-2"
                >
                  {item}
                  <button
                    onClick={() =>
                      setForm((prev) => ({ ...prev, items: prev.items.filter((_, j) => j !== i) }))
                    }
                    className="hover:text-destructive"
                  >
                    <Icons.X className="size-2.5" />
                  </button>
                </span>
              ))}
            </div>
          )}
        </div>
        <div className="mb-5">
          <label className="text-xs text-muted-foreground">{t("Notes", "ማስታወሻዎች")}</label>
          <textarea
            value={form.notes}
            onChange={(e) => setForm({ ...form, notes: e.target.value })}
            rows={2}
            className="w-full mt-1 px-3 py-2 rounded-lg border border-border bg-card text-sm focus:outline-none focus:ring-2 focus:ring-ring/40 resize-none"
          />
        </div>
        <div className="flex gap-2">
          <button
            onClick={onClose}
            className="flex-1 h-10 rounded-lg border border-border bg-card text-sm hover:bg-surface-2"
          >
            {t("Cancel", "ሰርዝ")}
          </button>
          <button
            onClick={submit}
            disabled={!canSave}
            className={`flex-1 h-10 rounded-lg text-sm font-semibold ${canSave ? "bg-ember text-ember-foreground" : "bg-surface-2 text-muted-foreground cursor-not-allowed"}`}
          >
            {t("Save", "አስቀምጥ")}
          </button>
        </div>
      </div>
    </div>
  );
}
