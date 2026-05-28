-- Allow sub-notes for both skill notes and monument notes.

CREATE INDEX IF NOT EXISTS notes_monument_parent_hierarchy_idx
    ON public.notes (user_id, monument_id, parent_note_id, COALESCE(sibling_order, 0), created_at)
    WHERE monument_id IS NOT NULL;

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

    IF parent_record.skill_id IS DISTINCT FROM NEW.skill_id
       OR parent_record.monument_id IS DISTINCT FROM NEW.monument_id THEN
        RAISE EXCEPTION USING
            MESSAGE = 'Parent note must belong to the same skill or monument as the child note.';
    END IF;

    IF parent_record.parent_note_id IS NOT NULL THEN
        RAISE EXCEPTION USING
            MESSAGE = 'Nested sub-notes are limited to a single level.';
    END IF;

    IF NEW.skill_id IS NULL AND NEW.monument_id IS NULL THEN
        RAISE EXCEPTION USING
            MESSAGE = 'Sub-notes require a skill or monument context.';
    END IF;

    RETURN NEW;
END;
$$;
