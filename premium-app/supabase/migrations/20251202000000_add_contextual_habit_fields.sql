-- Add support for contextual scheduling and memo habit metadata

-- Allow windows to express an optional location context
ALTER TABLE public.windows
    ADD COLUMN IF NOT EXISTS location_context text;

-- Track contextual preferences on habits
ALTER TABLE public.habits
    ADD COLUMN IF NOT EXISTS location_context text,
    ADD COLUMN IF NOT EXISTS daylight_preference text DEFAULT 'ALL_DAY';

-- Ensure existing habits default to all-day availability when unspecified
UPDATE public.habits
SET daylight_preference = 'ALL_DAY'
WHERE daylight_preference IS NULL;

-- Enable structured metadata on notes so memo habits can attach details
ALTER TABLE public.notes
    ADD COLUMN IF NOT EXISTS metadata jsonb DEFAULT '{}'::jsonb;

-- Backfill existing notes with an empty JSON object for metadata consistency
UPDATE public.notes
SET metadata = '{}'::jsonb
WHERE metadata IS NULL;

-- Make sure the habit_type enum includes the new MEMO habit type
DO $$
BEGIN
    IF EXISTS (
        SELECT 1
        FROM pg_type t
        JOIN pg_namespace n ON n.oid = t.typnamespace
        WHERE n.nspname = 'public'
          AND t.typname = 'habit_type_enum'
    ) AND NOT EXISTS (
        SELECT 1
        FROM pg_enum e
        WHERE e.enumlabel = 'MEMO'
          AND e.enumtypid = 'public.habit_type_enum'::regtype
    ) THEN
        ALTER TYPE public.habit_type_enum ADD VALUE 'MEMO';
    END IF;
END $$;
