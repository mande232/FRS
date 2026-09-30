export type ReportCategoryId =
  | "executive"
  | "sales"
  | "orders"
  | "payments"
  | "inventory"
  | "purchasing"
  | "kitchen"
  | "tables"
  | "staff"
  | "customers"
  | "financial"
  | "branches"
  | "audit";

export type ReportFilterKey =
  | "branch"
  | "dateRange"
  | "shift"
  | "cashier"
  | "waiter"
  | "department"
  | "station"
  | "area"
  | "table"
  | "customer"
  | "supplier"
  | "category"
  | "menuItem"
  | "orderType"
  | "orderStatus"
  | "paymentStatus"
  | "paymentMethod"
  | "inventoryLocation"
  | "transactionType";

export type ReportDef = {
  id: string;
  category: ReportCategoryId;
  titleEn: string;
  titleAm: string;
  descriptionEn: string;
  descriptionAm: string;
  filters: ReportFilterKey[];
  /** Phase 1 reports return live data; others show empty/coming-soon in the shell */
  enabled: boolean;
  deepLink?: string;
};

export type ReportCategory = {
  id: ReportCategoryId;
  titleEn: string;
  titleAm: string;
  icon: string;
};

export const REPORT_CATEGORIES: ReportCategory[] = [
  { id: "executive", titleEn: "Executive", titleAm: "አስፈፃሚ", icon: "LayoutDashboard" },
  { id: "sales", titleEn: "Sales", titleAm: "ሽያጭ", icon: "TrendingUp" },
  { id: "orders", titleEn: "Orders", titleAm: "ትዕዛዞች", icon: "ClipboardList" },
  { id: "payments", titleEn: "Payments", titleAm: "ክፍያዎች", icon: "Wallet" },
  { id: "inventory", titleEn: "Inventory", titleAm: "ክምችት", icon: "Warehouse" },
  { id: "purchasing", titleEn: "Purchasing", titleAm: "ግዢ", icon: "Truck" },
  { id: "kitchen", titleEn: "Kitchen & Stations", titleAm: "ኩሽና እና ጣቢያዎች", icon: "ChefHat" },
  { id: "tables", titleEn: "Tables & Reservations", titleAm: "ጠረጴዛዎች", icon: "LayoutGrid" },
  { id: "staff", titleEn: "Staff", titleAm: "ሰራተኞች", icon: "IdCard" },
  { id: "customers", titleEn: "Customers", titleAm: "ደንበኞች", icon: "Users" },
  { id: "financial", titleEn: "Financial", titleAm: "ፋይናንስ", icon: "BadgeDollarSign" },
  { id: "branches", titleEn: "Branches", titleAm: "ቅርንጫፎች", icon: "Building2" },
  { id: "audit", titleEn: "Audit", titleAm: "ኦዲት", icon: "ShieldCheck" },
];

const salesFilters: ReportFilterKey[] = ["dateRange", "branch", "station", "category", "cashier", "waiter", "area"];
const orderFilters: ReportFilterKey[] = ["dateRange", "orderStatus", "paymentStatus", "area", "table", "waiter", "cashier"];
const paymentFilters: ReportFilterKey[] = ["dateRange", "paymentMethod", "paymentStatus", "cashier", "waiter"];
const inventoryFilters: ReportFilterKey[] = ["dateRange", "inventoryLocation", "department", "category"];

