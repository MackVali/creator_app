-- Add due_date support for goals and projects
alter table public.goals
  add column if not exists due_date timestamptz;

alter table public.projects
  add column if not exists due_date timestamptz;

create index if not exists goals_due_date_idx on public.goals using btree (due_date);
create index if not exists projects_due_date_idx on public.projects using btree (due_date);
