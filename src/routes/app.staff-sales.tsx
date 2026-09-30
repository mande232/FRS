import { createFileRoute } from "@tanstack/react-router";
import * as Icons from "lucide-react";
import {
  forwardRef,
  useEffect,
  useMemo,
  useState,
  type ComponentType,
  type ComponentPropsWithoutRef,
  type ComponentRef,
} from "react";
import { type DateRange } from "react-day-picker";
import { Bar, BarChart, CartesianGrid, XAxis, YAxis } from "recharts";
import {
  eachDayOfInterval,
  endOfDay,
  endOfMonth,
  endOfWeek,
  format,
  isValid,
  startOfDay,
  startOfMonth,
  startOfWeek,
  subDays,
} from "date-fns";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Drawer,
  DrawerContent,
  DrawerTrigger,
} from "@/components/ui/drawer";
import { Card, Chip, PageHeader, Stat } from "@/components/ui-kit";
import { RealtimeBadge } from "@/components/realtime-badge";
import { ChartContainer, ChartTooltip, ChartTooltipContent } from "@/components/ui/chart";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useAuth } from "@/lib/auth-context";
import { isFinalOrderStatus, type Order } from "@/lib/demo-data";
import { formatETB, formatEthiopic, toEthiopic } from "@/lib/ethiopic";
import { formatDateTime, formatTime } from "@/lib/date-time";
import { stockLocationLabel } from "@/lib/inventory-access";
import { loadSystemSettings } from "@/lib/system-settings";
import { useCalendar, useLang, type AppCalendar } from "@/lib/lang-context";
import { useT } from "@/lib/i18n";
import {
  OPERATIONAL_STOCK_LOCATIONS,
  stationToOperationalLocation,
  type OperationalStockLocation,
} from "@/lib/stock-management";
import { useStore } from "@/lib/store";

export const Route = createFileRoute("/app/staff-sales")({ component: StaffSales });

const ALL_ROLES = "__all_roles__";
const ALL_STAFF = "__all_staff__";
const ALL_DEPARTMENTS = "__all_departments__";

const DEPARTMENT_OPTIONS: OperationalStockLocation[] = [...OPERATIONAL_STOCK_LOCATIONS];

function departmentLabel(location: string, t: ReturnType<typeof useT>) {
  const label = stockLocationLabel(location);
  return t(label, label);
}

type ReportPeriod = "today" | "week" | "month" | "custom-date" | "custom-range";
type AssignmentSlot = "Waiter" | "Cashier" | "Collected By" | "Closed By" | "Station";

type StaffAssignment = {
  slot: AssignmentSlot;
  name: string;
  role: string;
  key: string;
};

type BaseReportOrder = {
  order: Order;
  timestamp: Date;
  assignments: StaffAssignment[];
  primaryAssignment: StaffAssignment;
  total: number;
  receiptNumber: string;
  status: "Completed" | "Cancelled";
  customer: string;
  table: string;
  dateTime: string;
  matchedByName: boolean;
  matchedByDepartment: boolean;
};

type ReportOrder = BaseReportOrder & {
  assignment: StaffAssignment;
};

type TransactionLineSummary = {
  key: string;
  name: string;
  qty: number;
  station: string;
  unitPrice?: number;
  unitLabel?: string;
  done?: boolean;
};

type SummaryInsight = "stations" | "items" | "staff";

const ROLE_PRIORITY = [
  "Administrator",
  "Waiter",
  "Cashier",
  "Branch Manager",
  "Supervisor",
  "Reception",
  "Hotel Staff",
  "Inventory Staff",
  "Bartender",
  "Bar Staff",
  "Butcher House Staff",
  "Butcher Staff",
  "Coffee House Staff",
  "Kitchen Staff",
  "Chef",
  "Accountant",
  "Storekeeper",
  "Procurement Officer",
  "Collected By",
  "Closed By",
] as const;

function compactAmount(value: number) {
  const amount = Math.abs(value);
  if (amount >= 1_000_000)
    return `${(value / 1_000_000).toFixed(amount % 1_000_000 === 0 ? 0 : 1)}M`;
  if (amount >= 1_000) return `${(value / 1_000).toFixed(amount % 1_000 === 0 ? 0 : 1)}K`;
  return `${Math.round(value)}`;
}

function cleanText(value?: string) {
  const trimmed = value?.trim();
  if (!trimmed) return "";
  const lowered = trimmed.toLowerCase();
  if (
    lowered === "pending cashier" ||
    lowered === "pending waiter" ||
    lowered === "unassigned" ||
    lowered === "unassigned waiter" ||
    lowered === "unknown" ||
    lowered === "-"
  ) {
    return "";
  }
  return trimmed;
}

function parseFlexibleDateTime(value?: string) {
  const trimmed = value?.trim();
  if (!trimmed) return null;

  const iso = trimmed.match(/^(\d{4})-(\d{2})-(\d{2})(?:[T\s].*)?$/);
  if (iso) {
    const parsed = new Date(trimmed);
    return isValid(parsed) ? parsed : null;
  }

  const gb =
    trimmed.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})(?:\s+(\d{1,2}):(\d{2})(?:\s*(AM|PM))?)?$/i) ??
    null;
  if (gb) {
    const day = Number(gb[1]);
    const month = Number(gb[2]) - 1;
    const year = Number(gb[3]);
    let hour = Number(gb[4] ?? "0");
    const minute = Number(gb[5] ?? "0");
    const period = gb[6]?.toUpperCase();
    if (period === "PM" && hour < 12) hour += 12;
    if (period === "AM" && hour === 12) hour = 0;
    const parsed = new Date(year, month, day, hour, minute, 0, 0);
    return isValid(parsed) ? parsed : null;
  }

  const parsed = new Date(trimmed);
  return isValid(parsed) ? parsed : null;
}

function getOrderWindow(order: Order) {
  if (order.status === "CANCELLED") {
    return (
      parseFlexibleDateTime(order.cancelledAt) ??
      parseFlexibleDateTime(order.payment?.closedAt) ??
      parseFlexibleDateTime(order.payment?.paymentReceivedAt) ??
      parseFlexibleDateTime(order.paymentReceivedAt) ??
      parseFlexibleDateTime(order.receiptGeneratedAt) ??
      parseFlexibleDateTime(order.sentAt)
    );
  }

  if (order.status === "CLOSED" || order.paymentStatus === "Paid") {
    return (
      parseFlexibleDateTime(order.payment?.closedAt) ??
      parseFlexibleDateTime(order.payment?.paymentReceivedAt) ??
      parseFlexibleDateTime(order.paymentReceivedAt) ??
      parseFlexibleDateTime(order.receiptGeneratedAt) ??
      parseFlexibleDateTime(order.sentAt)
    );
  }

  return parseFlexibleDateTime(order.receiptGeneratedAt) ?? parseFlexibleDateTime(order.sentAt);
}

function orderStatusLabel(order: Order, t: ReturnType<typeof useT>) {
  if (order.status === "CANCELLED") return t("Cancelled", "ተሰርዟል");
  if (order.status === "CLOSED" || order.paymentStatus === "Paid") return t("Completed", "ተጠናቋል");
  return order.status;
}

function orderStatusTone(order: Order) {
  if (order.status === "CANCELLED") return "destructive" as const;
  return "teff" as const;
}

function roleSortIndex(role: string) {
  const index = ROLE_PRIORITY.indexOf(role as (typeof ROLE_PRIORITY)[number]);
  return index === -1 ? 999 : index;
}

function sortRoleNames(a: string, b: string) {
  const diff = roleSortIndex(a) - roleSortIndex(b);
  if (diff !== 0) return diff;
  return a.localeCompare(b);
}

