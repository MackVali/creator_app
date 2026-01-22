-- Allow multiple default day types mapped to specific days of the week (array column)
drop index if exists day_types_default_per_user_idx;

drop table if exists public.day_type_default_days cascade;

alter table public.day_types
  add column if not exists days smallint[] not null default '{}';

-- Backfill before applying constraint: existing defaults cover all days
update public.day_types
set days = '{0,1,2,3,4,5,6}'
where is_default
  and (days is null or array_length(days, 1) = 0);

-- Normalize default arrays to valid unique 0-6 values, fallback to full week
update public.day_types
set days = coalesce(
  (
    select array_agg(distinct d order by d)
    from unnest(coalesce(days, '{0,1,2,3,4,5,6}'::smallint[])) as t(d)
    where d between 0 and 6
  ),
  '{0,1,2,3,4,5,6}'::smallint[]
)
where is_default;

alter table public.day_types
  drop constraint if exists day_types_days_valid_chk;

create or replace function public.valid_default_days(is_default boolean, days smallint[])
returns boolean
language plpgsql
immutable
as $$
declare
  v smallint;
  seen boolean[];
  idx int;
  arr_len int;
begin
  if not is_default then
    return true;
  end if;

  arr_len := cardinality(days);
  if arr_len is null or arr_len < 1 or arr_len > 7 then
    return false;
  end if;

  seen := array_fill(false, ARRAY[7]);

  foreach v in array days loop
    if v < 0 or v > 6 then
      return false;
    end if;
    idx := v + 1;
    if seen[idx] then
      return false;
    end if;
    seen[idx] := true;
  end loop;

  return true;
end;
$$;

alter table public.day_types
  add constraint day_types_days_valid_chk
    check (public.valid_default_days(is_default, days));

create index if not exists day_types_days_gin_idx on public.day_types using gin(days);
