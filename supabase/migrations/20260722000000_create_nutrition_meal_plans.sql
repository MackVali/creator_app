-- RETAINED FOR REPOSITORY HISTORY. Do not manually run this file on VALI-v19.
-- Manual installation uses supabase/manual/20260722_install_complete_nutrition_meal_plan.sql.
-- Shared Grocery/Nutrition plans. Planned items remain separate from consumed meals.
BEGIN;

CREATE TABLE public.meal_plan_days (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  creator_day_date date NOT NULL,
  timezone text NOT NULL,
  timezone_source text NOT NULL,
  boundary_hour smallint NOT NULL DEFAULT 4,
  starts_at timestamptz NOT NULL,
  ends_at timestamptz NOT NULL,
  planning_mode text NOT NULL DEFAULT 'flexible',
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT meal_plan_days_user_date_unique UNIQUE (user_id, creator_day_date),
  CONSTRAINT meal_plan_days_timezone_not_blank CHECK (length(btrim(timezone)) > 0),
  CONSTRAINT meal_plan_days_timezone_source_check CHECK (timezone_source IN ('profile', 'device', 'utc')),
  CONSTRAINT meal_plan_days_boundary_check CHECK (boundary_hour = 4),
  CONSTRAINT meal_plan_days_interval_check CHECK (ends_at > starts_at),
  CONSTRAINT meal_plan_days_mode_check CHECK (planning_mode IN ('flexible', 'scheduled'))
);

CREATE TABLE public.meal_plan_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  meal_plan_day_id uuid NOT NULL REFERENCES public.meal_plan_days(id) ON DELETE CASCADE,
  position integer NOT NULL DEFAULT 0,
  label text NOT NULL,
  meal_type text,
  planned_time time,
  status text NOT NULL DEFAULT 'planned',
  servings numeric NOT NULL DEFAULT 1,
  food_id uuid REFERENCES public.foods(id) ON DELETE SET NULL,
  meal_template_id uuid REFERENCES public.meal_templates(id) ON DELETE SET NULL,
  recipe_id uuid REFERENCES public.recipes(id) ON DELETE SET NULL,
  nutrition_snapshot jsonb NOT NULL DEFAULT '{}'::jsonb,
  source_surface text NOT NULL,
  consumed_meal_id uuid REFERENCES public.meals(id) ON DELETE SET NULL,
  grocery_depletion_status text NOT NULL DEFAULT 'not_applicable',
  grocery_depletion_attempted_at timestamptz,
  grocery_depleted_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT meal_plan_items_position_check CHECK (position >= 0),
  CONSTRAINT meal_plan_items_label_not_blank CHECK (length(btrim(label)) > 0),
  CONSTRAINT meal_plan_items_status_check CHECK (status IN ('planned', 'logged', 'partially_logged', 'skipped')),
  CONSTRAINT meal_plan_items_servings_check CHECK (servings > 0 AND servings <= 10000),
  CONSTRAINT meal_plan_items_surface_check CHECK (source_surface IN ('grocery', 'nutrition')),
  CONSTRAINT meal_plan_items_depletion_status_check CHECK (grocery_depletion_status IN ('not_applicable', 'pending', 'completed', 'failed'))
);

CREATE INDEX meal_plan_days_user_date_idx ON public.meal_plan_days(user_id, creator_day_date);
CREATE INDEX meal_plan_items_day_position_idx ON public.meal_plan_items(meal_plan_day_id, position, created_at);
CREATE INDEX meal_plan_items_day_status_idx ON public.meal_plan_items(meal_plan_day_id, status);

CREATE TRIGGER meal_plan_days_set_updated_at BEFORE UPDATE ON public.meal_plan_days
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER meal_plan_items_set_updated_at BEFORE UPDATE ON public.meal_plan_items
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.meal_plan_days ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.meal_plan_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "meal_plan_days_select_own" ON public.meal_plan_days FOR SELECT TO authenticated USING (user_id = auth.uid());
CREATE POLICY "meal_plan_days_insert_own" ON public.meal_plan_days FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());
CREATE POLICY "meal_plan_days_update_own" ON public.meal_plan_days FOR UPDATE TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
CREATE POLICY "meal_plan_days_delete_own" ON public.meal_plan_days FOR DELETE TO authenticated USING (user_id = auth.uid());

