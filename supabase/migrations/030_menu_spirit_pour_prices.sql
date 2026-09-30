-- Spirit pour prices on menu items (Bottle stays in price; VIP seating markup stays vip_price).
alter table public.menu_items
  add column if not exists single_price numeric(12, 2),
  add column if not exists double_price numeric(12, 2);

-- Migrate Spirits that stored double-shot price in vip_price.
update public.menu_items
set
  double_price = coalesce(double_price, vip_price),
  single_price = coalesce(single_price, round((vip_price / 2.0)::numeric, 2)),
  vip_price = null,
  unit_label = coalesce(nullif(unit_label, ''), 'Bottle'),
  updated_at = now()
where lower(trim(category)) = 'spirits'
  and vip_price is not null
  and vip_price > 0
  and double_price is null;
