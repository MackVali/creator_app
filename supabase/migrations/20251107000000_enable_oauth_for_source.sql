ALTER TABLE public.source_integrations
  DROP CONSTRAINT IF EXISTS source_integrations_auth_check;

ALTER TABLE public.source_integrations
  ADD COLUMN IF NOT EXISTS oauth_authorize_url text,
  ADD COLUMN IF NOT EXISTS oauth_token_url text,
  ADD COLUMN IF NOT EXISTS oauth_scopes text[],
  ADD COLUMN IF NOT EXISTS oauth_client_id text,
  ADD COLUMN IF NOT EXISTS oauth_client_secret text,
  ADD COLUMN IF NOT EXISTS oauth_access_token text,
  ADD COLUMN IF NOT EXISTS oauth_refresh_token text,
  ADD COLUMN IF NOT EXISTS oauth_expires_at timestamptz,
  ADD COLUMN IF NOT EXISTS oauth_metadata jsonb;

ALTER TABLE public.source_integrations
  ADD CONSTRAINT source_integrations_auth_check
  CHECK (
    auth_mode IN ('none', 'bearer', 'basic', 'api_key', 'oauth2')
  );

CREATE TABLE IF NOT EXISTS public.source_oauth_states (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  integration_id uuid NOT NULL REFERENCES public.source_integrations (id) ON DELETE CASCADE,
  state text NOT NULL UNIQUE,
  code_verifier text NOT NULL,
  redirect_uri text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL DEFAULT now() + interval '15 minutes'
);

ALTER TABLE public.source_oauth_states ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "source_oauth_states_select" ON public.source_oauth_states;
CREATE POLICY "source_oauth_states_select" ON public.source_oauth_states
  FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "source_oauth_states_insert" ON public.source_oauth_states;
CREATE POLICY "source_oauth_states_insert" ON public.source_oauth_states
  FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "source_oauth_states_delete" ON public.source_oauth_states;
CREATE POLICY "source_oauth_states_delete" ON public.source_oauth_states
  FOR DELETE TO authenticated
  USING (auth.uid() = user_id);

GRANT ALL ON public.source_oauth_states TO authenticated;
