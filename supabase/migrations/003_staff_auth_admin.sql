create extension if not exists pgcrypto with schema extensions;

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

drop trigger if exists on_auth_user_created on auth.users;
drop trigger if exists on_auth_user_profile_synced on auth.users;
create trigger on_auth_user_profile_synced
after insert or update of email, raw_user_meta_data on auth.users
for each row execute function public.handle_new_user();

drop function if exists public.resolve_staff_login(text);
create function public.resolve_staff_login(password_input text)
returns table (
  id uuid,
  email text,
  name text,
  role text,
  branch text,
  avatar text,
  active boolean,
  staff_sales_all boolean
)
language sql
security definer
set search_path = public, extensions
as $$
  select
    profiles.id,
    profiles.email,
    profiles.name,
    profiles.role,
    profiles.branch,
    profiles.avatar,
    profiles.active,
    profiles.staff_sales_all
  from public.profiles
  where
    profiles.active = true
    and profiles.email is not null
    and profiles.login_password_hash is not null
    and profiles.login_password_hash = crypt(password_input, profiles.login_password_hash);
$$;

revoke all on function public.resolve_staff_login(text) from public;
grant execute on function public.resolve_staff_login(text) to anon;
grant execute on function public.resolve_staff_login(text) to authenticated;

create or replace function public.set_staff_login_password(user_id_input uuid, password_input text)
returns void
language plpgsql
security definer
set search_path = public, extensions
as $$
begin
  if password_input is null or length(trim(password_input)) = 0 then
    update public.profiles
    set login_password_hash = null
    where id = user_id_input;
  else
    update public.profiles
    set login_password_hash = crypt(password_input, gen_salt('bf'))
    where id = user_id_input;
  end if;
end;
$$;

revoke all on function public.set_staff_login_password(uuid, text) from public;
grant execute on function public.set_staff_login_password(uuid, text) to service_role;
