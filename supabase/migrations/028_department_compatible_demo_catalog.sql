-- Department-compatible demo catalog (idempotent; runs after 024–027).
--
-- Aligns stock/menu with real department workflows:
--   Butcher: goat pools (registration) + stk-beef-prime (kg)
--   Coffee House: raw beans/tea for daily consumption (no per-cup POS SKU)
--   Bars / Kitchen: leave existing SEED-OB rows intact
--
-- Operator checklist after applying:
-- 1. Hard refresh (or clear site local data if module_records stay cached).
-- 2. Butcher Items: goat pools + Prime Beef with Current > 0 and purchase price set.
-- 3. Goat Processing: demo goat active, pool kg left > 0.
-- 4. POS: Shekla → limb kg; Tri Sga → beef; Coffee sells without cup SKU block.
-- 5. Coffee House → Daily Consumption can post beans/tea.
-- 6. Main Bar / VIP Bar / Kitchen sellable qty still > 0 from 024 SEED-OB rows.

-- ---------------------------------------------------------------------------
-- 1. Core department raw items
-- ---------------------------------------------------------------------------
insert into public.inventory_items (
  id, name, category, base_unit, purchase_price, selling_price, vip_selling_price,
  standard_cost, reorder_level, preferred_location, supplier_name, conversions,
  track_batch_expiry, notes, opening_stock, active, created_at, updated_at
)
values
  (
    'stk-beef-prime',
    'Prime Beef',
    'Meat',
    'kg',
    780.00,
    0,
    null,
    764.40,
    25,
    'Butcher',
    'Merkato Meat Traders',
    '[]'::jsonb,
    false,
    'Butcher beef pool — kilo meat (Tri Sga, Zlzl, etc.)',
    40,
    true,
    now(),
    now()
  ),
  (
    'stk-coffee-beans',
    'Coffee Beans',
    'Coffee House',
    'kg',
    620.00,
    0,
    null,
    607.60,
    8,
    'Coffee House',
    'Sidama Coffee Union',
    '[]'::jsonb,
    false,
    'Coffee House raw stock — daily consumption (not POS cup deduction)',
    22,
    true,
    now(),
    now()
  ),
  (
    'stk-tea-leaves',
    'Tea Leaves',
    'Coffee House',
    'kg',
    280.00,
    0,
    null,
    274.40,
    4,
    'Coffee House',
    'Sidama Coffee Union',
    '[]'::jsonb,
    false,
    'Coffee House raw stock — tea / lemon tea daily consumption',
    10,
    true,
    now(),
    now()
  ),
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
    'Butcher goat pool — limb (Shekla/Kurete)',
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
    'Butcher goat pool — inside (Collection/Mlas Sember/Yefyel)',
    0,
    true,
    now(),
    now()
  ),
  (
    'stk-goat-bones',
    'Goat Bones (Kikl)',
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
    'Butcher goat pool — bones for Kikl (plate recipe)',
    0,
    true,
    now(),
    now()
  )
on conflict (id) do update set
  name = excluded.name,
  category = excluded.category,
  base_unit = excluded.base_unit,
  purchase_price = excluded.purchase_price,
  standard_cost = excluded.standard_cost,
  reorder_level = excluded.reorder_level,
  preferred_location = excluded.preferred_location,
  supplier_name = excluded.supplier_name,
  notes = excluded.notes,
  opening_stock = excluded.opening_stock,
  active = true,
  updated_at = now();

-- ---------------------------------------------------------------------------
-- 2. Opening balances + demo goat registration (ledger + lots)
-- ---------------------------------------------------------------------------
alter table public.inventory_ledger disable trigger inventory_ledger_immutable;

delete from public.inventory_ledger
where reference_no like 'SEED-DEPT-%'
   or entered_by = 'Department Catalog Seed';

delete from public.inventory_lots
where reference_no like 'SEED-DEPT-%'
   or id like 'seed-lot-dept-%';

delete from public.goat_registrations
where id = 'goat-reg-seed-demo-001';

