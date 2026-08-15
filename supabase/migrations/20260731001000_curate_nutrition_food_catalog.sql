-- Curate the shared generic Nutrition foods catalog after the expanded catalog seed.
-- This is forward-only and reference-safe: rejected built-in rows are hidden from
-- search/browse, not deleted, and remain active/readable for historical FKs.

BEGIN;

ALTER TABLE public.foods
  ADD COLUMN IF NOT EXISTS is_catalog_visible boolean NOT NULL DEFAULT true;

CREATE INDEX IF NOT EXISTS foods_active_visible_normalized_name_idx
  ON public.foods(is_active, is_catalog_visible, normalized_name);

WITH remove_foods(normalized_name, source_tag, reason) AS (
  VALUES
    ('guacamole', 'F2', 'composite prepared dip'),
    ('hard boiled egg', 'F3', 'unnecessary cooked duplicate of egg'),
    ('scrambled eggs', 'F3', 'cooked egg recipe form'),
    ('chocolate milk', 'F1', 'sweetened beverage'),
    ('kefir', 'F3', 'niche fermented dairy drink'),
    ('regular yogurt', 'F1', 'ambiguous yogurt duplicate'),
    ('skyr', 'F3', 'niche yogurt style'),
    ('vanilla yogurt', 'F1', 'sweetened flavored yogurt'),
    ('kombucha', 'F3', 'fermented beverage'),
    ('sweet tea', 'F2', 'sweetened beverage'),
    ('lemonade', 'F2', 'sweetened beverage'),
    ('fruit smoothie', 'F2', 'composite beverage'),
    ('protein shake', 'F2', 'prepared nutrition shortcut'),
    ('diet soda', 'F3', 'non-foundational beverage'),
    ('soda', 'F2', 'sweetened beverage'),
    ('energy drink', 'F2', 'brand-dependent beverage'),
    ('sports drink', 'F2', 'brand-dependent beverage'),
    ('coconut water', 'F3', 'beverage-only item'),
    ('cereal', 'F1', 'vague packaged category'),
    ('toast', 'F1', 'cooked bread duplicate'),
    ('potatoes', 'F1', 'generic potato duplicate'),
    ('frozen salmon fillet', 'F3', 'freezing does not change canonical salmon'),
    ('frozen shrimp', 'F3', 'freezing does not change canonical shrimp'),
    ('frozen french fries', 'F3', 'prepared frozen snack'),
    ('beef roast', 'F1', 'vague beef cut'),
    ('steak', 'F1', 'vague beef cut'),
    ('chicken nuggets', 'F1', 'breaded convenience food'),
    ('chicken sausage', 'F3', 'processed product-dependent protein'),
    ('rotisserie chicken', 'F1', 'prepared cooked protein'),
    ('anchovies', 'F3', 'niche canned fish'),
    ('haddock', 'F3', 'lower-priority fish'),
    ('tuna', 'F1', 'ambiguous fresh canned generic'),
    ('canadian bacon', 'F3', 'lower-priority processed meat'),
    ('clams', 'F3', 'specialty shellfish'),
    ('mussels', 'F3', 'specialty shellfish'),
    ('oysters', 'F3', 'specialty shellfish'),
    ('scallops', 'F1', 'specialty seafood'),
    ('turkey bacon', 'F1', 'processed product-dependent meat'),
    ('turkey meatballs', 'F3', 'prepared recipe form'),
    ('turkey sausage', 'F3', 'processed product-dependent protein'),
    ('tortilla', 'F1', 'generic tortilla duplicate'),
    ('canned soup', 'F1', 'generic prepared soup'),
    ('pasta', 'F1', 'generic pasta duplicate'),
    ('ramen noodles', 'F1', 'instant packet-style product'),
    ('soba noodles', 'F3', 'specialty noodle'),
    ('udon noodles', 'F3', 'specialty noodle'),
    ('bulgur', 'F3', 'specialty grain'),
    ('farro', 'F3', 'specialty grain'),
    ('millet', 'F3', 'specialty grain'),
    ('rice bowl', 'F2', 'complete composite meal'),
    ('breakfast burrito', 'F2', 'complete prepared meal'),
    ('chicken alfredo', 'F2', 'complete pasta dish'),
    ('chicken noodle soup', 'F2', 'prepared soup'),
    ('chili', 'F2', 'prepared mixed dish'),
    ('frozen pizza', 'F2', 'complete prepared meal'),
    ('grilled cheese', 'F2', 'prepared sandwich'),
    ('grilled chicken salad', 'F3', 'complete prepared salad'),
    ('instant ramen', 'F2', 'prepared convenience meal'),
    ('lasagna', 'F2', 'complete prepared dish'),
    ('lentil soup', 'F3', 'prepared soup'),
    ('mac and cheese', 'F2', 'complete prepared dish'),
    ('mashed potatoes', 'F3', 'prepared potato dish'),
    ('peanut butter and jelly sandwich', 'F2', 'complete sandwich'),
    ('spaghetti with meat sauce', 'F2', 'complete prepared dish'),
    ('tuna sandwich', 'F2', 'complete sandwich'),
    ('vegetable soup', 'F3', 'prepared soup'),
    ('burrito', 'F2', 'restaurant-style prepared food'),
    ('cheeseburger', 'F2', 'restaurant-style prepared food'),
    ('chicken sandwich', 'F2', 'restaurant-style prepared food'),
    ('fried rice', 'F3', 'prepared rice dish'),
    ('hot dog', 'F2', 'restaurant-style prepared food'),
    ('quesadilla', 'F2', 'restaurant-style prepared food'),
    ('tacos', 'F2', 'restaurant-style prepared food'),
    ('figs', 'F3', 'lower-priority fruit'),
    ('pomegranate arils', 'F3', 'prepared specialty fruit form'),
    ('tarragon', 'F3', 'niche fresh herb'),
    ('bell pepper', 'F1', 'generic bell pepper duplicate'),
    ('onion', 'F1', 'generic onion duplicate'),
    ('granola bar', 'F3', 'packaged snack bar'),
    ('protein bar', 'F1', 'packaged snack bar'),
    ('potato chips', 'F3', 'packaged junk snack'),
    ('crackers', 'F1', 'vague packaged snack category'),
    ('pretzels', 'F3', 'packaged snack category'),
    ('rice cakes', 'F3', 'packaged snack item'),
    ('trail mix', 'F1', 'composite snack'),
    ('dark chocolate', 'F3', 'snack specialty')
),
hidden_foods AS (
  UPDATE public.foods AS food
  SET
    is_catalog_visible = false,
    metadata = COALESCE(food.metadata, '{}'::jsonb) || jsonb_build_object(
      'catalog_visibility', 'hidden',
      'catalog_status', 'curation_removed_v1',
      'curation_source', remove_foods.source_tag,
      'curation_reason', remove_foods.reason,
      'curated_by_migration', '20260731001000_curate_nutrition_food_catalog'
    )
  FROM remove_foods
  WHERE food.created_by_user_id IS NULL
    AND food.source = 'catalog'
    AND food.normalized_brand_name IS NULL
    AND food.normalized_name = remove_foods.normalized_name
    AND food.dedupe_key IS NOT NULL
    AND food.dedupe_key LIKE 'catalog:%'
  RETURNING food.id
)
SELECT count(*) FROM hidden_foods;

