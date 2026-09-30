import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import * as Icons from "lucide-react";
import { PageHeader, Card, Chip, Stat } from "@/components/ui-kit";
import { ROOM_ORDERS, type MenuItem } from "@/lib/demo-data";
import { formatETB } from "@/lib/ethiopic";
import { menuItemGlyph, menuItemName, orderLineName, useT } from "@/lib/i18n";
import { useLang } from "@/lib/lang-context";
import { useModuleRecords } from "@/lib/module-records";
import { useStore } from "@/lib/store";

export const Route = createFileRoute("/app/room")({ component: RoomService });

type RoomOrder = typeof ROOM_ORDERS[number];
type RoomOrderItem = RoomOrder["items"][number] & { menuItemId?: string };

const STATUS_CYCLE: Record<string, string> = {
  New: "Preparing",
  Preparing: "On the way",
  "On the way": "Delivered",
};

const STATUS_TONE: Record<string, "ember" | "gold" | "teff" | "muted"> = {
  New: "ember",
  Preparing: "gold",
  "On the way": "teff",
  Delivered: "muted",
};

function roomStatusLabel(status: string, t: ReturnType<typeof useT>) {
  if (status === "New") return t("New", "አዲስ");
  if (status === "Preparing") return t("Preparing", "እየተዘጋጀ");
  if (status === "On the way") return t("On the way", "በመንገድ ላይ");
  return t("Delivered", "ደርሷል");
}

function roomOrderItemName(item: RoomOrderItem, menuItems: readonly MenuItem[], lang: ReturnType<typeof useLang>) {
  return orderLineName(item, menuItems, lang);
}

