alter table public.menu_items
  add column if not exists vip_price numeric(12, 2) not null default 0;

alter table public.menu_items
  add column if not exists pricing_mode text not null default 'unit' check (pricing_mode in ('unit', 'kg')),
  add column if not exists default_qty numeric(12, 3) not null default 1,
  add column if not exists qty_step numeric(12, 3) not null default 1,
  add column if not exists stock_sku text not null default '';

insert into public.menu_categories (name, position)
values
  ('Breakfast', 0),
  ('Vegetarian', 1),
  ('Mains', 2),
  ('Starters', 3),
  ('Drinks', 4)
on conflict (name) do update set
  position = excluded.position,
  active = true,
  updated_at = now();

insert into public.menu_items (
  id,
  name_en,
  name_am,
  category,
  price,
  vip_price,
  cost,
  station,
  emoji,
  pricing_mode,
  default_qty,
  qty_step,
  active
)
values
  ('ater-fitfit', 'Ater Fitfit', '', 'Breakfast', 350, 500, 0, 'Kitchen', 'AF', 'unit', 1, 1, true),
  ('drekosh-firfir', 'Drekosh Firfir', '', 'Breakfast', 350, 500, 0, 'Kitchen', 'DF', 'unit', 1, 1, true),
  ('gomen-kitfo', 'Gomen Kitfo', '', 'Vegetarian', 400, 500, 0, 'Kitchen', 'GK', 'unit', 1, 1, true),
  ('gomen-tibs', 'Gomen Tibs', '', 'Vegetarian', 400, 500, 0, 'Kitchen', 'GT', 'unit', 1, 1, true),
  ('haf-haaf', 'Haf Haaf', '', 'Breakfast', 400, 500, 0, 'Kitchen', 'HH', 'unit', 1, 1, true),
  ('kik-bedst', 'Kik Bedst', '', 'Breakfast', 350, 500, 0, 'Kitchen', 'KB', 'unit', 1, 1, true),
  ('mekoreni-be-atkilt', 'Mekoreni be Atkilt', '', 'Vegetarian', 350, 500, 0, 'Kitchen', 'MKA', 'unit', 1, 1, true),
  ('mekoreni-be-sgo', 'Mekoreni be Sgo', '', 'Mains', 350, 500, 0, 'Kitchen', 'MKS', 'unit', 1, 1, true),
  ('metbesh-shiro', 'Metbesh Shiro', '', 'Vegetarian', 400, 500, 0, 'Kitchen', 'MSH', 'unit', 1, 1, true),
  ('misir-wet', 'Misir Wet', '', 'Vegetarian', 400, 500, 0, 'Kitchen', 'MW', 'unit', 1, 1, true),
  ('normal-firfir', 'Normal Firfir', '', 'Breakfast', 350, 500, 0, 'Kitchen', 'NF', 'unit', 1, 1, true),
  ('pasta-be-atkilt', 'Pasta be Atkilt', '', 'Vegetarian', 350, 500, 0, 'Kitchen', 'PBA', 'unit', 1, 1, true),
  ('pasta-be-sgo', 'Pasta be Sgo', '', 'Mains', 350, 500, 0, 'Kitchen', 'PBS', 'unit', 1, 1, true),
  ('selata', 'Selata', '', 'Starters', 350, 500, 0, 'Kitchen', 'SE', 'unit', 1, 1, true),
  ('suf-fitfit', 'Suf Fitfit', '', 'Breakfast', 350, 500, 0, 'Kitchen', 'SF', 'unit', 1, 1, true),
  ('telba-fitfit', 'Telba Fitfit', '', 'Breakfast', 350, 500, 0, 'Kitchen', 'TF', 'unit', 1, 1, true),
  ('telba-juice', 'Telba Juice', '', 'Drinks', 100, 150, 0, 'Bar', 'TJ', 'unit', 1, 1, true),
  ('timatim-kurt', 'Timatim Kurt', '', 'Starters', 350, 500, 0, 'Kitchen', 'TK', 'unit', 1, 1, true),
  ('timatim-lebleb', 'Timatim Lebleb', '', 'Starters', 350, 500, 0, 'Kitchen', 'TL', 'unit', 1, 1, true),
  ('kikl', 'Kikl', '', 'Mains', 800, 1000, 0, 'Kitchen', 'KL', 'unit', 1, 1, true),
  ('beyaynet', 'Beyaynet', '', 'Vegetarian', 400, 500, 0, 'Kitchen', 'BY', 'unit', 1, 1, true),
  ('derek-enjera', 'Derek Enjera', '', 'Starters', 30, 30, 0, 'Kitchen', 'DE', 'unit', 1, 1, true),
  ('foyel', 'Foyel', '', 'Mains', 100, 100, 0, 'Kitchen', 'FY', 'unit', 1, 1, true)
on conflict (id) do update set
  name_en = excluded.name_en,
  name_am = excluded.name_am,
  category = excluded.category,
  price = excluded.price,
  vip_price = excluded.vip_price,
  cost = excluded.cost,
  station = excluded.station,
  emoji = excluded.emoji,
  pricing_mode = excluded.pricing_mode,
  default_qty = excluded.default_qty,
  qty_step = excluded.qty_step,
  active = true,
  updated_at = now();

