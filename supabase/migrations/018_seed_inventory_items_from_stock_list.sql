-- Seed normalized inventory items from the supplied legacy stock list.
--
-- Pricing is sourced from public.menu_items (menu seed / demo-data prices) using the
-- same purchase-cost fallback rules as 013_menu_items_to_stock_items_seed.sql.
-- Category, unit, and preferred_location follow each menu item's station/category,
-- matching the stock module seed rules in migration 013.
--
-- Only writes to public.inventory_items (source of truth). The stock UI rebuilds
-- module_records from inventory_items on load — do not seed module_records here;
-- concurrent app sync causes deadlocks on that table.
with seed_items(id, name) as (
  values
    ('stk-1783415491741', 'sd'),
    ('stk-5-label', '5 Label'),
    ('stk-7-up', '7UP'),
    ('stk-absolute-elyx', 'Absolute Elyx'),
    ('stk-acacia', 'Acacia Wayne'),
    ('stk-amarula', 'Amarula'),
    ('stk-ambuha', 'Ambuha'),
    ('stk-arada', 'Arada'),
    ('stk-areki', 'Telba Juice'),
    ('stk-ater-fitfit', 'Ater Fitfit'),
    ('stk-awash', 'Awash Wayne'),
    ('stk-axumit', 'Axumit Wayne'),
    ('stk-bacardi-075l', 'Bacardi 0.75L'),
    ('stk-bacardi-1l', 'Bacardi 1L'),
    ('stk-ballantines', 'Ballantine''s'),
    ('stk-bedeli', 'Bedelle'),
    ('stk-beehive-vsop', 'Beehive VSOP'),
    ('stk-beyaynet', 'Beyaynet'),
    ('stk-black-label', 'Black Label'),
    ('stk-black-label-2l', 'Black Label 2L'),
    ('stk-black-ruby', 'Black Ruby'),
    ('stk-blue-label', 'Blue Label'),
    ('stk-camino-tequila', 'Camino Tequila'),
    ('stk-camus-vsop', 'Camus VSOP'),
    ('stk-captain-morgan', 'Captain Morgan'),
    ('stk-casamigos', 'Casamigos'),
    ('stk-castel-beer', 'Castel'),
    ('stk-castel-champagne', 'Castel Champagne'),
    ('stk-castel-wine', 'Castel Wine'),
    ('stk-chianti', 'Chianti'),
    ('stk-chivas-12', 'Chivas 12'),
    ('stk-chivas-18', 'Chivas 18'),
    ('stk-ciroc', 'Ciroc'),
    ('stk-coca-cola', 'Coca-Cola'),
    ('stk-collection-yefyel', 'Collection Yefyel'),
    ('stk-courvoisier-vs', 'Courvoisier VS'),
    ('stk-dashen', 'Dashen'),
    ('stk-dech-vodka', 'Dech Vodka'),
    ('stk-delamain-cognac', 'Delamain Cognac'),
    ('stk-derek-enjera', 'Derek Enjera'),
    ('stk-dimple', 'Dimple'),
    ('stk-disaronno', 'Disaronno'),
    ('stk-don-julio', 'Don Julio'),
    ('stk-don-julio-small', 'Don Julio Small'),
    ('stk-double-black', 'Double Black'),
    ('stk-draft-beer', 'Draft Beer'),
    ('stk-drekosh-firfir', 'Drekosh Firfir'),
    ('stk-dulet', 'Dulet'),
    ('stk-fanta', 'Fanta'),
    ('stk-fernet-branca', 'Fernet Branca'),
    ('stk-foyel', 'Foyel'),
    ('stk-gaz-layt', 'Gaz Layt'),
    ('stk-gebeta-2l', 'Gebeta 2L'),
    ('stk-gebeta-water', 'Gebeta Wayne'),
    ('stk-glass-wine', 'Glass Wine'),
    ('stk-glenfiddich-12', 'Glenfiddich 12'),
    ('stk-glenfiddich-15', 'Glenfiddich 15'),
    ('stk-glenfiddich-18', 'Glenfiddich 18'),
    ('stk-godfather', 'Godfather'),
    ('stk-godn', 'Godn'),
    ('stk-gold', 'Gold'),
    ('stk-gomen-kitfo', 'Gomen Kitfo'),
    ('stk-gomen-tibs', 'Gomen Tibs'),
    ('stk-gordons', 'Gordon''s'),
    ('stk-grey-goose', 'Grey Goose'),
    ('stk-grill-tibs', 'Grill Tibs'),
    ('stk-gubet', 'Gubet'),
    ('stk-guder', 'Guder Wayne'),
    ('stk-habesha', 'Habesha'),
    ('stk-haf-haaf', 'Haf Haaf'),
    ('stk-half-liter-water', '0.5 Liter Water'),
    ('stk-harar', 'Harar'),
    ('stk-heineken', 'Heineken'),
    ('stk-hendricks', 'Hendrick''s'),
    ('stk-hennessy-vs', 'Hennessy VS'),
    ('stk-hennessy-vsop', 'Hennessy VSOP'),
    ('stk-jack-daniels', 'Jack Daniel''s'),
    ('stk-jagermeister', 'Jagermeister'),
    ('stk-jb', 'J&B'),
    ('stk-jc-palace', 'J.C. Palace'),
    ('stk-jim-beam', 'Jim Beam'),
    ('stk-katelo', 'Katelo'),
    ('stk-kemila', 'Kemila Wayne'),
    ('stk-kik-bedst', 'Kik Bedst'),
    ('stk-m1782738284927', 'Keshir'),
    ('stk-m1782738316675', 'Lewuz'),
    ('stk-m1782738339804', 'Wetet'),
    ('stk-m1782738368138', 'Tea'),
    ('stk-m1782738395794', 'Lemon Tea'),
    ('stk-m1782752284800', 'Coffee'),
    ('stk-m1783096985489', 'Areki'),
    ('stk-m1783247247589', '2 liter water'),
    ('stk-m1783247305621', 'Kikl'),
    ('stk-m1783247372901', 'Injera'),
    ('stk-m1783247422205', 'Dabo'),
    ('stk-m1783247482334', 'Kocho'),
    ('stk-m1783252980148', 'beer'),
    ('stk-mango-juice', 'Mango Juice'),
    ('stk-martini', 'Martini'),
    ('stk-mekoreni-be-atkilt', 'Mekoreni be Atkilt'),
    ('stk-mekoreni-be-sgo', 'Mekoreni be Sgo'),
    ('stk-metbesh-shiro', 'Metbesh Shiro'),
    ('stk-mirinda', 'Mirinda'),
    ('stk-misir-wet', 'Misir Wet'),
    ('stk-mlas-sember', 'Mlas Sember'),
    ('stk-monkey-shoulder', 'Monkey Shoulder'),
    ('stk-ngus', 'Ngus'),
    ('stk-normal-firfir', 'Normal Firfir'),
    ('stk-one-liter-water', '1 Liter Water'),
    ('stk-pasta-be-atkilt', 'Pasta be Atkilt'),
    ('stk-pasta-be-sgo', 'Pasta be Sgo'),
    ('stk-platinum', 'Platinum'),
    ('stk-premium', 'Premium'),
    ('stk-red-bull', 'Red Bull'),
    ('stk-red-label', 'Red Label'),
    ('stk-refi-valley', 'Refi Valley Wayne'),
    ('stk-roberto-cavalli-vodka', 'Roberto Cavalli Vodka'),
    ('stk-sambuca', 'Sambuca'),
    ('stk-selata', 'Selata'),
    ('stk-shekla', 'Shekla'),
    ('stk-singleton', 'Singleton'),
    ('stk-small-jagermeister', 'Small Jagermeister'),
    ('stk-small-vodka', 'Small Vodka'),
    ('stk-smirnoff', 'Smirnoff'),
    ('stk-sprite', 'Sprite'),
    ('stk-st-george', 'St. George'),
    ('stk-st-remi-1l', 'St. Remi 1L'),
    ('stk-stockinia-05l', 'Stockinia 0.5L'),
    ('stk-stockinia-1l', 'Stockinia 1L'),
    ('stk-suf-fitfit', 'Suf Fitfit'),
    ('stk-tebit', 'Tebit'),
    ('stk-telba-fitfit', 'Telba Fitfit'),
    ('stk-telba-juice', 'Telba Juice'),
    ('stk-tequila', 'Tequila'),
    ('stk-timatim-kurt', 'Timatim Kurt'),
    ('stk-timatim-lebleb', 'Timatim Lebleb'),
    ('stk-tri-sga', 'Tri Sga'),
    ('stk-vecchia-romagna', 'Vecchia Romagna'),
    ('stk-white-horse', 'White Horse'),
    ('stk-winter-05l', 'Winter 0.5L'),
    ('stk-wolando', 'Wolando'),
    ('stk-xo-hennessy', 'XO Hennessy'),
    ('stk-ye-fyel-dulet', 'Ye Fyel Dulet'),
    ('stk-yeberi-dulet', 'Yeberi Dulet'),
    ('stk-yefyel', 'Yefyel'),
    ('stk-zlzl', 'Zlzl'),
    ('stk-zonin-wine', 'Zonin Wine')
),
normalized as (
  select
    id,
    name,
    case
      when lower(name) like any (array['%beer%', '%castel%', '%dashen%', '%habesha%', '%harar%', '%heineken%', '%st. george%']) then 'Beer'
      when lower(name) like any (array['%water%', '%coca%', '%fanta%', '%mirinda%', '%sprite%', '%7up%', '%red bull%', '%mango juice%', '%telba juice%']) then 'Soft Drink'
      when lower(name) like any (array['%wayne%', '%wine%', '%chianti%', '%champagne%', '%glass wine%', '%zonin%']) then 'Bar'
      when lower(name) like any (array['%dulet%', '%tibs%', '%gomen%', '%injera%', '%dabo%', '%kocho%', '%firfir%', '%fitfit%', '%beyaynet%', '%pasta%', '%shiro%', '%kikl%', '%misir%', '%selata%', '%shekla%', '%sga%', '%gubet%', '%mlas%', '%godn%', '%derek%']) then 'Kitchen'
      when lower(name) like any (array['%coffee%', '%tea%', '%lemon tea%', '%wetet%', '%lewuz%', '%keshir%']) then 'Coffee House'
      else 'Bar'
    end as category,
    case
      when lower(name) like any (array['%dulet%', '%tibs%', '%gomen%', '%injera%', '%dabo%', '%kocho%', '%firfir%', '%fitfit%', '%beyaynet%', '%pasta%', '%shiro%', '%kikl%', '%misir%', '%selata%', '%shekla%', '%sga%', '%gubet%', '%mlas%', '%godn%', '%derek%']) then 'pcs'
      when lower(name) like any (array['%coffee%', '%tea%', '%lemon tea%', '%wetet%', '%lewuz%', '%keshir%']) then 'pcs'
      else 'bottle'
    end as base_unit,
    case
      when lower(name) like any (array['%dulet%', '%tibs%', '%gomen%', '%injera%', '%dabo%', '%kocho%', '%firfir%', '%fitfit%', '%beyaynet%', '%pasta%', '%shiro%', '%kikl%', '%misir%', '%selata%', '%shekla%', '%sga%', '%gubet%', '%mlas%', '%godn%', '%derek%']) then 'Kitchen'
      when lower(name) like any (array['%coffee%', '%tea%', '%lemon tea%', '%wetet%', '%lewuz%', '%keshir%']) then 'Coffee House'
      else 'Store 1'
    end as preferred_location,
    timestamp with time zone '2026-07-07 11:24:58.507964+00' as seeded_at
  from seed_items
),
menu_source as (
  select
    s.id as seed_id,
    s.name as seed_name,
    mi.category as menu_category,
    mi.station,
    case
      when mi.pricing_mode = 'kg' then 'kg'
      when mi.station = 'Coffee House' and lower(mi.name_en) like '%coffee%' then 'kg'
      when mi.category in ('Beer', 'Soft Drinks', 'Water', 'Weyn', 'Spirits', 'Whisky', 'Other Drinks', 'Traditional Drink', 'Beverage', 'Drinks') then 'bottle'
      else 'pcs'
    end as unit_label,
    coalesce(mi.cost, 0) as menu_cost,
    coalesce(mi.price, 0) as menu_price,
    coalesce(mi.vip_price, 0) as menu_vip_price,
    row_number() over (
      partition by s.id
      order by
        case
          when concat('stk-', mi.id) = s.id then 0
          when mi.stock_sku = s.id then 1
          when concat('stk-', coalesce(nullif(trim(mi.stock_sku), ''), mi.id)) = s.id then 2
          when lower(trim(mi.name_en)) = lower(trim(s.name)) then 3
          else 9
        end,
        mi.updated_at desc nulls last,
        mi.created_at desc nulls last,
        mi.id asc
    ) as match_rank
  from seed_items s
  left join public.menu_items mi
    on mi.active = true
   and (
     concat('stk-', mi.id) = s.id
     or mi.stock_sku = s.id
     or concat('stk-', coalesce(nullif(trim(mi.stock_sku), ''), mi.id)) = s.id
     or lower(trim(mi.name_en)) = lower(trim(s.name))
   )
),
menu_match as (
  select
    seed_id,
    seed_name,
    menu_category,
    station,
    unit_label,
    menu_cost,
    menu_price,
    menu_vip_price
  from menu_source
  where match_rank = 1
),
price_fallback(stock_id, selling_price, vip_price) as (
  values
    ('stk-beef-prime', 4000, 5000),
    ('stk-dulet', 700, 1000),
    ('stk-tebit', 0, 0),
    ('stk-ye-fyel-dulet', 1000, 1250),
    ('stk-collection-yefyel', 4000, 5000),
    ('stk-yefyel', 4000, 5000),
    ('stk-yeberi-dulet', 1500, 2000),
    ('stk-draft-beer', 1500, 2000),
    ('stk-bedeli', 140, 300),
    ('stk-arada', 140, 300),
    ('stk-heineken', 140, 300),
    ('stk-dashen', 140, 300),
    ('stk-st-george', 120, 300),
    ('stk-castel-beer', 120, 300),
    ('stk-habesha', 120, 300),
    ('stk-ngus', 120, 300),
    ('stk-harar', 120, 300),
    ('stk-sprite', 120, 300),
    ('stk-coca-cola', 120, 300),
    ('stk-fanta', 120, 300),
    ('stk-mirinda', 120, 300),
    ('stk-7-up', 120, 300),
    ('stk-half-liter-water', 60, 100),
    ('stk-one-liter-water', 80, 100),
    ('stk-ambuha', 80, 200),
    ('stk-awash', 80, 200),
    ('stk-acacia', 80, 200),
    ('stk-axumit', 80, 200),
    ('stk-gebeta-water', 1200, 2000),
    ('stk-kemila', 2000, 3000),
    ('stk-guder', 1500, 2000),
    ('stk-refi-valley', 1500, 2000),
    ('stk-areki', 0, 0),
    ('stk-absolute-elyx', 16000, 0),
    ('stk-amarula', 20000, 600),
    ('stk-bacardi-075l', 12000, 0),
    ('stk-bacardi-1l', 16000, 0),
    ('stk-ballantines', 20000, 0),
    ('stk-beehive-vsop', 25000, 0),
    ('stk-black-label', 16000, 700),
    ('stk-black-label-2l', 35000, 0),
    ('stk-black-ruby', 20000, 0),
    ('stk-blue-label', 80000, 0),
    ('stk-chianti', 18000, 0),
    ('stk-ciroc', 9500, 0),
    ('stk-camus-vsop', 30000, 0),
    ('stk-camino-tequila', 15000, 500),
    ('stk-captain-morgan', 16000, 0),
    ('stk-casamigos', 45000, 1200),
    ('stk-tequila', 0, 0),
    ('stk-castel-champagne', 6000, 0),
    ('stk-castel-wine', 6000, 0),
    ('stk-chivas-12', 17000, 0),
    ('stk-chivas-18', 33000, 0),
    ('stk-courvoisier-vs', 22000, 0),
    ('stk-dech-vodka', 11000, 0),
    ('stk-delamain-cognac', 45000, 0),
    ('stk-dimple', 30000, 0),
    ('stk-disaronno', 25000, 0),
    ('stk-don-julio', 80000, 0),
    ('stk-premium', 35000, 1100),
    ('stk-don-julio-small', 18000, 0),
    ('stk-double-black', 16000, 600),
    ('stk-fernet-branca', 6000, 0),
    ('stk-gebeta-2l', 12000, 700),
    ('stk-glass-wine', 0, 0),
    ('stk-glenfiddich-12', 18000, 0),
    ('stk-glenfiddich-15', 25000, 0),
    ('stk-glenfiddich-18', 33000, 0),
    ('stk-godfather', 25000, 0),
    ('stk-gold', 23000, 0),
    ('stk-gordons', 10000, 600),
    ('stk-grey-goose', 17000, 0),
    ('stk-hendricks', 18000, 0),
    ('stk-hennessy-vs', 26000, 0),
    ('stk-hennessy-vsop', 35000, 0),
    ('stk-jc-palace', 14000, 0),
    ('stk-jb', 15000, 0),
    ('stk-jack-daniels', 18000, 0),
    ('stk-jagermeister', 16000, 500),
    ('stk-jim-beam', 14000, 0),
    ('stk-mango-juice', 1000, 0),
    ('stk-martini', 15000, 0),
    ('stk-monkey-shoulder', 18000, 0),
    ('stk-platinum', 35000, 0),
    ('stk-red-bull', 1000, 0),
    ('stk-roberto-cavalli-vodka', 20000, 0),
    ('stk-red-label', 12000, 0),
    ('stk-sambuca', 15000, 500),
    ('stk-small-jagermeister', 2000, 0),
    ('stk-small-vodka', 1500, 0),
    ('stk-singleton', 20000, 0),
    ('stk-smirnoff', 30000, 0),
    ('stk-st-remi-1l', 0, 0),
    ('stk-stockinia-05l', 4500, 0),
    ('stk-stockinia-1l', 9000, 0),
    ('stk-vecchia-romagna', 20000, 0),
    ('stk-white-horse', 14000, 0),
    ('stk-winter-05l', 5000, 0),
    ('stk-xo-hennessy', 100000, 0),
    ('stk-zonin-wine', 2000, 0),
    ('stk-5-label', 18000, 0),
    ('stk-ater-fitfit', 350, 500),
    ('stk-drekosh-firfir', 350, 500),
    ('stk-gomen-kitfo', 400, 500),
    ('stk-gomen-tibs', 400, 500),
    ('stk-haf-haaf', 400, 500),
    ('stk-kik-bedst', 350, 500),
    ('stk-mekoreni-be-atkilt', 350, 500),
    ('stk-mekoreni-be-sgo', 350, 500),
    ('stk-metbesh-shiro', 400, 500),
    ('stk-misir-wet', 400, 500),
    ('stk-normal-firfir', 350, 500),
    ('stk-pasta-be-atkilt', 350, 500),
    ('stk-pasta-be-sgo', 350, 500),
    ('stk-selata', 350, 500),
    ('stk-suf-fitfit', 350, 500),
    ('stk-telba-fitfit', 350, 500),
    ('stk-telba-juice', 100, 150),
    ('stk-timatim-lebleb', 350, 500),
    ('stk-timatim-kurt', 350, 500),
    ('stk-kikl', 800, 1000),
    ('stk-beyaynet', 400, 500),
    ('stk-derek-enjera', 30, 30),
    ('stk-foyel', 100, 100),
    ('stk-tri-sga', 4000, 5000),
    ('stk-gaz-layt', 4000, 5000),
    ('stk-godn', 4000, 5000),
    ('stk-grill-tibs', 4000, 5000),
    ('stk-katelo', 4000, 5000),
    ('stk-shekla', 4000, 5000),
    ('stk-wolando', 4000, 5000),
    ('stk-zlzl', 4000, 5000),
    ('stk-gubet', 1200, 0),
    ('stk-mlas-sember', 2000, 0),
    ('stk-m1782752284800', 80, 0),
    ('stk-m1782738368138', 35, 50),
    ('stk-m1782738395794', 40, 55),
    ('stk-m1782738284927', 55, 65),
    ('stk-m1782738316675', 55, 65),
    ('stk-m1782738339804', 55, 65),
    ('stk-m1783096985489', 0, 0),
    ('stk-m1783247247589', 80, 100),
    ('stk-m1783247305621', 800, 1000),
    ('stk-m1783247372901', 25, 35),
    ('stk-m1783247422205', 18, 25),
    ('stk-m1783247482334', 40, 55),
    ('stk-m1783252980148', 120, 300)
),
final as (
  select
    n.id,
    n.name,
    n.seeded_at,
    coalesce(
      case m.menu_category
        when 'Whisky' then 'Whisky'
        when 'Beer' then 'Beer'
        when 'Soft Drinks' then 'Soft Drink'
        when 'Water' then 'Soft Drink'
        when 'Weyn' then 'Soft Drink'
        when 'Meat' then 'Meat'
        when 'Spirits' then 'Bar'
        when 'Other Drinks' then 'Soft Drink'
        when 'Traditional Drink' then 'Soft Drink'
        else null
      end,
      case when m.station = 'Coffee House' then 'Coffee House' else null end,
      n.category
    ) as category,
    coalesce(
      case
        when m.station = 'Coffee House' and lower(n.name) like '%coffee%' then 'kg'
        when lower(coalesce(m.unit_label, '')) = 'bottle' then 'bottle'
        when lower(coalesce(m.unit_label, '')) = 'glass' then 'bottle'
        when lower(coalesce(m.unit_label, '')) in ('piece', 'pcs', 'plate', 'portion', 'cup') then 'pcs'
        when m.menu_category = 'Meat' then 'kg'
        else null
      end,
      n.base_unit
    ) as base_unit,
    coalesce(
      case
        when m.station = 'Coffee House' then 'Coffee House'
        when m.station = 'Butcher House' then 'Butcher'
        when m.station in ('Main Bar', 'VIP Bar') then m.station
        when m.station = 'Bar' then 'Main Bar'
        when m.menu_category = 'Meat' then 'Butcher'
        when n.category = 'Kitchen' then 'Kitchen'
        when m.menu_category in ('Beer', 'Soft Drinks', 'Water', 'Spirits', 'Whisky', 'Other Drinks') then 'Main Bar'
        else null
      end,
      n.preferred_location
    ) as preferred_location,
    coalesce(m.menu_category, n.category) as pricing_category,
    coalesce(m.station, n.preferred_location) as pricing_station,
    coalesce(nullif(m.menu_price, 0), pf.selling_price, 0) as menu_selling_price,
    coalesce(nullif(m.menu_vip_price, 0), pf.vip_price, 0) as menu_vip_price,
    case
      when coalesce(m.menu_cost, 0) > 0 then m.menu_cost
      when m.menu_category = 'Whisky' then round(coalesce(nullif(m.menu_price, 0), pf.selling_price, 0) * 0.55)
      when m.menu_category = 'Beer' or n.category = 'Beer' then round(greatest(coalesce(nullif(m.menu_price, 0), pf.selling_price, 0), 120) * 0.50)
      when m.menu_category in ('Soft Drinks', 'Water') or n.category = 'Soft Drink' then round(greatest(coalesce(nullif(m.menu_price, 0), pf.selling_price, 0), 60) * 0.40)
      when m.menu_category = 'Spirits' or n.category = 'Bar' then round(greatest(coalesce(nullif(m.menu_price, 0), pf.selling_price, 0), 1000) * 0.55)
      when m.menu_category = 'Meat' then round(greatest(coalesce(nullif(m.menu_price, 0), pf.selling_price, 0), 700) * 0.60)
      when m.station = 'Coffee House' or n.category = 'Coffee House' then round(greatest(coalesce(nullif(m.menu_price, 0), pf.selling_price, 0), 35) * 0.35)
      when n.category = 'Kitchen' then round(greatest(coalesce(nullif(m.menu_price, 0), pf.selling_price, 0), 100) * 0.45)
      else round(greatest(coalesce(nullif(m.menu_price, 0), pf.selling_price, 0), 100) * 0.45)
    end::numeric(12, 2) as purchase_price,
    case
      when n.category = 'Coffee House' and lower(n.name) like '%coffee%' then 0
      else coalesce(nullif(m.menu_price, 0), pf.selling_price, 0)
    end::numeric(12, 2) as selling_price,
    coalesce(nullif(m.menu_vip_price, 0), pf.vip_price, 0)::numeric(12, 2) as vip_selling_price,
    case
      when m.menu_category = 'Whisky' or lower(n.name) like any (array['%black label%', '%chivas%', '%hennessy%', '%glenfiddich%']) then 6
      when m.menu_category = 'Beer' or n.category = 'Beer' then 48
      when m.menu_category in ('Soft Drinks', 'Water', 'Traditional Drink', 'Other Drinks', 'Beverage', 'Drinks') or n.category = 'Soft Drink' then 24
      when m.menu_category = 'Meat' then 10
      when m.station = 'Coffee House' or n.category = 'Coffee House' then 8
      when n.category = 'Kitchen' then 12
      else 8
    end as reorder_level,
    (
      case
        when m.menu_category = 'Whisky' or lower(n.name) like any (array['%black label%', '%chivas%', '%hennessy%', '%glenfiddich%', '%blue label%']) then 24
        when m.menu_category = 'Beer' or n.category = 'Beer' then 240
        when m.menu_category in ('Soft Drinks', 'Water', 'Traditional Drink', 'Other Drinks', 'Beverage', 'Drinks') or n.category = 'Soft Drink' then 96
        when m.menu_category = 'Meat' then 40
        when m.station = 'Coffee House' or n.category = 'Coffee House' then 20
        when n.category = 'Kitchen' then 50
        else 24
      end
      + (abs(hashtext(n.id)) % 12)
    ) as opening_stock,
    case
      when m.menu_category = 'Beer' or n.category = 'Beer' then 'Dashen Brewery'
      when m.menu_category in ('Soft Drinks', 'Water') or n.category = 'Soft Drink' then 'Ambo Mineral Water'
      when m.menu_category = 'Meat' or n.category = 'Kitchen' then 'Merkato Fresh Supplies'
      when m.station = 'Coffee House' or n.category = 'Coffee House' then 'Sidama Coffee Union'
      else 'Addis Beverage Supply'
    end as supplier_name
  from normalized n
  left join menu_match m on m.seed_id = n.id
  left join price_fallback pf on pf.stock_id = n.id
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
  id,
  name,
  category,
  base_unit,
  purchase_price,
  selling_price,
  case
    when vip_selling_price > 0 then vip_selling_price
    when selling_price > 0 then round(selling_price * 1.12)::numeric(12, 2)
    else 0
  end as vip_selling_price,
  round(purchase_price * 0.98, 2) as standard_cost,
  reorder_level,
  preferred_location,
  supplier_name,
  '[]'::jsonb,
  false,
  '',
  opening_stock,
  true,
  seeded_at,
  seeded_at
from final
on conflict (id) do update set
  name = excluded.name,
  category = excluded.category,
  base_unit = excluded.base_unit,
  purchase_price = excluded.purchase_price,
  selling_price = excluded.selling_price,
  vip_selling_price = excluded.vip_selling_price,
  standard_cost = excluded.standard_cost,
  reorder_level = excluded.reorder_level,
  opening_stock = excluded.opening_stock,
  preferred_location = excluded.preferred_location,
  supplier_name = excluded.supplier_name,
  active = true,
  updated_at = now();
