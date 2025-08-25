-- Simple skills table creation
-- This migration only creates what's needed for the skills feature

-- Create skills table if it doesn't exist
CREATE TABLE IF NOT EXISTS public.skills (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name text NOT NULL,
  icon text NOT NULL,
  monument_id uuid NULL,
  level int NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Create monuments table if it doesn't exist
CREATE TABLE IF NOT EXISTS public.monuments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  title text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.skills ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.monuments ENABLE ROW LEVEL SECURITY;

-- Create RLS policies
DROP POLICY IF EXISTS "select my skills" ON public.skills;
CREATE POLICY "select my skills" ON public.skills FOR SELECT USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "insert my skills" ON public.skills;
CREATE POLICY "insert my skills" ON public.skills FOR INSERT WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "select my monuments" ON public.monuments;
CREATE POLICY "select my monuments" ON public.monuments FOR SELECT USING (auth.uid() = user_id);
