-- Slim test catalog: one sellable path per non-butcher department.
-- Butcher House is goat-processing based (limb + inside pools only).
--
-- Kept catalog:
--   Main Bar     → Habesha             (stk-habesha)
--   VIP Bar      → Amarula             (stk-amarula)
--   Kitchen      → Telba Juice         (stk-areki)
--   Coffee House → Coffee              (daily raw: stk-coffee-beans)
--   Butcher House (goat processing):
--     Shekla     → stk-goat-limb-meat
--     Yefyel     → stk-goat-inside-parts
--     + demo goat registration with limb/inside pool qty
--   (No Kikl / stk-goat-bones in this slim set.)
--
-- Also consolidates production stations to a single butcher workstation (Butcher House).
-- Stock location code remains "Butcher".
--
-- Apply after 024–030. Hard refresh the app (or clear module_records cache) after migrate.
-- If POS/Menu is still empty, apply 033_repair_empty_menu_after_catalog_seed.sql.

-- ---------------------------------------------------------------------------
-- 0. Production stations: only one butcher workstation
-- ---------------------------------------------------------------------------
update public.production_stations
set active = false, updated_at = now()
where name not in ('Main Bar', 'VIP Bar', 'Kitchen', 'Coffee House', 'Butcher House');

insert into public.production_stations (name, position)
values
  ('Kitchen', 0),
  ('Main Bar', 1),
  ('Butcher House', 2),
  ('Coffee House', 3),
  ('VIP Bar', 4)
on conflict (name) do update set
  active = true,
  position = excluded.position,
  updated_at = now();

update public.production_stations
set active = false, updated_at = now()
where name in ('Butcher', 'Bar');

-- ---------------------------------------------------------------------------
-- 1. Inventory: bar/kitchen/coffee + goat pools (Butcher House)
-- ---------------------------------------------------------------------------
insert into public.inventory_items (
  id, name, category, base_unit, purchase_price, selling_price, vip_selling_price,
  standard_cost, reorder_level, preferred_location, supplier_name, conversions,
  track_batch_expiry, notes, opening_stock, active, created_at, updated_at
)
values
  ('stk-habesha', 'Habesha', 'Beer', 'bottle', 60.00, 120.00, 300.00, 58.80, 24, 'Store 1', 'Dashen Brewery', '[]'::jsonb, false, 'Slim test catalog — Main Bar', 48, true, now(), now()),
  ('stk-amarula', 'Amarula', 'Whisky', 'bottle', 11000.00, 20000.00, 600.00, 10780.00, 2, 'Store 1', 'Addis Beverage Supply', '[]'::jsonb, false, 'Slim test catalog — VIP Bar', 12, true, now(), now()),
  ('stk-areki', 'Telba Juice', 'Soft Drink', 'bottle', 60.00, 150.00, 200.00, 58.80, 6, 'Store 1', 'Addis Beverage Supply', '[]'::jsonb, false, 'Slim test catalog — Kitchen', 24, true, now(), now()),
  ('stk-coffee-beans', 'Coffee Beans', 'Coffee House', 'kg', 620.00, 0, null, 607.60, 8, 'Coffee House', 'Sidama Coffee Union', '[]'::jsonb, false, 'Slim test catalog — Coffee House daily raw', 10, true, now(), now()),
  (
    'stk-goat-limb-meat',
    'Goat Limb Meat (Front+Back)',
    'Meat',
    'kg',
    100.00,
    0,
    null,
    98.00,
    5,
    'Butcher',
    'Direct purchase',
    '[]'::jsonb,
    false,
    'Butcher goat pool — limb (Shekla)',
    0,
    true,
    now(),
    now()
  ),
  (
    'stk-goat-inside-parts',
    'Goat Inside Parts',
    'Meat',
    'kg',
    100.00,
    0,
    null,
    98.00,
    5,
    'Butcher',
    'Direct purchase',
    '[]'::jsonb,
    false,
    'Butcher goat pool — inside (Yefyel)',
    0,
    true,
    now(),
    now()
  )
