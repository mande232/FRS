import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { isSupabaseConfigured, supabase } from "./supabase/client.ts";
import {
  ensureSupabaseAccessToken,
  isSupabaseAuthError,
  isSupabaseAuthSyncPaused,
  pauseSupabaseAuthSync,
} from "./supabase/session.ts";

type ModuleRecord = { id: string };
type StoreSetter<T> = (update: T[] | ((prev: T[]) => T[])) => void;

type ModuleRecordRow = {
  record_id: string;
  data: unknown;
};

type ModuleRecordUpsertRow = {
  module_key: string;
  record_id: string;
  data: unknown;
  position: number;
  active: boolean;
  updated_at: string;
};

const MODULE_SYNC_DEBOUNCE_MS = 750;
const MODULE_HYDRATE_DEBOUNCE_MS = 8_000;
/** Visibility/focus poll — replaces dozens of Realtime channels that blew Pro message quotas. */
const MODULE_REMOTE_POLL_MS = 60_000;
const MODULE_SYNC_CHUNK_SIZE = 40;
const MODULE_SYNC_MAX_RETRIES = 4;

function moduleRecordsRealtimeEnabled() {
  const viteEnv = (import.meta as ImportMeta & { env?: Record<string, string | undefined> }).env;
  const flag = viteEnv?.VITE_MODULE_RECORDS_REALTIME?.trim().toLowerCase();
  return flag === "1" || flag === "true" || flag === "yes";
}

type ModuleRemoteListener = (moduleKey: string) => void;
const moduleRemoteListeners = new Set<ModuleRemoteListener>();
let moduleRemoteChannel: ReturnType<NonNullable<typeof supabase>["channel"]> | null = null;
let moduleRemoteRefCount = 0;

function ensureSharedModuleRecordsChannel() {
  if (!supabase || moduleRemoteChannel) return;
  const client = supabase;
  client.getChannels().forEach((ch) => {
    if (ch.topic === "realtime:module-records-shared") void client.removeChannel(ch);
  });
  moduleRemoteChannel = client
    .channel("module-records-shared")
    .on(
      "postgres_changes",
      { event: "*", schema: "public", table: "module_records" },
      (payload) => {
        const row = (payload.new ?? payload.old) as { module_key?: unknown } | null;
        const key = typeof row?.module_key === "string" ? row.module_key : "*";
        for (const listener of moduleRemoteListeners) listener(key);
      },
    )
    .subscribe();
}

function teardownSharedModuleRecordsChannel() {
  if (!supabase || !moduleRemoteChannel) return;
  void supabase.removeChannel(moduleRemoteChannel);
  moduleRemoteChannel = null;
}

/** One shared Realtime channel for all module_records keys (opt-in via VITE_MODULE_RECORDS_REALTIME). */
function subscribeSharedModuleRecordsRemote(listener: ModuleRemoteListener) {
  moduleRemoteListeners.add(listener);
  moduleRemoteRefCount += 1;
  ensureSharedModuleRecordsChannel();
  return () => {
    moduleRemoteListeners.delete(listener);
    moduleRemoteRefCount = Math.max(0, moduleRemoteRefCount - 1);
    if (moduleRemoteRefCount === 0) teardownSharedModuleRecordsChannel();
  };
}

const lastSyncedIdsByModule = new Map<string, string[]>();
let lastModuleAuthWarnAt = 0;
const syncStateByModule = new Map<
  string,
  {
    timer: ReturnType<typeof setTimeout> | null;
    pending: ModuleRecord[] | null;
    inFlight: Promise<void> | null;
    onError?: (error: unknown) => void;
  }
>();

function getSyncState(moduleKey: string) {
  let state = syncStateByModule.get(moduleKey);
  if (!state) {
    state = { timer: null, pending: null, inFlight: null };
    syncStateByModule.set(moduleKey, state);
  }
  return state;
}

function isModuleSyncActive(moduleKey: string) {
  const state = getSyncState(moduleKey);
  return Boolean(state.inFlight || state.timer || state.pending);
}

function isDeadlockError(error: unknown) {
  if (!error || typeof error !== "object") return false;
  const code = "code" in error ? String(error.code) : "";
  const message = "message" in error ? String(error.message) : "";
  return code === "40P01" || message.toLowerCase().includes("deadlock");
}

