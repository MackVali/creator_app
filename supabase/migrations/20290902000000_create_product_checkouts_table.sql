create table if not exists public.product_checkouts (
  id uuid primary key default uuid_generate_v4(),
  checkout_id uuid not null unique,
  seller_user_id uuid not null,
  seller_handle text not null,
  currency text not null,
  total_amount numeric not null,
  items jsonb not null,
  stripe_session_id text not null unique,
  status text not null default 'pending',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.product_checkouts
  add constraint product_checkouts_status_check
  check (status in ('pending', 'completed', 'canceled', 'failed'));
