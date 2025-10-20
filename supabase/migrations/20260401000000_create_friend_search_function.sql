-- Function to let authenticated users search for other public profiles while respecting RLS
create or replace function public.search_friend_profiles(
  p_query text,
  p_limit integer default 12
)
returns table (
  user_id uuid,
  username text,
  display_name text,
  avatar_url text,
  profile_url text,
  mutual_friend_count integer
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_limit integer := greatest(1, least(coalesce(p_limit, 12), 50));
  v_query text := coalesce(trim(p_query), '');
  v_uid uuid := auth.uid();
begin
  if v_query = '' then
    return;
  end if;

  return query
    with candidates as (
      select
        u.id as user_id,
        lower(coalesce((u.raw_user_meta_data ->> 'username')::text, u.email)) as normalized_username,
        coalesce((u.raw_user_meta_data ->> 'username')::text, split_part(u.email, '@', 1)) as username,
        coalesce(
          nullif((u.raw_user_meta_data ->> 'full_name')::text, ''),
          nullif((u.raw_user_meta_data ->> 'display_name')::text, ''),
          split_part(u.email, '@', 1)
        ) as display_name,
        nullif((u.raw_user_meta_data ->> 'avatar_url')::text, '') as avatar_url,
        nullif((u.raw_user_meta_data ->> 'profile_url')::text, '') as profile_url
      from auth.users as u
      where u.id is distinct from v_uid
        and (u.confirmed_at is not null or u.email_confirmed_at is not null)
    )
  select
    c.user_id,
    c.username,
    c.display_name,
    c.avatar_url,
    c.profile_url,
    coalesce(
      (
        select count(*)
        from public.friend_connections fc
        where fc.user_id = v_uid
          and fc.friend_user_id = c.user_id
      ),
      0
    ) as mutual_friend_count
  from candidates c
  where
    c.normalized_username ilike '%' || v_query || '%'
    or coalesce(c.display_name, '') ilike '%' || v_query || '%'
  order by
    position(lower(v_query) in lower(coalesce(c.display_name, c.username))),
    lower(coalesce(c.display_name, c.username))
  limit v_limit;
end;
$$;

grant execute on function public.search_friend_profiles(text, integer) to authenticated;
