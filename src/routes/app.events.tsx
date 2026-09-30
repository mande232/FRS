import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import * as Icons from "lucide-react";
import { DateRangePicker } from "@/components/date-range/date-range-picker";
import { RealtimeBadge } from "@/components/realtime-badge";
import { PageHeader, Card, Chip, Stat } from "@/components/ui-kit";
import { EVENTS, SEATING_AREAS } from "@/lib/demo-data";
import { formatETB } from "@/lib/ethiopic";
import { useAuth, type AuthUser } from "@/lib/auth-context";
import { useT } from "@/lib/i18n";
import { defaultDateRangeValue, isDateInResolvedRange, resolveDateRange } from "@/lib/date-time";
import { loadSystemSettings } from "@/lib/system-settings";
import { useModuleRecords } from "@/lib/module-records";
import { useStore } from "@/lib/store";
import { showSuccess } from "@/lib/toast";

export const Route = createFileRoute("/app/events")({ component: Events });

type Event = (typeof EVENTS)[number] & { coordinatorId?: string };
type StaffOption = { id: string; name: string };

const EVENT_COORDINATOR_ROLES: AuthUser["role"][] = ["Event Coordinator"];
const LEGACY_STAFF_PREFIX = "legacy:";
const EVENTS_PAGE_SIZE = 8;

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

function uniqueTextOptions(values: string[]) {
  const seen = new Set<string>();
  return values.flatMap((value) => {
    const next = value.trim();
    if (!next || seen.has(next.toLowerCase())) return [];
    seen.add(next.toLowerCase());
    return next;
  });
}

function eventAreaOptions(tableAreas: string[]) {
  const configuredAreas = tableAreas.filter((area) => area !== "All");
  return uniqueTextOptions(configuredAreas.length > 0 ? configuredAreas : [...SEATING_AREAS]);
}

function hallSelectionOptions(options: string[], current?: string) {
  const value = current?.trim() ?? "";
  if (!value || options.some((option) => option.toLowerCase() === value.toLowerCase())) {
    return options;
  }
  return [value, ...options];
}

function normalizeEvent(event: Event): Event {
  return {
    ...event,
    id: event.id,
    name: event.name.trim(),
    date: event.date.trim(),
    hall: event.hall.trim() || SEATING_AREAS[0],
    guests: cleanNumber(event.guests),
    value: cleanNumber(event.value),
    deposit: cleanNumber(event.deposit),
    menu: event.menu.trim(),
    coordinator: event.coordinator.trim(),
    coordinatorId: event.coordinatorId?.trim() || undefined,
    notes: event.notes.trim(),
  };
}

function upsertEvent(records: Event[], event: Event) {
  const next = normalizeEvent(event);
  return records.some((record) => record.id === next.id)
    ? records.map((record) => (record.id === next.id ? next : record))
    : [...records, next];
}

