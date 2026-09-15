create table public.todos (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  owner_type text not null,
  owner_id text null,
  note_id uuid null references public.notes(id) on delete cascade,
  list_id uuid null,
  title text not null default '',
  completed boolean not null default false,
  completed_at timestamptz null,
  priority_id text not null default 'MEDIUM',
  day_bucket_id text null,
  skill_id uuid null references public.skills(id) on delete set null,
  energy_id text not null default 'MEDIUM',
  sort_order integer not null default 0,
  insert_after_row_key text null,
  deleted_at timestamptz null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint todos_owner_type_check
    check (owner_type in ('MY_LIST', 'GOAL', 'AREA', 'MONUMENT', 'SKILL')),
  constraint todos_day_bucket_id_check
    check (day_bucket_id is null or day_bucket_id in ('morning', 'afternoon', 'evening')),
  constraint todos_metadata_object_check
    check (jsonb_typeof(metadata) = 'object'),
  constraint todos_owned_list_fkey
    foreign key (user_id, list_id)
    references public.my_list_lists(user_id, id)
    on delete set null (list_id)
);

create index todos_user_owner_active_idx
  on public.todos (user_id, deleted_at, owner_type, owner_id);

create index todos_user_list_active_order_idx
  on public.todos (user_id, list_id, deleted_at, sort_order)
  where list_id is not null;

create index todos_note_active_order_idx
  on public.todos (note_id, deleted_at, sort_order)
  where note_id is not null;

alter table public.todos enable row level security;

create policy "todos_select_own"
  on public.todos
  for select
  to authenticated
  using ((select auth.uid()) = user_id);

create policy "todos_insert_own"
  on public.todos
  for insert
  to authenticated
  with check ((select auth.uid()) = user_id);

create policy "todos_update_own"
  on public.todos
  for update
  to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

create policy "todos_delete_own"
  on public.todos
  for delete
  to authenticated
  using ((select auth.uid()) = user_id);

grant select, insert, update, delete on public.todos to authenticated;

insert into public.todos (
  id,
  user_id,
  owner_type,
  owner_id,
  note_id,
  list_id,
  title,
  completed,
  completed_at,
  priority_id,
  day_bucket_id,
  skill_id,
  energy_id,
  sort_order,
  insert_after_row_key,
  metadata,
  created_at,
  updated_at
)
select
  my_list_items.id,
  my_list_items.user_id,
  'MY_LIST',
  null,
  null,
  my_list_items.list_id,
  coalesce(my_list_items.text, ''),
  coalesce(my_list_items.done, false),
  my_list_items.completed_at,
  coalesce(nullif(my_list_items.priority_id, ''), 'MEDIUM'),
  my_list_items.day_bucket_id,
  my_list_items.skill_id,
  'MEDIUM',
  coalesce(my_list_items.sort_order, 0),
  my_list_items.insert_after_row_key,
  jsonb_strip_nulls(
    jsonb_build_object(
      'legacySource', 'my_list_items',
      'skillName', my_list_items.skill_name,
      'skillIcon', my_list_items.skill_icon
    )
  ),
  my_list_items.created_at,
  my_list_items.updated_at
from public.my_list_items
where my_list_items.item_kind = 'MANUAL'
on conflict (id) do update
set
  user_id = excluded.user_id,
  owner_type = excluded.owner_type,
  owner_id = excluded.owner_id,
  note_id = excluded.note_id,
  list_id = excluded.list_id,
  title = excluded.title,
  completed = excluded.completed,
  completed_at = excluded.completed_at,
  priority_id = excluded.priority_id,
  day_bucket_id = excluded.day_bucket_id,
  skill_id = excluded.skill_id,
  energy_id = excluded.energy_id,
  sort_order = excluded.sort_order,
  insert_after_row_key = excluded.insert_after_row_key,
  metadata = excluded.metadata,
  created_at = excluded.created_at,
  updated_at = excluded.updated_at
where public.todos.deleted_at is null;

