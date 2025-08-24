-- Storage policies for avatars bucket
-- Ensure avatars bucket exists
insert into storage.buckets (id, name, public) 
values ('avatars', 'avatars', true) 
on conflict (id) do nothing;

-- Public read
create policy if not exists "avatars read public" on storage.objects
  for select using (bucket_id = 'avatars');

-- Authenticated write
create policy if not exists "avatars insert auth" on storage.objects
  for insert with check (bucket_id = 'avatars' and auth.role() = 'authenticated');

create policy if not exists "avatars update auth" on storage.objects
  for update using (bucket_id = 'avatars' and auth.role() = 'authenticated');
