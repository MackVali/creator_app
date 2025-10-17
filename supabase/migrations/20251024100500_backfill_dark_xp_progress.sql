-- Backfill user_progress and dark XP totals for all existing users
DO $$
DECLARE
  rec RECORD;
BEGIN
  FOR rec IN
    SELECT DISTINCT user_id
      FROM public.skill_progress
     WHERE user_id IS NOT NULL
  LOOP
    PERFORM public.reconcile_dark_xp_for_user(rec.user_id);
  END LOOP;
END;
$$;
