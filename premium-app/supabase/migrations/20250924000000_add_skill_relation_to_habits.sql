-- Link habits to skills so every habit can advance a focus area
ALTER TABLE public.habits
    ADD COLUMN IF NOT EXISTS skill_id uuid;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM information_schema.table_constraints
        WHERE constraint_name = 'habits_skill_id_fkey'
          AND table_name = 'habits'
          AND table_schema = 'public'
    ) THEN
        ALTER TABLE public.habits
            ADD CONSTRAINT habits_skill_id_fkey
            FOREIGN KEY (skill_id)
            REFERENCES public.skills (id)
            ON DELETE SET NULL;
    END IF;
END $$;

CREATE INDEX IF NOT EXISTS habits_skill_id_idx
    ON public.habits (skill_id);