CREATE POLICY "meal_plan_items_select_own" ON public.meal_plan_items FOR SELECT TO authenticated USING (
  EXISTS (SELECT 1 FROM public.meal_plan_days d WHERE d.id = meal_plan_day_id AND d.user_id = auth.uid())
);
CREATE POLICY "meal_plan_items_insert_own" ON public.meal_plan_items FOR INSERT TO authenticated WITH CHECK (
  EXISTS (SELECT 1 FROM public.meal_plan_days d WHERE d.id = meal_plan_day_id AND d.user_id = auth.uid())
  AND (meal_template_id IS NULL OR EXISTS (SELECT 1 FROM public.meal_templates t WHERE t.id = meal_template_id AND t.user_id = auth.uid()))
  AND (recipe_id IS NULL OR EXISTS (SELECT 1 FROM public.recipes r WHERE r.id = recipe_id AND r.user_id = auth.uid()))
);
CREATE POLICY "meal_plan_items_update_own" ON public.meal_plan_items FOR UPDATE TO authenticated USING (
  EXISTS (SELECT 1 FROM public.meal_plan_days d WHERE d.id = meal_plan_day_id AND d.user_id = auth.uid())
) WITH CHECK (
  EXISTS (SELECT 1 FROM public.meal_plan_days d WHERE d.id = meal_plan_day_id AND d.user_id = auth.uid())
  AND (meal_template_id IS NULL OR EXISTS (SELECT 1 FROM public.meal_templates t WHERE t.id = meal_template_id AND t.user_id = auth.uid()))
  AND (recipe_id IS NULL OR EXISTS (SELECT 1 FROM public.recipes r WHERE r.id = recipe_id AND r.user_id = auth.uid()))
);
CREATE POLICY "meal_plan_items_delete_own" ON public.meal_plan_items FOR DELETE TO authenticated USING (
  EXISTS (SELECT 1 FROM public.meal_plan_days d WHERE d.id = meal_plan_day_id AND d.user_id = auth.uid())
);

REVOKE ALL ON public.meal_plan_days, public.meal_plan_items FROM anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.meal_plan_days, public.meal_plan_items TO authenticated;
GRANT ALL ON public.meal_plan_days, public.meal_plan_items TO service_role;

-- Claiming the plan item, expanding its authoritative snapshot, creating the
-- consumed meal, and linking both records are one transaction. A terminated
-- request therefore cannot leave a false claim or an unlinked consumed meal.
CREATE FUNCTION public.log_meal_plan_item(p_item_id uuid, p_occurred_at timestamptz DEFAULT now())
RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_item public.meal_plan_items;
  v_day public.meal_plan_days;
  v_items jsonb;
  v_meal public.meals;
  v_has_deductions boolean;