function formatDisplayDate(date: Date, lang: "en" | "am", calendar: AppCalendar) {
  if (calendar === "ethiopian") {
    return formatEthiopic(date, lang);
  }

  return date.toLocaleDateString(lang === "am" ? "am-ET" : "en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

function formatDisplayDateTime(date: Date, lang: "en" | "am", calendar: AppCalendar) {
  const prefs = loadSystemSettings().calendar;
  if (calendar === "ethiopian") {
    return `${formatEthiopic(date, lang)} ${formatTime(date, prefs)}`;
  }
  return formatDateTime(date, prefs, lang);
}

function normalizeRange(start: Date, end: Date) {
  return start.getTime() <= end.getTime() ? { start, end } : { start: end, end: start };
}

function resolveCustomRange(customDate: Date, customRange: DateRange | undefined) {
  const from = customRange?.from ?? customDate;
  const to = customRange?.to ?? customRange?.from ?? customDate;
  return normalizeRange(from, to);
}

function periodBounds(period: ReportPeriod, customDate: Date, customRange: DateRange | undefined) {
  if (period === "today") {
    return {
      start: startOfDay(customDate),
      end: endOfDay(customDate),
      bucket: "hour" as const,
    };
  }

  if (period === "week") {
    const start = startOfWeek(customDate, { weekStartsOn: 1 });
    return {
      start,
      end: endOfWeek(customDate, { weekStartsOn: 1 }),
      bucket: "day" as const,
    };
  }

  if (period === "month") {
    return {
      start: startOfMonth(customDate),
      end: endOfMonth(customDate),
      bucket: "day" as const,
    };
  }

  if (period === "custom-date") {
    return {
      start: startOfDay(customDate),
      end: endOfDay(customDate),
      bucket: "hour" as const,
    };
  }

  const normalized = resolveCustomRange(customDate, customRange);

  return {
    start: startOfDay(normalized.start),
    end: endOfDay(normalized.end),
    bucket: "day" as const,
  };
}

function periodLabel(
  period: ReportPeriod,
  customDate: Date,
  customRange: DateRange | undefined,
  lang: "en" | "am",
  calendar: AppCalendar,
  t: ReturnType<typeof useT>,
) {
  if (period === "today") return t("Today", "ዛሬ");
  if (period === "week") return t("This week", "ይህ ሳምንት");
  if (period === "month") return t("This month", "ይህ ወር");
  if (period === "custom-date") return formatDisplayDate(customDate, lang, calendar);

  const range = resolveCustomRange(customDate, customRange);
  return `${formatDisplayDate(range.start, lang, calendar)} - ${formatDisplayDate(
    range.end,
    lang,
    calendar,
  )}`;
}

function bucketLabel(date: Date, period: ReportPeriod, lang: "en" | "am", calendar: AppCalendar) {
  const prefs = loadSystemSettings().calendar;
  if (period === "today" || period === "custom-date") return formatTime(date, prefs);
  if (period === "week") {
    return date.toLocaleDateString(lang === "am" ? "am-ET" : "en-GB", {
      weekday: "short",
    });
  }

  if (calendar === "ethiopian") {
    const eth = toEthiopic(date);
    if (period === "month") return String(eth.day);
    return `${eth.day} ${lang === "am" ? eth.monthNameAm : eth.monthNameEn}`;
  }

  if (period === "month") return format(date, "d");
  return format(date, "d MMM");
}

function buildAssignments(order: Order, roleByName: Map<string, string>) {
  const candidates: Array<{ slot: AssignmentSlot; name?: string }> = [
    { slot: "Waiter", name: cleanText(order.waiter) || cleanText(order.orderedByWaiter) },
    {
      slot: "Cashier",
      name:
        cleanText(order.payment?.receivedByCashier) ||
        cleanText(order.enteredByCashier) ||
        cleanText(order.payment?.closedByCashier) ||
        cleanText(order.closedByCashier),
    },
    { slot: "Collected By", name: cleanText(order.payment?.collectedByWaiter) },
    {
      slot: "Closed By",
      name: cleanText(order.payment?.closedByCashier) || cleanText(order.closedByCashier),
    },
    ...(order.stationTickets ?? []).map((ticket) => ({
      slot: "Station" as const,
      name: cleanText(ticket.assignedStaff),
    })),
  ];

  const seen = new Set<string>();
  return candidates.flatMap((item) => {
    if (!item.name) return [];
    const role = roleByName.get(item.name.toLowerCase()) ?? item.slot;
    const key = `${item.slot}::${item.name.toLowerCase()}`;
    if (seen.has(key)) return [];
    seen.add(key);
    return [{ slot: item.slot, name: item.name, role, key }];
  });
}

function itemOperationalLocation(item: Order["items"][number]) {
  return (
    stationToOperationalLocation(item.stockDeductionLocation) ??
    stationToOperationalLocation(item.finalStation ?? item.station)
  );
}

function orderTouchesLocations(order: Order, locations: ReadonlySet<string>) {
  if (locations.size === 0) return false;
  for (const item of order.items ?? []) {
    const mapped = itemOperationalLocation(item);
    if (mapped && locations.has(mapped)) return true;
  }
  for (const ticket of order.stationTickets ?? []) {
    const mapped = stationToOperationalLocation(ticket.station);
    if (mapped && locations.has(mapped)) return true;
  }
  return false;
}

function departmentLineTotal(order: Order, locations: ReadonlySet<string>) {
  return (order.items ?? []).reduce((sum, item) => {
    const mapped = itemOperationalLocation(item);
    if (!mapped || !locations.has(mapped)) return sum;
    return sum + (item.unitPrice ?? 0) * item.qty;
  }, 0);
}

function departmentItems(order: Order, locations: ReadonlySet<string>) {
  if (locations.size === 0) return order.items ?? [];
  return (order.items ?? []).filter((item) => {
    const mapped = itemOperationalLocation(item);
    return mapped != null && locations.has(mapped);
  });
}

function departmentStations(order: Order, locations: ReadonlySet<string>) {
  const stations = new Set<string>();
  for (const item of departmentItems(order, locations)) {
    stations.add(item.finalStation ?? item.station);
  }
  for (const ticket of order.stationTickets ?? []) {
    const mapped = stationToOperationalLocation(ticket.station);
    if (mapped && locations.has(mapped)) stations.add(ticket.station);
  }
  return Array.from(stations);
}

function assignmentDisplayRole(assignment: StaffAssignment, t: ReturnType<typeof useT>) {
  return assignment.role === assignment.slot
    ? t(assignment.role, assignment.role)
    : `${t(assignment.slot, assignment.slot)} · ${t(assignment.role, assignment.role)}`;
}

function transactionLines(order: Order, locations?: ReadonlySet<string>) {
  const lines = order.items.map((item, index) => ({
    key: `${order.id}-${item.menuItemId ?? item.name}-${index}`,
    name: item.name,
    qty: item.qty,
    station: item.finalStation ?? item.station,
    unitPrice: item.unitPrice,
    unitLabel: item.unitLabel,
    done: item.done,
  }));
  if (!locations || locations.size === 0) return lines;
  return lines.filter((line) => {
    const mapped = stationToOperationalLocation(line.station);
    return mapped != null && locations.has(mapped);
  });
}

function uniqueStationsForOrder(order: Order, locations?: ReadonlySet<string>) {
  if (locations && locations.size > 0) return departmentStations(order, locations);
  return Array.from(
    new Set(order.stationTickets.map((ticket) => ticket.station).filter(Boolean)),
  );
}

function formatLineQty(line: TransactionLineSummary) {
  const qty = Number.isInteger(line.qty) ? String(line.qty) : line.qty.toFixed(2);
  return line.unitLabel ? `${qty} ${line.unitLabel}` : qty;
}

function summarizeStations(orders: ReportOrder[], locations?: ReadonlySet<string>) {
  const rows = new Map<string, { station: string; qty: number; revenue: number }>();
  orders.forEach((row) => {
    const items =
      locations && locations.size > 0 ? departmentItems(row.order, locations) : row.order.items;
    items.forEach((item) => {
      const station = item.finalStation ?? item.station;
      const current = rows.get(station) ?? { station, qty: 0, revenue: 0 };
      current.qty += item.qty;
      current.revenue += (item.unitPrice ?? 0) * item.qty;
      rows.set(station, current);
    });
  });
  return Array.from(rows.values()).sort((a, b) => b.revenue - a.revenue);
}

function summarizeItems(orders: ReportOrder[], locations?: ReadonlySet<string>) {
  const rows = new Map<string, { name: string; station: string; qty: number; revenue: number }>();
  orders.forEach((row) => {
    const items =
      locations && locations.size > 0 ? departmentItems(row.order, locations) : row.order.items;
    items.forEach((item) => {
      const key = `${item.menuItemId ?? item.name}:${item.finalStation ?? item.station}`;
      const current = rows.get(key) ?? {
        name: item.name,
        station: item.finalStation ?? item.station,
        qty: 0,
        revenue: 0,
      };
      current.qty += item.qty;
      current.revenue += (item.unitPrice ?? 0) * item.qty;
      rows.set(key, current);
    });
  });
  return Array.from(rows.values()).sort((a, b) => b.revenue - a.revenue);
}

function summarizeStaff(orders: Array<BaseReportOrder | ReportOrder>) {
  const rows = new Map<
    string,
    { name: string; role: string; orderIds: Set<string>; revenue: number }
  >();
  orders.forEach((row) => {
    const seen = new Set<string>();
    const assignments =
      "assignments" in row && row.assignments.length > 0
        ? row.assignments
        : "assignment" in row
          ? [row.assignment]
          : [];
    assignments.forEach((assignment) => {
      const nameKey = assignment.name.trim().toLowerCase();
      if (!nameKey || seen.has(nameKey)) return;
      seen.add(nameKey);
      const current = rows.get(nameKey) ?? {
        name: assignment.name,
        role: assignment.role,
        orderIds: new Set<string>(),
        revenue: 0,
      };
      if (!current.orderIds.has(row.order.id)) {
        current.orderIds.add(row.order.id);
        if (row.status === "Completed") current.revenue += row.total;
      }
      if (assignment.role !== assignment.slot) current.role = assignment.role;
      rows.set(nameKey, current);
    });
  });
  return Array.from(rows.values())
    .map((row) => ({
      name: row.name,
      role: row.role,
      orders: row.orderIds.size,
      revenue: row.revenue,
    }))
    .sort((a, b) => b.revenue - a.revenue || a.name.localeCompare(b.name));
}

function canViewAllStaffSales(role?: string) {
  if (!role) return false;
  const lowered = role.trim().toLowerCase();
  return lowered === "administrator" || lowered.includes("manager");
}

function useCompactRangePicker() {
  const [isCompact, setIsCompact] = useState(false);

  useEffect(() => {
    const mediaQuery = window.matchMedia("(max-width: 1023px)");
    const update = () => setIsCompact(mediaQuery.matches);

    update();
    mediaQuery.addEventListener("change", update);
    return () => mediaQuery.removeEventListener("change", update);
  }, []);

  return isCompact;
}

const RangePickerButton = forwardRef<
  ComponentRef<typeof Button>,
  { active: boolean; label: string; onOpen: () => void } & ComponentPropsWithoutRef<typeof Button>
>(({ active, label, onOpen, ...props }, ref) => {
  return (
    <Button
      ref={ref}
      type="button"
      variant={active ? "default" : "outline"}
      size="sm"
      {...props}
      onClick={(e) => {
        onOpen();
        props.onClick?.(e);
      }}
    >
      <Icons.CalendarRange className="size-4" />
      {label}
    </Button>
  );
});
RangePickerButton.displayName = "RangePickerButton";

function RangePickerPanel({
  customRange,
  customDate,
  active,
  calendar,
  lang,
  open,
  onActivate,
  setOpen,
  t,
  onRangeChange,
}: {
  customRange: DateRange;
  customDate: Date;
  active: boolean;
  calendar: AppCalendar;
  lang: "en" | "am";
  open: boolean;
  onActivate: () => void;
  setOpen: (open: boolean) => void;
  t: ReturnType<typeof useT>;
  onRangeChange: (range: DateRange) => void;
}) {
  const range = resolveCustomRange(customDate, customRange);
  const triggerLabel = t("Custom Range", "ብጁ ክልል");
  const triggerTitle =
    active || open
      ? `${formatDisplayDate(range.start, lang, calendar)} - ${formatDisplayDate(range.end, lang, calendar)}`
      : t("Custom Date Range", "ብጁ የቀን ክልል");
  const isCompact = useCompactRangePicker();
  const fromDate = range.start;
  const toDate = range.end;
  const [activeField, setActiveField] = useState<"from" | "to">("from");

  function setRangeField(field: "from" | "to", date: Date) {
    const nextDate = startOfDay(date);
    const currentFrom = startOfDay(customRange.from ?? fromDate);
    const currentTo = endOfDay(customRange.to ?? toDate);

    if (field === "from") {
      const normalized = normalizeRange(nextDate, currentTo);
      onRangeChange({
        from: startOfDay(normalized.start),
        to: endOfDay(normalized.end),
      });
      setActiveField("to");
      return;
    }

    const normalized = normalizeRange(currentFrom, endOfDay(nextDate));
    onRangeChange({
      from: startOfDay(normalized.start),
      to: endOfDay(normalized.end),
    });
  }

  const body = (
    <div className="space-y-2 p-2.5 sm:p-3">
      <div className="flex items-center justify-between gap-2 border-b border-border pb-1.5">
        <div className="min-w-0">
          <div className="text-xs font-semibold sm:text-sm">{t("Custom Date Range", "ብጁ የቀን ክልል")}</div>
        </div>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="h-7 px-2 text-[11px]"
          onClick={() => setOpen(false)}
        >
          {t("Done", "ተከናውኗል")}
        </Button>
      </div>

      <div className="grid gap-2 sm:grid-cols-2">
        <Button
          type="button"
          variant={activeField === "from" ? "default" : "outline"}
          className="h-10 w-full justify-between px-3 py-2 text-left"
          onClick={() => setActiveField("from")}
          title={formatDisplayDate(fromDate, lang, calendar)}
        >
          <span className="min-w-0 text-left">
            <span className="block text-[10px] leading-none text-muted-foreground">{t("From", "ከ")}</span>
            <span className="mt-0.5 block truncate text-sm font-medium">{formatDisplayDate(fromDate, lang, calendar)}</span>
          </span>
          <Icons.CalendarDays className="size-4 shrink-0" />
        </Button>
        <Button
          type="button"
          variant={activeField === "to" ? "default" : "outline"}
          className="h-10 w-full justify-between px-3 py-2 text-left"
          onClick={() => setActiveField("to")}
          title={formatDisplayDate(toDate, lang, calendar)}
        >
          <span className="min-w-0 text-left">
            <span className="block text-[10px] leading-none text-muted-foreground">{t("To", "እስከ")}</span>
            <span className="mt-0.5 block truncate text-sm font-medium">{formatDisplayDate(toDate, lang, calendar)}</span>
          </span>
          <Icons.CalendarDays className="size-4 shrink-0" />
        </Button>
      </div>

      <div className="rounded-md border border-border bg-card p-1.5">
        <div className="mb-1 flex items-center justify-between px-1 text-[10px] text-muted-foreground">
          <span>{activeField === "from" ? t("From", "ከ") : t("To", "እስከ")}</span>
          <span className="font-medium text-primary">
            {activeField === "from" ? t("Start date", "መነሻ ቀን") : t("End date", "መጨረሻ ቀን")}
          </span>
        </div>
        <Calendar
          mode="single"
          selected={activeField === "from" ? fromDate : toDate}
          onSelect={(date) => {
            if (!date) return;
            setRangeField(activeField, date);
          }}
          captionLayout="dropdown"
          initialFocus
          className="[--cell-size:1.6rem] sm:[--cell-size:1.7rem]"
          numberOfMonths={1}
        />
      </div>

      <div className="text-[10px] leading-4 text-muted-foreground sm:text-[11px]">
        {t("Selected range", "የተመረጠ ክልል")}: {formatDisplayDate(fromDate, lang, calendar)} -{" "}
        {formatDisplayDate(toDate, lang, calendar)}
      </div>
    </div>
  );

  if (isCompact) {
    return (
      <Drawer
        open={open}
        onOpenChange={(nextOpen) => {
          if (nextOpen) onActivate();
          setOpen(nextOpen);
        }}
      >
        <DrawerTrigger asChild>
          <RangePickerButton
            active={active || open}
            label={triggerLabel}
            title={triggerTitle}
            onOpen={() => {
              onActivate();
            }}
          />
        </DrawerTrigger>
        <DrawerContent className="max-h-[92vh] overflow-y-auto px-0 pb-0">
          {body}
        </DrawerContent>
      </Drawer>
    );
  }

  return (
    <Popover
      open={open}
      onOpenChange={(nextOpen) => {
        if (nextOpen) onActivate();
        setOpen(nextOpen);
      }}
    >
      <PopoverTrigger asChild>
        <RangePickerButton
          active={active || open}
          label={triggerLabel}
          title={triggerTitle}
          onOpen={() => {
            onActivate();
          }}
        />
      </PopoverTrigger>
      <PopoverContent className="w-[min(23rem,calc(100vw-1rem))] p-0" align="start">
        {body}
      </PopoverContent>
    </Popover>
  );
}

function StaffSales() {
  const { user, users } = useAuth();
  const store = useStore();
  const t = useT();
  const lang = useLang();
  const calendar = useCalendar();
  const canViewAll = canViewAllStaffSales(user?.role);
  const currentUserName = (user?.name ?? "").trim().toLowerCase();
  const today = useMemo(() => new Date(), []);
  const [period, setPeriod] = useState<ReportPeriod>("today");
  const [selectedRole, setSelectedRole] = useState<string>(ALL_ROLES);
  const [selectedStaff, setSelectedStaff] = useState<string>(ALL_STAFF);
  const [selectedDepartment, setSelectedDepartment] = useState<string>(ALL_DEPARTMENTS);
  const [customDate, setCustomDate] = useState<Date>(today);
  const [customRange, setCustomRange] = useState<DateRange>({
    from: subDays(today, 6),
    to: today,
  });
  const [datePickerOpen, setDatePickerOpen] = useState(false);
  const [rangePickerOpen, setRangePickerOpen] = useState(false);
  const [historyPage, setHistoryPage] = useState(1);
  const [selectedTransaction, setSelectedTransaction] = useState<ReportOrder | null>(null);
  const [selectedInsight, setSelectedInsight] = useState<SummaryInsight | null>(null);

  const departmentLocations = useMemo(() => {
    if (!canViewAll || selectedDepartment === ALL_DEPARTMENTS) return new Set<string>();
    return new Set([selectedDepartment]);
  }, [canViewAll, selectedDepartment]);
  const scopeByDepartment = departmentLocations.size > 0;

  const roleByName = useMemo(() => {
    const map = new Map<string, string>();
    users.forEach((item) => {
      map.set(item.name.trim().toLowerCase(), item.role);
    });
    return map;
  }, [users]);

  const { start, end, bucket } = useMemo(
    () => periodBounds(period, customDate, customRange),
    [customDate, customRange, period],
  );

  const periodOrders = useMemo<BaseReportOrder[]>(() => {
    return store.orders
      .filter((order) => isFinalOrderStatus(order.status) || order.paymentStatus === "Paid")
      .map((order) => {
        const timestamp = getOrderWindow(order);
        if (!timestamp || timestamp < start || timestamp > end) return null;

        const assignments = buildAssignments(order, roleByName);
        const touchesDepartment =
          scopeByDepartment && orderTouchesLocations(order, departmentLocations);
        if (scopeByDepartment) {
          if (!touchesDepartment) return null;
        } else if (assignments.length === 0) {
          return null;
        }

        const departmentAssignment: StaffAssignment | null = scopeByDepartment
          ? !canViewAll && user
            ? {
                slot: "Station",
                name: user.name,
                role: user.role,
                key: `station::${user.name.trim().toLowerCase()}::${[...departmentLocations].join(",")}`,
              }
            : {
                slot: "Station",
                name: [...departmentLocations].map((loc) => stockLocationLabel(loc)).join(", "),
                role: "Department",
                key: `department::${[...departmentLocations].join(",")}`,
              }
          : null;

        const primaryAssignment =
          assignments.find((assignment) => assignment.slot === "Waiter") ||
          assignments.find((assignment) => assignment.slot === "Cashier") ||
          assignments.find((assignment) => assignment.slot === "Station") ||
          departmentAssignment ||
          assignments[0];

        if (!primaryAssignment) return null;

        const fullTotal = order.payment?.totalAmount ?? order.receipt?.grandTotal ?? order.total;
        const total = scopeByDepartment
          ? departmentLineTotal(order, departmentLocations)
          : fullTotal;
        if (scopeByDepartment && total <= 0) return null;

        return {
          order,
          timestamp,
          total,
          receiptNumber:
            cleanText(order.receiptNumber) ||
            cleanText(order.receipt?.receiptNumber) ||
            order.orderNo,
          status:
            order.status === "CANCELLED"
              ? "Cancelled"
              : order.status === "CLOSED" || order.paymentStatus === "Paid"
                ? "Completed"
                : "Completed",
          customer:
            cleanText(order.customerName) ||
            (order.source === "QR"
              ? t("Guest", "እንግዳ")
              : order.source === "Delivery"
                ? t("Delivery customer", "የማድረሻ ደንበኛ")
                : order.source === "Room"
                  ? t("Room guest", "የክፍል እንግዳ")
                  : order.source === "Takeaway"
                    ? t("Takeaway customer", "የመውሰጃ ደንበኛ")
                    : t("Walk-in", "በመጣ ደንበኛ")),
          table: `${order.area} ${order.tableNumber}`.trim(),
          dateTime: formatDisplayDateTime(timestamp, lang, calendar),
          assignments: departmentAssignment
            ? [...assignments, departmentAssignment].filter(
                (assignment, index, list) =>
                  list.findIndex((row) => row.key === assignment.key) === index,
              )
            : assignments,
          primaryAssignment,
          matchedByName: assignments.some(
            (assignment) => assignment.name.trim().toLowerCase() === currentUserName,
          ),
          matchedByDepartment: Boolean(touchesDepartment),
        };
      })
      .filter((item): item is BaseReportOrder => item !== null)
      .sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());
  }, [
    canViewAll,
    calendar,
    currentUserName,
    departmentLocations,
    end,
    lang,
    period,
    roleByName,
    scopeByDepartment,
    start,
    store.orders,
    t,
    user,
  ]);

  const orderRows = useMemo<ReportOrder[]>(() => {
    return periodOrders
      .filter((row) => {
        const matchedByName = row.assignments.some(
          (assignment) => assignment.name.trim().toLowerCase() === currentUserName,
        );
        const matchedByDepartment = scopeByDepartment && row.matchedByDepartment;
        if (!canViewAll && !matchedByName && !matchedByDepartment) {
          return false;
        }

        const matchesRole =
          selectedRole === ALL_ROLES ||
          row.assignments.some(
            (assignment) => assignment.slot === selectedRole || assignment.role === selectedRole,
          );
        if (!matchesRole) return false;

        const matchesStaff =
          selectedStaff === ALL_STAFF ||
          row.assignments.some((assignment) => assignment.key === selectedStaff);
        return matchesStaff;
      })
      .map((row) => {
        const assignment =
          (selectedStaff !== ALL_STAFF &&
            row.assignments.find((item) => item.key === selectedStaff)) ||
          (selectedRole !== ALL_ROLES &&
            row.assignments.find(
              (item) => item.slot === selectedRole || item.role === selectedRole,
            )) ||
          (!canViewAll &&
            row.assignments.find(
              (item) => item.name.trim().toLowerCase() === currentUserName,
            )) ||
          row.primaryAssignment;

        return {
          ...row,
          assignment,
        };
      })
      .sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());
  }, [
    canViewAll,
    currentUserName,
    periodOrders,
    scopeByDepartment,
    selectedRole,
    selectedStaff,
  ]);

  const historyPageSize = 10;
  const historyPageCount = Math.max(1, Math.ceil(orderRows.length / historyPageSize));
  const activeHistoryPage = Math.min(historyPage, historyPageCount);
  const historyPageStart = (activeHistoryPage - 1) * historyPageSize;
  const historyRows = orderRows.slice(historyPageStart, historyPageStart + historyPageSize);
  const historyFrom = orderRows.length === 0 ? 0 : historyPageStart + 1;
  const historyTo = historyPageStart + historyRows.length;

  useEffect(() => {
    setHistoryPage((page) => Math.min(page, historyPageCount));
  }, [historyPageCount]);

  const roleOptions = useMemo(() => {
    const roles = new Set<string>();
    periodOrders.forEach((row) => {
      row.assignments.forEach((assignment) => {
        roles.add(assignment.slot);
        roles.add(assignment.role);
      });
    });
    roles.add(selectedRole);
    roles.delete(ALL_ROLES);
    return [ALL_ROLES, ...Array.from(roles).filter(Boolean).sort(sortRoleNames)];
  }, [periodOrders, selectedRole]);

  const staffOptions = useMemo(() => {
    const byKey = new Map<string, { key: string; label: string; role: string }>();
    periodOrders.forEach((row) => {
      row.assignments.forEach((assignment) => {
        if (
          selectedRole !== ALL_ROLES &&
          assignment.slot !== selectedRole &&
          assignment.role !== selectedRole
        ) {
          return;
        }
        if (!byKey.has(assignment.key)) {
          byKey.set(assignment.key, {
            key: assignment.key,
            label: `${assignment.name} · ${assignmentDisplayRole(assignment, t)}`,
            role: assignment.role,
          });
        }
      });
    });
    return Array.from(byKey.values()).sort((a, b) => {
      const roleDiff = sortRoleNames(a.role, b.role);
      if (roleDiff !== 0) return roleDiff;
      return a.label.localeCompare(b.label);
    });
  }, [periodOrders, selectedRole, t]);

  useEffect(() => {
    if (selectedStaff === ALL_STAFF) return;
    if (!staffOptions.some((option) => option.key === selectedStaff)) {
      setSelectedStaff(ALL_STAFF);
    }
  }, [selectedStaff, staffOptions]);

  const completedOrders = orderRows.filter(
    (row) =>
      row.status === "Completed" &&
      (row.order.status === "CLOSED" || row.order.paymentStatus === "Paid"),
  );
  const cancelledOrders = orderRows.filter((row) => row.status === "Cancelled");
  const totalSales = completedOrders.reduce((sum, row) => sum + row.total, 0);
  const totalOrders = completedOrders.length + cancelledOrders.length;
  const averageOrderValue = completedOrders.length > 0 ? totalSales / completedOrders.length : 0;
  const topStations = useMemo(
    () => summarizeStations(completedOrders, scopeByDepartment ? departmentLocations : undefined),
    [completedOrders, departmentLocations, scopeByDepartment],
  );
  const topItems = useMemo(
    () => summarizeItems(completedOrders, scopeByDepartment ? departmentLocations : undefined),
    [completedOrders, departmentLocations, scopeByDepartment],
  );
  const topStaff = useMemo(() => {
    if (canViewAll && selectedStaff === ALL_STAFF && selectedRole === ALL_ROLES) {
      return summarizeStaff(orderRows);
    }

    return summarizeStaff(
      orderRows.map((row) => ({
        ...row,
        assignments: row.assignments.filter((assignment) => {
          if (!canViewAll) {
            return assignment.name.trim().toLowerCase() === currentUserName;
          }
          if (selectedStaff !== ALL_STAFF) return assignment.key === selectedStaff;
          return assignment.slot === selectedRole || assignment.role === selectedRole;
        }),
      })),
    );
  }, [canViewAll, currentUserName, orderRows, selectedRole, selectedStaff]);

  const chartData = useMemo(() => {
    if (bucket === "hour") {
      const points = Array.from({ length: 24 }, (_, hour) => ({
        label: `${String(hour).padStart(2, "0")}:00`,
        sales: 0,
      }));

      completedOrders.forEach((row) => {
        const point = points[row.timestamp.getHours()];
        if (point) point.sales += row.total;
      });

      return points;
    }

    const points = eachDayOfInterval({ start, end }).map((date) => ({
      date,
      label: bucketLabel(date, period, lang, calendar),
      sales: 0,
    }));

    const index = new Map(
      points.map((point) => [format(point.date, "yyyy-MM-dd"), point] as const),
    );
    completedOrders.forEach((row) => {
      const key = format(row.timestamp, "yyyy-MM-dd");
      const point = index.get(key);
      if (point) point.sales += row.total;
    });

    return points.map(({ date: _date, ...point }) => point);
  }, [bucket, calendar, completedOrders, end, lang, period, start]);

  const headerTitle = t("Staff Sales", "የሰራተኞች ሽያጭ");

  function resetFilters() {
    const nextToday = new Date();
    setPeriod("today");
    setSelectedRole(ALL_ROLES);
    setSelectedStaff(ALL_STAFF);
    setSelectedDepartment(ALL_DEPARTMENTS);
    setCustomDate(nextToday);
    setCustomRange({ from: subDays(nextToday, 6), to: nextToday });
    setDatePickerOpen(false);
    setRangePickerOpen(false);
  }

  function periodButton(
    value: ReportPeriod,
    label: string,
    icon: keyof typeof Icons,
    onClick?: () => void,
  ) {
    const active = period === value;
    const Icon = Icons[icon] as ComponentType<{ className?: string }>;
    return (
      <Button
        type="button"
        variant={active ? "default" : "outline"}
        size="sm"
        onClick={onClick ?? (() => setPeriod(value))}
        className="justify-start"
      >
        <Icon className="size-4" />
        {label}
      </Button>
    );
  }

  return (
    <div className="min-w-0 space-y-6">
      <PageHeader
        title={headerTitle}
        action={
          <div className="flex items-center gap-2">
            <RealtimeBadge status={store.realtimeStatus} lastSyncAt={store.lastRealtimeSyncAt} />
            <Button type="button" variant="outline" size="sm" onClick={resetFilters}>
              <Icons.RotateCcw className="size-4" />
              {t("Reset", "ዳግም አስጀምር")}
            </Button>
          </div>
        }
      />

      <Card className="space-y-4">
        <div className="flex flex-wrap gap-2">
          {periodButton("today", t("Today", "ዛሬ"), "Clock3")}
          {periodButton("week", t("This Week", "ይህ ሳምንት"), "CalendarRange")}
          {periodButton("month", t("This Month", "ይህ ወር"), "CalendarDays")}

          <Popover
            open={datePickerOpen}
            onOpenChange={(nextOpen) => {
              if (nextOpen) setPeriod("custom-date");
              setDatePickerOpen(nextOpen);
            }}
          >
            <PopoverTrigger asChild>
              <Button
                type="button"
                variant={period === "custom-date" ? "default" : "outline"}
                size="sm"
                onClick={() => {
                  setPeriod("custom-date");
                }}
              >
                <Icons.CalendarDays className="size-4" />
                {period === "custom-date"
                  ? formatDisplayDate(customDate, lang, calendar)
                  : t("Custom Date", "ብጁ ቀን")}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0" align="start">
              <Calendar
                mode="single"
                selected={customDate}
                onSelect={(date) => {
                  if (!date) return;
                  setCustomDate(date);
                  setDatePickerOpen(false);
                }}
                initialFocus
              />
            </PopoverContent>
          </Popover>

          <RangePickerPanel
            customRange={customRange}
            customDate={customDate}
            active={period === "custom-range"}
            calendar={calendar}
            lang={lang}
            open={rangePickerOpen}
            onActivate={() => setPeriod("custom-range")}
            setOpen={setRangePickerOpen}
            t={t}
            onRangeChange={(range) => {
              setCustomRange(range);
              setPeriod("custom-range");
            }}
          />
        </div>

        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_minmax(0,1fr)_auto]">
          {canViewAll ? (
            <>
              <Select value={selectedDepartment} onValueChange={setSelectedDepartment}>
                <SelectTrigger>
                  <SelectValue placeholder={t("All departments", "ሁሉም ክፍሎች")} />
                </SelectTrigger>
                <SelectContent className="min-w-[16rem]">
                  <SelectItem value={ALL_DEPARTMENTS}>
                    {t("All departments", "ሁሉም ክፍሎች")}
                  </SelectItem>
                  {DEPARTMENT_OPTIONS.map((department) => (
                    <SelectItem key={department} value={department}>
                      {departmentLabel(department, t)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              <Select value={selectedStaff} onValueChange={setSelectedStaff}>
                <SelectTrigger>
                  <SelectValue placeholder={t("All staff", "ሁሉም ሰራተኞች")} />
                </SelectTrigger>
                <SelectContent className="min-w-[18rem]">
                  <SelectItem value={ALL_STAFF}>{t("All staff", "ሁሉም ሰራተኞች")}</SelectItem>
                  {staffOptions.map((option) => (
                    <SelectItem key={option.key} value={option.key}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              <Select value={selectedRole} onValueChange={setSelectedRole}>
                <SelectTrigger>
                  <SelectValue placeholder={t("All roles", "ሁሉም ሚናዎች")} />
                </SelectTrigger>
                <SelectContent className="min-w-[18rem]">
                  {roleOptions.map((role) => (
                    <SelectItem key={role} value={role}>
                      {role === ALL_ROLES ? t("All roles", "ሁሉም ሚናዎች") : t(role, role)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </>
          ) : (
            <div className="flex min-h-10 items-center justify-between gap-3 rounded-md border border-border bg-surface/40 px-3 py-2 text-sm md:col-span-2 xl:col-span-3">
              <span className="text-muted-foreground">{t("Scope", "ክልል")}</span>
              <span className="font-medium">
                {user?.name ?? t("Own sales only", "የራስ ሽያጭ ብቻ")}
                {scopeByDepartment
                  ? ` · ${[...departmentLocations].map((loc) => departmentLabel(loc, t)).join(", ")}`
                  : ` · ${t("Own sales only", "የራስ ሽያጭ ብቻ")}`}
              </span>
            </div>
          )}

          <div className="flex items-center justify-between gap-3 rounded-md border border-border bg-surface/40 px-3 py-2 text-sm">
            <span className="text-muted-foreground">{t("Period", "ጊዜ")}</span>
            <span className="font-medium">
              {periodLabel(period, customDate, customRange, lang, calendar, t)}
            </span>
          </div>
        </div>
      </Card>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-5">
        <Stat
          label={t("Total Sales", "ጠቅላላ ሽያጭ")}
          value={formatETB(totalSales, lang)}
          tone="ember"
          icon="BadgeDollarSign"
        />
        <Stat
          label={t("Total Orders", "ጠቅላላ ትዕዛዞች")}
          value={String(totalOrders)}
          tone="teff"
          icon="Receipt"
        />
        <Stat
          label={t("Average Order Value", "አማካይ የትዕዛዝ ዋጋ")}
          value={formatETB(averageOrderValue, lang)}
          tone="gold"
          icon="TrendingUp"
        />
        <Stat
          label={t("Completed Orders", "የተጠናቀቁ ትዕዛዞች")}
          value={String(completedOrders.length)}
          icon="BadgeCheck"
        />
        <Stat
          label={t("Cancelled Orders", "የተሰረዙ ትዕዛዞች")}
          value={String(cancelledOrders.length)}
          tone="ember"
          icon="Ban"
        />
      </div>

      <div className="grid gap-3 xl:grid-cols-3">
        <Card className="border-ember/20 bg-gradient-to-br from-ember/5 via-card to-card p-0 overflow-hidden">
          <button
            type="button"
            className="w-full cursor-pointer p-6 text-left transition hover:bg-ember/10"
            onClick={() => setSelectedInsight("stations")}
          >
            <div className="mb-3 flex items-center justify-between gap-3">
              <div>
              <h3 className="font-display text-lg font-semibold">{t("Stations", "ጣቢያዎች")}</h3>
              </div>
              <Chip tone="ember">{topStations.length}</Chip>
            </div>
            <div className="space-y-2">
              {topStations.map((station, index) => (
                <div key={station.station} className="flex items-center gap-3 rounded-lg bg-surface-2/70 p-3">
                  <span className="grid size-7 place-items-center rounded-md bg-card text-xs font-semibold">{index + 1}</span>
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-medium">{station.station}</div>
                    <div className="text-xs text-muted-foreground">{station.qty} {t("items sold", "እቃዎች ተሸጡ")}</div>
                  </div>
                  <div className="text-right font-mono text-sm">{formatETB(station.revenue, lang)}</div>
                </div>
              ))}
            </div>
          </button>
        </Card>

        <Card className="border-teff/20 bg-gradient-to-br from-teff/5 via-card to-card p-0 overflow-hidden">
          <button
            type="button"
            className="w-full cursor-pointer p-6 text-left transition hover:bg-teff/10"
            onClick={() => setSelectedInsight("items")}
          >
            <div className="mb-3 flex items-center justify-between gap-3">
              <div>
              <h3 className="font-display text-lg font-semibold">{t("Sold items", "የተሸጡ እቃዎች")}</h3>
              </div>
              <Chip tone="teff">{topItems.length}</Chip>
            </div>
            <div className="space-y-2">
              {topItems.map((item, index) => (
                <div key={`${item.name}-${item.station}`} className="flex items-center gap-3 rounded-lg bg-surface-2/70 p-3">
                  <span className="grid size-7 place-items-center rounded-md bg-card text-xs font-semibold">{index + 1}</span>
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-medium">{item.name}</div>
                    <div className="text-xs text-muted-foreground">{item.station} · {item.qty} {t("sold", "ተሸጠ")}</div>
                  </div>
                  <div className="text-right font-mono text-sm">{formatETB(item.revenue, lang)}</div>
                </div>
              ))}
            </div>
          </button>
        </Card>

        <Card className="border-gold/20 bg-gradient-to-br from-gold/5 via-card to-card p-0 overflow-hidden">
          <button
            type="button"
            className="w-full cursor-pointer p-6 text-left transition hover:bg-gold/10"
            onClick={() => setSelectedInsight("staff")}
          >
            <div className="mb-3 flex items-center justify-between gap-3">
              <div>
                <h3 className="font-display text-lg font-semibold">{t("Staff totals", "የሰራተኞች ጠቅላላ")}</h3>
              </div>
              <Chip tone="gold">{topStaff.length}</Chip>
            </div>
            <div className="space-y-2">
              {topStaff.length > 0 ? (
                topStaff.map((staff, index) => (
                  <div key={`${staff.name}-${staff.role}`} className="flex items-center gap-3 rounded-lg bg-surface-2/70 p-3">
                    <span className="grid size-7 place-items-center rounded-md bg-card text-xs font-semibold">{index + 1}</span>
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-sm font-medium">{staff.name}</div>
                      <div className="text-xs text-muted-foreground">
                        {t(staff.role, staff.role)} · {staff.orders} {t("orders", "ትዕዛዞች")}
                      </div>
                    </div>
                    <div className="text-right font-mono text-sm font-semibold">
                      {formatETB(staff.revenue, lang)}
                    </div>
                  </div>
                ))
              ) : (
                <div className="rounded-lg bg-surface-2/70 p-3 text-sm text-muted-foreground">
                  {t("No staff sales", "የሰራተኛ ሽያጭ የለም")}
                </div>
              )}
            </div>
          </button>
        </Card>
      </div>

      <Card className="!p-0 overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-5 py-4">
          <div className="min-w-0">
            <h3 className="font-display text-lg font-semibold">
              {t("Total sales by staff", "ጠቅላላ ሽያጭ በሰራተኛ")}
            </h3>
          </div>
          <Chip tone={topStaff.length > 0 ? "gold" : "muted"}>{topStaff.length}</Chip>
        </div>
        {topStaff.length > 0 ? (
          <div className="overflow-x-auto">
            <Table className="min-w-[640px] text-sm">
              <TableHeader className="bg-surface-2">
                <TableRow>
                  <TableHead className="px-4 py-3 w-12">#</TableHead>
                  <TableHead className="px-4 py-3">{t("Staff Name", "የሰራተኛ ስም")}</TableHead>
                  <TableHead className="px-4 py-3">{t("Role", "ሚና")}</TableHead>
                  <TableHead className="px-4 py-3 text-right">{t("Orders", "ትዕዛዞች")}</TableHead>
                  <TableHead className="px-4 py-3 text-right">{t("Total Sales", "ጠቅላላ ሽያጭ")}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {topStaff.map((staff, index) => (
                  <TableRow key={`staff-total-${staff.name}-${staff.role}`}>
                    <TableCell className="px-4 py-3 text-muted-foreground">{index + 1}</TableCell>
                    <TableCell className="px-4 py-3 font-medium">{staff.name}</TableCell>
                    <TableCell className="px-4 py-3 text-muted-foreground">
                      {t(staff.role, staff.role)}
                    </TableCell>
                    <TableCell className="px-4 py-3 text-right font-mono">{staff.orders}</TableCell>
                    <TableCell className="px-4 py-3 text-right font-mono font-semibold">
                      {formatETB(staff.revenue, lang)}
                    </TableCell>
                  </TableRow>
                ))}
                <TableRow className="bg-surface-2/80 font-semibold">
                  <TableCell className="px-4 py-3" colSpan={3}>
                    {canViewAll
                      ? t("All staff", "ሁሉም ሰራተኞች")
                      : t("My total", "የእኔ ጠቅላላ")}
                  </TableCell>
                  <TableCell className="px-4 py-3 text-right font-mono">{completedOrders.length}</TableCell>
                  <TableCell className="px-4 py-3 text-right font-mono">{formatETB(totalSales, lang)}</TableCell>
                </TableRow>
              </TableBody>
            </Table>
          </div>
        ) : (
          <div className="grid place-items-center gap-2 px-5 py-12 text-center text-sm text-muted-foreground">
            <Icons.Users className="size-5" />
            <div>{t("No staff sales", "የሰራተኛ ሽያጭ የለም")}</div>
          </div>
        )}
      </Card>

      <Card className="!p-0 overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-5 py-4">
          <div className="min-w-0">
            <h3 className="font-display text-lg font-semibold">{t("Sales Trend", "የሽያጭ አዝማሚያ")}</h3>
          </div>
          <Chip tone="muted">
            {completedOrders.length} {t("completed", "ተጠናቋል")}
          </Chip>
        </div>

        <div className="relative h-[340px] w-full px-3 py-4 sm:px-5">
          <ChartContainer
            className="h-[308px] w-full"
            config={{
              sales: {
                label: t("Total Sales", "ጠቅላላ ሽያጭ"),
                color: "var(--ember)",
              },
            }}
          >
            <BarChart data={chartData} margin={{ left: 0, right: 8, top: 8, bottom: 8 }}>
              <CartesianGrid vertical={false} strokeDasharray="3 3" />
              <XAxis
                dataKey="label"
                tickLine={false}
                axisLine={false}
                tickMargin={8}
                interval="preserveStartEnd"
              />
              <YAxis
                tickLine={false}
                axisLine={false}
                tickMargin={8}
                width={56}
                tickFormatter={(value) => compactAmount(Number(value))}
              />
              <ChartTooltip
                cursor={false}
                content={
                  <ChartTooltipContent
                    indicator="dot"
                    labelFormatter={(label) => String(label)}
                    formatter={(value) => (
                      <div className="flex w-full items-center justify-between gap-6">
                        <span className="text-muted-foreground">{t("Sales", "ሽያጭ")}</span>
                        <span className="font-mono font-medium">
                          {formatETB(Number(value), lang)}
                        </span>
                      </div>
                    )}
                  />
                }
              />
              <Bar dataKey="sales" fill="var(--color-sales)" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ChartContainer>

          {completedOrders.length === 0 && (
            <div className="pointer-events-none absolute inset-x-0 top-1/2 -translate-y-1/2 px-5 text-center text-sm text-muted-foreground">
              {t("No sales", "ሽያጭ የለም")}
            </div>
          )}
        </div>
      </Card>

      <Card className="!p-0 overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-5 py-4">
          <div className="min-w-0">
            <h3 className="font-display text-lg font-semibold">
              {t("Transaction History", "የግብይት ታሪክ")}
            </h3>
          </div>
          <Chip tone={totalOrders > 0 ? "teff" : "muted"}>{totalOrders}</Chip>
        </div>

        {orderRows.length > 0 ? (
          <>
          <div className="overflow-x-auto">
            <Table className="min-w-[1100px] text-sm">
              <TableHeader className="bg-surface-2">
              <TableRow>
                <TableHead className="px-4 py-3">{t("Receipt Number", "የደረሰኝ ቁጥር")}</TableHead>
                <TableHead className="px-4 py-3">{t("Date & Time", "ቀን እና ሰዓት")}</TableHead>
                <TableHead className="px-4 py-3">{t("Staff Name", "የሰራተኛ ስም")}</TableHead>
                <TableHead className="px-4 py-3">{t("Table", "ጠረጴዛ")}</TableHead>
                <TableHead className="px-4 py-3">{t("Customer", "ደንበኛ")}</TableHead>
                <TableHead className="px-4 py-3">{t("Menu & Stations", "ምናሌ እና ጣቢያዎች")}</TableHead>
                <TableHead className="px-4 py-3">{t("Order Status", "የትዕዛዝ ሁኔታ")}</TableHead>
                <TableHead className="px-4 py-3 text-right">{t("Total", "ጠቅላላ")}</TableHead>
              </TableRow>
              </TableHeader>
              <TableBody>
                {historyRows.map((row) => (
                <TableRow
                  key={row.order.id}
                  className="cursor-pointer hover:bg-surface-2/60"
                  onClick={() => setSelectedTransaction(row)}
                >
                  <TableCell className="px-4 py-3">
                    <div className="font-mono text-xs font-semibold">{row.receiptNumber}</div>
                  </TableCell>
                  <TableCell className="px-4 py-3 whitespace-nowrap">
                    <div>{row.dateTime}</div>
                  </TableCell>
                  <TableCell className="px-4 py-3">
                    <div className="min-w-0">
                      <div className="font-medium">{row.assignment.name}</div>
                      <div className="text-xs text-muted-foreground">
                        {assignmentDisplayRole(row.assignment, t)}
                      </div>
                    </div>
                  </TableCell>
                  <TableCell className="px-4 py-3 whitespace-nowrap">{row.table}</TableCell>
                  <TableCell className="px-4 py-3">{row.customer}</TableCell>
                  <TableCell className="px-4 py-3">
                    <div className="min-w-[220px] space-y-2">
                      <div className="flex flex-wrap gap-1">
                        {uniqueStationsForOrder(
                          row.order,
                          scopeByDepartment ? departmentLocations : undefined,
                        ).map((station) => (
                          <Chip key={`${row.order.id}-${station}`} tone="muted">{station}</Chip>
                        ))}
                      </div>
                      <div className="text-xs text-muted-foreground">
                        {(() => {
                          const lines = transactionLines(
                            row.order,
                            scopeByDepartment ? departmentLocations : undefined,
                          );
                          return (
                            <>
                              {lines
                                .slice(0, 2)
                                .map((line) => `${line.name} (${formatLineQty(line)})`)
                                .join(", ")}
                              {lines.length > 2
                                ? ` +${lines.length - 2} ${t("more", "ተጨማሪ")}`
                                : ""}
                            </>
                          );
                        })()}
                      </div>
                    </div>
                  </TableCell>
                  <TableCell className="px-4 py-3">
                    <Chip tone={orderStatusTone(row.order)}>{orderStatusLabel(row.order, t)}</Chip>
                  </TableCell>
                  <TableCell className="px-4 py-3 text-right font-mono font-semibold">
                    {formatETB(row.total, lang)}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
            </Table>
          </div>
          <div className="flex flex-col gap-3 border-t border-border px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="text-xs text-muted-foreground">
              {t(
                `Showing ${historyFrom}-${historyTo} of ${orderRows.length} transactions`,
                `Showing ${historyFrom}-${historyTo} of ${orderRows.length} transactions`,
              )}
            </div>
            <div className="flex items-center gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="gap-1"
                onClick={() => setHistoryPage((page) => Math.max(1, page - 1))}
                disabled={activeHistoryPage === 1}
              >
                <Icons.ChevronLeft className="size-4" />
                <span>{t("Previous", "Previous")}</span>
              </Button>
              <div className="min-w-[5.5rem] text-center text-xs text-muted-foreground">
                {t(
                  `Page ${activeHistoryPage} of ${historyPageCount}`,
                  `Page ${activeHistoryPage} of ${historyPageCount}`,
                )}
              </div>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="gap-1"
                onClick={() => setHistoryPage((page) => Math.min(historyPageCount, page + 1))}
                disabled={activeHistoryPage >= historyPageCount}
              >
                <span>{t("Next", "Next")}</span>
                <Icons.ChevronRight className="size-4" />
              </Button>
            </div>
          </div>
          </>
        ) : (
          <div className="grid place-items-center gap-2 px-5 py-12 text-center text-sm text-muted-foreground">
            <Icons.ReceiptText className="size-5" />
            <div>
              {t("No transactions", "ግብይቶች የሉም")}
            </div>
          </div>
        )}
      </Card>

      <Dialog open={Boolean(selectedTransaction)} onOpenChange={(open) => !open && setSelectedTransaction(null)}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
          {selectedTransaction ? (
            <>
              <DialogHeader>
                <DialogTitle>
                  {t("Transaction Details", "የግብይት ዝርዝሮች")} · {selectedTransaction.receiptNumber}
                </DialogTitle>
                <DialogDescription>
                  {selectedTransaction.dateTime} · {selectedTransaction.table}
                </DialogDescription>
              </DialogHeader>

              <div className="grid gap-4 md:grid-cols-2">
                <Card>
                  <div className="space-y-2 text-sm">
                    <div className="flex items-center justify-between gap-3">
                      <span className="text-muted-foreground">{t("Staff", "ሰራተኛ")}</span>
                      <span className="font-medium">{selectedTransaction.assignment.name}</span>
                    </div>
                    <div className="flex items-center justify-between gap-3">
                      <span className="text-muted-foreground">{t("Role", "ሚና")}</span>
                      <span>{assignmentDisplayRole(selectedTransaction.assignment, t)}</span>
                    </div>
                    <div className="flex items-center justify-between gap-3">
                      <span className="text-muted-foreground">{t("Customer", "ደንበኛ")}</span>
                      <span>{selectedTransaction.customer}</span>
                    </div>
                    <div className="flex items-center justify-between gap-3">
                      <span className="text-muted-foreground">{t("Order status", "የትዕዛዝ ሁኔታ")}</span>
                      <Chip tone={orderStatusTone(selectedTransaction.order)}>
                        {orderStatusLabel(selectedTransaction.order, t)}
                      </Chip>
                    </div>
                    <div className="flex items-center justify-between gap-3">
                      <span className="text-muted-foreground">{t("Payment method", "የክፍያ ዘዴ")}</span>
                      <span>{selectedTransaction.order.payment?.method ?? "-"}</span>
                    </div>
                    <div className="flex items-center justify-between gap-3">
                      <span className="text-muted-foreground">{t("Total", "ጠቅላላ")}</span>
                      <span className="font-mono font-semibold">{formatETB(selectedTransaction.total, lang)}</span>
                    </div>
                  </div>
                </Card>

                <Card>
                  <div className="space-y-3">
                    <div>
                      <div className="text-sm font-medium mb-2">{t("Serving stations", "የማቅረቢያ ጣቢያዎች")}</div>
                      <div className="flex flex-wrap gap-2">
                        {uniqueStationsForOrder(
                          selectedTransaction.order,
                          scopeByDepartment ? departmentLocations : undefined,
                        ).map((station) => (
                          <Chip key={`modal-${selectedTransaction.order.id}-${station}`} tone="muted">
                            {station}
                          </Chip>
                        ))}
                      </div>
                    </div>

                    {canViewAll ? (
                      <div>
                        <div className="text-sm font-medium mb-2">{t("All assigned staff", "ሁሉም የተመደቡ ሰራተኞች")}</div>
                        <div className="space-y-2 text-sm">
                          {selectedTransaction.assignments.map((assignment) => (
                            <div key={assignment.key} className="flex items-center justify-between gap-3 rounded-md border border-border px-3 py-2">
                              <span className="font-medium">{assignment.name}</span>
                              <span className="text-muted-foreground">{assignmentDisplayRole(assignment, t)}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    ) : null}
                  </div>
                </Card>
              </div>

              <Card>
                <div className="mb-3 flex items-center justify-between gap-3">
                  <h4 className="font-display font-semibold">{t("Menu item details", "የምናሌ እቃ ዝርዝሮች")}</h4>
                  <Chip tone="teff">
                    {
                      transactionLines(
                        selectedTransaction.order,
                        scopeByDepartment ? departmentLocations : undefined,
                      ).length
                    }
                  </Chip>
                </div>
                <div className="overflow-x-auto">
                  <Table className="min-w-[720px] text-sm">
                    <TableHeader>
                      <TableRow>
                        <TableHead>{t("Item", "እቃ")}</TableHead>
                        <TableHead>{t("Station", "ጣቢያ")}</TableHead>
                        <TableHead>{t("Qty", "ብዛት")}</TableHead>
                        <TableHead className="text-right">{t("Unit Price", "የነጠላ ዋጋ")}</TableHead>
                        <TableHead className="text-right">{t("Line Total", "ጠቅላላ ዋጋ")}</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {transactionLines(
                        selectedTransaction.order,
                        scopeByDepartment ? departmentLocations : undefined,
                      ).map((line) => (
                        <TableRow key={line.key}>
                          <TableCell>
                            <div className="font-medium">{line.name}</div>
                          </TableCell>
                          <TableCell>
                            <div className="flex items-center gap-2">
                              <Chip tone="muted">{line.station}</Chip>
                              {line.done ? <span className="text-xs text-teff">{t("Served", "ቀርቧል")}</span> : null}
                            </div>
                          </TableCell>
                          <TableCell>{formatLineQty(line)}</TableCell>
                          <TableCell className="text-right font-mono">
                            {line.unitPrice !== undefined ? formatETB(line.unitPrice, lang) : "-"}
                          </TableCell>
                          <TableCell className="text-right font-mono font-semibold">
                            {line.unitPrice !== undefined
                              ? formatETB(line.unitPrice * line.qty, lang)
                              : "-"}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </Card>
            </>
          ) : null}
        </DialogContent>
      </Dialog>

      <Dialog open={Boolean(selectedInsight)} onOpenChange={(open) => !open && setSelectedInsight(null)}>
        <DialogContent className="max-w-3xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {selectedInsight === "stations"
                ? t("Station details", "የጣቢያ ዝርዝሮች")
                : selectedInsight === "items"
                  ? t("Sold item details", "የተሸጡ እቃዎች ዝርዝር")
                  : t("Staff details", "የሰራተኞች ዝርዝር")}
            </DialogTitle>
          </DialogHeader>

          {selectedInsight === "stations" ? (
            <div className="space-y-2">
              {topStations.map((station, index) => (
                <div key={`insight-station-${station.station}`} className="flex items-center gap-3 rounded-lg border border-border bg-surface-2/70 p-3">
                  <span className="grid size-8 place-items-center rounded-md bg-card text-xs font-semibold">{index + 1}</span>
                  <div className="min-w-0 flex-1">
                    <div className="font-medium">{station.station}</div>
                    <div className="text-xs text-muted-foreground">{station.qty} {t("items sold", "እቃዎች ተሸጡ")}</div>
                  </div>
                  <div className="text-right font-mono text-sm font-semibold">{formatETB(station.revenue, lang)}</div>
                </div>
              ))}
            </div>
          ) : selectedInsight === "items" ? (
            <div className="space-y-2">
              {topItems.map((item, index) => (
                <div key={`insight-item-${item.name}-${item.station}`} className="flex items-center gap-3 rounded-lg border border-border bg-surface-2/70 p-3">
                  <span className="grid size-8 place-items-center rounded-md bg-card text-xs font-semibold">{index + 1}</span>
                  <div className="min-w-0 flex-1">
                    <div className="font-medium">{item.name}</div>
                    <div className="text-xs text-muted-foreground">{item.station} · {item.qty} {t("sold", "ተሸጠ")}</div>
                  </div>
                  <div className="text-right font-mono text-sm font-semibold">{formatETB(item.revenue, lang)}</div>
                </div>
              ))}
            </div>
          ) : (
            <div className="space-y-2">
              {topStaff.map((staff, index) => (
                <div key={`insight-staff-${staff.name}-${staff.role}`} className="flex items-center gap-3 rounded-lg border border-border bg-surface-2/70 p-3">
                  <span className="grid size-8 place-items-center rounded-md bg-card text-xs font-semibold">{index + 1}</span>
                  <div className="min-w-0 flex-1">
                    <div className="font-medium">{staff.name}</div>
                    <div className="text-xs text-muted-foreground">
                      {t(staff.role, staff.role)} · {staff.orders} {t("orders", "ትዕዛዞች")}
                    </div>
                  </div>
                  <div className="text-right font-mono text-sm font-semibold">{formatETB(staff.revenue, lang)}</div>
                </div>
              ))}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
