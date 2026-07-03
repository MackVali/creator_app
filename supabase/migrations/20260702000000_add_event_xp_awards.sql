-- Make scheduled EVENT completion a first-class XP/completion source.

ALTER TYPE public.xp_kind
  ADD VALUE IF NOT EXISTS 'event';

ALTER TABLE public.completion_events
  DROP CONSTRAINT IF EXISTS completion_events_source_type_check;

ALTER TABLE public.completion_events
  ADD CONSTRAINT completion_events_source_type_check
  CHECK (source_type IN ('GOAL', 'PROJECT', 'TASK', 'HABIT', 'EVENT'));
