-- Prevent global-rank persistence from invalidating project schedule instances.
-- Keep schedule invalidation for project edits that can affect placement.
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

  IF target_source = 'PROJECT' THEN
    IF (
      to_jsonb(OLD) - 'global_rank' - 'updated_at'
    ) IS NOT DISTINCT FROM (
      to_jsonb(NEW) - 'global_rank' - 'updated_at'
    ) THEN
      RETURN NEW;
    END IF;
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

COMMIT;