async function sleep(ms: number) {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

async function withDeadlockRetry<T>(operation: () => Promise<T>) {
  let attempt = 0;
  while (true) {
    try {
      return await operation();
    } catch (error) {
      if (!isDeadlockError(error) || attempt >= MODULE_SYNC_MAX_RETRIES) throw error;
      attempt += 1;
      await sleep(120 * attempt + Math.floor(Math.random() * 80));
    }
  }
}

async function upsertModuleRecordRows(rows: ModuleRecordUpsertRow[]) {
  if (!supabase || rows.length === 0) return;

  const sorted = [...rows].sort((left, right) => left.record_id.localeCompare(right.record_id));
  for (let index = 0; index < sorted.length; index += MODULE_SYNC_CHUNK_SIZE) {
    const chunk = sorted.slice(index, index + MODULE_SYNC_CHUNK_SIZE);
    const { error } = await supabase.from("module_records").upsert(chunk, {
      onConflict: "module_key,record_id",
    });
    if (error) throw error;
  }
}

async function deactivateModuleRecordIds(moduleKey: string, recordIds: string[], timestamp: string) {
  if (!supabase || recordIds.length === 0) return;

  const sorted = [...recordIds].sort();
  for (let index = 0; index < sorted.length; index += MODULE_SYNC_CHUNK_SIZE) {
    const chunk = sorted.slice(index, index + MODULE_SYNC_CHUNK_SIZE);
    const { error } = await supabase
      .from("module_records")
      .update({ active: false, updated_at: timestamp })
      .eq("module_key", moduleKey)
      .in("record_id", chunk);
    if (error) throw error;
  }
}

function storageKey(moduleKey: string) {
  return `bl_module_records_${moduleKey}`;
}

function pendingSyncStorageKey(moduleKey: string) {
  return `bl_module_records_pending_sync_${moduleKey}`;
}

const MODULE_RECORDS_CACHE_PREFIX = "bl_module_records_";
/** Bump when intentionally clearing remote module_records so every browser drops stale cache. */
const MODULE_RECORDS_LOCAL_PURGE_FLAG = "bl_module_records_local_purge_v6";
/** Outside the cache prefix so clearLocalModuleRecordsCache does not erase the acknowledged epoch. */
const MODULE_RECORDS_WIPE_EPOCH_KEY = "bl_module_wipe_epoch";
const MODULE_RECORDS_WIPE_MODULE_KEY = "__meta__";
const MODULE_RECORDS_WIPE_RECORD_ID = "module_records_wipe";
/** Only re-upload empty-remote pending work if it was saved very recently (not a stale clear refill). */
const PENDING_EMPTY_REMOTE_MAX_AGE_MS = 2 * 60 * 1000;

let cachedRemoteWipeEpoch: number | null = null;

/** In-memory snapshot so POS/order writes don't JSON.parse/stringify localStorage on the hot path. */
const memoryByModule = new Map<string, unknown[]>();
const persistTimers = new Map<string, ReturnType<typeof setTimeout>>();

/** Removes every module_records local/pending cache key so an empty DB is not refilled from this browser. */
export function clearLocalModuleRecordsCache() {
  if (typeof window === "undefined") return 0;
  memoryByModule.clear();
  for (const timer of persistTimers.values()) clearTimeout(timer);
  persistTimers.clear();
  for (const state of syncStateByModule.values()) {
    if (state.timer) {
      clearTimeout(state.timer);
      state.timer = null;
    }
    state.pending = null;
  }
  const keys: string[] = [];
  for (let index = 0; index < window.localStorage.length; index += 1) {
    const key = window.localStorage.key(index);
    if (key && key.startsWith(MODULE_RECORDS_CACHE_PREFIX)) keys.push(key);
  }
  for (const key of keys) window.localStorage.removeItem(key);
  return keys.length;
}

function readLocalWipeEpoch() {
  if (typeof window === "undefined") return 0;
  const raw = Number(window.localStorage.getItem(MODULE_RECORDS_WIPE_EPOCH_KEY) ?? 0);
  return Number.isFinite(raw) ? raw : 0;
}

function writeLocalWipeEpoch(epoch: number) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(MODULE_RECORDS_WIPE_EPOCH_KEY, String(epoch));
}

