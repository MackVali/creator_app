create or replace function public.ensure_monument_true_roadmap_items(
  p_monument_id uuid
)
returns table (
  roadmap_id uuid,
  inserted_count integer
)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_user_id uuid;
  v_roadmap_id uuid;
  v_max_position integer := 0;
  v_inserted_count integer := 0;
begin
  v_user_id := auth.uid();

  if v_user_id is null then
    raise exception 'Authentication required';
  end if;

  select r.id
  into v_roadmap_id
  from public.roadmaps r
  where r.user_id = v_user_id
    and r.monument_id = p_monument_id
  order by r.created_at asc, r.id asc
  limit 1;

  if v_roadmap_id is null then
    roadmap_id := null;
    inserted_count := 0;
    return next;
    return;
  end if;

  perform pg_advisory_xact_lock(pg_catalog.hashtext(v_roadmap_id::text)::bigint);

  select coalesce(max(ri.position), 0)
  into v_max_position
  from public.roadmap_items ri
  where ri.user_id = v_user_id
    and ri.roadmap_id = v_roadmap_id;

  with roadmap_campaigns as (
    select ri.campaign_id
    from public.roadmap_items ri
    where ri.user_id = v_user_id
      and ri.roadmap_id = v_roadmap_id
      and upper(trim(coalesce(ri.item_type, ''))) = 'CAMPAIGN'
      and ri.campaign_id is not null
  ),
  represented_goals as (
    select ri.goal_id
    from public.roadmap_items ri
    where ri.user_id = v_user_id
      and ri.roadmap_id = v_roadmap_id
      and upper(trim(coalesce(ri.item_type, ''))) = 'GOAL'
      and ri.goal_id is not null

    union

    select cg.goal_id
    from public.campaign_goals cg
    join roadmap_campaigns rc
      on rc.campaign_id = cg.campaign_id
    where cg.user_id = v_user_id
      and cg.goal_id is not null
  ),
  missing_goals as (
    select
      g.id,
      row_number() over (order by g.created_at asc, g.id asc) as ordinal
    from public.goals g
    where g.user_id = v_user_id
      and g.monument_id = p_monument_id
      and not exists (
        select 1
        from represented_goals rg
        where rg.goal_id = g.id
      )
  )
  insert into public.roadmap_items (
    user_id,
    roadmap_id,
    item_type,
    campaign_id,
    goal_id,
    position
  )
  select
    v_user_id,
    v_roadmap_id,
    'GOAL',
    null,
    mg.id,
    (v_max_position + mg.ordinal)::integer
  from missing_goals mg;

  get diagnostics v_inserted_count = row_count;

  if v_inserted_count > 0 then
    perform public.recalculate_goal_global_rank();
  end if;

  roadmap_id := v_roadmap_id;
  inserted_count := v_inserted_count;
  return next;
end;
$$;
