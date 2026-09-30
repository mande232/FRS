import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  Outlet,
  Link,
  createRootRouteWithContext,
  useRouter,
  HeadContent,
  Scripts,
} from "@tanstack/react-router";
import { useEffect, useState, useCallback, useMemo, type ReactNode } from "react";

import appCss from "../styles.css?url";
import { reportLovableError } from "../lib/lovable-error-reporting";
import { AuthContext, type AuthUser, type AuthUserInput } from "../lib/auth-context";
import {
  createSupabaseStaffUser,
  deactivateSupabaseStaffUser,
  updateSupabaseStaffUser,
} from "../lib/api/staff-users.functions";
import { BRAND_NAME } from "../lib/brand";
import { LangContext, type AppCalendar, type AppLang } from "../lib/lang-context";
import { validateStoreRoleAssignment } from "../lib/staff-management";
import { isStoreAssignmentRole, type StockLocation } from "../lib/stock-management";
import { locationsFromAuthInput, validateAssignedInventoryLocations } from "../lib/inventory-access";
import { findUserByPassword, loadUsers, makeAvatar, saveUsers } from "../lib/users";
import { isSupabaseConfigured, supabase } from "../lib/supabase/client";
import { listSupabaseProfiles, loadSupabaseAuthUser, resolveSupabasePasswordLogin } from "../lib/supabase/auth";
import { Toaster } from "../components/ui/sonner";
import { StoreProvider } from "@/lib/store";
import {
  restorePosPrinterLocalStorage,
  snapshotPosPrinterLocalStorage,
} from "@/lib/pos-printer";

function NotFoundComponent() {
  const lang = typeof window !== "undefined" && window.localStorage.getItem("lang") === "am" ? "am" : "en";
  const t = (en: string, am: string) => (lang === "am" ? am : en);

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <h1 className="text-7xl font-bold text-foreground">404</h1>
        <h2 className="mt-4 text-xl font-semibold text-foreground">{t("Page not found", "ገጹ አልተገኘም")}</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          {t(
            "The page you're looking for doesn't exist or has been moved.",
            "የፈለጉት ገጽ የለም ወይም ተንቀሳቅሷል።",
          )}
        </p>
        <div className="mt-6">
          <Link
            to="/login"
            className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            {t("Go to login", "ወደ መግቢያ ሂድ")}
          </Link>
        </div>
      </div>
    </div>
  );
}

function ErrorComponent({ error, reset }: { error: Error; reset: () => void }) {
  console.error(error);
  const router = useRouter();
  const lang = typeof window !== "undefined" && window.localStorage.getItem("lang") === "am" ? "am" : "en";
  const t = (en: string, am: string) => (lang === "am" ? am : en);
  useEffect(() => {
    reportLovableError(error, { boundary: "tanstack_root_error_component" });
  }, [error]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <h1 className="text-xl font-semibold tracking-tight text-foreground">
          {t("This page didn't load", "ይህ ገጽ አልተጫነም")}
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          {t(
            "Something went wrong on our end. You can try refreshing or head back home.",
            "በእኛ በኩል ችግር ተፈጥሯል። እባክዎ ዳግም ይሞክሩ ወይም ወደ መነሻ ይመለሱ።",
          )}
        </p>
        <div className="mt-6 flex flex-wrap justify-center gap-2">
          <button
            onClick={() => {
              router.invalidate();
              reset();
            }}
            className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            {t("Try again", "ደግመው ይሞክሩ")}
          </button>
          <a
            href="/login"
            className="inline-flex items-center justify-center rounded-md border border-input bg-background px-4 py-2 text-sm font-medium text-foreground transition-colors hover:bg-accent"
          >
            {t("Go to login", "ወደ መግቢያ ሂድ")}
          </a>
        </div>
      </div>
    </div>
  );
}

