-- Migration to create windows table with RLS policies
CREATE TABLE IF NOT EXISTS public.windows (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    created_at timestamptz NOT NULL DEFAULT now(),
    user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
    label text NOT NULL,
    days smallint[] NOT NULL,
    start_local time without time zone NOT NULL,
    end_local time without time zone NOT NULL,
    energy text NOT NULL
);

-- Enable row level security
ALTER TABLE public.windows ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if they exist
DROP POLICY IF EXISTS "windows_select_own" ON public.windows;
DROP POLICY IF EXISTS "windows_insert_own" ON public.windows;
DROP POLICY IF EXISTS "windows_update_own" ON public.windows;
DROP POLICY IF EXISTS "windows_delete_own" ON public.windows;

-- Allow users to manage their own windows
CREATE POLICY "windows_select_own" ON public.windows
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "windows_insert_own" ON public.windows
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "windows_update_own" ON public.windows
  FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "windows_delete_own" ON public.windows
  FOR DELETE USING (auth.uid() = user_id);

-- Grant permissions to authenticated users
GRANT SELECT, INSERT, UPDATE, DELETE ON public.windows TO authenticated;
