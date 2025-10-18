-- Re-run dark XP reconciliation so legacy skills populate user_progress
DO $$
DECLARE
  rec RECORD;
BEGIN
  FOR rec IN
    SELECT DISTINCT user_id
      FROM (
        SELECT sp.user_id FROM public.skill_progress sp
        UNION
        SELECT s.user_id FROM public.skills s
        UNION
        SELECT up.user_id FROM public.user_progress up
      ) AS candidates
     WHERE user_id IS NOT NULL
  LOOP
    PERFORM public.reconcile_dark_xp_for_user(rec.user_id);
  END LOOP;
END;
$$;