on conflict (id) do update set
  active = true,
  name = excluded.name,
  category = excluded.category,
  base_unit = excluded.base_unit,
  purchase_price = excluded.purchase_price,
  standard_cost = excluded.standard_cost,
  reorder_level = excluded.reorder_level,
  preferred_location = excluded.preferred_location,
  supplier_name = excluded.supplier_name,
  notes = excluded.notes,
  updated_at = now();

-- Deactivate every other inventory SKU (keep slim set + limb/inside goat pools only).
update public.inventory_items
set active = false, updated_at = now()
where id not in (
  'stk-habesha',
  'stk-amarula',
  'stk-areki',
  'stk-coffee-beans',
  'stk-goat-limb-meat',
  'stk-goat-inside-parts'
);

-- ---------------------------------------------------------------------------
-- 2. Opening balances + demo goat registration ledger/lots
-- ---------------------------------------------------------------------------
alter table public.inventory_ledger disable trigger inventory_ledger_immutable;

delete from public.inventory_ledger
where reference_no like 'SEED-OB-%'
   or reference_no like 'SEED-SLIM-%'
   or reference_no like 'SEED-DEPT-%'
   or reference_no like 'GOAT-GOAT-%'
   or entered_by in ('Catalog Seed', 'Slim Catalog Seed', 'Department Catalog Seed');

delete from public.inventory_lots
where reference_no like 'SEED-OB-%'
   or reference_no like 'SEED-SLIM-%'
   or reference_no like 'SEED-DEPT-%'
   or reference_no like 'GOAT-GOAT-%'
   or id like 'seed-lot-%'
   or id like 'seed-slim-lot-%';

insert into public.inventory_ledger (
  id, entry_type, entry_date, item_id, item_name, category, location,
  quantity, unit, unit_price, total_cost, quantity_in, quantity_out,
  entered_by, notes, reference_no, batch_number, immutable, transaction_at
)
values
  -- Store 1
  ('seed-slim-s1-habesha', 'OPENING_BALANCE', current_date, 'stk-habesha', 'Habesha', 'Beer', 'Store 1', 48, 'bottle', 60.00, 2880.00, 48, 0, 'Slim Catalog Seed', 'Store 1 opening', 'SEED-SLIM-S1-habesha', null, true, now()),
  ('seed-slim-s1-amarula', 'OPENING_BALANCE', current_date, 'stk-amarula', 'Amarula', 'Whisky', 'Store 1', 12, 'bottle', 11000.00, 132000.00, 12, 0, 'Slim Catalog Seed', 'Store 1 opening', 'SEED-SLIM-S1-amarula', null, true, now()),
  ('seed-slim-s1-areki', 'OPENING_BALANCE', current_date, 'stk-areki', 'Telba Juice', 'Soft Drink', 'Store 1', 24, 'bottle', 60.00, 1440.00, 24, 0, 'Slim Catalog Seed', 'Store 1 opening', 'SEED-SLIM-S1-areki', null, true, now()),
  -- Departments
  ('seed-slim-main-habesha', 'OPENING_BALANCE', current_date, 'stk-habesha', 'Habesha', 'Beer', 'Main Bar', 48, 'bottle', 60.00, 2880.00, 48, 0, 'Slim Catalog Seed', 'Main Bar POS opening', 'SEED-SLIM-MAIN-habesha', null, true, now()),
  ('seed-slim-vip-amarula', 'OPENING_BALANCE', current_date, 'stk-amarula', 'Amarula', 'Whisky', 'VIP Bar', 6, 'bottle', 11000.00, 66000.00, 6, 0, 'Slim Catalog Seed', 'VIP Bar POS opening', 'SEED-SLIM-VIP-amarula', null, true, now()),
  ('seed-slim-kit-areki', 'OPENING_BALANCE', current_date, 'stk-areki', 'Telba Juice', 'Soft Drink', 'Kitchen', 24, 'bottle', 60.00, 1440.00, 24, 0, 'Slim Catalog Seed', 'Kitchen POS opening', 'SEED-SLIM-KIT-areki', null, true, now()),
  ('seed-slim-coffee-beans', 'OPENING_BALANCE', current_date, 'stk-coffee-beans', 'Coffee Beans', 'Coffee House', 'Coffee House', 10, 'kg', 620.00, 6200.00, 10, 0, 'Slim Catalog Seed', 'Coffee House daily raw opening', 'SEED-SLIM-COFFEE-beans', null, true, now()),
  -- Demo goat: 50+60 limb, 30 inside @ ETB 14,000 → 100/kg (bones not stocked)
  (
    'seed-slim-goat-limb',
    'GOAT_REGISTRATION',
    current_date,
    'stk-goat-limb-meat',
    'Goat Limb Meat (Front+Back)',
    'Meat',
    'Butcher',
    110,
    'kg',
    100.00,
    11000.00,
    110,
    0,
    'Slim Catalog Seed',
    'Demo goat registration — limb pool',
    'GOAT-GOAT-2026-SEED01',
    'GOAT-GOAT-2026-SEED01-LIMB',
    true,
    now()
  ),
  (
    'seed-slim-goat-inside',
    'GOAT_REGISTRATION',
    current_date,
    'stk-goat-inside-parts',
    'Goat Inside Parts',
    'Meat',
    'Butcher',
    30,
    'kg',
    100.00,
    3000.00,
    30,
    0,
    'Slim Catalog Seed',
    'Demo goat registration — inside pool',
    'GOAT-GOAT-2026-SEED01',
    'GOAT-GOAT-2026-SEED01-INSIDE',
    true,
    now()
  );

