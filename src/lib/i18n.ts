import { useLang, type AppLang } from "./lang-context.ts";
import { menuItemAmharicName } from "./menu-i18n.ts";

export { menuCategoryName, menuItemGlyph } from "./menu-i18n.ts";

const translations = {
  // Navigation groups
  Overview: { am: "አጠቃላይ" },
  Service: { am: "አገልግሎት" },
  Catalog: { am: "ሜኑ እና ክምችት" },
  People: { am: "ሰራተኛ እና ደንበኛ" },
  Operations: { am: "ስራዎች" },
  Finance: { am: "ፋይናንስ" },

  // Nav items
  Dashboard: { am: "ዳሽቦርድ" },
  POS: { am: "ፖስ" },
  Kitchen: { am: "ኩሽና" },
  Tables: { am: "ጠረጴዛዎች" },
  Orders: { am: "ትዕዛዞች" },
  Reservations: { am: "ቦታ ማስያዝ" },
  "Room Service": { am: "የክፍል አገልግሎት" },
  "Digital Menu": { am: "ዲጂታል ሜኑ" },
  Menu: { am: "ሜኑ" },
  "Recipes & Cost": { am: "አዘገጃጀት እና ወጪ" },
  Inventory: { am: "ክምችት" },
  "Stock Management": { am: "የክምችት አስተዳደር" },
  Suppliers: { am: "አቅራቢዎች" },
  Customers: { am: "ደንበኞች" },
  Staff: { am: "ሰራተኞች" },
  "Banquet & Events": { am: "ድግስ እና ዝግጅቶች" },
  Catering: { am: "የውጭ አገልግሎት" },
  Payments: { am: "ክፍያዎች" },
  Reports: { am: "ሪፖርቶች" },
  Settings: { am: "ቅንብሮች" },

  // Dashboard
  "Good evening, Liya": { am: "እንኳን ደህና ዋሉ፣ ልያ" },
  "Here's how Bole is performing today.": { am: "የቦሌ ቅርንጫፍ ዛሬ ያለው ሁኔታ ይህ ነው።" },
  "New Order": { am: "አዲስ ትዕዛዝ" },
  "Today's Sales": { am: "የዛሬ ሽያጭ" },
  "+12.4% vs yesterday": { am: "+12.4% ከትናንት ጋር ሲነጻጸር" },
  Covers: { am: "እንግዶች" },
  "Avg check ETB 487": { am: "አማካኝ ሂሳብ 487 ብር" },
  "VAT collected": { am: "የተሰበሰበ ቫት" },
  "15% inclusive": { am: "15% ጨምሮ" },
  "Open tickets": { am: "ክፍት ትዕዛዞች" },
  "3 awaiting bill": { am: "3 ሂሳብ ይጠብቃሉ" },
  "Sales by hour": { am: "በሰዓት ሽያጭ" },
  "Today · Bole branch · all outlets": { am: "ዛሬ · ቦሌ ቅርንጫፍ · ሁሉም ክፍሎች" },
  Live: { am: "ቀጥታ" },
  "Top items today": { am: "ዛሬ በብዛት የተሸጡ" },
  sold: { am: "ተሸጠ" },
  "Active orders": { am: "ክፍት ትዕዛዞች" },
  "View all →": { am: "ሁሉንም ይመልከቱ →" },
  Branches: { am: "ቅርንጫፎች" },
  outlets: { am: "ክፍሎች" },

  // Stock management
  "Add stock item": { am: "ዕቃ ጨምር" },
  "Low stock alert": { am: "ክምችት አነስቷል" },
  "No low stock items right now.": { am: "አሁን ክምችቱ ያነሰ ዕቃ የለም።" },
  "Top selling items": { am: "በብዛት የተሸጡ" },
  "No manual deductions recorded today.": { am: "ዛሬ በእጅ የተቀነሰ ክምችት የለም።" },

  // POS
  "Point of Sale": { am: "ፖስ" },
  "Tap items · send to kitchen · take payment.": { am: "ከሜኑ ይምረጡ · ወደ ኩሽና ይላኩ · ክፍያ ይቀበሉ።" },
  "Search menu…": { am: "ሜኑ ፈልግ…" },
  "No items match": { am: "የሚመሳሰል ምግብ አልተገኘም" },
  "Current ticket": { am: "አሁን ያለ ትዕዛዝ" },
  Table: { am: "ጠረጴዛ" },
  "No items yet — tap a menu item to add": { am: "እስካሁን ምግብ አልተመረጠም — ከሜኑ ይጨምሩ" },
  each: { am: "እያንዳንዱ" },
  Subtotal: { am: "ንዑስ ድምር" },
  "Service 10%": { am: "አገልግሎት 10%" },
  "VAT 15%": { am: "ቫት 15%" },
  Total: { am: "ጠቅላላ" },
  "Sent!": { am: "ተልኳል!" },
  "Send KOT": { am: "ወደ ኩሽና ላክ" },
  Pay: { am: "ክፈል" },
  "Clear ticket": { am: "ትዕዛዝ አጽዳ" },
  "Take payment": { am: "ክፍያ ተቀበል" },
  "Cash tendered (ETB)": { am: "የተቀበለ ጥሬ ገንዘብ (ብር)" },
  Change: { am: "ተመላሽ ገንዘብ" },
  "Confirm payment": { am: "ክፍያ አረጋግጥ" },
  Receipt: { am: "ደረሰኝ" },
  Print: { am: "አትም" },
  Done: { am: "ተጠናቋል" },
  Invoice: { am: "የደረሰኝ ቁጥር" },
  Method: { am: "የክፍያ መንገድ" },
  Cart: { am: "ትዕዛዝ" },
  "Cart total": { am: "የትዕዛዝ ድምር" },
  "In cart": { am: "በትዕዛዝ" },

  // Orders
  "active · one pipeline, every channel": { am: "ክፍት · ሁሉም የትዕዛዝ መንገዶች በአንድ ስፍራ" },
  "New order": { am: "አዲስ ትዕዛዝ" },
  Channel: { am: "መንገድ" },
  Ref: { am: "ማጣቀሻ" },
  Items: { am: "ዕቃዎች" },
  Server: { am: "አስተናጋጅ" },
  Status: { am: "ሁኔታ" },
  Age: { am: "የቆየበት ጊዜ" },
  "No orders match this filter": { am: "በዚህ ማጣሪያ ትዕዛዝ አልተገኘም" },
  "New Order": { am: "አዲስ ትዕዛዝ" },
  "Table / Ref": { am: "ጠረጴዛ / ማጣቀሻ" },
  "Select items": { am: "ምግቦችን ይምረጡ" },
  "Place order": { am: "ትዕዛዝ ላክ" },
  Cancel: { am: "ሰርዝ" },

  // KDS
  "Kitchen Display": { am: "የኩሽና ስክሪን" },
  "Bump items as they're plated. Colour shifts as tickets age.": {
    am: "ምግቡ ሲቀርብ ዝግጁ አድርጉ። ቲኬቱ ሲቆይ ቀለሙ ይቀየራል።",
  },
  "active tickets": { am: "ክፍት ቲኬቶች" },
  "No active tickets": { am: "ክፍት ቲኬት የለም" },
  Recall: { am: "መልሰህ አምጣ" },
  Bump: { am: "ዝግጁ" },
  Ready: { am: "ዝግጁ" },
  "All tickets bumped — kitchen is clear!": { am: "ሁሉም ቲኬቶች ተጠናቀዋል — ኩሽናው ነፃ ነው!" },

  // Tables
  "Tables & Floor": { am: "ጠረጴዛዎች እና ወለል" },
  occupied: { am: "ተይዟል" },
  "awaiting bill": { am: "ሂሳብ ይጠብቃል" },
  "Seat walk-in": { am: "ያለ ቦታ ማስያዝ እንግዳ ተቀበል" },
  Available: { am: "ነፃ" },
  Occupied: { am: "ተይዟል" },
  "Awaiting Bill": { am: "ሂሳብ ይጠብቃል" },
  Reserved: { am: "ቦታ የተያዘ" },
  Guests: { am: "እንግዶች" },
  Open: { am: "ክፍት" },
  "Seat Walk-in": { am: "እንግዳ ምደባ" },
  "No available tables right now.": { am: "አሁን ነፃ ጠረጴዛ የለም።" },
  seats: { am: "መቀመጫዎች" },
  Seat: { am: "ምደብ" },
  Save: { am: "አስቀምጥ" },
  "Running total (ETB)": { am: "እስካሁን ድምር (ብር)" },

  // Reservations
  Reservations: { am: "ቦታ ማስያዝ" },
  bookings: { am: "ቦታ ማስያዞች" },
  confirmed: { am: "ተረጋግጧል" },
  covers: { am: "እንግዶች" },
  "New reservation": { am: "አዲስ ቦታ ማስያዝ" },
  "party of": { am: "የእንግዶች ብዛት" },
  Deposit: { am: "ቅድመ ክፍያ" },
  Confirm: { am: "አረጋግጥ" },
  "Tonight's outlook": { am: "የዛሬ ምሽት ሁኔታ" },
  "Covers booked": { am: "ቦታ የያዙ እንግዶች" },
  "Deposits collected": { am: "የተሰበሰበ ቅድመ ክፍያ" },
  "Deposit pending": { am: "ቅድመ ክፍያ ይጠበቃል" },
  Suggestion: { am: "ምክር" },
  "All deposits collected — great work!": { am: "ሁሉም ቅድመ ክፍያ ተሰብስቧል — ጥሩ ስራ!" },
  "New Reservation": { am: "አዲስ ቦታ ማስያዝ" },
  "Edit Reservation": { am: "ቦታ ማስያዝ ቀይር" },
  "Guest name": { am: "የእንግዳ ስም" },
  Phone: { am: "ስልክ" },
  Time: { am: "ሰዓት" },
  "Party size": { am: "የእንግዶች ብዛት" },

  // Menu
  "items · bilingual catalog": { am: "ዕቃዎች · በአማርኛ እና እንግሊዝኛ" },
  "Add item": { am: "ዕቃ ጨምር" },
  "Name (EN)": { am: "ስም (እንግሊዝኛ)" },
  "Name (አማ)": { am: "ስም (አማርኛ)" },
  Category: { am: "ምድብ" },
  Station: { am: "ጣቢያ" },
  Cost: { am: "ወጪ" },
  Price: { am: "ዋጋ" },
  Margin: { am: "ትርፍ" },
  "No items match": { am: "ምንም ዕቃ አልተገኘም" },
  "Edit item": { am: "ዕቃ ቀይር" },
  "Add item": { am: "ዕቃ ጨምር" },
  "Name (English)": { am: "ስም (እንግሊዝኛ)" },
  "Name (አማርኛ)": { am: "ስም (አማርኛ)" },
  "Price (ETB)": { am: "ዋጋ (ብር)" },
  "Cost (ETB)": { am: "ወጪ (ብር)" },
  Emoji: { am: "ምስል" },
  Vegetarian: { am: "የጾም" },
  "Gross margin": { am: "ጠቅላላ ትርፍ" },

  // Reports
  "Reports & Analytics": { am: "ሪፖርቶች እና ትንታኔ" },
  "Today · all branches": { am: "ዛሬ · ሁሉም ቅርንጫፎች" },
  Export: { am: "ላክ" },
  "VAT return": { am: "የቫት ሪፖርት" },
  "Gross sales": { am: "ጠቅላላ ሽያጭ" },
  "across 4 branches": { am: "በ4 ቅርንጫፎች" },
  "Food cost %": { am: "የምግብ ወጪ %" },
  "target 32%": { am: "ዒላማ 32%" },
  "Labor %": { am: "የሰው ሃይል %" },
  "target 25%": { am: "ዒላማ 25%" },
  "Sales by hour": { am: "በሰዓት ሽያጭ" },
  "Branch comparison": { am: "የቅርንጫፍ ንጽጽር" },
  "Top items": { am: "በብዛት የተሸጡ" },
  Item: { am: "ዕቃ" },
  Qty: { am: "ብዛት" },
  Revenue: { am: "ገቢ" },
  Share: { am: "ድርሻ" },

  // Payments
  "Payments & Ledger": { am: "ክፍያዎች እና መዝገብ" },
  "All transactions · reconciliation · cash-up": { am: "ሁሉም ክፍያዎች · ማስተካከያ · የሺፍት መዝጊያ" },
  "Cash-up": { am: "የሺፍት መዝጊያ" },
  "Settled today": { am: "ዛሬ የተከፈሉ" },
  Pending: { am: "በመጠባበቅ" },
  Transactions: { am: "ግብይቶች" },
  Void: { am: "ሰርዝ" },
  "By method": { am: "በክፍያ መንገድ" },
  "VAT summary": { am: "የቫት ማጠቃለያ" },
  Gross: { am: "ጠቅላላ" },
  Net: { am: "ተጣራ" },
  Settled: { am: "ተከፍሏል" },
  Settle: { am: "ክፈል" },
  "End-of-shift Cash-up": { am: "የሺፍት መዝጊያ ሒሳብ" },
  "Expected cash": { am: "የሚጠበቅ ጥሬ ገንዘብ" },
  "Total digital": { am: "ጠቅላላ ዲጂታል" },
  "Counted cash (ETB)": { am: "የተቆጠረ ጥሬ ገንዘብ (ብር)" },
  Balanced: { am: "ተስተካክሏል" },
  Over: { am: "ትርፍ" },
  Short: { am: "ጉድለት" },
  "Close shift": { am: "ሺፍት ዝጋ" },
  Cashier: { am: "ካሸር" },

  // Settings
  "System Administration": { am: "የስርዓት አስተዳደር" },
  "Branches, devices, taxes, integrations.": { am: "ቅርንጫፎች፣ መሳሪያዎች፣ ቀረጥ፣ ውህደቶች።" },
  "Branches & outlets": { am: "ቅርንጫፎች እና ክፍሎች" },
  "Tax & currency": { am: "ቀረጥ እና ምንዛሬ" },
  "Base currency": { am: "መሰረታዊ ምንዛሬ" },
  "VAT rate": { am: "የቫት መጠን" },
  "Service charge": { am: "የአገልግሎት ክፍያ" },
  "VAT mode": { am: "ቫት ሁኔታ" },
  "Invoice prefix": { am: "የደረሰኝ ቅድመ ቁጥር" },
  "Payment providers": { am: "የክፍያ አገልግሎቶች" },
  Connected: { am: "ተገናኝቷል" },
  "Manual reconcile": { am: "በእጅ አስተካክል" },
  "Devices & printers": { am: "መሳሪያዎች እና አታሚዎች" },
  Online: { am: "ኦንላይን" },
  Localization: { am: "ቋንቋ እና ቀን" },
  "Amharic interface": { am: "አማርኛ ገጽታ" },
  "English interface": { am: "እንግሊዝኛ ገጽታ" },
  "Ethiopian calendar": { am: "የኢትዮጵያ ቀን መቁጠሪያ" },
  "Gregorian calendar (guests)": { am: "ጎርጎሪዮሳዊ ቀን (እንግዶች)" },
  "Offline mode": { am: "ያለ ኢንተርኔት" },
  "Two-factor for managers": { am: "ሁለት ደረጃ ማረጋገጫ ለሥራ አስኪያጆች" },

  // Events
  "Banquet & Events": { am: "ድግስ እና ዝግጅቶች" },
  "Hall bookings, BEO sheets, deposits, and catering jobs.": {
    am: "የአዳራሽ ቦታ ማስያዝ፣ የድግስ ትዕዛዝ እና ቅድመ ክፍያ።",
  },
  "New booking": { am: "አዲስ ቦታ ማስያዝ" },
  Pipeline: { am: "ሂደት" },
  Confirmed: { am: "ተረጋግጧል" },
  Inquiries: { am: "ጥያቄዎች" },
  "Open BEO": { am: "የድግስ ትዕዛዝ ክፈት" },
  "Request deposit": { am: "ቅድመ ክፍያ ጠይቅ" },
  Guests: { am: "እንግዶች" },
  Value: { am: "ዋጋ" },
  Coordinator: { am: "አስተባባሪ" },
  "New Booking": { am: "አዲስ ቦታ ማስያዝ" },
  "Event name": { am: "የዝግጅት ስም" },
  Date: { am: "ቀን" },
  Hall: { am: "አዳራሽ" },

  // Catering
  "Catering & Offsite": { am: "የውጭ አገልግሎት" },
  "Off-premises jobs · packing lists · vehicle dispatch": {
    am: "ከሬስቶራንት ውጭ ስራ · የማሸጊያ ዝርዝር · መኪና መላክ",
  },
  "New job": { am: "አዲስ ስራ" },
  "Active jobs": { am: "ክፍት ስራዎች" },
  "Packing now": { am: "አሁን እየታሸገ" },
  Quotations: { am: "የዋጋ ጥያቄዎች" },
  "Packing list": { am: "የማሸጊያ ዝርዝር" },
  Driver: { am: "ሹፌር" },
  Vehicle: { am: "መኪና" },
  Edit: { am: "ቀይር" },
  "New Catering Job": { am: "አዲስ የውጭ ስራ" },
  "Edit Job": { am: "ስራ ቀይር" },
  Client: { am: "ደንበኛ" },
  Event: { am: "ዝግጅት" },
  Location: { am: "ቦታ" },
  Notes: { am: "ማስታወሻ" },

  // Room Service
  "Room Service": { am: "የክፍል አገልግሎት" },
  "In-room dining orders — charged to guest folio": { am: "የክፍል ውስጥ ምግብ — ወደ የእንግዳ ሒሳብ ይጨመራል" },
  "Active orders": { am: "ንቁ ትዕዛዞች" },
  "Today's revenue": { am: "የዛሬ ገቢ" },
  "On the way": { am: "በመንገድ ላይ" },
  Delivered: { am: "ደርሷል" },
  "Charge to room": { am: "ወደ ክፍል ሒሳብ" },
  "New Room Service Order": { am: "አዲስ የክፍል ትዕዛዝ" },
  Room: { am: "ክፍል" },
  "Guest name": { am: "የእንግዳ ስም" },

  // Bar
  "Pour control · bottle inventory · variance tracking": {
    am: "የመጠጥ ቁጥጥር · ጠርሙስ ክምችት · ልዩነት ክትትል",
  },
  "Log pour": { am: "መጠጥ መዝግብ" },
  "Bar stock value": { am: "የባር ክምችት ዋጋ" },
  "Pours today": { am: "ዛሬ የፈሰሱ" },
  "Items tracked": { am: "የሚከታተሉ ዕቃዎች" },
  Stock: { am: "ክምችት" },
  "Pour Log": { am: "የመጠጥ መዝገብ" },
  Low: { am: "ዝቅተኛ" },
  OK: { am: "በቂ" },
  "Adjust stock": { am: "ክምችት ቀይር" },
  "No pours logged": { am: "የተመዘገበ መጠጥ የለም" },
  "Log Pour": { am: "መጠጥ መዝግብ" },
  Quantity: { am: "ብዛት" },
  Log: { am: "ምዝብ" },

  // Inventory
  "Real-time stock across stores": { am: "በመጋዘኖች ያለው ክምችት በቀጥታ" },
  Transfer: { am: "ዝውውር" },
  "Stock count": { am: "የክምችት ቆጠራ" },
  "Items tracked": { am: "የሚከታተሉ ዕቃዎች" },
  "Inventory value": { am: "የክምችት ዋጋ" },
  "Below reorder": { am: "ከትዕዛዝ ደረጃ በታች" },
  "needs PO": { am: "PO ያስፈልጋል" },
  Stores: { am: "መጋዘኖች" },
  "Low stock alerts": { am: "ዝቅተኛ ክምችት ማስጠንቀቂያ" },
  "are at or below reorder level.": { am: "ወደ ትዕዛዝ ደረጃ ወርደዋል ወይም ከዚያ በታች ናቸው።" },
  "Search SKU or name…": { am: "SKU ወይም ስም ፈልግ…" },
  "On hand": { am: "ባለ እጅ" },
  "Reorder at": { am: "ትዕዛዝ ደረጃ" },
  Supplier: { am: "አቅራቢ" },
  Reorder: { am: "ትዕዛዝ" },
  Adjust: { am: "አስተካክል" },
  "Stock Transfer": { am: "ክምችት ዝውውር" },
  "From item (source)": { am: "ከ (ምንጭ)" },
  "To item (destination)": { am: "ወደ (መዳረሻ)" },
  "Quantity to transfer": { am: "ለዝውውር ብዛት" },
  "Stock Count": { am: "የክምችት ቆጠራ" },
  "Apply count": { am: "ቆጠራ ተግብር" },
  "Add Stock Item": { am: "ዕቃ ጨምር" },
  Unit: { am: "መለኪያ" },
  Add: { am: "ጨምር" },

  // Staff
  "employees · currently on shift": { am: "ሰራተኞች · አሁን በሺፍት ላይ" },
  List: { am: "ዝርዝር" },
  Schedule: { am: "መርሃ ግብር" },
  "Add employee": { am: "ሰራተኛ ጨምር" },
  "On shift": { am: "በሺፍት" },
  "Off duty": { am: "ከሺፍት ውጭ" },
  "Morning shift": { am: "የጠዋት ሺፍት" },
  "Evening shift": { am: "የምሽት ሺፍት" },
  Role: { am: "ሚና" },
  Shift: { am: "ሺፍት" },
  Hours: { am: "ሰዓቶች" },
  "Days worked": { am: "የሰሩ ቀናት" },
  "Clock out": { am: "ወጣ" },
  "Clock in": { am: "ገባ" },
  Shift: { am: "ሺፍት" },
  "Add Employee": { am: "ሰራተኛ ጨምር" },
  "Full Name": { am: "ሙሉ ስም" },
  "Start time": { am: "የመጀመሪያ ሰዓት" },
  "End time": { am: "የመጨረሻ ሰዓት" },

  // Customers
  "regular customers": { am: "ቋሚ ደንበኞች" },
  "lifetime value": { am: "ጠቅላላ የደንበኛ ዋጋ" },
  "Add customer": { am: "ደንበኛ ጨምር" },
  "Send campaign": { am: "ማስታወቂያ ላክ" },
  Visits: { am: "ጉብኝቶች" },
  Spent: { am: "የከፈለ" },
  Points: { am: "ነጥቦች" },
  "Progress to": { am: "ወደ" },
  "Last visit:": { am: "የመጨረሻ ጉብኝት:" },
  Tier: { am: "ደረጃ" },
  "Loyalty Points": { am: "የታማኝነት ነጥቦች" },
  Feedback: { am: "አስተያየት" },
  "Save changes": { am: "ለውጦችን አስቀምጥ" },
  "Add Customer": { am: "ደንበኛ ጨምር" },
  "Starting Tier": { am: "የጀማሪ ደረጃ" },
  "Send Campaign": { am: "ማስታወቂያ ላክ" },
  "Recipients:": { am: "ተቀባዮች:" },
  customers: { am: "ደንበኞች" },
  "Type your message (SMS / in-app)…": { am: "መልዕክትዎን ይጻፉ…" },
  "Sent successfully!": { am: "በተሳካ ሁኔታ ተልኳል!" },
  "Send to all": { am: "ለሁሉም ላክ" },

  // Suppliers
  "suppliers · payable": { am: "አቅራቢዎች · ሊከፈል" },
  "Add supplier": { am: "አቅራቢ ጨምር" },
  "New PO": { am: "አዲስ የግዢ ትዕዛዝ" },
  "Open POs": { am: "ክፍት የግዢ ትዕዛዞች" },
  "Pending GRNs": { am: "በመጠባበቅ ያሉ መቀበያዎች" },
  "awaiting receipt": { am: "መቀበያ ይጠብቃል" },
  "Total payable": { am: "ጠቅላላ ሊከፈል" },
  Suppliers: { am: "አቅራቢዎች" },
  "Purchase Orders": { am: "የግዢ ትዕዛዞች" },
  Contact: { am: "ግንኙነት" },
  Outstanding: { am: "ያልተከፈለ" },
  Pay: { am: "ክፈል" },
  "Create PO": { am: "የግዢ ትዕዛዝ ፍጠር" },
  Approve: { am: "አጽድቅ" },
  "Receive GRN": { am: "መቀበያ ተቀበል" },
  Received: { am: "ተቀብሏል" },
  Approved: { am: "ጸድቋል" },

  // Recipes
  "recipes · avg margin": { am: "አዘገጃጀቶች · አማካኝ ትርፍ" },
  "Add recipe": { am: "አዘገጃጀት ጨምር" },
  "Avg margin": { am: "አማካኝ ትርፍ" },
  "High food cost": { am: "ከፍተኛ የምግብ ወጪ" },
  ">40% cost ratio": { am: ">40% የወጪ ምጣኔ" },
  "Target food cost": { am: "ዒላማ የምግብ ወጪ" },
  yield: { am: "ምርት" },
  Ingredients: { am: "ጥሬ ዕቃዎች" },
  "Sale price": { am: "የሽያጭ ዋጋ" },
  "Food cost ratio": { am: "የምግብ ወጪ ምጣኔ" },
  "Edit Recipe": { am: "አዘገጃጀት ቀይር" },
  "New Recipe": { am: "አዲስ አዘገጃጀት" },
  "Bill of Materials": { am: "የጥሬ ዕቃ ዝርዝር" },
  "Add ingredient": { am: "ጥሬ ዕቃ ጨምር" },
  "No ingredients yet": { am: "እስካሁን ምንም ጥሬ ዕቃ የለም" },
  "Total cost": { am: "ጠቅላላ ወጪ" },
  "Save recipe": { am: "አዘገጃጀት አስቀምጥ" },
  Delete: { am: "ሰርዝ" },

  // Digital Menu
  "Real scannable QR codes per table — guests scan, browse, and order": {
    am: "ለእያንዳንዱ ጠረጴዛ ትክክለኛ QR ኮዶች — እንግዶች ስካን አድርገው ያዝዙ",
  },
  "Open Guest View": { am: "የእንግዳ ሜኑ ክፈት" },
  "Tables with QR": { am: "QR ያላቸው ጠረጴዛዎች" },
  Languages: { am: "ቋንቋዎች" },
  "QR Codes by Table": { am: "በጠረጴዛ QR ኮዶች" },
  "Menu Preview": { am: "ሜኑ ቅድመ ዕይታ" },
  Copy: { am: "ቅዳ" },
  "Copied!": { am: "ተቀድቷል!" },
  "Copy link": { am: "ሊንክ ቅዳ" },
  "Print QR": { am: "QR አትም" },
  "Scan with any phone camera to open the menu": { am: "ሜኑ ለመክፈት በማንኛውም ስልክ ካሜራ ስካን ያድርጉ" },
  "Preview guest menu": { am: "የእንግዳ ሜኑ ቅድመ ዕይታ" },
  "Guest menu features": { am: "የእንግዳ ሜኑ ባህሪያት" },
};

