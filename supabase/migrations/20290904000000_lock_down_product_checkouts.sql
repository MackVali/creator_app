-- Product checkout records contain buyer/seller/order metadata and should never
-- be directly accessible through the public Data API. Legitimate application
-- access goes through server routes using the service-role admin client.

alter table public.product_checkouts enable row level security;

revoke all privileges on table public.product_checkouts from anon;
revoke all privileges on table public.product_checkouts from authenticated;
