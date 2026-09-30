import { Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState, type FormEvent } from "react";
import * as Icons from "lucide-react";
import { DateRangePicker } from "@/components/date-range/date-range-picker";
import { BranchesSettings } from "@/components/settings/branches-settings";
import {
  ComingSoonBlock,
  SectionFooter,
  SettingLine,
  SettingsField,
  SettingsInput,
  SettingsSelect,
  ToggleRow,
} from "@/components/settings/settings-shared";
import { Card, Chip, PageHeader } from "@/components/ui-kit";
import { useAuth } from "@/lib/auth-context";
import { DEFAULT_RESTAURANT_PROFILE, normalizeRestaurantProfile, type RestaurantProfile } from "@/lib/brand";
import {
  DEFAULT_TIMEZONE,
  formatClock,
  formatDate,
  formatDateLong,
  formatDateTime,
  defaultDateRangeValue,
  type DateFormatKey,
  type TimeFormat,
} from "@/lib/date-time";
import { PAYMENT_METHODS } from "@/lib/demo-data";
import { useLang } from "@/lib/lang-context";
import { stationHelp, stationPrinter } from "@/lib/stations";
import {
  appendAuditEntry,
  canEditSettingsSection,
  DEFAULT_SYSTEM_SETTINGS,
  loadSystemSettings,
  saveSystemSettings,
  searchSettingsSections,
  SETTINGS_GROUPS,
  SETTINGS_SECTIONS,
  validateCalendarSettings,
  validateReceiptTaxSettings,
  type CalendarSettings,
  type LocalizationSettings,
  type OrderRulesSettings,
  type PosSettings,
  type ReceiptTaxSettings,
  type SettingsSectionId,
  type ShiftSettings,
  type SystemSettingsState,
} from "@/lib/system-settings";
import type { useStockManagementModule } from "@/lib/stock-management";
import type { useStore } from "@/lib/store";

type StoreSlice = Pick<
  ReturnType<typeof useStore>,
  | "restaurantProfile"
  | "menuStations"
  | "menuItems"
  | "orders"
  | "tables"
  | "tableAreas"
  | "updateRestaurantProfile"
  | "resetRestaurantProfile"
  | "addMenuStation"
  | "renameMenuStation"
  | "removeMenuStation"
>;

type StockSlice = Pick<ReturnType<typeof useStockManagementModule>, "settings">;

export type SettingsShellProps = {
  store: StoreSlice;
  stock: StockSlice;
};

function PaymentIcon({ method }: { method: string }) {
  const Icon =
    method === "Cash" ? Icons.Banknote
    : method === "Mixed" ? Icons.WalletCards
    : method === "CBE" || method === "Dashen" || method === "BOA" || method === "Awash" || method === "Siinqee" ? Icons.Landmark
    : Icons.Smartphone;
  return <Icon className="size-4 text-muted-foreground shrink-0" />;
}

function sectionIcon(id: SettingsSectionId) {
  const map: Record<SettingsSectionId, keyof typeof Icons> = {
    "restaurant-profile": "Store",
    branches: "MapPin",
    localization: "Languages",
    "calendar-date": "CalendarClock",
    "receipt-tax": "Receipt",
    "order-rules": "ClipboardList",
    "production-stations": "ChefHat",
    "payment-methods": "Wallet",
    "seating-areas": "LayoutGrid",
    "devices-printers": "Printer",
    inventory: "Package",
    pos: "MonitorSmartphone",
    shift: "Timer",
    notifications: "Bell",
    "users-permissions": "Users",
    integrations: "Plug",
    audit: "ScrollText",
  };
  return Icons[map[id]] as typeof Icons.Store;
}