export type TranslationKey = keyof typeof translations;

export function selectText(lang: AppLang, en: string, am: string) {
  return lang === "am" ? am : en;
}

export function menuItemName(item: { id?: string; name_en: string; name_am?: string }, lang: AppLang) {
  if (lang !== "am") return item.name_en;
  return menuItemAmharicName(item) || item.name_en;
}

export function orderLineName(
  line: { menuItemId?: string; name?: string; name_en?: string; name_am?: string },
  menuItems: readonly { id: string; name_en: string; name_am?: string }[],
  lang: AppLang,
) {
  const displayName = line.name ?? line.name_en ?? "";
  const normalizedName = displayName.trim().toLowerCase();
  const menuItem =
    (line.menuItemId ? menuItems.find((item) => item.id === line.menuItemId) : undefined) ??
    menuItems.find((item) => {
      const englishName = item.name_en.trim().toLowerCase();
      const amharicName = item.name_am?.trim().toLowerCase();
      return englishName === normalizedName || amharicName === normalizedName;
    });
  if (menuItem) return menuItemName(menuItem, lang);
  if (lang === "am") {
    const am = menuItemAmharicName({
      id: line.menuItemId,
      name_en: line.name_en ?? displayName,
      name_am: line.name_am,
    });
    if (am) return am;
  }
  if (line.name_en) return line.name_en;
  return line.name ?? "";
}

export function useT() {
  const lang = useLang();
  return function t(key: string, am?: string): string {
    if (lang === "en") return key;
    const entry = translations[key as TranslationKey];
    return entry?.am ?? am ?? key;
  };
}
