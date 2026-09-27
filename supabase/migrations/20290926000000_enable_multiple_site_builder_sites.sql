-- Site Builder multi-site support.
-- Safe to re-run after the live SQL was applied manually.

ALTER TABLE public.site_builder_sites
  DROP CONSTRAINT IF EXISTS site_builder_sites_user_id_key;

CREATE INDEX IF NOT EXISTS site_builder_sites_user_id_idx
  ON public.site_builder_sites (user_id);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'site_builder_sites_id_user_id_key'
  ) THEN
    ALTER TABLE public.site_builder_sites
      ADD CONSTRAINT site_builder_sites_id_user_id_key
      UNIQUE (id, user_id);
  END IF;
END $$;


ALTER TABLE public.site_builder_public_sites
  ADD COLUMN IF NOT EXISTS id uuid
  DEFAULT gen_random_uuid();

ALTER TABLE public.site_builder_public_sites
  ADD COLUMN IF NOT EXISTS site_id uuid;


UPDATE public.site_builder_public_sites published
SET site_id = draft.id
FROM public.site_builder_sites draft
WHERE draft.user_id = published.user_id
  AND published.site_id IS NULL;


ALTER TABLE public.site_builder_public_sites
  ALTER COLUMN id SET NOT NULL;

ALTER TABLE public.site_builder_public_sites
  ALTER COLUMN site_id SET NOT NULL;


DO $$
DECLARE
  pk_name text;
BEGIN
  SELECT conname
  INTO pk_name
  FROM pg_constraint
  WHERE conrelid = 'public.site_builder_public_sites'::regclass
    AND contype = 'p';

  IF pk_name IS NOT NULL
     AND pk_name <> 'site_builder_public_sites_pkey' THEN
    EXECUTE format(
      'ALTER TABLE public.site_builder_public_sites DROP CONSTRAINT %I',
      pk_name
    );
  END IF;
END $$;


DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conrelid =
      'public.site_builder_public_sites'::regclass
      AND contype = 'p'
      AND conname = 'site_builder_public_sites_pkey'
  ) THEN
    ALTER TABLE public.site_builder_public_sites
      ADD CONSTRAINT site_builder_public_sites_pkey
      PRIMARY KEY (id);
  END IF;
END $$;


DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'site_builder_public_sites_site_id_key'
  ) THEN
    ALTER TABLE public.site_builder_public_sites
      ADD CONSTRAINT site_builder_public_sites_site_id_key
      UNIQUE (site_id);
  END IF;
END $$;


DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'site_builder_public_sites_site_owner_fkey'
  ) THEN
    ALTER TABLE public.site_builder_public_sites
      ADD CONSTRAINT site_builder_public_sites_site_owner_fkey
      FOREIGN KEY (site_id, user_id)
      REFERENCES public.site_builder_sites (id, user_id)
      ON DELETE CASCADE;
  END IF;
END $$;


CREATE INDEX IF NOT EXISTS site_builder_public_sites_user_id_idx
  ON public.site_builder_public_sites (user_id);
