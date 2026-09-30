import { isSupabaseConfigured, supabase } from "./client.ts";

let authSyncPausedUntil = 0;
let lastAuthLogAt = 0;

export function clearSupabaseAuthSyncPause() {
  authSyncPausedUntil = 0;
}

export function pauseSupabaseAuthSync(ms = 60_000) {
  authSyncPausedUntil = Math.max(authSyncPausedUntil, Date.now() + ms);
}

export function isSupabaseAuthSyncPaused() {
  return Date.now() < authSyncPausedUntil;
}

export function isSupabaseAuthError(error: unknown) {
  if (!error || typeof error !== "object") return false;
  const value = error as {
    status?: number;
    code?: string;
    message?: string;
    name?: string;
  };
  const status = Number(value.status ?? 0);
  if (status === 401 || status === 403) return true;
  const code = String(value.code ?? "").toUpperCase();
  if (
    code === "PGRST301" ||
    code === "401" ||
    code === "403" ||
    code.includes("JWT") ||
    code === "NOT_AUTHENTICATED"
  ) {
    return true;
  }
  const message = `${value.message ?? ""} ${value.name ?? ""}`.toLowerCase();
  return (
    message.includes("jwt") ||
    message.includes("not authenticated") ||
    message.includes("invalid claim") ||
    (message.includes("session") && message.includes("expired")) ||
    message.includes("unauthorized") ||
    message.includes("permission denied")
  );
}

function logAuthOnce(message: string, error?: unknown) {
  const now = Date.now();
  if (now - lastAuthLogAt < 15_000) return;
  lastAuthLogAt = now;
  if (error) console.warn(message, error);
  else console.warn(message);
}

/**
 * Returns a usable access token, refreshing when needed.
 * On failure, pauses module sync briefly so the UI does not spam 401s.
 */
export async function ensureSupabaseAccessToken(): Promise<string | null> {
  if (!isSupabaseConfigured || !supabase) return null;
  if (isSupabaseAuthSyncPaused()) return null;

  try {
    const { data, error } = await supabase.auth.getSession();
    if (error) {
      pauseSupabaseAuthSync();
      logAuthOnce("Supabase session read failed; pausing sync", error);
      return null;
    }

    let session = data.session;
    const expiresAtMs = (session?.expires_at ?? 0) * 1000;
    const needsRefresh = !session?.access_token || (expiresAtMs > 0 && expiresAtMs < Date.now() + 45_000);

    if (needsRefresh) {
      const refreshed = await supabase.auth.refreshSession();
      if (refreshed.error) {
        pauseSupabaseAuthSync();
        logAuthOnce("Supabase session refresh failed; pausing sync — please sign in again", refreshed.error);
        return null;
      }
      session = refreshed.data.session ?? session;
    }

    if (!session?.access_token) {
      pauseSupabaseAuthSync();
      logAuthOnce("Supabase has no access token; pausing sync — please sign in again");
      return null;
    }

    clearSupabaseAuthSyncPause();
    return session.access_token;
  } catch (error) {
    pauseSupabaseAuthSync();
    logAuthOnce("Supabase auth check failed; pausing sync", error);
    return null;
  }
}
