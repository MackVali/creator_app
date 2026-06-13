-- Persist manual habit ordering inside routines.
ALTER TABLE public.habits
    ADD COLUMN IF NOT EXISTS routine_position integer;

WITH ranked_routine_habits AS (
    SELECT
        id,
        ROW_NUMBER() OVER (
            PARTITION BY routine_id
            ORDER BY
                COALESCE(updated_at, created_at) ASC,
                created_at ASC,
                id ASC
        )::integer AS next_position
    FROM public.habits
    WHERE routine_id IS NOT NULL
)
UPDATE public.habits AS habit
SET routine_position = ranked_routine_habits.next_position
FROM ranked_routine_habits
WHERE habit.id = ranked_routine_habits.id
  AND habit.routine_position IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS habits_routine_position_key
    ON public.habits (routine_id, routine_position)
    WHERE routine_id IS NOT NULL
      AND routine_position IS NOT NULL;

CREATE INDEX IF NOT EXISTS habits_routine_position_idx
    ON public.habits (routine_id, routine_position);

CREATE OR REPLACE FUNCTION public.save_routine_habit_order(
    p_routine_id uuid,
    p_habit_ids uuid[]
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_user_id uuid;
    v_habit_count integer;
    v_distinct_habit_count integer;
    v_valid_habit_count integer;
    v_position_offset integer := 1000000;
BEGIN
    v_user_id := auth.uid();

    IF v_user_id IS NULL THEN
        RAISE EXCEPTION 'Authentication required';
    END IF;

    IF NOT EXISTS (
        SELECT 1
        FROM public.habit_routines
        WHERE id = p_routine_id
          AND user_id = v_user_id
    ) THEN
        RAISE EXCEPTION 'Routine not found or not owned by current user';
    END IF;

    v_habit_count := COALESCE(ARRAY_LENGTH(p_habit_ids, 1), 0);

    SELECT COUNT(DISTINCT habit_id)
    INTO v_distinct_habit_count
    FROM UNNEST(COALESCE(p_habit_ids, ARRAY[]::uuid[])) AS input_ids(habit_id);

    IF v_distinct_habit_count <> v_habit_count THEN
        RAISE EXCEPTION 'Routine habit ids must be unique';
    END IF;

    SELECT COUNT(*)
    INTO v_valid_habit_count
    FROM public.habits
    WHERE id = ANY(COALESCE(p_habit_ids, ARRAY[]::uuid[]))
      AND routine_id = p_routine_id
      AND user_id = v_user_id;

    IF v_valid_habit_count <> v_habit_count THEN
        RAISE EXCEPTION 'Routine habit ids must all belong to the target routine and current user';
    END IF;

    UPDATE public.habits
    SET routine_position = routine_position + v_position_offset,
        updated_at = now()
    WHERE routine_id = p_routine_id
      AND user_id = v_user_id
      AND routine_position IS NOT NULL;

    UPDATE public.habits
    SET routine_position = ordered_habits.ordinality,
        updated_at = now()
    FROM UNNEST(COALESCE(p_habit_ids, ARRAY[]::uuid[])) WITH ORDINALITY AS ordered_habits(habit_id, ordinality)
    WHERE public.habits.id = ordered_habits.habit_id
      AND public.habits.routine_id = p_routine_id
      AND public.habits.user_id = v_user_id;

    WITH ordered_excluded AS (
        SELECT
            routine_habit.id,
            v_habit_count + ROW_NUMBER() OVER (
                ORDER BY
                    routine_habit.routine_position ASC NULLS LAST,
                    routine_habit.updated_at ASC,
                    routine_habit.created_at ASC,
                    routine_habit.id ASC
            ) AS next_position
        FROM public.habits AS routine_habit
        WHERE routine_habit.routine_id = p_routine_id
          AND routine_habit.user_id = v_user_id
          AND NOT (routine_habit.id = ANY(COALESCE(p_habit_ids, ARRAY[]::uuid[])))
    )
    UPDATE public.habits
    SET routine_position = ordered_excluded.next_position,
        updated_at = now()
    FROM ordered_excluded
    WHERE public.habits.id = ordered_excluded.id;
END;
$$;
