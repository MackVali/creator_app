alter table public.product_checkouts
  add column if not exists buyer_user_id uuid references auth.users (id) on delete set null;

create index if not exists product_checkouts_buyer_user_id_idx
  on public.product_checkouts (buyer_user_id);
