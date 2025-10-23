-- Persist friend requests so users can connect with new profiles
CREATE TABLE IF NOT EXISTS public.friend_requests (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    requester_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    requester_username text NOT NULL,
    requester_display_name text,
    requester_avatar_url text,
    target_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    target_username text NOT NULL,
    target_display_name text,
    target_avatar_url text,
    note text,
    status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'declined', 'cancelled')),
    mutual_friends integer NOT NULL DEFAULT 0,
    responded_at timestamptz,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT friend_requests_unique_pair UNIQUE (requester_id, target_id)
);

CREATE OR REPLACE FUNCTION public.set_friend_requests_updated_at()
RETURNS trigger AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS friend_requests_set_updated_at ON public.friend_requests;
CREATE TRIGGER friend_requests_set_updated_at
    BEFORE UPDATE ON public.friend_requests
    FOR EACH ROW
    EXECUTE FUNCTION public.set_friend_requests_updated_at();

ALTER TABLE public.friend_requests ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "friend_requests_select_visible" ON public.friend_requests;
CREATE POLICY "friend_requests_select_visible" ON public.friend_requests
    FOR SELECT
    USING (auth.uid() = requester_id OR auth.uid() = target_id);

DROP POLICY IF EXISTS "friend_requests_insert_own" ON public.friend_requests;
CREATE POLICY "friend_requests_insert_own" ON public.friend_requests
    FOR INSERT
    WITH CHECK (auth.uid() = requester_id);

DROP POLICY IF EXISTS "friend_requests_update_visible" ON public.friend_requests;
CREATE POLICY "friend_requests_update_visible" ON public.friend_requests
    FOR UPDATE
    USING (auth.uid() = requester_id OR auth.uid() = target_id)
    WITH CHECK (auth.uid() = requester_id OR auth.uid() = target_id);

DROP POLICY IF EXISTS "friend_requests_delete_visible" ON public.friend_requests;
CREATE POLICY "friend_requests_delete_visible" ON public.friend_requests
    FOR DELETE
    USING (auth.uid() = requester_id OR auth.uid() = target_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.friend_requests TO authenticated;

CREATE INDEX IF NOT EXISTS friend_requests_requester_id_idx
    ON public.friend_requests (requester_id);

CREATE INDEX IF NOT EXISTS friend_requests_target_id_idx
    ON public.friend_requests (target_id);
