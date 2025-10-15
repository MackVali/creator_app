-- Migration to ensure proper RLS policies for skills table
-- This migration ensures users can only read their own skills

ALTER TABLE public.skills ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='skills' AND policyname='skills_select_own') THEN
    CREATE POLICY skills_select_own ON public.skills FOR SELECT USING (user_id = auth.uid());
  END IF;
END $$;
