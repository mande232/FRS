import { createClient } from "@supabase/supabase-js";

const viteEnv = (import.meta as ImportMeta & { env?: Record<string, string | undefined> }).env;
const rawSupabaseUrl = (viteEnv?.VITE_SUPABASE_URL ?? process.env.VITE_SUPABASE_URL) as string | undefined;
const supabaseKey = (
  viteEnv?.VITE_SUPABASE_PUBLISHABLE_KEY
  || viteEnv?.VITE_SUPABASE_ANON_KEY
  || process.env.VITE_SUPABASE_PUBLISHABLE_KEY
  || process.env.VITE_SUPABASE_ANON_KEY
) as string | undefined;
const isBrowser = typeof window !== "undefined";

function getValidSupabaseUrl(url: string | undefined) {
  if (!url) return undefined;

  try {
    const parsed = new URL(url);
    return parsed.protocol === "http:" || parsed.protocol === "https:"
      ? parsed.toString()
      : undefined;
  } catch {
    return undefined;
  }
}

const supabaseUrl = getValidSupabaseUrl(rawSupabaseUrl);

export const isSupabaseConfigured = Boolean(supabaseUrl && supabaseKey);

export const supabase = isSupabaseConfigured && isBrowser
  ? createClient(supabaseUrl!, supabaseKey!, {
      auth: {
        autoRefreshToken: true,
        persistSession: true,
        detectSessionInUrl: true,
        storage: window.localStorage,
        storageKey: "ethio-plate-auth",
      },
    })
  : null;

export function requireSupabase() {
  if (!supabase)
    throw new Error(
      "Supabase is not configured. Set VITE_SUPABASE_URL and VITE_SUPABASE_PUBLISHABLE_KEY.",
    );
  return supabase;
}
