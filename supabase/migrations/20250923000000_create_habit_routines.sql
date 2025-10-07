-- Create habit_routines table to group habits into reusable flows
CREATE TABLE IF NOT EXISTS public.habit_routines (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    name text NOT NULL,
    description text
);

-- Keep updated_at current on row updates
CREATE OR REPLACE FUNCTION public.set_habit_routines_updated_at()
RETURNS trigger AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS habit_routines_set_updated_at ON public.habit_routines;
CREATE TRIGGER habit_routines_set_updated_at
    BEFORE UPDATE ON public.habit_routines
    FOR EACH ROW
    EXECUTE FUNCTION public.set_habit_routines_updated_at();

-- Ensure we can safely reference the routine alongside its owner
ALTER TABLE public.habit_routines
    DROP CONSTRAINT IF EXISTS habit_routines_id_user_id_key;
ALTER TABLE public.habit_routines
    ADD CONSTRAINT habit_routines_id_user_id_key UNIQUE (id, user_id);

-- Index routines by owner for faster lookups
CREATE INDEX IF NOT EXISTS habit_routines_user_id_idx
    ON public.habit_routines (user_id);

-- Add optional routine reference to habits scoped by the same owner
ALTER TABLE public.habits
    ADD COLUMN IF NOT EXISTS routine_id uuid;

CREATE INDEX IF NOT EXISTS habits_routine_id_idx
    ON public.habits (routine_id);

ALTER TABLE public.habits
    DROP CONSTRAINT IF EXISTS habits_routine_owner_fk;
ALTER TABLE public.habits
    ADD CONSTRAINT habits_routine_owner_fk
        FOREIGN KEY (routine_id, user_id)
        REFERENCES public.habit_routines (id, user_id)
        ON DELETE SET NULL;

-- Enable row level security controls for the new table
ALTER TABLE public.habit_routines ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "habit_routines_select_own" ON public.habit_routines;
DROP POLICY IF EXISTS "habit_routines_insert_own" ON public.habit_routines;
DROP POLICY IF EXISTS "habit_routines_update_own" ON public.habit_routines;
DROP POLICY IF EXISTS "habit_routines_delete_own" ON public.habit_routines;

CREATE POLICY "habit_routines_select_own" ON public.habit_routines
    FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "habit_routines_insert_own" ON public.habit_routines
    FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "habit_routines_update_own" ON public.habit_routines
    FOR UPDATE USING (auth.uid() = user_id)
    WITH CHECK (auth.uid() = user_id);

CREATE POLICY "habit_routines_delete_own" ON public.habit_routines
    FOR DELETE USING (auth.uid() = user_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.habit_routines TO authenticated;
