-- Prestige badge infrastructure

-- 1. Badge catalog
CREATE TABLE IF NOT EXISTS public.badges (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  badge_type text NOT NULL CHECK (badge_type IN ('user_prestige_badge', 'skill_prestige_badge')),
  level integer NOT NULL CHECK (level >= 0),
  emoji text NOT NULL,
  label text NOT NULL,
  description text,
  metadata jsonb,
  UNIQUE (badge_type, level)
);

COMMENT ON TABLE public.badges IS 'Standardized catalog of prestige badges for users and skills.';
COMMENT ON COLUMN public.badges.badge_type IS 'Badge family. user_prestige_badge applies to account-wide prestige, skill_prestige_badge applies to skill prestige.';
COMMENT ON COLUMN public.badges.level IS 'Prestige tier this badge represents (0-indexed for base tier, incrementing by 1 for each prestige).';

-- Seed the prestige badges with the designated emoji per tier.
INSERT INTO public.badges (badge_type, level, emoji, label, description)
VALUES
  ('user_prestige_badge', 1, '🎖', 'User Prestige I', 'Awarded for reaching prestige level 1.'),
  ('user_prestige_badge', 2, '🔰', 'User Prestige II', 'Awarded for reaching prestige level 2.'),
  ('user_prestige_badge', 3, '🪼', 'User Prestige III', 'Awarded for reaching prestige level 3.'),
  ('skill_prestige_badge', 1, '🎖', 'Skill Prestige I', 'Awarded for raising a skill to prestige level 1.'),
  ('skill_prestige_badge', 2, '🔰', 'Skill Prestige II', 'Awarded for raising a skill to prestige level 2.'),
  ('skill_prestige_badge', 3, '🪼', 'Skill Prestige III', 'Awarded for raising a skill to prestige level 3.')
ON CONFLICT (badge_type, level) DO UPDATE
SET emoji = EXCLUDED.emoji,
    label = EXCLUDED.label,
    description = EXCLUDED.description;

-- 2. User prestige badges (account-wide)
CREATE TABLE IF NOT EXISTS public.user_badges (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  badge_id uuid NOT NULL REFERENCES public.badges(id) ON DELETE CASCADE,
  awarded_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, badge_id)
);

COMMENT ON TABLE public.user_badges IS 'Catalog of prestige badges earned by a user at the account level.';

-- 3. Skill prestige badges (per-skill)
CREATE TABLE IF NOT EXISTS public.skill_badges (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  skill_id uuid NOT NULL,
  badge_id uuid NOT NULL REFERENCES public.badges(id) ON DELETE CASCADE,
  awarded_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, skill_id, badge_id),
  CONSTRAINT skill_badges_progress_fk FOREIGN KEY (user_id, skill_id)
    REFERENCES public.skill_progress(user_id, skill_id) ON DELETE CASCADE
);

COMMENT ON TABLE public.skill_badges IS 'Catalog of prestige badges earned for specific user skills.';

-- Indexes for faster lookups
CREATE INDEX IF NOT EXISTS user_badges_user_idx ON public.user_badges(user_id);
CREATE INDEX IF NOT EXISTS skill_badges_user_skill_idx ON public.skill_badges(user_id, skill_id);
CREATE INDEX IF NOT EXISTS skill_badges_badge_idx ON public.skill_badges(badge_id);

-- 4. User prestige tracking column
ALTER TABLE public.user_progress
  ADD COLUMN IF NOT EXISTS prestige integer NOT NULL DEFAULT 0 CHECK (prestige >= 0);

COMMENT ON COLUMN public.user_progress.prestige IS 'Number of prestige resets completed by the user across the global level track.';

