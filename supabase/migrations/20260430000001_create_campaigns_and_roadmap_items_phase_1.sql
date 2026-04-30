alter table public.roadmaps
  add column if not exists monument_id uuid references public.monuments(id) on delete set null,
  add column if not exists updated_at timestamptz not null default now();

create index if not exists idx_roadmaps_user_monument
  on public.roadmaps(user_id, monument_id);

create unique index if not exists uniq_roadmaps_user_monument_not_null
  on public.roadmaps(user_id, monument_id)
  where monument_id is not null;

create table if not exists public.campaigns (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  roadmap_id uuid null references public.roadmaps(id) on delete set null,
  primary_monument_id uuid null references public.monuments(id) on delete set null,
  name text not null,
  description text null,
  emoji text null,
  scheduling_state text not null default 'ACTIVE',
  position integer null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint campaigns_scheduling_state_check check (
    scheduling_state in ('ACTIVE', 'PAUSED', 'BACKLOG', 'SOMEDAY', 'ARCHIVED', 'MANUAL_ONLY')
  )
);

create index if not exists idx_campaigns_user_id
  on public.campaigns(user_id);

create index if not exists idx_campaigns_roadmap_id
  on public.campaigns(roadmap_id);

create index if not exists idx_campaigns_primary_monument_id
  on public.campaigns(primary_monument_id);

create index if not exists idx_campaigns_user_scheduling_state
  on public.campaigns(user_id, scheduling_state);

alter table public.campaigns enable row level security;

drop policy if exists "campaigns_select_own" on public.campaigns;

create policy "campaigns_select_own"
  on public.campaigns
  for select
  using (auth.uid() = user_id);

drop policy if exists "campaigns_insert_own" on public.campaigns;

create policy "campaigns_insert_own"
  on public.campaigns
  for insert
  with check (auth.uid() = user_id);

drop policy if exists "campaigns_update_own" on public.campaigns;

create policy "campaigns_update_own"
  on public.campaigns
  for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "campaigns_delete_own" on public.campaigns;

create policy "campaigns_delete_own"
  on public.campaigns
  for delete
  using (auth.uid() = user_id);

create table if not exists public.roadmap_items (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  roadmap_id uuid not null references public.roadmaps(id) on delete cascade,
  item_type text not null,
  campaign_id uuid null references public.campaigns(id) on delete cascade,
  goal_id uuid null references public.goals(id) on delete cascade,
  position integer not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint roadmap_items_item_type_check check (item_type in ('CAMPAIGN', 'GOAL')),
  constraint roadmap_items_reference_check check (
    (item_type = 'CAMPAIGN' and campaign_id is not null and goal_id is null)
    or
    (item_type = 'GOAL' and goal_id is not null and campaign_id is null)
  ),
  constraint roadmap_items_roadmap_position_key unique (roadmap_id, position)
);

create unique index if not exists uniq_roadmap_items_roadmap_campaign_not_null
  on public.roadmap_items(roadmap_id, campaign_id)
  where campaign_id is not null;

create unique index if not exists uniq_roadmap_items_roadmap_goal_not_null
  on public.roadmap_items(roadmap_id, goal_id)
  where goal_id is not null;

create index if not exists idx_roadmap_items_user_id
  on public.roadmap_items(user_id);

create index if not exists idx_roadmap_items_roadmap_position
  on public.roadmap_items(roadmap_id, position);

create index if not exists idx_roadmap_items_campaign_id
  on public.roadmap_items(campaign_id);

create index if not exists idx_roadmap_items_goal_id
  on public.roadmap_items(goal_id);

alter table public.roadmap_items enable row level security;

drop policy if exists "roadmap_items_select_own" on public.roadmap_items;

create policy "roadmap_items_select_own"
  on public.roadmap_items
  for select
  using (auth.uid() = user_id);

drop policy if exists "roadmap_items_insert_own" on public.roadmap_items;

create policy "roadmap_items_insert_own"
  on public.roadmap_items
  for insert
  with check (auth.uid() = user_id);

drop policy if exists "roadmap_items_update_own" on public.roadmap_items;

create policy "roadmap_items_update_own"
  on public.roadmap_items
  for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "roadmap_items_delete_own" on public.roadmap_items;

create policy "roadmap_items_delete_own"
  on public.roadmap_items
  for delete
  using (auth.uid() = user_id);

create table if not exists public.campaign_goals (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  campaign_id uuid not null references public.campaigns(id) on delete cascade,
  goal_id uuid not null references public.goals(id) on delete cascade,
  position integer not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint campaign_goals_campaign_goal_key unique (campaign_id, goal_id),
  constraint campaign_goals_campaign_position_key unique (campaign_id, position)
);

create index if not exists idx_campaign_goals_user_id
  on public.campaign_goals(user_id);

create index if not exists idx_campaign_goals_campaign_position
  on public.campaign_goals(campaign_id, position);

create index if not exists idx_campaign_goals_goal_id
  on public.campaign_goals(goal_id);

alter table public.campaign_goals enable row level security;

drop policy if exists "campaign_goals_select_own" on public.campaign_goals;

create policy "campaign_goals_select_own"
  on public.campaign_goals
  for select
  using (auth.uid() = user_id);

drop policy if exists "campaign_goals_insert_own" on public.campaign_goals;

create policy "campaign_goals_insert_own"
  on public.campaign_goals
  for insert
  with check (auth.uid() = user_id);

drop policy if exists "campaign_goals_update_own" on public.campaign_goals;

create policy "campaign_goals_update_own"
  on public.campaign_goals
  for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "campaign_goals_delete_own" on public.campaign_goals;

create policy "campaign_goals_delete_own"
  on public.campaign_goals
  for delete
  using (auth.uid() = user_id);
