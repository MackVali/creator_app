-- Backfill and guardrails for HABIT missed schedule instances

-- Normalize existing missed HABIT instances to have a day-stamped start_utc
update public.schedule_instances
set start_utc = date_trunc('day', created_at)
where source_type = 'HABIT'
  and status = 'missed'
  and start_utc is null;

-- Deduplicate to one missed row per habit/day
with ranked as (
  select
    id,
    row_number() over (
      partition by user_id, source_id, (start_utc::date)
      order by created_at asc
    ) as rn
  from public.schedule_instances
  where source_type = 'HABIT'
    and status = 'missed'
)
delete from public.schedule_instances s
using ranked r
where s.id = r.id
  and r.rn > 1;

-- Enforce uniqueness going forward
create unique index if not exists schedule_instances_habit_missed_unique
  on public.schedule_instances (user_id, source_id, (start_utc::date))
  where source_type = 'HABIT' and status = 'missed';

-- Scheduled cleanup helper for missed HABIT instances older than 7 days
create or replace function public.cleanup_old_missed_habit_instances()
returns void
language plpgsql
security definer
as $$
begin
  delete from public.schedule_instances
  where source_type = 'HABIT'
    and status = 'missed'
    and start_utc < now() - interval '7 days';
end;
$$;
