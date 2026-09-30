-- Seed one Administrator account for password-only login.
-- Run after 001, 002/003, and 009 (or 015) migrations.
--
-- Login (password-only screen): admin123
-- Internal auth email: admin@ethioplate.local

create extension if not exists pgcrypto with schema extensions;

do $$
declare
  admin_id uuid := 'a0000000-0000-4000-8000-000000000001';
  admin_email text := 'manager@example.com';
  admin_password text := 'manager123';
  instance uuid := '00000000-0000-0000-0000-000000000000';
  existing_admin_id uuid;
begin
  select id into existing_admin_id
  from auth.users
  where email = admin_email
  limit 1;

  if existing_admin_id is not null then
    admin_id := existing_admin_id;
  end if;

  insert into auth.users (
    instance_id,
    id,
    aud,
    role,
    email,
    encrypted_password,
    email_confirmed_at,
    recovery_sent_at,
    last_sign_in_at,
    raw_app_meta_data,
    raw_user_meta_data,
    created_at,
    updated_at,
    confirmation_token,
    email_change,
    email_change_token_new,
    recovery_token
  )
  values (
    instance,
    admin_id,
    'authenticated',
    'authenticated',
    admin_email,
    extensions.crypt(admin_password, extensions.gen_salt('bf')),
    now(),
    now(),
    now(),
    '{"provider":"email","providers":["email"]}'::jsonb,
    jsonb_build_object(
      'name', 'System Administrator',
      'role', 'Branch Manager',
      'branch', 'Bole',
      'avatar', 'SA',
      'staff_sales_all', true,
      'login_password', admin_password
    ),
    now(),
    now(),
    '',
    '',
    '',
    ''
  )
  on conflict (id) do update set
    email = excluded.email,
    encrypted_password = excluded.encrypted_password,
    email_confirmed_at = coalesce(auth.users.email_confirmed_at, excluded.email_confirmed_at),
    recovery_sent_at = excluded.recovery_sent_at,
    last_sign_in_at = excluded.last_sign_in_at,
    raw_app_meta_data = excluded.raw_app_meta_data,
    raw_user_meta_data = excluded.raw_user_meta_data,
    updated_at = now();

  insert into auth.identities (
    id,
    user_id,
    identity_data,
    provider,
    provider_id,
    last_sign_in_at,
    created_at,
    updated_at
  )
  values (
    gen_random_uuid(),
    admin_id,
    jsonb_build_object('sub', admin_id::text, 'email', admin_email),
    'email',
    admin_id::text,
    now(),
    now(),
    now()
  )
  on conflict (provider, provider_id) do update set
    user_id = excluded.user_id,
    identity_data = excluded.identity_data,
    last_sign_in_at = excluded.last_sign_in_at,
    updated_at = now();

  insert into public.profiles (
    id,
    email,
    name,
    role,
    branch,
    avatar,
    staff_sales_all,
    login_password_hash,
    active
  )
  values (
    admin_id,
    admin_email,
    'System Administrator',
    'Administrator',
    'Bole',
    'SA',
    true,
    extensions.crypt(admin_password, extensions.gen_salt('bf')),
    true
  )
  on conflict (id) do update set
    email = excluded.email,
    name = excluded.name,
    role = excluded.role,
    branch = excluded.branch,
    avatar = excluded.avatar,
    staff_sales_all = excluded.staff_sales_all,
    login_password_hash = excluded.login_password_hash,
    active = true,
    updated_at = now();
end $$;
