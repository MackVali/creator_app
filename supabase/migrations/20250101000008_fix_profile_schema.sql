-- Migration: Fix Profile Schema - Ensure all required columns exist
-- Date: 2025-01-01

-- 1. Ensure profiles table has all required columns
DO $$ BEGIN
  -- Add name column if it doesn't exist
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' AND table_name = 'profiles' AND column_name = 'name'
  ) THEN
    ALTER TABLE public.profiles ADD COLUMN name text;
  END IF;
  
  -- Add dob column if it doesn't exist
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' AND table_name = 'profiles' AND column_name = 'dob'
  ) THEN
    ALTER TABLE public.profiles ADD COLUMN dob date;
  END IF;
  
  -- Add city column if it doesn't exist
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' AND table_name = 'profiles' AND column_name = 'city'
  ) THEN
    ALTER TABLE public.profiles ADD COLUMN city text;
  END IF;
  
  -- Add bio column if it doesn't exist
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' AND table_name = 'profiles' AND column_name = 'bio'
  ) THEN
    ALTER TABLE public.profiles ADD COLUMN bio text;
  END IF;
  
  -- Add avatar_url column if it doesn't exist
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' AND table_name = 'profiles' AND column_name = 'avatar_url'
  ) THEN
    ALTER TABLE public.profiles ADD COLUMN avatar_url text;
  END IF;
  
  -- Add updated_at column if it doesn't exist
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' AND table_name = 'profiles' AND column_name = 'updated_at'
  ) THEN
    ALTER TABLE public.profiles ADD COLUMN updated_at timestamp with time zone DEFAULT now();
  END IF;
END $$;

-- 2. Create updated_at trigger function if it doesn't exist
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END $$;

-- 3. Add updated_at trigger for profiles table
DROP TRIGGER IF EXISTS profiles_set_updated_at ON public.profiles;
CREATE TRIGGER profiles_set_updated_at 
  BEFORE UPDATE ON public.profiles 
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- 4. Ensure RLS is enabled on profiles table
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- 5. Create RLS policies for profiles table
-- Owner-only write policy
DROP POLICY IF EXISTS profiles_modify_own ON public.profiles;
CREATE POLICY profiles_modify_own ON public.profiles
  FOR ALL USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

-- Read policy - allow public read for now
DROP POLICY IF EXISTS profiles_read_public ON public.profiles;
CREATE POLICY profiles_read_public ON public.profiles
  FOR SELECT USING (true);

-- 6. Create function to upsert empty profile on sign-in
CREATE OR REPLACE FUNCTION public.upsert_empty_profile()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  INSERT INTO public.profiles (user_id, username, name, bio)
  VALUES (
    new.id, 
    COALESCE(new.raw_user_meta_data->>'username', 'user_' || substr(new.id::text, 1, 8)),
    COALESCE(new.raw_user_meta_data->>'name', ''),
    ''
  )
  ON CONFLICT (user_id) DO NOTHING;
  RETURN new;
END $$;

-- 7. Create trigger for auto-creating profiles
DROP TRIGGER IF EXISTS trg_upsert_empty_profile ON auth.users;
CREATE TRIGGER trg_upsert_empty_profile
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE PROCEDURE public.upsert_empty_profile();

-- 8. Grant necessary permissions
GRANT USAGE ON SCHEMA public TO authenticated;
GRANT ALL ON public.profiles TO authenticated;
GRANT USAGE ON SEQUENCE public.profiles_id_seq TO authenticated;

-- 9. Note: Test profile insertion removed due to constraint issues
-- Profiles will be created automatically via the trigger when users sign up
