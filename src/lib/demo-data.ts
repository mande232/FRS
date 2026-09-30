// Seed data for a clean Buna Link workspace.
import { menuItemAmharicName } from "./menu-i18n.ts";

export const SEATING_AREAS = ["Main Hall", "VIP", "Rooftop", "VVIP"] as const;
export type SeatingArea = (typeof SEATING_AREAS)[number];

export const PRODUCTION_STATIONS = ["Kitchen", "Main Bar", "VIP Bar", "Butcher House", "Coffee House"] as const;
export type ProductionStation = string;

export const PAYMENT_METHODS = [
  "Cash",
  "CBE",
  "Telebirr",
  "CBE Birr",
  "Dashen",
  "BOA",
  "Awash",
  "MPESA",
  "Siinqee",
  "Kaafi Ebirr",
  "Mixed",
] as const;
export type PaymentMethod = (typeof PAYMENT_METHODS)[number];

export const BANK_PAYMENT_METHODS: PaymentMethod[] = [
  "CBE", "Telebirr", "CBE Birr", "Dashen", "BOA", "Awash", "MPESA", "Siinqee", "Kaafi Ebirr",
];

export type StationTicketStatus = "NEW" | "PREPARING" | "READY" | "UNAVAILABLE" | "CANCELLED";
export type OrderStatus =
  | "PENDING_CASHIER"
  | "NEW"
  | "PARTIALLY READY"
  | "READY TO SERVE"
  | "RECEIPT_GENERATED"
  | "CLOSED"
  | "CANCELLED"
  | "RETURNED";
export type PaymentStatus = "Unpaid" | "Paid" | "Partially Paid" | "Refunded";
export type OrderPriority = "Normal" | "High" | "VIP" | "Urgent";

export const ORDER_PRIORITIES = ["Normal", "High", "VIP", "Urgent"] as const;
export const FINAL_ORDER_STATUSES = ["CLOSED", "CANCELLED", "RETURNED"] as const;
export const DEFAULT_ORDER_PREP_TARGET_MINUTES = 20;

export function isFinalOrderStatus(status: OrderStatus) {
  return FINAL_ORDER_STATUSES.includes(status as (typeof FINAL_ORDER_STATUSES)[number]);
}

export interface OrderLine {
  menuItemId?: string;
  name: string;
  qty: number;
  unitLabel?: string;
  stockSku?: string;
  station: ProductionStation;
  finalStation?: ProductionStation;
  unitPrice?: number;
  done?: boolean;
  stockDeductionLocation?: string;
  stockDeducted?: boolean;
  /** Prep preferences printed on Kitchen/Butcher bono tickets. */
  preferences?: string[];
  /** Free-text customer instruction for the station ticket. */
  note?: string;
  assignedStaff?: string;
  acceptedAt?: string;
  startedAt?: string;
  readyAt?: string;
  servedAt?: string;
}

export interface StationTicket {
  id: string;
  station: ProductionStation;
  status: StationTicketStatus;
  sentAt: string;
  acceptedAt?: string;
  preparingAt?: string;
  readyAt?: string;
  items: OrderLine[];
  nextStation?: ProductionStation;
  previousTicketId?: string;
  /** True after this slip has been printed — add/send must not print it again. */
  bonoPrinted?: boolean;
}

export interface OrderReceipt {
  receiptNumber: string;
  generatedAt: string;
  generatedBy: string;
  restaurantName: string;
  branchName: string;
  tin?: string;
  vatRegNo?: string;
  currency?: string;
  subtotal: number;
  vat: number;
  vatRate: number;
  serviceChargeEnabled: boolean;
  serviceCharge: number;
  discount: number;
  grandTotal: number;
  paymentStatus: PaymentStatus;
  orderStatusAtGeneration: OrderStatus;
  printCount: number;
  lastPrintedAt?: string;
}

export interface MixedBankPaymentEntry {
  method: PaymentMethod;
  bankPaymentReference: string;
  bankAccountSuffix?: string;
  bankPaymentPhone?: string;
  verificationStatus?: "verified" | "recorded_unverified" | "skipped";
  verificationRequestId?: string;
  verificationBank?: string;
  verificationAmount?: number;
  verificationMessage?: string;
  verifiedAt?: string;
}

