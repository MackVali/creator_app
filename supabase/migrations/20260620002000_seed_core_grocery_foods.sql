-- Seed a fuller generic grocery catalog for Nutrition Browse.

BEGIN;

WITH seed_foods(
  name,
  normalized_name,
  serving_size,
  serving_unit,
  serving_grams,
  calories,
  carbs_g,
  protein_g,
  fat_g,
  dedupe_key,
  browse_placements
) AS (
  VALUES
    ('Banana', 'banana', 1, 'medium', 118, 105, 27, 1.3, 0.4, 'catalog:banana:118', ARRAY['Everyday|Breakfast basics', 'Everyday|Quick snacks', 'Produce|Fruit']),
    ('Apple', 'apple', 1, 'medium', 182, 95, 25, 0.5, 0.3, 'catalog:apple:182', ARRAY['Everyday|Breakfast basics', 'Everyday|Quick snacks', 'Produce|Fruit']),
    ('Egg', 'egg', 1, 'large', 50, 72, 0.4, 6.3, 4.8, 'catalog:egg:50', ARRAY['Everyday|Breakfast basics', 'Everyday|High protein regulars', 'Dairy & Eggs|Eggs']),
    ('Oats', 'oats', 0.5, 'cup dry', 40, 150, 27, 5, 3, 'catalog:oats:40', ARRAY['Everyday|Breakfast basics', 'Everyday|Cheap bulk foods', 'Pantry|Rice & grains']),
    ('Greek yogurt', 'greek yogurt', 0.75, 'cup', 170, 100, 6, 17, 0.7, 'catalog:greek yogurt:170', ARRAY['Everyday|Breakfast basics', 'Everyday|High protein regulars', 'Dairy & Eggs|Yogurt']),
    ('Whole milk', 'whole milk', 1, 'cup', 244, 149, 12, 7.7, 8, 'catalog:whole milk:244', ARRAY['Everyday|Breakfast basics', 'Dairy & Eggs|Milk']),
    ('Toast', 'toast', 1, 'slice', 28, 80, 14, 3, 1.2, 'catalog:toast:28', ARRAY['Everyday|Breakfast basics']),
    ('Bagel', 'bagel', 1, 'medium', 105, 270, 53, 10, 1.5, 'catalog:bagel:105', ARRAY['Everyday|Breakfast basics', 'Pantry|Bread & tortillas']),
    ('Cereal', 'cereal', 1, 'cup', 40, 150, 32, 3, 1.5, 'catalog:cereal:40', ARRAY['Everyday|Breakfast basics']),
    ('White rice', 'white rice', 1, 'cup cooked', 158, 205, 44.5, 4.3, 0.4, 'catalog:white rice:158', ARRAY['Everyday|Cheap bulk foods', 'Pantry|Rice & grains']),
    ('Brown rice', 'brown rice', 1, 'cup cooked', 195, 216, 44.8, 5, 1.8, 'catalog:brown rice:195', ARRAY['Everyday|Cheap bulk foods', 'Pantry|Rice & grains']),
    ('Pasta', 'pasta', 1, 'cup cooked', 140, 220, 43, 8, 1.3, 'catalog:pasta:140', ARRAY['Everyday|Cheap bulk foods', 'Pantry|Pasta']),
    ('Potatoes', 'potatoes', 1, 'medium', 173, 161, 37, 4.3, 0.2, 'catalog:potatoes:173', ARRAY['Everyday|Cheap bulk foods']),
    ('Black beans', 'black beans', 0.5, 'cup cooked', 86, 114, 20, 7.6, 0.5, 'catalog:black beans:86', ARRAY['Everyday|Cheap bulk foods', 'Pantry|Beans & legumes']),
    ('Pinto beans', 'pinto beans', 0.5, 'cup cooked', 86, 122, 22, 7.7, 0.6, 'catalog:pinto beans:86', ARRAY['Everyday|Cheap bulk foods', 'Pantry|Beans & legumes']),
    ('Lentils', 'lentils', 0.5, 'cup cooked', 99, 116, 20, 9, 0.4, 'catalog:lentils:99', ARRAY['Everyday|Cheap bulk foods', 'Pantry|Beans & legumes']),
    ('Peanut butter', 'peanut butter', 2, 'tbsp', 32, 190, 7, 8, 16, 'catalog:peanut butter:32', ARRAY['Everyday|Cheap bulk foods', 'Everyday|Quick snacks', 'Pantry|Nut butters', 'Snacks|Nuts & trail mix']),
    ('Chicken breast', 'chicken breast', 100, 'g', 100, 165, 0, 31, 3.6, 'catalog:chicken breast:100', ARRAY['Everyday|High protein regulars', 'Meat & Seafood|Chicken']),
    ('Ground beef', 'ground beef', 100, 'g', 100, 250, 0, 26, 15, 'catalog:ground beef:100', ARRAY['Everyday|High protein regulars', 'Meat & Seafood|Beef']),
    ('Tuna', 'tuna', 3, 'oz', 85, 110, 0, 24, 1, 'catalog:tuna:85', ARRAY['Everyday|High protein regulars', 'Meat & Seafood|Fish']),
    ('Sardines', 'sardines', 1, 'can', 92, 190, 0, 23, 10, 'catalog:sardines:92', ARRAY['Everyday|High protein regulars', 'Meat & Seafood|Fish']),
    ('Cottage cheese', 'cottage cheese', 0.5, 'cup', 113, 110, 4, 13, 5, 'catalog:cottage cheese:113', ARRAY['Everyday|High protein regulars']),
    ('Turkey slices', 'turkey slices', 3, 'oz', 85, 90, 2, 16, 2, 'catalog:turkey slices:85', ARRAY['Everyday|High protein regulars', 'Meat & Seafood|Turkey']),
    ('Tofu', 'tofu', 100, 'g', 100, 144, 3, 17, 9, 'catalog:tofu:100', ARRAY['Everyday|High protein regulars']),
    ('Crackers', 'crackers', 1, 'oz', 28, 140, 21, 3, 5, 'catalog:crackers:28', ARRAY['Everyday|Quick snacks', 'Snacks|Crackers']),
    ('Peanuts', 'peanuts', 1, 'oz', 28, 166, 6, 7, 14, 'catalog:peanuts:28', ARRAY['Everyday|Quick snacks', 'Snacks|Nuts & trail mix']),
    ('Cashews', 'cashews', 1, 'oz', 28, 157, 9, 5, 12, 'catalog:cashews:28', ARRAY['Everyday|Quick snacks', 'Snacks|Nuts & trail mix']),
    ('Trail mix', 'trail mix', 0.25, 'cup', 40, 180, 20, 5, 10, 'catalog:trail mix:40', ARRAY['Everyday|Quick snacks', 'Snacks|Nuts & trail mix']),
    ('String cheese', 'string cheese', 1, 'stick', 28, 80, 1, 7, 6, 'catalog:string cheese:28', ARRAY['Everyday|Quick snacks', 'Dairy & Eggs|Cheese']),
    ('Protein bar', 'protein bar', 1, 'bar', 60, 220, 24, 20, 7, 'catalog:protein bar:60', ARRAY['Everyday|Quick snacks', 'Snacks|Bars']),
    ('Orange', 'orange', 1, 'medium', 131, 62, 15, 1.2, 0.2, 'catalog:orange:131', ARRAY['Produce|Fruit']),
    ('Grapes', 'grapes', 1, 'cup', 151, 104, 27, 1.1, 0.2, 'catalog:grapes:151', ARRAY['Produce|Fruit']),
    ('Strawberries', 'strawberries', 1, 'cup', 152, 49, 12, 1, 0.5, 'catalog:strawberries:152', ARRAY['Produce|Fruit']),
    ('Blueberries', 'blueberries', 1, 'cup', 148, 84, 21, 1.1, 0.5, 'catalog:blueberries:148', ARRAY['Produce|Fruit']),
    ('Avocado', 'avocado', 0.5, 'medium', 100, 160, 9, 2, 15, 'catalog:avocado:100', ARRAY['Produce|Fruit']),
    ('Broccoli', 'broccoli', 1, 'cup', 91, 31, 6, 2.5, 0.3, 'catalog:broccoli:91', ARRAY['Produce|Vegetables']),
    ('Spinach', 'spinach', 2, 'cups', 60, 14, 2, 1.7, 0.2, 'catalog:spinach:60', ARRAY['Produce|Vegetables']),
    ('Carrots', 'carrots', 1, 'medium', 61, 25, 6, 0.6, 0.1, 'catalog:carrots:61', ARRAY['Produce|Vegetables']),
    ('Onion', 'onion', 1, 'medium', 110, 44, 10, 1.2, 0.1, 'catalog:onion:110', ARRAY['Produce|Vegetables']),
    ('Bell pepper', 'bell pepper', 1, 'medium', 119, 31, 7, 1, 0.3, 'catalog:bell pepper:119', ARRAY['Produce|Vegetables']),
    ('Romaine lettuce', 'romaine lettuce', 2, 'cups', 94, 16, 3, 1, 0.3, 'catalog:romaine lettuce:94', ARRAY['Produce|Vegetables']),
    ('Tomato', 'tomato', 1, 'medium', 123, 22, 5, 1.1, 0.2, 'catalog:tomato:123', ARRAY['Produce|Vegetables']),
    ('Sweet potato', 'sweet potato', 1, 'medium', 130, 112, 26, 2, 0.1, 'catalog:sweet potato:130', ARRAY['Produce|Vegetables']),
    ('Cilantro', 'cilantro', 0.25, 'cup', 4, 1, 0.1, 0.1, 0, 'catalog:cilantro:4', ARRAY['Produce|Herbs']),
    ('Parsley', 'parsley', 0.25, 'cup', 15, 5, 1, 0.5, 0.1, 'catalog:parsley:15', ARRAY['Produce|Herbs']),
    ('Basil', 'basil', 0.25, 'cup', 6, 1, 0.1, 0.2, 0, 'catalog:basil:6', ARRAY['Produce|Herbs']),
    ('Chicken thigh', 'chicken thigh', 100, 'g', 100, 209, 0, 26, 11, 'catalog:chicken thigh:100', ARRAY['Meat & Seafood|Chicken']),
    ('Rotisserie chicken', 'rotisserie chicken', 3, 'oz', 85, 170, 0, 23, 8, 'catalog:rotisserie chicken:85', ARRAY['Meat & Seafood|Chicken']),
    ('Chicken nuggets', 'chicken nuggets', 5, 'pieces', 85, 250, 15, 14, 15, 'catalog:chicken nuggets:85', ARRAY['Meat & Seafood|Chicken']),
    ('Steak', 'steak', 3, 'oz', 85, 210, 0, 23, 13, 'catalog:steak:85', ARRAY['Meat & Seafood|Beef']),
    ('Beef roast', 'beef roast', 3, 'oz', 85, 180, 0, 25, 8, 'catalog:beef roast:85', ARRAY['Meat & Seafood|Beef']),
    ('Bacon', 'bacon', 2, 'slices', 16, 90, 0.2, 6, 7, 'catalog:bacon:16', ARRAY['Meat & Seafood|Pork']),
    ('Pork chop', 'pork chop', 3, 'oz', 85, 200, 0, 24, 11, 'catalog:pork chop:85', ARRAY['Meat & Seafood|Pork']),
    ('Ham', 'ham', 3, 'oz', 85, 130, 1, 19, 5, 'catalog:ham:85', ARRAY['Meat & Seafood|Pork']),
    ('Ground turkey', 'ground turkey', 100, 'g', 100, 170, 0, 22, 9, 'catalog:ground turkey:100', ARRAY['Meat & Seafood|Turkey']),
    ('Turkey bacon', 'turkey bacon', 2, 'slices', 28, 70, 1, 5, 5, 'catalog:turkey bacon:28', ARRAY['Meat & Seafood|Turkey']),
    ('Salmon', 'salmon', 3, 'oz', 85, 177, 0, 17, 11, 'catalog:salmon:85', ARRAY['Meat & Seafood|Fish']),
    ('Tilapia', 'tilapia', 3, 'oz', 85, 110, 0, 22, 2, 'catalog:tilapia:85', ARRAY['Meat & Seafood|Fish']),
    ('Shrimp', 'shrimp', 3, 'oz', 85, 84, 0.2, 20, 0.3, 'catalog:shrimp:85', ARRAY['Meat & Seafood|Seafood']),
    ('Crab', 'crab', 3, 'oz', 85, 82, 0, 17, 1, 'catalog:crab:85', ARRAY['Meat & Seafood|Seafood']),
    ('Scallops', 'scallops', 3, 'oz', 85, 95, 4, 17, 0.8, 'catalog:scallops:85', ARRAY['Meat & Seafood|Seafood']),
    ('Egg whites', 'egg whites', 3, 'tbsp', 46, 25, 0.4, 5, 0, 'catalog:egg whites:46', ARRAY['Dairy & Eggs|Eggs']),
    ('2% milk', '2 milk', 1, 'cup', 244, 122, 12, 8, 5, 'catalog:2 milk:244', ARRAY['Dairy & Eggs|Milk']),
    ('Skim milk', 'skim milk', 1, 'cup', 245, 83, 12, 8.3, 0.2, 'catalog:skim milk:245', ARRAY['Dairy & Eggs|Milk']),
    ('Chocolate milk', 'chocolate milk', 1, 'cup', 250, 190, 30, 8, 5, 'catalog:chocolate milk:250', ARRAY['Dairy & Eggs|Milk']),
    ('Regular yogurt', 'regular yogurt', 1, 'cup', 245, 150, 17, 9, 8, 'catalog:regular yogurt:245', ARRAY['Dairy & Eggs|Yogurt']),
    ('Vanilla yogurt', 'vanilla yogurt', 1, 'cup', 245, 220, 34, 9, 5, 'catalog:vanilla yogurt:245', ARRAY['Dairy & Eggs|Yogurt']),
    ('Cheddar cheese', 'cheddar cheese', 1, 'oz', 28, 115, 0.4, 7, 9.5, 'catalog:cheddar cheese:28', ARRAY['Dairy & Eggs|Cheese']),
    ('Mozzarella cheese', 'mozzarella cheese', 1, 'oz', 28, 85, 1, 6, 6, 'catalog:mozzarella cheese:28', ARRAY['Dairy & Eggs|Cheese']),
    ('Cream cheese', 'cream cheese', 2, 'tbsp', 28, 100, 2, 2, 10, 'catalog:cream cheese:28', ARRAY['Dairy & Eggs|Cheese']),
    ('Butter', 'butter', 1, 'tbsp', 14, 102, 0, 0.1, 11.5, 'catalog:butter:14', ARRAY['Dairy & Eggs|Butter / Cream']),
    ('Heavy cream', 'heavy cream', 1, 'tbsp', 15, 51, 0.4, 0.4, 5.4, 'catalog:heavy cream:15', ARRAY['Dairy & Eggs|Butter / Cream']),
    ('Sour cream', 'sour cream', 2, 'tbsp', 30, 60, 1.5, 1, 5, 'catalog:sour cream:30', ARRAY['Dairy & Eggs|Butter / Cream']),
    ('Quinoa', 'quinoa', 1, 'cup cooked', 185, 222, 39, 8, 3.6, 'catalog:quinoa:185', ARRAY['Pantry|Rice & grains']),
    ('Couscous', 'couscous', 1, 'cup cooked', 157, 176, 36, 6, 0.3, 'catalog:couscous:157', ARRAY['Pantry|Rice & grains']),
    ('Spaghetti', 'spaghetti', 1, 'cup cooked', 140, 220, 43, 8, 1.3, 'catalog:spaghetti:140', ARRAY['Pantry|Pasta']),
    ('Macaroni', 'macaroni', 1, 'cup cooked', 140, 220, 43, 8, 1.3, 'catalog:macaroni:140', ARRAY['Pantry|Pasta']),
    ('Ramen noodles', 'ramen noodles', 1, 'packet', 85, 380, 52, 8, 14, 'catalog:ramen noodles:85', ARRAY['Pantry|Pasta']),
    ('White bread', 'white bread', 1, 'slice', 28, 80, 15, 3, 1, 'catalog:white bread:28', ARRAY['Pantry|Bread & tortillas']),
    ('Wheat bread', 'wheat bread', 1, 'slice', 28, 70, 12, 4, 1, 'catalog:wheat bread:28', ARRAY['Pantry|Bread & tortillas']),
    ('Tortilla', 'tortilla', 1, 'medium', 49, 140, 24, 4, 3, 'catalog:tortilla:49', ARRAY['Pantry|Bread & tortillas']),
    ('English muffin', 'english muffin', 1, 'muffin', 57, 130, 25, 5, 1, 'catalog:english muffin:57', ARRAY['Pantry|Bread & tortillas']),
    ('Chickpeas', 'chickpeas', 0.5, 'cup cooked', 82, 135, 22, 7, 2, 'catalog:chickpeas:82', ARRAY['Pantry|Beans & legumes']),
    ('Canned tuna', 'canned tuna', 1, 'can drained', 113, 130, 0, 29, 1, 'catalog:canned tuna:113', ARRAY['Pantry|Canned foods']),
    ('Canned chicken', 'canned chicken', 0.5, 'cup', 85, 120, 0, 25, 2, 'catalog:canned chicken:85', ARRAY['Pantry|Canned foods']),
    ('Canned corn', 'canned corn', 0.5, 'cup', 82, 70, 15, 2, 1, 'catalog:canned corn:82', ARRAY['Pantry|Canned foods']),
    ('Canned soup', 'canned soup', 1, 'cup', 245, 120, 18, 5, 3, 'catalog:canned soup:245', ARRAY['Pantry|Canned foods']),
    ('Canned tomatoes', 'canned tomatoes', 0.5, 'cup', 121, 35, 8, 2, 0, 'catalog:canned tomatoes:121', ARRAY['Pantry|Canned foods']),
    ('Almond butter', 'almond butter', 2, 'tbsp', 32, 190, 7, 7, 17, 'catalog:almond butter:32', ARRAY['Pantry|Nut butters']),
    ('Olive oil', 'olive oil', 1, 'tbsp', 14, 119, 0, 0, 13.5, 'catalog:olive oil:14', ARRAY['Pantry|Oils']),
    ('Vegetable oil', 'vegetable oil', 1, 'tbsp', 14, 120, 0, 0, 14, 'catalog:vegetable oil:14', ARRAY['Pantry|Oils']),
    ('Coconut oil', 'coconut oil', 1, 'tbsp', 14, 121, 0, 0, 13.5, 'catalog:coconut oil:14', ARRAY['Pantry|Oils']),
    ('Flour', 'flour', 0.25, 'cup', 30, 110, 23, 3, 0.3, 'catalog:flour:30', ARRAY['Pantry|Baking']),
    ('Sugar', 'sugar', 1, 'tbsp', 12.5, 49, 12.6, 0, 0, 'catalog:sugar:12.5', ARRAY['Pantry|Baking'])
),
seed_rows AS (
  SELECT
    seed_foods.*,
    jsonb_build_object(
      'browse',
      (
        SELECT jsonb_agg(
          jsonb_build_object(
            'department', split_part(placement.value, '|', 1),
            'aisle', split_part(placement.value, '|', 2)
          )
          ORDER BY placement.ordinality
        )
        FROM unnest(seed_foods.browse_placements) WITH ORDINALITY AS placement(value, ordinality)
      ),
      'seed_version', 'core_grocery_v1',
      'data_quality', 'generic_estimate'
    ) AS seed_metadata
  FROM seed_foods
),
updated_foods AS (
  UPDATE public.foods AS foods
  SET
    name = seed_rows.name,
    normalized_name = seed_rows.normalized_name,
    brand_name = NULL,
    normalized_brand_name = NULL,
    serving_size = seed_rows.serving_size,
    serving_unit = seed_rows.serving_unit,
    serving_grams = seed_rows.serving_grams,
    calories = seed_rows.calories,
    carbs_g = seed_rows.carbs_g,
    protein_g = seed_rows.protein_g,
    fat_g = seed_rows.fat_g,
    source = 'catalog',
    dedupe_key = CASE
      WHEN foods.dedupe_key IS NOT NULL AND foods.dedupe_key <> '' THEN foods.dedupe_key
      WHEN NOT EXISTS (
        SELECT 1
        FROM public.foods AS existing_dedupe
        WHERE existing_dedupe.dedupe_key = seed_rows.dedupe_key
          AND existing_dedupe.id <> foods.id
      )
      AND NOT EXISTS (
        SELECT 1
        FROM public.foods AS duplicate_shared_food
        WHERE duplicate_shared_food.created_by_user_id IS NULL
          AND duplicate_shared_food.normalized_name = seed_rows.normalized_name
          AND duplicate_shared_food.normalized_brand_name IS NULL
          AND duplicate_shared_food.id <> foods.id
          AND (
            duplicate_shared_food.dedupe_key IS NULL
            OR duplicate_shared_food.dedupe_key = ''
          )
      ) THEN seed_rows.dedupe_key
      ELSE foods.dedupe_key
    END,
    is_active = true,
    metadata = COALESCE(foods.metadata, '{}'::jsonb) || seed_rows.seed_metadata
  FROM seed_rows
  WHERE foods.created_by_user_id IS NULL
    AND (
      foods.dedupe_key = seed_rows.dedupe_key
      OR (
        foods.normalized_name = seed_rows.normalized_name
        AND foods.normalized_brand_name IS NULL
      )
    )
  RETURNING foods.id
)
INSERT INTO public.foods (
  name,
  normalized_name,
  brand_name,
  normalized_brand_name,
  serving_size,
  serving_unit,
  serving_grams,
  calories,
  carbs_g,
  protein_g,
  fat_g,
  source,
  dedupe_key,
  created_by_user_id,
  is_active,
  metadata
)
SELECT
  seed_rows.name,
  seed_rows.normalized_name,
  NULL,
  NULL,
  seed_rows.serving_size,
  seed_rows.serving_unit,
  seed_rows.serving_grams,
  seed_rows.calories,
  seed_rows.carbs_g,
  seed_rows.protein_g,
  seed_rows.fat_g,
  'catalog',
  seed_rows.dedupe_key,
  NULL,
  true,
  seed_rows.seed_metadata
FROM seed_rows
WHERE NOT EXISTS (
  SELECT 1
  FROM public.foods AS existing
  WHERE existing.dedupe_key = seed_rows.dedupe_key
    OR (
      existing.created_by_user_id IS NULL
      AND existing.normalized_name = seed_rows.normalized_name
      AND existing.normalized_brand_name IS NULL
    )
);

COMMIT;
