alter table public.habits
  add column if not exists fixed_start_local time without time zone null,
  add column if not exists fixed_end_local time without time zone null,
  add column if not exists fixed_timezone text null;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'habits_fixed_local_time_pair_check'
      and conrelid = 'public.habits'::regclass
  ) then
    alter table public.habits
      add constraint habits_fixed_local_time_pair_check
      check (
        (
          fixed_start_local is null
          and fixed_end_local is null
        )
        or (
          fixed_start_local is not null
          and fixed_end_local is not null
          and fixed_start_local < fixed_end_local
        )
      );
  end if;
end $$;
