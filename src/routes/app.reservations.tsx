import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import * as Icons from "lucide-react";
import { DateRangePicker } from "@/components/date-range/date-range-picker";
import { RealtimeBadge } from "@/components/realtime-badge";
import { PageHeader, Card, Chip, Stat } from "@/components/ui-kit";
import type { Reservation, Table } from "@/lib/demo-data";
import { formatETB } from "@/lib/ethiopic";
import { defaultDateRangeValue, formatHmString } from "@/lib/date-time";
import { useT } from "@/lib/i18n";
import { loadSystemSettings } from "@/lib/system-settings";
import { useStore } from "@/lib/store";

export const Route = createFileRoute("/app/reservations")({ component: Reservations });

function reservationStatusLabel(status: Reservation["status"], t: ReturnType<typeof useT>) {
  if (status === "Confirmed") return t("Confirmed", "ተረጋግጧል");
  if (status === "Deposit pending") return t("Deposit pending", "ቅድመ ክፍያ ተጠባባቂ");
  return t("Cancelled", "ተሰርዟል");
}

function Reservations() {
  const t = useT();
  const store = useStore();
  const reservations = store.reservations;
  const tables = store.tables;
  const [showAdd, setShowAdd] = useState(false);
  const [selected, setSelected] = useState<Reservation | null>(null);
  const [smsSent, setSmsSent] = useState<string | null>(null);
  const [dateRange, setDateRange] = useState(defaultDateRangeValue);
  const datePrefs = loadSystemSettings().calendar;

  const depositsTotal = reservations.reduce((s, r) => s + r.deposit, 0);
  const confirmed = reservations.filter((r) => r.status === "Confirmed").length;
  const coversBooked = reservations.reduce((s, r) => s + r.party, 0);

  function sendSms(r: Reservation) {
    setSmsSent(r.id);
    setTimeout(() => setSmsSent(null), 2500);
  }

  function cancel(id: string) {
    store.removeReservation(id);
  }

  function confirm(id: string) {
    store.confirmReservation(id);
  }

  return (
    <div>
      <PageHeader
        title={t("Reservations", "ቦታ ማስያዝ")}
        subtitle={`${reservations.length} ${t("bookings", "ቦታ ማስያዞች")} · ${confirmed} ${t("confirmed", "ተረጋግጧል")} · ${coversBooked} ${t("covers", "እንግዶች")}`}
        action={
          <div className="flex flex-wrap items-center gap-2">
            <DateRangePicker value={dateRange} onChange={setDateRange} preferences={datePrefs} compact />
            <RealtimeBadge status={store.realtimeStatus} lastSyncAt={store.lastRealtimeSyncAt} />
            <Link
              to="/app/tables"
              className="h-10 px-3 rounded-lg border border-border bg-card text-sm hover:bg-surface-2 inline-flex items-center gap-2"
            >
              <Icons.LayoutGrid className="size-4" /> {t("Tables", "ጠረጴዛዎች")}
            </Link>
            <button
              onClick={() => setShowAdd(true)}
              className="h-10 px-4 rounded-lg bg-ember text-ember-foreground text-sm font-medium inline-flex items-center gap-2"
            >
              <Icons.Plus className="size-4" />
              {t("New reservation", "አዲስ ቦታ ማስያዝ")}
            </button>
          </div>
        }
      />
      <div className="grid grid-cols-2 md:grid-cols-3 gap-3 mb-6">
        <Stat label={t("Bookings", "ቦታ ማስያዞች")} value={`${reservations.length}`} icon="CalendarClock" />
        <Stat label={t("Confirmed", "ተረጋግጧል")} value={`${confirmed}`} tone="teff" icon="CheckCircle2" />
        <Stat label={t("Covers booked", "እንግዶች")} value={`${coversBooked}`} icon="Users" />
      </div>
      <div className="grid lg:grid-cols-[1fr_320px] gap-6">
        <div className="space-y-3">
          {reservations.map((r) => (
            <Card key={r.id} className="!p-4 flex items-center gap-4">
              <div className="size-14 rounded-xl bg-surface-2 grid place-items-center text-center shrink-0">
                <div className="font-display text-lg font-semibold leading-none">{formatHmString(r.time, datePrefs)}</div>
              </div>
              <div className="flex-1 min-w-0">
                <div className="font-display font-semibold">{r.name}</div>
                <div className="text-xs text-muted-foreground">
                  {r.phone} · {r.party} {t("guests", "እንግዶች")} · {r.table}
                </div>
                {r.deposit > 0 && (
                  <div className="text-xs font-mono text-teff mt-0.5">
                    {t("Deposit", "ቅድመ ክፍያ")} {formatETB(r.deposit)}
                  </div>
                )}
              </div>
              <div className="shrink-0">
                <Chip
                  tone={
                    r.status === "Confirmed" ? "teff" : r.status === "Deposit pending" ? "gold" : "muted"
                  }
                >
                  {reservationStatusLabel(r.status, t)}
                </Chip>
              </div>
              <div className="flex items-center gap-1 shrink-0">
                {r.status === "Deposit pending" && (
                  <button
                    onClick={() => confirm(r.id)}
                    className="h-8 px-2 rounded-lg bg-teff/10 text-teff text-xs font-medium hover:bg-teff/20 transition-colors"
                  >
                    {t("Confirm", "አረጋግጥ")}
                  </button>
                )}
                <button
                  onClick={() => sendSms(r)}
                  title={t("Send SMS confirmation", "የኤስኤምኤስ ማረጋገጫ ላክ")}
                  className={`size-9 grid place-items-center rounded-lg border transition-colors ${smsSent === r.id ? "border-teff/40 bg-teff/10 text-teff" : "border-border hover:bg-surface-2"}`}
                >
                  {smsSent === r.id ? <Icons.Check className="size-4" /> : <Icons.MessageSquare className="size-4" />}
                </button>
                <button
                  onClick={() => setSelected(r)}
                  className="size-9 grid place-items-center rounded-lg border border-border hover:bg-surface-2"
                >
                  <Icons.Pencil className="size-4" />
                </button>
                <button
                  onClick={() => cancel(r.id)}
                  className="size-9 grid place-items-center rounded-lg border border-border hover:bg-destructive/5 hover:text-destructive hover:border-destructive/30 transition-colors"
                >
                  <Icons.Trash2 className="size-4" />
                </button>
              </div>
            </Card>
          ))}
          {reservations.length === 0 && (
            <div className="text-center py-16 text-muted-foreground text-sm">
              {t("No reservations today", "ዛሬ ቦታ ማስያዝ የለም")}
            </div>
          )}
        </div>

        <Card>
          <h3 className="font-display font-semibold mb-3">{t("Tonight's outlook", "የዛሬ ማታ እይታ")}</h3>
          <ul className="space-y-2.5 text-sm">
            <li className="flex justify-between">
              <span className="text-muted-foreground">{t("Covers booked", "የተያዙ መቀመጫዎች")}</span>
              <span className="font-semibold">{coversBooked}</span>
            </li>
            <li className="flex justify-between">
              <span className="text-muted-foreground">{t("Confirmed", "ተረጋግጧል")}</span>
              <span className="font-semibold text-teff">{confirmed}</span>
            </li>
            <li className="flex justify-between">
              <span className="text-muted-foreground">{t("Deposits collected", "የተሰበሰበ ቅድመ ክፍያ")}</span>
              <span className="font-mono">{formatETB(depositsTotal)}</span>
            </li>
            <li className="flex justify-between">
              <span className="text-muted-foreground">{t("Deposit pending", "ቅድመ ክፍያ ተጠባባቂ")}</span>
              <span className="font-semibold text-gold-foreground">
                {reservations.filter((r) => r.status === "Deposit pending").length}
              </span>
            </li>
          </ul>
          <div className="mt-5 rounded-xl bg-gradient-to-br from-ember/10 to-teff/10 p-4">
            <div className="text-xs uppercase tracking-wider text-muted-foreground">
              {t("Suggestion", "ምክር")}
            </div>
            <div className="text-sm mt-1">
              {reservations.filter((item) => item.status === "Deposit pending").length > 0
                ? t(
                    `Follow up on ${reservations.filter((item) => item.status === "Deposit pending").length} pending deposit(s).`,
                    `ተጠባባቂ ቅድመ ክፍያዎችን ${reservations.filter((item) => item.status === "Deposit pending").length} ያከታትሉ።`,
                  )
                : t("All deposits collected â€” great work!", "ሁሉም ቅድመ ክፍያዎች ተሰብስበዋል — ጥሩ ስራ!")}
            </div>
          </div>
        </Card>
      </div>

      {showAdd && (
        <ReservationModal
          onClose={() => setShowAdd(false)}
          tables={tables}
          onSave={(r) => {
            store.addReservation(r);
            setShowAdd(false);
          }}
        />
      )}
      {selected && (
        <ReservationModal
          existing={selected}
          onClose={() => setSelected(null)}
          tables={tables}
          onSave={(r) => {
            store.updateReservation(r);
            setSelected(null);
          }}
        />
      )}
    </div>
  );
}