export interface OrderPayment {
  totalAmount: number;
  method: PaymentMethod;
  collectedByWaiter: string;
  receivedByCashier: string;
  amountReceived: number;
  changeAmount: number;
  /** Extra cash kept as waiter tip instead of returned change. */
  tipAmount?: number;
  receiptNumber: string;
  paymentReceivedAt: string;
  closedByCashier: string;
  closedAt: string;
  /** Bank/wallet transfer receipt / transaction number entered by cashier. */
  bankPaymentReference?: string;
  bankPaymentPhone?: string;
  bankAccountSuffix?: string;
  verificationStatus?: "verified" | "recorded_unverified" | "skipped";
  verificationRequestId?: string;
  verificationBank?: string;
  verificationAmount?: number;
  verificationMessage?: string;
  verifiedAt?: string;
  /** Multiple bank entries for Mixed payment mode. */
  mixedBankPayments?: MixedBankPaymentEntry[];
}

export interface MenuItem {
  id: string;
  name_en: string;
  name_am: string;
  category: string;
  price: number;
  vipPrice?: number;
  singlePrice?: number;
  doublePrice?: number;
  /** VIP Bar spirits: sell half a bottle (deducts 0.5 bottle from stock). */
  halfBottlePrice?: number;
  cost: number;
  station: string;
  emoji: string;
  veg?: boolean;
  pricingMode?: "unit" | "kg";
  unitLabel?: string;
  defaultQty?: number;
  qtyStep?: number;
  stockSku?: string;
  /** Operational department inventory location for POS deduction. */
  stockDeductionLocation?: string;
  /** direct = sell packaged stock; recipe = BOM ingredients. */
  stockDeductionRule?: "direct" | "recipe";
  sellingUnit?: string;
  minimumStock?: number;
  outOfStockBehavior?: "block" | "warn_manager" | "allow_negative_authorized" | "auto_unavailable";
}

export interface Table {
  id: string;
  label: string;
  seats: number;
  area: string;
  status: "Available" | "Occupied" | "Reserved" | "Bill" | "Cleaning";
  guests?: number;
  server?: string;
  openMin?: number;
  total?: number;
}

export interface Order {
  id: string;
  orderNo: string;
  source: "Dine-in" | "Takeaway" | "Room" | "Delivery" | "QR";
  ref: string;
  customerName?: string;
  customerPhone?: string;
  customerNotes?: string;
  guests?: number;
  priority?: OrderPriority;
  /** ISO timestamp used for live elapsed timers. */
  createdAtIso?: string;
  area: SeatingArea;
  tableNumber: string;
  orderedByWaiter: string;
  waiter: string;
  enteredByCashier: string;
  shiftLabel?: string;
  items: OrderLine[];
  stationTickets: StationTicket[];
  sentAt: string;
  requestedAt?: string;
  cashierAcceptedAt?: string;
  stationSentAt?: string;
  status: OrderStatus;
  paymentStatus: PaymentStatus;
  openedMin: number;
  total: number;
  server?: string;
  receipt?: OrderReceipt;
  receiptNumber?: string;
  receiptGeneratedAt?: string;
  receiptGeneratedBy?: string;
  lockedForEditing?: boolean;
  managerAuthorizedChangesBy?: string;
  managerAuthorizedChangesAt?: string;
  paymentReceivedAt?: string;
  closedByCashier?: string;
  cancelledAt?: string;
  cancelledBy?: string;
  voidRequestedBy?: string;
  voidRequestedAt?: string;
  voidReason?: string;
  returnRequestedBy?: string;
  returnRequestedAt?: string;
  returnReason?: string;
  /** Waiter-selected lines awaiting manager approval (index + qty). */
  returnRequestedLines?: Array<{ index: number; qty: number }>;
  returnedAt?: string;
  returnedBy?: string;
  payment?: OrderPayment;
  /** ISO timestamp when POS stock was reserved for this order. */
  stockReservedAt?: string;
  /** ISO timestamp when POS/recipe consumption was posted. */
  stockDeductedAt?: string;
  /** Cancellation / void stock handling notes. */
  cancelReason?: string;
  stockExceptionOutcome?: "release_only" | "wastage" | "reversal" | "packaged_return";
  /** Immutable handoff history when bills move between waiters. */
  waiterTransfers?: WaiterTransferAudit[];
  /** Pending handoff awaiting cashier/manager approval. */
  waiterTransferRequestedTo?: string;
  waiterTransferRequestedBy?: string;
  waiterTransferRequestedAt?: string;
  /** Waiter released the seat; bill stays open for later cashier payment. */
  tableClearedAt?: string;
  tableClearedBy?: string;
  /** How many times station Bono has been printed for this order. */
  bonoPrintCount?: number;
  bonoLastPrintedAt?: string;
  bonoLastPrintedBy?: string;
}

