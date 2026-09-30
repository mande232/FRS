// Core business logic for Test Addis Bar and Restaurant POS

import { VAT_RATE } from "./ethiopic";
import { RECIPES, type MenuItem } from "./demo-data";

// ─── VAT & Billing ───────────────────────────────────────────────────────────
// Service charge is NOT subject to VAT under Ethiopian standard practice.
// VAT applies only to food & beverage subtotal.
export function billBreakdown(subtotal: number, includeService = true) {
  const service = includeService ? subtotal * 0.1 : 0;
  const vat = subtotal * VAT_RATE; // VAT on food/bev only, not service
  const total = subtotal + service + vat;
  return { subtotal, service, vat, total };
}

// ─── Loyalty Points ──────────────────────────────────────────────────────────
export const LOYALTY_RATE = 0.1; // 1 point per ETB 10 spent

export function earnPoints(totalETB: number): number {
  return Math.floor(totalETB * LOYALTY_RATE);
}

export const TIER_THRESHOLDS = { Bronze: 0, Silver: 1000, Gold: 5000, Platinum: 20000 } as const;

export function computeTier(points: number): "Bronze" | "Silver" | "Gold" | "Platinum" {
  if (points >= 20000) return "Platinum";
  if (points >= 5000) return "Gold";
  if (points >= 1000) return "Silver";
  return "Bronze";
}

// ─── Stock Deduction ─────────────────────────────────────────────────────────
export function deductStock<
  T extends { sku?: string; name: string; onHand: number; value?: number },
>(stock: T[], items: { name: string; qty: number; stockSku?: string }[]): T[] {
  return stock.map((s) => {
    let deduction = 0;
    for (const line of items) {
      if (line.stockSku) {
        if (s.sku === line.stockSku) deduction += line.qty;
        continue;
      }
      const recipe = RECIPES.find((r) => r.name_en === line.name);
      if (!recipe) continue;
      const ing = recipe.ingredients.find((i) => i.name === s.name);
      if (ing) deduction += ing.qty * line.qty;
    }
    if (deduction <= 0) return s;
    const onHand = Math.max(0, s.onHand - deduction);
    if (typeof s.value !== "number") return { ...s, onHand };
    const perUnit = s.onHand > 0 ? s.value / s.onHand : s.value;
    return { ...s, onHand, value: Math.round(perUnit * onHand * 100) / 100 };
  });
}

// ─── Food Cost ───────────────────────────────────────────────────────────────
export const FOOD_COST_WARN_THRESHOLD = 40; // %

export function foodCostRatio(cost: number, price: number): number {
  return price > 0 ? (cost / price) * 100 : 0;
}

export function isFoodCostHigh(item: Pick<MenuItem, "cost" | "price">): boolean {
  return foodCostRatio(item.cost, item.price) > FOOD_COST_WARN_THRESHOLD;
}

// ─── Suggested Purchase Orders ───────────────────────────────────────────────
export function suggestPurchaseOrders<
  T extends {
    sku: string;
    name: string;
    onHand: number;
    reorder: number;
    unit: string;
    value: number;
    supplier: string;
  },
>(stock: T[]) {
  return stock
    .filter((s) => s.onHand <= s.reorder)
    .map((s) => ({
      id: `po-auto-${s.sku}`,
      supplier: s.supplier,
      sku: s.sku,
      item: s.name,
      qty: s.reorder * 2,
      unit: s.unit,
      unitCost: s.onHand > 0 ? Math.round(s.value / s.onHand) : 0,
      total: s.reorder * 2 * (s.onHand > 0 ? Math.round(s.value / s.onHand) : 0),
      status: "Suggested" as const,
      date: "Today",
    }));
}

// ─── Z-Report ────────────────────────────────────────────────────────────────
export interface ZReport {
  ref: string;
  closedAt: string;
  cashier: string;
  branch: string;
  grossSales: number;
  vatCollected: number;
  netSales: number;
  serviceCharge: number;
  byMethod: Record<string, number>;
  transactionCount: number;
  countedCash: number;
  expectedCash: number;
  variance: number;
}

export function buildZReport(
  payments: { method: string; amount: number; status: string; cashier: string }[],
  countedCash: number,
  branch: string,
): ZReport {
  const settled = payments.filter((p) => p.status === "Settled");
  const grossSales = settled.reduce((s, p) => s + p.amount, 0);
  const vatCollected = (grossSales * VAT_RATE) / (1 + VAT_RATE);
  const netSales = grossSales - vatCollected;
  const serviceCharge = netSales * 0.1;
  const expectedCash = settled.filter((p) => p.method === "Cash").reduce((s, p) => s + p.amount, 0);
  const byMethod = settled.reduce(
    (acc, p) => {
      acc[p.method] = (acc[p.method] ?? 0) + p.amount;
      return acc;
    },
    {} as Record<string, number>,
  );
  const cashier = settled[0]?.cashier ?? "—";
  const now = new Date();

  return {
    ref: `Z-${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, "0")}${String(now.getDate()).padStart(2, "0")}-${String(now.getHours()).padStart(2, "0")}${String(now.getMinutes()).padStart(2, "0")}`,
    closedAt: now.toLocaleString("en-GB"),
    cashier,
    branch,
    grossSales,
    vatCollected,
    netSales,
    serviceCharge,
    byMethod,
    transactionCount: settled.length,
    countedCash,
    expectedCash,
    variance: countedCash - expectedCash,
  };
}
