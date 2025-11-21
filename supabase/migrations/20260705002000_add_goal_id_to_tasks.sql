-- Add goal_id so tasks inserted via the goal wizard can tie back to their parent goal
alter table public.tasks
  add column if not exists goal_id uuid;

alter table public.tasks
  add constraint tasks_goal_id_fkey
    foreign key (goal_id)
    references public.goals (id);

create index if not exists tasks_goal_id_idx on public.tasks using btree (goal_id);
