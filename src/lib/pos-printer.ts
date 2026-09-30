import { containsNonAscii, PAPER_DOTS, renderEthiopicLine } from "./esc-pos-raster.ts";
import { loadCachedBranchPrinter, loadCachedBranchPrinters } from "./branch-printers.ts";

export type PrinterMode = "browser" | "bluetooth" | "network" | "gateway";
export type PaperWidth = "58mm" | "80mm";
export type PrinterProfile = "epson" | "xprinter" | "rongta" | "generic";

export interface PosPrinterSettings {
  mode: PrinterMode;
  paperWidth: PaperWidth;
  profile: PrinterProfile;
  /** Device-local network defaults; branch module_records is preferred when present. */
  networkHost?: string;
  networkPort?: number;
  networkAgentUrl?: string;
  /** Cashier laptop gateway code (Supabase print_gateways.code). */
  gatewayCode?: string;
}

export interface StoredBluetoothPrinter {
  id: string;
  name: string;
  savedAt: string;
  serviceUuid?: string;
  characteristicUuid?: string;
}

export const POS_PRINTER_SETTINGS_STORAGE_KEY = "ethio_plate_pos_printer_settings";
export const POS_PRINTER_DEVICE_STORAGE_KEY = "ethio_plate_pos_printer_device";
export const POS_PRINTER_VERIFICATION_STORAGE_KEY = "ethio_plate_pos_printer_verification";
export const POS_PRINTER_TERMINAL_ID_STORAGE_KEY = "ethio_plate_pos_terminal_id";

/** Keys that must survive logout / session clear on a shared POS device. */
export const POS_PRINTER_PERSISTED_STORAGE_KEYS = [
  POS_PRINTER_SETTINGS_STORAGE_KEY,
  POS_PRINTER_DEVICE_STORAGE_KEY,
  POS_PRINTER_VERIFICATION_STORAGE_KEY,
  POS_PRINTER_TERMINAL_ID_STORAGE_KEY,
  "ethio_plate_pos_printer_chunk",
  "ethio_plate_branch_printers_cache",
] as const;

export type PosPrinterVerificationStatus =
  | "unconfigured"
  | "configured"
  | "verified"
  | "unavailable";

export type PosPrinterSnapshot = {
  mode: PrinterMode;
  paperWidth: PaperWidth;
  profile: PrinterProfile;
  printerLabel: string;
  bluetoothDeviceId?: string;
  gatewayCode?: string;
  networkHost?: string;
  networkAgentUrl?: string;
};

export type PosPrinterVerification = {
  status: PosPrinterVerificationStatus;
  locked: boolean;
  verifiedAt?: string;
  verifiedBy?: string;
  snapshot?: PosPrinterSnapshot;
  lastTestPrintAt?: string;
  lastTestPrintOk?: boolean;
  unavailableReason?: string;
  unlockedBy?: string;
  unlockedAt?: string;
};

export const DEFAULT_POS_PRINTER_VERIFICATION: PosPrinterVerification = {
  status: "unconfigured",
  locked: false,
  lastTestPrintOk: false,
};

/** Roles that may unlock a verified terminal printer for reconfiguration. */
export const POS_PRINTER_UNLOCK_ROLES = ["Administrator", "Branch Manager", "Supervisor"] as const;

export type PosPrinterUnlockRole = (typeof POS_PRINTER_UNLOCK_ROLES)[number];

export type PosPrinterStorageSnapshot = Record<string, string | null>;

export function snapshotPosPrinterLocalStorage(): PosPrinterStorageSnapshot {
  if (typeof window === "undefined") return {};
  const snapshot: PosPrinterStorageSnapshot = {};
  for (const key of POS_PRINTER_PERSISTED_STORAGE_KEYS) {
    try {
      snapshot[key] = window.localStorage.getItem(key);
    } catch {
      snapshot[key] = null;
    }
  }
  return snapshot;
}

/** Re-apply printer keys after logout so auth cleanup cannot wipe device printer setup. */
export function restorePosPrinterLocalStorage(snapshot: PosPrinterStorageSnapshot) {
  if (typeof window === "undefined") return;
  for (const key of POS_PRINTER_PERSISTED_STORAGE_KEYS) {
    try {
      const value = snapshot[key];
      if (value == null || value === "") window.localStorage.removeItem(key);
      else window.localStorage.setItem(key, value);
    } catch {
      // ignore quota / private mode
    }
  }
}

export const DEFAULT_POS_PRINTER_SETTINGS: PosPrinterSettings = {
  mode: "browser",
  paperWidth: "80mm",
  profile: "generic",
  networkHost: "192.168.1.50",
  networkPort: 9100,
  networkAgentUrl: "http://127.0.0.1:9101",
  gatewayCode: "CASHIER-LAPTOP-01",
};

export const PRINTER_MODE_LABELS: Record<PrinterMode, string> = {
  browser: "Browser print",
  bluetooth: "Bluetooth ESC/POS",
  network: "Network ESC/POS",
  gateway: "Cashier print gateway",
};

export const PAPER_WIDTH_LABELS: Record<PaperWidth, string> = {
  "58mm": "58mm",
  "80mm": "80mm",
};

export const PRINTER_PROFILE_LABELS: Record<PrinterProfile, string> = {
  epson: "Epson",
  xprinter: "XPrinter",
  rongta: "Rongta",
  generic: "Generic ESC/POS",
};

type BluetoothCharacteristicLike = {
  uuid: string;
  properties: {
    write?: boolean;
    writeWithoutResponse?: boolean;
  };
  writeValue?: (value: BufferSource) => Promise<void>;
  writeValueWithResponse?: (value: BufferSource) => Promise<void>;
  writeValueWithoutResponse?: (value: BufferSource) => Promise<void>;
};

type BluetoothServiceLike = {
  uuid: string;
  getCharacteristics(): Promise<BluetoothCharacteristicLike[]>;
  getCharacteristic(uuid: string): Promise<BluetoothCharacteristicLike>;
};

type BluetoothServerLike = {
  connected: boolean;
  connect(): Promise<BluetoothServerLike>;
  getPrimaryServices(): Promise<BluetoothServiceLike[]>;
  getPrimaryService(uuid: string): Promise<BluetoothServiceLike>;
};

type BluetoothDeviceLike = {
  id: string;
  name?: string;
  gatt?: BluetoothServerLike;
};

type BluetoothApiLike = {
  requestDevice(options: {
    acceptAllDevices: boolean;
    optionalServices: string[];
  }): Promise<BluetoothDeviceLike>;
  getDevices?: () => Promise<BluetoothDeviceLike[]>;
};

const BLUETOOTH_PRINTER_SERVICES = [
  "000018f0-0000-1000-8000-00805f9b34fb",
  "0000ff00-0000-1000-8000-00805f9b34fb",
  "0000ffe0-0000-1000-8000-00805f9b34fb",
  "0000ae30-0000-1000-8000-00805f9b34fb",
  "49535343-fe7d-4ae5-8fa9-9fafd205e455",
  "e7810a71-73ae-499d-8c15-faa9aef0c3f2",
] as const;

/** Same-tab GATT handle — Web Bluetooth cannot restore this from localStorage alone. */
let sessionBluetoothDevice: BluetoothDeviceLike | null = null;