export type WaiterTransferAudit = {
  id: string;
  at: string;
  fromWaiter: string;
  toWaiter: string;
  actor: string;
  orderNo: string;
  area: string;
  tableNumber: string;
};

export interface PaymentLedgerEntry {
  id: string;
  ref: string;
  method: PaymentMethod;
  amount: number;
  table: string;
  cashier: string;
  time: string;
  status: "Settled" | "Pending" | "Void";
  orderId?: string;
  collectedByWaiter?: string;
  receivedByCashier?: string;
  amountReceived?: number;
  changeAmount?: number;
  tipAmount?: number;
  receiptNumber?: string;
  paymentReceivedAt?: string;
  closedByCashier?: string;
  /**
   * Business day (YYYY-MM-DD) the payment belongs to for sales/payment reports.
   * Late payment of a prior-day bill uses the order day, not the cashier action day.
   */
  reportDate?: string;
}

export interface SalesRecord {
  id: string;
  date: string;
  month: string;
  time: string;
  orderId?: string;
  orderNo?: string;
  receiptNumber: string;
  productId?: string;
  productName: string;
  category: string;
  station: ProductionStation;
  qty: number;
  /** Bottle / Double Shot / Single Shot / etc. */
  unitLabel?: string;
  unitPrice: number;
  unitCost: number;
  revenue: number;
  expense: number;
  profit: number;
  area: string;
  tableNumber: string;
  waiter: string;
  cashier: string;
  paymentMethod: PaymentMethod;
}

export interface ExpenseRecord {
  id: string;
  date: string;
  month: string;
  category:
    | "Food cost"
    | "Beverage cost"
    | "Purchase"
    | "Staff"
    | "Rent"
    | "Utilities"
    | "Supplies"
    | "Other";
  label: string;
  amount: number;
  source: "Product sale" | "Purchase" | "Operating";
}

export interface StockItem {
  sku: string;
  name: string;
  unit: string;
  store: string;
  onHand: number;
  reorder: number;
  value: number;
  supplier: string;
}

export interface Supplier {
  id: string;
  name: string;
  contact: string;
  category: string;
  outstanding: number;
  status: string;
  /** Central store this supplier record belongs to */
  store?: "Store 1" | "Store 2";
}

export interface Reservation {
  id: string;
  name: string;
  phone: string;
  time: string;
  party: number;
  table: string;
  deposit: number;
  status: string;
}

export interface Customer {
  id: string;
  name: string;
  phone: string;
  email?: string;
  visits: number;
  spent: number;
  tier: string;
  lastVisit: string;
  points: number;
  feedback: string;
}

export interface StaffMember {
  id: string;
  name: string;
  role: string;
  shift: string;
  branch: string;
  status: string;
  phone: string;
  startTime: string;
  endTime: string;
  daysWorked: number;
}

export interface SalesHour {
  h: string;
  sales: number;
}

export interface TopItem {
  name: string;
  qty: number;
  revenue: number;
}

export interface Branch {
  id: string;
  name: string;
  city: string;
  outlets: number;
  sales: number;
}

export interface EventBooking {
  id: string;
  name: string;
  date: string;
  hall: string;
  guests: number;
  status: string;
  value: number;
  deposit: number;
  menu: string;
  coordinator: string;
  notes: string;
}

export interface RecipeIngredient {
  name: string;
  qty: number;
  unit: string;
  cost: number;
}

export interface Recipe {
  id: string;
  name_en: string;
  name_am: string;
  category: string;
  yieldQty: number;
  yieldUnit: string;
  ingredients: RecipeIngredient[];
  totalCost: number;
  salePrice: number;
}

export interface BarItem {
  id: string;
  name: string;
  type: string;
  pourSize: string;
  cost: number;
  price: number;
  stock: number;
  unit: string;
  emoji: string;
}

export interface BarLogEntry {
  id: string;
  item: string;
  qty: number;
  server: string;
  table: string;
  time: string;
  total: number;
}

export interface RoomOrderItem {
  name: string;
  qty: number;
  price: number;
}

export interface RoomOrder {
  id: string;
  room: string;
  guest: string;
  items: RoomOrderItem[];
  status: string;
  placedAt: string;
  total: number;
  folio: string;
}

export interface CateringJob {
  id: string;
  client: string;
  event: string;
  date: string;
  guests: number;
  location: string;
  status: string;
  value: number;
  driver: string;
  vehicle: string;
  items: string[];
  notes: string;
}

export interface PurchaseOrder {
  id: string;
  supplier: string;
  sku: string;
  item: string;
  qty: number;
  unit: string;
  unitCost: number;
  total: number;
  status: string;
  date: string;
  /** Central store that will receive this PO */
  store?: "Store 1" | "Store 2";
}

