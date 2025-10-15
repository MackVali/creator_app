-- =========================
-- CREATOR: Leveling System
-- =========================
-- Rules baked in:
-- - Flat awards: task=+1, habit=+1, project=+3, goal=+5 (inserted as xp_events.amount)
-- - Skills: level 1..100; reaching 101 -> reset to 1, prestige += 1 (max 10), carry leftover XP
-- - XP-to-next-level = baseBracket(level) + 2*prestige
--   Brackets: 1-9:10 | 10-19:14 | 20-29:20 | 30-39:24 | 40-99:30 | 100:50
-- - Each skill level-up emits +1 dark XP (dark_xp_events), and user_level = total_dark_xp (1:1 for now)

-- Dependencies
CREATE EXTENSION IF NOT EXISTS pgcrypto;  -- gen_random_uuid()

-- ---------- Types ----------
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'xp_kind') THEN
    CREATE TYPE public.xp_kind AS ENUM ('task','habit','project','goal','manual');
  END IF;
END$$;

-- ---------- Tables ----------
CREATE TABLE IF NOT EXISTS public.xp_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  kind public.xp_kind NOT NULL,
  amount integer NOT NULL,                     -- can be negative for compensations
  schedule_instance_id uuid,                   -- dedupe hook
  skill_id uuid,                               -- target skill (optional if only charging monuments)
  monument_id uuid,                            -- optional: charge tracking
  award_key text,                              -- optional idempotency key from app
  source text                                  -- free-form: 'schedule_complete', etc.
);

-- Prevent accidental double-awards when an idempotency key is provided
CREATE UNIQUE INDEX IF NOT EXISTS xp_events_user_awardkey_uidx
  ON public.xp_events(user_id, award_key)
  WHERE award_key IS NOT NULL;

-- Simple accelerator indexes
CREATE INDEX IF NOT EXISTS xp_events_user_idx ON public.xp_events(user_id);
CREATE INDEX IF NOT EXISTS xp_events_skill_idx ON public.xp_events(skill_id);
CREATE INDEX IF NOT EXISTS xp_events_sched_idx ON public.xp_events(schedule_instance_id);

-- Skill progress snapshot
CREATE TABLE IF NOT EXISTS public.skill_progress (
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  skill_id uuid NOT NULL,
  level integer NOT NULL DEFAULT 1,            -- 1..100
  prestige integer NOT NULL DEFAULT 0 CHECK (prestige BETWEEN 0 AND 10),
  xp_into_level integer NOT NULL DEFAULT 0,    -- 0..(req-1)
  total_xp bigint NOT NULL DEFAULT 0,          -- analytics
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, skill_id)
);

-- Dark XP events (from skill level changes)
CREATE TABLE IF NOT EXISTS public.dark_xp_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  skill_id uuid NOT NULL,                      -- which skill triggered it
  new_skill_level integer NOT NULL,            -- level after change
  amount integer NOT NULL DEFAULT 1            -- usually +1, can be -1 if rolling levels back
);

CREATE INDEX IF NOT EXISTS dark_xp_user_idx ON public.dark_xp_events(user_id);