function bluetoothApi() {
  if (typeof navigator === "undefined") return undefined;
  return (navigator as Navigator & { bluetooth?: BluetoothApiLike }).bluetooth;
}

export function bluetoothPrintingSupported() {
  return Boolean(bluetoothApi());
}

function rememberSessionDevice(device: BluetoothDeviceLike) {
  sessionBluetoothDevice = device;
}

function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** A printer that just woke up often refuses the first GATT connection. */
async function connectGatt(gatt: BluetoothServerLike) {
  if (gatt.connected) return gatt;
  let lastError: unknown;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      return await gatt.connect();
    } catch (error) {
      lastError = error;
      await delay(300 * (attempt + 1));
    }
  }
  throw new Error(
    `Could not connect to the printer. Make sure it is switched on and within range. (${
      (lastError as Error | undefined)?.message ?? "connection failed"
    })`,
  );
}

async function writableCharacteristic(device: BluetoothDeviceLike) {
  if (!device.gatt) throw new Error("This Bluetooth device does not expose a GATT printer service.");
  const server = await connectGatt(device.gatt);
  const services = await server.getPrimaryServices();
  for (const service of services) {
    const characteristics = await service.getCharacteristics();
    const characteristic = characteristics.find(
      (row) => row.properties.write || row.properties.writeWithoutResponse,
    );
    if (characteristic) return { service, characteristic };
  }
  throw new Error("No writable ESC/POS Bluetooth characteristic was found.");
}

export async function pairPosBluetoothPrinter(): Promise<StoredBluetoothPrinter> {
  const bluetooth = bluetoothApi();
  if (!bluetooth) {
    throw new Error("Bluetooth printing requires Chrome or Edge over HTTPS.");
  }
  const device = await bluetooth.requestDevice({
    acceptAllDevices: true,
    optionalServices: [...BLUETOOTH_PRINTER_SERVICES],
  });
  const { service, characteristic } = await writableCharacteristic(device);
  rememberSessionDevice(device);
  // A different printer may accept a different write size.
  saveChunkSize(null);
  const printer: StoredBluetoothPrinter = {
    id: device.id,
    name: device.name || "Bluetooth receipt printer",
    savedAt: new Date().toISOString(),
    serviceUuid: service.uuid,
    characteristicUuid: characteristic.uuid,
  };
  saveStoredBluetoothPrinter(printer);
  return printer;
}

async function requestBluetoothDevice() {
  const bluetooth = bluetoothApi();
  if (!bluetooth) {
    throw new Error("Bluetooth printing requires Chrome or Edge over HTTPS.");
  }
  return bluetooth.requestDevice({
    acceptAllDevices: true,
    optionalServices: [...BLUETOOTH_PRINTER_SERVICES],
  });
}

async function savedBluetoothDevice(saved: StoredBluetoothPrinter) {
  if (sessionBluetoothDevice?.id === saved.id) {
    return sessionBluetoothDevice;
  }

  const bluetooth = bluetoothApi();
  if (bluetooth?.getDevices) {
    try {
      const devices = await bluetooth.getDevices();
      const permitted = devices.find((row) => row.id === saved.id);
      if (permitted) {
        rememberSessionDevice(permitted);
        return permitted;
      }
    } catch {
      // Fall through to a fresh picker when getDevices is blocked.
    }
  }

  // getDevices() is missing or empty after reload — re-prompt (needs a user gesture).
  try {
    const device = await requestBluetoothDevice();
    rememberSessionDevice(device);
    if (device.id !== saved.id) {
      const { service, characteristic } = await writableCharacteristic(device);
      saveStoredBluetoothPrinter({
        id: device.id,
        name: device.name || saved.name,
        savedAt: new Date().toISOString(),
        serviceUuid: service.uuid,
        characteristicUuid: characteristic.uuid,
      });
    }
    return device;
  } catch (error) {
    if ((error as Error).name === "NotFoundError") {
      throw new Error("No Bluetooth printer was selected. Pair it again in Printer Settings.");
    }
    if ((error as Error).name === "SecurityError") {
      throw new Error("Printer reconnect needs a fresh pairing. Open Printer Settings and pair again.");
    }
    throw error;
  }
}

async function savedWritableCharacteristic(saved: StoredBluetoothPrinter) {
  const device = await savedBluetoothDevice(saved);
  const current = loadStoredBluetoothPrinter() ?? saved;
  if (!device.gatt) throw new Error("The saved printer has no Bluetooth GATT connection.");
  const server = await connectGatt(device.gatt);
  if (current.serviceUuid && current.characteristicUuid && device.id === current.id) {
    try {
      const service = await server.getPrimaryService(current.serviceUuid);
      return service.getCharacteristic(current.characteristicUuid);
    } catch {
      // Stored UUIDs can go stale after firmware/OS changes — rediscover.
    }
  }
  const discovered = await writableCharacteristic(device);
  saveStoredBluetoothPrinter({
    id: device.id,
    name: device.name || current.name,
    savedAt: current.savedAt,
    serviceUuid: discovered.service.uuid,
    characteristicUuid: discovered.characteristic.uuid,
  });
  return discovered.characteristic;
}

/** Typographic characters the built-in code page can render as plain ASCII. */
const ASCII_FOLDS: ReadonlyArray<readonly [RegExp, string]> = [
  [/[•·]/g, "*"],
  [/[—–]/g, "-"],
  [/[‘’]/g, "'"],
  [/[“”]/g, '"'],
  [/…/g, "..."],
];

function foldToAscii(text: string) {
  return ASCII_FOLDS.reduce((value, [pattern, replacement]) => value.replace(pattern, replacement), text);
}

function asciiBytes(text: string) {
  const normalized = foldToAscii(text)
    .normalize("NFKD")
    .replace(/[^\x09\x0A\x0D\x20-\x7E]/g, "?");
  return new TextEncoder().encode(normalized);
}

export type EscPosPrintOptions = {
  /** Kitchen/Butcher bono: double-height type without bold (saves ink). */
  large?: boolean;
};

function escPosDocument(text: string, options: EscPosPrintOptions = {}) {
  const body = asciiBytes(text.replace(/\r\n/g, "\n").trimEnd());
  // ESC ! n: bit 4 = double height only (no emphasized/bold — saves ribbon/ink).
  const header = options.large
    ? [0x1b, 0x40, 0x1b, 0x61, 0x00, 0x1b, 0x21, 0x10, 0x0a]
    : [0x1b, 0x40, 0x1b, 0x61, 0x00, 0x0a];
  const bytes = new Uint8Array(header.length + body.length + 8);
  let offset = 0;
  bytes.set(header, offset);
  offset += header.length;
  bytes.set(body, offset);
  offset += body.length;
  bytes.set([0x0a, 0x0a, 0x0a, 0x1d, 0x56, 0x00, 0x0a, 0x0a], offset);
  return bytes;
}

