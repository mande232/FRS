import {
  DEFAULT_DATE_TIME_PREFERENCES,
  type DateTimePreferences,
} from "@/lib/date-time";

export type SettingsSectionId =
  | "restaurant-profile"
  | "branches"
  | "localization"
  | "calendar-date"
  | "receipt-tax"
  | "order-rules"
  | "production-stations"
  | "payment-methods"
  | "seating-areas"
  | "devices-printers"
  | "inventory"
  | "pos"
  | "shift"
  | "notifications"
  | "users-permissions"
  | "integrations"
  | "audit";

export type SettingsGroupId = "business" | "orders" | "floor" | "system";

export type SettingsSectionDef = {
  id: SettingsSectionId;
  labelEn: string;
  labelAm: string;
  group: SettingsGroupId;
  keywords: string[];
  editableRoles: string[];
};

export const SETTINGS_GROUPS: Array<{ id: SettingsGroupId; labelEn: string; labelAm: string }> = [
  { id: "business", labelEn: "Business", labelAm: "ንግድ" },
  { id: "orders", labelEn: "Orders & money", labelAm: "ትዕዛዝ እና ገንዘብ" },
  { id: "floor", labelEn: "Floor & devices", labelAm: "ወለል እና መሳሪያ" },
  { id: "system", labelEn: "System", labelAm: "ስርዓት" },
];

export const SETTINGS_SECTIONS: SettingsSectionDef[] = [
  { id: "restaurant-profile", labelEn: "Restaurant", labelAm: "ምግብ ቤት", group: "business", keywords: ["restaurant", "logo", "tin", "vat", "brand", "profile"], editableRoles: ["Administrator", "Branch Manager"] },
  { id: "branches", labelEn: "Multi-branch", labelAm: "ባለብዙ ቅርንጫፍ", group: "business", keywords: ["branch", "location", "store", "multi", "hq", "adjustment", "override"], editableRoles: ["Administrator", "Branch Manager"] },
  { id: "localization", labelEn: "Language & money", labelAm: "ቋንቋ እና ገንዘብ", group: "business", keywords: ["language", "currency", "format", "number", "localization"], editableRoles: ["Administrator", "Branch Manager"] },
  { id: "calendar-date", labelEn: "Date & time", labelAm: "ቀን እና ሰዓት", group: "business", keywords: ["calendar", "date", "time", "timezone", "ethiopian"], editableRoles: ["Administrator", "Branch Manager"] },
  { id: "receipt-tax", labelEn: "Receipt & tax", labelAm: "ደረሰኝ እና ግብር", group: "orders", keywords: ["receipt", "vat", "tax", "service charge", "reprint"], editableRoles: ["Administrator", "Branch Manager"] },
  { id: "order-rules", labelEn: "Order rules", labelAm: "የትዕዛዝ ደንቦች", group: "orders", keywords: ["order", "lock", "void", "discount", "waiter"], editableRoles: ["Administrator", "Branch Manager"] },
  { id: "payment-methods", labelEn: "Payments", labelAm: "ክፍያዎች", group: "orders", keywords: ["payment", "cash", "telebirr", "cbe", "dashen", "boa", "awash", "mpesa", "mixed"], editableRoles: ["Administrator", "Branch Manager"] },
  { id: "pos", labelEn: "POS", labelAm: "POS", group: "orders", keywords: ["pos", "cashier", "barcode", "modifier", "stock", "disconnect", "inventory"], editableRoles: ["Administrator", "Branch Manager"] },
  { id: "shift", labelEn: "Shifts", labelAm: "ሺፍት", group: "orders", keywords: ["shift", "cash count", "close"], editableRoles: ["Administrator", "Branch Manager"] },
  { id: "production-stations", labelEn: "Stations", labelAm: "ጣቢያዎች", group: "floor", keywords: ["station", "kitchen", "bar", "routing", "printer", "production"], editableRoles: ["Administrator", "Branch Manager"] },
  { id: "seating-areas", labelEn: "Tables", labelAm: "ጠረጴዛዎች", group: "floor", keywords: ["table", "area", "floor", "seating"], editableRoles: ["Administrator", "Branch Manager", "Supervisor"] },
  { id: "devices-printers", labelEn: "Printers", labelAm: "አታሚዎች", group: "floor", keywords: ["printer", "device", "display", "scanner"], editableRoles: ["Administrator", "Branch Manager"] },
  { id: "inventory", labelEn: "Inventory", labelAm: "ክምችት", group: "floor", keywords: ["inventory", "stock", "store", "costing"], editableRoles: ["Administrator", "Inventory Administrator", "Branch Manager"] },
  { id: "users-permissions", labelEn: "Staff access", labelAm: "የሰራተኛ መዳረሻ", group: "system", keywords: ["user", "role", "permission", "cashier", "staff"], editableRoles: ["Administrator"] },
  { id: "notifications", labelEn: "Alerts", labelAm: "ማሳወቂያ", group: "system", keywords: ["notification", "alert", "sms", "email"], editableRoles: ["Administrator", "Branch Manager"] },
  { id: "integrations", labelEn: "Integrations", labelAm: "ውህደቶች", group: "system", keywords: ["integration", "api", "supabase"], editableRoles: ["Administrator"] },
  { id: "audit", labelEn: "Change log", labelAm: "የለውጥ መዝገብ", group: "system", keywords: ["audit", "history", "system"], editableRoles: ["Administrator", "Auditor", "Branch Manager"] },
];

