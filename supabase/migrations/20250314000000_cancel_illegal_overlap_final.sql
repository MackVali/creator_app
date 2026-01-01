set check_function_bodies = off;

create or replace function public.cancel_schedule_instances_illegal_overlap_final(
  p_ids uuid[]
)
returns void
language sql
as $$
  update public.schedule_instances
  set status = 'canceled',
      canceled_reason = 'ILLEGAL_OVERLAP_FINAL'
  where id = any(p_ids);
$$;

grant execute on function public.cancel_schedule_instances_illegal_overlap_final(uuid[]) to authenticated;
