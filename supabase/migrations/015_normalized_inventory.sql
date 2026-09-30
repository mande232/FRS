-- Phase 4: normalized inventory tables (ERP-grade integrity)
-- Dual-writes from the app keep module_records working while ledger/lots/docs land here.

-- Inventory roles used by Phase 2/3 auth mapping
alter table public.profiles drop constraint if exists profiles_role_check;
alter table public.profiles add constraint profiles_role_check check (role in (
  'Administrator',
  'Inventory Administrator',
  'Branch Manager',
  'Store Manager',
  'Supervisor',
  'Cashier',
  'Waiter',
  'Kitchen Staff',
  'Bar Staff',
  'Bartender',
  'Butcher Staff',
  'Butcher House Staff',
  'Coffee House Staff',
  'Department Manager',
  'Inventory Staff',
  'Storekeeper',
  'Reception',
  'Hotel Staff',
  'Procurement Officer',
  'Chef',
  'Event Coordinator',
  'Accountant',
  'Auditor'
));

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  display_name text;
  display_role text;
  display_branch text;
  login_password text;
  login_hash text;
begin
  display_name := nullif(trim(coalesce(new.raw_user_meta_data->>'name', '')), '');
  display_name := coalesce(display_name, split_part(new.email, '@', 1), 'Staff');

  display_role := coalesce(new.raw_user_meta_data->>'role', 'Waiter');
  if display_role not in (
    'Administrator',
    'Inventory Administrator',
    'Branch Manager',
    'Store Manager',
    'Supervisor',
    'Cashier',
    'Waiter',
    'Kitchen Staff',
    'Bar Staff',
    'Bartender',
    'Butcher Staff',
    'Butcher House Staff',
    'Coffee House Staff',
    'Department Manager',
    'Inventory Staff',
    'Storekeeper',
    'Reception',
    'Hotel Staff',
    'Procurement Officer',
    'Chef',
    'Event Coordinator',
    'Accountant',
    'Auditor'
  ) then
    display_role := 'Waiter';
  end if;

  display_branch := nullif(trim(coalesce(new.raw_user_meta_data->>'branch', '')), '');
  display_branch := coalesce(display_branch, 'Bole');
  login_password := coalesce(new.raw_user_meta_data->>'login_password', new.raw_user_meta_data->>'loginPassword');
  login_hash := case
    when login_password is null or length(login_password) = 0 then null
    else crypt(login_password, gen_salt('bf'))
  end;

  insert into public.profiles (id, email, name, role, branch, avatar, staff_sales_all, login_password_hash)
  values (
    new.id,
    new.email,
    display_name,
    display_role,
    display_branch,
    coalesce(new.raw_user_meta_data->>'avatar', upper(left(display_name, 1))),
    coalesce((new.raw_user_meta_data->>'staff_sales_all')::boolean, false),
    login_hash
  )
  on conflict (id) do update set
    email = excluded.email,
    name = excluded.name,
    role = excluded.role,
    branch = excluded.branch,
    avatar = excluded.avatar,
    staff_sales_all = excluded.staff_sales_all,
    login_password_hash = coalesce(excluded.login_password_hash, profiles.login_password_hash),
    updated_at = now();

  return new;
end;
$$;