export async function fetchModuleRecordsWipeEpoch(): Promise<number> {
  if (!supabase) return 0;
  const { data, error } = await supabase
    .from("module_records")
    .select("data")
    .eq("module_key", MODULE_RECORDS_WIPE_MODULE_KEY)
    .eq("record_id", MODULE_RECORDS_WIPE_RECORD_ID)
    .maybeSingle();
  if (error) throw error;
  const epoch = Number(
    data && typeof data === "object" && data.data && typeof data.data === "object"
      ? (data.data as { epoch?: unknown }).epoch
      : 0,
  );
  return Number.isFinite(epoch) ? epoch : 0;
}

/**
 * If the server wipe epoch is newer than this device acknowledged, drop all local
 * module caches/pending sync so old tabs cannot refill a cleared table.
 */
export function applyModuleRecordsWipeEpoch(remoteEpoch: number): boolean {
  if (!(remoteEpoch > 0)) return false;
  cachedRemoteWipeEpoch = remoteEpoch;
  const localEpoch = readLocalWipeEpoch();
  if (remoteEpoch <= localEpoch) return false;
  clearLocalModuleRecordsCache();
  writeLocalWipeEpoch(remoteEpoch);
  return true;
}

async function ensureModuleRecordsWipeApplied(): Promise<boolean> {
  if (!isSupabaseConfigured || !supabase) return false;
  try {
    if (cachedRemoteWipeEpoch === null) {
      cachedRemoteWipeEpoch = await fetchModuleRecordsWipeEpoch();
    }
    return applyModuleRecordsWipeEpoch(cachedRemoteWipeEpoch);
  } catch (error) {
    console.warn("module_records wipe epoch check failed", error);
    return false;
  }
}

/** One-time wipe of stale module caches after a remote module_records clear. */
if (typeof window !== "undefined" && isSupabaseConfigured) {
  try {
    if (!window.localStorage.getItem(MODULE_RECORDS_LOCAL_PURGE_FLAG)) {
      clearLocalModuleRecordsCache();
      window.localStorage.setItem(MODULE_RECORDS_LOCAL_PURGE_FLAG, "1");
    }
  } catch {
    // ignore storage errors
  }
}

function isBrowserOnline() {
  return typeof navigator === "undefined" || navigator.onLine !== false;
}

function readPendingSyncRecords<T extends ModuleRecord>(moduleKey: string): T[] | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(pendingSyncStorageKey(moduleKey));
    const parsed = raw ? JSON.parse(raw) : null;
    if (Array.isArray(parsed)) return parsed as T[];
    if (parsed && typeof parsed === "object" && Array.isArray((parsed as { records?: unknown }).records)) {
      return (parsed as { records: T[] }).records;
    }
    return null;
  } catch {
    return null;
  }
}

function readPendingSyncSavedAt(moduleKey: string): number {
  if (typeof window === "undefined") return 0;
  try {
    const raw = window.localStorage.getItem(pendingSyncStorageKey(moduleKey));
    const parsed = raw ? JSON.parse(raw) : null;
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      const savedAt = Number((parsed as { savedAt?: unknown }).savedAt ?? 0);
      return Number.isFinite(savedAt) ? savedAt : 0;
    }
  } catch {
    // ignore
  }
  return 0;
}

function writePendingSyncRecords<T extends ModuleRecord>(moduleKey: string, records: T[]) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(
    pendingSyncStorageKey(moduleKey),
    JSON.stringify({ records, savedAt: Date.now() }),
  );
}

function clearPendingSyncRecords(moduleKey: string) {
  if (typeof window === "undefined") return;
  window.localStorage.removeItem(pendingSyncStorageKey(moduleKey));
}

export function getModuleRecordsSnapshot<T>(moduleKey: string, fallback: T[]) {
  return readLocalRecords(moduleKey, fallback);
}

export function setModuleRecordsSnapshot<T>(moduleKey: string, records: T[]) {
  writeLocalRecords(moduleKey, records);
  notifyModuleRecordsUpdated(moduleKey);
}

function readLocalRecords<T>(moduleKey: string, fallback: T[]) {
  if (typeof window === "undefined") return fallback;
  const cached = memoryByModule.get(moduleKey);
  if (cached) return cached as T[];
  try {
    const raw = window.localStorage.getItem(storageKey(moduleKey));
    const parsed = raw ? JSON.parse(raw) : null;
    if (!Array.isArray(parsed)) return fallback;
    memoryByModule.set(moduleKey, parsed);
    return parsed as T[];
  } catch {
    return fallback;
  }
}

