import assert from "node:assert/strict";
import test from "node:test";
import type { Order, OrderLine, StationTicket } from "./demo-data.ts";
import {
  bonoTicketsToPrint,
  buildStationBonoText,
  filterPreferencesForStation,
} from "./station-ticket-print.ts";

function line(partial: Partial<OrderLine> & Pick<OrderLine, "name" | "station">): OrderLine {
  return {
    qty: 1,
    done: false,
    ...partial,
  };
}

function order(partial: Partial<Order> & Pick<Order, "items" | "stationTickets">): Order {
  return {
    id: "o1",
    orderNo: "ORD-1001",
    source: "Dine-in",
    ref: "Main Hall 12",
    area: "Main Hall",
    tableNumber: "12",
    orderedByWaiter: "Abel",
    waiter: "Abel",
    enteredByCashier: "Samuel",
    server: "Abel",
    sentAt: "3:28 PM",
    openedMin: 0,
    status: "NEW",
    paymentStatus: "Unpaid",
    total: 0,
    ...partial,
  };
}

test("buildStationBonoText prints date under the station title between the rules", () => {
  const steak = line({ name: "Coffee", qty: 1, station: "Coffee House" });
  const printedAt = new Date("2026-08-13T12:28:00.000Z");
  const gregorian = buildStationBonoText(
    order({ items: [steak], stationTickets: [] }),
    "Coffee House",
    [steak],
    { printedAt, calendar: "gregorian" },
  );
  const ethiopian = buildStationBonoText(
    order({ items: [steak], stationTickets: [] }),
    "Butcher House",
    [steak],
    { printedAt, calendar: "ethiopian", lang: "en" },
  );

  const header = ethiopian.split("\n").slice(0, 4).join("\n");
  assert.match(header, /----------------------------\n\s*BUTCHER\n.+\n----------------------------/);
  assert.match(ethiopian, /Nehase|ነሐሴ/);
  assert.match(gregorian, /COFFEE HOUSE/);
});

test("filterPreferencesForStation keeps only butcher-relevant prefs", () => {
  const prefs = filterPreferencesForStation(
    ["no fat", "NO SALT", "SMALL CUT", "WELL DONE", "remove bone"],
    "Butcher House",
  );
  assert.deepEqual(prefs, ["NO FAT", "SMALL CUT", "REMOVE BONE"]);
});

test("filterPreferencesForStation keeps only kitchen-relevant prefs", () => {
  const prefs = filterPreferencesForStation(
    ["NO FAT", "no salt", "SMALL CUT", "well done", "extra spicy", "no onion"],
    "Kitchen",
  );
  assert.deepEqual(prefs, ["NO SALT", "WELL DONE", "EXTRA SPICY", "NO ONION"]);
});

test("filterPreferencesForStation keeps custom instructions for the current station", () => {
  const butcher = filterPreferencesForStation(["CUT SMALLER", "NO SALT"], "Butcher House");
  const kitchen = filterPreferencesForStation(["CUT SMALLER", "NO FAT"], "Kitchen");
  assert.deepEqual(butcher, ["CUT SMALLER"]);
  assert.deepEqual(kitchen, ["CUT SMALLER"]);
});

test("buildStationBonoText prints single and double shot units", () => {
  const single = line({
    name: "Amarula",
    qty: 1,
    unitLabel: "Single Shot",
    station: "VIP Bar",
  });
  const double = line({
    name: "Black Label",
    qty: 2,
    unitLabel: "Double Shot",
    station: "VIP Bar",
  });
  const half = line({
    name: "Jameson",
    qty: 1,
    unitLabel: "Half Bottle",
    station: "VIP Bar",
  });
  const text = buildStationBonoText(
    order({ items: [single, double, half], stationTickets: [] }),
    "VIP Bar",
    [single, double, half],
    { printedAt: new Date("2026-08-13T12:28:00.000Z") },
  );

  assert.match(text, /1 SINGLE SHOT AMARULA/);
  assert.match(text, /2 DOUBLE SHOT BLACK LABEL/);
  assert.match(text, /1 HALF BOTTLE JAMESON/);
  assert.doesNotMatch(text, /1x AMARULA/);
});

