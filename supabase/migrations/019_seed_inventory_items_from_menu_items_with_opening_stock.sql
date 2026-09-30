-- Seed normalized inventory items from active menu items with category-based opening stock.
--
-- Goal:
-- - create / refresh stock-master rows in public.inventory_items
-- - use menu_items as the source for names/prices/stations
-- - assign safer default opening stock and reorder levels by category/station
-- - skip obvious test/junk rows and avoid pushing prepared dishes into raw stock by default

with eligible_menu_items as (
  select
    mi.*,
    coalesce(nullif(trim(mi.stock_sku), ''), concat('stk-', mi.id)) as stock_id,
    lower(trim(coalesce(mi.name_en, ''))) as lower_name,
    row_number() over (
      partition by coalesce(nullif(trim(mi.stock_sku), ''), concat('stk-', mi.id))
      order by mi.updated_at desc nulls last, mi.created_at desc nulls last, mi.id asc
    ) as sku_rank
  from public.menu_items mi
  where mi.active = true
    and coalesce(nullif(trim(mi.name_en), ''), '') <> ''
    and lower(trim(coalesce(mi.name_en, ''))) not in ('sd', 'df', 'item', 'new menu', 'beer')
    and lower(trim(coalesce(mi.category, ''))) not in ('test')
),
deduped as (
  select *
  from eligible_menu_items
  where sku_rank = 1
),
classified as (
  select
    d.id,
    d.stock_id,
    d.name_en,
    d.name_am,
    d.category as menu_category,
    d.station,
    d.price,
    d.cost,
    d.vip_price,
    d.pricing_mode,
    d.unit_label,
    d.lower_name,
    case
      when d.station = 'Coffee House' then 'Coffee House'
      when d.station = 'Butcher House' then 'Meat'
      when d.category = 'Whisky' then 'Whisky'
      when d.category = 'Beer' then 'Beer'
      when d.category in ('Soft Drinks', 'Water', 'Other Drinks', 'Traditional Drink', 'Drinks', 'Beverage') then 'Soft Drink'
      when d.category = 'Meat' then 'Meat'
      when d.category = 'Weyn' then 'Soft Drink'
      when d.station in ('Main Bar', 'VIP Bar', 'Bar') then 'Bar'
      else 'Kitchen'
    end as stock_category,
    case
      when d.pricing_mode = 'kg' then 'kg'
      when d.station = 'Coffee House' and d.lower_name like '%coffee%' then 'kg'
      when lower(coalesce(d.unit_label, '')) in ('bottle', 'glass') then 'bottle'
      when lower(coalesce(d.unit_label, '')) in ('piece', 'pcs', 'plate', 'portion', 'cup') then 'pcs'
      when d.category = 'Meat' then 'kg'
      else 'pcs'
    end as base_unit,
    case
      when d.station = 'Coffee House' then 'Coffee House'
      when d.station = 'Butcher House' then 'Butcher'
      when d.station in ('Main Bar', 'VIP Bar') then d.station
      when d.station = 'Bar' then 'Main Bar'
      when d.category = 'Meat' then 'Butcher'
      else 'Kitchen'
    end as preferred_location,
    case
      when d.category in ('Beer', 'Soft Drinks', 'Water', 'Other Drinks', 'Traditional Drink', 'Drinks', 'Beverage', 'Weyn', 'Whisky') then true
      when d.station = 'Coffee House' then true
      when d.category = 'Meat' and d.pricing_mode = 'kg' then true
      else false
    end as should_seed
  from deduped d
),
final as (
  select
    c.stock_id as id,
    c.name_en as name,
    c.stock_category as category,
    c.base_unit,
    case
      when coalesce(c.cost, 0) > 0 then c.cost
      when c.stock_category = 'Whisky' then round(greatest(coalesce(c.price, 0), 1000) * 0.55)
      when c.stock_category = 'Beer' then round(greatest(coalesce(c.price, 0), 120) * 0.50)
      when c.stock_category = 'Soft Drink' then round(greatest(coalesce(c.price, 0), 60) * 0.40)
      when c.stock_category = 'Bar' then round(greatest(coalesce(c.price, 0), 800) * 0.55)
      when c.stock_category = 'Meat' then round(greatest(coalesce(c.price, 0), 700) * 0.60)
      when c.stock_category = 'Coffee House' then round(greatest(coalesce(c.price, 0), 35) * 0.35)
      else round(greatest(coalesce(c.price, 0), 100) * 0.45)
    end::numeric(14, 2) as purchase_price,
    coalesce(c.price, 0)::numeric(14, 2) as selling_price,
    nullif(coalesce(c.vip_price, 0), 0)::numeric(14, 2) as vip_selling_price,
    case
      when c.stock_category = 'Whisky' and c.preferred_location = 'VIP Bar' then 2
      when c.stock_category = 'Whisky' then 3
      when c.stock_category = 'Beer' then 24
      when c.stock_category = 'Soft Drink' then 24
      when c.stock_category = 'Bar' then 6
      when c.stock_category = 'Coffee House' then 6
      when c.stock_category = 'Meat' then 8
      else 10
    end::numeric(14, 3) as reorder_level,
    c.preferred_location,
    case
      when c.stock_category = 'Beer' then 'Dashen Brewery'
      when c.stock_category = 'Soft Drink' then 'Ambo Mineral Water'
      when c.stock_category = 'Meat' then 'Merkato Fresh Supplies'
      when c.stock_category = 'Coffee House' then 'Sidama Coffee Union'
      else 'Addis Beverage Supply'
    end as supplier_name,
    case
      when c.stock_category = 'Whisky' and c.preferred_location = 'VIP Bar' then 3
      when c.stock_category = 'Whisky' then 6
      when c.stock_category = 'Beer' then 72
      when c.stock_category = 'Soft Drink' then 96
      when c.stock_category = 'Bar' then 24
      when c.stock_category = 'Coffee House' then 20
      when c.stock_category = 'Meat' then 40
      else 50
    end::numeric(14, 3) as opening_stock,
    now() as seeded_at
  from classified c
  where c.should_seed = true
)
insert into public.inventory_items (
  id,
  name,
  category,
  base_unit,
  purchase_price,
  selling_price,
  vip_selling_price,
  standard_cost,
  reorder_level,
  preferred_location,
  supplier_name,
  conversions,
  track_batch_expiry,
  notes,
  opening_stock,
  active,
  created_at,
  updated_at
)
select
  f.id,
  f.name,
  f.category,
  f.base_unit,
  f.purchase_price,
  f.selling_price,
  f.vip_selling_price,
  round(f.purchase_price * 0.98, 2) as standard_cost,
  f.reorder_level,
  f.preferred_location,
  f.supplier_name,
  case
    when f.base_unit = 'bottle' and f.category = 'Whisky' then jsonb_build_array(
      jsonb_build_object('id', concat('conv-', f.id, '-case'), 'label', '1 case = 12 bottles', 'fromUnit', 'case', 'toUnit', 'bottle', 'multiplier', 12),
      jsonb_build_object('id', concat('conv-', f.id, '-double'), 'label', '1 bottle = 16 double shots', 'fromUnit', 'bottle', 'toUnit', 'double shot', 'multiplier', 16)
    )
    when f.base_unit = 'bottle' then jsonb_build_array(
      jsonb_build_object('id', concat('conv-', f.id, '-case'), 'label', '1 case = 12 bottles', 'fromUnit', 'case', 'toUnit', 'bottle', 'multiplier', 12)
    )
    else '[]'::jsonb
  end as conversions,
  false,
  'Seeded from active menu items with category-based opening stock defaults.',
  f.opening_stock,
  true,
  f.seeded_at,
  f.seeded_at
from final f
on conflict (id) do update set
  name = excluded.name,
  category = excluded.category,
  base_unit = excluded.base_unit,
  purchase_price = excluded.purchase_price,
  selling_price = excluded.selling_price,
  vip_selling_price = excluded.vip_selling_price,
  standard_cost = excluded.standard_cost,
  reorder_level = excluded.reorder_level,
  preferred_location = excluded.preferred_location,
  supplier_name = excluded.supplier_name,
  conversions = excluded.conversions,
  opening_stock = excluded.opening_stock,
  active = true,
  updated_at = now();