function writeLocalRecords<T>(moduleKey: string, records: T[]) {
  if (typeof window === "undefined") return;
  memoryByModule.set(moduleKey, records);
  const previous = persistTimers.get(moduleKey);
  if (previous) clearTimeout(previous);
  // Defer stringify/setItem so order create stays responsive; memory is source of truth meantime.
  persistTimers.set(
    moduleKey,
    setTimeout(() => {
      persistTimers.delete(moduleKey);
      const latest = memoryByModule.get(moduleKey) ?? records;
      try {
        window.localStorage.setItem(storageKey(moduleKey), JSON.stringify(latest));
      } catch {
        // Quota / private mode — in-memory + remote sync still apply.
      }
    }, 0),
  );
}

function notifyModuleRecordsUpdated(moduleKey: string) {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent(`bl_module_records_updated:${moduleKey}`));
}

/** Keep local-only rows (e.g. just-saved cash-up closings) until remote sync catches up. */
function mergeRemoteWithLocalOnly<T extends ModuleRecord>(remote: T[], local: T[]): T[] {
  if (local.length === 0) return remote;
  if (remote.length === 0) return local;
  const byId = new Map<string, T>();
  for (const row of local) byId.set(row.id, row);
  for (const row of remote) byId.set(row.id, row);
  return Array.from(byId.values());
}

export function hasPersistedModuleRecords(moduleKey: string) {
  if (typeof window === "undefined") return false;
  const cached = memoryByModule.get(moduleKey);
  if (cached) return cached.length > 0;
  const raw = window.localStorage.getItem(storageKey(moduleKey));
  if (raw === null) return false;
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) && parsed.length > 0;
  } catch {
    return false;
  }
}

function recordFromRow<T extends ModuleRecord>(row: ModuleRecordRow): T | null {
  if (!row.data || typeof row.data !== "object") return null;
  return { id: row.record_id, ...(row.data as object) } as T;
}

async function loadModuleRecords<T extends ModuleRecord>(moduleKey: string) {
  if (!supabase) return [];

  const { data, error } = await supabase
    .from("module_records")
    .select("record_id,data")
    .eq("module_key", moduleKey)
    .eq("active", true)
    .order("position", { ascending: true })
    .order("updated_at", { ascending: false });

  if (error) throw error;
  return ((data ?? []) as ModuleRecordRow[]).flatMap((row) => recordFromRow<T>(row) ?? []);
}

export async function replaceModuleRecords<T extends ModuleRecord>(
  moduleKey: string,
  records: T[],
  options?: { removedIds?: string[] },
) {
  if (!supabase) return;

  const timestamp = new Date().toISOString();
  const nextIds = records.map((record) => record.id);
  const previousIds = lastSyncedIdsByModule.get(moduleKey) ?? [];
  const removedIds =
    options?.removedIds ??
    previousIds.filter((recordId) => !nextIds.includes(recordId));

  await withDeadlockRetry(async () => {
    if (records.length > 0) {
      const rows = records.map((record, position) => ({
        module_key: moduleKey,
        record_id: record.id,
        data: record,
        position,
        active: true,
        updated_at: timestamp,
      }));
      await upsertModuleRecordRows(rows);
    }

    if (previousIds.length > 0 && removedIds.length > 0) {
      await deactivateModuleRecordIds(moduleKey, removedIds, timestamp);
    } else if (records.length === 0 && previousIds.length === 0) {
      if (!supabase) return;
      const disabled = await supabase
        .from("module_records")
        .update({ active: false, updated_at: timestamp })
        .eq("module_key", moduleKey)
        .neq("record_id", "");
      if (disabled.error) throw disabled.error;
    }

    lastSyncedIdsByModule.set(moduleKey, nextIds);
  });
}

