-- Create the first real CREATOR Nutrition data model foundation.

BEGIN;

CREATE TABLE IF NOT EXISTS public.recipes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name text NOT NULL,
  description text,
  servings numeric NOT NULL DEFAULT 1,
  total_calories numeric NOT NULL DEFAULT 0,
  total_carbs_g numeric NOT NULL DEFAULT 0,
  total_protein_g numeric NOT NULL DEFAULT 0,
  total_fat_g numeric NOT NULL DEFAULT 0,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT recipes_name_not_blank CHECK (length(btrim(name)) > 0),
  CONSTRAINT recipes_servings_sane CHECK (servings > 0 AND servings <= 10000),
  CONSTRAINT recipes_totals_sane CHECK (
    total_calories >= 0 AND total_calories <= 100000
    AND total_carbs_g >= 0 AND total_carbs_g <= 100000
    AND total_protein_g >= 0 AND total_protein_g <= 100000
    AND total_fat_g >= 0 AND total_fat_g <= 100000
  )
);

CREATE TABLE IF NOT EXISTS public.recipe_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  recipe_id uuid NOT NULL REFERENCES public.recipes(id) ON DELETE CASCADE,
  item_type text NOT NULL DEFAULT 'food',
  food_id uuid REFERENCES public.foods(id) ON DELETE SET NULL,
  custom_name text,
  quantity numeric NOT NULL DEFAULT 1,
  serving_unit text,
  serving_grams numeric,
  snapshot_name text NOT NULL,
  snapshot_brand_name text,
  snapshot_calories numeric NOT NULL DEFAULT 0,
  snapshot_carbs_g numeric NOT NULL DEFAULT 0,
  snapshot_protein_g numeric NOT NULL DEFAULT 0,
  snapshot_fat_g numeric NOT NULL DEFAULT 0,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT recipe_items_item_type_check CHECK (item_type IN ('food', 'custom')),
  CONSTRAINT recipe_items_snapshot_name_not_blank CHECK (length(btrim(snapshot_name)) > 0),
  CONSTRAINT recipe_items_custom_name_not_blank CHECK (
    custom_name IS NULL OR length(btrim(custom_name)) > 0
  ),
  CONSTRAINT recipe_items_type_shape_check CHECK (
    (
      item_type = 'food'
      AND custom_name IS NULL
    )
    OR (
      item_type = 'custom'
      AND food_id IS NULL
      AND custom_name IS NOT NULL
    )
  ),
  CONSTRAINT recipe_items_quantity_sane CHECK (quantity > 0 AND quantity <= 10000),
  CONSTRAINT recipe_items_serving_grams_sane CHECK (
    serving_grams IS NULL OR (serving_grams > 0 AND serving_grams <= 5000)
  ),
  CONSTRAINT recipe_items_snapshot_nutrition_sane CHECK (
    snapshot_calories >= 0 AND snapshot_calories <= 100000
    AND snapshot_carbs_g >= 0 AND snapshot_carbs_g <= 100000
    AND snapshot_protein_g >= 0 AND snapshot_protein_g <= 100000
    AND snapshot_fat_g >= 0 AND snapshot_fat_g <= 100000
  )
);

CREATE TABLE IF NOT EXISTS public.meals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  occurred_at timestamptz NOT NULL,
  timezone text NOT NULL DEFAULT 'UTC',
  name text,
  note text,
  source_note_id uuid REFERENCES public.notes(id) ON DELETE SET NULL,
  source_note_entry_id text,
  habit_id uuid REFERENCES public.habits(id) ON DELETE SET NULL,
  total_calories numeric NOT NULL DEFAULT 0,
  total_carbs_g numeric NOT NULL DEFAULT 0,
  total_protein_g numeric NOT NULL DEFAULT 0,
  total_fat_g numeric NOT NULL DEFAULT 0,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  deleted_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT meals_timezone_not_blank CHECK (length(btrim(timezone)) > 0),
  CONSTRAINT meals_name_not_blank CHECK (name IS NULL OR length(btrim(name)) > 0),
  CONSTRAINT meals_totals_sane CHECK (
    total_calories >= 0 AND total_calories <= 100000
    AND total_carbs_g >= 0 AND total_carbs_g <= 100000
    AND total_protein_g >= 0 AND total_protein_g <= 100000
    AND total_fat_g >= 0 AND total_fat_g <= 100000
  )
);

