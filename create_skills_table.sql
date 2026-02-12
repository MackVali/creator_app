-- Run this SQL directly in your Supabase Dashboard SQL Editor
-- This will create the skills table needed for the skills feature

-- Create skills table
CREATE TABLE IF NOT EXISTS public.skills (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name text NOT NULL,
  icon text NOT NULL,
  monument_id uuid NULL,
  level int NOT NULL DEFAULT 1,
  sort_order int NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Create monuments table (optional, for future use)
CREATE TABLE IF NOT EXISTS public.monuments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  title text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.skills ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.monuments ENABLE ROW LEVEL SECURITY;

-- Create RLS policies for skills
CREATE POLICY "select my skills" ON public.skills FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "insert my skills" ON public.skills FOR INSERT WITH CHECK (auth.uid() = user_id);

-- Create RLS policies for monuments
CREATE POLICY "select my monuments" ON public.monuments FOR SELECT USING (auth.uid() = user_id);

-- Grant permissions
GRANT ALL ON public.skills TO authenticated;
GRANT ALL ON public.monuments TO authenticated;
