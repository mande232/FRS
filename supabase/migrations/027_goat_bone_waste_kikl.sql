-- Optional bone (Kikl pool) and waste (yield tracking) on goat registration.

alter table public.goat_registrations
  add column if not exists bone_kg numeric(14, 3) not null default 0 check (bone_kg >= 0),
  add column if not exists waste_kg numeric(14, 3) not null default 0 check (waste_kg >= 0);

insert into public.inventory_items (
  id, name, category, base_unit, purchase_price, selling_price, vip_selling_price,
  standard_cost, reorder_level, preferred_location, supplier_name, conversions,
  track_batch_expiry, notes, opening_stock, active, created_at, updated_at
)
values
  (
    'stk-goat-bones',
    'Goat Bones (Kikl)',
    'Meat',
    'kg',
    0,
    0,
    null,
    0,
    0,
    'Butcher',
    'Direct purchase',
    '[]'::jsonb,
    false,
    'Butcher goat pool — bones for Kikl (plate recipe)',
    0,
    true,
    now(),
    now()
  )
on conflict (id) do update set
  name = excluded.name,
  category = excluded.category,
  base_unit = excluded.base_unit,
  preferred_location = excluded.preferred_location,
  notes = excluded.notes,
  active = true,
  updated_at = now();

-- Kikl sold by plate: recipe deducts goat bones from Butcher (0.5 kg/plate default).
update public.menu_items
set stock_sku = '', updated_at = now()
where id in ('kikl', 'm1783247305621')
   or lower(name_en) = 'kikl';

insert into public.module_records (module_key, record_id, data, position, active, updated_at)
values
  (
    'stock-recipes',
    'recipe-kikl-goat-bones',
    jsonb_build_object(
      'id', 'recipe-kikl-goat-bones',
      'menuItemName', 'Kikl',
      'category', 'Meat',
      'outputQty', 1,
      'outputUnit', 'plate',
      'stockDeductionLocation', 'Butcher',
      'preparationStation', 'Kitchen',
      'wastageAllowance', 0,
      'ingredients', jsonb_build_array(
        jsonb_build_object(
          'id', 'kikl-goat-bone-1',
          'itemId', 'stk-goat-bones',
          'itemName', 'Goat Bones (Kikl)',
          'quantity', 0.5,
          'unit', 'kg',
          'stockDeductionLocation', 'Butcher'
        )
      ),
      'notes', '1 plate Kikl = 0.5 kg goat bones from Butcher (adjust in Recipes if needed).',
      'updatedAt', to_char(now() at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')
    ),
    0,
    true,
    now()
  )
on conflict (module_key, record_id) do update set
  data = excluded.data,
  active = true,
  updated_at = now();
