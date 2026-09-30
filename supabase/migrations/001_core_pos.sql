create extension if not exists pgcrypto;

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text,
  name text not null default '',
  role text not null default 'Waiter' check (role in (
    'Administrator',
    'Branch Manager',
    'Supervisor',
    'Cashier',
    'Waiter',
    'Kitchen Staff',
    'Bar Staff',
    'Bartender',
    'Butcher Staff',
    'Butcher House Staff',
    'Coffee House Staff',
    'Inventory Staff',
    'Storekeeper',
    'Reception',
    'Hotel Staff',
    'Procurement Officer',
    'Chef',
    'Event Coordinator',
    'Accountant'
  )),
  branch text not null default 'Bole',
  avatar text not null default '',
  staff_sales_all boolean not null default false,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.production_stations (
  name text primary key,
  position integer not null default 0,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.menu_items (
  id text primary key,
  name_en text not null,
  name_am text not null default '',
  category text not null,
  price numeric(12, 2) not null default 0,
  cost numeric(12, 2) not null default 0,
  station text not null references public.production_stations(name) on update cascade,
  emoji text not null default '',
  veg boolean not null default false,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.dining_tables (
  id text primary key,
  label text not null,
  seats integer not null default 2,
  area text not null,
  status text not null default 'Available' check (status in ('Available', 'Occupied', 'Reserved', 'Bill', 'Cleaning')),
  guests integer,
  server text,
  open_min integer,
  total numeric(12, 2),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.orders (
  id text primary key,
  order_no text not null,
  source text not null check (source in ('Dine-in', 'Takeaway', 'Room', 'Delivery', 'QR')),
  ref text not null,
  area text not null,
  table_number text not null,
  ordered_by_waiter text not null default '',
  waiter text not null default '',
  entered_by_cashier text not null default '',
  server text,
  items jsonb not null default '[]'::jsonb,
  station_tickets jsonb not null default '[]'::jsonb,
  sent_at text not null default '',
  requested_at text,
  cashier_accepted_at text,
  station_sent_at text,
  status text not null default 'NEW' check (status in (
    'PENDING_CASHIER',
    'NEW',
    'PARTIALLY READY',
    'READY TO SERVE',
    'RECEIPT_GENERATED',
    'CLOSED'
  )),
  payment_status text not null default 'Unpaid' check (payment_status in ('Unpaid', 'Paid')),
  opened_min integer not null default 0,
  total numeric(12, 2) not null default 0,
  customer_name text,
  receipt jsonb,
  receipt_number text,
  receipt_generated_at text,
  receipt_generated_by text,
  locked_for_editing boolean,
  manager_authorized_changes_by text,
  manager_authorized_changes_at text,
  payment_received_at text,
  closed_by_cashier text,
  cancelled_at text,
  cancelled_by text,
  payment jsonb,
  created_by uuid references public.profiles(id) default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.orders add column if not exists customer_name text;
alter table public.orders add column if not exists cancelled_at text;
alter table public.orders add column if not exists cancelled_by text;
alter table public.profiles add column if not exists staff_sales_all boolean not null default false;
alter table public.orders drop constraint if exists orders_status_check;
alter table public.orders add constraint orders_status_check check (status in (
  'PENDING_CASHIER',
  'NEW',
  'PARTIALLY READY',
  'READY TO SERVE',
  'RECEIPT_GENERATED',
  'CLOSED',
  'CANCELLED'
));

create table if not exists public.payments_ledger (
  id text primary key,
  order_id text references public.orders(id) on delete cascade,
  ref text not null,
  method text not null,
  amount numeric(12, 2) not null default 0,
  table_ref text,
  cashier text,
  time text,
  status text not null default 'Settled',
  collected_by_waiter text,
  received_by_cashier text,
  amount_received numeric(12, 2),
  change_amount numeric(12, 2),
  receipt_number text,
  payment_received_at text,
  closed_by_cashier text,
  raw_payment jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.stock_items (
  sku text primary key,
  name text not null,
  unit text not null default '',
  store text not null default '',
  on_hand numeric(12, 3) not null default 0,
  reorder_qty numeric(12, 3) not null default 0,
  value numeric(12, 2) not null default 0,
  supplier text not null default '',
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.suppliers (
  id text primary key,
  name text not null,
  contact text,
  category text not null default '',
  outstanding numeric(12, 2) not null default 0,
  status text not null default 'Active',
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.reservations (
  id text primary key,
  name text not null,
  phone text not null default '',
  time text not null default '',
  party integer not null default 1,
  table_ref text not null default '',
  deposit numeric(12, 2) not null default 0,
  status text not null default 'Confirmed',
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.customers (
  id text primary key,
  name text not null,
  phone text not null default '',
  visits integer not null default 0,
  spent numeric(12, 2) not null default 0,
  tier text not null default 'Bronze',
  last_visit text not null default '',
  points integer not null default 0,
  feedback text,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.sales_records (
  id text primary key,
  data jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.expense_records (
  id text primary key,
  data jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.purchase_orders (
  id text primary key,
  supplier text not null,
  sku text not null default '',
  item text not null,
  qty numeric(12, 3) not null default 0,
  unit text not null default '',
  unit_cost numeric(12, 2) not null default 0,
  total numeric(12, 2) not null default 0,
  status text not null default 'Pending',
  date text not null default '',
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.guest_order_requests (
  id text primary key,
  table_number text not null,
  area text not null default '',
  waiter text not null default '',
  status text not null default 'QR_GENERATED' check (status in ('QR_GENERATED', 'SENT_TO_WAITER', 'IMPORTED', 'SENT_TO_CASHIER')),
  note text,
  created_at_text text not null default '',
  total numeric(12, 2) not null default 0,
  items jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

insert into public.production_stations (name, position)
values
  ('Kitchen', 0),
  ('Bar', 1),
  ('Butcher House', 2),
  ('Coffee House', 3)
on conflict (name) do update set
  position = excluded.position,
  active = true,
  updated_at = now();

create or replace function public.touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists profiles_touch_updated_at on public.profiles;
create trigger profiles_touch_updated_at before update on public.profiles
for each row execute function public.touch_updated_at();

drop trigger if exists production_stations_touch_updated_at on public.production_stations;
create trigger production_stations_touch_updated_at before update on public.production_stations
for each row execute function public.touch_updated_at();

drop trigger if exists menu_items_touch_updated_at on public.menu_items;
create trigger menu_items_touch_updated_at before update on public.menu_items
for each row execute function public.touch_updated_at();

drop trigger if exists dining_tables_touch_updated_at on public.dining_tables;
create trigger dining_tables_touch_updated_at before update on public.dining_tables
for each row execute function public.touch_updated_at();

drop trigger if exists orders_touch_updated_at on public.orders;
create trigger orders_touch_updated_at before update on public.orders
for each row execute function public.touch_updated_at();

drop trigger if exists stock_items_touch_updated_at on public.stock_items;
create trigger stock_items_touch_updated_at before update on public.stock_items
for each row execute function public.touch_updated_at();

drop trigger if exists suppliers_touch_updated_at on public.suppliers;
create trigger suppliers_touch_updated_at before update on public.suppliers
for each row execute function public.touch_updated_at();

drop trigger if exists reservations_touch_updated_at on public.reservations;
create trigger reservations_touch_updated_at before update on public.reservations
for each row execute function public.touch_updated_at();

drop trigger if exists customers_touch_updated_at on public.customers;
create trigger customers_touch_updated_at before update on public.customers
for each row execute function public.touch_updated_at();

drop trigger if exists sales_records_touch_updated_at on public.sales_records;
create trigger sales_records_touch_updated_at before update on public.sales_records
for each row execute function public.touch_updated_at();

drop trigger if exists expense_records_touch_updated_at on public.expense_records;
create trigger expense_records_touch_updated_at before update on public.expense_records
for each row execute function public.touch_updated_at();

drop trigger if exists purchase_orders_touch_updated_at on public.purchase_orders;
create trigger purchase_orders_touch_updated_at before update on public.purchase_orders
for each row execute function public.touch_updated_at();

drop trigger if exists guest_order_requests_touch_updated_at on public.guest_order_requests;
create trigger guest_order_requests_touch_updated_at before update on public.guest_order_requests
for each row execute function public.touch_updated_at();

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  display_name text;
  display_role text;
  display_branch text;
begin
  display_name := coalesce(new.raw_user_meta_data->>'name', split_part(new.email, '@', 1), 'Staff');
  display_role := coalesce(new.raw_user_meta_data->>'role', 'Waiter');
  if display_role not in (
    'Administrator',
    'Branch Manager',
    'Supervisor',
    'Cashier',
    'Waiter',
    'Kitchen Staff',
    'Bar Staff',
    'Bartender',
    'Butcher Staff',
    'Butcher House Staff',
    'Coffee House Staff',
    'Inventory Staff',
    'Storekeeper',
    'Reception',
    'Hotel Staff',
    'Procurement Officer',
    'Chef',
    'Event Coordinator',
    'Accountant'
  ) then
    display_role := 'Waiter';
  end if;
  display_branch := coalesce(new.raw_user_meta_data->>'branch', 'Bole');

  insert into public.profiles (id, email, name, role, branch, avatar, staff_sales_all)
  values (
    new.id,
    new.email,
    display_name,
    display_role,
    display_branch,
    coalesce(new.raw_user_meta_data->>'avatar', upper(left(display_name, 1))),
    coalesce((new.raw_user_meta_data->>'staff_sales_all')::boolean, false)
  )
  on conflict (id) do update set
    email = excluded.email,
    name = excluded.name,
    role = excluded.role,
    branch = excluded.branch,
    avatar = excluded.avatar,
    staff_sales_all = excluded.staff_sales_all,
    active = true,
    updated_at = now();

  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
after insert on auth.users
for each row execute function public.handle_new_user();

alter table public.profiles enable row level security;
alter table public.production_stations enable row level security;
alter table public.menu_items enable row level security;
alter table public.dining_tables enable row level security;
alter table public.orders enable row level security;
alter table public.payments_ledger enable row level security;
alter table public.stock_items enable row level security;
alter table public.suppliers enable row level security;
alter table public.reservations enable row level security;
alter table public.customers enable row level security;
alter table public.sales_records enable row level security;
alter table public.expense_records enable row level security;
alter table public.purchase_orders enable row level security;
alter table public.guest_order_requests enable row level security;

drop policy if exists "profiles readable by staff" on public.profiles;
create policy "profiles readable by staff" on public.profiles for select to authenticated using (true);
drop policy if exists "profiles editable by staff" on public.profiles;
create policy "profiles editable by staff" on public.profiles for update to authenticated using (true) with check (true);

drop policy if exists "stations readable by staff" on public.production_stations;
create policy "stations readable by staff" on public.production_stations for select to authenticated using (true);
drop policy if exists "stations readable by guests" on public.production_stations;
create policy "stations readable by guests" on public.production_stations for select to anon using (active = true);
drop policy if exists "stations writable by staff" on public.production_stations;
create policy "stations writable by staff" on public.production_stations for all to authenticated using (true) with check (true);

drop policy if exists "menu readable by staff" on public.menu_items;
create policy "menu readable by staff" on public.menu_items for select to authenticated using (true);
drop policy if exists "menu readable by guests" on public.menu_items;
create policy "menu readable by guests" on public.menu_items for select to anon using (active = true);
drop policy if exists "menu writable by staff" on public.menu_items;
create policy "menu writable by staff" on public.menu_items for all to authenticated using (true) with check (true);

drop policy if exists "tables readable by staff" on public.dining_tables;
create policy "tables readable by staff" on public.dining_tables for select to authenticated using (true);
drop policy if exists "tables readable by guests" on public.dining_tables;
create policy "tables readable by guests" on public.dining_tables for select to anon using (active = true);
drop policy if exists "tables writable by staff" on public.dining_tables;
create policy "tables writable by staff" on public.dining_tables for all to authenticated using (true) with check (true);

drop policy if exists "orders readable by staff" on public.orders;
create policy "orders readable by staff" on public.orders for select to authenticated using (true);
drop policy if exists "orders writable by staff" on public.orders;
create policy "orders writable by staff" on public.orders for all to authenticated using (true) with check (true);

drop policy if exists "payments readable by staff" on public.payments_ledger;
create policy "payments readable by staff" on public.payments_ledger for select to authenticated using (true);
drop policy if exists "payments writable by staff" on public.payments_ledger;
create policy "payments writable by staff" on public.payments_ledger for all to authenticated using (true) with check (true);

drop policy if exists "stock readable by staff" on public.stock_items;
create policy "stock readable by staff" on public.stock_items for select to authenticated using (true);
drop policy if exists "stock writable by staff" on public.stock_items;
create policy "stock writable by staff" on public.stock_items for all to authenticated using (true) with check (true);

drop policy if exists "suppliers readable by staff" on public.suppliers;
create policy "suppliers readable by staff" on public.suppliers for select to authenticated using (true);
drop policy if exists "suppliers writable by staff" on public.suppliers;
create policy "suppliers writable by staff" on public.suppliers for all to authenticated using (true) with check (true);

drop policy if exists "reservations readable by staff" on public.reservations;
create policy "reservations readable by staff" on public.reservations for select to authenticated using (true);
drop policy if exists "reservations writable by staff" on public.reservations;
create policy "reservations writable by staff" on public.reservations for all to authenticated using (true) with check (true);

drop policy if exists "customers readable by staff" on public.customers;
create policy "customers readable by staff" on public.customers for select to authenticated using (true);
drop policy if exists "customers writable by staff" on public.customers;
create policy "customers writable by staff" on public.customers for all to authenticated using (true) with check (true);

drop policy if exists "sales records readable by staff" on public.sales_records;
create policy "sales records readable by staff" on public.sales_records for select to authenticated using (true);
drop policy if exists "sales records writable by staff" on public.sales_records;
create policy "sales records writable by staff" on public.sales_records for all to authenticated using (true) with check (true);

drop policy if exists "expense records readable by staff" on public.expense_records;
create policy "expense records readable by staff" on public.expense_records for select to authenticated using (true);
drop policy if exists "expense records writable by staff" on public.expense_records;
create policy "expense records writable by staff" on public.expense_records for all to authenticated using (true) with check (true);

drop policy if exists "purchase orders readable by staff" on public.purchase_orders;
create policy "purchase orders readable by staff" on public.purchase_orders for select to authenticated using (true);
drop policy if exists "purchase orders writable by staff" on public.purchase_orders;
create policy "purchase orders writable by staff" on public.purchase_orders for all to authenticated using (true) with check (true);

drop policy if exists "guest orders readable by staff" on public.guest_order_requests;
create policy "guest orders readable by staff" on public.guest_order_requests for select to authenticated using (true);
drop policy if exists "guest orders writable by staff" on public.guest_order_requests;
create policy "guest orders writable by staff" on public.guest_order_requests for all to authenticated using (true) with check (true);
drop policy if exists "guest orders can be created by guests" on public.guest_order_requests;
create policy "guest orders can be created by guests" on public.guest_order_requests for insert to anon with check (true);
drop policy if exists "guest orders can be updated by guests" on public.guest_order_requests;
create policy "guest orders can be updated by guests" on public.guest_order_requests for update to anon using (true) with check (true);

alter table public.orders replica identity full;
alter table public.menu_items replica identity full;
alter table public.dining_tables replica identity full;
alter table public.production_stations replica identity full;
alter table public.payments_ledger replica identity full;
alter table public.stock_items replica identity full;
alter table public.suppliers replica identity full;
alter table public.reservations replica identity full;
alter table public.customers replica identity full;
alter table public.sales_records replica identity full;
alter table public.expense_records replica identity full;
alter table public.purchase_orders replica identity full;
alter table public.guest_order_requests replica identity full;

do $$
begin
  alter publication supabase_realtime add table public.orders;
exception
  when duplicate_object then null;
  when undefined_object then null;
end $$;

do $$
begin
  alter publication supabase_realtime add table public.menu_items;
exception
  when duplicate_object then null;
  when undefined_object then null;
end $$;

do $$
begin
  alter publication supabase_realtime add table public.dining_tables;
exception
  when duplicate_object then null;
  when undefined_object then null;
end $$;

do $$
begin
  alter publication supabase_realtime add table public.production_stations;
exception
  when duplicate_object then null;
  when undefined_object then null;
end $$;

do $$
begin
  alter publication supabase_realtime add table public.payments_ledger;
exception
  when duplicate_object then null;
  when undefined_object then null;
end $$;

do $$
begin
  alter publication supabase_realtime add table public.stock_items;
exception
  when duplicate_object then null;
  when undefined_object then null;
end $$;

do $$
begin
  alter publication supabase_realtime add table public.suppliers;
exception
  when duplicate_object then null;
  when undefined_object then null;
end $$;

do $$
begin
  alter publication supabase_realtime add table public.reservations;
exception
  when duplicate_object then null;
  when undefined_object then null;
end $$;

do $$
begin
  alter publication supabase_realtime add table public.customers;
exception
  when duplicate_object then null;
  when undefined_object then null;
end $$;

do $$
begin
  alter publication supabase_realtime add table public.sales_records;
exception
  when duplicate_object then null;
  when undefined_object then null;
end $$;

do $$
begin
  alter publication supabase_realtime add table public.expense_records;
exception
  when duplicate_object then null;
  when undefined_object then null;
end $$;

do $$
begin
  alter publication supabase_realtime add table public.purchase_orders;
exception
  when duplicate_object then null;
  when undefined_object then null;
end $$;

do $$
begin
  alter publication supabase_realtime add table public.guest_order_requests;
exception
  when duplicate_object then null;
  when undefined_object then null;
end $$;
