CREATE TABLE IF NOT EXISTS public.site_builder_public_sites (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  handle text NOT NULL UNIQUE,
  document jsonb NOT NULL,
  published_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT site_builder_public_sites_handle_check CHECK (
    char_length(handle) BETWEEN 1 AND 63
    AND handle = lower(handle)
    AND (
      handle ~ '^[a-z0-9]$'
      OR handle ~ '^[a-z0-9][a-z0-9-]*[a-z0-9]$'
    )
  )
);

DROP TRIGGER IF EXISTS site_builder_public_sites_set_updated_at
  ON public.site_builder_public_sites;

CREATE TRIGGER site_builder_public_sites_set_updated_at
  BEFORE UPDATE ON public.site_builder_public_sites
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.site_builder_public_sites ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS site_builder_public_sites_select_own
  ON public.site_builder_public_sites;

CREATE POLICY site_builder_public_sites_select_own
  ON public.site_builder_public_sites
  FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS site_builder_public_sites_insert_own
  ON public.site_builder_public_sites;

CREATE POLICY site_builder_public_sites_insert_own
  ON public.site_builder_public_sites
  FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS site_builder_public_sites_update_own
  ON public.site_builder_public_sites;

CREATE POLICY site_builder_public_sites_update_own
  ON public.site_builder_public_sites
  FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS site_builder_public_sites_delete_own
  ON public.site_builder_public_sites;

CREATE POLICY site_builder_public_sites_delete_own
  ON public.site_builder_public_sites
  FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);
