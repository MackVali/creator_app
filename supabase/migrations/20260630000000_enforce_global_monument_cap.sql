create or replace function public.enforce_global_monument_cap()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid;
  v_monument_count integer;
begin
  v_user_id := coalesce(new.user_id, auth.uid());

  if v_user_id is null then
    raise exception 'Not authenticated';
  end if;

  new.user_id := v_user_id;

  select count(*)
  into v_monument_count
  from public.monuments
  where user_id = v_user_id;

  if v_monument_count >= 8 then
    raise exception 'You''ve reached the Monument cap of 8.';
  end if;

  return new;
end;
$$;

drop trigger if exists enforce_global_monument_cap_before_insert on public.monuments;
create trigger enforce_global_monument_cap_before_insert
before insert on public.monuments
for each row
execute function public.enforce_global_monument_cap();

drop policy if exists "monuments_insert_own" on public.monuments;
create policy "monuments_insert_own"
on public.monuments
for insert
to authenticated
with check (user_id = auth.uid());

drop policy if exists "monuments_update_own" on public.monuments;
create policy "monuments_update_own"
on public.monuments
for update
to authenticated
using (user_id = auth.uid())
with check (user_id = auth.uid());

drop policy if exists "monuments_delete_own" on public.monuments;
create policy "monuments_delete_own"
on public.monuments
for delete
to authenticated
using (user_id = auth.uid());

grant execute on function public.enforce_global_monument_cap() to authenticated;