alter table public.inventory_ledger enable trigger inventory_ledger_immutable;

insert into public.inventory_lots (
  id, item_id, item_name, location, batch_number, quantity, unit, unit_cost,
  status, received_at, reference_no, active, created_at, updated_at
)
values
  (
    'seed-slim-lot-goat-limb',
    'stk-goat-limb-meat',
    'Goat Limb Meat (Front+Back)',
    'Butcher',
    'GOAT-GOAT-2026-SEED01-LIMB',
    110,
    'kg',
    100.00,
    'Available',
    now(),
    'GOAT-GOAT-2026-SEED01',
    true,
    now(),
    now()
  ),
  (
    'seed-slim-lot-goat-inside',
    'stk-goat-inside-parts',
    'Goat Inside Parts',
    'Butcher',
    'GOAT-GOAT-2026-SEED01-INSIDE',
    30,
    'kg',
    100.00,
    'Available',
    now(),
    'GOAT-GOAT-2026-SEED01',
    true,
    now(),
    now()
  )
on conflict (id) do update set
  quantity = excluded.quantity,
  unit_cost = excluded.unit_cost,
  status = 'Available',
  active = true,
  reference_no = excluded.reference_no,
  updated_at = now();

-- Drop any leftover bone lots from prior seeds.
update public.inventory_lots
set active = false, status = 'Blocked', updated_at = now()
where item_id = 'stk-goat-bones';

insert into public.goat_registrations (
  id, document_no, registered_at, registered_by, goat_type, purchase_price, supplier_name,
  front_leg_kg, back_leg_kg, inside_parts_kg, bone_kg, waste_kg, limb_kg,
  location, status, reference_no, notes, active, created_at, updated_at
)
values
  (
    'goat-reg-seed-demo-001',
    'GOAT-2026-SEED01',
    now(),
    'Slim Catalog Seed',
    'Local',
    14000.00,
    'Demo Supplier',
    50,
    60,
    30,
    0,
    5,
    110,
    'Butcher',
    'active',
    'GOAT-GOAT-2026-SEED01',
    'Demo goat for Butcher House (limb + inside only)',
    true,
    now(),
    now()
  )
on conflict (id) do update set
  status = 'active',
  active = true,
  registered_by = excluded.registered_by,
  purchase_price = excluded.purchase_price,
  supplier_name = excluded.supplier_name,
  front_leg_kg = excluded.front_leg_kg,
  back_leg_kg = excluded.back_leg_kg,
  inside_parts_kg = excluded.inside_parts_kg,
  bone_kg = excluded.bone_kg,
  waste_kg = excluded.waste_kg,
  limb_kg = excluded.limb_kg,
  notes = excluded.notes,
  updated_at = now();

