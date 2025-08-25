-- Add CATS (Categories) system for skills organization
-- This migration creates the cats table and updates skills to support categorization

-- Create cats table
CREATE TABLE IF NOT EXISTS public.cats (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(user_id, name)
);

-- Add cat_id to skills table
ALTER TABLE public.skills 
ADD COLUMN IF NOT EXISTS cat_id uuid REFERENCES public.cats(id) ON DELETE SET NULL;

-- Enable RLS on cats table
ALTER TABLE public.cats ENABLE ROW LEVEL SECURITY;

-- Create RLS policies for cats
DROP POLICY IF EXISTS "select my cats" ON public.cats;
CREATE POLICY "select my cats" ON public.cats FOR SELECT USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "insert my cats" ON public.cats;
CREATE POLICY "insert my cats" ON public.cats FOR INSERT WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "update my cats" ON public.cats;
CREATE POLICY "update my cats" ON public.cats FOR UPDATE USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "delete my cats" ON public.cats;
CREATE POLICY "delete my cats" ON public.cats FOR DELETE USING (auth.uid() = user_id);

-- Update skills_progress_v to include category information
DROP VIEW IF EXISTS public.skills_progress_v CASCADE;
CREATE VIEW public.skills_progress_v AS
SELECT 
  s.user_id, 
  s.id as skill_id, 
  s.name, 
  s.icon,
  s.level,
  s.cat_id,
  c.name as cat_name,
  greatest(0, least(100, coalesce(s.progress, 0)))::int as progress
FROM public.skills s
LEFT JOIN public.cats c ON s.cat_id = c.id;

-- Create new view for skills grouped by categories
DROP VIEW IF EXISTS public.skills_by_cats_v CASCADE;
CREATE VIEW public.skills_by_cats_v AS
SELECT 
  c.id as cat_id,
  c.name as cat_name,
  c.user_id,
  COUNT(s.id) as skill_count,
  ARRAY_AGG(
    json_build_object(
      'skill_id', s.id,
      'name', s.name,
      'icon', s.icon,
      'level', s.level,
      'progress', greatest(0, least(100, coalesce(s.progress, 0)))::int
    ) ORDER BY s.name
  ) as skills
FROM public.cats c
LEFT JOIN public.skills s ON c.id = s.cat_id
GROUP BY c.id, c.name, c.user_id
ORDER BY c.name;

-- Grant permissions on new views
GRANT SELECT ON public.skills_progress_v TO authenticated;
GRANT SELECT ON public.skills_by_cats_v TO authenticated;

-- Insert some default categories for existing users
INSERT INTO public.cats (user_id, name)
SELECT DISTINCT user_id, 'General' as name
FROM public.skills
WHERE cat_id IS NULL
ON CONFLICT (user_id, name) DO NOTHING;

-- Update existing skills to use the 'General' category
UPDATE public.skills 
SET cat_id = (
  SELECT id FROM public.cats 
  WHERE user_id = skills.user_id AND name = 'General'
)
WHERE cat_id IS NULL;
