-- =====================================================================
-- Common Indonesian dishes and ingredients.
-- Values are per 100 g and are ESTIMATES compiled from typical recipes and
-- public nutrition tables (e.g. TKPI-style values). They are marked
-- source = 'estimate' and the app shows an "estimated values" badge.
--
-- We load a staging table first, then copy into the normalized tables
-- (foods, food_servings, food_allergens, food_meal_types). This keeps
-- every food on one readable line.
-- =====================================================================

CREATE TEMP TABLE indo_staging (
  name TEXT, category TEXT,
  kcal NUMERIC, protein NUMERIC, carbs NUMERIC, fat NUMERIC,
  fiber NUMERIC, sugar NUMERIC, sodium NUMERIC,
  veg BOOLEAN, vegan BOOLEAN, halal BOOLEAN,
  serving TEXT, serving_g NUMERIC,
  allergens TEXT[],   -- names from the allergens table
  meals TEXT[]        -- breakfast / lunch / dinner / snack
);

INSERT INTO indo_staging VALUES
-- name                       category        kcal  prot carb  fat  fib  sug  sodium veg   vegan halal serving             g    allergens                   meals
('Nasi putih',                'grains',        130, 2.7, 28.2, 0.3, 0.4, 0.1,    1, TRUE, TRUE, TRUE, '1 piring',          150, '{}',                        '{}'),
('Nasi merah',                'grains',        111, 2.6, 23.0, 0.9, 1.8, 0.4,    5, TRUE, TRUE, TRUE, '1 piring',          150, '{}',                        '{}'),
('Nasi uduk',                 'grains',        175, 3.0, 28.0, 5.6, 0.6, 0.3,  210, TRUE, TRUE, TRUE, '1 piring',          200, '{}',                        '{breakfast,lunch}'),
('Nasi kuning',               'grains',        170, 3.1, 28.5, 4.8, 0.6, 0.3,  230, TRUE, TRUE, TRUE, '1 piring',          200, '{}',                        '{breakfast,lunch}'),
('Nasi goreng',               'dishes',        168, 6.3, 21.1, 6.2, 1.0, 1.5,  420, FALSE,FALSE,TRUE, '1 piring',          250, '{egg,soy}',                 '{breakfast,lunch,dinner}'),
('Nasi goreng sayur',         'dishes',        150, 3.8, 23.0, 4.6, 1.6, 1.8,  380, TRUE, TRUE, TRUE, '1 piring',          250, '{soy}',                     '{breakfast,lunch,dinner}'),
('Nasi campur',               'dishes',        180, 8.0, 22.0, 6.5, 1.2, 1.5,  380, FALSE,FALSE,TRUE, '1 piring',          350, '{egg,soy}',                 '{lunch,dinner}'),
('Nasi padang (rendang)',     'dishes',        190, 8.5, 21.0, 8.0, 1.0, 1.0,  400, FALSE,FALSE,TRUE, '1 bungkus',         400, '{}',                        '{lunch,dinner}'),
('Lontong',                   'grains',        144, 2.4, 31.5, 0.3, 0.3, 0.1,    2, TRUE, TRUE, TRUE, '1 buah',             80, '{}',                        '{}'),
('Ketupat',                   'grains',        140, 2.5, 30.0, 0.3, 0.3, 0.1,    2, TRUE, TRUE, TRUE, '1 buah',            100, '{}',                        '{}'),
('Bubur ayam',                'dishes',         95, 4.6, 13.5, 2.4, 0.4, 0.5,  310, FALSE,FALSE,TRUE, '1 mangkuk',         350, '{soy,gluten}',              '{breakfast}'),
('Mie goreng',                'dishes',        180, 5.6, 25.0, 6.5, 1.3, 2.0,  580, FALSE,FALSE,TRUE, '1 piring',          250, '{gluten,egg,soy}',          '{lunch,dinner}'),
('Mie ayam',                  'dishes',        125, 6.5, 17.0, 3.5, 0.9, 1.2,  480, FALSE,FALSE,TRUE, '1 mangkuk',         350, '{gluten,egg,soy}',          '{lunch,dinner}'),
('Mie instan goreng (dimasak)','dishes',       210, 4.2, 27.0, 9.5, 1.0, 2.0,  780, FALSE,FALSE,TRUE, '1 bungkus',         120, '{gluten,soy}',              '{lunch,dinner,snack}'),
('Kwetiau goreng',            'dishes',        170, 5.5, 24.0, 5.8, 1.0, 2.0,  520, FALSE,FALSE,TRUE, '1 piring',          250, '{egg,soy}',                 '{lunch,dinner}'),
('Bihun goreng',              'dishes',        165, 4.0, 26.0, 5.2, 1.0, 1.5,  430, FALSE,FALSE,TRUE, '1 piring',          200, '{egg,soy}',                 '{lunch,dinner}'),
('Ayam goreng',               'poultry',       260, 25.0, 4.0,16.0, 0.2, 0.2,  390, FALSE,FALSE,TRUE, '1 potong',          100, '{}',                        '{}'),
('Ayam bakar',                'poultry',       210, 25.5, 5.5, 9.5, 0.2, 4.0,  420, FALSE,FALSE,TRUE, '1 potong',          100, '{soy}',                     '{lunch,dinner}'),
('Ayam penyet',               'poultry',       245, 23.0, 5.0,14.5, 0.8, 1.5,  450, FALSE,FALSE,TRUE, '1 porsi',           150, '{}',                        '{lunch,dinner}'),
('Ayam geprek',               'poultry',       275, 20.0,12.0,16.5, 0.8, 1.0,  480, FALSE,FALSE,TRUE, '1 porsi',           150, '{gluten}',                  '{lunch,dinner}'),
('Opor ayam',                 'dishes',        165, 12.5, 3.5,11.5, 0.5, 1.0,  360, FALSE,FALSE,TRUE, '1 mangkuk',         250, '{}',                        '{lunch,dinner}'),
('Rendang daging',            'meat',          195, 20.0, 4.5,11.0, 1.2, 1.5,  450, FALSE,FALSE,TRUE, '1 potong',           80, '{}',                        '{}'),
('Gulai kambing',             'dishes',        170, 12.0, 4.0,12.0, 0.8, 1.0,  380, FALSE,FALSE,TRUE, '1 mangkuk',         250, '{}',                        '{lunch,dinner}'),
('Empal daging',              'meat',          240, 24.0, 8.0,12.5, 0.2, 6.0,  400, FALSE,FALSE,TRUE, '1 potong',           60, '{}',                        '{}'),
('Semur daging',              'meat',          160, 15.0, 7.5, 7.5, 0.6, 5.0,  560, FALSE,FALSE,TRUE, '1 mangkuk',         200, '{soy,gluten}',              '{lunch,dinner}'),
('Sate ayam',                 'poultry',       225, 20.5, 8.5,12.0, 1.0, 6.0,  430, FALSE,FALSE,TRUE, '1 tusuk',            25, '{peanut,soy}',              '{lunch,dinner}'),
('Sate kambing',              'meat',          235, 21.0, 6.0,14.0, 0.5, 4.5,  410, FALSE,FALSE,TRUE, '1 tusuk',            25, '{soy}',                     '{lunch,dinner}'),
('Bakso sapi (kuah)',         'soups & sauces', 75, 5.5, 6.5, 3.0, 0.3, 0.5,  420, FALSE,FALSE,TRUE, '1 mangkuk',         350, '{gluten}',                  '{lunch,dinner,snack}'),
('Soto ayam',                 'soups & sauces', 65, 5.8, 3.5, 3.2, 0.5, 0.5,  380, FALSE,FALSE,TRUE, '1 mangkuk',         350, '{}',                        '{breakfast,lunch,dinner}'),
('Soto betawi',               'soups & sauces',115, 7.0, 3.5, 8.5, 0.4, 1.0,  400, FALSE,FALSE,TRUE, '1 mangkuk',         350, '{dairy}',                   '{lunch,dinner}'),
('Rawon',                     'soups & sauces', 80, 7.5, 2.5, 4.5, 0.6, 0.5,  390, FALSE,FALSE,TRUE, '1 mangkuk',         350, '{}',                        '{lunch,dinner}'),
('Sop buntut',                'soups & sauces', 90, 7.0, 3.5, 5.5, 0.6, 1.0,  380, FALSE,FALSE,TRUE, '1 mangkuk',         350, '{}',                        '{lunch,dinner}'),
('Sayur sop',                 'soups & sauces', 35, 1.6, 5.5, 0.8, 1.4, 1.8,  250, TRUE, TRUE, TRUE, '1 mangkuk',         250, '{}',                        '{}'),
('Sayur asem',                'soups & sauces', 30, 1.2, 5.8, 0.4, 1.6, 2.5,  260, TRUE, TRUE, TRUE, '1 mangkuk',         250, '{peanut}',                  '{}'),
('Sayur lodeh',               'soups & sauces', 75, 2.0, 5.5, 5.2, 1.6, 1.5,  280, TRUE, TRUE, TRUE, '1 mangkuk',         250, '{soy}',                     '{}'),
('Capcay',                    'vegetables',     65, 3.5, 5.5, 3.5, 1.6, 2.0,  330, FALSE,FALSE,TRUE, '1 piring',          200, '{shellfish,soy}',           '{lunch,dinner}'),
('Tumis kangkung',            'vegetables',     70, 2.6, 4.0, 5.0, 2.0, 1.0,  360, TRUE, TRUE, TRUE, '1 piring',          150, '{}',                        '{}'),
('Gado-gado',                 'dishes',        135, 6.0,10.5, 8.0, 3.0, 4.5,  320, TRUE, FALSE,TRUE, '1 piring',          300, '{peanut,egg,soy}',          '{lunch,dinner}'),
('Pecel',                     'dishes',        120, 5.0,11.0, 6.8, 3.2, 4.0,  300, TRUE, TRUE, TRUE, '1 piring',          250, '{peanut}',                  '{breakfast,lunch,dinner}'),
('Karedok',                   'vegetables',    115, 4.5, 9.5, 7.0, 3.0, 4.0,  290, TRUE, TRUE, TRUE, '1 piring',          200, '{peanut}',                  '{lunch,dinner}'),
('Ketoprak',                  'dishes',        150, 6.5,16.0, 7.0, 2.0, 3.5,  360, TRUE, TRUE, TRUE, '1 piring',          300, '{peanut,soy}',              '{lunch,dinner}'),
('Tempe goreng',              'legumes',       330, 19.0,13.0,22.5, 5.0, 0.5,  180, TRUE, TRUE, TRUE, '1 potong',           30, '{soy}',                     '{snack}'),
('Tempe bacem',               'legumes',       235, 15.0,19.0,11.0, 4.5, 12.0, 300, TRUE, TRUE, TRUE, '1 potong',           40, '{soy}',                     '{snack}'),
('Tempe mendoan',             'legumes',       285, 13.0,20.0,17.0, 3.5, 1.0,  320, TRUE, TRUE, TRUE, '1 potong',           50, '{soy,gluten}',              '{snack,lunch}'),
('Tempe (mentah)',            'legumes',       195, 20.0, 9.0, 8.8, 5.0, 0.0,    9, TRUE, TRUE, TRUE, '1 papan',           100, '{soy}',                     '{}'),
('Tahu goreng',               'legumes',       270, 17.0, 9.5,18.5, 1.5, 0.5,  150, TRUE, TRUE, TRUE, '1 potong',           40, '{soy}',                     '{snack}'),
('Tahu (mentah)',             'legumes',        80, 8.5, 2.0, 4.5, 1.0, 0.5,    7, TRUE, TRUE, TRUE, '1 potong',           60, '{soy}',                     '{}'),
('Tahu isi goreng',           'snacks',        245, 9.5,18.0,15.0, 1.8, 1.5,  280, TRUE, TRUE, TRUE, '1 buah',             50, '{soy,gluten}',              '{snack}'),
('Perkedel kentang',          'snacks',        190, 4.0,20.0,10.5, 1.8, 1.0,  320, TRUE, FALSE,TRUE, '1 buah',             50, '{egg}',                     '{snack}'),
('Telur dadar',               'eggs',          195, 13.0, 1.5,15.5, 0.0, 0.8,  360, TRUE, FALSE,TRUE, '1 lembar',           70, '{egg}',                     '{breakfast}'),
('Telur balado',              'eggs',          175, 11.5, 5.0,12.0, 0.8, 3.0,  330, TRUE, FALSE,TRUE, '1 butir',            65, '{egg}',                     '{}'),
('Ikan goreng',               'fish',          230, 23.0, 3.0,14.0, 0.0, 0.0,  300, FALSE,FALSE,TRUE, '1 ekor sedang',     120, '{fish}',                    '{lunch,dinner}'),
('Ikan bakar',                'fish',          160, 24.0, 3.5, 5.5, 0.2, 2.5,  340, FALSE,FALSE,TRUE, '1 ekor sedang',     150, '{fish,soy}',                '{lunch,dinner}'),
('Pepes ikan',                'fish',          135, 19.0, 3.0, 5.0, 0.8, 0.5,  310, FALSE,FALSE,TRUE, '1 bungkus',         100, '{fish}',                    '{lunch,dinner}'),
('Ikan teri balado',          'fish',          280, 30.0, 8.0,14.0, 0.8, 4.0, 1500, FALSE,FALSE,TRUE, '1 sendok makan',     15, '{fish}',                    '{}'),
('Udang goreng tepung',       'fish',          250, 15.0,18.0,13.0, 0.6, 0.5,  480, FALSE,FALSE,TRUE, '1 porsi',           100, '{shellfish,gluten,egg}',    '{lunch,dinner}'),
('Sambal goreng kentang',     'vegetables',    165, 3.0,18.0, 9.0, 2.0, 5.0,  350, TRUE, TRUE, TRUE, '1 porsi',           100, '{}',                        '{lunch,dinner}'),
('Sambal terasi',             'soups & sauces',110, 3.0,10.0, 6.5, 2.5, 5.0, 1100, FALSE,FALSE,TRUE, '1 sendok makan',     15, '{shellfish}',               '{}'),
('Kerupuk udang',             'snacks',        510, 3.0,62.0,28.0, 0.4, 2.0,  900, FALSE,FALSE,TRUE, '1 buah',             10, '{shellfish}',               '{}'),
('Rempeyek kacang',           'snacks',        500, 13.0,45.0,30.0, 3.5, 1.0,  350, TRUE, TRUE, TRUE, '1 keping',           15, '{peanut}',                  '{}'),
('Martabak manis',            'sweets',        320, 6.5,45.0,13.0, 1.2, 22.0, 230, TRUE, FALSE,TRUE, '1 potong',           80, '{gluten,egg,dairy,peanut}', '{snack}'),
('Martabak telur',            'snacks',        250, 11.0,18.0,15.0, 1.0, 1.0,  420, FALSE,FALSE,TRUE, '1 potong',           80, '{gluten,egg}',              '{snack,dinner}'),
('Pisang goreng',             'snacks',        245, 2.5,35.0,11.0, 2.0, 14.0,  80, TRUE, TRUE, TRUE, '1 buah',             70, '{gluten}',                  '{snack,breakfast}'),
('Bakwan sayur',              'snacks',        280, 5.0,30.0,15.5, 2.0, 1.5,  380, TRUE, TRUE, TRUE, '1 buah',             50, '{gluten}',                  '{snack}'),
('Risoles',                   'snacks',        250, 7.0,28.0,12.0, 1.0, 2.0,  350, FALSE,FALSE,TRUE, '1 buah',             60, '{gluten,egg,dairy}',        '{snack}'),
('Lemper ayam',               'snacks',        210, 6.5,34.0, 5.5, 0.5, 1.0,  260, FALSE,FALSE,TRUE, '1 buah',             60, '{}',                        '{snack,breakfast}'),
('Klepon',                    'sweets',        220, 2.5,42.0, 4.5, 1.5, 18.0,  30, TRUE, TRUE, TRUE, '1 buah',             15, '{}',                        '{snack}'),
('Onde-onde',                 'sweets',        330, 6.0,48.0,13.0, 2.5, 15.0,  50, TRUE, TRUE, TRUE, '1 buah',             40, '{sesame,gluten}',           '{snack}'),
('Kue lapis',                 'sweets',        235, 1.5,44.0, 6.0, 0.4, 22.0,  45, TRUE, TRUE, TRUE, '1 potong',           50, '{}',                        '{snack}'),
('Serabi',                    'sweets',        210, 3.5,35.0, 6.5, 0.8, 12.0, 120, TRUE, TRUE, TRUE, '1 buah',             50, '{}',                        '{breakfast,snack}'),
('Kolak pisang',              'sweets',        140, 1.5,25.0, 4.5, 1.5, 17.0,  30, TRUE, TRUE, TRUE, '1 mangkuk',         200, '{}',                        '{snack}'),
('Bubur kacang hijau',        'sweets',        125, 4.0,22.0, 2.5, 3.0, 10.0,  25, TRUE, TRUE, TRUE, '1 mangkuk',         250, '{}',                        '{breakfast,snack}'),
('Roti bakar cokelat keju',   'snacks',        330, 9.0,42.0,14.0, 2.0, 15.0, 400, TRUE, FALSE,TRUE, '1 porsi',           100, '{gluten,dairy}',            '{breakfast,snack}'),
('Es teh manis',              'drinks',         35, 0.0, 9.0, 0.0, 0.0, 9.0,    3, TRUE, TRUE, TRUE, '1 gelas',           250, '{}',                        '{snack}'),
('Teh tawar',                 'drinks',          1, 0.0, 0.2, 0.0, 0.0, 0.0,    3, TRUE, TRUE, TRUE, '1 gelas',           250, '{}',                        '{}'),
('Kopi susu',                 'drinks',         60, 1.2, 9.5, 2.0, 0.0, 9.0,   20, TRUE, FALSE,TRUE, '1 gelas',           200, '{dairy}',                   '{snack}'),
('Kopi hitam',                'drinks',          2, 0.1, 0.0, 0.0, 0.0, 0.0,    2, TRUE, TRUE, TRUE, '1 cangkir',         200, '{}',                        '{}'),
('Es jeruk',                  'drinks',         50, 0.3,12.5, 0.1, 0.1, 11.5,   2, TRUE, TRUE, TRUE, '1 gelas',           250, '{}',                        '{snack}'),
('Jus alpukat',               'drinks',        120, 1.5,14.0, 7.0, 2.5, 11.0,  15, TRUE, FALSE,TRUE, '1 gelas',           250, '{dairy}',                   '{snack}'),
('Es cendol',                 'sweets',        130, 0.8,22.0, 4.5, 0.4, 17.0,  15, TRUE, TRUE, TRUE, '1 gelas',           250, '{}',                        '{snack}'),
('Tape singkong',             'snacks',        175, 0.5,42.0, 0.1, 1.0, 20.0,   5, TRUE, TRUE, TRUE, '1 potong',           50, '{}',                        '{snack}'),
('Singkong rebus',            'grains',        160, 1.2,38.0, 0.3, 1.8, 1.7,   14, TRUE, TRUE, TRUE, '1 potong',          100, '{}',                        '{breakfast,snack}'),
('Ubi rebus',                 'grains',         90, 1.6,21.0, 0.1, 3.0, 6.5,   36, TRUE, TRUE, TRUE, '1 buah sedang',     130, '{}',                        '{breakfast,snack}'),
('Jagung rebus',              'grains',         96, 3.4,21.0, 1.5, 2.4, 4.5,    1, TRUE, TRUE, TRUE, '1 tongkol',         100, '{}',                        '{breakfast,snack}');

