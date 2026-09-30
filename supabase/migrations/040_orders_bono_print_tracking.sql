-- Track how many times station Bono was printed for an order (BONO #1 / REPRINT #N).
alter table public.orders
  add column if not exists bono_print_count integer not null default 0;

alter table public.orders
  add column if not exists bono_last_printed_at timestamptz;

alter table public.orders
  add column if not exists bono_last_printed_by text;
