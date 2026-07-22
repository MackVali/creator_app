-- COMPLETE MANUAL VALI-v19 INSTALLATION BUNDLE.
-- Supersedes manually running 20260722000000 and 20260722000001 separately.
-- Mack runs this file manually. Codex must not execute it.

begin;

create extension if not exists pgcrypto;

-- Nutrition meal creation is the sole mandatory application dependency. Do not
-- assert optional source/inventory tables: source UUIDs are intentionally unlinked.
do $$
begin
  if to_regprocedure('public.create_nutrition_meal(jsonb,jsonb)') is null then
    raise exception 'Missing public.create_nutrition_meal(jsonb,jsonb): Meal Plan logging requires the existing Nutrition meal creation RPC';
  end if;
end
$$;

create table if not exists public.meal_plan_days (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  creator_day_date date not null,
  timezone text not null,
  timezone_source text not null,
  boundary_hour smallint not null default 4,
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  planning_mode text not null default 'flexible',
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.meal_plan_days
  add column if not exists id uuid default gen_random_uuid(),
  add column if not exists user_id uuid,
  add column if not exists creator_day_date date,
  add column if not exists timezone text,
  add column if not exists timezone_source text,
  add column if not exists boundary_hour smallint default 4,
  add column if not exists starts_at timestamptz,
  add column if not exists ends_at timestamptz,
  add column if not exists planning_mode text default 'flexible',
  add column if not exists notes text,
  add column if not exists created_at timestamptz default now(),
  add column if not exists updated_at timestamptz default now();

create table if not exists public.meal_plan_items (
  id uuid primary key default gen_random_uuid(),
  meal_plan_day_id uuid not null references public.meal_plan_days(id) on delete cascade,
  position integer not null default 0,
  label text not null,
  meal_type text,
  planned_time time,
  status text not null default 'planned',
  servings numeric not null default 1,
  food_id uuid,
  meal_template_id uuid,
  recipe_id uuid,
  consumed_meal_id uuid,
  nutrition_snapshot jsonb not null default '{}'::jsonb,
  source_surface text not null,
  grocery_depletion_status text not null default 'not_applicable',
  grocery_depletion_attempted_at timestamptz,
  grocery_depleted_at timestamptz,
  grocery_depletion_results jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.meal_plan_items
  add column if not exists id uuid default gen_random_uuid(),
  add column if not exists meal_plan_day_id uuid,
  add column if not exists position integer default 0,
  add column if not exists label text,
  add column if not exists meal_type text,
  add column if not exists planned_time time,
  add column if not exists status text default 'planned',
  add column if not exists servings numeric default 1,
  add column if not exists food_id uuid,
  add column if not exists meal_template_id uuid,
  add column if not exists recipe_id uuid,
  add column if not exists consumed_meal_id uuid,
  add column if not exists nutrition_snapshot jsonb default '{}'::jsonb,
  add column if not exists source_surface text,
  add column if not exists grocery_depletion_status text default 'not_applicable',
  add column if not exists grocery_depletion_attempted_at timestamptz,
  add column if not exists grocery_depleted_at timestamptz,
  add column if not exists grocery_depletion_results jsonb default '[]'::jsonb,
  add column if not exists created_at timestamptz default now(),
  add column if not exists updated_at timestamptz default now();

-- Normalize required defaults/nullability when the tables came from a compatible
-- partial attempt. Existing invalid rows cause a full rollback instead of leaving
-- a deceptively half-installed schema.
alter table public.meal_plan_days
  alter column id set default gen_random_uuid(),
  alter column boundary_hour set default 4,
  alter column planning_mode set default 'flexible',
  alter column created_at set default now(),
  alter column updated_at set default now(),
  alter column id set not null,
  alter column user_id set not null,
  alter column creator_day_date set not null,
  alter column timezone set not null,
  alter column timezone_source set not null,
  alter column boundary_hour set not null,
  alter column starts_at set not null,
  alter column ends_at set not null,
  alter column planning_mode set not null,
  alter column created_at set not null,
  alter column updated_at set not null;

alter table public.meal_plan_items
  alter column id set default gen_random_uuid(),
  alter column position set default 0,
  alter column status set default 'planned',
  alter column servings set default 1,
  alter column nutrition_snapshot set default '{}'::jsonb,
  alter column grocery_depletion_status set default 'not_applicable',
  alter column grocery_depletion_results set default '[]'::jsonb,
  alter column created_at set default now(),
  alter column updated_at set default now(),
  alter column id set not null,
  alter column meal_plan_day_id set not null,
  alter column position set not null,
  alter column label set not null,
  alter column status set not null,
  alter column servings set not null,
  alter column nutrition_snapshot set not null,
  alter column source_surface set not null,
  alter column grocery_depletion_status set not null,
  alter column grocery_depletion_results set not null,
  alter column created_at set not null,
  alter column updated_at set not null;

-- Constraints are named and guarded so a partial prior attempt is harmless.
do $$
begin
  if not exists (select 1 from pg_constraint where conrelid = 'public.meal_plan_days'::regclass and contype = 'p') then
    alter table public.meal_plan_days add constraint meal_plan_days_pkey primary key (id);
  end if;
  if not exists (select 1 from pg_constraint where conrelid = 'public.meal_plan_days'::regclass and conname = 'meal_plan_days_user_date_unique') then
    alter table public.meal_plan_days add constraint meal_plan_days_user_date_unique unique (user_id, creator_day_date);
  end if;
  if not exists (select 1 from pg_constraint where conrelid = 'public.meal_plan_days'::regclass and conname = 'meal_plan_days_user_id_fkey') then
    alter table public.meal_plan_days add constraint meal_plan_days_user_id_fkey foreign key (user_id) references auth.users(id) on delete cascade not valid;
  end if;
  if not exists (select 1 from pg_constraint where conrelid = 'public.meal_plan_days'::regclass and conname = 'meal_plan_days_timezone_not_blank') then
    alter table public.meal_plan_days add constraint meal_plan_days_timezone_not_blank check (length(btrim(timezone)) > 0) not valid;
  end if;
  if not exists (select 1 from pg_constraint where conrelid = 'public.meal_plan_days'::regclass and conname = 'meal_plan_days_timezone_source_check') then
    alter table public.meal_plan_days add constraint meal_plan_days_timezone_source_check check (timezone_source in ('profile', 'device', 'utc')) not valid;
  end if;
  if not exists (select 1 from pg_constraint where conrelid = 'public.meal_plan_days'::regclass and conname = 'meal_plan_days_boundary_check') then
    alter table public.meal_plan_days add constraint meal_plan_days_boundary_check check (boundary_hour = 4) not valid;
  end if;
  if not exists (select 1 from pg_constraint where conrelid = 'public.meal_plan_days'::regclass and conname = 'meal_plan_days_interval_check') then
    alter table public.meal_plan_days add constraint meal_plan_days_interval_check check (ends_at > starts_at) not valid;
  end if;
  if not exists (select 1 from pg_constraint where conrelid = 'public.meal_plan_days'::regclass and conname = 'meal_plan_days_mode_check') then
    alter table public.meal_plan_days add constraint meal_plan_days_mode_check check (planning_mode in ('flexible', 'scheduled')) not valid;
  end if;

  if not exists (select 1 from pg_constraint where conrelid = 'public.meal_plan_items'::regclass and contype = 'p') then
    alter table public.meal_plan_items add constraint meal_plan_items_pkey primary key (id);
  end if;
  if not exists (select 1 from pg_constraint where conrelid = 'public.meal_plan_items'::regclass and conname in ('meal_plan_items_day_fkey', 'meal_plan_items_meal_plan_day_id_fkey')) then
    alter table public.meal_plan_items add constraint meal_plan_items_day_fkey foreign key (meal_plan_day_id) references public.meal_plan_days(id) on delete cascade not valid;
  end if;
  if not exists (select 1 from pg_constraint where conrelid = 'public.meal_plan_items'::regclass and conname = 'meal_plan_items_position_check') then
    alter table public.meal_plan_items add constraint meal_plan_items_position_check check (position >= 0) not valid;
  end if;
  if not exists (select 1 from pg_constraint where conrelid = 'public.meal_plan_items'::regclass and conname = 'meal_plan_items_label_not_blank') then
    alter table public.meal_plan_items add constraint meal_plan_items_label_not_blank check (length(btrim(label)) > 0) not valid;
  end if;
  if not exists (select 1 from pg_constraint where conrelid = 'public.meal_plan_items'::regclass and conname = 'meal_plan_items_status_check') then
    alter table public.meal_plan_items add constraint meal_plan_items_status_check check (status in ('planned', 'logged', 'partially_logged', 'skipped')) not valid;
  end if;
  if not exists (select 1 from pg_constraint where conrelid = 'public.meal_plan_items'::regclass and conname = 'meal_plan_items_servings_check') then
    alter table public.meal_plan_items add constraint meal_plan_items_servings_check check (servings > 0 and servings <= 10000) not valid;
  end if;
  if not exists (select 1 from pg_constraint where conrelid = 'public.meal_plan_items'::regclass and conname = 'meal_plan_items_surface_check') then
    alter table public.meal_plan_items add constraint meal_plan_items_surface_check check (source_surface in ('grocery', 'nutrition')) not valid;
  end if;
  if not exists (select 1 from pg_constraint where conrelid = 'public.meal_plan_items'::regclass and conname = 'meal_plan_items_depletion_status_check') then
    alter table public.meal_plan_items add constraint meal_plan_items_depletion_status_check check (grocery_depletion_status in ('not_applicable', 'pending', 'completed', 'failed')) not valid;
  end if;
  if not exists (select 1 from pg_constraint where conrelid = 'public.meal_plan_items'::regclass and conname = 'meal_plan_items_snapshot_object_check') then
    alter table public.meal_plan_items add constraint meal_plan_items_snapshot_object_check check (jsonb_typeof(nutrition_snapshot) = 'object') not valid;
  end if;
  if not exists (select 1 from pg_constraint where conrelid = 'public.meal_plan_items'::regclass and conname = 'meal_plan_items_depletion_results_array_check') then
    alter table public.meal_plan_items add constraint meal_plan_items_depletion_results_array_check check (jsonb_typeof(grocery_depletion_results) = 'array') not valid;
  end if;
end
$$;

create index if not exists meal_plan_days_user_date_idx on public.meal_plan_days(user_id, creator_day_date);
create index if not exists meal_plan_items_day_position_idx on public.meal_plan_items(meal_plan_day_id, position, created_at);
create index if not exists meal_plan_items_day_status_idx on public.meal_plan_items(meal_plan_day_id, status);
create index if not exists meal_plan_items_consumed_meal_idx on public.meal_plan_items(consumed_meal_id) where consumed_meal_id is not null;

create or replace function public.meal_plan_set_updated_at()
returns trigger language plpgsql set search_path = public as $$
begin
  new.updated_at = now();
  return new;
end
$$;

drop trigger if exists meal_plan_days_set_updated_at on public.meal_plan_days;
create trigger meal_plan_days_set_updated_at before update on public.meal_plan_days
for each row execute function public.meal_plan_set_updated_at();
drop trigger if exists meal_plan_items_set_updated_at on public.meal_plan_items;
create trigger meal_plan_items_set_updated_at before update on public.meal_plan_items
for each row execute function public.meal_plan_set_updated_at();

alter table public.meal_plan_days enable row level security;
alter table public.meal_plan_items enable row level security;

drop policy if exists "meal_plan_days_select_own" on public.meal_plan_days;
drop policy if exists "meal_plan_days_insert_own" on public.meal_plan_days;
drop policy if exists "meal_plan_days_update_own" on public.meal_plan_days;
drop policy if exists "meal_plan_days_delete_own" on public.meal_plan_days;
create policy "meal_plan_days_select_own" on public.meal_plan_days for select to authenticated using (user_id = auth.uid());
create policy "meal_plan_days_insert_own" on public.meal_plan_days for insert to authenticated with check (user_id = auth.uid());
create policy "meal_plan_days_update_own" on public.meal_plan_days for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "meal_plan_days_delete_own" on public.meal_plan_days for delete to authenticated using (user_id = auth.uid());

drop policy if exists "meal_plan_items_select_own" on public.meal_plan_items;
drop policy if exists "meal_plan_items_insert_own" on public.meal_plan_items;
drop policy if exists "meal_plan_items_update_own" on public.meal_plan_items;
drop policy if exists "meal_plan_items_delete_own" on public.meal_plan_items;
create policy "meal_plan_items_select_own" on public.meal_plan_items for select to authenticated using
  (exists (select 1 from public.meal_plan_days d where d.id = meal_plan_day_id and d.user_id = auth.uid()));
create policy "meal_plan_items_insert_own" on public.meal_plan_items for insert to authenticated with check
  (exists (select 1 from public.meal_plan_days d where d.id = meal_plan_day_id and d.user_id = auth.uid()));
create policy "meal_plan_items_update_own" on public.meal_plan_items for update to authenticated using
  (exists (select 1 from public.meal_plan_days d where d.id = meal_plan_day_id and d.user_id = auth.uid())) with check
  (exists (select 1 from public.meal_plan_days d where d.id = meal_plan_day_id and d.user_id = auth.uid()));
create policy "meal_plan_items_delete_own" on public.meal_plan_items for delete to authenticated using
  (exists (select 1 from public.meal_plan_days d where d.id = meal_plan_day_id and d.user_id = auth.uid()));

revoke all on public.meal_plan_days, public.meal_plan_items from anon, authenticated;
grant select, insert, update, delete on public.meal_plan_days, public.meal_plan_items to authenticated;

-- Final lifecycle only: there is no obsolete function definition earlier in this bundle.
create or replace function public.log_meal_plan_item(p_item_id uuid, p_occurred_at timestamptz default now())
returns jsonb language plpgsql security invoker set search_path = public as $$
declare
  v_item public.meal_plan_items;
  v_day public.meal_plan_days;
  v_items jsonb;
  v_meal_id uuid;
  v_has_deductions boolean;
  v_depletion_results jsonb;
begin
  select i.* into v_item from public.meal_plan_items i
  join public.meal_plan_days d on d.id = i.meal_plan_day_id
  where i.id = p_item_id and d.user_id = auth.uid() for update of i;
  if not found then raise exception 'Planned item not found' using errcode = 'P0002'; end if;

  v_has_deductions := jsonb_typeof(v_item.nutrition_snapshot->'grocery_deductions') = 'array'
    and jsonb_array_length(v_item.nutrition_snapshot->'grocery_deductions') > 0;
  if v_item.consumed_meal_id is not null then
    if v_has_deductions and v_item.grocery_depletion_status not in ('completed', 'not_applicable') then
      update public.meal_plan_items set status = 'partially_logged' where id = v_item.id;
      return jsonb_build_object('meal_id', v_item.consumed_meal_id, 'already_logged', false,
        'retry_required', true, 'initial_log', false, 'result', 'partially_logged');
    end if;
    return jsonb_build_object('meal_id', v_item.consumed_meal_id, 'already_logged', true,
      'retry_required', false, 'initial_log', false, 'result', 'already_logged');
  end if;
  if v_item.status <> 'planned' then raise exception 'Planned item is not available to log' using errcode = '55000'; end if;
  if jsonb_typeof(v_item.nutrition_snapshot->'items') <> 'array'
     or jsonb_array_length(v_item.nutrition_snapshot->'items') = 0 then
    raise exception 'Planned item has no loggable nutrition snapshot' using errcode = '22023';
  end if;

  select * into v_day from public.meal_plan_days where id = v_item.meal_plan_day_id;
  select jsonb_agg(component.value || jsonb_build_object(
    'quantity', coalesce((component.value->>'quantity')::numeric, 1) * v_item.servings,
    'snapshot_calories', coalesce((component.value->>'snapshot_calories')::numeric, 0) * v_item.servings,
    'snapshot_carbs_g', coalesce((component.value->>'snapshot_carbs_g')::numeric, 0) * v_item.servings,
    'snapshot_protein_g', coalesce((component.value->>'snapshot_protein_g')::numeric, 0) * v_item.servings,
    'snapshot_fat_g', coalesce((component.value->>'snapshot_fat_g')::numeric, 0) * v_item.servings,
    'metadata', coalesce(component.value->'metadata', '{}'::jsonb) || jsonb_build_object('source', 'meal-plan', 'mealPlanItemId', v_item.id)
  ) order by component.ordinality) into v_items
  from jsonb_array_elements(v_item.nutrition_snapshot->'items') with ordinality component(value, ordinality);

  -- If the proven Nutrition RPC raises, no item update occurs and Planned remains.
  select (to_jsonb(created)->>'id')::uuid into v_meal_id
  from public.create_nutrition_meal(
    jsonb_build_object('occurred_at', p_occurred_at, 'timezone', v_day.timezone, 'name', v_item.label,
      'metadata', jsonb_build_object('source', 'meal-plan', 'mealPlanItemId', v_item.id)), v_items
  ) created;
  if v_meal_id is null then raise exception 'Nutrition meal creation returned no id'; end if;

  if v_has_deductions then
    select jsonb_agg(jsonb_build_object('index', deduction.ordinality - 1,
      'food_resource_id', deduction.value->>'food_resource_id', 'amount', deduction.value->'amount',
      'unit', deduction.value->>'unit', 'status', 'pending', 'attempt_count', 0,
      'diagnostics', '[]'::jsonb) order by deduction.ordinality)
    into v_depletion_results
    from jsonb_array_elements(v_item.nutrition_snapshot->'grocery_deductions') with ordinality deduction(value, ordinality);
  else
    v_depletion_results := '[]'::jsonb;
  end if;

  update public.meal_plan_items set
    status = case when v_has_deductions then 'partially_logged' else 'logged' end,
    consumed_meal_id = v_meal_id,
    grocery_depletion_status = case when v_has_deductions then 'pending' else 'not_applicable' end,
    grocery_depletion_results = v_depletion_results
  where id = v_item.id;
  return jsonb_build_object('meal_id', v_meal_id, 'already_logged', false,
    'retry_required', v_has_deductions, 'initial_log', true,
    'result', case when v_has_deductions then 'partially_logged' else 'logged' end);
end
$$;

create or replace function public.deplete_logged_meal_plan_item(p_item_id uuid)
returns text language plpgsql security invoker set search_path = public as $$
declare
  v_item public.meal_plan_items;
  v_deduction jsonb;
  v_component jsonb;
  v_progress jsonb;
  v_updated uuid;
  v_index integer;
  v_attempted_at timestamptz;
  v_error text;
  v_incomplete integer;
begin
  select i.* into v_item from public.meal_plan_items i
  join public.meal_plan_days d on d.id = i.meal_plan_day_id
  where i.id = p_item_id and d.user_id = auth.uid() for update of i;
  if not found then raise exception 'Planned item not found' using errcode = 'P0002'; end if;
  if v_item.consumed_meal_id is null or v_item.status not in ('partially_logged', 'logged') then
    raise exception 'Planned item has no consumed meal to deplete' using errcode = '55000';
  end if;
  if v_item.grocery_depletion_status in ('completed', 'not_applicable') then return 'already_completed'; end if;

  v_progress := v_item.grocery_depletion_results;
  if jsonb_typeof(v_item.nutrition_snapshot->'grocery_deductions') <> 'array' then
    raise exception 'Planned item Grocery deductions are invalid' using errcode = '22023';
  end if;
  if jsonb_typeof(v_progress) <> 'array'
     or jsonb_array_length(v_progress) <> jsonb_array_length(v_item.nutrition_snapshot->'grocery_deductions') then
    select coalesce(jsonb_agg(jsonb_build_object('index', deduction.ordinality - 1,
      'food_resource_id', deduction.value->>'food_resource_id', 'amount', deduction.value->'amount',
      'unit', deduction.value->>'unit', 'status', 'pending', 'attempt_count', 0,
      'diagnostics', '[]'::jsonb) order by deduction.ordinality), '[]'::jsonb)
    into v_progress from jsonb_array_elements(v_item.nutrition_snapshot->'grocery_deductions')
      with ordinality deduction(value, ordinality);
  end if;

  for v_deduction, v_index in select value, (ordinality - 1)::integer
    from jsonb_array_elements(v_item.nutrition_snapshot->'grocery_deductions') with ordinality
  loop
    v_component := v_progress->v_index;
    if v_component->>'status' = 'completed' then continue; end if;
    v_attempted_at := clock_timestamp();
    v_updated := null;
    begin
      -- Optional runtime integration; dynamic SQL creates no install-time relation dependency.
      execute 'update public.food_resources set quantity = greatest(0, coalesce(quantity, 0) - $1), updated_at = now() where id = $2 and user_id = auth.uid() and unit = $3 returning id'
        into v_updated using (v_deduction->>'amount')::numeric * v_item.servings,
          (v_deduction->>'food_resource_id')::uuid, v_deduction->>'unit';
      if v_updated is null then raise exception 'Grocery item unavailable for depletion' using errcode = 'P0002'; end if;
      v_component := v_component || jsonb_build_object('status', 'completed',
        'attempt_count', coalesce((v_component->>'attempt_count')::integer, 0) + 1,
        'attempted_at', v_attempted_at, 'completed_at', clock_timestamp());
    exception when others then
      v_error := sqlerrm;
      v_component := v_component || jsonb_build_object('status', 'failed',
        'attempt_count', coalesce((v_component->>'attempt_count')::integer, 0) + 1,
        'attempted_at', v_attempted_at, 'last_error', v_error,
        'diagnostics', coalesce(v_component->'diagnostics', '[]'::jsonb)
          || jsonb_build_array(jsonb_build_object('at', v_attempted_at, 'error', v_error)));
    end;
    v_progress := jsonb_set(v_progress, array[v_index::text], v_component, false);
    update public.meal_plan_items set grocery_depletion_results = v_progress,
      grocery_depletion_attempted_at = v_attempted_at where id = v_item.id;
  end loop;

  select count(*) into v_incomplete from jsonb_array_elements(v_progress) component
  where component->>'status' <> 'completed';
  if v_incomplete = 0 then
    update public.meal_plan_items set status = 'logged', grocery_depletion_status = 'completed',
      grocery_depletion_results = v_progress, grocery_depleted_at = now() where id = v_item.id;
    return 'completed';
  end if;
  update public.meal_plan_items set status = 'partially_logged', grocery_depletion_status = 'failed',
    grocery_depletion_results = v_progress where id = v_item.id;
  return 'incomplete';
end
$$;

revoke all on function public.log_meal_plan_item(uuid, timestamptz) from public;
revoke all on function public.deplete_logged_meal_plan_item(uuid) from public;
grant execute on function public.log_meal_plan_item(uuid, timestamptz) to authenticated;
grant execute on function public.deplete_logged_meal_plan_item(uuid) to authenticated;

commit;