insert into public.inventory_ledger (
  id, entry_type, entry_date, item_id, item_name, category, location,
  quantity, unit, unit_price, total_cost, quantity_in, quantity_out,
  entered_by, notes, reference_no, batch_number, immutable, transaction_at
)
values
  (
    'seed-dept-ob-butcher-beef',
    'OPENING_BALANCE',
    current_date,
    'stk-beef-prime',
    'Prime Beef',
    'Meat',
    'Butcher',
    40,
    'kg',
    780.00,
    31200.00,
    40,
    0,
    'Department Catalog Seed',
    'Butcher opening beef for POS kilo meat',
    'SEED-DEPT-BUTCHER-BEEF',
    null,
    true,
    now()
  ),
  (
    'seed-dept-ob-coffee-beans',
    'OPENING_BALANCE',
    current_date,
    'stk-coffee-beans',
    'Coffee Beans',
    'Coffee House',
    'Coffee House',
    22,
    'kg',
    620.00,
    13640.00,
    22,
    0,
    'Department Catalog Seed',
    'Coffee House opening beans for daily consumption',
    'SEED-DEPT-COFFEE-BEANS',
    null,
    true,
    now()
  ),
  (
    'seed-dept-ob-tea-leaves',
    'OPENING_BALANCE',
    current_date,
    'stk-tea-leaves',
    'Tea Leaves',
    'Coffee House',
    'Coffee House',
    10,
    'kg',
    280.00,
    2800.00,
    10,
    0,
    'Department Catalog Seed',
    'Coffee House opening tea for daily consumption',
    'SEED-DEPT-TEA-LEAVES',
    null,
    true,
    now()
  ),
  -- Demo goat: 50+60 limb, 30 inside, 10 bone @ ETB 15,000 → ~100/kg unit cost
  (
    'seed-dept-goat-limb',
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
    'Department Catalog Seed',
    'Demo goat registration — limb pool',
    'GOAT-GOAT-2026-SEED01',
    'GOAT-GOAT-2026-SEED01-LIMB',
    true,
    now()
  ),
  (
    'seed-dept-goat-inside',
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
    'Department Catalog Seed',
    'Demo goat registration — inside pool',
    'GOAT-GOAT-2026-SEED01',
    'GOAT-GOAT-2026-SEED01-INSIDE',
    true,
    now()
  ),
  (
    'seed-dept-goat-bone',
    'GOAT_REGISTRATION',
    current_date,
    'stk-goat-bones',
    'Goat Bones (Kikl)',
    'Meat',
    'Butcher',
    10,
    'kg',
    100.00,
    1000.00,
    10,
    0,
    'Department Catalog Seed',
    'Demo goat registration — bone pool',
    'GOAT-GOAT-2026-SEED01',
    'GOAT-GOAT-2026-SEED01-BONE',
    true,
    now()
  )
on conflict (id) do nothing;

alter table public.inventory_ledger enable trigger inventory_ledger_immutable;

insert into public.inventory_lots (
  id, item_id, item_name, location, batch_number, quantity, unit, unit_cost,
  status, received_at, reference_no, active, created_at, updated_at
)
values
  (
    'seed-lot-dept-beef',
    'stk-beef-prime',
    'Prime Beef',
    'Butcher',
    'SEED-DEPT-BUTCHER-BEEF',
    40,
    'kg',
    780.00,
    'Available',
    now(),
    'SEED-DEPT-BUTCHER-BEEF',
    true,
    now(),
    now()
  ),
  (
    'seed-lot-dept-coffee',
    'stk-coffee-beans',
    'Coffee Beans',
    'Coffee House',
    'SEED-DEPT-COFFEE-BEANS',
    22,
    'kg',
    620.00,
    'Available',
    now(),
    'SEED-DEPT-COFFEE-BEANS',
    true,
    now(),
    now()
  ),
  (
    'seed-lot-dept-tea',
    'stk-tea-leaves',
    'Tea Leaves',
    'Coffee House',
    'SEED-DEPT-TEA-LEAVES',
    10,
    'kg',
    280.00,
    'Available',
    now(),
    'SEED-DEPT-TEA-LEAVES',
    true,
    now(),
    now()
  ),
  (
    'seed-lot-dept-goat-limb',
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
    'seed-lot-dept-goat-inside',
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
  ),
  (
    'seed-lot-dept-goat-bone',
    'stk-goat-bones',
    'Goat Bones (Kikl)',
    'Butcher',
    'GOAT-GOAT-2026-SEED01-BONE',
    10,
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
  updated_at = now();

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
    'Department Catalog Seed',
    'Local',
    15000.00,
    'Demo Supplier',
    50,
    60,
    30,
    10,
    5,
    110,
    'Butcher',
    'active',
    'GOAT-GOAT-2026-SEED01',
    'Demo goat for Butcher House workspace',
    true,
    now(),
    now()
  )
on conflict (id) do update set
  status = 'active',
  active = true,
  purchase_price = excluded.purchase_price,
  front_leg_kg = excluded.front_leg_kg,
  back_leg_kg = excluded.back_leg_kg,
  inside_parts_kg = excluded.inside_parts_kg,
  bone_kg = excluded.bone_kg,
  waste_kg = excluded.waste_kg,
  limb_kg = excluded.limb_kg,
  updated_at = now();

-- ---------------------------------------------------------------------------
-- 3. Menu remaps
-- ---------------------------------------------------------------------------

-- Goat limb (kg)
insert into public.menu_items (
  id, name_en, name_am, category, price, cost, station, emoji, veg, active,
  vip_price, pricing_mode, unit_label, default_qty, qty_step, stock_sku
)
values
  (
    'kurete', 'Kurete', '', 'Meat', 4000.00, 0.00, 'Butcher House', 'K', false, true,
    5000.00, 'kg', 'kg', 0.5, 0.25, 'stk-goat-limb-meat'
  )
