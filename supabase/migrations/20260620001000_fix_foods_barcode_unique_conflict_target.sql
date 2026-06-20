-- Ensure foods.normalized_barcode is a real ON CONFLICT target for barcode upserts.
-- This is a follow-up migration because 20260620000000 may already be applied.

BEGIN;

UPDATE public.foods
SET normalized_barcode = NULL
WHERE normalized_barcode IS NOT NULL
  AND (
    btrim(normalized_barcode) = ''
    OR normalized_barcode !~ '^([0-9]{8}|[0-9]{12}|[0-9]{13}|[0-9]{14})$'
  );

WITH ranked_barcodes AS (
  SELECT
    id,
    row_number() OVER (
      PARTITION BY normalized_barcode
      ORDER BY is_active DESC, created_at ASC, id ASC
    ) AS barcode_rank
  FROM public.foods
  WHERE normalized_barcode IS NOT NULL
)
UPDATE public.foods AS foods
SET
  normalized_barcode = NULL,
  is_active = false,
  metadata = COALESCE(foods.metadata, '{}'::jsonb) || jsonb_build_object(
    'barcode_unique_conflict_retired_at',
    now()
  )
FROM ranked_barcodes
WHERE foods.id = ranked_barcodes.id
  AND ranked_barcodes.barcode_rank > 1;

ALTER TABLE public.foods
  DROP CONSTRAINT IF EXISTS foods_normalized_barcode_key,
  DROP CONSTRAINT IF EXISTS foods_normalized_barcode_unique_idx;

DROP INDEX IF EXISTS public.foods_normalized_barcode_unique_idx;

CREATE UNIQUE INDEX foods_normalized_barcode_unique_idx
  ON public.foods(normalized_barcode);

ALTER TABLE public.foods
  DROP CONSTRAINT IF EXISTS foods_normalized_barcode_gtin_check,
  ADD CONSTRAINT foods_normalized_barcode_gtin_check
    CHECK (
      normalized_barcode IS NULL
      OR normalized_barcode ~ '^([0-9]{8}|[0-9]{12}|[0-9]{13}|[0-9]{14})$'
    )
    NOT VALID,
  DROP CONSTRAINT IF EXISTS foods_nutrition_sane_check,
  ADD CONSTRAINT foods_nutrition_sane_check
    CHECK (
      (calories IS NULL OR (calories >= 0 AND calories <= 10000))
      AND (carbs_g IS NULL OR (carbs_g >= 0 AND carbs_g <= 5000))
      AND (protein_g IS NULL OR (protein_g >= 0 AND protein_g <= 5000))
      AND (fat_g IS NULL OR (fat_g >= 0 AND fat_g <= 5000))
      AND (serving_size IS NULL OR (serving_size > 0 AND serving_size <= 10000))
      AND (serving_grams IS NULL OR (serving_grams > 0 AND serving_grams <= 5000))
    )
    NOT VALID;

COMMIT;
