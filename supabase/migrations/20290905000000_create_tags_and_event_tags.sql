-- Create a reusable user-owned tagging system for goals, projects, tasks, and habits.

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.proname = 'set_updated_at'
      AND pg_get_function_identity_arguments(p.oid) = ''
  ) THEN
    EXECUTE $fn$
      CREATE FUNCTION public.set_updated_at()
      RETURNS trigger AS $body$
      BEGIN
        NEW.updated_at = now();
        RETURN NEW;
      END;
      $body$ LANGUAGE plpgsql
    $fn$;
  END IF;
END
$$;

CREATE TABLE IF NOT EXISTS public.tags (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name text NOT NULL,
  normalized_name text NOT NULL,
  color text NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.event_tags (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  tag_id uuid NOT NULL REFERENCES public.tags(id) ON DELETE CASCADE,
  entity_type text NOT NULL,
  entity_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'tags_user_normalized_name_key'
      AND conrelid = 'public.tags'::regclass
  ) THEN
    ALTER TABLE public.tags
      ADD CONSTRAINT tags_user_normalized_name_key
      UNIQUE (user_id, normalized_name);
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'tags_name_not_blank'
      AND conrelid = 'public.tags'::regclass
  ) THEN
    ALTER TABLE public.tags
      ADD CONSTRAINT tags_name_not_blank
      CHECK (length(btrim(name)) > 0);
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'tags_normalized_name_not_blank'
      AND conrelid = 'public.tags'::regclass
  ) THEN
    ALTER TABLE public.tags
      ADD CONSTRAINT tags_normalized_name_not_blank
      CHECK (length(btrim(normalized_name)) > 0);
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'event_tags_entity_type_check'
      AND conrelid = 'public.event_tags'::regclass
  ) THEN
    ALTER TABLE public.event_tags
      ADD CONSTRAINT event_tags_entity_type_check
      CHECK (entity_type IN ('GOAL', 'PROJECT', 'TASK', 'HABIT'));
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'event_tags_user_entity_tag_key'
      AND conrelid = 'public.event_tags'::regclass
  ) THEN
    ALTER TABLE public.event_tags
      ADD CONSTRAINT event_tags_user_entity_tag_key
      UNIQUE (user_id, entity_type, entity_id, tag_id);
  END IF;
END
$$;

CREATE INDEX IF NOT EXISTS tags_user_id_idx
  ON public.tags (user_id);

CREATE INDEX IF NOT EXISTS event_tags_user_entity_idx
  ON public.event_tags (user_id, entity_type, entity_id);

CREATE INDEX IF NOT EXISTS event_tags_tag_id_idx
  ON public.event_tags (tag_id);

CREATE OR REPLACE FUNCTION public.ensure_event_tag_user_matches_tag()
RETURNS trigger AS $$
DECLARE
  tag_owner uuid;
BEGIN
  SELECT user_id
  INTO tag_owner
  FROM public.tags
  WHERE id = NEW.tag_id;

  IF tag_owner IS NULL THEN
    RAISE EXCEPTION 'tag_id % does not exist', NEW.tag_id;
  END IF;

  IF NEW.user_id IS DISTINCT FROM tag_owner THEN
    RAISE EXCEPTION 'event_tags.user_id must match tags.user_id';
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS tags_set_updated_at ON public.tags;
CREATE TRIGGER tags_set_updated_at
  BEFORE UPDATE ON public.tags
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS event_tags_validate_owner ON public.event_tags;
CREATE TRIGGER event_tags_validate_owner
  BEFORE INSERT OR UPDATE ON public.event_tags
  FOR EACH ROW
  EXECUTE FUNCTION public.ensure_event_tag_user_matches_tag();

ALTER TABLE public.tags ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.event_tags ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "tags_select_own" ON public.tags;
DROP POLICY IF EXISTS "tags_insert_own" ON public.tags;
DROP POLICY IF EXISTS "tags_update_own" ON public.tags;
DROP POLICY IF EXISTS "tags_delete_own" ON public.tags;

CREATE POLICY "tags_select_own" ON public.tags
  FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "tags_insert_own" ON public.tags
  FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "tags_update_own" ON public.tags
  FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "tags_delete_own" ON public.tags
  FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "event_tags_select_own" ON public.event_tags;
DROP POLICY IF EXISTS "event_tags_insert_own" ON public.event_tags;
DROP POLICY IF EXISTS "event_tags_update_own" ON public.event_tags;
DROP POLICY IF EXISTS "event_tags_delete_own" ON public.event_tags;

CREATE POLICY "event_tags_select_own" ON public.event_tags
  FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "event_tags_insert_own" ON public.event_tags
  FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "event_tags_update_own" ON public.event_tags
  FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "event_tags_delete_own" ON public.event_tags
  FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.tags TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.event_tags TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.tags TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.event_tags TO service_role;
