-- One-shot helper so service-role clients can clear demo/dev ledger rows.
-- Safe to keep: only callable with service role / elevated privileges in practice via RPC + grants.

create or replace function public.clear_inventory_ledger()
returns bigint
language plpgsql
security definer
set search_path = public
as $$
declare
  removed bigint;
begin
  alter table public.inventory_ledger disable trigger inventory_ledger_immutable;
  delete from public.inventory_ledger;
  get diagnostics removed = row_count;
  alter table public.inventory_ledger enable trigger inventory_ledger_immutable;
  return removed;
end;
$$;

revoke all on function public.clear_inventory_ledger() from public;
revoke all on function public.clear_inventory_ledger() from anon, authenticated;
grant execute on function public.clear_inventory_ledger() to service_role;
