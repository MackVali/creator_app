-- Simple SQL script to add CATS system to existing database
-- Run this directly in your Supabase SQL editor

  -- 1. Create cats table
  CREATE TABLE IF NOT EXISTS public.cats (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    name text NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now(),
    UNIQUE(user_id, name)
  );

  -- 2. Ensure new optional columns exist
  ALTER TABLE public.cats
    ADD COLUMN IF NOT EXISTS color_hex text,
    ADD COLUMN IF NOT EXISTS sort_order integer;

  -- Set default color and backfill missing values
  ALTER TABLE public.cats
    ALTER COLUMN color_hex SET DEFAULT '#000000';

  UPDATE public.cats
     SET color_hex = '#000000'
   WHERE color_hex IS NULL;

  -- 3. Add cat_id to skills table (if it doesn't exist)
DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'skills' AND column_name = 'cat_id'
  ) THEN
    ALTER TABLE public.skills ADD COLUMN cat_id uuid REFERENCES public.cats(id) ON DELETE SET NULL;
  END IF;
END $$;

  -- 4. Enable RLS on cats table
ALTER TABLE public.cats ENABLE ROW LEVEL SECURITY;

  -- 5. Create RLS policies for cats
DROP POLICY IF EXISTS "select my cats" ON public.cats;
CREATE POLICY "select my cats" ON public.cats FOR SELECT USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "insert my cats" ON public.cats;
CREATE POLICY "insert my cats" ON public.cats FOR INSERT WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "update my cats" ON public.cats;
CREATE POLICY "update my cats" ON public.cats FOR UPDATE USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "delete my cats" ON public.cats;
CREATE POLICY "delete my cats" ON public.cats FOR DELETE USING (auth.uid() = user_id);

  -- 6. Create new view for skills grouped by categories
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
      'name', s.name,
      'icon', COALESCE(s.icon, '💡'),
      'level', COALESCE(s.level, 1),
      'progress', GREATEST(0, LEAST(100, COALESCE(s.progress, 0)))::int
    ) ORDER BY s.name
  ) FILTER (WHERE s.id IS NOT NULL) as skills
FROM public.cats c
LEFT JOIN public.skills s ON c.id = s.cat_id
GROUP BY c.id, c.name, c.user_id, c.color_hex, c.sort_order
ORDER BY c.sort_order NULLS LAST, c.name;

  -- 7. Grant permissions on new view
GRANT SELECT ON public.skills_by_cats_v TO authenticated;

  -- 8. Insert default 'General' category for existing users
INSERT INTO public.cats (user_id, name)
SELECT DISTINCT user_id, 'General' as name
FROM public.skills
WHERE user_id IS NOT NULL
ON CONFLICT (user_id, name) DO NOTHING;

  -- 9. Update existing skills to use the 'General' category
UPDATE public.skills 
SET cat_id = (
  SELECT id FROM public.cats 
  WHERE user_id = skills.user_id AND name = 'General'
)
WHERE cat_id IS NULL AND user_id IS NOT NULL;

  -- 10. Update skills_progress_v to include category information
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
  GREATEST(0, LEAST(100, COALESCE(s.progress, 0)))::int as progress
FROM public.skills s
LEFT JOIN public.cats c ON s.cat_id = c.id;

  -- 11. Grant permissions on updated view
GRANT SELECT ON public.skills_progress_v TO authenticated;
