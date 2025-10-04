-- Allow authenticated users to manage their own habits
create policy if not exists "habits_insert_own" on public.habits
  for insert to authenticated
  with check (auth.uid() = user_id);

create policy if not exists "habits_update_own" on public.habits
  for update to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy if not exists "habits_delete_own" on public.habits
  for delete to authenticated
  using (auth.uid() = user_id);