export function SettingsShell({ store, stock }: SettingsShellProps) {
  const lang = useLang();
  const { user } = useAuth();
  const t = (en: string, am: string) => (lang === "am" ? am : en);

  const [section, setSection] = useState<SettingsSectionId>("restaurant-profile");
  const [search, setSearch] = useState("");
  const [systemSettings, setSystemSettings] = useState<SystemSettingsState>(() => loadSystemSettings());
  const [savedSettings, setSavedSettings] = useState<SystemSettingsState>(() => loadSystemSettings());

  const [profileDraft, setProfileDraft] = useState<RestaurantProfile>(store.restaurantProfile);
  const [savedProfile, setSavedProfile] = useState(store.restaurantProfile);

  const [localizationDraft, setLocalizationDraft] = useState(savedSettings.localization);
  const [calendarDraft, setCalendarDraft] = useState(savedSettings.calendar);
  const [receiptDraft, setReceiptDraft] = useState(savedSettings.receiptTax);
  const [orderRulesDraft, setOrderRulesDraft] = useState(savedSettings.orderRules);
  const [posDraft, setPosDraft] = useState(savedSettings.pos);
  const [shiftDraft, setShiftDraft] = useState(savedSettings.shift);

  const [newStation, setNewStation] = useState("");
  const [now, setNow] = useState(() => new Date());
  const [saving, setSaving] = useState(false);

  const role = user?.role ?? "Cashier";
  const canEdit = canEditSettingsSection(section, role);
  const datePrefs = calendarDraft;
  const timezone = profileDraft.timezone || calendarDraft.timezone || DEFAULT_TIMEZONE;
  const branchName = store.restaurantProfile.address || user?.branch || t("Main Branch", "ዋና ቅርንጫፍ");

  useEffect(() => {
    const timer = window.setInterval(() => setNow(new Date()), 30_000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    setProfileDraft(store.restaurantProfile);
    setSavedProfile(store.restaurantProfile);
  }, [store.restaurantProfile]);

  const visibleSections = useMemo(() => {
    const ids = searchSettingsSections(search);
    return SETTINGS_SECTIONS.filter((row) => ids.includes(row.id));
  }, [search]);

  const groupedSections = useMemo(() => {
    return SETTINGS_GROUPS.map((group) => ({
      ...group,
      sections: visibleSections.filter((row) => row.group === group.id),
    })).filter((group) => group.sections.length > 0);
  }, [visibleSections]);

  const sectionMeta = systemSettings.sectionMeta[section];

  const dirty = useMemo(() => {
    switch (section) {
      case "restaurant-profile":
        return JSON.stringify(profileDraft) !== JSON.stringify(savedProfile);
      case "localization":
        return JSON.stringify(localizationDraft) !== JSON.stringify(savedSettings.localization);
      case "calendar-date":
        return JSON.stringify(calendarDraft) !== JSON.stringify(savedSettings.calendar);
      case "receipt-tax":
        return JSON.stringify(receiptDraft) !== JSON.stringify(savedSettings.receiptTax);
      case "order-rules":
        return JSON.stringify(orderRulesDraft) !== JSON.stringify(savedSettings.orderRules);
      case "pos":
        return JSON.stringify(posDraft) !== JSON.stringify(savedSettings.pos);
      case "shift":
        return JSON.stringify(shiftDraft) !== JSON.stringify(savedSettings.shift);
      default:
        return false;
    }
  }, [section, profileDraft, savedProfile, localizationDraft, calendarDraft, receiptDraft, orderRulesDraft, posDraft, shiftDraft, savedSettings]);

  const validationErrors = useMemo(() => {
    if (section === "receipt-tax") return validateReceiptTaxSettings(receiptDraft);
    if (section === "calendar-date") return validateCalendarSettings(calendarDraft);
    return [];
  }, [section, receiptDraft, calendarDraft]);

  useEffect(() => {
    function onBeforeUnload(event: BeforeUnloadEvent) {
      if (dirty) event.preventDefault();
    }
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [dirty]);

  function resetSectionDraft() {
    switch (section) {
      case "restaurant-profile":
        setProfileDraft(savedProfile);
        break;
      case "localization":
        setLocalizationDraft(savedSettings.localization);
        break;
      case "calendar-date":
        setCalendarDraft(savedSettings.calendar);
        break;
      case "receipt-tax":
        setReceiptDraft(savedSettings.receiptTax);
        break;
      case "order-rules":
        setOrderRulesDraft(savedSettings.orderRules);
        break;
      case "pos":
        setPosDraft(savedSettings.pos);
        break;
      case "shift":
        setShiftDraft(savedSettings.shift);
        break;
      default:
        break;
    }
  }

  function persistSystemSection<T extends keyof SystemSettingsState>(
    key: T,
    value: SystemSettingsState[T],
    settingName: string,
  ) {
    let next = { ...systemSettings, [key]: value } as SystemSettingsState;
    next = appendAuditEntry(next, {
      section,
      settingName,
      previousValue: JSON.stringify(savedSettings[key]),
      newValue: JSON.stringify(value),
      changedBy: user?.name ?? "System",
      changedByRole: role,
      branch: branchName,
    });
    saveSystemSettings(next);
    setSystemSettings(next);
    setSavedSettings(next);
  }

  async function saveSection() {
    if (!canEdit || validationErrors.length > 0) return;
    setSaving(true);
    try {
      if (section === "restaurant-profile") {
        const next = normalizeRestaurantProfile(profileDraft);
        store.updateRestaurantProfile(next);
        setProfileDraft(next);
        setSavedProfile(next);
        let nextSettings = appendAuditEntry(systemSettings, {
          section,
          settingName: "restaurant-profile",
          previousValue: JSON.stringify(savedProfile),
          newValue: JSON.stringify(next),
          changedBy: user?.name ?? "System",
          changedByRole: role,
          branch: branchName,
        });
        saveSystemSettings(nextSettings);
        setSystemSettings(nextSettings);
        setSavedSettings(nextSettings);
      } else if (section === "localization") {
        persistSystemSection("localization", localizationDraft, "localization");
      } else if (section === "calendar-date") {
        persistSystemSection("calendar", calendarDraft, "calendar-date");
      } else if (section === "receipt-tax") {
        persistSystemSection("receiptTax", receiptDraft, "receipt-tax");
      } else if (section === "order-rules") {
        persistSystemSection("orderRules", orderRulesDraft, "order-rules");
      } else if (section === "pos") {
        persistSystemSection("pos", posDraft, "pos");
      } else if (section === "shift") {
        persistSystemSection("shift", shiftDraft, "shift");
      }
    } finally {
      setSaving(false);
    }
  }

  function updateProfileField(key: keyof RestaurantProfile, value: string) {
    setProfileDraft((current) => ({ ...current, [key]: value }));
  }

  function handleLogoUpload(file: File | null) {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === "string") updateProfileField("logoUrl", reader.result);
    };
    reader.readAsDataURL(file);
  }

  function addStation(event: FormEvent) {
    event.preventDefault();
    const value = newStation.trim();
    if (!value || !canEdit) return;
    store.addMenuStation(value);
    setNewStation("");
  }

  const stationRows = store.menuStations.map((station) => ({
    station,
    menuItems: store.menuItems.filter((item) => item.station === station).length,
    openTickets: store.orders.flatMap((order) => order.stationTickets).filter((ticket) => ticket.station === station && ticket.status !== "READY").length,
    readyTickets: store.orders.flatMap((order) => order.stationTickets).filter((ticket) => ticket.station === station && ticket.status === "READY").length,
  }));

  const areaRows = store.tableAreas.filter((area) => area !== "All").map((area) => ({
    area,
    tables: store.tables.filter((table) => table.area === area).length,
    occupied: store.tables.filter((table) => table.area === area && table.status === "Occupied").length,
    bill: store.tables.filter((table) => table.area === area && table.status === "Bill").length,
  }));

  function renderSectionContent() {
    switch (section) {
      case "restaurant-profile":
        return (
          <form className="space-y-4" onSubmit={(event) => { event.preventDefault(); void saveSection(); }}>
            <div className="flex items-start gap-4">
              <img src={profileDraft.logoUrl || DEFAULT_RESTAURANT_PROFILE.logoUrl} alt="logo" className="size-16 rounded-2xl object-cover bg-card border border-border shrink-0" />
              <div className="flex-1 min-w-0">
                <h2 className="font-display text-lg font-semibold">{t("Restaurant information", "የምግብ ቤት መረጃ")}</h2>
              </div>
            </div>
            <div className="grid sm:grid-cols-2 gap-3">
              <SettingsField label={t("Restaurant name", "የምግብ ቤት ስም")}><SettingsInput value={profileDraft.name} onChange={(v) => updateProfileField("name", v)} disabled={!canEdit} /></SettingsField>
              <SettingsField label={t("Short name", "አጭር ስም")}><SettingsInput value={profileDraft.shortName} onChange={(v) => updateProfileField("shortName", v)} disabled={!canEdit} /></SettingsField>
              <SettingsField label={t("Tagline", "መለያ መልእክት")}><SettingsInput value={profileDraft.tagline} onChange={(v) => updateProfileField("tagline", v)} disabled={!canEdit} /></SettingsField>
              <SettingsField label={t("Logo URL", "የአርማ አድራሻ")}><SettingsInput value={profileDraft.logoUrl} onChange={(v) => updateProfileField("logoUrl", v)} disabled={!canEdit} /></SettingsField>
              <SettingsField label={t("Upload logo", "አርማ ይጭኑ")}>
                <input type="file" accept="image/*" disabled={!canEdit} onChange={(event) => handleLogoUpload(event.target.files?.[0] ?? null)} className="w-full text-sm" />
              </SettingsField>
              <SettingsField label={t("Address / branch", "አድራሻ / ቅርንጫፍ")}><SettingsInput value={profileDraft.address} onChange={(v) => updateProfileField("address", v)} disabled={!canEdit} /></SettingsField>
              <SettingsField label={t("Phone", "ስልክ")}><SettingsInput value={profileDraft.phone ?? ""} onChange={(v) => updateProfileField("phone", v)} disabled={!canEdit} /></SettingsField>
              <SettingsField label={t("Email", "ኢሜይል")}><SettingsInput value={profileDraft.email ?? ""} onChange={(v) => updateProfileField("email", v)} disabled={!canEdit} /></SettingsField>
              <SettingsField label={t("Website", "ድር ጣቢያ")}><SettingsInput value={profileDraft.website ?? ""} onChange={(v) => updateProfileField("website", v)} disabled={!canEdit} /></SettingsField>
              <SettingsField label="TIN"><SettingsInput value={profileDraft.tin} onChange={(v) => updateProfileField("tin", v)} disabled={!canEdit} /></SettingsField>
              <SettingsField label={t("VAT Reg. No.", "የVAT መመዝገቢያ")}><SettingsInput value={profileDraft.vatRegNo} onChange={(v) => updateProfileField("vatRegNo", v)} disabled={!canEdit} /></SettingsField>
              <SettingsField label={t("Currency", "ምንዛሬ")}><SettingsInput value={profileDraft.currency} onChange={(v) => updateProfileField("currency", v)} disabled={!canEdit} /></SettingsField>
              <SettingsField label={t("Default language", "ነባሪ ቋንቋ")}>
                <SettingsSelect value={profileDraft.defaultLanguage ?? "both"} onChange={(v) => updateProfileField("defaultLanguage", v)} disabled={!canEdit} options={[{ value: "en", label: "English" }, { value: "am", label: "Amharic" }, { value: "both", label: "Both" }]} />
              </SettingsField>
              <SettingsField label={t("Timezone", "የሰዓት ቀጠና")}><SettingsInput value={profileDraft.timezone ?? timezone} onChange={(v) => updateProfileField("timezone", v)} disabled={!canEdit} /></SettingsField>
              <SettingsField label={t("Receipt footer", "የደረሰኝ ግዛፍ")}><SettingsInput value={profileDraft.receiptFooter ?? ""} onChange={(v) => updateProfileField("receiptFooter", v)} disabled={!canEdit} /></SettingsField>
            </div>
          </form>
        );

      case "branches":
        return (
          <BranchesSettings
            canEdit={canEdit}
            seed={{
              name: user?.branch || branchName,
              address: profileDraft.address,
              phone: profileDraft.phone,
              timezone: profileDraft.timezone ?? timezone,
            }}
          />
        );

      case "localization":
        return (
          <div className="grid sm:grid-cols-2 gap-3">
            <SettingsField label={t("Language", "ቋንቋ")}>
              <SettingsSelect value={localizationDraft.language} onChange={(v) => setLocalizationDraft((c) => ({ ...c, language: v as LocalizationSettings["language"] }))} disabled={!canEdit} options={[{ value: "en", label: "English" }, { value: "am", label: "Amharic" }, { value: "both", label: "Both" }]} />
            </SettingsField>
            <SettingsField label={t("Currency", "ምንዛሬ")}><SettingsInput value={localizationDraft.currency} onChange={(v) => setLocalizationDraft((c) => ({ ...c, currency: v }))} disabled={!canEdit} /></SettingsField>
            <SettingsField label={t("Currency symbol", "ምልክት")}><SettingsInput value={localizationDraft.currencySymbol} onChange={(v) => setLocalizationDraft((c) => ({ ...c, currencySymbol: v }))} disabled={!canEdit} /></SettingsField>
            <SettingsField label={t("Decimal places", "አስርዮሽ")}><SettingsInput type="number" value={localizationDraft.decimalPlaces} onChange={(v) => setLocalizationDraft((c) => ({ ...c, decimalPlaces: Number(v) || 0 }))} disabled={!canEdit} /></SettingsField>
            <SettingsField label={t("Thousand separator", "መለያ")}>
              <SettingsSelect value={localizationDraft.thousandSeparator} onChange={(v) => setLocalizationDraft((c) => ({ ...c, thousandSeparator: v as LocalizationSettings["thousandSeparator"] }))} disabled={!canEdit} options={[{ value: ",", label: "," }, { value: ".", label: "." }, { value: " ", label: "Space" }]} />
            </SettingsField>
            <SettingsField label={t("Preview", "ቅድመ-እይታ")} hint={`${localizationDraft.currencySymbol} 1,250.00`}>
              <div className="h-10 px-3 rounded-lg border border-border bg-surface-2 grid items-center font-mono text-sm">{localizationDraft.currencySymbol} 1,250.00</div>
            </SettingsField>
          </div>
        );

      case "calendar-date":
        return (
          <div className="space-y-4">
            <div className="grid sm:grid-cols-2 gap-3">
              <SettingsField label={t("Time format", "የሰዓት ቅርጽ")}>
                <SettingsSelect value={calendarDraft.timeFormat} onChange={(v) => setCalendarDraft((c) => ({ ...c, timeFormat: v as TimeFormat }))} disabled={!canEdit} options={[{ value: "12h", label: t("12-hour with AM/PM", "12-ሰዓት AM/PM") }, { value: "24h", label: t("24-hour", "24-ሰዓት") }]} />
              </SettingsField>
              <SettingsField label={t("Date format", "የቀን ቅርጽ")}>
                <SettingsSelect value={calendarDraft.dateFormat} onChange={(v) => setCalendarDraft((c) => ({ ...c, dateFormat: v as DateFormatKey }))} disabled={!canEdit} options={["DD/MM/YYYY", "MM/DD/YYYY", "YYYY-MM-DD", "DD MMM YYYY", "MMM DD, YYYY"].map((value) => ({ value, label: value }))} />
              </SettingsField>
              <SettingsField label={t("Calendar system", "ቀን መቁጠሪያ")}>
                <SettingsSelect value={calendarDraft.calendarSystem} onChange={(v) => setCalendarDraft((c) => ({ ...c, calendarSystem: v as CalendarSettings["calendarSystem"] }))} disabled={!canEdit} options={[{ value: "gregorian", label: "Gregorian" }, { value: "ethiopian", label: "Ethiopian" }, { value: "both", label: "Both" }]} />
              </SettingsField>
              <SettingsField label={t("Timezone", "የሰዓት ቀጠና")}><SettingsInput value={calendarDraft.timezone} onChange={(v) => setCalendarDraft((c) => ({ ...c, timezone: v }))} disabled={!canEdit} /></SettingsField>
              <SettingsField label={t("First day of week", "የሳምንት መጀመሪያ")}>
                <SettingsSelect value={String(calendarDraft.firstDayOfWeek)} onChange={(v) => setCalendarDraft((c) => ({ ...c, firstDayOfWeek: Number(v) as 0 | 1 }))} disabled={!canEdit} options={[{ value: "1", label: t("Monday", "ሰኞ") }, { value: "0", label: t("Sunday", "እሁድ") }]} />
              </SettingsField>
            </div>
            <Card className="!p-4 space-y-2 text-sm">
              <div>{t("Current restaurant time", "አሁኑን የምግብ ቤት ሰዓት")}: <strong>{formatClock(now, calendarDraft)}</strong></div>
              <div>{t("Date preview", "የቀን ቅድመ-እይታ")}: <strong>{formatDate(now, calendarDraft, lang)}</strong></div>
              <div>{t("Long heading", "ረጅም ርዕስ")}: <strong>{formatDateLong(now, calendarDraft)}</strong></div>
              <div>{t("Date & time", "ቀን እና ሰዓት")}: <strong>{formatDateTime(now, calendarDraft, lang)}</strong></div>
            </Card>
            <div>
              <h3 className="text-sm font-semibold mb-2">{t("Global date range component", "የቀን ክልል አካል")}</h3>
              <DateRangePicker value={defaultDateRangeValue()} onChange={() => undefined} preferences={calendarDraft} />
            </div>
          </div>
        );

      case "receipt-tax":
        return (
          <div className="grid sm:grid-cols-2 gap-3">
            <SettingsField label={t("Receipt timing", "የደረሰኝ ጊዜ")}>
              <SettingsSelect value={receiptDraft.receiptTiming} onChange={(v) => setReceiptDraft((c) => ({ ...c, receiptTiming: v as ReceiptTaxSettings["receiptTiming"] }))} disabled={!canEdit} options={[{ value: "before_payment", label: t("Before payment", "ከክፍያ በፊት") }, { value: "after_payment", label: t("After payment", "ከክፍያ በኋላ") }, { value: "on_generation", label: t("On generation", "በመፍጠር") }, { value: "on_close", label: t("On close", "በመዝጊያ") }]} />
            </SettingsField>
            <SettingsField label={t("Receipt number length", "የቁጥር ርዝመት")}><SettingsInput type="number" value={receiptDraft.receiptNumberLength} onChange={(v) => setReceiptDraft((c) => ({ ...c, receiptNumberLength: Number(v) || 8 }))} disabled={!canEdit} /></SettingsField>
            <SettingsField label={t("VAT rate %", "VAT %")}><SettingsInput type="number" value={receiptDraft.vatRate} onChange={(v) => setReceiptDraft((c) => ({ ...c, vatRate: Number(v) || 0 }))} disabled={!canEdit} /></SettingsField>
            <SettingsField label={t("Service charge %", "አገልግሎት %")}><SettingsInput type="number" value={receiptDraft.serviceChargeRate} onChange={(v) => setReceiptDraft((c) => ({ ...c, serviceChargeRate: Number(v) || 0 }))} disabled={!canEdit} /></SettingsField>
            <SettingsField label={t("Receipt prefix", "ቅድመ-ቅጥል")}><SettingsInput value={receiptDraft.receiptPrefix} onChange={(v) => setReceiptDraft((c) => ({ ...c, receiptPrefix: v }))} disabled={!canEdit} /></SettingsField>
            <SettingsField label={t("Reprint watermark", "ድጋሚ ማተሚያ")}><SettingsInput value={receiptDraft.reprintWatermark} onChange={(v) => setReceiptDraft((c) => ({ ...c, reprintWatermark: v }))} disabled={!canEdit} /></SettingsField>
            <div className="sm:col-span-2 space-y-2">
              <ToggleRow label={t("Service charge enabled", "አገልግሎት ክፍያ")} enabled={receiptDraft.serviceChargeEnabled} onChange={canEdit ? (v) => setReceiptDraft((c) => ({ ...c, serviceChargeEnabled: v })) : undefined} />
              <ToggleRow label={t("Require receipt before payment", "ከክፍያ በፊት ደረሰኝ")} enabled={receiptDraft.requireReceiptBeforePayment} onChange={canEdit ? (v) => setReceiptDraft((c) => ({ ...c, requireReceiptBeforePayment: v })) : undefined} />
              <ToggleRow label={t("Lock order after receipt", "ከደረሰኝ በኋላ ትዕዛዝ ቆልፍ")} enabled={receiptDraft.lockOrderAfterReceipt} onChange={canEdit ? (v) => setReceiptDraft((c) => ({ ...c, lockOrderAfterReceipt: v })) : undefined} />
              <ToggleRow label={t("Show time on receipt (12-hour)", "12-ሰዓት በደረሰኝ")} enabled={receiptDraft.showTime} onChange={canEdit ? (v) => setReceiptDraft((c) => ({ ...c, showTime: v })) : undefined} />
            </div>
          </div>
        );

      case "order-rules":
        return (
          <div className="space-y-2">
            {([
              ["lockAfterReceipt", t("Lock after receipt", "ከደረሰኝ በኋላ ቆልፍ")],
              ["allowPartialPayments", t("Allow partial payments", "ከፊል ክፍያ")],
              ["allowMixedPayments", t("Allow mixed payments", "ቅልቅል ክፍያ")],
              ["requireTableDineIn", t("Require table for dine-in", "ጠረጴዛ ያስፈልጋል")],
              ["requireWaiterAssignment", t("Require waiter assignment", "አስተናጋጅ ያስፈልጋል")],
              ["managerApprovalVoid", t("Manager approval for void", "ማጥፋት ማጽደቅ")],
            ] as const).map(([key, label]) => (
              <ToggleRow key={key} label={label} enabled={orderRulesDraft[key]} onChange={canEdit ? (v) => setOrderRulesDraft((c) => ({ ...c, [key]: v })) : undefined} />
            ))}
            <SettingsField label={t("Max discount %", "ከፍተኛ ቅናሽ %")}>
              <SettingsInput type="number" value={orderRulesDraft.maxDiscountPct} onChange={(v) => setOrderRulesDraft((c) => ({ ...c, maxDiscountPct: Number(v) || 0 }))} disabled={!canEdit} />
            </SettingsField>
          </div>
        );

      case "production-stations":
        return (
          <div className="space-y-4">
            {canEdit && (
              <form onSubmit={addStation} className="flex flex-col gap-2 sm:flex-row">
                <input value={newStation} onChange={(e) => setNewStation(e.target.value)} placeholder={t("Add station", "ጣቢያ ጨምር")} className="h-10 flex-1 rounded-lg border border-border bg-card px-3 text-sm" />
                <button type="submit" className="h-10 px-4 rounded-lg bg-foreground text-background text-sm font-semibold">{t("Add station", "ጣቢያ ጨምር")}</button>
              </form>
            )}
            <div className="overflow-x-auto rounded-lg border border-border">
              <table className="w-full min-w-[760px] text-sm">
                <thead className="bg-surface-2 text-xs uppercase tracking-wider text-muted-foreground">
                  <tr>
                    <th className="text-left px-4 py-3">{t("Station", "ጣቢያ")}</th>
                    <th className="text-left px-4 py-3">{t("Used for", "ለ")}</th>
                    <th className="text-left px-4 py-3">{t("Printer", "አታሚ")}</th>
                    <th className="text-right px-4 py-3">{t("Menu", "ምናሌ")}</th>
                    <th className="text-right px-4 py-3">{t("Open", "ክፍት")}</th>
                    <th className="px-4 py-3" />
                  </tr>
                </thead>
                <tbody>
                  {stationRows.map((row) => (
                    <tr key={row.station} className="border-t border-border">
                      <td className="px-4 py-3 font-medium">{row.station}</td>
                      <td className="px-4 py-3 text-muted-foreground">{stationHelp(row.station)}</td>
                      <td className="px-4 py-3">{stationPrinter(row.station)}</td>
                      <td className="px-4 py-3 text-right font-mono">{row.menuItems}</td>
                      <td className="px-4 py-3 text-right font-mono">{row.openTickets}</td>
                      <td className="px-4 py-3">
                        {canEdit && (
                          <div className="flex justify-end gap-1">
                            <button type="button" onClick={() => { const next = window.prompt(t("Rename station", "ጣቢያ ሰይም"), row.station)?.trim(); if (next && next !== row.station) store.renameMenuStation(row.station, next); }} className="size-8 grid place-items-center rounded-lg hover:bg-surface-2"><Icons.Pencil className="size-3.5" /></button>
                            <button type="button" disabled={store.menuStations.length <= 1} onClick={() => store.removeMenuStation(row.station)} className="size-8 grid place-items-center rounded-lg hover:bg-destructive/10 text-destructive disabled:opacity-40"><Icons.Trash2 className="size-3.5" /></button>
                          </div>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        );

      case "payment-methods":
        return (
          <div className="space-y-2">
            {PAYMENT_METHODS.map((method) => (
              <div key={method} className="flex items-center justify-between gap-3 p-3 rounded-lg bg-surface-2">
                <div className="flex items-center gap-2"><PaymentIcon method={method} /><span className="font-medium text-sm">{method}</span></div>
                <Chip tone="teff">{t("Enabled", "ነቅቷል")}</Chip>
              </div>
            ))}
          </div>
        );

      case "seating-areas":
        return (
          <div className="space-y-2">
            {areaRows.map((row) => (
              <div key={row.area} className="rounded-lg border border-border px-3 py-2">
                <div className="flex justify-between text-sm"><span className="font-medium">{row.area}</span><span className="font-mono">{row.tables} {t("tables", "ጠረጴዛ")}</span></div>
                <div className="text-xs text-muted-foreground mt-1">{row.occupied} {t("occupied", "ተይዟል")} · {row.bill} {t("bills", "ቢሎች")}</div>
              </div>
            ))}
            <Link to="/app/tables" className="inline-flex text-sm text-ember hover:underline">{t("Manage tables", "ጠረጴዛዎችን አስተዳድር")} →</Link>
          </div>
        );

      case "devices-printers":
        return (
          <div className="space-y-3">
            <div className="grid md:grid-cols-2 gap-3">
              {[
                { name: "Cashier POS terminal", type: t("Order entry and payment", "ትዕዛዝ እና ክፍያ") },
                { name: "Receipt printer - 80mm", type: t("Customer receipt", "የደንበኛ ደረሰኝ") },
                ...store.menuStations.map((station) => ({ name: `${station} display`, type: `${station} KDS` })),
              ].map((device) => (
                <div key={device.name} className="flex items-center justify-between gap-3 p-3 rounded-lg bg-surface-2">
                  <div><div className="font-medium text-sm">{device.name}</div><div className="text-xs text-muted-foreground">{device.type}</div></div>
                  <Chip tone="teff">{t("Online", "ኦንላይን")}</Chip>
                </div>
              ))}
            </div>
            <p className="text-xs text-muted-foreground px-1">
              {t(
                "For shared LAN printing: Printer Settings → Network ESC/POS → set host/port/agent → Publish to branch. Run npm run print-agent on a branch PC.",
                "የተጋራ LAN ማተሚያ፡ Printer Settings → Network ESC/POS → host/port/agent → Publish to branch። በቅርንጫፍ PC ላይ npm run print-agent ያስጀምሩ።",
              )}
            </p>
            <Link to="/app/printer-settings" className="inline-flex text-sm text-ember hover:underline">{t("Printer settings", "የአታሚ ቅንብሮች")} →</Link>
          </div>
        );

      case "inventory":
        return (
          <ul className="space-y-2 text-sm">
            <SettingLine label={t("Costing method", "የወጪ ዘዴ")} value={stock.settings.costingMethod} />
            <SettingLine label={t("Allow negative stock", "አሉታዊ ክምችት")} value={stock.settings.allowNegativeStock ? t("Yes", "አዎ") : t("No", "አይ")} />
            <SettingLine label={t("POS deduction timing", "POS ቅነሳ")} value={stock.settings.posDeductionTiming} />
            <SettingLine label={t("Out-of-stock behavior", "ከክምችት ውጭ")} value={stock.settings.posOutOfStockBehavior} />
          </ul>
        );

      case "pos":
        return (
          <div className="space-y-2">
            <ToggleRow
              label={t("Disconnect POS items from stock", "የPOS እቃዎችን ከክምችት አላቅ")}
              enabled={posDraft.disconnectPosMenuFromStock}
              onChange={canEdit ? (v) => setPosDraft((c) => ({ ...c, disconnectPosMenuFromStock: v })) : undefined}
            />
            <p className="px-1 text-[11px] text-muted-foreground">
              {t(
                "When on, cashiers can sell menu items without stock checks, reservations, or deductions. Turn off to connect POS sales to inventory again.",
                "ሲበራ ካሸር የሜኑ እቃዎችን ያለ ክምችት ፍተሻ፣ ሪዘርቭ ወይም ቅነሳ መሸጥ ይችላል። እንደገና ለማገናኘት ያጥፉ።",
              )}
            </p>
            {([
              ["showStockAvailability", t("Show stock availability", "ክምችት አሳይ")],
              ["showMenuImages", t("Show menu images", "ምስል አሳይ")],
              ["show12HourClock", t("Show 12-hour clock", "12-ሰዓት ሰዓት")],
              ["autoPrintPaidReceipt", t("Auto-print paid receipt", "ደረሰኝ አትም")],
            ] as const).map(([key, label]) => (
              <ToggleRow key={key} label={label} enabled={posDraft[key]} onChange={canEdit ? (v) => setPosDraft((c) => ({ ...c, [key]: v })) : undefined} />
            ))}
          </div>
        );

      case "shift":
        return (
          <div className="space-y-2">
            {([
              ["requireOpeningBalance", t("Require opening balance", "መክፈቻ ቀሪ")],
              ["requireCashCountAtClose", t("Cash count at close", "በመዝጊያ ቁጠራ")],
              ["blockCloseWithOpenOrders", t("Block close with open orders", "ክፍት ትዕዛዞች")],
              ["blockCloseWithUnpaidOrders", t("Block close with unpaid orders", "ያልተከፈሉ ትዕዛዞች")],
            ] as const).map(([key, label]) => (
              <ToggleRow key={key} label={label} enabled={shiftDraft[key]} onChange={canEdit ? (v) => setShiftDraft((c) => ({ ...c, [key]: v })) : undefined} />
            ))}
          </div>
        );

      case "notifications":
        return <ComingSoonBlock title="Notification preferences" />;

      case "users-permissions":
        return (
          <div className="space-y-3">
            <Link to="/app/staff" search={{ tab: "accounts" }} className="inline-flex text-sm text-ember hover:underline">{t("Manage staff & accounts", "ሰራተኞችን እና መለያዎችን አስተዳድር")} →</Link>
          </div>
        );

      case "integrations":
        return <ComingSoonBlock title="Integrations" />;

      case "audit":
        return (
          <div className="overflow-x-auto rounded-lg border border-border">
            <table className="w-full text-sm min-w-[700px]">
              <thead className="bg-surface-2 text-xs uppercase text-muted-foreground">
                <tr>
                  <th className="text-left px-3 py-2">{t("Section", "ክፍል")}</th>
                  <th className="text-left px-3 py-2">{t("Setting", "ቅንብር")}</th>
                  <th className="text-left px-3 py-2">{t("By", "በ")}</th>
                  <th className="text-left px-3 py-2">{t("When", "መቼ")}</th>
                </tr>
              </thead>
              <tbody>
                {systemSettings.auditLog.length === 0 ? (
                  <tr><td colSpan={4} className="px-3 py-8 text-center text-muted-foreground">{t("No changes recorded yet.", "ምንም ለውጥ አልተመዘገበም።")}</td></tr>
                ) : systemSettings.auditLog.map((entry) => (
                  <tr key={entry.id} className="border-t border-border">
                    <td className="px-3 py-2">{entry.section}</td>
                    <td className="px-3 py-2">{entry.settingName}</td>
                    <td className="px-3 py-2">{entry.changedBy} ({entry.changedByRole})</td>
                    <td className="px-3 py-2">{formatDateTime(entry.changedAtIso, datePrefs, lang)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        );

      default:
        return null;
    }
  }

  const activeSection = SETTINGS_SECTIONS.find((row) => row.id === section);
  const showFooter = ["restaurant-profile", "localization", "calendar-date", "receipt-tax", "order-rules", "pos", "shift"].includes(section);
  const ActiveIcon = activeSection ? sectionIcon(activeSection.id) : Icons.Settings;

  function selectSection(id: SettingsSectionId) {
    setSection(id);
  }

  return (
    <div className="mx-auto min-w-0 max-w-6xl space-y-4 pb-6">
      <PageHeader
        title={t("Settings", "ቅንብሮች")}
        subtitle={`${branchName} · ${formatClock(now, datePrefs)}`}
        action={
          <div className="relative w-full sm:w-72">
            <Icons.Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={t("Search settings…", "ቅንብሮችን ይፈልጉ…")}
              className="h-10 w-full rounded-xl border border-border bg-card pl-9 pr-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring/40"
            />
          </div>
        }
      />

      {/* Mobile: quick section chips */}
      <div className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1 [scrollbar-width:none] lg:hidden [&::-webkit-scrollbar]:hidden">
        {visibleSections.map((row) => {
          const Icon = sectionIcon(row.id);
          const active = section === row.id;
          return (
            <button
              key={row.id}
              type="button"
              onClick={() => selectSection(row.id)}
              className={`inline-flex h-9 shrink-0 items-center gap-1.5 rounded-full border px-3 text-xs font-medium ${
                active
                  ? "border-ember bg-ember text-ember-foreground"
                  : "border-border bg-card text-muted-foreground"
              }`}
            >
              <Icon className="size-3.5" />
              {t(row.labelEn, row.labelAm)}
            </button>
          );
        })}
      </div>

      <div className="grid gap-4 lg:grid-cols-[240px_minmax(0,1fr)] lg:items-start">
        <aside className="hidden lg:block">
          <Card className="!sticky !top-4 !max-h-[calc(100vh-6rem)] !space-y-3 !overflow-y-auto !p-3">
            {groupedSections.map((group) => (
              <div key={group.id}>
                <div className="mb-1.5 px-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                  {t(group.labelEn, group.labelAm)}
                </div>
                <div className="space-y-0.5">
                  {group.sections.map((row) => {
                    const Icon = sectionIcon(row.id);
                    const active = section === row.id;
                    return (
                      <button
                        key={row.id}
                        type="button"
                        onClick={() => selectSection(row.id)}
                        className={`flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-sm transition ${
                          active
                            ? "bg-foreground text-background"
                            : "text-foreground hover:bg-surface-2"
                        }`}
                      >
                        <Icon className="size-4 shrink-0 opacity-80" />
                        <span className="truncate">{t(row.labelEn, row.labelAm)}</span>
                      </button>
                    );
                  })}
                </div>
              </div>
            ))}
            {visibleSections.length === 0 ? (
              <p className="px-2 py-6 text-center text-sm text-muted-foreground">
                {t("No matching settings.", "ተዛማጅ ቅንብር የለም።")}
              </p>
            ) : null}
          </Card>
        </aside>

        <Card className="min-h-[420px] !flex !flex-col !p-4 sm:!p-5">
          <div className="mb-4 flex items-start justify-between gap-3 border-b border-border pb-3">
            <div className="flex min-w-0 items-start gap-3">
              <div className="grid size-10 shrink-0 place-items-center rounded-xl bg-surface-2">
                <ActiveIcon className="size-5" />
              </div>
              <div className="min-w-0">
                <h2 className="font-display text-lg font-semibold leading-tight">
                  {activeSection ? t(activeSection.labelEn, activeSection.labelAm) : t("Settings", "ቅንብሮች")}
                </h2>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  {canEdit
                    ? t("You can edit this section.", "ይህን ክፍል ማስተካከል ይችላሉ።")
                    : t("View only for your role.", "ለእርስዎ ሚና ለማየት ብቻ ነው።")}
                  {dirty ? ` · ${t("Unsaved changes", "ያልተቀመጡ ለውጦች")}` : ""}
                </p>
              </div>
            </div>
            {dirty ? <Chip tone="gold">{t("Unsaved", "ያልተቀመጠ")}</Chip> : null}
          </div>

          <div className="flex-1 pb-4">{renderSectionContent()}</div>

          {showFooter ? (
            <SectionFooter
              dirty={dirty}
              canSave={canEdit}
              errors={validationErrors}
              meta={sectionMeta}
              onSave={() => void saveSection()}
              onReset={resetSectionDraft}
              saving={saving}
            />
          ) : null}
        </Card>
      </div>
    </div>
  );
}
