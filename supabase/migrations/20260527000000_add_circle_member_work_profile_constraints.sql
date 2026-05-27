ALTER TABLE public.circle_members
  ADD COLUMN IF NOT EXISTS skill_constraint_ids uuid[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS location_context_ids uuid[] NOT NULL DEFAULT '{}';
