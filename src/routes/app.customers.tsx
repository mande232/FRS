import { createFileRoute } from "@tanstack/react-router";
import * as Icons from "lucide-react";
import { useState } from "react";
import { DateRangePicker } from "@/components/date-range/date-range-picker";
import { RealtimeBadge } from "@/components/realtime-badge";
import { PageHeader, Card, Chip, Stat } from "@/components/ui-kit";
import type { Customer } from "@/lib/demo-data";
import { formatETB } from "@/lib/ethiopic";
import { defaultDateRangeValue } from "@/lib/date-time";
import { useT } from "@/lib/i18n";
import { useLang } from "@/lib/lang-context";
import { loadSystemSettings } from "@/lib/system-settings";
import { useStore } from "@/lib/store";

export const Route = createFileRoute("/app/customers")({ component: Customers });

const TIER_TONE = { Platinum: "ember", Gold: "gold", Silver: "muted", Bronze: "muted" } as const;
const TIER_POINTS = { Bronze: 500, Silver: 1000, Gold: 5000, Platinum: Infinity };
const TIERS = ["Bronze", "Silver", "Gold", "Platinum"] as const;

function nextTier(tier: string) {
  const idx = TIERS.indexOf(tier as typeof TIERS[number]);
  return idx < TIERS.length - 1 ? TIERS[idx + 1] : null;
}

