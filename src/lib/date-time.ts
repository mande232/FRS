import { formatEthiopic } from "@/lib/ethiopic";

export type TimeFormat = "12h" | "24h";

export type DateFormatKey =
  | "DD/MM/YYYY"
  | "MM/DD/YYYY"
  | "YYYY-MM-DD"
  | "DD MMM YYYY"
  | "MMM DD, YYYY";

export type CalendarSystem = "gregorian" | "ethiopian" | "both";

export type DateRangePreset =
  | "today"
  | "yesterday"
  | "this_week"
  | "last_week"
  | "this_month"
  | "last_month"
  | "this_year"
  | "custom";

export type DateRangeMode = "quick" | "calendar";

export type DateRangeValue = {
  mode: DateRangeMode;
  preset: DateRangePreset;
  fromDate: string;
  toDate: string;
};

export const DEFAULT_TIMEZONE = "Africa/Addis_Ababa";

export type DateTimePreferences = {
  timeFormat: TimeFormat;
  dateFormat: DateFormatKey;
  calendarSystem: CalendarSystem;
  timezone: string;
  firstDayOfWeek: 0 | 1;
  currencySymbol: string;
  decimalPlaces: number;
  thousandSeparator: "," | "." | " ";
};

export const DEFAULT_DATE_TIME_PREFERENCES: DateTimePreferences = {
  timeFormat: "12h",
  dateFormat: "DD MMM YYYY",
  calendarSystem: "gregorian",
  timezone: DEFAULT_TIMEZONE,
  firstDayOfWeek: 1,
  currencySymbol: "ETB",
  decimalPlaces: 2,
  thousandSeparator: ",",
};

export type ResolvedDateTimePreferences = DateTimePreferences & {
  userTimeFormat?: TimeFormat;
  branchTimeFormat?: TimeFormat;
};

function pad2(n: number) {
  return String(n).padStart(2, "0");
}