async function writeChunk(
  characteristic: BluetoothCharacteristicLike,
  bytes: Uint8Array,
  /** Bitmaps rely on acknowledged writes for flow control instead of pacing delays. */
  preferResponse = false,
) {
  const payload: ArrayBuffer = new Uint8Array(bytes).buffer;
  if (preferResponse && characteristic.writeValueWithResponse) {
    await characteristic.writeValueWithResponse(payload);
    return;
  }
  if (characteristic.properties.writeWithoutResponse && characteristic.writeValueWithoutResponse) {
    await characteristic.writeValueWithoutResponse(payload);
    return;
  }
  if (characteristic.writeValueWithResponse) {
    await characteristic.writeValueWithResponse(payload);
    return;
  }
  if (characteristic.writeValue) {
    await characteristic.writeValue(payload);
    return;
  }
  throw new Error("The printer characteristic cannot receive data.");
}

/** Character cell width of ESC/POS font A at 203 dpi, used to match indents. */
const TEXT_CHAR_DOTS = 12;

/**
 * Pixel heights for rasterised Ethiopic lines. Preferences stay large for the
 * kitchen; table/waiter meta text is a normal body size so the clock still fits.
 */
const RASTER_LINE_SIZES = {
  "80mm": { title: 48, body: 40, meta: 28, preference: 30, minBody: 30 },
  "58mm": { title: 34, body: 28, meta: 22, preference: 24, minBody: 20 },
} as const;

type RasterLineKind = "title" | "body" | "meta" | "preference";

/** Indented `>` / bullet rows are modifiers belonging to the item above. */
const PREFERENCE_LINE = /^\s+[>•*]\s/;
/** Clock pushed to the right of the table row by buildStationBonoText. */
const CLOCK_SUFFIX = /\s+(\d{1,2}:\d{2}\s*[AP]M)\s*$/i;
/** Station headers — match even when space-padding is too short to detect. */
const STATION_TITLE =
  /^(KITCHEN|BUTCHER|VOID|RETURN\b|ኩሽና|ስጋ ቤት|ተሰርዟል|ተመላሽ|ጣቢያ)/u;

function classifyRasterLine(line: string): RasterLineKind {
  if (PREFERENCE_LINE.test(line)) return "preference";
  const trimmed = line.trim();
  // Table/waiter labels should read as meta, not kitchen display type.
  if (CLOCK_SUFFIX.test(line) || /^(TABLE|WAITER|ጠረጴዛ|አስተናጋጅ)[:\s]/u.test(trimmed)) {
    return "meta";
  }
  if (/^\s{2,}\S/.test(line) || STATION_TITLE.test(trimmed)) return "title";
  return "body";
}

function leadingSpaces(line: string) {
  return line.match(/^ */)?.[0].length ?? 0;
}

function splitClockLine(line: string): { left: string; right: string } | null {
  const match = line.match(CLOCK_SUFFIX);
  if (!match || match.index == null) return null;
  return { left: line.slice(0, match.index).trimEnd(), right: match[1] };
}

/**
 * Builds a mixed document: English, numbers and separators stay native ESC/POS
 * text, and only the Ethiopic lines become small cropped bitmaps. This keeps
 * Amharic readable without paying the Bluetooth cost of imaging a whole ticket.
 */
async function escPosHybridDocument(
  text: string,
  settings: PosPrinterSettings,
  options: EscPosPrintOptions,
) {
  const dots = PAPER_DOTS[settings.paperWidth];
  const sizes = RASTER_LINE_SIZES[settings.paperWidth];
  const chunks: Uint8Array[] = [new Uint8Array([0x1b, 0x40, 0x1b, 0x61, 0x00])];
  // ESC ! n: bit 4 = double height only (no emphasized/bold — saves ink).
  // Meta/title/preference bitmaps ignore this; only ASCII body text uses it.
  if (options.large) chunks.push(new Uint8Array([0x1b, 0x21, 0x10]));
  chunks.push(new Uint8Array([0x0a]));

  for (const line of text.replace(/\r\n/g, "\n").trimEnd().split("\n")) {
    if (!containsNonAscii(foldToAscii(line))) {
      // Native text for meta rows should not inherit double-height from the bono.
      if (options.large && (CLOCK_SUFFIX.test(line) || /^(TABLE|WAITER):/i.test(line.trim()))) {
        chunks.push(new Uint8Array([0x1b, 0x21, 0x00]));
        chunks.push(asciiBytes(`${line}\n`));
        chunks.push(new Uint8Array([0x1b, 0x21, 0x10]));
        continue;
      }
      chunks.push(asciiBytes(`${line}\n`));
      continue;
    }
    const kind = classifyRasterLine(line);
    const clock = kind === "meta" ? splitClockLine(line) : null;
    const rendered = await renderEthiopicLine(clock?.left ?? line, {
      size: sizes[kind],
      minSize: kind === "preference" || kind === "meta" ? undefined : sizes.minBody,
      bold: kind === "preference",
      maxWidth: dots,
      indentDots: kind === "title" ? 0 : leadingSpaces(line) * TEXT_CHAR_DOTS,
      align: kind === "title" ? "center" : "left",
      rightText: clock?.right,
    });
    if (!rendered) return null;
    chunks.push(...rendered);
  }

  chunks.push(new Uint8Array([0x0a, 0x0a, 0x0a, 0x1d, 0x56, 0x00, 0x0a, 0x0a]));

  const total = chunks.reduce((sum, chunk) => sum + chunk.length, 0);
  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.length;
  }
  return bytes;
}

async function escPosPayload(
  text: string,
  settings: PosPrinterSettings,
  options: EscPosPrintOptions,
) {
  // Punctuation the code page can fold (e.g. a bullet) must not drag an
  // otherwise-English ticket onto the bitmap path.
  if (!containsNonAscii(foldToAscii(text))) {
    return { bytes: escPosDocument(text, options), raster: false };
  }
  const hybrid = await escPosHybridDocument(text, settings, options);
  if (hybrid) return { bytes: hybrid, raster: true };
  return { bytes: escPosDocument(text, options), raster: false };
}

const SAFE_CHUNK_SIZE = 20;
/** Descending write sizes: the largest one a printer accepts wins. */
const CHUNK_CANDIDATES = [512, 244, 182, 128, 64, SAFE_CHUNK_SIZE] as const;
const CHUNK_SIZE_STORAGE_KEY = "ethio_plate_pos_printer_chunk";

function loadChunkSize() {
  if (typeof window === "undefined") return null;
  const value = Number(window.localStorage.getItem(CHUNK_SIZE_STORAGE_KEY));
  return CHUNK_CANDIDATES.includes(value as (typeof CHUNK_CANDIDATES)[number]) ? value : null;
}

function saveChunkSize(size: number | null) {
  if (typeof window === "undefined") return;
  if (size == null) {
    window.localStorage.removeItem(CHUNK_SIZE_STORAGE_KEY);
    return;
  }
  window.localStorage.setItem(CHUNK_SIZE_STORAGE_KEY, String(size));
}

/**
 * Web Bluetooth reports an oversized write only as "GATT operation failed for
 * unknown reason", so the largest usable size is found with padded ESC @ resets
 * (trailing NULs are ignored by ESC/POS) and then remembered for later jobs.
 */
