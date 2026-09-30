-- Half-bottle pour pricing for VIP Bar spirits / whisky.
alter table public.menu_items
  add column if not exists half_bottle_price numeric(12, 2);

update public.menu_items
set half_bottle_price = coalesce(
  half_bottle_price,
  round((price / 2.0)::numeric, 2)
)
where lower(category) in ('spirits', 'whisky', 'whiskey', 'spirit')
  and price is not null
  and price > 0
  and half_bottle_price is null;
