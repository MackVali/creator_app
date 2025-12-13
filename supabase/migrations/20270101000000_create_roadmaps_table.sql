-- Create roadmaps table
create table if not exists public.roadmaps (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  emoji text,
  user_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamp with time zone not null default now()
);

-- Enable RLS
alter table public.roadmaps enable row level security;

-- Create RLS policies (users can only see/modify their own roadmaps)
create policy "Users can view their own roadmaps"
  on public.roadmaps
  for select
  using (auth.uid() = user_id);

create policy "Users can insert their own roadmaps"
  on public.roadmaps
  for insert
  with check (auth.uid() = user_id);

create policy "Users can update their own roadmaps"
  on public.roadmaps
  for update
  using (auth.uid() = user_id);

create policy "Users can delete their own roadmaps"
  on public.roadmaps
  for delete
  using (auth.uid() = user_id);

-- Add roadmap_id column to goals table
alter table public.goals
  add column if not exists roadmap_id uuid references public.roadmaps(id) on delete set null;

-- Create index for better query performance
create index if not exists idx_goals_roadmap_id on public.goals(roadmap_id);
create index if not exists idx_roadmaps_user_id on public.roadmaps(user_id);