async function negotiateChunkSize(characteristic: BluetoothCharacteristicLike) {
  const cached = loadChunkSize();
  if (cached) return cached;
  for (const size of CHUNK_CANDIDATES) {
    if (size === SAFE_CHUNK_SIZE) break;
    const probe = new Uint8Array(size);
    probe[0] = 0x1b;
    probe[1] = 0x40;
    try {
      await writeChunk(characteristic, probe, true);
      saveChunkSize(size);
      return size;
    } catch {
      await delay(60);
    }
  }
  saveChunkSize(SAFE_CHUNK_SIZE);
  return SAFE_CHUNK_SIZE;
}

/** Transient GATT failures are common on cheap printers, so each write gets retries. */
async function writeChunkWithRetry(
  characteristic: BluetoothCharacteristicLike,
  bytes: Uint8Array,
  preferResponse: boolean,
) {
  let lastError: unknown;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      await writeChunk(characteristic, bytes, preferResponse);
      return;
    } catch (error) {
      lastError = error;
      await delay(50 * (attempt + 1));
    }
  }
  throw lastError;
}

async function writeDocument(
  characteristic: BluetoothCharacteristicLike,
  bytes: Uint8Array,
  chunkSize: number,
  preferResponse = false,
) {
  for (let offset = 0; offset < bytes.length; offset += chunkSize) {
    const slice = bytes.slice(offset, offset + chunkSize);
    // Acknowledged writes provide the flow control, so no sleep is needed.
    await writeChunkWithRetry(characteristic, slice, preferResponse);
  }
}

function bluetoothWriteError(error: unknown) {
  const name = (error as Error | undefined)?.name;
  if (name === "NetworkError" || name === "NotSupportedError") {
    return new Error(
      "The printer stopped accepting data. Check paper and power, keep it close to this device, then print again.",
    );
  }
  if (name === "InvalidStateError") {
    return new Error("The printer disconnected. Print again to reconnect.");
  }
  return error instanceof Error ? error : new Error("Bluetooth printing failed.");
}

export async function printPosTextBluetooth(text: string, options: EscPosPrintOptions = {}) {
  const settings = loadPosPrinterSettings();
  if (settings.mode !== "bluetooth") return false;
  const saved = loadStoredBluetoothPrinter();
  if (!saved) throw new Error("Pair a Bluetooth printer in Printer Settings first.");
  const characteristic = await savedWritableCharacteristic(saved);
  const { bytes, raster } = await escPosPayload(text, settings, options);

  if (!raster) {
    // Text jobs are small, so the universally supported write size is fast enough.
    try {
      await writeDocument(characteristic, bytes, SAFE_CHUNK_SIZE);
    } catch (error) {
      throw bluetoothWriteError(error);
    }
    return true;
  }

  // Bitmaps are far larger than text: sending them 20 bytes at a time takes
  // tens of seconds, so they use the biggest size the printer accepts.
  const chunkSize = await negotiateChunkSize(characteristic);
  try {
    await writeDocument(characteristic, bytes, chunkSize, true);
  } catch (error) {
    if (chunkSize === SAFE_CHUNK_SIZE) throw bluetoothWriteError(error);
    // The remembered size stopped working; fall back and re-probe next time.
    saveChunkSize(null);
    try {
      await writeChunk(characteristic, new Uint8Array([0x1b, 0x40]), true);
      await writeDocument(characteristic, bytes, SAFE_CHUNK_SIZE, true);
    } catch (retryError) {
      throw bluetoothWriteError(retryError);
    }
  }
  return true;
}

export type NetworkPrintOptions = EscPosPrintOptions & {
  branch?: string;
  host?: string;
  port?: number;
  agentUrl?: string;
};

function resolveNetworkTarget(options: NetworkPrintOptions = {}) {
  const settings = loadPosPrinterSettings();
  const cached =
    (options.branch ? loadCachedBranchPrinter(options.branch) : null) ??
    loadCachedBranchPrinters().find((row) => row.active) ??
    null;
  const host = (options.host || cached?.host || settings.networkHost || "").trim();
  const agentUrl = (options.agentUrl || cached?.agentUrl || settings.networkAgentUrl || "").trim().replace(/\/$/, "");
  const portRaw = options.port ?? cached?.port ?? settings.networkPort ?? 9100;
  const port = Number(portRaw);
  if (!host) throw new Error("Network printer host is not set. Open Printer Settings.");
  if (!agentUrl) throw new Error("Print agent URL is not set. Open Printer Settings.");
  if (!Number.isFinite(port) || port <= 0) throw new Error("Network printer port is invalid.");
  const paperWidth = cached?.paperWidth ?? settings.paperWidth;
  const profile = cached?.profile ?? settings.profile;
  return {
    host,
    port: Math.floor(port),
    agentUrl,
    settings: { ...settings, mode: "network" as const, paperWidth, profile },
  };
}

/** Build ESC/POS bytes (including Ethiopic raster) for network or Bluetooth. */
export async function encodePosEscPosBytes(text: string, options: EscPosPrintOptions = {}) {
  const settings = loadPosPrinterSettings();
  const { bytes } = await escPosPayload(text, settings, options);
  return bytes;
}

/**
 * Sends ESC/POS bytes to a LAN print agent, which opens TCP to the thermal printer.
 * Browsers cannot open port 9100 directly.
 */
export async function printPosTextNetwork(text: string, options: NetworkPrintOptions = {}) {
  const settings = loadPosPrinterSettings();
  if (resolvedPrinterMode(settings) !== "network") return false;
  const target = resolveNetworkTarget(options);
  if (!canUseNetworkPrintAgent({ ...settings, networkAgentUrl: target.agentUrl })) {
    throw new Error(
      "This hosted POS cannot reach a print agent on 127.0.0.1. Use Cashier print gateway, or set Print agent URL to a LAN PC (e.g. http://192.168.1.20:9101).",
    );
  }
  const { bytes } = await escPosPayload(text, target.settings, options);
  const endpoint = `${target.agentUrl}/print`;

  let response: Response;
  try {
    response = await fetch(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/octet-stream",
        "X-Printer-Host": target.host,
        "X-Printer-Port": String(target.port),
      },
      body: bytes,
    });
  } catch {
    throw new Error(
      isLocalPosOrigin()
        ? `Could not reach the print agent at ${target.agentUrl}. Start npm run print-agent on this computer (or the branch print PC).`
        : `Could not reach the print agent at ${target.agentUrl}. Use a LAN agent URL, or switch to Cashier print gateway.`,
    );
  }

  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    throw new Error(detail.trim() || `Print agent returned ${response.status}.`);
  }
  return true;
}

/**
 * Prints via Bluetooth or network when configured.
 * Returns false when mode is browser/gateway so the caller can use window.print or enqueue.
 */
export async function printPosText(text: string, options: NetworkPrintOptions = {}) {
  const settings = loadPosPrinterSettings();
  const mode = resolvedPrinterMode(settings);
  if (mode === "gateway") return false;
  if (mode === "bluetooth") return printPosTextBluetooth(text, options);
  if (mode === "network") return printPosTextNetwork(text, options);
  return false;
}

export function isPrinterMode(value: unknown): value is PrinterMode {
  return value === "browser" || value === "bluetooth" || value === "network" || value === "gateway";
}

export function isPaperWidth(value: unknown): value is PaperWidth {
  return value === "58mm" || value === "80mm";
}