const BASE_MENU: MenuItem[] = [
  {
    id: "ater-fitfit",
    name_en: "Ater Fitfit",
    name_am: "",
    category: "Breakfast",
    price: 350,
    vipPrice: 500,
    cost: 0,
    station: "Kitchen",
    emoji: "AF",
    unitLabel: "Plate",
  },
  {
    id: "drekosh-firfir",
    name_en: "Drekosh Firfir",
    name_am: "",
    category: "Breakfast",
    price: 350,
    vipPrice: 500,
    cost: 0,
    station: "Kitchen",
    emoji: "DF",
    unitLabel: "Plate",
  },
  {
    id: "gomen-kitfo",
    name_en: "Gomen Kitfo",
    name_am: "",
    category: "Vegetarian",
    price: 400,
    vipPrice: 500,
    cost: 0,
    station: "Kitchen",
    emoji: "GK",
    unitLabel: "Plate",
  },
  {
    id: "gomen-tibs",
    name_en: "Gomen Tibs",
    name_am: "",
    category: "Vegetarian",
    price: 400,
    vipPrice: 500,
    cost: 0,
    station: "Kitchen",
    emoji: "GT",
    unitLabel: "Plate",
  },
  {
    id: "haf-haaf",
    name_en: "Haf Haaf",
    name_am: "",
    category: "Breakfast",
    price: 400,
    vipPrice: 500,
    cost: 0,
    station: "Kitchen",
    emoji: "HH",
    unitLabel: "Plate",
  },
  {
    id: "kik-bedst",
    name_en: "Kik Bedst",
    name_am: "",
    category: "Breakfast",
    price: 350,
    vipPrice: 500,
    cost: 0,
    station: "Kitchen",
    emoji: "KB",
    unitLabel: "Plate",
  },
  {
    id: "mekoreni-be-atkilt",
    name_en: "Mekoreni be Atkilt",
    name_am: "",
    category: "Vegetarian",
    price: 350,
    vipPrice: 500,
    cost: 0,
    station: "Kitchen",
    emoji: "MKA",
    unitLabel: "Plate",
  },
  {
    id: "mekoreni-be-sgo",
    name_en: "Mekoreni be Sgo",
    name_am: "",
    category: "Mains",
    price: 350,
    vipPrice: 500,
    cost: 0,
    station: "Kitchen",
    emoji: "MKS",
    unitLabel: "Plate",
  },
  {
    id: "metbesh-shiro",
    name_en: "Metbesh Shiro",
    name_am: "",
    category: "Vegetarian",
    price: 400,
    vipPrice: 500,
    cost: 0,
    station: "Kitchen",
    emoji: "MSH",
    unitLabel: "Plate",
  },
  {
    id: "misir-wet",
    name_en: "Misir Wet",
    name_am: "",
    category: "Vegetarian",
    price: 400,
    vipPrice: 500,
    cost: 0,
    station: "Kitchen",
    emoji: "MW",
    unitLabel: "Plate",
  },
  {
    id: "normal-firfir",
    name_en: "Normal Firfir",
    name_am: "",
    category: "Breakfast",
    price: 350,
    vipPrice: 500,
    cost: 0,
    station: "Kitchen",
    emoji: "NF",
    unitLabel: "Plate",
  },
  {
    id: "pasta-be-atkilt",
    name_en: "Pasta be Atkilt",
    name_am: "",
    category: "Vegetarian",
    price: 350,
    vipPrice: 500,
    cost: 0,
    station: "Kitchen",
    emoji: "PBA",
    unitLabel: "Plate",
  },
  {
    id: "pasta-be-sgo",
    name_en: "Pasta be Sgo",
    name_am: "",
    category: "Mains",
    price: 350,
    vipPrice: 500,
    cost: 0,
    station: "Kitchen",
    emoji: "PBS",
    unitLabel: "Plate",
  },
  {
    id: "selata",
    name_en: "Selata",
    name_am: "",
    category: "Starters",
    price: 350,
    vipPrice: 500,
    cost: 0,
    station: "Kitchen",
    emoji: "SE",
    unitLabel: "Plate",
  },
  {
    id: "suf-fitfit",
    name_en: "Suf Fitfit",
    name_am: "",
    category: "Breakfast",
    price: 350,
    vipPrice: 500,
    cost: 0,
    station: "Kitchen",
    emoji: "SF",
    unitLabel: "Plate",
  },
  {
    id: "telba-fitfit",
    name_en: "Telba Fitfit",
    name_am: "",
    category: "Breakfast",
    price: 350,
    vipPrice: 500,
    cost: 0,
    station: "Kitchen",
    emoji: "TF",
    unitLabel: "Plate",
  },
  {
    id: "telba-juice",
    name_en: "Telba Juice",
    name_am: "",
    category: "Drinks",
    price: 100,
    vipPrice: 150,
    cost: 0,
    station: "Main Bar",
    emoji: "TJ",
    unitLabel: "Glass",
  },
  {
    id: "coffee",
    name_en: "Coffee",
    name_am: "ቡና",
    category: "Drinks",
    price: 80,
    cost: 0,
    station: "Coffee House",
    emoji: "CF",
    unitLabel: "Cup",
  },
  {
    id: "timatim-kurt",
    name_en: "Timatim Kurt",
    name_am: "",
    category: "Starters",
    price: 350,
    vipPrice: 500,
    cost: 0,
    station: "Kitchen",
    emoji: "TK",
    unitLabel: "Plate",
  },
  {
    id: "timatim-lebleb",
    name_en: "Timatim Lebleb",
    name_am: "",
    category: "Starters",
    price: 350,
    vipPrice: 500,
    cost: 0,
    station: "Kitchen",
    emoji: "TL",
    unitLabel: "Plate",
  },
  {
    id: "kikl",
    name_en: "Kikl",
    name_am: "",
    category: "Mains",
    price: 800,
    vipPrice: 1000,
    cost: 0,
    station: "Kitchen",
    emoji: "KL",
    unitLabel: "Plate",
  },
  {
    id: "beyaynet",
    name_en: "Beyaynet",
    name_am: "",
    category: "Vegetarian",
    price: 400,
    vipPrice: 500,
    cost: 0,
    station: "Kitchen",
    emoji: "BY",
    unitLabel: "Plate",
  },
  {
    id: "derek-enjera",
    name_en: "Derek Enjera",
    name_am: "",
    category: "Starters",
    price: 30,
    vipPrice: 30,
    cost: 0,
    station: "Kitchen",
    emoji: "DE",
    unitLabel: "Piece",
  },
  {
    id: "foyel",
    name_en: "Foyel",
    name_am: "",
    category: "Mains",
    price: 100,
    vipPrice: 100,
    cost: 0,
    station: "Kitchen",
    emoji: "FY",
    unitLabel: "Piece",
  },
];

