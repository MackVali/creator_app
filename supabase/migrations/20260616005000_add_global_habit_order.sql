ALTER TABLE public.habits
    ADD COLUMN IF NOT EXISTS global_order integer;

CREATE INDEX IF NOT EXISTS habits_user_type_global_order_idx
    ON public.habits (user_id, habit_type, global_order);

WITH habit_order_candidates AS (
    SELECT
        id,
        user_id,
        CASE UPPER(TRIM(COALESCE(habit_type::text, 'HABIT')))
            WHEN 'CHORE' THEN 'CHORE'
            WHEN 'HABIT' THEN 'HABIT'
            WHEN 'ASYNC' THEN 'SYNC'
            WHEN 'SYNC' THEN 'SYNC'
            WHEN 'PRACTICE' THEN 'PRACTICE'
            ELSE 'UNKNOWN'
        END AS normalized_habit_type,
        CASE UPPER(TRIM(COALESCE(habit_type::text, 'HABIT')))
            WHEN 'CHORE' THEN 1
            WHEN 'HABIT' THEN 2
            WHEN 'ASYNC' THEN 3
            WHEN 'SYNC' THEN 3
            WHEN 'PRACTICE' THEN 4
            ELSE 5
        END AS habit_type_rank,
        routine_position,
        updated_at,
        created_at
    FROM public.habits
    WHERE global_order IS NULL
      AND user_id IS NOT NULL
),
existing_habit_order AS (
    SELECT
        user_id,
        CASE UPPER(TRIM(COALESCE(habit_type::text, 'HABIT')))
            WHEN 'CHORE' THEN 'CHORE'
            WHEN 'HABIT' THEN 'HABIT'
            WHEN 'ASYNC' THEN 'SYNC'
            WHEN 'SYNC' THEN 'SYNC'
            WHEN 'PRACTICE' THEN 'PRACTICE'
            ELSE 'UNKNOWN'
        END AS normalized_habit_type,
        COALESCE(MAX(global_order), 0) AS max_global_order
    FROM public.habits
    WHERE global_order IS NOT NULL
      AND user_id IS NOT NULL
    GROUP BY
        user_id,
        CASE UPPER(TRIM(COALESCE(habit_type::text, 'HABIT')))
            WHEN 'CHORE' THEN 'CHORE'
            WHEN 'HABIT' THEN 'HABIT'
            WHEN 'ASYNC' THEN 'SYNC'
            WHEN 'SYNC' THEN 'SYNC'
            WHEN 'PRACTICE' THEN 'PRACTICE'
            ELSE 'UNKNOWN'
        END
),
ranked_habits AS (
    SELECT
        candidate.id,
        (
            COALESCE(existing.max_global_order, 0) +
            ROW_NUMBER() OVER (
                PARTITION BY candidate.user_id, candidate.normalized_habit_type
                ORDER BY
                    candidate.habit_type_rank ASC,
                    candidate.routine_position ASC NULLS LAST,
                    candidate.updated_at DESC NULLS LAST,
                    candidate.created_at ASC NULLS LAST,
                    candidate.id ASC
            )
        )::integer AS next_global_order
    FROM habit_order_candidates AS candidate
    LEFT JOIN existing_habit_order AS existing
      ON existing.user_id = candidate.user_id
     AND existing.normalized_habit_type = candidate.normalized_habit_type
)
UPDATE public.habits AS habit
SET global_order = ranked_habits.next_global_order
FROM ranked_habits
WHERE habit.id = ranked_habits.id
  AND habit.global_order IS NULL;

CREATE OR REPLACE FUNCTION public.save_global_habit_order(
    p_user_id uuid,
    p_habit_type text,
    p_habit_ids uuid[]
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_auth_user_id uuid;
    v_normalized_habit_type text;
    v_habit_count integer;
    v_distinct_habit_count integer;
    v_valid_habit_count integer;
BEGIN
    v_auth_user_id := auth.uid();

    IF v_auth_user_id IS NULL THEN
        RAISE EXCEPTION 'Authentication required';
    END IF;

    IF p_user_id IS NULL OR p_user_id <> v_auth_user_id THEN
        RAISE EXCEPTION 'Habit order user mismatch';
    END IF;

    v_normalized_habit_type := CASE UPPER(TRIM(COALESCE(p_habit_type, '')))
        WHEN 'CHORE' THEN 'CHORE'
        WHEN 'HABIT' THEN 'HABIT'
        WHEN 'ASYNC' THEN 'SYNC'
        WHEN 'SYNC' THEN 'SYNC'
        WHEN 'PRACTICE' THEN 'PRACTICE'
        ELSE NULL
    END;

    IF v_normalized_habit_type IS NULL THEN
        RAISE EXCEPTION 'Unsupported Habit type';
    END IF;

    v_habit_count := COALESCE(ARRAY_LENGTH(p_habit_ids, 1), 0);

    SELECT COUNT(DISTINCT habit_id)
    INTO v_distinct_habit_count
    FROM UNNEST(COALESCE(p_habit_ids, ARRAY[]::uuid[])) AS input_ids(habit_id);

    IF v_distinct_habit_count <> v_habit_count THEN
        RAISE EXCEPTION 'Habit ids must be unique';
    END IF;

    SELECT COUNT(*)
    INTO v_valid_habit_count
    FROM public.habits AS habit
    WHERE habit.id = ANY(COALESCE(p_habit_ids, ARRAY[]::uuid[]))
      AND habit.user_id = p_user_id
      AND CASE UPPER(TRIM(COALESCE(habit.habit_type::text, 'HABIT')))
            WHEN 'CHORE' THEN 'CHORE'
            WHEN 'HABIT' THEN 'HABIT'
            WHEN 'ASYNC' THEN 'SYNC'
            WHEN 'SYNC' THEN 'SYNC'
            WHEN 'PRACTICE' THEN 'PRACTICE'
            ELSE 'UNKNOWN'
          END = v_normalized_habit_type;

    IF v_valid_habit_count <> v_habit_count THEN
        RAISE EXCEPTION 'Habit ids must all belong to the current user and target Habit type';
    END IF;

    UPDATE public.habits AS habit
    SET global_order = ordered_habits.ordinality
    FROM UNNEST(COALESCE(p_habit_ids, ARRAY[]::uuid[])) WITH ORDINALITY AS ordered_habits(habit_id, ordinality)
    WHERE habit.id = ordered_habits.habit_id
      AND habit.user_id = p_user_id
      AND CASE UPPER(TRIM(COALESCE(habit.habit_type::text, 'HABIT')))
            WHEN 'CHORE' THEN 'CHORE'
            WHEN 'HABIT' THEN 'HABIT'
            WHEN 'ASYNC' THEN 'SYNC'
            WHEN 'SYNC' THEN 'SYNC'
            WHEN 'PRACTICE' THEN 'PRACTICE'
            ELSE 'UNKNOWN'
          END = v_normalized_habit_type;
END;
$$;