-- 1) Foods
INSERT INTO foods (name, category_id, source, source_ref,
                   calories_kcal, protein_g, carbs_g, fat_g, fiber_g, sugar_g, sodium_mg,
                   is_vegetarian, is_vegan, is_halal)
SELECT s.name, c.id, 'estimate', 'id-' || row_number() OVER (ORDER BY s.name),
       s.kcal, s.protein, s.carbs, s.fat, s.fiber, s.sugar, s.sodium,
       s.veg, s.vegan, s.halal
FROM indo_staging s
JOIN food_categories c ON c.name = s.category;

-- 2) Household servings ("1 piring", "1 tusuk", ...) plus a plain 100 g option
INSERT INTO food_servings (food_id, description, grams)
SELECT f.id, s.serving || ' (' || s.serving_g || ' g)', s.serving_g
FROM indo_staging s JOIN foods f ON f.name = s.name AND f.source = 'estimate';

-- 3) Allergens (unnest turns the array into rows)
INSERT INTO food_allergens (food_id, allergen_id)
SELECT f.id, a.id
FROM indo_staging s
JOIN foods f ON f.name = s.name AND f.source = 'estimate'
CROSS JOIN LATERAL unnest(s.allergens) AS al(name)
JOIN allergens a ON a.name = al.name;

-- 4) Suitable meal types for the planner. Sides (rice, sambal, kerupuk, vegetables)
--    have none: the planner only offers them inside complete recipes.
INSERT INTO food_meal_types (food_id, meal_type)
SELECT f.id, mt
FROM indo_staging s
JOIN foods f ON f.name = s.name AND f.source = 'estimate'
CROSS JOIN LATERAL unnest(s.meals) AS mt;

DROP TABLE indo_staging;