function RoomService() {
  const store = useStore();
  const t = useT();
  const lang = useLang();
  const { records: orders, setRecords: setOrders } = useModuleRecords<RoomOrder>(
    "room_orders",
    ROOM_ORDERS.map((o) => ({ ...o })),
  );
  const [showAdd, setShowAdd] = useState(false);
  const [filter, setFilter] = useState("Active");

  const active = orders.filter((o) => o.status !== "Delivered").length;
  const revenue = orders.reduce((s, o) => s + o.total, 0);

  function advance(id: string) {
    setOrders((prev) =>
      prev.map((o) =>
        o.id === id && STATUS_CYCLE[o.status]
          ? { ...o, status: STATUS_CYCLE[o.status] as RoomOrder["status"] }
          : o,
      ),
    );
  }

  const list = filter === "Active" ? orders.filter((o) => o.status !== "Delivered") : orders;

  return (
    <div>
      <PageHeader
        title={t("Room Service", "የክፍል አገልግሎት")}
        subtitle={t(
          "In-room dining orders - charged to guest folio",
          "የክፍል ውስጥ ምግብ ትዕዛዞች - ወደ የእንግዳ ፎሊዮ ይጨምራሉ",
        )}
        action={
          <button
            onClick={() => setShowAdd(true)}
            className="h-10 px-4 rounded-lg bg-ember text-ember-foreground text-sm font-medium inline-flex items-center gap-2"
          >
            <Icons.Plus className="size-4" /> {t("New order", "አዲስ ትዕዛዝ")}
          </button>
        }
      />

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        <Stat label={t("Active orders", "ንቁ ትዕዛዞች")} value={`${active}`} tone="ember" icon="BedDouble" />
        <Stat label={t("Today's revenue", "የዛሬ ገቢ")} value={formatETB(revenue)} tone="teff" icon="TrendingUp" />
        <Stat
          label={t("On the way", "በመንገድ ላይ")}
          value={`${orders.filter((o) => o.status === "On the way").length}`}
          tone="gold"
          icon="Truck"
        />
        <Stat
          label={t("Delivered", "ደርሷል")}
          value={`${orders.filter((o) => o.status === "Delivered").length}`}
          icon="CheckCircle"
        />
      </div>

      <div className="flex items-center gap-2 mb-5">
        {[
          { key: "Active", label: t("Active", "ንቁ") },
          { key: "All", label: t("All", "ሁሉም") },
        ].map((item) => (
          <button
            key={item.key}
            onClick={() => setFilter(item.key)}
            className={`h-9 px-4 rounded-full text-sm font-medium transition-colors ${filter === item.key ? "bg-foreground text-background" : "bg-card border border-border text-muted-foreground hover:text-foreground"}`}
          >
            {item.label}
          </button>
        ))}
      </div>

      <div className="grid lg:grid-cols-2 gap-4">
        {list.map((o) => (
          <Card key={o.id} className="!p-5">
            <div className="flex items-start justify-between gap-3 mb-3">
              <div>
                <div className="flex items-center gap-2 mb-1">
                  <span className="font-display text-lg font-semibold">{o.room}</span>
                  <Chip tone={STATUS_TONE[o.status] ?? "muted"}>{roomStatusLabel(o.status, t)}</Chip>
                </div>
                <div className="text-sm text-muted-foreground">{o.guest}</div>
                <div className="text-xs text-muted-foreground font-mono mt-0.5">
                  {t("Folio", "ፎሊዮ")} {o.folio} · {t("Ordered", "ታዘዘ")} {o.placedAt}
                </div>
              </div>
              <div className="text-right">
                <div className="font-display text-xl font-semibold font-mono">{formatETB(o.total)}</div>
              </div>
            </div>
            <ul className="space-y-1 mb-4">
              {o.items.map((item, i) => (
                <li key={i} className="flex justify-between text-sm">
                  <span>
                    {item.qty}x {roomOrderItemName(item, store.menuItems, lang)}
                  </span>
                  <span className="font-mono text-muted-foreground">{formatETB(item.price)}</span>
                </li>
              ))}
            </ul>
            <div className="flex items-center gap-2">
              {o.status !== "Delivered" && (
                <button
                  onClick={() => advance(o.id)}
                  className="flex-1 h-9 rounded-lg bg-ember/10 text-ember text-sm font-medium hover:bg-ember/20 transition-colors inline-flex items-center justify-center gap-1.5"
                >
                  <Icons.ArrowRight className="size-4" /> {t("Next", "ቀጣይ")} {roomStatusLabel(STATUS_CYCLE[o.status], t)}
                </button>
              )}
              <div
                className={`flex-1 h-9 rounded-lg text-xs font-medium flex items-center justify-center gap-1.5 ${o.status === "Delivered" ? "bg-teff/10 text-teff" : "bg-surface-2 text-muted-foreground"}`}
              >
                <Icons.Hotel className="size-3.5" /> {t("Charge to room", "ወደ ክፍል ይመዝግቡ")}
              </div>
            </div>
          </Card>
        ))}
        {list.length === 0 && (
          <div className="col-span-2 text-center py-16 text-muted-foreground text-sm">
            <Icons.BedDouble className="size-10 mx-auto mb-3 opacity-30" />
            {t("No active room service orders", "ንቁ የክፍል አገልግሎት ትዕዛዞች የሉም")}
          </div>
        )}
      </div>

      {showAdd && (
        <NewRoomOrderModal
          menuItems={store.menuItems}
          onClose={() => setShowAdd(false)}
          onSave={(o) => {
            setOrders((prev) => [o, ...prev]);
            setShowAdd(false);
          }}
        />
      )}
    </div>
  );
}

