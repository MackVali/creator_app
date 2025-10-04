-- Create friend_messages table for direct messages between users
CREATE TABLE IF NOT EXISTS public.friend_messages (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    sender_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    recipient_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    body text NOT NULL
);

-- Keep updated_at current on row updates
CREATE OR REPLACE FUNCTION public.set_friend_messages_updated_at()
RETURNS trigger AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ language plpgsql;

DROP TRIGGER IF EXISTS friend_messages_set_updated_at ON public.friend_messages;
CREATE TRIGGER friend_messages_set_updated_at
    BEFORE UPDATE ON public.friend_messages
    FOR EACH ROW
    EXECUTE FUNCTION public.set_friend_messages_updated_at();

-- Index sender and recipient for faster lookups
CREATE INDEX IF NOT EXISTS friend_messages_sender_id_idx
    ON public.friend_messages (sender_id);

CREATE INDEX IF NOT EXISTS friend_messages_recipient_id_idx
    ON public.friend_messages (recipient_id);

-- Enable row level security and define policies
ALTER TABLE public.friend_messages ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "friend_messages_select_visible" ON public.friend_messages;
DROP POLICY IF EXISTS "friend_messages_insert_own" ON public.friend_messages;
DROP POLICY IF EXISTS "friend_messages_update_own" ON public.friend_messages;
DROP POLICY IF EXISTS "friend_messages_delete_own" ON public.friend_messages;

CREATE POLICY "friend_messages_select_visible" ON public.friend_messages
    FOR SELECT USING (
        auth.uid() = sender_id OR auth.uid() = recipient_id
    );

CREATE POLICY "friend_messages_insert_own" ON public.friend_messages
    FOR INSERT WITH CHECK (auth.uid() = sender_id);

CREATE POLICY "friend_messages_update_own" ON public.friend_messages
    FOR UPDATE USING (auth.uid() = sender_id);

CREATE POLICY "friend_messages_delete_own" ON public.friend_messages
    FOR DELETE USING (auth.uid() = sender_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.friend_messages TO authenticated;
