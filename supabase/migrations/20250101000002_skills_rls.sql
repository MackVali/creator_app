-- Migration to ensure proper RLS policies for skills table
-- This migration ensures users can only read their own skills

-- Enable RLS on skills table if not already enabled
ALTER TABLE public.skills ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if they exist
DROP POLICY IF EXISTS "skills_select_own" ON public.skills;
DROP POLICY IF EXISTS "skills_insert_own" ON public.skills;
DROP POLICY IF EXISTS "skills_update_own" ON public.skills;
DROP POLICY IF EXISTS "skills_delete_own" ON public.skills;

-- Create comprehensive RLS policies for skills table
CREATE POLICY "skills_select_own" ON public.skills 
  FOR SELECT USING (user_id = auth.uid());

CREATE POLICY "skills_insert_own" ON public.skills 
  FOR INSERT WITH CHECK (user_id = auth.uid());

CREATE POLICY "skills_update_own" ON public.skills 
  FOR UPDATE USING (user_id = auth.uid());

CREATE POLICY "skills_delete_own" ON public.skills 
  FOR DELETE USING (user_id = auth.uid());

-- Grant necessary permissions
GRANT SELECT, INSERT, UPDATE, DELETE ON public.skills TO authenticated;
