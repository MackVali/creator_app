-- Replace the legacy global Monument cap with tier-aware per-Area limits.
--
-- CREATOR:      4 Monuments per Area
-- CREATOR PLUS: 16 Monuments per Area
-- ADMIN:        16 Monuments per Area
--
-- NULL area_id is treated as its own unassigned bucket for onboarding
-- and legacy Monument rows.

drop trigger if exists enforce_global_monument_cap_before_insert
on public.monuments;

drop function if exists public.enforce_global_monument_cap();


create or replace function public.enforce_monument_cap_per_area()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid;
  v_monument_count integer := 0;
  v_monument_limit integer := 4;
  v_tier text;
  v_is_active boolean := false;
begin
  v_user_id := coalesce(new.user_id, auth.uid());

  if v_user_id is null then
    raise exception 'Not authenticated';
  end if;

  new.user_id := v_user_id;

  perform pg_advisory_xact_lock(
    hashtext(
      v_user_id::text || ':' || coalesce(new.area_id, '__unassigned__')
    )
  );

  select
    upper(trim(coalesce(tier, 'CREATOR'))),
    coalesce(is_active, false)
  into
    v_tier,
    v_is_active
  from public.user_entitlements
  where user_id = v_user_id
  limit 1;

  if v_tier = 'ADMIN'
     or (v_is_active and v_tier = 'CREATOR PLUS') then
    v_monument_limit := 16;
  else
    v_monument_limit := 4;
  end if;

  if tg_op = 'UPDATE' then
    select count(*)
    into v_monument_count
    from public.monuments m
    where m.user_id = v_user_id
      and m.area_id is not distinct from new.area_id
      and m.id <> old.id;
  else
    select count(*)
    into v_monument_count
    from public.monuments m
    where m.user_id = v_user_id
      and m.area_id is not distinct from new.area_id;
  end if;

  if v_monument_count >= v_monument_limit then
    if new.area_id is null then
      raise exception
        'You''ve reached the % Monument limit for unassigned Monuments.',
        v_monument_limit;
    else
      raise exception
        'You''ve reached the % Monument limit for this Area.',
        v_monument_limit;
    end if;
  end if;

  return new;
end;
$$;


create trigger enforce_monument_cap_per_area_before_write
before insert or update of area_id, user_id
on public.monuments
for each row
execute function public.enforce_monument_cap_per_area();


grant execute
on function public.enforce_monument_cap_per_area()
to authenticated;