function Customers() {
  const t = useT();
  const lang = useLang();
  const store = useStore();
  const customers = store.customers;
  const setCustomers = store.setCustomers;
  const [selected, setSelected] = useState<Customer | null>(null);
  const [showAdd, setShowAdd] = useState(false);
  const [showCampaign, setShowCampaign] = useState(false);
  const [search, setSearch] = useState("");
  const [filterTier, setFilterTier] = useState("All");
  const [dateRange, setDateRange] = useState(defaultDateRangeValue);
  const datePrefs = loadSystemSettings().calendar;

  const filtered = customers.filter((c) => {
    const query = search.toLowerCase();
    const matchSearch =
      c.name.toLowerCase().includes(query) ||
      c.phone.includes(search) ||
      (c.email ?? "").toLowerCase().includes(query);
    const matchTier = filterTier === "All" || c.tier === filterTier;
    return matchSearch && matchTier;
  });

  return (
    <div>
      <PageHeader
        title={t("Customers & Loyalty", "ደንበኞች እና ታማኝነት")}
        action={
          <div className="flex flex-wrap items-center gap-2">
            <DateRangePicker value={dateRange} onChange={setDateRange} preferences={datePrefs} compact />
            <RealtimeBadge status={store.realtimeStatus} lastSyncAt={store.lastRealtimeSyncAt} />
            <button onClick={() => setShowAdd(true)} className="h-10 px-4 rounded-lg border border-border bg-card text-sm font-medium inline-flex items-center gap-2 hover:bg-surface-2">
              <Icons.UserPlus className="size-4" />{t("Add customer", "ደንበኛ ጨምር")}
            </button>
            <button onClick={() => setShowCampaign(true)} className="h-10 px-4 rounded-lg bg-ember text-ember-foreground text-sm font-medium inline-flex items-center gap-2">
              <Icons.Send className="size-4" />{t("Send campaign", "ዘመቻ ላክ")}
            </button>
          </div>
        }
      />

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
        {TIERS.map((tier) => {
          const count = customers.filter((c) => c.tier === tier).length;
          return (
            <Stat key={tier} label={tier} value={`${count}`} tone={tier === "Platinum" || tier === "Gold" ? "gold" : "muted"} />
          );
        })}
      </div>

      {/* Filters */}
      <div className="flex items-center gap-3 mb-5 flex-wrap">
        <div className="relative flex-1 min-w-48">
          <Icons.Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder={t("Search name or phone…", "ስም ወይም ስልክ ፈልግ…")} className="w-full h-10 pl-9 pr-3 rounded-lg border border-border bg-card text-sm focus:outline-none focus:ring-2 focus:ring-ring/40" />
        </div>
        {["All", ...TIERS].map((tier) => (
          <button key={tier} onClick={() => setFilterTier(tier)} className={`h-9 px-4 rounded-full text-sm font-medium transition-colors ${filterTier === tier ? "bg-foreground text-background" : "bg-card border border-border text-muted-foreground hover:text-foreground"}`}>{tier}</button>
        ))}
      </div>

      <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {filtered.map((c) => {
          const next = nextTier(c.tier);
          const nextPoints = next ? TIER_POINTS[next as keyof typeof TIER_POINTS] : null;
          const progress = nextPoints ? Math.min((c.points / nextPoints) * 100, 100) : 100;
          return (
            <div key={c.id} className="surface-card !p-5 cursor-pointer hover:shadow-[var(--shadow-lift)] transition-all hover:-translate-y-0.5 rounded-2xl" onClick={() => setSelected(c)}>
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-center gap-3">
                  <div className="size-12 rounded-full bg-gradient-to-br from-ember to-teff grid place-items-center text-ember-foreground font-display font-semibold">
                    {c.name.split(" ").map((n) => n[0]).join("").slice(0, 2)}
                  </div>
                    <div>
                      <div className="font-display font-semibold">{c.name}</div>
                      <div className="text-xs text-muted-foreground font-mono">{c.phone}</div>
                      {c.email ? <div className="text-xs text-muted-foreground">{c.email}</div> : null}
                    </div>
                </div>
                <Chip tone={TIER_TONE[c.tier as keyof typeof TIER_TONE]}>{c.tier}</Chip>
              </div>
              <div className="grid grid-cols-3 gap-3 mt-4 text-center">
                <div>
                  <div className="text-xs text-muted-foreground">{t("Visits", "ጉብኝቶች")}</div>
                  <div className="font-display text-lg font-semibold">{c.visits}</div>
                </div>
                <div>
                  <div className="text-xs text-muted-foreground">{t("Spent", "ወጪ")}</div>
                  <div className="font-display text-lg font-semibold">{formatETB(c.spent).replace("ETB ", "")}</div>
                </div>
                <div>
                  <div className="text-xs text-muted-foreground">{t("Points", "ነጥቦች")}</div>
                  <div className="font-display text-lg font-semibold">{c.points}</div>
                </div>
              </div>
              {next && (
                <div className="mt-3">
                  <div className="flex justify-between text-xs text-muted-foreground mb-1">
                    <span>{t("Progress to", "ወደ")} {next}</span>
                    <span>{c.points}/{nextPoints}</span>
                  </div>
                  <div className="h-1.5 rounded-full bg-surface-2 overflow-hidden">
                    <div className="h-full bg-ember rounded-full transition-all" style={{ width: `${progress}%` }} />
                  </div>
                </div>
              )}
              <div className="mt-2 text-xs text-muted-foreground">{t("Last visit:", "የመጨረሻ ጉብኝት:")} {c.lastVisit}</div>
            </div>
          );
        })}
      </div>

      {selected && <CustomerModal customer={selected} onClose={() => setSelected(null)} onSave={(updated) => { setCustomers((cs) => cs.map((c) => c.id === updated.id ? updated : c)); setSelected(null); }} lang={lang} />}
      {showAdd && <AddCustomerModal onClose={() => setShowAdd(false)} onSave={(c) => { setCustomers((cs) => [...cs, c]); setShowAdd(false); }} lang={lang} />}
      {showCampaign && <CampaignModal customers={filtered} onClose={() => setShowCampaign(false)} lang={lang} />}
    </div>
  );
}

