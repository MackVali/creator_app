begin;

create extension if not exists pgcrypto;

create table if not exists public.nutrition_profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  age_years smallint not null check (age_years between 13 and 120),
  formula_sex text not null check (formula_sex in ('male','female','manual')),
  height_cm numeric(6,2) not null check (height_cm between 100 and 260),
  current_weight_kg numeric(7,2) not null check (current_weight_kg between 25 and 500),
  preferred_units text not null check (preferred_units in ('metric','us')),
  activity_level text not null check (activity_level in ('sedentary','light','moderate','active','very_active')),
  activity_coefficient numeric(4,2) not null check (activity_coefficient in (1.40,1.50,1.60,1.75,1.90)),
  body_fat_pct numeric(5,2) check (body_fat_pct is null or body_fat_pct between 2 and 70),
  pregnancy_status text check (pregnancy_status is null or pregnancy_status in ('none','pregnant','breastfeeding')),
  adjustments_enabled boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.nutrition_goal_versions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  effective_from timestamptz not null default now(),
  effective_to timestamptz,
  algorithm_version text not null check (algorithm_version = 'nutrition-target-v1'),
  goal_type text not null check (goal_type in ('lose','maintain','gain','recomposition')),
  goal_weight_kg numeric(7,2) check (goal_weight_kg is null or goal_weight_kg between 25 and 500),
  target_rate_pct_per_week numeric(5,3) check (target_rate_pct_per_week is null or target_rate_pct_per_week between 0 and 1),
  bmr_formula text not null check (bmr_formula in ('mifflin_st_jeor','manual')),
  bmr_kcal numeric(9,2),
  activity_coefficient numeric(4,2) not null check (activity_coefficient between 1 and 3),
  estimated_maintenance_kcal numeric(9,2) not null check (estimated_maintenance_kcal between 800 and 10000),
  calorie_delta_kcal numeric(9,2) not null,
  calorie_target_kcal integer not null check (calorie_target_kcal between 800 and 10000),
  protein_strategy text not null,
  protein_target_g integer not null check (protein_target_g > 0),
  carb_strategy text not null,
  carb_target_g integer not null check (carb_target_g > 0),
  fat_strategy text not null,
  fat_target_g integer not null check (fat_target_g > 0),
  is_manual boolean not null default false,
  change_reason text not null default 'User saved target' check (char_length(change_reason) between 1 and 500),
  calculation_inputs jsonb not null check (jsonb_typeof(calculation_inputs) = 'object'),
  created_at timestamptz not null default now(),
  check (effective_to is null or effective_to >= effective_from)
);

create table if not exists public.daily_nutrition_targets (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  creator_day_date date not null,
  timezone text not null check (char_length(btrim(timezone)) between 1 and 100),
  boundary_hour smallint not null default 4 check (boundary_hour = 4),
  goal_version_id uuid not null references public.nutrition_goal_versions(id),
  calorie_target_kcal integer not null check (calorie_target_kcal between 800 and 10000),
  protein_target_g integer not null check (protein_target_g > 0),
  carb_target_g integer not null check (carb_target_g > 0),
  fat_target_g integer not null check (fat_target_g > 0),
  is_daily_override boolean not null default false,
  override_reason text check (override_reason is null or char_length(override_reason) between 1 and 500),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, creator_day_date)
);

create unique index if not exists nutrition_goal_versions_one_active_per_user
  on public.nutrition_goal_versions(user_id) where effective_to is null;
create index if not exists nutrition_goal_versions_user_history
  on public.nutrition_goal_versions(user_id, effective_from desc);
create index if not exists daily_nutrition_targets_user_day
  on public.daily_nutrition_targets(user_id, creator_day_date desc);
create index if not exists daily_nutrition_targets_goal_version
  on public.daily_nutrition_targets(goal_version_id);

create or replace function public.nutrition_targets_set_updated_at()
returns trigger language plpgsql set search_path = public as $$
begin new.updated_at = now(); return new; end;
$$;

