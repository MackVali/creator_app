-- Create reusable Nutrition Meals without affecting logged meal events.

BEGIN;

CREATE TABLE IF NOT EXISTS public.meal_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name text NOT NULL,
  total_calories numeric NOT NULL DEFAULT 0,
  total_carbs_g numeric NOT NULL DEFAULT 0,
  total_protein_g numeric NOT NULL DEFAULT 0,
  total_fat_g numeric NOT NULL DEFAULT 0,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT meal_templates_name_not_blank CHECK (length(btrim(name)) > 0),
  CONSTRAINT meal_templates_totals_sane CHECK (
    total_calories >= 0 AND total_calories <= 100000
    AND total_carbs_g >= 0 AND total_carbs_g <= 100000
    AND total_protein_g >= 0 AND total_protein_g <= 100000
    AND total_fat_g >= 0 AND total_fat_g <= 100000
  )
);

CREATE TABLE IF NOT EXISTS public.meal_template_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  meal_template_id uuid NOT NULL REFERENCES public.meal_templates(id) ON DELETE CASCADE,
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
  CONSTRAINT meal_template_items_item_type_check CHECK (item_type IN ('food', 'recipe', 'custom')),
  CONSTRAINT meal_template_items_snapshot_name_not_blank CHECK (length(btrim(snapshot_name)) > 0),
  CONSTRAINT meal_template_items_custom_name_not_blank CHECK (
    custom_name IS NULL OR length(btrim(custom_name)) > 0
  ),
  CONSTRAINT meal_template_items_type_shape_check CHECK (
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
  CONSTRAINT meal_template_items_quantity_sane CHECK (quantity > 0 AND quantity <= 10000),
  CONSTRAINT meal_template_items_serving_grams_sane CHECK (
    serving_grams IS NULL OR (serving_grams > 0 AND serving_grams <= 5000)
  ),
  CONSTRAINT meal_template_items_snapshot_nutrition_sane CHECK (
    snapshot_calories >= 0 AND snapshot_calories <= 100000
    AND snapshot_carbs_g >= 0 AND snapshot_carbs_g <= 100000
    AND snapshot_protein_g >= 0 AND snapshot_protein_g <= 100000
    AND snapshot_fat_g >= 0 AND snapshot_fat_g <= 100000
  )
);

CREATE INDEX IF NOT EXISTS meal_templates_user_active_updated_idx
  ON public.meal_templates(user_id, is_active, updated_at DESC);

CREATE INDEX IF NOT EXISTS meal_template_items_template_sort_idx
  ON public.meal_template_items(meal_template_id, sort_order, created_at);

CREATE INDEX IF NOT EXISTS meal_template_items_food_idx
  ON public.meal_template_items(food_id)
  WHERE food_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS meal_template_items_recipe_idx
  ON public.meal_template_items(recipe_id)
  WHERE recipe_id IS NOT NULL;

DROP TRIGGER IF EXISTS meal_templates_set_updated_at ON public.meal_templates;
CREATE TRIGGER meal_templates_set_updated_at
  BEFORE UPDATE ON public.meal_templates
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS meal_template_items_set_updated_at ON public.meal_template_items;
CREATE TRIGGER meal_template_items_set_updated_at
  BEFORE UPDATE ON public.meal_template_items
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.meal_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.meal_template_items ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "meal_templates_select_own" ON public.meal_templates;
DROP POLICY IF EXISTS "meal_templates_insert_own" ON public.meal_templates;
DROP POLICY IF EXISTS "meal_templates_update_own" ON public.meal_templates;
DROP POLICY IF EXISTS "meal_templates_delete_own" ON public.meal_templates;

CREATE POLICY "meal_templates_select_own" ON public.meal_templates
  FOR SELECT TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY "meal_templates_insert_own" ON public.meal_templates
  FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "meal_templates_update_own" ON public.meal_templates
  FOR UPDATE TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "meal_templates_delete_own" ON public.meal_templates
  FOR DELETE TO authenticated
  USING (user_id = auth.uid());

DROP POLICY IF EXISTS "meal_template_items_select_own" ON public.meal_template_items;
DROP POLICY IF EXISTS "meal_template_items_insert_own" ON public.meal_template_items;
DROP POLICY IF EXISTS "meal_template_items_update_own" ON public.meal_template_items;
DROP POLICY IF EXISTS "meal_template_items_delete_own" ON public.meal_template_items;

CREATE POLICY "meal_template_items_select_own" ON public.meal_template_items
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.meal_templates
      WHERE meal_templates.id = meal_template_items.meal_template_id
        AND meal_templates.user_id = auth.uid()
    )
  );

CREATE POLICY "meal_template_items_insert_own" ON public.meal_template_items
  FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.meal_templates
      WHERE meal_templates.id = meal_template_items.meal_template_id
        AND meal_templates.user_id = auth.uid()
    )
    AND (
      recipe_id IS NULL
      OR EXISTS (
        SELECT 1
        FROM public.recipes
        WHERE recipes.id = meal_template_items.recipe_id
          AND recipes.user_id = auth.uid()
      )
    )
  );

CREATE POLICY "meal_template_items_update_own" ON public.meal_template_items
  FOR UPDATE TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.meal_templates
      WHERE meal_templates.id = meal_template_items.meal_template_id
        AND meal_templates.user_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.meal_templates
      WHERE meal_templates.id = meal_template_items.meal_template_id
        AND meal_templates.user_id = auth.uid()
    )
    AND (
      recipe_id IS NULL
      OR EXISTS (
        SELECT 1
        FROM public.recipes
        WHERE recipes.id = meal_template_items.recipe_id
          AND recipes.user_id = auth.uid()
      )
    )
  );

CREATE POLICY "meal_template_items_delete_own" ON public.meal_template_items
  FOR DELETE TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.meal_templates
      WHERE meal_templates.id = meal_template_items.meal_template_id
        AND meal_templates.user_id = auth.uid()
    )
  );

REVOKE ALL ON public.meal_templates FROM anon, authenticated;
REVOKE ALL ON public.meal_template_items FROM anon, authenticated;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.meal_templates TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.meal_template_items TO authenticated;
GRANT ALL ON public.meal_templates TO service_role;
GRANT ALL ON public.meal_template_items TO service_role;

COMMIT;
