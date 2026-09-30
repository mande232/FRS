-- Optional inventory operational tables used by the stock-management backend bridge.
-- These tables complement the normalized core inventory schema from 015_normalized_inventory.sql
-- and allow recipe BOMs, waste records, stock reservations, and stock movement records
-- to persist in first-class tables instead of remaining purely fallback-driven.

create table if not exists public.recipe_boms (
  id text primary key,
  menu_item_name text,
  category text,
  output_qty numeric(14, 3) not null default 1,
  output_unit text,
  preparation_station text,
  stock_deduction_location text,
  wastage_allowance numeric(14, 3),
  portion_size text,
  ingredients jsonb not null default '[]'::jsonb,
  notes text,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.recipe_boms
  add column if not exists menu_item_name text,
  add column if not exists category text,
  add column if not exists output_qty numeric(14, 3) not null default 1,
  add column if not exists output_unit text,
  add column if not exists preparation_station text,
  add column if not exists stock_deduction_location text,
  add column if not exists wastage_allowance numeric(14, 3),
  add column if not exists portion_size text,
  add column if not exists ingredients jsonb not null default '[]'::jsonb,
  add column if not exists notes text,
  add column if not exists active boolean not null default true,
  add column if not exists created_at timestamptz not null default now(),
  add column if not exists updated_at timestamptz not null default now();

create table if not exists public.waste_record (
  id text primary key,
  loss_number text,
  location text not null,
  item_id text not null references public.inventory_items(id) on delete restrict,
  item_name text not null,
  quantity numeric(14, 3) not null default 0,
  unit text not null,
  loss_type text not null,
  reason text not null,
  date date not null,
  recorded_by text not null,
  approved_by text,
  notes text,
  document_url text,
  status text not null default 'Posted',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.waste_record
  add column if not exists loss_number text,
  add column if not exists location text,
  add column if not exists item_id text,
  add column if not exists item_name text,
  add column if not exists quantity numeric(14, 3) not null default 0,
  add column if not exists unit text,
  add column if not exists loss_type text,
  add column if not exists reason text,
  add column if not exists date date,
  add column if not exists recorded_by text,
  add column if not exists approved_by text,
  add column if not exists notes text,
  add column if not exists document_url text,
  add column if not exists status text not null default 'Posted',
  add column if not exists created_at timestamptz not null default now(),
  add column if not exists updated_at timestamptz not null default now();

create index if not exists waste_record_date_idx
  on public.waste_record (date desc, created_at desc);

create table if not exists public.stock_reservations (
  id text primary key,
  order_id text not null,
  order_no text,
  order_line_key text,
  item_id text not null references public.inventory_items(id) on delete restrict,
  item_name text not null,
  location text not null,
  quantity numeric(14, 3) not null default 0,
  unit text not null,
  status text not null,
  reserved_by text not null,
  reserved_at timestamptz not null default now(),
  released_at timestamptz,
  consumed_at timestamptz,
  reference_no text,
  menu_item_name text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.stock_reservations
  add column if not exists order_id text,
  add column if not exists order_no text,
  add column if not exists order_line_key text,
  add column if not exists item_id text,
  add column if not exists item_name text,
  add column if not exists location text,
  add column if not exists quantity numeric(14, 3) not null default 0,
  add column if not exists unit text,
  add column if not exists status text,
  add column if not exists reserved_by text,
  add column if not exists reserved_at timestamptz not null default now(),
  add column if not exists released_at timestamptz,
  add column if not exists consumed_at timestamptz,
  add column if not exists reference_no text,
  add column if not exists menu_item_name text,
  add column if not exists created_at timestamptz not null default now(),
  add column if not exists updated_at timestamptz not null default now();

create index if not exists stock_reservations_order_idx
  on public.stock_reservations (order_id, status, reserved_at desc);

create table if not exists public.stock_movements (
  id text primary key,
  transfer_number text,
  source_location text not null,
  destination_location text not null,
  lines jsonb not null default '[]'::jsonb,
  transfer_date date not null,
  status text not null,
  requested_by text,
  approved_by text,
  sent_by text,
  received_by text,
  rejected_reason text,
  notes text,
  source_reserved_at timestamptz,
  dispatched_at timestamptz,
  received_at timestamptz,
  linked_request_number text,
  linked_return_number text,
  activity jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.stock_movements
  add column if not exists transfer_number text,
  add column if not exists source_location text,
  add column if not exists destination_location text,
  add column if not exists lines jsonb not null default '[]'::jsonb,
  add column if not exists transfer_date date,
  add column if not exists status text,
  add column if not exists requested_by text,
  add column if not exists approved_by text,
  add column if not exists sent_by text,
  add column if not exists received_by text,
  add column if not exists rejected_reason text,
  add column if not exists notes text,
  add column if not exists source_reserved_at timestamptz,
  add column if not exists dispatched_at timestamptz,
  add column if not exists received_at timestamptz,
  add column if not exists linked_request_number text,
  add column if not exists linked_return_number text,
  add column if not exists activity jsonb not null default '[]'::jsonb,
  add column if not exists created_at timestamptz not null default now(),
  add column if not exists updated_at timestamptz not null default now();

create index if not exists stock_movements_transfer_date_idx
  on public.stock_movements (transfer_date desc, created_at desc);

drop trigger if exists recipe_boms_touch_updated_at on public.recipe_boms;
create trigger recipe_boms_touch_updated_at before update on public.recipe_boms
for each row execute function public.touch_updated_at();

drop trigger if exists waste_record_touch_updated_at on public.waste_record;
create trigger waste_record_touch_updated_at before update on public.waste_record
for each row execute function public.touch_updated_at();

drop trigger if exists stock_reservations_touch_updated_at on public.stock_reservations;
create trigger stock_reservations_touch_updated_at before update on public.stock_reservations
for each row execute function public.touch_updated_at();

drop trigger if exists stock_movements_touch_updated_at on public.stock_movements;
create trigger stock_movements_touch_updated_at before update on public.stock_movements
for each row execute function public.touch_updated_at();

alter table public.recipe_boms enable row level security;
alter table public.waste_record enable row level security;
alter table public.stock_reservations enable row level security;
alter table public.stock_movements enable row level security;

drop policy if exists "recipe boms readable by staff" on public.recipe_boms;
create policy "recipe boms readable by staff" on public.recipe_boms
for select to authenticated using (true);
drop policy if exists "recipe boms writable by staff" on public.recipe_boms;
create policy "recipe boms writable by staff" on public.recipe_boms
for all to authenticated using (true) with check (true);

drop policy if exists "waste record readable by staff" on public.waste_record;
create policy "waste record readable by staff" on public.waste_record
for select to authenticated using (true);
drop policy if exists "waste record writable by staff" on public.waste_record;
create policy "waste record writable by staff" on public.waste_record
for all to authenticated using (true) with check (true);

drop policy if exists "stock reservations readable by staff" on public.stock_reservations;
create policy "stock reservations readable by staff" on public.stock_reservations
for select to authenticated using (true);
drop policy if exists "stock reservations writable by staff" on public.stock_reservations;
create policy "stock reservations writable by staff" on public.stock_reservations
for all to authenticated using (true) with check (true);

drop policy if exists "stock movements readable by staff" on public.stock_movements;
create policy "stock movements readable by staff" on public.stock_movements
for select to authenticated using (true);
drop policy if exists "stock movements writable by staff" on public.stock_movements;
create policy "stock movements writable by staff" on public.stock_movements
for all to authenticated using (true) with check (true);

alter table public.recipe_boms replica identity full;
alter table public.waste_record replica identity full;
alter table public.stock_reservations replica identity full;
alter table public.stock_movements replica identity full;

do $$
begin
  alter publication supabase_realtime add table public.recipe_boms;
exception when duplicate_object then null; when undefined_object then null;
end $$;

do $$
begin
  alter publication supabase_realtime add table public.waste_record;
exception when duplicate_object then null; when undefined_object then null;
end $$;

do $$
begin
  alter publication supabase_realtime add table public.stock_reservations;
exception when duplicate_object then null; when undefined_object then null;
end $$;

do $$
begin
  alter publication supabase_realtime add table public.stock_movements;
exception when duplicate_object then null; when undefined_object then null;
end $$;