-- Pending waiter bill handoff awaiting cashier / manager approval.

alter table public.orders
  add column if not exists waiter_transfer_requested_to text,
  add column if not exists waiter_transfer_requested_by text,
  add column if not exists waiter_transfer_requested_at timestamptz;
