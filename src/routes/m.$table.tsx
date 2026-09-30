import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import * as Icons from "lucide-react";
import { QRCodeSVG } from "qrcode.react";
import { BRAND_NAME, loadRestaurantProfile } from "@/lib/brand";
import { MENU, type MenuItem } from "@/lib/demo-data";
import { formatETB, vatBreakdown } from "@/lib/ethiopic";
import { menuCategoryName, menuItemGlyph, menuItemName } from "@/lib/i18n";
import { useLang, useSetLang } from "@/lib/lang-context";
import {
  encodeGuestOrderQr,
  findStoredTable,
  loadStoredMenuItems,
  upsertGuestOrderRequest,
  type GuestOrderRequest,
} from "@/lib/guest-ordering";
import { loadProductionStations, resolveProductionStation } from "@/lib/stations";
import {
  loadBackendRestaurantProfile,
  loadGuestOrderingSnapshot,
} from "@/lib/supabase/pos-backend";
import { isSupabaseConfigured } from "@/lib/supabase/client";

export const Route = createFileRoute("/m/$table")({
  head: () => ({
    meta: [
      { title: `${BRAND_NAME} - Menu` },
      {
        name: "description",
        content: `Browse the ${BRAND_NAME} menu and share your request with the waiter.`,
      },
      { name: "viewport", content: "width=device-width, initial-scale=1, maximum-scale=1" },
    ],
  }),
  component: GuestMenu,
});

interface Line {
  item: MenuItem;
  qty: number;
}

type Screen = "menu" | "request" | "orderQr" | "confirmed";

function stationForItem(item: MenuItem, stations: readonly string[]) {
  return resolveProductionStation(item, stations);
}

function isButcherStationName(station: string) {
  const key = station.toLowerCase();
  return key.includes("butcher") || key.includes("meat") || key.includes("grill");
}

function isKiloPricedItem(item: MenuItem, stations: readonly string[]) {
  return item.pricingMode === "kg" || isButcherStationName(stationForItem(item, stations));
}

function itemQtyStep(item: MenuItem, stations: readonly string[]) {
  if (!isKiloPricedItem(item, stations)) return 1;
  return Number.isFinite(item.qtyStep ?? NaN) && (item.qtyStep ?? 0) > 0
    ? (item.qtyStep ?? 0.25)
    : 0.25;
}

function itemDefaultQty(item: MenuItem, stations: readonly string[]) {
  if (!isKiloPricedItem(item, stations)) return 1;
  return Number.isFinite(item.defaultQty ?? NaN) && (item.defaultQty ?? 0) > 0
    ? (item.defaultQty ?? 1)
    : 1;
}

function normalizeQty(value: number) {
  return Math.round(value * 1000) / 1000;
}

function formatLineQty(line: Line, stations: readonly string[]) {
  if (!isKiloPricedItem(line.item, stations)) return `${line.qty}`;
  return `${line.qty.toLocaleString(undefined, { maximumFractionDigits: 3 })} ${line.item.unitLabel ?? "kg"}`;
}

function itemUnitLabel(item: MenuItem, stations: readonly string[]) {
  return isKiloPricedItem(item, stations) ? `per ${item.unitLabel ?? "kg"}` : "each";
}

function orderItem(item: MenuItem, stations: readonly string[]) {
  if (!isKiloPricedItem(item, stations) || item.unitLabel) return item;
  return { ...item, pricingMode: "kg" as const, unitLabel: "kg" };
}