on conflict (id) do update set
  station = excluded.station,
  pricing_mode = excluded.pricing_mode,
  unit_label = excluded.unit_label,
  default_qty = excluded.default_qty,
  qty_step = excluded.qty_step,
  stock_sku = excluded.stock_sku,
  active = true,
  updated_at = now();

update public.menu_items
set
  pricing_mode = 'kg',
  unit_label = 'kg',
  default_qty = 0.5,
  qty_step = 0.25,
  stock_sku = 'stk-goat-limb-meat',
  station = 'Butcher House',
  active = true,
  updated_at = now()
where id = 'shekla';

update public.menu_items
set
  pricing_mode = 'kg',
  unit_label = 'kg',
  default_qty = 0.5,
  qty_step = 0.25,
  stock_sku = 'stk-goat-inside-parts',
  station = 'Butcher House',
  active = true,
  updated_at = now()
where id in ('collection-yefyel', 'mlas-sember', 'yefyel');

-- Kikl: recipe-driven bones (no direct stock_sku)
update public.menu_items
set
  stock_sku = '',
  unit_label = 'Plate',
  pricing_mode = 'unit',
  default_qty = 1,
  qty_step = 1,
  active = true,
  updated_at = now()
where id in ('kikl', 'm1783247305621')
   or lower(name_en) = 'kikl';

-- Beef kilo / portion menus → Prime Beef at Butcher
update public.menu_items
set
  stock_sku = 'stk-beef-prime',
  station = 'Butcher House',
  pricing_mode = 'kg',
  unit_label = 'kg',
  default_qty = 0.5,
  qty_step = 0.25,
  active = true,
  updated_at = now()
where id in (
  'tri-sga', 'gaz-layt', 'godn', 'grill-tibs', 'katelo',
  'wolando', 'zlzl', 'gubet'
);

update public.menu_items
set
  stock_sku = 'stk-beef-prime',
  station = 'Butcher House',
  active = true,
  updated_at = now()
where id in ('dulet', 'yeberi-dulet', 'ye-fyel-dulet', 'tebit');

-- Coffee House hot drinks: no POS auto-deduction (daily consumption owns raw stock)
update public.menu_items
set
  stock_sku = '',
  station = 'Coffee House',
  active = true,
  updated_at = now()
where id in (
  'm1782738284927', -- Keshir
  'm1782738316675', -- Lewuz
  'm1782738339804', -- Wetet
  'm1782738368138', -- Tea
  'm1782738395794', -- Lemon Tea
  'm1782752284800', -- Coffee
  'coffee'
)
   or (station = 'Coffee House' and category in ('Hot Drinks', 'Drinks'));

-- Ensure Kikl recipe row stays present
insert into public.module_records (module_key, record_id, data, position, active, updated_at)
values
  (
    'stock-recipes',
    'recipe-kikl-goat-bones',
    jsonb_build_object(
      'id', 'recipe-kikl-goat-bones',
      'menuItemName', 'Kikl',
      'category', 'Meat',
      'outputQty', 1,
      'outputUnit', 'plate',
      'stockDeductionLocation', 'Butcher',
      'preparationStation', 'Kitchen',
      'wastageAllowance', 0,
      'ingredients', jsonb_build_array(
        jsonb_build_object(
          'id', 'kikl-goat-bone-1',
          'itemId', 'stk-goat-bones',
          'itemName', 'Goat Bones (Kikl)',
          'quantity', 0.5,
          'unit', 'kg',
          'stockDeductionLocation', 'Butcher'
        )
      ),
      'notes', '1 plate Kikl = 0.5 kg goat bones from Butcher (adjust in Recipes if needed).',
      'updatedAt', to_char(now() at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')
    ),
    0,
    true,
    now()
  )
on conflict (module_key, record_id) do update set
  data = excluded.data,
  active = true,
  updated_at = now();

-- ---------------------------------------------------------------------------
-- 4. Deactivate obsolete per-menu Meat/Coffee pcs SKUs from 024
-- ---------------------------------------------------------------------------
update public.inventory_items
set active = false, updated_at = now()
where id in (
  'stk-shekla',
  'stk-mlas-sember',
  'stk-collection-yefyel',
  'stk-yefyel',
  'stk-tri-sga',
  'stk-gaz-layt',
  'stk-godn',
  'stk-grill-tibs',
  'stk-katelo',
  'stk-wolando',
  'stk-zlzl',
  'stk-gubet',
  'stk-dulet',
  'stk-tebit',
  'stk-ye-fyel-dulet',
  'stk-yeberi-dulet',
  'stk-m1783247305621',
  'stk-m1782738284927',
  'stk-m1782738316675',
  'stk-m1782738339804',
  'stk-m1782738368138',
  'stk-m1782738395794',
  'stk-m1782752284800'
);

-- ---------------------------------------------------------------------------
-- 5. Clear cached module_records so hydrate reloads normalized inventory
-- ---------------------------------------------------------------------------
delete from public.module_records
where module_key in (
  'stock-items',
  'stock-ledger',
  'stock-lots',
  'stock-location-policies',
  'goat-registrations'
);