UPDATE public.foods
SET
  normalized_name = '2 percent milk',
  dedupe_key = CASE
    WHEN dedupe_key IS NULL OR dedupe_key = '' OR dedupe_key = 'catalog:2 milk:244'
      THEN 'catalog:2 percent milk:244'
    ELSE dedupe_key
  END,
  metadata = COALESCE(metadata, '{}'::jsonb) || jsonb_build_object(
    'normalized_name_previous', '2 milk',
    'curated_by_migration', '20260731001000_curate_nutrition_food_catalog'
  )
WHERE created_by_user_id IS NULL
  AND source = 'catalog'
  AND normalized_brand_name IS NULL
  AND normalized_name = '2 milk'
  AND name = '2% milk'
  AND is_catalog_visible = true
  AND dedupe_key LIKE 'catalog:%';

WITH seed_foods(
  canonical_key, name, normalized_name, food_family, icon_name, search_aliases,
  serving_size, serving_unit, serving_grams, calories, carbs_g, protein_g, fat_g,
  browse_placements
) AS (
  VALUES
    ('green-bell-pepper', 'Green bell pepper', 'green bell pepper', 'Pepper', 'pepper', ARRAY['green pepper', 'sweet green pepper'], 100, 'g', 100, 20, 4.6, 0.9, 0.2, ARRAY['Produce|Vegetables']),
    ('yellow-bell-pepper', 'Yellow bell pepper', 'yellow bell pepper', 'Pepper', 'pepper', ARRAY['yellow pepper', 'sweet yellow pepper'], 100, 'g', 100, 27, 6.3, 1, 0.2, ARRAY['Produce|Vegetables']),
    ('white-onion', 'White onion', 'white onion', 'Aromatic', 'onion', ARRAY['white cooking onion'], 100, 'g', 100, 40, 9.3, 1.1, 0.1, ARRAY['Produce|Vegetables']),
    ('leek', 'Leek', 'leek', 'Aromatic', 'onion', ARRAY['fresh leek'], 100, 'g', 100, 61, 14.2, 1.5, 0.3, ARRAY['Produce|Vegetables']),
    ('red-potato', 'Red potato', 'red potato', 'Vegetable', 'potato', ARRAY['red potatoes'], 1, 'medium', 173, 154, 34, 4, 0.3, ARRAY['Produce|Vegetables', 'Everyday|Cheap bulk foods']),
    ('pumpkin', 'Pumpkin', 'pumpkin', 'Vegetable', 'pumpkin', ARRAY['fresh pumpkin'], 100, 'g', 100, 26, 6.5, 1, 0.1, ARRAY['Produce|Vegetables']),
    ('acorn-squash', 'Acorn squash', 'acorn squash', 'Vegetable', 'squash', ARRAY['winter acorn squash'], 100, 'g', 100, 40, 10.4, 0.8, 0.1, ARRAY['Produce|Vegetables']),
    ('spaghetti-squash', 'Spaghetti squash', 'spaghetti squash', 'Vegetable', 'squash', ARRAY['winter spaghetti squash'], 100, 'g', 100, 31, 6.9, 0.6, 0.6, ARRAY['Produce|Vegetables']),
    ('fennel', 'Fennel', 'fennel', 'Vegetable', 'fennel', ARRAY['fresh fennel bulb'], 100, 'g', 100, 31, 7.3, 1.2, 0.2, ARRAY['Produce|Vegetables']),
    ('artichoke', 'Artichoke', 'artichoke', 'Vegetable', 'artichoke', ARRAY['fresh artichoke'], 1, 'medium', 120, 64, 14.3, 3.5, 0.4, ARRAY['Produce|Vegetables']),
    ('okra', 'Okra', 'okra', 'Vegetable', 'okra', ARRAY['fresh okra'], 100, 'g', 100, 33, 7.5, 1.9, 0.2, ARRAY['Produce|Vegetables']),
    ('whole-chicken', 'Whole chicken', 'whole chicken', 'Chicken', 'chicken', ARRAY['whole raw chicken'], 100, 'g', 100, 215, 0, 18, 15, ARRAY['Meat & Seafood|Chicken']),
    ('chicken-tenderloins', 'Chicken tenderloins', 'chicken tenderloins', 'Chicken', 'chicken', ARRAY['chicken tenders'], 100, 'g', 100, 110, 0, 23, 1.5, ARRAY['Meat & Seafood|Chicken', 'Everyday|High protein regulars']),
    ('chuck-roast', 'Chuck roast', 'chuck roast', 'Beef', 'beef', ARRAY['beef chuck roast'], 100, 'g', 100, 190, 0, 22, 11, ARRAY['Meat & Seafood|Beef']),
    ('flank-steak', 'Flank steak', 'flank steak', 'Beef', 'beef', ARRAY['beef flank steak'], 100, 'g', 100, 192, 0, 28, 8, ARRAY['Meat & Seafood|Beef']),
    ('ground-pork', 'Ground pork', 'ground pork', 'Pork', 'pork', ARRAY['minced pork'], 100, 'g', 100, 297, 0, 26, 21, ARRAY['Meat & Seafood|Pork']),
    ('pork-ribs', 'Pork ribs', 'pork ribs', 'Pork', 'pork', ARRAY['pork spare ribs'], 100, 'g', 100, 290, 0, 24, 21, ARRAY['Meat & Seafood|Pork']),
    ('catfish', 'Catfish', 'catfish', 'Fish', 'fish', ARRAY['catfish fillet'], 100, 'g', 100, 105, 0, 18, 3, ARRAY['Meat & Seafood|Fish']),
    ('pollock', 'Pollock', 'pollock', 'Fish', 'fish', ARRAY['pollock fillet'], 100, 'g', 100, 92, 0, 20, 1, ARRAY['Meat & Seafood|Fish']),
    ('mahi-mahi', 'Mahi mahi', 'mahi mahi', 'Fish', 'fish', ARRAY['mahi mahi fillet'], 100, 'g', 100, 85, 0, 19, 0.7, ARRAY['Meat & Seafood|Fish']),
    ('egg-yolk', 'Egg yolk', 'egg yolk', 'Eggs', 'egg', ARRAY['large egg yolk'], 1, 'large yolk', 17, 55, 0.6, 2.7, 4.5, ARRAY['Dairy & Eggs|Eggs']),
    ('monterey-jack-cheese', 'Monterey Jack cheese', 'monterey jack cheese', 'Cheese', 'cheese', ARRAY['monterey jack'], 1, 'oz', 28, 106, 0.2, 7, 8.6, ARRAY['Dairy & Eggs|Cheese']),
    ('colby-jack-cheese', 'Colby Jack cheese', 'colby jack cheese', 'Cheese', 'cheese', ARRAY['colby jack'], 1, 'oz', 28, 110, 0.5, 7, 9, ARRAY['Dairy & Eggs|Cheese']),
    ('blue-cheese', 'Blue cheese', 'blue cheese', 'Cheese', 'cheese', ARRAY['bleu cheese'], 1, 'oz', 28, 100, 0.7, 6, 8, ARRAY['Dairy & Eggs|Cheese']),
    ('whole-wheat-pasta', 'Whole wheat pasta', 'whole wheat pasta', 'Pasta', 'pasta', ARRAY['cooked whole wheat pasta'], 1, 'cup cooked', 140, 174, 37, 7.5, 0.8, ARRAY['Pantry|Pasta']),
    ('lasagna-noodles', 'Lasagna noodles', 'lasagna noodles', 'Pasta', 'pasta', ARRAY['cooked lasagna noodles'], 2, 'sheets cooked', 100, 160, 32, 6, 1, ARRAY['Pantry|Pasta']),
    ('orzo', 'Orzo', 'orzo', 'Pasta', 'pasta', ARRAY['cooked orzo'], 1, 'cup cooked', 140, 210, 42, 7, 1, ARRAY['Pantry|Pasta']),
    ('whole-wheat-tortilla', 'Whole wheat tortilla', 'whole wheat tortilla', 'Tortilla', 'tortilla', ARRAY['wheat tortilla'], 1, 'medium', 49, 130, 22, 4, 3, ARRAY['Pantry|Bread & tortillas']),
    ('black-eyed-peas', 'Black-eyed peas', 'black eyed peas', 'Beans', 'beans', ARRAY['black eyed beans'], 0.5, 'cup cooked', 85, 100, 18, 6.5, 0.5, ARRAY['Pantry|Beans & legumes', 'Everyday|Cheap bulk foods']),
    ('edamame', 'Edamame', 'edamame', 'Legume', 'beans', ARRAY['soybeans'], 0.5, 'cup shelled', 78, 94, 7, 9, 4, ARRAY['Pantry|Beans & legumes', 'Frozen|Frozen vegetables']),
    ('canned-black-beans', 'Canned black beans', 'canned black beans', 'Canned Beans', 'beans', ARRAY['black beans can'], 0.5, 'cup', 130, 110, 20, 7, 0.5, ARRAY['Pantry|Canned foods', 'Pantry|Beans & legumes']),
    ('canned-pinto-beans', 'Canned pinto beans', 'canned pinto beans', 'Canned Beans', 'beans', ARRAY['pinto beans can'], 0.5, 'cup', 130, 120, 22, 7, 0.5, ARRAY['Pantry|Canned foods', 'Pantry|Beans & legumes']),
    ('canned-green-beans', 'Canned green beans', 'canned green beans', 'Canned Vegetable', 'green beans', ARRAY['green beans can'], 0.5, 'cup', 120, 20, 4, 1, 0, ARRAY['Pantry|Canned foods', 'Produce|Vegetables']),
    ('canned-peas', 'Canned peas', 'canned peas', 'Canned Vegetable', 'peas', ARRAY['peas can'], 0.5, 'cup', 125, 60, 11, 4, 0.4, ARRAY['Pantry|Canned foods', 'Produce|Vegetables']),
    ('vegetable-broth', 'Vegetable broth', 'vegetable broth', 'Broth', 'broth', ARRAY['vegetable stock'], 1, 'cup', 240, 15, 2, 1, 0, ARRAY['Pantry|Canned foods']),
    ('beef-broth', 'Beef broth', 'beef broth', 'Broth', 'broth', ARRAY['beef stock'], 1, 'cup', 240, 15, 1, 2, 0.5, ARRAY['Pantry|Canned foods']),
    ('peanut-oil', 'Peanut oil', 'peanut oil', 'Oil', 'oil', ARRAY['groundnut oil'], 1, 'tbsp', 14, 119, 0, 0, 13.5, ARRAY['Pantry|Oils']),
    ('shortening', 'Shortening', 'shortening', 'Cooking Fat', 'oil', ARRAY['vegetable shortening'], 1, 'tbsp', 13, 113, 0, 0, 12.8, ARRAY['Pantry|Oils', 'Pantry|Baking']),
    ('lard', 'Lard', 'lard', 'Cooking Fat', 'oil', ARRAY['pork lard'], 1, 'tbsp', 13, 115, 0, 0, 12.8, ARRAY['Pantry|Oils']),
    ('brown-sugar', 'Brown sugar', 'brown sugar', 'Baking Ingredient', 'sugar', ARRAY['light brown sugar'], 1, 'tbsp', 12.5, 52, 13.4, 0, 0, ARRAY['Pantry|Baking', 'Condiments & Sauces|Sweeteners']),
    ('powdered-sugar', 'Powdered sugar', 'powdered sugar', 'Baking Ingredient', 'sugar', ARRAY['confectioners sugar'], 1, 'tbsp', 8, 31, 8, 0, 0, ARRAY['Pantry|Baking']),
    ('vanilla-extract', 'Vanilla extract', 'vanilla extract', 'Baking Ingredient', 'baking', ARRAY['pure vanilla extract'], 1, 'tsp', 4, 12, 0.5, 0, 0, ARRAY['Pantry|Baking']),
    ('active-dry-yeast', 'Active dry yeast', 'active dry yeast', 'Baking Ingredient', 'baking', ARRAY['dry yeast'], 1, 'tsp', 3, 10, 1, 1.3, 0.2, ARRAY['Pantry|Baking']),
    ('bread-flour', 'Bread flour', 'bread flour', 'Baking Ingredient', 'flour', ARRAY['high protein flour'], 0.25, 'cup', 30, 110, 22, 4, 0.3, ARRAY['Pantry|Baking']),
    ('chocolate-chips', 'Chocolate chips', 'chocolate chips', 'Baking Ingredient', 'chocolate', ARRAY['semi sweet chocolate chips'], 1, 'tbsp', 14, 70, 9, 1, 4, ARRAY['Pantry|Baking']),
    ('breadcrumbs', 'Breadcrumbs', 'breadcrumbs', 'Baking Ingredient', 'bread', ARRAY['bread crumbs'], 0.25, 'cup', 28, 110, 20, 4, 1.5, ARRAY['Pantry|Baking']),
    ('frozen-green-beans', 'Frozen green beans', 'frozen green beans', 'Frozen Vegetable', 'green beans', ARRAY['green beans frozen'], 0.5, 'cup', 67, 20, 4, 1, 0, ARRAY['Frozen|Frozen vegetables', 'Produce|Vegetables']),
    ('frozen-cauliflower', 'Frozen cauliflower', 'frozen cauliflower', 'Frozen Vegetable', 'cauliflower', ARRAY['cauliflower frozen'], 1, 'cup', 100, 25, 5, 2, 0.3, ARRAY['Frozen|Frozen vegetables', 'Produce|Vegetables']),
    ('frozen-edamame', 'Frozen edamame', 'frozen edamame', 'Frozen Vegetable', 'beans', ARRAY['edamame frozen'], 0.5, 'cup shelled', 78, 94, 7, 9, 4, ARRAY['Frozen|Frozen vegetables', 'Pantry|Beans & legumes']),
    ('dijon-mustard', 'Dijon mustard', 'dijon mustard', 'Mustard', 'mustard', ARRAY['dijon'], 1, 'tbsp', 15, 15, 0.9, 0.7, 0.8, ARRAY['Condiments & Sauces|Sauces']),
    ('white-vinegar', 'White vinegar', 'white vinegar', 'Vinegar', 'vinegar', ARRAY['distilled vinegar'], 1, 'tbsp', 15, 3, 0, 0, 0, ARRAY['Condiments & Sauces|Sauces']),
    ('red-wine-vinegar', 'Red wine vinegar', 'red wine vinegar', 'Vinegar', 'vinegar', ARRAY['red vinegar'], 1, 'tbsp', 15, 3, 0, 0, 0, ARRAY['Condiments & Sauces|Sauces', 'Condiments & Sauces|Dressings']),
    ('pickles', 'Pickles', 'pickles', 'Pickle', 'pickle', ARRAY['dill pickles'], 1, 'spear', 35, 5, 1, 0.2, 0, ARRAY['Condiments & Sauces|Sauces']),
    ('pickle-relish', 'Pickle relish', 'pickle relish', 'Relish', 'pickle', ARRAY['relish'], 1, 'tbsp', 15, 20, 5, 0, 0, ARRAY['Condiments & Sauces|Sauces']),
    ('salt', 'Salt', 'salt', 'Seasoning', 'spice', ARRAY['table salt'], 1, 'tsp', 6, 0, 0, 0, 0, ARRAY['Condiments & Sauces|Seasonings', 'Pantry|Baking']),
    ('garlic-powder', 'Garlic powder', 'garlic powder', 'Seasoning', 'spice', ARRAY['granulated garlic'], 1, 'tsp', 3, 10, 2.3, 0.5, 0, ARRAY['Condiments & Sauces|Seasonings']),
    ('onion-powder', 'Onion powder', 'onion powder', 'Seasoning', 'spice', ARRAY['granulated onion'], 1, 'tsp', 2.4, 8, 1.9, 0.2, 0, ARRAY['Condiments & Sauces|Seasonings']),
    ('paprika', 'Paprika', 'paprika', 'Seasoning', 'spice', ARRAY['ground paprika'], 1, 'tsp', 2.3, 6, 1.2, 0.3, 0.3, ARRAY['Condiments & Sauces|Seasonings']),
    ('smoked-paprika', 'Smoked paprika', 'smoked paprika', 'Seasoning', 'spice', ARRAY['pimenton'], 1, 'tsp', 2.3, 6, 1.2, 0.3, 0.3, ARRAY['Condiments & Sauces|Seasonings']),
    ('cinnamon', 'Cinnamon', 'cinnamon', 'Seasoning', 'spice', ARRAY['ground cinnamon'], 1, 'tsp', 2.6, 6, 2.1, 0.1, 0, ARRAY['Condiments & Sauces|Seasonings', 'Pantry|Baking']),
    ('dried-oregano', 'Dried oregano', 'dried oregano', 'Seasoning', 'spice', ARRAY['oregano'], 1, 'tsp', 1, 3, 0.7, 0.1, 0, ARRAY['Condiments & Sauces|Seasonings']),
    ('dried-basil', 'Dried basil', 'dried basil', 'Seasoning', 'spice', ARRAY['basil leaves dried'], 1, 'tsp', 1, 2, 0.4, 0.1, 0, ARRAY['Condiments & Sauces|Seasonings']),
    ('italian-seasoning', 'Italian seasoning', 'italian seasoning', 'Seasoning', 'spice', ARRAY['italian herb blend'], 1, 'tsp', 1, 3, 0.6, 0.1, 0, ARRAY['Condiments & Sauces|Seasonings']),
    ('red-pepper-flakes', 'Red pepper flakes', 'red pepper flakes', 'Seasoning', 'spice', ARRAY['crushed red pepper'], 1, 'tsp', 2, 6, 1, 0.3, 0.3, ARRAY['Condiments & Sauces|Seasonings']),
    ('bay-leaves', 'Bay leaves', 'bay leaves', 'Seasoning', 'spice', ARRAY['dried bay leaf'], 1, 'leaf', 1, 3, 0.7, 0.1, 0, ARRAY['Condiments & Sauces|Seasonings']),
    ('curry-powder', 'Curry powder', 'curry powder', 'Seasoning', 'spice', ARRAY['curry spice blend'], 1, 'tsp', 2, 6, 1, 0.3, 0.3, ARRAY['Condiments & Sauces|Seasonings']),
    ('turmeric', 'Turmeric', 'turmeric', 'Seasoning', 'spice', ARRAY['ground turmeric'], 1, 'tsp', 3, 9, 2, 0.3, 0.1, ARRAY['Condiments & Sauces|Seasonings']),
    ('ground-ginger', 'Ground ginger', 'ground ginger', 'Seasoning', 'spice', ARRAY['ginger powder'], 1, 'tsp', 2, 7, 1.5, 0.2, 0, ARRAY['Condiments & Sauces|Seasonings']),
    ('nutmeg', 'Nutmeg', 'nutmeg', 'Seasoning', 'spice', ARRAY['ground nutmeg'], 1, 'tsp', 2, 12, 1, 0.1, 0.8, ARRAY['Condiments & Sauces|Seasonings', 'Pantry|Baking']),
    ('almonds', 'Almonds', 'almonds', 'Nuts', 'nuts', ARRAY['raw almonds'], 1, 'oz', 28, 164, 6, 6, 14, ARRAY['Snacks|Nuts & trail mix', 'Everyday|Quick snacks']),
    ('pecans', 'Pecans', 'pecans', 'Nuts', 'nuts', ARRAY['raw pecans'], 1, 'oz', 28, 196, 4, 3, 20, ARRAY['Snacks|Nuts & trail mix']),
    ('sunflower-seeds', 'Sunflower seeds', 'sunflower seeds', 'Seeds', 'seeds', ARRAY['sunflower kernels'], 1, 'oz', 28, 165, 6, 5.5, 14, ARRAY['Snacks|Nuts & trail mix']),
    ('sesame-seeds', 'Sesame seeds', 'sesame seeds', 'Seeds', 'seeds', ARRAY['sesame'], 1, 'oz', 28, 160, 6.6, 5, 13.9, ARRAY['Snacks|Nuts & trail mix', 'Pantry|Baking']),
    ('ground-flaxseed', 'Ground flaxseed', 'ground flaxseed', 'Seeds', 'seeds', ARRAY['flax meal'], 1, 'tbsp', 7, 37, 2, 1.3, 3, ARRAY['Snacks|Nuts & trail mix', 'Pantry|Baking']),
    ('raisins', 'Raisins', 'raisins', 'Dried Fruit', 'fruit', ARRAY['dried grapes'], 0.25, 'cup', 40, 120, 31, 1, 0.2, ARRAY['Snacks|Sweet snacks', 'Pantry|Baking'])
),
seed_rows AS (
  SELECT
    seed_foods.*,
    ('catalog:curated:' || canonical_key || ':' || serving_grams::text) AS dedupe_key,
    jsonb_build_object(
      'canonical_key', canonical_key,
      'foodKey', canonical_key,
      'food_family', food_family,
      'canonical_food_name', name,
      'icon', jsonb_build_object('name', icon_name),
      'search_aliases', to_jsonb(search_aliases),
      'category', browse_placements[1],
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
      'seed_version', 'curated_food_catalog_v1',
      'data_quality', 'generic_estimate',
      'nutrition_basis', 'per_serving',
      'nutrition_per_serving', jsonb_build_object(
        'calories', calories,
        'carbs_g', carbs_g,
        'protein_g', protein_g,
        'fat_g', fat_g
      )
    ) AS seed_metadata
  FROM seed_foods
),
updated_foods AS (
  UPDATE public.foods AS food
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
      WHEN food.dedupe_key IS NULL OR food.dedupe_key = '' THEN seed_rows.dedupe_key
      ELSE food.dedupe_key
    END,
    is_active = true,
    is_catalog_visible = true,
    metadata = COALESCE(food.metadata, '{}'::jsonb) || seed_rows.seed_metadata
  FROM seed_rows
  WHERE food.created_by_user_id IS NULL
    AND food.source = 'catalog'
    AND food.normalized_brand_name IS NULL
    AND food.normalized_name = seed_rows.normalized_name
  RETURNING food.id
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
  is_catalog_visible,
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
  true,
  seed_rows.seed_metadata
FROM seed_rows
WHERE NOT EXISTS (
  SELECT 1
  FROM public.foods AS existing
  WHERE existing.created_by_user_id IS NULL
    AND existing.source = 'catalog'
    AND existing.normalized_brand_name IS NULL
    AND (
      existing.normalized_name = seed_rows.normalized_name
      OR existing.dedupe_key = seed_rows.dedupe_key
    )
);

DO $$
DECLARE
  v_hidden_count integer;
  v_add_count integer;
  v_active_visible_count integer;
BEGIN
  SELECT count(*) INTO v_hidden_count
  FROM public.foods
  WHERE created_by_user_id IS NULL
    AND source = 'catalog'
    AND normalized_brand_name IS NULL
    AND is_catalog_visible = false
    AND normalized_name = ANY (ARRAY[
      'guacamole','hard boiled egg','scrambled eggs','chocolate milk','kefir','regular yogurt','skyr','vanilla yogurt',
      'kombucha','sweet tea','lemonade','fruit smoothie','protein shake','diet soda','soda','energy drink','sports drink',
      'coconut water','cereal','toast','potatoes','frozen salmon fillet','frozen shrimp','frozen french fries','beef roast',
      'steak','chicken nuggets','chicken sausage','rotisserie chicken','anchovies','haddock','tuna','canadian bacon','clams',
      'mussels','oysters','scallops','turkey bacon','turkey meatballs','turkey sausage','tortilla','canned soup','pasta',
      'ramen noodles','soba noodles','udon noodles','bulgur','farro','millet','rice bowl','breakfast burrito','chicken alfredo',
      'chicken noodle soup','chili','frozen pizza','grilled cheese','grilled chicken salad','instant ramen','lasagna','lentil soup',
      'mac and cheese','mashed potatoes','peanut butter and jelly sandwich','spaghetti with meat sauce','tuna sandwich',
      'vegetable soup','burrito','cheeseburger','chicken sandwich','fried rice','hot dog','quesadilla','tacos','figs',
      'pomegranate arils','tarragon','bell pepper','onion','granola bar','protein bar','potato chips','crackers','pretzels',
      'rice cakes','trail mix','dark chocolate'
    ]);

  IF v_hidden_count <> 86 THEN
    RAISE EXCEPTION 'Expected 86 hidden curated foods, found %', v_hidden_count;
  END IF;

  SELECT count(*) INTO v_add_count
  FROM public.foods
  WHERE created_by_user_id IS NULL
    AND source = 'catalog'
    AND normalized_brand_name IS NULL
    AND is_active = true
    AND is_catalog_visible = true
    AND normalized_name = ANY (ARRAY[
      'green bell pepper','yellow bell pepper','white onion','leek','red potato','pumpkin','acorn squash','spaghetti squash',
      'fennel','artichoke','okra','whole chicken','chicken tenderloins','chuck roast','flank steak','ground pork','pork ribs',
      'catfish','pollock','mahi mahi','egg yolk','monterey jack cheese','colby jack cheese','blue cheese','whole wheat pasta',
      'lasagna noodles','orzo','whole wheat tortilla','black eyed peas','edamame','canned black beans','canned pinto beans',
      'canned green beans','canned peas','vegetable broth','beef broth','peanut oil','shortening','lard','brown sugar',
      'powdered sugar','vanilla extract','active dry yeast','bread flour','chocolate chips','breadcrumbs','frozen green beans',
      'frozen cauliflower','frozen edamame','dijon mustard','white vinegar','red wine vinegar','pickles','pickle relish','salt',
      'garlic powder','onion powder','paprika','smoked paprika','cinnamon','dried oregano','dried basil','italian seasoning',
      'red pepper flakes','bay leaves','curry powder','turmeric','ground ginger','nutmeg','almonds','pecans','sunflower seeds',
      'sesame seeds','ground flaxseed','raisins'
    ]);

  IF v_add_count <> 75 THEN
    RAISE EXCEPTION 'Expected 75 visible curated additions, found %', v_add_count;
  END IF;

  SELECT count(*) INTO v_active_visible_count
  FROM public.foods
  WHERE created_by_user_id IS NULL
    AND source = 'catalog'
    AND normalized_brand_name IS NULL
    AND is_active = true
    AND is_catalog_visible = true;

  IF v_active_visible_count <> 325 THEN
    RAISE EXCEPTION 'Expected 325 active visible canonical foods, found %', v_active_visible_count;
  END IF;
END
$$;

COMMIT;
