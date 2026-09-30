create table if not exists public.module_records (
  module_key text not null,
  record_id text not null,
  data jsonb not null default '{}'::jsonb,
  position integer not null default 0,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (module_key, record_id)
);

create index if not exists module_records_module_active_idx
on public.module_records (module_key, active, position, updated_at desc);

drop trigger if exists module_records_touch_updated_at on public.module_records;
create trigger module_records_touch_updated_at before update on public.module_records
for each row execute function public.touch_updated_at();

alter table public.module_records enable row level security;

drop policy if exists "module records readable by staff" on public.module_records;
create policy "module records readable by staff" on public.module_records
for select to authenticated using (true);

drop policy if exists "settings module readable by guests" on public.module_records;
create policy "settings module readable by guests" on public.module_records
for select to anon using (module_key = 'settings' and active = true);

drop policy if exists "module records writable by staff" on public.module_records;
create policy "module records writable by staff" on public.module_records
for all to authenticated using (true) with check (true);


alter table public.module_records replica identity full;

do $$
begin
  alter publication supabase_realtime add table public.module_records;
exception
  when duplicate_object then null;
  when undefined_object then null;
end $$;
