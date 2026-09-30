-- Phase 2: posted stock-ledger rows in module_records must not be updated or deleted.
-- Corrections are made only via cancellation / reversal documents (new append-only rows).
--
-- NOTE: DROP/CREATE TRIGGER needs a lock on module_records. Concurrent app/Realtime
-- traffic can cause deadlocks (40P01). This migration retries with a short lock_timeout.

create or replace function public.prevent_immutable_stock_ledger_mutation()
returns trigger
language plpgsql
as $$
begin
  if tg_op = 'DELETE' then
    if old.module_key = 'stock-ledger' and coalesce((old.data->>'immutable')::boolean, true) then
      raise exception 'Immutable stock ledger entries cannot be deleted. Post a cancellation reversal voucher instead.';
    end if;
    return old;
  end if;

  if tg_op = 'UPDATE' and old.module_key = 'stock-ledger' and coalesce((old.data->>'immutable')::boolean, true) then
    -- Allow soft-deactivate only when explicitly flipping active; block data mutation of posted rows.
    if old.data is distinct from new.data then
      raise exception 'Immutable stock ledger entries cannot be edited. Post a cancellation reversal voucher instead.';
    end if;
  end if;

  return new;
end;
$$;

do $$
declare
  attempt integer := 0;
begin
  -- Prefer a short lock wait so we can retry. Ignore if the role cannot set lock_timeout.
  begin
    perform set_config('lock_timeout', '3s', true);
  exception
    when insufficient_privilege then
      null;
  end;

  loop
    attempt := attempt + 1;
    begin
      drop trigger if exists module_records_immutable_stock_ledger on public.module_records;
      create trigger module_records_immutable_stock_ledger
      before update or delete on public.module_records
      for each row execute function public.prevent_immutable_stock_ledger_mutation();
      exit;
    exception
      when deadlock_detected then
        if attempt >= 8 then
          raise exception 'Could not install immutable stock-ledger trigger after % attempts due to deadlock. Pause app traffic / Realtime and retry.', attempt;
        end if;
        perform pg_sleep(0.4 * attempt);
      when lock_not_available then
        if attempt >= 8 then
          raise exception 'Could not lock module_records after % attempts. Pause stock sync / Realtime and retry.', attempt;
        end if;
        perform pg_sleep(0.4 * attempt);
    end;
  end loop;
end;
$$;
