-- Create friend_connections table to persist the viewer's contact list
CREATE TABLE IF NOT EXISTS public.friend_connections (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    friend_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
    friend_username text NOT NULL,
    friend_display_name text,
    friend_avatar_url text,
    friend_profile_url text,
    has_ring boolean NOT NULL DEFAULT false,
    is_online boolean NOT NULL DEFAULT false,
    CONSTRAINT friend_connections_unique_friend UNIQUE (user_id, friend_username)
);

CREATE OR REPLACE FUNCTION public.set_friend_connections_updated_at()
RETURNS trigger AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS friend_connections_set_updated_at ON public.friend_connections;
CREATE TRIGGER friend_connections_set_updated_at
    BEFORE UPDATE ON public.friend_connections
    FOR EACH ROW
    EXECUTE FUNCTION public.set_friend_connections_updated_at();

CREATE INDEX IF NOT EXISTS friend_connections_user_id_idx
    ON public.friend_connections (user_id);

CREATE INDEX IF NOT EXISTS friend_connections_friend_user_id_idx
    ON public.friend_connections (friend_user_id);

ALTER TABLE public.friend_connections ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "friend_connections_select_own" ON public.friend_connections;
DROP POLICY IF EXISTS "friend_connections_insert_own" ON public.friend_connections;
DROP POLICY IF EXISTS "friend_connections_update_own" ON public.friend_connections;
DROP POLICY IF EXISTS "friend_connections_delete_own" ON public.friend_connections;

CREATE POLICY "friend_connections_select_own" ON public.friend_connections
    FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "friend_connections_insert_own" ON public.friend_connections
    FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "friend_connections_update_own" ON public.friend_connections
    FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "friend_connections_delete_own" ON public.friend_connections
    FOR DELETE USING (auth.uid() = user_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.friend_connections TO authenticated;
