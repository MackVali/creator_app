-- Migration to add the skills_by_cats_v view after remote schema is applied
-- This assumes the cats table and skills table with uuid IDs exist from remote schema

-- Create the skills_by_cats_v view
CREATE OR REPLACE VIEW public.skills_by_cats_v AS
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
      'skill_name', COALESCE(s.name, 'Unnamed Skill'),
      'skill_icon', COALESCE(s.icon, '💡'),
      'skill_level', COALESCE(s.level, 1),
      'progress', 0
    ) ORDER BY COALESCE(s.name, 'Unnamed Skill')
  ) FILTER (WHERE s.id IS NOT NULL) as skills
FROM public.cats c
LEFT JOIN public.skills s ON c.id = s.cat_id
WHERE c.user_id = auth.uid()
GROUP BY c.id, c.name, c.user_id, c.color_hex, c.sort_order
ORDER BY c.sort_order NULLS LAST, c.name;

-- Grant permissions on the view
GRANT SELECT ON public.skills_by_cats_v TO authenticated;
