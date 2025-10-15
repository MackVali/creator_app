create table if not exists public.text_overrides (
    id uuid primary key default gen_random_uuid(),
    original_text text not null,
    override_text text not null,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    created_by uuid references auth.users(id),
    constraint text_overrides_original_text_unique unique (original_text)
);

alter table public.text_overrides enable row level security;

create policy "text_overrides_read_authenticated"
  on public.text_overrides
  for select
  to authenticated
  using (true);

create policy "text_overrides_insert_authenticated"
  on public.text_overrides
  for insert
  to authenticated
  with check (true);

create policy "text_overrides_update_authenticated"
  on public.text_overrides
  for update
  to authenticated
  using (true)
  with check (true);

create policy "text_overrides_delete_authenticated"
  on public.text_overrides
  for delete
  to authenticated
  using (true);
