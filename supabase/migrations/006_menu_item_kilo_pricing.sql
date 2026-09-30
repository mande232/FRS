alter table public.menu_items
  add column if not exists pricing_mode text not null default 'unit' check (pricing_mode in ('unit', 'kg')),
  add column if not exists default_qty numeric(12, 3) not null default 1,
  add column if not exists qty_step numeric(12, 3) not null default 1,
  add column if not exists stock_sku text not null default '';
