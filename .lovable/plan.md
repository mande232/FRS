
# Ethiopian F&B Management System — Master Plan

A unified hospitality platform for restaurants, cafés, hotels, bars, catering, banquet halls, and multi-branch chains, tuned to Ethiopian operational, fiscal, and connectivity realities.

---

## 1. System Overview

A cloud-first, offline-capable F&B suite that connects the front of house (QR menus, POS, reservations), the back of house (KDS, inventory, procurement, recipes), and management (analytics, finance, multi-branch admin) in one product.

Core promises:
- Works on cheap Android tablets and low-end laptops.
- Keeps taking orders and printing receipts when the internet drops.
- Speaks Amharic and English, prices in ETB, dates in Ethiopian calendar, taxes at 15% VAT.
- Accepts Telebirr, CBE Birr, cash, card, and bank transfer.
- Scales from a single café to a hotel group with many outlets.

Primary users: owners, managers, cashiers, waiters, kitchen staff, bartenders, storekeepers, procurement officers, accountants, event coordinators, and guests (via QR).

---

## 2. Main Modules

1. Digital Menu & QR Ordering — guest-facing menu per table/room, multilingual, photos, allergens, add-to-cart, call waiter, pay later or pay now.
2. POS & Billing — fast touch POS, split bills, discounts, service charge, VAT, receipt printing, fiscal-friendly invoice numbering.
3. Order Management — dine-in, takeaway, delivery, room service, banquet, catering — one pipeline, different fulfillment paths.
4. Kitchen Display System (KDS) — station-based tickets (hot, cold, grill, bar), timers, bump/recall, course firing.
5. Tables & Reservations — floor plan, table status, walk-ins, reservations, deposits, waitlist, SMS confirmations.
6. Inventory & Stock — real-time stock per branch/store, transfers, wastage, stock counts, expiry tracking, low-stock alerts.
7. Procurement & Suppliers — supplier directory, purchase requests, POs, GRNs, supplier price history, payables.
8. Recipes & Food Cost — BOM per menu item, sub-recipes, yield, theoretical vs actual cost, margin analysis.
9. Bar & Beverage — pour sizes, cocktails, bottle inventory, liquor variance, happy-hour pricing.
10. Room Service — link to hotel room/folio, charge-to-room, in-room dining menu, tray tracking.
11. Banquet & Events — function sheets, BEO (Banquet Event Order), hall booking, packages, deposits.
12. Catering — offsite events, quotations, packing lists, vehicle/staff assignment, delivery confirmation.
13. Customer Management (CRM) — profiles, loyalty points, visit history, marketing segments, feedback.
14. Employee & Roles — staff directory, shifts, attendance, role-based permissions, tip pool.
15. Payments — Telebirr, CBE Birr, cash, card (Amole/CBE/POS terminals), bank transfer, reconciliation.
16. Reports & Analytics — sales, item performance, cost, payroll, taxes, branch comparisons, exports.
17. System Administration — multi-branch, multi-outlet, taxes, printers, devices, audit logs, backups.

---

## 3. User Roles

- Super Admin — owns the tenant, manages branches, billing, global config.
- Branch Manager — runs one branch: staff, menu, prices, reports.
- Cashier — POS, payments, end-of-shift cash-up.
- Waiter / Captain — table orders, reservations, guest requests.
- Kitchen Staff — KDS only, no pricing access.
- Bartender — bar POS + beverage stock.
- Storekeeper — receive goods, transfers, stock counts.
- Procurement Officer — suppliers, POs, price negotiation.
- Chef / Cost Controller — recipes, food cost, wastage.
- Event Coordinator — banquets and catering bookings.
- Accountant — payments, VAT, supplier payments, exports.
- HR — staff records, attendance, payroll inputs.
- Customer (Guest) — QR menu, self-order, view bill, pay, feedback.

Roles are composable (a manager can also be a cashier). Permissions are checked server-side on every request.

---

## 4. Key Features (Ethiopia-specific)

- ETB as base currency, optional USD display for hotels.
- Bilingual UI: Amharic (አማርኛ) and English, per-user preference; menu items support both languages and per-language descriptions.
- Dual calendar: Ethiopian calendar for operations and reports, Gregorian for international guests and exports.
- 15% VAT engine with VAT-inclusive and VAT-exclusive pricing modes, plus 10% service charge toggle.
- Fiscal-style sequential invoice numbers per branch with daily Z-reports.
- Payments: Telebirr (deep-link + webhook), CBE Birr (USSD reference + webhook), cash, card via external POS terminal, bank transfer with reference upload.
- Offline mode: PWA + IndexedDB queue — POS, KDS, and menu keep working without internet and sync on reconnect.
- Multi-branch, multi-outlet (one branch can have restaurant + bar + room service as separate outlets sharing inventory).
- Designed for non-technical users: large buttons, icons over text, default flows in 2–3 taps.
- Receipt and KOT printing via 58mm/80mm thermal printers (network and USB).

