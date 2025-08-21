-- Migration: Create views and enhance tables for dashboard functionality
-- Date: 2025-01-01

-- 1. Add missing columns to match requirements
-- Add category column to monuments if it doesn't exist
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' AND table_name = 'monuments' AND column_name = 'category'
  ) THEN
    ALTER TABLE public.monuments ADD COLUMN category text DEFAULT 'Achievement';
  END IF;
END $$;

-- Add progress column to skills if it doesn't exist
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' AND table_name = 'skills' AND column_name = 'progress'
  ) THEN
    ALTER TABLE public.skills ADD COLUMN progress integer DEFAULT 0;
  END IF;
END $$;

-- Add status column to goals if it doesn't exist
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' AND table_name = 'goals' AND column_name = 'status'
  ) THEN
    ALTER TABLE public.goals ADD COLUMN status text DEFAULT 'active';
  END IF;
END $$;

-- 2. Create the three views exactly as requested
-- monuments_summary_v: count monuments grouped by category for the current user
DROP VIEW IF EXISTS public.monuments_summary_v CASCADE;
CREATE VIEW public.monuments_summary_v AS
SELECT
  m.user_id,
  m.category,
  count(*)::int as count
FROM public.monuments m
GROUP BY m.user_id, m.category;

-- skills_progress_v: list skills with a 0–100 progress column for the current user
DROP VIEW IF EXISTS public.skills_progress_v CASCADE;
CREATE VIEW public.skills_progress_v AS
SELECT
  s.user_id,
  s.id as skill_id,
  s."Title" as name,
  greatest(0, least(100, coalesce(s.progress, 0)))::int as progress
FROM public.skills s;

-- goals_active_v: the 3 most recent active goals for the current user
DROP VIEW IF EXISTS public.goals_active_v CASCADE;
CREATE VIEW public.goals_active_v AS
SELECT 
  g.user_id, 
  g.id as goal_id, 
  g."Title" as name, 
  g.updated_at
FROM public.goals g
WHERE coalesce(g.status, 'active') = 'active'
ORDER BY g.updated_at DESC
LIMIT 3;

-- 3. Grant permissions on views
GRANT SELECT ON public.monuments_summary_v TO authenticated;
GRANT SELECT ON public.skills_progress_v TO authenticated;
GRANT SELECT ON public.goals_active_v TO authenticated;

-- 4. Ensure RLS is enabled and policies exist
-- The base tables already have RLS enabled and policies from previous migrations
-- But let's verify and add any missing policies

-- Verify monuments table has proper RLS
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE tablename = 'monuments' AND polname = 'monuments_select_own'
  ) THEN
    CREATE POLICY monuments_select_own ON public.monuments
      FOR SELECT TO authenticated USING (user_id = auth.uid());
  END IF;
END $$;

-- Verify skills table has proper RLS
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE tablename = 'skills' AND polname = 'skills_select_own'
  ) THEN
    CREATE POLICY skills_select_own ON public.skills
      FOR SELECT TO authenticated USING (user_id = auth.uid());
  END IF;
END $$;

-- Verify goals table has proper RLS
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE tablename = 'goals' AND polname = 'goals_select_own'
  ) THEN
    CREATE POLICY goals_select_own ON public.goals
      FOR SELECT TO authenticated USING (user_id = auth.uid());
  END IF;
END $$;