export function isPrinterProfile(value: unknown): value is PrinterProfile {
  return value === "epson" || value === "xprinter" || value === "rongta" || value === "generic";
}

function isPositivePort(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value > 0 && value < 65536;
}

function stripPrinterHost(value: string) {
  return value
    .trim()
    .replace(/^https?:\/\//i, "")
    .replace(/\/.*$/, "")
    .replace(/:\d+$/, "");
}

function normalizeAgentUrl(value: string) {
  const trimmed = value.trim().replace(/\/$/, "");
  try {
    const url = new URL(trimmed.includes("://") ? trimmed : `http://${trimmed}`);
    if (url.hostname === "0.0.0.0") url.hostname = "127.0.0.1";
    return url.origin;
  } catch {
    return DEFAULT_POS_PRINTER_SETTINGS.networkAgentUrl;
  }
}

export function normalizePosPrinterSettings(value: unknown): PosPrinterSettings {
  if (!value || typeof value !== "object") return DEFAULT_POS_PRINTER_SETTINGS;
  const record = value as Partial<PosPrinterSettings>;
  return {
    mode: isPrinterMode(record.mode) ? record.mode : DEFAULT_POS_PRINTER_SETTINGS.mode,
    paperWidth: isPaperWidth(record.paperWidth)
      ? record.paperWidth
      : DEFAULT_POS_PRINTER_SETTINGS.paperWidth,
    profile: isPrinterProfile(record.profile)
      ? record.profile
      : DEFAULT_POS_PRINTER_SETTINGS.profile,
    networkHost:
      typeof record.networkHost === "string" && record.networkHost.trim()
        ? stripPrinterHost(record.networkHost)
        : DEFAULT_POS_PRINTER_SETTINGS.networkHost,
    networkPort: isPositivePort(record.networkPort)
      ? Math.floor(record.networkPort)
      : DEFAULT_POS_PRINTER_SETTINGS.networkPort,
    networkAgentUrl:
      typeof record.networkAgentUrl === "string" && record.networkAgentUrl.trim()
        ? normalizeAgentUrl(record.networkAgentUrl)
        : DEFAULT_POS_PRINTER_SETTINGS.networkAgentUrl,
    gatewayCode:
      typeof record.gatewayCode === "string" && record.gatewayCode.trim()
        ? record.gatewayCode.trim().toUpperCase()
        : DEFAULT_POS_PRINTER_SETTINGS.gatewayCode,
  };
}

export function isLocalPosOrigin() {
  if (typeof window === "undefined") return true;
  const host = window.location.hostname;
  if (host === "localhost" || host === "127.0.0.1" || host === "[::1]") return true;
  if (/^192\.168\.\d{1,3}\.\d{1,3}$/.test(host)) return true;
  if (/^10\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(host)) return true;
  if (/^172\.(1[6-9]|2\d|3[0-1])\.\d{1,3}\.\d{1,3}$/.test(host)) return true;
  return false;
}

function isLoopbackAgentUrl(agentUrl?: string) {
  const value = (agentUrl || "").trim().toLowerCase();
  if (!value) return true;
  return (
    value.includes("127.0.0.1") ||
    value.includes("localhost") ||
    value.includes("[::1]") ||
    value.includes("0.0.0.0")
  );
}

/**
 * Browser and Bluetooth work on hosted HTTPS.
 * Network mode needs a reachable print agent — loopback agents only work on local/LAN POS.
 * Do not silently remap browser/bluetooth to gateway (that made those modes look broken).
 */
export function resolvedPrinterMode(settings: PosPrinterSettings = loadPosPrinterSettings()): PrinterMode {
  return settings.mode;
}

/** True when network ESC/POS can reach its print agent from this browser origin. */
export function canUseNetworkPrintAgent(settings: PosPrinterSettings = loadPosPrinterSettings()) {
  if (isLocalPosOrigin()) return true;
  return !isLoopbackAgentUrl(settings.networkAgentUrl);
}

export function loadPosPrinterSettings() {
  if (typeof window === "undefined") return DEFAULT_POS_PRINTER_SETTINGS;
  try {
    return normalizePosPrinterSettings(
      JSON.parse(window.localStorage.getItem(POS_PRINTER_SETTINGS_STORAGE_KEY) ?? "null"),
    );
  } catch {
    return DEFAULT_POS_PRINTER_SETTINGS;
  }
}

export function savePosPrinterSettings(settings: PosPrinterSettings) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(
    POS_PRINTER_SETTINGS_STORAGE_KEY,
    JSON.stringify(normalizePosPrinterSettings(settings)),
  );
}

/** Keep device-local mode/gateway; only fill empty network fields from shared branch config. */
export function mergeLocalPrinterSettingsWithBranch(
  local: PosPrinterSettings,
  shared: {
    paperWidth?: PaperWidth;
    profile?: PrinterProfile;
    host?: string;
    port?: number;
    agentUrl?: string;
  } | null | undefined,
): PosPrinterSettings {
  if (!shared) return normalizePosPrinterSettings(local);
  const localHost = local.networkHost?.trim() || "";
  const localAgent = local.networkAgentUrl?.trim() || "";
  const defaultHost = DEFAULT_POS_PRINTER_SETTINGS.networkHost || "";
  const defaultAgent = DEFAULT_POS_PRINTER_SETTINGS.networkAgentUrl || "";
  const useSharedHost = !localHost || localHost === defaultHost;
  const useSharedAgent = !localAgent || localAgent === defaultAgent;
  return normalizePosPrinterSettings({
    ...local,
    // Device choice wins — never reset mode/gateway from branch publish data.
    mode: local.mode,
    gatewayCode: local.gatewayCode,
    paperWidth: local.paperWidth || shared.paperWidth || DEFAULT_POS_PRINTER_SETTINGS.paperWidth,
    profile: local.profile || shared.profile || DEFAULT_POS_PRINTER_SETTINGS.profile,
    networkHost: useSharedHost ? shared.host || local.networkHost : local.networkHost,
    networkPort:
      local.networkPort && local.networkPort !== DEFAULT_POS_PRINTER_SETTINGS.networkPort
        ? local.networkPort
        : shared.port || local.networkPort,
    networkAgentUrl: useSharedAgent ? shared.agentUrl || local.networkAgentUrl : local.networkAgentUrl,
  });
}

export function loadStoredBluetoothPrinter(): StoredBluetoothPrinter | null {
  if (typeof window === "undefined") return null;
  try {
    const parsed = JSON.parse(
      window.localStorage.getItem(POS_PRINTER_DEVICE_STORAGE_KEY) ?? "null",
    );
    if (!parsed || typeof parsed !== "object") return null;
    const record = parsed as Partial<StoredBluetoothPrinter>;
    if (!record.id || !record.name || !record.savedAt) return null;
    return {
      id: record.id,
      name: record.name,
      savedAt: record.savedAt,
      serviceUuid: record.serviceUuid,
      characteristicUuid: record.characteristicUuid,
    };
  } catch {
    return null;
  }
}

export function saveStoredBluetoothPrinter(printer: StoredBluetoothPrinter) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(POS_PRINTER_DEVICE_STORAGE_KEY, JSON.stringify(printer));
}

