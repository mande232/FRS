// Ethiopian (Ge'ez) calendar conversion — Beyene–Kudlek algorithm.
// Self-contained; no deps. Months 1..13 (Pagumē = 13).

const ETH_MONTHS_EN = [
  "Meskerem",
  "Tikimt",
  "Hidar",
  "Tahsas",
  "Tir",
  "Yekatit",
  "Megabit",
  "Miyazya",
  "Ginbot",
  "Sene",
  "Hamle",
  "Nehase",
  "Pagumē",
];
const ETH_MONTHS_AM = [
  "መስከረም",
  "ጥቅምት",
  "ኅዳር",
  "ታኅሣሥ",
  "ጥር",
  "የካቲት",
  "መጋቢት",
  "ሚያዝያ",
  "ግንቦት",
  "ሰኔ",
  "ሐምሌ",
  "ነሐሴ",
  "ጳጉሜ",
];

const JD_EPOCH_OFFSET_AMETE_MIHRET = 1723856;

function gregorianToJDN(y: number, m: number, d: number): number {
  const a = Math.floor((14 - m) / 12);
  const yy = y + 4800 - a;
  const mm = m + 12 * a - 3;
  return (
    d +
    Math.floor((153 * mm + 2) / 5) +
    365 * yy +
    Math.floor(yy / 4) -
    Math.floor(yy / 100) +
    Math.floor(yy / 400) -
    32045
  );
}

export interface EthiopicDate {
  year: number;
  month: number; // 1..13
  day: number;
  monthNameEn: string;
  monthNameAm: string;
}

function jdnToGregorian(jdn: number): { year: number; month: number; day: number } {
  const a = jdn + 32044;
  const b = Math.floor((4 * a + 3) / 146097);
  const c = a - Math.floor((146097 * b) / 4);
  const d = Math.floor((4 * c + 3) / 1461);
  const e = c - Math.floor((1461 * d) / 4);
  const m = Math.floor((5 * e + 2) / 153);
  const day = e - Math.floor((153 * m + 2) / 5) + 1;
  const month = m + 3 - 12 * Math.floor(m / 10);
  const year = 100 * b + d - 4800 + Math.floor(m / 10);
  return { year, month, day };
}

export function fromEthiopic(year: number, month: number, day: number): Date {
  const delta = 1461 * Math.floor(year / 4) + (year % 4) * 365 + 30 * (month - 1) + (day - 1);
  const jdn = JD_EPOCH_OFFSET_AMETE_MIHRET + delta;
  const g = jdnToGregorian(jdn);
  return new Date(g.year, g.month - 1, g.day);
}

export function toEthiopic(date: Date): EthiopicDate {
  const jdn = gregorianToJDN(date.getFullYear(), date.getMonth() + 1, date.getDate());
  const r = (jdn - JD_EPOCH_OFFSET_AMETE_MIHRET) % 1461;
  const n = (r % 365) + 365 * Math.floor(r / 1460);
  const year =
    4 * Math.floor((jdn - JD_EPOCH_OFFSET_AMETE_MIHRET) / 1461) +
    Math.floor(r / 365) -
    Math.floor(r / 1460);
  const month = Math.floor(n / 30) + 1;
  const day = (n % 30) + 1;
  return {
    year,
    month,
    day,
    monthNameEn: ETH_MONTHS_EN[month - 1],
    monthNameAm: ETH_MONTHS_AM[month - 1],
  };
}

export function formatEthiopic(date: Date, lang: "en" | "am" = "en"): string {
  const e = toEthiopic(date);
  const name = lang === "am" ? e.monthNameAm : e.monthNameEn;
  return `${e.day} ${name} ${e.year}`;
}

export function formatETB(amount: number, lang: "en" | "am" = "en"): string {
  const formatted = new Intl.NumberFormat(lang === "am" ? "am-ET" : "en-ET", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount);
  return `ETB ${formatted}`;
}

// VAT engine — Ethiopia: 15%.
export const VAT_RATE = 0.15;
export function vatBreakdown(subtotal: number, inclusive = false) {
  if (inclusive) {
    const net = subtotal / (1 + VAT_RATE);
    return { net, vat: subtotal - net, total: subtotal };
  }
  const vat = subtotal * VAT_RATE;
  return { net: subtotal, vat, total: subtotal + vat };
}
