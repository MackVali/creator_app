-- Backfill dark XP based on existing skill levels.
-- This migration ensures that user_progress reflects the total number of skill levels
-- already attained (including prestige resets) by inserting compensating dark_xp_events
-- for any missing dark XP per skill.

BEGIN;

WITH expected AS (
  SELECT
    sp.user_id,
    sp.skill_id,
    (sp.prestige * 100 + GREATEST(sp.level - 1, 0))::bigint AS expected_dark_xp,
    sp.level,
    sp.prestige
  FROM public.skill_progress sp
),
actual AS (
  SELECT
    d.user_id,
    d.skill_id,
    COALESCE(SUM(d.amount), 0)::bigint AS actual_dark_xp
  FROM public.dark_xp_events d
  GROUP BY d.user_id, d.skill_id
),
diffs AS (
  SELECT
    e.user_id,
    e.skill_id,
    e.level,
    e.expected_dark_xp,
    COALESCE(a.actual_dark_xp, 0) AS actual_dark_xp,
    e.expected_dark_xp - COALESCE(a.actual_dark_xp, 0) AS delta_dark_xp
  FROM expected e
  LEFT JOIN actual a
    ON a.user_id = e.user_id AND a.skill_id = e.skill_id
)
INSERT INTO public.dark_xp_events (user_id, skill_id, new_skill_level, amount)
SELECT
  user_id,
  skill_id,
  level,
  delta_dark_xp
FROM diffs
WHERE delta_dark_xp <> 0;

COMMIT;
