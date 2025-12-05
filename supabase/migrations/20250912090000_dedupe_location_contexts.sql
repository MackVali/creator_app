-- Normalize and deduplicate location contexts per user.
BEGIN;

ALTER TABLE public.location_contexts
  ADD COLUMN IF NOT EXISTS normalized_value text
    GENERATED ALWAYS AS (
      CASE
        WHEN value IS NULL OR btrim(value) = '' THEN NULL
        ELSE upper(btrim(value))
      END
    ) STORED;

-- Remove duplicate rows that collapse to the same normalized value per user.
WITH ranked AS (
  SELECT id
  FROM (
    SELECT
      id,
      row_number() OVER (
        PARTITION BY user_id, normalized_value
        ORDER BY created_at ASC NULLS LAST, id ASC
      ) AS rn
    FROM public.location_contexts
    WHERE normalized_value IS NOT NULL
  ) t
  WHERE t.rn > 1
)
DELETE FROM public.location_contexts lc
USING ranked r
WHERE lc.id = r.id;

-- Ensure stored values are normalized for any remaining rows.
UPDATE public.location_contexts
SET value = upper(btrim(value)),
    label = COALESCE(label, initcap(lower(upper(btrim(value)))))
WHERE value IS NOT NULL
  AND btrim(value) <> ''
  AND value <> upper(btrim(value));

ALTER TABLE public.location_contexts
  DROP CONSTRAINT IF EXISTS location_contexts_user_value_key;

ALTER TABLE public.location_contexts
  ADD CONSTRAINT location_contexts_user_normalized_key
  UNIQUE (user_id, normalized_value);

COMMIT;
