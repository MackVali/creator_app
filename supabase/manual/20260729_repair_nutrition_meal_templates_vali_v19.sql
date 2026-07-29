-- VALI-v19 manual repair: install the canonical reusable Nutrition saved-meal schema.
-- Mack runs this file manually in the VALI-v19 Supabase SQL editor.
-- Codex must not execute it, push it, or mark any migration as applied.

begin;

create extension if not exists pgcrypto;

do $$
begin
  if to_regclass('public.foods') is null then
    raise exception 'Missing prerequisite table public.foods';
  end if;

  if to_regclass('public.recipes') is null then
    raise exception 'Missing prerequisite table public.recipes';
  end if;

  if to_regprocedure('public.set_updated_at()') is null then
    create function public.set_updated_at()
    returns trigger
    language plpgsql
    set search_path = public
    as $function$
    begin
      new.updated_at = now();
      return new;
    end;
    $function$;
  end if;
end
$$;

create table if not exists public.meal_templates (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  icon text not null default '🍽️',
  total_calories numeric not null default 0,
  total_carbs_g numeric not null default 0,
  total_protein_g numeric not null default 0,
  total_fat_g numeric not null default 0,
  metadata jsonb not null default '{}'::jsonb,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.meal_templates
  add column if not exists id uuid default gen_random_uuid(),
  add column if not exists user_id uuid,
  add column if not exists name text,
  add column if not exists icon text default '🍽️',
  add column if not exists total_calories numeric default 0,
  add column if not exists total_carbs_g numeric default 0,
  add column if not exists total_protein_g numeric default 0,
  add column if not exists total_fat_g numeric default 0,
  add column if not exists metadata jsonb default '{}'::jsonb,
  add column if not exists is_active boolean default true,
  add column if not exists created_at timestamptz default now(),
  add column if not exists updated_at timestamptz default now();

update public.meal_templates
set
  id = coalesce(id, gen_random_uuid()),
  icon = coalesce(nullif(btrim(icon), ''), '🍽️'),
  total_calories = coalesce(total_calories, 0),
  total_carbs_g = coalesce(total_carbs_g, 0),
  total_protein_g = coalesce(total_protein_g, 0),
  total_fat_g = coalesce(total_fat_g, 0),
  metadata = coalesce(metadata, '{}'::jsonb),
  is_active = coalesce(is_active, true),
  created_at = coalesce(created_at, now()),
  updated_at = coalesce(updated_at, now());

alter table public.meal_templates
  alter column id set default gen_random_uuid(),
  alter column icon set default '🍽️',
  alter column total_calories set default 0,
  alter column total_carbs_g set default 0,
  alter column total_protein_g set default 0,
  alter column total_fat_g set default 0,
  alter column metadata set default '{}'::jsonb,
  alter column is_active set default true,
  alter column created_at set default now(),
  alter column updated_at set default now(),
  alter column id set not null,
  alter column user_id set not null,
  alter column name set not null,
  alter column icon set not null,
  alter column total_calories set not null,
  alter column total_carbs_g set not null,
  alter column total_protein_g set not null,
  alter column total_fat_g set not null,
  alter column metadata set not null,
  alter column is_active set not null,
  alter column created_at set not null,
  alter column updated_at set not null;

create table if not exists public.meal_template_items (
  id uuid primary key default gen_random_uuid(),
  meal_template_id uuid not null references public.meal_templates(id) on delete cascade,
  item_type text not null,
  food_id uuid references public.foods(id) on delete set null,
  recipe_id uuid references public.recipes(id) on delete set null,
  custom_name text,
  quantity numeric not null default 1,
  serving_unit text,
  serving_grams numeric,
  snapshot_name text not null,
  snapshot_brand_name text,
  snapshot_calories numeric not null default 0,
  snapshot_carbs_g numeric not null default 0,
  snapshot_protein_g numeric not null default 0,
  snapshot_fat_g numeric not null default 0,
  metadata jsonb not null default '{}'::jsonb,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.meal_template_items
  add column if not exists id uuid default gen_random_uuid(),
  add column if not exists meal_template_id uuid,
  add column if not exists item_type text,
  add column if not exists food_id uuid,
  add column if not exists recipe_id uuid,
  add column if not exists custom_name text,
  add column if not exists quantity numeric default 1,
  add column if not exists serving_unit text,
  add column if not exists serving_grams numeric,
  add column if not exists snapshot_name text,
  add column if not exists snapshot_brand_name text,
  add column if not exists snapshot_calories numeric default 0,
  add column if not exists snapshot_carbs_g numeric default 0,
  add column if not exists snapshot_protein_g numeric default 0,
  add column if not exists snapshot_fat_g numeric default 0,
  add column if not exists metadata jsonb default '{}'::jsonb,
  add column if not exists sort_order integer default 0,
  add column if not exists created_at timestamptz default now(),
  add column if not exists updated_at timestamptz default now();

update public.meal_template_items
set
  id = coalesce(id, gen_random_uuid()),
  quantity = coalesce(quantity, 1),
  snapshot_calories = coalesce(snapshot_calories, 0),
  snapshot_carbs_g = coalesce(snapshot_carbs_g, 0),
  snapshot_protein_g = coalesce(snapshot_protein_g, 0),
  snapshot_fat_g = coalesce(snapshot_fat_g, 0),
  metadata = coalesce(metadata, '{}'::jsonb),
  sort_order = coalesce(sort_order, 0),
  created_at = coalesce(created_at, now()),
  updated_at = coalesce(updated_at, now());

alter table public.meal_template_items
  alter column id set default gen_random_uuid(),
  alter column quantity set default 1,
  alter column snapshot_calories set default 0,
  alter column snapshot_carbs_g set default 0,
  alter column snapshot_protein_g set default 0,
  alter column snapshot_fat_g set default 0,
  alter column metadata set default '{}'::jsonb,
  alter column sort_order set default 0,
  alter column created_at set default now(),
  alter column updated_at set default now(),
  alter column id set not null,
  alter column meal_template_id set not null,
  alter column item_type set not null,
  alter column quantity set not null,
  alter column snapshot_name set not null,
  alter column snapshot_calories set not null,
  alter column snapshot_carbs_g set not null,
  alter column snapshot_protein_g set not null,
  alter column snapshot_fat_g set not null,
  alter column metadata set not null,
  alter column sort_order set not null,
  alter column created_at set not null,
  alter column updated_at set not null;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.meal_templates'::regclass and contype = 'p'
  ) then
    alter table public.meal_templates
      add constraint meal_templates_pkey primary key (id);
  end if;

  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.meal_templates'::regclass
      and conname = 'meal_templates_user_id_fkey'
  ) then
    alter table public.meal_templates
      add constraint meal_templates_user_id_fkey
      foreign key (user_id) references auth.users(id) on delete cascade;
  end if;

  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.meal_templates'::regclass
      and conname = 'meal_templates_name_not_blank'
  ) then
    alter table public.meal_templates
      add constraint meal_templates_name_not_blank
      check (length(btrim(name)) > 0);
  end if;

  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.meal_templates'::regclass
      and conname = 'meal_templates_icon_not_blank'
  ) then
    alter table public.meal_templates
      add constraint meal_templates_icon_not_blank
      check (length(btrim(icon)) > 0);
  end if;

  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.meal_templates'::regclass
      and conname = 'meal_templates_totals_sane'
  ) then
    alter table public.meal_templates
      add constraint meal_templates_totals_sane
      check (
        total_calories >= 0 and total_calories <= 100000
        and total_carbs_g >= 0 and total_carbs_g <= 100000
        and total_protein_g >= 0 and total_protein_g <= 100000
        and total_fat_g >= 0 and total_fat_g <= 100000
      );
  end if;

  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.meal_template_items'::regclass and contype = 'p'
  ) then
    alter table public.meal_template_items
      add constraint meal_template_items_pkey primary key (id);
  end if;

  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.meal_template_items'::regclass
      and conname = 'meal_template_items_meal_template_id_fkey'
  ) then
    alter table public.meal_template_items
      add constraint meal_template_items_meal_template_id_fkey
      foreign key (meal_template_id) references public.meal_templates(id) on delete cascade;
  end if;

  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.meal_template_items'::regclass
      and conname = 'meal_template_items_food_id_fkey'
  ) then
    alter table public.meal_template_items
      add constraint meal_template_items_food_id_fkey
      foreign key (food_id) references public.foods(id) on delete set null;
  end if;

  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.meal_template_items'::regclass
      and conname = 'meal_template_items_recipe_id_fkey'
  ) then
    alter table public.meal_template_items
      add constraint meal_template_items_recipe_id_fkey
      foreign key (recipe_id) references public.recipes(id) on delete set null;
  end if;

  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.meal_template_items'::regclass
      and conname = 'meal_template_items_item_type_check'
  ) then
    alter table public.meal_template_items
      add constraint meal_template_items_item_type_check
      check (item_type in ('food', 'recipe', 'custom'));
  end if;

  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.meal_template_items'::regclass
      and conname = 'meal_template_items_snapshot_name_not_blank'
  ) then
    alter table public.meal_template_items
      add constraint meal_template_items_snapshot_name_not_blank
      check (length(btrim(snapshot_name)) > 0);
  end if;

  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.meal_template_items'::regclass
      and conname = 'meal_template_items_custom_name_not_blank'
  ) then
    alter table public.meal_template_items
      add constraint meal_template_items_custom_name_not_blank
      check (custom_name is null or length(btrim(custom_name)) > 0);
  end if;

  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.meal_template_items'::regclass
      and conname = 'meal_template_items_type_shape_check'
  ) then
    alter table public.meal_template_items
      add constraint meal_template_items_type_shape_check
      check (
        (
          item_type = 'food'
          and recipe_id is null
          and custom_name is null
        )
        or (
          item_type = 'recipe'
          and food_id is null
          and custom_name is null
        )
        or (
          item_type = 'custom'
          and food_id is null
          and recipe_id is null
          and custom_name is not null
        )
      );
  end if;

  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.meal_template_items'::regclass
      and conname = 'meal_template_items_quantity_sane'
  ) then
    alter table public.meal_template_items
      add constraint meal_template_items_quantity_sane
      check (quantity > 0 and quantity <= 10000);
  end if;

  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.meal_template_items'::regclass
      and conname = 'meal_template_items_serving_grams_sane'
  ) then
    alter table public.meal_template_items
      add constraint meal_template_items_serving_grams_sane
      check (serving_grams is null or (serving_grams > 0 and serving_grams <= 5000));
  end if;

  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.meal_template_items'::regclass
      and conname = 'meal_template_items_snapshot_nutrition_sane'
  ) then
    alter table public.meal_template_items
      add constraint meal_template_items_snapshot_nutrition_sane
      check (
        snapshot_calories >= 0 and snapshot_calories <= 100000
        and snapshot_carbs_g >= 0 and snapshot_carbs_g <= 100000
        and snapshot_protein_g >= 0 and snapshot_protein_g <= 100000
        and snapshot_fat_g >= 0 and snapshot_fat_g <= 100000
      );
  end if;