drop trigger if exists nutrition_profiles_set_updated_at on public.nutrition_profiles;
create trigger nutrition_profiles_set_updated_at before update on public.nutrition_profiles
for each row execute function public.nutrition_targets_set_updated_at();
drop trigger if exists daily_nutrition_targets_set_updated_at on public.daily_nutrition_targets;
create trigger daily_nutrition_targets_set_updated_at before update on public.daily_nutrition_targets
for each row execute function public.nutrition_targets_set_updated_at();

create or replace function public.prevent_nutrition_goal_version_mutation()
returns trigger language plpgsql set search_path = public as $$
begin
  if old.effective_to is null and new.effective_to is not null then
    if (to_jsonb(new) - 'effective_to') = (to_jsonb(old) - 'effective_to') then return new; end if;
  end if;
  raise exception 'nutrition goal versions are immutable';
end;
$$;
drop trigger if exists nutrition_goal_versions_immutable on public.nutrition_goal_versions;
create trigger nutrition_goal_versions_immutable before update on public.nutrition_goal_versions
for each row execute function public.prevent_nutrition_goal_version_mutation();

alter table public.nutrition_profiles enable row level security;
alter table public.nutrition_goal_versions enable row level security;
alter table public.daily_nutrition_targets enable row level security;

drop policy if exists nutrition_profiles_owner_select on public.nutrition_profiles;
create policy nutrition_profiles_owner_select on public.nutrition_profiles for select to authenticated using (user_id = auth.uid());
drop policy if exists nutrition_profiles_owner_insert on public.nutrition_profiles;
create policy nutrition_profiles_owner_insert on public.nutrition_profiles for insert to authenticated with check (user_id = auth.uid());
drop policy if exists nutrition_profiles_owner_update on public.nutrition_profiles;
create policy nutrition_profiles_owner_update on public.nutrition_profiles for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
drop policy if exists nutrition_profiles_owner_delete on public.nutrition_profiles;
create policy nutrition_profiles_owner_delete on public.nutrition_profiles for delete to authenticated using (user_id = auth.uid());

drop policy if exists nutrition_goal_versions_owner_select on public.nutrition_goal_versions;
create policy nutrition_goal_versions_owner_select on public.nutrition_goal_versions for select to authenticated using (user_id = auth.uid());
drop policy if exists nutrition_goal_versions_owner_insert on public.nutrition_goal_versions;
create policy nutrition_goal_versions_owner_insert on public.nutrition_goal_versions for insert to authenticated with check (user_id = auth.uid());
drop policy if exists nutrition_goal_versions_owner_delete on public.nutrition_goal_versions;
create policy nutrition_goal_versions_owner_delete on public.nutrition_goal_versions for delete to authenticated using (user_id = auth.uid());

drop policy if exists daily_nutrition_targets_owner_select on public.daily_nutrition_targets;
create policy daily_nutrition_targets_owner_select on public.daily_nutrition_targets for select to authenticated using (user_id = auth.uid());
drop policy if exists daily_nutrition_targets_owner_insert on public.daily_nutrition_targets;
create policy daily_nutrition_targets_owner_insert on public.daily_nutrition_targets for insert to authenticated with check (user_id = auth.uid());
drop policy if exists daily_nutrition_targets_owner_update on public.daily_nutrition_targets;
create policy daily_nutrition_targets_owner_update on public.daily_nutrition_targets for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
drop policy if exists daily_nutrition_targets_owner_delete on public.daily_nutrition_targets;
create policy daily_nutrition_targets_owner_delete on public.daily_nutrition_targets for delete to authenticated using (user_id = auth.uid());

revoke all on public.nutrition_profiles, public.nutrition_goal_versions, public.daily_nutrition_targets from anon;
grant select, insert, update, delete on public.nutrition_profiles to authenticated;
grant select, insert, delete on public.nutrition_goal_versions to authenticated;
grant select, insert, update, delete on public.daily_nutrition_targets to authenticated;