---

## 5. Database Structure (high level)

Multi-tenant Postgres on Lovable Cloud, with Row Level Security per `tenant_id` and `branch_id`.

Core tables:
- tenants, branches, outlets, devices, printers
- users, roles, user_roles, permissions, shifts, attendance
- customers, loyalty_accounts, loyalty_transactions, feedback
- menu_categories, menu_items (i18n: name_en, name_am), modifiers, modifier_groups, item_prices (per outlet)
- recipes, recipe_ingredients, sub_recipes, yields, wastage
- inventory_items, stock_levels (per store), stock_movements, transfers, stock_counts, expiry_lots
- suppliers, purchase_requests, purchase_orders, po_items, goods_receipts, supplier_invoices, supplier_payments
- tables, floor_plans, reservations, waitlist
- orders, order_items, order_modifiers, order_status_history, kots
- bills, bill_items, payments, payment_methods, refunds, voids, discounts
- tax_rules (VAT 15%), service_charge_rules
- banquet_events, beo_lines, halls, hall_bookings
- catering_jobs, catering_packing_lists, vehicles, deliveries
- rooms, room_folios, room_service_orders (hotel)
- bar_pour_sizes, cocktails, bottle_inventory
- audit_logs, sync_queue, offline_events, files

Conventions: UUID PKs, `created_at/updated_at`, soft delete via `deleted_at`, every public table gets explicit GRANTs + RLS policies scoped by `tenant_id` and role.

---

## 6. Main Dashboards & Pages

- Owner / Super Admin: revenue across branches, top items, cost %, cash position, alerts.
- Branch Manager: today's sales, covers, table turnover, labor cost, low stock, pending POs.
- POS screen: categories grid, modifiers, table/room picker, hold/fire, split bill, payment sheet.
- KDS: ticket columns per station, color-coded timers, bump/recall, all-day view.
- Waiter app (tablet/phone): tables, take order, send to KDS, request bill.
- Reservations: calendar + floor plan, drag to assign, deposit status.
- Inventory: stock on hand, movements, transfers, counts, expiry alerts.
- Procurement: requisitions → POs → GRNs → supplier invoices.
- Recipes & Cost: recipe editor, theoretical food cost %, variance report.
- Bar: pour log, variance, bottle inventory.
- Banquet/Events: calendar of halls, BEO editor, packages, deposit tracking.
- Catering: jobs board, packing list, delivery status.
- CRM: customer search, profile, loyalty, marketing segments.
- HR: staff list, shifts, attendance, tip pool.
- Reports: sales, items, payments, taxes (VAT return), cost, payroll, supplier ledger, audit.
- Admin: branches, outlets, users, roles, printers, devices, taxes, languages, payment providers, backups.

Guest-facing:
- /m/{branch}/{table} — QR menu, order, call waiter, view bill, pay.
- /book/{branch} — public reservation page.
- /events/{branch} — catering and banquet inquiry form.

---

## 7. Workflows (representative)

Dine-in with QR:
1. Guest scans QR → menu loads in their language.
2. Guest adds items → order hits POS as "pending guest order".
3. Waiter confirms → KDS fires tickets per station.
4. Kitchen bumps items → waiter delivers.
5. Guest requests bill → cashier applies VAT + service charge → guest pays via Telebirr/CBE Birr/cash/card.
6. Stock decrements via recipe BOM; loyalty points credited.

Procurement:
Requisition → manager approval → PO to supplier → GRN at store → stock updated → supplier invoice → payment → supplier ledger.

Banquet:
Inquiry → quotation → deposit → BEO with menu, hall, staffing → execution day → final invoice → feedback.

Offline POS:
Device loses internet → POS keeps working from local cache → orders/payments queued → on reconnect, queue replays with server-side conflict resolution (server timestamps win for stock, device sequence wins for invoice numbers within its reserved range).

---

## 8. Implementation Phases

Phase 1 — Foundation (Weeks 1–3)
Tenants, branches, users/roles, auth, i18n (EN/AM), ETB + VAT engine, Ethiopian calendar utilities, design system, base layouts.

