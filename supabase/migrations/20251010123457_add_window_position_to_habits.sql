alter table public.habits
  add column if not exists window_position text;

update public.habits
set window_position = case
    when window_position in ('FIRST', 'LAST') then window_position
    else 'FIRST'
  end
where window_position is null or window_position not in ('FIRST', 'LAST');

alter table public.habits
  alter column window_position set default 'FIRST';

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'habits_window_position_check'
      and conrelid = 'public.habits'::regclass
  ) then
    alter table public.habits
      add constraint habits_window_position_check
      check (window_position in ('FIRST', 'LAST'));
  end if;
end;
$$;

alter table public.habits
  alter column window_position set not null;
