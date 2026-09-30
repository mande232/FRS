import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import * as Icons from "lucide-react";
import { QRCodeSVG } from "qrcode.react";
import { PageHeader, Card, Chip, Stat } from "@/components/ui-kit";
import { RealtimeBadge } from "@/components/realtime-badge";
import type { ProductionStation, Table } from "@/lib/demo-data";
import { formatETB } from "@/lib/ethiopic";
import { formatDateTime } from "@/lib/date-time";
import { menuCategoryName, menuItemGlyph, menuItemName, useT } from "@/lib/i18n";
import { loadSystemSettings } from "@/lib/system-settings";
import { useLang } from "@/lib/lang-context";
import { useStore } from "@/lib/store";
import { isConfiguredStation, stationTone } from "@/lib/stations";

export const Route = createFileRoute("/app/digital-menu")({ component: DigitalMenu });

const BASE_URL = typeof window !== "undefined" ? window.location.origin : "";

function tableTone(status: Table["status"]) {
  if (status === "Available") return "teff";
  if (status === "Occupied" || status === "Bill") return "ember";
  return "muted";
}

function DigitalMenu() {
  const t = useT();
  const lang = useLang();
  const store = useStore();
  const [selectedTableId, setSelectedTableId] = useState(store.tables[0]?.id ?? "");
  const [previewCat, setPreviewCat] = useState("All");
  const [previewStation, setPreviewStation] = useState<"All" | ProductionStation>("All");
  const [tab, setTab] = useState<"tables" | "preview">("tables");
  const [copied, setCopied] = useState<string | null>(null);
  const qrRef = useRef<HTMLDivElement>(null);

  const tables = store.tables;
  const selectedTable = tables.find((table) => table.id === selectedTableId) ?? tables[0];
  const categories = store.menuCategories;
  const menuItems = store.menuItems;
  const stations = store.menuStations;
  const guestRequests = store.guestOrderRequests;
  const datePrefs = loadSystemSettings().calendar;

  const baseUrl = useMemo(() => {
    if (typeof window === "undefined") return BASE_URL;
    return window.location.origin;
  }, []);

  useEffect(() => {
    if (tables.length === 0) {
      if (selectedTableId) setSelectedTableId("");
      return;
    }

    if (!tables.some((table) => table.id === selectedTableId)) {
      setSelectedTableId(tables[0]?.id ?? "");
    }
  }, [selectedTableId, tables]);

  useEffect(() => {
    if (previewCat !== "All" && !categories.includes(previewCat)) {
      setPreviewCat("All");
    }
  }, [categories, previewCat]);

  const menuUrl = selectedTable ? `${baseUrl}/m/${selectedTable.label}` : "";
  const filteredItems = menuItems.filter((item) => {
    const categoryMatch = previewCat === "All" || item.category === previewCat;
    const stationMatch = previewStation === "All" || item.station === previewStation;
    return categoryMatch && stationMatch;
  });

  const areaCount = useMemo(() => new Set(tables.map((table) => table.area)).size, [tables]);
  const stationCounts = useMemo(() => {
    return stations.map((station) => ({
      station,
      count: menuItems.filter((item) => item.station === station).length,
    }));
  }, [menuItems, stations]);
  const sentToWaiterCount = useMemo(
    () => guestRequests.filter((request) => request.status === "SENT_TO_WAITER").length,
    [guestRequests],
  );
  const qrGeneratedCount = useMemo(
    () => guestRequests.filter((request) => request.status === "QR_GENERATED").length,
    [guestRequests],
  );

  async function copyLink(tableLabel: string) {
    const url = `${baseUrl}/m/${tableLabel}`;
    if (!url) return;

    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(url);
    } else {
      const input = document.createElement("input");
      input.value = url;
      document.body.appendChild(input);
      input.select();
      document.execCommand("copy");
      document.body.removeChild(input);
    }

    setCopied(tableLabel);
    setTimeout(() => setCopied(null), 2000);
  }

  async function shareLink() {
    if (!selectedTable || !menuUrl) return;

    if (navigator.share) {
      try {
        await navigator.share({
          title: `${store.restaurantProfile.name} - ${selectedTable.label}`,
          text: t("Open the guest menu for this table.", "የዚህን ጠረጴዛ የእንግዳ ሜኑ ይክፈቱ።"),
          url: menuUrl,
        });
        return;
      } catch {
        // fall back to copy when the share dialog is dismissed or unavailable
      }
    }

    await copyLink(selectedTable.label);
  }

  function printQR() {
    if (!selectedTable) return;
    const svgEl = qrRef.current?.querySelector("svg");
    if (!svgEl) return;
    const svgData = new XMLSerializer().serializeToString(svgEl);
    const html = `<!DOCTYPE html><html><head><title>${t("QR", "QR")} - ${selectedTable.label}</title>
<style>
  body { font-family: Arial, sans-serif; display:flex; flex-direction:column; align-items:center; justify-content:center; min-height:100vh; gap:12px; color:#1a1a1a; }
  h2 { font-size:20px; font-weight:700; margin:0; }
  p  { font-size:12px; color:#555; margin:0; text-align:center; max-width:260px; }
  @media print { @page { margin:0; } }
</style></head><body>
  <h2>${store.restaurantProfile.name}</h2>
  <p>${selectedTable.area} ${selectedTable.label}</p>
  <p>${t("Scan to view the menu. Please give your order to the waiter.", "ሜኑውን ለማየት ይቃኙ። እባክዎ ትዕዛዝዎን ለአስተናጋጁ ይስጡ።")}</p>
  ${svgData}
  <p>${menuUrl}</p>
</body></html>`;
    const win = window.open("", "_blank", "width=400,height=520");
    if (!win) return;
    win.document.write(html);
    win.document.close();
    win.onload = () => { win.print(); win.close(); };
  }

  return (
    <div>
      <PageHeader
        title={t("Digital Menu & QR", "ዲጂታል ሜኑ እና QR")}
        action={
          <div className="flex flex-wrap items-center gap-2">
            <RealtimeBadge status={store.realtimeStatus} lastSyncAt={store.lastRealtimeSyncAt} />
            <Link
              to="/app/menu"
              className="h-10 px-3 rounded-lg border border-border bg-card text-sm hover:bg-surface-2 inline-flex items-center gap-2"
            >
              <Icons.BookOpen className="size-4" /> {t("Menu", "ሜኑ")}
            </Link>
            <Link
              to="/app/tables"
              className="h-10 px-3 rounded-lg border border-border bg-card text-sm hover:bg-surface-2 inline-flex items-center gap-2"
            >
              <Icons.LayoutGrid className="size-4" /> {t("Tables", "ጠረጴዛዎች")}
            </Link>
            {selectedTable && (
              <Link
                to="/m/$table"
                params={{ table: selectedTable.label }}
                target="_blank"
                className="h-10 px-4 rounded-lg bg-ember text-ember-foreground text-sm font-medium inline-flex items-center gap-2"
              >
                <Icons.ExternalLink className="size-4" /> {t("Open Guest View", "የእንግዳ እይታ ክፈት")}
              </Link>
            )}
          </div>
        }
      />

      <div className="grid grid-cols-2 xl:grid-cols-6 gap-3 mb-6">
        <Stat label={t("Menu items", "የሜኑ ንጥሎች")} value={`${menuItems.length}`} icon="BookOpen" />
        <Stat label={t("Tables with QR", "QR ያላቸው ጠረጴዛዎች")} value={`${tables.length}`} icon="QrCode" />
        <Stat label={t("Seating areas", "የመቀመጫ ክልሎች")} value={`${areaCount}`} icon="LayoutGrid" />
        <Stat label={t("QR requests", "የQR ጥያቄዎች")} value={`${qrGeneratedCount}`} tone="gold" icon="ScanQrCode" />
        <Stat label={t("Sent to waiter", "ወደ አስተናጋጅ የተላኩ")} value={`${sentToWaiterCount}`} tone="teff" icon="Send" />
        <Stat label={t("Order entry", "የትዕዛዝ ማስገቢያ")} value={t("Cashier", "ካሸሪ")} icon="Receipt" />
      </div>

      <div className="flex items-center gap-2 mb-5">
        {(["tables", "preview"] as const).map((option) => (
          <button
            key={option}
            onClick={() => setTab(option)}
            className={`h-9 px-4 rounded-full text-sm font-medium transition-colors ${tab === option ? "bg-foreground text-background" : "bg-card border border-border text-muted-foreground hover:text-foreground"}`}
          >
            {option === "tables" ? t("Table QR Codes", "የጠረጴዛ QR ኮዶች") : t("Guest Menu Preview", "የእንግዳ ሜኑ ቅድመ እይታ")}
          </button>
        ))}
      </div>

      {tab === "tables" && selectedTable && (
        <div className="grid lg:grid-cols-[1fr_320px] gap-6">
          <div className="grid sm:grid-cols-2 xl:grid-cols-3 gap-3">
            {tables.map((table) => {
              const url = `${BASE_URL}/m/${table.label}`;
              const active = selectedTable.id === table.id;
              return (
                <button
                  key={table.id}
                  onClick={() => setSelectedTableId(table.id)}
                  className={`surface-card !p-4 text-left transition-all hover:-translate-y-0.5 hover:shadow-[var(--shadow-lift)] ${active ? "ring-2 ring-ember" : ""}`}
                >
                  <div className="flex items-start justify-between gap-2 mb-3">
                    <div>
                      <div className="font-display text-lg font-semibold">{table.label}</div>
                      <div className="text-xs text-muted-foreground">{table.area} - {table.seats} seats</div>
                    </div>
                    <Chip tone={tableTone(table.status)}>{table.status}</Chip>
                  </div>

                  <div className="bg-white rounded-lg p-3 mb-3 flex items-center justify-center">
                    <QRCodeSVG value={url} size={120} level="M" includeMargin={false} />
                  </div>

                  <div className="text-[10px] font-mono text-muted-foreground truncate mb-2">/m/{table.label}</div>

                  <div className="flex gap-1.5" onClick={(event) => event.stopPropagation()}>
                    <button
                      onClick={() => void copyLink(table.label)}
                      className={`flex-1 h-7 rounded-lg border text-xs inline-flex items-center justify-center gap-1 transition-colors ${copied === table.label ? "border-teff/40 bg-teff/10 text-teff" : "border-border hover:bg-surface-2"}`}
                    >
                      {copied === table.label ? <><Icons.Check className="size-3" /> {t("Copied", "ተቀድቷል")}</> : <><Icons.Copy className="size-3" /> {t("Copy", "ቅዳ")}</>}
                    </button>
                    <Link
                      to="/m/$table"
                      params={{ table: table.label }}
                      target="_blank"
                      className="flex-1 h-7 rounded-lg bg-ember/10 text-ember text-xs font-medium inline-flex items-center justify-center gap-1 hover:bg-ember/20 transition-colors"
                    >
                      <Icons.ExternalLink className="size-3" /> {t("Open", "ክፈት")}
                    </Link>
                  </div>
                </button>
              );
            })}
          </div>

          <div className="space-y-4">
            <Card className="!p-5">
              <div className="flex items-center justify-between mb-4">
                <div>
                  <h3 className="font-display font-semibold">{selectedTable.label}</h3>
                  <div className="text-xs text-muted-foreground">{selectedTable.area}</div>
                </div>
                <Chip tone={tableTone(selectedTable.status)}>{selectedTable.status}</Chip>
              </div>

              <div ref={qrRef} className="bg-white rounded-2xl p-5 flex items-center justify-center mb-4">
                <QRCodeSVG value={menuUrl} size={200} level="H" includeMargin={false} fgColor="#1a1a1a" bgColor="#ffffff" />
              </div>

              <div className="text-[11px] font-mono bg-surface-2 rounded-lg px-3 py-2 mb-4 break-all text-muted-foreground">
                {menuUrl}
              </div>

              <div className="grid grid-cols-2 gap-2">
                <button
                  onClick={() => void copyLink(selectedTable.label)}
                  className={`h-10 rounded-lg border text-sm inline-flex items-center justify-center gap-1.5 transition-colors ${copied === selectedTable.label ? "border-teff/40 bg-teff/10 text-teff" : "border-border bg-card hover:bg-surface-2"}`}
                >
                  {copied === selectedTable.label ? <><Icons.Check className="size-4" /> {t("Copied", "ተቀድቷል")}</> : <><Icons.Copy className="size-4" /> {t("Copy link", "ሊንክ ቅዳ")}</>}
                </button>
                <button
                  onClick={printQR}
                  className="h-10 rounded-lg bg-ember text-ember-foreground text-sm font-semibold inline-flex items-center justify-center gap-1.5 hover:opacity-90 transition-opacity"
                >
                  <Icons.Printer className="size-4" /> {t("Print QR", "QR አትም")}
                </button>
              </div>

              <button
                onClick={() => void shareLink()}
                className="mt-2 w-full h-10 rounded-lg border border-border bg-card text-sm inline-flex items-center justify-center gap-1.5 hover:bg-surface-2 transition-colors"
              >
                <Icons.Share2 className="size-4" /> {t("Share or copy link", "ሊንክ አጋራ ወይም ቅዳ")}
              </button>

              <Link
                to="/m/$table"
                params={{ table: selectedTable.label }}
                target="_blank"
                className="mt-2 w-full h-10 rounded-lg border border-border bg-card text-sm inline-flex items-center justify-center gap-1.5 hover:bg-surface-2 transition-colors"
              >
                <Icons.Smartphone className="size-4" /> {t("Preview guest menu", "የእንግዳ ሜኑ ቅድመ እይታ")}
              </Link>
            </Card>

            <Card className="!p-4">
              <h3 className="font-display font-semibold text-sm mb-3">{t("Live guest requests", "የቀጥታ የእንግዳ ጥያቄዎች")}</h3>
              {guestRequests.length === 0 ? (
                <div className="text-sm text-muted-foreground">
                  {t("No guest requests", "የእንግዳ ጥያቄዎች የሉም")}
                </div>
              ) : (
                <div className="space-y-2">
                  {guestRequests.slice(0, 5).map((request) => (
                    <div key={request.id} className="rounded-lg border border-border bg-card px-3 py-2">
                      <div className="flex items-center justify-between gap-3">
                        <div>
                          <div className="text-sm font-medium">
                            {request.tableNumber} · {request.waiter}
                          </div>
                          <div className="text-xs text-muted-foreground">{formatDateTime(request.createdAt, datePrefs)}</div>
                        </div>
                        <Chip tone={request.status === "SENT_TO_WAITER" ? "teff" : "gold"}>
                          {request.status === "SENT_TO_WAITER"
                            ? t("Sent", "ተልኳል")
                            : t("QR ready", "QR ዝግጁ")}
                        </Chip>
                      </div>
                      <div className="mt-2 text-xs text-muted-foreground">
                        {request.items.length} {t("items", "ንጥሎች")} · {formatETB(request.total)}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </Card>
          </div>
        </div>
      )}

      {tab === "tables" && !selectedTable && (
        <Card className="!p-8 text-center text-sm text-muted-foreground">
          {t("No tables", "ጠረጴዛዎች የሉም")}
        </Card>
      )}

      {tab === "preview" && (
        <div className="grid lg:grid-cols-[220px_1fr] gap-6">
          <div className="space-y-4">
            <Card className="!p-4">
              <h3 className="font-display font-semibold text-sm mb-3">{t("Categories", "ምድቦች")}</h3>
              <div className="flex lg:flex-col gap-2 flex-wrap">
                {categories.map((category) => (
                  <button
                    key={category}
                    onClick={() => setPreviewCat(category)}
                    className={`h-9 px-4 rounded-full text-sm font-medium transition-colors ${previewCat === category ? "bg-ember text-ember-foreground" : "bg-card border border-border text-muted-foreground hover:text-foreground"}`}
                  >
                    {menuCategoryName(category, lang)}
                  </button>
                ))}
              </div>
            </Card>

            <Card className="!p-4">
              <h3 className="font-display font-semibold text-sm mb-3">{t("Stations", "ጣቢያዎች")}</h3>
              <div className="flex lg:flex-col gap-2 flex-wrap">
                {(["All", ...stations] as Array<"All" | ProductionStation>).map((station) => (
                  <button
                    key={station}
                    onClick={() => setPreviewStation(station)}
                    className={`h-9 px-3 rounded-lg text-xs font-medium border text-left ${previewStation === station ? "border-foreground bg-foreground text-background" : "border-border bg-card text-muted-foreground hover:text-foreground"}`}
                  >
                    {station}
                  </button>
                ))}
              </div>
            </Card>
          </div>

          <div className="space-y-4">
            <div className="grid sm:grid-cols-2 xl:grid-cols-4 gap-3">
              {stationCounts.map((entry) => (
                <Card key={entry.station} className="!p-4">
                  <div className="text-xs text-muted-foreground">{entry.station}</div>
                  <div className="font-display text-2xl font-semibold mt-1">{entry.count}</div>
                </Card>
              ))}
            </div>

            <div className="grid sm:grid-cols-2 xl:grid-cols-3 gap-3">
              {filteredItems.map((item) => {
                const station = isConfiguredStation(item.station, stations) ? item.station : stations[0] ?? item.station;
                return (
                  <Card key={item.id} className="!p-4">
                    <div className="flex items-start gap-3">
                      {menuItemGlyph(item.emoji, lang) ? (
                        <div className="text-3xl">{menuItemGlyph(item.emoji, lang)}</div>
                      ) : null}
                      <div className="flex-1 min-w-0">
                        <div className="font-display font-semibold text-sm">{menuItemName(item, lang)}</div>
                        <div className="flex items-center justify-between mt-2 gap-2">
                          <span className="font-mono text-sm font-semibold">{formatETB(item.price)}</span>
                          <div className="flex items-center gap-1.5 flex-wrap justify-end">
                            <Chip tone={stationTone(station)}>{station}</Chip>
                            {item.veg && <Chip tone="teff">{t("veg", "ቬግ")}</Chip>}
                          </div>
                        </div>
                      </div>
                    </div>
                  </Card>
                );
              })}
            </div>
            {filteredItems.length === 0 && (
              <div className="rounded-lg border-2 border-dashed border-border p-8 text-center text-sm text-muted-foreground">{t("No menu items match", "የሚዛመዱ የሜኑ ንጥሎች የሉም")}</div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
