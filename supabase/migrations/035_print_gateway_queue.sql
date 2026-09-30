-- Print gateway queue: gateways, printers, jobs, audit, claim RPCs, RLS, realtime.

create table if not exists public.print_gateways (
  id text primary key,
  code text not null unique,
  name text not null,
  branch text not null default 'Main',
  status text not null default 'OFFLINE'
    check (status in ('ONLINE', 'OFFLINE', 'DEGRADED')),
  last_seen_at timestamptz,
  claimed_by_user_id uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.printers (
  id text primary key,
  name text not null,
  printer_type text not null default 'thermal'
    check (printer_type in ('thermal', 'impact', 'other')),
  connection_type text not null default 'windows'
    check (connection_type in ('bluetooth', 'network', 'windows')),
  station_id text,
  gateway_id text not null references public.print_gateways(id) on delete cascade,
  paper_width text not null default '80mm'
    check (paper_width in ('58mm', '80mm')),
  status text not null default 'OFFLINE'
    check (status in ('ONLINE', 'OFFLINE', 'DEGRADED')),
  last_seen_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.print_jobs (
  id text primary key,
  order_id text,
  printer_id text references public.printers(id) on delete set null,
  gateway_id text not null references public.print_gateways(id) on delete restrict,
  job_type text not null
    check (job_type in ('STATION_BONO', 'CUSTOMER_RECEIPT', 'REPRINT', 'TEST')),
  status text not null default 'QUEUED'
    check (status in ('QUEUED', 'CLAIMED', 'PRINTING', 'PRINTED', 'FAILED', 'CANCELLED')),
  payload jsonb not null default '{}'::jsonb,
  attempt_count integer not null default 0,
  max_attempts integer not null default 5,
  requested_by text,
  claimed_by text,
  claimed_at timestamptz,
  printed_at timestamptz,
  failed_at timestamptz,
  error_message text,
  reprint_of text references public.print_jobs(id) on delete set null,
  reprint_reason text,
  idempotency_key text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint print_jobs_idempotency_key_unique unique (idempotency_key)
);

create table if not exists public.print_job_events (
  id bigserial primary key,
  job_id text references public.print_jobs(id) on delete cascade,
  gateway_id text references public.print_gateways(id) on delete set null,
  printer_id text references public.printers(id) on delete set null,
  order_id text,
  event_type text not null,
  actor text,
  detail text,
  meta jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists print_jobs_gateway_status_created_idx
  on public.print_jobs (gateway_id, status, created_at);
create index if not exists print_jobs_order_id_idx
  on public.print_jobs (order_id);
create index if not exists print_jobs_status_created_idx
  on public.print_jobs (status, created_at);
create index if not exists print_job_events_job_id_idx
  on public.print_job_events (job_id, created_at desc);
create index if not exists printers_gateway_id_idx
  on public.printers (gateway_id);

-- Helpers -------------------------------------------------------------------

create or replace function public.current_staff_role()
returns text
language sql
stable
security definer
set search_path = public
as $$
  select role from public.profiles where id = auth.uid();
$$;

create or replace function public.is_print_operator()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    (select role from public.profiles where id = auth.uid())
      in (
        'Administrator',
        'Branch Manager',
        'Supervisor',
        'Cashier'
      ),
    false
  );
$$;

create or replace function public.append_print_job_event(
  p_job_id text,
  p_event_type text,
  p_actor text default null,
  p_detail text default null,
  p_meta jsonb default '{}'::jsonb
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_job public.print_jobs%rowtype;
begin
  if p_job_id is not null then
    select * into v_job from public.print_jobs where id = p_job_id;
  end if;
  insert into public.print_job_events (
    job_id, gateway_id, printer_id, order_id, event_type, actor, detail, meta
  ) values (
    p_job_id,
    v_job.gateway_id,
    v_job.printer_id,
    v_job.order_id,
    p_event_type,
    coalesce(p_actor, auth.jwt() ->> 'email'),
    p_detail,
    coalesce(p_meta, '{}'::jsonb)
  );
end;
$$;

-- Atomic claim --------------------------------------------------------------

create or replace function public.claim_next_print_job(
  p_gateway_id text,
  p_worker_id text default null
)
returns public.print_jobs
language plpgsql
security definer
set search_path = public
as $$
declare
  v_job public.print_jobs%rowtype;
  v_worker text := coalesce(nullif(trim(p_worker_id), ''), auth.uid()::text, 'gateway');
begin
  if auth.uid() is null then
    raise exception 'Authentication required';
  end if;
  if not public.is_print_operator() then
    raise exception 'Not authorized to claim print jobs';
  end if;

  select *
  into v_job
  from public.print_jobs
  where gateway_id = p_gateway_id
    and status = 'QUEUED'
  order by created_at asc
  for update skip locked
  limit 1;

  if not found then
    return null;
  end if;

  update public.print_jobs
  set
    status = 'CLAIMED',
    claimed_by = v_worker,
    claimed_at = now(),
    attempt_count = attempt_count + 1,
    updated_at = now()
  where id = v_job.id
  returning * into v_job;

  perform public.append_print_job_event(
    v_job.id,
    'PRINT_JOB_CLAIMED',
    v_worker,
    'Claimed by gateway worker',
    jsonb_build_object('gateway_id', p_gateway_id, 'worker_id', v_worker)
  );

  return v_job;
end;
$$;

create or replace function public.mark_print_job_printing(p_job_id text)
returns public.print_jobs
language plpgsql
security definer
set search_path = public
as $$
declare
  v_job public.print_jobs%rowtype;
begin
  if auth.uid() is null or not public.is_print_operator() then
    raise exception 'Not authorized';
  end if;

  update public.print_jobs
  set status = 'PRINTING', updated_at = now()
  where id = p_job_id
    and status in ('CLAIMED', 'PRINTING')
  returning * into v_job;

  if not found then
    raise exception 'Job % not claimable for printing', p_job_id;
  end if;

  perform public.append_print_job_event(v_job.id, 'PRINT_STARTED', v_job.claimed_by, null, '{}'::jsonb);
  return v_job;
end;
$$;

create or replace function public.complete_print_job(p_job_id text)
returns public.print_jobs
language plpgsql
security definer
set search_path = public
as $$
declare
  v_job public.print_jobs%rowtype;
begin
  if auth.uid() is null or not public.is_print_operator() then
    raise exception 'Not authorized';
  end if;

  update public.print_jobs
  set
    status = 'PRINTED',
    printed_at = now(),
    error_message = null,
    updated_at = now()
  where id = p_job_id
    and status in ('CLAIMED', 'PRINTING')
  returning * into v_job;

  if not found then
    raise exception 'Job % cannot be completed', p_job_id;
  end if;

  perform public.append_print_job_event(v_job.id, 'PRINT_COMPLETED', v_job.claimed_by, null, '{}'::jsonb);
  return v_job;
end;
$$;

create or replace function public.fail_print_job(
  p_job_id text,
  p_error text default null,
  p_requeue boolean default false
)
returns public.print_jobs
language plpgsql
security definer
set search_path = public
as $$
declare
  v_job public.print_jobs%rowtype;
  v_next_status text;
begin
  if auth.uid() is null or not public.is_print_operator() then
    raise exception 'Not authorized';
  end if;

  select * into v_job from public.print_jobs where id = p_job_id for update;
  if not found then
    raise exception 'Job % not found', p_job_id;
  end if;

  if p_requeue and v_job.attempt_count < v_job.max_attempts then
    v_next_status := 'QUEUED';
  else
    v_next_status := 'FAILED';
  end if;

  update public.print_jobs
  set
    status = v_next_status,
    failed_at = case when v_next_status = 'FAILED' then now() else failed_at end,
    error_message = coalesce(nullif(trim(p_error), ''), error_message),
    claimed_by = case when v_next_status = 'QUEUED' then null else claimed_by end,
    claimed_at = case when v_next_status = 'QUEUED' then null else claimed_at end,
    updated_at = now()
  where id = p_job_id
  returning * into v_job;

  perform public.append_print_job_event(
    v_job.id,
    case when v_next_status = 'QUEUED' then 'PRINT_RETRIED' else 'PRINT_FAILED' end,
    v_job.claimed_by,
    p_error,
    jsonb_build_object('requeue', p_requeue, 'attempt_count', v_job.attempt_count)
  );

  return v_job;
end;
$$;

create or replace function public.heartbeat_print_gateway(
  p_gateway_code text,
  p_status text default 'ONLINE',
  p_printer_status text default 'ONLINE'
)
returns public.print_gateways
language plpgsql
security definer
set search_path = public
as $$
declare
  v_gateway public.print_gateways%rowtype;
  v_status text := coalesce(nullif(trim(p_status), ''), 'ONLINE');
  v_printer_status text := coalesce(nullif(trim(p_printer_status), ''), 'ONLINE');
begin
  if auth.uid() is null or not public.is_print_operator() then
    raise exception 'Not authorized';
  end if;
  if v_status not in ('ONLINE', 'OFFLINE', 'DEGRADED') then
    v_status := 'ONLINE';
  end if;
  if v_printer_status not in ('ONLINE', 'OFFLINE', 'DEGRADED') then
    v_printer_status := 'ONLINE';
  end if;

  update public.print_gateways
  set
    status = v_status,
    last_seen_at = now(),
    claimed_by_user_id = auth.uid(),
    updated_at = now()
  where code = p_gateway_code
  returning * into v_gateway;

  if not found then
    raise exception 'Unknown gateway code %', p_gateway_code;
  end if;

  update public.printers
  set
    status = v_printer_status,
    last_seen_at = now(),
    updated_at = now()
  where gateway_id = v_gateway.id;

  return v_gateway;
end;
$$;

create or replace function public.retry_failed_print_job(p_job_id text)
returns public.print_jobs
language plpgsql
security definer
set search_path = public
as $$
declare
  v_job public.print_jobs%rowtype;
begin
  if auth.uid() is null or not public.is_print_operator() then
    raise exception 'Not authorized';
  end if;

  update public.print_jobs
  set
    status = 'QUEUED',
    error_message = null,
    claimed_by = null,
    claimed_at = null,
    failed_at = null,
    updated_at = now()
  where id = p_job_id
    and status in ('FAILED', 'CANCELLED')
  returning * into v_job;

  if not found then
    raise exception 'Job % cannot be retried', p_job_id;
  end if;

  perform public.append_print_job_event(v_job.id, 'PRINT_RETRIED', null, 'Manual retry', '{}'::jsonb);
  return v_job;
end;
$$;

-- RLS -----------------------------------------------------------------------

alter table public.print_gateways enable row level security;
alter table public.printers enable row level security;
alter table public.print_jobs enable row level security;
alter table public.print_job_events enable row level security;

drop policy if exists "print_gateways readable by staff" on public.print_gateways;
create policy "print_gateways readable by staff"
  on public.print_gateways for select to authenticated using (true);

drop policy if exists "print_gateways writable by operators" on public.print_gateways;
create policy "print_gateways writable by operators"
  on public.print_gateways for all to authenticated
  using (public.is_print_operator())
  with check (public.is_print_operator());

drop policy if exists "printers readable by staff" on public.printers;
create policy "printers readable by staff"
  on public.printers for select to authenticated using (true);

drop policy if exists "printers writable by operators" on public.printers;
create policy "printers writable by operators"
  on public.printers for all to authenticated
  using (public.is_print_operator())
  with check (public.is_print_operator());

drop policy if exists "print_jobs readable by staff" on public.print_jobs;
create policy "print_jobs readable by staff"
  on public.print_jobs for select to authenticated using (true);

drop policy if exists "print_jobs insert by staff" on public.print_jobs;
create policy "print_jobs insert by staff"
  on public.print_jobs for insert to authenticated
  with check (status = 'QUEUED');

drop policy if exists "print_jobs update by operators" on public.print_jobs;
create policy "print_jobs update by operators"
  on public.print_jobs for update to authenticated
  using (public.is_print_operator())
  with check (public.is_print_operator());

drop policy if exists "print_job_events readable by staff" on public.print_job_events;
create policy "print_job_events readable by staff"
  on public.print_job_events for select to authenticated using (true);

drop policy if exists "print_job_events insert by staff" on public.print_job_events;
create policy "print_job_events insert by staff"
  on public.print_job_events for insert to authenticated with check (true);

grant execute on function public.claim_next_print_job(text, text) to authenticated;
grant execute on function public.mark_print_job_printing(text) to authenticated;
grant execute on function public.complete_print_job(text) to authenticated;
grant execute on function public.fail_print_job(text, text, boolean) to authenticated;
grant execute on function public.heartbeat_print_gateway(text, text, text) to authenticated;
grant execute on function public.retry_failed_print_job(text) to authenticated;
grant execute on function public.is_print_operator() to authenticated;
grant execute on function public.current_staff_role() to authenticated;

-- Realtime ------------------------------------------------------------------

do $$
begin
  alter publication supabase_realtime add table public.print_jobs;
exception when duplicate_object then null;
end $$;

do $$
begin
  alter publication supabase_realtime add table public.print_gateways;
exception when duplicate_object then null;
end $$;

-- Seed default gateway + main printer ---------------------------------------

insert into public.print_gateways (id, code, name, branch, status)
values (
  'gw-cashier-laptop-01',
  'CASHIER-LAPTOP-01',
  'Cashier Laptop',
  'Main',
  'OFFLINE'
)
on conflict (id) do nothing;

insert into public.printers (
  id, name, printer_type, connection_type, station_id, gateway_id, paper_width, status
)
values (
  'prt-main-receipt',
  'Main Receipt Printer',
  'thermal',
  'windows',
  null,
  'gw-cashier-laptop-01',
  '80mm',
  'OFFLINE'
)
on conflict (id) do nothing;
