-- Allow windows to be explicitly marked or converted into other types so scheduling
-- can treat them differently (e.g., breaks or practice blocks).
ALTER TABLE public.windows
    DROP COLUMN IF EXISTS is_break;

ALTER TABLE public.windows
    ADD COLUMN IF NOT EXISTS window_kind text NOT NULL DEFAULT 'DEFAULT';
