-- Migration to create the notes table used for monument and skill notes
CREATE TABLE IF NOT EXISTS public.notes (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    created_at timestamp with time zone NOT NULL DEFAULT now(),
    updated_at timestamp with time zone,
    user_id uuid NOT NULL,
    title text,
    content text,
    monument_id uuid,
    skill_id uuid,
    CONSTRAINT notes_requires_subject CHECK (
        monument_id IS NOT NULL OR skill_id IS NOT NULL
    ),
    CONSTRAINT notes_monument_fk FOREIGN KEY (monument_id)
        REFERENCES public.monuments (id) ON DELETE CASCADE,
    CONSTRAINT notes_skill_fk FOREIGN KEY (skill_id)
        REFERENCES public.skills (id) ON DELETE CASCADE
);

-- Helpful indexes for loading notes scoped to a user and resource
CREATE INDEX IF NOT EXISTS notes_user_monument_idx
    ON public.notes (user_id, monument_id, created_at);
CREATE INDEX IF NOT EXISTS notes_user_skill_idx
    ON public.notes (user_id, skill_id, created_at);

-- Ensure row level security is enabled
ALTER TABLE public.notes ENABLE ROW LEVEL SECURITY;

-- Drop any existing policies before recreating them for idempotency
DROP POLICY IF EXISTS "notes_select_own" ON public.notes;
DROP POLICY IF EXISTS "notes_insert_own" ON public.notes;
DROP POLICY IF EXISTS "notes_update_own" ON public.notes;
DROP POLICY IF EXISTS "notes_delete_own" ON public.notes;

-- Only allow authenticated users to interact with their own notes
CREATE POLICY "notes_select_own" ON public.notes
    FOR SELECT USING (user_id = auth.uid());

CREATE POLICY "notes_insert_own" ON public.notes
    FOR INSERT WITH CHECK (user_id = auth.uid());

CREATE POLICY "notes_update_own" ON public.notes
    FOR UPDATE USING (user_id = auth.uid());

CREATE POLICY "notes_delete_own" ON public.notes
    FOR DELETE USING (user_id = auth.uid());

-- Grant necessary privileges to the authenticated role
GRANT SELECT, INSERT, UPDATE, DELETE ON public.notes TO authenticated;