export type LocalizationSettings = {
  language: "en" | "am" | "both";
  currency: string;
  currencySymbol: string;
  numberFormat: "en-ET" | "am-ET";
  decimalPlaces: number;
  thousandSeparator: "," | "." | " ";
};

export type CalendarSettings = DateTimePreferences & {
  showEthiopianSecondary: boolean;
};

export type ReceiptTaxSettings = {
  receiptTiming: "before_payment" | "after_payment" | "on_generation" | "on_close";
  receiptNumberLength: number;
  receiptPrefix: string;
  startingNumber: number;
  resetFrequency: "never" | "daily" | "monthly" | "yearly";
  vatRate: number;
  serviceChargeRate: number;
  serviceChargeEnabled: boolean;
  taxInclusivePricing: boolean;
  receiptFooter: string;
  copies: number;
  showCustomerCopy: boolean;
  showMerchantCopy: boolean;
  showWaiter: boolean;
  showCashier: boolean;
  showTable: boolean;
  showCustomer: boolean;
  showTin: boolean;
  showVatRegNo: boolean;
  showQrCode: boolean;
  showPaymentMethod: boolean;
  showOrderNumber: boolean;
  showDate: boolean;
  showTime: boolean;
  reprintWatermark: string;
  requireReceiptBeforePayment: boolean;
  lockOrderAfterReceipt: boolean;
};

export type OrderRulesSettings = {
  lockAfterReceipt: boolean;
  allowEditAfterSend: boolean;
  allowEditAfterStationAccept: boolean;
  allowEditAfterReceipt: boolean;
  allowEditAfterPayment: boolean;
  managerApprovalCancellation: boolean;
  managerApprovalVoid: boolean;
  managerApprovalDiscount: boolean;
  allowReopenOrders: boolean;
  allowPartialPayments: boolean;
  allowMixedPayments: boolean;
  requireTableDineIn: boolean;
  requireWaiterAssignment: boolean;
  requireGuestCount: boolean;
  autoClosePaidOrders: boolean;
  maxDiscountPct: number;
  delayedOrderMinutes: number;
  preparationWarningMinutes: number;
};

export type PosSettings = {
  defaultOrderType: string;
  /** When true, POS sales skip stock checks, reservations, and deductions. */
  disconnectPosMenuFromStock: boolean;
  showStockAvailability: boolean;
  showMenuImages: boolean;
  showPreparationTimes: boolean;
  autoOpenModifiers: boolean;
  enableBarcodeScanner: boolean;
  allowParkedOrders: boolean;
  allowTableTransfer: boolean;
  allowOrderMerge: boolean;
  allowSplitBill: boolean;
  showLiveStationProgress: boolean;
  show12HourClock: boolean;
  autoPrintStationTickets: boolean;
  autoPrintPaidReceipt: boolean;
};

