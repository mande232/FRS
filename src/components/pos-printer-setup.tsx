import { useEffect, useMemo, useState } from "react";
import * as Icons from "lucide-react";
import { Card, Chip } from "@/components/ui-kit";
import { useAuth } from "@/lib/auth-context";
import { useT } from "@/lib/i18n";
import { appendPosPrinterAudit } from "@/lib/pos-printer-audit";
import {
  bluetoothPrintingSupported,
  buildPosPrinterSnapshot,
  canUnlockPosPrinter,
  canUseNetworkPrintAgent,
  clearPosPrinterLockForManager,
  clearStoredBluetoothPrinter,
  DEFAULT_POS_PRINTER_SETTINGS,
  isLocalPosOrigin,
  isPosPrinterVerifiedForOrdering,
  loadPosPrinterSettings,
  loadPosPrinterVerification,
  loadStoredBluetoothPrinter,
  pairPosBluetoothPrinter,
  type PaperWidth,
  type PosPrinterSettings,
  type PosPrinterVerification,
  type PrinterMode,
  type StoredBluetoothPrinter,
  runPosPrinterTestPrint,
  savePosPrinterSettings,
  savePosPrinterVerification,
  verifyPosPrinterAfterTest,
} from "@/lib/pos-printer";
import { showError, showSuccess } from "@/lib/toast";

/** Friendly connection type labels matching the product brief. */
export function resolvePrinterConnectionLabel(mode: PrinterMode) {
  if (mode === "bluetooth") return "Bluetooth";
  if (mode === "network") return "Network";
  if (mode === "gateway") return "Cashier print gateway";
  return "USB / Browser";
}

/** Waiter phones print via the cashier laptop gateway by default. */
export function defaultWaiterPosPrinterSettings(
  current: PosPrinterSettings = loadPosPrinterSettings(),
): PosPrinterSettings {
  return {
    ...current,
    mode: "gateway",
    gatewayCode:
      current.gatewayCode?.trim() ||
      DEFAULT_POS_PRINTER_SETTINGS.gatewayCode ||
      "CASHIER-LAPTOP-01",
  };
}

export function PosPrinterUnavailablePanel({
  reason,
  onRetry,
  onTest,
  onRequestManager,
  busy,
}: {
  reason?: string;
  onRetry: () => void;
  onTest: () => void;
  onRequestManager: () => void;
  busy?: boolean;
}) {
  const t = useT();
  return (
    <div className="rounded-xl border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm">
      <div className="font-semibold text-destructive">
        {t("Printer unavailable", "አታሚ አይገኝም")}
      </div>
      <p className="mt-1 text-xs text-muted-foreground">
        {reason?.trim() ||
          t(
            "Send / Print Bono is disabled until the connection is restored. You cannot switch printers without a manager.",
            "ግንኙነቱ እስኪመለስ ድረስ Send / Print Bono ተሰናክሏል። ያለ ሥራ አስኪያጅ አታሚ መቀየር አይችሉም።",
          )}
      </p>
      <div className="mt-3 flex flex-wrap gap-2">
        <button
          type="button"
          disabled={busy}
          onClick={onRetry}
          className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-border bg-card px-3 text-xs font-semibold disabled:opacity-50"
        >
          <Icons.RefreshCw className="size-3.5" />
          {t("Retry Connection", "ግንኙነት እንደገና ሞክር")}
        </button>
        <button
          type="button"
          disabled={busy}
          onClick={onTest}
          className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-border bg-card px-3 text-xs font-semibold disabled:opacity-50"
        >
          <Icons.Printer className="size-3.5" />
          {t("Test Printer", "አታሚ ሞክር")}
        </button>
        <button
          type="button"
          onClick={onRequestManager}
          className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-foreground px-3 text-xs font-semibold text-background"
        >
          <Icons.UserCog className="size-3.5" />
          {t("Request Manager Assistance", "የሥራ አስኪያጅ እርዳታ ጠይቅ")}
        </button>
      </div>
    </div>
  );
}

type PosPrinterSetupProps = {
  /** When true, show as a full-screen POS gate. */
  forced?: boolean;
  onVerified?: (verification: PosPrinterVerification) => void;
  onVerificationChange?: (verification: PosPrinterVerification) => void;
  onStartTakingOrders?: () => void;
  /** Compact read-only summary for locked terminals. */
  readOnlySummary?: boolean;
};

