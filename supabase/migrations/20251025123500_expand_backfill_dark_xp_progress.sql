-- Re-run dark XP reconciliation for all users with skills or progress snapshots
DO $$
DECLARE
  rec RECORD;
BEGIN
  FOR rec IN
    SELECT DISTINCT user_id
      FROM (
        SELECT sp.user_id FROM public.skill_progress sp WHERE sp.user_id IS NOT NULL
        UNION
        SELECT s.user_id FROM public.skills s WHERE s.user_id IS NOT NULL
      ) AS users
  LOOP
    PERFORM public.reconcile_dark_xp_for_user(rec.user_id);
  END LOOP;
END;
$$;