function NewRoomOrderModal({
  menuItems,
  onClose,
  onSave,
}: {
  menuItems: MenuItem[];
  onClose: () => void;
  onSave: (o: RoomOrder) => void;
}) {
  const t = useT();
  const lang = useLang();
  const [room, setRoom] = useState("R-101");
  const [guest, setGuest] = useState("");
  const [selected, setSelected] = useState<RoomOrderItem[]>([]);

  const foodItems = menuItems.filter((m) => m.category !== "Drinks");

  function toggleItem(m: MenuItem) {
    const label = menuItemName(m, lang);
    setSelected((prev) => {
      const ex = prev.find((s) => s.menuItemId === m.id);
      return ex
        ? prev.filter((s) => s.menuItemId !== m.id)
        : [...prev, { menuItemId: m.id, name: label, qty: 1, price: m.price }];
    });
  }

  function submit() {
    if (!guest || selected.length === 0) return;
    const total = selected.reduce((s, i) => s + i.price * i.qty, 0);
    const now = new Date();
    onSave({
      id: `ro${Date.now()}`,
      room,
      guest,
      items: selected,
      status: "New",
      placedAt: `${now.getHours().toString().padStart(2, "0")}:${now.getMinutes().toString().padStart(2, "0")}`,
      total,
      folio: `F-${Math.floor(1000 + Math.random() * 9000)}`,
    });
  }

  return (
    <div className="fixed inset-0 z-50 bg-foreground/40 backdrop-blur-sm grid place-items-center p-4">
      <div className="surface-card max-w-lg w-full !p-6 max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between mb-5">
          <h3 className="font-display text-xl font-semibold">{t("New Room Service Order", "አዲስ የክፍል አገልግሎት ትዕዛዝ")}</h3>
          <button onClick={onClose} className="size-8 grid place-items-center rounded-lg hover:bg-surface-2">
            <Icons.X className="size-4" />
          </button>
        </div>
        <div className="grid grid-cols-2 gap-3 mb-4">
          <div>
            <label className="text-xs text-muted-foreground">{t("Room", "ክፍል")}</label>
            <select
              value={room}
              onChange={(e) => setRoom(e.target.value)}
              className="w-full mt-1 h-9 px-3 rounded-lg border border-border bg-card text-sm focus:outline-none"
            >
              {["R-101", "R-102", "R-201", "R-204", "R-302", "R-405"].map((r) => (
                <option key={r}>{r}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="text-xs text-muted-foreground">{t("Guest name", "የእንግዳ ስም")}</label>
            <input
              value={guest}
              onChange={(e) => setGuest(e.target.value)}
              className="w-full mt-1 h-9 px-3 rounded-lg border border-border bg-card text-sm focus:outline-none focus:ring-2 focus:ring-ring/40"
            />
          </div>
        </div>
        <div className="text-xs text-muted-foreground uppercase tracking-wider mb-2">
          {t("Select items", "እቃዎችን ይምረጡ")}
        </div>
        <div className="grid grid-cols-2 gap-2 mb-5 max-h-52 overflow-y-auto">
          {foodItems.map((m) => {
            const sel = selected.find((s) => s.menuItemId === m.id);
            return (
              <div
                key={m.id}
                onClick={() => toggleItem(m)}
                className={`flex items-center gap-2 p-2 rounded-lg border cursor-pointer text-sm transition-colors ${sel ? "border-ember bg-ember/10" : "border-border hover:bg-surface-2"}`}
              >
                <span>{menuItemGlyph(m.emoji, lang)}</span>
                <div className="flex-1 min-w-0">
                  <div className="font-medium truncate">{menuItemName(m, lang)}</div>
                  <div className="text-xs text-muted-foreground font-mono">{formatETB(m.price)}</div>
                </div>
              </div>
            );
          })}
        </div>
        {selected.length > 0 && (
          <div className="mb-4 p-3 rounded-lg bg-surface-2 text-sm">
            {t("Total", "ጠቅላላ")}:{" "}
            <span className="font-semibold">{formatETB(selected.reduce((s, i) => s + i.price * i.qty, 0))}</span>
          </div>
        )}
        <div className="flex gap-2">
          <button
            onClick={onClose}
            className="flex-1 h-10 rounded-lg border border-border bg-card text-sm hover:bg-surface-2"
          >
            {t("Cancel", "ሰርዝ")}
          </button>
          <button
            onClick={submit}
            disabled={!guest || selected.length === 0}
            className="flex-1 h-10 rounded-lg bg-ember text-ember-foreground text-sm font-semibold disabled:opacity-40"
          >
            {t("Place order", "ትዕዛዝ ያስገቡ")}
          </button>
        </div>
      </div>
    </div>
  );
}
