alter table public.product_checkouts
  add column if not exists fulfillment_status text not null default 'unfulfilled';

alter table public.product_checkouts
  drop constraint if exists product_checkouts_fulfillment_status_check;

alter table public.product_checkouts
  add constraint product_checkouts_fulfillment_status_check
  check (fulfillment_status in ('unfulfilled', 'packed', 'shipped'));
