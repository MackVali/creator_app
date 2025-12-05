-- Persist project-level completion timestamp so the scheduler can ignore finished work.
ALTER TABLE public.projects
  ADD COLUMN IF NOT EXISTS completed_at timestamptz;

CREATE INDEX IF NOT EXISTS projects_completed_at_idx
  ON public.projects USING btree (completed_at);

WITH latest_completed AS (
  SELECT
    source_id AS project_id,
    MAX(completed_at) AS completed_at
  FROM public.schedule_instances
  WHERE source_type = 'PROJECT'
    AND completed_at IS NOT NULL
  GROUP BY source_id
)
UPDATE public.projects AS p
SET completed_at = latest_completed.completed_at
FROM latest_completed
WHERE p.id = latest_completed.project_id
  AND (p.completed_at IS NULL OR p.completed_at < latest_completed.completed_at);