export type ShiftSettings = {
  requireOpeningBalance: boolean;
  requireCashCountAtClose: boolean;
  requireManagerApproval: boolean;
  blockCloseWithOpenOrders: boolean;
  blockCloseWithUnpaidOrders: boolean;
  blockCloseWithReconciliationDiff: boolean;
  cashDifferenceTolerance: number;
  defaultShiftDurationHours: number;
};

export type SettingsAuditEntry = {
  id: string;
  section: SettingsSectionId;
  settingName: string;
  previousValue: string;
  newValue: string;
  changedBy: string;
  changedByRole: string;
  branch: string;
  changedAtIso: string;
  reason?: string;
};

export type SectionMeta = {
  updatedAt: string;
  updatedBy: string;
  updatedByRole: string;
};

export type SystemSettingsState = {
  localization: LocalizationSettings;
  calendar: CalendarSettings;
  receiptTax: ReceiptTaxSettings;
  orderRules: OrderRulesSettings;
  pos: PosSettings;
  shift: ShiftSettings;
  auditLog: SettingsAuditEntry[];
  sectionMeta: Partial<Record<SettingsSectionId, SectionMeta>>;
};

const STORAGE_KEY = "ethioplate.system-settings";

export const DEFAULT_LOCALIZATION: LocalizationSettings = {
  language: "both",
  currency: "Ethiopian Birr (ETB)",
  currencySymbol: "ETB",
  numberFormat: "en-ET",
  decimalPlaces: 2,
  thousandSeparator: ",",
};

export const DEFAULT_RECEIPT_TAX: ReceiptTaxSettings = {
  receiptTiming: "before_payment",
  receiptNumberLength: 8,
  receiptPrefix: "POS",
  startingNumber: 1,
  resetFrequency: "daily",
  vatRate: 15,
  serviceChargeRate: 10,
  serviceChargeEnabled: true,
  taxInclusivePricing: false,
  receiptFooter: "Thank you for dining with us.",
  copies: 2,
  showCustomerCopy: true,
  showMerchantCopy: true,
  showWaiter: true,
  showCashier: true,
  showTable: true,
  showCustomer: false,
  showTin: true,
  showVatRegNo: true,
  showQrCode: true,
  showPaymentMethod: true,
  showOrderNumber: true,
  showDate: true,
  showTime: true,
  reprintWatermark: "REPRINT",
  requireReceiptBeforePayment: true,
  lockOrderAfterReceipt: true,
};

export const DEFAULT_ORDER_RULES: OrderRulesSettings = {
  lockAfterReceipt: true,
  allowEditAfterSend: false,
  allowEditAfterStationAccept: false,
  allowEditAfterReceipt: false,
  allowEditAfterPayment: false,
  managerApprovalCancellation: true,
  managerApprovalVoid: true,
  managerApprovalDiscount: true,
  allowReopenOrders: false,
  allowPartialPayments: true,
  allowMixedPayments: true,
  requireTableDineIn: true,
  requireWaiterAssignment: true,
  requireGuestCount: false,
  autoClosePaidOrders: false,
  maxDiscountPct: 20,
  delayedOrderMinutes: 25,
  preparationWarningMinutes: 15,
};

export const DEFAULT_POS_SETTINGS: PosSettings = {
  defaultOrderType: "Dine-in",
  disconnectPosMenuFromStock: false,
  showStockAvailability: true,
  showMenuImages: true,
  showPreparationTimes: true,
  autoOpenModifiers: false,
  enableBarcodeScanner: false,
  allowParkedOrders: true,
  allowTableTransfer: true,
  allowOrderMerge: true,
  allowSplitBill: true,
  showLiveStationProgress: true,
  show12HourClock: true,
  autoPrintStationTickets: true,
  autoPrintPaidReceipt: true,
};

export const DEFAULT_SHIFT_SETTINGS: ShiftSettings = {
  requireOpeningBalance: true,
  requireCashCountAtClose: true,
  requireManagerApproval: true,
  blockCloseWithOpenOrders: true,
  blockCloseWithUnpaidOrders: true,
  blockCloseWithReconciliationDiff: true,
  cashDifferenceTolerance: 50,
  defaultShiftDurationHours: 8,
};