CREATE TABLE IF NOT EXISTS public.meal_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  meal_id uuid NOT NULL REFERENCES public.meals(id) ON DELETE CASCADE,
  item_type text NOT NULL,
  food_id uuid REFERENCES public.foods(id) ON DELETE SET NULL,
  recipe_id uuid REFERENCES public.recipes(id) ON DELETE SET NULL,
  custom_name text,
  quantity numeric NOT NULL DEFAULT 1,
  serving_unit text,
  serving_grams numeric,
  snapshot_name text NOT NULL,
  snapshot_brand_name text,
  snapshot_calories numeric NOT NULL DEFAULT 0,
  snapshot_carbs_g numeric NOT NULL DEFAULT 0,
  snapshot_protein_g numeric NOT NULL DEFAULT 0,
  snapshot_fat_g numeric NOT NULL DEFAULT 0,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT meal_items_item_type_check CHECK (item_type IN ('food', 'recipe', 'custom')),
  CONSTRAINT meal_items_snapshot_name_not_blank CHECK (length(btrim(snapshot_name)) > 0),
  CONSTRAINT meal_items_custom_name_not_blank CHECK (
    custom_name IS NULL OR length(btrim(custom_name)) > 0
  ),
  CONSTRAINT meal_items_type_shape_check CHECK (
    (
      item_type = 'food'
      AND recipe_id IS NULL
      AND custom_name IS NULL
    )
    OR (
      item_type = 'recipe'
      AND food_id IS NULL
      AND custom_name IS NULL
    )
    OR (
      item_type = 'custom'
      AND food_id IS NULL
      AND recipe_id IS NULL
      AND custom_name IS NOT NULL
    )
  ),
  CONSTRAINT meal_items_quantity_sane CHECK (quantity > 0 AND quantity <= 10000),
  CONSTRAINT meal_items_serving_grams_sane CHECK (
    serving_grams IS NULL OR (serving_grams > 0 AND serving_grams <= 5000)
  ),
  CONSTRAINT meal_items_snapshot_nutrition_sane CHECK (
    snapshot_calories >= 0 AND snapshot_calories <= 100000
    AND snapshot_carbs_g >= 0 AND snapshot_carbs_g <= 100000
    AND snapshot_protein_g >= 0 AND snapshot_protein_g <= 100000
    AND snapshot_fat_g >= 0 AND snapshot_fat_g <= 100000
  )
);

CREATE INDEX IF NOT EXISTS recipes_user_active_name_idx
  ON public.recipes(user_id, is_active, name);

CREATE INDEX IF NOT EXISTS recipe_items_recipe_sort_idx
  ON public.recipe_items(recipe_id, sort_order, created_at);

CREATE INDEX IF NOT EXISTS recipe_items_food_idx
  ON public.recipe_items(food_id)
  WHERE food_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS meals_user_occurred_at_idx
  ON public.meals(user_id, occurred_at DESC)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS meals_user_created_at_idx
  ON public.meals(user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS meals_source_note_idx
  ON public.meals(source_note_id)
  WHERE source_note_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS meals_habit_idx
  ON public.meals(habit_id)
  WHERE habit_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS meal_items_meal_sort_idx
  ON public.meal_items(meal_id, sort_order, created_at);

CREATE INDEX IF NOT EXISTS meal_items_food_idx
  ON public.meal_items(food_id)
  WHERE food_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS meal_items_recipe_idx
  ON public.meal_items(recipe_id)
  WHERE recipe_id IS NOT NULL;

DROP TRIGGER IF EXISTS recipes_set_updated_at ON public.recipes;
CREATE TRIGGER recipes_set_updated_at
  BEFORE UPDATE ON public.recipes
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS recipe_items_set_updated_at ON public.recipe_items;
CREATE TRIGGER recipe_items_set_updated_at
  BEFORE UPDATE ON public.recipe_items
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS meals_set_updated_at ON public.meals;
CREATE TRIGGER meals_set_updated_at
  BEFORE UPDATE ON public.meals
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS meal_items_set_updated_at ON public.meal_items;
CREATE TRIGGER meal_items_set_updated_at
  BEFORE UPDATE ON public.meal_items
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.recipes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.recipe_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.meals ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.meal_items ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "recipes_select_own" ON public.recipes;
DROP POLICY IF EXISTS "recipes_insert_own" ON public.recipes;
DROP POLICY IF EXISTS "recipes_update_own" ON public.recipes;
DROP POLICY IF EXISTS "recipes_delete_own" ON public.recipes;

CREATE POLICY "recipes_select_own" ON public.recipes
  FOR SELECT TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY "recipes_insert_own" ON public.recipes
  FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "recipes_update_own" ON public.recipes
  FOR UPDATE TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "recipes_delete_own" ON public.recipes
  FOR DELETE TO authenticated
  USING (user_id = auth.uid());

DROP POLICY IF EXISTS "recipe_items_select_own" ON public.recipe_items;
DROP POLICY IF EXISTS "recipe_items_insert_own" ON public.recipe_items;
DROP POLICY IF EXISTS "recipe_items_update_own" ON public.recipe_items;
DROP POLICY IF EXISTS "recipe_items_delete_own" ON public.recipe_items;

CREATE POLICY "recipe_items_select_own" ON public.recipe_items
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.recipes
      WHERE recipes.id = recipe_items.recipe_id
        AND recipes.user_id = auth.uid()
    )
  );

