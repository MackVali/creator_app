-- Ensure every skill has a matching progress row and keep it in sync for new skills

-- Backfill existing skills into skill_progress
INSERT INTO public.skill_progress (user_id, skill_id)
SELECT s.user_id, s.id
FROM public.skills AS s
WHERE s.user_id IS NOT NULL
ON CONFLICT (user_id, skill_id) DO NOTHING;

-- Create a trigger to automatically seed progress when new skills are created
CREATE OR REPLACE FUNCTION public.on_skill_after_insert_seed_progress()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.user_id IS NULL THEN
    RETURN NEW;
  END IF;

  INSERT INTO public.skill_progress (user_id, skill_id)
  VALUES (NEW.user_id, NEW.id)
  ON CONFLICT (user_id, skill_id) DO NOTHING;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_skill_seed_progress ON public.skills;
CREATE TRIGGER trg_skill_seed_progress
AFTER INSERT ON public.skills
FOR EACH ROW
EXECUTE FUNCTION public.on_skill_after_insert_seed_progress();