export const Route = createRootRouteWithContext<{ queryClient: QueryClient }>()({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1, viewport-fit=cover" },
      { title: BRAND_NAME },
      { name: "description", content: "Fiker Bar and Restaurant (FBR) POS — orders, stations, inventory, and payments." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
    links: [
      { rel: "stylesheet", href: appCss },
      { rel: "preconnect", href: "https://fonts.googleapis.com" },
      { rel: "preconnect", href: "https://fonts.gstatic.com", crossOrigin: "anonymous" },
      { rel: "stylesheet", href: "https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700&family=Noto+Sans+Ethiopic:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500;600;700&display=swap" },
    ],
  }),
  shellComponent: RootShell,
  component: RootComponent,
  notFoundComponent: NotFoundComponent,
  errorComponent: ErrorComponent,
});

function RootShell({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <head>
        <HeadContent />
      </head>
      <body>
        {children}
        <Scripts />
      </body>
    </html>
  );
}

function errorMessage(error: unknown, fallback: string) {
  return error instanceof Error && error.message ? error.message : fallback;
}

async function getSupabaseAccessToken(): Promise<string> {
  if (!supabase) throw new Error("Supabase is not configured.");

  const { data, error } = await supabase.auth.getSession();
  if (error) throw new Error(error.message);
  const accessToken = data.session?.access_token;
  if (!accessToken) throw new Error("You must be signed in to manage system users.");

  return accessToken;
}

