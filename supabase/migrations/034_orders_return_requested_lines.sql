-- Pending return line selections (waiter partial return requests).
alter table public.orders
  add column if not exists return_requested_lines jsonb default '[]'::jsonb;