function CustomerModal({ customer, onClose, onSave, lang }: { customer: Customer; onClose: () => void; onSave: (c: Customer) => void; lang: "en" | "am" }) {
  const [c, setC] = useState(customer);
  const t = (en: string, am: string) => lang === "am" ? am : en;
  return (
    <div className="fixed inset-0 z-50 bg-foreground/40 backdrop-blur-sm grid place-items-center p-4">
      <div className="surface-card max-w-lg w-full !p-6 max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between mb-5">
          <h3 className="font-display text-xl font-semibold">{c.name}</h3>
          <button onClick={onClose} className="size-8 grid place-items-center rounded-lg hover:bg-surface-2"><Icons.X className="size-4" /></button>
        </div>
        <div className="grid grid-cols-2 gap-4 mb-4">
          <div>
            <label className="text-xs text-muted-foreground">{t("Name", "ስም")}</label>
            <input value={c.name} onChange={(e) => setC({ ...c, name: e.target.value })} className="w-full mt-1 h-9 px-3 rounded-lg border border-border bg-card text-sm focus:outline-none focus:ring-2 focus:ring-ring/40" />
          </div>
          <div>
            <label className="text-xs text-muted-foreground">{t("Phone", "ስልክ")}</label>
            <input value={c.phone} onChange={(e) => setC({ ...c, phone: e.target.value })} className="w-full mt-1 h-9 px-3 rounded-lg border border-border bg-card text-sm focus:outline-none focus:ring-2 focus:ring-ring/40" />
          </div>
          <div>
            <label className="text-xs text-muted-foreground">{t("Email", "ኢሜይል")}</label>
            <input type="email" value={c.email ?? ""} onChange={(e) => setC({ ...c, email: e.target.value })} className="w-full mt-1 h-9 px-3 rounded-lg border border-border bg-card text-sm focus:outline-none focus:ring-2 focus:ring-ring/40" />
          </div>
          <div>
            <label className="text-xs text-muted-foreground">{t("Tier", "ደረጃ")}</label>
            <select value={c.tier} onChange={(e) => setC({ ...c, tier: e.target.value })} className="w-full mt-1 h-9 px-3 rounded-lg border border-border bg-card text-sm focus:outline-none">
              {TIERS.map((tier) => <option key={tier}>{tier}</option>)}
            </select>
          </div>
          <div>
            <label className="text-xs text-muted-foreground">{t("Loyalty Points", "ታማኝነት ነጥቦች")}</label>
            <input type="number" value={c.points} onChange={(e) => setC({ ...c, points: Number(e.target.value) })} className="w-full mt-1 h-9 px-3 rounded-lg border border-border bg-card text-sm focus:outline-none focus:ring-2 focus:ring-ring/40" />
          </div>
        </div>
        <div className="mb-4">
          <label className="text-xs text-muted-foreground">{t("Feedback", "አስተያየት")}</label>
          <textarea value={c.feedback} onChange={(e) => setC({ ...c, feedback: e.target.value })} rows={3} className="w-full mt-1 px-3 py-2 rounded-lg border border-border bg-card text-sm focus:outline-none focus:ring-2 focus:ring-ring/40 resize-none" />
        </div>
        <div className="grid grid-cols-3 gap-3 mb-5 text-center text-sm bg-surface-2 rounded-xl p-3">
          <div><div className="text-muted-foreground text-xs">{t("Visits", "ጉብኝቶች")}</div><div className="font-semibold">{c.visits}</div></div>
          <div><div className="text-muted-foreground text-xs">{t("Spent", "ወጪ")}</div><div className="font-semibold">{formatETB(c.spent)}</div></div>
          <div><div className="text-muted-foreground text-xs">{t("Last visit", "ያለፈ ጉብኝት")}</div><div className="font-semibold">{c.lastVisit}</div></div>
        </div>
        {c.feedback && (
          <div className="mb-4 p-3 rounded-lg bg-teff/5 border border-teff/20 text-sm italic text-muted-foreground">
            "{c.feedback}"
          </div>
        )}
        <div className="flex gap-2">
          <button onClick={onClose} className="flex-1 h-10 rounded-lg border border-border bg-card text-sm hover:bg-surface-2">{t("Cancel", "ሰርዝ")}</button>
          <button onClick={() => onSave(c)} className="flex-1 h-10 rounded-lg bg-ember text-ember-foreground text-sm font-semibold">{t("Save changes", "ለውጦችን አስቀምጥ")}</button>
        </div>
      </div>
    </div>
  );
}