CREATE POLICY "recipe_items_insert_own" ON public.recipe_items
  FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.recipes
      WHERE recipes.id = recipe_items.recipe_id
        AND recipes.user_id = auth.uid()
    )
  );

CREATE POLICY "recipe_items_update_own" ON public.recipe_items
  FOR UPDATE TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.recipes
      WHERE recipes.id = recipe_items.recipe_id
        AND recipes.user_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.recipes
      WHERE recipes.id = recipe_items.recipe_id
        AND recipes.user_id = auth.uid()
    )
  );

CREATE POLICY "recipe_items_delete_own" ON public.recipe_items
  FOR DELETE TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.recipes
      WHERE recipes.id = recipe_items.recipe_id
        AND recipes.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "meals_select_own" ON public.meals;
DROP POLICY IF EXISTS "meals_insert_own" ON public.meals;
DROP POLICY IF EXISTS "meals_update_own" ON public.meals;
DROP POLICY IF EXISTS "meals_delete_own" ON public.meals;

CREATE POLICY "meals_select_own" ON public.meals
  FOR SELECT TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY "meals_insert_own" ON public.meals
  FOR INSERT TO authenticated
  WITH CHECK (
    user_id = auth.uid()
    AND (
      source_note_id IS NULL
      OR EXISTS (
        SELECT 1
        FROM public.notes
        WHERE notes.id = meals.source_note_id
          AND notes.user_id = auth.uid()
      )
    )
    AND (
      habit_id IS NULL
      OR EXISTS (
        SELECT 1
        FROM public.habits
        WHERE habits.id = meals.habit_id
          AND habits.user_id = auth.uid()
      )
    )
  );

CREATE POLICY "meals_update_own" ON public.meals
  FOR UPDATE TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (
    user_id = auth.uid()
    AND (
      source_note_id IS NULL
      OR EXISTS (
        SELECT 1
        FROM public.notes
        WHERE notes.id = meals.source_note_id
          AND notes.user_id = auth.uid()
      )
    )
    AND (
      habit_id IS NULL
      OR EXISTS (
        SELECT 1
        FROM public.habits
        WHERE habits.id = meals.habit_id
          AND habits.user_id = auth.uid()
      )
    )
  );

CREATE POLICY "meals_delete_own" ON public.meals
  FOR DELETE TO authenticated
  USING (user_id = auth.uid());

DROP POLICY IF EXISTS "meal_items_select_own" ON public.meal_items;
DROP POLICY IF EXISTS "meal_items_insert_own" ON public.meal_items;
DROP POLICY IF EXISTS "meal_items_update_own" ON public.meal_items;
DROP POLICY IF EXISTS "meal_items_delete_own" ON public.meal_items;

CREATE POLICY "meal_items_select_own" ON public.meal_items
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.meals
      WHERE meals.id = meal_items.meal_id
        AND meals.user_id = auth.uid()
    )
  );

CREATE POLICY "meal_items_insert_own" ON public.meal_items
  FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.meals
      WHERE meals.id = meal_items.meal_id
        AND meals.user_id = auth.uid()
    )
    AND (
      recipe_id IS NULL
      OR EXISTS (
        SELECT 1
        FROM public.recipes
        WHERE recipes.id = meal_items.recipe_id
          AND recipes.user_id = auth.uid()
      )
    )
  );

CREATE POLICY "meal_items_update_own" ON public.meal_items
  FOR UPDATE TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.meals
      WHERE meals.id = meal_items.meal_id
        AND meals.user_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.meals
      WHERE meals.id = meal_items.meal_id
        AND meals.user_id = auth.uid()
    )
    AND (
      recipe_id IS NULL
      OR EXISTS (
        SELECT 1
        FROM public.recipes
        WHERE recipes.id = meal_items.recipe_id
          AND recipes.user_id = auth.uid()
      )
    )
  );

CREATE POLICY "meal_items_delete_own" ON public.meal_items
  FOR DELETE TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.meals
      WHERE meals.id = meal_items.meal_id
        AND meals.user_id = auth.uid()
    )
  );

DROP FUNCTION IF EXISTS public.create_nutrition_meal(jsonb, jsonb);