function GuestMenu() {
  const { table } = Route.useParams();
  const [restaurantProfile, setRestaurantProfile] = useState(() => loadRestaurantProfile());
  const [stations, setStations] = useState(() => loadProductionStations());
  const [assignedTable, setAssignedTable] = useState(() => findStoredTable(table));
  const [menuItems, setMenuItems] = useState(() =>
    loadStoredMenuItems(isSupabaseConfigured ? [] : MENU),
  );
  const lang = useLang();
  const setLang = useSetLang();
  const [cat, setCat] = useState("All");
  const [cart, setCart] = useState<Line[]>([]);
  const [screen, setScreen] = useState<Screen>("menu");
  const [note, setNote] = useState("");
  const [submittedOrder, setSubmittedOrder] = useState<GuestOrderRequest | null>(null);

  const categories = ["All", ...Array.from(new Set(menuItems.map((item) => item.category))).sort()];
  const assignedWaiter = assignedTable?.server ?? "Unassigned waiter";
  const assignedArea = assignedTable?.area ?? "Main Hall";
  const items = cat === "All" ? menuItems : menuItems.filter((item) => item.category === cat);
  const subtotal = cart.reduce((sum, line) => sum + line.item.price * line.qty, 0);
  const { vat, total } = vatBreakdown(subtotal);
  const count = cart.reduce((sum, line) => sum + line.qty, 0);

  const label = (item: MenuItem) => menuItemName(item, lang);

  useEffect(() => {
    void loadBackendRestaurantProfile()
      .then((profile) => {
        if (profile) setRestaurantProfile(profile);
      })
      .catch((error) => console.warn("Failed to load Supabase restaurant profile", error));
  }, []);

  useEffect(() => {
    let active = true;
    void loadGuestOrderingSnapshot(table)
      .then((snapshot) => {
        if (!active || !snapshot) return;
        setMenuItems(snapshot.menuItems);
        setAssignedTable(snapshot.table ?? findStoredTable(table));
        if (snapshot.stations.length > 0) setStations(snapshot.stations);
      })
      .catch((error) => console.error("Failed to load Supabase guest menu", error));

    return () => {
      active = false;
    };
  }, [table]);

  function add(item: MenuItem) {
    const step = itemQtyStep(item, stations);
    const defaultQty = itemDefaultQty(item, stations);
    setCart((current) => {
      const existing = current.find((line) => line.item.id === item.id);
      return existing
        ? current.map((line) =>
            line.item.id === item.id ? { ...line, qty: normalizeQty(line.qty + step) } : line,
          )
        : [...current, { item, qty: normalizeQty(defaultQty) }];
    });
  }

  function dec(id: string) {
    setCart((current) =>
      current.flatMap((line) => {
        if (line.item.id !== id) return [line];
        const nextQty = normalizeQty(line.qty - itemQtyStep(line.item, stations));
        return nextQty > 0 ? [{ ...line, qty: nextQty }] : [];
      }),
    );
  }

  function buildRequest(status: GuestOrderRequest["status"]): GuestOrderRequest {
    return {
      id: submittedOrder?.id ?? `guest-${Date.now()}`,
      tableNumber: table,
      area: assignedArea,
      waiter: assignedWaiter,
      status,
      note: note.trim(),
      createdAt: new Date().toLocaleString("en-GB"),
      total,
      items: cart.map((line) => ({ item: orderItem(line.item, stations), qty: line.qty })),
    };
  }

  function sendToWaiter() {
    if (cart.length === 0) return;
    const request = buildRequest("SENT_TO_WAITER");
    upsertGuestOrderRequest(request);
    setSubmittedOrder(request);
    setScreen("confirmed");
  }

  function generateOrderQr() {
    if (cart.length === 0) return;
    const request = buildRequest("QR_GENERATED");
    upsertGuestOrderRequest(request);
    setSubmittedOrder(request);
    setScreen("orderQr");
  }

  if (screen === "confirmed") {
    return (
      <ConfirmedScreen
        request={submittedOrder}
        table={table}
        total={total}
        onBack={() => {
          setCart([]);
          setNote("");
          setSubmittedOrder(null);
          setScreen("menu");
        }}
      />
    );
  }

  if (screen === "orderQr" && submittedOrder) {
    return (
      <OrderQrScreen
        request={submittedOrder}
        qrValue={encodeGuestOrderQr(submittedOrder)}
        onSendToWaiter={() => {
          const next = { ...submittedOrder, status: "SENT_TO_WAITER" as const };
          upsertGuestOrderRequest(next);
          setSubmittedOrder(next);
          setScreen("confirmed");
        }}
        onBack={() => setScreen("request")}
      />
    );
  }

  return (
    <div className="min-h-screen bg-background max-w-md mx-auto relative">
      <header className="sticky top-0 z-20 bg-background/95 backdrop-blur-sm border-b border-border">
        <div className="flex items-center justify-between px-4 h-14">
          <div className="flex items-center gap-2">
            <img
              src={restaurantProfile.logoUrl}
              alt={`${restaurantProfile.name} logo`}
              className="size-8 rounded-lg object-cover bg-card border border-border"
            />
            <div>
              <div className="font-display text-sm font-semibold leading-none">
                {restaurantProfile.shortName}
              </div>
              <div className="text-[10px] text-muted-foreground mt-0.5">Table {table}</div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <div className="flex items-center rounded-full border border-border p-0.5 text-xs bg-card">
              <button
                onClick={() => setLang("en")}
                className={`px-2.5 h-6 rounded-full font-medium transition-colors ${lang === "en" ? "bg-ember text-ember-foreground" : "text-muted-foreground"}`}
              >
                EN
              </button>
              <button
                onClick={() => setLang("am")}
                className={`px-2.5 h-6 rounded-full font-medium transition-colors ${lang === "am" ? "bg-ember text-ember-foreground" : "text-muted-foreground"}`}
              >
                AM
              </button>
            </div>
            {count > 0 && (
              <button
                onClick={() => setScreen("request")}
                className="relative size-9 grid place-items-center rounded-full bg-ember text-ember-foreground shadow-[var(--shadow-glow)]"
              >
                <Icons.ClipboardList className="size-4" />
                <span className="absolute -top-1 -right-1 size-4 rounded-full bg-foreground text-background text-[9px] font-bold grid place-items-center">
                  {count}
                </span>
              </button>
            )}
          </div>
        </div>

        <div className="flex gap-2 px-4 pb-3 overflow-x-auto scrollbar-none">
          {categories.map((category) => (
            <button
              key={category}
              onClick={() => setCat(category)}
              className={`shrink-0 h-8 px-3.5 rounded-full text-xs font-medium transition-colors ${cat === category ? "bg-ember text-ember-foreground shadow-[var(--shadow-glow)]" : "bg-surface-2 text-muted-foreground hover:text-foreground"}`}
            >
              {menuCategoryName(category, lang)}
            </button>
          ))}
        </div>
      </header>

      <div className="mx-4 mt-4 rounded-2xl bg-ember text-ember-foreground px-5 py-4">
        <div className="text-xs uppercase tracking-[0.18em] opacity-80">Welcome</div>
        <div className="font-display text-xl font-semibold mt-0.5">{restaurantProfile.name}</div>
        <div className="text-xs opacity-85 mt-1">
          Browse, create your order, then send it to your waiter.
        </div>
      </div>

      <div className="mx-4 mt-3 rounded-xl border border-border bg-card px-4 py-3 text-xs text-muted-foreground">
        Assigned waiter: <span className="font-semibold text-foreground">{assignedWaiter}</span>.
        The waiter reviews your order and sends it to cashier.
      </div>

      <div className="px-4 pt-4 pb-32 space-y-2">
        {items.map((item) => {
          const line = cart.find((entry) => entry.item.id === item.id);
          const station = stationForItem(item, stations);
          return (
            <div
              key={item.id}
              className={`surface-card !p-0 overflow-hidden transition-all ${line ? "ring-2 ring-ember/40" : ""}`}
            >
              <div className="flex items-stretch">
                {menuItemGlyph(item.emoji, lang) ? (
                  <div className="w-20 shrink-0 bg-surface-2 grid place-items-center text-4xl py-4">
                    {menuItemGlyph(item.emoji, lang)}
                  </div>
                ) : null}
                <div className="flex-1 min-w-0 px-3 py-3">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="font-display font-semibold text-sm leading-tight">
                        {label(item)}
                      </div>
                      <div className="flex items-center gap-1.5 mt-1.5 flex-wrap">
                        <span className="font-mono text-sm font-semibold">
                          {formatETB(item.price)}
                        </span>
                        <span className="text-[10px] text-muted-foreground">
                          {itemUnitLabel(item, stations)}
                        </span>
                        {item.veg && (
                          <span className="inline-flex items-center px-1.5 h-4 rounded-full text-[9px] font-medium bg-teff/15 text-teff">
                            Veg
                          </span>
                        )}
                        <span className="inline-flex items-center px-1.5 h-4 rounded-full text-[9px] bg-surface-2 text-muted-foreground">
                          {station}
                        </span>
                      </div>
                    </div>
                    <div className="shrink-0">
                      {line ? (
                        <div className="flex items-center gap-1">
                          <button
                            onClick={() => dec(item.id)}
                            className="size-7 grid place-items-center rounded-full border border-border bg-card hover:bg-surface-2 transition-colors"
                          >
                            <Icons.Minus className="size-3" />
                          </button>
                          <span className="min-w-12 text-center text-sm font-bold">
                            {formatLineQty(line, stations)}
                          </span>
                          <button
                            onClick={() => add(item)}
                            className="size-7 grid place-items-center rounded-full bg-ember text-ember-foreground hover:opacity-90 transition-opacity"
                          >
                            <Icons.Plus className="size-3" />
                          </button>
                        </div>
                      ) : (
                        <button
                          onClick={() => add(item)}
                          className="size-8 grid place-items-center rounded-full bg-ember text-ember-foreground shadow-[var(--shadow-glow)] hover:opacity-90 transition-opacity"
                        >
                          <Icons.Plus className="size-4" />
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          );
        })}
        {items.length === 0 && (
          <div className="rounded-xl border-2 border-dashed border-border p-8 text-center text-sm text-muted-foreground">
            No menu items are available yet.
          </div>
        )}
      </div>

      {count > 0 && screen === "menu" && (
        <div className="fixed bottom-0 inset-x-0 max-w-md mx-auto p-4 bg-background/95 backdrop-blur-sm border-t border-border">
          <button
            onClick={() => setScreen("request")}
            className="w-full h-14 rounded-2xl bg-ember text-ember-foreground font-semibold shadow-[var(--shadow-glow)] flex items-center justify-between px-5 hover:opacity-95 transition-opacity"
          >
            <span className="flex items-center gap-2">
              <span className="size-7 grid place-items-center rounded-full bg-ember-foreground/20 text-sm font-bold">
                {count}
              </span>
              Review order
            </span>
            <span className="font-mono text-base">{formatETB(total)}</span>
          </button>
        </div>
      )}

      {screen === "request" && (
        <div
          className="fixed inset-0 z-50 bg-foreground/50 backdrop-blur-sm flex items-end justify-center"
          onClick={() => setScreen("menu")}
        >
          <div
            onClick={(event) => event.stopPropagation()}
            className="bg-background rounded-t-3xl w-full max-w-md max-h-[90vh] flex flex-col"
          >
            <div className="flex justify-center pt-3 pb-1 shrink-0">
              <div className="w-10 h-1 rounded-full bg-border" />
            </div>
            <div className="flex items-center justify-between px-5 py-3 shrink-0">
              <h3 className="font-display text-xl font-semibold">Your order</h3>
              <button
                onClick={() => setScreen("menu")}
                className="size-8 grid place-items-center rounded-full bg-surface-2 hover:bg-accent transition-colors"
              >
                <Icons.X className="size-4" />
              </button>
            </div>

            <div className="mx-5 mb-3 rounded-xl bg-surface-2 px-3 py-2 text-xs text-muted-foreground">
              Your assigned waiter is{" "}
              <span className="font-semibold text-foreground">{assignedWaiter}</span>. Send it now
              or generate an order QR for the waiter to scan.
            </div>

            <div className="flex-1 overflow-y-auto px-5 space-y-2 pb-2">
              {cart.map((line) => (
                <div
                  key={line.item.id}
                  className="flex items-center gap-3 py-2 border-b border-border last:border-0"
                >
                  {menuItemGlyph(line.item.emoji, lang) ? (
                    <span className="text-2xl">{menuItemGlyph(line.item.emoji, lang)}</span>
                  ) : null}
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium truncate">{label(line.item)}</div>
                    <div className="text-xs text-muted-foreground font-mono">
                      {formatETB(line.item.price)} {itemUnitLabel(line.item, stations)}
                    </div>
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0">
                    <button
                      onClick={() => dec(line.item.id)}
                      className="size-7 grid place-items-center rounded-full border border-border hover:bg-surface-2"
                    >
                      {line.qty <= itemQtyStep(line.item, stations) ? (
                        <Icons.Trash2 className="size-3 text-destructive" />
                      ) : (
                        <Icons.Minus className="size-3" />
                      )}
                    </button>
                    <span className="min-w-12 text-center text-sm font-bold">
                      {formatLineQty(line, stations)}
                    </span>
                    <button
                      onClick={() => add(line.item)}
                      className="size-7 grid place-items-center rounded-full bg-ember text-ember-foreground"
                    >
                      <Icons.Plus className="size-3" />
                    </button>
                  </div>
                  <div className="text-sm font-mono font-semibold w-16 text-right shrink-0">
                    {formatETB(line.item.price * line.qty)}
                  </div>
                </div>
              ))}
            </div>

            <div className="px-5 pb-3 shrink-0">
              <textarea
                value={note}
                onChange={(event) => setNote(event.target.value)}
                placeholder="Add a note for the waiter"
                rows={2}
                className="w-full px-3 py-2 rounded-xl border border-border bg-card text-sm focus:outline-none focus:ring-2 focus:ring-ring/40 resize-none text-muted-foreground placeholder:text-muted-foreground/60"
              />
            </div>

            <div className="px-5 pb-6 shrink-0 border-t border-border pt-3 space-y-1.5">
              <div className="flex justify-between text-sm text-muted-foreground">
                <span>Subtotal estimate</span>
                <span className="font-mono">{formatETB(subtotal)}</span>
              </div>
              <div className="flex justify-between text-sm text-muted-foreground">
                <span>VAT estimate</span>
                <span className="font-mono">{formatETB(vat)}</span>
              </div>
              <div className="flex justify-between font-display font-semibold text-base border-t border-dashed border-border pt-2 mt-1">
                <span>Estimated total</span>
                <span className="font-mono">{formatETB(total)}</span>
              </div>
              <div className="grid grid-cols-2 gap-2 mt-3">
                <button
                  onClick={generateOrderQr}
                  className="h-13 py-3.5 rounded-2xl border border-border bg-card font-semibold text-center hover:bg-surface-2 transition-colors inline-flex items-center justify-center gap-2"
                >
                  <Icons.QrCode className="size-4" /> Generate QR
                </button>
                <button
                  onClick={sendToWaiter}
                  className="h-13 py-3.5 rounded-2xl bg-ember text-ember-foreground font-semibold shadow-[var(--shadow-glow)] text-center hover:opacity-95 transition-opacity inline-flex items-center justify-center gap-2"
                >
                  <Icons.Send className="size-4" /> Send to waiter
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function OrderQrScreen({
  request,
  qrValue,
  onSendToWaiter,
  onBack,
}: {
  request: GuestOrderRequest;
  qrValue: string;
  onSendToWaiter: () => void;
  onBack: () => void;
}) {
  return (
    <div className="min-h-screen bg-background max-w-md mx-auto px-5 py-6 flex flex-col">
      <button
        onClick={onBack}
        className="self-start h-9 px-3 rounded-lg border border-border bg-card text-sm inline-flex items-center gap-2 mb-4"
      >
        <Icons.ArrowLeft className="size-4" /> Back
      </button>
      <div className="flex-1 flex flex-col items-center justify-center text-center">
        <div className="size-12 rounded-xl bg-ember/10 text-ember grid place-items-center mb-4">
          <Icons.QrCode className="size-6" />
        </div>
        <h2 className="font-display text-2xl font-semibold">Order QR</h2>
        <p className="text-sm text-muted-foreground mt-2 max-w-xs">
          Show this QR to {request.waiter}. The waiter scans it from the QR Scanner sidebar, reviews
          the order, and sends it to cashier.
        </p>
        <div className="mt-6 rounded-3xl bg-white p-5 shadow-[var(--shadow-soft)]">
          <QRCodeSVG value={qrValue} size={230} level="M" includeMargin={false} />
        </div>
        <div className="mt-5 w-full rounded-xl bg-surface-2 p-4 text-sm space-y-2">
          <div className="flex justify-between">
            <span className="text-muted-foreground">Table</span>
            <span className="font-semibold">{request.tableNumber}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">Waiter</span>
            <span>{request.waiter}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">Items</span>
            <span>{request.items.reduce((sum, line) => sum + line.qty, 0)}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">Estimated total</span>
            <span className="font-mono font-semibold">{formatETB(request.total)}</span>
          </div>
        </div>
      </div>
      <button
        onClick={onSendToWaiter}
        className="w-full h-12 rounded-2xl bg-ember text-ember-foreground font-semibold shadow-[var(--shadow-glow)] inline-flex items-center justify-center gap-2"
      >
        <Icons.Send className="size-4" /> Also send to waiter
      </button>
    </div>
  );
}

function ConfirmedScreen({
  request,
  table,
  total,
  onBack,
}: {
  request: GuestOrderRequest | null;
  table: string;
  total: number;
  onBack: () => void;
}) {
  return (
    <div className="min-h-screen bg-background max-w-md mx-auto flex flex-col items-center justify-center px-6 text-center">
      <div className="size-24 rounded-full bg-teff/15 grid place-items-center mb-6">
        <Icons.UserCheck className="size-12 text-teff" />
      </div>
      <h2 className="font-display text-2xl font-semibold mb-2">Order sent to waiter</h2>
      <p className="text-muted-foreground text-sm mb-6">
        {request?.waiter ?? "Your waiter"} will review it and send it to cashier.
      </p>

      <div className="w-full rounded-2xl bg-surface-2 p-5 mb-8 text-sm space-y-2">
        <div className="flex justify-between">
          <span className="text-muted-foreground">Table</span>
          <span className="font-semibold">{table}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-muted-foreground">Estimated total</span>
          <span className="font-mono font-semibold">{formatETB(total)}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-muted-foreground">Payment</span>
          <span>After receipt</span>
        </div>
        <div className="flex justify-between">
          <span className="text-muted-foreground">Waiter</span>
          <span>{request?.waiter ?? "Assigned waiter"}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-muted-foreground">Status</span>
          <span className="text-teff font-medium">Sent to waiter</span>
        </div>
      </div>

      <button
        onClick={onBack}
        className="w-full h-12 rounded-2xl bg-ember text-ember-foreground font-semibold shadow-[var(--shadow-glow)] hover:opacity-95 transition-opacity"
      >
        Browse more
      </button>
      <p className="text-xs text-muted-foreground mt-4">Thank you</p>
    </div>
  );
}
