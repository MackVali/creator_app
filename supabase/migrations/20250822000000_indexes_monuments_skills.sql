create index if not exists idx_goals_user_monument on public.goals(user_id, monument_id);
create index if not exists idx_tasks_skill on public.tasks(skill_id);
create index if not exists idx_project_skills_skill on public.project_skills(skill_id);