async function runSerializedModuleSync<T extends ModuleRecord>(moduleKey: string, records: T[]) {
  const state = getSyncState(moduleKey);
  if (state.inFlight) {
    await state.inFlight.catch(() => undefined);
  }

  state.inFlight = (async () => {
    try {
      if (!isBrowserOnline()) {
        throw new Error("Device is offline. Changes are saved locally and will sync when online.");
      }
      if (isSupabaseAuthSyncPaused()) {
        writePendingSyncRecords(moduleKey, records);
        return;
      }
      // If a remote wipe landed while this write was queued, drop stale payload.
      const wiped = await ensureModuleRecordsWipeApplied();
      if (wiped) {
        clearPendingSyncRecords(moduleKey);
        return;
      }
      const token = await ensureSupabaseAccessToken();
      if (!token) {
        writePendingSyncRecords(moduleKey, records);
        state.onError?.(new Error("Session expired. Sign in again to sync."));
        return;
      }
      await replaceModuleRecords(moduleKey, records);
      const pending = readPendingSyncRecords<T>(moduleKey);
      if (!pending || JSON.stringify(pending) === JSON.stringify(records)) {
        clearPendingSyncRecords(moduleKey);
      }
    } catch (error) {
      writePendingSyncRecords(moduleKey, records);
      if (isSupabaseAuthError(error)) {
        pauseSupabaseAuthSync();
        state.onError?.(new Error("Session expired. Sign in again to sync."));
        const now = Date.now();
        if (now - lastModuleAuthWarnAt > 15_000) {
          lastModuleAuthWarnAt = now;
          console.warn(`Supabase ${moduleKey} module sync paused (auth)`, error);
        }
        return;
      }
      state.onError?.(error);
      console.error(`Supabase ${moduleKey} module sync failed`, error);
    }
  })().finally(() => {
    state.inFlight = null;
  });
  await state.inFlight;

  if (state.pending) {
    const next = state.pending as T[];
    state.pending = null;
    await runSerializedModuleSync(moduleKey, next);
  }
}

function queueModuleRecordsSync<T extends ModuleRecord>(
  moduleKey: string,
  records: T[],
  onError?: (error: unknown) => void,
) {
  const state = getSyncState(moduleKey);
  state.pending = records;
  state.onError = onError;
  writePendingSyncRecords(moduleKey, records);
  if (isSupabaseAuthSyncPaused()) {
    if (state.timer) {
      window.clearTimeout(state.timer);
      state.timer = null;
    }
    onError?.(new Error("Session expired. Sign in again to sync."));
    return;
  }
  if (state.timer) window.clearTimeout(state.timer);
  state.timer = window.setTimeout(() => {
    state.timer = null;
    const payload = state.pending as T[] | null;
    state.pending = null;
    if (!payload) return;
    void runSerializedModuleSync(moduleKey, payload);
  }, MODULE_SYNC_DEBOUNCE_MS) as unknown as ReturnType<typeof setTimeout>;
}

/** Stable empty seed — never pass inline `[]` into hooks that put fallback in effect deps. */
export const EMPTY_MODULE_RECORDS: never[] = [];

function moduleRecordsContentEqual<T extends ModuleRecord>(a: T[], b: T[]): boolean {
  if (a === b) return true;
  if (a.length !== b.length) return false;
  for (let index = 0; index < a.length; index += 1) {
    if (a[index]?.id !== b[index]?.id) return false;
    if (JSON.stringify(a[index]) !== JSON.stringify(b[index])) return false;
  }
  return true;
}

