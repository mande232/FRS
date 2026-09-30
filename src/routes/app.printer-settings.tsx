import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState, type FormEvent } from "react";
import * as Icons from "lucide-react";
import { Card, Chip, PageHeader } from "@/components/ui-kit";
import { PosPrinterSetup } from "@/components/pos-printer-setup";
import { useAuth } from "@/lib/auth-context";
import {
  BRANCH_PRINTERS_MODULE_KEY,
  cacheBranchPrinters,
  defaultBranchPrinter,
  findBranchPrinter,
  normalizeBranchPrinter,
  upsertBranchPrinter,
  type BranchPrinterConfig,
} from "@/lib/branch-printers";
import { useT } from "@/lib/i18n";
import { useModuleRecords } from "@/lib/module-records";
import { appendPosPrinterAudit } from "@/lib/pos-printer-audit";
import {
  bluetoothPrintingSupported,
  canUnlockPosPrinter,
  canUseNetworkPrintAgent,
  clearStoredBluetoothPrinter,
  DEFAULT_POS_PRINTER_SETTINGS,
  isLocalPosOrigin,
  isPosPrinterLockedForRole,
  isPosPrinterVerifiedForOrdering,
  loadPosPrinterSettings,
  loadPosPrinterVerification,
  loadStoredBluetoothPrinter,
  mergeLocalPrinterSettingsWithBranch,
  pairPosBluetoothPrinter,
  resolvedPrinterMode,
  runPosPrinterTestPrint,
  savePosPrinterSettings,
  type PaperWidth,
  type PosPrinterSettings,
  type PosPrinterVerification,
  type PrinterMode,
  type PrinterProfile,
  type StoredBluetoothPrinter,
} from "@/lib/pos-printer";
import { showError, showInfo, showSuccess } from "@/lib/toast";

export const Route = createFileRoute("/app/printer-settings")({
  component: PrinterSettings,
});

type TFn = ReturnType<typeof useT>;

function printerModeLabel(mode: PrinterMode, t: TFn) {
  if (mode === "bluetooth") return t("Bluetooth ESC/POS", "ብሉቱዝ ESC/POS");
  if (mode === "network") return t("Network ESC/POS", "ኔትወርክ ESC/POS");
  if (mode === "gateway") return t("Cashier print gateway", "የካሸር ህትመት ጌትዌይ");
  return t("Browser print", "በአሳሽ ማተሚያ");
}

function paperWidthLabel(width: PaperWidth, t: TFn) {
  return width === "58mm" ? t("58mm", "58 ሚሜ") : t("80mm", "80 ሚሜ");
}

function printerProfileLabel(profile: PrinterProfile, t: TFn) {
  if (profile === "epson") return t("Epson", "ኤፕሰን");
  if (profile === "xprinter") return t("XPrinter", "ኤክስፕሪንተር");
  if (profile === "rongta") return t("Rongta", "ሮንግታ");
  return t("Generic ESC/POS", "መደበኛ ESC/POS");
}

