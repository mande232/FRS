import assert from "node:assert/strict";
import test from "node:test";

const memory = new Map<string, string>();

function installLocalStorage() {
  memory.clear();
  const storage = {
    getItem(key: string) {
      return memory.has(key) ? memory.get(key)! : null;
    },
    setItem(key: string, value: string) {
      memory.set(key, String(value));
    },
    removeItem(key: string) {
      memory.delete(key);
    },
    clear() {
      memory.clear();
    },
  };
  (globalThis as { window?: unknown; localStorage?: unknown }).window = {
    localStorage: storage,
  };
  (globalThis as { localStorage?: unknown }).localStorage = storage;
}

installLocalStorage();

const {
  DEFAULT_POS_PRINTER_SETTINGS,
  clearPosPrinterLockForManager,
  isPosPrinterVerifiedForOrdering,
  loadPosPrinterVerification,
  markPosPrinterUnavailable,
  recordPosPrinterTestResult,
  savePosPrinterSettings,
  savePosPrinterVerification,
  saveStoredBluetoothPrinter,
  verifyPosPrinterAfterTest,
  waiterPrinterSendBlocked,
  waiterRequiresPrinterSetup,
  POS_PRINTER_VERIFICATION_STORAGE_KEY,
} = await import("./pos-printer.ts");

function resetPrinterState() {
  installLocalStorage();
  savePosPrinterSettings({
    ...DEFAULT_POS_PRINTER_SETTINGS,
    mode: "browser",
  });
  savePosPrinterVerification({
    status: "unconfigured",
    locked: false,
    lastTestPrintOk: false,
  });
}

test("waiterRequiresPrinterSetup blocks waiters until verified", () => {
  resetPrinterState();
  assert.equal(waiterRequiresPrinterSetup("Waiter"), true);
  assert.equal(waiterRequiresPrinterSetup("Cashier"), false);
  assert.equal(waiterPrinterSendBlocked("Waiter"), true);
  assert.equal(waiterPrinterSendBlocked("Cashier"), false);
});

test("verify requires successful test print then locks terminal", () => {
  resetPrinterState();
  savePosPrinterSettings({ ...DEFAULT_POS_PRINTER_SETTINGS, mode: "browser" });
  assert.throws(() => verifyPosPrinterAfterTest("Fasika"), /Test Print/i);

  const afterTest = recordPosPrinterTestResult(true, "XP-Q200");
  assert.equal(afterTest.lastTestPrintOk, true);
  assert.equal(afterTest.status, "configured");

  const verified = verifyPosPrinterAfterTest("Fasika", "XP-Q200");
  assert.equal(verified.status, "verified");
  assert.equal(verified.locked, true);
  assert.equal(verified.verifiedBy, "Fasika");
  assert.equal(verified.snapshot?.printerLabel, "XP-Q200");
  assert.equal(isPosPrinterVerifiedForOrdering(verified), true);
  assert.equal(waiterRequiresPrinterSetup("Waiter"), false);
  assert.equal(waiterPrinterSendBlocked("Waiter"), false);
});

test("snapshot mismatch clears ordering eligibility", () => {
  resetPrinterState();
  savePosPrinterSettings({ ...DEFAULT_POS_PRINTER_SETTINGS, mode: "gateway", gatewayCode: "GATE-A" });
  recordPosPrinterTestResult(true, "Gate A");
  verifyPosPrinterAfterTest("Fasika", "Gate A");
  assert.equal(isPosPrinterVerifiedForOrdering(), true);

  savePosPrinterSettings({ ...DEFAULT_POS_PRINTER_SETTINGS, mode: "gateway", gatewayCode: "GATE-B" });
  assert.equal(isPosPrinterVerifiedForOrdering(), false);
  assert.equal(waiterRequiresPrinterSetup("Waiter"), true);
});

test("bluetooth verification requires paired device id match", () => {
  resetPrinterState();
  savePosPrinterSettings({ ...DEFAULT_POS_PRINTER_SETTINGS, mode: "bluetooth" });
  saveStoredBluetoothPrinter({
    id: "bt-1",
    name: "XPrinter XP-Q200",
    savedAt: new Date().toISOString(),
  });
  recordPosPrinterTestResult(true, "XPrinter XP-Q200");
  const verified = verifyPosPrinterAfterTest("Fasika", "XPrinter XP-Q200");
  assert.equal(verified.snapshot?.bluetoothDeviceId, "bt-1");
  assert.equal(isPosPrinterVerifiedForOrdering(verified), true);

  saveStoredBluetoothPrinter({
    id: "bt-2",
    name: "Other",
    savedAt: new Date().toISOString(),
  });
  assert.equal(isPosPrinterVerifiedForOrdering(), false);
});

test("unavailable blocks send until restored; unlock requires re-verify", () => {
  resetPrinterState();
  savePosPrinterSettings({ ...DEFAULT_POS_PRINTER_SETTINGS, mode: "browser" });
  recordPosPrinterTestResult(true, "Browser");
  verifyPosPrinterAfterTest("Fasika", "Browser");

  const unavailable = markPosPrinterUnavailable("Printer offline");
  assert.equal(unavailable.status, "unavailable");
  assert.equal(isPosPrinterVerifiedForOrdering(unavailable), false);
  assert.equal(waiterPrinterSendBlocked("Waiter"), true);

  const unlocked = clearPosPrinterLockForManager("Branch Manager");
  assert.equal(unlocked.locked, false);
  assert.equal(unlocked.lastTestPrintOk, false);
  assert.equal(unlocked.status, "configured");
  assert.throws(() => verifyPosPrinterAfterTest("Branch Manager"), /Test Print/i);
});

test("verification persists under dedicated storage key", () => {
  resetPrinterState();
  recordPosPrinterTestResult(true, "Persist");
  verifyPosPrinterAfterTest("Fasika", "Persist");
  const raw = memory.get(POS_PRINTER_VERIFICATION_STORAGE_KEY);
  assert.ok(raw);
  const parsed = JSON.parse(raw!);
  assert.equal(parsed.status, "verified");
  assert.equal(loadPosPrinterVerification().status, "verified");
});
