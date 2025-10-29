-- Allow universal posts to be stored alongside product and service listings
alter table public.source_listings
  drop constraint if exists source_listings_type_check;

alter table public.source_listings
  add constraint source_listings_type_check
  check (type in ('product', 'service', 'post'));
