import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import * as Icons from "lucide-react";
import { Card, Chip, PageHeader } from "@/components/ui-kit";
import { formatETB } from "@/lib/ethiopic";
import { useAuth } from "@/lib/auth-context";
import { menuItemName, useT } from "@/lib/i18n";
import { useLang } from "@/lib/lang-context";
import { useStore } from "@/lib/store";
import { decodeGuestOrderQr, type GuestOrderRequest } from "@/lib/guest-ordering";
import { showError, showSuccess } from "@/lib/toast";
import { assignedWaiterMatches, waiterCannotUseTableReason } from "@/lib/waiter-identity";
import { stillOccupiesTable } from "@/lib/orders-ops";

export const Route = createFileRoute("/app/qr-scanner")({ component: WaiterQrScanner });

type DetectedBarcode = { rawValue: string };
type BarcodeDetectorInstance = {
  detect: (source: HTMLVideoElement) => Promise<DetectedBarcode[]>;
};
type BarcodeDetectorConstructor = new (options?: { formats?: string[] }) => BarcodeDetectorInstance;

function resolveOrderArea(
  request: GuestOrderRequest,
  tables: readonly { label: string; area: string }[],
  tableAreas: readonly string[],
) {
  const requestedArea = request.area.trim();
  const configuredAreas = tableAreas.filter((area) => area !== "All");
  const matchedArea = configuredAreas.find((area) => area.toLowerCase() === requestedArea.toLowerCase());
  const tableArea = tables.find((table) => table.label.toLowerCase() === request.tableNumber.trim().toLowerCase())?.area;
  return matchedArea ?? tableArea ?? requestedArea ?? configuredAreas[0] ?? "Main Hall";
}

function orderQty(request: GuestOrderRequest) {
  return request.items.reduce((sum, line) => sum + line.qty, 0);
}

function lineQty(qty: number, unitLabel?: string) {
  const value = qty.toLocaleString(undefined, { maximumFractionDigits: 3 });
  return unitLabel ? `${value} ${unitLabel}` : `x${value}`;
}

function itemUnitLabel(unitLabel?: string) {
  return unitLabel ? `per ${unitLabel}` : "each";
}

