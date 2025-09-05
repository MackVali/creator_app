-- Migration to add color and ordering to cats
ALTER TABLE public.cats
  ADD COLUMN IF NOT EXISTS color_hex text DEFAULT '#000000'::text,
  ADD COLUMN IF NOT EXISTS sort_order integer;

CREATE OR REPLACE VIEW public.skills_by_cats_v AS
SELECT
  c.id AS cat_id,
  c.name AS cat_name,
  c.user_id,
  c.color_hex,
  c.sort_order,
  COUNT(s.id) AS skill_count,
  ARRAY_AGG(
    json_build_object(
      'skill_id', s.id,
      'name', s.name,
      'icon', COALESCE(s.icon, '💡'),
      'level', COALESCE(s.level, 1),
      'progress', GREATEST(0, LEAST(100, COALESCE(s.progress, 0)))::int
    ) ORDER BY s.name
  ) FILTER (WHERE s.id IS NOT NULL) AS skills
FROM public.cats c
LEFT JOIN public.skills s ON c.id = s.cat_id
GROUP BY c.id, c.name, c.user_id, c.color_hex, c.sort_order
ORDER BY c.sort_order NULLS LAST, c.name;

GRANT SELECT ON public.skills_by_cats_v TO authenticated;
