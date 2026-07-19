-- Populate the shared foods catalog sections used by Grocery and Nutrition browse.

BEGIN;

WITH seed_foods(
  canonical_key, name, normalized_name, food_family, icon_name, search_aliases,
  serving_size, serving_unit, serving_grams, calories, carbs_g, protein_g, fat_g,
  department, aisle
) AS (
  VALUES
    ('water', 'Water', 'water', 'Water', 'water', ARRAY['drinking water', 'still water'], 1, 'cup', 240, 0, 0, 0, 0, 'Drinks', 'Water'),
    ('sparkling-water', 'Sparkling water', 'sparkling water', 'Water', 'water', ARRAY['seltzer', 'carbonated water', 'club soda'], 1, 'can', 355, 0, 0, 0, 0, 'Drinks', 'Water'),
    ('milk', 'Whole milk', 'whole milk', 'Milk', 'milk', ARRAY['full fat milk', 'dairy milk'], 1, 'cup', 244, 149, 12, 7.7, 8, 'Drinks', 'Protein drinks'),
    ('milk-2-percent', '2% milk', '2 milk', 'Milk', 'milk', ARRAY['two percent milk', 'reduced fat milk'], 1, 'cup', 244, 122, 12, 8, 5, 'Drinks', 'Protein drinks'),
    ('chocolate-milk', 'Chocolate milk', 'chocolate milk', 'Milk', 'milk', ARRAY['chocolate dairy milk'], 1, 'cup', 250, 190, 30, 8, 5, 'Drinks', 'Protein drinks'),
    ('orange-juice', 'Orange juice', 'orange juice', 'Fruit Juice', 'orange', ARRAY['oj', 'orange drink'], 1, 'cup', 248, 112, 26, 1.7, 0.5, 'Drinks', 'Juice'),
    ('apple-juice', 'Apple juice', 'apple juice', 'Fruit Juice', 'apple', ARRAY['apple drink'], 1, 'cup', 248, 114, 28, 0.2, 0.3, 'Drinks', 'Juice'),
    ('lemonade', 'Lemonade', 'lemonade', 'Lemonade', 'orange', ARRAY['lemon drink'], 1, 'cup', 248, 120, 31, 0.2, 0.1, 'Drinks', 'Juice'),
    ('coffee', 'Coffee', 'coffee', 'Coffee', 'coffee', ARRAY['black coffee', 'brewed coffee'], 1, 'cup', 237, 2, 0, 0.3, 0, 'Drinks', 'Coffee / tea'),
    ('iced-coffee', 'Iced coffee', 'iced coffee', 'Coffee', 'coffee', ARRAY['cold coffee', 'chilled coffee'], 1, 'cup', 240, 5, 1, 0.3, 0, 'Drinks', 'Coffee / tea'),
    ('tea', 'Tea', 'tea', 'Tea', 'tea', ARRAY['hot tea', 'brewed tea'], 1, 'cup', 237, 2, 0.5, 0, 0, 'Drinks', 'Coffee / tea'),
    ('sweet-tea', 'Sweet tea', 'sweet tea', 'Tea', 'tea', ARRAY['sweetened iced tea', 'iced tea'], 1, 'cup', 240, 90, 23, 0, 0, 'Drinks', 'Coffee / tea'),
    ('soda', 'Soda', 'soda', 'Soda', 'soda', ARRAY['soft drink', 'pop', 'cola'], 1, 'can', 355, 150, 39, 0, 0, 'Drinks', 'Soda'),
    ('sports-drink', 'Sports drink', 'sports drink', 'Sports Drink', 'sports drink', ARRAY['electrolyte drink', 'isotonic drink'], 1, 'bottle', 591, 130, 34, 0, 0, 'Drinks', 'Sports / energy drinks'),
    ('energy-drink', 'Energy drink', 'energy drink', 'Energy Drink', 'energy drink', ARRAY['caffeinated energy drink'], 1, 'can', 473, 210, 54, 0, 0, 'Drinks', 'Sports / energy drinks'),
    ('protein-shake', 'Protein shake', 'protein shake', 'Protein Shake', 'milk', ARRAY['protein drink', 'ready to drink protein'], 1, 'bottle', 325, 160, 8, 30, 3, 'Drinks', 'Protein drinks'),
    ('fruit-smoothie', 'Fruit smoothie', 'fruit smoothie', 'Smoothie', 'strawberry', ARRAY['smoothie', 'fruit shake'], 1, 'cup', 240, 180, 40, 4, 2, 'Drinks', 'Protein drinks'),

    ('ketchup', 'Ketchup', 'ketchup', 'Ketchup', 'tomato', ARRAY['tomato ketchup', 'catsup'], 1, 'tbsp', 17, 20, 4.7, 0.2, 0, 'Condiments & Sauces', 'Sauces'),
    ('yellow-mustard', 'Yellow mustard', 'yellow mustard', 'Mustard', 'mustard', ARRAY['mustard', 'prepared mustard'], 1, 'tbsp', 15, 10, 1, 0.6, 0.6, 'Condiments & Sauces', 'Sauces'),
    ('mayonnaise', 'Mayonnaise', 'mayonnaise', 'Mayonnaise', 'mayonnaise', ARRAY['mayo'], 1, 'tbsp', 14, 94, 0.1, 0.1, 10, 'Condiments & Sauces', 'Spreads'),
    ('hot-sauce', 'Hot sauce', 'hot sauce', 'Hot Sauce', 'pepper', ARRAY['pepper sauce', 'chili sauce'], 1, 'tsp', 5, 0, 0.1, 0, 0, 'Condiments & Sauces', 'Sauces'),
    ('salsa', 'Salsa', 'salsa', 'Salsa', 'tomato', ARRAY['tomato salsa', 'pico de gallo'], 2, 'tbsp', 30, 10, 2, 0.5, 0, 'Condiments & Sauces', 'Sauces'),
    ('ranch-dressing', 'Ranch dressing', 'ranch dressing', 'Salad Dressing', 'ranch', ARRAY['ranch', 'ranch dip'], 2, 'tbsp', 30, 130, 2, 1, 13, 'Condiments & Sauces', 'Dressings'),
    ('barbecue-sauce', 'Barbecue sauce', 'barbecue sauce', 'Barbecue Sauce', 'barbecue sauce', ARRAY['bbq sauce', 'barbeque sauce'], 2, 'tbsp', 36, 70, 17, 0.3, 0.2, 'Condiments & Sauces', 'Sauces'),
    ('soy-sauce', 'Soy sauce', 'soy sauce', 'Soy Sauce', 'soy sauce', ARRAY['shoyu', 'soya sauce'], 1, 'tbsp', 16, 9, 0.8, 1.3, 0.1, 'Condiments & Sauces', 'Sauces'),
    ('teriyaki-sauce', 'Teriyaki sauce', 'teriyaki sauce', 'Teriyaki Sauce', 'soy sauce', ARRAY['teriyaki marinade'], 1, 'tbsp', 18, 30, 5, 1, 0, 'Condiments & Sauces', 'Sauces'),
    ('buffalo-sauce', 'Buffalo sauce', 'buffalo sauce', 'Buffalo Sauce', 'pepper', ARRAY['wing sauce', 'buffalo wing sauce'], 1, 'tbsp', 15, 15, 0.5, 0, 1.5, 'Condiments & Sauces', 'Sauces'),
    ('taco-sauce', 'Taco sauce', 'taco sauce', 'Taco Sauce', 'tomato', ARRAY['taco condiment', 'mild taco sauce'], 1, 'tbsp', 16, 10, 2, 0.2, 0, 'Condiments & Sauces', 'Sauces'),
    ('sour-cream', 'Sour cream', 'sour cream', 'Sour Cream', 'milk', ARRAY['cultured cream'], 2, 'tbsp', 30, 60, 1.5, 1, 5, 'Condiments & Sauces', 'Spreads'),
    ('guacamole', 'Guacamole', 'guacamole', 'Guacamole', 'avocado', ARRAY['avocado dip', 'guac'], 2, 'tbsp', 30, 50, 3, 1, 4.5, 'Condiments & Sauces', 'Spreads'),
    ('hummus', 'Hummus', 'hummus', 'Hummus', 'beans', ARRAY['chickpea dip', 'garbanzo spread'], 2, 'tbsp', 30, 70, 4, 2, 5, 'Condiments & Sauces', 'Spreads'),
    ('pesto', 'Pesto', 'pesto', 'Pesto', 'basil', ARRAY['basil pesto', 'pesto sauce'], 2, 'tbsp', 30, 160, 3, 3, 16, 'Condiments & Sauces', 'Sauces'),
    ('marinara-sauce', 'Marinara sauce', 'marinara sauce', 'Tomato Sauce', 'tomato', ARRAY['marinara', 'pasta sauce', 'tomato sauce'], 0.5, 'cup', 125, 70, 12, 2, 2, 'Condiments & Sauces', 'Sauces'),
    ('alfredo-sauce', 'Alfredo sauce', 'alfredo sauce', 'Cream Sauce', 'milk', ARRAY['alfredo', 'white pasta sauce', 'cream sauce'], 0.25, 'cup', 62, 100, 4, 2, 9, 'Condiments & Sauces', 'Sauces'),
    ('honey', 'Honey', 'honey', 'Honey', 'honey', ARRAY['raw honey'], 1, 'tbsp', 21, 64, 17, 0.1, 0, 'Condiments & Sauces', 'Sweeteners'),
    ('maple-syrup', 'Maple syrup', 'maple syrup', 'Syrup', 'maple syrup', ARRAY['pancake syrup', 'pure maple syrup'], 1, 'tbsp', 20, 52, 13, 0, 0, 'Condiments & Sauces', 'Sweeteners'),
    ('fruit-jam', 'Fruit jam', 'fruit jam', 'Fruit Spread', 'strawberry', ARRAY['jam', 'jelly', 'fruit preserves'], 1, 'tbsp', 20, 56, 14, 0.1, 0, 'Condiments & Sauces', 'Spreads'),

    ('frozen-pizza', 'Frozen pizza', 'frozen pizza', 'Pizza', 'pizza', ARRAY['freezer pizza', 'ready made pizza'], 0.33, 'pizza', 140, 360, 44, 16, 14, 'Prepared', 'Ready meals'),
    ('burrito', 'Burrito', 'burrito', 'Burrito', 'burrito', ARRAY['beef burrito', 'bean burrito'], 1, 'burrito', 200, 400, 50, 16, 15, 'Prepared', 'Restaurant / fast food'),
    ('breakfast-burrito', 'Breakfast burrito', 'breakfast burrito', 'Burrito', 'burrito', ARRAY['egg burrito', 'morning burrito'], 1, 'burrito', 190, 430, 39, 19, 22, 'Prepared', 'Ready meals'),
    ('tacos', 'Tacos', 'tacos', 'Tacos', 'taco', ARRAY['taco', 'beef tacos'], 2, 'tacos', 220, 420, 36, 20, 22, 'Prepared', 'Restaurant / fast food'),
    ('quesadilla', 'Quesadilla', 'quesadilla', 'Quesadilla', 'taco', ARRAY['cheese quesadilla'], 1, 'quesadilla', 190, 470, 39, 20, 26, 'Prepared', 'Restaurant / fast food'),
    ('cheeseburger', 'Cheeseburger', 'cheeseburger', 'Burger', 'beef', ARRAY['cheese burger', 'hamburger with cheese'], 1, 'burger', 200, 520, 36, 28, 29, 'Prepared', 'Restaurant / fast food'),
    ('chicken-sandwich', 'Chicken sandwich', 'chicken sandwich', 'Sandwich', 'chicken', ARRAY['chicken burger', 'crispy chicken sandwich'], 1, 'sandwich', 210, 470, 45, 27, 20, 'Prepared', 'Restaurant / fast food'),
    ('hot-dog', 'Hot dog', 'hot dog', 'Hot Dog', 'hot dog', ARRAY['frankfurter', 'hotdog'], 1, 'hot dog', 150, 290, 24, 11, 18, 'Prepared', 'Restaurant / fast food'),
    ('chicken-nuggets', 'Chicken nuggets', 'chicken nuggets', 'Chicken Nuggets', 'chicken', ARRAY['nuggets', 'breaded chicken bites'], 5, 'pieces', 85, 250, 15, 14, 15, 'Prepared', 'Restaurant / fast food'),
    ('mac-and-cheese', 'Mac and cheese', 'mac and cheese', 'Macaroni and Cheese', 'pasta', ARRAY['macaroni and cheese', 'mac n cheese'], 1, 'cup', 200, 350, 44, 14, 14, 'Prepared', 'Ready meals'),
    ('instant-ramen', 'Instant ramen', 'instant ramen', 'Ramen', 'pasta', ARRAY['ramen noodles', 'instant noodles'], 1, 'packet prepared', 370, 380, 52, 8, 14, 'Prepared', 'Ready meals'),
    ('spaghetti-with-meat-sauce', 'Spaghetti with meat sauce', 'spaghetti with meat sauce', 'Pasta Meal', 'pasta', ARRAY['spaghetti bolognese', 'meat sauce pasta'], 1, 'plate', 400, 520, 68, 24, 17, 'Prepared', 'Ready meals'),
    ('lasagna', 'Lasagna', 'lasagna', 'Lasagna', 'pasta', ARRAY['meat lasagna', 'lasagne'], 1, 'piece', 250, 400, 35, 24, 18, 'Prepared', 'Ready meals'),
    ('chicken-alfredo', 'Chicken Alfredo', 'chicken alfredo', 'Pasta Meal', 'pasta', ARRAY['chicken fettuccine alfredo', 'alfredo pasta with chicken'], 1, 'plate', 400, 650, 62, 35, 29, 'Prepared', 'Ready meals'),
    ('rice-bowl', 'Rice bowl', 'rice bowl', 'Rice Bowl', 'rice', ARRAY['grain bowl', 'rice and protein bowl'], 1, 'bowl', 400, 500, 70, 22, 15, 'Prepared', 'Meal kits'),
    ('grilled-cheese', 'Grilled cheese', 'grilled cheese', 'Sandwich', 'cheese', ARRAY['grilled cheese sandwich', 'toasted cheese sandwich'], 1, 'sandwich', 140, 380, 32, 16, 21, 'Prepared', 'Ready meals'),
    ('tuna-sandwich', 'Tuna sandwich', 'tuna sandwich', 'Sandwich', 'tuna', ARRAY['tuna salad sandwich', 'tuna fish sandwich'], 1, 'sandwich', 220, 410, 35, 25, 18, 'Prepared', 'Ready meals'),
    ('pbj-sandwich', 'Peanut butter and jelly sandwich', 'peanut butter and jelly sandwich', 'Sandwich', 'peanuts', ARRAY['pbj', 'pb and j', 'peanut butter jelly sandwich'], 1, 'sandwich', 160, 390, 50, 14, 17, 'Prepared', 'Ready meals'),
    ('chicken-noodle-soup', 'Chicken noodle soup', 'chicken noodle soup', 'Soup', 'chicken', ARRAY['chicken soup', 'noodle soup with chicken'], 1, 'cup', 245, 130, 18, 8, 3, 'Prepared', 'Ready meals'),
    ('chili', 'Chili', 'chili', 'Chili', 'beans', ARRAY['beef chili', 'chili con carne'], 1, 'cup', 250, 300, 30, 22, 10, 'Prepared', 'Ready meals')
),
seed_rows AS (
  SELECT seed_foods.*,
    ('catalog:' || normalized_name || ':' || serving_grams::text) AS dedupe_key,
    jsonb_build_object(
      'canonical_key', canonical_key,
      'foodKey', canonical_key,
      'food_family', food_family,
      'canonical_food_name', food_family,
      'icon', jsonb_build_object('name', icon_name),
      'search_aliases', to_jsonb(search_aliases),
      'category', department || '|' || aisle,
      'browse', jsonb_build_array(jsonb_build_object('department', department, 'aisle', aisle)),
      'seed_version', 'shared_foods_v2',
      'data_quality', 'generic_estimate'
    ) AS seed_metadata
  FROM seed_foods
),
updated_foods AS (
  UPDATE public.foods AS food
  SET metadata = COALESCE(food.metadata, '{}'::jsonb) || seed_rows.seed_metadata ||
    jsonb_build_object(
      'browse', COALESCE(food.metadata->'browse', '[]'::jsonb) || seed_rows.seed_metadata->'browse'
    )
  FROM seed_rows
  WHERE food.created_by_user_id IS NULL
    AND food.normalized_name = seed_rows.normalized_name
    AND food.normalized_brand_name IS NULL
  RETURNING food.id
)
INSERT INTO public.foods (
  name, normalized_name, brand_name, normalized_brand_name, serving_size, serving_unit,
  serving_grams, calories, carbs_g, protein_g, fat_g, source, dedupe_key,
  created_by_user_id, is_active, metadata
)
SELECT
  name, normalized_name, NULL, NULL, serving_size, serving_unit, serving_grams,
  calories, carbs_g, protein_g, fat_g, 'catalog', dedupe_key, NULL, true, seed_metadata
FROM seed_rows
WHERE NOT EXISTS (
  SELECT 1 FROM public.foods AS food
  WHERE food.created_by_user_id IS NULL
    AND food.normalized_name = seed_rows.normalized_name
    AND food.normalized_brand_name IS NULL
);

COMMIT;