function Events() {
  const {
    records: events,
    setRecords: setEvents,
  } = useModuleRecords<Event>(
    "events",
    EVENTS.map((e) => ({ ...e })),
  );
  const { users } = useAuth();
  const store = useStore();
  const t = useT();
  const coordinators = useMemo(() => staffOptions(users, EVENT_COORDINATOR_ROLES), [users]);
  const eventAreas = useMemo(() => eventAreaOptions(store.tableAreas), [store.tableAreas]);
  const [showAdd, setShowAdd] = useState(false);
  const [beo, setBeo] = useState<Event | null>(null);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("ALL");
  const [hallFilter, setHallFilter] = useState("ALL");
  const [page, setPage] = useState(1);
  const [dateRange, setDateRange] = useState(defaultDateRangeValue);
  const datePrefs = loadSystemSettings().calendar;
  const resolvedRange = useMemo(() => resolveDateRange(dateRange, datePrefs), [dateRange, datePrefs]);

  const pipeline = events.reduce((s, e) => s + e.value, 0);
  const confirmed = events.filter((e) => e.status === "Confirmed").length;
  const depositPending = events.filter((e) => e.status === "Deposit").length;
  const inquiries = events.filter((e) => e.status === "Inquiry").length;
  const canCreateBooking = coordinators.length > 0;
  const hallOptions = useMemo(() => Array.from(new Set(events.map((event) => event.hall))).sort((a, b) => a.localeCompare(b)), [events]);
  const filteredEvents = useMemo(() => {
    const query = search.trim().toLowerCase();
    return events.filter((event) => {
      const matchesSearch = !query || [event.name, event.hall, event.coordinator, event.menu, event.notes]
        .filter(Boolean)
        .some((value) => value.toLowerCase().includes(query));
      const matchesStatus = statusFilter === "ALL" || event.status === statusFilter;
      const matchesHall = hallFilter === "ALL" || event.hall === hallFilter;
      const matchesDate = isDateInResolvedRange(event.date, resolvedRange);
      return matchesSearch && matchesStatus && matchesHall && matchesDate;
    });
  }, [events, hallFilter, search, statusFilter, resolvedRange]);
  const totalPages = Math.max(1, Math.ceil(filteredEvents.length / EVENTS_PAGE_SIZE));
  const paginatedEvents = useMemo(() => filteredEvents.slice((page - 1) * EVENTS_PAGE_SIZE, page * EVENTS_PAGE_SIZE), [filteredEvents, page]);

  useEffect(() => {
    if (page > totalPages) setPage(totalPages);
  }, [page, totalPages]);

  function advance(id: string) {
    setEvents((prev) =>
      prev.map((e) => {
        if (e.id !== id) return e;
        if (e.status === "Inquiry") return normalizeEvent({ ...e, status: "Deposit" });
        if (e.status === "Deposit") return normalizeEvent({ ...e, status: "Confirmed" });
        return e;
      }),
    );
    showSuccess(t("Event status updated.", "የዝግጅቱ ሁኔታ ተዘምኗል።"));
  }

  function cancel(id: string) {
    setEvents((prev) => prev.filter((e) => e.id !== id));
    showSuccess(t("Event removed successfully.", "ዝግጅቱ ተሰርዟል።"));
  }

  return (
    <div>
      <PageHeader
        title={t("Events", "ዝግጅቶች")}
        action={
          <div className="flex flex-wrap items-center justify-end gap-2">
            <DateRangePicker value={dateRange} onChange={setDateRange} preferences={datePrefs} compact />
            <RealtimeBadge status={store.realtimeStatus} lastSyncAt={store.lastRealtimeSyncAt} />
            {!canCreateBooking && (
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
              disabled={!canCreateBooking}
              title={canCreateBooking ? undefined : t("Create an Event Coordinator login account in Staff Management first.", "መጀመሪያ በሰራተኞች አስተዳደር ውስጥ የዝግጅት አስተባባሪ መለያ ይፍጠሩ።")}
              className={`h-10 px-4 rounded-lg text-sm font-medium inline-flex items-center gap-2 ${canCreateBooking ? "bg-ember text-ember-foreground" : "bg-surface-2 text-muted-foreground cursor-not-allowed"}`}
            >
              <Icons.Plus className="size-4" />
              {t("New booking", "አዲስ ማስያዣ")}
            </button>
          </div>
        }
      />

      <Card className="mb-4">
        <div className="grid md:grid-cols-2 xl:grid-cols-4 gap-3">
          <div>
            <label className="text-xs text-muted-foreground">{t("Search events", "ዝግጅቶችን ፈልግ")}</label>
            <input value={search} onChange={(e) => { setSearch(e.target.value); setPage(1); }} className="w-full mt-1 h-9 px-3 rounded-lg border border-border bg-card text-sm" />
          </div>
          <div>
            <label className="text-xs text-muted-foreground">{t("Status", "ሁኔታ")}</label>
            <select value={statusFilter} onChange={(e) => { setStatusFilter(e.target.value); setPage(1); }} className="w-full mt-1 h-9 px-3 rounded-lg border border-border bg-card text-sm">
              <option value="ALL">{t("All statuses", "ሁሉም ሁኔታዎች")}</option>
              {["Inquiry", "Deposit", "Confirmed", "Completed"].map((status) => <option key={status} value={status}>{status}</option>)}
            </select>
          </div>
          <div>
            <label className="text-xs text-muted-foreground">{t("Event area", "የዝግጅት ቦታ")}</label>
            <select value={hallFilter} onChange={(e) => { setHallFilter(e.target.value); setPage(1); }} className="w-full mt-1 h-9 px-3 rounded-lg border border-border bg-card text-sm">
              <option value="ALL">{t("All areas", "ሁሉም ቦታዎች")}</option>
              {hallOptions.map((hall) => <option key={hall} value={hall}>{hall}</option>)}
            </select>
          </div>
          <div>
            <label className="text-xs text-muted-foreground">{t("Matched events", "የተገኙ ዝግጅቶች")}</label>
            <input value={String(filteredEvents.length)} disabled className="w-full mt-1 h-9 px-3 rounded-lg border border-border bg-card text-sm opacity-70" />
          </div>
        </div>
      </Card>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        <Stat label={t("Pipeline", "በሂደት ላይ")} value={formatETB(pipeline)} tone="ember" icon="TrendingUp" />
        <Stat label={t("Confirmed", "ተረጋግጧል")} value={`${confirmed}`} tone="teff" icon="CheckCircle" />
        <Stat label={t("Deposit pending", "ቅድመ ክፍያ ይጠብቃል")} value={`${depositPending}`} tone="gold" icon="Clock" />
        <Stat label={t("Inquiries", "ጥያቄዎች")} value={`${inquiries}`} icon="MailQuestion" />
      </div>

      <div className="grid lg:grid-cols-2 gap-4">
        {paginatedEvents.map((e) => (
          <Card key={e.id} className="!p-5">
            <div className="flex items-start justify-between gap-3 mb-3">
              <div>
                <h3 className="font-display text-lg font-semibold">{e.name}</h3>
                <div className="text-xs text-muted-foreground">
                  {e.date} - {e.hall}
                </div>
                {e.coordinator && (
                  <div className="text-xs text-muted-foreground mt-0.5">
                    {t("Coordinator", "አስተባባሪ")}: {e.coordinator}
                  </div>
                )}
              </div>
              <Chip
                tone={e.status === "Confirmed" ? "teff" : e.status === "Deposit" ? "gold" : "muted"}
              >
                {e.status}
              </Chip>
            </div>
            <div className="grid grid-cols-3 gap-3 text-center mb-4">
              <div className="rounded-lg bg-surface-2 p-3">
                <div className="text-xs text-muted-foreground">{t("Guests", "እንግዶች")}</div>
                <div className="font-display text-xl font-semibold">{e.guests}</div>
              </div>
              <div className="rounded-lg bg-surface-2 p-3">
                <div className="text-xs text-muted-foreground">{t("Value", "ዋጋ")}</div>
                <div className="font-display text-xl font-semibold">
                  {formatETB(e.value).replace("ETB ", "")}
                </div>
              </div>
              <div className="rounded-lg bg-surface-2 p-3">
                <div className="text-xs text-muted-foreground">{t("Deposit", "ቅድመ ክፍያ")}</div>
                <div
                  className={`font-display text-xl font-semibold ${e.deposit > 0 ? "text-teff" : "text-muted-foreground"}`}
                >
                  {formatETB(e.deposit).replace("ETB ", "")}
                </div>
              </div>
            </div>
            {e.menu && e.menu !== "TBD" && (
              <div className="text-xs text-muted-foreground bg-surface-2 rounded-lg px-3 py-2 mb-3 italic">
                "{e.menu}"
              </div>
            )}
            <div className="flex items-center gap-2">
              <button
                onClick={() => setBeo(e)}
                className="flex-1 h-9 rounded-lg border border-border bg-card text-sm hover:bg-surface-2 inline-flex items-center justify-center gap-1.5"
              >
                  <Icons.FileText className="size-4" />
                  {t("Open BEO", "BEO ክፈት")}
              </button>
              {e.status !== "Confirmed" && (
                <button
                  onClick={() => advance(e.id)}
                  className="flex-1 h-9 rounded-lg bg-ember/10 text-ember text-sm font-medium hover:bg-ember/20 transition-colors inline-flex items-center justify-center gap-1.5"
                >
                  <Icons.ArrowRight className="size-4" />
                  {e.status === "Inquiry" ? t("Request deposit", "ቅድመ ክፍያ ይጠይቁ") : t("Confirm", "አረጋግጥ")}
                </button>
              )}
              <button
                onClick={() => cancel(e.id)}
                className="size-9 grid place-items-center rounded-lg border border-border hover:bg-destructive/5 hover:text-destructive transition-colors"
              >
                <Icons.Trash2 className="size-4" />
              </button>
            </div>
          </Card>
        ))}
        {filteredEvents.length === 0 && (
          <div className="col-span-2 text-center text-muted-foreground py-16 text-sm">
            {t("No events", "ዝግጅቶች የሉም")}
          </div>
        )}
      </div>

      <div className="mt-4 flex items-center justify-between gap-3 text-sm">
        <div className="text-muted-foreground">
          Showing {filteredEvents.length === 0 ? 0 : (page - 1) * EVENTS_PAGE_SIZE + 1}-{Math.min(page * EVENTS_PAGE_SIZE, filteredEvents.length)} of {filteredEvents.length}
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => setPage(Math.max(1, page - 1))} disabled={page <= 1} className="h-8 px-3 rounded-lg border border-border bg-card disabled:opacity-50">Prev</button>
          <div className="min-w-[88px] text-center text-muted-foreground">Page {page} / {totalPages}</div>
          <button onClick={() => setPage(Math.min(totalPages, page + 1))} disabled={page >= totalPages} className="h-8 px-3 rounded-lg border border-border bg-card disabled:opacity-50">Next</button>
        </div>
      </div>

      {showAdd && (
        <EventModal
          coordinators={coordinators}
          eventAreas={eventAreas}
          onClose={() => setShowAdd(false)}
          onSave={(e) => {
            setEvents((prev) => upsertEvent(prev, e));
            setShowAdd(false);
            showSuccess(t("Booking created successfully.", "ማስያዣው በትክክል ተፈጥሯል።"));
          }}
        />
      )}
      {beo && (
        <BEOModal
          event={beo}
          coordinators={coordinators}
          eventAreas={eventAreas}
          onClose={() => setBeo(null)}
          onSave={(e) => {
            setEvents((prev) => upsertEvent(prev, e));
            setBeo(null);
            showSuccess(t("Event updated successfully.", "ዝግጅቱ በትክክል ተዘምኗል።"));
          }}
        />
      )}
    </div>
  );
}

function BEOModal({
  event,
  coordinators,
  eventAreas,
  onClose,
  onSave,
}: {
  event: Event;
  coordinators: StaffOption[];
  eventAreas: string[];
  onClose: () => void;
  onSave: (e: Event) => void;
}) {
  const [e, setE] = useState({ ...event });
  const t = useT();
  const areaOptions = useMemo(() => hallSelectionOptions(eventAreas, e.hall), [eventAreas, e.hall]);
  const coordinatorOptions = useMemo(
    () => selectionOptions(coordinators, e.coordinator, e.coordinatorId),
    [coordinators, e.coordinator, e.coordinatorId],
  );
  const coordinatorValue = selectedStaffId(coordinatorOptions, e.coordinator, e.coordinatorId);

  function selectCoordinator(selection: string) {
    const selected = staffFromSelection(coordinatorOptions, selection);
    setE({ ...e, coordinatorId: selected.id || undefined, coordinator: selected.name });
  }

  return (
    <div className="fixed inset-0 z-50 bg-foreground/40 backdrop-blur-sm grid place-items-center p-4">
      <div className="surface-card max-w-lg w-full !p-6 max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between mb-5">
          <div>
            <h3 className="font-display text-xl font-semibold">{t("BEO", "የዝግጅት ዝርዝር")} - {event.name}</h3>
            <div className="text-xs text-muted-foreground">
              {event.date} - {event.hall}
            </div>
          </div>
          <button
            onClick={onClose}
            className="size-8 grid place-items-center rounded-lg hover:bg-surface-2"
          >
            <Icons.X className="size-4" />
          </button>
        </div>
        <div className="grid grid-cols-2 gap-3 mb-4">
          <div>
            <label className="text-xs text-muted-foreground">{t("Event name", "የዝግጅት ስም")}</label>
            <input
              value={e.name}
              onChange={(ev) => setE({ ...e, name: ev.target.value })}
              className="w-full mt-1 h-9 px-3 rounded-lg border border-border bg-card text-sm focus:outline-none focus:ring-2 focus:ring-ring/40"
            />
          </div>
          <div>
            <label className="text-xs text-muted-foreground">{t("Date", "ቀን")}</label>
            <input
              value={e.date}
              onChange={(ev) => setE({ ...e, date: ev.target.value })}
              className="w-full mt-1 h-9 px-3 rounded-lg border border-border bg-card text-sm focus:outline-none focus:ring-2 focus:ring-ring/40"
            />
          </div>
          <div>
            <label className="text-xs text-muted-foreground">{t("Event area", "የዝግጅት ቦታ")}</label>
            <select
              value={e.hall}
              onChange={(ev) => setE({ ...e, hall: ev.target.value })}
              className="w-full mt-1 h-9 px-3 rounded-lg border border-border bg-card text-sm focus:outline-none"
            >
              {areaOptions.map((h) => (
                <option key={h} value={h}>
                  {h}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="text-xs text-muted-foreground">{t("Guests", "እንግዶች")}</label>
            <input
              type="number"
              value={e.guests}
              onChange={(ev) => setE({ ...e, guests: Number(ev.target.value) })}
              className="w-full mt-1 h-9 px-3 rounded-lg border border-border bg-card text-sm font-mono focus:outline-none focus:ring-2 focus:ring-ring/40"
            />
          </div>
          <div>
            <label className="text-xs text-muted-foreground">{t("Total value (ETB)", "ጠቅላላ ዋጋ (ብር)")}</label>
            <input
              type="number"
              value={e.value}
              onChange={(ev) => setE({ ...e, value: Number(ev.target.value) })}
              className="w-full mt-1 h-9 px-3 rounded-lg border border-border bg-card text-sm font-mono focus:outline-none focus:ring-2 focus:ring-ring/40"
            />
          </div>
          <div>
            <label className="text-xs text-muted-foreground">{t("Deposit (ETB)", "ቅድመ ክፍያ (ብር)")}</label>
            <input
              type="number"
              value={e.deposit}
              onChange={(ev) => setE({ ...e, deposit: Number(ev.target.value) })}
              className="w-full mt-1 h-9 px-3 rounded-lg border border-border bg-card text-sm font-mono focus:outline-none focus:ring-2 focus:ring-ring/40"
            />
          </div>
          <div>
            <label className="text-xs text-muted-foreground">{t("Coordinator", "አስተባባሪ")}</label>
            <select
              value={coordinatorValue}
              onChange={(ev) => selectCoordinator(ev.target.value)}
              className="w-full mt-1 h-9 px-3 rounded-lg border border-border bg-card text-sm focus:outline-none"
            >
              <option value="">{t("Unassigned", "ያልተመደበ")}</option>
              {coordinatorOptions.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="text-xs text-muted-foreground">{t("Status", "ሁኔታ")}</label>
            <select
              value={e.status}
              onChange={(ev) => setE({ ...e, status: ev.target.value })}
              className="w-full mt-1 h-9 px-3 rounded-lg border border-border bg-card text-sm focus:outline-none"
            >
              {["Inquiry", "Deposit", "Confirmed", "Completed"].map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </div>
        </div>
        <div className="mb-4">
            <label className="text-xs text-muted-foreground">{t("Menu / Package", "ሜኑ / ፓኬጅ")}</label>
          <textarea
            value={e.menu}
            onChange={(ev) => setE({ ...e, menu: ev.target.value })}
            rows={2}
            className="w-full mt-1 px-3 py-2 rounded-lg border border-border bg-card text-sm focus:outline-none focus:ring-2 focus:ring-ring/40 resize-none"
          />
        </div>
        <div className="mb-5">
          <label className="text-xs text-muted-foreground">{t("Notes", "ማስታወሻዎች")}</label>
          <textarea
            value={e.notes}
            onChange={(ev) => setE({ ...e, notes: ev.target.value })}
            rows={3}
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
            onClick={() => onSave(e)}
            className="flex-1 h-10 rounded-lg bg-ember text-ember-foreground text-sm font-semibold"
          >
            {t("Save BEO", "BEO አስቀምጥ")}
          </button>
        </div>
      </div>
    </div>
  );
}

function EventModal({
  coordinators,
  eventAreas,
  onClose,
  onSave,
}: {
  coordinators: StaffOption[];
  eventAreas: string[];
  onClose: () => void;
  onSave: (e: Event) => void;
}) {
  const defaultCoordinator = coordinators[0];
  const defaultArea = eventAreas[0] ?? SEATING_AREAS[0];
  const t = useT();
  const [form, setForm] = useState<Event>({
    id: `e${Date.now()}`,
    name: "",
    date: "",
    hall: defaultArea,
    guests: 50,
    status: "Inquiry",
    value: 0,
    deposit: 0,
    menu: "",
    coordinator: defaultCoordinator?.name ?? "",
    coordinatorId: defaultCoordinator?.id,
    notes: "",
  });
  const areaOptions = useMemo(
    () => hallSelectionOptions(eventAreas, form.hall),
    [eventAreas, form.hall],
  );
  const canSave = Boolean(
    form.name.trim() && form.date.trim() && form.hall.trim() && form.coordinator.trim(),
  );

  function selectCoordinator(selection: string) {
    const selected = staffFromSelection(coordinators, selection);
    setForm({ ...form, coordinatorId: selected.id || undefined, coordinator: selected.name });
  }

  function submit() {
    if (!canSave) return;
    onSave(form);
  }

  return (
    <div className="fixed inset-0 z-50 bg-foreground/40 backdrop-blur-sm grid place-items-center p-4">
      <div className="surface-card max-w-md w-full !p-6">
        <div className="flex items-center justify-between mb-5">
          <h3 className="font-display text-xl font-semibold">{t("New Booking", "አዲስ ማስያዣ")}</h3>
          <button
            onClick={onClose}
            className="size-8 grid place-items-center rounded-lg hover:bg-surface-2"
          >
            <Icons.X className="size-4" />
          </button>
        </div>
        <div className="grid grid-cols-2 gap-3 mb-5">
          <div className="col-span-2">
            <label className="text-xs text-muted-foreground">{t("Event name", "የዝግጅት ስም")}</label>
            <input
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              className="w-full mt-1 h-9 px-3 rounded-lg border border-border bg-card text-sm focus:outline-none focus:ring-2 focus:ring-ring/40"
            />
          </div>
          <div>
            <label className="text-xs text-muted-foreground">{t("Date", "ቀን")}</label>
            <input
              value={form.date}
              onChange={(e) => setForm({ ...form, date: e.target.value })}
              placeholder={t("e.g. Hidar 20", "ለምሳሌ፣ ህዳር 20")}
              className="w-full mt-1 h-9 px-3 rounded-lg border border-border bg-card text-sm focus:outline-none focus:ring-2 focus:ring-ring/40"
            />
          </div>
          <div>
            <label className="text-xs text-muted-foreground">{t("Event area", "የዝግጅት ቦታ")}</label>
            <select
              value={form.hall}
              onChange={(e) => setForm({ ...form, hall: e.target.value })}
              className="w-full mt-1 h-9 px-3 rounded-lg border border-border bg-card text-sm focus:outline-none"
            >
              {areaOptions.map((h) => (
                <option key={h} value={h}>
                  {h}
                </option>
              ))}
            </select>
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
          <div className="col-span-2">
            <label className="text-xs text-muted-foreground">{t("Coordinator", "አስተባባሪ")}</label>
            <select
              value={form.coordinatorId ?? ""}
              onChange={(e) => selectCoordinator(e.target.value)}
              className="w-full mt-1 h-9 px-3 rounded-lg border border-border bg-card text-sm focus:outline-none"
            >
              {coordinators.map((coordinator) => (
                <option key={coordinator.id} value={coordinator.id}>
                  {coordinator.name}
                </option>
              ))}
            </select>
          </div>
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
            {t("Create", "ፍጠር")}
          </button>
        </div>
      </div>
    </div>
  );
}