BEGIN
  SELECT i.* INTO v_item
  FROM public.meal_plan_items i
  JOIN public.meal_plan_days d ON d.id = i.meal_plan_day_id
  WHERE i.id = p_item_id AND d.user_id = auth.uid()
  FOR UPDATE OF i;

  IF NOT FOUND THEN RAISE EXCEPTION 'Planned item not found' USING ERRCODE = 'P0002'; END IF;
  IF v_item.status = 'logged' AND v_item.consumed_meal_id IS NOT NULL THEN
    RETURN jsonb_build_object('meal_id', v_item.consumed_meal_id, 'already_logged', true);
  END IF;
  IF v_item.status <> 'planned' THEN RAISE EXCEPTION 'Planned item is not available to log' USING ERRCODE = '55000'; END IF;
  IF jsonb_typeof(v_item.nutrition_snapshot->'items') <> 'array' OR jsonb_array_length(v_item.nutrition_snapshot->'items') = 0 THEN
    RAISE EXCEPTION 'Planned item has no loggable nutrition snapshot' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO v_day FROM public.meal_plan_days WHERE id = v_item.meal_plan_day_id;
  SELECT jsonb_agg(
    component.value || jsonb_build_object(
      'quantity', COALESCE((component.value->>'quantity')::numeric, 1) * v_item.servings,
      'snapshot_calories', COALESCE((component.value->>'snapshot_calories')::numeric, 0) * v_item.servings,
      'snapshot_carbs_g', COALESCE((component.value->>'snapshot_carbs_g')::numeric, 0) * v_item.servings,
      'snapshot_protein_g', COALESCE((component.value->>'snapshot_protein_g')::numeric, 0) * v_item.servings,
      'snapshot_fat_g', COALESCE((component.value->>'snapshot_fat_g')::numeric, 0) * v_item.servings,
      'metadata', COALESCE(component.value->'metadata', '{}'::jsonb) || jsonb_build_object('source', 'meal-plan', 'mealPlanItemId', v_item.id)
    ) ORDER BY component.ordinality
  ) INTO v_items
  FROM jsonb_array_elements(v_item.nutrition_snapshot->'items') WITH ORDINALITY component(value, ordinality);

  SELECT * INTO v_meal FROM public.create_nutrition_meal(
    jsonb_build_object('occurred_at', p_occurred_at, 'timezone', v_day.timezone, 'name', v_item.label, 'metadata', jsonb_build_object('source', 'meal-plan', 'mealPlanItemId', v_item.id)),
    v_items
  );
  v_has_deductions := jsonb_typeof(v_item.nutrition_snapshot->'grocery_deductions') = 'array' AND jsonb_array_length(v_item.nutrition_snapshot->'grocery_deductions') > 0;
  UPDATE public.meal_plan_items SET status = 'logged', consumed_meal_id = v_meal.id,
    grocery_depletion_status = CASE WHEN v_has_deductions THEN 'pending' ELSE 'not_applicable' END
  WHERE id = v_item.id;
  RETURN jsonb_build_object('meal_id', v_meal.id, 'already_logged', false);
END;
$$;

REVOKE ALL ON FUNCTION public.log_meal_plan_item(uuid, timestamptz) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.log_meal_plan_item(uuid, timestamptz) TO authenticated, service_role;

-- food_resources is a linked-project table whose historical baseline is being
-- repaired separately. Dynamic SQL avoids making this migration's creation
-- depend on that missing history while keeping each real depletion and its
-- durable completion marker in one transaction at runtime.
CREATE FUNCTION public.deplete_logged_meal_plan_item(p_item_id uuid)
RETURNS text
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_item public.meal_plan_items;
  v_deduction jsonb;
  v_updated uuid;
BEGIN
  SELECT i.* INTO v_item FROM public.meal_plan_items i
  JOIN public.meal_plan_days d ON d.id = i.meal_plan_day_id
  WHERE i.id = p_item_id AND d.user_id = auth.uid()
  FOR UPDATE OF i;
  IF NOT FOUND THEN RAISE EXCEPTION 'Planned item not found' USING ERRCODE = 'P0002'; END IF;
  IF v_item.status <> 'logged' THEN RAISE EXCEPTION 'Planned item is not logged' USING ERRCODE = '55000'; END IF;
  IF v_item.grocery_depletion_status IN ('completed', 'not_applicable') THEN RETURN v_item.grocery_depletion_status; END IF;

  FOR v_deduction IN SELECT value FROM jsonb_array_elements(v_item.nutrition_snapshot->'grocery_deductions') LOOP
    EXECUTE 'UPDATE public.food_resources SET quantity = greatest(0, coalesce(quantity, 0) - $1), updated_at = now() WHERE id = $2 AND user_id = auth.uid() AND unit = $3 RETURNING id'
      INTO v_updated
      USING (v_deduction->>'amount')::numeric * v_item.servings, (v_deduction->>'food_resource_id')::uuid, v_deduction->>'unit';
    IF v_updated IS NULL THEN RAISE EXCEPTION 'Grocery item unavailable for depletion' USING ERRCODE = 'P0002'; END IF;
    v_updated := NULL;
  END LOOP;
  UPDATE public.meal_plan_items SET grocery_depletion_status = 'completed', grocery_depletion_attempted_at = now(), grocery_depleted_at = now() WHERE id = v_item.id;
  RETURN 'completed';
EXCEPTION WHEN OTHERS THEN
  -- The transaction rolls back quantities. The pending marker remains durable
  -- and the API may safely retry the entire operation.
  RAISE;
END;
$$;

REVOKE ALL ON FUNCTION public.deplete_logged_meal_plan_item(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.deplete_logged_meal_plan_item(uuid) TO authenticated, service_role;

COMMIT;
