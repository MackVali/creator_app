-- Migration to add color_hex and sort_order to cats table and update related views
ALTER TABLE public.cats ADD COLUMN IF NOT EXISTS color_hex text;
ALTER TABLE public.cats ADD COLUMN IF NOT EXISTS sort_order integer;

-- Recreate skills_by_cats_v with new columns
DROP VIEW IF EXISTS public.skills_by_cats_v CASCADE;
CREATE VIEW public.skills_by_cats_v AS
SELECT
  c.id as cat_id,
  c.name as cat_name,
  c.user_id,
  c.color_hex,
  c.sort_order,
  COUNT(s.id) as skill_count,
  ARRAY_AGG(
    json_build_object(
      'skill_id', s.id,
      'name', COALESCE(s.name, 'Unnamed Skill'),
      'icon', COALESCE(s.icon, '💡'),
      'level', COALESCE(s.level, 1),
      'progress', GREATEST(0, LEAST(100, COALESCE(s.progress, 0)))::int
    ) ORDER BY COALESCE(s.name, 'Unnamed Skill')
  ) FILTER (WHERE s.id IS NOT NULL) AS skills
FROM public.cats c
LEFT JOIN public.skills s ON c.id = s.cat_id
WHERE c.user_id = auth.uid()
GROUP BY c.id, c.name, c.user_id, c.color_hex, c.sort_order
ORDER BY c.sort_order NULLS LAST, c.name;

-- Recreate skills_progress_v with new columns
DROP VIEW IF EXISTS public.skills_progress_v CASCADE;
CREATE VIEW public.skills_progress_v AS
SELECT
  s.user_id,
  s.id as skill_id,
  s.name,
  COALESCE(s.icon, '💡') as icon,
  COALESCE(s.level, 1) as level,
  s.cat_id,
  c.name as cat_name,
  c.color_hex,
  c.sort_order,
  GREATEST(0, LEAST(100, COALESCE(s.progress, 0)))::int AS progress
FROM public.skills s
LEFT JOIN public.cats c ON s.cat_id = c.id;

GRANT SELECT ON public.skills_by_cats_v TO authenticated;
GRANT SELECT ON public.skills_progress_v TO authenticated;
