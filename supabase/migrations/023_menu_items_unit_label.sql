-- Persist menu unit labels used by POS / kilo pricing.

alter table public.menu_items
  add column if not exists unit_label text;