CREATE FUNCTION public.create_nutrition_meal(
  p_meal jsonb,
  p_items jsonb
)
RETURNS public.meals
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_meal_id uuid;
  v_meal public.meals;
  v_total_calories numeric := 0;
  v_total_carbs_g numeric := 0;
  v_total_protein_g numeric := 0;
  v_total_fat_g numeric := 0;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated' USING ERRCODE = '28000';
  END IF;

  IF p_meal IS NULL OR jsonb_typeof(p_meal) <> 'object' THEN
    RAISE EXCEPTION 'Meal payload must be an object' USING ERRCODE = '22023';
  END IF;

  IF p_items IS NULL OR jsonb_typeof(p_items) <> 'array' OR jsonb_array_length(p_items) = 0 THEN
    RAISE EXCEPTION 'Meal must include at least one item' USING ERRCODE = '22023';
  END IF;

  SELECT
    COALESCE(sum(COALESCE((item.value->>'snapshot_calories')::numeric, 0)), 0),
    COALESCE(sum(COALESCE((item.value->>'snapshot_carbs_g')::numeric, 0)), 0),
    COALESCE(sum(COALESCE((item.value->>'snapshot_protein_g')::numeric, 0)), 0),
    COALESCE(sum(COALESCE((item.value->>'snapshot_fat_g')::numeric, 0)), 0)
  INTO v_total_calories, v_total_carbs_g, v_total_protein_g, v_total_fat_g
  FROM jsonb_array_elements(p_items) AS item(value);

  INSERT INTO public.meals (
    user_id,
    occurred_at,
    timezone,
    name,
    note,
    source_note_id,
    source_note_entry_id,
    habit_id,
    total_calories,
    total_carbs_g,
    total_protein_g,
    total_fat_g,
    metadata
  )
  VALUES (
    v_user_id,
    (p_meal->>'occurred_at')::timestamptz,
    COALESCE(NULLIF(btrim(p_meal->>'timezone'), ''), 'UTC'),
    NULLIF(btrim(p_meal->>'name'), ''),
    NULLIF(btrim(p_meal->>'note'), ''),
    NULLIF(p_meal->>'source_note_id', '')::uuid,
    NULLIF(btrim(p_meal->>'source_note_entry_id'), ''),
    NULLIF(p_meal->>'habit_id', '')::uuid,
    v_total_calories,
    v_total_carbs_g,
    v_total_protein_g,
    v_total_fat_g,
    COALESCE(p_meal->'metadata', '{}'::jsonb)
  )
  RETURNING id INTO v_meal_id;

  INSERT INTO public.meal_items (
    meal_id,
    item_type,
    food_id,
    recipe_id,
    custom_name,
    quantity,
    serving_unit,
    serving_grams,
    snapshot_name,
    snapshot_brand_name,
    snapshot_calories,
    snapshot_carbs_g,
    snapshot_protein_g,
    snapshot_fat_g,
    metadata,
    sort_order
  )
  SELECT
    v_meal_id,
    item.value->>'item_type',
    NULLIF(item.value->>'food_id', '')::uuid,
    NULLIF(item.value->>'recipe_id', '')::uuid,
    NULLIF(btrim(item.value->>'custom_name'), ''),
    COALESCE(NULLIF(item.value->>'quantity', '')::numeric, 1),
    NULLIF(btrim(item.value->>'serving_unit'), ''),
    NULLIF(item.value->>'serving_grams', '')::numeric,
    COALESCE(NULLIF(btrim(item.value->>'snapshot_name'), ''), 'Food'),
    NULLIF(btrim(item.value->>'snapshot_brand_name'), ''),
    COALESCE(NULLIF(item.value->>'snapshot_calories', '')::numeric, 0),
    COALESCE(NULLIF(item.value->>'snapshot_carbs_g', '')::numeric, 0),
    COALESCE(NULLIF(item.value->>'snapshot_protein_g', '')::numeric, 0),
    COALESCE(NULLIF(item.value->>'snapshot_fat_g', '')::numeric, 0),
    COALESCE(item.value->'metadata', '{}'::jsonb),
    COALESCE(NULLIF(item.value->>'sort_order', '')::integer, item.ordinality - 1)
  FROM jsonb_array_elements(p_items) WITH ORDINALITY AS item(value, ordinality);

  SELECT *
  INTO v_meal
  FROM public.meals
  WHERE id = v_meal_id;

  RETURN v_meal;
END;
$$;

REVOKE ALL ON public.recipes FROM anon, authenticated;
REVOKE ALL ON public.recipe_items FROM anon, authenticated;
REVOKE ALL ON public.meals FROM anon, authenticated;
REVOKE ALL ON public.meal_items FROM anon, authenticated;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.recipes TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.recipe_items TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.meals TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.meal_items TO authenticated;
GRANT ALL ON public.recipes TO service_role;
GRANT ALL ON public.recipe_items TO service_role;
GRANT ALL ON public.meals TO service_role;
GRANT ALL ON public.meal_items TO service_role;

REVOKE ALL ON FUNCTION public.create_nutrition_meal(jsonb, jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.create_nutrition_meal(jsonb, jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.create_nutrition_meal(jsonb, jsonb) TO service_role;

COMMIT;
