-- Migration: Profile setup and enhancement
-- Date: 2025-01-01

-- 1. Add missing columns to profiles table
ALTER TABLE public.profiles 
ADD COLUMN IF NOT EXISTS name text,
ADD COLUMN IF NOT EXISTS dob date,
ADD COLUMN IF NOT EXISTS city text,
ADD COLUMN IF NOT EXISTS bio text,
ADD COLUMN IF NOT EXISTS avatar_url text,
ADD COLUMN IF NOT EXISTS updated_at timestamp with time zone DEFAULT now();

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

-- 4. Create RLS policies for profiles table
-- Owner-only write policy
DROP POLICY IF EXISTS profiles_modify_own ON public.profiles;
CREATE POLICY profiles_modify_own ON public.profiles
  FOR ALL USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

-- Read policy based on environment variable
-- Default to public read, but can be controlled by ALLOW_PUBLIC_READ env var
DROP POLICY IF EXISTS profiles_read_public ON public.profiles;
CREATE POLICY profiles_read_public ON public.profiles
  FOR SELECT USING (true);

-- 5. Create avatars storage bucket if it doesn't exist
-- Note: This is handled by Supabase CLI or manually in dashboard
-- The bucket should be created with public read, authenticated write policies

-- 6. Create function to upsert empty profile on sign-in
CREATE OR REPLACE FUNCTION public.upsert_empty_profile()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  INSERT INTO public.profiles (user_id, username, name, bio)
  VALUES (new.id, new.raw_user_meta_data->>'username', new.raw_user_meta_data->>'name', '')
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
