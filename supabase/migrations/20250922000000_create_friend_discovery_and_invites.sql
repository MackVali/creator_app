-- Create friend discovery profiles table to back discovery recommendations
CREATE TABLE IF NOT EXISTS public.friend_discovery_profiles (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    username text NOT NULL,
    display_name text NOT NULL,
    avatar_url text,
    role text,
    highlight text,
    reason text,
    mutual_friends integer NOT NULL DEFAULT 0,
    created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.friend_discovery_profiles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "friend_discovery_profiles_select_all" ON public.friend_discovery_profiles;
CREATE POLICY "friend_discovery_profiles_select_all" ON public.friend_discovery_profiles
    FOR SELECT
    USING (true);

GRANT SELECT ON public.friend_discovery_profiles TO authenticated;

-- Seed a baseline set of discovery profiles so the UI has immediate data
INSERT INTO public.friend_discovery_profiles (id, username, display_name, avatar_url, role, highlight, reason, mutual_friends)
VALUES
    ('d1e7c13f-0c36-4b22-9a0f-b0b3f3a2b901', 'mxsunset', 'Maya Sunset', 'https://i.pravatar.cc/96?img=37', 'Visual Artist', 'Produces immersive live visuals for touring artists.', 'Works with three of your collaborators', 9),
    ('f2b9a4c1-6a7d-4f4d-8f3e-32bfb5825b32', 'samplepackking', 'Leo Fowler', 'https://i.pravatar.cc/96?img=31', 'Producer • Sound Designer', 'Shares weekly sound kits and behind-the-scenes breakdowns.', 'Recently joined your “Mix Lab” workspace', 4),
    ('3ce75b8a-97ef-4cd5-b4d6-68f5bf6f8c6a', 'tourmoments', 'Aria Bell', 'https://i.pravatar.cc/96?img=53', 'Documentary Filmmaker', 'Documented six global tours in the last year.', 'Trending in the Creator community this week', 6),
    ('8d7a0f46-5b5d-4e46-8d19-3fa41a3e5a4a', 'loopalchemy', 'Nikhil Rao', 'https://i.pravatar.cc/96?img=9', 'Multi-instrumentalist', 'Hosts collaborative jam sessions every Thursday night.', 'Based on your recent collaborations', 2)
ON CONFLICT (id) DO NOTHING;

-- Track when a viewer last imported their contacts
CREATE TABLE IF NOT EXISTS public.friend_contact_imports (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    total_contacts integer NOT NULL DEFAULT 0,
    imported_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT friend_contact_imports_user_unique UNIQUE (user_id)
);

CREATE OR REPLACE FUNCTION public.set_friend_contact_imports_updated_at()
RETURNS trigger AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS friend_contact_imports_set_updated_at ON public.friend_contact_imports;
CREATE TRIGGER friend_contact_imports_set_updated_at
    BEFORE UPDATE ON public.friend_contact_imports
    FOR EACH ROW
    EXECUTE FUNCTION public.set_friend_contact_imports_updated_at();

ALTER TABLE public.friend_contact_imports ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "friend_contact_imports_select_own" ON public.friend_contact_imports;
CREATE POLICY "friend_contact_imports_select_own" ON public.friend_contact_imports
    FOR SELECT
    USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "friend_contact_imports_upsert_own" ON public.friend_contact_imports;
CREATE POLICY "friend_contact_imports_upsert_own" ON public.friend_contact_imports
    FOR ALL
    USING (auth.uid() = user_id)
    WITH CHECK (auth.uid() = user_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.friend_contact_imports TO authenticated;

CREATE INDEX IF NOT EXISTS friend_contact_imports_user_id_idx
    ON public.friend_contact_imports (user_id);

-- Persist outgoing invites so users can manage them across sessions
CREATE TABLE IF NOT EXISTS public.friend_invites (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    email text NOT NULL,
    status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'expired', 'cancelled')),
    sent_at timestamptz NOT NULL DEFAULT now(),
    last_sent_at timestamptz NOT NULL DEFAULT now(),
    sent_count integer NOT NULL DEFAULT 1,
    responded_at timestamptz,
    cancelled_at timestamptz,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE OR REPLACE FUNCTION public.set_friend_invites_updated_at()
RETURNS trigger AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS friend_invites_set_updated_at ON public.friend_invites;
CREATE TRIGGER friend_invites_set_updated_at
    BEFORE UPDATE ON public.friend_invites
    FOR EACH ROW
    EXECUTE FUNCTION public.set_friend_invites_updated_at();

ALTER TABLE public.friend_invites ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "friend_invites_select_own" ON public.friend_invites;
CREATE POLICY "friend_invites_select_own" ON public.friend_invites
    FOR SELECT
    USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "friend_invites_modify_own" ON public.friend_invites;
CREATE POLICY "friend_invites_modify_own" ON public.friend_invites
    FOR ALL
    USING (auth.uid() = user_id)
    WITH CHECK (auth.uid() = user_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.friend_invites TO authenticated;

CREATE INDEX IF NOT EXISTS friend_invites_user_id_idx
    ON public.friend_invites (user_id);

CREATE INDEX IF NOT EXISTS friend_invites_email_idx
    ON public.friend_invites (lower(email));
