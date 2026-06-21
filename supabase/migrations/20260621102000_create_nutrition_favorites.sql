CREATE TABLE IF NOT EXISTS public.nutrition_favorites (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  item_type text NOT NULL,
  item_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT nutrition_favorites_item_type_check
    CHECK (item_type IN ('food', 'recipe', 'meal_template')),
  CONSTRAINT nutrition_favorites_user_item_unique
    UNIQUE (user_id, item_type, item_id)
);

CREATE INDEX IF NOT EXISTS nutrition_favorites_user_created_idx
  ON public.nutrition_favorites(user_id, created_at DESC);

ALTER TABLE public.nutrition_favorites ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "nutrition_favorites_select_own" ON public.nutrition_favorites;
DROP POLICY IF EXISTS "nutrition_favorites_insert_own" ON public.nutrition_favorites;
DROP POLICY IF EXISTS "nutrition_favorites_delete_own" ON public.nutrition_favorites;

CREATE POLICY "nutrition_favorites_select_own" ON public.nutrition_favorites
  FOR SELECT TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY "nutrition_favorites_insert_own" ON public.nutrition_favorites
  FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "nutrition_favorites_delete_own" ON public.nutrition_favorites
  FOR DELETE TO authenticated
  USING (user_id = auth.uid());

REVOKE ALL ON public.nutrition_favorites FROM anon, authenticated;
GRANT SELECT, INSERT, DELETE ON public.nutrition_favorites TO authenticated;
GRANT ALL ON public.nutrition_favorites TO service_role;
