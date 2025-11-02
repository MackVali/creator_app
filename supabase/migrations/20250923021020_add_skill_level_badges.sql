-- Extend badge catalog to support skill level badges and seed predefined tiers
-- while ensuring badge synchronization handles both prestige and level awards.

-- 1. Allow skill level badge type ------------------------------------------------
ALTER TABLE public.badges
  DROP CONSTRAINT IF EXISTS badges_badge_type_check;

ALTER TABLE public.badges
  ADD CONSTRAINT badges_badge_type_check
  CHECK (
    badge_type IN (
      'user_prestige_badge',
      'skill_prestige_badge',
      'skill_level_badge'
    )
  );

COMMENT ON CONSTRAINT badges_badge_type_check ON public.badges IS
  'Restricts badge catalog entries to the supported badge categories.';

-- 2. Seed skill level badge definitions -----------------------------------------
INSERT INTO public.badges (badge_type, level, emoji, label, description)
VALUES
  ('skill_level_badge', 10, '🌟', 'Skill Level 10', 'Awarded for reaching skill level 10.'),
  ('skill_level_badge', 20, '💫', 'Skill Level 20', 'Awarded for reaching skill level 20.'),
  ('skill_level_badge', 30, '⚡️', 'Skill Level 30', 'Awarded for reaching skill level 30.'),
  ('skill_level_badge', 40, '🌞', 'Skill Level 40', 'Awarded for reaching skill level 40.'),
  ('skill_level_badge', 50, '🐲', 'Skill Level 50', 'Awarded for reaching skill level 50.'),
  ('skill_level_badge', 75, '🐉', 'Skill Level 75', 'Awarded for reaching skill level 75.'),
  ('skill_level_badge', 90, '🐦‍🔥', 'Skill Level 90', 'Awarded for reaching skill level 90.'),
  ('skill_level_badge', 100, '⛓️‍💥', 'Skill Level 100', 'Awarded for reaching skill level 100.')
ON CONFLICT (badge_type, level) DO UPDATE
SET emoji = EXCLUDED.emoji,
    label = EXCLUDED.label,
    description = EXCLUDED.description;

-- 3. Synchronization helpers for skill level badges -----------------------------
CREATE OR REPLACE FUNCTION public.sync_skill_level_badges(
  p_user uuid,
  p_skill uuid,
  p_level integer
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_target integer := GREATEST(p_level, 0);
BEGIN
  INSERT INTO public.skill_badges (user_id, skill_id, badge_id)
  SELECT p_user, p_skill, b.id
  FROM public.badges b
  LEFT JOIN public.skill_badges sb
    ON sb.user_id = p_user
   AND sb.skill_id = p_skill
   AND sb.badge_id = b.id
  WHERE b.badge_type = 'skill_level_badge'
    AND b.level <= v_target
    AND sb.id IS NULL;

  DELETE FROM public.skill_badges sb
  USING public.badges b
  WHERE sb.user_id = p_user
    AND sb.skill_id = p_skill
    AND sb.badge_id = b.id
    AND b.badge_type = 'skill_level_badge'
    AND b.level > v_target;
END;
$$;

COMMENT ON FUNCTION public.sync_skill_level_badges(uuid, uuid, integer) IS
  'Grants or revokes skill level badges so they mirror the latest recorded level.';

-- 4. Update trigger hook to synchronize both prestige and level badges ----------
CREATE OR REPLACE FUNCTION public.on_skill_progress_sync_badges()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM public.sync_skill_prestige_badges(NEW.user_id, NEW.skill_id, COALESCE(NEW.prestige, 0));
  PERFORM public.sync_skill_level_badges(NEW.user_id, NEW.skill_id, COALESCE(NEW.level, 0));
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_skill_progress_prestige_badges ON public.skill_progress;
CREATE TRIGGER trg_skill_progress_prestige_badges
AFTER INSERT OR UPDATE OF level, prestige ON public.skill_progress
FOR EACH ROW EXECUTE FUNCTION public.on_skill_progress_sync_badges();

-- 5. Backfill existing rows to ensure level badges are granted -------------------
UPDATE public.skill_progress
SET level = public.skill_progress.level
WHERE level IS NOT NULL;