type SeedMenuRow = [
  id: string,
  name_en: string,
  price: number,
  vipPrice: number | null,
  unitLabel: string,
  stockSku?: string,
];

function seedEmoji(id: string) {
  return id
    .split(/[^a-zA-Z0-9]+/)
    .filter(Boolean)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("")
    .slice(0, 3);
}

function seedMenuRows(rows: readonly SeedMenuRow[], category: string, station: string): MenuItem[] {
  const isMeat = category === "Meat";
  const isButcher = station.toLowerCase().includes("butcher");
  const isSpirit = category.toLowerCase() === "spirits" || category.toLowerCase() === "whisky";
  return rows.map(([id, name_en, price, vipPrice, unitLabel, stockSku]) => {
    const isKg = unitLabel.toLowerCase() === "kg";
    const doublePrice = isSpirit && vipPrice != null ? vipPrice : undefined;
    const singlePrice = isSpirit && vipPrice != null ? Math.round(vipPrice / 2) : undefined;
    const halfBottlePrice = isSpirit && price > 0 ? Math.round((price / 2) * 100) / 100 : undefined;
    return {
      id,
      name_en,
      name_am: menuItemAmharicName({ id, name_en }),
      category,
      price,
      vipPrice: isSpirit ? undefined : vipPrice ?? undefined,
      singlePrice,
      doublePrice,
      halfBottlePrice,
      cost: 0,
      station,
      emoji: seedEmoji(id),
      unitLabel,
      pricingMode: isKg ? ("kg" as const) : ("unit" as const),
      stockSku: stockSku ?? id,
      stockDeductionLocation: isButcher ? "Butcher" : isSpirit ? "VIP Bar" : undefined,
      stockDeductionRule: stockSku || isButcher || isSpirit ? ("direct" as const) : undefined,
      defaultQty: isKg ? 0.5 : isMeat ? 1 : undefined,
      qtyStep: isKg ? 0.25 : isMeat ? 1 : undefined,
    };
  });
}

