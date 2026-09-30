import test from "node:test";
import assert from "node:assert/strict";

import type { MenuItem } from "./demo-data.ts";
import {
  aliasLegacyStation,
  canonicalizeStationName,
  migrateProductionStations,
  resolveProductionStation,
  sameStation,
} from "./stations.ts";

const LIVE_STATIONS = ["Kitchen", "Main Bar", "VIP Bar", "Butcher House", "Coffee House"];

const menuItem = (overrides: Partial<MenuItem>): MenuItem => ({
  id: "item",
  name_en: "Test",
  name_am: "",
  category: "Mains",
  price: 100,
  cost: 0,
  station: "Kitchen",
  emoji: "T",
  ...overrides,
});

test("aliasLegacyStation maps Bar to Main Bar", () => {
  assert.equal(aliasLegacyStation("Bar"), "Main Bar");
  assert.equal(aliasLegacyStation("Butcher"), "Butcher House");
  assert.equal(aliasLegacyStation("VIP Bar"), "VIP Bar");
});

test("sameStation treats legacy Bar as Main Bar", () => {
  assert.equal(sameStation("Bar", "Main Bar"), true);
  assert.equal(sameStation("VIP Bar", "Main Bar"), false);
});

test("migrateProductionStations upgrades legacy Bar and keeps VIP/Main", () => {
  const migrated = migrateProductionStations(["Kitchen", "Bar", "Butcher House", "Coffee House"]);
  assert.deepEqual(migrated, ["Kitchen", "Main Bar", "Butcher House", "Coffee House", "VIP Bar"]);
});

test("migrateProductionStations always includes Main Bar, VIP Bar, and Coffee House", () => {
  const migrated = migrateProductionStations(["Kitchen"]);
  assert.ok(migrated.includes("Main Bar"));
  assert.ok(migrated.includes("VIP Bar"));
  assert.ok(migrated.includes("Coffee House"));
  assert.ok(migrated.includes("Butcher House"));
});

test("canonicalizeStationName maps Bar onto configured Main Bar", () => {
  assert.equal(canonicalizeStationName("Bar", LIVE_STATIONS), "Main Bar");
  assert.equal(canonicalizeStationName("VIP Bar", LIVE_STATIONS), "VIP Bar");
});

test("resolveProductionStation sends beer and soft drinks to Main Bar", () => {
  assert.equal(
    resolveProductionStation(menuItem({ name_en: "Heineken", category: "Beer", station: "Bar" }), LIVE_STATIONS),
    "Main Bar",
  );
  assert.equal(
    resolveProductionStation(menuItem({ name_en: "Sprite", category: "Soft Drinks", station: "Bar" }), LIVE_STATIONS, "VIP"),
    "Main Bar",
  );
});

test("resolveProductionStation sends spirits to VIP Bar from any area", () => {
  assert.equal(
    resolveProductionStation(
      menuItem({
        name_en: "Black Label",
        category: "Spirits",
        station: "Bar",
        stockDeductionLocation: "VIP Bar",
      }),
      LIVE_STATIONS,
      "Main Hall",
    ),
    "VIP Bar",
  );
});

test("resolveProductionStation keeps kitchen, butcher, and coffee on their stations", () => {
  assert.equal(
    resolveProductionStation(menuItem({ name_en: "Shiro", category: "Mains", station: "Kitchen" }), LIVE_STATIONS),
    "Kitchen",
  );
  assert.equal(
    resolveProductionStation(menuItem({ name_en: "Shekla", category: "Meat", station: "Butcher House" }), LIVE_STATIONS),
    "Butcher House",
  );
  assert.equal(
    resolveProductionStation(menuItem({ name_en: "Coffee", category: "Drinks", station: "Coffee House" }), LIVE_STATIONS),
    "Coffee House",
  );
});

test("resolveProductionStation honors explicit Kitchen for meat / tibs items", () => {
  assert.equal(
    resolveProductionStation(menuItem({ name_en: "Shekla", category: "Meat", station: "Kitchen" }), LIVE_STATIONS),
    "Kitchen",
  );
  assert.equal(
    resolveProductionStation(menuItem({ name_en: "Beef Tibs", category: "Mains", station: "Kitchen" }), LIVE_STATIONS),
    "Kitchen",
  );
  assert.equal(
    resolveProductionStation(menuItem({ name_en: "Kitfo", category: "Meat", station: "Kitchen" }), LIVE_STATIONS),
    "Kitchen",
  );
});

test("resolveProductionStation still defaults meat items to Butcher when station is butcher/legacy", () => {
  assert.equal(
    resolveProductionStation(menuItem({ name_en: "Shekla", category: "Meat", station: "Butcher" }), LIVE_STATIONS),
    "Butcher House",
  );
});

test("resolveProductionStation does not dump unmatched Bar drinks onto Kitchen", () => {
  assert.notEqual(
    resolveProductionStation(menuItem({ name_en: "Dashen", category: "Beer", station: "Bar" }), LIVE_STATIONS),
    "Kitchen",
  );
});

test("resolveProductionStation sends drink categories to Main Bar even if menu station is Kitchen", () => {
  assert.equal(
    resolveProductionStation(menuItem({ name_en: "Heineken", category: "Beer", station: "Kitchen" }), LIVE_STATIONS),
    "Main Bar",
  );
  assert.equal(
    resolveProductionStation(menuItem({ name_en: "Sprite", category: "Soft Drinks", station: "Kitchen" }), LIVE_STATIONS),
    "Main Bar",
  );
});
