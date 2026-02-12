-- Add a sort_order column to the skills table so we can persist manual ordering.

ALTER TABLE public.skills
ADD COLUMN IF NOT EXISTS sort_order integer NOT NULL DEFAULT 0;

-- Backfill every existing skill with a per-category order based on creation time to avoid identical zeros.
WITH ranked AS (
  SELECT
    id,
    ROW_NUMBER() OVER (
      PARTITION BY cat_id
      ORDER BY created_at DESC NULLS LAST, COALESCE(name, 'Unnamed Skill') ASC
    ) AS rn
  FROM public.skills
)
UPDATE public.skills
SET sort_order = ranked.rn
FROM ranked
WHERE public.skills.id = ranked.id
  AND ranked.rn IS NOT NULL;

-- Redefine the skills_by_cats_v view to respect the new sort_order for each skill.
DROP VIEW IF EXISTS public.skills_by_cats_v;
CREATE VIEW public.skills_by_cats_v AS
SELECT
  c.id as cat_id,
  c.name as cat_name,
  c.user_id,
  COALESCE(c.color_hex, '#000000') AS color_hex,
  c.sort_order,
  COUNT(s.id) as skill_count,
  ARRAY_AGG(
    json_build_object(
      'skill_id', s.id,
      'name', s.name,
      'icon', COALESCE(s.icon, '💡'),
      'level', COALESCE(s.level, 1),
      'progress', 0,
      'sort_order', COALESCE(s.sort_order, 0)
    ) ORDER BY
      COALESCE(NULLIF(s.sort_order, 0), 2147483647),
      COALESCE(s.name, 'Unnamed Skill')
  ) FILTER (WHERE s.id IS NOT NULL) as skills
FROM public.cats c
LEFT JOIN public.skills s ON c.id = s.cat_id
GROUP BY c.id, c.name, c.user_id, c.color_hex, c.sort_order
ORDER BY c.sort_order NULLS LAST, c.name;

GRANT SELECT ON public.skills_by_cats_v TO authenticated;
