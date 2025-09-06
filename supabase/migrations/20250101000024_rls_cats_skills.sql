
-- Migration to ensure proper RLS policies for the skills table
-- This migration ensures users can only access their own data

-- Enable RLS on skills table (if not already enabled)
ALTER TABLE public.skills ENABLE ROW LEVEL SECURITY;

-- Create RLS policies for skills table (if not already exist)
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='skills' AND policyname='skills_select_own') THEN
    CREATE POLICY skills_select_own ON public.skills FOR SELECT USING (user_id = auth.uid());
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='skills' AND policyname='skills_insert_own') THEN
    CREATE POLICY skills_insert_own ON public.skills FOR INSERT WITH CHECK (user_id = auth.uid());
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='skills' AND policyname='skills_update_own') THEN
    CREATE POLICY skills_update_own ON public.skills FOR UPDATE USING (user_id = auth.uid());
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='skills' AND policyname='skills_delete_own') THEN
    CREATE POLICY skills_delete_own ON public.skills FOR DELETE USING (user_id = auth.uid());
  END IF;
END $$;

-- Grant necessary permissions
GRANT SELECT, INSERT, UPDATE, DELETE ON public.skills TO authenticated;
