create table if not exists public.menu_categories (
  name text primary key,
  position integer not null default 0,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

drop trigger if exists menu_categories_touch_updated_at on public.menu_categories;
create trigger menu_categories_touch_updated_at before update on public.menu_categories
for each row execute function public.touch_updated_at();

alter table public.menu_categories enable row level security;

drop policy if exists "menu categories readable by staff" on public.menu_categories;
create policy "menu categories readable by staff" on public.menu_categories
for select to authenticated using (true);

drop policy if exists "menu categories readable by guests" on public.menu_categories;
create policy "menu categories readable by guests" on public.menu_categories
for select to anon using (active = true);

drop policy if exists "menu categories writable by staff" on public.menu_categories;
create policy "menu categories writable by staff" on public.menu_categories
for all to authenticated using (true) with check (true);

alter table public.menu_categories replica identity full;

do $$
begin
  alter publication supabase_realtime add table public.menu_categories;
exception
  when duplicate_object then null;
  when undefined_object then null;
end $$;