create table if not exists public.inventory_items (
  id text primary key,
  name text not null,
  category text not null default 'General Expense',
  base_unit text not null default 'pcs',
  purchase_price numeric(14, 2) not null default 0,
  selling_price numeric(14, 2) not null default 0,
  vip_selling_price numeric(14, 2),
  standard_cost numeric(14, 2),
  reorder_level numeric(14, 3) not null default 0,
  preferred_location text not null default 'Store 1',
  supplier_name text,
  conversions jsonb not null default '[]'::jsonb,
  track_batch_expiry boolean not null default false,
  notes text,
  opening_stock numeric(14, 3) not null default 0,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.inventory_settings (
  id text primary key default 'inventory-settings',
  costing_method text not null default 'Weighted Average'
    check (costing_method in ('Weighted Average', 'FIFO', 'Standard Cost')),
  allow_negative_stock boolean not null default false,
  updated_by text not null default 'System',
  updated_at timestamptz not null default now()
);

insert into public.inventory_settings (id)
values ('inventory-settings')
on conflict (id) do nothing;

create table if not exists public.inventory_location_policies (
  id text primary key,
  item_id text not null references public.inventory_items(id) on delete cascade,
  item_name text not null,
  location text not null,
  minimum_stock numeric(14, 3) not null default 0,
  maximum_stock numeric(14, 3) not null default 0,
  reorder_level numeric(14, 3) not null default 0,
  reorder_quantity numeric(14, 3) not null default 0,
  safety_stock numeric(14, 3) not null default 0,
  preferred_source_store text,
  preferred_supplier text,
  updated_at timestamptz not null default now(),
  unique (item_id, location)
);

create table if not exists public.inventory_lots (
  id text primary key,
  item_id text not null references public.inventory_items(id) on delete restrict,
  item_name text not null,
  location text not null,
  batch_number text not null,
  manufacturing_date date,
  expiry_date date,
  quantity numeric(14, 3) not null default 0,
  unit text not null,
  unit_cost numeric(14, 2) not null default 0,
  status text not null default 'Available'
    check (status in ('Available', 'Quarantine', 'Expired', 'Blocked', 'Recalled')),
  received_at timestamptz not null default now(),
  reference_no text,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists inventory_lots_item_location_idx
  on public.inventory_lots (item_id, location, status, expiry_date);

create table if not exists public.inventory_ledger (
  id text primary key,
  entry_type text not null,
  entry_date date not null,
  item_id text,
  item_name text not null,
  category text,
  location text not null,
  from_location text,
  to_location text,
  quantity numeric(14, 3) not null check (quantity > 0),
  unit text not null,
  unit_price numeric(14, 2),
  total_cost numeric(14, 2) not null default 0,
  quantity_in numeric(14, 3) not null default 0,
  quantity_out numeric(14, 3) not null default 0,
  supplier_name text,
  approved_by text,
  received_by text,
  entered_by text not null,
  reason text,
  notes text,
  reference_no text,
  batch_number text,
  expiry_date date,
  lot_status text,
  transaction_at timestamptz not null default now(),
  immutable boolean not null default true,
  created_at timestamptz not null default now()
);

create index if not exists inventory_ledger_date_idx on public.inventory_ledger (entry_date desc, transaction_at desc);
create index if not exists inventory_ledger_item_location_idx on public.inventory_ledger (item_id, location);
create index if not exists inventory_ledger_reference_idx on public.inventory_ledger (reference_no);

create table if not exists public.inventory_documents (
  id text primary key,
  document_type text not null,
  document_number text not null,
  status text not null,
  location text,
  source_location text,
  destination_location text,
  created_by text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  posted_at timestamptz,
  payload jsonb not null default '{}'::jsonb,
  approval_history jsonb not null default '[]'::jsonb,
  active boolean not null default true,
  unique (document_type, document_number)
);

create index if not exists inventory_documents_type_status_idx
  on public.inventory_documents (document_type, status, created_at desc);

create table if not exists public.inventory_document_sequences (
  prefix text not null,
  year integer not null,
  last_sequence integer not null default 0,
  primary key (prefix, year)
);

-- Append-only ledger: no update/delete of posted rows
create or replace function public.prevent_inventory_ledger_mutation()
returns trigger
language plpgsql
as $$
begin
  if tg_op = 'DELETE' then
    if coalesce(old.immutable, true) then
      raise exception 'Inventory ledger entries are append-only. Post a reversal document instead.';
    end if;
    return old;
  end if;
  if tg_op = 'UPDATE' and coalesce(old.immutable, true) then
    raise exception 'Inventory ledger entries are append-only. Post a reversal document instead.';
  end if;
  return new;
end;
$$;

drop trigger if exists inventory_ledger_immutable on public.inventory_ledger;
create trigger inventory_ledger_immutable
before update or delete on public.inventory_ledger
for each row execute function public.prevent_inventory_ledger_mutation();

drop trigger if exists inventory_items_touch_updated_at on public.inventory_items;
create trigger inventory_items_touch_updated_at before update on public.inventory_items
for each row execute function public.touch_updated_at();

drop trigger if exists inventory_lots_touch_updated_at on public.inventory_lots;
create trigger inventory_lots_touch_updated_at before update on public.inventory_lots
for each row execute function public.touch_updated_at();

drop trigger if exists inventory_documents_touch_updated_at on public.inventory_documents;
create trigger inventory_documents_touch_updated_at before update on public.inventory_documents
for each row execute function public.touch_updated_at();

alter table public.inventory_items enable row level security;
alter table public.inventory_settings enable row level security;
alter table public.inventory_location_policies enable row level security;
alter table public.inventory_lots enable row level security;
alter table public.inventory_ledger enable row level security;
alter table public.inventory_documents enable row level security;
alter table public.inventory_document_sequences enable row level security;

drop policy if exists "inventory items readable by staff" on public.inventory_items;
create policy "inventory items readable by staff" on public.inventory_items
for select to authenticated using (true);
drop policy if exists "inventory items writable by staff" on public.inventory_items;
create policy "inventory items writable by staff" on public.inventory_items
for all to authenticated using (true) with check (true);

drop policy if exists "inventory settings readable by staff" on public.inventory_settings;
create policy "inventory settings readable by staff" on public.inventory_settings
for select to authenticated using (true);
drop policy if exists "inventory settings writable by staff" on public.inventory_settings;
create policy "inventory settings writable by staff" on public.inventory_settings
for all to authenticated using (true) with check (true);

drop policy if exists "inventory policies readable by staff" on public.inventory_location_policies;
create policy "inventory policies readable by staff" on public.inventory_location_policies
for select to authenticated using (true);
drop policy if exists "inventory policies writable by staff" on public.inventory_location_policies;
create policy "inventory policies writable by staff" on public.inventory_location_policies
for all to authenticated using (true) with check (true);

drop policy if exists "inventory lots readable by staff" on public.inventory_lots;
create policy "inventory lots readable by staff" on public.inventory_lots
for select to authenticated using (true);
drop policy if exists "inventory lots writable by staff" on public.inventory_lots;
create policy "inventory lots writable by staff" on public.inventory_lots
for all to authenticated using (true) with check (true);

drop policy if exists "inventory ledger readable by staff" on public.inventory_ledger;
create policy "inventory ledger readable by staff" on public.inventory_ledger
for select to authenticated using (true);
drop policy if exists "inventory ledger insert by staff" on public.inventory_ledger;
create policy "inventory ledger insert by staff" on public.inventory_ledger
for insert to authenticated with check (true);

drop policy if exists "inventory documents readable by staff" on public.inventory_documents;
create policy "inventory documents readable by staff" on public.inventory_documents
for select to authenticated using (true);
drop policy if exists "inventory documents writable by staff" on public.inventory_documents;
create policy "inventory documents writable by staff" on public.inventory_documents
for all to authenticated using (true) with check (true);

drop policy if exists "inventory sequences readable by staff" on public.inventory_document_sequences;
create policy "inventory sequences readable by staff" on public.inventory_document_sequences
for select to authenticated using (true);
drop policy if exists "inventory sequences writable by staff" on public.inventory_document_sequences;
create policy "inventory sequences writable by staff" on public.inventory_document_sequences
for all to authenticated using (true) with check (true);

alter table public.inventory_items replica identity full;
alter table public.inventory_lots replica identity full;
alter table public.inventory_ledger replica identity full;
alter table public.inventory_documents replica identity full;

do $$
begin
  alter publication supabase_realtime add table public.inventory_items;
exception when duplicate_object then null; when undefined_object then null;
end $$;
do $$
begin
  alter publication supabase_realtime add table public.inventory_lots;
exception when duplicate_object then null; when undefined_object then null;
end $$;
do $$
begin
  alter publication supabase_realtime add table public.inventory_ledger;
exception when duplicate_object then null; when undefined_object then null;
end $$;
do $$
begin
  alter publication supabase_realtime add table public.inventory_documents;
exception when duplicate_object then null; when undefined_object then null;
end $$;