const MEAT_MENU_ROWS: SeedMenuRow[] = [
  ["tri-sga", "Tri Sga", 4000, 5000, "kg", "stk-beef-prime"],
  ["dulet", "Dulet", 700, 1000, "Plate", "stk-beef-prime"],
  ["gaz-layt", "Gaz Layt", 4000, 5000, "kg", "stk-beef-prime"],
  ["godn", "Godn", 4000, 5000, "kg", "stk-beef-prime"],
  ["grill-tibs", "Grill Tibs", 4000, 5000, "kg", "stk-beef-prime"],
  ["katelo", "Katelo", 4000, 5000, "kg", "stk-beef-prime"],
  ["shekla", "Shekla", 4000, 5000, "kg", "stk-goat-limb-meat"],
  ["kurete", "Kurete", 4000, 5000, "kg", "stk-goat-limb-meat"],
  ["tebit", "Tebit", 0, null, "Portion", "stk-beef-prime"],
  ["wolando", "Wolando", 4000, 5000, "kg", "stk-beef-prime"],
  ["zlzl", "Zlzl", 4000, 5000, "kg", "stk-beef-prime"],
  ["gubet", "Gubet", 1200, null, "kg", "stk-beef-prime"],
  ["mlas-sember", "Mlas Sember", 2000, null, "kg", "stk-goat-inside-parts"],
  ["ye-fyel-dulet", "Ye Fyel Dulet", 1000, 1250, "Plate", "stk-beef-prime"],
  ["collection-yefyel", "Collection Yefyel", 4000, 5000, "kg", "stk-goat-inside-parts"],
  ["yefyel", "Yefyel", 4000, 5000, "kg", "stk-goat-inside-parts"],
  ["yeberi-dulet", "Yeberi Dulet", 1500, 2000, "Plate", "stk-beef-prime"],
];

const BEER_MENU_ROWS: SeedMenuRow[] = [
  ["draft-beer", "Draft Beer", 1500, 2000, "Bottle", "stk-draft-beer"],
  ["bedeli", "Bedelle", 140, 300, "Bottle", "stk-beer-bedele"],
  ["arada", "Arada", 140, 300, "Bottle", "stk-beer-arada"],
  ["heineken", "Heineken", 140, 300, "Bottle", "stk-beer-heineken"],
  ["bottled-beer", "Bottled Beer", 0, null, "Bottle"],
  ["dashen", "Dashen", 140, 300, "Bottle", "stk-beer-dashen"],
  ["st-george", "St. George", 120, 300, "Bottle"],
  ["castel-beer", "Castel", 120, 300, "Bottle"],
  ["habesha", "Habesha", 120, 300, "Bottle", "stk-beer-habesha"],
  ["ngus", "Ngus", 120, 300, "Bottle"],
  ["harar", "Harar", 120, 300, "Bottle"],
];

const SOFT_DRINK_MENU_ROWS: SeedMenuRow[] = [
  ["sprite", "Sprite", 120, 300, "Bottle"],
  ["coca-cola", "Coca-Cola", 120, 300, "Bottle"],
  ["fanta", "Fanta", 120, 300, "Bottle"],
  ["mirinda", "Mirinda", 120, 300, "Bottle"],
  ["7-up", "7UP", 120, 300, "Bottle"],
];

const WATER_MENU_ROWS: SeedMenuRow[] = [
  ["half-liter-water", "0.5 Liter Water", 60, 100, "Bottle", "stk-water-ambo"],
  ["one-liter-water", "1 Liter Water", 80, 100, "Bottle", "stk-water-ambo"],
  ["ambuha", "Ambuha", 80, 200, "Bottle", "stk-water-ambo"],
];

const WEYN_MENU_ROWS: SeedMenuRow[] = [
  ["awash", "Awash Wayne", 80, 200, "Bottle", "stk-awash"],
  ["acacia", "Acacia Wayne", 80, 200, "Bottle", "stk-acacia"],
  ["axumit", "Axumit Wayne", 80, 200, "Bottle", "stk-axumit"],
  ["gebeta-water", "Gebeta Wayne", 1200, 2000, "Bottle", "stk-gebeta-water"],
  ["kemila", "Kemila Wayne", 2000, 3000, "Bottle", "stk-kemila"],
  ["guder", "Guder Wayne", 1500, 2000, "Bottle", "stk-guder"],
  ["refi-valley", "Refi Valley Wayne", 1500, 2000, "Bottle", "stk-refi-valley"],
];

const OTHER_DRINK_MENU_ROWS: SeedMenuRow[] = [
  ["draft-beer-other", "Draft Beer", 1500, 2000, "Bottle"],
  ["areki", "Areki", 0, null, "Bottle"],
];

