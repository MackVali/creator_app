-- Migration: enforce unique monument-skill pairs for join table
-- Add deduplication and unique index so upserts using (monument_id, skill_id) succeed

-- Remove any accidental duplicates before adding the constraint
DELETE FROM public.monument_skills a
USING public.monument_skills b
WHERE a.monument_id = b.monument_id
  AND a.skill_id = b.skill_id
  AND a.ctid < b.ctid;

-- Ensure the combination of monument_id + skill_id is unique for upserts
CREATE UNIQUE INDEX IF NOT EXISTS idx_monument_skills_unique_monument_skill
  ON public.monument_skills (monument_id, skill_id);

SELECT 'Unique constraint enforced for monument_skills' as status;