function WaiterQrScanner() {
  const t = useT();
  const lang = useLang();
  const store = useStore();
  const { user } = useAuth();
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const detectorRef = useRef<BarcodeDetectorInstance | null>(null);
  const [scanActive, setScanActive] = useState(false);
  const [manualValue, setManualValue] = useState("");
  const [request, setRequest] = useState<GuestOrderRequest | null>(null);
  const waiterName = user?.name ?? t("Waiter", "አስተናጋጅ");
  const isWaiter = user?.role === "Waiter";
  const pendingRequests = store.guestOrderRequests
    .filter((item) => item.status !== "SENT_TO_CASHIER")
    .filter(
      (item) =>
        !item.waiter ||
        item.waiter === "Unassigned waiter" ||
        item.waiter === waiterName,
    )
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  const assignedToAnother = Boolean(
    request?.waiter &&
      request.waiter !== "Unassigned waiter" &&
      !assignedWaiterMatches(request.waiter, { name: waiterName, email: user?.email }),
  );
  const tableConflict = (() => {
    if (!request) return null;
    const area = resolveOrderArea(request, store.tables, store.tableAreas);
    const table =
      store.tables.find(
        (row) =>
          row.label.trim().toLowerCase() === request.tableNumber.trim().toLowerCase() &&
          row.area.trim().toLowerCase() === area.trim().toLowerCase(),
      ) ??
      store.tables.find(
        (row) => row.label.trim().toLowerCase() === request.tableNumber.trim().toLowerCase(),
      );
    const occupyingOrder =
      store.orders.find(
        (order) =>
          stillOccupiesTable(order) &&
          order.tableNumber.trim().toLowerCase() === request.tableNumber.trim().toLowerCase() &&
          order.area.trim().toLowerCase() === area.trim().toLowerCase(),
      ) ?? null;
    return waiterCannotUseTableReason({
      waiter: waiterName,
      table: table
        ? { area: table.area, label: table.label, server: table.server }
        : { area, label: request.tableNumber, server: undefined },
      occupyingOrder,
    });
  })();
  const alreadySent = request?.status === "SENT_TO_CASHIER";

  useEffect(() => {
    return () => stopCamera();
  }, []);

  function stopCamera() {
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    setScanActive(false);
  }

  function acceptQrPayload(value: string) {
    if (!isWaiter) return;
    const decoded = decodeGuestOrderQr(value);
    if (!decoded) {
      showError(t("This QR is not a valid guest order QR.", "ይህ QR ትክክለኛ የእንግዳ ትዕዛዝ QR አይደለም።"));
      return;
    }

    const existing = store.guestOrderRequests.find((item) => item.id === decoded.id);
    if (existing?.status === "SENT_TO_CASHIER") {
      setRequest(existing);
      showError(t("This QR order was already sent to cashier.", "ይህ QR ትዕዛዝ አስቀድሞ ወደ ካሸሪ ተልኳል።"));
      stopCamera();
      return;
    }

    const imported: GuestOrderRequest = {
      ...decoded,
      waiter:
        decoded.waiter && decoded.waiter !== "Unassigned waiter" ? decoded.waiter : waiterName,
      status: "IMPORTED",
    };
    store.upsertGuestOrderRequest(imported);
    setRequest(imported);
    stopCamera();
  }

  async function startCamera() {
    const Detector = (window as unknown as { BarcodeDetector?: BarcodeDetectorConstructor }).BarcodeDetector;
    if (!Detector) {
      showError(
        t(
          "Camera QR scanning is not supported in this browser. Paste the order QR text below.",
          "የካሜራ QR ማንበቢያ በዚህ አሳሽ አይደገፍም። እባክዎ የትዕዛዙን QR ጽሑፍ ከታች ይለጥፉ።",
        ),
      );
      return;
    }

    try {
      detectorRef.current = new Detector({ formats: ["qr_code"] });
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "environment" },
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }
      setScanActive(true);
      scanLoop();
    } catch {
      showError(
        t(
          "Camera access failed. Allow camera permission or paste the order QR text below.",
          "የካሜራ ፍቃድ አልተሰጠም። እባክዎ ፍቃድ ይፍቀዱ ወይም የትዕዛዙን QR ጽሑፍ ከታች ይለጥፉ።",
        ),
      );
      stopCamera();
    }
  }

  async function scanLoop() {
    if (!videoRef.current || !detectorRef.current) return;

    try {
      const codes = await detectorRef.current.detect(videoRef.current);
      const value = codes[0]?.rawValue;
      if (value) {
        acceptQrPayload(value);
        return;
      }
    } catch {
      showError(t("Could not read the QR from the camera.", "ከካሜራው QR ማንበብ አልተቻለም።"));
      stopCamera();
      return;
    }

    if (streamRef.current) {
      window.setTimeout(scanLoop, 450);
    }
  }

  function importManualQr() {
    if (!isWaiter) return;
    acceptQrPayload(manualValue);
  }

  function openPendingRequest(next: GuestOrderRequest) {
    if (!isWaiter) return;
    const imported: GuestOrderRequest = {
      ...next,
      waiter: next.waiter && next.waiter !== "Unassigned waiter" ? next.waiter : waiterName,
      status: next.status === "QR_GENERATED" ? "IMPORTED" : next.status,
    };
    store.upsertGuestOrderRequest(imported);
    setRequest(imported);
    setManualValue("");
    stopCamera();
  }

  async function createLiveOrderFromQr() {
    if (
      !isWaiter ||
      assignedToAnother ||
      tableConflict ||
      alreadySent ||
      !request ||
      request.items.length === 0
    )
      return;
    const order = store.createOrder({
      area: resolveOrderArea(request, store.tables, store.tableAreas),
      tableNumber: request.tableNumber,
      waiter: waiterName,
      enteredByCashier: waiterName,
      sendToCashier: false,
      items: request.items,
    });

    if (!order) {
      showError(
        tableConflict ||
          t(
            "Could not create the order. If this table has another waiter's open bill, clear it first.",
            "ትዕዛዙን መፍጠር አልተቻለም። ይህ ጠረጴዛ የሌላ አስተናጋጅ ክፍት ሂሳብ ካለው መጀመሪያ ያፅዱ።",
          ),
        );
      return;
    }
    const persist = await store.ensureOrdersPersisted([order.id], { waitForRemoteMs: 900 });
    if (!persist.ok) {
      showError(
        persist.error ||
          t(
            "Order could not be saved. Try again before printing Bono.",
            "ትዕዛዙ ማስቀመጥ አልተቻለም። ቦኖ ከማተምዎ በፊት እንደገና ይሞክሩ።",
          ),
      );
      return;
    }
    store.updateGuestOrderRequestStatus(request.id, "SENT_TO_CASHIER");
    showSuccess(
      `${order.orderNo} ${t("sent to stations for", "ወደ ጣቢያዎች ተልኳል ለ")} ${order.area} ${order.tableNumber}.`,
    );
    setRequest(null);
    setManualValue("");
  }

  if (!isWaiter) {
    return (
      <div className="space-y-5">
        <PageHeader
          title={t("QR Scanner", "QR ማንበቢያ")}
          subtitle={t("Guest QR intake is handled by waiter accounts.", "የእንግዳ QR መቀበያ በአስተናጋጅ መለያዎች ይደረጋል።")}
          action={
            <Link
              to="/app/orders"
              className="h-10 px-4 rounded-lg border border-border bg-card text-sm font-medium inline-flex items-center gap-2 hover:bg-surface-2"
            >
              <Icons.ClipboardList className="size-4" /> {t("Orders", "ትዕዛዞች")}
            </Link>
          }
        />
        <Card>
          <div className="flex items-start gap-3">
            <div className="size-10 rounded-lg bg-gold/20 text-gold-foreground grid place-items-center shrink-0">
              <Icons.Lock className="size-5" />
            </div>
            <div>
              <h2 className="font-display text-lg font-semibold">{t("Waiter-only page", "ለአስተናጋጅ ብቻ የሚገኝ ገጽ")}</h2>
              <p className="text-sm text-muted-foreground mt-1">
                {t(
                  "QR Scanner imports customer QR orders under the logged-in waiter and sends them to cashier approval. Cashiers should use POS and Orders for acceptance, receipt, and payment.",
                  "QR ማንበቢያው የደንበኛ QR ትዕዛዞችን በገባው አስተናጋጅ ስር ያስመጣል እና ወደ ካሸሪ ማረጋገጫ ይልካል። ካሸሪዎች ለመቀበል፣ ለደረሰኝ እና ለክፍያ POS እና ትዕዛዞችን መጠቀም አለባቸው።",
                )}
              </p>
            </div>
          </div>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <PageHeader
        title={t("QR Scanner", "QR ማንበቢያ")}
        subtitle={t("Scan a customer's order QR, review it, then send it to cashier.", "የደንበኛውን QR ይቃኙ፣ ይገምግሙ፣ ከዚያም ወደ ካሸሪ ይላኩ።")}
        action={
          <Link
            to="/app/pos"
            className="h-10 px-4 rounded-lg border border-border bg-card text-sm font-medium inline-flex items-center gap-2 hover:bg-surface-2"
          >
            <Icons.Receipt className="size-4" /> POS
          </Link>
        }
      />

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_420px]">
        <Card className="!p-0 overflow-hidden">
          <div className="p-4 border-b border-border flex items-center justify-between gap-3">
            <div>
              <h2 className="font-display text-lg font-semibold">{t("Camera scanner", "የካሜራ ማንበቢያ")}</h2>
              <p className="text-xs text-muted-foreground">{t("Use the customer's generated order QR.", "የደንበኛውን የተፈጠረ QR ይጠቀሙ።")}</p>
            </div>
            <Chip tone={scanActive ? "ember" : "muted"}>{scanActive ? t("Scanning", "በማንበብ ላይ") : t("Ready", "ዝግጁ")}</Chip>
          </div>

          <div className="p-4 space-y-4">
            <div className="aspect-video rounded-xl overflow-hidden bg-surface-2 border border-border grid place-items-center">
              {scanActive ? (
                <video ref={videoRef} className="size-full object-cover" muted playsInline />
              ) : (
                <div className="text-center text-muted-foreground">
                  <Icons.ScanQrCode className="size-12 mx-auto mb-2" />
                  <div className="text-sm">{t("Camera preview appears here", "የካሜራ ቅድመ እይታ እዚህ ይታያል")}</div>
                </div>
              )}
            </div>

            <div className="flex flex-wrap gap-2">
              <button
                onClick={startCamera}
                disabled={!isWaiter}
                className="h-10 px-4 rounded-lg bg-ember text-ember-foreground text-sm font-semibold inline-flex items-center gap-2"
              >
                <Icons.Camera className="size-4" /> {t("Start scan", "መቃኘት ጀምር")}
              </button>
              <button
                onClick={stopCamera}
                disabled={!scanActive}
                className="h-10 px-4 rounded-lg border border-border bg-card text-sm font-medium hover:bg-surface-2 disabled:opacity-40"
              >
                {t("Stop", "አቁም")}
              </button>
            </div>
          </div>
        </Card>

        <div className="space-y-5">
          <Card>
            <h3 className="font-display font-semibold mb-3">{t("Paste QR text", "QR ጽሑፍ ለጥፍ")}</h3>
            <textarea
              value={manualValue}
              onChange={(event) => setManualValue(event.target.value)}
              placeholder={t("Paste BL_ORDER:... here if camera scanning is not available", "የካሜራ ማንበብ ካልቻለ የBL_ORDER:... ጽሑፉን እዚህ ይለጥፉ")}
              rows={5}
              className="w-full rounded-lg border border-border bg-card px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-ring/40"
            />
            <button
              onClick={importManualQr}
              disabled={!manualValue.trim() || !isWaiter}
              className="mt-3 w-full h-10 rounded-lg bg-foreground text-background text-sm font-semibold disabled:opacity-40"
            >
              {t("Import order QR", "የትዕዛዝ QR አስመጣ")}
            </button>
          </Card>

          <Card>
            <div className="flex items-center justify-between gap-3 mb-3">
              <h3 className="font-display font-semibold">{t("Pending guest QR orders", "ተጠባባቂ የእንግዳ QR ትዕዛዞች")}</h3>
              <Chip tone={pendingRequests.length > 0 ? "gold" : "muted"}>{pendingRequests.length}</Chip>
            </div>

            {pendingRequests.length > 0 ? (
              <div className="space-y-2">
                {pendingRequests.map((item) => (
                  <button
                    key={item.id}
                    onClick={() => openPendingRequest(item)}
                    className="w-full rounded-lg border border-border bg-card px-3 py-3 text-left hover:bg-surface-2 transition-colors"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="font-medium">
                          {item.tableNumber} · {item.area || t("Main Hall", "ዋና አዳራሽ")}
                        </div>
                        <div className="text-xs text-muted-foreground mt-1">
                          {item.items.length} {item.items.length === 1 ? t("item", "ንጥል") : t("items", "ንጥሎች")} · {formatETB(item.total)}
                        </div>
                        <div className="text-[11px] text-muted-foreground mt-1 truncate">
                          {item.waiter || t("Unassigned waiter", "ያልተመደበ አስተናጋጅ")} · {item.status}
                        </div>
                      </div>
                      <Icons.ChevronRight className="size-4 shrink-0 text-muted-foreground" />
                    </div>
                  </button>
                ))}
              </div>
            ) : (
              <div className="rounded-lg border-2 border-dashed border-border p-6 text-center text-sm text-muted-foreground">
                {t("No pending guest QR orders yet.", "እስካሁን ተጠባባቂ የእንግዳ QR ትዕዛዞች የሉም።")}
              </div>
            )}
          </Card>

          <Card>
            <h3 className="font-display font-semibold mb-3">{t("Scanned order", "የተቃኘ ትዕዛዝ")}</h3>
            {request ? (
              <div className="space-y-4">
                <div className="rounded-lg bg-surface-2 p-3 text-sm space-y-2">
                  <div className="flex justify-between gap-3">
                    <span className="text-muted-foreground">{t("Table", "ጠረጴዛ")}</span>
                    <span className="font-semibold">{request.tableNumber}</span>
                  </div>
                  <div className="flex justify-between gap-3">
                    <span className="text-muted-foreground">{t("Area", "አካባቢ")}</span>
                    <span>{request.area}</span>
                  </div>
                  <div className="flex justify-between gap-3">
                    <span className="text-muted-foreground">{t("Assigned waiter", "ተመድቧል አስተናጋጅ")}</span>
                    <span>{request.waiter}</span>
                  </div>
                  <div className="flex justify-between gap-3">
                    <span className="text-muted-foreground">{t("Items", "ንጥሎች")}</span>
                    <span>{orderQty(request)}</span>
                  </div>
                  <div className="flex justify-between gap-3 font-semibold">
                    <span className="text-muted-foreground">{t("Estimated total", "የተገመተ ጠቅላላ")}</span>
                    <span className="font-mono">{formatETB(request.total)}</span>
                  </div>
                </div>

                {assignedToAnother && (
                  <div className="rounded-lg bg-gold/10 text-gold-foreground px-3 py-2 text-xs">
                    {t(
                      `This QR is assigned to ${request.waiter}. Only that waiter can send it to cashier.`,
                      `ይህ QR ለ${request.waiter} ተመድቧል። ያ አስተናጋጅ ብቻ ወደ ካሸሪ መላክ ይችላል።`,
                    )}
                  </div>
                )}

                {tableConflict && !assignedToAnother && (
                  <div className="rounded-lg bg-gold/10 text-gold-foreground px-3 py-2 text-xs">
                    {tableConflict}
                  </div>
                )}

                {alreadySent && (
                  <div className="rounded-lg bg-teff/10 text-teff px-3 py-2 text-xs">
                    {t("This QR order has already been sent to cashier.", "ይህ የQR ትዕዛዝ አስቀድሞ ወደ ካሸሪ ተልኳል።")}
                  </div>
                )}

                <div className="space-y-2">
                  {request.items.map((line) => (
                    <div
                      key={line.item.id}
                      className="flex items-center justify-between gap-3 rounded-lg border border-border bg-card px-3 py-2 text-sm"
                    >
                    <div className="min-w-0">
                        <div className="font-medium truncate">{menuItemName(line.item, lang)}</div>
                        <div className="text-xs text-muted-foreground">
                          {formatETB(line.item.price)} {itemUnitLabel(line.item.unitLabel)}
                        </div>
                      </div>
                      <div className="font-mono font-semibold">{lineQty(line.qty, line.item.unitLabel)}</div>
                    </div>
                  ))}
                </div>

                {request.note && (
                  <div className="rounded-lg border border-border bg-card px-3 py-2 text-sm">
                    <div className="text-xs text-muted-foreground mb-1">{t("Customer note", "የደንበኛ ማስታወሻ")}</div>
                    {request.note}
                  </div>
                )}

                <button
                  onClick={() => void createLiveOrderFromQr()}
                  disabled={assignedToAnother || Boolean(tableConflict) || alreadySent}
                  className="w-full h-11 rounded-lg bg-ember text-ember-foreground text-sm font-semibold shadow-[var(--shadow-glow)] inline-flex items-center justify-center gap-2 disabled:opacity-40 disabled:shadow-none"
                >
                  <Icons.Send className="size-4" /> {t("Create & send to stations", "ፍጠር እና ወደ ጣቢያዎች ላክ")}
                </button>
              </div>
            ) : (
              <div className="rounded-lg border-2 border-dashed border-border p-8 text-center text-sm text-muted-foreground">
                {t("Scan an order QR to review it here.", "ለመገምገም የትዕዛዝ QR እዚህ ይቃኙ።")}
              </div>
            )}
          </Card>
        </div>
      </div>
    </div>
  );
}
