-- RETAINED FOR REPOSITORY HISTORY. Do not manually run this file on VALI-v19.
-- Manual installation uses supabase/manual/20260722_install_complete_nutrition_meal_plan.sql.
-- Phase 1C: make Grocery depletion progress durable and retryable.
BEGIN;

ALTER TABLE public.meal_plan_items
  ADD COLUMN IF NOT EXISTS grocery_depletion_results jsonb NOT NULL DEFAULT '[]'::jsonb;

CREATE OR REPLACE FUNCTION public.log_meal_plan_item(p_item_id uuid, p_occurred_at timestamptz DEFAULT now())
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
  v_depletion_results jsonb;
BEGIN
  SELECT i.* INTO v_item
  FROM public.meal_plan_items i
  JOIN public.meal_plan_days d ON d.id = i.meal_plan_day_id
  WHERE i.id = p_item_id AND d.user_id = auth.uid()
  FOR UPDATE OF i;

  IF NOT FOUND THEN RAISE EXCEPTION 'Planned item not found' USING ERRCODE = 'P0002'; END IF;

  v_has_deductions := jsonb_typeof(v_item.nutrition_snapshot->'grocery_deductions') = 'array'
    AND jsonb_array_length(v_item.nutrition_snapshot->'grocery_deductions') > 0;

  -- A stored consumed meal is authoritative. This also repairs Phase 1 rows
  -- that were left logged with pending Grocery work.
  IF v_item.consumed_meal_id IS NOT NULL THEN
    IF v_has_deductions AND v_item.grocery_depletion_status NOT IN ('completed', 'not_applicable') THEN
      UPDATE public.meal_plan_items
      SET status = 'partially_logged'
      WHERE id = v_item.id AND status <> 'partially_logged';
      RETURN jsonb_build_object(
        'meal_id', v_item.consumed_meal_id,
      'already_logged', false,
      'retry_required', true,
      'initial_log', false,
      'result', 'partially_logged'
      );
    END IF;
    RETURN jsonb_build_object(
      'meal_id', v_item.consumed_meal_id,
      'already_logged', true,
      'retry_required', false,
      'initial_log', false,
      'result', 'already_logged'
    );
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

  -- If creation raises, this transaction retains no meal id and the locked
  -- item remains planned.
  SELECT * INTO v_meal FROM public.create_nutrition_meal(
    jsonb_build_object('occurred_at', p_occurred_at, 'timezone', v_day.timezone, 'name', v_item.label, 'metadata', jsonb_build_object('source', 'meal-plan', 'mealPlanItemId', v_item.id)),
    v_items
  );

  IF v_has_deductions THEN
    SELECT jsonb_agg(jsonb_build_object(
      'index', deduction.ordinality - 1,
      'food_resource_id', deduction.value->>'food_resource_id',
      'amount', deduction.value->'amount',
      'unit', deduction.value->>'unit',
      'status', 'pending',
      'attempt_count', 0,
      'diagnostics', '[]'::jsonb
    ) ORDER BY deduction.ordinality)
    INTO v_depletion_results
    FROM jsonb_array_elements(v_item.nutrition_snapshot->'grocery_deductions') WITH ORDINALITY deduction(value, ordinality);
  ELSE
    v_depletion_results := '[]'::jsonb;
  END IF;

  UPDATE public.meal_plan_items
  SET status = CASE WHEN v_has_deductions THEN 'partially_logged' ELSE 'logged' END,
      consumed_meal_id = v_meal.id,
      grocery_depletion_status = CASE WHEN v_has_deductions THEN 'pending' ELSE 'not_applicable' END,
      grocery_depletion_results = v_depletion_results
  WHERE id = v_item.id;

  RETURN jsonb_build_object(
    'meal_id', v_meal.id,
    'already_logged', false,
    'retry_required', v_has_deductions,
    'initial_log', true,
    'result', CASE WHEN v_has_deductions THEN 'partially_logged' ELSE 'logged' END
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.deplete_logged_meal_plan_item(p_item_id uuid)
RETURNS text
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_item public.meal_plan_items;
  v_deduction jsonb;
  v_component jsonb;
  v_progress jsonb;
  v_updated uuid;
  v_index integer;
  v_attempted_at timestamptz;
  v_error text;
  v_incomplete integer;
BEGIN
  SELECT i.* INTO v_item
  FROM public.meal_plan_items i
  JOIN public.meal_plan_days d ON d.id = i.meal_plan_day_id
  WHERE i.id = p_item_id AND d.user_id = auth.uid()
  FOR UPDATE OF i;

  IF NOT FOUND THEN RAISE EXCEPTION 'Planned item not found' USING ERRCODE = 'P0002'; END IF;
  IF v_item.consumed_meal_id IS NULL OR v_item.status NOT IN ('partially_logged', 'logged') THEN
    RAISE EXCEPTION 'Planned item has no consumed meal to deplete' USING ERRCODE = '55000';
  END IF;
  IF v_item.grocery_depletion_status IN ('completed', 'not_applicable') THEN
    RETURN 'already_completed';
  END IF;

  v_progress := v_item.grocery_depletion_results;
  IF jsonb_typeof(v_progress) <> 'array'
     OR jsonb_array_length(v_progress) <> jsonb_array_length(v_item.nutrition_snapshot->'grocery_deductions') THEN
    SELECT jsonb_agg(jsonb_build_object(
      'index', deduction.ordinality - 1,
      'food_resource_id', deduction.value->>'food_resource_id',
      'amount', deduction.value->'amount',
      'unit', deduction.value->>'unit',
      'status', 'pending',
      'attempt_count', 0,
      'diagnostics', '[]'::jsonb
    ) ORDER BY deduction.ordinality)
    INTO v_progress
    FROM jsonb_array_elements(v_item.nutrition_snapshot->'grocery_deductions') WITH ORDINALITY deduction(value, ordinality);
  END IF;

  FOR v_deduction, v_index IN
    SELECT value, (ordinality - 1)::integer
    FROM jsonb_array_elements(v_item.nutrition_snapshot->'grocery_deductions') WITH ORDINALITY
  LOOP
    v_component := v_progress->v_index;
    IF v_component->>'status' = 'completed' THEN CONTINUE; END IF;

    v_attempted_at := clock_timestamp();
    v_updated := NULL;
    BEGIN
      EXECUTE 'UPDATE public.food_resources SET quantity = greatest(0, coalesce(quantity, 0) - $1), updated_at = now() WHERE id = $2 AND user_id = auth.uid() AND unit = $3 RETURNING id'
        INTO v_updated
        USING (v_deduction->>'amount')::numeric * v_item.servings,
              (v_deduction->>'food_resource_id')::uuid,
              v_deduction->>'unit';
      IF v_updated IS NULL THEN
        RAISE EXCEPTION 'Grocery item unavailable for depletion' USING ERRCODE = 'P0002';
      END IF;

      v_component := v_component || jsonb_build_object(
        'status', 'completed',
        'attempt_count', COALESCE((v_component->>'attempt_count')::integer, 0) + 1,
        'attempted_at', v_attempted_at,
        'completed_at', clock_timestamp()
      );
    EXCEPTION WHEN OTHERS THEN
      v_error := SQLERRM;
      v_component := v_component || jsonb_build_object(
        'status', 'failed',
        'attempt_count', COALESCE((v_component->>'attempt_count')::integer, 0) + 1,
        'attempted_at', v_attempted_at,
        'last_error', v_error,
        'diagnostics', COALESCE(v_component->'diagnostics', '[]'::jsonb) || jsonb_build_array(jsonb_build_object('at', v_attempted_at, 'error', v_error))
      );
    END;

    v_progress := jsonb_set(v_progress, ARRAY[v_index::text], v_component, false);
    UPDATE public.meal_plan_items
    SET grocery_depletion_results = v_progress,
        grocery_depletion_attempted_at = v_attempted_at
    WHERE id = v_item.id;
  END LOOP;

  SELECT count(*) INTO v_incomplete
  FROM jsonb_array_elements(v_progress) component
  WHERE component->>'status' <> 'completed';

  IF v_incomplete = 0 THEN
    UPDATE public.meal_plan_items
    SET status = 'logged',
        grocery_depletion_status = 'completed',
        grocery_depletion_results = v_progress,
        grocery_depleted_at = now()
    WHERE id = v_item.id;
    RETURN 'completed';
  END IF;

  UPDATE public.meal_plan_items
  SET status = 'partially_logged',
      grocery_depletion_status = 'failed',
      grocery_depletion_results = v_progress
  WHERE id = v_item.id;
  RETURN 'incomplete';
END;
$$;

COMMIT;