export function useModuleRecords<T extends ModuleRecord>(moduleKey: string, fallback: T[]) {
  // Prefer local cache immediately so cash-up / closings reset dashboards before remote hydrate.
  const [records, setRecordState] = useState<T[]>(() => readLocalRecords(moduleKey, fallback));
  const [loading, setLoading] = useState(() => isSupabaseConfigured);
  const [backendError, setBackendError] = useState<string | null>(null);
  const hydratedRef = useRef(!isSupabaseConfigured);
  const applyingRemoteRef = useRef(false);
  const hydrateTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Callers often pass inline `[]` — keep it out of effect deps or hydrate loops forever.
  const fallbackRef = useRef(fallback);
  fallbackRef.current = fallback;

  const setRecordsLocalOnly: StoreSetter<T> = useCallback((update) => {
    setRecordState((prev) => {
      const next = typeof update === "function" ? update(prev) : update;
      if (next === prev || moduleRecordsContentEqual(prev, next)) return prev;
      writeLocalRecords(moduleKey, next);
      return next;
    });
  }, [moduleKey]);

  const syncRecords = useCallback((next: T[]) => {
    if (applyingRemoteRef.current || !isSupabaseConfigured) return;
    if (!hydratedRef.current) {
      // Wait for remote hydrate. Queuing here refilled an empty DB from old-device cache/seed.
      return;
    }
    queueModuleRecordsSync(moduleKey, next, (error) => {
      const message = error instanceof Error ? error.message : "Module sync failed.";
      setBackendError((prev) => (prev === message ? prev : message));
    });
  }, [moduleKey]);

  const setRecords: StoreSetter<T> = useCallback((update) => {
    let changed = false;
    setRecordState((prev) => {
      const next = typeof update === "function" ? update(prev) : update;
      if (next === prev || moduleRecordsContentEqual(prev, next)) return prev;
      changed = true;
      writeLocalRecords(moduleKey, next);
      syncRecords(next);
      return next;
    });
    // Notify other hook instances in this tab (e.g. cash-up closings → waiter dashboard).
    // Listeners must only setState — never call setRecords — or this loops.
    if (changed) {
      queueMicrotask(() => notifyModuleRecordsUpdated(moduleKey));
    }
  }, [moduleKey, syncRecords]);

  useEffect(() => {
    if (!isSupabaseConfigured || !supabase) return;
    let active = true;

    async function hydrate() {
      if (isModuleSyncActive(moduleKey)) return;
      if (!isBrowserOnline()) {
        hydratedRef.current = true;
        setBackendError("Offline mode: using locally saved data. Changes will sync when online.");
        setLoading(false);
        return;
      }
      if (isSupabaseAuthSyncPaused()) {
        hydratedRef.current = true;
        setBackendError("Session expired. Sign in again to sync.");
        setLoading(false);
        return;
      }
      const token = await ensureSupabaseAccessToken();
      if (!token) {
        hydratedRef.current = true;
        if (active) {
          setBackendError("Session expired. Sign in again to sync.");
          setLoading(false);
        }
        return;
      }
      setLoading(true);
      try {
        const wiped = await ensureModuleRecordsWipeApplied();

        const rows = await loadModuleRecords<T>(moduleKey);
        if (!active || isModuleSyncActive(moduleKey)) return;
        // Remote is the source of truth. Stale pending/local cache from older devices
        // must not refill module_records after a DB clear.
        const pendingLocal = wiped ? null : readPendingSyncRecords<T>(moduleKey);
        const pendingSavedAt = wiped ? 0 : readPendingSyncSavedAt(moduleKey);
        const cachedLocal = wiped
          ? (EMPTY_MODULE_RECORDS as T[])
          : readLocalRecords<T>(moduleKey, EMPTY_MODULE_RECORDS as T[]);
        const emptyFallback = fallbackRef.current;
        const pendingIsFresh =
          Boolean(pendingLocal?.length) &&
          pendingSavedAt > 0 &&
          Date.now() - pendingSavedAt < PENDING_EMPTY_REMOTE_MAX_AGE_MS &&
          pendingSavedAt > readLocalWipeEpoch();
        applyingRemoteRef.current = true;
        if (rows.length === 0) {
          // Empty remote: only re-upload very recent in-flight writes (e.g. cash-up just saved).
          // Never revive stale pending/local cache — that refills a cleared DB from old devices.
          if (pendingIsFresh && pendingLocal) {
            setRecordState((prev) => (moduleRecordsContentEqual(prev, pendingLocal) ? prev : pendingLocal));
            writeLocalRecords(moduleKey, pendingLocal);
            lastSyncedIdsByModule.set(
              moduleKey,
              pendingLocal.map((row) => row.id),
            );
            queueModuleRecordsSync(moduleKey, pendingLocal, (error) => {
              const message = error instanceof Error ? error.message : "Module sync failed.";
              setBackendError((prev) => (prev === message ? prev : message));
            });
          } else {
            clearPendingSyncRecords(moduleKey);
            setRecordState((prev) => (moduleRecordsContentEqual(prev, emptyFallback) ? prev : emptyFallback));
            writeLocalRecords(moduleKey, []);
            lastSyncedIdsByModule.set(moduleKey, []);
          }
        } else {
          const merged = mergeRemoteWithLocalOnly(rows, pendingLocal?.length ? pendingLocal : cachedLocal);
          if (!pendingLocal?.length) clearPendingSyncRecords(moduleKey);
          setRecordState((prev) => (moduleRecordsContentEqual(prev, merged) ? prev : merged));
          writeLocalRecords(moduleKey, merged);
          lastSyncedIdsByModule.set(
            moduleKey,
            merged.map((row) => row.id),
          );
          if (pendingLocal && pendingLocal.length > 0) {
            queueModuleRecordsSync(moduleKey, merged, (error) => {
              const message = error instanceof Error ? error.message : "Module sync failed.";
              setBackendError((prev) => (prev === message ? prev : message));
            });
          }
        }
        setBackendError(null);
      } catch (error) {
        if (isSupabaseAuthError(error)) {
          pauseSupabaseAuthSync();
          if (active) setBackendError("Session expired. Sign in again to sync.");
          if (Date.now() - lastModuleAuthWarnAt > 15_000) {
            lastModuleAuthWarnAt = Date.now();
            console.warn(`Supabase ${moduleKey} module load paused (auth)`, error);
          }
        } else {
          console.error(`Supabase ${moduleKey} module load failed`, error);
          if (active) setBackendError(error instanceof Error ? error.message : "Module load failed.");
        }
      } finally {
        applyingRemoteRef.current = false;
        hydratedRef.current = true;
        if (active) setLoading(false);
      }
    }

    function scheduleHydrate() {
      if (isModuleSyncActive(moduleKey)) return;
      if (typeof document !== "undefined" && document.visibilityState === "hidden") {
        return;
      }
      if (hydrateTimerRef.current) window.clearTimeout(hydrateTimerRef.current);
      hydrateTimerRef.current = setTimeout(() => {
        hydrateTimerRef.current = null;
        void hydrate();
      }, MODULE_HYDRATE_DEBOUNCE_MS);
    }

    function handleOnline() {
      void hydrate();
    }

    function handleVisible() {
      if (typeof document !== "undefined" && document.visibilityState === "hidden") return;
      scheduleHydrate();
    }

    void hydrate();
    window.addEventListener("online", handleOnline);
    window.addEventListener("focus", handleVisible);
    document.addEventListener("visibilitychange", handleVisible);
    const pollTimer = window.setInterval(handleVisible, MODULE_REMOTE_POLL_MS);

    // Default OFF: per-module Realtime (~28 channels × devices) burned Pro message quota.
    // Opt in with VITE_MODULE_RECORDS_REALTIME=1 for a single shared channel.
    const unsubscribeRemote = moduleRecordsRealtimeEnabled()
      ? subscribeSharedModuleRecordsRemote((changedKey) => {
          if (changedKey === MODULE_RECORDS_WIPE_MODULE_KEY) {
            cachedRemoteWipeEpoch = null;
            void ensureModuleRecordsWipeApplied().then(() => scheduleHydrate());
            return;
          }
          if (changedKey === "*" || changedKey === moduleKey) scheduleHydrate();
        })
      : null;

    return () => {
      active = false;
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("focus", handleVisible);
      document.removeEventListener("visibilitychange", handleVisible);
      window.clearInterval(pollTimer);
      if (hydrateTimerRef.current) window.clearTimeout(hydrateTimerRef.current);
      unsubscribeRemote?.();
    };
  }, [moduleKey]);

  // Same-tab / cross-tab refresh so cash-up closings reach every dashboard without remount.
  useEffect(() => {
    const eventName = `bl_module_records_updated:${moduleKey}`;
    function refreshFromLocal() {
      if (applyingRemoteRef.current) return;
      const fresh = readLocalRecords<T>(moduleKey, fallbackRef.current);
      // State only — never writeLocal/setRecords from this path (that re-notifies forever).
      setRecordState((prev) => (moduleRecordsContentEqual(prev, fresh) ? prev : fresh));
    }
    function handleStorage(event: StorageEvent) {
      if (event.key === storageKey(moduleKey)) refreshFromLocal();
    }
    window.addEventListener(eventName, refreshFromLocal);
    window.addEventListener("storage", handleStorage);
    return () => {
      window.removeEventListener(eventName, refreshFromLocal);
      window.removeEventListener("storage", handleStorage);
    };
  }, [moduleKey]);

  return useMemo(
    () => ({ records, setRecords, setRecordsLocalOnly, loading, backendError }),
    [records, setRecords, setRecordsLocalOnly, loading, backendError],
  );
}