export const REPORT_DEFS: ReportDef[] = [
  // Executive — enabled
  {
    id: "business-summary",
    category: "executive",
    titleEn: "Business Summary",
    titleAm: "የንግድ ማጠቃለያ",
    descriptionEn: "Revenue, profit, orders, and payments overview",
    descriptionAm: "ገቢ፣ ትርፍ፣ ትዕዛዞች እና ክፍያዎች",
    filters: ["dateRange", "branch"],
    enabled: true,
  },
  {
    id: "daily-ops-summary",
    category: "executive",
    titleEn: "Daily Operations Summary",
    titleAm: "የዕለት ክወና ማጠቃለያ",
    descriptionEn: "Today's sales, pending payments, and stock alerts",
    descriptionAm: "የዛሬ ሽያጭ፣ በመጠባበቅ ያሉ ክፍያዎች",
    filters: ["dateRange", "branch"],
    enabled: true,
  },
  {
    id: "revenue-profitability",
    category: "executive",
    titleEn: "Revenue and Profitability",
    titleAm: "ገቢ እና ትርፋማነት",
    descriptionEn: "Gross/net sales and margin trends",
    descriptionAm: "ጠቅላላ/ተጣራ ሽያጭ እና ህዳግ",
    filters: ["dateRange"],
    enabled: true,
  },
  {
    id: "branch-comparison",
    category: "executive",
    titleEn: "Branch Comparison",
    titleAm: "የቅርንጫፍ ንጽጽር",
    descriptionEn: "Compare branch performance",
    descriptionAm: "የቅርንጫፍ አፈጻጸም ንጽጽር",
    filters: ["dateRange"],
    enabled: false,
  },
  {
    id: "management-kpi",
    category: "executive",
    titleEn: "Management KPI Report",
    titleAm: "የአስተዳደር KPI",
    descriptionEn: "Key management indicators",
    descriptionAm: "ቁልፍ የአስተዳደር አመልካቾች",
    filters: ["dateRange"],
    enabled: false,
  },

  // Sales — enabled core set
  {
    id: "daily-sales",
    category: "sales",
    titleEn: "Daily Sales",
    titleAm: "የዕለት ሽያጭ",
    descriptionEn: "Sold, paid, unpaid, orders and items for the day",
    descriptionAm: "የዕለቱ ሽያጭ፣ ክፍያ፣ ቀሪ፣ ትዕዛዞች እና እቃዎች",
    filters: salesFilters,
    enabled: true,
  },
  {
    id: "weekly-sales",
    category: "sales",
    titleEn: "Weekly Sales",
    titleAm: "ሳምንታዊ ሽያጭ",
    descriptionEn: "Sold, paid, unpaid, orders and items for the week",
    descriptionAm: "የሳምንቱ ሽያጭ፣ ክፍያ፣ ቀሪ፣ ትዕዛዞች እና እቃዎች",
    filters: salesFilters,
    enabled: true,
  },
  {
    id: "monthly-sales",
    category: "sales",
    titleEn: "Monthly Sales",
    titleAm: "ወርሃዊ ሽያጭ",
    descriptionEn: "Sold, paid, unpaid, orders and items for the month",
    descriptionAm: "የወሩ ሽያጭ፣ ክፍያ፣ ቀሪ፣ ትዕዛዞች እና እቃዎች",
    filters: salesFilters,
    enabled: true,
  },
  {
    id: "sales-by-hour",
    category: "sales",
    titleEn: "Sales by Hour",
    titleAm: "በሰዓት ሽያጭ",
    descriptionEn: "Hourly revenue distribution",
    descriptionAm: "በሰዓት የገቢ ስርጭት",
    filters: ["dateRange", "station", "area"],
    enabled: true,
  },
  {
    id: "sales-by-station",
    category: "sales",
    titleEn: "Sales by Station",
    titleAm: "በጣቢያ ሽያጭ",
    descriptionEn: "Revenue by production station",
    descriptionAm: "በምርት ጣቢያ ገቢ",
    filters: salesFilters,
    enabled: true,
  },
  {
    id: "sales-by-category",
    category: "sales",
    titleEn: "Sales by Category",
    titleAm: "በምድብ ሽያጭ",
    descriptionEn: "Revenue by menu category",
    descriptionAm: "በሜኑ ምድብ ገቢ",
    filters: salesFilters,
    enabled: true,
  },
  {
    id: "sales-by-item",
    category: "sales",
    titleEn: "Sales by Menu Item",
    titleAm: "በምናሌ እቃ ሽያጭ",
    descriptionEn: "Product performance ranking",
    descriptionAm: "የምርት አፈጻጸም ደረጃ",
    filters: salesFilters,
    enabled: true,
  },
  {
    id: "sales-by-waiter",
    category: "sales",
    titleEn: "Sales by Waiter",
    titleAm: "በአስተናጋጅ ሽያጭ",
    descriptionEn: "Waiter revenue contribution",
    descriptionAm: "የአስተናጋጅ የገቢ አስተዋጽኦ",
    filters: ["dateRange", "waiter", "area"],
    enabled: true,
  },
  {
    id: "sales-by-cashier",
    category: "sales",
    titleEn: "Sales by Cashier",
    titleAm: "በካሸር ሽያጭ",
    descriptionEn: "Cashier collection totals",
    descriptionAm: "የካሸር የክፍያ ድምር",
    filters: ["dateRange", "cashier"],
    enabled: true,
  },
  {
    id: "sales-by-branch",
    category: "sales",
    titleEn: "Sales by Branch",
    titleAm: "በቅርንጫፍ ሽያጭ",
    descriptionEn: "Branch sales comparison",
    descriptionAm: "የቅርንጫፍ ሽያጭ ንጽጽር",
    filters: ["dateRange", "branch"],
    enabled: false,
  },
  {
    id: "sales-by-area",
    category: "sales",
    titleEn: "Sales by Area",
    titleAm: "በክፍል ሽያጭ",
    descriptionEn: "Sales by seating area",
    descriptionAm: "በመቀመጫ ክፍል ሽያጭ",
    filters: salesFilters,
    enabled: true,
  },
  {
    id: "sales-by-table",
    category: "sales",
    titleEn: "Sales by Table",
    titleAm: "በጠረጴዛ ሽያጭ",
    descriptionEn: "Sales by table",
    descriptionAm: "በጠረጴዛ ሽያጭ",
    filters: salesFilters,
    enabled: false,
  },
  {
    id: "sales-by-order-type",
    category: "sales",
    titleEn: "Sales by Order Type",
    titleAm: "በትዕዛዝ አይነት ሽያጭ",
    descriptionEn: "Dine-in, QR, room, etc.",
    descriptionAm: "በትዕዛዝ ምንጭ ሽያጭ",
    filters: salesFilters,
    enabled: false,
  },

  // Orders
  {
    id: "orders-by-status",
    category: "orders",
    titleEn: "Orders by Status",
    titleAm: "በሁኔታ ትዕዛዞች",
    descriptionEn: "Open, closed, unpaid and outstanding orders",
    descriptionAm: "ክፍት፣ የተዘጉ፣ ያልተከፈሉ እና ቀሪ ትዕዛዞች",
    filters: orderFilters,
    enabled: true,
    deepLink: "/app/orders",
  },
  {
    id: "active-orders",
    category: "orders",
    titleEn: "Active Orders",
    titleAm: "ንቁ ትዕዛዞች",
    descriptionEn: "Open floor orders",
    descriptionAm: "ክፍት የወለል ትዕዛዞች",
    filters: orderFilters,
    enabled: true,
    deepLink: "/app/orders",
  },
  {
    id: "closed-orders",
    category: "orders",
    titleEn: "Closed Orders",
    titleAm: "የተዘጉ ትዕዛዞች",
    descriptionEn: "Settled closed orders",
    descriptionAm: "የተጠናቀቁ ትዕዛዞች",
    filters: orderFilters,
    enabled: true,
    deepLink: "/app/orders",
  },
  {
    id: "cancelled-orders",
    category: "orders",
    titleEn: "Cancelled Orders",
    titleAm: "የተሰረዙ ትዕዛዞች",
    descriptionEn: "Voids and cancellations",
    descriptionAm: "ስረዛዎች",
    filters: orderFilters,
    enabled: true,
    deepLink: "/app/orders",
  },
  {
    id: "returned-orders",
    category: "orders",
    titleEn: "Returned Orders",
    titleAm: "የተመለሱ ትዕዛዞች",
    descriptionEn: "Returned / refunded orders",
    descriptionAm: "የተመለሱ ትዕዛዞች",
    filters: orderFilters,
    enabled: true,
    deepLink: "/app/orders",
  },
  {
    id: "refunded-orders",
    category: "orders",
    titleEn: "Refunded Orders",
    titleAm: "ተመላሽ የተደረጉ",
    descriptionEn: "Orders with refunded payment status",
    descriptionAm: "ተመላሽ ክፍያ ያላቸው",
    filters: orderFilters,
    enabled: false,
  },
  {
    id: "delayed-orders",
    category: "orders",
    titleEn: "Delayed Orders",
    titleAm: "የዘገዩ ትዕዛዞች",
    descriptionEn: "Orders past prep target",
    descriptionAm: "ከዝግጅት ጊዜ ያለፉ",
    filters: orderFilters,
    enabled: false,
  },
  {
    id: "avg-prep-time",
    category: "orders",
    titleEn: "Average Preparation Time",
    titleAm: "አማካኝ የዝግጅት ጊዜ",
    descriptionEn: "Station prep averages",
    descriptionAm: "የጣቢያ ዝግጅት አማካኝ",
    filters: ["dateRange", "station"],
    enabled: false,
  },
  {
    id: "avg-service-time",
    category: "orders",
    titleEn: "Average Service Time",
    titleAm: "አማካኝ የአገልግሎት ጊዜ",
    descriptionEn: "Order open to close time",
    descriptionAm: "ከመክፈት እስከ መዝጋት",
    filters: ["dateRange"],
    enabled: false,
  },
  {
    id: "order-timeline",
    category: "orders",
    titleEn: "Order Timeline Report",
    titleAm: "የትዕዛዝ የጊዜ መስመር",
    descriptionEn: "Lifecycle events across orders",
    descriptionAm: "የትዕዛዝ ክስተቶች",
    filters: orderFilters,
    enabled: false,
  },

  // Payments
  {
    id: "payment-summary",
    category: "payments",
    titleEn: "Payment Summary",
    titleAm: "የክፍያ ማጠቃለያ",
    descriptionEn: "Collected, pending, void totals",
    descriptionAm: "የተሰበሰበ፣ በመጠባበቅ፣ የተሰረዘ",
    filters: paymentFilters,
    enabled: true,
    deepLink: "/app/payments",
  },
  {
    id: "payment-method-breakdown",
    category: "payments",
    titleEn: "Payment Method Breakdown",
    titleAm: "በክፍያ ዘዴ",
    descriptionEn: "Cash, Telebirr, Card, and more",
    descriptionAm: "ጥሬ፣ ቴሌብር፣ ካርድ",
    filters: paymentFilters,
    enabled: true,
    deepLink: "/app/payments",
  },
  {
    id: "payment-transactions",
    category: "payments",
    titleEn: "Payment Transactions",
    titleAm: "የክፍያ ግብይቶች",
    descriptionEn: "Ledger transaction detail",
    descriptionAm: "የመዝገብ ግብይት ዝርዝር",
    filters: paymentFilters,
    enabled: true,
    deepLink: "/app/payments",
  },
  {
    id: "unpaid-orders",
    category: "payments",
    titleEn: "Unpaid Orders",
    titleAm: "ያልተከፈሉ ትዕዛዞች",
    descriptionEn: "Receipts awaiting payment",
    descriptionAm: "ክፍያ የሚጠብቁ ደረሰኞች",
    filters: paymentFilters,
    enabled: true,
    deepLink: "/app/payments",
  },
  {
    id: "partial-payments",
    category: "payments",
    titleEn: "Partially Paid Orders",
    titleAm: "በከፊል የተከፈሉ",
    descriptionEn: "Outstanding balances",
    descriptionAm: "ቀሪ ሂሳብ",
    filters: paymentFilters,
    enabled: true,
    deepLink: "/app/payments",
  },
  {
    id: "refunds-report",
    category: "payments",
    titleEn: "Refunds",
    titleAm: "ተመላሾች",
    descriptionEn: "Returned and refunded activity",
    descriptionAm: "ተመላሽ እንቅስቃሴ",
    filters: paymentFilters,
    enabled: true,
    deepLink: "/app/payments",
  },
  {
    id: "voids-report",
    category: "payments",
    titleEn: "Voids",
    titleAm: "ስረዛዎች",
    descriptionEn: "Voided payments and orders",
    descriptionAm: "የተሰረዙ ክፍያዎች",
    filters: paymentFilters,
    enabled: true,
    deepLink: "/app/payments",
  },
  {
    id: "failed-payments",
    category: "payments",
    titleEn: "Failed Payments",
    titleAm: "ያልተሳኩ ክፍያዎች",
    descriptionEn: "Failed payment attempts",
    descriptionAm: "ያልተሳኩ ሙከራዎች",
    filters: paymentFilters,
    enabled: false,
  },
  {
    id: "cash-reconciliation",
    category: "payments",
    titleEn: "Cash Reconciliation",
    titleAm: "የጥሬ ገንዘብ ማስተካከያ",
    descriptionEn: "Shift cash expected vs counted",
    descriptionAm: "የተጠበቀ እና የተቆጠረ ጥሬ",
    filters: ["dateRange", "shift", "cashier"],
    enabled: true,
    deepLink: "/app/payments",
  },
  {
    id: "shift-settlement-report",
    category: "payments",
    titleEn: "Shift Settlement",
    titleAm: "የሽፍት ማጠቃለያ",
    descriptionEn: "Shift close pack summary",
    descriptionAm: "የሽፍት መዝጋት ማጠቃለያ",
    filters: ["dateRange", "shift", "cashier"],
    enabled: true,
    deepLink: "/app/payments",
  },

  // Inventory — enabled via stock helpers
  {
    id: "stock-balance",
    category: "inventory",
    titleEn: "Stock Balance by Location",
    titleAm: "በቦታ የክምችት ቀሪ",
    descriptionEn: "Balances across stores and departments",
    descriptionAm: "በማከማቻ እና ክፍሎች ቀሪ",
    filters: inventoryFilters,
    enabled: true,
    deepLink: "/app/stock-management",
  },
  {
    id: "inventory-valuation",
    category: "inventory",
    titleEn: "Inventory Valuation",
    titleAm: "የክምችት ዋጋ",
    descriptionEn: "Stock value by item and location",
    descriptionAm: "በእቃ እና ቦታ ዋጋ",
    filters: inventoryFilters,
    enabled: true,
    deepLink: "/app/stock-management",
  },
  {
    id: "stock-ledger",
    category: "inventory",
    titleEn: "Stock Ledger",
    titleAm: "የክምችት መዝገብ",
    descriptionEn: "Item movement ledger",
    descriptionAm: "የእቃ እንቅስቃሴ መዝገብ",
    filters: inventoryFilters,
    enabled: true,
    deepLink: "/app/stock-management",
  },
  {
    id: "item-movement",
    category: "inventory",
    titleEn: "Item Movement",
    titleAm: "የእቃ እንቅስቃሴ",
    descriptionEn: "Movement summary by type",
    descriptionAm: "በአይነት እንቅስቃሴ",
    filters: inventoryFilters,
    enabled: true,
  },
  {
    id: "store-1-stock",
    category: "inventory",
    titleEn: "Store 1 Stock",
    titleAm: "Store 1 ክምችት",
    descriptionEn: "Store 1 balances",
    descriptionAm: "Store 1 ቀሪ",
    filters: inventoryFilters,
    enabled: true,
  },
  {
    id: "store-2-stock",
    category: "inventory",
    titleEn: "Store 2 Stock",
    titleAm: "Store 2 ክምችት",
    descriptionEn: "Store 2 balances",
    descriptionAm: "Store 2 ቀሪ",
    filters: inventoryFilters,
    enabled: true,
  },
  {
    id: "department-stock",
    category: "inventory",
    titleEn: "Department Stock",
    titleAm: "የክፍል ክምችት",
    descriptionEn: "Kitchen, bars, butcher, coffee",
    descriptionAm: "ኩሽና፣ ባር፣ ስጋ፣ ቡና",
    filters: inventoryFilters,
    enabled: true,
  },
  {
    id: "low-stock",
    category: "inventory",
    titleEn: "Low Stock",
    titleAm: "ዝቅተኛ ክምችት",
    descriptionEn: "Below reorder level",
    descriptionAm: "ከዳግም ትዕዛዝ በታች",
    filters: inventoryFilters,
    enabled: true,
  },
  {
    id: "out-of-stock",
    category: "inventory",
    titleEn: "Out of Stock",
    titleAm: "ክምችት ያለቀ",
    descriptionEn: "Zero available quantity",
    descriptionAm: "ዜሮ የሚገኝ መጠን",
    filters: inventoryFilters,
    enabled: true,
  },
  {
    id: "negative-stock",
    category: "inventory",
    titleEn: "Negative Stock Exceptions",
    titleAm: "አሉታዊ ክምችት",
    descriptionEn: "Negative balance exceptions",
    descriptionAm: "አሉታዊ ቀሪ ልዩነቶች",
    filters: inventoryFilters,
    enabled: true,
  },
  {
    id: "expiry",
    category: "inventory",
    titleEn: "Expiry",
    titleAm: "ማብቂያ",
    descriptionEn: "Lots nearing expiry",
    descriptionAm: "ለማብቃት የቀረቡ",
    filters: inventoryFilters,
    enabled: true,
  },
  {
    id: "wastage",
    category: "inventory",
    titleEn: "Wastage",
    titleAm: "ብክነት",
    descriptionEn: "Wastage movements",
    descriptionAm: "የብክነት እንቅስቃሴ",
    filters: inventoryFilters,
    enabled: true,
  },
  {
    id: "damage",
    category: "inventory",
    titleEn: "Damage",
    titleAm: "ጉዳት",
    descriptionEn: "Damage write-offs",
    descriptionAm: "የጉዳት መሰረዝ",
    filters: inventoryFilters,
    enabled: false,
  },
  {
    id: "count-variance",
    category: "inventory",
    titleEn: "Physical Count Variance",
    titleAm: "የቁጥር ልዩነት",
    descriptionEn: "Count session variances",
    descriptionAm: "የቁጥር ክፍለ ጊዜ ልዩነት",
    filters: inventoryFilters,
    enabled: true,
  },
  {
    id: "stock-requests",
    category: "inventory",
    titleEn: "Stock Requests",
    titleAm: "የክምችት ጥያቄዎች",
    descriptionEn: "Department restock requests",
    descriptionAm: "የክፍል የክምችት ጥያቄዎች",
    filters: inventoryFilters,
    enabled: true,
  },
  {
    id: "stock-transfers",
    category: "inventory",
    titleEn: "Stock Transfers",
    titleAm: "ዝውውሮች",
    descriptionEn: "Inter-location transfers",
    descriptionAm: "በቦታዎች መካከል ዝውውር",
    filters: inventoryFilters,
    enabled: true,
  },
  {
    id: "goods-receiving",
    category: "inventory",
    titleEn: "Goods Receiving",
    titleAm: "ዕቃ መቀበል",
    descriptionEn: "GRN activity",
    descriptionAm: "የመቀበያ እንቅስቃሴ",
    filters: inventoryFilters,
    enabled: true,
  },
  {
    id: "department-consumption",
    category: "inventory",
    titleEn: "Department Consumption",
    titleAm: "የክፍል ፍጆታ",
    descriptionEn: "Consumption by department",
    descriptionAm: "በክፍል ፍጆታ",
    filters: inventoryFilters,
    enabled: true,
  },
  {
    id: "recipe-consumption",
    category: "inventory",
    titleEn: "Recipe Consumption",
    titleAm: "የአሰራር ፍጆታ",
    descriptionEn: "Recipe-driven deductions",
    descriptionAm: "በአሰራር ቅነሳ",
    filters: inventoryFilters,
    enabled: false,
  },

  // Purchasing — mostly coming soon except PO receiving
  {
    id: "purchase-requisitions",
    category: "purchasing",
    titleEn: "Purchase Requisitions",
    titleAm: "የግዢ ጥያቄዎች",
    descriptionEn: "PR documents",
    descriptionAm: "የግዢ ጥያቄ ሰነዶች",
    filters: ["dateRange", "supplier"],
    enabled: false,
  },
  {
    id: "purchase-orders",
    category: "purchasing",
    titleEn: "Purchase Orders",
    titleAm: "የግዢ ትዕዛዞች",
    descriptionEn: "PO status and totals",
    descriptionAm: "የግዢ ትዕዛዝ ሁኔታ",
    filters: ["dateRange", "supplier"],
    enabled: true,
  },
  {
    id: "purchase-receiving",
    category: "purchasing",
    titleEn: "Goods Receiving",
    titleAm: "ዕቃ መቀበል",
    descriptionEn: "PO receiving report",
    descriptionAm: "የግዢ መቀበያ ሪፖርት",
    filters: ["dateRange", "supplier"],
    enabled: true,
  },
  {
    id: "purchase-cost",
    category: "purchasing",
    titleEn: "Purchase Cost",
    titleAm: "የግዢ ወጪ",
    descriptionEn: "Purchase expense totals",
    descriptionAm: "የግዢ ወጪ ድምር",
    filters: ["dateRange"],
    enabled: true,
  },
  {
    id: "supplier-purchases",
    category: "purchasing",
    titleEn: "Supplier Purchases",
    titleAm: "በአቅራቢ ግዢ",
    descriptionEn: "Spend by supplier",
    descriptionAm: "በአቅራቢ ወጪ",
    filters: ["dateRange", "supplier"],
    enabled: false,
  },
  {
    id: "supplier-performance",
    category: "purchasing",
    titleEn: "Supplier Performance",
    titleAm: "የአቅራቢ አፈጻጸም",
    descriptionEn: "Delivery and variance",
    descriptionAm: "አቅርቦት እና ልዩነት",
    filters: ["dateRange", "supplier"],
    enabled: false,
  },
  {
    id: "purchase-variance",
    category: "purchasing",
    titleEn: "Purchase Variance",
    titleAm: "የግዢ ልዩነት",
    descriptionEn: "Ordered vs received",
    descriptionAm: "የታዘዘ እና የተቀበለ",
    filters: ["dateRange"],
    enabled: false,
  },

  // Kitchen
  {
    id: "station-performance",
    category: "kitchen",
    titleEn: "Station Performance",
    titleAm: "የጣቢያ አፈጻጸም",
    descriptionEn: "Sales and tickets by station",
    descriptionAm: "በጣቢያ ሽያጭ እና ቲኬት",
    filters: ["dateRange", "station"],
    enabled: true,
    deepLink: "/app/kds",
  },
  {
    id: "ticket-prep-time",
    category: "kitchen",
    titleEn: "Ticket Preparation Time",
    titleAm: "የቲኬት ዝግጅት ጊዜ",
    descriptionEn: "Prep duration metrics",
    descriptionAm: "የዝግጅት ጊዜ መለኪያ",
    filters: ["dateRange", "station"],
    enabled: false,
  },
  {
    id: "delayed-tickets",
    category: "kitchen",
    titleEn: "Delayed Tickets",
    titleAm: "የዘገዩ ቲኬቶች",
    descriptionEn: "Tickets past target",
    descriptionAm: "ከዒላማ ያለፉ ቲኬቶች",
    filters: ["dateRange", "station"],
    enabled: false,
  },
  {
    id: "items-prepared",
    category: "kitchen",
    titleEn: "Items Prepared",
    titleAm: "የተዘጋጁ እቃዎች",
    descriptionEn: "Prepared item counts",
    descriptionAm: "የተዘጋጁ ብዛት",
    filters: ["dateRange", "station"],
    enabled: false,
  },
  {
    id: "station-sales",
    category: "kitchen",
    titleEn: "Station Sales",
    titleAm: "የጣቢያ ሽያጭ",
    descriptionEn: "Station revenue",
    descriptionAm: "የጣቢያ ገቢ",
    filters: ["dateRange", "station"],
    enabled: true,
  },
  {
    id: "station-queue",
    category: "kitchen",
    titleEn: "Station Queue Performance",
    titleAm: "የጣቢያ ወረፋ",
    descriptionEn: "Queue depth and throughput",
    descriptionAm: "የወረፋ ጥልቀት",
    filters: ["dateRange", "station"],
    enabled: false,
  },
  {
    id: "cancel-by-station",
    category: "kitchen",
    titleEn: "Cancellation by Station",
    titleAm: "በጣቢያ ስረዛ",
    descriptionEn: "Cancels attributed to stations",
    descriptionAm: "ለጣቢያ የተመደቡ ስረዛዎች",
    filters: ["dateRange", "station"],
    enabled: false,
  },
  {
    id: "wastage-by-station",
    category: "kitchen",
    titleEn: "Wastage by Station",
    titleAm: "በጣቢያ ብክነት",
    descriptionEn: "Wastage by department/station",
    descriptionAm: "በጣቢያ ብክነት",
    filters: ["dateRange", "station"],
    enabled: true,
  },

  // Tables — coming soon mostly
  ...([
    ["table-occupancy", "Table Occupancy", "የጠረጴዛ ስራ ላይ"],
    ["table-turnover", "Table Turnover", "የጠረጴዛ ዝውውር"],
    ["sales-by-table-report", "Sales by Table", "በጠረጴዛ ሽያጭ"],
    ["sales-by-area-report", "Sales by Area", "በክፍል ሽያጭ"],
    ["avg-dining-duration", "Average Dining Duration", "አማካኝ የመመገብ ጊዜ"],
    ["reservations-report", "Reservations", "ቦታ ማስያዝ"],
    ["no-shows", "No-Shows", "ያልመጡ"],
    ["peak-occupancy", "Peak Occupancy Hours", "ከፍተኛ ስራ ሰዓት"],
  ] as const).map(([id, titleEn, titleAm]) => ({
    id,
    category: "tables" as const,
    titleEn,
    titleAm,
    descriptionEn: titleEn,
    descriptionAm: titleAm,
    filters: ["dateRange", "area", "table"] as ReportFilterKey[],
    enabled: id === "sales-by-area-report",
    deepLink: "/app/tables",
  })),

  // Staff
  {
    id: "staff-sales",
    category: "staff",
    titleEn: "Staff Sales",
    titleAm: "የሰራተኛ ሽያጭ",
    descriptionEn: "Combined staff sales",
    descriptionAm: "የተቀናጀ የሰራተኛ ሽያጭ",
    filters: ["dateRange", "waiter", "cashier"],
    enabled: true,
    deepLink: "/app/staff-sales",
  },
  {
    id: "waiter-performance",
    category: "staff",
    titleEn: "Waiter Performance",
    titleAm: "የአስተናጋጅ አፈጻጸም",
    descriptionEn: "Orders and revenue by waiter",
    descriptionAm: "በአስተናጋጅ ትዕዛዝ እና ገቢ",
    filters: ["dateRange", "waiter"],
    enabled: true,
  },
  {
    id: "cashier-performance",
    category: "staff",
    titleEn: "Cashier Performance",
    titleAm: "የካሸር አፈጻጸም",
    descriptionEn: "Collections by cashier",
    descriptionAm: "በካሸር የተሰበሰበ",
    filters: ["dateRange", "cashier"],
    enabled: true,
  },
  ...([
    ["orders-handled", "Orders Handled", "የተያዙ ትዕዛዞች"],
    ["avg-service-staff", "Average Service Time", "አማካኝ አገልግሎት"],
    ["discounts-by-staff", "Discounts by Staff", "በሰራተኛ ቅናሽ"],
    ["voids-by-staff", "Voids by Staff", "በሰራተኛ ስረዛ"],
    ["refunds-by-staff", "Refunds by Staff", "በሰራተኛ ተመላሽ"],
    ["shift-performance", "Shift Performance", "የሽፍት አፈጻጸም"],
  ] as const).map(([id, titleEn, titleAm]) => ({
    id,
    category: "staff" as const,
    titleEn,
    titleAm,
    descriptionEn: titleEn,
    descriptionAm: titleAm,
    filters: ["dateRange"] as ReportFilterKey[],
    enabled: false,
  })),

  // Customers — mostly soon
  ...([
    ["customer-sales", "Customer Sales", "የደንበኛ ሽያጭ"],
    ["customer-visits", "Customer Visit Frequency", "የጉብኝት ድግግሞሽ"],
    ["customer-order-history", "Customer Order History", "የደንበኛ ትዕዛዝ ታሪክ"],
    ["loyalty-activity", "Loyalty Activity", "የታማኝነት እንቅስቃሴ"],
    ["top-customers", "Top Customers", "ከፍተኛ ደንበኞች"],
    ["credit-customers", "Credit Customers", "ክሬዲት ደንበኞች"],
    ["outstanding-balance", "Outstanding Customer Balance", "ቀሪ የደንበኛ ሂሳብ"],
  ] as const).map(([id, titleEn, titleAm]) => ({
    id,
    category: "customers" as const,
    titleEn,
    titleAm,
    descriptionEn: titleEn,
    descriptionAm: titleAm,
    filters: ["dateRange", "customer"] as ReportFilterKey[],
    enabled: false,
    deepLink: "/app/customers",
  })),

  // Financial
  {
    id: "revenue-report",
    category: "financial",
    titleEn: "Revenue",
    titleAm: "ገቢ",
    descriptionEn: "Revenue summary",
    descriptionAm: "የገቢ ማጠቃለያ",
    filters: ["dateRange"],
    enabled: true,
  },
  {
    id: "expenses-report",
    category: "financial",
    titleEn: "Expenses",
    titleAm: "ወጪዎች",
    descriptionEn: "Expense breakdown",
    descriptionAm: "የወጪ ክፍፍል",
    filters: ["dateRange"],
    enabled: true,
  },
  {
    id: "gross-profit",
    category: "financial",
    titleEn: "Gross Profit",
    titleAm: "ጠቅላላ ትርፍ",
    descriptionEn: "Gross profit and margin",
    descriptionAm: "ጠቅላላ ትርፍ እና ህዳግ",
    filters: ["dateRange"],
    enabled: true,
  },
  {
    id: "net-profit",
    category: "financial",
    titleEn: "Net Profit",
    titleAm: "ተጣራ ትርፍ",
    descriptionEn: "Net after operating expenses",
    descriptionAm: "ከስራ ወጪ በኋላ",
    filters: ["dateRange"],
    enabled: true,
  },
  {
    id: "cogs",
    category: "financial",
    titleEn: "Cost of Goods Sold",
    titleAm: "የተሸጡ ዕቃዎች ወጪ",
    descriptionEn: "Product cost totals",
    descriptionAm: "የምርት ወጪ ድምር",
    filters: ["dateRange"],
    enabled: true,
  },
  {
    id: "profit-loss",
    category: "financial",
    titleEn: "Profit and Loss",
    titleAm: "ትርፍ እና ኪሳራ",
    descriptionEn: "P&L style summary",
    descriptionAm: "የP&L ማጠቃለያ",
    filters: ["dateRange"],
    enabled: true,
  },
  ...([
    ["vat-report", "VAT", "ተጨማሪ እሴት ታክስ"],
    ["service-charge", "Service Charge", "የአገልግሎት ክፍያ"],
    ["discounts-report", "Discounts", "ቅናሾች"],
    ["refunds-financial", "Refunds", "ተመላሾች"],
    ["cash-flow", "Cash Flow Summary", "የገንዘብ ፍሰት"],
  ] as const).map(([id, titleEn, titleAm]) => ({
    id,
    category: "financial" as const,
    titleEn,
    titleAm,
    descriptionEn: titleEn,
    descriptionAm: titleAm,
    filters: ["dateRange"] as ReportFilterKey[],
    enabled: false,
  })),

  // Branches
  ...([
    ["branch-revenue", "Branch Revenue", "የቅርንጫፍ ገቢ"],
    ["branch-orders", "Branch Orders", "የቅርንጫፍ ትዕዛዞች"],
    ["branch-profit", "Branch Profit", "የቅርንጫፍ ትርፍ"],
    ["branch-inventory", "Branch Inventory", "የቅርንጫፍ ክምችት"],
    ["branch-payments", "Branch Payments", "የቅርንጫፍ ክፍያዎች"],
    ["branch-staff", "Branch Staff Performance", "የቅርንጫፍ ሰራተኛ"],
    ["branch-compare", "Branch Comparison", "የቅርንጫፍ ንጽጽር"],
  ] as const).map(([id, titleEn, titleAm]) => ({
    id,
    category: "branches" as const,
    titleEn,
    titleAm,
    descriptionEn: titleEn,
    descriptionAm: titleAm,
    filters: ["dateRange", "branch"] as ReportFilterKey[],
    enabled: false,
  })),

  // Audit
  {
    id: "approval-history",
    category: "audit",
    titleEn: "Approval History",
    titleAm: "የማጽደቅ ታሪክ",
    descriptionEn: "Inventory approval activity",
    descriptionAm: "የክምችት ማጽደቅ እንቅስቃሴ",
    filters: ["dateRange"],
    enabled: true,
  },
  {
    id: "voids-refunds-audit",
    category: "audit",
    titleEn: "Voids and Refunds",
    titleAm: "ስረዛ እና ተመላሽ",
    descriptionEn: "Void/return audit trail",
    descriptionAm: "የስረዛ/ተመላሽ ኦዲት",
    filters: ["dateRange"],
    enabled: true,
  },
  ...([
    ["user-activity", "User Activity", "የተጠቃሚ እንቅስቃሴ"],
    ["login-history", "Login History", "የመግቢያ ታሪክ"],
    ["order-changes", "Order Changes", "የትዕዛዝ ለውጦች"],
    ["payment-changes", "Payment Changes", "የክፍያ ለውጦች"],
    ["inventory-adjustments", "Inventory Adjustments", "የክምችት ማስተካከያ"],
    ["stock-transfers-audit", "Stock Transfers", "ዝውውሮች"],
    ["role-permission-changes", "Role and Permission Changes", "የሚና ለውጦች"],
  ] as const).map(([id, titleEn, titleAm]) => ({
    id,
    category: "audit" as const,
    titleEn,
    titleAm,
    descriptionEn: titleEn,
    descriptionAm: titleAm,
    filters: ["dateRange"] as ReportFilterKey[],
    enabled: false,
  })),
];

