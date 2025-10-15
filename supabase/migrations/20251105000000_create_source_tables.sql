-- Ensure helper function to manage updated_at columns exists
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS trigger AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Table for storing outbound integrations configured by each user
CREATE TABLE IF NOT EXISTS public.source_integrations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  provider text NOT NULL,
  display_name text,
  connection_url text NOT NULL,
  publish_url text NOT NULL,
  publish_method text NOT NULL DEFAULT 'POST',
  auth_mode text NOT NULL DEFAULT 'none',
  auth_token text,
  headers jsonb,
  payload_template jsonb,
  status text NOT NULL DEFAULT 'active',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT source_integrations_method_check CHECK (publish_method IN ('POST', 'PUT', 'PATCH')),
  CONSTRAINT source_integrations_auth_check CHECK (auth_mode IN ('none', 'bearer', 'basic', 'api_key')),
  CONSTRAINT source_integrations_status_check CHECK (status IN ('active', 'disabled'))
);

CREATE INDEX IF NOT EXISTS source_integrations_user_idx
  ON public.source_integrations (user_id, status);

DROP TRIGGER IF EXISTS source_integrations_set_updated_at ON public.source_integrations;
CREATE TRIGGER source_integrations_set_updated_at
  BEFORE UPDATE ON public.source_integrations
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.source_integrations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "source_integrations_select" ON public.source_integrations;
CREATE POLICY "source_integrations_select" ON public.source_integrations
  FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "source_integrations_insert" ON public.source_integrations;
CREATE POLICY "source_integrations_insert" ON public.source_integrations
  FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "source_integrations_update" ON public.source_integrations;
CREATE POLICY "source_integrations_update" ON public.source_integrations
  FOR UPDATE TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "source_integrations_delete" ON public.source_integrations;
CREATE POLICY "source_integrations_delete" ON public.source_integrations
  FOR DELETE TO authenticated
  USING (auth.uid() = user_id);

GRANT ALL ON public.source_integrations TO authenticated;

-- Table for published listings that get distributed across integrations
CREATE TABLE IF NOT EXISTS public.source_listings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  type text NOT NULL,
  title text NOT NULL,
  description text,
  price numeric(12,2),
  currency text NOT NULL DEFAULT 'USD',
  status text NOT NULL DEFAULT 'draft',
  metadata jsonb,
  publish_results jsonb,
  published_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT source_listings_type_check CHECK (type IN ('product', 'service')),
  CONSTRAINT source_listings_status_check CHECK (status IN ('draft', 'queued', 'published', 'needs_attention')),
  CONSTRAINT source_listings_currency_check CHECK (char_length(currency) = 3)
);

CREATE INDEX IF NOT EXISTS source_listings_user_idx
  ON public.source_listings (user_id, status, created_at DESC);

DROP TRIGGER IF EXISTS source_listings_set_updated_at ON public.source_listings;
CREATE TRIGGER source_listings_set_updated_at
  BEFORE UPDATE ON public.source_listings
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.source_listings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "source_listings_select" ON public.source_listings;
CREATE POLICY "source_listings_select" ON public.source_listings
  FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "source_listings_insert" ON public.source_listings;
CREATE POLICY "source_listings_insert" ON public.source_listings
  FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "source_listings_update" ON public.source_listings;
CREATE POLICY "source_listings_update" ON public.source_listings
  FOR UPDATE TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "source_listings_delete" ON public.source_listings;
CREATE POLICY "source_listings_delete" ON public.source_listings
  FOR DELETE TO authenticated
  USING (auth.uid() = user_id);

GRANT ALL ON public.source_listings TO authenticated;