-- Clear client caches so hydrate reloads normalized inventory + goat docs.
delete from public.module_records
where module_key in (
  'stock-items',
  'stock-ledger',
  'stock-lots',
  'stock-location-policies',
  'stock-goat-registrations',
  'goat-registrations',
  'stock-daily-consumptions'
);

-- Remove Kikl bone recipe from slim catalog.
delete from public.module_records
where module_key = 'stock-recipes'
  and record_id = 'recipe-kikl-goat-bones';

-- ---------------------------------------------------------------------------
-- 3. Menu categories (minimal)
-- ---------------------------------------------------------------------------
insert into public.menu_categories (name, position)
values
  ('Beer', 0),
  ('Whisky', 1),
  ('Other Drinks', 2),
  ('Meat', 3),
  ('Hot Drinks', 4)
on conflict (name) do update set
  active = true,
  updated_at = now();

-- ---------------------------------------------------------------------------
-- 4. Menu items — one per non-butcher dept; butcher = goat processing set
-- ---------------------------------------------------------------------------
-- Upsert first, then hide the rest. Deactivating everything before insert left
-- POS empty when this statement ran in a separate autocommit chunk.
insert into public.menu_items (
  id, name_en, name_am, category, price, cost, station, emoji, veg, active,
  vip_price, pricing_mode, unit_label, default_qty, qty_step, stock_sku
)
values
  (
    'habesha', 'Habesha', '', 'Beer', 120.00, 0.00, 'Main Bar', 'HA', false, true,
    300.00, 'unit', 'Bottle', 1, 1, 'stk-habesha'
  ),
  (
    'amarula', 'Amarula', '', 'Whisky', 20000.00, 0.00, 'VIP Bar', 'A', false, true,
    600.00, 'unit', 'Bottle', 1, 1, 'stk-amarula'
  ),
  (
    'areki', 'Telba Juice', 'Telba Juice', 'Other Drinks', 150.00, 0.00, 'Kitchen', 'TJ', false, true,
    200.00, 'unit', 'Bottle', 1, 1, 'stk-areki'
  ),
  (
    'm1782752284800', 'Coffee', '', 'Hot Drinks', 50.00, 0.00, 'Coffee House', 'CF', false, true,
    null, 'unit', 'Cup', 1, 1, ''
  ),
  -- Butcher House goat processing sellables (limb + inside only)
  (
    'shekla', 'Shekla', '', 'Meat', 4000.00, 0.00, 'Butcher House', 'S', false, true,
    5000.00, 'kg', 'kg', 0.5, 0.25, 'stk-goat-limb-meat'
  ),
  (
    'yefyel', 'Yefyel', '', 'Meat', 4000.00, 0.00, 'Butcher House', 'Y', false, true,
    5000.00, 'kg', 'kg', 0.5, 0.25, 'stk-goat-inside-parts'
  )
on conflict (id) do update set
  name_en = excluded.name_en,
  name_am = excluded.name_am,
  category = excluded.category,
  price = excluded.price,
  station = excluded.station,
  emoji = excluded.emoji,
  active = true,
  vip_price = excluded.vip_price,
  pricing_mode = excluded.pricing_mode,
  unit_label = excluded.unit_label,
  default_qty = excluded.default_qty,
  qty_step = excluded.qty_step,
  stock_sku = excluded.stock_sku,
  updated_at = now();

update public.menu_items
set active = false, updated_at = now()
where id not in (
  'habesha',
  'amarula',
  'areki',
  'm1782752284800',
  'shekla',
  'yefyel'
);

-- Ensure Kikl stays inactive in the slim catalog.
update public.menu_items
set active = false, updated_at = now()
where id in ('kikl', 'm1783247305621')
   or lower(name_en) = 'kikl';

-- VIP spirit pour prices for Amarula (Bottle stays in price).
update public.menu_items
set
  single_price = 300.00,
  double_price = 600.00,
  vip_price = null,
  updated_at = now()
where id = 'amarula';
