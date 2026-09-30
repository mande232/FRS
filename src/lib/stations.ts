import { PRODUCTION_STATIONS, type MenuItem, type ProductionStation } from "./demo-data.ts";

const STORAGE_KEY = "bl_production_stations";

export type StationTone = "default" | "ember" | "teff" | "gold" | "muted" | "destructive";

const LEGACY_STATION_MAP: Record<string, ProductionStation> = {
  Hot: "Kitchen",
  Cold: "Kitchen",
  Bakery: "Kitchen",
  Grill: "Butcher House",
  Bar: "Main Bar",
  Butcher: "Butcher House",
};

const SPIRIT_CATEGORIES = new Set(["spirits", "whisky", "spirit"]);
const MAIN_BAR_CATEGORIES = new Set([
  "drinks",
  "beer",
  "soft drinks",
  "water",
  "weyn",
  "other drinks",
  "wine",
]);

export function normalizeStationName(station: string) {
  return station.trim().replace(/\s+/g, " ");
}

export function sameStation(left?: string | null, right?: string | null) {
  if (!left || !right) return false;
  return (
    aliasLegacyStation(left).toLowerCase() === aliasLegacyStation(right).toLowerCase()
  );
}

export function uniqueStations(stations: readonly string[]) {
  const seen = new Set<string>();
  return stations.reduce<ProductionStation[]>((items, station) => {
    const value = normalizeStationName(station);
    const key = value.toLowerCase();
    if (!value || seen.has(key)) return items;
    seen.add(key);
    return [...items, value];
  }, []);
}

export function aliasLegacyStation(station: string) {
  const normalized = normalizeStationName(station);
  if (!normalized) return normalized;
  const mapped = LEGACY_STATION_MAP[normalized];
  if (mapped) return mapped;
  const key = normalized.toLowerCase();
  if (key === "bar") return "Main Bar";
  if (key === "butcher") return "Butcher House";
  return normalized;
}

export function isVipBarStation(station: string) {
  const key = station.toLowerCase();
  return key.includes("vip") && (key.includes("bar") || key.includes("drink") || key.includes("beverage"));
}

export function isMainBarStation(station: string) {
  const key = station.toLowerCase();
  if (isVipBarStation(station)) return false;
  return key === "bar" || (key.includes("main") && key.includes("bar")) || key.includes("beverage");
}

export function isBarStation(station: string) {
  const key = station.toLowerCase();
  return key.includes("bar") || key.includes("drink") || key.includes("beverage");
}

export function vipBarStation(stations: readonly string[]) {
  return (
    stations.find((station) => isVipBarStation(station)) ??
    findStation("VIP Bar", stations)
  );
}

export function mainBarStation(stations: readonly string[]) {
  return (
    stations.find((station) => isMainBarStation(station)) ??
    findStation("Main Bar", stations) ??
    findStation("Bar", stations)
  );
}

export function canonicalizeStationName(
  station: string,
  stations: readonly string[] = [],
) {
  const aliased = aliasLegacyStation(station);
  return findStation(aliased, stations) ?? findStation(station, stations) ?? aliased;
}

export function defaultProductionStations() {
  return uniqueStations(PRODUCTION_STATIONS);
}

export function migrateProductionStations(stations: readonly string[]) {
  const mapped = uniqueStations(stations.map((station) => aliasLegacyStation(station)));
  const next = uniqueStations([
    ...(mapped.length > 0 ? mapped : defaultProductionStations()),
    ...defaultProductionStations(),
  ]);
  const hasBar = Boolean(mainBarStation(next) || vipBarStation(next) || next.some((station) => isBarStation(station)));
  if (hasBar && !vipBarStation(next)) {
    return uniqueStations([...next, "VIP Bar"]);
  }
  if (hasBar && !mainBarStation(next)) {
    return uniqueStations([...next, "Main Bar"]);
  }
  return next;
}

export function loadProductionStations() {
  const fallback = defaultProductionStations();
  if (typeof window === "undefined") return fallback;

  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) : null;
    if (!Array.isArray(parsed)) return fallback;
    const stations = migrateProductionStations(
      parsed.filter((item): item is string => typeof item === "string"),
    );
    const next = stations.length > 0 ? stations : fallback;
    if (JSON.stringify(next) !== JSON.stringify(parsed)) {
      saveProductionStations(next);
    }
    return next;
  } catch {
    return fallback;
  }
}

export function saveProductionStations(stations: readonly string[]) {
  if (typeof window === "undefined") return;
  localStorage.setItem(STORAGE_KEY, JSON.stringify(migrateProductionStations(stations)));
}

export function findStation(station: string, stations: readonly string[]) {
  const key = normalizeStationName(station).toLowerCase();
  return stations.find((item) => item.toLowerCase() === key);
}