function ReservationModal({
  existing,
  tables,
  onClose,
  onSave,
}: {
  existing?: Reservation;
  tables: Table[];
  onClose: () => void;
  onSave: (r: Reservation) => void;
}) {
  const t = useT();
  const [form, setForm] = useState<Reservation>(
    existing ?? {
      id: `r${Date.now()}`,
      name: "",
      phone: "",
      time: "19:00",
      party: 2,
      table: tables[0]?.label ?? "",
      deposit: 0,
      status: "Confirmed",
    },
  );

  const textFields: Array<{ label: string; key: "name" | "phone"; type: string }> = [
    { label: t("Guest name", "የእንግዳ ስም"), key: "name", type: "text" },
    { label: t("Phone", "ስልክ"), key: "phone", type: "text" },
  ];

  function submit() {
    if (!form.name || !form.phone) return;
    onSave(form);
  }

  return (
    <div className="fixed inset-0 z-50 bg-foreground/40 backdrop-blur-sm grid place-items-center p-4">
      <div className="surface-card max-w-md w-full !p-6">
        <div className="flex items-center justify-between mb-5">
          <h3 className="font-display text-xl font-semibold">
            {existing ? t("Edit Reservation", "ቦታ ማስያዝ አስተካክል") : t("New Reservation", "አዲስ ቦታ ማስያዝ")}
          </h3>
          <button onClick={onClose} className="size-8 grid place-items-center rounded-lg hover:bg-surface-2">
            <Icons.X className="size-4" />
          </button>
        </div>
        <div className="grid grid-cols-2 gap-3 mb-5">
          {textFields.map(({ label, key, type }) => (
            <div key={key} className="col-span-2 sm:col-span-1">
              <label className="text-xs text-muted-foreground">{label}</label>
              <input
                type={type}
                value={form[key]}
                onChange={(e) => setForm({ ...form, [key]: e.target.value })}
                className="w-full mt-1 h-9 px-3 rounded-lg border border-border bg-card text-sm focus:outline-none focus:ring-2 focus:ring-ring/40"
              />
            </div>
          ))}
          <div>
            <label className="text-xs text-muted-foreground">{t("Time", "ሰዓት")}</label>
            <input
              type="time"
              value={form.time}
              onChange={(e) => setForm({ ...form, time: e.target.value })}
              className="w-full mt-1 h-9 px-3 rounded-lg border border-border bg-card text-sm focus:outline-none focus:ring-2 focus:ring-ring/40"
            />
          </div>
          <div>
            <label className="text-xs text-muted-foreground">{t("Party size", "የእንግዶች ብዛት")}</label>
            <input
              type="number"
              min={1}
              value={form.party}
              onChange={(e) => setForm({ ...form, party: Number(e.target.value) })}
              className="w-full mt-1 h-9 px-3 rounded-lg border border-border bg-card text-sm focus:outline-none focus:ring-2 focus:ring-ring/40"
            />
          </div>
          <div>
            <label className="text-xs text-muted-foreground">{t("Table", "ጠረጴዛ")}</label>
            <select
              value={form.table}
              onChange={(e) => setForm({ ...form, table: e.target.value })}
              className="w-full mt-1 h-9 px-3 rounded-lg border border-border bg-card text-sm focus:outline-none"
            >
              {tables.length > 0 ? (
                tables.map((table) => (
                  <option key={table.id} value={table.label}>
                    {table.label} ({table.area})
                  </option>
                ))
              ) : (
                <option value="">{t("No tables", "ጠረጴዛ የለም")}</option>
              )}
            </select>
          </div>
          <div>
            <label className="text-xs text-muted-foreground">{t("Deposit (ETB)", "ቅድመ ክፍያ (ብር)")}</label>
            <input
              type="number"
              min={0}
              value={form.deposit}
              onChange={(e) => setForm({ ...form, deposit: Number(e.target.value) })}
              className="w-full mt-1 h-9 px-3 rounded-lg border border-border bg-card text-sm font-mono focus:outline-none focus:ring-2 focus:ring-ring/40"
            />
          </div>
          <div className="col-span-2">
            <label className="text-xs text-muted-foreground">{t("Status", "ሁኔታ")}</label>
            <select
              value={form.status}
              onChange={(e) => setForm({ ...form, status: e.target.value })}
              className="w-full mt-1 h-9 px-3 rounded-lg border border-border bg-card text-sm focus:outline-none"
            >
              {["Confirmed", "Deposit pending", "Cancelled"].map((status) => (
                <option key={status} value={status}>
                  {reservationStatusLabel(status as Reservation["status"], t)}
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
            className="flex-1 h-10 rounded-lg bg-ember text-ember-foreground text-sm font-semibold"
          >
            {t("Save", "አስቀምጥ")}
          </button>
        </div>
      </div>
    </div>
  );
}
