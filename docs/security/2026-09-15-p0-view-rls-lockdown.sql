begin;

-- These views previously ran with the view owner's privileges, which allowed
-- Data API callers to bypass the RLS policies on the underlying user-owned
-- tables. Make them execute with the caller's privileges instead.

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

-- None of these are public-profile surfaces. Anonymous callers should not be
-- able to query them at all. Authenticated callers retain read access, with
-- underlying RLS now deciding which rows they can see.
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

commit;
