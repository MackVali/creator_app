-- skills table
create table if not exists public.skills (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  icon text not null, -- store emoji or short code
  monument_id uuid null, -- optional, future FK
  level int not null default 1,
  created_at timestamptz not null default now()
);

-- monuments stub (only if not exists; used for optional relation dropdown)
create table if not exists public.monuments (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  title text not null,
  created_at timestamptz not null default now()
);

-- RLS
alter table public.skills enable row level security;
create policy "select my skills" on public.skills for select using (auth.uid() = user_id);
create policy "insert my skills" on public.skills for insert with check (auth.uid() = user_id);

alter table public.monuments enable row level security;
create policy "select my monuments" on public.monuments for select using (auth.uid() = user_id);
