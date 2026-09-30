-- Seed stock management module records from the current public.menu_items data.
-- The stock-management UI reads from public.module_records where module_key = 'stock-items'.

-- unit_label is formally added in 023; ensure it exists when this seed runs earlier.
alter table public.menu_items
  add column if not exists unit_label text;

with menu_source as (
  select
    mi.id,
    mi.name_en,
    mi.category,
    mi.station,
    coalesce(nullif(trim(mi.stock_sku), ''), concat('stk-', mi.id)) as stock_id,
    coalesce(nullif(trim(mi.unit_label), ''), 'pcs') as unit_label,
    coalesce(mi.cost, 0) as purchase_price,
    coalesce(mi.price, 0) as selling_price,
    mi.vip_price,
    row_number() over (
      partition by coalesce(nullif(trim(mi.stock_sku), ''), concat('stk-', mi.id))
      order by mi.updated_at desc nulls last, mi.created_at desc nulls last, mi.id asc
    ) as sku_rank
  from public.menu_items mi
  where mi.active = true
),
stock_seed as (
  select
    stock_id,
    name_en,
    category,
    station,
    unit_label,
    purchase_price,
    selling_price,
    vip_price
  from menu_source
  where sku_rank = 1
)
insert into public.module_records (module_key, record_id, position, active, data)
select
  'stock-items' as module_key,
  stock_id as record_id,
  row_number() over (order by station, category, name_en) as position,
  true as active,
  jsonb_build_object(
    'id', stock_id,
    'name', name_en,
    'category', case
      when category = 'Whisky' then 'Whisky'
      when category = 'Beer' then 'Beer'
      when category = 'Soft Drinks' then 'Soft Drink'
      when category in ('Weyn', 'Water') then 'Water'
      when category = 'Meat' then 'Meat'
      when station = 'Coffee House' then 'Coffee House'
      else 'Kitchen'
    end,
    'baseUnit', case
      when station = 'Coffee House' and lower(name_en) like '%coffee%' then 'kg'
      when lower(unit_label) = 'bottle' then 'bottle'
      when lower(unit_label) = 'glass' then 'bottle'
      when lower(unit_label) in ('piece', 'pcs') then 'pcs'
      when lower(unit_label) in ('plate', 'portion') then 'pcs'
      else 'pcs'
    end,
    'purchasePrice', case
      when purchase_price > 0 then purchase_price
      -- fallback estimates by category when cost column is 0
      when category = 'Whisky'                                                    then (selling_price * 0.55)::int
      when category = 'Beer'                                                      then (selling_price * 0.50)::int
      when category in ('Soft Drinks', 'Water')                                   then (selling_price * 0.40)::int
      when category = 'Spirits'                                                   then (selling_price * 0.55)::int
      when category = 'Meat'                                                      then (selling_price * 0.60)::int
      when station  = 'Coffee House'                                              then (selling_price * 0.35)::int
      else                                                                             (selling_price * 0.45)::int
    end,
    'sellingPrice', selling_price,
    'vipSellingPrice', vip_price,
    'reorderLevel', case
      when category = 'Whisky' then 6
      when category = 'Beer' then 48
      when category in ('Soft Drinks', 'Weyn', 'Water', 'Traditional Drink', 'Other Drinks', 'Beverage', 'Drinks') then 24
      when category = 'Meat' then 10
      when station = 'Coffee House' then 8
      else 12
    end,
    'currentStock', case
      when category = 'Whisky' then 24
      when category = 'Beer' then 240
      when category in ('Soft Drinks', 'Weyn', 'Water', 'Traditional Drink', 'Other Drinks', 'Beverage', 'Drinks') then 96
      when category = 'Meat' then 40
      when station = 'Coffee House' then 20
      else 50
    end,
    'preferredLocation', case
      when station = 'Coffee House' then 'Coffee House'
      when station = 'Butcher House' then 'Butcher / Siga Bet'
      when station in ('Main Bar', 'VIP Bar') then station
      when station = 'Bar' then 'Main Bar'
      else 'Kitchen'
    end,
    'supplierName', '',
    'conversions', case
      when lower(unit_label) in ('bottle', 'glass') and category = 'Whisky' then
        jsonb_build_array(
          jsonb_build_object('id', concat('conv-', stock_id, '-case'), 'label', '1 case = 12 bottles', 'fromUnit', 'case', 'toUnit', 'bottle', 'multiplier', 12),
          jsonb_build_object('id', concat('conv-', stock_id, '-double'), 'label', '1 bottle = 16 double shots', 'fromUnit', 'bottle', 'toUnit', 'double shot', 'multiplier', 16)
        )
      when lower(unit_label) in ('bottle', 'glass') then
        jsonb_build_array(
          jsonb_build_object('id', concat('conv-', stock_id, '-case'), 'label', '1 case = 12 bottles', 'fromUnit', 'case', 'toUnit', 'bottle', 'multiplier', 12)
        )
      else '[]'::jsonb
    end,
    'notes', concat('Seeded from menu item category: ', category),
    'createdAt', now(),
    'updatedAt', now()
  )
from stock_seed
on conflict (module_key, record_id) do update set
  data = excluded.data,
  position = excluded.position,
  active = true,
  updated_at = now();