-- 5. Synchronization helpers -------------------------------------------------
CREATE OR REPLACE FUNCTION public.sync_user_prestige_badges(p_user uuid, p_prestige integer)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_target integer := GREATEST(p_prestige, 0);
BEGIN
  -- Award any missing badges up to the prestige tier.
  INSERT INTO public.user_badges (user_id, badge_id)
  SELECT p_user, b.id
  FROM public.badges b
  LEFT JOIN public.user_badges ub ON ub.user_id = p_user AND ub.badge_id = b.id
  WHERE b.badge_type = 'user_prestige_badge'
    AND b.level BETWEEN 1 AND v_target
    AND ub.id IS NULL;

  -- Remove badges above the prestige tier (in case prestige was reduced).
  DELETE FROM public.user_badges ub
  USING public.badges b
  WHERE ub.user_id = p_user
    AND ub.badge_id = b.id
    AND b.badge_type = 'user_prestige_badge'
    AND b.level > v_target;
END;
$$;

CREATE OR REPLACE FUNCTION public.sync_skill_prestige_badges(p_user uuid, p_skill uuid, p_prestige integer)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_target integer := GREATEST(p_prestige, 0);
BEGIN
  INSERT INTO public.skill_badges (user_id, skill_id, badge_id)
  SELECT p_user, p_skill, b.id
  FROM public.badges b
  LEFT JOIN public.skill_badges sb
    ON sb.user_id = p_user AND sb.skill_id = p_skill AND sb.badge_id = b.id
  WHERE b.badge_type = 'skill_prestige_badge'
    AND b.level BETWEEN 1 AND v_target
    AND sb.id IS NULL;

  DELETE FROM public.skill_badges sb
  USING public.badges b
  WHERE sb.user_id = p_user
    AND sb.skill_id = p_skill
    AND sb.badge_id = b.id
    AND b.badge_type = 'skill_prestige_badge'
    AND b.level > v_target;
END;
$$;

-- 6. Triggers to keep badges in sync -----------------------------------------
CREATE OR REPLACE FUNCTION public.on_user_progress_sync_badges()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM public.sync_user_prestige_badges(NEW.user_id, NEW.prestige);
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_user_progress_prestige_badges ON public.user_progress;
CREATE TRIGGER trg_user_progress_prestige_badges
AFTER INSERT OR UPDATE OF prestige ON public.user_progress
FOR EACH ROW EXECUTE FUNCTION public.on_user_progress_sync_badges();

CREATE OR REPLACE FUNCTION public.on_skill_progress_sync_badges()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM public.sync_skill_prestige_badges(NEW.user_id, NEW.skill_id, NEW.prestige);
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_skill_progress_prestige_badges ON public.skill_progress;
CREATE TRIGGER trg_skill_progress_prestige_badges
AFTER INSERT OR UPDATE OF prestige ON public.skill_progress
FOR EACH ROW EXECUTE FUNCTION public.on_skill_progress_sync_badges();

-- 7. RLS setup ----------------------------------------------------------------
ALTER TABLE public.badges ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_badges ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.skill_badges ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS badges_read_all ON public.badges;
CREATE POLICY badges_read_all ON public.badges
  FOR SELECT USING (true);

DROP POLICY IF EXISTS user_badges_select_own ON public.user_badges;
CREATE POLICY user_badges_select_own ON public.user_badges
  FOR SELECT TO authenticated USING (user_id = auth.uid());

DROP POLICY IF EXISTS skill_badges_select_own ON public.skill_badges;
CREATE POLICY skill_badges_select_own ON public.skill_badges
  FOR SELECT TO authenticated USING (user_id = auth.uid());

-- Badge awarding happens via SECURITY DEFINER functions; block direct writes.
REVOKE ALL ON public.user_badges FROM PUBLIC;
REVOKE ALL ON public.skill_badges FROM PUBLIC;
GRANT SELECT ON public.badges TO anon, authenticated, service_role;
GRANT SELECT ON public.user_badges TO authenticated, service_role;
GRANT SELECT ON public.skill_badges TO authenticated, service_role;
GRANT ALL ON public.badges TO service_role;
GRANT ALL ON public.user_badges TO service_role;
GRANT ALL ON public.skill_badges TO service_role;