function AddCustomerModal({ onClose, onSave, lang }: { onClose: () => void; onSave: (c: Customer) => void; lang: "en" | "am" }) {
  const t = (en: string, am: string) => lang === "am" ? am : en;
  const [form, setForm] = useState({ name: "", phone: "", email: "", tier: "Bronze" });
  function submit() {
    if (!form.name || !form.phone) return;
    onSave({ id: `c${Date.now()}`, name: form.name, phone: form.phone, email: form.email.trim(), visits: 0, spent: 0, tier: form.tier, lastVisit: "Today", points: 0, feedback: "" });
  }
  return (
    <div className="fixed inset-0 z-50 bg-foreground/40 backdrop-blur-sm grid place-items-center p-4">
      <div className="surface-card max-w-md w-full !p-6">
        <div className="flex items-center justify-between mb-5">
          <h3 className="font-display text-xl font-semibold">{t("Add Customer", "ደንበኛ ጨምር")}</h3>
          <button onClick={onClose} className="size-8 grid place-items-center rounded-lg hover:bg-surface-2"><Icons.X className="size-4" /></button>
        </div>
        <div className="space-y-3 mb-5">
          <div>
            <label className="text-xs text-muted-foreground">{t("Full Name", "ሙሉ ስም")}</label>
            <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className="w-full mt-1 h-9 px-3 rounded-lg border border-border bg-card text-sm focus:outline-none focus:ring-2 focus:ring-ring/40" />
          </div>
          <div>
            <label className="text-xs text-muted-foreground">{t("Phone", "ስልክ")}</label>
            <input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} className="w-full mt-1 h-9 px-3 rounded-lg border border-border bg-card text-sm focus:outline-none focus:ring-2 focus:ring-ring/40" />
          </div>
          <div>
            <label className="text-xs text-muted-foreground">{t("Email address", "ኢሜይል አድራሻ")}</label>
            <input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} placeholder={t("For campaigns and promotions", "ለዘመቻ እና ማስታወቂያ")}
              className="w-full mt-1 h-9 px-3 rounded-lg border border-border bg-card text-sm focus:outline-none focus:ring-2 focus:ring-ring/40" />
          </div>
          <div>
            <label className="text-xs text-muted-foreground">{t("Starting Tier", "የጀማሪ ደረጃ")}</label>
            <select value={form.tier} onChange={(e) => setForm({ ...form, tier: e.target.value })} className="w-full mt-1 h-9 px-3 rounded-lg border border-border bg-card text-sm focus:outline-none">
              {TIERS.map((tier) => <option key={tier}>{tier}</option>)}
            </select>
          </div>
        </div>
        <div className="flex gap-2">
          <button onClick={onClose} className="flex-1 h-10 rounded-lg border border-border bg-card text-sm hover:bg-surface-2">{t("Cancel", "ሰርዝ")}</button>
          <button onClick={submit} className="flex-1 h-10 rounded-lg bg-ember text-ember-foreground text-sm font-semibold">{t("Add", "ጨምር")}</button>
        </div>
      </div>
    </div>
  );
}

type SendStatus = "idle" | "sending" | "sent" | "skipped";

function interpolate(template: string, customer: Customer) {
  return template
    .replace(/\{\{name\}\}/g, customer.name)
    .replace(/\{\{points\}\}/g, String(customer.points))
    .replace(/\{\{tier\}\}/g, customer.tier)
    .replace(/\{\{email\}\}/g, customer.email ?? "");
}

