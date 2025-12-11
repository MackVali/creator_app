-- Add text columns that store the canonical priority/energy codes alongside the existing lookup ids.
alter table public.goals
  add column if not exists priority_code text,
  add column if not exists energy_code text;

-- Backfill priority_code using either the lookup id or existing text value.
with mapped as (
  select
    g.id,
    coalesce(
      g.priority_code,
      lp.name,
      upper(g.priority::text)
    ) as resolved_code
  from public.goals g
  left join public.priority lp
    on lp.id::text = g.priority::text
    or upper(lp.name) = upper(g.priority::text)
)
update public.goals g
set priority_code = upper(mapped.resolved_code)
from mapped
where g.id = mapped.id
  and mapped.resolved_code is not null;

-- Backfill energy_code.
with mapped as (
  select
    g.id,
    coalesce(
      g.energy_code,
      le.name,
      upper(g.energy::text)
    ) as resolved_code
  from public.goals g
  left join public.energy le
    on le.id::text = g.energy::text
    or upper(le.name) = upper(g.energy::text)
)
update public.goals g
set energy_code = upper(mapped.resolved_code)
from mapped
where g.id = mapped.id
  and mapped.resolved_code is not null;

-- Ensure new columns always have a value going forward.
alter table public.goals
  alter column priority_code set default 'LOW',
  alter column energy_code set default 'NO';