const SPIRITS_MENU_ROWS: SeedMenuRow[] = [
  ["absolute-elyx", "Absolute Elyx", 16000, null, "Bottle"],
  ["amarula", "Amarula", 20000, 600, "Bottle", "stk-amarula"],
  ["bacardi-075l", "Bacardi 0.75L", 12000, null, "Bottle"],
  ["bacardi-1l", "Bacardi 1L", 16000, null, "Bottle"],
  ["ballantines", "Ballantine's", 20000, null, "Bottle"],
  ["beehive-vsop", "Beehive VSOP", 25000, null, "Bottle"],
  ["black-label", "Black Label", 16000, 700, "Bottle", "stk-whisky-black-label"],
  ["black-label-2l", "Black Label 2L", 35000, null, "Bottle", "stk-whisky-black-label"],
  ["black-ruby", "Black Ruby", 20000, null, "Bottle"],
  ["blue-label", "Blue Label", 80000, null, "Bottle"],
  ["chianti", "Chianti", 18000, null, "Bottle"],
  ["ciroc", "Ciroc", 9500, null, "Bottle"],
  ["camus-vsop", "Camus VSOP", 30000, null, "Bottle"],
  ["camino-tequila", "Camino Tequila", 15000, 500, "Bottle"],
  ["captain-morgan", "Captain Morgan", 16000, null, "Bottle"],
  ["casamigos", "Casamigos", 45000, 1200, "Bottle"],
  ["tequila", "Tequila", 0, null, "Bottle"],
  ["castel-champagne", "Castel Champagne", 6000, null, "Bottle"],
  ["castel-wine", "Castel Wine", 6000, null, "Bottle"],
  ["chivas-12", "Chivas 12", 17000, null, "Bottle"],
  ["chivas-18", "Chivas 18", 33000, null, "Bottle"],
  ["courvoisier-vs", "Courvoisier VS", 22000, null, "Bottle"],
  ["dech-vodka", "Dech Vodka", 11000, null, "Bottle"],
  ["delamain-cognac", "Delamain Cognac", 45000, null, "Bottle"],
  ["dimple", "Dimple", 30000, null, "Bottle"],
  ["disaronno", "Disaronno", 25000, null, "Bottle"],
  ["don-julio", "Don Julio", 80000, null, "Bottle"],
  ["premium", "Premium", 35000, 1100, "Bottle"],
  ["don-julio-small", "Don Julio Small", 18000, null, "Bottle"],
  ["double-black", "Double Black", 16000, 600, "Bottle"],
  ["fernet-branca", "Fernet Branca", 6000, null, "Bottle"],
  ["gebeta-2l", "Gebeta 2L", 12000, 700, "Bottle"],
  ["glass-wine", "Glass Wine", 0, null, "Glass"],
  ["glenfiddich-12", "Glenfiddich 12", 18000, null, "Bottle"],
  ["glenfiddich-15", "Glenfiddich 15", 25000, null, "Bottle"],
  ["glenfiddich-18", "Glenfiddich 18", 33000, null, "Bottle"],
  ["godfather", "Godfather", 25000, null, "Bottle"],
  ["gold", "Gold", 23000, null, "Bottle"],
  ["gordons", "Gordon's", 10000, 600, "Bottle"],
  ["grey-goose", "Grey Goose", 17000, null, "Bottle"],
  ["hendricks", "Hendrick's", 18000, null, "Bottle"],
  ["hennessy-vs", "Hennessy VS", 26000, null, "Bottle"],
  ["hennessy-vsop", "Hennessy VSOP", 35000, null, "Bottle"],
  ["jc-palace", "J.C. Palace", 14000, null, "Bottle"],
  ["jb", "J&B", 15000, null, "Bottle"],
  ["jack-daniels", "Jack Daniel's", 18000, null, "Bottle"],
  ["jagermeister", "Jägermeister", 16000, 500, "Bottle"],
  ["jim-beam", "Jim Beam", 14000, null, "Bottle"],
  ["mango-juice", "Mango Juice", 1000, null, "Bottle"],
  ["martini", "Martini", 15000, null, "Bottle"],
  ["monkey-shoulder", "Monkey Shoulder", 18000, null, "Bottle"],
  ["platinum", "Platinum", 35000, null, "Bottle"],
  ["red-bull", "Red Bull", 1000, null, "Bottle"],
  ["roberto-cavalli-vodka", "Roberto Cavalli Vodka", 20000, null, "Bottle"],
  ["red-label", "Red Label", 12000, null, "Bottle"],
  ["sambuca", "Sambuca", 15000, 500, "Bottle"],
  ["small-jagermeister", "Small Jägermeister", 2000, null, "Bottle"],
  ["small-vodka", "Small Vodka", 1500, null, "Bottle"],
  ["singleton", "Singleton", 20000, null, "Bottle"],
  ["smirnoff", "Smirnoff", 30000, null, "Bottle"],
  ["st-remi-1l", "St. Remi 1L", 0, null, "Bottle"],
  ["stockinia-05l", "Stockinia 0.5L", 4500, null, "Bottle"],
  ["stockinia-1l", "Stockinia 1L", 9000, null, "Bottle"],
  ["vecchia-romagna", "Vecchia Romagna", 20000, null, "Bottle"],
  ["white-horse", "White Horse", 14000, null, "Bottle"],
  ["winter-05l", "Winter 0.5L", 5000, null, "Bottle"],
  ["xo-hennessy", "XO Hennessy", 100000, null, "Bottle"],
  ["zonin-wine", "Zonin Wine", 2000, null, "Bottle"],
  ["5-label", "5 Label", 18000, null, "Bottle"],
];

