export type ModuleKey =
  | "menu"
  | "pos"
  | "orders"
  | "kds"
  | "tables"
  | "inventory"
  | "procurement"
  | "recipes"
  | "room"
  | "banquet"
  | "catering"
  | "crm"
  | "hr"
  | "payments"
  | "reports"
  | "admin";

export interface ModuleDef {
  key: ModuleKey;
  en: string;
  am: string;
  desc_en: string;
  desc_am: string;
  icon: string; // lucide icon name
  group: "Front of House" | "Back of House" | "Management";
}

export const MODULES: ModuleDef[] = [
  { key: "menu", en: "Digital Menu & QR", am: "ዲጂታል ሜኑ እና QR", desc_en: "Guests scan, browse in their language, and order from the table.", desc_am: "እንግዶች ስካን አድርገው በቋንቋቸው ይዝዘዙ።", icon: "QrCode", group: "Front of House" },
  { key: "pos", en: "POS & Billing", am: "POS እና ክፍያ", desc_en: "Fast touch POS with split bills, VAT, and thermal printing.", desc_am: "ፈጣን POS፣ ቢል መከፋፈል፣ VAT እና ህትመት።", icon: "Receipt", group: "Front of House" },
  { key: "orders", en: "Order Management", am: "የትዕዛዝ አስተዳደር", desc_en: "Dine-in, takeaway, delivery, room service in one pipeline.", desc_am: "በውስጥ፣ ይዘው የሚሄዱ፣ መላኪያ እና የክፍል አገልግሎት።", icon: "ClipboardList", group: "Front of House" },
  { key: "kds", en: "Kitchen Display", am: "የኩሽና ስክሪን", desc_en: "Station tickets, timers, course firing, bump and recall.", desc_am: "የጣቢያ ቲኬቶች፣ ሰዓቶች እና ቅደም ተከተል።", icon: "ChefHat", group: "Back of House" },
  { key: "tables", en: "Tables & Reservations", am: "ጠረጴዛ እና ቦታ ማስያዝ", desc_en: "Floor plan, waitlist, deposits, and SMS confirmations.", desc_am: "የወለል ካርታ፣ ተጠባባቂ ዝርዝር እና ማረጋገጫ።", icon: "CalendarClock", group: "Front of House" },
  { key: "inventory", en: "Stock Management & Inventory", am: "የክምችት አስተዳደር", desc_en: "Ledger-based stock control: purchases, transfers, counts, adjustments and reports.", desc_am: "የክምችት አስተዳደር፣ የግዢ፣ ዝውውር፣ ቆጠራ፣ ማስተካከያ እና ሪፖርቶች።", icon: "Warehouse", group: "Back of House" },
  { key: "procurement", en: "Procurement & Suppliers", am: "ግዢ እና አቅራቢዎች", desc_en: "Requisitions, POs, GRNs, supplier ledgers and payables.", desc_am: "ጥያቄ፣ የግዢ ትዕዛዝ፣ ደረሰኝ።", icon: "Truck", group: "Back of House" },
  { key: "recipes", en: "Recipes & Food Cost", am: "የምግብ አዘገጃጀት እና ወጪ", desc_en: "BOM per dish, theoretical vs actual cost, margin analysis.", desc_am: "የንጥረ ነገር ዝርዝር እና የወጪ ትንተና።", icon: "BookOpen", group: "Back of House" },
  { key: "room", en: "Room Service", am: "የክፍል አገልግሎት", desc_en: "Charge to room, in-room dining menu, tray tracking.", desc_am: "ወደ ክፍል ማስከፈል እና ክትትል።", icon: "BedDouble", group: "Front of House" },
  { key: "banquet", en: "Banquet & Events", am: "ድግስ እና ዝግጅት", desc_en: "Hall booking, BEO sheets, packages, deposit tracking.", desc_am: "የአዳራሽ ቦታ ማስያዝ እና የዝግጅት ሉህ።", icon: "PartyPopper", group: "Management" },
  { key: "catering", en: "Catering", am: "የውጭ አገልግሎት", desc_en: "Quotes, packing lists, vehicle dispatch, delivery confirmation.", desc_am: "ዋጋ ማቅረቢያ፣ የጥቅል ዝርዝር እና መላኪያ።", icon: "UtensilsCrossed", group: "Management" },
  { key: "crm", en: "Customer Management", am: "የደንበኛ አስተዳደር", desc_en: "Profiles, loyalty, feedback, marketing segments.", desc_am: "የደንበኛ መረጃ፣ ታማኝነት እና አስተያየት።", icon: "Users", group: "Management" },
  { key: "hr", en: "Employees & Roles", am: "ሰራተኞች እና ሚናዎች", desc_en: "Staff, shifts, attendance, role-based permissions, tip pool.", desc_am: "ሰራተኞች፣ ሺፍት እና ፍቃዶች።", icon: "IdCard", group: "Management" },
  { key: "payments", en: "Payments", am: "ክፍያዎች", desc_en: "Telebirr, CBE, Dashen, BOA, Awash, MPESA, cash, mixed payments, and reconciliation.", desc_am: "ቴሌብር፣ CBE፣ ዳሽን፣ BOA፣ ጥሬ ገንዘብ እና ቅልቅል።", icon: "Wallet", group: "Management" },
  { key: "reports", en: "Reports & Analytics", am: "ሪፖርቶች እና ትንታኔ", desc_en: "Sales, item performance, VAT, payroll, branch comparisons.", desc_am: "ሽያጭ፣ VAT እና የቅርንጫፍ ንጽጽር።", icon: "BarChart3", group: "Management" },
  { key: "admin", en: "System Administration", am: "የስርዓት አስተዳደር", desc_en: "Branches, outlets, printers, devices, audit logs, backups.", desc_am: "ቅርንጫፎች፣ መሳሪያዎች እና ምትኬ።", icon: "Settings2", group: "Management" },
];

export const PAYMENT_METHODS = [
  { key: "cash", label: "Cash", hint: "ETB" },
  { key: "cbe", label: "CBE", hint: "Bank transfer" },
  { key: "telebirr", label: "Telebirr", hint: "Mobile wallet" },
  { key: "cbe_birr", label: "CBE Birr", hint: "Mobile wallet" },
  { key: "dashen", label: "Dashen", hint: "Bank transfer" },
  { key: "boa", label: "BOA", hint: "Bank transfer" },
  { key: "awash", label: "Awash", hint: "Bank transfer" },
  { key: "mpesa", label: "MPESA", hint: "Mobile wallet" },
  { key: "siinqee", label: "Siinqee", hint: "Bank transfer" },
  { key: "kaafi_ebirr", label: "Kaafi Ebirr", hint: "Mobile money" },
  { key: "mixed", label: "Mixed", hint: "Cash + bank split" },
];

export const ETH_FEATURES = [
  { en: "Ethiopian Birr (ETB)", am: "ኢትዮጵያ ብር" },
  { en: "Amharic & English", am: "አማርኛ እና እንግሊዝኛ" },
  { en: "Ethiopian Calendar", am: "የኢትዮጵያ የቀን መቁጠሪያ" },
  { en: "15% VAT engine", am: "15% ቫት" },
  { en: "Telebirr & CBE Birr", am: "ቴሌብር እና CBE ብር" },
  { en: "Works offline", am: "ያለ ኢንተርኔት ይሰራል" },
  { en: "Multi-branch", am: "ብዙ ቅርንጫፍ" },
  { en: "Simple for non-tech users", am: "ለማንም ቀላል" },
];
