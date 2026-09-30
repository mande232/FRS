-- POS timing / OOS settings on normalized inventory_settings + dual-write support.
-- module_records remains the primary runtime source; inventory_* is best-effort sync.

alter table public.inventory_settings
  add column if not exists pos_reservation_trigger text not null default 'station_accept',
  add column if not exists pos_deduction_timing text not null default 'item_ready',
  add column if not exists pos_out_of_stock_behavior text not null default 'block';

do $$
begin
  alter table public.inventory_settings
    drop constraint if exists inventory_settings_pos_reservation_trigger_check;
  alter table public.inventory_settings
    add constraint inventory_settings_pos_reservation_trigger_check
    check (pos_reservation_trigger in ('order_submit', 'station_accept', 'prep_start'));

  alter table public.inventory_settings
    drop constraint if exists inventory_settings_pos_deduction_timing_check;
  alter table public.inventory_settings
    add constraint inventory_settings_pos_deduction_timing_check
    check (pos_deduction_timing in (
      'order_submit', 'station_accept', 'prep_start', 'item_ready', 'item_served', 'payment_completed', 'order_closed'
    ));

  alter table public.inventory_settings
    drop constraint if exists inventory_settings_pos_out_of_stock_behavior_check;
  alter table public.inventory_settings
    add constraint inventory_settings_pos_out_of_stock_behavior_check
    check (pos_out_of_stock_behavior in ('block', 'warn_manager', 'allow_negative_authorized', 'auto_unavailable'));
exception
  when others then
    raise notice 'POS inventory settings constraints skipped: %', sqlerrm;
end $$;