export function clearStoredBluetoothPrinter() {
  sessionBluetoothDevice = null;
  saveChunkSize(null);
  if (typeof window === "undefined") return;
  window.localStorage.removeItem(POS_PRINTER_DEVICE_STORAGE_KEY);
}

function newId(prefix: string) {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return `${prefix}-${crypto.randomUUID()}`;
  }
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

export function getPosTerminalId(): string {
  if (typeof window === "undefined") return "server";
  try {
    const existing = window.localStorage.getItem(POS_PRINTER_TERMINAL_ID_STORAGE_KEY)?.trim();
    if (existing) return existing;
    const id = newId("term");
    window.localStorage.setItem(POS_PRINTER_TERMINAL_ID_STORAGE_KEY, id);
    return id;
  } catch {
    return "local-terminal";
  }
}

function normalizePosPrinterVerification(value: unknown): PosPrinterVerification {
  if (!value || typeof value !== "object") return { ...DEFAULT_POS_PRINTER_VERIFICATION };
  const record = value as Partial<PosPrinterVerification>;
  const status: PosPrinterVerificationStatus =
    record.status === "configured" ||
    record.status === "verified" ||
    record.status === "unavailable" ||
    record.status === "unconfigured"
      ? record.status
      : "unconfigured";
  const snapshot =
    record.snapshot && typeof record.snapshot === "object"
      ? {
          mode: isPrinterMode(record.snapshot.mode) ? record.snapshot.mode : DEFAULT_POS_PRINTER_SETTINGS.mode,
          paperWidth: isPaperWidth(record.snapshot.paperWidth)
            ? record.snapshot.paperWidth
            : DEFAULT_POS_PRINTER_SETTINGS.paperWidth,
          profile: isPrinterProfile(record.snapshot.profile)
            ? record.snapshot.profile
            : DEFAULT_POS_PRINTER_SETTINGS.profile,
          printerLabel:
            typeof record.snapshot.printerLabel === "string" && record.snapshot.printerLabel.trim()
              ? record.snapshot.printerLabel.trim()
              : PRINTER_MODE_LABELS[
                  isPrinterMode(record.snapshot.mode) ? record.snapshot.mode : DEFAULT_POS_PRINTER_SETTINGS.mode
                ],
          bluetoothDeviceId:
            typeof record.snapshot.bluetoothDeviceId === "string"
              ? record.snapshot.bluetoothDeviceId
              : undefined,
          gatewayCode:
            typeof record.snapshot.gatewayCode === "string"
              ? record.snapshot.gatewayCode.trim().toUpperCase()
              : undefined,
          networkHost:
            typeof record.snapshot.networkHost === "string" ? record.snapshot.networkHost : undefined,
          networkAgentUrl:
            typeof record.snapshot.networkAgentUrl === "string"
              ? record.snapshot.networkAgentUrl
              : undefined,
        }
      : undefined;
  return {
    status,
    locked: Boolean(record.locked),
    verifiedAt: typeof record.verifiedAt === "string" ? record.verifiedAt : undefined,
    verifiedBy: typeof record.verifiedBy === "string" ? record.verifiedBy : undefined,
    snapshot,
    lastTestPrintAt: typeof record.lastTestPrintAt === "string" ? record.lastTestPrintAt : undefined,
    lastTestPrintOk: Boolean(record.lastTestPrintOk),
    unavailableReason:
      typeof record.unavailableReason === "string" ? record.unavailableReason : undefined,
    unlockedBy: typeof record.unlockedBy === "string" ? record.unlockedBy : undefined,
    unlockedAt: typeof record.unlockedAt === "string" ? record.unlockedAt : undefined,
  };
}

export function loadPosPrinterVerification(): PosPrinterVerification {
  if (typeof window === "undefined") return { ...DEFAULT_POS_PRINTER_VERIFICATION };
  try {
    return normalizePosPrinterVerification(
      JSON.parse(window.localStorage.getItem(POS_PRINTER_VERIFICATION_STORAGE_KEY) ?? "null"),
    );
  } catch {
    return { ...DEFAULT_POS_PRINTER_VERIFICATION };
  }
}

export function savePosPrinterVerification(verification: PosPrinterVerification) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(
    POS_PRINTER_VERIFICATION_STORAGE_KEY,
    JSON.stringify(normalizePosPrinterVerification(verification)),
  );
}

export function canUnlockPosPrinter(role?: string | null) {
  return Boolean(role && (POS_PRINTER_UNLOCK_ROLES as readonly string[]).includes(role));
}

export function isPosPrinterLockedForRole(role?: string | null) {
  const verification = loadPosPrinterVerification();
  if (!verification.locked) return false;
  if (canUnlockPosPrinter(role)) return false;
  return true;
}

export function buildPosPrinterSnapshot(
  settings: PosPrinterSettings = loadPosPrinterSettings(),
  bluetooth: StoredBluetoothPrinter | null = loadStoredBluetoothPrinter(),
  printerLabel?: string,
): PosPrinterSnapshot {
  const mode = resolvedPrinterMode(settings);
  const label =
    printerLabel?.trim() ||
    bluetooth?.name?.trim() ||
    (mode === "gateway"
      ? settings.gatewayCode?.trim() || "Print gateway"
      : mode === "network"
        ? `${settings.networkHost || "Network"}:${settings.networkPort || 9100}`
        : mode === "bluetooth"
          ? "Bluetooth printer"
          : "Browser / USB printer");
  return {
    mode,
    paperWidth: settings.paperWidth,
    profile: settings.profile,
    printerLabel: label,
    bluetoothDeviceId: bluetooth?.id,
    gatewayCode: settings.gatewayCode?.trim().toUpperCase() || undefined,
    networkHost: settings.networkHost?.trim() || undefined,
    networkAgentUrl: settings.networkAgentUrl?.trim() || undefined,
  };
}

export function posPrinterSnapshotMatches(
  snapshot: PosPrinterSnapshot | undefined,
  settings: PosPrinterSettings = loadPosPrinterSettings(),
  bluetooth: StoredBluetoothPrinter | null = loadStoredBluetoothPrinter(),
): boolean {
  if (!snapshot) return false;
  const current = buildPosPrinterSnapshot(settings, bluetooth, snapshot.printerLabel);
  if (snapshot.mode !== current.mode) return false;
  if (snapshot.mode === "bluetooth") {
    return Boolean(snapshot.bluetoothDeviceId) && snapshot.bluetoothDeviceId === current.bluetoothDeviceId;
  }
  if (snapshot.mode === "gateway") {
    return Boolean(snapshot.gatewayCode) && snapshot.gatewayCode === current.gatewayCode;
  }
  if (snapshot.mode === "network") {
    return (
      Boolean(snapshot.networkHost) &&
      snapshot.networkHost === current.networkHost &&
      (snapshot.networkAgentUrl || "") === (current.networkAgentUrl || "")
    );
  }
  // Browser / USB — mode match is enough; paper/profile changes do not invalidate.
  return true;
}