-- User progression snapshot (1:1 with dark XP for now)
CREATE TABLE IF NOT EXISTS public.user_progress (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  total_dark_xp bigint NOT NULL DEFAULT 0,
  current_level bigint NOT NULL DEFAULT 0,     -- same as total_dark_xp for now
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- ---------- Utility Functions ----------
-- Base bracket cost by level (no prestige)
CREATE OR REPLACE FUNCTION public.skill_base_cost(p_level integer)
RETURNS integer
LANGUAGE sql
STABLE
AS $$
  SELECT CASE
    WHEN p_level BETWEEN 1 AND 9 THEN 10
    WHEN p_level BETWEEN 10 AND 19 THEN 14
    WHEN p_level BETWEEN 20 AND 29 THEN 20
    WHEN p_level BETWEEN 30 AND 39 THEN 24
    WHEN p_level BETWEEN 40 AND 99 THEN 30
    WHEN p_level = 100 THEN 50
    ELSE 30  -- fallback; 101 is rollover, but keep a sane default
  END
$$;

-- Effective cost including prestige (prestige starts at 0)
CREATE OR REPLACE FUNCTION public.skill_cost(p_level integer, p_prestige integer)
RETURNS integer
LANGUAGE sql
STABLE
AS $$
  SELECT public.skill_base_cost(p_level) + GREATEST(0, p_prestige) * 2
$$;

-- ---------- Core Engine (SECURITY DEFINER to bypass RLS) ----------
CREATE OR REPLACE FUNCTION public.apply_skill_xp(p_user uuid, p_skill uuid, p_amount integer)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_level integer;
  v_prestige integer;
  v_into integer;
  v_req integer;
  v_amt integer := p_amount;
  v_levels_up integer := 0;
  v_levels_down integer := 0;
BEGIN
  -- Ensure a progress row exists
  INSERT INTO public.skill_progress(user_id, skill_id)
  VALUES (p_user, p_skill)
  ON CONFLICT (user_id, skill_id) DO NOTHING;

  SELECT level, prestige, xp_into_level
  INTO v_level, v_prestige, v_into
  FROM public.skill_progress
  WHERE user_id = p_user AND skill_id = p_skill
  FOR UPDATE;

  IF v_amt > 0 THEN
    -- Leveling up path
    LOOP
      v_req := public.skill_cost(v_level, v_prestige);
      IF v_into + v_amt < v_req THEN
        v_into := v_into + v_amt;
        v_amt := 0;
      ELSE
        v_amt := v_into + v_amt - v_req;
        v_into := 0;
        v_level := v_level + 1;
        v_levels_up := v_levels_up + 1;
        -- Emit +1 dark XP per level
        INSERT INTO public.dark_xp_events(user_id, skill_id, new_skill_level, amount)
        VALUES (p_user, p_skill, v_level, 1);

        -- Rollover at 101 -> back to 1; prestige++
        IF v_level = 101 THEN
          v_level := 1;
          v_prestige := LEAST(v_prestige + 1, 10);
        END IF;
      END IF;

      EXIT WHEN v_amt = 0;
    END LOOP;

  ELSIF v_amt < 0 THEN
    -- Leveling down path (compensations/undo)
    v_amt := -v_amt;
    LOOP
      IF v_into >= v_amt THEN
        v_into := v_into - v_amt;
        v_amt := 0;
      ELSE
        v_amt := v_amt - v_into;
        -- Need to drop a level if possible
        IF v_level = 1 AND v_prestige = 0 THEN
          v_into := 0;
          v_amt := 0; -- clamp at floor
        ELSE
          -- Step down one level
          IF v_level = 1 AND v_prestige > 0 THEN
            v_prestige := v_prestige - 1;
            v_level := 100;
          ELSE
            v_level := v_level - 1;
          END IF;
          v_levels_down := v_levels_down + 1;

          -- Emit -1 dark XP per level lost
          INSERT INTO public.dark_xp_events(user_id, skill_id, new_skill_level, amount)
          VALUES (p_user, p_skill, v_level, -1);

          -- After stepping down, we "fill" prior level requirement so we can subtract more
          v_req := public.skill_cost(v_level, v_prestige);
          v_into := v_req;
        END IF;
      END IF;

      EXIT WHEN v_amt = 0;
    END LOOP;
  END IF;

  -- Persist snapshot
  UPDATE public.skill_progress
  SET level = v_level,
      prestige = v_prestige,
      xp_into_level = v_into,
      total_xp = GREATEST(0, total_xp + p_amount),
      updated_at = now()
  WHERE user_id = p_user AND skill_id = p_skill;
END;
$$;

-- Recalc/maintain user_progress from dark_xp_events (incremental)
CREATE OR REPLACE FUNCTION public.on_dark_xp_after() RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.user_progress(user_id, total_dark_xp, current_level, updated_at)
  VALUES (NEW.user_id, GREATEST(NEW.amount,0), GREATEST(NEW.amount,0), now())
  ON CONFLICT (user_id) DO UPDATE
  SET total_dark_xp = GREATEST(0, public.user_progress.total_dark_xp + NEW.amount),
      current_level = GREATEST(0, public.user_progress.current_level + NEW.amount),
      updated_at = now();
  RETURN NEW;
END;
$$;

-- Apply skill XP whenever an xp_event is inserted (if it targets a skill)
CREATE OR REPLACE FUNCTION public.on_xp_event_after() RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.skill_id IS NOT NULL AND NEW.amount <> 0 THEN
    PERFORM public.apply_skill_xp(NEW.user_id, NEW.skill_id, NEW.amount);
  END IF;
  RETURN NEW;
END;
$$;

-- ---------- Triggers ----------
DROP TRIGGER IF EXISTS trg_dark_xp_after ON public.dark_xp_events;
CREATE TRIGGER trg_dark_xp_after
AFTER INSERT ON public.dark_xp_events
FOR EACH ROW EXECUTE FUNCTION public.on_dark_xp_after();

DROP TRIGGER IF EXISTS trg_xp_events_after ON public.xp_events;
CREATE TRIGGER trg_xp_events_after
AFTER INSERT ON public.xp_events
FOR EACH ROW EXECUTE FUNCTION public.on_xp_event_after();

-- ---------- RLS ----------
-- xp_events: allow users to read & insert their own (you can tighten to service role only if desired)
ALTER TABLE public.xp_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS xp_events_select_own ON public.xp_events;
CREATE POLICY xp_events_select_own ON public.xp_events
  FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS xp_events_insert_own ON public.xp_events;
CREATE POLICY xp_events_insert_own ON public.xp_events
  FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);

-- No UPDATE/DELETE policy -> effectively append-only for clients.

-- skill_progress: read own; writes via SECURITY DEFINER functions only
ALTER TABLE public.skill_progress ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS skill_progress_select_own ON public.skill_progress;
CREATE POLICY skill_progress_select_own ON public.skill_progress
  FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

-- dark_xp_events: read own; inserts happen via engine
ALTER TABLE public.dark_xp_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS dark_xp_select_own ON public.dark_xp_events;
CREATE POLICY dark_xp_select_own ON public.dark_xp_events
  FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

-- user_progress: read own; updates via trigger
ALTER TABLE public.user_progress ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS user_progress_select_own ON public.user_progress;
CREATE POLICY user_progress_select_own ON public.user_progress
  FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

-- (Optional) If you want service role full access, uncomment:
-- CREATE POLICY skill_progress_rw_service ON public.skill_progress FOR ALL TO service_role USING (true) WITH CHECK (true);
-- CREATE POLICY dark_xp_rw_service    ON public.dark_xp_events FOR ALL TO service_role USING (true) WITH CHECK (true);
-- CREATE POLICY user_progress_rw_service ON public.user_progress FOR ALL TO service_role USING (true) WITH CHECK (true);
-- CREATE POLICY xp_events_rw_service  ON public.xp_events FOR ALL TO service_role USING (true) WITH CHECK (true);
