create table public.courses (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null references auth.users(id) on delete cascade,
  title text not null,
  description text,
  status text not null default 'DRAFT'
    check (status in ('DRAFT', 'PUBLISHED', 'ARCHIVED')),
  cover_image_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.course_curriculum_nodes (
  id uuid primary key default gen_random_uuid(),
  course_id uuid not null references public.courses(id) on delete cascade,
  parent_node_id uuid references public.course_curriculum_nodes(id) on delete cascade,
  node_type text not null
    check (node_type in ('GOAL', 'PROJECT', 'TASK', 'HABIT')),
  name text not null,
  position integer not null default 0,
  definition jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index course_curriculum_nodes_course_position_idx
  on public.course_curriculum_nodes(course_id, position);

create table public.course_enrollments (
  id uuid primary key default gen_random_uuid(),
  course_id uuid not null references public.courses(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  status text not null default 'ACTIVE'
    check (status in ('ACTIVE', 'COMPLETED', 'CANCELED')),
  enrolled_at timestamptz not null default now(),
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (course_id, user_id)
);

create table public.course_materializations (
  id uuid primary key default gen_random_uuid(),
  enrollment_id uuid not null references public.course_enrollments(id) on delete cascade,
  curriculum_node_id uuid not null references public.course_curriculum_nodes(id) on delete cascade,
  entity_type text not null
    check (entity_type in ('GOAL', 'PROJECT', 'TASK', 'HABIT')),
  entity_id uuid not null,
  created_at timestamptz not null default now(),
  unique (enrollment_id, curriculum_node_id)
);

alter table public.courses enable row level security;
alter table public.course_curriculum_nodes enable row level security;
alter table public.course_enrollments enable row level security;
alter table public.course_materializations enable row level security;

create policy "courses_owner_select"
on public.courses
for select
to authenticated
using (
  owner_user_id = auth.uid()
  or status = 'PUBLISHED'
);

create policy "courses_owner_insert"
on public.courses
for insert
to authenticated
with check (owner_user_id = auth.uid());

create policy "courses_owner_update"
on public.courses
for update
to authenticated
using (owner_user_id = auth.uid())
with check (owner_user_id = auth.uid());

create policy "courses_owner_delete"
on public.courses
for delete
to authenticated
using (owner_user_id = auth.uid());

create policy "course_curriculum_owner_select"
on public.course_curriculum_nodes
for select
to authenticated
using (
  exists (
    select 1
    from public.courses c
    where c.id = course_curriculum_nodes.course_id
      and c.owner_user_id = auth.uid()
  )
  or exists (
    select 1
    from public.course_enrollments ce
    where ce.course_id = course_curriculum_nodes.course_id
      and ce.user_id = auth.uid()
      and ce.status = 'ACTIVE'
  )
);

create policy "course_curriculum_owner_insert"
on public.course_curriculum_nodes
for insert
to authenticated
with check (
  exists (
    select 1
    from public.courses c
    where c.id = course_curriculum_nodes.course_id
      and c.owner_user_id = auth.uid()
  )
);

create policy "course_curriculum_owner_update"
on public.course_curriculum_nodes
for update
to authenticated
using (
  exists (
    select 1
    from public.courses c
    where c.id = course_curriculum_nodes.course_id
      and c.owner_user_id = auth.uid()
  )
)
with check (
  exists (
    select 1
    from public.courses c
    where c.id = course_curriculum_nodes.course_id
      and c.owner_user_id = auth.uid()
  )
);

create policy "course_curriculum_owner_delete"
on public.course_curriculum_nodes
for delete
to authenticated
using (
  exists (
    select 1
    from public.courses c
    where c.id = course_curriculum_nodes.course_id
      and c.owner_user_id = auth.uid()
  )
);

create policy "course_enrollment_select"
on public.course_enrollments
for select
to authenticated
using (
  user_id = auth.uid()
  or exists (
    select 1
    from public.courses c
    where c.id = course_enrollments.course_id
      and c.owner_user_id = auth.uid()
  )
);

create policy "course_materialization_select"
on public.course_materializations
for select
to authenticated
using (
  exists (
    select 1
    from public.course_enrollments ce
    where ce.id = course_materializations.enrollment_id
      and ce.user_id = auth.uid()
  )
  or exists (
    select 1
    from public.course_enrollments ce
    join public.courses c on c.id = ce.course_id
    where ce.id = course_materializations.enrollment_id
      and c.owner_user_id = auth.uid()
  )
);
