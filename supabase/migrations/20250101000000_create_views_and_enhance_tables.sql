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

-- 2. Create user_stats table for level and XP tracking
CREATE TABLE IF NOT EXISTS public.user_stats (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  level int NOT NULL DEFAULT 1,
  xp_current int NOT NULL DEFAULT 0,
  xp_max int NOT NULL DEFAULT 4000,
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

-- Add updated_at trigger for user_stats table
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger trg
    JOIN pg_class cls ON cls.oid = trg.tgrelid
    WHERE cls.relname = 'user_stats' AND trg.tgname = 'user_stats_set_updated_at'
  ) THEN
    CREATE TRIGGER user_stats_set_updated_at 
    BEFORE UPDATE ON public.user_stats 
    FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
  END IF;
END $$;

-- 3. Create the three views exactly as requested
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

-- user_stats_v: easy reading of user stats
DROP VIEW IF EXISTS public.user_stats_v CASCADE;
CREATE VIEW public.user_stats_v AS
SELECT user_id, level, xp_current, xp_max FROM public.user_stats;

-- 4. Grant permissions on views
GRANT SELECT ON public.monuments_summary_v TO authenticated;
GRANT SELECT ON public.skills_progress_v TO authenticated;
GRANT SELECT ON public.goals_active_v TO authenticated;
GRANT SELECT ON public.user_stats_v TO authenticated;

-- 5. Ensure RLS is enabled and policies exist
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

-- Enable RLS and create policy for user_stats table
ALTER TABLE public.user_stats ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE tablename = 'user_stats' AND polname = 'user_stats_select_own'
  ) THEN
    CREATE POLICY user_stats_select_own ON public.user_stats
      FOR SELECT USING (user_id = auth.uid());
  END IF;
END $$;
