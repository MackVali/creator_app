alter table public.goals
  add column if not exists priority_code text,
  add column if not exists priority_order integer;

alter table public.campaigns
  add column if not exists priority_code text not null default 'LOW',
  add column if not exists priority_order integer;

create index if not exists idx_goals_user_priority_code_order
  on public.goals(user_id, priority_code, priority_order);

create index if not exists idx_campaigns_user_priority_code_order
  on public.campaigns(user_id, priority_code, priority_order);

with goal_priority_keys as (
  select
    g.id,
    g.user_id,
    upper(trim(coalesce(g.priority_code, g.priority::text, 'NO'))) as priority_key,
    g.global_rank,
    g.priority_rank,
    g.created_at
  from public.goals g
  where g.priority_order is null
),
existing_goal_order as (
  select
    user_id,
    upper(trim(coalesce(priority_code, priority::text, 'NO'))) as priority_key,
    coalesce(max(priority_order), 0) as max_priority_order
  from public.goals
  where priority_order is not null
  group by user_id, upper(trim(coalesce(priority_code, priority::text, 'NO')))
),
ranked_goals as (
  select
    gpk.id,
    (
      coalesce(ego.max_priority_order, 0) +
      row_number() over (
        partition by gpk.user_id, gpk.priority_key
        order by
          case when gpk.global_rank is not null and gpk.global_rank > 0 then 0 else 1 end asc,
          gpk.global_rank asc nulls last,
          case when gpk.priority_rank is not null and gpk.priority_rank > 0 then 0 else 1 end asc,
          gpk.priority_rank asc nulls last,
          gpk.created_at asc,
          gpk.id asc
      )
    )::integer as next_priority_order
  from goal_priority_keys gpk
  left join existing_goal_order ego
    on ego.user_id = gpk.user_id
   and ego.priority_key = gpk.priority_key
)
update public.goals g
set priority_order = ranked_goals.next_priority_order
from ranked_goals
where g.id = ranked_goals.id
  and g.priority_order is null;

with campaign_visible_order as (
  select
    c.id,
    c.user_id,
    upper(trim(coalesce(c.priority_code, 'LOW'))) as priority_key,
    c.position,
    c.created_at,
    min(g.global_rank) filter (
      where g.global_rank is not null and g.global_rank > 0
    ) as first_goal_global_rank,
    min(ri.position) filter (
      where ri.position is not null
    ) as first_roadmap_position
  from public.campaigns c
  left join public.campaign_goals cg
    on cg.campaign_id = c.id
   and cg.user_id = c.user_id
  left join public.goals g
    on g.id = cg.goal_id
   and g.user_id = c.user_id
  left join public.roadmap_items ri
    on ri.campaign_id = c.id
   and ri.user_id = c.user_id
   and upper(trim(coalesce(ri.item_type, ''))) = 'CAMPAIGN'
  where c.priority_order is null
  group by c.id, c.user_id, c.priority_code, c.position, c.created_at
),
existing_campaign_order as (
  select
    user_id,
    upper(trim(coalesce(priority_code, 'LOW'))) as priority_key,
    coalesce(max(priority_order), 0) as max_priority_order
  from public.campaigns
  where priority_order is not null
  group by user_id, upper(trim(coalesce(priority_code, 'LOW')))
),
ranked_campaigns as (
  select
    cvo.id,
    (
      coalesce(eco.max_priority_order, 0) +
      row_number() over (
        partition by cvo.user_id, cvo.priority_key
        order by
          case when cvo.first_goal_global_rank is not null then 0 else 1 end asc,
          cvo.first_goal_global_rank asc nulls last,
          cvo.position asc nulls last,
          cvo.first_roadmap_position asc nulls last,
          cvo.created_at asc,
          cvo.id asc
      )
    )::integer as next_priority_order
  from campaign_visible_order cvo
  left join existing_campaign_order eco
    on eco.user_id = cvo.user_id
   and eco.priority_key = cvo.priority_key
)
update public.campaigns c
set priority_order = ranked_campaigns.next_priority_order
from ranked_campaigns
where c.id = ranked_campaigns.id
  and c.priority_order is null;