test("buildStationBonoText prints compact butcher receipt without order ids", () => {
  const steak = line({
    name: "Beef Steak",
    qty: 2,
    unitLabel: "kg",
    station: "Butcher House",
    preferences: ["NO FAT", "SMALL CUT", "NO SALT"],
  });
  const tibs = line({
    name: "Beef Tibs",
    qty: 1,
    station: "Butcher House",
    preferences: ["MEDIUM CUT", "REMOVE BONE", "WELL DONE"],
  });
  const text = buildStationBonoText(
    order({
      items: [steak, tibs],
      stationTickets: [],
      enteredByCashier: "Samuel",
    }),
    "Butcher House",
    [steak, tibs],
    { printedAt: new Date("2026-08-13T12:28:00.000Z") },
  );

  assert.match(text, /BUTCHER/);
  assert.match(text, /13 Nehase 2018|13 ነሐሴ 2018|Aug 13, 2026|13 Aug 2026|08\/13\/2026|13\/08\/2026|2026-08-13/);
  assert.match(text, /TABLE: 12 +\d{2}:\d{2} [AP]M/);
  assert.match(text, /WAITER: ABEL/);
  assert.match(text, /1\. 1x BEEF STEAK/);
  assert.match(text, /2 KG/);
  assert.match(text, /> NO FAT/);
  assert.match(text, /> SMALL CUT/);
  assert.match(text, /2\. 1x BEEF TIBS/);
  assert.match(text, /> MEDIUM CUT/);
  assert.match(text, /> REMOVE BONE/);
  assert.match(text, /BONO #1/);
  assert.doesNotMatch(text, /CASHIER/);
  assert.doesNotMatch(text, /SAMUEL/);
  assert.doesNotMatch(text, /ORD-1001/);
  assert.doesNotMatch(text, /o1/);
  assert.doesNotMatch(text, /NO SALT/);
  assert.doesNotMatch(text, /WELL DONE/);
  assert.doesNotMatch(text, /MANUAL DELIVERY/);
});

test("buildStationBonoText prints kitchen prefs and void footer", () => {
  const steak = line({
    name: "Beef Steak",
    qty: 2,
    station: "Kitchen",
    preferences: ["NO SALT", "WELL DONE", "NO FAT"],
  });
  const kitchen = buildStationBonoText(
    order({ items: [steak], stationTickets: [], enteredByCashier: "Samuel" }),
    "Kitchen",
    [steak],
    { printedAt: new Date("2026-08-13T12:41:00.000Z") },
  );
  assert.match(kitchen, /KITCHEN/);
  assert.match(kitchen, /1\. 2x BEEF STEAK/);
  assert.match(kitchen, /> NO SALT/);
  assert.match(kitchen, /> WELL DONE/);
  assert.doesNotMatch(kitchen, /NO FAT/);

  const voidText = buildStationBonoText(
    order({ items: [steak], stationTickets: [], enteredByCashier: "Samuel" }),
    "Kitchen",
    [steak],
    { kind: "void", reason: "Customer cancelled", printedAt: new Date("2026-08-13T12:55:00.000Z") },
  );
  assert.match(voidText, /VOID/);
  assert.match(voidText, /CUSTOMER CANCELLED/);
  assert.match(voidText, /DO NOT PREPARE/);
  assert.doesNotMatch(voidText, /CASHIER:/);
});

test("buildStationBonoText prints the bono in Amharic when the app language is Amharic", () => {
  const steak = line({
    name: "Beef Steak",
    qty: 2,
    unitLabel: "kg",
    station: "Butcher House",
    preferences: ["NO FAT", "SMALL CUT"],
  });
  const text = buildStationBonoText(
    order({ items: [steak], stationTickets: [] }),
    "Butcher House",
    [steak],
    {
      lang: "am",
      menuItems: [{ id: "m1", name_en: "Beef Steak", name_am: "የበሬ ስቴክ" }],
      printedAt: new Date("2026-08-13T12:28:00.000Z"),
    },
  );

  assert.match(text, /ስጋ ቤት/);
  assert.match(text, /ጠረጴዛ: 12 +\d{2}:\d{2} [AP]M/);
  assert.match(text, /አስተናጋጅ: ABEL/);
  assert.match(text, /1\. 1x የበሬ ስቴክ/);
  assert.match(text, /2 ኪሎ/);
  assert.match(text, /> ያለ ስብ/);
  assert.match(text, /> ትንሽ ቁርጥ/);
  assert.doesNotMatch(text, /BUTCHER/);
});

test("buildStationBonoText translates dish names from the Amharic catalog when name_am is empty", () => {
  const kitfo = line({
    name: "Kitfo",
    qty: 1,
    station: "Kitchen",
  });
  const text = buildStationBonoText(
    order({ items: [kitfo], stationTickets: [] }),
    "Kitchen",
    [kitfo],
    {
      lang: "am",
      menuItems: [{ id: "kitfo", name_en: "Kitfo", name_am: "" }],
      printedAt: new Date("2026-08-13T12:28:00.000Z"),
    },
  );

  assert.match(text, /ክትፎ/);
  assert.doesNotMatch(text, /KITFO/);
});

test("buildStationBonoText translates kitchen preferences to Amharic", () => {
  const steak = line({
    name: "Beef Steak",
    qty: 1,
    station: "Kitchen",
    preferences: [
      "NO SALT",
      "NO ONION",
      "NO SPICE",
      "EXTRA SPICY",
      "WELL DONE",
      "MEDIUM",
      "RARE",
      "EXTRA SAUCE",
      "NO SAUCE",
      "NO OIL",
      "LESS OIL",
    ],
  });
  const text = buildStationBonoText(
    order({ items: [steak], stationTickets: [] }),
    "Kitchen",
    [steak],
    { lang: "am", printedAt: new Date("2026-08-13T12:28:00.000Z") },
  );

  assert.match(text, /ኩሽና/);
  assert.match(text, /> ያለ ጨው/);
  assert.match(text, /> ያለ ሽንኩርት/);
  assert.match(text, /> ያለ ቅመም/);
  assert.match(text, /> በጣም ቅመም/);
  assert.match(text, /> በደንብ የበሰለ/);
  assert.match(text, /> መካከለኛ የበሰለ/);
  assert.match(text, /> ትንሽ የበሰለ/);
  assert.match(text, /> ተጨማሪ ሶስ/);
  assert.match(text, /> ያለ ሶስ/);
  assert.match(text, /> ያለ ዘይት/);
  assert.match(text, /> ትንሽ ዘይት/);
});

test("bonoTicketsToPrint prints every station at once, including bar", () => {
  const steak = line({
    name: "Beef Steak",
    qty: 1,
    station: "Butcher House",
    finalStation: "Kitchen",
    preferences: ["NO FAT", "NO SALT"],
  });
  const beer = line({
    name: "St. George",
    qty: 2,
    station: "Main Bar",
  });
  const butcherTicket: StationTicket = {
    id: "t-butcher",
    station: "Butcher House",
    status: "NEW",
    sentAt: "3:28 PM",
    items: [steak],
    nextStation: "Kitchen",
  };
  const kitchenTicket: StationTicket = {
    id: "t-kitchen",
    station: "Kitchen",
    status: "NEW",
    sentAt: "3:28 PM",
    items: [{ ...steak, station: "Kitchen" }],
    previousTicketId: "t-butcher",
  };
  const barTicket: StationTicket = {
    id: "t-bar",
    station: "Main Bar",
    status: "NEW",
    sentAt: "3:28 PM",
    items: [beer],
  };
  const pending = order({
    items: [steak, beer],
    stationTickets: [butcherTicket, kitchenTicket, barTicket],
  });
  const first = bonoTicketsToPrint(pending);
  assert.deepEqual(first.map((job) => job.station), ["Butcher House", "Kitchen", "Main Bar"]);
});

test("bonoTicketsToPrint skips already-printed and finished tickets on normal print", () => {
  const firstRound = line({ name: "Tibs", qty: 1, station: "Kitchen" });
  const secondRound = line({ name: "Beer", qty: 2, station: "Main Bar" });
  const printedKitchen: StationTicket = {
    id: "t-kitchen-1",
    station: "Kitchen",
    status: "READY",
    sentAt: "3:00 PM",
    items: [firstRound],
    bonoPrinted: true,
  };
  const freshBar: StationTicket = {
    id: "t-bar-2",
    station: "Main Bar",
    status: "NEW",
    sentAt: "3:40 PM",
    items: [secondRound],
  };
  const bill = order({
    items: [firstRound, secondRound],
    stationTickets: [printedKitchen, freshBar],
    bonoPrintCount: 1,
  });

  const normal = bonoTicketsToPrint(bill);
  assert.deepEqual(normal.map((job) => job.station), ["Main Bar"]);
  assert.deepEqual(
    normal[0]?.items.map((item) => item.name),
    ["Beer"],
  );

  const reprint = bonoTicketsToPrint(bill, { reprint: true });
  assert.deepEqual(reprint.map((job) => job.station), ["Main Bar"]);
});

test("bonoTicketsToPrint keeps add-on items-only payloads without expanding prior rounds", () => {
  const onlyNew = line({ name: "St. George", qty: 1, station: "Main Bar" });
  const delta = order({
    items: [onlyNew],
    stationTickets: [],
    bonoPrintCount: 2,
  });
  const jobs = bonoTicketsToPrint(delta);
  assert.deepEqual(jobs.map((job) => job.station), ["Main Bar"]);
  assert.equal(jobs[0]?.items.length, 1);
  assert.equal(jobs[0]?.items[0]?.name, "St. George");
});