function useAuthState() {
  const authMode = isSupabaseConfigured ? "supabase" as const : "demo" as const;
  const [user, setUser] = useState<AuthUser | null>(null);
  const [users, setUsers] = useState<AuthUser[]>(() => (isSupabaseConfigured ? [] : []));
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (isSupabaseConfigured || typeof window === "undefined") return;
    try {
      const raw = sessionStorage.getItem("bl_user");
      setUser(raw ? JSON.parse(raw) : null);
    } catch {
      setUser(null);
    } finally {
      setUsers(loadUsers());
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!isSupabaseConfigured || !supabase) return;
    let active = true;
    let authEventTimer: number | null = null;
    const restoreTimeout = window.setTimeout(() => {
      if (active) setLoading(false);
    }, 8000);

    async function hydrate(authUser: Parameters<typeof loadSupabaseAuthUser>[0]) {
      setLoading(true);
      try {
        if (!authUser) {
          if (!active) return;
          sessionStorage.removeItem("bl_user");
          setUser(null);
          setUsers([]);
          return;
        }

        const nextUser = await loadSupabaseAuthUser(authUser);
        let profiles: AuthUser[] = nextUser ? [nextUser] : [];
        try {
          profiles = await listSupabaseProfiles();
        } catch (profileListError) {
          console.warn("Failed to list Supabase profiles", profileListError);
        }
        if (!active) return;
        setUser(nextUser);
        if (nextUser) sessionStorage.setItem("bl_user", JSON.stringify(nextUser));
        else sessionStorage.removeItem("bl_user");
        setUsers(profiles);
      } catch (error) {
        console.error("Failed to load Supabase auth state", error);
        if (active) {
          sessionStorage.removeItem("bl_user");
          setUser(null);
          setUsers([]);
        }
      } finally {
        window.clearTimeout(restoreTimeout);
        if (active) setLoading(false);
      }
    }

    void supabase.auth.getSession()
      .then(({ data }) => hydrate(data.session?.user ?? null))
      .catch((error) => {
        console.error("Failed to restore Supabase session", error);
        sessionStorage.removeItem("bl_user");
        if (active) {
          setUser(null);
          setUsers([]);
          setLoading(false);
        }
      });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (session) {
        void import("@/lib/supabase/session").then((mod) => mod.clearSupabaseAuthSyncPause());
      } else if (event === "SIGNED_OUT") {
        void import("@/lib/supabase/session").then((mod) => mod.pauseSupabaseAuthSync(120_000));
      }
      if (authEventTimer) window.clearTimeout(authEventTimer);
      authEventTimer = window.setTimeout(() => {
        void hydrate(session?.user ?? null);
      }, 0);
    });

    return () => {
      active = false;
      window.clearTimeout(restoreTimeout);
      if (authEventTimer) window.clearTimeout(authEventTimer);
      subscription.unsubscribe();
    };
  }, []);

  const login = useCallback((u: AuthUser) => {
    if (isSupabaseConfigured) return;
    sessionStorage.setItem("bl_user", JSON.stringify(u));
    setUser(u);
  }, []);

  const signInWithPassword = useCallback(async (email: string, password: string) => {
    if (!supabase) return { ok: false as const, error: "Supabase is not configured." };

    const { data, error } = await supabase.auth.signInWithPassword({
      email: email.trim(),
      password,
    });

    if (error) return { ok: false as const, error: error.message };

    try {
      const { clearSupabaseAuthSyncPause } = await import("@/lib/supabase/session");
      clearSupabaseAuthSyncPause();
      const nextUser = await loadSupabaseAuthUser(data.user);
      const profiles = await listSupabaseProfiles();
      setUser(nextUser);
      if (nextUser) sessionStorage.setItem("bl_user", JSON.stringify(nextUser));
      setUsers(profiles);
      return nextUser
        ? { ok: true as const, user: nextUser }
        : { ok: false as const, error: "Signed in, but no user profile was found." };
    } catch (profileError) {
      console.error("Failed to load Supabase profile", profileError);
      return { ok: false as const, error: "Signed in, but the staff profile could not be loaded." };
    }
  }, []);

  const signInWithPasswordOnly = useCallback(async (password: string) => {
    if (!supabase) return { ok: false as const, error: "Supabase is not configured." };
    const loginPassword = password.trim();
    if (!loginPassword) return { ok: false as const, error: "Enter your password." };

    let resolved;
    try {
      resolved = await resolveSupabasePasswordLogin(loginPassword);
    } catch (error) {
      console.error("Failed to resolve password-only login", error);
      return {
        ok: false as const,
        error: "Password-only login is not enabled yet. Run supabase/migrations/002_password_only_login.sql.",
      };
    }

    if (!resolved?.email) return { ok: false as const, error: "Wrong password." };

    const { data, error } = await supabase.auth.signInWithPassword({
      email: resolved.email,
      password: loginPassword,
    });

    if (error) {
      return {
        ok: false as const,
        error: "Wrong password or the Supabase Auth password does not match the staff login password.",
      };
    }

    try {
      const { clearSupabaseAuthSyncPause } = await import("@/lib/supabase/session");
      clearSupabaseAuthSyncPause();
      const nextUser = await loadSupabaseAuthUser(data.user);
      const profiles = await listSupabaseProfiles();
      setUser(nextUser);
      if (nextUser) sessionStorage.setItem("bl_user", JSON.stringify(nextUser));
      setUsers(profiles);
      return nextUser
        ? { ok: true as const, user: nextUser }
        : { ok: false as const, error: "Signed in, but no user profile was found." };
    } catch (profileError) {
      console.error("Failed to load Supabase profile", profileError);
      return { ok: false as const, error: "Signed in, but the staff profile could not be loaded." };
    }
  }, []);

  const logout = useCallback(() => {
    // Device printer setup must survive logout on shared POS terminals.
    const printerSnapshot = snapshotPosPrinterLocalStorage();
    sessionStorage.removeItem("bl_user");
    try {
      window.localStorage.removeItem("bl_user");
    } catch {
      // ignore
    }
    setUser(null);
    const restorePrinter = () => restorePosPrinterLocalStorage(printerSnapshot);
    if (supabase) {
      void supabase.auth.signOut({ scope: "local" }).finally(restorePrinter);
    } else {
      restorePrinter();
    }
  }, []);

  const addUser = useCallback(async (input: AuthUserInput) => {
    if (isSupabaseConfigured) {
      try {
        const accessToken = await getSupabaseAccessToken();
        const created = await createSupabaseStaffUser({ data: { ...input, accessToken } });
        try {
          setUsers(await listSupabaseProfiles());
        } catch (profileListError) {
          console.warn("Failed to refresh Supabase profiles", profileListError);
          setUsers((prev) => [...prev.filter((u) => u.id !== created.id), created]);
        }
        return { ok: true as const, user: created };
      } catch (error) {
        console.error("Failed to create Supabase staff user", error);
        return {
          ok: false as const,
          error: errorMessage(error, "Staff account could not be created."),
        };
      }
    }
    const name = input.name.trim();
    const password = input.password.trim();
    if (!name) return { ok: false as const, error: "Name is required." };
    if (!password) return { ok: false as const, error: "Password is required." };
    if (password.length < 4) return { ok: false as const, error: "Password must be at least 4 characters." };
    if (findUserByPassword(password, users)) return { ok: false as const, error: "That password is already in use." };
    const storeAssignmentError = validateStoreRoleAssignment(input.role, input.assignedStore);
    if (storeAssignmentError) return { ok: false as const, error: storeAssignmentError };
    const locationAssignmentError = validateAssignedInventoryLocations(
      input.role,
      locationsFromAuthInput(input) as StockLocation[],
    );
    if (locationAssignmentError) return { ok: false as const, error: locationAssignmentError };
    const assignedInventoryLocations = locationsFromAuthInput(input);

    const newUser: AuthUser = {
      id: `u${Date.now()}`,
      name,
      role: input.role,
      branch: input.branch.trim() || "Bole",
      staffSalesAll: input.staffSalesAll ?? false,
      assignedStore: isStoreAssignmentRole(input.role) ? input.assignedStore ?? assignedInventoryLocations.find((loc) => loc === "Store 1" || loc === "Store 2") as AuthUser["assignedStore"] : undefined,
      assignedInventoryLocations: assignedInventoryLocations.length ? assignedInventoryLocations : undefined,
      avatar: makeAvatar(name),
      password,
    };

    setUsers((prev) => {
      const next = [...prev, newUser];
      saveUsers(next);
      return next;
    });

    return { ok: true as const, user: newUser };
  }, [users]);

  const updateUser = useCallback(async (id: string, input: AuthUserInput) => {
    if (isSupabaseConfigured) {
      try {
        const accessToken = await getSupabaseAccessToken();
        const updated = await updateSupabaseStaffUser({ data: { id, ...input, accessToken } });
        if (user?.id === id) {
          sessionStorage.setItem("bl_user", JSON.stringify(updated));
          setUser(updated);
        }
        try {
          setUsers(await listSupabaseProfiles());
        } catch (profileListError) {
          console.warn("Failed to refresh Supabase profiles", profileListError);
          setUsers((prev) => prev.map((u) => (u.id === id ? updated : u)));
        }
        return { ok: true as const, user: updated };
      } catch (error) {
        console.error("Failed to update Supabase staff user", error);
        return {
          ok: false as const,
          error: errorMessage(error, "Staff account could not be updated."),
        };
      }
    }
    const target = users.find((u) => u.id === id);
    if (!target) return { ok: false as const, error: "User not found." };

    const name = input.name.trim();
    const password = input.password.trim();
    if (!name) return { ok: false as const, error: "Name is required." };
    if (!password) return { ok: false as const, error: "Password is required." };
    if (password.length < 4) return { ok: false as const, error: "Password must be at least 4 characters." };
    if (users.some((u) => u.id !== id && u.password === password)) {
      return { ok: false as const, error: "That password is already in use." };
    }
    const storeAssignmentError = validateStoreRoleAssignment(input.role, input.assignedStore);
    if (storeAssignmentError) return { ok: false as const, error: storeAssignmentError };
    const locationAssignmentError = validateAssignedInventoryLocations(
      input.role,
      locationsFromAuthInput(input) as StockLocation[],
    );
    if (locationAssignmentError) return { ok: false as const, error: locationAssignmentError };
    if (
      (target.role === "Branch Manager" || target.role === "Administrator") &&
      input.role !== "Branch Manager" &&
      input.role !== "Administrator" &&
      users.filter((u) => u.role === "Branch Manager" || u.role === "Administrator").length <= 1
    ) {
      return { ok: false as const, error: "At least one manager account is required." };
    }
    const assignedInventoryLocations = locationsFromAuthInput(input);

    const updated: AuthUser = {
      ...target,
      name,
      role: input.role,
      branch: input.branch.trim() || "Bole",
      staffSalesAll: input.staffSalesAll ?? false,
      assignedStore: isStoreAssignmentRole(input.role) ? input.assignedStore ?? assignedInventoryLocations.find((loc) => loc === "Store 1" || loc === "Store 2") as AuthUser["assignedStore"] : undefined,
      assignedInventoryLocations: assignedInventoryLocations.length ? assignedInventoryLocations : undefined,
      avatar: makeAvatar(name),
      password,
    };

    setUsers((prev) => {
      const next = prev.map((u) => u.id === id ? updated : u);
      saveUsers(next);
      return next;
    });

    if (user?.id === id) {
      sessionStorage.setItem("bl_user", JSON.stringify(updated));
      setUser(updated);
    }

    return { ok: true as const, user: updated };
  }, [user, users]);

  const removeUser = useCallback(async (id: string) => {
    if (isSupabaseConfigured) {
      try {
        const accessToken = await getSupabaseAccessToken();
        await deactivateSupabaseStaffUser({ data: { id, accessToken } });
        try {
          setUsers(await listSupabaseProfiles());
        } catch (profileListError) {
          console.warn("Failed to refresh Supabase profiles", profileListError);
          setUsers((prev) => prev.filter((u) => u.id !== id));
        }
        return { ok: true as const };
      } catch (error) {
        console.error("Failed to remove Supabase staff user", error);
        return {
          ok: false as const,
          error: errorMessage(error, "Staff account could not be removed."),
        };
      }
    }
    if (user?.id === id) return { ok: false as const, error: "You cannot remove your own account." };
    const target = users.find((u) => u.id === id);
    if (!target) return { ok: false as const, error: "User not found." };
    if (
      (target.role === "Branch Manager" || target.role === "Administrator") &&
      users.filter((u) => u.role === "Branch Manager" || u.role === "Administrator").length <= 1
    ) {
      return { ok: false as const, error: "At least one manager account is required." };
    }

    setUsers((prev) => {
      const next = prev.filter((u) => u.id !== id);
      saveUsers(next);
      return next;
    });

    return { ok: true as const };
  }, [user, users]);

  return useMemo(
    () => ({
      user,
      users,
      authMode,
      loading,
      login,
      signInWithPassword,
      signInWithPasswordOnly,
      logout,
      addUser,
      updateUser,
      removeUser,
    }),
    [user, users, authMode, loading, login, signInWithPassword, signInWithPasswordOnly, logout, addUser, updateUser, removeUser],
  );
}

