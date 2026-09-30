-- Allow payment statuses used by returns and partial payments.
alter table public.orders drop constraint if exists orders_payment_status_check;
alter table public.orders add constraint orders_payment_status_check check (payment_status in (
  'Unpaid',
  'Paid',
  'Partially Paid',
  'Refunded'
));
