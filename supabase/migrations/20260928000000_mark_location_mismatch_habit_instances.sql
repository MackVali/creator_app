-- Mark habit schedule instances that occupy windows with incompatible location context as missed
WITH normalized_habits AS (
    SELECT
        h.id AS habit_id,
        h.user_id AS user_id,
        h.location_context_id AS location_context_id,
        NULLIF(UPPER(TRIM(lc.value)), '') AS location_value
    FROM public.habits h
    LEFT JOIN public.location_contexts lc
        ON lc.id = h.location_context_id
),
normalized_windows AS (
    SELECT
        w.id AS window_id,
        w.user_id AS user_id,
        w.location_context_id AS location_context_id,
        NULLIF(UPPER(TRIM(lc.value)), '') AS location_value
    FROM public.windows w
    LEFT JOIN public.location_contexts lc
        ON lc.id = w.location_context_id
),
mismatched_instances AS (
    SELECT si.id
    FROM public.schedule_instances si
    JOIN normalized_habits h
        ON h.habit_id = si.source_id
        AND h.user_id = si.user_id
    JOIN normalized_windows w
        ON w.window_id = si.window_id
        AND w.user_id = si.user_id
    WHERE
        si.source_type = 'HABIT'
        AND si.status = 'scheduled'
        AND si.window_id IS NOT NULL
        AND (
            (w.location_context_id IS NOT NULL AND h.location_context_id IS DISTINCT FROM w.location_context_id)
            OR (
                w.location_context_id IS NULL
                AND w.location_value IS NOT NULL
                AND (h.location_value IS NULL OR h.location_value <> w.location_value)
            )
        )
)
UPDATE public.schedule_instances AS si
SET
    status = 'missed',
    updated_at = NOW(),
    completed_at = NULL
FROM mismatched_instances mi
WHERE si.id = mi.id;