create or replace function public.save_nutrition_goal_version(
  p_profile jsonb, p_goal jsonb, p_creator_day_date date, p_timezone text, p_boundary_hour smallint
) returns jsonb language plpgsql security invoker set search_path = public as $$
declare
  v_user uuid := auth.uid(); v_now timestamptz := now(); v_goal public.nutrition_goal_versions; v_target public.daily_nutrition_targets;
begin
  if v_user is null then raise exception 'not authenticated'; end if;
  perform pg_advisory_xact_lock(hashtextextended(v_user::text || ':nutrition-goal', 0));
  insert into public.nutrition_profiles(user_id,age_years,formula_sex,height_cm,current_weight_kg,preferred_units,activity_level,activity_coefficient,body_fat_pct,pregnancy_status,adjustments_enabled)
  values(v_user,(p_profile->>'age_years')::smallint,p_profile->>'formula_sex',(p_profile->>'height_cm')::numeric,(p_profile->>'current_weight_kg')::numeric,p_profile->>'preferred_units',p_profile->>'activity_level',(p_profile->>'activity_coefficient')::numeric,nullif(p_profile->>'body_fat_pct','')::numeric,coalesce(p_profile->>'pregnancy_status','none'),coalesce((p_profile->>'adjustments_enabled')::boolean,true))
  on conflict(user_id) do update set age_years=excluded.age_years,formula_sex=excluded.formula_sex,height_cm=excluded.height_cm,current_weight_kg=excluded.current_weight_kg,preferred_units=excluded.preferred_units,activity_level=excluded.activity_level,activity_coefficient=excluded.activity_coefficient,body_fat_pct=excluded.body_fat_pct,pregnancy_status=excluded.pregnancy_status,adjustments_enabled=excluded.adjustments_enabled;
  update public.nutrition_goal_versions set effective_to=v_now where user_id=v_user and effective_to is null;
  insert into public.nutrition_goal_versions(user_id,effective_from,algorithm_version,goal_type,goal_weight_kg,target_rate_pct_per_week,bmr_formula,bmr_kcal,activity_coefficient,estimated_maintenance_kcal,calorie_delta_kcal,calorie_target_kcal,protein_strategy,protein_target_g,carb_strategy,carb_target_g,fat_strategy,fat_target_g,is_manual,change_reason,calculation_inputs)
  values(v_user,v_now,p_goal->>'algorithm_version',p_goal->>'goal_type',nullif(p_goal->>'goal_weight_kg','')::numeric,nullif(p_goal->>'target_rate_pct_per_week','')::numeric,p_goal->>'bmr_formula',nullif(p_goal->>'bmr_kcal','')::numeric,(p_goal->>'activity_coefficient')::numeric,(p_goal->>'estimated_maintenance_kcal')::numeric,(p_goal->>'calorie_delta_kcal')::numeric,(p_goal->>'calorie_target_kcal')::integer,p_goal->>'protein_strategy',(p_goal->>'protein_target_g')::integer,p_goal->>'carb_strategy',(p_goal->>'carb_target_g')::integer,p_goal->>'fat_strategy',(p_goal->>'fat_target_g')::integer,(p_goal->>'is_manual')::boolean,coalesce(p_goal->>'change_reason','User saved target'),p_goal->'calculation_inputs') returning * into v_goal;
  insert into public.daily_nutrition_targets(user_id,creator_day_date,timezone,boundary_hour,goal_version_id,calorie_target_kcal,protein_target_g,carb_target_g,fat_target_g)
  values(v_user,p_creator_day_date,p_timezone,p_boundary_hour,v_goal.id,v_goal.calorie_target_kcal,v_goal.protein_target_g,v_goal.carb_target_g,v_goal.fat_target_g)
  on conflict(user_id,creator_day_date) do nothing;
  select * into v_target from public.daily_nutrition_targets where user_id=v_user and creator_day_date=p_creator_day_date;
  return jsonb_build_object('goal',to_jsonb(v_goal),'target',to_jsonb(v_target));
end;
$$;
revoke all on function public.save_nutrition_goal_version(jsonb,jsonb,date,text,smallint) from public, anon;
grant execute on function public.save_nutrition_goal_version(jsonb,jsonb,date,text,smallint) to authenticated;

commit;
