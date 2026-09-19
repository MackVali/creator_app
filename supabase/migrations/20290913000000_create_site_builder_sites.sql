CREATE TABLE IF NOT EXISTS public.site_builder_sites (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  draft_document jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT site_builder_sites_user_id_key UNIQUE (user_id)
);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.proname = 'set_updated_at'
  ) THEN
    CREATE FUNCTION public.set_updated_at()
    RETURNS trigger
    LANGUAGE plpgsql
    AS $function$
    BEGIN
      NEW.updated_at = now();
      RETURN NEW;
    END;
    $function$;
  END IF;
END
$$;

DROP TRIGGER IF EXISTS site_builder_sites_set_updated_at
  ON public.site_builder_sites;
CREATE TRIGGER site_builder_sites_set_updated_at
  BEFORE UPDATE ON public.site_builder_sites
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.site_builder_sites ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS site_builder_sites_select_own
  ON public.site_builder_sites;
CREATE POLICY site_builder_sites_select_own
  ON public.site_builder_sites
  FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS site_builder_sites_insert_own
  ON public.site_builder_sites;
CREATE POLICY site_builder_sites_insert_own
  ON public.site_builder_sites
  FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS site_builder_sites_update_own
  ON public.site_builder_sites;
CREATE POLICY site_builder_sites_update_own
  ON public.site_builder_sites
  FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);