export function PosPrinterSetup({
  forced = false,
  onVerified,
  onVerificationChange,
  onStartTakingOrders,
  readOnlySummary = false,
}: PosPrinterSetupProps) {
  const t = useT();
  const auth = useAuth();
  const branch = auth.user?.branch?.trim() || "Main";
  const actorName =
    auth.user?.name?.trim() ||
    (auth.user?.email?.includes("@") ? auth.user.email.split("@")[0] : auth.user?.email) ||
    "Staff";
  const actorRole = auth.user?.role || "Staff";
  const isWaiter = actorRole === "Waiter";
  const canUnlock = canUnlockPosPrinter(actorRole);

  const [settings, setSettings] = useState<PosPrinterSettings>(() => {
    const loaded = loadPosPrinterSettings();
    const verification = loadPosPrinterVerification();
    if (isWaiter && verification.status === "unconfigured" && loaded.mode === "browser") {
      const next = defaultWaiterPosPrinterSettings(loaded);
      savePosPrinterSettings(next);
      return next;
    }
    return loaded;
  });
  const [savedPrinter, setSavedPrinter] = useState<StoredBluetoothPrinter | null>(() =>
    loadStoredBluetoothPrinter(),
  );
  const [verification, setVerification] = useState<PosPrinterVerification>(() =>
    loadPosPrinterVerification(),
  );
  const [printerName, setPrinterName] = useState(
    () =>
      loadPosPrinterVerification().snapshot?.printerLabel ||
      loadStoredBluetoothPrinter()?.name ||
      (isWaiter ? "Cashier print gateway" : ""),
  );
  const [busy, setBusy] = useState(false);
  const [testMessage, setTestMessage] = useState<string | null>(null);

  const verified = isPosPrinterVerifiedForOrdering(verification);
  const locked = verification.locked && !canUnlock;
  const editable = !locked && (!verified || !verification.locked || canUnlock);

  useEffect(() => {
    let loaded = loadPosPrinterSettings();
    const currentVerification = loadPosPrinterVerification();
    if (isWaiter && currentVerification.status === "unconfigured" && loaded.mode === "browser") {
      loaded = defaultWaiterPosPrinterSettings(loaded);
      savePosPrinterSettings(loaded);
    }
    setSettings(loaded);
    setSavedPrinter(loadStoredBluetoothPrinter());
    setVerification(currentVerification);
  }, [isWaiter]);

  const connectionStatus = useMemo(() => {
    if (verification.status === "verified") return t("Verified", "ተረጋግጧል");
    if (verification.status === "unavailable") return t("Unavailable", "አይገኝም");
    if (verification.lastTestPrintOk) return t("Test print OK — save to verify", "ሙከራ ተሳክቷል — ለማረጋገጥ ያስቀምጡ");
    if (verification.status === "configured") return t("Configured — test print required", "ተዋቅሯል — ሙከራ ያስፈልጋል");
    return t("Not configured", "አልተዋቀረም");
  }, [t, verification]);

  function persistSettings(next: PosPrinterSettings) {
    savePosPrinterSettings(next);
    setSettings(next);
  }

  function update<K extends keyof PosPrinterSettings>(key: K, value: PosPrinterSettings[K]) {
    if (!editable) return;
    const prev = loadPosPrinterVerification();
    const next = { ...settings, [key]: value };
    persistSettings(next);
    // Changing mode/device invalidates prior test until re-tested.
    if (prev.locked && canUnlock) {
      const unlocked = clearPosPrinterLockForManager(actorName);
      setVerification(unlocked);
      appendPosPrinterAudit({
        action: "change",
        actor: actorName,
        actorRole,
        branch,
        previous: prev,
        next: unlocked,
        reason: `Changed ${String(key)}`,
      });
    } else if (prev.lastTestPrintOk || prev.status === "configured") {
      const refreshed = {
        ...prev,
        lastTestPrintOk: false,
        status: "configured" as const,
        snapshot: buildPosPrinterSnapshot(next, savedPrinter, printerName),
      };
      savePosPrinterVerification(refreshed);
      setVerification(refreshed);
    }
  }

  async function pairBluetooth() {
    if (!editable) return;
    setBusy(true);
    try {
      const printer = await pairPosBluetoothPrinter();
      setSavedPrinter(printer);
      if (!printerName.trim()) setPrinterName(printer.name);
      showSuccess(t(`${printer.name} paired.`, `${printer.name} ተጣምሯል።`));
    } catch (error) {
      if ((error as Error).name === "NotFoundError") {
        showError(t("No Bluetooth printer was selected.", "ምንም የብሉቱዝ አታሚ አልተመረጠም።"));
      } else {
        showError((error as Error).message || t("Bluetooth pairing failed.", "የብሉቱዝ ማጣመር አልተሳካም።"));
      }
    } finally {
      setBusy(false);
    }
  }

  function forgetBluetooth() {
    if (!editable) return;
    clearStoredBluetoothPrinter();
    setSavedPrinter(null);
    showSuccess(t("Bluetooth printer removed.", "የብሉቱዝ አታሚ ተወግዷል።"));
  }

  async function handleTestPrint() {
    setBusy(true);
    setTestMessage(null);
    try {
      persistSettings({
        ...settings,
        networkHost: settings.networkHost?.trim() || DEFAULT_POS_PRINTER_SETTINGS.networkHost,
        networkPort: settings.networkPort || DEFAULT_POS_PRINTER_SETTINGS.networkPort,
        networkAgentUrl: (settings.networkAgentUrl || DEFAULT_POS_PRINTER_SETTINGS.networkAgentUrl || "").replace(
          /\/$/,
          "",
        ),
        gatewayCode: (settings.gatewayCode || DEFAULT_POS_PRINTER_SETTINGS.gatewayCode || "")
          .trim()
          .toUpperCase(),
      });
      const previous = loadPosPrinterVerification();
      const result = await runPosPrinterTestPrint({
        branch,
        requestedBy: actorName,
        printerLabel: printerName.trim() || undefined,
      });
      setVerification(result.verification);
      appendPosPrinterAudit({
        action: "test_print",
        actor: actorName,
        actorRole,
        branch,
        testPrintOk: result.ok,
        previous,
        next: result.verification,
        reason: result.error,
      });
      if (!result.ok) {
        setTestMessage(result.error || t("Test print failed.", "የሙከራ ህትመት አልተሳካም።"));
        showError(result.error || t("Test print failed.", "የሙከራ ህትመት አልተሳካም።"));
        return;
      }
      setTestMessage(t("Test print succeeded.", "የሙከራ ህትመት ተሳክቷል።"));
      showSuccess(t("Test print succeeded.", "የሙከራ ህትመት ተሳክቷል።"));
    } finally {
      setBusy(false);
    }
  }

  function handleSaveAndVerify() {
    setBusy(true);
    try {
      const previous = loadPosPrinterVerification();
      const next = verifyPosPrinterAfterTest(actorName, printerName.trim() || undefined);
      setVerification(next);
      appendPosPrinterAudit({
        action: "verify",
        actor: actorName,
        actorRole,
        branch,
        testPrintOk: true,
        previous,
        next,
      });
      showSuccess(t("Printer verified on this terminal.", "አታሚው በዚህ ተርሚናል ላይ ተረጋግጧል።"));
      onVerified?.(next);
      onVerificationChange?.(next);
    } catch (error) {
      showError((error as Error).message || t("Could not verify printer.", "አታሚን ማረጋገጥ አልተቻለም።"));
    } finally {
      setBusy(false);
    }
  }

  function handleUnlock() {
    if (!canUnlock) {
      showError(
        t(
          "Ask a manager or administrator to unlock printer settings.",
          "የአታሚ ቅንብሮችን ለመክፈት ሥራ አስኪያጅ ወይም አስተዳዳሪ ይጠይቁ።",
        ),
      );
      return;
    }
    const previous = loadPosPrinterVerification();
    const next = clearPosPrinterLockForManager(actorName);
    setVerification(next);
    appendPosPrinterAudit({
      action: "unlock",
      actor: actorName,
      actorRole,
      branch,
      previous,
      next,
    });
    onVerificationChange?.(next);
    showSuccess(t("Printer settings unlocked. Re-test and verify after changes.", "የአታሚ ቅንብሮች ተከፍተዋል። ከለውጥ በኋላ እንደገና ይሞክሩ እና ያረጋግጡ።"));
  }

  if (readOnlySummary && verified) {
    const snap = verification.snapshot;
    return (
      <div className="rounded-lg border border-border bg-card px-3 py-2.5 text-sm">
        <div className="flex items-center justify-between gap-2">
          <div className="min-w-0">
            <div className="text-[11px] uppercase tracking-wide text-muted-foreground">
              {t("Printer", "አታሚ")}
            </div>
            <div className="truncate font-semibold">{snap?.printerLabel || t("Printer", "አታሚ")}</div>
            <div className="text-xs text-muted-foreground">
              {resolvePrinterConnectionLabel(snap?.mode || settings.mode)} · {t("Connected", "ተገናኝቷል")} ·{" "}
              {t("Verified", "ተረጋግጧል")}
            </div>
            <div className="mt-1 text-[11px] text-muted-foreground">
              {t("Printer settings managed by this terminal", "የአታሚ ቅንብሮች በዚህ ተርሚናል ይተዳደራሉ")}
            </div>
          </div>
          {canUnlock ? (
            <button
              type="button"
              onClick={handleUnlock}
              className="h-8 shrink-0 rounded-lg border border-border px-2.5 text-xs font-medium hover:bg-surface-2"
            >
              {t("Unlock", "ክፈት")}
            </button>
          ) : null}
        </div>
      </div>
    );
  }

  return (
    <div
      className={
        forced
          ? "mx-auto flex min-h-[70vh] max-w-2xl flex-col justify-center gap-4 px-1 py-6"
          : "space-y-4"
      }
    >
      {forced ? (
        <div className="rounded-xl border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm">
          <div className="font-semibold text-destructive">
            {t(
              "Printer not configured Complete printer setup before taking orders.",
              "አታሚ አልተዋቀረም ትዕዛዝ ከመውሰድዎ በፊት የአታሚ ቅንብርን ያጠናቅቁ።",
            )}
          </div>
          <p className="mt-1 text-xs text-muted-foreground">
            {t(
              "This terminal must pass a Test Print and be verified once. You will not be asked again until the printer changes.",
              "ይህ ተርሚናል አንድ ጊዜ Test Print ማለፍ እና መረጋገጥ አለበት። አታሚው እስኪቀየር ድረስ እንደገና አይጠየቁም።",
            )}
          </p>
        </div>
      ) : null}

      {verified && verification.locked ? (
        <Card className="space-y-3">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h3 className="font-display text-lg font-semibold">{t("Printer", "አታሚ")}</h3>
              <p className="mt-1 text-sm font-medium">
                {verification.snapshot?.printerLabel || printerName || t("Printer", "አታሚ")}
              </p>
              <p className="text-xs text-muted-foreground">
                {resolvePrinterConnectionLabel(verification.snapshot?.mode || settings.mode)} ·{" "}
                {t("Connected", "ተገናኝቷል")} · {t("Verified", "ተረጋግጧል")}
              </p>
              <p className="mt-2 text-xs text-muted-foreground">
                {t("Printer settings managed by this terminal", "የአታሚ ቅንብሮች በዚህ ተርሚናል ይተዳደራሉ")}
              </p>
            </div>
            <Chip tone="teff">{t("Verified", "ተረጋግጧል")}</Chip>
          </div>
          <div className="flex flex-wrap gap-2">
            {canUnlock ? (
              <button
                type="button"
                onClick={handleUnlock}
                className="h-10 rounded-lg border border-border bg-card px-4 text-sm font-medium hover:bg-surface-2"
              >
                {t("Change printer (manager)", "አታሚ ቀይር (ሥራ አስኪያጅ)")}
              </button>
            ) : isWaiter ? (
              <p className="text-xs text-muted-foreground">
                {t(
                  "Changing the printer requires a manager or administrator on this device.",
                  "አታሚን ለመቀየር በዚህ መሣሪያ ላይ ሥራ አስኪያጅ ወይም አስተዳዳሪ ያስፈልጋል።",
                )}
              </p>
            ) : null}
            {forced ? (
              <button
                type="button"
                onClick={() => onStartTakingOrders?.()}
                className="h-10 rounded-lg bg-ember px-4 text-sm font-semibold text-ember-foreground shadow-[var(--shadow-glow)]"
              >
                {t("Start Taking Orders", "ትዕዛዝ መውሰድ ጀምር")}
              </button>
            ) : null}
          </div>
        </Card>
      ) : (
        <Card className="space-y-5">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h3 className="font-display text-lg font-semibold">
                {t("Printer Setup", "የአታሚ ቅንብር")}
              </h3>
              <p className="mt-1 text-xs text-muted-foreground">
                {t("Status", "ሁኔታ")}: {connectionStatus}
              </p>
            </div>
            <Chip tone={verification.lastTestPrintOk ? "teff" : "muted"}>
              {resolvePrinterConnectionLabel(settings.mode)}
            </Chip>
          </div>

          <label className="block space-y-1 text-sm">
            <span className="text-muted-foreground">{t("Printer name", "የአታሚ ስም")}</span>
            <input
              value={printerName}
              disabled={!editable}
              onChange={(e) => setPrinterName(e.target.value)}
              placeholder="XPrinter XP-Q200"
              className="h-10 w-full rounded-lg border border-border bg-card px-3 text-sm disabled:opacity-60"
            />
          </label>

          <div>
            <div className="mb-2 text-xs text-muted-foreground">
              {t("Connection type", "የግንኙነት አይነት")}
            </div>
            {isWaiter ? (
              <p className="mb-2 text-xs text-muted-foreground">
                {t(
                  "Waiter phones queue tickets to the cashier laptop print gateway. Keep the cashier print agent running.",
                  "የአስተናጋጅ ስልኮች ትኬቶችን ወደ የካሸር ላፕቶፕ print gateway ይሰልፋሉ። የካሸር print agent እንዲሰራ ያድርጉ።",
                )}
              </p>
            ) : null}
            <div className={`grid grid-cols-2 gap-2 ${isWaiter ? "sm:grid-cols-2" : "sm:grid-cols-4"}`}>
              {(
                (isWaiter
                  ? ([
                      ["gateway", t("Cashier print gateway", "የካሸር ህትመት ጌትዌይ")],
                      ["bluetooth", t("Bluetooth", "ብሉቱዝ")],
                    ] as const)
                  : ([
                      ["bluetooth", t("Bluetooth", "ብሉቱዝ")],
                      ["browser", t("USB / Browser", "USB / አሳሽ")],
                      ["network", t("Network", "ኔትወርክ")],
                      ["gateway", t("Cashier print gateway", "የካሸር ህትመት ጌትዌይ")],
                    ] as const)
                )
              ).map(([mode, label]) => (
                <button
                  key={mode}
                  type="button"
                  disabled={!editable}
                  onClick={() => update("mode", mode)}
                  className={`min-h-10 rounded-lg border px-2 py-2 text-sm font-medium disabled:opacity-60 ${
                    settings.mode === mode
                      ? "border-ember bg-ember/10 text-ember"
                      : "border-border bg-card text-muted-foreground hover:bg-surface-2"
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>

          <div>
            <div className="mb-2 text-xs text-muted-foreground">{t("Paper size", "የወረቀት መጠን")}</div>
            <div className="grid grid-cols-2 gap-2">
              {(["58mm", "80mm"] as PaperWidth[]).map((width) => (
                <button
                  key={width}
                  type="button"
                  disabled={!editable}
                  onClick={() => update("paperWidth", width)}
                  className={`h-10 rounded-lg border text-sm font-medium disabled:opacity-60 ${
                    settings.paperWidth === width
                      ? "border-ember bg-ember/10 text-ember"
                      : "border-border bg-card text-muted-foreground hover:bg-surface-2"
                  }`}
                >
                  {width}
                </button>
              ))}
            </div>
          </div>

          {settings.mode === "bluetooth" ? (
            <div className="space-y-3 rounded-lg border border-border bg-surface-2 p-3">
              <div className="text-sm font-medium">{t("Available printer", "ያለ አታሚ")}</div>
              {savedPrinter ? (
                <div className="text-sm">
                  <div className="font-medium">{savedPrinter.name}</div>
                  <div className="font-mono text-[11px] text-muted-foreground">{savedPrinter.id}</div>
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">{t("Not paired", "አልተጣመረም")}</p>
              )}
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  disabled={!editable || busy || !bluetoothPrintingSupported()}
                  onClick={() => void pairBluetooth()}
                  className="inline-flex h-10 items-center gap-2 rounded-lg bg-foreground px-3 text-sm font-semibold text-background disabled:opacity-50"
                >
                  <Icons.Bluetooth className="size-4" />
                  {t("Select / Pair", "ምረጥ / አጣምር")}
                </button>
                <button
                  type="button"
                  disabled={!editable || !savedPrinter || busy}
                  onClick={forgetBluetooth}
                  className="h-10 rounded-lg border border-border px-3 text-sm disabled:opacity-50"
                >
                  {t("Forget", "አስወግድ")}
                </button>
              </div>
            </div>
          ) : null}

          {settings.mode === "network" ? (
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="block space-y-1 text-sm sm:col-span-1">
                <span className="text-muted-foreground">{t("Printer host", "የአታሚ አድራሻ")}</span>
                <input
                  value={settings.networkHost ?? ""}
                  disabled={!editable}
                  onChange={(e) => update("networkHost", e.target.value)}
                  className="h-10 w-full rounded-lg border border-border bg-card px-3 text-sm disabled:opacity-60"
                />
              </label>
              <label className="block space-y-1 text-sm">
                <span className="text-muted-foreground">{t("Port", "ፖርት")}</span>
                <input
                  type="number"
                  value={settings.networkPort ?? 9100}
                  disabled={!editable}
                  onChange={(e) => update("networkPort", Number(e.target.value) || 9100)}
                  className="h-10 w-full rounded-lg border border-border bg-card px-3 text-sm disabled:opacity-60"
                />
              </label>
              <label className="block space-y-1 text-sm sm:col-span-2">
                <span className="text-muted-foreground">{t("Print agent URL", "Print agent URL")}</span>
                <input
                  value={settings.networkAgentUrl ?? ""}
                  disabled={!editable}
                  onChange={(e) => update("networkAgentUrl", e.target.value)}
                  className="h-10 w-full rounded-lg border border-border bg-card px-3 text-sm disabled:opacity-60"
                />
              </label>
              {!canUseNetworkPrintAgent(settings) && !isLocalPosOrigin() ? (
                <p className="text-xs text-destructive sm:col-span-2">
                  {t(
                    "This browser cannot reach a loopback print agent. Use a LAN agent URL or Print Gateway.",
                    "ይህ አሳሽ loopback print agent ማግኘት አይችልም። የ LAN agent URL ወይም Print Gateway ይጠቀሙ።",
                  )}
                </p>
              ) : null}
            </div>
          ) : null}

          {settings.mode === "gateway" ? (
            <label className="block space-y-1 text-sm">
              <span className="text-muted-foreground">{t("Gateway code", "የጌትዌይ ኮድ")}</span>
              <input
                value={settings.gatewayCode ?? ""}
                disabled={!editable}
                onChange={(e) => update("gatewayCode", e.target.value.toUpperCase())}
                placeholder="CASHIER-LAPTOP-01"
                className="h-10 w-full rounded-lg border border-border bg-card px-3 font-mono text-sm disabled:opacity-60"
              />
              <p className="text-xs text-muted-foreground">
                {t(
                  "Must match the cashier laptop print agent code. Test Print queues a ticket for that laptop.",
                  "ከካሸር ላፕቶፕ print agent ኮድ ጋር መመሳሰል አለበት። Test Print ትኬት ወደዚያ ላፕቶፕ ይሰልፋል።",
                )}
              </p>
            </label>
          ) : null}

          {settings.mode === "browser" ? (
            <p className="text-sm text-muted-foreground">
              {t(
                "USB printers use the system print dialog. Run Test Print and choose your receipt printer.",
                "የ USB አታሚዎች የስርዓት ማተሚያ መስኮትን ይጠቀማሉ። Test Print ያሂዱ እና የደረሰኝ አታሚዎን ይምረጡ።",
              )}
            </p>
          ) : null}

          {testMessage ? <p className="text-xs text-muted-foreground">{testMessage}</p> : null}

          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              disabled={busy || !editable}
              onClick={() => void handleTestPrint()}
              className="inline-flex h-10 items-center gap-2 rounded-lg bg-foreground px-4 text-sm font-semibold text-background disabled:opacity-50"
            >
              <Icons.Printer className="size-4" />
              {t("Test Print", "ሙከራ አትም")}
            </button>
            <button
              type="button"
              disabled={busy || !editable || !verification.lastTestPrintOk}
              onClick={handleSaveAndVerify}
              className="inline-flex h-10 items-center gap-2 rounded-lg bg-ember px-4 text-sm font-semibold text-ember-foreground shadow-[var(--shadow-glow)] disabled:opacity-50"
            >
              <Icons.ShieldCheck className="size-4" />
              {t("Save & Verify", "አስቀምጥ እና አረጋግጥ")}
            </button>
          </div>
        </Card>
      )}
    </div>
  );
}
