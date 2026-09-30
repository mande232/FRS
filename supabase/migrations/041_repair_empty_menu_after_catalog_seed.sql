-- Repair POS when a partial 024/031 catalog seed left stock in place but no
-- active menu_items. Those seeds used to deactivate every menu row before the
-- catalog upsert; a timeout or autocommit chunk after that left POS empty.
--
-- Safe to re-run. Does nothing when at least one active menu item already exists,
-- except ensuring production stations needed by the catalog FK.

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

insert into public.menu_categories (name, position)
values
  ('Whisky', 0),
  ('Soft Drinks', 1),
  ('Weyn', 2),
  ('Beer', 3),
  ('Other Drinks', 4),
  ('Fasting', 5),
  ('Meat', 6),
  ('Starters', 7),
  ('Extra', 8),
  ('Hot Drinks', 9),
  ('Traditional Drink', 10),
  ('Drinks', 11)
on conflict (name) do update set
  active = true,
  updated_at = now();

-- Path 1: catalog rows exist but were left inactive.
update public.menu_items
set active = true, updated_at = now()
where not exists (
  select 1 from public.menu_items existing where existing.active = true
);

-- Path 2: menu table is still empty — create sellable rows from active stock.
insert into public.menu_items (
  id, name_en, name_am, category, price, cost, station, emoji, veg, active,
  vip_price, pricing_mode, unit_label, default_qty, qty_step, stock_sku
)
select
  case when ii.id like 'stk-%' then substr(ii.id, 5) else ii.id end,
  ii.name,
  '',
  case ii.category
    when 'Soft Drink' then 'Soft Drinks'
    when 'Coffee House' then 'Hot Drinks'
    else ii.category
  end,
  coalesce(ii.selling_price, 0),
  0,
  case
    when ii.preferred_location in ('Main Bar', 'VIP Bar', 'Kitchen', 'Coffee House') then ii.preferred_location
    when ii.preferred_location = 'Butcher' then 'Butcher House'
    when ii.category in ('Beer', 'Soft Drink', 'Weyn') then 'Main Bar'
    when ii.category in ('Whisky') then 'VIP Bar'
    when ii.category in ('Meat') then 'Butcher House'
    when ii.category in ('Coffee House') then 'Coffee House'
    else 'Kitchen'
  end,
  upper(left(regexp_replace(ii.name, '[^A-Za-z0-9]', '', 'g'), 2)),
  false,
  true,
  ii.vip_selling_price,
  'unit',
  case
    when ii.base_unit in ('bottle', 'Bottle') then 'Bottle'
    when ii.base_unit in ('kg', 'Kg') then 'kg'
    when ii.base_unit in ('cup', 'Cup') then 'Cup'
    else coalesce(nullif(ii.base_unit, ''), 'pcs')
  end,
  1,
  1,
  ii.id
from public.inventory_items ii
where ii.active = true
  and coalesce(ii.selling_price, 0) > 0
  and ii.id not in (
    'stk-goat-limb-meat',
    'stk-goat-inside-parts',
    'stk-goat-bones',
    'stk-coffee-beans',
    'stk-tea-leaves',
    'stk-ginger',
    'stk-nuts',
    'stk-milk',
    'stk-beef-prime'
  )
  and not exists (select 1 from public.menu_items existing where existing.active = true)
on conflict (id) do update set
  name_en = excluded.name_en,
  category = excluded.category,
  price = excluded.price,
  station = excluded.station,
  vip_price = excluded.vip_price,
  unit_label = excluded.unit_label,
  stock_sku = excluded.stock_sku,
  active = true,
  updated_at = now();
