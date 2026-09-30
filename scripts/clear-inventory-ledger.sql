-- Clear inventory_ledger (append-only trigger must be disabled briefly).
alter table public.inventory_ledger disable trigger inventory_ledger_immutable;
delete from public.inventory_ledger;
alter table public.inventory_ledger enable trigger inventory_ledger_immutable;
