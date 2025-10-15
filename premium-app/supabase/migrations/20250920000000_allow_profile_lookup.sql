set check_function_bodies = off;

drop function if exists public.get_profile_user_id(text);

create function public.get_profile_user_id(p_username text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid;
begin
  select p.user_id
    into v_user_id
  from public.profiles as p
  where p.username ilike p_username
  limit 1;

  return v_user_id;
end;
$$;

grant execute on function public.get_profile_user_id(text) to authenticated;
