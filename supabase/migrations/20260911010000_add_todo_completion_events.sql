-- Make lightweight TODOs first-class completion events with a small title snapshot.

ALTER TYPE public.xp_kind
  ADD VALUE IF NOT EXISTS 'todo';

ALTER TABLE public.completion_events
  ADD COLUMN IF NOT EXISTS source_title text;

ALTER TABLE public.completion_events
  DROP CONSTRAINT IF EXISTS completion_events_source_type_check;

ALTER TABLE public.completion_events
  ADD CONSTRAINT completion_events_source_type_check
  CHECK (source_type IN ('GOAL', 'PROJECT', 'TASK', 'HABIT', 'EVENT', 'TODO'));