/** True only when this terminal has a verified printer that still matches saved settings. */
export function isPosPrinterVerifiedForOrdering(
  verification: PosPrinterVerification = loadPosPrinterVerification(),
  settings: PosPrinterSettings = loadPosPrinterSettings(),
  bluetooth: StoredBluetoothPrinter | null = loadStoredBluetoothPrinter(),
): boolean {
  if (verification.status !== "verified" && verification.status !== "unavailable") return false;
  if (verification.status === "unavailable") return false;
  return posPrinterSnapshotMatches(verification.snapshot, settings, bluetooth);
}

export function waiterRequiresPrinterSetup(role?: string | null) {
  if (role !== "Waiter") return false;
  return !isPosPrinterVerifiedForOrdering();
}

export function waiterPrinterSendBlocked(role?: string | null) {
  if (role !== "Waiter") return false;
  const verification = loadPosPrinterVerification();
  if (!isPosPrinterVerifiedForOrdering(verification)) return true;
  return verification.status === "unavailable";
}

export function markPosPrinterUnavailable(reason: string) {
  const current = loadPosPrinterVerification();
  if (current.status !== "verified" && current.status !== "unavailable") return current;
  const next: PosPrinterVerification = {
    ...current,
    status: "unavailable",
    unavailableReason: reason.trim() || "Printer unavailable",
  };
  savePosPrinterVerification(next);
  return next;
}

export function restorePosPrinterVerifiedAfterProbe() {
  const current = loadPosPrinterVerification();
  if (current.status !== "unavailable") return current;
  if (!posPrinterSnapshotMatches(current.snapshot)) return current;
  const next: PosPrinterVerification = {
    ...current,
    status: "verified",
    unavailableReason: undefined,
  };
  savePosPrinterVerification(next);
  return next;
}

export function clearPosPrinterLockForManager(actorName: string) {
  const current = loadPosPrinterVerification();
  const next: PosPrinterVerification = {
    ...current,
    locked: false,
    status: current.status === "verified" || current.status === "unavailable" ? "configured" : current.status,
    lastTestPrintOk: false,
    unlockedBy: actorName.trim() || "Manager",
    unlockedAt: new Date().toISOString(),
    unavailableReason: undefined,
  };
  savePosPrinterVerification(next);
  return next;
}

export function recordPosPrinterTestResult(ok: boolean, printerLabel?: string) {
  const settings = loadPosPrinterSettings();
  const bluetooth = loadStoredBluetoothPrinter();
  const current = loadPosPrinterVerification();
  const snapshot = buildPosPrinterSnapshot(settings, bluetooth, printerLabel || current.snapshot?.printerLabel);
  const next: PosPrinterVerification = {
    ...current,
    status: ok
      ? current.status === "verified" || current.status === "unavailable"
        ? "verified"
        : "configured"
      : current.status === "verified" || current.status === "unavailable"
        ? "unavailable"
        : current.status === "unconfigured"
          ? "configured"
          : current.status,
    lastTestPrintAt: new Date().toISOString(),
    lastTestPrintOk: ok,
    snapshot,
    unavailableReason: ok ? undefined : current.unavailableReason || "Test print failed",
    locked: current.locked || (ok && (current.status === "verified" || current.status === "unavailable")),
  };
  savePosPrinterVerification(next);
  return next;
}

export function verifyPosPrinterAfterTest(actorName: string, printerLabel?: string) {
  const current = loadPosPrinterVerification();
  if (!current.lastTestPrintOk) {
    throw new Error("Run a successful Test Print before verifying the printer.");
  }
  const settings = loadPosPrinterSettings();
  const bluetooth = loadStoredBluetoothPrinter();
  const snapshot = buildPosPrinterSnapshot(settings, bluetooth, printerLabel || current.snapshot?.printerLabel);
  if (snapshot.mode === "bluetooth" && !bluetooth) {
    throw new Error("Pair a Bluetooth printer before verifying.");
  }
  if (snapshot.mode === "gateway" && !snapshot.gatewayCode) {
    throw new Error("Set a gateway code before verifying.");
  }
  if (snapshot.mode === "network") {
    const host = snapshot.networkHost || "";
    const defaultHost = DEFAULT_POS_PRINTER_SETTINGS.networkHost || "";
    if (!host || host === defaultHost) {
      // Allow default host if agent is reachable; still require non-empty host.
      if (!host) throw new Error("Set a network printer host before verifying.");
    }
    if (!canUseNetworkPrintAgent(settings)) {
      throw new Error("Network print agent is not reachable from this browser.");
    }
  }
  const next: PosPrinterVerification = {
    ...current,
    status: "verified",
    locked: true,
    verifiedAt: new Date().toISOString(),
    verifiedBy: actorName.trim() || "Staff",
    snapshot,
    lastTestPrintOk: true,
    unavailableReason: undefined,
  };
  savePosPrinterVerification(next);
  return next;
}

const TEST_RECEIPT_LINES = [
  "----------------------------",
  "      POS PRINTER TEST",
  "----------------------------",
  "PRINTER READY",
  "----------------------------",
];

export function buildPosPrinterTestText(settings: PosPrinterSettings = loadPosPrinterSettings()) {
  const mode = resolvedPrinterMode(settings);
  return [
    ...TEST_RECEIPT_LINES.slice(0, 3),
    `${settings.paperWidth} - ${PRINTER_PROFILE_LABELS[settings.profile]}`,
    mode === "network"
      ? `NET ${settings.networkHost}:${settings.networkPort}`
      : mode === "bluetooth"
        ? "BLUETOOTH"
        : mode === "gateway"
          ? `GATEWAY ${settings.gatewayCode || ""}`
          : "BROWSER / USB",
    `Printed: ${new Date().toLocaleString("en-GB")}`,
    "",
    "1x TEST ITEM          100.00",
    "VAT 15%                15.00",
    "TOTAL                  115.00",
    ...TEST_RECEIPT_LINES.slice(3),
  ].join("\n");
}

/** Opens a browser print dialog for USB / OS printers. Returns true if the window opened. */
export function openBrowserTestReceipt(settings: PosPrinterSettings = loadPosPrinterSettings()) {
  if (typeof window === "undefined") return false;
  const width = settings.paperWidth === "58mm" ? 260 : 360;
  const win = window.open("", "pos-printer-test", `width=${width + 80},height=640`);
  if (!win) throw new Error("The browser blocked the print window.");
  const now = new Date().toLocaleString("en-GB");
  const modeLabel = PRINTER_MODE_LABELS[settings.mode];
  const profileLabel = PRINTER_PROFILE_LABELS[settings.profile];
  win.document.write(`<!doctype html>
<html>
  <head>
    <title>POS Test Receipt</title>
    <style>
      @page { size: ${settings.paperWidth}; margin: 4mm; }
      body { margin: 0; background: #fff; color: #000; font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; }
      .receipt { width: ${width}px; max-width: 100%; margin: 0 auto; padding: 12px; font-size: 12px; line-height: 1.45; }
      .center { text-align: center; }
      .bold { font-weight: 700; }
      .row { display: flex; justify-content: space-between; gap: 12px; }
      .line { border-top: 1px dashed #000; margin: 8px 0; }
    </style>
  </head>
  <body>
    <div class="receipt">
      <div class="center bold">POS PRINTER TEST</div>
      <div class="center">${settings.paperWidth} - ${profileLabel}</div>
      <div class="line"></div>
      <div>Printed: ${now}</div>
      <div>Mode: ${modeLabel}</div>
      <div class="line"></div>
      <div class="row"><span>Test item</span><span>1 x 100.00</span></div>
      <div class="row"><span>VAT 15%</span><span>15.00</span></div>
      <div class="row bold"><span>TOTAL</span><span>115.00</span></div>
      <div class="line"></div>
      <div class="center">Printer settings ready</div>
    </div>
    <script>
      window.onload = () => {
        window.focus();
        window.print();
      };
    </script>
  </body>
</html>`);
  win.document.close();
  return true;
}

