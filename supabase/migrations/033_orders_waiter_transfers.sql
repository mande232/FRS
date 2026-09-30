-- Persist waiter bill handoff audit trail on each order.
alter table public.orders
  add column if not exists waiter_transfers jsonb not null default '[]'::jsonb;