end
$$;

create index if not exists meal_templates_user_active_updated_idx
  on public.meal_templates(user_id, is_active, updated_at desc);

create index if not exists meal_template_items_template_sort_idx
  on public.meal_template_items(meal_template_id, sort_order, created_at);

create index if not exists meal_template_items_food_idx
  on public.meal_template_items(food_id)
  where food_id is not null;

create index if not exists meal_template_items_recipe_idx
  on public.meal_template_items(recipe_id)
  where recipe_id is not null;

drop trigger if exists meal_templates_set_updated_at on public.meal_templates;
create trigger meal_templates_set_updated_at
  before update on public.meal_templates
  for each row
  execute function public.set_updated_at();

drop trigger if exists meal_template_items_set_updated_at on public.meal_template_items;
create trigger meal_template_items_set_updated_at
  before update on public.meal_template_items
  for each row
  execute function public.set_updated_at();

alter table public.meal_templates enable row level security;
alter table public.meal_template_items enable row level security;

drop policy if exists "meal_templates_select_own" on public.meal_templates;
drop policy if exists "meal_templates_insert_own" on public.meal_templates;
drop policy if exists "meal_templates_update_own" on public.meal_templates;
drop policy if exists "meal_templates_delete_own" on public.meal_templates;

create policy "meal_templates_select_own" on public.meal_templates
  for select to authenticated
  using (user_id = auth.uid());

