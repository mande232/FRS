-- Opt-in remap: only goat-linked POS menu items → kg pricing + goat pool stock SKUs.

insert into public.menu_items (
  id, name_en, name_am, category, price, cost, station, emoji, veg, active,
  vip_price, pricing_mode, unit_label, default_qty, qty_step, stock_sku
)
values
  (
    'kurete',
    'Kurete',
    '',
    'Meat',
    4000.00,
    0.00,
    'Butcher House',
    'K',
    false,
    true,
    5000.00,
    'kg',
    'kg',
    0.5,
    0.25,
    'stk-goat-limb-meat'
  )
on conflict (id) do update set
  name_en = excluded.name_en,
  station = excluded.station,
  price = excluded.price,
  vip_price = excluded.vip_price,
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
  updated_at = now()
where id = 'shekla';

update public.menu_items
set
  pricing_mode = 'kg',
  unit_label = 'kg',
  default_qty = 0.5,
  qty_step = 0.25,
  stock_sku = 'stk-goat-inside-parts',
  updated_at = now()
where id in ('collection-yefyel', 'mlas-sember');