export function toIsoDateKey(date: Date) {
  return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`;
}

export function parseDateInput(value: string) {
  const [year, month, day] = value.split("-").map(Number);
  if (!year || !month || !day) return null;
  return new Date(year, month - 1, day);
}

function addDays(date: Date, days: number) {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}

function startOfWeek(date: Date, firstDay: 0 | 1) {
  const next = new Date(date);
  const day = next.getDay();
  const diff = (day - firstDay + 7) % 7;
  next.setDate(next.getDate() - diff);
  next.setHours(0, 0, 0, 0);
  return next;
}

export type ResolvedDateRange = {
  fromDate: string;
  toDate: string;
  from: Date;
  to: Date;
};

/** Resolve a DateRangeValue (used by DateRangePicker consumers). */
export function resolveDateRangeValue(
  value: DateRangeValue,
  preferences: Partial<ResolvedDateTimePreferences> = {},
  today = new Date(),
): ResolvedDateRange {
  return resolveDateRange(
    value.preset,
    value.fromDate,
    value.toDate,
    today,
    preferences.firstDayOfWeek ?? 1,
  );
}

export function resolveDateRange(
  presetOrValue: DateRangePreset | DateRangeValue,
  fromDateOrPrefs: string | Partial<ResolvedDateTimePreferences> = "",
  toDate = "",
  today = new Date(),
  firstDayOfWeek: 0 | 1 = 1,
): ResolvedDateRange {
  // Support resolveDateRange(dateRangeValue, preferences) used across pages.
  if (typeof presetOrValue === "object" && presetOrValue !== null && "preset" in presetOrValue) {
    const prefs =
      fromDateOrPrefs && typeof fromDateOrPrefs === "object"
        ? (fromDateOrPrefs as Partial<ResolvedDateTimePreferences>)
        : {};
    return resolveDateRangeValue(presetOrValue, prefs, today);
  }

  const preset = presetOrValue as DateRangePreset;
  const fromDate = typeof fromDateOrPrefs === "string" ? fromDateOrPrefs : "";
  const base = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  let from = base;
  let to = base;

  switch (preset) {
    case "yesterday": {
      from = addDays(base, -1);
      to = addDays(base, -1);
      break;
    }
    case "this_week": {
      from = startOfWeek(base, firstDayOfWeek);
      to = base;
      break;
    }
    case "last_week": {
      const thisWeekStart = startOfWeek(base, firstDayOfWeek);
      from = addDays(thisWeekStart, -7);
      to = addDays(thisWeekStart, -1);
      break;
    }
    case "this_month": {
      from = new Date(base.getFullYear(), base.getMonth(), 1);
      to = base;
      break;
    }
    case "last_month": {
      from = new Date(base.getFullYear(), base.getMonth() - 1, 1);
      to = new Date(base.getFullYear(), base.getMonth(), 0);
      break;
    }
    case "this_year": {
      from = new Date(base.getFullYear(), 0, 1);
      to = base;
      break;
    }
    case "custom": {
      const parsedFrom = parseDateInput(fromDate);
      const parsedTo = parseDateInput(toDate);
      from = parsedFrom ?? base;
      to = parsedTo ?? base;
      if (from > to) [from, to] = [to, from];
      break;
    }
    case "today":
    default:
      break;
  }

  return { fromDate: toIsoDateKey(from), toDate: toIsoDateKey(to), from, to };
}

export function defaultDateRangeValue(): DateRangeValue {
  const today = toIsoDateKey(new Date());
  return { mode: "quick", preset: "today", fromDate: today, toDate: today };
}

function coerceDate(input: Date | string | number) {
  if (input instanceof Date) return input;
  const parsed = new Date(input);
  return Number.isNaN(parsed.getTime()) ? new Date() : parsed;
}

export function resolveTimeFormat(preferences?: Partial<ResolvedDateTimePreferences>): TimeFormat {
  return preferences?.userTimeFormat ?? preferences?.branchTimeFormat ?? preferences?.timeFormat ?? "12h";
}

export function formatTime(
  input: Date | string | number,
  preferences: Partial<ResolvedDateTimePreferences> = {},
  withSeconds = false,
) {
  const date = coerceDate(input);
  const timeFormat = resolveTimeFormat(preferences);
  const timezone = preferences.timezone ?? DEFAULT_TIMEZONE;

  if (timeFormat === "24h") {
    return new Intl.DateTimeFormat("en-GB", {
      timeZone: timezone,
      hour: "2-digit",
      minute: "2-digit",
      second: withSeconds ? "2-digit" : undefined,
      hour12: false,
    }).format(date);
  }

  return new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    hour: "numeric",
    minute: "2-digit",
    second: withSeconds ? "2-digit" : undefined,
    hour12: true,
  }).format(date);
}

export function formatClock(input: Date | string | number = new Date(), preferences?: Partial<ResolvedDateTimePreferences>) {
  return formatTime(input, preferences, false);
}

export function formatSyncClock(input: Date | string | number = new Date(), preferences?: Partial<ResolvedDateTimePreferences>) {
  return formatTime(input, preferences, true);
}

/** Format a 24h "HH:mm" string using calendar preferences (e.g. 19:00 → 7:00 PM). */
export function formatHmString(hm: string, preferences: Partial<ResolvedDateTimePreferences> = {}) {
  const match = hm.trim().match(/^(\d{1,2}):(\d{2})$/);
  if (!match) return hm;
  const hour = Number(match[1]);
  const minute = Number(match[2]);
  if (!Number.isFinite(hour) || !Number.isFinite(minute)) return hm;
  return formatTime(new Date(2000, 0, 1, hour, minute), preferences);
}

/** Returns true when the date cannot be parsed or falls inside the resolved range. */
export function isDateInResolvedRange(
  dateInput: string | Date,
  range: ResolvedDateRange,
) {
  const date =
    typeof dateInput === "string"
      ? parseDateInput(dateInput.slice(0, 10)) ?? new Date(dateInput)
      : dateInput;
  if (Number.isNaN(date.getTime())) return true;
  const key = toIsoDateKey(date);
  return key >= range.fromDate && key <= range.toDate;
}

const MONTHS_SHORT = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

function formatGregorianDate(date: Date, format: DateFormatKey) {
  const d = date.getDate();
  const m = date.getMonth() + 1;
  const y = date.getFullYear();
  const monthShort = MONTHS_SHORT[date.getMonth()] ?? "Jan";

  switch (format) {
    case "DD/MM/YYYY":
      return `${pad2(d)}/${pad2(m)}/${y}`;
    case "MM/DD/YYYY":
      return `${pad2(m)}/${pad2(d)}/${y}`;
    case "YYYY-MM-DD":
      return toIsoDateKey(date);
    case "MMM DD, YYYY":
      return `${monthShort} ${d}, ${y}`;
    case "DD MMM YYYY":
    default:
      return `${d} ${monthShort} ${y}`;
  }
}

export function formatDateLong(input: Date | string | number, preferences: Partial<ResolvedDateTimePreferences> = {}) {
  const date = coerceDate(input);
  const timezone = preferences.timezone ?? DEFAULT_TIMEZONE;
  return new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    month: "long",
    day: "numeric",
    year: "numeric",
  }).format(date);
}

export function formatDate(
  input: Date | string | number,
  preferences: Partial<ResolvedDateTimePreferences> = {},
  lang: "en" | "am" = "en",
) {
  const date = coerceDate(input);
  const format = preferences.dateFormat ?? DEFAULT_DATE_TIME_PREFERENCES.dateFormat;
  const calendarSystem = preferences.calendarSystem ?? "gregorian";
  const gregorian = formatGregorianDate(date, format);

  if (calendarSystem === "ethiopian") return formatEthiopic(date, lang);
  if (calendarSystem === "both") return `${gregorian} · ${formatEthiopic(date, lang)}`;
  return gregorian;
}

export function formatDateTime(
  input: Date | string | number,
  preferences: Partial<ResolvedDateTimePreferences> = {},
  lang: "en" | "am" = "en",
) {
  return `${formatDate(input, preferences, lang)} ${formatTime(input, preferences)}`;
}

export function formatDateRangeLabel(
  value: DateRangeValue,
  preferences: Partial<ResolvedDateTimePreferences> = {},
  lang: "en" | "am" = "en",
) {
  const resolved = resolveDateRange(value.preset, value.fromDate, value.toDate, new Date(), preferences.firstDayOfWeek ?? 1);
  const presetLabels: Record<DateRangePreset, { en: string; am: string }> = {
    today: { en: "Today", am: "ዛሬ" },
    yesterday: { en: "Yesterday", am: "ትላንት" },
    this_week: { en: "This Week", am: "ይህ ሳምንት" },
    last_week: { en: "Last Week", am: "ያለፈ ሳምንት" },
    this_month: { en: "This Month", am: "ይህ ወር" },
    last_month: { en: "Last Month", am: "ያለፈ ወር" },
    this_year: { en: "This Year", am: "ይህ ዓመት" },
    custom: { en: "Custom", am: "ብጁ" },
  };

  const presetLabel = lang === "am" ? presetLabels[value.preset].am : presetLabels[value.preset].en;
  if (value.preset === "today" || value.preset === "yesterday") {
    return `${presetLabel} — ${formatDateLong(resolved.from, preferences)}`;
  }
  if (resolved.fromDate === resolved.toDate) {
    return `${presetLabel} — ${formatDateLong(resolved.from, preferences)}`;
  }
  return `${presetLabel} — ${formatDate(resolved.from, preferences, lang)}–${formatDate(resolved.to, preferences, lang)}`;
}
