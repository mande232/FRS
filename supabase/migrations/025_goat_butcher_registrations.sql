-- Butcher direct goat purchase: registrations, pool SKUs, GOAT_REGISTRATION ledger type support.
-- Isolated from store/GRV/issue workflow — goats enter only at Butcher.

create table if not exists public.goat_registrations (
  id text primary key,
  document_no text not null unique,
  registered_at timestamptz not null default now(),
  registered_by text not null,
  goat_type text not null,
  purchase_price numeric(14, 2) not null check (purchase_price >= 0),
  supplier_name text,
  front_leg_kg numeric(14, 3) not null default 0 check (front_leg_kg >= 0),
  back_leg_kg numeric(14, 3) not null default 0 check (back_leg_kg >= 0),
  inside_parts_kg numeric(14, 3) not null default 0 check (inside_parts_kg >= 0),
  limb_kg numeric(14, 3) not null default 0 check (limb_kg >= 0),
  location text not null default 'Butcher' check (location = 'Butcher'),
  status text not null default 'active' check (status in ('active', 'depleted', 'cancelled')),
  reference_no text not null unique,
  notes text,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists goat_registrations_registered_at_idx
  on public.goat_registrations (registered_at desc);

create index if not exists goat_registrations_reference_no_idx
  on public.goat_registrations (reference_no);

-- Two kg pools at Butcher only (no stk-goat-whole, no Store balance).
insert into public.inventory_items (
  id, name, category, base_unit, purchase_price, selling_price, vip_selling_price,
  standard_cost, reorder_level, preferred_location, supplier_name, conversions,
  track_batch_expiry, notes, opening_stock, active, created_at, updated_at
)
values
  (
    'stk-goat-limb-meat',
    'Goat Limb Meat (Front+Back)',
    'Meat',
    'kg',
    0,
    0,
    null,
    0,
    0,
    'Butcher',
    'Direct purchase',
    '[]'::jsonb,
    false,
    'Butcher goat pool — limb (Shekla/Kurete)',
    0,
    true,
    now(),
    now()
  ),
  (
    'stk-goat-inside-parts',
    'Goat Inside Parts',
    'Meat',
    'kg',
    0,
    0,
    null,
    0,
    0,
    'Butcher',
    'Direct purchase',
    '[]'::jsonb,
    false,
    'Butcher goat pool — inside (Collection/Mlas Sember)',
    0,
    true,
    now(),
    now()
  )
on conflict (id) do update set
  name = excluded.name,
  category = excluded.category,
  base_unit = excluded.base_unit,
  preferred_location = excluded.preferred_location,
  notes = excluded.notes,
  active = true,
  updated_at = now();

alter table public.goat_registrations enable row level security;

drop policy if exists "goat registrations readable by staff" on public.goat_registrations;
create policy "goat registrations readable by staff" on public.goat_registrations
  for select to authenticated using (true);

drop policy if exists "goat registrations insert by staff" on public.goat_registrations;
create policy "goat registrations insert by staff" on public.goat_registrations
  for insert to authenticated with check (true);

drop policy if exists "goat registrations update by staff" on public.goat_registrations;
create policy "goat registrations update by staff" on public.goat_registrations
  for update to authenticated using (true);
