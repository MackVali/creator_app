-- Fix skills_by_cats_v JSON keys to match frontend expectations
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

GRANT SELECT ON public.skills_by_cats_v TO authenticated;
