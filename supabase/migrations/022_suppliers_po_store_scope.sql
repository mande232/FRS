-- Scope suppliers and simple purchase orders by central store.

alter table public.suppliers
  add column if not exists store text not null default 'Store 1'
  check (store in ('Store 1', 'Store 2'));

alter table public.purchase_orders
  add column if not exists store text not null default 'Store 1'
  check (store in ('Store 1', 'Store 2'));

create index if not exists suppliers_store_idx on public.suppliers (store);
create index if not exists purchase_orders_store_idx on public.purchase_orders (store);