export function isConfiguredStation(station: string, stations: readonly string[]) {
  return Boolean(findStation(canonicalizeStationName(station, stations), stations));
}

function findStationByKeyword(stations: readonly string[], keywords: string[]) {
  return stations.find((station) => {
    const key = station.toLowerCase();
    return keywords.some((keyword) => key.includes(keyword));
  });
}

export function fallbackStation(stations: readonly string[]) {
  return stations[0] ?? defaultProductionStations()[0] ?? "Kitchen";
}

function categoryKey(item: Pick<MenuItem, "category">) {
  return item.category.trim().toLowerCase();
}

export function isSpiritMenuItem(item: Pick<MenuItem, "category" | "station" | "stockDeductionLocation">) {
  const category = categoryKey(item);
  if (SPIRIT_CATEGORIES.has(category) || category.includes("spirit") || category.includes("whisky")) {
    return true;
  }
  if (item.stockDeductionLocation && isVipBarStation(item.stockDeductionLocation)) return true;
  return isVipBarStation(item.station);
}

function isMainBarMenuItem(item: Pick<MenuItem, "category" | "station">) {
  const category = categoryKey(item);
  if (MAIN_BAR_CATEGORIES.has(category)) return true;
  return isBarStation(item.station) && !isVipBarStation(item.station);
}

export function resolveProductionStation(
  item: MenuItem,
  stations: readonly string[] = defaultProductionStations(),
  _area?: string,
) {
  const configured = stations.length > 0 ? stations : defaultProductionStations();
  const canonical = canonicalizeStationName(item.station, configured);
  const exact = findStation(canonical, configured);
  const name = `${item.name_en} ${item.name_am}`.toLowerCase();

  if (name.includes("macchiato") || name.includes("buna") || name.includes("coffee")) {
    return (
      findStationByKeyword(configured, ["coffee", "buna"]) ??
      findStation("Coffee House", configured) ??
      exact ??
      fallbackStation(configured)
    );
  }
  const looksLikeButcherItem =
    item.category === "Meat" ||
    name.includes("kitfo") ||
    name.includes("tibs") ||
    name.includes("dulet") ||
    item.station.toLowerCase().includes("butcher");
  // Default meat-style items to Butcher, but honor an explicit Menu station
  // (e.g. user moved Kitfo from Butcher House → Kitchen).
  const explicitNonButcher =
    Boolean(exact) && !/butcher|meat|grill/i.test(exact ?? "");
  if (looksLikeButcherItem && !explicitNonButcher) {
    return (
      findStationByKeyword(configured, ["butcher", "meat", "grill"]) ??
      findStation("Butcher House", configured) ??
      exact ??
      fallbackStation(configured)
    );
  }

  if (isSpiritMenuItem(item)) {
    return vipBarStation(configured) ?? exact ?? canonical;
  }

  if (isMainBarMenuItem(item) || (exact && isBarStation(exact) && !isVipBarStation(exact))) {
    return mainBarStation(configured) ?? exact ?? canonical;
  }

  if (exact && isVipBarStation(exact)) {
    return vipBarStation(configured) ?? exact;
  }

  if (exact) return exact;

  const legacy = LEGACY_STATION_MAP[item.station];
  if (legacy) {
    return findStation(legacy, configured) ?? fallbackStation(configured);
  }

  return findStationByKeyword(configured, ["kitchen"]) ?? fallbackStation(configured);
}

export function stationTone(station: string): StationTone {
  const key = station.toLowerCase();
  if (key.includes("bar") || key.includes("drink") || key.includes("beverage")) return "gold";
  if (key.includes("butcher") || key.includes("meat") || key.includes("grill")) return "destructive";
  if (key.includes("coffee") || key.includes("buna")) return "teff";
  if (key.includes("kitchen")) return "ember";
  return "muted";
}

export function stationIconName(station: string) {
  const key = station.toLowerCase();
  if (key.includes("bar") || key.includes("drink") || key.includes("beverage")) return "Wine";
  if (key.includes("butcher") || key.includes("meat") || key.includes("grill")) return "Beef";
  if (key.includes("coffee") || key.includes("buna")) return "Coffee";
  if (key.includes("kitchen")) return "ChefHat";
  return "Circle";
}

export function stationHelp(station: string) {
  const key = station.toLowerCase();
  if (isVipBarStation(station)) return "VIP Bar tickets and spirit stock";
  if (key.includes("bar") || key.includes("drink") || key.includes("beverage")) return "Main Bar tickets and stock";
  if (key.includes("butcher") || key.includes("meat") || key.includes("grill")) return "Meat, grill, and butcher preparation";
  if (key.includes("coffee") || key.includes("buna")) return "Coffee, macchiato, and hot drink preparation";
  if (key.includes("kitchen")) return "Food orders and shared kitchen items";
  return "Custom production station";
}

export function stationPrinter(station: string) {
  return `${station} ticket printer`;
}
