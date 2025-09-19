-- Add timezone column to profiles for per-user scheduling preferences
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS timezone text NOT NULL DEFAULT 'UTC';

-- Ensure existing rows use the default timezone value
UPDATE public.profiles
SET timezone = COALESCE(NULLIF(timezone, ''), 'UTC');
