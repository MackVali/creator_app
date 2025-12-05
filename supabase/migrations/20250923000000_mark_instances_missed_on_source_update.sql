-- Mark related schedule instances as missed whenever a habit or project changes.
BEGIN;

CREATE OR REPLACE FUNCTION public.mark_schedule_instances_missed()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  target_source text := TG_ARGV[0];
BEGIN
  IF target_source IS NULL THEN
    RETURN NEW;
  END IF;

  UPDATE public.schedule_instances
  SET status = 'missed'
  WHERE user_id = NEW.user_id
    AND source_type = target_source
    AND source_id = NEW.id
    AND status = 'scheduled';

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS mark_schedule_instances_on_habit_update ON public.habits;
CREATE TRIGGER mark_schedule_instances_on_habit_update
AFTER UPDATE ON public.habits
FOR EACH ROW
WHEN (OLD.* IS DISTINCT FROM NEW.*)
EXECUTE FUNCTION public.mark_schedule_instances_missed('HABIT');

DROP TRIGGER IF EXISTS mark_schedule_instances_on_project_update ON public.projects;
CREATE TRIGGER mark_schedule_instances_on_project_update
AFTER UPDATE ON public.projects
FOR EACH ROW
WHEN (OLD.* IS DISTINCT FROM NEW.*)
EXECUTE FUNCTION public.mark_schedule_instances_missed('PROJECT');

COMMIT;
