-- Add username column to social_links for username-first handling
alter table public.social_links
  add column if not exists username text;