export const DEFAULT_SYSTEM_SETTINGS: SystemSettingsState = {
  localization: DEFAULT_LOCALIZATION,
  calendar: { ...DEFAULT_DATE_TIME_PREFERENCES, showEthiopianSecondary: false },
  receiptTax: DEFAULT_RECEIPT_TAX,
  orderRules: DEFAULT_ORDER_RULES,
  pos: DEFAULT_POS_SETTINGS,
  shift: DEFAULT_SHIFT_SETTINGS,
  auditLog: [],
  sectionMeta: {},
};

/** Live POS ↔ stock link. Managers toggle this in Settings → POS. */
export function isPosMenuStockDisconnected() {
  return Boolean(loadSystemSettings().pos.disconnectPosMenuFromStock);
}

export function loadSystemSettings(): SystemSettingsState {
  if (typeof window === "undefined") return DEFAULT_SYSTEM_SETTINGS;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_SYSTEM_SETTINGS;
    const parsed = JSON.parse(raw) as Partial<SystemSettingsState>;
    return {
      ...DEFAULT_SYSTEM_SETTINGS,
      ...parsed,
      localization: { ...DEFAULT_LOCALIZATION, ...parsed.localization },
      calendar: { ...DEFAULT_SYSTEM_SETTINGS.calendar, ...parsed.calendar },
      receiptTax: { ...DEFAULT_RECEIPT_TAX, ...parsed.receiptTax },
      orderRules: { ...DEFAULT_ORDER_RULES, ...parsed.orderRules },
      pos: { ...DEFAULT_POS_SETTINGS, ...parsed.pos },
      shift: { ...DEFAULT_SHIFT_SETTINGS, ...parsed.shift },
      auditLog: parsed.auditLog ?? [],
      sectionMeta: parsed.sectionMeta ?? {},
    };
  } catch {
    return DEFAULT_SYSTEM_SETTINGS;
  }
}

export function saveSystemSettings(state: SystemSettingsState) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

export function searchSettingsSections(query: string): SettingsSectionId[] {
  const q = query.trim().toLowerCase();
  if (!q) return SETTINGS_SECTIONS.map((section) => section.id);
  return SETTINGS_SECTIONS.filter(
    (section) =>
      section.labelEn.toLowerCase().includes(q) ||
      section.labelAm.includes(q) ||
      section.keywords.some((keyword) => keyword.includes(q)),
  ).map((section) => section.id);
}

export function canEditSettingsSection(sectionId: SettingsSectionId, role: string) {
  const section = SETTINGS_SECTIONS.find((row) => row.id === sectionId);
  if (!section) return false;
  return section.editableRoles.includes(role);
}

export function validateReceiptTaxSettings(settings: ReceiptTaxSettings): string[] {
  const errors: string[] = [];
  if (settings.vatRate < 0 || settings.vatRate > 100) errors.push("VAT rate must be between 0 and 100.");
  if (settings.serviceChargeRate < 0 || settings.serviceChargeRate > 100) errors.push("Service charge must be between 0 and 100.");
  if (settings.receiptNumberLength < 4 || settings.receiptNumberLength > 12) errors.push("Receipt number length must be 4–12 digits.");
  return errors;
}

export function validateCalendarSettings(settings: CalendarSettings): string[] {
  const errors: string[] = [];
  if (!settings.timezone.trim()) errors.push("Timezone is required.");
  return errors;
}

export function appendAuditEntry(
  state: SystemSettingsState,
  entry: Omit<SettingsAuditEntry, "id" | "changedAtIso">,
): SystemSettingsState {
  const nextEntry: SettingsAuditEntry = {
    ...entry,
    id: `audit-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    changedAtIso: new Date().toISOString(),
  };
  return {
    ...state,
    auditLog: [nextEntry, ...state.auditLog].slice(0, 500),
    sectionMeta: {
      ...state.sectionMeta,
      [entry.section]: {
        updatedAt: nextEntry.changedAtIso,
        updatedBy: entry.changedBy,
        updatedByRole: entry.changedByRole,
      },
    },
  };
}
