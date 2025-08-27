-- Migration to add the skills_by_cats_v view after remote schema is applied
-- This assumes the cats table and skills table with uuid IDs exist from remote schema

-- Create the skills_by_cats_v view
CREATE OR REPLACE VIEW public.skills_by_cats_v AS
SELECT 
  c.id as cat_id,
  c.name as cat_name,
  c.user_id,
  s.id as skill_id,
  s.name as skill_name,
  COALESCE(s.icon, '💡') as skill_icon,
  COALESCE(s.level, 1) as skill_level,
  0 as progress
FROM public.cats c
LEFT JOIN public.skills s ON c.id = s.cat_id
WHERE c.user_id = auth.uid()
ORDER BY c.name, s.name;

-- Grant permissions on the view
GRANT SELECT ON public.skills_by_cats_v TO authenticated;
