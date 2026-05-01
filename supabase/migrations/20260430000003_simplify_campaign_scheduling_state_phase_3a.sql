update public.campaigns
set scheduling_state = 'ACTIVE'
where scheduling_state in ('BACKLOG', 'SOMEDAY', 'MANUAL_ONLY');

update public.campaigns
set scheduling_state = 'PAUSED'
where scheduling_state = 'ARCHIVED';

alter table public.campaigns
drop constraint if exists campaigns_scheduling_state_check;

alter table public.campaigns
add constraint campaigns_scheduling_state_check check (
  scheduling_state in ('ACTIVE', 'PAUSED', 'COMPLETED')
);

alter table public.campaigns
alter column scheduling_state set default 'ACTIVE';