export type PosPrinterTestPrintResult = {
  ok: boolean;
  mode: PrinterMode;
  verification: PosPrinterVerification;
  error?: string;
};

/**
 * Runs a mode-specific test print and records the result on this terminal.
 * Gateway verification requires enqueue success; Bluetooth/Network require a successful write;
 * Browser mode succeeds when the OS print dialog opens.
 */
export async function runPosPrinterTestPrint(input?: {
  branch?: string;
  requestedBy?: string;
  printerLabel?: string;
  /** Injected for tests — gateway enqueue. */
  enqueueGatewayTest?: () => Promise<{ ok: boolean; error?: string }>;
  /** Injected for tests — gateway online check. */
  gatewayOnline?: () => Promise<boolean>;
}): Promise<PosPrinterTestPrintResult> {
  const settings = loadPosPrinterSettings();
  const mode = resolvedPrinterMode(settings);
  const label = input?.printerLabel;

  try {
    if (mode === "gateway") {
      const code = settings.gatewayCode?.trim();
      if (!code) throw new Error("Set a gateway code before testing.");
      // Enqueue is the real proof for waiter phones — cashier agent pulls the queue.
      // Soft online hint only; do not hard-fail before attempting the queue.
      let onlineHint = true;
      try {
        onlineHint = input?.gatewayOnline
          ? await input.gatewayOnline()
          : await (async () => {
              const { fetchPrintGatewayByCode, gatewayLooksOnline } = await import("./print-jobs.ts");
              const gateway = await fetchPrintGatewayByCode(code);
              // Missing gateway row is OK on first setup — enqueue still creates the job path.
              if (!gateway) return true;
              return gatewayLooksOnline(gateway);
            })();
      } catch {
        onlineHint = true;
      }
      const queued = input?.enqueueGatewayTest
        ? await input.enqueueGatewayTest()
        : await (async () => {
            const { enqueueTestPrintJob } = await import("./print-jobs.ts");
            return enqueueTestPrintJob({
              requestedBy: input?.requestedBy,
              branch: input?.branch,
              text: buildPosPrinterTestText(settings),
            });
          })();
      if (!queued.ok) {
        throw new Error(
          queued.error ||
            (onlineHint
              ? "Could not queue the test ticket."
              : "Print gateway looks offline and the test ticket could not be queued. Start the cashier print agent, then retry."),
        );
      }
      const verification = recordPosPrinterTestResult(true, label || `Gateway ${code}`);
      return { ok: true, mode, verification };
    }

    if (mode === "bluetooth") {
      if (!bluetoothPrintingSupported()) {
        throw new Error("Bluetooth printing needs Chrome or Edge on HTTPS (or localhost).");
      }
      if (!loadStoredBluetoothPrinter()) {
        throw new Error("Pair a Bluetooth printer first.");
      }
      const handled = await printPosText(buildPosPrinterTestText(settings), { branch: input?.branch });
      if (!handled) throw new Error("Printer did not accept the test job.");
      const verification = recordPosPrinterTestResult(true, label);
      return { ok: true, mode, verification };
    }

    if (mode === "network") {
      if (!canUseNetworkPrintAgent(settings)) {
        throw new Error(
          "Hosted POS cannot use 127.0.0.1 for Network ESC/POS. Set a LAN agent URL, or use Cashier print gateway.",
        );
      }
      const handled = await printPosText(buildPosPrinterTestText(settings), { branch: input?.branch });
      if (!handled) throw new Error("Printer did not accept the test job.");
      const verification = recordPosPrinterTestResult(true, label);
      return { ok: true, mode, verification };
    }

    openBrowserTestReceipt(settings);
    const verification = recordPosPrinterTestResult(true, label);
    return { ok: true, mode, verification };
  } catch (error) {
    const message = (error as Error)?.message || "Test print failed.";
    const verification = recordPosPrinterTestResult(false, label);
    return { ok: false, mode, verification, error: message };
  }
}

export async function probePosPrinterConnection(input?: {
  branch?: string;
}): Promise<{ ok: boolean; reason?: string }> {
  const verification = loadPosPrinterVerification();
  if (!isPosPrinterVerifiedForOrdering(verification) && verification.status !== "unavailable") {
    return { ok: false, reason: "Printer is not verified on this terminal." };
  }
  const settings = loadPosPrinterSettings();
  const mode = resolvedPrinterMode(settings);

  try {
    if (mode === "gateway") {
      const code = settings.gatewayCode?.trim();
      if (!code) return { ok: false, reason: "Gateway code is missing on this terminal." };
      try {
        const { fetchPrintGatewayByCode, gatewayLooksOnline } = await import("./print-jobs.ts");
        const gateway = await fetchPrintGatewayByCode(code);
        // Waiter phones only enqueue — allow send if the gateway row is missing/new.
        if (!gateway) return { ok: true };
        // Wider window: cashier agent heartbeats; brief gaps must not stop ordering.
        if (!gatewayLooksOnline(gateway, 5 * 60_000)) {
          return {
            ok: false,
            reason: "Print gateway is offline. Ask the cashier to start the print agent.",
          };
        }
      } catch {
        // Status check failed — still allow queue; print agent will pick up when online.
        return { ok: true };
      }
      return { ok: true };
    }
    if (mode === "bluetooth") {
      const stored = loadStoredBluetoothPrinter();
      if (!stored) return { ok: false, reason: "Bluetooth printer is no longer paired." };
      if (!bluetoothPrintingSupported()) {
        return { ok: false, reason: "Bluetooth is unavailable in this browser." };
      }
      // Soft probe: ensure we can resolve a GATT device when possible.
      if (sessionBluetoothDevice?.gatt) {
        try {
          await connectGatt(sessionBluetoothDevice.gatt);
          return { ok: true };
        } catch {
          return { ok: false, reason: "Bluetooth printer is disconnected." };
        }
      }
      return { ok: true };
    }
    if (mode === "network") {
      const target = resolveNetworkTarget({ branch: input?.branch });
      try {
        const response = await fetch(`${target.agentUrl}/print`, {
          method: "OPTIONS",
        }).catch(async () => {
          // Some agents may not implement OPTIONS — try a tiny GET to origin.
          return fetch(target.agentUrl, { method: "GET" });
        });
        if (!response.ok && response.status >= 500) {
          return { ok: false, reason: `Print agent returned ${response.status}.` };
        }
        return { ok: true };
      } catch {
        return { ok: false, reason: `Could not reach print agent at ${target.agentUrl}.` };
      }
    }
    // Browser / USB — OS dialog; treat as available once verified.
    return { ok: true };
  } catch (error) {
    return { ok: false, reason: (error as Error)?.message || "Printer unavailable." };
  }
}
