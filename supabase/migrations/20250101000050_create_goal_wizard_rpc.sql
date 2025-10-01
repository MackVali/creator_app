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
  goal_user_id uuid := coalesce((payload->>'user_id')::uuid, auth_id);
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

  insert into public.goals (user_id, name, priority, energy, monument_id, why)
  values (
    goal_user_id,
    coalesce(nullif(btrim(payload->>'name'), ''), 'Untitled Goal'),
    coalesce(nullif(payload->>'priority', ''), 'NO'),
    coalesce(nullif(payload->>'energy', ''), 'NO'),
    (payload->>'monument_id')::uuid,
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

    insert into public.projects (user_id, goal_id, name, stage, priority, energy, why, duration_min)
    values (
      goal_user_id,
      new_goal.id,
      project_elem->>'name',
      coalesce(project_elem->>'stage', 'RESEARCH'),
      coalesce(project_elem->>'priority', 'NO'),
      coalesce(project_elem->>'energy', 'NO'),
      nullif(project_elem->>'why', ''),
      case
        when trim(coalesce(project_elem->>'duration_min', '')) ~ '^[0-9]+$'
          then greatest(1, (project_elem->>'duration_min')::integer)
        else null
      end
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
        'duration_min', new_project.duration_min
      )
    );

    for task_elem in
      select value from jsonb_array_elements(coalesce(project_elem->'tasks', '[]'::jsonb))
    loop
      if coalesce(btrim(task_elem->>'name'), '') = '' then
        continue;
      end if;

      insert into public.tasks (
        user_id,
        goal_id,
        project_id,
        name,
        stage,
        priority,
        energy,
        description
      )
      values (
        goal_user_id,
        new_goal.id,
        new_project.id,
        task_elem->>'name',
        coalesce(task_elem->>'stage', 'PREPARE'),
        coalesce(task_elem->>'priority', 'NO'),
        coalesce(task_elem->>'energy', 'NO'),
        nullif(task_elem->>'notes', '')
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
          'notes', new_task.description
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
