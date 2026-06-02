-- Create the global/community skill catalog foundation without backfilling user skills.

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

CREATE TABLE IF NOT EXISTS public.global_skill_categories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  slug text NOT NULL UNIQUE,
  icon text,
  description text,
  sort_order integer NOT NULL DEFAULT 0,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.global_skill_subcategories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  category_id uuid NOT NULL REFERENCES public.global_skill_categories(id) ON DELETE CASCADE,
  name text NOT NULL,
  slug text NOT NULL,
  description text,
  sort_order integer NOT NULL DEFAULT 0,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT global_skill_subcategories_category_slug_key UNIQUE (category_id, slug)
);

CREATE TABLE IF NOT EXISTS public.global_skills (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  category_id uuid NOT NULL REFERENCES public.global_skill_categories(id) ON DELETE RESTRICT,
  subcategory_id uuid REFERENCES public.global_skill_subcategories(id) ON DELETE SET NULL,
  name text NOT NULL,
  slug text NOT NULL UNIQUE,
  icon text NOT NULL DEFAULT '◇',
  description text,
  popular_order integer,
  sort_order integer NOT NULL DEFAULT 0,
  is_popular boolean NOT NULL DEFAULT false,
  is_active boolean NOT NULL DEFAULT true,
  feature_key text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.skills
  ADD COLUMN IF NOT EXISTS global_skill_id uuid REFERENCES public.global_skills(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS global_skill_categories_active_sort_idx
  ON public.global_skill_categories(is_active, sort_order, name);

CREATE INDEX IF NOT EXISTS global_skill_subcategories_category_sort_idx
  ON public.global_skill_subcategories(category_id, is_active, sort_order, name);

CREATE INDEX IF NOT EXISTS global_skills_category_subcategory_sort_idx
  ON public.global_skills(category_id, subcategory_id, is_active, sort_order, name);

CREATE INDEX IF NOT EXISTS global_skills_popular_order_idx
  ON public.global_skills(popular_order, sort_order, name)
  WHERE is_active = true AND is_popular = true;

CREATE INDEX IF NOT EXISTS skills_global_skill_id_idx
  ON public.skills(global_skill_id);

CREATE UNIQUE INDEX IF NOT EXISTS skills_user_global_skill_id_unique_idx
  ON public.skills(user_id, global_skill_id)
  WHERE global_skill_id IS NOT NULL;

DROP TRIGGER IF EXISTS global_skill_categories_set_updated_at ON public.global_skill_categories;
CREATE TRIGGER global_skill_categories_set_updated_at
  BEFORE UPDATE ON public.global_skill_categories
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS global_skill_subcategories_set_updated_at ON public.global_skill_subcategories;
CREATE TRIGGER global_skill_subcategories_set_updated_at
  BEFORE UPDATE ON public.global_skill_subcategories
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS global_skills_set_updated_at ON public.global_skills;
CREATE TRIGGER global_skills_set_updated_at
  BEFORE UPDATE ON public.global_skills
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.global_skill_categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.global_skill_subcategories ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.global_skills ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "global_skill_categories_select_active" ON public.global_skill_categories;
CREATE POLICY "global_skill_categories_select_active" ON public.global_skill_categories
  FOR SELECT TO authenticated
  USING (is_active = true);

DROP POLICY IF EXISTS "global_skill_subcategories_select_active" ON public.global_skill_subcategories;
CREATE POLICY "global_skill_subcategories_select_active" ON public.global_skill_subcategories
  FOR SELECT TO authenticated
  USING (
    is_active = true
    AND EXISTS (
      SELECT 1
      FROM public.global_skill_categories c
      WHERE c.id = category_id
        AND c.is_active = true
    )
  );

DROP POLICY IF EXISTS "global_skills_select_active" ON public.global_skills;
CREATE POLICY "global_skills_select_active" ON public.global_skills
  FOR SELECT TO authenticated
  USING (
    is_active = true
    AND EXISTS (
      SELECT 1
      FROM public.global_skill_categories c
      WHERE c.id = category_id
        AND c.is_active = true
    )
    AND (
      subcategory_id IS NULL
      OR EXISTS (
        SELECT 1
        FROM public.global_skill_subcategories sc
        WHERE sc.id = subcategory_id
          AND sc.is_active = true
      )
    )
  );

GRANT SELECT ON public.global_skill_categories TO authenticated;
GRANT SELECT ON public.global_skill_subcategories TO authenticated;
GRANT SELECT ON public.global_skills TO authenticated;
