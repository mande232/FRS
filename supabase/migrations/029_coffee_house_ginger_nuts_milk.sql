-- Coffee House extended raw stock (idempotent).
-- Keshir → ginger (kg), Lewuz/nuts tea → nuts (kg), Wetet/milk → milk (liter).
-- POS still sells by cup; daily consumption posts raw qty.

insert into public.inventory_items (
  id, name, category, base_unit, purchase_price, selling_price, vip_selling_price,
  standard_cost, reorder_level, preferred_location, supplier_name, conversions,
  track_batch_expiry, notes, opening_stock, active, created_at, updated_at
)
values
  (
    'stk-ginger',
    'Ginger',
    'Coffee House',
    'kg',
    180.00,
    0,
    null,
    176.40,
    2,
    'Coffee House',
    'Atikilt Supplier PLC',
    '[]'::jsonb,
    false,
    'Coffee House raw stock — Keshir daily consumption (kg)',
    5,
    true,
    now(),
    now()
  ),
  (
    'stk-nuts',
    'Nuts (Lewuz)',
    'Coffee House',
    'kg',
    450.00,
    0,
    null,
    441.00,
    2,
    'Coffee House',
    'Merkato Dry Goods',
    '[]'::jsonb,
    false,
    'Coffee House raw stock — nuts tea / Lewuz daily consumption (kg)',
    4,
    true,
    now(),
    now()
  ),
  (
    'stk-milk',
    'Milk',
    'Coffee House',
    'liter',
    85.00,
    0,
    null,
    83.30,
    10,
    'Coffee House',
    'Dairy Supply',
    '[]'::jsonb,
    false,
    'Coffee House raw stock — milk cups via daily consumption (liter)',
    20,
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

alter table public.inventory_ledger disable trigger inventory_ledger_immutable;

insert into public.inventory_ledger (
  id, entry_type, entry_date, item_id, item_name, category, location,
  quantity, unit, unit_price, total_cost, quantity_in, quantity_out,
  entered_by, notes, reference_no, batch_number, immutable, transaction_at
)
values
  (
    'seed-dept-ob-ginger',
    'OPENING_BALANCE',
    current_date,
    'stk-ginger',
    'Ginger',
    'Coffee House',
    'Coffee House',
    5,
    'kg',
    180.00,
    900.00,
    5,
    0,
    'Department Catalog Seed',
    'Coffee House opening ginger for Keshir',
    'SEED-DEPT-GINGER',
    null,
    true,
    now()
  ),
  (
    'seed-dept-ob-nuts',
    'OPENING_BALANCE',
    current_date,
    'stk-nuts',
    'Nuts (Lewuz)',
    'Coffee House',
    'Coffee House',
    4,
    'kg',
    450.00,
    1800.00,
    4,
    0,
    'Department Catalog Seed',
    'Coffee House opening nuts for Lewuz',
    'SEED-DEPT-NUTS',
    null,
    true,
    now()
  ),
  (
    'seed-dept-ob-milk',
    'OPENING_BALANCE',
    current_date,
    'stk-milk',
    'Milk',
    'Coffee House',
    'Coffee House',
    20,
    'liter',
    85.00,
    1700.00,
    20,
    0,
    'Department Catalog Seed',
    'Coffee House opening milk (liter) for cup sales',
    'SEED-DEPT-MILK',
    null,
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
    'seed-lot-dept-ginger',
    'stk-ginger',
    'Ginger',
    'Coffee House',
    'SEED-DEPT-GINGER',
    5,
    'kg',
    180.00,
    'Available',
    now(),
    'SEED-DEPT-GINGER',
    true,
    now(),
    now()
  ),
  (
    'seed-lot-dept-nuts',
    'stk-nuts',
    'Nuts (Lewuz)',
    'Coffee House',
    'SEED-DEPT-NUTS',
    4,
    'kg',
    450.00,
    'Available',
    now(),
    'SEED-DEPT-NUTS',
    true,
    now(),
    now()
  ),
  (
    'seed-lot-dept-milk',
    'stk-milk',
    'Milk',
    'Coffee House',
    'SEED-DEPT-MILK',
    20,
    'liter',
    85.00,
    'Available',
    now(),
    'SEED-DEPT-MILK',
    true,
    now(),
    now()
  )
on conflict (id) do update set
  quantity = excluded.quantity,
  unit = excluded.unit,
  unit_cost = excluded.unit_cost,
  status = 'Available',
  active = true,
  updated_at = now();

-- Keep Coffee House drinks on empty stock_sku (daily consumption owns raw stock)
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
);
