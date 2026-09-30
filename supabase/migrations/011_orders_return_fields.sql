-- Add return request fields to orders
alter table public.orders
  add column if not exists return_requested_by text,
  add column if not exists return_requested_at text,
  add column if not exists return_reason text,
  add column if not exists returned_at text,
  add column if not exists returned_by text;

-- Extend status check constraint to include RETURNED
alter table public.orders drop constraint if exists orders_status_check;
alter table public.orders add constraint orders_status_check check (status in (
  'PENDING_CASHIER',
  'NEW',
  'PARTIALLY READY',
  'READY TO SERVE',
  'RECEIPT_GENERATED',
  'CLOSED',
  'CANCELLED',
  'RETURNED'
));
