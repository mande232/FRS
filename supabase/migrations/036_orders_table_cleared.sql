alter table public.orders add column if not exists table_cleared_at text;
alter table public.orders add column if not exists table_cleared_by text;
