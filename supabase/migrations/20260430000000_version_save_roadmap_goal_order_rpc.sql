create or replace function public.save_roadmap_goal_order(
  p_roadmap_id uuid,
  p_goal_ids uuid[]
)
returns void
language plpgsql
security definer
as $$
begin
  update public.goals
  set priority_rank = ordered_goals.ordinality
  from unnest(p_goal_ids) with ordinality as ordered_goals(goal_id, ordinality)
  where goals.id = ordered_goals.goal_id
    and goals.roadmap_id = p_roadmap_id;

  perform public.recalculate_goal_global_rank();
end;
$$;
