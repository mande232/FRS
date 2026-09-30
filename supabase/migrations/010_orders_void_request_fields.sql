alter table public.orders
  add column if not exists void_requested_by text,
  add column if not exists void_requested_at text,
  add column if not exists void_reason text;