export const MENU: MenuItem[] = [
  ...BASE_MENU,
  ...seedMenuRows(MEAT_MENU_ROWS, "Meat", "Butcher House"),
  ...seedMenuRows(BEER_MENU_ROWS, "Beer", "Main Bar"),
  ...seedMenuRows(SOFT_DRINK_MENU_ROWS, "Soft Drinks", "Main Bar"),
  ...seedMenuRows(WATER_MENU_ROWS, "Water", "Main Bar"),
  ...seedMenuRows(WEYN_MENU_ROWS, "Weyn", "Main Bar"),
  ...seedMenuRows(OTHER_DRINK_MENU_ROWS, "Other Drinks", "Main Bar"),
  ...seedMenuRows(SPIRITS_MENU_ROWS, "Spirits", "VIP Bar"),
].map((item) => ({
  ...item,
  name_am: menuItemAmharicName(item) || item.name_am,
}));
export const CATEGORIES = [
  "All",
  "Breakfast",
  "Vegetarian",
  "Mains",
  "Starters",
  "Drinks",
  "Meat",
  "Beer",
  "Soft Drinks",
  "Water",
  "Weyn",
  "Other Drinks",
  "Spirits",
] as const;
/** Floor plan: Main Hall 1–27, Rooftop 28–56, VIP 1–7, VVIP1 & VVIP2. */
function buildFloorTables(): Table[] {
  const rows: Table[] = [];
  for (let n = 1; n <= 27; n += 1) {
    rows.push({
      id: `tbl-main-${n}`,
      label: String(n),
      seats: 4,
      area: "Main Hall",
      status: "Available",
    });
  }
  for (let n = 28; n <= 56; n += 1) {
    rows.push({
      id: `tbl-roof-${n}`,
      label: String(n),
      seats: 4,
      area: "Rooftop",
      status: "Available",
    });
  }
  for (let n = 1; n <= 7; n += 1) {
    rows.push({
      id: `tbl-vip-${n}`,
      label: String(n),
      seats: 6,
      area: "VIP",
      status: "Available",
    });
  }
  for (const label of ["VVIP1", "VVIP2"] as const) {
    rows.push({
      id: `tbl-${label.toLowerCase()}`,
      label,
      seats: 8,
      area: "VVIP",
      status: "Available",
    });
  }
  return rows;
}

export const TABLES: Table[] = buildFloorTables();
export const ORDERS: Order[] = [];
export const STOCK: StockItem[] = [];
export const SUPPLIERS: Supplier[] = [];
export const RESERVATIONS: Reservation[] = [];
export const CUSTOMERS: Customer[] = [];
export const STAFF: StaffMember[] = [];
export const SALES_BY_HOUR: SalesHour[] = [];
export const TOP_ITEMS: TopItem[] = [];
export const BRANCHES: Branch[] = [];
export const EVENTS: EventBooking[] = [];
export const RECIPES: Recipe[] = [];
export const BAR_ITEMS: BarItem[] = [];
export const BAR_LOG: BarLogEntry[] = [];
export const ROOM_ORDERS: RoomOrder[] = [];
export const CATERING_JOBS: CateringJob[] = [];
export const PAYMENTS_LEDGER: PaymentLedgerEntry[] = [];
export const SALES_RECORDS: SalesRecord[] = [];
export const EXPENSE_RECORDS: ExpenseRecord[] = [];
export const PURCHASE_ORDERS: PurchaseOrder[] = [];