function PrinterSettings() {
  const t = useT();
  const auth = useAuth();
  const branch = auth.user?.branch?.trim() || "Main";
  const role = auth.user?.role;
  const isWaiter = role === "Waiter";
  const lockedForUser = isPosPrinterLockedForRole(role);
  const canUnlock = canUnlockPosPrinter(role);
  const { records: branchPrinters, setRecords: setBranchPrinters } = useModuleRecords<BranchPrinterConfig>(
    BRANCH_PRINTERS_MODULE_KEY,
    [],
  );

  const [settings, setSettings] = useState<PosPrinterSettings>(DEFAULT_POS_PRINTER_SETTINGS);
  const [savedPrinter, setSavedPrinter] = useState<StoredBluetoothPrinter | null>(null);
  const [verification, setVerification] = useState<PosPrinterVerification>(() => loadPosPrinterVerification());
  const [saved, setSaved] = useState(false);
  const [ready, setReady] = useState(false);

  const modeLabels = {
    browser: printerModeLabel("browser", t),
    bluetooth: printerModeLabel("bluetooth", t),
    network: printerModeLabel("network", t),
    gateway: t("Cashier print gateway", "የካሸር ህትመት ጌትዌይ"),
  } as const;
  const widthLabels = {
    "58mm": paperWidthLabel("58mm", t),
    "80mm": paperWidthLabel("80mm", t),
  } as const;
  const profileLabels = {
    epson: printerProfileLabel("epson", t),
    xprinter: printerProfileLabel("xprinter", t),
    rongta: printerProfileLabel("rongta", t),
    generic: printerProfileLabel("generic", t),
  } as const;

  const sharedBranchPrinter = useMemo(
    () => findBranchPrinter(branchPrinters, branch),
    [branchPrinters, branch],
  );

  const readOnly = lockedForUser || (isWaiter && isPosPrinterVerifiedForOrdering(verification));

  useEffect(() => {
    cacheBranchPrinters(branchPrinters);
  }, [branchPrinters]);

  useEffect(() => {
    const local = loadPosPrinterSettings();
    const shared = findBranchPrinter(branchPrinters, branch);
    const merged = mergeLocalPrinterSettingsWithBranch(
      local,
      shared
        ? {
            paperWidth: shared.paperWidth,
            profile: shared.profile,
            host: shared.host,
            port: shared.port,
            agentUrl: shared.agentUrl,
          }
        : null,
    );
    setSettings(merged);
    savePosPrinterSettings(merged);
    setSavedPrinter(loadStoredBluetoothPrinter());
    setVerification(loadPosPrinterVerification());
    setReady(true);
  }, [branch, branchPrinters]);

  function update<K extends keyof PosPrinterSettings>(key: K, value: PosPrinterSettings[K]) {
    if (readOnly) return;
    setSettings((current) => {
      const next = { ...current, [key]: value };
      savePosPrinterSettings(next);
      return next;
    });
    setSaved(true);
    window.setTimeout(() => setSaved(false), 1200);
  }

  function save(event: FormEvent) {
    event.preventDefault();
    if (readOnly) {
      showError(
        t(
          "Printer settings are locked on this terminal. Ask a manager to unlock.",
          "የአታሚ ቅንብሮች በዚህ ተርሚናል ተቆልፈዋል። ለመክፈት ሥራ አስኪያጅ ይጠይቁ።",
        ),
      );
      return;
    }
    const next = {
      ...settings,
      networkHost: settings.networkHost?.trim() || DEFAULT_POS_PRINTER_SETTINGS.networkHost,
      networkPort: settings.networkPort || DEFAULT_POS_PRINTER_SETTINGS.networkPort,
      networkAgentUrl: (settings.networkAgentUrl || DEFAULT_POS_PRINTER_SETTINGS.networkAgentUrl || "").replace(/\/$/, ""),
    };
    savePosPrinterSettings(next);
    setSettings(next);
    setSaved(true);
    showSuccess(t("Printer settings saved on this browser.", "የአታሚ ቅንብሮች በዚህ አሳሽ ላይ ተቀምጠዋል።"));
    window.setTimeout(() => setSaved(false), 1800);
  }

  function publishToBranch() {
    if (readOnly) return;
    const next: BranchPrinterConfig = normalizeBranchPrinter(
      {
        ...(sharedBranchPrinter ?? defaultBranchPrinter(branch)),
        branch,
        host: settings.networkHost || "192.168.1.50",
        port: settings.networkPort || 9100,
        agentUrl: settings.networkAgentUrl || "http://127.0.0.1:9101",
        paperWidth: settings.paperWidth,
        profile: settings.profile,
        active: true,
        updatedAtIso: new Date().toISOString(),
        updatedBy: auth.user?.name,
      },
      branch,
    );
    const records = upsertBranchPrinter(branchPrinters, next);
    setBranchPrinters(records);
    cacheBranchPrinters(records);
    savePosPrinterSettings({
      ...settings,
      mode: "network",
      networkHost: next.host,
      networkPort: next.port,
      networkAgentUrl: next.agentUrl,
      paperWidth: next.paperWidth,
      profile: next.profile,
    });
    setSettings((current) => ({
      ...current,
      mode: "network",
      networkHost: next.host,
      networkPort: next.port,
      networkAgentUrl: next.agentUrl,
      paperWidth: next.paperWidth,
      profile: next.profile,
    }));
    showSuccess(
      t(
        `Shared network printer for ${branch}. Other devices: set mode to Network ESC/POS (config syncs automatically).`,
        `ለ${branch} የኔትወርክ አታሚ ተጋርቷል። ሌሎች መሳሪያዎች፡ ሁኔታን Network ESC/POS ያድርጉ (ቅንብሩ በራስ ይመሳሰላል)።`,
      ),
    );
  }

  function reset() {
    if (readOnly) return;
    setSettings(DEFAULT_POS_PRINTER_SETTINGS);
    savePosPrinterSettings(DEFAULT_POS_PRINTER_SETTINGS);
    setSavedPrinter(null);
    clearStoredBluetoothPrinter();
    showSuccess(t("Printer settings reset.", "የአታሚ ቅንብሮች ተመልሰዋል።"));
  }

  async function pairBluetoothPrinter() {
    if (readOnly) return;
    try {
      const printer = await pairPosBluetoothPrinter();
      setSavedPrinter(printer);
      showSuccess(
        t(
          `${printer.name} paired and ready to print.`,
          `${printer.name} ተጣምሯል እና ለማተም ዝግጁ ነው።`,
        ),
      );
    } catch (error) {
      if ((error as Error).name === "NotFoundError") {
        showError(t("No Bluetooth printer was selected.", "ምንም የብሉቱዝ አታሚ አልተመረጠም።"));
        return;
      }
      showError((error as Error).message || t("Bluetooth pairing failed.", "የብሉቱዝ ማጣመር አልተሳካም።"));
    }
  }

  function forgetBluetoothPrinter() {
    if (readOnly) return;
    clearStoredBluetoothPrinter();
    setSavedPrinter(null);
    showSuccess(t("Saved Bluetooth printer removed from this browser.", "የተቀመጠው የብሉቱዝ አታሚ ከዚህ አሳሽ ተወግዷል።"));
  }

  async function testPrint() {
    try {
      const previous = loadPosPrinterVerification();
      const next = {
        ...settings,
        networkHost: settings.networkHost?.trim() || DEFAULT_POS_PRINTER_SETTINGS.networkHost,
        networkPort: settings.networkPort || DEFAULT_POS_PRINTER_SETTINGS.networkPort,
        networkAgentUrl: (settings.networkAgentUrl || DEFAULT_POS_PRINTER_SETTINGS.networkAgentUrl || "").replace(
          /\/$/,
          "",
        ),
        gatewayCode: (settings.gatewayCode || DEFAULT_POS_PRINTER_SETTINGS.gatewayCode || "").trim().toUpperCase(),
      };
      savePosPrinterSettings(next);
      setSettings(next);
      const result = await runPosPrinterTestPrint({
        requestedBy: auth.user?.name,
        branch,
      });
      setVerification(result.verification);
      appendPosPrinterAudit({
        action: "test_print",
        actor: auth.user?.name || "Staff",
        actorRole: role || "Staff",
        branch,
        testPrintOk: result.ok,
        previous,
        next: result.verification,
        reason: result.error,
      });
      if (!result.ok) {
        showError(result.error || t("Test print failed.", "የሙከራ ህትመት አልተሳካም።"));
        return;
      }
      const mode = resolvedPrinterMode(next);
      if (mode === "gateway") {
        showSuccess(
          t(
            "Test ticket queued. The cashier laptop print agent will print it.",
            "የሙከራ ትኬት ተሰልፏል። የካሸር ላፕቶፕ print agent ያትመዋል።",
          ),
        );
        return;
      }
      if (mode === "browser") {
        showInfo(t("Opened browser test receipt.", "የአሳሽ ሙከራ ደረሰኝ ተከፍቷል።"));
        return;
      }
      showSuccess(
        mode === "network"
          ? t("Network test receipt printed.", "የኔትወርክ ሙከራ ደረሰኝ ታትሟል።")
          : t("Bluetooth test receipt printed.", "የብሉቱዝ ሙከራ ደረሰኝ ታትሟል።"),
      );
    } catch (error) {
      showError((error as Error).message || t("Could not open the test receipt.", "የሙከራ ደረሰኝ መክፈት አልተቻለም።"));
    }
  }

  if (isWaiter) {
    return (
      <div className="min-w-0">
        <PageHeader title={t("POS Printer", "POS አታሚ")} />
        <PosPrinterSetup onVerified={(next) => setVerification(next)} />
      </div>
    );
  }

  return (
    <div className="min-w-0">
      <PageHeader
        title={t("POS Printer", "POS አታሚ")}
        action={
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => void testPrint()}
              className="h-10 px-4 rounded-lg bg-foreground text-background text-sm font-semibold inline-flex items-center gap-2"
            >
              <Icons.Printer className="size-4" /> {t("Test print", "ሙከራ አትም")}
            </button>
          </div>
        }
      />

      {verification.locked && isPosPrinterVerifiedForOrdering(verification) ? (
        <div className="mb-4">
          <PosPrinterSetup
            readOnlySummary
            onVerified={(next) => setVerification(next)}
            onVerificationChange={(next) => setVerification(next)}
          />
        </div>
      ) : null}

      {readOnly && !canUnlock ? (
        <div className="mb-4 rounded-lg border border-gold/30 bg-gold/10 px-3 py-2 text-sm">
          {t(
            "Printer settings managed by this terminal. Ask a manager to unlock before changing the printer.",
            "የአታሚ ቅንብሮች በዚህ ተርሚናል ይተዳደራሉ። አታሚውን ከመቀየርዎ በፊት ሥራ አስኪያጅ እንዲከፍት ይጠይቁ።",
          )}
        </div>
      ) : null}

      <div className="grid xl:grid-cols-[minmax(0,1fr)_360px] gap-6 items-start">
        <form onSubmit={save} className="min-w-0 space-y-6">
          <Card className="min-w-0 overflow-hidden">
            <div className="flex items-start justify-between gap-3 mb-4">
              <div>
                <h3 className="font-display text-lg font-semibold">{t("Receipt printer setup", "የደረሰኝ አታሚ ቅንብር")}</h3>
                <p className="text-xs text-muted-foreground mt-1">
                  {t("Branch", "ቅርንጫፍ")}: {branch}
                </p>
              </div>
              {saved && <Chip tone="teff">{t("Saved", "ተቀምጧል")}</Chip>}
            </div>

            {!isLocalPosOrigin() ? (
              <div className="mb-4 rounded-lg border border-gold/30 bg-gold/10 px-3 py-2 text-sm">
                {t(
                  "Hosted POS: Browser print and Bluetooth work here. Network ESC/POS needs a LAN print-agent URL (not 127.0.0.1), or use Cashier print gateway with the agent on the cashier laptop.",
                  "ተስተናገደ POS፡ Browser print እና Bluetooth እዚህ ይሰራሉ። Network ESC/POS የ LAN print-agent URL ይፈልጋል (127.0.0.1 አይደለም)፣ ወይም በካሸር ላፕቶፕ ላይ Cashier print gateway + agent ይጠቀሙ።",
                )}
              </div>
            ) : null}

            <fieldset disabled={readOnly} className="space-y-5 disabled:opacity-70">
              <PrinterSegment label={t("Printer mode", "የአታሚ ሁኔታ")} value={settings.mode} options={modeLabels} onChange={(value) => update("mode", value as PrinterMode)} />
              <PrinterSegment label={t("Paper width", "የወረቀት ስፋት")} value={settings.paperWidth} options={widthLabels} onChange={(value) => update("paperWidth", value as PaperWidth)} />
              <PrinterSegment label={t("Printer profile", "የአታሚ ፕሮፋይል")} value={settings.profile} options={profileLabels} onChange={(value) => update("profile", value as PrinterProfile)} />
              {settings.mode === "gateway" && (
                <label className="text-sm space-y-1 block">
                  <span className="text-muted-foreground">{t("Gateway code", "የጌትዌይ ኮድ")}</span>
                  <input
                    value={settings.gatewayCode ?? "CASHIER-LAPTOP-01"}
                    onChange={(e) => update("gatewayCode", e.target.value.toUpperCase())}
                    placeholder="CASHIER-LAPTOP-01"
                    className="w-full h-10 rounded-lg border border-border bg-card px-3 text-sm font-mono"
                  />
                </label>
              )}
            </fieldset>

            <div className="mt-6 flex flex-wrap justify-end gap-2">
              <button
                type="button"
                onClick={reset}
                disabled={readOnly}
                className="h-10 px-4 rounded-lg border border-border bg-card text-sm font-medium hover:bg-surface-2 disabled:opacity-50"
              >
                {t("Reset", "ዳግም አስጀምር")}
              </button>
              <button
                type="submit"
                disabled={!ready || readOnly}
                className="h-10 px-4 rounded-lg bg-ember text-ember-foreground text-sm font-semibold inline-flex items-center gap-2 shadow-[var(--shadow-glow)] disabled:opacity-50"
              >
                <Icons.Save className="size-4" /> {t("Save settings", "ቅንብሮችን አስቀምጥ")}
              </button>
            </div>
          </Card>

          {settings.mode === "browser" ? (
            <Card className="min-w-0 overflow-hidden">
              <h3 className="font-display text-lg font-semibold mb-2">{t("Browser print", "በአሳሽ ማተሚያ")}</h3>
              <p className="text-sm text-muted-foreground">
                {t(
                  "Use Test print to open a sample receipt, then confirm in the browser print dialog.",
                  "የሙከራ ደረሰኝ ለመክፈት Test print ይጫኑ፣ ከዚያ በአሳሹ ማተሚያ መስኮት ያረጋግጡ።",
                )}
              </p>
            </Card>
          ) : null}

          {settings.mode === "network" ? (
            <Card className="min-w-0 overflow-hidden">
              <h3 className="font-display text-lg font-semibold mb-4">{t("Network ESC/POS", "ኔትወርክ ESC/POS")}</h3>
              <fieldset disabled={readOnly} className="grid sm:grid-cols-2 gap-3 disabled:opacity-70">
                <label className="text-sm space-y-1">
                  <span className="text-muted-foreground">{t("Printer host (IP)", "የአታሚ አድራሻ (IP)")}</span>
                  <input
                    value={settings.networkHost ?? ""}
                    onChange={(e) => update("networkHost", e.target.value)}
                    className="w-full h-10 rounded-lg border border-border bg-card px-3 text-sm"
                  />
                </label>
                <label className="text-sm space-y-1">
                  <span className="text-muted-foreground">{t("Printer port", "የአታሚ ፖርት")}</span>
                  <input
                    type="number"
                    min={1}
                    max={65535}
                    value={settings.networkPort ?? 9100}
                    onChange={(e) => update("networkPort", Number(e.target.value) || 9100)}
                    className="w-full h-10 rounded-lg border border-border bg-card px-3 text-sm"
                  />
                </label>
                <label className="text-sm space-y-1 sm:col-span-2">
                  <span className="text-muted-foreground">{t("Print agent URL", "የ print agent አድራሻ")}</span>
                  <input
                    value={settings.networkAgentUrl ?? ""}
                    onChange={(e) => update("networkAgentUrl", e.target.value)}
                    className="w-full h-10 rounded-lg border border-border bg-card px-3 text-sm"
                  />
                </label>
              </fieldset>
              {!canUseNetworkPrintAgent(settings) ? (
                <div className="mt-3 rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive">
                  {t(
                    "This browser cannot reach 127.0.0.1. Point Print agent URL at a LAN PC running npm run print-agent, or switch to Cashier print gateway.",
                    "ይህ አሳሽ 127.0.0.1ን ማግኘት አይችልም። Print agent URLን ወደ npm run print-agent የሚያሄድ LAN PC ያቀናብሩ፣ ወይም Cashier print gateway ይምረጡ።",
                  )}
                </div>
              ) : null}
              <div className="mt-4 flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={publishToBranch}
                  disabled={readOnly}
                  className="h-10 px-4 rounded-lg bg-foreground text-background text-sm font-semibold inline-flex items-center gap-2 disabled:opacity-50"
                >
                  <Icons.Share2 className="size-4" /> {t("Publish to branch", "ለቅርንጫፍ አጋራ")}
                </button>
                {sharedBranchPrinter && (
                  <Chip tone="teff">
                    {t("Shared", "ተጋርቷል")}: {sharedBranchPrinter.host}:{sharedBranchPrinter.port}
                  </Chip>
                )}
              </div>
            </Card>
          ) : null}

          {settings.mode === "bluetooth" ? (
            <Card className="min-w-0 overflow-hidden">
              <h3 className="font-display text-lg font-semibold mb-4">{t("Bluetooth printer", "የብሉቱዝ አታሚ")}</h3>
              <div className="rounded-lg border border-border bg-surface-2 p-4">
                {savedPrinter ? (
                  <div className="font-medium truncate">{savedPrinter.name}</div>
                ) : (
                  <div className="text-sm text-muted-foreground">{t("Not paired", "አልተጣመረም")}</div>
                )}
              </div>
              <div className="mt-4 flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={pairBluetoothPrinter}
                  disabled={readOnly || !bluetoothPrintingSupported()}
                  className="h-10 px-4 rounded-lg bg-foreground text-background text-sm font-semibold inline-flex items-center gap-2 disabled:opacity-50"
                >
                  <Icons.Bluetooth className="size-4" /> {t("Pair printer", "አታሚ አጣምር")}
                </button>
                <button
                  type="button"
                  onClick={forgetBluetoothPrinter}
                  disabled={readOnly || !savedPrinter}
                  className="h-10 px-4 rounded-lg border border-border bg-card text-sm font-medium inline-flex items-center gap-2 hover:bg-surface-2 disabled:opacity-50"
                >
                  <Icons.Unlink className="size-4" /> {t("Forget", "አስወግድ")}
                </button>
              </div>
            </Card>
          ) : null}
        </form>

        <aside className="min-w-0 space-y-4">
          <Card className="min-w-0 overflow-hidden">
            <h3 className="font-display font-semibold mb-3">{t("Active setup", "ንቁ ቅንብር")}</h3>
            <ul className="space-y-2 text-sm">
              <SettingLine label={t("Mode", "ሁኔታ")} value={modeLabels[settings.mode]} />
              <SettingLine label={t("Paper", "ወረቀት")} value={widthLabels[settings.paperWidth]} />
              <SettingLine label={t("Profile", "ፕሮፋይል")} value={profileLabels[settings.profile]} />
              <SettingLine
                label={t("Network", "ኔትወርክ")}
                value={
                  settings.networkHost
                    ? `${settings.networkHost}:${settings.networkPort ?? 9100}`
                    : t("Not set", "አልተቀመጠም")
                }
              />
              <SettingLine label={t("Agent", "Agent")} value={settings.networkAgentUrl ?? "—"} />
              <SettingLine label={t("Bluetooth", "ብሉቱዝ")} value={savedPrinter?.name ?? t("Not paired", "አልተጣመረም")} />
              <SettingLine
                label={t("Gateway", "ጌትዌይ")}
                value={settings.gatewayCode?.trim() || DEFAULT_POS_PRINTER_SETTINGS.gatewayCode || "—"}
              />
              <SettingLine
                label={t("Status", "ሁኔታ")}
                value={
                  verification.status === "verified"
                    ? t("Verified", "ተረጋግጧል")
                    : verification.status === "unavailable"
                      ? t("Unavailable", "አይገኝም")
                      : t("Not verified", "አልተረጋገጠም")
                }
              />
            </ul>
          </Card>
        </aside>
      </div>
    </div>
  );
}