create or replace function public.recalculate_goal_global_rank()
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  with campaign_goal_candidates as (
    select
      cg.user_id,
      cg.goal_id,
      case upper(trim(coalesce(c.priority_code, 'LOW')))
        when 'ULTRA-CRITICAL' then 1
        when 'CRITICAL' then 2
        when 'HIGH' then 3
        when 'MEDIUM' then 4
        when 'LOW' then 5
        when 'NO' then 6
        else 7
      end as priority_sort,
      case when c.priority_order is not null and c.priority_order > 0 then 0 else 1 end as priority_order_null_sort,
      coalesce(c.priority_order, 2147483647) as priority_order_sort,
      c.created_at as effective_created_at,
      c.id as effective_id,
      coalesce(cg.position, 2147483647) as campaign_goal_position,
      g.created_at as goal_created_at
    from public.campaign_goals cg
    join public.campaigns c
      on c.id = cg.campaign_id
     and c.user_id = cg.user_id
    join public.goals g
      on g.id = cg.goal_id
     and g.user_id = cg.user_id
  ),
  standalone_goal_candidates as (
    select
      g.user_id,
      g.id as goal_id,
      case upper(trim(coalesce(g.priority_code, g.priority::text, 'NO')))
        when 'ULTRA-CRITICAL' then 1
        when 'CRITICAL' then 2
        when 'HIGH' then 3
        when 'MEDIUM' then 4
        when 'LOW' then 5
        when 'NO' then 6
        else 7
      end as priority_sort,
      case when g.priority_order is not null and g.priority_order > 0 then 0 else 1 end as priority_order_null_sort,
      coalesce(g.priority_order, 2147483647) as priority_order_sort,
      g.created_at as effective_created_at,
      g.id as effective_id,
      0 as campaign_goal_position,
      g.created_at as goal_created_at
    from public.goals g
    where not exists (
      select 1
      from public.campaign_goals cg
      join public.campaigns c
        on c.id = cg.campaign_id
       and c.user_id = cg.user_id
      where cg.goal_id = g.id
        and cg.user_id = g.user_id
    )
  ),
  goal_rank_candidates as (
    select * from campaign_goal_candidates

    union all

    select * from standalone_goal_candidates
  ),
  deduped_goal_candidates as (
    select
      grc.*,
      row_number() over (
        partition by grc.user_id, grc.goal_id
        order by
          grc.priority_sort asc,
          grc.priority_order_null_sort asc,
          grc.priority_order_sort asc,
          grc.effective_created_at asc,
          grc.effective_id asc,
          grc.campaign_goal_position asc,
          grc.goal_created_at asc,
          grc.goal_id asc
      ) as goal_occurrence_rank
    from goal_rank_candidates grc
  ),
  ranked_goals as (
    select
      dgc.user_id,
      dgc.goal_id,
      row_number() over (
        partition by dgc.user_id
        order by
          dgc.priority_sort asc,
          dgc.priority_order_null_sort asc,
          dgc.priority_order_sort asc,
          dgc.effective_created_at asc,
          dgc.effective_id asc,
          dgc.campaign_goal_position asc,
          dgc.goal_created_at asc,
          dgc.goal_id asc
      ) as new_global_rank
    from deduped_goal_candidates dgc
    where dgc.goal_occurrence_rank = 1
  )
  update public.goals g
  set global_rank = ranked_goals.new_global_rank
  from ranked_goals
  where g.user_id = ranked_goals.user_id
    and g.id = ranked_goals.goal_id;
end;
$$;

