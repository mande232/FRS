/** Bilingual labels for the printed Kitchen/Butcher bono. Kept free of React so print helpers stay testable in Node. */
export type BonoLang = "en" | "am";

type BonoLabelKey =
  | "kitchen"
  | "butcher"
  | "station"
  | "return"
  | "void"
  | "table"
  | "waiter"
  | "noItems"
  | "doNotPrepare"
  | "customerCancelled"
  | "bono"
  | "reprint";

const LABELS: Record<BonoLang, Record<BonoLabelKey, string>> = {
  en: {
    kitchen: "KITCHEN",
    butcher: "BUTCHER",
    station: "STATION",
    return: "RETURN",
    void: "VOID",
    table: "TABLE",
    waiter: "WAITER",
    noItems: "NO ITEMS",
    doNotPrepare: "DO NOT PREPARE",
    customerCancelled: "CUSTOMER CANCELLED",
    bono: "BONO",
    reprint: "REPRINT",
  },
  am: {
    kitchen: "ኩሽና",
    butcher: "ስጋ ቤት",
    station: "ጣቢያ",
    return: "ተመላሽ",
    void: "ተሰርዟል",
    table: "ጠረጴዛ",
    waiter: "አስተናጋጅ",
    noItems: "ምንም ምግብ የለም",
    doNotPrepare: "አታዘጋጁ",
    customerCancelled: "ደንበኛ ሰርዟል",
    bono: "ቦኖ",
    reprint: "እንደገና ህትመት",
  },
};

const PREFERENCES_AM: Record<string, string> = {
  "NO FAT": "ያለ ስብ",
  "SMALL CUT": "ትንሽ ቁርጥ",
  "MEDIUM CUT": "መካከለኛ ቁርጥ",
  "LARGE CUT": "ትልቅ ቁርጥ",
  "REMOVE BONE": "አጥንት ይውጣ",
  "NO SALT": "ያለ ጨው",
  "NO ONION": "ያለ ሽንኩርት",
  "NO SPICE": "ያለ ቅመም",
  "EXTRA SPICY": "በጣም ቅመም",
  "WELL DONE": "በደንብ የበሰለ",
  MEDIUM: "መካከለኛ የበሰለ",
  RARE: "ትንሽ የበሰለ",
  "EXTRA SAUCE": "ተጨማሪ ሶስ",
  "NO SAUCE": "ያለ ሶስ",
  "NO OIL": "ያለ ዘይት",
  "LESS OIL": "ትንሽ ዘይት",
  "CUSTOMER CANCELLED": "ደንበኛ ሰርዟል",
  "WRONG ORDER": "የተሳሳተ ትዕዛዝ",
  "WAIT TOO LONG": "በጣም ዘግይቷል",
  "DO NOT PREPARE": "አታዘጋጁ",
};

const UNITS_AM: Record<string, string> = {
  KG: "ኪሎ",
  KILO: "ኪሎ",
  KILOGRAM: "ኪሎ",
  G: "ግራም",
  GRAM: "ግራም",
  PLATE: "ሳህን",
  BOTTLE: "ጠርሙስ",
  "HALF BOTTLE": "ግማሽ ጠርሙስ",
  "SINGLE SHOT": "ነጠላ ሾት",
  "DOUBLE SHOT": "ድርብል ሾት",
  CUP: "ስኒ",
  GLASS: "ብርጭቆ",
  PIECE: "ቁራጭ",
  PORTION: "ክፍል",
};

/** Falls back to the saved UI language so any print call site stays in sync with the screen. */
export function resolveBonoLang(lang?: BonoLang): BonoLang {
  if (lang === "en" || lang === "am") return lang;
  if (typeof window === "undefined") return "en";
  return window.localStorage.getItem("lang") === "am" ? "am" : "en";
}

export function bonoLabel(key: BonoLabelKey, lang: BonoLang) {
  return LABELS[lang][key];
}

/** Free-text notes have no dictionary entry and print exactly as the waiter typed them. */
export function translateBonoPreference(value: string, lang: BonoLang) {
  if (lang !== "am") return value;
  return PREFERENCES_AM[value] ?? value;
}

export function translateBonoUnit(unit: string, lang: BonoLang) {
  if (lang !== "am") return unit;
  return UNITS_AM[unit] ?? unit;
}