function PrinterSegment<T extends string>({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: T;
  options: Record<T, string>;
  onChange: (value: T) => void;
}) {
  const keys = Object.keys(options) as T[];
  const cols =
    keys.length >= 4 ? "sm:grid-cols-2 lg:grid-cols-4" : keys.length >= 3 ? "sm:grid-cols-3" : "sm:grid-cols-2";
  return (
    <div>
      <div className="text-xs text-muted-foreground mb-2">{label}</div>
      <div className={`grid grid-cols-1 ${cols} gap-2`}>
        {(Object.entries(options) as [T, string][]).map(([key, text]) => (
          <button
            key={key}
            type="button"
            onClick={() => onChange(key)}
            className={`min-h-10 rounded-lg border px-3 py-2 text-sm font-medium transition-colors ${
              value === key
                ? "border-ember bg-ember/10 text-ember"
                : "border-border bg-card text-muted-foreground hover:bg-surface-2 hover:text-foreground"
            }`}
          >
            {text}
          </button>
        ))}
      </div>
    </div>
  );
}

function SettingLine({ label, value }: { label: string; value: string }) {
  return (
    <li className="flex justify-between gap-3 py-2 border-b border-border last:border-0 min-w-0">
      <span className="text-muted-foreground truncate">{label}</span>
      <span className="font-medium text-right shrink-0 truncate max-w-[180px]">{value}</span>
    </li>
  );
}
