import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import * as Icons from "lucide-react";
import { useAuth } from "@/lib/auth-context";
import { loadRestaurantProfile } from "@/lib/brand";
import { useLang, useSetLang } from "@/lib/lang-context";
import { findUserByPassword } from "@/lib/users";
import { resolveSupabasePasswordLogin } from "@/lib/supabase/auth";
import { loadBackendRestaurantProfile } from "@/lib/supabase/pos-backend";

export const Route = createFileRoute("/login")({ component: LoginPage });

const PARTICLES = Array.from({ length: 18 }, (_, i) => ({
  id: i,
  size: 3 + (i % 5) * 2,
  x: (i * 37 + 11) % 100,
  y: (i * 53 + 7) % 100,
  delay: (i * 0.4) % 4,
  duration: 6 + (i % 4) * 2,
}));

function LoginPage() {
  const { login, signInWithPasswordOnly, users, authMode, loading } = useAuth();
  const navigate = useNavigate();
  const [restaurantProfile, setRestaurantProfile] = useState(() => loadRestaurantProfile());
  const lang = useLang();
  const setLang = useSetLang();
  const [dark, setDark] = useState(false);
  const [preferencesReady, setPreferencesReady] = useState(false);
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [showPwd, setShowPwd] = useState(false);
  const [shake, setShake] = useState(false);
  const [mounted, setMounted] = useState(false);

  const t = (en: string, am: string) => (lang === "am" ? am : en);
  const usingSupabase = authMode === "supabase";
  const identifiedUser = useMemo(
    () => (usingSupabase ? null : findUserByPassword(password, users)),
    [password, users, usingSupabase],
  );
  const [resolvedStaff, setResolvedStaff] = useState<{ name: string; role: string; avatar: string } | null>(null);

  useEffect(() => {
    if (!usingSupabase) {
      setResolvedStaff(null);
      return;
    }
    const pwd = password.trim();
    if (pwd.length < 3) {
      setResolvedStaff(null);
      return;
    }
    let active = true;
    const timer = window.setTimeout(() => {
      void resolveSupabasePasswordLogin(pwd)
        .then((row) => {
          if (!active) return;
          if (!row) {
            setResolvedStaff(null);
            return;
          }
          setResolvedStaff({
            name: row.name || row.email,
            role: row.role || "Staff",
            avatar: row.avatar || (row.name || "?").slice(0, 2).toUpperCase(),
          });
        })
        .catch(() => {
          if (active) setResolvedStaff(null);
        });
    }, 280);
    return () => {
      active = false;
      window.clearTimeout(timer);
    };
  }, [password, usingSupabase]);

  const previewUser = usingSupabase ? resolvedStaff : identifiedUser;

  useEffect(() => {
    const savedTheme = localStorage.getItem("theme");
    const nextDark =
      savedTheme === "dark" ||
      (!savedTheme && window.matchMedia("(prefers-color-scheme: dark)").matches);
    setDark(nextDark);
    document.documentElement.classList.toggle("dark", nextDark);
    setPreferencesReady(true);
    // stagger mount animation
    requestAnimationFrame(() => setMounted(true));
  }, []);

  useEffect(() => {
    void loadBackendRestaurantProfile()
      .then((profile) => { if (profile) setRestaurantProfile(profile); })
      .catch((err) => console.warn("Failed to load Supabase restaurant profile", err));
  }, []);

  useEffect(() => {
    if (!preferencesReady) return;
    document.documentElement.classList.toggle("dark", dark);
    localStorage.setItem("theme", dark ? "dark" : "light");
  }, [dark, preferencesReady]);

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    if (usingSupabase) {
      if (!password.trim()) { triggerError(t("Enter your password.", "የይለፍ ቃል ያስገቡ።")); return; }
      const result = await signInWithPasswordOnly(password);
      if (!result.ok) { triggerError(result.error); return; }
      navigate({ to: "/app" });
      return;
    }
    if (!password.trim()) { triggerError(t("Enter your password.", "የይለፍ ቃል ያስገቡ።")); return; }
    const user = findUserByPassword(password, users);
    if (!user) { triggerError(t("Wrong password.", "የተሳሳተ የይለፍ ቃል።")); return; }
    login(user);
    navigate({ to: "/app" });
  }

  function triggerError(msg: string) {
    setError(msg);
    setShake(true);
    setTimeout(() => setShake(false), 600);
  }

  return (
    <div className="relative min-h-dvh min-h-screen flex flex-col items-center justify-center px-4 overflow-hidden">

      {/* ── animated gradient background ── */}
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_20%_20%,hsl(38_90%_50%/0.16)_0%,transparent_55%),radial-gradient(ellipse_at_80%_80%,hsl(38_70%_45%/0.1)_0%,transparent_55%),radial-gradient(ellipse_at_60%_10%,hsl(40_80%_70%/0.1)_0%,transparent_45%)] dark:bg-[radial-gradient(ellipse_at_20%_20%,hsl(38_90%_55%/0.18)_0%,transparent_55%),radial-gradient(ellipse_at_80%_80%,hsl(38_70%_45%/0.12)_0%,transparent_55%)]" />
      <div
        className="absolute inset-0"
        style={{ background: "var(--color-background)", opacity: 0.7 }}
      />

      {/* ── floating particles ── */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        {PARTICLES.map((p) => (
          <span
            key={p.id}
            className="absolute rounded-full bg-ember/20 dark:bg-ember/15"
            style={{
              width: p.size,
              height: p.size,
              left: `${p.x}%`,
              top: `${p.y}%`,
              animation: `loginFloat ${p.duration}s ${p.delay}s ease-in-out infinite alternate`,
            }}
          />
        ))}
      </div>

      {/* ── top-right controls ── */}
      <div
        className="absolute top-4 right-4 flex items-center gap-2 z-10"
        style={{
          opacity: mounted ? 1 : 0,
          transform: mounted ? "translateY(0)" : "translateY(-12px)",
          transition: "opacity 0.5s 0.1s, transform 0.5s 0.1s",
        }}
      >
        <div className="flex rounded-xl border border-border/60 p-0.5 bg-card/80 backdrop-blur-sm text-xs shadow-sm">
          {(["en", "am"] as const).map((l) => (
            <button
              key={l}
              type="button"
              onClick={() => setLang(l)}
              className={`min-w-10 h-8 px-2.5 rounded-lg font-medium touch-manipulation transition-all duration-200 ${
                lang === l
                  ? "bg-ember text-ember-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {l === "en" ? "EN" : "አማ"}
            </button>
          ))}
        </div>
        <button
          type="button"
          onClick={() => setDark((d) => !d)}
          className="size-9 grid place-items-center rounded-xl border border-border/60 bg-card/80 backdrop-blur-sm hover:bg-surface-2 touch-manipulation transition-all duration-200 shadow-sm"
          aria-label={dark ? t("Light mode", "ብርሃን") : t("Dark mode", "ጨለማ")}
        >
          <span
            style={{
              display: "inline-flex",
              transition: "transform 0.4s, opacity 0.3s",
              transform: dark ? "rotate(0deg)" : "rotate(-90deg)",
            }}
          >
            {dark ? <Icons.Sun className="size-4" /> : <Icons.Moon className="size-4" />}
          </span>
        </button>
      </div>

      {/* ── main content ── */}
      <div className="relative z-10 w-full max-w-[380px]">

        {/* logo block */}
        <div
          className="flex flex-col items-center gap-4 mb-8"
          style={{
            opacity: mounted ? 1 : 0,
            transform: mounted ? "translateY(0) scale(1)" : "translateY(24px) scale(0.95)",
            transition: "opacity 0.6s 0.05s cubic-bezier(0.34,1.56,0.64,1), transform 0.6s 0.05s cubic-bezier(0.34,1.56,0.64,1)",
          }}
        >
          <div className="relative">
            <div className="absolute inset-0 rounded-3xl bg-ember/20 blur-xl scale-110 animate-pulse" />
            <img
              src={restaurantProfile.logoUrl}
              alt={`${restaurantProfile.name} logo`}
              className="relative size-24 rounded-3xl object-cover border-2 border-white/20 shadow-[0_8px_32px_-8px_hsl(38_90%_50%/0.45)]"
            />
          </div>
          <div className="text-center">
            <h2 className="font-display text-2xl font-bold tracking-tight">{restaurantProfile.name}</h2>
            <p className="text-xs text-muted-foreground mt-1 tracking-widest uppercase">
              {t("Point of Sale", "የሽያጭ ስርዓት")}
            </p>
          </div>
        </div>

        {/* card */}
        <div
          className="relative"
          style={{
            opacity: mounted ? 1 : 0,
            transform: mounted ? "translateY(0)" : "translateY(32px)",
            transition: "opacity 0.6s 0.18s ease-out, transform 0.6s 0.18s ease-out",
          }}
        >
          {/* card glow ring */}
          <div className="absolute -inset-px rounded-2xl bg-gradient-to-br from-ember/30 via-transparent to-teff/20 opacity-60 blur-sm pointer-events-none" />

          <div className="relative bg-card/90 backdrop-blur-xl border border-border/60 rounded-2xl shadow-[0_24px_64px_-16px_oklch(0.2_0.04_60/0.2)] p-7">

            {/* heading */}
            <div className="mb-7 text-center">
              <h1 className="font-display text-2xl font-semibold leading-tight">
                {t("Welcome back", "እንኳን ደህና መጡ")}
              </h1>
            </div>

            <form onSubmit={handleLogin} className="space-y-4">

              {/* password field */}
              <div>
                <label className="text-xs font-semibold text-muted-foreground tracking-wide uppercase" htmlFor="pwd">
                  {t("Password", "የይለፍ ቃል")}
                </label>
                <div
                  className="relative mt-2"
                  style={shake ? { animation: "loginShake 0.5s ease-in-out" } : {}}
                >
                  <div className={`absolute inset-0 rounded-xl transition-all duration-300 pointer-events-none ${
                    error
                      ? "shadow-[0_0_0_2px_oklch(0.55_0.22_27/0.4)]"
                      : password && previewUser
                        ? "shadow-[0_0_0_2px_oklch(0.45_0.12_150/0.4)]"
                        : "shadow-none"
                  }`} />
                  <Icons.Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 size-4 text-muted-foreground/60 pointer-events-none z-10" />
                  <input
                    id="pwd"
                    type={showPwd ? "text" : "password"}
                    value={password}
                    onChange={(e) => { setPassword(e.target.value); setError(""); }}
                    placeholder={t("Enter your password", "የይለፍ ቃልዎን ያስገቡ")}
                    className={`w-full h-12 pl-10 pr-12 rounded-xl border bg-surface/60 text-sm focus:outline-none focus:ring-2 transition-all duration-200 ${
                      error
                        ? "border-destructive/60 focus:ring-destructive/25"
                        : "border-border focus:ring-ember/25 focus:border-ember/50"
                    }`}
                    autoFocus
                    autoComplete="current-password"
                    enterKeyHint="go"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPwd((v) => !v)}
                    className="absolute right-1 top-1/2 -translate-y-1/2 size-10 grid place-items-center rounded-lg text-muted-foreground hover:text-foreground touch-manipulation transition-colors"
                    aria-label={showPwd ? t("Hide", "ደብቅ") : t("Show", "አሳይ")}
                  >
                    {showPwd ? <Icons.EyeOff className="size-4" /> : <Icons.Eye className="size-4" />}
                  </button>
                </div>
              </div>

              {/* error banner */}
              {error && (
                <div
                  className="flex items-center gap-2.5 rounded-xl bg-destructive/8 border border-destructive/25 px-3.5 py-3 text-sm text-destructive"
                  style={{ animation: "loginFadeIn 0.3s ease-out" }}
                >
                  <Icons.AlertCircle className="size-4 shrink-0" />
                  <span>{error}</span>
                </div>
              )}

              {/* identified user preview */}
              {previewUser && !error && (
                <div
                  className="flex items-center gap-3 rounded-xl bg-teff/8 border border-teff/25 px-3.5 py-3"
                  style={{ animation: "loginFadeIn 0.35s cubic-bezier(0.34,1.56,0.64,1)" }}
                >
                  <div className="size-10 rounded-full bg-gradient-to-br from-ember to-teff grid place-items-center text-white font-display text-xs font-bold shrink-0 shadow-sm">
                    {previewUser.avatar}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="text-sm font-semibold truncate">{previewUser.name}</div>
                    <div className="text-xs text-muted-foreground truncate">{previewUser.role}</div>
                  </div>
                  <div className="shrink-0 size-7 rounded-full bg-teff/15 grid place-items-center">
                    <Icons.CheckCircle2 className="size-4 text-teff" />
                  </div>
                </div>
              )}

              {/* submit */}
              <button
                type="submit"
                disabled={usingSupabase ? loading || !password.trim() : !identifiedUser}
                className="relative w-full h-12 rounded-xl bg-ember text-ember-foreground font-semibold text-sm inline-flex items-center justify-center gap-2 touch-manipulation transition-all duration-200 overflow-hidden mt-1 disabled:opacity-40 disabled:cursor-not-allowed group hover:opacity-90 active:scale-[0.98]"
                style={{
                  boxShadow: "0 4px 20px -4px hsl(38 90% 50% / 0.45)",
                }}
              >
                {/* shimmer */}
                <span className="absolute inset-0 bg-gradient-to-r from-transparent via-white/15 to-transparent -translate-x-full group-hover:translate-x-full transition-transform duration-700 ease-in-out pointer-events-none" />
                {loading ? (
                  <Icons.Loader2 className="size-4 animate-spin" />
                ) : (
                  <Icons.LogIn className="size-4 transition-transform duration-200 group-hover:translate-x-0.5" />
                )}
                {t("Sign in", "ይግቡ")}
              </button>
            </form>
          </div>
        </div>

        <p
          className="text-center text-xs text-muted-foreground/60 mt-6"
          style={{
            opacity: mounted ? 1 : 0,
            transition: "opacity 0.6s 0.4s",
          }}
        >
        </p>
      </div>

      {/* keyframes injected inline */}
      <style>{`
        @keyframes loginFloat {
          0%   { transform: translateY(0px) scale(1); opacity: 0.4; }
          100% { transform: translateY(-22px) scale(1.15); opacity: 0.15; }
        }
        @keyframes loginShake {
          0%,100% { transform: translateX(0); }
          18%     { transform: translateX(-7px); }
          36%     { transform: translateX(7px); }
          54%     { transform: translateX(-5px); }
          72%     { transform: translateX(5px); }
          90%     { transform: translateX(-2px); }
        }
        @keyframes loginFadeIn {
          from { opacity: 0; transform: translateY(-6px) scale(0.97); }
          to   { opacity: 1; transform: translateY(0) scale(1); }
        }
      `}</style>
    </div>
  );
}
