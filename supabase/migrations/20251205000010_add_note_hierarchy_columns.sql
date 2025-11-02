-- Add hierarchy support for skill notes with single-level sub-pages

ALTER TABLE public.notes
    ADD COLUMN IF NOT EXISTS parent_note_id uuid,
    ADD COLUMN IF NOT EXISTS sibling_order integer;

-- Ensure parent notes cascade deletes to their children and enforce uniqueness of ids
ALTER TABLE public.notes
    DROP CONSTRAINT IF EXISTS notes_parent_fk;

ALTER TABLE public.notes
    ADD CONSTRAINT notes_parent_fk
        FOREIGN KEY (parent_note_id)
        REFERENCES public.notes (id)
        ON DELETE CASCADE;

-- Index to accelerate lookups by parent and maintain deterministic ordering within siblings
CREATE INDEX IF NOT EXISTS notes_parent_hierarchy_idx
    ON public.notes (user_id, skill_id, parent_note_id, COALESCE(sibling_order, 0), created_at);

-- Populate sibling order for existing root-level notes based on creation time when not set
WITH ranked AS (
    SELECT
        id,
        ROW_NUMBER() OVER (
            PARTITION BY user_id, skill_id, parent_note_id
            ORDER BY created_at, id
        ) - 1 AS rn
    FROM public.notes
)
UPDATE public.notes AS n
SET sibling_order = ranked.rn
FROM ranked
WHERE n.id = ranked.id
  AND n.sibling_order IS NULL;

-- Function and trigger to enforce single-level nesting and same-skill parenting rules
CREATE OR REPLACE FUNCTION public.notes_enforce_single_level()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
    parent_record public.notes;
BEGIN
    IF NEW.parent_note_id IS NULL THEN
        RETURN NEW;
    END IF;

    IF NEW.parent_note_id = NEW.id THEN
        RAISE EXCEPTION USING
            MESSAGE = 'A note cannot reference itself as the parent.';
    END IF;

    SELECT * INTO parent_record
    FROM public.notes
    WHERE id = NEW.parent_note_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION USING
            MESSAGE = format('Parent note %s does not exist.', NEW.parent_note_id);
    END IF;

    IF parent_record.user_id <> NEW.user_id THEN
        RAISE EXCEPTION USING
            MESSAGE = 'Parent note must belong to the same user as the child note.';
    END IF;

    IF parent_record.skill_id IS DISTINCT FROM NEW.skill_id THEN
        RAISE EXCEPTION USING
            MESSAGE = 'Parent note must belong to the same skill as the child note.';
    END IF;

    IF parent_record.parent_note_id IS NOT NULL THEN
        RAISE EXCEPTION USING
            MESSAGE = 'Nested sub-notes are limited to a single level.';
    END IF;

    IF NEW.skill_id IS NULL THEN
        RAISE EXCEPTION USING
            MESSAGE = 'Sub-notes are only supported for skill notes.';
    END IF;

    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS notes_enforce_single_level ON public.notes;

CREATE TRIGGER notes_enforce_single_level
BEFORE INSERT OR UPDATE OF parent_note_id, skill_id, user_id
ON public.notes
FOR EACH ROW
EXECUTE FUNCTION public.notes_enforce_single_level();
