-- Internal CREATOR views must execute with the caller's privileges so the
-- underlying row-level security policies cannot be bypassed by the view owner.

alter view if exists public.skill_goal_ids
  set (security_invoker = true);

alter view if exists public.skill_goals
  set (security_invoker = true);

alter view if exists public.skills_by_cats_v
  set (security_invoker = true);

alter view if exists public.skills_progress_v
  set (security_invoker = true);

alter view if exists public.v_monument_milestone_summary
  set (security_invoker = true);

-- These are private CREATOR hierarchy/progress surfaces, not public Sites data.
revoke all privileges on table public.skill_goal_ids from anon;
revoke all privileges on table public.skill_goals from anon;
revoke all privileges on table public.skills_by_cats_v from anon;
revoke all privileges on table public.skills_progress_v from anon;
revoke all privileges on table public.v_monument_milestone_summary from anon;

grant select on table public.skill_goal_ids to authenticated;
grant select on table public.skill_goals to authenticated;
grant select on table public.skills_by_cats_v to authenticated;
grant select on table public.skills_progress_v to authenticated;
grant select on table public.v_monument_milestone_summary to authenticated;