Phase 2 — Menu, POS, Payments (Weeks 4–7)
Menu builder, POS, bills, cash + Telebirr + CBE Birr + card + bank transfer, receipt printing, Z-reports.

Phase 3 — Orders, KDS, Tables, QR (Weeks 8–10)
Order pipeline, KDS, floor plan, reservations, public QR menu, guest self-order.

Phase 4 — Inventory, Recipes, Procurement (Weeks 11–14)
Stock, transfers, counts, recipes, food cost, suppliers, POs, GRNs.

Phase 5 — Bar, Room Service, Banquet, Catering (Weeks 15–18)
Bar pour control, room-charge integration, BEO, catering jobs.

Phase 6 — CRM, HR, Analytics (Weeks 19–21)
Loyalty, feedback, shifts/attendance, full analytics, VAT report exports.

Phase 7 — Offline, Hardening, Pilot (Weeks 22–24)
PWA + sync queue, load test, security audit, pilot with 1 restaurant + 1 hotel, training materials in Amharic and English.

Phase 8 — Rollout
Multi-branch onboarding, support playbook, paid plans.

---

## 9. Recommended Technology Stack

- Frontend: TanStack Start (React 19, Vite 7), Tailwind v4, shadcn/ui, TanStack Query, PWA with service worker + IndexedDB for offline.
- Backend: Lovable Cloud (Postgres + Auth + Storage + Server Functions) with RLS for multi-tenant isolation.
- Server logic: `createServerFn` for app RPCs, `/api/public/*` routes for Telebirr/CBE webhooks.
- i18n: `i18next` with `am` and `en` resource bundles; Ethiopian calendar via a small utility (Ethiopic ↔ Gregorian).
- Realtime: Supabase Realtime for KDS, table status, and order updates.
- Printing: WebUSB / network print bridge for ESC/POS thermal printers.
- Payments: Telebirr Merchant API, CBE Birr API, manual reconciliation flow for bank transfer and card terminals.
- Analytics: SQL views + Recharts; exports to CSV/Excel and PDF.
- Hosting: Lovable Cloud edge runtime; assets on CDN.

---

## 10. Security Requirements

- RLS on every public table, scoped by `tenant_id` and (where relevant) `branch_id`.
- Roles in a separate `user_roles` table, checked via `SECURITY DEFINER` `has_role()` — never store roles on profiles.
- Server-side authorization on every server function; client checks are UX only.
- Webhook endpoints under `/api/public/*` must verify HMAC signatures from Telebirr/CBE before any DB write.
- Secrets (provider keys, signing secrets) stored as server-side secrets, never shipped to the client.
- PII minimization for guests (phone optional, hashed for loyalty lookup).
- Full audit log for price changes, voids, refunds, discounts, stock adjustments, and role changes.
- Daily automated backups; point-in-time restore for the tenant DB.
- Rate limiting on auth, QR ordering, and webhook endpoints.
- HTTPS only; strict CSP; password policy + optional 2FA for managers and above.
- Offline queue is encrypted at rest in IndexedDB; device must be paired and revocable from admin.

---

## 11. Future Improvements

- AI menu insights: suggested prices, item bundling, demand forecasting.
- Voice ordering in Amharic for waiters.
- WhatsApp/Telegram ordering bot.
- Driver app for catering and delivery with live tracking.
- Accounting integration (Peachtree, QuickBooks, Odoo) and Ethiopian e-invoicing when standardized.
- Franchise mode with central menu + local overrides.
- Guest mobile app with wallet and loyalty.
- Hardware bundle: pre-configured Android POS + thermal printer + cash drawer.
- Marketplace for suppliers (B2B procurement across tenants).
- ML-based theft/variance detection in bar and stores.

---

## Technical Notes

- Multi-tenancy: single Postgres, `tenant_id` on every row, RLS by tenant; option to shard hot tenants later.
- Invoice numbering: per-branch sequence reserved in blocks to support offline issuance without collisions.
- Calendar: store timestamps in UTC; render via Ethiopian or Gregorian formatter based on user preference.
- Money: store amounts as integer cents (ETB) to avoid float drift; format with `am-ET` / `en-ET` locale.
- Printing bridge: small local helper app for Windows/Android when WebUSB is unavailable.

---

Approve this plan and I'll start with Phase 1 (foundation: tenants, branches, auth, roles, i18n EN/AM, ETB + VAT, Ethiopian calendar, base design system and shell).
