-- Add emoji column for cat cards
ALTER TABLE public.cats ADD COLUMN IF NOT EXISTS emoji text;

-- Update skills_by_cats_v to expose cat emoji
DROP VIEW IF EXISTS public.skills_by_cats_v;
CREATE VIEW public.skills_by_cats_v AS
SELECT
  c.id AS cat_id,
  c.name AS cat_name,
  c.user_id,
  COALESCE(c.color_hex, '#000000') AS color_hex,
  c.emoji,
  c.sort_order,
  COUNT(s.id) AS skill_count,
  ARRAY_AGG(
    json_build_object(
      'skill_id', s.id,
      'name', s.name,
      'icon', COALESCE(s.icon, '💡'),
      'level', COALESCE(s.level, 1),
      'progress', GREATEST(0, LEAST(100, COALESCE(s.progress, 0)))::int
    ) ORDER BY COALESCE(s.name, 'Unnamed Skill')
  ) FILTER (WHERE s.id IS NOT NULL) AS skills
FROM public.cats c
LEFT JOIN public.skills s ON c.id = s.cat_id
GROUP BY c.id, c.name, c.user_id, c.color_hex, c.emoji, c.sort_order
ORDER BY c.sort_order NULLS LAST, c.name;

GRANT SELECT ON public.skills_by_cats_v TO authenticated;
