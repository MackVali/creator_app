-- Final reconciliation from the legacy MANUAL My List store into canonical todos.
-- This is intentionally limited to MY_LIST todos and never revives tombstoned rows.

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
  item.id,
  item.user_id,
  'MY_LIST',
  null,
  null,
  item.list_id,
  coalesce(item.text, ''),
  coalesce(item.done, false),
  item.completed_at,
  coalesce(nullif(item.priority_id, ''), 'MEDIUM'),
  item.day_bucket_id,
  item.skill_id,
  'MEDIUM',
  coalesce(item.sort_order, 0),
  item.insert_after_row_key,
  jsonb_strip_nulls(
    jsonb_build_object(
      'legacySource', 'my_list_items',
      'skillName', item.skill_name,
      'skillIcon', item.skill_icon
    )
  ),
  item.created_at,
  item.updated_at
from public.my_list_items as item
where item.item_kind = 'MANUAL'
on conflict (id) do update
set
  list_id = excluded.list_id,
  title = excluded.title,
  completed = excluded.completed,
  completed_at = excluded.completed_at,
  priority_id = excluded.priority_id,
  day_bucket_id = excluded.day_bucket_id,
  skill_id = excluded.skill_id,
  sort_order = excluded.sort_order,
  insert_after_row_key = excluded.insert_after_row_key,
  metadata = excluded.metadata,
  updated_at = excluded.updated_at
where public.todos.user_id = excluded.user_id
  and public.todos.owner_type = 'MY_LIST'
  and public.todos.deleted_at is null;

update public.todos as todo
set
  deleted_at = now(),
  updated_at = now()
where todo.owner_type = 'MY_LIST'
  and todo.deleted_at is null
  and todo.metadata->>'legacySource' = 'my_list_items'
  and not exists (
    select 1
    from public.my_list_items as item
    where item.id = todo.id
      and item.user_id = todo.user_id
      and item.item_kind = 'MANUAL'
  );