export function reportsForCategory(category: ReportCategoryId) {
  return REPORT_DEFS.filter((report) => report.category === category);
}

export function findReport(id: string) {
  return REPORT_DEFS.find((report) => report.id === id) ?? REPORT_DEFS[0];
}

export function defaultReportForCategory(category: ReportCategoryId) {
  const enabled = REPORT_DEFS.find((report) => report.category === category && report.enabled);
  return enabled ?? REPORT_DEFS.find((report) => report.category === category) ?? REPORT_DEFS[0];
}

/** Most-used shortcuts shown at the top of the Reports page. */
export const QUICK_REPORT_IDS = [
  "daily-sales",
  "weekly-sales",
  "monthly-sales",
  "sales-by-item",
  "business-summary",
  "payment-summary",
  "stock-balance",
  "voids-refunds-audit",
] as const;

export function quickReports() {
  return QUICK_REPORT_IDS.map((id) => findReport(id)).filter((report) => report.enabled);
}

export function searchReports(query: string) {
  const needle = query.trim().toLowerCase();
  if (!needle) return [] as ReportDef[];
  return REPORT_DEFS.filter((report) => {
    const haystack = [
      report.id,
      report.titleEn,
      report.titleAm,
      report.descriptionEn,
      report.descriptionAm,
      report.category,
    ]
      .join(" ")
      .toLowerCase();
    return haystack.includes(needle);
  });
}

export function findCategory(id: ReportCategoryId) {
  return REPORT_CATEGORIES.find((entry) => entry.id === id) ?? REPORT_CATEGORIES[0];
}
