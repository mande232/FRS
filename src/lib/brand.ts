export interface RestaurantProfile {
  name: string;
  shortName: string;
  tagline: string;
  logoUrl: string;
  address: string;
  tin: string;
  vatRegNo: string;
  currency: string;
  phone?: string;
  email?: string;
  website?: string;
  defaultLanguage?: string;
  timezone?: string;
  receiptFooter?: string;
}

/** Simple monogram mark for Fiker Bar & Restaurant (FBR). */
const FBR_LOGO_DATA_URL =
  "data:image/svg+xml," +
  encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 96 96" fill="none">
      <rect width="96" height="96" rx="22" fill="#e5a318"/>
      <text x="48" y="58" text-anchor="middle" font-family="system-ui,sans-serif" font-size="28" font-weight="700" fill="#ffffff">FBR</text>
    </svg>`,
  );

export const DEFAULT_RESTAURANT_PROFILE: RestaurantProfile = {
  name: "Fiker Bar and Restaurant",
  shortName: "FBR",
  tagline: "Bar & Restaurant",
  logoUrl: FBR_LOGO_DATA_URL,
  address: "",
  tin: "",
  vatRegNo: "",
  currency: "Ethiopian Birr (ETB)",
};

/** Bumped so previous profiles do not stick after rebrand. */
const PROFILE_STORAGE_KEY = "fbr_restaurant_profile_v7";

export const BRAND_NAME = DEFAULT_RESTAURANT_PROFILE.name;
export const BRAND_SHORT_NAME = DEFAULT_RESTAURANT_PROFILE.shortName;
export const BRAND_TAGLINE = DEFAULT_RESTAURANT_PROFILE.tagline;
export const BRAND_LOGO_URL = DEFAULT_RESTAURANT_PROFILE.logoUrl;
export const BRAND_ADDRESS = DEFAULT_RESTAURANT_PROFILE.address;
export const BRAND_TIN = DEFAULT_RESTAURANT_PROFILE.tin;
export const BRAND_VAT_REG_NO = DEFAULT_RESTAURANT_PROFILE.vatRegNo;

export function normalizeRestaurantProfile(profile: Partial<RestaurantProfile>): RestaurantProfile {
  return {
    name: profile.name?.trim() || DEFAULT_RESTAURANT_PROFILE.name,
    shortName: profile.shortName?.trim() || DEFAULT_RESTAURANT_PROFILE.shortName,
    tagline: profile.tagline?.trim() || DEFAULT_RESTAURANT_PROFILE.tagline,
    logoUrl: profile.logoUrl?.trim() || DEFAULT_RESTAURANT_PROFILE.logoUrl,
    address: profile.address?.trim() || DEFAULT_RESTAURANT_PROFILE.address,
    tin: profile.tin?.trim() || DEFAULT_RESTAURANT_PROFILE.tin,
    vatRegNo: profile.vatRegNo?.trim() || DEFAULT_RESTAURANT_PROFILE.vatRegNo,
    currency: profile.currency?.trim() || DEFAULT_RESTAURANT_PROFILE.currency,
    phone: profile.phone?.trim() || undefined,
    email: profile.email?.trim() || undefined,
    website: profile.website?.trim() || undefined,
    defaultLanguage: profile.defaultLanguage?.trim() || undefined,
    timezone: profile.timezone?.trim() || undefined,
    receiptFooter: profile.receiptFooter?.trim() || undefined,
  };
}

export function loadRestaurantProfile(): RestaurantProfile {
  if (typeof window === "undefined") return DEFAULT_RESTAURANT_PROFILE;

  try {
    const raw = window.localStorage.getItem(PROFILE_STORAGE_KEY);
    return raw ? normalizeRestaurantProfile(JSON.parse(raw)) : DEFAULT_RESTAURANT_PROFILE;
  } catch {
    return DEFAULT_RESTAURANT_PROFILE;
  }
}

export function saveRestaurantProfile(profile: RestaurantProfile) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(
    PROFILE_STORAGE_KEY,
    JSON.stringify(normalizeRestaurantProfile(profile)),
  );
}

export function clearRestaurantProfile() {
  if (typeof window === "undefined") return;
  window.localStorage.removeItem(PROFILE_STORAGE_KEY);
}
