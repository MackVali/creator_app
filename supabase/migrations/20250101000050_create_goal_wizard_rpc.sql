create or replace function public.lookup_priority_id(label text)
returns bigint language plpgsql security definer set search_path = public as $$
declare
  normalized text := upper(coalesce(nullif(label,''),'NO'));
  resolved bigint;
begin
  select id into resolved
  from public.priority
  where upper(name) = normalized
  limit 1;
  if resolved is null then
    select id into resolved
    from public.priority
    order by id asc
    limit 1;
  end if;
  return resolved;
end;
$$;

create or replace function public.lookup_energy_id(label text)
returns bigint language plpgsql security definer set search_path = public as $$
declare
  normalized text := upper(coalesce(nullif(label,''),'NO'));
  resolved bigint;
begin
  select id into resolved
  from public.energy
  where upper(name) = normalized
  limit 1;
  if resolved is null then
    select id into resolved
    from public.energy
    order by id asc
    limit 1;
  end if;
  return resolved;
end;
$$;

create or replace function public.create_goal_with_projects_and_tasks(
  goal_input jsonb,
  project_inputs jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  auth_id uuid := auth.uid();
  payload jsonb := coalesce(goal_input, '{}'::jsonb);
  new_goal public.goals%rowtype;
  new_project public.projects%rowtype;
  new_task public.tasks%rowtype;
  project_elem jsonb;
  task_elem jsonb;
  inserted_projects jsonb := '[]'::jsonb;
  inserted_tasks jsonb := '[]'::jsonb;
  goal_user_id uuid := coalesce((nullif(payload->>'user_id',''))::uuid, auth_id);
begin
  if auth_id is null then
    raise exception 'Authentication required';
  end if;

  if goal_user_id is null then
    raise exception 'Goal must be associated with a user';
  end if;

  if goal_user_id <> auth_id then
    raise exception 'Cannot create records for another user';
  end if;

  -- goals table has no due_date; omit it entirely
  insert into public.goals (user_id, name, priority, energy, monument_id, why)
  values (
    goal_user_id,
    coalesce(nullif(btrim(payload->>'name'), ''), 'Untitled Goal'),
    (upper(coalesce(nullif(payload->>'priority',''),'NO')))::priority_enum,
    (upper(coalesce(nullif(payload->>'energy',''),'NO')))::energy_enum,
    coalesce(
      nullif(payload->>'monument_id', ''),
      nullif(payload->>'monumentId', '')
    )::uuid,
    nullif(payload->>'why', '')
  )
  returning * into new_goal;

  if new_goal.id is null then
    raise exception 'Goal insert failed';
  end if;

  for project_elem in
    select value from jsonb_array_elements(coalesce(project_inputs, '[]'::jsonb))
  loop
    if coalesce(btrim(project_elem->>'name'), '') = '' then
      continue;
    end if;

    insert into public.projects (user_id, goal_id, name, stage, priority, energy, why, duration_min, due_date)
    values (
      goal_user_id,
      new_goal.id,
      project_elem->>'name',
      coalesce(project_elem->>'stage', 'RESEARCH')::project_stage_enum,
      (upper(coalesce(nullif(project_elem->>'priority',''),'NO')))::priority_enum,
      (upper(coalesce(nullif(project_elem->>'energy',''),'NO')))::energy_enum,
      nullif(project_elem->>'why', ''),
      case
        when trim(coalesce(project_elem->>'duration_min', '')) ~ '^[0-9]+$'
          then greatest(1, (project_elem->>'duration_min')::integer)
        else null
      end,
      nullif(project_elem->>'due_date', '')::timestamptz
    )
    returning * into new_project;

    inserted_projects := inserted_projects || jsonb_build_array(
      jsonb_build_object(
        'id', new_project.id,
        'name', new_project.name,
        'goal_id', new_project.goal_id,
        'stage', new_project.stage,
        'priority', new_project.priority,
        'energy', new_project.energy,
        'why', new_project.why,
        'duration_min', new_project.duration_min,
        'due_date', new_project.due_date,
        'skill_id', nullif(project_elem->>'skill_id', '')::uuid
      )
    );

    if nullif(project_elem->>'skill_id', '') is not null then
      begin
        insert into public.project_skills (project_id, skill_id)
        values (new_project.id, (project_elem->>'skill_id')::uuid);
      exception
        when others then
          raise warning 'Failed to link skill % to project %: %', project_elem->>'skill_id', new_project.id, sqlerrm;
      end;
    end if;

    for task_elem in
      select value from jsonb_array_elements(coalesce(project_elem->'tasks', '[]'::jsonb))
    loop
      if coalesce(btrim(task_elem->>'name'), '') = '' then
        continue;
      end if;

      insert into public.tasks (user_id, goal_id, project_id, name, stage, priority, energy, notes, skill_id, due_date)
      values (
        goal_user_id,
        new_goal.id,
        new_project.id,
        task_elem->>'name',
        coalesce(task_elem->>'stage', 'PREPARE')::task_stage_enum,
        (upper(coalesce(nullif(task_elem->>'priority',''),'NO')))::priority_enum,
        (upper(coalesce(nullif(task_elem->>'energy',''),'NO')))::energy_enum,
        nullif(task_elem->>'notes', ''),
        nullif(task_elem->>'skill_id', '')::uuid,
        nullif(task_elem->>'due_date', '')::timestamptz
      )
      returning * into new_task;

      inserted_tasks := inserted_tasks || jsonb_build_array(
        jsonb_build_object(
          'id', new_task.id,
          'name', new_task.name,
          'project_id', new_task.project_id,
          'stage', new_task.stage,
          'priority', new_task.priority,
          'energy', new_task.energy,
          'notes', new_task.notes,
          'skill_id', new_task.skill_id,
          'due_date', new_task.due_date
        )
      );
    end loop;
  end loop;

  return jsonb_build_object(
    'goal', jsonb_build_object(
      'id', new_goal.id,
      'name', new_goal.name,
      'priority', new_goal.priority,
      'energy', new_goal.energy,
      'why', new_goal.why
    ),
    'projects', inserted_projects,
    'tasks', inserted_tasks
  );
end;
$$;

grant execute on function public.create_goal_with_projects_and_tasks(jsonb, jsonb) to authenticated;
