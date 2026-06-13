-- Store the emoji/icon shown for a habit routine.
ALTER TABLE public.habit_routines
    ADD COLUMN IF NOT EXISTS icon text;