function RootComponent() {
  const { queryClient } = Route.useRouteContext();
  const auth = useAuthState();
  const [lang, setLang] = useState<AppLang>("en");
  const [calendar, setCalendar] = useState<AppCalendar>("gregorian");

  useEffect(() => {
    if (typeof window === "undefined") return;
    const savedLang = window.localStorage.getItem("lang");
    if (savedLang === "am" || savedLang === "en") {
      setLang(savedLang);
    }
    const savedCalendar = window.localStorage.getItem("calendar");
    if (savedCalendar === "ethiopian" || savedCalendar === "gregorian") {
      setCalendar(savedCalendar);
    }
  }, []);

  useEffect(() => {
    document.documentElement.lang = lang;
    if (typeof window !== "undefined") {
      window.localStorage.setItem("lang", lang);
    }
    if (lang === "am") {
      setCalendar("ethiopian");
    }
  }, [lang]);

  useEffect(() => {
    if (typeof window !== "undefined") {
      window.localStorage.setItem("calendar", calendar);
    }
  }, [calendar]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const handleStorage = (event: StorageEvent) => {
      if (event.key === "lang" && (event.newValue === "am" || event.newValue === "en")) {
        setLang(event.newValue);
      }
      if (event.key === "calendar" && (event.newValue === "ethiopian" || event.newValue === "gregorian")) {
        setCalendar(event.newValue);
      }
    };
    window.addEventListener("storage", handleStorage);
    return () => window.removeEventListener("storage", handleStorage);
  }, []);

  return (
    <LangContext.Provider value={{ lang, setLang, calendar, setCalendar }}>
      <AuthContext.Provider value={auth}>
        <QueryClientProvider client={queryClient}>
          <StoreProvider>
            <Outlet />
          </StoreProvider>
          <Toaster richColors closeButton position="bottom-right" />
        </QueryClientProvider>
      </AuthContext.Provider>
    </LangContext.Provider>
  );
}