create policy "meal_templates_insert_own" on public.meal_templates
  for insert to authenticated
  with check (user_id = auth.uid());

create policy "meal_templates_update_own" on public.meal_templates
  for update to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

create policy "meal_templates_delete_own" on public.meal_templates
  for delete to authenticated
  using (user_id = auth.uid());

drop policy if exists "meal_template_items_select_own" on public.meal_template_items;
drop policy if exists "meal_template_items_insert_own" on public.meal_template_items;
drop policy if exists "meal_template_items_update_own" on public.meal_template_items;
drop policy if exists "meal_template_items_delete_own" on public.meal_template_items;

create policy "meal_template_items_select_own" on public.meal_template_items
  for select to authenticated
  using (
    exists (
      select 1
      from public.meal_templates
      where meal_templates.id = meal_template_items.meal_template_id
        and meal_templates.user_id = auth.uid()
    )
  );

create policy "meal_template_items_insert_own" on public.meal_template_items
  for insert to authenticated
  with check (
    exists (
      select 1
      from public.meal_templates
      where meal_templates.id = meal_template_items.meal_template_id
        and meal_templates.user_id = auth.uid()
    )
    and (
      recipe_id is null
      or exists (
        select 1
        from public.recipes
        where recipes.id = meal_template_items.recipe_id
          and recipes.user_id = auth.uid()
      )
    )
  );

create policy "meal_template_items_update_own" on public.meal_template_items
  for update to authenticated
  using (
    exists (
      select 1
      from public.meal_templates
      where meal_templates.id = meal_template_items.meal_template_id
        and meal_templates.user_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1
      from public.meal_templates
      where meal_templates.id = meal_template_items.meal_template_id
        and meal_templates.user_id = auth.uid()
    )
    and (
      recipe_id is null
      or exists (
        select 1
        from public.recipes
        where recipes.id = meal_template_items.recipe_id
          and recipes.user_id = auth.uid()
      )
    )
  );

create policy "meal_template_items_delete_own" on public.meal_template_items
  for delete to authenticated
  using (
    exists (
      select 1
      from public.meal_templates
      where meal_templates.id = meal_template_items.meal_template_id
        and meal_templates.user_id = auth.uid()
    )
  );

revoke all on public.meal_templates from anon, authenticated;
revoke all on public.meal_template_items from anon, authenticated;

grant select, insert, update, delete on public.meal_templates to authenticated;
grant select, insert, update, delete on public.meal_template_items to authenticated;
grant all on public.meal_templates to service_role;
grant all on public.meal_template_items to service_role;

notify pgrst, 'reload schema';

commit;