function CampaignModal({ customers, onClose, lang }: { customers: Customer[]; onClose: () => void; lang: "en" | "am" }) {
  const t = (en: string, am: string) => lang === "am" ? am : en;
  const [tierFilter, setTierFilter] = useState("All");
  const [subject, setSubject] = useState(t("A special message from us 🎉", "ከኛ ልዩ መልዕክት 🎉"));
  const [body, setBody] = useState(
    t(
      `Dear {{name}},\n\nThank you for being a valued ${"{{tier}}"}  member!\n\nYou currently have {{points}} loyalty points. Visit us soon to redeem them for exclusive rewards.\n\nWe look forward to seeing you again!\n\nWarm regards,\nEthioPlate Team`,
      `ውድ {{name}},\n\nየ{{tier}} አባል ሆነው ስለቆዩ እናመሰግናለን!\n\nአሁን {{points}} የታማኝነት ነጥቦች አሎት። ልዩ ሽልማቶችን ለማግኘት ቶሎ ይጎብኙን።\n\nእንደገና ለማየት እንጓጓለን!\n\nሞቅ ያለ ሰላምታ,\nEthioPlate ቡድን`
    )
  );
  const [previewCustomer, setPreviewCustomer] = useState<Customer | null>(null);
  const [statuses, setStatuses] = useState<Record<string, SendStatus>>({});
  const [sending, setSending] = useState(false);
  const [done, setDone] = useState(false);

  const recipients = customers.filter((c) => {
    const hasEmail = Boolean(c.email?.trim());
    const matchTier = tierFilter === "All" || c.tier === tierFilter;
    return hasEmail && matchTier;
  });

  const skipped = customers.filter((c) => {
    const noEmail = !c.email?.trim();
    const matchTier = tierFilter === "All" || c.tier === tierFilter;
    return noEmail && matchTier;
  });

  const preview = previewCustomer ?? recipients[0] ?? null;

  async function sendCampaign() {
    if (!subject.trim() || !body.trim() || recipients.length === 0) return;
    setSending(true);
    const initial: Record<string, SendStatus> = {};
    for (const c of recipients) initial[c.id] = "idle";
    for (const c of skipped) initial[c.id] = "skipped";
    setStatuses(initial);

    for (const c of recipients) {
      setStatuses((prev) => ({ ...prev, [c.id]: "sending" }));
      await new Promise((resolve) => setTimeout(resolve, 120));
      const payload = {
        to: c.email,
        subject: interpolate(subject, c),
        body: interpolate(body, c),
        customer: { id: c.id, name: c.name, tier: c.tier, points: c.points },
      };
      console.log("[Campaign] Sending email:", payload);
      setStatuses((prev) => ({ ...prev, [c.id]: "sent" }));
    }
    setSending(false);
    setDone(true);
  }

  const sentCount = Object.values(statuses).filter((s) => s === "sent").length;

  return (
    <div className="fixed inset-0 z-50 bg-foreground/40 backdrop-blur-sm grid place-items-center p-4 overflow-y-auto">
      <div className="surface-card max-w-3xl w-full !p-6 my-4">
        <div className="flex items-center justify-between mb-5">
          <div>
            <h3 className="font-display text-xl font-semibold">{t("Send Email Campaign", "የኢሜይል ዘመቻ ላክ")}</h3>
          </div>
          <button onClick={onClose} className="size-8 grid place-items-center rounded-lg hover:bg-surface-2"><Icons.X className="size-4" /></button>
        </div>

        <div className="grid lg:grid-cols-2 gap-5">
          {/* Left: compose */}
          <div className="space-y-3">
            <div>
              <label className="text-xs text-muted-foreground">{t("Filter recipients by tier", "ተቀባዮችን በደረጃ አጣራ")}</label>
              <div className="flex gap-2 mt-1 flex-wrap">
                {["All", ...TIERS].map((tier) => (
                  <button
                    key={tier}
                    onClick={() => setTierFilter(tier)}
                    className={`h-8 px-3 rounded-full text-xs font-medium transition-colors ${
                      tierFilter === tier ? "bg-foreground text-background" : "bg-card border border-border text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    {tier}
                  </button>
                ))}
              </div>
            </div>

            <div className="flex gap-3 rounded-lg bg-surface-2 p-3 text-sm">
              <div className="flex-1 text-center">
                <div className="text-xs text-muted-foreground">{t("Will receive", "ይቀበላሉ")}</div>
                <div className="font-display text-lg font-semibold text-teff">{recipients.length}</div>
              </div>
              <div className="w-px bg-border" />
              <div className="flex-1 text-center">
                <div className="text-xs text-muted-foreground">{t("No email", "ኢሜይል የለም")}</div>
                <div className="font-display text-lg font-semibold text-muted-foreground">{skipped.length}</div>
              </div>
            </div>

            <div>
              <label className="text-xs text-muted-foreground">{t("Subject", "ርዕስ")}</label>
              <input
                value={subject}
                onChange={(e) => setSubject(e.target.value)}
                disabled={sending || done}
                className="w-full mt-1 h-9 px-3 rounded-lg border border-border bg-card text-sm focus:outline-none focus:ring-2 focus:ring-ring/40 disabled:opacity-60"
              />
            </div>

            <div>
              <label className="text-xs text-muted-foreground">{t("Message body", "የመልዕክት ይዘት")}</label>
              <textarea
                value={body}
                onChange={(e) => setBody(e.target.value)}
                disabled={sending || done}
                rows={9}
                className="w-full mt-1 px-3 py-2 rounded-lg border border-border bg-card text-sm focus:outline-none focus:ring-2 focus:ring-ring/40 resize-none disabled:opacity-60 font-mono"
              />
            </div>

            {done ? (
              <div className="h-10 rounded-lg bg-teff/10 text-teff text-sm font-medium flex items-center justify-center gap-2">
                <Icons.CheckCircle2 className="size-4" />
                {t(`Sent to ${sentCount} recipient${sentCount === 1 ? "" : "s"}.`, `ለ${sentCount} ተቀባዮች ተልኳል።`)}
              </div>
            ) : (
              <button
                onClick={sendCampaign}
                disabled={sending || recipients.length === 0 || !subject.trim() || !body.trim()}
                className="w-full h-10 rounded-lg bg-ember text-ember-foreground text-sm font-semibold inline-flex items-center justify-center gap-2 disabled:opacity-40"
              >
                {sending ? <Icons.Loader2 className="size-4 animate-spin" /> : <Icons.Send className="size-4" />}
                {sending
                  ? t(`Sending… ${sentCount}/${recipients.length}`, `እየተላከ… ${sentCount}/${recipients.length}`)
                  : t(`Send to ${recipients.length} recipient${recipients.length === 1 ? "" : "s"}`, `ለ${recipients.length} ተቀባዮች ላክ`)}
              </button>
            )}
          </div>

          {/* Right: preview + recipient list */}
          <div className="space-y-3">
            {preview && (
              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="text-xs text-muted-foreground">{t("Email preview", "የኢሜይል ቅድመ እይታ")}</label>
                  <select
                    value={previewCustomer?.id ?? ""}
                    onChange={(e) => setPreviewCustomer(recipients.find((c) => c.id === e.target.value) ?? null)}
                    className="h-7 px-2 rounded-lg border border-border bg-card text-xs focus:outline-none"
                  >
                    {recipients.map((c) => (
                      <option key={c.id} value={c.id}>{c.name}</option>
                    ))}
                  </select>
                </div>
                <div className="rounded-lg border border-border bg-surface-2 p-3 text-xs space-y-1">
                  <div className="flex gap-2">
                    <span className="text-muted-foreground w-12 shrink-0">{t("To:", "ወደ:")}</span>
                    <span className="font-mono">{preview.email}</span>
                  </div>
                  <div className="flex gap-2">
                    <span className="text-muted-foreground w-12 shrink-0">{t("Points:", "ነጥቦች:")}</span>
                    <span className="font-semibold">{preview.points} pts · {preview.tier}</span>
                  </div>
                  <div className="flex gap-2">
                    <span className="text-muted-foreground w-12 shrink-0">{t("Subject:", "ርዕስ:")}</span>
                    <span className="font-medium">{interpolate(subject, preview)}</span>
                  </div>
                  <div className="mt-2 pt-2 border-t border-border whitespace-pre-wrap leading-relaxed">
                    {interpolate(body, preview)}
                  </div>
                </div>
              </div>
            )}

            <div>
              <label className="text-xs text-muted-foreground mb-1 block">
                {t("Recipients", "ተቀባዮች")} ({recipients.length})
              </label>
              <div className="rounded-lg border border-border overflow-hidden max-h-52 overflow-y-auto">
                {recipients.length === 0 && (
                  <div className="px-3 py-6 text-center text-xs text-muted-foreground">
                    {t("No recipients", "ተቀባዮች የሉም")}
                  </div>
                )}
                {recipients.map((c) => {
                  const status = statuses[c.id];
                  return (
                    <div key={c.id} className="flex items-center gap-3 px-3 py-2 border-b border-border last:border-0 text-sm">
                      <div className="flex-1 min-w-0">
                        <div className="font-medium truncate">{c.name}</div>
                        <div className="text-xs text-muted-foreground font-mono truncate">{c.email}</div>
                      </div>
                      <div className="text-xs text-muted-foreground shrink-0">{c.points} pts · {c.tier}</div>
                      <div className="shrink-0 w-5">
                        {status === "sent" && <Icons.CheckCircle2 className="size-4 text-teff" />}
                        {status === "sending" && <Icons.Loader2 className="size-4 animate-spin text-ember" />}
                        {status === "idle" && <Icons.Circle className="size-4 text-muted-foreground" />}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {skipped.length > 0 && (
              <div className="rounded-lg bg-gold/10 border border-gold/30 px-3 py-2 text-xs text-gold-foreground">
                <Icons.AlertTriangle className="size-3 inline mr-1" />
                {t(
                  `${skipped.length} customer${skipped.length === 1 ? "" : "s"} skipped — no email address on file.`,
                  `${skipped.length} ደንበኛ${skipped.length === 1 ? "" : "ዎች"} ተዘሏል — ኢሜይል አድራሻ የለም።`
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
