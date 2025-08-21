-- Idempotent migration to add ownership fields, FKs, indexes and timestamps
-- Targets: goals, projects, tasks, habits, skills, monuments

-- 1) Columns: user_id, created_at, updated_at
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_proc WHERE proname = 'set_updated_at'
  ) THEN
    CREATE OR REPLACE FUNCTION public.set_updated_at()
    RETURNS trigger LANGUAGE plpgsql AS $$
    BEGIN
      NEW.updated_at = now();
      RETURN NEW;
    END
    $$;
  END IF;
END$$;

-- Helper to add timestamp columns and trigger for a table
DO $$
DECLARE t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY['goals','projects','tasks','habits','skills','monuments'] LOOP
    EXECUTE format('ALTER TABLE IF EXISTS public.%I ADD COLUMN IF NOT EXISTS user_id uuid', t);
    EXECUTE format('ALTER TABLE IF EXISTS public.%I ADD COLUMN IF NOT EXISTS created_at timestamptz NOT NULL DEFAULT now()', t);
    EXECUTE format('ALTER TABLE IF EXISTS public.%I ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now()', t);

    -- Trigger: updated_at
    IF NOT EXISTS (
      SELECT 1
      FROM pg_trigger trg
      JOIN pg_class cls ON cls.oid = trg.tgrelid
      WHERE cls.relname = t AND trg.tgname = t || '_set_updated_at'
    ) THEN
      EXECUTE format('CREATE TRIGGER %I_set_updated_at BEFORE UPDATE ON public.%I FOR EACH ROW EXECUTE FUNCTION public.set_updated_at()', t, t);
    END IF;
  END LOOP;
END$$;

-- 2) FKs: user_id → auth.users(id) (CASCADE delete)
DO $$
DECLARE t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY['goals','projects','tasks','habits','skills','monuments'] LOOP
    IF NOT EXISTS (
      SELECT 1 FROM pg_constraint c
      JOIN pg_class r ON r.oid = c.conrelid
      WHERE r.relname = t AND c.conname = t || '_user_id_fkey'
    ) THEN
      EXECUTE format('ALTER TABLE IF EXISTS public.%I
        ADD CONSTRAINT %I_user_id_fkey FOREIGN KEY (user_id)
        REFERENCES auth.users(id) ON UPDATE CASCADE ON DELETE CASCADE', t, t);
    END IF;
  END LOOP;
END$$;

-- 3) Indexes on user_id and existing FKs (if columns exist)
DO $$
DECLARE rec RECORD;
BEGIN
  FOR rec IN SELECT 'goals' AS t, unnest(ARRAY['user_id','energy_id','priority_id','stage_id','monument_id']) AS col
  UNION ALL SELECT 'projects', unnest(ARRAY['user_id','energy_id','priority_id','stage_id','goal_id'])
  UNION ALL SELECT 'tasks',    unnest(ARRAY['user_id','energy_id','priority_id','stage_id','project_id'])
  UNION ALL SELECT 'habits',   unnest(ARRAY['user_id','type_id'])
  UNION ALL SELECT 'skills',   unnest(ARRAY['user_id','cat_id'])
  UNION ALL SELECT 'monuments',unnest(ARRAY['user_id'])
  LOOP
    IF EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = rec.t AND column_name = rec.col
    ) THEN
      EXECUTE format('CREATE INDEX IF NOT EXISTS %I ON public.%I (%I)', rec.t || '_' || rec.col || '_idx', rec.t, rec.col);
    END IF;
  END LOOP;
END$$;


