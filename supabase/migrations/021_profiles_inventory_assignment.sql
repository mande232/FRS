-- Persist store / inventory location assignments on staff profiles.

alter table public.profiles
  add column if not exists assigned_store text
  check (assigned_store is null or assigned_store in ('Store 1', 'Store 2'));

alter table public.profiles
  add column if not exists assigned_inventory_locations text[] not null default '{}';

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
  assigned_store text;
  assigned_locations text[];
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

  assigned_store := nullif(trim(coalesce(new.raw_user_meta_data->>'assigned_store', new.raw_user_meta_data->>'assignedStore', '')), '');
  if assigned_store is not null and assigned_store not in ('Store 1', 'Store 2') then
    assigned_store := null;
  end if;

  assigned_locations := case
    when jsonb_typeof(new.raw_user_meta_data->'assigned_inventory_locations') = 'array'
      then array(
        select jsonb_array_elements_text(new.raw_user_meta_data->'assigned_inventory_locations')
      )
    when jsonb_typeof(new.raw_user_meta_data->'assignedInventoryLocations') = 'array'
      then array(
        select jsonb_array_elements_text(new.raw_user_meta_data->'assignedInventoryLocations')
      )
    when assigned_store is not null then array[assigned_store]
    else '{}'::text[]
  end;

  insert into public.profiles (
    id,
    email,
    name,
    role,
    branch,
    avatar,
    staff_sales_all,
    login_password_hash,
    assigned_store,
    assigned_inventory_locations
  )
  values (
    new.id,
    new.email,
    display_name,
    display_role,
    display_branch,
    coalesce(new.raw_user_meta_data->>'avatar', upper(left(display_name, 1))),
    coalesce((new.raw_user_meta_data->>'staff_sales_all')::boolean, false),
    login_hash,
    assigned_store,
    coalesce(assigned_locations, '{}'::text[])
  )
  on conflict (id) do update set
    email = excluded.email,
    name = excluded.name,
    role = excluded.role,
    branch = excluded.branch,
    avatar = excluded.avatar,
    staff_sales_all = excluded.staff_sales_all,
    login_password_hash = coalesce(excluded.login_password_hash, profiles.login_password_hash),
    assigned_store = excluded.assigned_store,
    assigned_inventory_locations = excluded.assigned_inventory_locations,
    updated_at = now();

  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
drop trigger if exists on_auth_user_profile_synced on auth.users;
create trigger on_auth_user_profile_synced
after insert or update of email, raw_user_meta_data on auth.users
for each row execute function public.handle_new_user();