with note_todos as (
  select
    notes.user_id,
    case
      when notes.area_id is not null then 'AREA'
      when notes.monument_id is not null then 'MONUMENT'
      else 'SKILL'
    end as owner_type,
    case
      when notes.area_id is not null then notes.area_id
      when notes.monument_id is not null then notes.monument_id::text
      else notes.skill_id::text
    end as owner_id,
    notes.id as note_id,
    todo_item.todo,
    todo_item.sort_order,
    notes.created_at,
    coalesce(notes.updated_at, notes.created_at) as updated_at
  from public.notes
  cross join lateral (
    select
      array_item.value as todo,
      (array_item.ordinality - 1)::integer as sort_order
    from jsonb_array_elements(
      case
        when jsonb_typeof(notes.metadata->'noteTodos') = 'array'
          then notes.metadata->'noteTodos'
        else '[]'::jsonb
      end
    )
      with ordinality as array_item(value, ordinality)
    where jsonb_typeof(notes.metadata->'noteTodos') = 'array'

    union all

    select
      object_item.value as todo,
      (row_number() over (order by object_item.key) - 1)::integer as sort_order
    from jsonb_each(
      case
        when jsonb_typeof(notes.metadata->'noteTodos') = 'object'
          then notes.metadata->'noteTodos'
        else '{}'::jsonb
      end
    )
      as object_item(key, value)
    where jsonb_typeof(notes.metadata->'noteTodos') = 'object'
  ) as todo_item
  where notes.metadata ? 'noteTodos'
    and (
      notes.area_id is not null
      or notes.monument_id is not null
      or notes.skill_id is not null
    )
)
insert into public.todos (
  id,
  user_id,
  owner_type,
  owner_id,
  note_id,
  list_id,
  title,
  completed,
  completed_at,
  priority_id,
  day_bucket_id,
  skill_id,
  energy_id,
  sort_order,
  insert_after_row_key,
  metadata,
  created_at,
  updated_at
)
select
  (todo->>'id')::uuid,
  user_id,
  owner_type,
  owner_id,
  note_id,
  null,
  coalesce(todo->>'title', ''),
  coalesce((todo->>'completed')::boolean, false),
  null,
  coalesce(nullif(todo->>'priority', ''), 'MEDIUM'),
  null,
  case
    when todo->>'skillId' ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
      then (todo->>'skillId')::uuid
    else null
  end,
  coalesce(nullif(todo->>'energy', ''), 'MEDIUM'),
  sort_order,
  null,
  jsonb_build_object('legacySource', 'notes.metadata.noteTodos'),
  created_at,
  updated_at
from note_todos
where todo ? 'id'
  and todo->>'id' ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
on conflict (id) do update
set
  user_id = excluded.user_id,
  owner_type = excluded.owner_type,
  owner_id = excluded.owner_id,
  note_id = excluded.note_id,
  list_id = excluded.list_id,
  title = excluded.title,
  completed = excluded.completed,
  completed_at = excluded.completed_at,
  priority_id = excluded.priority_id,
  day_bucket_id = excluded.day_bucket_id,
  skill_id = excluded.skill_id,
  energy_id = excluded.energy_id,
  sort_order = excluded.sort_order,
  insert_after_row_key = excluded.insert_after_row_key,
  metadata = excluded.metadata,
  created_at = excluded.created_at,
  updated_at = excluded.updated_at
where public.todos.deleted_at is null;

with goal_todos as (
  select
    goal_workspaces.user_id,
    goal_workspaces.goal_id,
    todo_item.todo,
    todo_item.sort_order,
    goal_workspaces.created_at,
    goal_workspaces.updated_at
  from public.goal_workspaces
  cross join lateral (
    select
      array_item.value as todo,
      (array_item.ordinality - 1)::integer as sort_order
    from jsonb_array_elements(
      case
        when jsonb_typeof(goal_workspaces.metadata->'noteTodos') = 'array'
          then goal_workspaces.metadata->'noteTodos'
        else '[]'::jsonb
      end
    )
      with ordinality as array_item(value, ordinality)
    where jsonb_typeof(goal_workspaces.metadata->'noteTodos') = 'array'

    union all

    select
      object_item.value as todo,
      (row_number() over (order by object_item.key) - 1)::integer as sort_order
    from jsonb_each(
      case
        when jsonb_typeof(goal_workspaces.metadata->'noteTodos') = 'object'
          then goal_workspaces.metadata->'noteTodos'
        else '{}'::jsonb
      end
    )
      as object_item(key, value)
    where jsonb_typeof(goal_workspaces.metadata->'noteTodos') = 'object'
  ) as todo_item
  where goal_workspaces.metadata ? 'noteTodos'
)
insert into public.todos (
  id,
  user_id,
  owner_type,
  owner_id,
  note_id,
  list_id,
  title,
  completed,
  completed_at,
  priority_id,
  day_bucket_id,
  skill_id,
  energy_id,
  sort_order,
  insert_after_row_key,
  metadata,
  created_at,
  updated_at
)
select
  (todo->>'id')::uuid,
  user_id,
  'GOAL',
  goal_id::text,
  null,
  null,
  coalesce(todo->>'title', ''),
  coalesce((todo->>'completed')::boolean, false),
  null,
  coalesce(nullif(todo->>'priority', ''), 'MEDIUM'),
  null,
  case
    when todo->>'skillId' ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
      then (todo->>'skillId')::uuid
    else null
  end,
  coalesce(nullif(todo->>'energy', ''), 'MEDIUM'),
  sort_order,
  null,
  jsonb_build_object('legacySource', 'goal_workspaces.metadata.noteTodos'),
  created_at,
  updated_at
from goal_todos
where todo ? 'id'
  and todo->>'id' ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
on conflict (id) do update
set
  user_id = excluded.user_id,
  owner_type = excluded.owner_type,
  owner_id = excluded.owner_id,
  note_id = excluded.note_id,
  list_id = excluded.list_id,
  title = excluded.title,
  completed = excluded.completed,
  completed_at = excluded.completed_at,
  priority_id = excluded.priority_id,
  day_bucket_id = excluded.day_bucket_id,
  skill_id = excluded.skill_id,
  energy_id = excluded.energy_id,
  sort_order = excluded.sort_order,
  insert_after_row_key = excluded.insert_after_row_key,
  metadata = excluded.metadata,
  created_at = excluded.created_at,
  updated_at = excluded.updated_at
where public.todos.deleted_at is null;
