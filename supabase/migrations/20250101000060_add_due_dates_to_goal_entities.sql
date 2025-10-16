-- Ensure due date fields exist for goals, projects, and tasks
alter table public.goals
  add column if not exists due_date timestamptz;

alter table public.projects
  add column if not exists due_date timestamptz;

alter table public.tasks
  add column if not exists due_date timestamptz;
