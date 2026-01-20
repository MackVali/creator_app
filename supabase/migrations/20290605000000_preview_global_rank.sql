BEGIN;

CREATE OR REPLACE FUNCTION public.recalculate_global_rank()
RETURNS void
LANGUAGE sql
AS $function$
WITH eligible AS (
  SELECT
    p.id,
    (
      CASE g.priority::text
        WHEN 'ULTRA-CRITICAL' THEN 6
        WHEN 'CRITICAL'       THEN 5
        WHEN 'HIGH'           THEN 4
        WHEN 'MEDIUM'         THEN 3
        WHEN 'LOW'            THEN 2
        ELSE 1
      END * 1000000
    ) +
    (
      CASE p.priority::text
        WHEN 'ULTRA-CRITICAL' THEN 6
        WHEN 'CRITICAL'       THEN 5
        WHEN 'HIGH'           THEN 4
        WHEN 'MEDIUM'         THEN 3
        WHEN 'LOW'            THEN 2
        ELSE 1
      END * 10000
    ) +
    (
      -- OLD mapping you had before (REFINE=4, BUILD=3)
      CASE p.stage::text
        WHEN 'RESEARCH' THEN 6
        WHEN 'TEST'     THEN 5
        WHEN 'REFINE'   THEN 4
        WHEN 'BUILD'    THEN 3
        WHEN 'RELEASE'  THEN 2
        ELSE 1
      END * 100
    ) AS score
  FROM public.projects p
  JOIN public.goals g ON g.id = p.goal_id
  WHERE p.completed_at IS NULL
),
ranked AS (
  SELECT
    id,
    ROW_NUMBER() OVER (ORDER BY score DESC, id ASC) AS new_global_rank
  FROM eligible
)
UPDATE public.projects p
SET global_rank = r.new_global_rank
FROM ranked r
WHERE r.id = p.id;

UPDATE public.projects
SET global_rank = NULL
WHERE completed_at IS NOT NULL;
$function$;

SELECT public.recalculate_global_rank();

COMMIT;
