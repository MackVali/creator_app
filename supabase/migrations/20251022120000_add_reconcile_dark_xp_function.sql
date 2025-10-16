-- Add function to reconcile dark XP totals based on skill progress
DROP FUNCTION IF EXISTS public.reconcile_dark_xp_for_user(uuid);

CREATE OR REPLACE FUNCTION public.reconcile_dark_xp_for_user(
  p_user uuid DEFAULT auth.uid()
)
RETURNS TABLE(
  skill_id uuid,
  delta bigint,
  expected_total bigint,
  actual_total bigint
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  rec RECORD;
  v_expected bigint;
  v_actual bigint;
  v_delta bigint;
BEGIN
  IF p_user IS NULL THEN
    RAISE EXCEPTION 'reconcile_dark_xp_for_user: user id required';
  END IF;

  FOR rec IN
    SELECT
      sp.skill_id,
      sp.level,
      sp.prestige,
      (GREATEST(sp.level, 1) - 1 + GREATEST(sp.prestige, 0) * 100) AS expected_levels,
      COALESCE(SUM(dxe.amount), 0) AS existing_levels
    FROM public.skill_progress sp
    LEFT JOIN public.dark_xp_events dxe
      ON dxe.user_id = sp.user_id
     AND dxe.skill_id = sp.skill_id
    WHERE sp.user_id = p_user
    GROUP BY sp.skill_id, sp.level, sp.prestige
  LOOP
    v_expected := COALESCE(rec.expected_levels, 0);
    v_actual := COALESCE(rec.existing_levels, 0);
    v_delta := v_expected - v_actual;

    IF v_delta <> 0 THEN
      INSERT INTO public.dark_xp_events(user_id, skill_id, new_skill_level, amount)
      VALUES (p_user, rec.skill_id, rec.level, v_delta);

      skill_id := rec.skill_id;
      delta := v_delta;
      expected_total := v_expected;
      actual_total := v_actual + v_delta;
      RETURN NEXT;
    END IF;
  END LOOP;

  RETURN;
END;
$$;

COMMENT ON FUNCTION public.reconcile_dark_xp_for_user(uuid)
IS 'Align dark XP totals with the current skill progress snapshot for a user.';