create or replace function public.save_global_priority_order(
  p_items jsonb
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_user_id uuid;
  v_item_count integer;
  v_distinct_item_count integer;
  v_goal_count integer;
  v_valid_goal_count integer;
  v_campaign_count integer;
  v_valid_campaign_count integer;
begin
  v_user_id := auth.uid();

  if v_user_id is null then
    raise exception 'Authentication required';
  end if;

  if p_items is null or jsonb_typeof(p_items) <> 'array' then
    raise exception 'Priority order payload must be an array';
  end if;

  with parsed_items as (
    select
      lower(trim(item->>'type')) as entity_type,
      (item->>'id')::uuid as entity_id,
      upper(trim(item->>'priority')) as priority_code
    from jsonb_array_elements(p_items) as items(item)
  )
  select
    count(*),
    count(distinct entity_type || ':' || entity_id::text),
    count(*) filter (where entity_type = 'goal'),
    count(*) filter (where entity_type = 'campaign')
  into v_item_count, v_distinct_item_count, v_goal_count, v_campaign_count
  from parsed_items;

  if v_distinct_item_count <> v_item_count then
    raise exception 'Priority order items must be unique';
  end if;

  if exists (
    select 1
    from jsonb_array_elements(p_items) as items(item)
    where lower(trim(item->>'type')) not in ('goal', 'campaign')
       or upper(trim(item->>'priority')) not in (
         'ULTRA-CRITICAL',
         'CRITICAL',
         'HIGH',
         'MEDIUM',
         'LOW',
         'NO'
       )
  ) then
    raise exception 'Priority order items include an invalid type or priority';
  end if;

  with parsed_items as (
    select
      lower(trim(item->>'type')) as entity_type,
      (item->>'id')::uuid as entity_id
    from jsonb_array_elements(p_items) as items(item)
  )
  select count(*)
  into v_valid_goal_count
  from parsed_items pi
  join public.goals g
    on g.id = pi.entity_id
   and g.user_id = v_user_id
  where pi.entity_type = 'goal';

  if v_valid_goal_count <> v_goal_count then
    raise exception 'Goal priority order items must all belong to the current user';
  end if;

  with parsed_items as (
    select
      lower(trim(item->>'type')) as entity_type,
      (item->>'id')::uuid as entity_id
    from jsonb_array_elements(p_items) as items(item)
  )
  select count(*)
  into v_valid_campaign_count
  from parsed_items pi
  join public.campaigns c
    on c.id = pi.entity_id
   and c.user_id = v_user_id
  where pi.entity_type = 'campaign';

  if v_valid_campaign_count <> v_campaign_count then
    raise exception 'Campaign priority order items must all belong to the current user';
  end if;

  with parsed_items as (
    select
      lower(trim(item->>'type')) as entity_type,
      (item->>'id')::uuid as entity_id,
      upper(trim(item->>'priority')) as priority_code,
      ordinality
    from jsonb_array_elements(p_items) with ordinality as items(item, ordinality)
  ),
  ordered_items as (
    select
      entity_type,
      entity_id,
      priority_code,
      row_number() over (
        partition by priority_code
        order by ordinality asc
      )::integer as priority_order
    from parsed_items
  )
  update public.goals g
  set priority_code = oi.priority_code,
      priority_order = oi.priority_order
  from ordered_items oi
  where oi.entity_type = 'goal'
    and g.id = oi.entity_id
    and g.user_id = v_user_id;

  with parsed_items as (
    select
      lower(trim(item->>'type')) as entity_type,
      (item->>'id')::uuid as entity_id,
      upper(trim(item->>'priority')) as priority_code,
      ordinality
    from jsonb_array_elements(p_items) with ordinality as items(item, ordinality)
  ),
  ordered_items as (
    select
      entity_type,
      entity_id,
      priority_code,
      row_number() over (
        partition by priority_code
        order by ordinality asc
      )::integer as priority_order
    from parsed_items
  )
  update public.campaigns c
  set priority_code = oi.priority_code,
      priority_order = oi.priority_order
  from ordered_items oi
  where oi.entity_type = 'campaign'
    and c.id = oi.entity_id
    and c.user_id = v_user_id;

  perform public.recalculate_goal_global_rank();
end;
$$;

grant execute on function public.save_global_priority_order(jsonb) to authenticated;

select public.recalculate_goal_global_rank();
